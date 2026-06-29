#!/usr/bin/env node

// ── The Forge / Design ───────────────────────────────
// Usage: ./design.mjs companies/new-company.json [--dry-run]
//
// Reads the research report from Obsidian, uses LLM to analyze it,
// and generates a complete company config JSON with agent definitions.
// Saves agent design to Obsidian and logs to Notion tracker.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();

// ── CLI ──────────────────────────────────────────────

const args = process.argv.slice(2);
const configPath = args.find(a => a.endsWith(".json"));
const dryRun = args.includes("--dry-run");

if (!configPath) {
  console.error("Usage: ./design.mjs companies/COMPANY.json [--dry-run]");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const C = config.company;
const INF = config.infrastructure || {};

if (!C?.name || !INF?.deepseek_api_key) {
  console.error("Config must include company.name and infrastructure.deepseek_api_key");
  process.exit(1);
}

// ── Find Research Report ─────────────────────────────

function findResearchReport() {
  const vaultPath = INF.obsidian_vault;
  if (!vaultPath) {
    console.error("No obsidian_vault configured — cannot find research report");
    return null;
  }

  const slug = C.slug || C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const dir = join(vaultPath, "Skills", slug, "Context");

  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    return null;
  }

  // Find the latest research report
  let files;
  try {
    files = readFileSync(dir, "utf-8"); // reads directory listing — won't work
    // Actually need a different approach
  } catch {}

  // Use a known filename pattern
  const date = new Date().toISOString().split("T")[0];
  const candidates = [
    join(dir, `research-report-${date}.md`),
    join(dir, "research-report.md"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }

  // Fallback: accept report path from config or stdin
  if (INF.research_report_path && existsSync(INF.research_report_path)) {
    return readFileSync(INF.research_report_path, "utf-8");
  }

  console.error(`No research report found in ${dir}`);
  console.error(`Expected: research-report-${date}.md`);
  console.error(`Or set infrastructure.research_report_path in config`);
  return null;
}

// ── DeepSeek API ─────────────────────────────────────

async function deepseek(messages) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${INF.deepseek_api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.4,
      max_tokens: 4000,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`DeepSeek error: ${JSON.stringify(j.error)}`);
  return j.choices?.[0]?.message?.content || "";
}

// ── Agent Generation Prompt ──────────────────────────

function buildDesignPrompt(researchReport) {
  return `You are an AI agent architect. Based on the research report below for "${C.name}", design a set of AI agents that will operate this business.

## Research Report
${researchReport.substring(0, 15000)}

## Instructions

Design ${C.agentCount || 3} AI agents for ${C.name}. Every business needs at minimum:
1. A **Case Management / Operations** agent (handles client lifecycle, workflows, scheduling)
2. A **Finance / Revenue** agent (monitors payments, tracks revenue, detects anomalies)
3. A **General Slack Bot** (responds to @mentions, answers questions, routes to other agents)

Additional agents may be needed based on industry complexity (e.g. compliance agent for regulated industries, content agent for media, support agent for SaaS).

For each agent, provide:
- **name**: Short lowercase identifier. Pick a NAMING THEME first (all agents must share one theme):
  * First names: casey, penny, metro — human "coworker" feel
  * Mythological: hermes, athena, apollo — authoritative
  * Nature: river, sage, flint — organic/sustainable
  * Tech: byte, echo, nova — SaaS/digital
  * Gemstone: opal, onyx, jasper — luxury
  * The name should hint at the role (e.g. "penny" for finance, "atlas" for operations)
- **display_name**: Capitalized display name (e.g. "Casey", "Penny", "Metro")
- **role**: 2-3 word description (e.g. "case management", "finance oversight")
- **description**: One-line summary
- **color**: Hex color code (pick distinct colors)
- **system_prompt.identity**: 2-3 sentences describing who they are in first person
- **system_prompt.responsibilities**: Array of 4-6 bullet points (as array of strings)
- **system_prompt.boundaries**: Array of 2-4 things they do NOT do
- **system_prompt.coordination**: Array of 1-3 handoff rules with other agents
- **system_prompt.personality**: 1-2 sentence tone description
- **cron**: Array of 3-6 scheduled jobs with schedule (cron expression), job (short id), description, channel (alerts/critical/dm_owner)
- **alert_routing**: Object with p0/p1/p2 severity levels, each with threshold, channel, and 2-3 examples
- **slack_scopes**: Array of Slack OAuth scopes (use defaults: channels:read, chat:write, app_mentions:read, ...)
- **slash_commands**: Array of 2-4 commands with command, description, type: "handler"

## Output Format

Return ONLY valid JSON — no markdown fences, no explanation. The JSON must match this structure exactly:

{
  "agents": [
    {
      "name": "...",
      "display_name": "...",
      "role": "...",
      "description": "...",
      "color": "HEX",
      "system_prompt": {
        "identity": "...",
        "responsibilities": ["...", "..."],
        "boundaries": ["...", "..."],
        "coordination": ["...", "..."],
        "personality": "..."
      },
      "cron": [
        { "schedule": "0 8 * * *", "job": "morning_standup", "description": "...", "channel": "alerts" }
      ],
      "alert_routing": {
        "p0": { "threshold": "<1 hour", "channel": "critical", "examples": ["...", "..."] },
        "p1": { "threshold": "by EOD", "channel": "critical", "examples": ["...", "..."] },
        "p2": { "threshold": "3-5 days", "channel": "alerts", "examples": ["...", "..."] }
      },
      "slack_scopes": ["channels:read", "chat:write", "..."],
      "slash_commands": [
        { "command": "/agent-cmd", "description": "...", "type": "handler" }
      ]
    }
  ]
}`;
}

