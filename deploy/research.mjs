#!/usr/bin/env node

// ── The Forge / Research ─────────────────────────────
// Usage: ./research.mjs companies/new-company.json [--dry-run] [--deep]
//
// Default: 4 parallel agents (quick research, ~30s)
// --deep:  8 parallel agents (comprehensive deep-dive, ~90s)
//
// Reads a company config and spawns research sub-agents via DeepSeek.
// Compiles results into a report, saves to Obsidian, logs to Notion.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();

// ── CLI ──────────────────────────────────────────────

const args = process.argv.slice(2);
const configPath = args.find(a => a.endsWith(".json"));
const dryRun = args.includes("--dry-run");
const deepMode = args.includes("--deep");

if (!configPath) {
  console.error("Usage: ./research.mjs companies/COMPANY.json [--dry-run] [--deep]");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const C = config.company;
const INF = config.infrastructure || {};

if (!C?.name || !(INF?.deepseek_api_key || process.env.DEEPSEEK_API_KEY)) {
  console.error("Config must include company.name and infrastructure.deepseek_api_key (or set DEEPSEEK_API_KEY env var)");
  process.exit(1);
}

const agentCount = deepMode ? 8 : 4;
const modeLabel = deepMode ? "Deep" : "Standard";

// ── Research Prompts ─────────────────────────────────

function buildStandardPrompts() {
  const desc = C.description || C.name;
  const web = C.website ? `\n- Website: ${C.website}` : "";

  return [
    {
      role: "Market, Industry & Risk Researcher",
      prompt: `Research "${C.name}" and its industry thoroughly. The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. TOTAL ADDRESSABLE MARKET: Size, growth rate, key segments (cite sources).

2. COMPETITIVE LANDSCAPE: Top 5 direct competitors. For each: what they do, pricing model, strengths, weaknesses, and how ${C.name} differs.

3. COMMUNITY SENTIMENT: Search Reddit, Quora, Twitter/X, Hacker News, and industry forums for what people say about this industry. Common complaints? What do customers want that they can't get?

4. MACRO TRENDS & REGULATION: 3-5 trends affecting this industry (regulation, tech shifts, consumer behavior, economic). Include regulatory requirements: licensure, certifications, data privacy (GDPR/CCPA), payment processing (PCI), insurance requirements.

5. POSITIONING & RISK: Where does ${C.name} sit? Premium / budget / niche specialist? Top business risks (single points of failure, key-person dependency, supply chain, seasonal volatility, reputation risk). Risk severity ratings (1-10).

Return findings organized by numbered section with sources cited.`,
    },
    {
      role: "Workflow & Operations Analyst",
      prompt: `Analyze the operational workflow of a business like "${C.name}". The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. PROCESS MAP: Map the likely end-to-end customer journey from inquiry to delivery. Every step, who does it, what tools.

2. BOTTLENECKS: Top 5 operational bottlenecks typical in this industry. Root cause? Hours lost per week? Automation potential?

3. TOOL AUDIT: What software tools are typically used (website, CRM, payments, fulfillment, communication)? Which integrate? Where is data duplicated?

4. AUTOMATION TARGETS: Rank opportunities by time saved, error reduction, implementation difficulty.

5. IDEAL STATE & RISK: Redesigned workflow. What tools, integrations, dashboard? Operational risks: key-person dependencies, what breaks if the owner is out for 2 weeks?

Return with concrete examples and estimated time/cost savings.`,
    },
    {
      role: "Technology & Stack Assessor",
      prompt: `Assess the technology landscape for a business like "${C.name}". The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. TYPICAL STACK: What software tools are standard (website, CRM, payments, fulfillment, communication, docs)? Cost, criticality.

2. TOOL FITNESS: Evaluate standard tools. Right for this size/type? Common complaints? Better alternatives with pros/cons/cost?

3. INTEGRATION GAPS: Where should data flow automatically but doesn't? Manual copy-paste steps.

4. COMMUNITY RECOMMENDATIONS: What tools does the community recommend? Reddit (r/smallbusiness, industry subreddits), Indie Hackers, industry forums.

5. TARGET STACK: Propose specific tools, estimated monthly cost, migration complexity. Prioritize tools with APIs.

Return with tool comparison table (tool | pros | cons | cost | verdict).`,
    },
    {
      role: "Customer & Revenue Researcher",
      prompt: `Research customer experience and revenue for a business like "${C.name}". The company is described as: "${desc}".${web}

Deliver a structured report covering:

1. CUSTOMER JOURNEY: Discovery → Purchase → Fulfillment → Follow-up → Repeat/Referral. Friction at each stage?

2. PAIN POINTS: Common customer complaints? What do reviews say? What do customers ask for that isn't offered?

3. REVENUE ANALYSIS: Typical revenue streams. Pricing models. Average order values. Customer lifetime value. Where does revenue leak?

4. PRICING BENCHMARKS: How do competitors price? What models work? What do customers expect to pay?

5. GROWTH LEVERS: 3-5 ways to increase revenue (upsells, retention, new channels, referrals, price optimization). Revenue impact, difficulty, timeline.

Return with customer sentiment data and revenue impact estimates.`,
    },
  ];
}

function buildDeepPrompts() {
  const desc = C.description || C.name;
  const web = C.website ? `\n- Website: ${C.website}` : "";

  return [
    {
      role: "Market Analysis & Competitive Landscape",
      prompt: `Conduct a comprehensive market analysis for "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. TOTAL ADDRESSABLE MARKET: Calculate TAM, SAM, SOM with methodology. Growth rate (CAGR) with citations. Break into sub-segments with individual sizing.

2. MARKET TRENDS: 5+ macro trends (economic, technological, social, regulatory). For each: direction, velocity, impact on ${C.name} (scored 1-10).

3. COMPETITIVE LANDSCAPE: Map 8-10 competitors across direct, indirect, and potential. For each: founding year, funding/scale, pricing, market share estimate, key strengths, critical weaknesses, and ${C.name}'s specific advantage or vulnerability compared to each.

4. BARRIERS TO ENTRY: What protects incumbents? What would it cost a new entrant to compete?

5. POSITIONING MAP: Plot ${C.name} on 2-3 axes (price vs quality, niche vs broad, tech-forward vs traditional). Include a positioning statement.

6. SWOT ANALYSIS: Strengths, Weaknesses, Opportunities, Threats specific to ${C.name}.

Return with tables, citations, and data sources for all claims.`,
    },
    {
      role: "Demographics & Cultural Trends Analyst",
      prompt: `Research the demographics and cultural dynamics relevant to "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. TARGET DEMOGRAPHICS: Primary, secondary, and tertiary audience segments. For each: population size, geographic distribution, age range, income brackets, education levels, language preferences.

2. CULTURAL TRENDS: 5+ cultural trends shaping this community (identity expression, language preservation, generational shifts, media consumption, diaspora engagement). How does each trend create opportunity or risk?

3. BEHAVIORAL INSIGHTS: How does this audience discover services? What builds trust? What triggers purchasing decisions? Community engagement patterns.

4. MIGRATION & DIASPORA PATTERNS: Where are populations growing? Where declining? Remittance patterns, travel patterns.

5. LANGUAGE & COMMUNICATION: Primary languages, preferred communication channels, cultural nuances in messaging.

6. COMPETITIVE COMPARISON: How do competitors serve (or fail to serve) these demographics? Unmet needs quantified.

Return with demographic data tables, citations from census/World Bank/Pew, and actionable insights.`,
    },
    {
      role: "Regulatory, Legal & Compliance Analyst",
      prompt: `Conduct a thorough regulatory and compliance analysis for "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. REGULATORY LANDSCAPE: Map ALL applicable regulations across jurisdictions:
   - Data privacy: GDPR (EU users), CCPA/CPRA (California), state-level laws
   - Healthcare: HIPAA (if handling PHI), telemedicine regulations, FTC Health Breach Notification Rule
   - Payments: PCI DSS, state money transmitter laws
   - Education: State authorization for online courses, accreditation requirements
   - Employment: Contractor vs employee classification, labor laws
   - Advertising: FTC endorsement guidelines, CAN-SPAM, sponsored content disclosure

2. LEGAL STRUCTURE: Optimal entity type (LLC, 501(c)(3), B-Corp). Tax implications of sponsorships vs donations.

3. INSURANCE REQUIREMENTS: General liability, professional liability (E&O), cyber insurance, D&O. Recommended coverage amounts.

4. INTELLECTUAL PROPERTY: Trademark strategy, copyright for course content, trade secrets.

5. COMMUNITY RISKS: Common lawsuits in this space. What do similar platforms get sued for? Regulatory enforcement actions.

6. COMPLIANCE ROADMAP: Prioritized timeline with estimated costs for each requirement.

Return with specific statutes cited, penalty amounts, and a risk heat map.`,
    },
    {
      role: "Workflow & Operations Deep-Dive Analyst",
      prompt: `Conduct a deep operational analysis for "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. END-TO-END PROCESS MAPS: For each major business stream (directory listings, courses/academy, sponsorships, healthcare referrals, podcast, fashion e-commerce), map the full process from customer acquisition to fulfillment. Include swimlane diagrams showing who does what.

2. BOTTLENECK ANALYSIS: For each stream, identify the top 3 bottlenecks with:
   - Root cause analysis (5 Whys)
   - Current time/cost impact
   - Automation feasibility (technical + economic)
   - Proposed solution with implementation difficulty

3. RESOURCE REQUIREMENTS: Staff, tools, and budget needed for each stream at current scale and 3x scale.

4. KPIs & METRICS: Define operational KPIs for each stream (throughput, cycle time, error rate, CSAT, cost per unit).

5. SCALING ROADMAP: What breaks first at 2x, 5x, 10x volume? Sequencing of operational improvements.

6. RISK ASSESSMENT: Single points of failure, key-person dependencies, vendor lock-in risks.

Return with process diagrams (text-based), metrics tables, and prioritized actions.`,
    },
    {
      role: "Technology Stack & Platform Architect",
      prompt: `Conduct a comprehensive technology assessment for "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. CURRENT STACK AUDIT: Catalog every technology component in use or needed:
   - Frontend (website CMS, themes, plugins)
   - Backend (hosting, databases, APIs)
   - Payment processing (Stripe, PayPal, etc.)
   - CRM & Marketing (email, automation, analytics)
   - Communication (Slack, email, SMS)
   - Content Management (blog, podcast hosting, video)
   - E-commerce (fashion store)
   - Learning Management (Academy courses)

2. TOOL EVALUATION: For each component, evaluate:
   - Current tool fitness (1-10)
   - Community satisfaction (Reddit, G2, Capterra)
   - Top 3 alternatives with comparison table
   - Migration complexity and cost

3. INTEGRATION ARCHITECTURE: Map data flows between systems. Identify:
   - Native integrations available
   - Custom integration needs (Zapier, Make, custom API)
   - Single source of truth for each data type

4. AI AUTOMATION OPPORTUNITIES: Where can AI/AI agents add value?
   - Customer support automation
   - Content generation and scheduling
   - Lead qualification and routing
   - Financial monitoring and alerting

5. TARGET ARCHITECTURE: Proposed tech stack with justification, monthly cost estimate, migration plan with phases.

6. SECURITY POSTURE: SSL, authentication, data encryption, backup strategy, disaster recovery.

Return with architecture diagrams (ASCII), cost comparison tables, and implementation timeline.`,
    },
    {
      role: "Revenue Model & Monetization Strategist",
      prompt: `Conduct a detailed revenue and monetization analysis for "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. REVENUE STREAM ANALYSIS: For each current and potential stream, analyze:
   - Directory listings: pricing tiers, volume projections, churn rate
   - Academy courses: course pricing, enrollment projections, instructor costs
   - Sponsorships: tier structure effectiveness, conversion rates, retention
   - Healthcare: referral fees, partnership models, regulatory constraints
   - Podcast: monetization options (ads, sponsorships, premium content)
   - Fashion e-commerce: margins, inventory models, fulfillment costs

2. UNIT ECONOMICS: Calculate for each stream and blended:
   - Customer Acquisition Cost (CAC)
   - Lifetime Value (LTV)
   - LTV:CAC ratio
   - Gross margin
   - Payback period

3. PRICING STRATEGY: Benchmark against competitors. Price sensitivity analysis. Recommended pricing changes with projected revenue impact.

4. MONETIZATION OPPORTUNITIES: 5+ new revenue opportunities with:
   - Revenue potential (low/medium/high)
   - Implementation effort
   - Time to first revenue
   - Risk level

5. FINANCIAL PROJECTIONS: 12-month revenue forecast by stream. Break-even analysis.

6. PAYMENT INFRASTRUCTURE: Recommended payment stack, fee optimization, international payment handling.

Return with financial tables, pricing comparisons, and prioritized revenue roadmap.`,
    },
    {
      role: "Customer Experience & Community Insights Researcher",
      prompt: `Conduct deep customer and community research for "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. CUSTOMER JOURNEY MAPS: For each persona (directory lister, course student, sponsor, healthcare seeker, fashion buyer, podcast listener), map the full journey with emotions, pain points, and moments of truth.

2. VOICE OF CUSTOMER: Aggregate insights from:
   - Reddit (r/Haiti, r/Diaspora, r/Entrepreneur, r/BlackFellas)
   - Quora (Haitian diaspora topics)
   - Twitter/X (hashtags, conversations)
   - Facebook groups (Haitian community groups)
   - App Store/Google Play reviews (similar platforms)
   - Trustpilot/BBB (competitor reviews)

3. PAIN POINT PRIORITIZATION: Rank top 10 customer pain points by frequency, severity, and business impact.

4. FEATURE REQUESTS: What do customers ask for most? Prioritize by demand and feasibility.

5. COMMUNITY SENTIMENT ANALYSIS: Overall sentiment (positive/neutral/negative) with trend lines. Key sentiment drivers.

6. RETENTION & CHURN: Analyze churn patterns. What causes customers to leave? What increases retention?

7. COMPETITOR CUSTOMER FEEDBACK: What do customers love/hate about competitors? What can ${C.name} learn?

Return with journey maps (text-based), sentiment data, and prioritized feature backlog.`,
    },
    {
      role: "Content & Media Strategy Analyst",
      prompt: `Conduct a content and media strategy analysis for "${C.name}". The company is described as: "${desc}".${web}

Deliver a detailed report covering:

1. CONTENT AUDIT: Assess each content channel:
   - Blog: Topics, frequency, SEO performance, engagement
   - Podcast: Format, guests, distribution, download metrics
   - Social Media: Platforms, posting cadence, engagement rates
   - Newsletter: Open rates, click rates, subscriber growth
   - Fashion Brand: Product-market fit, design direction, sales channels

2. CONTENT GAP ANALYSIS: What content is missing that the audience wants? Topic clusters with SEO opportunity.

3. DISTRIBUTION STRATEGY: Optimal channels for each content type. Cross-posting strategy. Repurposing workflow.

4. SPONSORSHIP & PARTNERSHIP: Pricing structure analysis. Partner acquisition strategy. Value proposition for sponsors. Competitor sponsorship models.

5. BRAND VOICE & POSITIONING: Current vs ideal brand perception. Messaging framework. Content pillars.

6. GROWTH STRATEGY: Organic (SEO, social, community) and paid acquisition channels. Influencer/ambassador strategy.

7. COMPETITIVE CONTENT ANALYSIS: What content works for competitors? What gaps can ${C.name} fill?

Return with content calendar template, partnership pipeline, and growth projections.`,
    },
  ];
}

function buildPrompts() {
  return deepMode ? buildDeepPrompts() : buildStandardPrompts();
}

// ── DeepSeek API ─────────────────────────────────────

const API_KEY = INF.deepseek_api_key || process.env.DEEPSEEK_API_KEY;

async function deepseek(messages) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
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

# ${C.name} — ${modeLabel} Research Report

> Compiled ${date} by The Forge Research Pipeline
> ${agentCount} parallel agents

---

## Executive Summary

**Company:** ${C.name}
**Description:** ${C.description || "N/A"}
${C.website ? `**Website:** ${C.website}` : ""}

This report was generated by spawning ${agentCount} parallel AI research agents in ${modeLabel.toLowerCase()} mode, each investigating a different dimension of ${C.name} and its industry. Findings are compiled below.

---

`;

  for (let i = 0; i < prompts.length; i++) {
    md += `## ${i + 1}. ${prompts[i].role}\n\n`;
    md += results[i] || `_(No results returned for ${prompts[i].role})_`;
    md += `\n\n---\n\n`;
  }

  md += `## Research Methodology

This report was compiled by ${agentCount} parallel AI sub-agents in ${modeLabel.toLowerCase()} mode researching:

`;

  if (deepMode) {
    md += `- **Market Analysis & Competitive Landscape** — TAM, SAM, SOM, competitor mapping, SWOT
- **Demographics & Cultural Trends** — Audience segments, behavioral insights, language preferences
- **Regulatory, Legal & Compliance** — GDPR/CCPA, HIPAA, PCI, insurance, legal structure
- **Workflow & Operations** — Process maps, bottleneck analysis, KPIs, scaling roadmap
- **Technology Stack & Platform Architecture** — Tool audit, integration architecture, AI opportunities
- **Revenue Model & Monetization** — Unit economics, pricing strategy, financial projections
- **Customer Experience & Community** — Journey maps, voice of customer, retention analysis
- **Content & Media Strategy** — Content audit, distribution strategy, sponsorship models

`;
  } else {
    md += `- **Market, Industry & Risk** — market size, competitors, trends, positioning, regulatory
- **Workflow & Operations** — process map, bottlenecks, automation targets
- **Technology & Stack** — tool inventory, fitness, integration gaps, target stack
- **Customer & Revenue** — customer journey, pain points, revenue analysis, growth levers

`;
  }

  md += `Sources include Reddit, Quora, Hacker News, industry publications, community forums, and internal documents.

---

Generated by [The Forge](https://github.com/aalikes/agent-hub) — ${new Date().toISOString()}
`;

  return md;
}

