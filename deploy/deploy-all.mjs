#!/usr/bin/env node

// ── Agent Hub Deploy-All ──────────────────────────────
// Usage: ./deploy-all.mjs companies/metroprints.json [--skip-api] [--dry-run]
//
// Reads a company config JSON and deploys all agents:
//   1. Validates config
//   2. Creates Slack apps via API (if config_token provided)
//   3. Generates listener.mjs with full system prompt, cron, alert routing
//   4. Generates launchd plist
//   5. Loads plist into launchd
//   6. Appends MCP config to opencode.jsonc
//   7. Generates OpenCode agent definition .md
//
// Flags:
//   --skip-api   Skip Slack API calls (use existing app tokens)
//   --dry-run    Print what would be done without doing it

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const USER = process.env.USER || "shahsaint-cyr";
const HOME = homedir();
const PROJECTS = join(HOME, "Projects");
const LAUNCH_AGENTS = join(HOME, "Library", "LaunchAgents");
const LOGS = join(HOME, "Library", "Logs");
const OPENCODE_CONFIG = join(HOME, ".config", "opencode", "opencode.jsonc");

// ── CLI ──────────────────────────────────────────────

const args = process.argv.slice(2);
const configPath = args.find(a => a.endsWith(".json"));
const skipApi = args.includes("--skip-api");
const dryRun = args.includes("--dry-run");

if (!configPath) {
  console.error("Usage: ./deploy-all.mjs companies/COMPANY.json [--skip-api] [--dry-run]");
  process.exit(1);
}

const raw = readFileSync(configPath, "utf-8");
const config = JSON.parse(raw);

// ── Validate ─────────────────────────────────────────

function validate(cfg) {
  const errors = [];
  if (!cfg.company?.slug) errors.push("company.slug is required");
  if (!cfg.company?.name) errors.push("company.name is required");
  if (!cfg.agents?.length) errors.push("agents array is required");
  for (const [i, agent] of (cfg.agents || []).entries()) {
    if (!agent.name) errors.push(`agents[${i}].name is required`);
    if (!agent.display_name) errors.push(`agents[${i}].display_name is required`);
    if (!agent.role) errors.push(`agents[${i}].role is required`);
  }
  return errors;
}

const errors = validate(config);
if (errors.length) {
  console.error("Config validation failed:");
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────

const C = config.company;
const SL = config.slack || {};
const INF = config.infrastructure || {};
const CH = config.channels || {};

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }

async function slackApi(method, body) {
  if (!SL.config_token || SL.config_token === "xoxe.xoxp-...") {
    console.log(`  ⚠ No valid config_token — skipping Slack API call: ${method}`);
    return null;
  }
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SL.config_token}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) console.error(`  ✗ ${method} failed: ${json.error}`);
    return json;
  } catch (e) {
    console.error(`  ✗ ${method} error: ${e.message}`);
    return null;
  }
}

function template(str, vars) {
  let result = str;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replaceAll(`{{${k}}}`, String(v));
  }
  return result;
}

// ── Manifest Template ────────────────────────────────

function renderManifest(agent) {
  const yaml = readFileSync(join(import.meta.dirname, "..", "templates", "slack-app-manifest.yaml"), "utf-8");
  const scopes = (agent.slack_scopes || [
    "channels:read", "channels:history", "groups:read", "groups:history",
    "users:read", "chat:write", "app_mentions:read",
    "im:history", "im:read", "im:write",
    "reactions:read", "reactions:write",
    "usergroups:read", "files:read", "commands"
  ]);
  
  const scopeYaml = scopes.map(s => `      - ${s}`).join("\n");
  
  // Build slash commands if any
  let slashYaml = "  slash_commands: []";
  const cmds = agent.slash_commands || [];
  if (cmds.length) {
    const entries = cmds.map(c => `      - command: "${c.command}"\n        description: "${c.description}"\n        usage_hint: "[details]"`).join("\n");
    slashYaml = `  slash_commands:\n${entries}`;
  }
  
  return template(yaml, {
    AGENT_DISPLAY_NAME: agent.display_name || agent.name,
    AGENT_DESCRIPTION: agent.description || `${agent.role} for ${C.name}`,
    HEX_COLOR: agent.color || "3B82F6",
  }).replace(/slack_scopes_placeholder/, scopeYaml)
     .replace(/slash_commands_placeholder/, slashYaml);
}

