# The Forge

> **GitHub template repository** — click "Use this template" to create your own agent hub.

Orchestrate AI agents for any company. Start with a company description, end with live Slack bots. Five commands, 95% automated.

## Pipeline

```
Phase 1              Phase 2              Phase 3              Phase 4              Phase 5
Research ──────→ Report ──────────→ Design ──────────→ Deploy ──────────→ Verify
(research.mjs)    (report.mjs)       (design.mjs)       (deploy-all.mjs)    (verify.mjs)
```

| Phase | What | Command | Output |
|-------|------|---------|--------|
| 1. Research | 4–8 parallel agents investigate company, industry | `./deploy/research.mjs [--deep]` | Research markdown → Obsidian |
| 2. Report | Compile research + website audit into polished HTML report | `./deploy/report.mjs` | HTML report + agent requirements → Obsidian |
| 3. Design | LLM analyzes research, generates agent definitions | `./deploy/design.mjs` | Company config JSON + agent design → Obsidian |
| 4. Deploy | One command deploys all agents | `./deploy/deploy-all.mjs` | Live agents in Slack + deploy report → Obsidian |
| 5. Verify | After OpenCode restart, confirm agents operational | `./deploy/verify.mjs` | Verified → Notion set to Live |

Every phase updates the Notion The Forge Tracker: `Researching → Designing → Deploying → Live`.

## Quick Start

```bash
# 1. Create your seed config
cp companies/seed.json companies/my-company.json
# Edit: company name, description, website, and API keys

# 2. Research — 4 agents (or 8 with --deep)
./deploy/research.mjs companies/my-company.json --deep

# 3. Report — compile research + website audit into polished HTML
./deploy/report.mjs companies/my-company.json --open

# 4. Design — LLM reads research, generates agent definitions
./deploy/design.mjs companies/my-company.json

# 5. Deploy — one command, everything else
./deploy/deploy-all.mjs companies/my-company-generated.json

# 6. Restart OpenCode (MCP changes need restart)

# 7. Verify — re-run tests, mark Live
./deploy/verify.mjs companies/my-company-generated.json
```

## What Each Phase Does

### Phase 1 — `research.mjs`

| Step | Auto |
|------|------|
| Standard mode: 4 DeepSeek sub-agents (Market, Workflow, Tech, Customer) | ✅ |
| Deep mode: `--deep` flag — 8 sub-agents (Market, Demographics, Regulatory, Workflow, Tech, Revenue, Customer, Content) | ✅ |
| Compile results into structured markdown report | ✅ |
| Save to Obsidian: `vault/company/Context/research-report-{date}.md` | ✅ |
| Log to Notion: Status → Researching | ✅ |

### Phase 2 — `report.mjs`

| Step | Auto |
|------|------|
| Read deep research from Obsidian vault | ✅ |
| Fetch live website, detect features, extract metrics | ✅ |
| Compile into polished HTML report (dark theme, TOC, competitive tables, gap analysis) | ✅ |
| Generate agent requirements with interaction map | ✅ |
| Save HTML + agent-requirements.md to Obsidian | ✅ |

### Phase 3 — `design.mjs`

| Step | Auto |
|------|------|
| Read research report from Obsidian vault | ✅ |
| Generate agent definitions via LLM (names, roles, cron, alerts, system prompts) | ✅ |
| Output complete company JSON config | ✅ |
| Save agent design to Obsidian: `vault/company/Context/agent-design-{date}.md` | ✅ |
| Log to Notion: Status → Designing | ✅ |

### Phase 4 — `deploy-all.mjs`

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

### Phase 5 — `verify.mjs`

| Step | Auto |
|------|------|
| Check launchd status for all agents | ✅ |
| Re-run cross-agent tests (8s wait for responses) | ✅ |
| Post all-clear message to agent coordination channel | ✅ |
| Save verification report to Obsidian | ✅ |
| Update Notion tracker: Status → Live | ✅ (if all tests pass) |

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
│   ├── research.mjs                 # Phase 1: 4/8-agent research pipeline
│   ├── report.mjs                   # Phase 2: HTML report + website audit
│   ├── design.mjs                   # Phase 3: LLM-powered agent config generator
│   ├── deploy-all.mjs               # Phase 4: full deployment engine
│   ├── verify.mjs                   # Phase 5: verification + Live status
│   ├── plist-template.xml           # launchd plist
│   └── mcp-config.jsonc             # OpenCode MCP config snippet
├── docs/
│   ├── agent-infrastructure.md      # Full infrastructure reference
│   ├── agent-naming.md              # Naming conventions + themes
│   └── notion-tracker-schema.md     # Notion database schema
└── skills/                          # Obsidian vault skill structure
```

## Obsidian Integration

Reports are automatically saved to your vault:

| Report | Path | Phase |
|--------|------|-------|
| Research | `Skills/{company}/Context/research-report-{date}.md` | 1 |
| Research HTML | `Skills/{company}/Context/research-report-{date}.html` | 2 |
| Agent Requirements | `Skills/{company}/Context/agent-requirements-{date}.md` | 2 |
| Agent Design | `Skills/{company}/Context/agent-design-{date}.md` | 3 |
| Deployment | `Skills/{company}/Context/deploy-report-{date}.md` | 4 |
| Verification | `Skills/{company}/Context/verify-report-{date}.md` | 5 |

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
