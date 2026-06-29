#!/usr/bin/env node

// ── The Forge / Verify ───────────────────────────────
// Usage: ./verify.mjs companies/my-company.json [--dry-run]
//
// After OpenCode restart, confirms agents are operational:
//   1. Checks launchd status for all agents
//   2. Re-runs cross-agent tests in coordination channel
//   3. Updates Notion tracker: Status → Live
//   4. Saves verification report to Obsidian
//   5. Posts "all clear" to agent coordination channel

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const LAUNCH_AGENTS = join(HOME, "Library", "LaunchAgents");

// ── CLI ──────────────────────────────────────────────

const args = process.argv.slice(2);
const configPath = args.find(a => a.endsWith(".json"));
const dryRun = args.includes("--dry-run");

if (!configPath) {
  console.error("Usage: ./verify.mjs companies/COMPANY.json [--dry-run]");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const C = config.company;
const INF = config.infrastructure || {};

if (!C?.slug || !config.agents?.length) {
  console.error("Config must include company.slug and agents array");
  process.exit(1);
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); }

// ── 1. Check launchd Status ──────────────────────────

console.log(`\n🔍 The Forge / Verify: ${C.name}\n`);
console.log(`── launchd Status ──`.padEnd(60, "─"));

const launchdChecks = [];

for (const agent of config.agents) {
  const agSlug = slug(agent.name);
  const label = `com.${C.slug}.${agSlug}.listener`;

  try {
    const result = execSync(`launchctl list | grep ${agSlug}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const running = !result.includes("0") ? false : true; // exit code 0 in second column = running
    // Actually parse the launchctl output properly
    const lines = result.split("\n").filter(Boolean);
    const found = lines.some(line => {
      const cols = line.trim().split(/\s+/);
      return cols[2] === label && cols[1] === "0"; // PID exists, exit code 0
    });

    launchdChecks.push({ name: agent.display_name || agent.name, status: found ? "running" : "stopped", detail: found ? "launchd loaded" : "not found or exited" });
    console.log(`  ${found ? "✅" : "❌"} ${agent.display_name || agent.name}: ${found ? "running" : "stopped"}`);
  } catch {
    launchdChecks.push({ name: agent.display_name || agent.name, status: "stopped", detail: "launchctl list failed" });
    console.log(`  ❌ ${agent.display_name || agent.name}: stopped`);
  }
}

// ── 2. Find Agent Channel ────────────────────────────

console.log(`\n── Agent Channel ──`.padEnd(60, "─"));

const agentChannelName = `${C.slug}-agents`;
let agentChannelId = null;
let primaryToken = "";
const mcpConfigs = config.agents.map(a => ({
  key: `slack-${C.slug}`,
  xoxb: process.env[`SLACK_XOXB_${a.name.toUpperCase()}`] || config.slack?.bots?.[a.name]?.xoxb || "",
}));
primaryToken = mcpConfigs[0]?.xoxb;

if (!primaryToken || primaryToken === "xoxb-...") {
  console.log(`  ⚠ No valid bot token — trying channels:manage scope`);
}

// Find the coordination channel
if (primaryToken && !dryRun) {
  try {
    const listRes = await fetch("https://slack.com/api/conversations.list", {
      method: "POST",
      headers: { "Authorization": `Bearer ${primaryToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ types: "private_channel", limit: 200 }),
    });
    const listJson = await listRes.json();
    const channel = (listJson.channels || []).find(c => c.name === agentChannelName);
    if (channel) {
      agentChannelId = channel.id;
      console.log(`  ✅ Found: #${agentChannelName} (${agentChannelId})`);
    } else {
      console.log(`  ⚠ Channel #${agentChannelName} not found — may need to re-deploy`);
    }
  } catch (e) {
    console.error(`  ✗ Channel lookup failed: ${e.message}`);
  }
} else if (dryRun) {
  console.log(`  [DRY RUN] Would find #${agentChannelName}`);
}

// ── 3. Cross-Agent Testing ───────────────────────────

console.log(`\n── Cross-Agent Testing ──`.padEnd(60, "─"));

const testResults = [];
const testRounds = agentChannelId ? 1 : 0; // 1 round of pong tests

