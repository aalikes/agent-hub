# Agent Design Template

> Phase 2 output. Complete for each company after research, before deployment.

Save to: `vault/COMPANY_NAME/agents/agent-design.md`

```markdown
---
date: YYYY-MM-DD
tags:
  - COMPANY_NAME
  - agents
  - design
---

# COMPANY_NAME Agent Design

## Research Basis
- Research report: research-report-YYYY-MM-DD
- Date completed: YYYY-MM-DD

## Agent Roster

### Agent 1 — AGENT_NAME
| Field | Value |
|-------|-------|
| Role | Domain ownership (1-2 sentences) |
| Archetype | case-management / finance / operations / custom |
| Slack app needed | yes / no |

Responsibilities:
- Responsibility 1
- Responsibility 2

Boundaries:
- What this agent does NOT do

Tools:
- Slack scopes: channels:read, chat:write, app_mentions:read, ...
- APIs: DeepSeek, Notion, Square, ...
- Notion DBs: db-id-1, db-id-2
- External services: FDLE Portal, insurance API, ...

Cron Jobs:
| Time | Job | Channel |
|------|-----|---------|
| 8:00 AM daily | Morning standup | #alerts |
| 9:00 AM daily | Stale case sweep | #critical |
| Fri 4:00 PM | Weekly review | #alerts |

Alerts:
- P0 (Critical, <1 hr): criteria → #critical
- P1 (Urgent, by EOD): criteria → #critical
- P2 (Standard, 3-5 days): criteria → #alerts
- P3 (FYI, weekly): criteria → #alerts

Coordination:
- Hands off to OTHER_AGENT for TASK
- Receives from OTHER_AGENT for TASK

Personality:
Tone and communication style. Be specific.

System Prompt Notes:
- Key domain knowledge to include
- Pitch/brand voice to match
- Conversation style preferences
```
