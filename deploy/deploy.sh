#!/usr/bin/env bash
set -euo pipefail

# ── Agent Hub Deploy Script ──────────────────────────
# Usage: ./deploy.sh COMPANY_SLUG AGENT_SLUG
#
# Creates agent directory, copies listener template, fills in placeholders,
# generates plist, and prints remaining manual steps.
#
# Prerequisites:
#   - Slack app already created (xapp + xoxb tokens ready)
#   - DeepSeek API key available
#   - Company project directory exists at ~/Projects/COMPANY_SLUG/

COMPANY_SLUG="${1:-}"
AGENT_SLUG="${2:-}"

if [ -z "$COMPANY_SLUG" ] || [ -z "$AGENT_SLUG" ]; then
  echo "Usage: ./deploy.sh COMPANY_SLUG AGENT_SLUG"
  echo "Example: ./deploy.sh metroprints casey"
  exit 1
fi

USER="${USER:-shahsaint-cyr}"
AGENT_HUB="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$HOME/Projects/$COMPANY_SLUG"
AGENT_DIR="$PROJECT_DIR/agents/$AGENT_SLUG"
OPECODE_AGENT_DIR="$PROJECT_DIR/.opencode/agent"

echo "=== Agent Hub Deploy: $COMPANY_SLUG / $AGENT_SLUG ==="

# ── Gather inputs ────────────────────────────────────

read -rp "Slack XAPP token (xapp-...): " XAPP
read -rp "Slack XOXB token (xoxb-...): " XOXB
read -rp "Slack Bot User ID (U0...): " BOT_USER_ID
read -rp "DeepSeek API key (sk-...): " DEEPSEEK_KEY
read -rp "Agent display name (e.g. Casey): " DISPLAY_NAME
read -rp "Agent role (e.g. case management): " AGENT_ROLE
read -rp "Company full name (e.g. MetroPrints, LLC): " COMPANY_NAME
read -rp "Company description (1 line): " COMPANY_DESC
read -rp "Company website URL: " COMPANY_WEBSITE
read -rp "Domain scope (what the agent manages): " DOMAIN_SCOPE
read -rp "Agent responsibilities (bullet points, semicolon-separated): " RESPONSIBILITIES
read -rp "Agent boundaries (what it does NOT do, semicolon-separated): " BOUNDARIES
read -rp "Agent coordination (handoff notes, semicolon-separated): " COORDINATION
read -rp "Cron jobs (time|job|channel, semicolon-separated): " CRON_JOBS
read -rp "Personality / tone: " PERSONALITY
read -rp "Fallback message (no LLM): " FALLBACK
read -rp "Obsidian vault path (or blank): " OBSIDIAN_VAULT
read -rp "Knowledge files (comma-separated, or blank): " KNOWLEDGE_FILES
read -rp "Notion API key (or blank): " NOTION_KEY
read -rp "Notion database IDs (JSON string, or blank): " NOTION_DBS
read -rp "Slack MCP XOXB token (for opencode.jsonc): " MCP_XOXB

# ── Create directories ───────────────────────────────

mkdir -p "$AGENT_DIR" "$OPECODE_AGENT_DIR"

# ── Copy and customize listener ──────────────────────

cp "$AGENT_HUB/templates/listener.mjs" "$AGENT_DIR/listener.mjs"

# Replace system prompt placeholders
sed -i '' "s|{{AGENT_DISPLAY_NAME}}|$DISPLAY_NAME|g" "$AGENT_DIR/listener.mjs"
sed -i '' "s|{{COMPANY_NAME}}|$COMPANY_NAME|g" "$AGENT_DIR/listener.mjs"
sed -i '' "s|{{AGENT_ROLE}}|$AGENT_ROLE|g" "$AGENT_DIR/listener.mjs"
sed -i '' "s|{{COMPANY_DESCRIPTION}}|$COMPANY_DESC|g" "$AGENT_DIR/listener.mjs"
sed -i '' "s|{{COMPANY_WEBSITE}}|$COMPANY_WEBSITE|g" "$AGENT_DIR/listener.mjs"
sed -i '' "s|{{DOMAIN_SCOPE}}|$DOMAIN_SCOPE|g" "$AGENT_DIR/listener.mjs"

# Build responsibility bullets
RESP_LINES=""
IFS=';' read -ra RESPS <<< "$RESPONSIBILITIES"
for r in "${RESPS[@]}"; do RESP_LINES="$RESP_LINES- ${r#"${r%%[![:space:]]*}"}\n"; done
sed -i '' "s|{{AGENT_RESPONSIBILITIES}}|$RESP_LINES|g" "$AGENT_DIR/listener.mjs"

