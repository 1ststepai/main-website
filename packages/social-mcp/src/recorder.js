/**
 * Session recorder. Off by default; the owner starts it per session in the desk.
 *
 * Files stay on this computer only, under <home>/recordings/<session-id>/:
 *   events.jsonl  structured, timestamped app events (connects, queued items, approvals, errors, publish results)
 *   desk.webm     optional screen recording the owner picked in the browser (no audio by default)
 *   summary.md    demo moments with offsets from the start
 *   meta.json     name and timing
 * Nothing here uploads, posts, or shares a recording. Payloads are reduced to an allowlist and redacted.
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const ID_RE = /^rec_[0-9]{8}T[0-9]{6}_[a-f0-9]{6}$/;
const FILES = new Set(["events.jsonl", "desk.webm", "summary.md"]);
const KEEP_KEYS = new Set([
  "type", "platform", "platforms", "provider", "post_id", "bundle_id", "action_id", "action_type",
  "status", "code", "source", "destructive", "scheduled", "url", "count", "route", "note",
]);
const SECRET_KEY = /token|secret|password|passwd|pin|cookie|authorization|auth|key|code_verifier|email|phone|address|name|caption|message|description|text|comment/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const TOKENISH = /\b(?:EAA[A-Za-z0-9]{10,}|ya29\.[A-Za-z0-9._-]+|1\/\/[A-Za-z0-9._-]+|sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{10,}|[A-Za-z0-9_-]{32,})\b/g;
const QUERY_SECRET = /([?&](?:access_token|token|code|state|key|client_secret|refresh_token)=)[^&#\s]+/gi;

export function redactString(value) {
  return String(value)
    .replace(QUERY_SECRET, "$1[redacted]")
    .replace(BEARER, "$1 [redacted]")
    .replace(EMAIL, "[email]")
    .replace(TOKENISH, "[redacted]")
    .slice(0, 300);
}

/** Keep only allowlisted keys; drop anything that looks like a secret or customer content. */
export function redactEvent(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (!KEEP_KEYS.has(key)) continue;
    if (key !== "code" && key !== "type" && SECRET_KEY.test(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, 10).map((item) => redactString(item));
    else if (typeof value === "string") out[key] = redactString(value);
  }
  return out;
}

const MOMENTS = {
  recording_started: "Recording started",
  account_connected: "Account connected",
  connect_error: "Sign-in failed",
  item_queued: "Item queued",
  action_queued: "Account change queued",
  item_approved: "Owner approved",
  action_approved: "Owner approved account change",
  action_confirm_requested: "Delete confirmation shown",
  publish_result: "Published",
  action_done: "Account change applied",
  publish_error: "Error",
  action_failed: "Error",
  error: "Error",
  recording_stopped: "Recording stopped",
};

