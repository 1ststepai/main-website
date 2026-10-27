import { redactSecrets } from "./agentHandoff.js";

const ROLES = ["general-manager", "engineering", "qa-release", "content", "ops", "growth"];
const PROOF_NOTE = "A bridge completion is an owner-approved report. It is not a test run or a production check.";

function failure(state, message, extra = {}) {
  return {
    state,
    message,
    version: null,
    database: null,
    checked_at: new Date().toISOString(),
    tasks: [],
    checkpoints: [],
    proof_note: PROOF_NOTE,
    ...extra,
  };
}

export function bridgeOrigin(value, { allowLocalDefault = false, port = "8787" } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (!allowLocalDefault) return null;
    return bridgeOrigin(`http://127.0.0.1:${port}`);
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    const error = new Error("Bridge URL is invalid");
    error.code = "bridge_url_invalid";
    throw error;
  }
  const host = parsed.hostname.toLowerCase();
  const loopback = host === "127.0.0.1" || host === "localhost";
  const blockedHost = host === "169.254.169.254" || host === "metadata.google.internal" || host.endsWith(".internal");
  const privateLiteral = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  if (parsed.username || parsed.password || parsed.search || (parsed.pathname && parsed.pathname !== "/")) {
    const error = new Error("Bridge URL must be an origin without credentials, a query, or a path");
    error.code = "bridge_url_invalid";
    throw error;
  }
  if (blockedHost || privateLiteral || parsed.protocol === "file:") {
    const error = new Error("Bridge URL host is not allowed");
    error.code = "bridge_url_invalid";
    throw error;
  }
  if (parsed.protocol === "http:" && !loopback) {
    const error = new Error("Bridge URL must use https, or http on localhost");
    error.code = "bridge_url_invalid";
    throw error;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error("Bridge URL must use http or https");
    error.code = "bridge_url_invalid";
    throw error;
  }
  return parsed.origin;
}

function clip(value, maximum = 280) {
  const redacted = redactSecrets(value).replace(/\s+/g, " ").trim();
  return redacted.length > maximum ? `${redacted.slice(0, maximum - 1)}…` : redacted;
}

async function readLimited(response, maximum = 200_000) {
  const text = await response.text();
  if (text.length > maximum) {
    const error = new Error("Bridge response is too large");
    error.code = "bridge_response_too_large";
    throw error;
  }
  return text;
}

function parseRpc(text, contentType) {
  if (String(contentType || "").includes("text/event-stream")) {
    const data = text.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
    const last = data.at(-1);
    return last ? JSON.parse(last) : {};
  }
  return JSON.parse(text);
}

async function postJson(fetchImpl, url, token, payload) {
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status >= 300 && response.status < 400) {
    const error = new Error("Bridge redirected");
    error.code = "bridge_redirect";
    error.status = response.status;
    throw error;
  }
  const text = await readLimited(response);
  let body = {};
  try {
    body = text ? parseRpc(text, response.headers.get("content-type")) : {};
  } catch {
    body = { unparsed: true };
  }
  return { status: response.status, body };
}

function toolPayload(rpc) {
  if (!rpc || rpc.error || rpc.result?.isError) return null;
  const text = rpc.result?.content?.find((item) => item?.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text: clip(text, 280) };
  }
}

export async function callBridgeTool({ origin, token, name, args = {}, fetchImpl = fetch }) {
  const endpoint = new URL("/mcp", origin).toString();
  const request = (method, params) => postJson(fetchImpl, endpoint, token, {
    jsonrpc: "2.0",
    id: method === "notifications/initialized" ? undefined : 1,
    method,
    params,
  });
  let response = await request("tools/call", { name, arguments: args });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Bridge rejected the credential");
    error.code = "bridge_unauthorized";
    error.status = response.status;
    throw error;
  }
  const needsInitialize = response.status >= 400 || response.body?.error;
  if (needsInitialize) {
    await request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "1ststep-studio", version: "1.0.0" },
    });
    response = await request("tools/call", { name, arguments: args });
  }
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Bridge rejected the credential");
    error.code = "bridge_unauthorized";
    throw error;
  }
  if (response.status < 200 || response.status >= 300) {
    const error = new Error("Bridge tool call failed");
    error.code = "bridge_unavailable";
    throw error;
  }
  const payload = toolPayload(response.body);
  if (payload === null) {
    const error = new Error("Bridge tool call failed");
    error.code = "bridge_unavailable";
    throw error;
  }
  return payload;
}

