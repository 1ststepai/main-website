import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithTimeout } from "../http/fetchWithTimeout.js";

const DEFAULT_RETENTION_SECONDS = 90 * 24 * 60 * 60;

function retentionSeconds() {
  const raw = process.env.APP_IDEA_RETENTION_SECONDS;
  if (!raw) {
    return DEFAULT_RETENTION_SECONDS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 24 * 60 * 60 || parsed > 365 * 24 * 60 * 60) {
    throw new Error("APP_IDEA_RETENTION_SECONDS must be an integer from 86400 to 31536000");
  }
  return parsed;
}

function manifestFromFiles(files, written = false) {
  return files.map((file) => ({
    path: file.path,
    bytes: Buffer.byteLength(file.content, "utf8"),
    written
  }));
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function storageErrorCode(error) {
  const message = String(error && error.message ? error.message : "");
  if (/status \d{3}/i.test(message)) {
    return "upstream_http_error";
  }
  if (/must use HTTPS|must be an integer|Invalid URL/i.test(message)) {
    return "invalid_configuration";
  }
  if (/abort|timeout/i.test(message)) {
    return "timeout";
  }
  return "unavailable";
}

async function saveToVercelKv(lead, files) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return null;
  }

  const parsedUrl = new URL(url);
  const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && !localDevelopment) {
    throw new Error("KV_REST_API_URL must use HTTPS");
  }

  const key = `app_idea_checker:${lead.lead_id}`;
  const expiresInSeconds = retentionSeconds();
  const body = JSON.stringify({
    lead: {
      ...lead,
      retention_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    },
    files
  });
  const response = await fetchWithTimeout(parsedUrl.toString().replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(["SET", key, body, "EX", expiresInSeconds])
  }, 5000);

  if (!response.ok) {
    throw new Error(`Vercel KV save failed with status ${response.status}`);
  }

  return {
    mode: "vercel_kv",
    persisted: true,
    retention_seconds: expiresInSeconds,
    generated_files: manifestFromFiles(files, false)
  };
}

async function saveToLocalFiles(lead, files) {
  const root = path.resolve(process.cwd(), "generated-projects");
  const leadPath = path.resolve(root, lead.project_slug, "lead.json");

  if (!isWithinRoot(root, leadPath)) {
    throw new Error("Unsafe generated lead path");
  }

  await mkdir(path.dirname(leadPath), { recursive: true });
  await writeFile(leadPath, `${JSON.stringify(lead, null, 2)}\n`, "utf8");

  for (const file of files) {
    const relativePath = file.path.replace(/^generated-projects[\\/]/, "");
    const absolutePath = path.resolve(root, relativePath);
    if (!isWithinRoot(root, absolutePath)) {
      throw new Error(`Unsafe generated file path: ${file.path}`);
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
  }

  return {
    mode: "local_json_files",
    persisted: true,
    retention_seconds: null,
    generated_files: manifestFromFiles(files, true)
  };
}

export async function saveReportIntake({ lead, files }) {
  try {
    const kvResult = await saveToVercelKv(lead, files);
    if (kvResult) {
      return kvResult;
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "app_idea_checker_storage_failed",
      storage_mode: "vercel_kv",
      error_code: storageErrorCode(error)
    }));
  }

  if (process.env.VERCEL) {
    console.info(JSON.stringify({
      event: "app_idea_checker_storage_noop",
      lead_id: lead.lead_id,
      project_slug: lead.project_slug,
      file_count: files.length
    }));
    return {
      mode: "noop",
      persisted: false,
      retention_seconds: null,
      generated_files: manifestFromFiles(files, false)
    };
  }

  try {
    return await saveToLocalFiles(lead, files);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "app_idea_checker_storage_failed",
      storage_mode: "local_json_files",
      error_code: storageErrorCode(error)
    }));
    console.info(JSON.stringify({
      event: "app_idea_checker_storage_noop",
      lead_id: lead.lead_id,
      project_slug: lead.project_slug,
      file_count: files.length
    }));
    return {
      mode: "noop",
      persisted: false,
      retention_seconds: null,
      generated_files: manifestFromFiles(files, false)
    };
  }
}
