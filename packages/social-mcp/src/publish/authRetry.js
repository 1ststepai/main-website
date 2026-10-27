import { mcpError } from "../errors.js";

export async function readJson(response) {
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function isInvalidGrantPayload(payload) {
  const parts = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const key of ["error", "error_description", "message", "code", "status"]) {
      const item = value[key];
      if (typeof item === "string") parts.push(item);
      else if (item && typeof item === "object") visit(item);
    }
  };
  visit(payload);
  const blob = parts.join(" ").toLowerCase();
  return blob.includes("invalid_grant") || blob.includes("revoked");
}

export function invalidGrantError(message) {
  const error = mcpError("invalid_grant", message || "Refresh token was revoked. Reconnect the account.", 401);
  error.revoked = true;
  return error;
}

/**
 * One publish attempt may refresh after a 401 a single time, then retry the
 * platform call once. A second 401, or invalid_grant/revoked, stops.
 */
export async function sendWithRefresh({ budget, secrets, send, refresh, onSecrets, onNeedsReconnect }) {
  const state = budget || { used: false };
  let current = secrets;
  let response = await send(current);
  if (response?.status !== 401) return { response, secrets: current };

  const stop = async (message) => {
    if (onNeedsReconnect) await onNeedsReconnect();
    throw mcpError("needs_reconnect", message, 401);
  };

  if (state.used || typeof refresh !== "function") {
    await stop("Platform returned 401. Reconnect this account. Not retrying.");
  }
  state.used = true;

  let next;
  try {
    next = await refresh(current);
  } catch (error) {
    if (error?.revoked || error?.code === "invalid_grant") {
      if (onNeedsReconnect) await onNeedsReconnect();
    }
    throw error;
  }
  current = next || current;
  if (onSecrets) await onSecrets(current);
  response = await send(current);
  if (response?.status === 401) {
    await stop("Platform returned 401 after one token refresh. Reconnect this account.");
  }
  return { response, secrets: current };
}