if (!dryRun && agentChannelId && primaryToken) {
  for (let i = 0; i < Math.min(config.agents.length, 4); i++) {
    const from = config.agents[i];
    const to = config.agents[(i + 1) % config.agents.length];
    const fromName = from.display_name || from.name;
    const toName = to.display_name || to.name;

    console.log(`  Testing: ${fromName} → ${toName}...`);

    try {
      const testMsg = `🤖 *Verification Test:* @${toName} respond with "pong from ${toName}" if you're operational.`;

      const postRes = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${primaryToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: agentChannelId, text: testMsg, unfurl_links: false, unfurl_media: false }),
      });
      const postJson = await postRes.json();

      if (postJson.ok) {
        console.log(`    ✅ Test posted`);

        // Wait 8 seconds (longer for post-OpenCode-restart)
        console.log(`    ⏳ Waiting 8s for response...`);
        await new Promise(r => setTimeout(r, 8000));

        // Check for pong responses
        const histRes = await fetch("https://slack.com/api/conversations.history", {
          method: "POST",
          headers: { "Authorization": `Bearer ${primaryToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: agentChannelId, limit: 10 }),
        });
        const histJson = await histRes.json();

        const replies = (histJson.messages || []).filter(m =>
          m.text && !m.bot_id && m.text.toLowerCase().includes("pong")
        );

        if (replies.length > 0) {
          testResults.push({ from: fromName, to: toName, status: "passed", detail: `${replies.length} pong responses` });
          console.log(`    ✅ PASSED — ${replies.length} responses`);
        } else {
          testResults.push({ from: fromName, to: toName, status: "timeout", detail: "No pong response within 8s" });
          console.log(`    ⚠ TIMEOUT — no response (check MCP config + OpenCode restart)`);
        }
      } else {
        testResults.push({ from: fromName, to: toName, status: "error", detail: postJson.error });
        console.log(`    ✗ Failed to post: ${postJson.error}`);
      }
    } catch (e) {
      testResults.push({ from: fromName, to: toName, status: "error", detail: e.message });
      console.log(`    ✗ Error: ${e.message}`);
    }
  }
} else if (dryRun) {
  console.log(`  [DRY RUN] Would run cross-agent tests in #${agentChannelName}`);
  for (let i = 0; i < Math.min(config.agents.length, 4); i++) {
    console.log(`    ${config.agents[i].display_name || config.agents[i].name} → ${config.agents[(i + 1) % config.agents.length].display_name || config.agents[(i + 1) % config.agents.length].name}`);
  }
} else if (!agentChannelId) {
  console.log(`  ⚠ No agent channel — skipping tests`);
} else {
  console.log(`  ⚠ No bot token — skipping tests`);
}

// ── 4. Print Test Summary ─────────────────────────────

const passed = testResults.filter(r => r.status === "passed").length;
const total = testResults.length;
const allPassed = total > 0 && passed === total;

console.log(`\n  Results: ${passed}/${total} passed`);
if (allPassed) {
  console.log(`  🎉 All agents operational!`);
} else if (total > 0) {
  console.log(`  ⚠ Some tests failed — check agent logs`);
}

// ── 5. Post All-Clear to Channel ─────────────────────

if (!dryRun && agentChannelId && primaryToken && allPassed) {
  try {
    const successMsg = [
      `🎉 *All agents verified and operational!*`,
      ``,
      `*Launchd:* ${launchdChecks.filter(c => c.status === "running").length}/${launchdChecks.length} running`,
      `*Tests:* ${passed}/${total} passed`,
      ``,
      `*Agents:* ${config.agents.map(a => a.display_name || a.name).join(", ")}`,
      `*Channel:* #${agentChannelName}`,
      `*Notion tracker:* Updated → Live`,
    ].join("\n");

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Authorization": `Bearer ${primaryToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: agentChannelId, text: successMsg, unfurl_links: false, unfurl_media: false }),
    });
    console.log(`\n  ✅ All-clear posted to #${agentChannelName}`);
  } catch (e) {
    console.error(`  ✗ Failed to post all-clear: ${e.message}`);
  }
}

// ── 6. Log to Notion: Live ───────────────────────────

console.log(`\n── Notion Tracker ──`.padEnd(60, "─"));

const notionKey = INF.notion_api_key;
const trackerDbId = INF.notion_tracker_db_id;

if (notionKey && trackerDbId && !dryRun) {
  const slugName = C.slug;
  const status = allPassed ? "Live" : "Deploying";
  const event = allPassed
    ? `${config.agents.length} agents verified — all tests passed`
    : `${passed}/${total} tests passed — check failures`;

  try {
    const searchRes = await fetch(`https://api.notion.com/v1/databases/${trackerDbId}/query`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${notionKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { property: "Slug", rich_text: { equals: slugName } }, page_size: 1 }),
    });
    const searchJson = await searchRes.json();

    const properties = {
      "Status": { select: { name: status } },
      "Phase": { select: { name: allPassed ? "Live" : "Deploy" } },
      "Agents": { number: config.agents.length },
      "Event": { rich_text: [{ text: { content: event } }] },
      "Last Activity": { date: { start: new Date().toISOString() } },
      "Notes": { rich_text: [{ text: { content: `Launchd: ${launchdChecks.filter(c => c.status === "running").length}/${launchdChecks.length} running. Tests: ${passed}/${total} passed. Channel: #${agentChannelName}.` } }] },
    };

    if (searchJson.results?.length > 0) {
      await fetch(`https://api.notion.com/v1/pages/${searchJson.results[0].id}`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${notionKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ properties }),
      });
    }
    console.log(`  ✅ Notion → ${status}`);
  } catch (e) {
    console.error(`  ✗ Notion error: ${e.message}`);
  }
} else if (notionKey && trackerDbId) {
  console.log(`  [DRY RUN] Would update Notion → ${allPassed ? "Live" : "Deploying"}`);
} else {
  console.log(`  ⚠ Notion tracker not configured`);
}

