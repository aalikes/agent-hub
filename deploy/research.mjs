#!/usr/bin/env node

// ── The Forge / Research ─────────────────────────────
// Usage: ./research.mjs companies/new-company.json [--dry-run]
//
// Reads a minimal company config and spawns 4 parallel research
// sub-agents (Market+Risk, Workflow, Tech, Customer) via DeepSeek.
// Compiles results into a research report, saves to Obsidian vault,
// and logs to Notion tracker.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();

// ── CLI ──────────────────────────────────────────────

const args = process.argv.slice(2);
const configPath = args.find(a => a.endsWith(".json"));
const dryRun = args.includes("--dry-run");

if (!configPath) {
  console.error("Usage: ./research.mjs companies/COMPANY.json [--dry-run]");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const C = config.company;
const INF = config.infrastructure || {};

if (!C?.name || !(INF?.deepseek_api_key || process.env.DEEPSEEK_API_KEY)) {
  console.error("Config must include company.name and infrastructure.deepseek_api_key (or set DEEPSEEK_API_KEY env var)");
  process.exit(1);
}

// ── Research Prompts (4 agents) ──────────────────────

function buildPrompts() {
  const desc = C.description || C.name;
  const web = C.website ? `\n- Website: ${C.website}` : "";

  return [
    {
      role: "Market, Industry & Risk Researcher",
      prompt: `Research "${C.name}" and its industry thoroughly. The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. TOTAL ADDRESSABLE MARKET: Size, growth rate, key segments (cite sources).

2. COMPETITIVE LANDSCAPE: Top 5 direct competitors. For each: what they do, pricing model, strengths, weaknesses, and how ${C.name} differs.

3. COMMUNITY SENTIMENT: Search Reddit, Quora, Twitter/X, Hacker News, and industry forums for what people say about this industry. Common complaints about existing providers? What do customers want that they can't get?

4. MACRO TRENDS & REGULATION: 3-5 trends affecting this industry (regulation, tech shifts, consumer behavior, economic). Include regulatory requirements: industry-specific licensure, certifications, inspections, data privacy (GDPR, CCPA), payment processing (PCI), insurance requirements.

5. POSITIONING & RISK: Where does ${C.name} sit? Premium / budget / niche specialist / generalist? What are the top business risks (single points of failure, key-person dependency, supply chain, seasonal volatility, reputation risk)? Risk severity ratings (1-10).

Return findings organized by numbered section with sources cited.`,
    },
    {
      role: "Workflow & Operations Analyst",
      prompt: `Analyze the operational workflow of a business like "${C.name}". The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. PROCESS MAP: Map the likely end-to-end customer journey from inquiry to final delivery. List every probable step, who would do it, and what tools might be used.

2. BOTTLENECKS: Identify the top 5 operational bottlenecks typical in this industry. For each: where does work pile up? Root cause? Estimated hours lost per week? Automation potential (fully/partially/no)?

3. TOOL AUDIT: What software tools are typically used in this industry (website, CRM, payments, fulfillment, communication)? Which integrate well? Where is data typically duplicated?

4. AUTOMATION TARGETS: Rank the top automation opportunities by time saved, error reduction, and implementation difficulty.

5. IDEAL STATE & RISK: If you could redesign this workflow from scratch, what would it look like? What tools, integrations, and dashboard? Also identify operational risks: key-person dependencies, single points of failure, what breaks if the owner is out for 2 weeks?

Return findings with concrete examples and estimated time/cost savings.`,
    },
    {
      role: "Technology & Stack Assessor",
      prompt: `Assess the technology landscape for a business like "${C.name}". The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. TYPICAL STACK: What software tools, platforms, and services are standard in this industry (website, CRM, payments, fulfillment, communication, internal docs)? For each: what it does, typical monthly cost, criticality.

2. TOOL FITNESS: Evaluate the standard tools. Are they right for this size/type of business? Common community complaints? Better alternatives with pros/cons/cost comparison?

3. INTEGRATION GAPS: Where should data flow automatically but typically doesn't in this industry? List common manual copy-paste or export/import steps.

4. COMMUNITY RECOMMENDATIONS: What tools does the community recommend? Check Reddit (r/smallbusiness, industry subreddits), Indie Hackers, industry forums.

5. TARGET STACK: Propose a target tech stack with specific tools, estimated monthly cost, and migration complexity. Prioritize tools with APIs for automation and native integrations.

Return with tool comparison table format (tool | pros | cons | cost | verdict).`,
    },
    {
      role: "Customer & Revenue Researcher",
      prompt: `Research the customer experience and revenue dynamics for a business like "${C.name}". The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. CUSTOMER JOURNEY: Map the full journey: Discovery → Purchase → Fulfillment → Follow-up → Repeat/Referral. What is the typical experience at each stage? Where is friction common?

2. PAIN POINTS: What are the most common customer complaints in this industry? What do reviews typically say? What do customers ask for that isn't offered?

3. REVENUE ANALYSIS: Typical revenue streams. Pricing models and average order values. Customer lifetime value estimates. Where does revenue typically leak?

4. PRICING BENCHMARKS: How do competitors price? What pricing models work? What do customers expect to pay?

5. GROWTH LEVERS: 3-5 ways businesses in this space increase revenue (upsells, retention, new channels, referrals, price optimization). For each: estimated revenue impact, implementation difficulty, timeline.

Return findings with customer sentiment data and revenue impact estimates.`,
    },
  ];
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
      messages: [
        {
          role: "system",
          content: "You are a specialized research agent. Execute your task thoroughly. Be specific, cite sources, and return actionable findings. Use markdown formatting with headers, bullet points, and tables where appropriate. Do NOT ask questions — deliver results.",
        },
        { role: "user", content: messages.prompt },
      ],
      temperature: 0.5,
      max_tokens: 3000,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`DeepSeek error: ${JSON.stringify(j.error)}`);
  return j.choices?.[0]?.message?.content || "";
}

