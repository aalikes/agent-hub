# The Forge Tracker — Notion Database Schema

Database to track every company going through the agent hub pipeline: Research → Design → Deploy → Live.

## Database Properties

| Property | Type | Purpose |
|----------|------|---------|
| **Company** | Title | Company name (e.g. "MetroPrints, LLC") |
| **Slug** | Rich text | URL-safe identifier (e.g. "metroprints") |
| **Status** | Select | `Researching` / `Designing` / `Deploying` / `Live` / `Archived` |
| **Phase** | Select | `Research` / `Design` / `Deploy` / `Live` |
| **Agents** | Number | How many agents deployed |
| **Event** | Rich text | Latest event (e.g. "Research completed", "3 agents deployed") |
| **Report** | URL | Link to research report in Obsidian vault |
| **Notes** | Rich text | Additional details |
| **Last Activity** | Date | Timestamp of last event |

## Create via Notion API

```bash
curl -X POST https://api.notion.com/v1/databases \
  -H "Authorization: Bearer ntn_..." \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": { "type": "page_id", "page_id": "YOUR_PARENT_PAGE_ID" },
    "title": [{ "type": "text", "text": { "content": "The Forge Tracker" } }],
    "properties": {
      "Company": { "title": {} },
      "Slug": { "rich_text": {} },
      "Status": { "select": { "options": [
        { "name": "Researching", "color": "blue" },
        { "name": "Designing", "color": "yellow" },
        { "name": "Deploying", "color": "orange" },
        { "name": "Live", "color": "green" },
        { "name": "Archived", "color": "gray" }
      ]}},
      "Phase": { "select": { "options": [
        { "name": "Research", "color": "blue" },
        { "name": "Design", "color": "yellow" },
        { "name": "Deploy", "color": "orange" },
        { "name": "Live", "color": "green" }
      ]}},
      "Agents": { "number": {} },
      "Event": { "rich_text": {} },
      "Report": { "url": {} },
      "Notes": { "rich_text": {} },
      "Last Activity": { "date": {} }
    }
  }'
```

## Programmatic Creation

The `listener-utils.mjs` includes `createAgentHubTracker(apiKey, parentPageId)` that creates this database via the Notion API. The `deploy-all.mjs` logs to it automatically.

```javascript
import { createAgentHubTracker } from "./listener-utils.mjs";
const dbId = await createAgentHubTracker("ntn_...", "parent-page-id");
```

## Integration with deploy-all.mjs

Add to your company config:

```json
{
  "infrastructure": {
    "notion_api_key": "ntn_...",
    "notion_tracker_db_id": "DATABASE_ID_FROM_ABOVE"
  }
}
```

When `deploy-all.mjs` runs, it automatically:
1. Searches for an existing row matching the company slug
2. Creates or updates the Notion page with deployment status
3. Sets Status → "Deploying", Phase → "Deploy", updates agent count and timestamp

## Example Row (MetroPrints)

| Property | Value |
|----------|-------|
| Company | MetroPrints, LLC |
| Slug | metroprints |
| Status | 🟢 Live |
| Phase | Live |
| Agents | 2 |
| Event | Agent "Casey" and "Penny" deployed via agent-hub |
| Report | `file://vault/Skills/metroprints/Context/deploy-report-2026-06-29.md` |
| Last Activity | 2026-06-29T22:00:00Z |
