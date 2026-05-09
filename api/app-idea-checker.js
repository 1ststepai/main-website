import { generateMarkdownPack } from "../lib/appIdeaChecker/generateMarkdownPack.js";
import { forwardLead, REPO_CREATION_STATUS } from "../lib/appIdeaChecker/forwardLead.js";
import { normalizeLead } from "../lib/appIdeaChecker/normalizeLead.js";
import { saveReportIntake } from "../lib/appIdeaChecker/storageAdapter.js";

const MAX_PAYLOAD_BYTES = 100 * 1024;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      const parseError = new Error("Request body must be valid JSON");
      parseError.statusCode = 400;
      throw parseError;
    }
  }
  return req.body;
}

function payloadTooLarge(req, payload) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return true;
  }

  return Buffer.byteLength(JSON.stringify(payload || {}), "utf8") > MAX_PAYLOAD_BYTES;
}

function generatedFileList(files, projectSlug) {
  const prefix = `generated-projects/${projectSlug}/`;
  return files.map((file) => file.path.replace(prefix, ""));
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const payload = parseBody(req);

    if (payloadTooLarge(req, payload)) {
      return sendJson(res, 413, {
        ok: false,
        error: "Payload too large"
      });
    }

    const lead = normalizeLead(payload);
    const files = generateMarkdownPack(lead);
    const generatedFiles = generatedFileList(files, lead.project_slug);
    const storage = await saveReportIntake({ lead, files });
    const contextPackStatus = "generated";
    const forwarding = await forwardLead({
      lead,
      contextPackStatus,
      generatedFiles
    });

    return sendJson(res, 200, {
      ok: true,
      lead_id: lead.lead_id,
      project_slug: lead.project_slug,
      score: lead.score,
      category: lead.category,
      lead_quality: lead.lead_quality,
      recommended_path: lead.recommended_path,
      tags: lead.tags,
      context_pack_status: contextPackStatus,
      generated_files: generatedFiles,
      generated_file_manifest: storage.generated_files,
      storage: {
        mode: storage.mode,
        persisted: storage.persisted,
        preview_files: storage.preview_files
      },
      forwarding,
      repo_creation_status: REPO_CREATION_STATUS
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendJson(res, statusCode, {
      ok: false,
      error: statusCode === 500 ? "Internal server error" : error.message,
      issues: error.errors || undefined
    });
  }
}