function offset(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function summarize(meta, events) {
  const start = Date.parse(meta.started_at);
  const lines = [`# ${meta.name}`, "", `Recorded ${meta.started_at}${meta.stopped_at ? ` to ${meta.stopped_at}` : ""}. Local only.`, ""];
  let firstQueued = null;
  const counts = {};
  lines.push("## Demo moments", "");
  for (const event of events) {
    const label = MOMENTS[event.type];
    if (!label) continue;
    counts[event.type] = (counts[event.type] || 0) + 1;
    const at = offset(Date.parse(event.at) - start);
    const detail = [event.platform || (event.platforms || []).join("+"), event.action_type, event.code, event.url].filter(Boolean).join(" · ");
    if (!firstQueued && (event.type === "item_queued" || event.type === "action_queued")) {
      firstQueued = at;
      lines.push(`- **${at}** First item queued${detail ? ` (${detail})` : ""}`);
      continue;
    }
    lines.push(`- **${at}** ${label}${detail ? ` (${detail})` : ""}`);
  }
  lines.push(
    "",
    "## Editing notes",
    "",
    "Raw material for an edit. Follow the video rule: hook in the first 1-2 seconds, captions on, pattern interrupts, a subscribe prompt, an end screen, and keep spoken words in their original order.",
    "",
  );
  return lines.join("\n");
}

export function createRecorder({ root, now = () => Date.now() }) {
  const dir = root;
  let active = null;

  const sessionDir = (id) => {
    if (!ID_RE.test(String(id || ""))) {
      const error = new Error("Unknown recording.");
      error.code = "not_found";
      error.statusCode = 404;
      throw error;
    }
    const path = join(dir, id);
    if (!existsSync(path)) {
      const error = new Error("Unknown recording.");
      error.code = "not_found";
      error.statusCode = 404;
      throw error;
    }
    return path;
  };
  const readMeta = (id) => JSON.parse(readFileSync(join(sessionDir(id), "meta.json"), "utf8"));
  const writeMeta = (id, meta) => writeFileSync(join(dir, id, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
  const readEvents = (id) => {
    const file = join(sessionDir(id), "events.jsonl");
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  };

  function record(type, data = {}) {
    if (!active) return false;
    const row = { at: new Date(now()).toISOString(), ...redactEvent({ ...data, type: String(type).slice(0, 60) }) };
    appendFileSync(join(dir, active.id, "events.jsonl"), `${JSON.stringify(row)}\n`, { mode: 0o600 });
    return true;
  }

  function start({ name, screen = false } = {}) {
    if (active) return { recording: describe(active.id), already: true };
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stamp = new Date(now()).toISOString().replace(/[-:]/g, "").slice(0, 15);
    const id = `rec_${stamp}_${randomBytes(3).toString("hex")}`;
    mkdirSync(join(dir, id), { mode: 0o700 });
    const meta = {
      id,
      name: redactString(name || `Desk session ${new Date(now()).toISOString().slice(0, 16).replace("T", " ")}`).slice(0, 80),
      started_at: new Date(now()).toISOString(),
      stopped_at: null,
      screen: screen === true,
      audio: false,
    };
    writeMeta(id, meta);
    active = { id };
    record("recording_started", { note: meta.screen ? "screen and events" : "events only" });
    return { recording: describe(id) };
  }

  function stop() {
    if (!active) return { recording: null };
    const id = active.id;
    record("recording_stopped");
    active = null;
    const meta = readMeta(id);
    meta.stopped_at = new Date(now()).toISOString();
    writeMeta(id, meta);
    writeFileSync(join(dir, id, "summary.md"), summarize(meta, readEvents(id)), { mode: 0o600 });
    return { recording: describe(id) };
  }

  function describe(id) {
    const meta = readMeta(id);
    const files = readdirSync(join(dir, id))
      .filter((file) => FILES.has(file))
      .map((file) => ({ name: file, bytes: statSync(join(dir, id, file)).size }));
    return { ...meta, active: active?.id === id, files, events: readEvents(id).length };
  }

  function list() {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((id) => ID_RE.test(id) && existsSync(join(dir, id, "meta.json")))
      .map(describe)
      .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  }

  function rename(id, name) {
    const meta = readMeta(id);
    const clean = redactString(String(name || "").trim()).slice(0, 80);
    if (!clean) {
      const error = new Error("Give the recording a name.");
      error.code = "invalid_name";
      error.statusCode = 400;
      throw error;
    }
    meta.name = clean;
    writeMeta(id, meta);
    if (meta.stopped_at) writeFileSync(join(dir, id, "summary.md"), summarize(meta, readEvents(id)), { mode: 0o600 });
    return { recording: describe(id) };
  }

  function remove(id) {
    const path = sessionDir(id);
    if (active?.id === id) active = null;
    rmSync(path, { recursive: true, force: true });
    return { deleted: id };
  }

  function filePath(id, file) {
    if (!FILES.has(file)) {
      const error = new Error("Unknown file.");
      error.code = "not_found";
      error.statusCode = 404;
      throw error;
    }
    const path = join(sessionDir(id), file);
    if (!existsSync(path)) {
      const error = new Error("That file was not recorded.");
      error.code = "not_found";
      error.statusCode = 404;
      throw error;
    }
    return path;
  }

  /** Stream a desk.webm upload from the owner's own browser tab into the session folder. */
  async function saveVideo(id, readable, { maxBytes = 2 * 1024 ** 3 } = {}) {
    const base = sessionDir(id);
    const temp = join(base, "desk.webm.part");
    let bytes = 0;
    await new Promise((resolve, reject) => {
      const out = createWriteStream(temp, { mode: 0o600 });
      readable.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          readable.destroy();
          out.destroy();
          const error = new Error("Recording is too large.");
          error.code = "too_large";
          error.statusCode = 413;
          reject(error);
        }
      });
      readable.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
      readable.pipe(out);
    });
    renameSync(temp, join(base, "desk.webm"));
    const meta = readMeta(id);
    meta.screen = true;
    writeMeta(id, meta);
    return { recording: describe(id), bytes };
  }

  return {
    get active() {
      return active ? describe(active.id) : null;
    },
    start,
    stop,
    record,
    list,
    describe: (id) => (sessionDir(id), describe(id)),
    rename,
    remove,
    filePath,
    saveVideo,
    readEvents,
  };
}