function publicTask(task) {
  if (!task || typeof task !== "object") return null;
  return {
    id: clip(task.id, 80),
    title: clip(task.title, 160),
    status: clip(task.status, 40),
    assigned_to: clip(task.assigned_to, 40),
    claimed_by: clip(task.claimed_by, 40),
    updated_at: clip(task.updated_at, 40),
  };
}

function publicCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object") return null;
  return {
    id: checkpoint.id,
    role: clip(checkpoint.role, 40),
    actor: clip(checkpoint.actor, 40),
    summary: clip(checkpoint.summary, 500),
    next_action: clip(checkpoint.next_action, 300),
    blockers: clip(checkpoint.blockers, 300),
    artifacts: clip(checkpoint.artifacts, 300),
    created_at: clip(checkpoint.created_at, 40),
  };
}

export async function loadBridgeSnapshot({
  url,
  token,
  fetchImpl = fetch,
  allowLocalDefault = false,
  port,
} = {}) {
  let origin;
  try {
    origin = bridgeOrigin(url, { allowLocalDefault, port });
  } catch {
    return failure("disconnected", "The bridge URL is not allowed. Use an https origin, or http://127.0.0.1 for a local bridge.");
  }
  if (!origin) {
    return failure("not_configured", "No bridge URL is configured. Studio is not connected to a handoff bridge.");
  }
  try {
    const healthResponse = await fetchImpl(new URL("/health", origin), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (healthResponse.status >= 300 && healthResponse.status < 400) {
      return failure("disconnected", "The bridge health check redirected. Studio did not follow it.");
    }
    const healthText = await readLimited(healthResponse, 20_000);
    const health = JSON.parse(healthText);
    if (!healthResponse.ok || health.ok !== true || health.database !== true) {
      return failure("disconnected", "The bridge health check did not report a readable database.");
    }
    const base = {
      version: clip(health.version, 20) || null,
      database: true,
      checked_at: new Date().toISOString(),
    };
    if (String(token || "").length < 32) {
      return failure("health_only", "The bridge process answered /health. No read credential is configured, so tasks and checkpoints were not loaded.", base);
    }
    const tasks = await callBridgeTool({
      origin,
      token,
      name: "list_tasks",
      args: { limit: 20 },
      fetchImpl,
    });
    const checkpoints = [];
    await Promise.all(ROLES.map(async (role) => {
      try {
        const context = await callBridgeTool({
          origin,
          token,
          name: "get_role_context",
          args: { role, checkpoint_limit: 1 },
          fetchImpl,
        });
        const latest = Array.isArray(context?.checkpoints) ? context.checkpoints[0] : null;
        const pub = publicCheckpoint(latest);
        if (pub) checkpoints.push(pub);
      } catch {
        checkpoints.push({ role, unavailable: true });
      }
    }));
    return {
      state: "connected",
      message: "Studio read the bridge during this request.",
      ...base,
      tasks: (Array.isArray(tasks) ? tasks : []).map(publicTask).filter(Boolean),
      checkpoints,
      proof_note: PROOF_NOTE,
    };
  } catch (error) {
    if (error?.code === "bridge_unauthorized") {
      return failure("disconnected", "The bridge rejected the read credential. Studio did not load tasks.");
    }
    return failure("disconnected", "The bridge did not respond. No tasks or checkpoints were assumed.");
  }
}