# Build boundary bullets
BOUND_LINES=""
IFS=';' read -ra BOUNDS <<< "$BOUNDARIES"
for b in "${BOUNDS[@]}"; do BOUND_LINES="$BOUND_LINES- ${b#"${b%%[![:space:]]*}"}\n"; done
sed -i '' "s|{{AGENT_BOUNDARIES}}|$BOUND_LINES|g" "$AGENT_DIR/listener.mjs"

# Build coordination bullets
COORD_LINES=""
IFS=';' read -ra COORDS <<< "$COORDINATION"
for c in "${COORDS[@]}"; do COORD_LINES="$COORD_LINES- ${c#"${c%%[![:space:]]*}"}\n"; done
sed -i '' "s|{{AGENT_COORDINATION}}|$COORD_LINES|g" "$AGENT_DIR/listener.mjs"

# Build cron job bullets
CRON_LINES=""
IFS=';' read -ra CRONS <<< "$CRON_JOBS"
for c in "${CRONS[@]}"; do CRON_LINES="$CRON_LINES- ${c#"${c%%[![:space:]]*}"}\n"; done
sed -i '' "s|{{AGENT_CRON_JOBS}}|$CRON_LINES|g" "$AGENT_DIR/listener.mjs"

sed -i '' "s|{{AGENT_PERSONALITY}}|$PERSONALITY|g" "$AGENT_DIR/listener.mjs"
sed -i '' "s|{{AGENT_FALLBACK}}|$FALLBACK|g" "$AGENT_DIR/listener.mjs"

# ── Generate plist ───────────────────────────────────

PLIST_PATH="$HOME/Library/LaunchAgents/com.$COMPANY_SLUG.$AGENT_SLUG.listener.plist"

sed "s|{{COMPANY_SLUG}}|$COMPANY_SLUG|g; s|{{AGENT_SLUG}}|$AGENT_SLUG|g; s|{{USER}}|$USER|g; s|{{SLACK_XAPP_TOKEN}}|$XAPP|g; s|{{SLACK_XOXB_TOKEN}}|$XOXB|g; s|{{SLACK_BOT_USER_ID}}|$BOT_USER_ID|g; s|{{DEEPSEEK_API_KEY}}|$DEEPSEEK_KEY|g; s|{{AGENT_DISPLAY_NAME}}|$DISPLAY_NAME|g; s|{{COMPANY_NAME}}|$COMPANY_NAME|g; s|{{OBSIDIAN_VAULT_PATH}}|$OBSIDIAN_VAULT|g; s|{{KNOWLEDGE_FILES}}|$KNOWLEDGE_FILES|g; s|{{NOTION_API_KEY}}|$NOTION_KEY|g; s|{{NOTION_DATABASES}}|$NOTION_DBS|g" \
  "$AGENT_HUB/deploy/plist-template.xml" > "$PLIST_PATH"

# ── Copy agent definition template ───────────────────

cp "$AGENT_HUB/templates/AGENT_TEMPLATE.md" "$OPECODE_AGENT_DIR/$AGENT_SLUG.md"

# ── Print MCP config snippet ─────────────────────────

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Files created:"
echo "  Listener:    $AGENT_DIR/listener.mjs"
echo "  Plist:       $PLIST_PATH"
echo "  Agent def:   $OPECODE_AGENT_DIR/$AGENT_SLUG.md"
echo ""
echo "=== Manual Steps Remaining ==="
echo ""
echo "1. Customize agent definition:"
echo "   vim $OPECODE_AGENT_DIR/$AGENT_SLUG.md"
echo ""
echo "2. Add MCP config to ~/.config/opencode/opencode.jsonc → mcp section:"
echo "   (see deploy/mcp-config.jsonc — replace {{PROJECT_SLUG}} with \"$COMPANY_SLUG\")"
echo ""
echo "3. Add MCP permissions to ~/.config/opencode/opencode.jsonc → permissions:"
echo "   \"slack-$COMPANY_SLUG_*\": \"allow\""
echo ""
echo "4. Export env var (add to .zshrc):"
echo "   export SLACK_MCP_XOXB_TOKEN=\"$MCP_XOXB\""
echo ""
echo "5. Start the agent:"
echo "   launchctl load $PLIST_PATH"
echo ""
echo "6. Verify:"
echo "   tail -f ~/Library/Logs/com.$COMPANY_SLUG.$AGENT_SLUG.listener.log"
echo ""
echo "7. Invite to channels and test @mention in Slack."
