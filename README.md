# Agent Hub

Orchestrate AI agents for any company. A pipeline that goes from zero knowledge → research report → agent design → live Slack bots.

## Pipeline

```
Phase 1                Phase 2                Phase 3
Research ──────────→ Agent Design ──────────→ Deploy
(5 parallel agents)   (per-company plan)      (Slack + launchd + MCP)
```

| Phase | What | Template | Output |
|-------|------|----------|--------|
| 1. Research | Spawn 5 agents to investigate company, industry, workflow | `onboarding/research-agent-spawn-template.md` | Research report |
| 2. Design | Define what agents the company needs, their roles, tools, cron | `onboarding/company-agent-onboarding-template.md` | Agent design doc |
| 3. Deploy | Create Slack apps, listeners, plists, MCP configs | `deploy/` + `templates/` | Live agents in Slack |

## Quick Start

```bash
# 1. Copy the listener template and customize
cp templates/listener.mjs your-project/agents/casey/listener.mjs

# 2. Fill in COMPANY_NAME in the onboarding template
# 3. Spawn research agents via Slack:
#    @Casey spawn 5 research agents for COMPANY_NAME using research-agent-spawn-template

# 4. After research completes, run deploy script
./deploy/deploy.sh COMPANY_NAME agent-name
```

## Files

```
agent-hub/
├── README.md
├── AGENTS.md                          # OpenCode agent instructions
├── onboarding/
│   ├── research-agent-spawn-template.md    # Phase 1: 5 research agent prompts
│   ├── company-agent-onboarding-template.md # Phase 2: research→design junction
│   └── agent-design-template.md           # Phase 2 output: per-company agent plan
├── templates/
│   ├── AGENT_TEMPLATE.md                 # OpenCode agent definition blueprint
│   ├── listener.mjs                      # Zero-dependency Socket Mode listener
│   └── slack-app-manifest.yaml           # Slack app manifest with correct scopes
├── deploy/
│   ├── plist-template.xml                # launchd plist for macOS persistence
│   ├── mcp-config.jsonc                  # OpenCode MCP server config snippet
│   └── deploy.sh                         # Per-agent deployment script
├── skills/                               # Obsidian skills agents load at startup
└── docs/
    └── agent-infrastructure.md           # Full infrastructure reference
```

## Requirements

- Node.js 22+ (native `WebSocket`)
- macOS (launchd) or systemd for Linux
- Slack workspace with app creation permissions
- DeepSeek API key (or any OpenAI-compatible endpoint)
- OpenCode for MCP-based agent orchestration
