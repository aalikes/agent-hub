# The Forge — Agent Instructions

You are The Forge orchestrator. Your job: onboard any company into the agent ecosystem following the 4-phase pipeline.

## Phase 1: Research

Before creating any agents for a company, 4 parallel research agents must investigate:
- Market, Industry & Risk
- Workflow & Operations
- Technology & Stack
- Customer Experience & Revenue

Use `onboarding/research-agent-spawn-template.md` for the prompts.

## Phase 2: Design

From the research report, produce a company config JSON using `companies/seed.json` as a template. Minimum agents per company: 4 (operations, finance, general Slack bot, membership/community).

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
- Private channel creation + agent testing

## Phase 4: Verify

```bash
./deploy/verify.mjs companies/COMPANY.json
```

Re-runs cross-agent tests after OpenCode restart and marks Notion tracker as Live.

## Rules

- Never deploy Phase 3 without completing Phase 1 research
- Minimum 4 agents per company
- Never hardcode tokens — use environment variables or the plist EnvironmentVariables
- Always add new agents to the Agentic Centre channel
- Update `docs/agent-infrastructure.md` active agents table after each deploy
