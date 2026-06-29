# Agent Template: Slack Bot on OpenCode

Blueprint for creating OpenCode agent definitions. Copy, fill in placeholders, save to `<project>/.opencode/agent/<name>.md`.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      OpenCode                           │
│  ┌──────────────┐   ┌──────────────────────────────┐   │
│  │ agent/*.md   │   │ MCP server (slack-<agent>)   │   │
│  │ (subagent)   │   │ → slack-mcp-server stdio     │   │
│  └──────────────┘   │ → xoxb bot token             │   │
│                     │ → tools: channels_list, etc.  │   │
│                     └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌──────────────────┐                 ┌──────────────────┐
│  OpenCode MCP    │                 │  Socket Mode     │
│  HTTP API calls  │                 │  Listener        │
│  (on-demand)     │                 │  (persistent)    │
│  Read channels   │                 │  @mentions       │
│  Post messages   │                 │  DM events       │
│  Manage groups   │                 │  app_mention     │
└──────────────────┘                 └──────────────────┘
```

## Agent Definition Template

```markdown
---
description: AGENT_NAME — ROLE_DESCRIPTION
mode: subagent
model: deepseek/deepseek-v4-pro
permission:
  read: allow
  edit: allow
  bash: ask
  webfetch: allow
  websearch: allow
---

You are AGENT_NAME, ROLE_DESCRIPTION.

## Your Role
DETAILED_ROLE_DESCRIPTION

## Available Slack Tools (via MCP)
You have access to `slack-PROJECT_*` tools:
- `slack-PROJECT_channels_list` — List all channels
- `slack-PROJECT_conversations_history` — Read messages
- `slack-PROJECT_conversations_replies` — Read thread replies
- `slack-PROJECT_conversations_search_messages` — Search messages
- `slack-PROJECT_users_search` — Find users
- `slack-PROJECT_usergroups_list` — List user groups
- `slack-PROJECT_conversations_unreads` — Get unread messages
- `slack-PROJECT_conversations_mark` — Mark as read

## COMPANY Context
- Venture: FULL_COMPANY_NAME
- Services: SERVICE_DESCRIPTION
- Website: URL
- Notion DBs: LIST_OF_DATABASE_IDS

## Standard Tasks
1. TASK_1
2. TASK_2
3. TASK_3

Always provide clear, actionable summaries. When settings are missing, provide the exact steps to fix them.
```

## Casey's Live Config (reference)

| Key | Value |
|-----|-------|
| Agent name | Casey |
| Slack app | `A0BDNNVFFDG` |
| Bot user ID | `U0BD79D3ZHD` |
| Bot ID | `B0BDNP5F1H8` |
| Workspace | MetroPrints (`T0BD9B6L8V6`) |
| MCP server | `slack-metroprints` |
| Listener | `~/Projects/metroprints/agents/casey/listener.mjs` |
| Plist | `~/Library/LaunchAgents/com.metroprints.casey.listener.plist` |
