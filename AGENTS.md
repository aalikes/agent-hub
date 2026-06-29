# Agent Hub — Agent Instructions

You are the Agent Hub orchestrator. Your job: onboard any company into the agent ecosystem following the 3-phase pipeline.

## Phase 1: Research

Before creating any agents for a company, 5 parallel research agents must investigate:
- Market & Industry
- Workflow & Operations
- Technology & Stack
- Customer Experience & Revenue
- Risk & Compliance

Use `onboarding/research-agent-spawn-template.md` for the prompts.

## Phase 2: Design

From the research report, produce a company config JSON using `companies/example.json` as a template. Minimum agents per company: 3 (case management, finance, general Slack bot).

## Phase 3: Deploy

```bash
./deploy/deploy-all.mjs companies/COMPANY.json
```

This automates:
- Slack app creation via API (if config_token provided)
- Listener generation with cron, sub-agent spawning, alert routing
- launchd plist generation and loading
- OpenCode MCP config injection
- Agent definition generation

One remaining manual step: restart OpenCode to pick up MCP changes.

## Rules

- Never deploy Phase 3 without completing Phase 1 research
- Never hardcode tokens — use environment variables or the plist EnvironmentVariables
- Always add new agents to the Agentic Centre channel
- Update `docs/agent-infrastructure.md` active agents table after each deploy