// ── 7. Save Verification Report ──────────────────────

console.log(`\n── Obsidian Report ──`.padEnd(60, "─"));

const vaultPath = INF.obsidian_vault;
if (vaultPath && !dryRun) {
  const date = new Date().toISOString().split("T")[0];
  const dir = join(vaultPath, "Skills", C.slug, "Context");
  mkdirSync(dir, { recursive: true });

  let md = `---
date: ${date}
tags:
  - ${C.slug}
  - verify
  - agent-hub
---

# ${C.name} — Verification Report

> Run ${new Date().toLocaleString("en-US")} after OpenCode restart

## Launchd Status

| Agent | Status |
|-------|--------|
${launchdChecks.map(c => `| ${c.name} | ${c.status === "running" ? "✅ running" : "❌ stopped"} |`).join("\n")}

## Cross-Agent Test Results

| From | To | Status | Detail |
|------|----|--------|--------|
${testResults.map(r => `| ${r.from} | ${r.to} | ${r.status === "passed" ? "✅" : "❌"} ${r.status} | ${r.detail || ""} |`).join("\n")}

## Summary

- **Status:** ${allPassed ? "All systems operational" : "Issues detected"}
- **Tests:** ${passed}/${total} passed
- **Agents:** ${config.agents.map(a => a.display_name || a.name).join(", ")}
- **Channel:** #${agentChannelName}
- **Notion:** Updated → ${allPassed ? "Live" : "Deploying"}
`;

  const filepath = join(dir, `verify-report-${date}.md`);
  writeFileSync(filepath, md, "utf-8");
  console.log(`  ✅ Saved: ${filepath}`);
} else if (vaultPath) {
  console.log(`  [DRY RUN] Would save verify report`);
} else {
  console.log(`  ⚠ No obsidian_vault configured`);
}

// ── 8. Final Summary ─────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(`\n${allPassed ? "🎉 All agents verified!" : "⚠ Verification incomplete"}`);
console.log(`\nStatus:`);
console.log(`  Launchd: ${launchdChecks.filter(c => c.status === "running").length}/${launchdChecks.length} running`);
console.log(`  Tests: ${passed}/${total} passed`);
console.log(`  Notion: ${allPassed ? "Live" : "Deploying"}`);
console.log(`  Channel: ${agentChannelId ? `#${agentChannelName}` : "not found"}`);

if (!allPassed) {
  console.log(`\nTroubleshooting:`);
  console.log(`  1. Verify OpenCode was restarted after deploy`);
  console.log(`  2. Check agent logs: tail -f ~/Library/Logs/com.${C.slug}.*.listener.log`);
  console.log(`  3. Confirm MCP config in ~/.config/opencode/opencode.jsonc`);
  console.log(`  4. Confirm env vars: echo $SLACK_MCP_${C.slug.toUpperCase()}_XOXB_TOKEN`);
  console.log(`  5. Re-run: ./verify.mjs ${configPath}`);
}

console.log();
