// ── Agent Hub Listener Utilities ────────────────────
// Shared by all agents. Imported by listener.mjs.
//
// Provides:
//   - spawnSubAgent(prompt, options)  → spawn a sub-agent via DeepSeek
//   - spawnSubAgents(tasks, options)  → spawn multiple in parallel
//   - routeAlert(severity, ...)       → determine channel from alert_routing config
//   - formatAlert(severity, msg, src) → build formatted alert message
//   - saveReport(name, content, vault)→ save compiled research report to Obsidian
//   - logToNotion(entry, apiKey, dbId)→ log deployment/research event to Notion
//   - notifyOwner(message, ...)       → DM the workspace owner
//   - logCron(job, status)            → structured cron logging
//   - healthCheck(...)                → run health diagnostics

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Sub-Agent Spawning ──────────────────────────────

export async function spawnSubAgent(prompt, { role = "Sub-Agent", apiKey, model = "deepseek-chat", maxTokens = 1500 } = {}) {
  if (!apiKey) {
    console.error(`[subagent] Cannot spawn "${role}" — no API key`);
    return { text: `[Sub-agent "${role}" could not execute — no API key configured]`, role };
  }

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `You are a specialized sub-agent with the role: ${role}. Execute the task given by the user. Be thorough, cite sources, and return actionable results. Do NOT ask clarifying questions — do your best with the information provided.` },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: maxTokens,
      }),
    });

    const j = await res.json();
    if (j.error) {
      console.error(`[subagent] "${role}" LLM error:`, JSON.stringify(j.error));
      return { text: `[Sub-agent "${role}" failed: ${j.error.message || "unknown error"}]`, role };
    }

    const text = j.choices?.[0]?.message?.content || "";
    console.log(`[subagent] "${role}" returned ${text.length} chars`);
    return { text, role };
  } catch (e) {
    console.error(`[subagent] "${role}" error:`, e.message);
    return { text: `[Sub-agent "${role}" failed: ${e.message}]`, role };
  }
}

export async function spawnSubAgents(tasks, options = {}) {
  console.log(`[subagent] Spawning ${tasks.length} sub-agents in parallel...`);
  const results = await Promise.all(tasks.map(task => spawnSubAgent(task.prompt, { ...options, role: task.role })));
  console.log(`[subagent] All ${tasks.length} sub-agents completed`);
  return results;
}

// ── Alert Routing ────────────────────────────────────

export function routeAlert(severity, alertRouting = {}, channels = {}) {
  const level = severity.toLowerCase();
  const routing = alertRouting[level];
  if (!routing) return { channel: channels.alerts || "alerts", threshold: "unknown", label: "UNKNOWN" };
  const channelName = routing.channel || "alerts";
  const channelKey = channels[channelName] || channelName;
  return { channel: channelKey.startsWith("#") ? channelKey : `#${channelKey}`, threshold: routing.threshold || "", label: level.toUpperCase(), examples: routing.examples || [] };
}

export function formatAlert(severity, message, source = "") {
  const emoji = { p0: "🔴", p1: "🟠", p2: "🟡", p3: "🔵" };
  const label = severity.toUpperCase();
  const sourceLine = source ? `\n_Source: ${source}_` : "";
  return `${emoji[label] || "⚪"} *${label} Alert*${sourceLine}\n> ${message}`;
}

// ── Obsidian Report Saving ───────────────────────────

/**
 * Save a compiled research report to the Obsidian vault.
 * Creates the directory structure if it doesn't exist.
 *
 * @param {string} companyName - Company name (e.g. "MetroPrints")
 * @param {string} reportType - Type of report (e.g. "research", "agent-design", "deploy")
 * @param {string} content - Markdown content of the report
 * @param {string} vaultPath - Root path of the Obsidian vault
 * @returns {{ok: boolean, path: string}}
 */
