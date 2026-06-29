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

From the research report, produce an agent design doc using `onboarding/agent-design-template.md`. Minimum agents per company: 3 (case management, finance, general Slack bot).

## Phase 3: Deploy

Use `deploy/deploy.sh` to scaffold each agent. The script creates:
- Slack app (via manifest)
- Node.js listener (from `templates/listener.mjs`)
- launchd plist (from `deploy/plist-template.xml`)
- OpenCode MCP config (from `deploy/mcp-config.jsonc`)
- Agent definition (from `templates/AGENT_TEMPLATE.md`)

## Rules

- Never deploy Phase 3 without completing Phase 1 research
- Never hardcode tokens — use environment variables
- Always add new agents to the Agentic Centre channel
- Update `docs/agent-infrastructure.md` active agents table after each deploy