// ── Listener Template ────────────────────────────────

function renderListener(agent, slackTokens) {
  const tpl = readFileSync(join(import.meta.dirname, "..", "templates", "listener.mjs"), "utf-8");
  
  const xapp = slackTokens?.app_token || process.env[`SLACK_XAPP_${agent.name.toUpperCase()}`] || "";
  const xoxb = slackTokens?.bot_token || process.env[`SLACK_XOXB_${agent.name.toUpperCase()}`] || "";
  const botUserId = slackTokens?.bot_user_id || process.env[`SLACK_BOT_USER_${agent.name.toUpperCase()}`] || "";
  
  // Build system prompt sections
  const sp = agent.system_prompt || {};
  
  const resp = (sp.responsibilities || []).map(r => `- ${r}`).join("\n");
  const bound = (sp.boundaries || []).map(b => `- ${b}`).join("\n");
  const coord = (sp.coordination || []).map(c => `- ${c}`).join("\n");
  
  // Build cron config as JSON for the listener to parse
  const cronJson = JSON.stringify(agent.cron || []);
  
  // Build alert routing as JSON
  const alertsJson = JSON.stringify(agent.alert_routing || {});
  
  // Build channels map
  const channelsJson = JSON.stringify({
    critical: CH.critical ? `#${CH.critical}` : "#critical",
    alerts: CH.alerts ? `#${CH.alerts}` : "#alerts",
    general: CH.general ? `#${CH.general}` : "#general",
  });
  
  // Build slash commands
  const slashCmdsJson = JSON.stringify(agent.slash_commands || []);
  
  // Knowledge files
  const knowledgeFiles = (INF.knowledge_files || []).join(",");
  
  // Notion databases
  const notionDbs = JSON.stringify(INF.notion_databases || {});
  
  let result = tpl;
  result = result.replaceAll("{{SLACK_XAPP_TOKEN}}", xapp);
  result = result.replaceAll("{{SLACK_XOXB_TOKEN}}", xoxb);
  result = result.replaceAll("{{SLACK_BOT_USER_ID}}", botUserId);
  result = result.replaceAll("{{DEEPSEEK_API_KEY}}", INF.deepseek_api_key || "");
  result = result.replaceAll("{{AGENT_NAME}}", agent.name);
  result = result.replaceAll("{{AGENT_SLUG}}", slug(agent.name));
  result = result.replaceAll("{{AGENT_DISPLAY_NAME}}", agent.display_name || agent.name);
  result = result.replaceAll("{{AGENT_ROLE}}", agent.role);
  result = result.replaceAll("{{AGENT_DESCRIPTION}}", agent.description || "");
  result = result.replaceAll("{{COMPANY_NAME}}", C.name);
  result = result.replaceAll("{{COMPANY_SLUG}}", C.slug);
  result = result.replaceAll("{{COMPANY_DESCRIPTION}}", C.description || "");
  result = result.replaceAll("{{COMPANY_WEBSITE}}", C.website || "");
  result = result.replaceAll("{{DOMAIN_SCOPE}}", sp.identity || `${agent.role} for ${C.name}`);
  result = result.replaceAll("{{AGENT_RESPONSIBILITIES}}", resp);
  result = result.replaceAll("{{AGENT_BOUNDARIES}}", bound);
  result = result.replaceAll("{{AGENT_COORDINATION}}", coord);
  result = result.replaceAll("{{AGENT_PERSONALITY}}", sp.personality || "Be direct, concise, helpful.");
  result = result.replaceAll("{{AGENT_FALLBACK}}", `I'm ${agent.display_name || agent.name}, ${agent.role} for ${C.name}. How can I help?`);
  result = result.replaceAll("{{CRON_CONFIG}}", cronJson);
  result = result.replaceAll("{{ALERT_ROUTING}}", alertsJson);
  result = result.replaceAll("{{CHANNELS}}", channelsJson);
  result = result.replaceAll("{{SLASH_COMMANDS}}", slashCmdsJson);
  result = result.replaceAll("{{OBSIDIAN_VAULT}}", INF.obsidian_vault || "");
  result = result.replaceAll("{{KNOWLEDGE_FILES}}", knowledgeFiles);
  result = result.replaceAll("{{NOTION_API_KEY}}", INF.notion_api_key || "");
  result = result.replaceAll("{{NOTION_DATABASES}}", notionDbs);
  
  // Transpile ESM imports to actual file paths
  const agentHubDir = join(import.meta.dirname, "..");
  result = result.replace("{{AGENT_HUB_UTILS}}", join(agentHubDir, "templates", "listener-utils.mjs"));
  
  return result;
}