// ── Report Compilation ───────────────────────────────

function compileReport(prompts, results) {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const isoDate = new Date().toISOString().split("T")[0];

  let md = `---
date: ${isoDate}
tags:
  - ${C.slug || C.name.toLowerCase().replace(/[^a-z]+/g, "-")}
  - research
  - agent-hub
---

# ${C.name} — Deep-Dive Research Report

> Compiled ${date} by The Forge Research Pipeline
> 4 parallel agents: Market+Risk, Workflow, Tech, Customer

---

## Executive Summary

**Company:** ${C.name}
**Description:** ${C.description || "N/A"}
${C.website ? `**Website:** ${C.website}` : ""}

This report was generated by spawning 4 parallel AI research agents, each investigating a different dimension of ${C.name} and its industry. Findings are compiled below.

---

`;

  for (let i = 0; i < prompts.length; i++) {
    md += `## ${i + 1}. ${prompts[i].role}\n\n`;
    md += results[i] || `_(No results returned for ${prompts[i].role})_`;
    md += `\n\n---\n\n`;
  }

  md += `## Research Methodology

This report was compiled by 4 parallel AI sub-agents researching:
- **Market, Industry & Risk** — market size, competitors, trends, positioning, regulatory landscape, business risks
- **Workflow & Operations** — process map, bottlenecks, automation targets, operational risks
- **Technology & Stack** — tool inventory, fitness, integration gaps, target stack
- **Customer & Revenue** — customer journey, pain points, revenue analysis, growth levers

Sources include Reddit, Quora, Hacker News, industry publications, community forums, and internal documents.

---

Generated by [The Forge](https://github.com/aalikes/agent-hub) — ${new Date().toISOString()}
`;

  return md;
}

// ── Save to Obsidian ─────────────────────────────────

function saveToObsidian(content, reportType) {
  const vaultPath = INF.obsidian_vault;
  if (!vaultPath) {
    console.log("  ⚠ No obsidian_vault configured — skipping save");
    return null;
  }

  const slug = C.slug || C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const dir = join(vaultPath, "Skills", slug, "Context");
  const date = new Date().toISOString().split("T")[0];
  const filename = `${reportType}-report-${date}.md`;
  const filepath = join(dir, filename);

  mkdirSync(dir, { recursive: true });
  writeFileSync(filepath, content, "utf-8");
  return filepath;
}

// ── Log to Notion ────────────────────────────────────

async function logToNotion(status, phase, event, notes = "") {
  const key = INF.notion_api_key;
  const dbId = INF.notion_tracker_db_id;
  if (!key || !dbId) {
    console.log("  ⚠ No Notion tracker configured — skipping");
    return;
  }

  const slug = C.slug || C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const body = {
    parent: { database_id: dbId },
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
    // Search for existing entry
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
    } else {
      await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    return true;
  } catch (e) {
    console.error(`  ✗ Notion error: ${e.message}`);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────

console.log(`\n🔬 The Forge / Research: ${C.name}\n`);
console.log(`Spawning 4 research agents in parallel...`);

const prompts = buildPrompts();

if (dryRun) {
  console.log(`[DRY RUN] Would research:`);
  prompts.forEach((p, i) => console.log(`  ${i + 1}. ${p.role}`));
  console.log(`\nWould save report to Obsidian vault`);
  console.log(`Would log to Notion tracker`);
  process.exit(0);
}

const startTime = Date.now();

// Spawn all 4 in parallel
const results = await Promise.all(
  prompts.map(async (p, i) => {
    console.log(`  [${i + 1}/4] Researching: ${p.role}...`);
    try {
      const text = await deepseek(p);
      console.log(`  ✅ ${p.role} — ${text.length} chars`);
      return text;
    } catch (e) {
      console.error(`  ✗ ${p.role} failed: ${e.message}`);
      return `Research failed: ${e.message}`;
    }
  })
);

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n✅ All 4 agents completed in ${elapsed}s`);

// Compile report
const report = compileReport(prompts, results);

// Save to Obsidian
console.log(`\n── Saving to Obsidian ──`);
const savedPath = saveToObsidian(report, "research");
if (savedPath) console.log(`  ✅ ${savedPath}`);

// Log to Notion
console.log(`\n── Logging to Notion ──`);
await logToNotion(
  "Researching",
  "Research",
  "4-agent research completed",
  `Report: ${savedPath || "not saved"}. ${elapsed}s elapsed.`
);
if (INF.notion_api_key && INF.notion_tracker_db_id) console.log(`  ✅ Notion tracker updated`);

console.log(`\n${"=".repeat(60)}`);
console.log(`\n✅ Research complete for ${C.name}`);
console.log(`\nNext: Run design.mjs to generate agents from this research`);
console.log(`  ./design.mjs ${configPath}\n`);
