import { fetchWithTimeout } from "../http/fetchWithTimeout.js";
import {
  decryptProtectedJson,
  encryptProtectedJson,
  isProtectedEnvelope,
} from "../security/dataProtection.js";
import { createEmptyHandoffBoard, normalizeHandoffBoard } from "./agentHandoff.js";
import { evaluateToolChoice } from "./toolChoice.js";

const HANDOFF_KEY = "firststep_admin:agent_handoffs:v1";
const HANDOFF_PURPOSE = "admin-agent-handoffs";

function configuration() {
  const url = String(process.env.KV_REST_API_URL || "");
  const token = String(process.env.KV_REST_API_TOKEN || "");
  if (!url || !token) {
    const error = new Error("Handoff storage is not configured");
    error.code = "handoff_storage_not_configured";
    error.statusCode = 503;
    throw error;
  }
  const parsed = new URL(url);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) {
    const error = new Error("KV_REST_API_URL must use HTTPS");
    error.code = "handoff_storage_not_configured";
    error.statusCode = 503;
    throw error;
  }
  return { url: parsed.toString().replace(/\/$/, ""), token };
}

async function command(parts) {
  const { url, token } = configuration();
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parts),
  }, 5000);
  if (!response.ok) {
    const error = new Error("Handoff storage is unavailable");
    error.code = "handoff_storage_unavailable";
    error.statusCode = 503;
    throw error;
  }
  return response.json();
}

export async function loadAgentHandoffBoard() {
  const response = await command(["GET", HANDOFF_KEY]);
  if (response.result === null || response.result === undefined) return createEmptyHandoffBoard();
  const storedValue = String(response.result);
  const encrypted = isProtectedEnvelope(storedValue);
  try {
    const board = normalizeHandoffBoard(
      encrypted ? decryptProtectedJson(storedValue, HANDOFF_PURPOSE) : JSON.parse(storedValue),
      evaluateToolChoice,
    );
    if (!encrypted) {
      await command(["SET", HANDOFF_KEY, encryptProtectedJson(board, HANDOFF_PURPOSE)]);
    }
    return board;
  } catch (error) {
    if (error.code === "invalid_handoff" || error.code === "protected_data_unavailable" || error.code === "protected_data_invalid") {
      throw error;
    }
    const storedError = new Error("Stored handoffs are invalid");
    storedError.code = "handoff_storage_invalid";
    storedError.statusCode = 503;
    throw storedError;
  }
}

export async function saveAgentHandoffBoard(input, expectedRevision) {
  const current = await loadAgentHandoffBoard();
  if (current.revision !== expectedRevision) {
    const error = new Error("These handoffs changed in another tab. Refresh before saving.");
    error.code = "revision_conflict";
    error.statusCode = 409;
    throw error;
  }
  const normalized = normalizeHandoffBoard(input, evaluateToolChoice);
  const saved = {
    ...normalized,
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
  };
  await command(["SET", HANDOFF_KEY, encryptProtectedJson(saved, HANDOFF_PURPOSE)]);
  return saved;
}