// ── Plist Template ───────────────────────────────────

function renderPlist(agent, slackTokens) {
  const tpl = readFileSync(join(import.meta.dirname, "plist-template.xml"), "utf-8");
  const agentSlug = slug(agent.name);
  const companySlug = C.slug;
  const listenerPath = join(PROJECTS, companySlug, "agents", agentSlug, "listener.mjs");
  const workDir = join(PROJECTS, companySlug, "agents", agentSlug);
  
  const knowledgeFiles = (INF.knowledge_files || []).join(",");
  
  return template(tpl, {
    COMPANY_SLUG: companySlug,
    AGENT_SLUG: agentSlug,
    USER,
    SLACK_XAPP_TOKEN: slackTokens?.app_token || "",
    SLACK_XOXB_TOKEN: slackTokens?.bot_token || "",
    SLACK_BOT_USER_ID: slackTokens?.bot_user_id || "",
    DEEPSEEK_API_KEY: INF.deepseek_api_key || "",
    AGENT_NAME: agent.name,
    AGENT_DISPLAY_NAME: agent.display_name || agent.name,
    AGENT_ROLE: agent.role,
    COMPANY_NAME: C.name,
    COMPANY_DESCRIPTION: C.description || "",
    COMPANY_WEBSITE: C.website || "",
    DOMAIN_SCOPE: (agent.system_prompt?.identity || "").substring(0, 200),
    AGENT_RESPONSIBILITIES: (agent.system_prompt?.responsibilities || []).join("; ").substring(0, 500),
    AGENT_BOUNDARIES: (agent.system_prompt?.boundaries || []).join("; ").substring(0, 300),
    AGENT_COORDINATION: (agent.system_prompt?.coordination || []).join("; ").substring(0, 300),
    AGENT_PERSONALITY: (agent.system_prompt?.personality || "").substring(0, 200),
    AGENT_FALLBACK: `I'm ${agent.display_name || agent.name}, ${agent.role} for ${C.name}.`,
    CRON_CONFIG: "",
    ALERT_ROUTING: "",
    CHANNELS: "",
    SLASH_COMMANDS: "",
    OBSIDIAN_VAULT_PATH: INF.obsidian_vault || "",
    KNOWLEDGE_FILES: knowledgeFiles,
    NOTION_API_KEY: INF.notion_api_key || "",
    NOTION_DATABASES: JSON.stringify(INF.notion_databases || {}),
  });
}

// ── MCP Config ───────────────────────────────────────

function renderMcpConfig() {
  const tpl = readFileSync(join(import.meta.dirname, "mcp-config.jsonc"), "utf-8");
  return template(tpl, {
    PROJECT_SLUG: C.slug,
    SLACK_MCP_XOXB_TOKEN: `\${env:SLACK_MCP_${C.slug.toUpperCase()}_XOXB_TOKEN}`,
  });
}

// ── Agent Definition ─────────────────────────────────

function renderAgentDef(agent) {
  const sp = agent.system_prompt || {};
  const mcpServer = `slack-${C.slug}`;
  
  return `---
description: ${agent.display_name || agent.name} — ${agent.role} for ${C.name}
mode: subagent
model: deepseek/deepseek-v4-pro
permission:
  read: allow
  edit: allow
  bash: ask
  webfetch: allow
  websearch: allow
---

You are ${agent.display_name || agent.name}, the ${C.name} ${agent.role} agent.

## Your Role
${sp.identity || agent.description}

## Available Slack Tools (via MCP)
You have access to \`${mcpServer}_*\` tools:
- \`${mcpServer}_channels_list\` — List all channels
- \`${mcpServer}_conversations_history\` — Read messages
- \`${mcpServer}_conversations_replies\` — Read thread replies
- \`${mcpServer}_conversations_search_messages\` — Search messages
- \`${mcpServer}_users_search\` — Find users
- \`${mcpServer}_usergroups_list\` — List user groups
- \`${mcpServer}_conversations_unreads\` — Get unread messages
- \`${mcpServer}_conversations_mark\` — Mark as read

## Responsibilities
${(sp.responsibilities || []).map(r => `- ${r}`).join("\n")}

## Boundaries
${(sp.boundaries || []).map(b => `- ${b}`).join("\n")}

## Agent Coordination
${(sp.coordination || []).map(c => `- ${c}`).join("\n")}

## Cron Jobs
${(agent.cron || []).map(c => `- \`${c.schedule}\` — ${c.description}`).join("\n")}

