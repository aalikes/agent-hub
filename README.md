# Agent Hub

> **GitHub template repository** — click "Use this template" to create your own agent hub.

Orchestrate AI agents for any company. Start with a company description, end with live Slack bots. Three commands, 95% automated.

## Pipeline

```
Phase 1                Phase 2                Phase 3
Research ──────────→ Agent Design ──────────→ Deploy
(research.mjs)        (design.mjs)            (deploy-all.mjs)
```

| Phase | What | Command | Output |
|-------|------|---------|--------|
| 1. Research | Spawn 4 parallel agents investigating company, industry, workflow | `./deploy/research.mjs` | Research report → Obsidian |
| 2. Design | LLM analyzes research, generates agent definitions | `./deploy/design.mjs` | Company config JSON + agent design → Obsidian |
| 3. Deploy | One command deploys all agents | `./deploy/deploy-all.mjs` | Live agents in Slack + deploy report → Obsidian |

Every phase updates the Notion Agent Hub Tracker: `Researching → Designing → Deploying → Live`.

## Quick Start

```bash
# 1. Create your seed config
cp companies/seed.json companies/my-company.json
# Edit: company name, description, website, and API keys

# 2. Research — 5 parallel agents investigate your company & industry
./deploy/research.mjs companies/my-company.json

# 3. Design — LLM reads research, generates agent definitions
./deploy/design.mjs companies/my-company.json

# 4. Deploy — one command, everything else
./deploy/deploy-all.mjs companies/my-company-generated.json

# 5. Restart OpenCode (MCP changes need restart)
# 6. Test: DM each agent in Slack
```

## What Each Phase Does

### Phase 1 — `research.mjs`

| Step | Auto |
|------|------|
| Spawn 4 DeepSeek sub-agents (Market+Risk, Workflow, Tech, Customer) | ✅ |
| Compile results into structured markdown report | ✅ |
| Save to Obsidian: `vault/company/Context/research-report-{date}.md` | ✅ |
| Log to Notion: Status → Researching | ✅ |

### Phase 2 — `design.mjs`

| Step | Auto |
|------|------|
| Read research report from Obsidian vault | ✅ |
| Generate agent definitions via LLM (names, roles, cron, alerts, system prompts) | ✅ |
| Output complete company JSON config | ✅ |
| Save agent design to Obsidian: `vault/company/Context/agent-design-{date}.md` | ✅ |
| Log to Notion: Status → Designing | ✅ |

### Phase 3 — `deploy-all.mjs`

| Step | Auto |
|------|------|
| Create Slack apps via API | ✅ (if config_token provided) |
| Generate listener.mjs with cron engine + sub-agent spawning + alert routing | ✅ |
| Copy listener-utils.mjs | ✅ |
| Generate and load launchd plist | ✅ |
| Inject MCP config + permissions into opencode.jsonc | ✅ |
| Create private Slack channel for agent coordination | ✅ |
| Invite all agents + owner to coordination channel | ✅ |
| Cross-agent testing (each agent tests another) | ✅ |
| Generate OpenCode agent definition .md | ✅ |
| Save deploy report to Obsidian | ✅ |
| Log to Notion: Status → Deploying (with test results) | ✅ |
| Restart OpenCode | ❌ Manual (one step) |

## Files

```
agent-hub/
├── README.md
├── AGENTS.md
├── companies/
│   ├── seed.json                     # Minimal seed for new companies
│   └── metroprints.json             # Full example: 2-agent MetroPrints setup
├── onboarding/
│   ├── research-agent-spawn-template.md  # Research prompts (reference)
│   └── agent-design-template.md         # Agent design template (reference)
├── templates/
│   ├── AGENT_TEMPLATE.md            # OpenCode agent definition blueprint
│   ├── listener.mjs                 # Socket Mode listener (cron + spawning + alerts)
│   ├── listener-utils.mjs           # Shared utilities
│   └── slack-app-manifest.yaml      # Slack app manifest
├── deploy/
│   ├── research.mjs                 # Phase 1: 5-agent research pipeline
│   ├── design.mjs                   # Phase 2: LLM-powered agent config generator
│   ├── deploy-all.mjs               # Phase 3: full deployment engine
│   ├── plist-template.xml           # launchd plist
│   └── mcp-config.jsonc             # OpenCode MCP config snippet
├── docs/
│   ├── agent-infrastructure.md      # Full infrastructure reference
│   └── notion-tracker-schema.md     # Notion database schema
└── skills/                          # Obsidian vault skill structure
```

## Obsidian Integration

Reports are automatically saved to your vault:

| Report | Path | Phase |
|--------|------|-------|
| Research | `Skills/{company}/Context/research-report-{date}.md` | 1 |
| Agent Design | `Skills/{company}/Context/agent-design-{date}.md` | 2 |
| Deployment | `Skills/{company}/Context/deploy-report-{date}.md` | 3 |

## Notion Tracking

Every phase updates a Notion database. See `docs/notion-tracker-schema.md` to create it.

Configure in your company JSON:
```json
{
  "infrastructure": {
    "notion_api_key": "ntn_...",
    "notion_tracker_db_id": "DATABASE_ID"
  }
}
```

## Requirements

- Node.js 22+ (native WebSocket, fetch)
- macOS (launchd)
- Slack workspace with app creation permissions
- DeepSeek API key
- OpenCode for MCP-based agent orchestration
