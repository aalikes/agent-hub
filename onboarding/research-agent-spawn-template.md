# Research Agent Spawn Template

> Phase 1 of 3. Prerequisite for all agent creation. After research completes, proceed to Phase 2 (Agent Design) and Phase 3 (Deployment).

Template for spawning 5 parallel research agents. Fill in the placeholders then paste into Slack to execute.

## Meta

| Field | Value |
|-------|-------|
| Company | `COMPANY_NAME` |
| Project | `PROJECT_NAME` |
| Date | `YYYY-MM-DD` |
| Agents | 5 (Market, Workflow, Tech, Customer, Risk) |

## Spawn Command

Paste into Slack DM to Casey:

```
@Casey spawn 5 research agents for COMPANY_NAME. Compile all findings into one structured report.

AGENT A — Market & Industry Research:
Research COMPANY_NAME and its industry. Deliver:
1. Total addressable market size and growth rate (cite sources).
2. Competitive landscape: Top 5 direct competitors — what they do, pricing, strengths, weaknesses, and how COMPANY_NAME differs.
3. Community sentiment: Search Reddit, Quora, Twitter/X, Hacker News, and industry forums for what people say about this industry. What are common complaints about existing providers? What do customers want that they can't get?
4. Macro trends: 3-5 trends affecting this industry (regulation, tech shifts, consumer behavior, economic factors). For each: likelihood of impact and timeframe.
5. Positioning: Where does COMPANY_NAME sit? Premium / budget / niche specialist / generalist?
Return findings organized by section with sources cited for every claim.

AGENT B — Workflow & Operations:
Analyze COMPANY_NAME's operational workflow. Deliver:
1. Process map: End-to-end customer journey from inquiry to delivery. Every step, who does it, which tools, handoffs.
2. Bottlenecks: Top 5. Where does work pile up? Root cause? Hours lost per week? Can it be automated?
3. Tool audit: All software in use. Which integrate? Where is data manually copied? Single source of truth?
4. Automation targets: Rank by time saved, error reduction, implementation difficulty.
5. Ideal state: Redesigned workflow from scratch. What tools? What integrations? What dashboard?
Return findings with concrete examples and estimated time/cost savings.

AGENT C — Technology & Stack Assessment:
Assess COMPANY_NAME's technology stack. Deliver:
1. Inventory: Every tool, platform, service in use. For each: what it does, monthly cost, criticality.
2. Tool fitness: Is each tool right for this size/type of business? Common complaints? Better alternatives (pros/cons/cost)?
3. Integration gaps: Where should data flow automatically but doesn't? List every manual copy-paste step.
4. Community recommendations: What tools does the community recommend? Reddit r/smallbusiness, Indie Hackers, industry forums.
5. Target stack: Propose specific tools, estimated monthly cost, migration complexity. Prioritize tools with APIs and native integrations.
Return with tool comparison table (tool | pros | cons | cost | verdict).

AGENT D — Customer Experience & Revenue:
Research COMPANY_NAME's customer experience and revenue. Deliver:
1. Customer journey: Discovery → Purchase → Fulfillment → Follow-up → Repeat/Referral. Friction at each stage?
2. Pain points: Most common complaints. What do reviews say? What do customers ask for that isn't offered?
3. Revenue analysis: Revenue streams, pricing model, average order value, customer lifetime value, where revenue leaks.
4. Pricing benchmarks: How do competitors price? What do customers expect to pay?
5. Growth levers: 3-5 ways to increase revenue (upsells, retention, new channels, referrals, price optimization).
For each: estimated revenue impact, implementation difficulty, timeline.

AGENT E — Risk & Compliance:
Assess COMPANY_NAME's risk and compliance posture. Deliver:
1. Regulatory landscape: What regulations apply? Industry-specific licensure, data privacy, payment processing, employment law, insurance.
2. Business risks: Top risks ranked by severity. Single points of failure, key-person dependency, supply chain, seasonal volatility, reputation risk.
3. Community warnings: Search for common legal/compliance pitfalls in this industry. What do people get sued for? What fines? What insurance claims?
4. Contract & legal: What contracts, terms of service, waivers, or disclaimers are standard? What's missing?
5. Mitigation plan: For each top risk — action, cost, urgency (now / next quarter / this year).
Return findings with risk severity ratings (1-10) and concrete mitigation steps.
```
