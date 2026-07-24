import { fetchWithTimeout } from "../http/fetchWithTimeout.js";
import { createEmptyWorkspace, normalizeWorkspace } from "./workspaceModel.js";

const WORKSPACE_KEY = "firststep_admin:workspace:v1";

function configuration() {
  const url = String(process.env.KV_REST_API_URL || "");
  const token = String(process.env.KV_REST_API_TOKEN || "");
  if (!url || !token) {
    const error = new Error("Admin storage is not configured");
    error.code = "admin_storage_not_configured";
    error.statusCode = 503;
    throw error;
  }
  const parsed = new URL(url);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) {
    const error = new Error("KV_REST_API_URL must use HTTPS");
    error.code = "admin_storage_not_configured";
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
    const error = new Error(`Admin storage request failed with status ${response.status}`);
    error.code = "admin_storage_unavailable";
    error.statusCode = 503;
    throw error;
  }
  return response.json();
}

export async function loadAdminWorkspace() {
  const response = await command(["GET", WORKSPACE_KEY]);
  if (response.result === null || response.result === undefined) return createEmptyWorkspace();
  try {
    return normalizeWorkspace(JSON.parse(response.result));
  } catch {
    const error = new Error("Stored admin workspace is invalid");
    error.code = "admin_storage_invalid";
    error.statusCode = 503;
    throw error;
  }
}

export async function saveAdminWorkspace(input, expectedRevision) {
  const current = await loadAdminWorkspace();
  if (current.revision !== expectedRevision) {
    const error = new Error("This workspace changed in another tab. Refresh before saving.");
    error.code = "revision_conflict";
    error.statusCode = 409;
    throw error;
  }
  const normalized = normalizeWorkspace(input);
  const saved = {
    ...normalized,
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
  };
  await command(["SET", WORKSPACE_KEY, JSON.stringify(saved)]);
  return saved;
}