export function saveReport(companyName, reportType, content, vaultPath) {
  if (!vaultPath) {
    console.log("[obsidian] No vault path configured — skipping report save");
    return { ok: false, path: "", error: "no_vault_path" };
  }

  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const dir = join(vaultPath, "Skills", slug, "Context");
  const filename = `${reportType}-report-${date}.md`;
  const filepath = join(dir, filename);

  try {
    mkdirSync(dir, { recursive: true });

    const frontmatter = `---
date: ${date}
tags:
  - ${slug}
  - ${reportType}
  - agent-hub
---
`;
    writeFileSync(filepath, frontmatter + content, "utf-8");
    console.log(`[obsidian] Saved ${reportType} report: ${filepath}`);
    return { ok: true, path: filepath };
  } catch (e) {
    console.error(`[obsidian] Failed to save report:`, e.message);
    return { ok: false, path: "", error: e.message };
  }
}

// ── Notion Tracking ──────────────────────────────────

/**
 * Log an event to the Agent Hub Tracker Notion database.
 *
 * @param {object} entry
 * @param {string} entry.company - Company name
 * @param {string} entry.slug - Company slug
 * @param {string} entry.phase - "research" | "design" | "deploy" | "live"
 * @param {string} entry.event - What happened (e.g. "Research completed", "Agents deployed")
 * @param {object} entry.details - Additional details (agent count, report path, etc.)
 * @param {string} apiKey - Notion API key
 * @param {string} databaseId - Agent Hub Tracker database ID
 * @returns {Promise<{ok: boolean}>}
 */