// ── Save to Obsidian ─────────────────────────────────

function saveToObsidian(content, reportType) {
  const vaultPath = INF.obsidian_vault;
  if (!vaultPath) { console.log("  ⚠ No obsidian_vault configured — skipping save"); return null; }
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
  if (!key || !dbId) { console.log("  ⚠ No Notion tracker configured — skipping"); return; }
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
  } catch (e) { console.error(`  ✗ Notion error: ${e.message}`); return false; }
}

// ── Main ─────────────────────────────────────────────

console.log(`\n🔬 The Forge / Research: ${C.name}`);
console.log(`Mode: ${modeLabel} (${agentCount} agents)\n`);

const prompts = buildPrompts();
console.log(`Spawning ${agentCount} research agents in parallel...`);

if (dryRun) {
  console.log(`[DRY RUN] Would research:`);
  prompts.forEach((p, i) => console.log(`  ${i + 1}. ${p.role}`));
  console.log(`\nWould save report to Obsidian vault`);
  console.log(`Would log to Notion tracker`);
  process.exit(0);
}

const startTime = Date.now();

const results = await Promise.all(
  prompts.map(async (p, i) => {
    console.log(`  [${i + 1}/${agentCount}] Researching: ${p.role}...`);
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
console.log(`\n✅ All ${agentCount} agents completed in ${elapsed}s`);

const report = compileReport(prompts, results);

console.log(`\n── Saving to Obsidian ──`);
const savedPath = saveToObsidian(report, "research");
if (savedPath) console.log(`  ✅ ${savedPath}`);

console.log(`\n── Logging to Notion ──`);
await logToNotion("Researching", "Research", `${agentCount}-agent ${modeLabel.toLowerCase()} research completed`, `Report: ${savedPath || "not saved"}. ${elapsed}s elapsed.`);
if (INF.notion_api_key && INF.notion_tracker_db_id) console.log(`  ✅ Notion tracker updated`);

console.log(`\n${"=".repeat(60)}`);
console.log(`\n✅ ${modeLabel} research complete for ${C.name}`);
console.log(`\nNext: Run design.mjs to generate agents from this research`);
console.log(`  ./design.mjs ${configPath}\n`);
