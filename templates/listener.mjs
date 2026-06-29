import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── Config (set via deploy.sh or manually) ──────────

const XAPP = process.env.SLACK_XAPP_TOKEN || "";
const XOXB = process.env.SLACK_XOXB_TOKEN || "";
const SLACK_API = "https://slack.com/api";
const BOT_USER_ID = process.env.SLACK_BOT_USER_ID || "";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const NOTION_KEY = process.env.NOTION_API_KEY || "";
const NOTION_VERSION = "2022-06-28";

// ── Agent Identity (set via deploy.sh) ──────────────

const AGENT_NAME = process.env.AGENT_NAME || "agent";
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT || "";
const KNOWLEDGE_FILES = (process.env.KNOWLEDGE_FILES || "").split(",").filter(Boolean);

// ── Deduplication ───────────────────────────────────

const recentEvents = new Set();
function isDuplicate(channel, user, ts) {
  const key = `${channel}:${user}:${ts}`;
  if (recentEvents.has(key)) return true;
  recentEvents.add(key);
  setTimeout(() => recentEvents.delete(key), 5000);
  return false;
}

// ── Active Threads (30-min window) ──────────────────

const activeThreads = new Map();
function trackThread(threadTs) {
  if (!threadTs) return;
  activeThreads.set(threadTs, Date.now());
  setTimeout(() => {
    const last = activeThreads.get(threadTs);
    if (last && Date.now() - last >= 30 * 60 * 1000) activeThreads.delete(threadTs);
  }, 30 * 60 * 1000);
}
function isActiveThread(event) {
  const threadTs = event.thread_ts || event.ts;
  if (activeThreads.has(threadTs)) {
    activeThreads.set(threadTs, Date.now());
    return true;
  }
  for (const [key] of activeThreads) {
    if (threadTs.startsWith(key) || key.startsWith(threadTs)) {
      activeThreads.set(key, Date.now());
      return true;
    }
  }
  return false;
}

// ── Slack API ───────────────────────────────────────

async function slack(method, body, token = XOXB) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getWebSocketUrl() {
  const res = await slack("apps.connections.open", {}, XAPP);
  if (!res.ok) throw new Error(`apps.connections.open failed: ${res.error}`);
  return res.url;
}

function isMentioned(text) {
  return text.includes(`<@${BOT_USER_ID}>`);
}

function cleanText(text) {
  return text.replace(new RegExp(`<@${BOT_USER_ID}>\\s*`, "g"), "").trim();
}

// ── Notion API ──────────────────────────────────────

async function notion(method, path, body = null) {
  if (!NOTION_KEY) return { error: "No Notion API key" };
  const opts = {
    method,
    headers: { "Authorization": `Bearer ${NOTION_KEY}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.notion.com/v1${path}`, opts);
  return res.json();
}

async function notionSearch(query) {
  return notion("POST", "/search", { query, page_size: 10 });
}

async function notionQueryDB(dbId, filter = {}) {
  return notion("POST", `/databases/${dbId}/query`, {
    page_size: 20,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    ...(Object.keys(filter).length ? { filter } : {}),
  });
}

// ── Obsidian Knowledge ──────────────────────────────

let loadedKnowledge = "";

function loadKnowledge() {
  if (!OBSIDIAN_VAULT) return "";
  const parts = [];
  for (const file of KNOWLEDGE_FILES) {
    const path = join(OBSIDIAN_VAULT, file);
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        parts.push(`### ${file.replace(".md", "")}\n${content.substring(0, 3000)}`);
        console.log(`[${AGENT_NAME}] Loaded knowledge: ${file}`);
      } catch (e) {
        console.error(`[${AGENT_NAME}] Failed to read ${file}:`, e.message);
      }
    }
  }
  loadedKnowledge = parts.join("\n\n---\n\n");
  return loadedKnowledge;
}

// ── System Prompt ───────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are {{AGENT_DISPLAY_NAME}}, the {{COMPANY_NAME}} {{AGENT_ROLE}} agent.

## Identity
- {{COMPANY_NAME}} is a {{COMPANY_DESCRIPTION}}.
- Website: {{COMPANY_WEBSITE}}
- You manage {{DOMAIN_SCOPE}}.

## What You Do
{{AGENT_RESPONSIBILITIES}}

## What You DO NOT Do
{{AGENT_BOUNDARIES}}

## Agent Coordination
{{AGENT_COORDINATION}}

## Cron Jobs You Run
{{AGENT_CRON_JOBS}}

## Response Style
{{AGENT_PERSONALITY}}`;

function buildSystemPrompt() {
  return `${BASE_SYSTEM_PROMPT}