// ── Parse LLM JSON ───────────────────────────────────

function parseAgentJson(raw) {
  // Strip markdown fences if present
  let json = raw.trim();
  json = json.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");

  try {
    return JSON.parse(json);
  } catch (e) {
    // Try to extract JSON object
    const match = json.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    throw new Error(`Failed to parse agent JSON: ${e.message}`);
  }
}

// ── Build Full Company Config ────────────────────────

function buildCompanyConfig(agentJson) {
  const slug = C.slug || C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    company: {
      name: C.name,
      slug,
      description: C.description || "",
      website: C.website || "",
    },
    slack: {
      workspace_id: config.slack?.workspace_id || "",
      config_token: config.slack?.config_token || "xoxe.xoxp-...",
    },
    infrastructure: {
      deepseek_api_key: INF.deepseek_api_key || "",
      notion_api_key: INF.notion_api_key || "",
      notion_tracker_db_id: INF.notion_tracker_db_id || "",
      notion_databases: INF.notion_databases || {},
      obsidian_vault: INF.obsidian_vault || "",
      knowledge_files: INF.knowledge_files || [],
    },
    channels: {
      critical: config.channels?.critical || "critical",
      alerts: config.channels?.alerts || "alerts",
      general: config.channels?.general || "general",
    },
    agents: (agentJson.agents || []).map(a => ({
      ...a,
      // Ensure minimum defaults
      slack_scopes: a.slack_scopes || [
        "channels:read", "channels:history", "groups:read", "groups:history",
        "users:read", "chat:write", "app_mentions:read",
        "im:history", "im:read", "im:write",
        "reactions:read", "reactions:write",
        "usergroups:read", "commands",
      ],
      cron: (a.cron || []).map(c => ({ ...c, channel: c.channel || "alerts" })),
    })),
  };
}

// ── Save Design to Obsidian ──────────────────────────

function saveDesignReport(companyConfig) {
  const vaultPath = INF.obsidian_vault;
  if (!vaultPath) return null;

  const slug = C.slug || C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const dir = join(vaultPath, "Skills", slug, "Context");
  const date = new Date().toISOString().split("T")[0];
  const filepath = join(dir, `agent-design-${date}.md`);

  mkdirSync(dir, { recursive: true });

  let md = `---
date: ${date}
tags:
  - ${slug}
  - agent-design
  - agent-hub
---

# ${C.name} — Agent Design

> Generated by The Forge Design Pipeline — ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

${C.description ? `**Company:** ${C.description}` : ""}
${C.website ? `**Website:** ${C.website}` : ""}

## Agent Roster

`;

  for (const agent of companyConfig.agents) {
    const sp = agent.system_prompt || {};
    md += `### ${agent.display_name || agent.name} — ${agent.role}\n\n`;
    md += `**Identity:** ${sp.identity || ""}\n\n`;
    md += `**Responsibilities:**\n${(sp.responsibilities || []).map(r => `- ${r}`).join("\n")}\n\n`;
    md += `**Boundaries:**\n${(sp.boundaries || []).map(b => `- ${b}`).join("\n")}\n\n`;
    if (sp.coordination?.length) {
      md += `**Coordination:**\n${sp.coordination.map(c => `- ${c}`).join("\n")}\n\n`;
    }
    if (agent.cron?.length) {
      md += `**Cron Jobs:**\n${agent.cron.map(c => `- \`${c.schedule}\` — ${c.description}`).join("\n")}\n\n`;
    }
    if (agent.alert_routing) {
      md += `**Alert Routing:**\n`;
      for (const [level, route] of Object.entries(agent.alert_routing)) {
        md += `- **${level.toUpperCase()}** (${route.threshold}) → #${route.channel}: ${(route.examples || []).join(", ")}\n`;
      }
      md += `\n`;
    }
    md += `**Slack Scopes:** ${(agent.slack_scopes || []).join(", ")}\n\n`;
    md += `---\n\n`;
  }

  writeFileSync(filepath, md, "utf-8");
  return filepath;
}

