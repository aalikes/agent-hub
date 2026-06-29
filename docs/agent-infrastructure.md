# Agent Infrastructure — Multi-Agent Setup

> Standardized setup for all Slack agents.
> **For new companies:** Start with `onboarding/company-agent-onboarding-template.md` (Phase 1: Research → Phase 2: Design → Phase 3: Deploy). This doc covers Phase 3 reference.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Your Mac / VPS                           │
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   launchd (plist)    │    │   OpenCode + MCP             │   │
│  │   ─────────────────  │    │   ───────────────────────    │   │
│  │   listener.mjs       │    │   agent/<name>.md            │   │
│  │   Node.js native WS  │    │   slack-mcp-server stdio     │   │
│  │   KeepAlive: true    │    │   Tools: channels, users,    │   │
│  │   Auto-restart       │    │          messages, groups    │   │
│  └──────┬───────────────┘    └──────────────┬───────────────┘   │
│         │                                   │                    │
│    xapp token                          xoxb token                │
│    (Socket Mode WS)                    (HTTP API)                │
│         │         ┌──────────────────────┘                      │
│         ▼         ▼                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Slack Workspace                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Active Agents

| Agent | Company | Port | Slack | Domain |
|-------|---------|------|-------|--------|
| Casey | Metroprints | N/A (Socket Mode) | Metroprints workspace | Case management |
| Metro | Metroprints | N/A (Socket Mode) | Metroprints workspace | Operations |
| _agent_ | _company_ | _port_ | _workspace_ | _domain_ |

## Shared Infrastructure

- **Model provider:** DeepSeek (`deepseek-chat`)
- **API:** OpenAI-compatible at `https://api.deepseek.com/v1`
- **Socket Mode:** Native Node.js WebSocket (zero dependencies)

## Agent Directory Structure

Each agent:
```
~/Projects/{company}/agents/{name}/
  listener.mjs          # Socket Mode listener (Node.js)
  package.json          # Dependencies (if any beyond Node stdlib)

~/Projects/{company}/.opencode/agent/
  {name}.md             # OpenCode agent definition

~/Library/LaunchAgents/
  com.{company}.{name}.listener.plist  # macOS persistence
```

## Slack App Manifest

See `templates/slack-app-manifest.yaml` — copy and paste into api.slack.com/apps → New App → From Manifest.

Required scopes:
- `channels:read`, `channels:history`, `groups:read`, `groups:history`
- `users:read`, `chat:write`, `app_mentions:read`
- `im:history`, `im:read`, `im:write`
- `reactions:read`, `reactions:write`
- `files:read`, `commands`, `usergroups:read`

Optional scopes (add only if agent needs them):
- `channels:manage`, `channels:join`, `groups:write`
- `files:write`, `assistant:write`

## Scopes Principle

**Start minimal, add only what the agent demonstrably needs.** Over-scoping gets flagged by Slack's review process. Revisit scopes quarterly.

### Scope Audit Command
```bash
rg -oP 'slack\.com/api/\K\w+\.\w+' ~/Library/Logs/com.{company}.{agent}.listener.log \
  | sort | uniq -c | sort -rn
```

## Management Commands
```bash
# Start
launchctl load ~/Library/LaunchAgents/com.{company}.{agent}.listener.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.{company}.{agent}.listener.plist

# Status
launchctl list | grep {agent}

# Logs
tail -f ~/Library/Logs/com.{company}.{agent}.listener.log
tail -f ~/Library/Logs/com.{company}.{agent}.listener.error.log
```

## Adding a New Agent (Quick Deploy)

```bash
cd ~/Projects/agent-hub
./deploy/deploy.sh COMPANY_SLUG AGENT_SLUG
```

This automates: directory creation, listener copy, placeholder replacement, plist generation, and agent definition scaffolding. Manual steps printed at end.

## Adding a New Agent (Manual)

1. Create Slack app via api.slack.com/apps → From Manifest → paste `templates/slack-app-manifest.yaml`
2. Install to workspace → copy xoxb token
3. Generate App-Level Token with `connections:write` scope → copy xapp token
4. Note bot user ID (from Users list or `auth.test` API)
5. Create agent directory: `mkdir -p ~/Projects/{company}/agents/{name}`
6. Copy listener: `cp templates/listener.mjs ~/Projects/{company}/agents/{name}/`
7. Replace all `{{PLACEHOLDER}}` values in listener.mjs
8. Create plist from `deploy/plist-template.xml` → load with `launchctl load`
9. Add MCP config to `~/.config/opencode/opencode.jsonc`
10. Create agent definition at `~/Projects/{company}/.opencode/agent/{name}.md`
11. Test: DM the agent in Slack, check logs
