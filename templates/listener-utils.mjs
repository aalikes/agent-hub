// ── Agent Hub Listener Utilities ────────────────────
// Shared by all agents. Imported by listener.mjs.
//
// Provides:
//   - subAgentSpawn(prompt, options)  → spawn a sub-agent via DeepSeek
//   - routeAlert(severity, message)    → determine channel from alert_routing config
//   - formatChannelName(name)          → normalize channel names (#prefix)
//   - notifyOwner(message)             → DM the workspace owner
//   - logCron(job, status)             → structured cron logging

// ── Sub-Agent Spawning ──────────────────────────────

/**
 * Spawn a sub-agent by sending a separate LLM call as a sub-agent identity.
 * The parent collects results and reports back.
 *
 * @param {string} prompt - The task for the sub-agent
 * @param {object} options
 * @param {string} options.role - Sub-agent role name (e.g. "Market Researcher")
 * @param {string} options.apiKey - DeepSeek API key
 * @param {number} options.maxTokens - Max tokens for sub-agent response
 * @returns {Promise<{text: string, role: string}>}
 */
export async function spawnSubAgent(prompt, { role = "Sub-Agent", apiKey, model = "deepseek-chat", maxTokens = 1500 } = {}) {
  if (!apiKey) {
    console.error(`[subagent] Cannot spawn "${role}" — no API key`);
    return { text: `[Sub-agent "${role}" could not execute — no API key configured]`, role };
  }

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a specialized sub-agent with the role: ${role}. Execute the task given by the user. Be thorough, cite sources, and return actionable results. Do NOT ask clarifying questions — do your best with the information provided.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: maxTokens,
      }),
    });

    const j = await res.json();
    if (j.error) {
      console.error(`[subagent] "${role}" LLM error:`, JSON.stringify(j.error));
      return { text: `[Sub-agent "${role}" failed: ${j.error.message || "unknown error"}]`, role };
    }

    const text = j.choices?.[0]?.message?.content || "";
    console.log(`[subagent] "${role}" returned ${text.length} chars`);
    return { text, role };
  } catch (e) {
    console.error(`[subagent] "${role}" error:`, e.message);
    return { text: `[Sub-agent "${role}" failed: ${e.message}]`, role };
  }
}

/**
 * Spawn multiple sub-agents in parallel and collect results.
 *
 * @param {Array<{role: string, prompt: string}>} tasks
 * @param {object} options - passed to spawnSubAgent
 * @returns {Promise<Array<{text: string, role: string}>>}
 */
export async function spawnSubAgents(tasks, options = {}) {
  console.log(`[subagent] Spawning ${tasks.length} sub-agents in parallel...`);
  const results = await Promise.all(
    tasks.map(task => spawnSubAgent(task.prompt, { ...options, role: task.role }))
  );
  console.log(`[subagent] All ${tasks.length} sub-agents completed`);
  return results;
}

// ── Alert Routing ────────────────────────────────────

/**
 * Route an alert to the appropriate channel based on severity.
 *
 * @param {string} severity - p0, p1, p2, p3
 * @param {object} alertRouting - Alert routing config from company.json
 * @param {object} channels - Channel name map from company.json
 * @returns {{channel: string, threshold: string, label: string}}
 */
export function routeAlert(severity, alertRouting = {}, channels = {}) {
  const level = severity.toLowerCase();
  const routing = alertRouting[level];

  if (!routing) {
    return {
      channel: channels.alerts || "alerts",
      threshold: "unknown",
      label: "UNKNOWN",
    };
  }

  const channelName = routing.channel || "alerts";
  const channelKey = channels[channelName] || channelName;

  return {
    channel: channelKey.startsWith("#") ? channelKey : `#${channelKey}`,
    threshold: routing.threshold || "",
    label: level.toUpperCase(),
    examples: routing.examples || [],
  };
}

/**
 * Build a formatted alert message with severity prefix.
 *
 * @param {string} severity - p0, p1, p2, p3
 * @param {string} message - Alert message body
 * @param {string} source - Who/what triggered the alert
 * @returns {string}
 */
export function formatAlert(severity, message, source = "") {
  const emoji = {
    p0: "🔴",
    p1: "🟠",
    p2: "🟡",
    p3: "🔵",
  };
  const label = severity.toUpperCase();
  const prefix = emoji[label] || "⚪";
  const sourceLine = source ? `\n_Source: ${source}_` : "";

  return `${prefix} *${label} Alert*${sourceLine}\n> ${message}`;
}

// ── Channel Utilities ────────────────────────────────

/**
 * Normalize a channel name to always have # prefix.
 */
export function formatChannel(name) {
  if (!name) return "#general";
  return name.startsWith("#") ? name : `#${name}`;
}

/**
 * DM the workspace owner.
 */
export async function notifyOwner(message, { slackApi, ownerUserId }) {
  if (!ownerUserId) {
    console.log("[notify] No owner user ID configured — skipping DM");
    return;
  }

  try {
    // Open DM channel with owner
    const dm = await slackApi("conversations.open", { users: ownerUserId });
    if (!dm.ok || !dm.channel?.id) {
      console.error("[notify] Could not open DM with owner:", dm.error);
      return;
    }

    await slackApi("chat.postMessage", {
      channel: dm.channel.id,
      text: message,
      unfurl_links: false,
      unfurl_media: false,
    });
    console.log(`[notify] DM sent to owner (${ownerUserId})`);
  } catch (e) {
    console.error("[notify] Failed to DM owner:", e.message);
  }
}

// ── Cron Logging ─────────────────────────────────────

/**
 * Structured log entry for cron job execution.
 */
export function logCron(job, status, detail = "") {
  const ts = new Date().toISOString();
  const entry = {
    timestamp: ts,
    job,
    status, // "started", "completed", "failed", "skipped"
    detail,
  };
  console.log(`[cron] ${ts} | ${job} | ${status}${detail ? " | " + detail : ""}`);
  return entry;
}

// ── Health Check ─────────────────────────────────────

/**
 * Run a health check and return status object.
 */
export async function healthCheck({ slackApi, agentName, botUserId }) {
  const checks = {
    agent: { status: "ok", detail: `${agentName} running` },
    socket: { status: "unknown", detail: "" },
    llm: { status: "unknown", detail: "" },
    slack: { status: "unknown", detail: "" },
  };

  // Check Slack connection by calling auth.test
  try {
    const auth = await slackApi("auth.test", {});
    if (auth.ok) {
      checks.slack = { status: "ok", detail: `Connected as ${auth.user} (${auth.team})` };
    } else {
      checks.slack = { status: "error", detail: auth.error };
    }
  } catch (e) {
    checks.slack = { status: "error", detail: e.message };
  }

  // Check LLM by making a minimal call
  try {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) {
      checks.llm = { status: "error", detail: "No DEEPSEEK_API_KEY" };
    } else {
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
      });
      const j = await res.json();
      checks.llm = j.error
        ? { status: "error", detail: j.error.message }
        : { status: "ok", detail: "DeepSeek API responding" };
    }
  } catch (e) {
    checks.llm = { status: "error", detail: e.message };
  }

  const allOk = Object.values(checks).every(c => c.status === "ok");

  return {
    healthy: allOk,
    timestamp: new Date().toISOString(),
    agent: agentName,
    bot_user_id: botUserId,
    checks,
  };
}