// ── Save Company JSON ────────────────────────────────

function saveCompanyJson(companyConfig) {
  const outPath = configPath.replace(".json", "-generated.json");
  writeFileSync(outPath, JSON.stringify(companyConfig, null, 2), "utf-8");
  return outPath;
}

// ── Log to Notion ────────────────────────────────────

async function logToNotion(status, phase, event, notes = "") {
  const key = INF.notion_api_key;
  const dbId = INF.notion_tracker_db_id;
  if (!key || !dbId) return;

  const slug = C.slug || C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const body = {
    properties: {
      "Company": { title: [{ text: { content: C.name } }] },
      "Slug": { rich_text: [{ text: { content: slug } }] },
      "Status": { select: { name: status } },
      "Phase": { select: { name: phase } },
      "Event": { rich_text: [{ text: { content: event } }] },
      "Last Activity": { date: { start: new Date().toISOString() } },
    },
  };
  if (notes) body.properties["Notes"] = { rich_text: [{ text: { content: notes } }] };

  try {
    const searchRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { property: "Slug", rich_text: { equals: slug } }, page_size: 1 }),
    });
    const searchJson = await searchRes.json();

    if (searchJson.results?.length > 0) {
      await fetch(`https://api.notion.com/v1/pages/${searchJson.results[0].id}`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${key}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ properties: body.properties }),
      });
    }
  } catch (e) {
    console.error(`  ✗ Notion error: ${e.message}`);
  }
}

// ── Main ─────────────────────────────────────────────

console.log(`\n🏗️  The Forge / Design: ${C.name}\n`);

if (dryRun) {
  console.log(`[DRY RUN] Would:`);
  console.log(`  1. Read research report from Obsidian vault`);
  console.log(`  2. Generate agent definitions via LLM`);
  console.log(`  3. Save company JSON: ${configPath.replace(".json", "-generated.json")}`);
  console.log(`  4. Save agent design to Obsidian`);
  console.log(`  5. Log to Notion tracker`);
  process.exit(0);
}

// 1. Find and read research report
console.log(`── Reading Research Report ──`);
const researchReport = findResearchReport();
if (!researchReport) {
  console.error("Cannot proceed without research report. Run research.mjs first.");
  process.exit(1);
}
console.log(`  ✅ Loaded ${researchReport.length} chars`);

// 2. Generate agent definitions
console.log(`\n── Generating Agent Definitions ──`);
const prompt = buildDesignPrompt(researchReport);
console.log(`  Sending to DeepSeek...`);

let agentJson;
try {
  const raw = await deepseek([
    { role: "system", content: "You are an AI agent architect. Output ONLY valid JSON. No markdown fences. No explanation text. Just the JSON object." },
    { role: "user", content: prompt },
  ]);
  agentJson = parseAgentJson(raw);
  console.log(`  ✅ Generated ${agentJson.agents?.length || 0} agents`);
} catch (e) {
  console.error(`  ✗ Failed: ${e.message}`);
  console.error(`  Raw output (first 500 chars): ${prompt.substring(0, 500)}`);
  process.exit(1);
}

// 3. Build full company config
const companyConfig = buildCompanyConfig(agentJson);

// 4. Save company JSON
const jsonPath = saveCompanyJson(companyConfig);
console.log(`  ✅ Saved: ${jsonPath}`);

// 5. Save agent design to Obsidian
console.log(`\n── Saving to Obsidian ──`);
const designPath = saveDesignReport(companyConfig);
if (designPath) console.log(`  ✅ ${designPath}`);
else console.log(`  ⚠ No obsidian_vault configured`);

// 6. Log to Notion
console.log(`\n── Logging to Notion ──`);
await logToNotion(
  "Designing",
  "Design",
  `${companyConfig.agents.length} agents designed`,
  `Names: ${companyConfig.agents.map(a => a.display_name || a.name).join(", ")}`
);
if (INF.notion_api_key && INF.notion_tracker_db_id) console.log(`  ✅ Notion tracker updated`);

// 7. Print summary
console.log(`\n${"=".repeat(60)}`);
console.log(`\n✅ Design complete for ${C.name}`);
console.log(`   ${companyConfig.agents.length} agents designed:`);
companyConfig.agents.forEach(a => {
  console.log(`     ${a.display_name || a.name} — ${a.role}`);
});
console.log(`\nGenerated company config: ${jsonPath}`);
console.log(`\nNext: Review the generated config, then deploy:`);
console.log(`  ./deploy/deploy-all.mjs ${jsonPath}\n`);
