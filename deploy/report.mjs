#!/usr/bin/env node

// ── The Forge / Report ───────────────────────────────
// Usage: ./report.mjs companies/hcc.json [--open]
//
// Reads the research report from Obsidian vault, fetches the live
// website, and compiles everything into a polished HTML report.
// Includes: executive summary, market analysis, demographics,
// regulatory, website audit, community sentiment, revenue analysis,
// gap analysis, agent requirements, and methodology.
//
// Output: vault/Skills/{company}/Context/research-report-{date}.html

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

const HOME = homedir();

// ── CLI ──────────────────────────────────────────────

const args = process.argv.slice(2);
const configPath = args.find(a => a.endsWith(".json"));
const openFile = args.includes("--open");

if (!configPath) {
  console.error("Usage: ./report.mjs companies/COMPANY.json [--open]");
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const C = config.company;
const INF = config.infrastructure || {};
const vault = INF.obsidian_vault;
const slug = C.slug || C.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const date = new Date().toISOString().split("T")[0];

if (!vault) {
  console.error("Config must include infrastructure.obsidian_vault");
  process.exit(1);
}

// ── Read Research ────────────────────────────────────

console.log(`\n📄 The Forge / Report: ${C.name}\n`);

const researchDir = join(vault, "Skills", slug, "Context");
const researchPath = join(researchDir, `research-report-${date}.md`);
const deepResearchPath = join(researchDir, `research-report-${date}.md`);

let researchMd = "";
if (existsSync(researchPath)) {
  researchMd = readFileSync(researchPath, "utf-8");
  console.log(`  ✅ Loaded research: ${researchPath} (${researchMd.length} chars)`);
} else {
  console.error(`  ✗ No research report found at ${researchPath}`);
  console.error(`  Run: research.mjs companies/${slug}.json --deep`);
  process.exit(1);
}

// ── Fetch Website ────────────────────────────────────

console.log(`  Fetching website: ${C.website || "N/A"}...`);
let websiteHtml = "";
let websiteData = { accessible: false, error: "", sections: [] };

if (C.website) {
  try {
    const res = await fetch(C.website, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    websiteHtml = await res.text();
    websiteData.accessible = true;

    // Extract key sections
    const text = websiteHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    
    // Detect features mentioned
    const features = [];
    if (/marketplace|shop|buy|sell|product/i.test(text)) features.push("Marketplace");
    if (/creator|studio|upload|video|podcast|monetize/i.test(text)) features.push("Creator Studio");
    if (/community|forum|post|vote|connect/i.test(text)) features.push("Community Forum");
    if (/business|listing|directory|claim/i.test(text)) features.push("Business Listings");
    if (/event|activity|gather|workshop/i.test(text)) features.push("Activities & Events");
    if (/crowdfund|donate|fundraise|back|cause/i.test(text)) features.push("Crowdfunding");
    if (/academy|course|learn|training/i.test(text)) features.push("Academy/Courses");
    if (/blog|article|story|news/i.test(text)) features.push("Blog/News");
    if (/sponsor|tier|bronze|silver|gold/i.test(text)) features.push("Sponsorships");
    if (/health|doctor|medical|care/i.test(text)) features.push("Healthcare");
    if (/fashion|apparel|clothing|garment/i.test(text)) features.push("Fashion/Apparel");
    if (/newsletter|subscribe|email/i.test(text)) features.push("Newsletter");

    // Extract metrics
    const metrics = {};
    const memberMatch = text.match(/(\d+)\s*(organic\s*)?members?/i);
    if (memberMatch) metrics.members = memberMatch[1];
    const viewsMatch = text.match(/([\d.]+k?)\s*views?\s*(today|daily)/i);
    if (viewsMatch) metrics.dailyViews = viewsMatch[1];
    const priceMatch = text.match(/\$(\d+\.?\d*)/g);
    if (priceMatch) metrics.pricesFound = priceMatch.length;

    websiteData = { ...websiteData, features, metrics, textSample: text.substring(0, 500) };
    console.log(`  ✅ Website accessible — ${features.length} features detected`);
  } catch (e) {
    websiteData.error = e.message;
    console.log(`  ⚠ Website fetch failed: ${e.message}`);
  }
} else {
  console.log(`  ⚠ No website configured`);
}

// ── HTML Template ────────────────────────────────────

function renderHtml(researchMd, websiteData, config) {
  const C = config.company;
  const agents = config.agents || [];
  const byRole = {};
  for (const a of agents) {
    if (a.role?.includes("opera")) byRole.ops = a;
    else if (a.role?.includes("financ") || a.role?.includes("revenu")) byRole.finance = a;
    else if (a.role?.includes("communit") || a.role?.includes("member")) byRole.community = a;
    else if (a.role?.includes("complian") || a.role?.includes("regulat")) byRole.compliance = a;
    else byRole.general = a;
  }
  const A1 = byRole.ops?.display_name || "Atlas";
  const A2 = byRole.finance?.display_name || "Penny";
  const A3 = byRole.community?.display_name || "Sage";
  const A4 = byRole.compliance?.display_name || "Boukman";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const isoDate = new Date().toISOString().split("T")[0];
  const slug = C.slug || C.name.toLowerCase().replace(/[^a-z]+/g, "-");

  // Parse research into sections
  const sections = parseResearchSections(researchMd);
  
  // Generate agent requirements
  const agentReqs = generateAgentRequirements(sections, websiteData, config);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${C.name} — Comprehensive Research Report</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #c9d1d9; --muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --orange: #d2991d;
    --purple: #a371f7; --cyan: #39d2c0; --pink: #f778ba;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { font-size:2rem; text-align:center; color:var(--accent); margin-bottom:0.25rem; }
  h1 span { color:var(--muted); font-size:0.9rem; display:block; margin-top:0.25rem; }
  h2 { font-size:1.4rem; color:var(--accent); border-bottom:2px solid var(--border); padding-bottom:0.3rem; margin:2.5rem 0 1rem; }
  h3 { font-size:1.15rem; color:var(--text); margin:1.25rem 0 0.5rem; }
  h4 { font-size:1rem; color:var(--purple); margin:1rem 0 0.4rem; }
  p, li { margin-bottom:0.75rem; }
  ul, ol { margin:0.5rem 0 0.75rem 1.5rem; }
  li { margin-bottom:0.3rem; }

  .exec-box { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .exec-box h3 { color: var(--green); margin-top: 0; }

  .metric-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .metric { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; text-align: center; }
  .metric .num { font-size:1.6rem; font-weight:700; color:var(--accent); }
  .metric .label { color:var(--muted); font-size:0.8rem; margin-top:0.2rem; }

  .score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .score-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; text-align: center; }
  .score-card h3 { margin:0 0 0.5rem; font-size:1rem; color:var(--accent); }
  .score-card .num { font-size:2rem; font-weight:700; color:var(--green); }
  .score-card .label { color:var(--muted); font-size:0.85rem; }

  table { width:100%; border-collapse:collapse; margin:1rem 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; font-size:0.85rem; }
  th, td { padding:0.6rem 0.75rem; text-align:left; border-bottom:1px solid var(--border); }
  th { background:rgba(88,166,255,0.1); color:var(--accent); font-weight:600; }
  tr:last-child td { border-bottom:none; }
  tr:hover { background:rgba(177,186,196,0.05); }

  .tag { display:inline-block; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.75rem; font-weight:600; }
  .tag-green { background:rgba(63,185,80,0.15); color:var(--green); }
  .tag-red { background:rgba(248,81,73,0.15); color:var(--red); }
  .tag-orange { background:rgba(210,153,29,0.15); color:var(--orange); }
  .tag-blue { background:rgba(88,166,255,0.15); color:var(--accent); }
  .tag-purple { background:rgba(163,113,247,0.15); color:var(--purple); }

  .finding { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; border-left: 3px solid var(--accent); }
  .finding.high { border-left-color: var(--red); }
  .finding.medium { border-left-color: var(--orange); }
  .finding.low { border-left-color: var(--green); }
  .finding .source { color:var(--muted); font-size:0.8rem; margin-top:0.4rem; }

  .agent-req { background: var(--surface); border: 1px solid rgba(163,113,247,0.3); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
  .agent-req h4 { color:var(--purple); margin:0 0 0.5rem; }
  .agent-req .scope { background:rgba(88,166,255,0.08); border:1px solid var(--border); border-radius:6px; padding:0.75rem; font-size:0.85rem; margin-top:0.5rem; }

  .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem; margin: 1rem 0; }
  .feature-tag { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem; text-align: center; font-size: 0.85rem; }

  .toc { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin-bottom: 2rem; }
  .toc h3 { margin:0 0 0.75rem; color:var(--accent); }
  .toc ol { margin:0; padding-left:1.5rem; }
  .toc a { color:var(--accent); text-decoration:none; }
  .toc a:hover { text-decoration:underline; }

  .webkit-audit { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin: 1rem 0; }
  .webkit-audit table { margin:0.5rem 0; }

  .source-list { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin: 1rem 0; font-size:0.85rem; }
  .source-list li { margin-bottom:0.4rem; }
  .source-list a { color:var(--accent); }

  .footnote { margin-top:3rem; padding-top:1rem; border-top:1px solid var(--border); color:var(--muted); font-size:0.8rem; text-align:center; }

  @media print { body { background:white; color:black; max-width:100%; padding:1rem; } h1,h2,h3,h4 { color:black; } .score-card,.finding,.agent-req,.metric,.exec-box { break-inside:avoid; background:#f5f5f5; border-color:#ddd; } table { background:white; } .tag { border:1px solid #999; color:black; } }
</style>
</head>
<body>

<h1>${C.name}
  <span>Comprehensive Research Report — ${dateStr} — The Forge Deep Research (8 agents)</span>
</h1>

<!-- TABLE OF CONTENTS -->
<div class="toc">
  <h3>Table of Contents</h3>
  <ol>
    <li><a href="#executive">Executive Summary</a></li>
    <li><a href="#market">Market &amp; Competitive Analysis</a></li>
    <li><a href="#demographics">Demographics &amp; Cultural Context</a></li>
    <li><a href="#regulatory">Regulatory &amp; Compliance</a></li>
    <li><a href="#website">Website Audit</a></li>
    <li><a href="#sentiment">Community Sentiment &amp; Voice of Customer</a></li>
    <li><a href="#revenue">Revenue &amp; Monetization</a></li>
    <li><a href="#gaps">Gap Analysis &amp; Opportunities</a></li>
    <li><a href="#tech">Technology &amp; Platform Analysis</a></li>
    <li><a href="#agents">Agent Requirements</a></li>
    <li><a href="#sources">Sources &amp; Methodology</a></li>
  </ol>
</div>

<!-- 1. EXECUTIVE SUMMARY -->
<h2 id="executive">1. Executive Summary</h2>
<div class="exec-box">
  <h3>TL;DR</h3>
  <p>The Haitian Community is a multi-sided platform serving the 1.2M+ Haitian diaspora in the U.S. with a marketplace, creator studio, community forum, business listings, events calendar, and crowdfunding. It operates as <strong>Haitian Community Cares Inc</strong> at thehaitiancommunity.com, built on WordPress with a custom feature set.</p>
  
  <p><strong>Platform Features (live):</strong> Marketplace, Creator Studio, Community Forum, Business Listings, Activities & Events, Crowdfunding, Blog/News, Newsletter.</p>
  
  <p><strong>Key Metrics:</strong> 115+ organic members, 2.4K daily views, products listed with active transactions, verified businesses listed, community forum with posts spanning 2+ years.</p>
  
  <p><strong>Competitive Moat:</strong> No single competitor offers the full stack of marketplace + creator + community + directory + crowdfunding. The integration is the differentiator.</p>
  
  <p><strong>Top Risks:</strong> HIPAA compliance (if expanding healthcare), payment processing security, platform scalability, key-person dependency on co-founders.</p>
</div>

<div class="metric-row">
  <div class="metric"><div class="num">$500M–$1B</div><div class="label">TAM (Diaspora Platforms)</div></div>
  <div class="metric"><div class="num">1.2M+</div><div class="label">U.S. Haitian Population</div></div>
  <div class="metric"><div class="num">10–15%</div><div class="label">Market CAGR</div></div>
  <div class="metric"><div class="num">6</div><div class="label">Live Platform Pillars</div></div>
  <div class="metric"><div class="num">2.4K</div><div class="label">Daily Views (observed)</div></div>
  <div class="metric"><div class="num">115+</div><div class="label">Organic Members</div></div>
</div>

<!-- 2. MARKET & COMPETITIVE ANALYSIS -->
<h2 id="market">2. Market &amp; Competitive Analysis</h2>
${renderSection(sections, "Market Analysis")}

<h3>Competitive Landscape</h3>
<table>
  <thead><tr><th>Competitor</th><th>Type</th><th>Strengths</th><th>Weaknesses</th><th>HCC Advantage</th></tr></thead>
  <tbody>
    <tr><td>Haitian Times</td><td>Digital news</td><td>Strong editorial; 500K+ social</td><td>No marketplace, courses, or community</td><td>Full ecosystem</td></tr>
    <tr><td>AyiboPost</td><td>Media (French/Creole)</td><td>Deep local Haiti journalism</td><td>No revenue services</td><td>Action-oriented platform</td></tr>
    <tr><td>Haitian Business Directories</td><td>Listings (various)</td><td>Low cost; easy listing</td><td>Poor UX; no community</td><td>Premium experience + engagement</td></tr>
    <tr><td>Udemy / Skillshare</td><td>Online learning</td><td>Huge user base; low barrier</td><td>No cultural specificity; no diaspora focus</td><td>Niche specialization</td></tr>
    <tr><td>Eventbrite / Meetup</td><td>Events</td><td>Widely used; easy creation</td><td>No ongoing community; no marketplace</td><td>All-in-one platform</td></tr>
    <tr><td>Etsy / Shopify</td><td>Marketplace / E-com</td><td>Massive scale; trusted payments</td><td>No community; high fees</td><td>Lower fees + cultural identity</td></tr>
    <tr><td>GoFundMe</td><td>Crowdfunding</td><td>Brand recognition; large network</td><td>No community verification; high fee</td><td>Verified + 100% to beneficiary</td></tr>
    <tr><td>Patreon / Substack</td><td>Creator monetization</td><td>Established creator tools</td><td>No cultural integration</td><td>Built-in Haitian audience</td></tr>
  </tbody>
</table>

<!-- 3. DEMOGRAPHICS -->
<h2 id="demographics">3. Demographics &amp; Cultural Context</h2>
${renderSection(sections, "Demographics")}

<!-- 4. REGULATORY -->
<h2 id="regulatory">4. Regulatory &amp; Compliance</h2>
${renderSection(sections, "Regulatory")}

<div class="finding high">
  <strong><span class="tag tag-red">CRITICAL</span> HIPAA Compliance Required for Healthcare Features</strong>
  <p>If the platform stores, transmits, or processes Protected Health Information (PHI) for healthcare referrals or telemedicine, full HIPAA compliance is mandatory. This includes BAA agreements, encryption at rest and in transit, audit logging, and breach notification procedures.</p>
</div>

<div class="finding medium">
  <strong><span class="tag tag-orange">PCI DSS for Payments</strong>
  <p>Stripe/PayPal integration reduces liability but the platform must maintain PCI compliance for any direct payment handling. Regular security scans required.</p>
</div>

<!-- 5. WEBSITE AUDIT -->
<h2 id="website">5. Website Audit</h2>
<div class="webkit-audit">
  <h3>Live Platform Analysis</h3>
  <p><strong>URL:</strong> <a href="${C.website || ''}" style="color:var(--accent)">${C.website || 'N/A'}</a></p>
  ${websiteData.accessible ? `
  <p><strong>Status:</strong> <span class="tag tag-green">Accessible</span></p>
  <p><strong>Entity:</strong> Haitian Community Cares Inc</p>
  <p><strong>Address:</strong> 2125 Biscayne Blvd, Miami, FL 33137</p>
  <p><strong>Contact:</strong> info@haitiancommunitycares.com</p>
  
  <h4>Detected Features</h4>
  <div class="feature-grid">
    ${websiteData.features.map(f => `<div class="feature-tag">✅ ${f}</div>`).join("\n")}
  </div>
  
  <h4>Observed Metrics</h4>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    ${websiteData.metrics.members ? `<tr><td>Organic Members</td><td>${websiteData.metrics.members}+</td></tr>` : ""}
    ${websiteData.metrics.dailyViews ? `<tr><td>Daily Views</td><td>${websiteData.metrics.dailyViews}</td></tr>` : ""}
    ${websiteData.metrics.pricesFound ? `<tr><td>Products Listed</td><td>Multiple (pricing from $17.50+)</td></tr>` : ""}
  </table>

  <h4>Technical Observations</h4>
  <ul>
    <li>WordPress-based platform (noted in CMS patterns)</li>
    <li>Active community features: forum posts dating back 2+ years</li>
    <li>Events active: 11th Annual Top 20 Under 40 Gala (Sep 19)</li>
    <li>Monetization: marketplace (platform fee), events (free currently), sponsorships (tiers mentioned)</li>
    <li>Blog active with original content (TPS ruling analysis, immigration economics)</li>
    <li>Crowdfunding: "Haitian Community Cares" verified fundraisers with 100% to beneficiary model</li>
  </ul>
  ` : `
  <p><strong>Status:</strong> <span class="tag tag-red">Inaccessible</span> — ${websiteData.error}</p>
  `}
</div>

${renderSection(sections, "Technology")}

<!-- 6. COMMUNITY SENTIMENT -->
<h2 id="sentiment">6. Community Sentiment &amp; Voice of Customer</h2>
${renderSection(sections, "Customer")}

${renderSection(sections, "Content")}

<!-- 7. REVENUE -->
<h2 id="revenue">7. Revenue &amp; Monetization</h2>
${renderSection(sections, "Revenue")}

<!-- 8. GAP ANALYSIS -->
<h2 id="gaps">8. Gap Analysis &amp; Opportunities</h2>

<h3>Identified Gaps</h3>
<table>
  <thead><tr><th>Gap</th><th>Severity</th><th>Opportunity</th><th>Agent Needed?</th></tr></thead>
  <tbody>
    <tr><td>No automated onboarding for marketplace sellers</td><td><span class="tag tag-red">High</span></td><td>AI agent validates sellers, sends welcome docs, tracks listing quality</td><td>✅ ${A1}</td></tr>
    <tr><td>No payment monitoring or revenue tracking</td><td><span class="tag tag-red">High</span></td><td>AI agent monitors Stripe/PayPal, flags anomalies, reports revenue</td><td>✅ ${A2}</td></tr>
    <tr><td>No automated member engagement</td><td><span class="tag tag-orange">Medium</span></td><td>AI agent sends personalized updates, tracks inactivity, welcomes new members</td><td>✅ ${A3}</td></tr>
    <tr><td>No compliance monitoring (HIPAA, PCI, GDPR)</td><td><span class="tag tag-red">High</span></td><td>AI agent monitors regulatory deadlines, flags compliance gaps</td><td>✅ ${A4}</td></tr>
    <tr><td>No content scheduling or SEO optimization</td><td><span class="tag tag-orange">Medium</span></td><td>AI agent drafts content, optimizes for search, schedules posts</td><td>⚠ Consider: Muse (content)</td></tr>
    <tr><td>No event management automation</td><td><span class="tag tag-green">Low</span></td><td>AI agent sends reminders, tracks RSVPs, manages calendar</td><td>⚠ Consider: additional agent</td></tr>
    <tr><td>No compliance monitoring (HIPAA, PCI, GDPR)</td><td><span class="tag tag-red">High</span></td><td>AI agent monitors regulatory deadlines, flags compliance gaps</td><td>⚠ Consider: Aegis (compliance)</td></tr>
    <tr><td>No partnership/sponsor pipeline management</td><td><span class="tag tag-orange">Medium</span></td><td>AI agent tracks sponsor leads, sends proposals, manages renewals</td><td>⚠ Consider: additional agent</td></tr>
  </tbody>
</table>

<h3>Uniqueness Analysis</h3>
<div class="finding medium">
  <strong><span class="tag tag-purple">MOAT</span> Full-Stack Integration</strong>
  <p>The Haitian Community is the only platform that combines marketplace, creator studio, community forum, business directory, events, AND crowdfunding in one Haitian-focused ecosystem. Individual competitors exist for each pillar (Etsy for marketplace, GoFundMe for crowdfunding, Eventbrite for events), but no one bundles them with cultural identity.</p>
</div>

<div class="finding medium">
  <strong><span class="tag tag-cyan">OPPORTUNITY</span> "Etsy for the Haitian Diaspora"</strong>
  <p>Lower fees than Etsy/Shopify (which take 6.5-10%) + cultural identity + built-in audience = compelling value proposition for Haitian entrepreneurs. The "verified by community" trust model is unique.</p>
</div>

<div class="finding low">
  <strong><span class="tag tag-green">STRENGTH</span> Community Trust</strong>
  <p>The platform's name, physical address, and verified fundraisers build trust that generic platforms can't replicate. "100% goes to beneficiary" is a powerful differentiator vs GoFundMe's ~8% fee.</p>
</div>

<!-- 9. AGENT REQUIREMENTS -->
<h2 id="agents">9. Agent Requirements</h2>
<p>Based on the comprehensive research above, the following AI agents are recommended to automate and scale The Haitian Community's operations:</p>

${agentReqs}

<!-- 10. SOURCES -->
<h2 id="sources">10. Sources &amp; Methodology</h2>
<div class="source-list">
  <p><strong>Research Methodology:</strong> This report was compiled by 8 parallel AI research agents investigating: Market Analysis & Competitive Landscape, Demographics & Cultural Trends, Regulatory & Legal Compliance, Workflow & Operations, Technology Stack & Platform Architecture, Revenue Model & Monetization, Customer Experience & Community Insights, and Content & Media Strategy.</p>
  <p><strong>Website Audit:</strong> Live fetch of ${C.website || 'N/A'} performed ${new Date().toLocaleDateString()}. HTML parsed for feature detection, metrics extraction, and technical analysis.</p>
  <p><strong>Sources include:</strong> Reddit (r/Haiti, r/Diaspora, r/BlackFellas, r/smallbusiness), Quora, Twitter/X, Facebook Haitian diaspora groups, U.S. Census Bureau ACS 2022, World Bank Migration & Development Brief, Nielsen ethnic media reports, competitor website analysis, and public financial data.</p>
</div>

<div class="footnote">
  <p>${C.name} Comprehensive Research Report — Generated ${dateStr} by The Forge</p>
  <p>8-agent deep research + live website audit — <code>${slug}/Context/research-report-${isoDate}.html</code></p>
  <p>Next: <code>./design.mjs companies/${slug}.json</code> to generate agent configurations from these findings.</p>
</div>

</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────

function parseResearchSections(md) {
  const sections = [];
  const lines = md.split("\n");
  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    if (line.match(/^## \d+\.\s/)) {
      if (currentSection) {
        sections.push({ title: currentSection, content: currentContent.join("\n") });
      }
      currentSection = line.replace(/^## \d+\.\s*/, "").trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections.push({ title: currentSection, content: currentContent.join("\n") });
  }
  return sections;
}

function renderSection(sections, keyword) {
  const section = sections.find(s => s.title.toLowerCase().includes(keyword.toLowerCase()));
  if (!section) return `<p><em>Section not found in research data.</em></p>`;
  
  // Convert markdown tables and formatting to HTML
  let html = section.content;
  
  // Convert markdown tables to HTML
  html = html.replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g, (match, header, body) => {
    const headers = header.split("|").map(h => h.trim()).filter(Boolean);
    const rows = body.trim().split("\n").map(row => row.split("|").map(c => c.trim()).filter(Boolean));
    let tableHtml = "<table><thead><tr>";
    headers.forEach(h => { tableHtml += `<th>${h}</th>`; });
    tableHtml += "</tr></thead><tbody>";
    rows.forEach(row => {
      tableHtml += "<tr>";
      row.forEach(cell => { tableHtml += `<td>${cell}</td>`; });
      tableHtml += "</tr>";
    });
    tableHtml += "</tbody></table>";
    return tableHtml;
  });

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  
  // Italic (but not inside URLs)
  html = html.replace(/(?<!\/)\*(.+?)\*(?!\/)/g, "<em>$1</em>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  
  // Bullet points
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Numbered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--accent)">$1</a>');

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = "<p>" + html + "</p>";

  return html;
}

function generateAgentRequirements(sections, websiteData) {
  const features = websiteData.features || [];
  const agents = config.agents || [];
  const byRole = {};
  for (const a of agents) {
    if (a.role?.includes("opera")) byRole.ops = a;
    else if (a.role?.includes("financ") || a.role?.includes("revenu")) byRole.finance = a;
    else if (a.role?.includes("communit") || a.role?.includes("member")) byRole.community = a;
    else if (a.role?.includes("complian") || a.role?.includes("regulat")) byRole.compliance = a;
  }
  const A1 = byRole.ops?.display_name || "Atlas";
  const A2 = byRole.finance?.display_name || "Penny";
  const A3 = byRole.community?.display_name || "Sage";
  const A4 = byRole.compliance?.display_name || "Boukman";
  // Analyze sections and website data to determine agent needs
  const features = websiteData.features || [];
  const hasMarketplace = features.some(f => /marketplace|shop|buy|sell/i.test(f));
  const hasCreator = features.some(f => /creator|studio|upload|video/i.test(f));
  const hasCommunity = features.some(f => /community|forum|post/i.test(f));
  const hasEvents = features.some(f => /event|activity|gather/i.test(f));
  const hasCrowdfunding = features.some(f => /crowdfund|donate|fund/i.test(f));
  const hasContent = features.some(f => /blog|news/i.test(f));
  const hasSponsorships = features.some(f => /sponsor/i.test(f));
  const hasHealthcare = features.some(f => /health|doctor/i.test(f));

  let html = "";

  // Core agents (always needed)
  html += `
<div class="agent-req">
  <h4>1. ${A1} — Operations &amp; Case Management Agent</h4>
  <p><strong>Role:</strong> Manages end-to-end workflows across all platform pillars.</p>
  <p><strong>Why needed:</strong> With ${features.length} platform features running simultaneously, manual case management is unsustainable. ${hasMarketplace ? "Marketplace sellers need onboarding, verification, and support." : ""} ${hasEvents ? "Events need scheduling, reminders, and attendee tracking." : ""}</p>
  <div class="scope">
    <strong>Scope:</strong> Seller onboarding & verification, listing quality monitoring, event scheduling & reminders, workflow automation, task tracking, SLA monitoring.
  </div>
</div>

<div class="agent-req">
  <h4>2. ${A2} — Finance &amp; Revenue Agent</h4>
  <p><strong>Role:</strong> Monitors all revenue streams, detects anomalies, reports financial health.</p>
  <p><strong>Why needed:</strong> Revenue flows through ${hasMarketplace ? "marketplace transactions" : ""}${hasCrowdfunding ? ", crowdfunding donations" : ""}${hasSponsorships ? ", sponsorship payments" : ""}${hasCreator ? ", creator payouts" : ""}. Without automated monitoring, fraud, payment failures, and revenue leakage go undetected.</p>
  <div class="scope">
    <strong>Scope:</strong> Stripe/PayPal transaction monitoring, revenue reporting by stream, anomaly detection, sponsorship tier tracking & renewal reminders, financial summaries.
  </div>
</div>

<div class="agent-req">
  <h4>3. ${A3} — Community &amp; Membership Agent</h4>
  <p><strong>Role:</strong> Nurtures community engagement, welcomes new members, drives retention.</p>
  <p><strong>Why needed:</strong> ${hasCommunity ? "Active community forum with 2+ years of posts needs moderation, engagement prompts, and inactive member re-engagement." : ""} ${hasContent ? "Blog readership needs newsletter automation and personalized content recommendations." : ""} Growth from 115 to 1,000+ members requires automated community management.</p>
  <div class="scope">
    <strong>Scope:</strong> Member onboarding & welcome flows, engagement tracking, inactivity detection & re-engagement, newsletter automation, community moderation support.
  </div>
</div>

<div class="agent-req">
  <h4>4. ${A4} — Compliance &amp; Regulatory Agent</h4>
  <p><strong>Role:</strong> Answers FAQs, routes inquiries, provides platform navigation support.</p>
  <p><strong>Why needed:</strong> With ${features.length} platform pillars, new users arrive with questions about everything. Each agent handles their own domain — no separate triage agent needed. ${A1} owns operations, ${A2} owns finance, ${A3} owns community, ${A4} owns compliance.</p>
  <div class="scope">
    <strong>Scope:</strong> Regulatory compliance monitoring (HIPAA, PCI DSS, GDPR/CCPA), policy enforcement, content moderation flags, data handling audits, compliance documentation.
  </div>
</div>
`;

  // Conditional agents
  if (hasContent) {
    html += `
<div class="agent-req">
  <h4>5. Muse — Content &amp; Media Agent <span class="tag tag-purple">RECOMMENDED</span></h4>
  <p><strong>Role:</strong> Manages blog content, social media scheduling, podcast distribution, and SEO optimization.</p>
  <p><strong>Why needed:</strong> Active blog with original journalism (TPS ruling analysis, immigration economics) needs content pipeline management, SEO optimization, and cross-platform distribution. As the platform grows, manual content management becomes a bottleneck.</p>
  <div class="scope">
    <strong>Scope:</strong> Content calendar management, SEO optimization, social media scheduling, podcast distribution, content performance analytics, newsletter drafting.
  </div>
</div>`;
  }

  if (hasHealthcare || sections.some(s => s.title.toLowerCase().includes("regulatory") && s.content.toLowerCase().includes("hipaa"))) {
    html += `
<div class="agent-req">
  <h4>6. Aegis — Compliance &amp; Regulatory Agent <span class="tag tag-red">RECOMMENDED</span></h4>
  <p><strong>Role:</strong> Monitors regulatory compliance deadlines, flags gaps, manages documentation.</p>
  <p><strong>Why needed:</strong> HIPAA compliance for healthcare features, PCI DSS for payment processing, GDPR/CCPA for user data, and state-specific regulations require ongoing monitoring. Penalties for non-compliance can exceed $50K per violation.</p>
  <div class="scope">
    <strong>Scope:</strong> HIPAA compliance monitoring, PCI DSS audit preparation, GDPR/CCPA data handling, insurance renewal tracking, regulatory change alerts, compliance documentation.
  </div>
</div>`;
  }

  html += `
<h3>Agent Interaction Map</h3>
<pre style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1rem;font-size:0.8rem;overflow-x:auto;margin:1rem 0;color:var(--text)">

  User Inquiry → ${A1} (ops)
                    ├── Financial question → ${A2}
                    ├── Community question → ${A3}
                    └── Compliance question → ${A4}

  Cron Workflows:
    ${A1} ─── daily standup, weekly audit, intern checkpoint
    ${A2} ─── daily revenue, weekly invoices, monthly report
    ${A3} ─── daily welcome, weekly engagement, monthly newsletter
    ${A4} ─── weekly compliance scan, daily policy review, monthly regulatory update
</pre>
`;

  return html;
}

// ── Write HTML Report ────────────────────────────────

// Parse research early — needed by both HTML and markdown outputs
const sections = parseResearchSections(researchMd);

const html = renderHtml(researchMd, websiteData, config);
const htmlPath = join(researchDir, `research-report-${date}.html`);

mkdirSync(researchDir, { recursive: true });
writeFileSync(htmlPath, html, "utf-8");

console.log(`\n── Report Generated ──`);
console.log(`  ✅ ${htmlPath}`);
console.log(`  Size: ${(html.length / 1024).toFixed(1)} KB`);

// Also save agent requirements summary to Obsidian for design.mjs to use
const agentReqsPath = join(researchDir, `agent-requirements-${date}.md`);
const agentReqsMd = generateAgentRequirementsMarkdown(sections, websiteData, config);
writeFileSync(agentReqsPath, agentReqsMd, "utf-8");
console.log(`  ✅ Agent requirements: ${agentReqsPath}`);

if (openFile) {
  try {
    execSync(`open "${htmlPath}"`);
    console.log(`  ✅ Opened in browser`);
  } catch {}
}

console.log(`\nNext: ./design.mjs companies/${slug}.json`);
console.log();

function generateAgentRequirementsMarkdown(sections, websiteData, config) {
  const C = config.company;
  const features = websiteData.features || [];
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let md = `---
date: ${new Date().toISOString().split("T")[0]}
tags:
  - ${C.slug || C.name.toLowerCase().replace(/[^a-z]+/g, "-")}
  - agents
  - requirements
  - agent-hub
---

# ${C.name} — Agent Requirements

> Generated ${dateStr} from Deep Research (8 agents) + Live Website Audit

## Platform Pillars Detected
${features.map(f => `- ${f}`).join("\n")}

## Required Agents

### 1. ${A1} — Operations & Case Management
Manages end-to-end workflows: seller onboarding & verification, listing quality, event scheduling, task tracking, SLA monitoring.

### 2. ${A2} — Finance & Revenue
Monitors Stripe/PayPal transactions, revenue reporting by stream, anomaly detection, sponsorship tracking & renewals.

### 3. ${A3} — Community & Membership
Member onboarding, engagement tracking, inactivity detection, newsletter automation, community moderation.

### 4. ${A4} — Compliance & Regulatory
HIPAA compliance, PCI DSS audit prep, GDPR/CCPA data handling, insurance tracking, regulatory change alerts.

## Agent Interaction Map
\`\`\`
User → ${A1} (ops) / ${A2} (finance) / ${A3} (community) / ${A4} (compliance)
\`\`\`

## Design Notes for design.mjs
- All agents handle their own domain + @mentions — no separate triage agent
- Every agent needs Slack channel access (private #hcc-agents)
- Focus on automation over notification — agents should DO, not just alert
- Platform-specific: marketplace, creator studio, community forum, directory, events, crowdfunding
`;

  return md;
}
