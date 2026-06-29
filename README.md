# Agent Hub

Orchestrate AI agents for any company. One JSON config → full agent fleet: Slack apps, Socket Mode listeners, cron jobs, launchd persistence, MCP integration.

## Pipeline

```
Phase 1                Phase 2                Phase 3
Research ──────────→ Agent Design ──────────→ Deploy
(5 parallel agents)   (per-company plan)      (automated)
```

| Phase | What | Template | Output |
|-------|------|----------|--------|
| 1. Research | Spawn 5 agents to investigate company, industry, workflow | `onboarding/research-agent-spawn-template.md` | Research report |
| 2. Design | Define what agents the company needs, their roles, tools, cron | `onboarding/agent-design-template.md` | Company config JSON |
| 3. Deploy | One command deploys all agents | `./deploy/deploy-all.mjs` | Live agents in Slack |

## Quick Start

```bash
# 1. Create your company config
cp companies/example.json companies/my-company.json
# Fill in: company name, Slack workspace, DeepSeek key, agent definitions

# 2. Dry-run to see what will happen
./deploy/deploy-all.mjs companies/my-company.json --dry-run

# 3. Deploy!
./deploy/deploy-all.mjs companies/my-company.json

# 4. Restart OpenCode (MCP changes need restart)
# 5. Test: DM each agent in Slack
```

## What Deploy Does

`deploy-all.mjs` automates everything for every agent in your config:

| Step | Automated? |
|------|-----------|
| Create Slack app from manifest | ✅ via `apps.manifest.create` API |
| Generate bot & app tokens | ⚠ from env or config (API creation needs config token) |
| Generate `listener.mjs` with full system prompt, cron, alerts | ✅ |
| Copy `listener-utils.mjs` (sub-agent spawning, alerts, health) | ✅ |
| Generate launchd plist with all env vars | ✅ |
| Load plist into launchd | ✅ via `launchctl load` |
| Append MCP config to `opencode.jsonc` | ✅ |
| Add MCP permissions | ✅ |
| Generate OpenCode agent definition `.md` | ✅ |
| Restart OpenCode | ❌ Manual (one step) |

## Files

```
agent-hub/
├── README.md
├── AGENTS.md
├── companies/                          # Your company configs
│   └── metroprints.json               # Example: 2-agent MetroPrints setup
├── onboarding/
│   ├── research-agent-spawn-template.md
│   ├── agent-design-template.md
│   └── company-agent-onboarding-template.md
├── templates/
│   ├── AGENT_TEMPLATE.md              # OpenCode agent definition blueprint
│   ├── listener.mjs                   # Socket Mode listener (cron + spawning + alerts)
│   ├── listener-utils.mjs             # Shared: sub-agents, alert routing, health checks
│   └── slack-app-manifest.yaml        # Slack app manifest template
├── deploy/
│   ├── deploy-all.mjs                 # Main deployment engine
│   ├── plist-template.xml             # launchd plist template
│   └── mcp-config.jsonc               # OpenCode MCP config snippet
├── skills/                            # Obsidian vault skill structure
└── docs/
    └── agent-infrastructure.md        # Full infrastructure reference
```

## Company Config Schema

See `companies/metroprints.json` for a full example. Key sections:

```json
{
  "company": { "name": "...", "slug": "...", "website": "..." },
  "slack": { "workspace_id": "T...", "config_token": "xoxe.xoxp-..." },
  "infrastructure": { "deepseek_api_key": "...", "notion_api_key": "...", "obsidian_vault": "..." },
  "channels": { "critical": "...", "alerts": "...", "general": "..." },
  "agents": [{
    "name": "AgentName",
    "role": "case management",
    "system_prompt": { "identity": "...", "responsibilities": [...], "boundaries": [...], "personality": "..." },
    "cron": [{ "schedule": "0 8 * * *", "job": "morning_standup", "channel": "alerts" }],
    "alert_routing": { "p0": { "channel": "critical", "examples": [...] } },
    "slack_scopes": [...],
    "slash_commands": [...]
  }]
}
```

## Requirements

- Node.js 22+ (native WebSocket, fetch)
- macOS (launchd) — Linux systemd support planned
- Slack workspace with app creation permissions
- DeepSeek API key (or any OpenAI-compatible endpoint)
- OpenCode for MCP-based agent orchestration