export async function logToNotion(entry, apiKey, databaseId) {
  if (!apiKey || !databaseId) {
    console.log(`[notion] Skipping tracker log — no apiKey or databaseId configured`);
    return { ok: false, error: "missing_config" };
  }

  const now = new Date().toISOString();
  const { company, slug, phase, event, details = {} } = entry;

  const properties = {
    "Company": { title: [{ text: { content: company } }] },
    "Slug": { rich_text: [{ text: { content: slug } }] },
    "Status": { select: { name: phase === "live" ? "Live" : phase === "deploy" ? "Deploying" : phase === "design" ? "Designing" : "Researching" } },
    "Phase": { select: { name: phase.charAt(0).toUpperCase() + phase.slice(1) } },
    "Event": { rich_text: [{ text: { content: event } }] },
    "Last Activity": { date: { start: now } },
  };

  // Add optional fields
  if (details.agentCount) properties["Agents"] = { number: details.agentCount };
  if (details.reportPath) properties["Report"] = { url: `file://${details.reportPath}` };
  if (details.notes) properties["Notes"] = { rich_text: [{ text: { content: details.notes } }] };

  try {
    // First, search for existing page for this company
    const searchRes = await fetch("https://api.notion.com/v1/databases/" + databaseId + "/query", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({
        filter: { property: "Slug", rich_text: { equals: slug } },
        page_size: 1,
      }),
    });
    const searchJson = await searchRes.json();

    if (searchJson.results?.length > 0) {
      // Update existing page
      const pageId = searchJson.results[0].id;
      const updateRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ properties }),
      });
      const updateJson = await updateRes.json();
      if (!updateJson.id) console.error(`[notion] Update failed:`, JSON.stringify(updateJson));
      else console.log(`[notion] Updated tracker for ${company}`);
      return { ok: !!updateJson.id };
    } else {
      // Create new page
      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
      });
      const createJson = await createRes.json();
      if (!createJson.id) console.error(`[notion] Create failed:`, JSON.stringify(createJson));
      else console.log(`[notion] Created tracker entry for ${company}`);
      return { ok: !!createJson.id };
    }
  } catch (e) {
    console.error(`[notion] Tracker error:`, e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Create the Agent Hub Tracker database in Notion if it doesn't exist.
 * Returns the database ID.
 *
 * @param {string} apiKey - Notion API key
 * @param {string} parentPageId - Parent page ID to create the database under
 * @returns {Promise<string|null>} Database ID or null
 */
export async function createAgentHubTracker(apiKey, parentPageId) {
  if (!apiKey || !parentPageId) {
    console.log("[notion] Cannot create tracker — missing apiKey or parentPageId");
    return null;
  }

  const headers = { "Authorization": `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };

  try {
    const res = await fetch("https://api.notion.com/v1/databases", {
      method: "POST",
      headers,
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentPageId },
        title: [{ type: "text", text: { content: "Agent Hub Tracker" } }],
        properties: {
          "Company": { title: {} },
          "Slug": { rich_text: {} },
          "Status": { select: { options: [
            { name: "Researching", color: "blue" },
            { name: "Designing", color: "yellow" },
            { name: "Deploying", color: "orange" },
            { name: "Live", color: "green" },
            { name: "Archived", color: "gray" },
          ]}},
          "Phase": { select: { options: [
            { name: "Research", color: "blue" },
            { name: "Design", color: "yellow" },
            { name: "Deploy", color: "orange" },
            { name: "Live", color: "green" },
          ]}},
          "Agents": { number: {} },
          "Event": { rich_text: {} },
          "Report": { url: {} },
          "Notes": { rich_text: {} },
          "Last Activity": { date: {} },
        },
      }),
    });

    const json = await res.json();
    if (json.id) {
      console.log(`[notion] Created Agent Hub Tracker: ${json.id}`);
      return json.id;
    } else {
      console.error(`[notion] Failed to create tracker:`, JSON.stringify(json));
      return null;
    }
  } catch (e) {
    console.error(`[notion] Tracker creation error:`, e.message);
    return null;
  }
}

// ── Channel Utilities ────────────────────────────────

export function formatChannel(name) {
  if (!name) return "#general";
  return name.startsWith("#") ? name : `#${name}`;
}

export async function notifyOwner(message, { slackApi, ownerUserId }) {
  if (!ownerUserId) { console.log("[notify] No owner user ID configured"); return; }
  try {
    const dm = await slackApi("conversations.open", { users: ownerUserId });
    if (!dm.ok || !dm.channel?.id) { console.error("[notify] Could not open DM:", dm.error); return; }
    await slackApi("chat.postMessage", { channel: dm.channel.id, text: message, unfurl_links: false, unfurl_media: false });
    console.log(`[notify] DM sent to owner (${ownerUserId})`);
  } catch (e) {
    console.error("[notify] Failed to DM owner:", e.message);
  }
}

// ── Cron Logging ─────────────────────────────────────

export function logCron(job, status, detail = "") {
  const ts = new Date().toISOString();
  const entry = { timestamp: ts, job, status, detail };
  console.log(`[cron] ${ts} | ${job} | ${status}${detail ? " | " + detail : ""}`);
  return entry;
}

// ── Health Check ─────────────────────────────────────

export async function healthCheck({ slackApi, agentName, botUserId }) {
  const checks = {
    agent: { status: "ok", detail: `${agentName} running` },
    slack: { status: "unknown", detail: "" },
    llm: { status: "unknown", detail: "" },
  };

  try {
    const auth = await slackApi("auth.test", {});
    checks.slack = auth.ok ? { status: "ok", detail: `Connected as ${auth.user} (${auth.team})` } : { status: "error", detail: auth.error };
  } catch (e) {
    checks.slack = { status: "error", detail: e.message };
  }

  try {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) { checks.llm = { status: "error", detail: "No DEEPSEEK_API_KEY" }; }
    else {
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
      });
      const j = await res.json();
      checks.llm = j.error ? { status: "error", detail: j.error.message } : { status: "ok", detail: "DeepSeek API responding" };
    }
  } catch (e) {
    checks.llm = { status: "error", detail: e.message };
  }

  const allOk = Object.values(checks).every(c => c.status === "ok");
  return { healthy: allOk, timestamp: new Date().toISOString(), agent: agentName, bot_user_id: botUserId, checks };
}

// ── Report Compilation ───────────────────────────────

/**
 * Compile sub-agent research results into a unified markdown report.
 *
 * @param {string} companyName - Company name
 * @param {Array<{role: string, text: string}>} results - Sub-agent results
 * @returns {string} Compiled markdown report
 */
export function compileResearchReport(companyName, results) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let md = `# ${companyName} — Deep-Dive Research Report\n\n`;
  md += `> Compiled ${date} by Agent Hub Research Pipeline\n\n`;
  md += `---\n\n`;

  for (const r of results) {
    md += `## ${r.role}\n\n${r.text}\n\n---\n\n`;
  }

  md += `\n## Research Methodology\n\n`;
  md += `This report was compiled by 5 parallel sub-agents researching:\n`;
  md += `- Market & Industry\n- Workflow & Operations\n- Technology & Stack\n- Customer Experience & Revenue\n- Risk & Compliance\n\n`;
  md += `Sources include Reddit, Quora, Hacker News, industry publications, community forums, and internal documents.\n`;

  return md;
}
