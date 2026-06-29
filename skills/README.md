# Agent Hub Skills

Obsidian vault skills that agents load at startup. Copy relevant skill files here and reference them in the agent's `KNOWLEDGE_FILES` env var.

## Structure

```
skills/
├── agency/              # General agent infrastructure knowledge
│   └── agent-hub.md
├── companies/           # Per-company domain knowledge
│   ├── metroprints/
│   │   ├── business-overview.md
│   │   ├── case-management.md
│   │   └── fbi-printdeck.md
│   └── company-slug/
│       └── business-overview.md
└── playbooks/           # Operational playbooks
    ├── slack-agent-runbook.md
    ├── escalation-paths.md
    └── incident-playbook.md
```

## Skill File Format

```markdown
---
date: YYYY-MM-DD
tags:
  - skill
  - company-slug
  - topic
---

# Skill Name

## Overview

Brief description of what this skill covers.

## Key Information

- Fact 1
- Fact 2

## Procedures

### Procedure Name

1. Step one
2. Step two
3. Step three

## References

- Link to related docs
- Link to Notion DB
```
