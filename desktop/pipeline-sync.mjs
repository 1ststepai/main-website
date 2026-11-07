import { execFile } from "node:child_process";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// Private worker bridge. Approval is deliberately restricted to Studio's reviewed UI.
const allowed = ["prepare_reply", "claim_reply", "complete_reply", "block_reply", "cancel_reply", "upsert", "import"];
export function validateWorkerChange(change) {
  if (!change || !allowed.includes(change.operation)) throw new Error("Worker cannot approve replies or perform this operation.");
  return change;
}
export async function run(args = process.argv.slice(2)) {
  const [mode, service, path] = args;
  if (!["read", "write"].includes(mode) || !["newsletter", "ugc"].includes(service) || !path || args.length !== 3) throw new Error("Usage: pipeline-sync.mjs read|write newsletter|ugc private-json-path");
  const root = resolve(process.env.LOCALAPPDATA, "1stStep/Newsletter Studio");
  const encrypted = await readFile(resolve(root, "connection.dpapi"), "utf8");
  const clear = await new Promise((yes, no) => {
    const child = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", resolve(root, "app/credential.ps1"), "-Mode", "Unprotect"], { windowsHide: true, maxBuffer: 1048576 }, (error, stdout) => error ? no(new Error("Windows pairing unavailable.")) : yes(stdout));
    child.stdin.end(encrypted);
  });
  const credential = JSON.parse(clear);
  if (!credential?.id || !credential.secret || credential.pending) throw new Error("Pair this PC in Studio first.");
  const headers = { Authorization: `StudioDevice ${credential.id}.${credential.secret}`, Origin: "https://www.1ststep.ai", "Content-Type": "application/json" };
  async function request(options) {
    const response = await fetch(`https://www.1ststep.ai/api/admin-${service}-pipeline`, { headers, ...options, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Pipeline request failed (${response.status}). No automatic retry; reconcile before retrying a write.`);
    return response.json();
  }
  const current = await request();
  if (mode === "read") {
    const destination = resolve(path), temp = destination + "." + randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(current.pipeline, null, 2), { mode: 0o600 });
    await rename(temp, destination);
  } else {
    const input = await readFile(resolve(path));
    if (input.length > 2 * 1024 * 1024) throw new Error("Update exceeds private pipeline capacity.");
    const change = validateWorkerChange(JSON.parse(input));
    // A worker must supply the revision it reviewed, rather than silently rebasing a send claim.
    if (change.expected_revision !== current.pipeline.revision) throw new Error("Pipeline changed. Read and review the current revision first.");
    const result = await request({ method: "POST", body: JSON.stringify(change) });
    current.pipeline = result.pipeline;
  }
  console.log(JSON.stringify({ ok: true, service, revision: current.pipeline.revision, records: current.pipeline.prospects.length }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run().catch(() => { console.error("Private pipeline sync failed. Check pairing, revision and release status; reconcile writes before retrying."); process.exitCode = 1; });
