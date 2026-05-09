import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_PREVIEW_CHARS = 700;

function manifestFromFiles(files, written = false) {
  return files.map((file) => ({
    path: file.path,
    bytes: Buffer.byteLength(file.content, "utf8"),
    written
  }));
}

function previewFromFiles(files) {
  return files.slice(0, 3).map((file) => ({
    path: file.path,
    preview: file.content.slice(0, MAX_PREVIEW_CHARS)
  }));
}

async function saveToVercelKv(lead, files) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return null;
  }

  const key = `app_idea_checker:${lead.lead_id}`;
  const body = JSON.stringify({ lead, files });
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(["SET", key, body])
  });

  if (!response.ok) {
    throw new Error(`Vercel KV save failed with status ${response.status}`);
  }

  return {
    mode: "vercel_kv",
    persisted: true,
    generated_files: manifestFromFiles(files, false),
    preview_files: previewFromFiles(files)
  };
}

async function saveToLocalFiles(lead, files) {
  const root = path.resolve(process.cwd(), "generated-projects");
  const leadPath = path.resolve(root, lead.project_slug, "lead.json");

  if (!leadPath.startsWith(root)) {
    throw new Error("Unsafe generated lead path");
  }

  await mkdir(path.dirname(leadPath), { recursive: true });
  await writeFile(leadPath, `${JSON.stringify(lead, null, 2)}\n`, "utf8");

  for (const file of files) {
    const relativePath = file.path.replace(/^generated-projects[\\/]/, "");
    const absolutePath = path.resolve(root, relativePath);
    if (!absolutePath.startsWith(root)) {
      throw new Error(`Unsafe generated file path: ${file.path}`);
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
  }

  return {
    mode: "local_json_files",
    persisted: true,
    generated_files: manifestFromFiles(files, true),
    preview_files: previewFromFiles(files)
  };
}

export async function saveReportIntake({ lead, files }) {
  try {
    const kvResult = await saveToVercelKv(lead, files);
    if (kvResult) {
      return kvResult;
    }
  } catch (error) {
    console.warn("App idea checker KV storage unavailable:", error.message);
  }

  if (process.env.VERCEL) {
    console.log("App idea checker no-op storage on Vercel without KV:", {
      lead_id: lead.lead_id,
      project_slug: lead.project_slug,
      file_count: files.length
    });
    return {
      mode: "noop",
      persisted: false,
      generated_files: manifestFromFiles(files, false),
      preview_files: previewFromFiles(files)
    };
  }

  try {
    return await saveToLocalFiles(lead, files);
  } catch (error) {
    console.warn("App idea checker local file storage unavailable:", error.message);
    console.log("App idea checker no-op storage payload:", {
      lead_id: lead.lead_id,
      project_slug: lead.project_slug,
      file_count: files.length
    });
    return {
      mode: "noop",
      persisted: false,
      generated_files: manifestFromFiles(files, false),
      preview_files: previewFromFiles(files)
    };
  }
}
