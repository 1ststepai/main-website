import { command } from "./workspaceStore.js";
import { decryptProtectedJson, encryptProtectedJson } from "../security/dataProtection.js";
import { applyPipelineChange, emptyPipeline, invalid, normalizePipeline, PIPELINE_SERVICES } from "./newsletterPipeline.js";

export function pipelineStorage(service = "newsletter") {
  if (!PIPELINE_SERVICES.includes(service)) throw invalid("Invalid pipeline service.");
  return { key: `firststep_admin:${service}_pipeline:v1`, purpose: `${service}-pipeline` };
}
async function read(service) {
  const { key: KEY, purpose: PURPOSE } = pipelineStorage(service);
  const response = await command(["GET", KEY]);
  if (!Object.hasOwn(response, "result") || (response.result != null && typeof response.result !== "string")) throw invalid("Pipeline storage returned an invalid response.", 503, "pipeline_storage_unavailable");
  const raw = response.result;
  const pipeline = raw == null ? emptyPipeline(service) : normalizePipeline(decryptProtectedJson(String(raw), PURPOSE));
  if (pipeline.service_type !== service) throw invalid("Stored pipeline service mismatch.", 503);
  return { raw: raw ?? null, pipeline };
}
export async function loadNewsletterPipeline(service = "newsletter") { return (await read(service)).pipeline; }
export async function changeNewsletterPipeline(change, expectedRevision, service = "newsletter") {
  const { key: KEY, purpose: PURPOSE } = pipelineStorage(service);
  const { raw, pipeline } = await read(service);
  if (pipeline.revision !== expectedRevision) throw invalid("Pipeline changed in another tab. Refresh, review your draft, then save again.", 409, "revision_conflict");
  const updated = applyPipelineChange(pipeline, change);
  const otherService = service === "ugc" ? "newsletter" : "ugc";
  const other = await read(otherService);
  if (["upsert", "import", "approve_reply", "claim_reply"].includes(change.operation)) {
    const affected = change.operation === "import" ? change.pipeline.prospects.map(p => p.id) : [change.prospect?.id || change.prospect_id];
    for (const prospect of updated.prospects.filter(p => affected.includes(p.id) && !p.suppressed && p.email)) {
      const domain = prospect.email.split("@")[1];
      if (other.pipeline.prospects.some(p => {
        const otherDomain = p.email.split("@")[1];
        return p.suppressed && otherDomain && (domain === otherDomain || domain.endsWith("." + otherDomain) || otherDomain.endsWith("." + domain));
      })) throw invalid(`This business is suppressed in the ${otherService} pipeline. Record it as Do not contact; do not create new outreach.`, 403, "contact_suppressed");
    }
  }
  const saved = { ...updated, revision: pipeline.revision + 1, updated_at: new Date().toISOString() };
  // Atomic compare-and-set protects edits and suppressions across concurrent requests.
  const result = await command(["EVAL", "local old=redis.call('GET',KEYS[1]); local other=redis.call('GET',KEYS[2]); if ((ARGV[1]=='absent' and not old) or (ARGV[1]=='present' and old==ARGV[2])) and ((ARGV[4]=='absent' and not other) or (ARGV[4]=='present' and other==ARGV[5])) then redis.call('SET',KEYS[1],ARGV[3]); return 1 end; return 0", "2", KEY, pipelineStorage(otherService).key, raw == null ? "absent" : "present", raw ?? "", encryptProtectedJson(saved, PURPOSE), other.raw == null ? "absent" : "present", other.raw ?? ""]);
  if (result.result === 0) throw invalid("Pipeline changed in another tab. Refresh, review your draft, then save again.", 409, "revision_conflict");
  if (result.result !== 1) throw invalid("Pipeline storage did not confirm the save. Refresh saved data before retrying.", 503, "pipeline_storage_unavailable");
  return saved;
}