## Response Style
${sp.personality || "Be direct, concise, helpful."}

Always provide clear, actionable summaries. When settings are missing, provide the exact steps to fix them.
`;
}

// ── Report Renderers ─────────────────────────────────

function renderAgentDesignReport(cfg) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let md = `---
date: ${new Date().toISOString().split("T")[0]}
tags:
  - ${cfg.company.slug}
  - agent-design
  - agent-hub
---

# ${cfg.company.name} — Agent Design

> Generated ${date} by Agent Hub

## Company
- **Name:** ${cfg.company.name}
- **Slug:** ${cfg.company.slug}
- **Description:** ${cfg.company.description || ""}
- **Website:** ${cfg.company.website || ""}

## Agent Roster

`;
  for (const agent of cfg.agents) {
    const sp = agent.system_prompt || {};
    md += `### ${agent.display_name || agent.name} — ${agent.role}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| Role | ${agent.role} |\n`;
    md += `| Description | ${agent.description || ""} |\n`;
    md += `| Color | #${agent.color || "3B82F6"} |\n\n`;
    md += `**Identity:** ${sp.identity || ""}\n\n`;
    md += `**Responsibilities:**\n${(sp.responsibilities || []).map(r => `- ${r}`).join("\n")}\n\n`;
    md += `**Boundaries:**\n${(sp.boundaries || []).map(b => `- ${b}`).join("\n")}\n\n`;
    md += `**Coordination:**\n${(sp.coordination || []).map(c => `- ${c}`).join("\n")}\n\n`;
    if (agent.cron?.length) {
      md += `**Cron Jobs:**\n${agent.cron.map(c => `- \`${c.schedule}\` — ${c.description}`).join("\n")}\n\n`;
    }
    md += `**Scopes:** ${(agent.slack_scopes || []).join(", ")}\n\n`;
    md += `---\n\n`;
  }
  return md;
}

function renderDeployReport(cfg, mcpConfigs) {
  const date = new Date().toISOString();
  let md = `---
date: ${date.split("T")[0]}
tags:
  - ${cfg.company.slug}
  - deploy
  - agent-hub
---

# ${cfg.company.name} — Deployment Report

> Deployed ${new Date(date).toLocaleString("en-US")} by Agent Hub

## Deployed Agents

| Agent | Role | Slack App | Plist | MCP Server |
|-------|------|-----------|-------|------------|
`;
  for (const agent of cfg.agents) {
    const agSlug = slug(agent.name);
    md += `| ${agent.display_name || agent.name} | ${agent.role} | com.${cfg.company.slug}.${agSlug} | \`com.${cfg.company.slug}.${agSlug}.listener.plist\` | slack-${cfg.company.slug} |\n`;
  }

  md += `\n## MCP Configuration\n\n`;
  for (const mcp of mcpConfigs) {
    md += `- \`${mcp.key}\` — \`SLACK_MCP_${cfg.company.slug.toUpperCase()}_XOXB_TOKEN\`\n`;
  }

  md += `\n## Next Steps\n\n`;
  md += `1. Restart OpenCode to pick up MCP config changes\n`;
  md += `2. Invite agents to channels in Slack\n`;
  md += `3. Test: DM each agent in Slack\n`;
  md += `4. Monitor logs: \`tail -f ~/Library/Logs/com.${cfg.company.slug}.*.listener.log\`\n`;

  return md;
}

// ── Main Deploy Loop ─────────────────────────────────