## Obsidian Knowledge (live from vault)
${loadedKnowledge || "(no knowledge loaded)"}`;
}

// ── LLM ────────────────────────────────────────────

async function think(messages) {
  if (!DEEPSEEK_KEY) return null;
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${DEEPSEEK_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "deepseek-chat", messages, temperature: 0.7, max_tokens: 1000 }),
    });
    const j = await res.json();
    if (j.error) { console.error(`[${AGENT_NAME}] LLM error:`, JSON.stringify(j.error)); return null; }
    return j.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error(`[${AGENT_NAME}] LLM error:`, e.message);
    return null;
  }
}

// ── Context Fetch ───────────────────────────────────

async function fetchContext(channel, thread, count = 40) {
  try {
    const params = { channel, limit: count };
    if (thread) params.ts = thread;
    const res = await slack("conversations.replies", params);
    if (!res.ok || !res.messages) return [];
    return res.messages
      .filter((m) => m.text)
      .map((m) => {
        let text = m.text;
        text = text.replace(/<@\w+>/g, (match) => {
          const id = match.slice(2, -1);
          return id === BOT_USER_ID ? `@${AGENT_NAME}` : match;
        });
        text = text.replace(/<!channel>/g, "@channel");
        text = text.replace(/<([^>|]+)\|[^>]+>/g, "$1");
        text = text.replace(/<([^>]+)>/g, "$1");
        return { role: m.user === BOT_USER_ID ? "assistant" : "user", content: text };
      });
  } catch {
    return [];
  }
}

// ── Context Folding ─────────────────────────────────

async function foldContext(messages) {
  const estimateTokens = (arr) => arr.reduce((sum, m) => sum + Math.ceil((m.content?.length || 0) / 4), 0);
  if (estimateTokens(messages) < 15000) return messages;
  const split = Math.floor(messages.length * 0.6);
  if (split < 4) return messages;
  const toSummarize = messages.slice(0, split);
  const recent = messages.slice(split);
  try {
    const summary = await think([
      { role: "system", content: "Summarize this conversation in 2-3 sentences. Preserve: names, details, decisions, action items." },
      { role: "user", content: toSummarize.map(m => `[${m.role}]: ${m.content}`).join("\n") },
    ]);
    if (summary) {
      console.log(`[${AGENT_NAME}] Context folded: ${toSummarize.length} msgs → summary`);
      return [{ role: "system", content: `[Earlier conversation: ${summary}]` }, ...recent];
    }
  } catch (e) {
    console.error(`[${AGENT_NAME}] Context fold failed:`, e.message);
  }
  return messages;
}

// ── Handle ──────────────────────────────────────────

async function handle(channel, user, text, thread) {
  try {
    let userName = "there";
    try {
      const u = await slack("users.info", { user });
      if (u.ok && u.user?.real_name) userName = u.user.real_name;
    } catch (e) {
      console.error(`[${AGENT_NAME}] users.info error:`, e.message);
    }

    console.log(`[${AGENT_NAME}] Handling "${text.substring(0, 60)}" from ${userName}`);

    const history = await fetchContext(channel, thread);
    const prior = history.filter(m => m.content && m.content.trim()).slice(0, -1);
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...prior,
      { role: "user", content: `[${userName}]: ${text}` },
    ];

    const folded = await foldContext(messages);
    const llmReply = await think(folded);

    let reply;
    if (llmReply) {
      reply = llmReply;
    } else {
      reply = `Hey ${userName.split(" ")[0]}! I'm {{AGENT_DISPLAY_NAME}}, {{AGENT_ROLE}} for {{COMPANY_NAME}}. {{AGENT_FALLBACK}}`;
    }

    await slack("chat.postMessage", { channel, text: reply, thread_ts: thread, unfurl_links: false, unfurl_media: false });
    trackThread(thread);
    console.log(`[${AGENT_NAME}] Replied in ${channel}`);
  } catch (e) {
    console.error(`[${AGENT_NAME}] handle error:`, e.message);
    try {
      await slack("chat.postMessage", { channel, text: "Sorry, something went wrong. Try again?", thread_ts: thread, unfurl_links: false, unfurl_media: false });
      trackThread(thread);
    } catch {}
  }
}

// ── Socket Mode ─────────────────────────────────────

async function connect() {
  const url = await getWebSocketUrl();
  console.log(`[${AGENT_NAME}] Connecting to Slack Socket Mode...`);
  const ws = new WebSocket(url);
  let pingInterval;

  ws.onopen = () => {
    console.log(`[${AGENT_NAME}] Connected. Listening.`);
    pingInterval = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 30000);
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "hello") {
        console.log(`[${AGENT_NAME}] Hello, connections: ${msg.num_connections}`);
        return;
      }

      if (msg.type === "disconnect") {
        console.log(`[${AGENT_NAME}] Disconnect: ${msg.reason}. Reconnecting...`);
        clearInterval(pingInterval);
        ws.close();
        setTimeout(connect, 1000);
        return;
      }

      if (msg.type === "events_api" && msg.payload?.event) {
        const evt = msg.payload.event;
        ws.send(JSON.stringify({ envelope_id: msg.envelope_id, type: "ack" }));

        if (evt.user === BOT_USER_ID) return;
        if (evt.subtype === "message_changed" || evt.subtype === "message_deleted") return;

        const text = evt.text || "";

        // Thread continuation (30-min window, no @mention needed)
        if (evt.type === "message" && isActiveThread(evt) && text.trim()) {
          await handle(evt.channel, evt.user, cleanText(text), evt.ts);
          return;
        }

        // app_mention event
        if (evt.type === "app_mention") {
          if (isDuplicate(evt.channel, evt.user, evt.ts)) return;
          await handle(evt.channel, evt.user, cleanText(text), evt.ts);
          return;
        }

        // @mention in regular message
        if (evt.type === "message" && isMentioned(text)) {
          if (isDuplicate(evt.channel, evt.user, evt.ts)) return;
          await handle(evt.channel, evt.user, cleanText(text), evt.ts);
          return;
        }
      }
    } catch (e) {
      console.error(`[${AGENT_NAME}] Error:`, e.message);
    }
  };

  ws.onerror = (err) => console.error(`[${AGENT_NAME}] WS error:`, err.message || err);

  ws.onclose = (event) => {
    console.log(`[${AGENT_NAME}] Closed (${event.code}). Reconnect in 5s...`);
    clearInterval(pingInterval);
    setTimeout(connect, 5000);
  };
}

// ── Start ───────────────────────────────────────────

console.log(`[${AGENT_NAME}] Starting Socket Mode listener...`);
if (OBSIDIAN_VAULT) loadKnowledge();
connect();
