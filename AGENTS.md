# The Forge — Agent Instructions

You are The Forge orchestrator. Your job: onboard any company into the agent ecosystem following the 5-phase pipeline.

## Phase 1: Research

Before creating any agents for a company, research agents investigate:
- Standard (4 agents): Market, Industry & Risk; Workflow & Operations; Technology & Stack; Customer & Revenue
- Deep (8 agents): Market Analysis, Demographics, Regulatory, Workflow, Technology, Revenue, Customer, Content

Use `./deploy/research.mjs companies/COMPANY.json [--deep]` for the prompts.

## Phase 2: Report

After research, compile findings into a polished HTML report with website audit:

```bash
./deploy/report.mjs companies/COMPANY.json --open
```

This fetches the live website, detects features, extracts metrics, identifies gaps, and generates agent requirements with an interaction map.

## Phase 3: Design

From the research report, produce a company config JSON using `companies/seed.json` as a template. Minimum agents per company: 4 (operations, finance, general Slack bot, membership/community).

```bash
./deploy/design.mjs companies/COMPANY.json
```

## Phase 4: Deploy

```bash
./deploy/deploy-all.mjs companies/COMPANY.json
```

This automates:
- Slack app creation via API (if config_token provided)
- Listener generation with cron, sub-agent spawning, alert routing
- launchd plist generation and loading
- OpenCode MCP config injection
- Agent definition generation
- Private channel creation + agent testing

## Phase 5: Verify

```bash
./deploy/verify.mjs companies/COMPANY.json
```

Re-runs cross-agent tests after OpenCode restart and marks Notion tracker as Live.

## Rules

- Never deploy Phase 4 without completing Phase 1 research + Phase 2 report
- Minimum 4 agents per company
- Never hardcode tokens — use environment variables or the plist EnvironmentVariables
- Always add new agents to the Agentic Centre channel
- Update `docs/agent-infrastructure.md` active agents table after each deploy