console.log(`\n🚀 Agent Hub Deploy: ${C.name} (${C.slug})\n`);
console.log(`Config: ${configPath}`);
console.log(`Agents: ${config.agents.length} (${config.agents.map(a => a.name).join(", ")})`);
console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}${skipApi ? " (skip API)" : ""}\n`);

const projectDir = join(PROJECTS, C.slug);
const agentsDir = join(projectDir, "agents");
const opencodeAgentDir = join(projectDir, ".opencode", "agent");
const mcpConfigs = [];

for (const agent of config.agents) {
  const agentSlug = slug(agent.name);
  const agentDir = join(agentsDir, agentSlug);
  
  console.log(`\\n── ${agent.display_name || agent.name} (${agent.role}) ──`.padEnd(60, "─"));
  
  // ── 1. Create Slack App ────────────────────────────
  
  let slackTokens = null;
  
  if (!skipApi && SL.config_token && SL.config_token !== "xoxe.xoxp-...") {
    console.log(`  Creating Slack app...`);
    const manifest = renderManifest(agent);
    
    if (!dryRun) {
      const result = await slackApi("apps.manifest.create", {
        manifest: JSON.stringify(JSON.parse(manifest)), // YAML -> JSON for API
      });
      // TODO: apps.manifest.create may need YAML directly, check API
    } else {
      console.log(`  [DRY RUN] Would create Slack app from manifest`);
    }
  } else {
    console.log(`  Skipping Slack API (--skip-api or no config_token)`);
  }
  
  if (!slackTokens) {
    slackTokens = {
      app_token: process.env[`SLACK_XAPP_${agent.name.toUpperCase()}`] || "xapp-...",
      bot_token: process.env[`SLACK_XOXB_${agent.name.toUpperCase()}`] || "xoxb-...",
      bot_user_id: process.env[`SLACK_BOT_USER_${agent.name.toUpperCase()}`] || "U0...",
    };
    console.log(`  Using tokens from environment`);
  }
  
  // ── 2. Create directories ──────────────────────────
  
  if (!dryRun) {
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(opencodeAgentDir, { recursive: true });
    console.log(`  Created: ${agentDir}`);
  } else {
    console.log(`  [DRY RUN] Would create: ${agentDir}`);
  }
  
  // ── 3. Generate listener.mjs ───────────────────────
  
  const listenerCode = renderListener(agent, slackTokens);
  const listenerPath = join(agentDir, "listener.mjs");
  
  if (!dryRun) {
    writeFileSync(listenerPath, listenerCode);
    execSync(`chmod +x "${listenerPath}"`);
    console.log(`  Generated: listener.mjs`);
  } else {
    console.log(`  [DRY RUN] Would generate: listener.mjs`);
  }
  
  // ── 4. Copy listener-utils.mjs ─────────────────────
  
  const utilsSrc = join(import.meta.dirname, "..", "templates", "listener-utils.mjs");
  const utilsDst = join(agentDir, "listener-utils.mjs");
  if (existsSync(utilsSrc)) {
    if (!dryRun) {
      copyFileSync(utilsSrc, utilsDst);
      console.log(`  Copied: listener-utils.mjs`);
    } else {
      console.log(`  [DRY RUN] Would copy: listener-utils.mjs`);
    }
  }
  
  // ── 5. Generate plist ──────────────────────────────
  
  const plistXml = renderPlist(agent, slackTokens);
  const plistPath = join(LAUNCH_AGENTS, `com.${C.slug}.${agentSlug}.listener.plist`);
  
  if (!dryRun) {
    writeFileSync(plistPath, plistXml);
    console.log(`  Generated: plist → ${plistPath}`);
    
    // Load into launchd
    try {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      execSync(`launchctl load "${plistPath}"`);
      console.log(`  ✅ launchd loaded`);
    } catch (e) {
      console.error(`  ✗ launchd load failed: ${e.message}`);
    }
  } else {
    console.log(`  [DRY RUN] Would generate and load plist`);
  }
  
  // ── 6. Accumulate MCP config ───────────────────────
  
  mcpConfigs.push({
    key: `slack-${C.slug}`,
    xoxb: `\${env:SLACK_MCP_${C.slug.toUpperCase()}_XOXB_TOKEN}`,
    xoxbRaw: slackTokens.bot_token,
  });
  
  // ── 7. Generate agent definition ───────────────────
  
  const agentDefMd = renderAgentDef(agent);
  const agentDefPath = join(opencodeAgentDir, `${agentSlug}.md`);
  
  if (!dryRun) {
    writeFileSync(agentDefPath, agentDefMd);
    console.log(`  Generated: .opencode/agent/${agentSlug}.md`);
  } else {
    console.log(`  [DRY RUN] Would generate .opencode/agent/${agentSlug}.md`);
  }
}

// ── Post-Deploy: MCP Config ─────────────────────────

console.log(`\n── MCP Configuration ──`.padEnd(60, "─"));

for (const mcp of mcpConfigs) {
  const mcpBlock = `\n// ${C.name} — Slack bot token auth\n"${mcp.key}": {\n  "type": "local",\n  "command": ["slack-mcp-server", "-t", "stdio", "-enabled-tools", "channels_list,conversations_history,conversations_search_messages,conversations_replies,conversations_unreads,conversations_mark,users_search,usergroups_list,usergroups_me,usergroups_create,usergroups_update,usergroups_users_update,reactions_add,reactions_remove,conversations_add_message"],\n  "enabled": true,\n  "environment": {\n    "SLACK_MCP_XOXB_TOKEN": "${mcp.xoxb}",\n    "SLACK_MCP_ADD_MESSAGE_TOOL": "true",\n    "SLACK_MCP_MARK_TOOL": "true",\n    "SLACK_MCP_LOG_LEVEL": "info"\n  }\n},\n`;
  const permLine = `"${mcp.key}_*": "allow",\n`;

  if (!dryRun) {
    console.log(`\n  Appending MCP config to ${OPENCODE_CONFIG}...`);
    console.log(`  (Back up opencode.jsonc first!)`);
    
    // Read existing config, inject MCP block before last }
    try {
      const existing = readFileSync(OPENCODE_CONFIG, "utf-8");
      if (existing.includes(`"${mcp.key}"`)) {
        console.log(`  ⚠ MCP server "${mcp.key}" already exists in opencode.jsonc — skipping`);
      } else {
        // Find the mcp section or the last } before permissions
        const mcpMatch = existing.match(/"mcp"\s*:\s*\{/);
        if (mcpMatch) {
          const insertPos = existing.indexOf("{", mcpMatch.index + mcpMatch[0].length) + 1;
          const newContent = existing.slice(0, insertPos) + mcpBlock + existing.slice(insertPos);
          if (!dryRun) writeFileSync(OPENCODE_CONFIG, newContent);
          console.log(`  ✅ MCP block added`);
        } else {
          console.log(`  ⚠ Could not find "mcp" section in opencode.jsonc — add manually:`);
          console.log(mcpBlock);
        }
        
        // Check permissions
        if (!existing.includes(`"${mcp.key}_*"`)) {
          const permMatch = existing.match(/"permissions"\s*:\s*\{/);
          if (permMatch) {
            const insertPos = existing.indexOf("{", permMatch.index + permMatch[0].length) + 1;
            const newContent = existing.slice(0, insertPos) + permLine + existing.slice(insertPos);
            if (!dryRun) writeFileSync(OPENCODE_CONFIG, newContent);
            console.log(`  ✅ Permission added`);
          } else {
            console.log(`  ⚠ Could not find "permissions" section — add manually:`);
            console.log(permLine);
          }
        }
      }
    } catch (e) {
      console.error(`  ✗ Failed to update opencode.jsonc: ${e.message}`);
      console.log(`  Add this block manually to the "mcp" section:\n${mcpBlock}`);
      console.log(`  Add this to the "permissions" section:\n${permLine}`);
    }
  } else {
    console.log(`  [DRY RUN] Would add MCP config for "${mcp.key}"`);
  }
}

// ── Post-Deploy: Save Reports to Obsidian ─────────────

console.log(`\n── Obsidian Reports ──`.padEnd(60, "─"));

const vaultPath = INF.obsidian_vault;
if (vaultPath && !dryRun) {
  const vaultDir = join(vaultPath, "Skills", C.slug, "Context");
  mkdirSync(vaultDir, { recursive: true });

  // Save agent design as a report
  const designMd = renderAgentDesignReport(config);
  const designPath = join(vaultDir, `agent-design-${new Date().toISOString().split("T")[0]}.md`);
  writeFileSync(designPath, designMd);
  console.log(`  ✅ Saved agent design: ${designPath}`);

  // Save deployment record
  const deployMd = renderDeployReport(config, mcpConfigs);
  const deployPath = join(vaultDir, `deploy-report-${new Date().toISOString().split("T")[0]}.md`);
  writeFileSync(deployPath, deployMd);
  console.log(`  ✅ Saved deploy report: ${deployPath}`);
} else if (!vaultPath) {
  console.log(`  ⚠ No obsidian_vault configured — skipping report save`);
} else {
  console.log(`  [DRY RUN] Would save reports to Obsidian vault`);
}

// ── Post-Deploy: Log to Notion Tracker ───────────────

console.log(`\n── Notion Tracker ──`.padEnd(60, "─"));

const notionKey = INF.notion_api_key;
const trackerDbId = INF.notion_tracker_db_id;

if (notionKey && trackerDbId && !dryRun) {
  try {
    // Log each agent deployment
    for (const agent of config.agents) {
      const body = {
        parent: { database_id: trackerDbId },
        properties: {
          "Company": { title: [{ text: { content: C.name } }] },
          "Slug": { rich_text: [{ text: { content: C.slug } }] },
          "Status": { select: { name: "Deploying" } },
          "Phase": { select: { name: "Deploy" } },
          "Agents": { number: config.agents.length },
          "Event": { rich_text: [{ text: { content: `Agent "${agent.display_name || agent.name}" deployed via agent-hub` } }] },
          "Last Activity": { date: { start: new Date().toISOString() } },
          "Notes": { rich_text: [{ text: { content: `Role: ${agent.role}. Slack app created. listener.mjs + plist generated. launchd loaded.` } }] },
        },
      };

      // Search for existing entry first
      const searchRes = await fetch(`https://api.notion.com/v1/databases/${trackerDbId}/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${notionKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ filter: { property: "Slug", rich_text: { equals: C.slug } }, page_size: 1 }),
      });
      const searchJson = await searchRes.json();

      if (searchJson.results?.length > 0) {
        // Update existing
        const pageId = searchJson.results[0].id;
        await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Authorization": `Bearer ${notionKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
          body: JSON.stringify({ properties: body.properties }),
        });
      } else {
        // Create new
        await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: { "Authorization": `Bearer ${notionKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }
    console.log(`  ✅ Logged to Notion Agent Hub Tracker (${trackerDbId})`);
  } catch (e) {
    console.error(`  ✗ Notion tracker error: ${e.message}`);
  }
} else if (!notionKey) {
  console.log(`  ⚠ No notion_api_key configured — skipping tracker`);
} else if (!trackerDbId) {
  console.log(`  ⚠ No notion_tracker_db_id configured — skipping tracker`);
} else {
  console.log(`  [DRY RUN] Would log to Notion tracker`);
}

// ── Summary ──────────────────────────────────────────

console.log(`\n${"".padEnd(60, "=")}`);
console.log(`\n✅ Deploy complete for ${C.name}`);
console.log(`   ${config.agents.length} agents: ${config.agents.map(a => a.name).join(", ")}`);

if (vaultPath) {
  console.log(`\n📓 Obsidian reports saved to: ${join(vaultPath, "Skills", C.slug, "Context")}`);
}
if (notionKey && trackerDbId) {
  console.log(`📊 Notion tracker updated: ${trackerDbId}`);
}

console.log(`\nManual steps remaining:`);
console.log(`  1. Restart OpenCode to pick up MCP config changes`);
console.log(`  2. Export env var (add to .zshrc if not already):`);
for (const mcp of mcpConfigs) {
  console.log(`     export SLACK_MCP_${C.slug.toUpperCase()}_XOXB_TOKEN="${mcp.xoxbRaw}"`);
}
console.log(`  3. Invite agents to channels in Slack`);
console.log(`  4. Test: DM each agent in Slack`);
console.log(`\nLogs:`);
for (const agent of config.agents) {
  console.log(`  tail -f ~/Library/Logs/com.${C.slug}.${slug(agent.name)}.listener.log`);
}
console.log();
