import { randomBytes } from "node:crypto";
import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mcpError } from "../errors.js";
import { probeMedia, stripAudio } from "./audio.js";
import { deriveImage, deriveVideo } from "./derive.js";
import { createMediaProvider, generateToFile, providerPrompt } from "./providers.js";
import { groupByAspect, masterSize, planFor, resolveDuration, validateAgainstSpec } from "./specs.js";

function fileId() {
  return randomBytes(6).toString("hex");
}

function contentType(spec) {
  return spec.container === "jpg" ? "image/jpeg" : "video/mp4";
}

export function normalizeGenerate(input = {}) {
  const source = input.media?.generate || input.generate;
  if (!source) return null;
  const prompt = String(source.prompt || "").trim();
  if (!prompt) return null;
  const type = source.type === "image" ? "image" : "video";
  const provider = String(source.provider || input.provider || "").trim();
  if (!provider || provider === "none") {
    throw mcpError("missing_provider", "Choose a media provider, or attach your own file.");
  }
  return {
    prompt: prompt.slice(0, 2000),
    type,
    style: String(source.style || "").slice(0, 200),
    duration: source.duration ? Number(source.duration) : undefined,
    provider,
    placement: String(source.placement || "").slice(0, 40),
    review: input.review === true || input.media?.review === true,
    review_provider: String(input.review_provider || input.media?.review_provider || "claude"),
  };
}

async function renderMaster({ provider, request, dest, spec, duration }) {
  const sent = providerPrompt(request.prompt, request.style, request.type);
  const state = await generateToFile(provider, {
    dest,
    prompt: sent,
    type: request.type,
    aspect: spec.aspect,
    width: spec.width,
    height: spec.height,
    duration,
    style: request.style,
    sleep: request.sleep,
  });
  if (request.type === "video") await stripAudio(dest);
  return { model: state.model || provider.model || request.provider, promptSent: sent };
}

function outputKind(group, request) {
  if (group.kind === "image") return "image";
  if (group.kind === "video") return "video";
  return request.type === "image" ? "image" : "video";
}

async function produceSet({ platforms, request, overrides, mediaDir, keys, fetchImpl, env }) {
  const targets = planFor(platforms, { type: request.type, placement: request.placement, overrides });
  const provider = createMediaProvider(request.provider, { keys, fetchImpl, env });
  const groups = groupByAspect(targets);
  const stamp = fileId();
  const assets = {};
  let model = "";
  for (const group of groups) {
    const kind = outputKind(group, request);
    const duration = kind === "video" ? resolveDuration(group.targets, request.duration) : null;
    const masterSpec = masterSize(group.targets);
    const ext = kind === "video" ? "mp4" : "png";
    const masterPath = join(mediaDir, `gen-${stamp}-${group.aspect.replace(":", "x")}.${ext}`);
    const rendered = await renderMaster({
      provider,
      request: { ...request, type: kind },
      dest: masterPath,
      spec: masterSpec,
      duration,
    });
    model = rendered.model || model;
    for (const spec of group.targets) {
      const name = `gen-${stamp}-${spec.platform}.${spec.container === "jpg" ? "jpg" : "mp4"}`;
      const dest = join(mediaDir, name);
      if (kind === "video") await deriveVideo(masterPath, dest, spec, duration);
      else await deriveImage(masterPath, dest, spec);
      const probe = await probeMedia(dest);
      const check = validateAgainstSpec(probe, spec, { silent: kind === "video" });
      if (!check.ok) {
        rmSync(dest, { force: true });
        throw mcpError("media_spec", check.message);
      }
      assets[spec.platform] = {
        path: name,
        label: spec.label,
        placement: spec.id,
        aspect: spec.aspect,
        width: probe.width,
        height: probe.height,
        duration: probe.video ? Number(probe.duration.toFixed(2)) : null,
        content_type: contentType(spec),
        spec_ok: true,
        spec_message: `${spec.label} fits ${spec.aspect}.`,
        prompt: request.prompt,
        provider: request.provider,
        model: rendered.model || request.provider,
      };
    }
    rmSync(masterPath, { force: true });
  }
  return {
    assets,
    provenance: {
      provider: request.provider,
      model: model || request.provider,
      prompt: request.prompt,
      style: request.style || "",
      type: request.type,
      ai_generated: true,
      silent: request.type === "video",
      generated_at: new Date().toISOString(),
    },
  };
}

export async function produceMedia({
  platforms,
  request,
  overrides = {},
  mediaDir,
  keys = {},
  fetchImpl,
  env,
  onlyPlatform,
}) {
  const list = (onlyPlatform ? platforms.filter((platform) => platform === onlyPlatform) : platforms).filter(Boolean);
  if (!list.length) throw mcpError("invalid_platform", "Pick at least one network.");
  const custom = [];
  const shared = [];
  for (const platform of list) {
    if (overrides?.[platform]?.generate?.prompt) custom.push(platform);
    else shared.push(platform);
  }
  const assets = {};
  let provenance = null;
  const common = { mediaDir, keys, fetchImpl, env, overrides };
  if (shared.length) {
    const made = await produceSet({ ...common, platforms: shared, request });
    Object.assign(assets, made.assets);
    provenance = made.provenance;
  }
  for (const platform of custom) {
    const ownGenerate = overrides[platform].generate;
    const own = {
      ...request,
      prompt: String(ownGenerate.prompt).slice(0, 2000),
      type: ownGenerate.type === "image" ? "image" : ownGenerate.type === "video" ? "video" : request.type,
      style: ownGenerate.style ? String(ownGenerate.style).slice(0, 200) : request.style,
      duration: ownGenerate.duration ? Number(ownGenerate.duration) : request.duration,
      provider: ownGenerate.provider || request.provider,
      placement: overrides[platform].placement || ownGenerate.placement || "",
    };
    const made = await produceSet({ ...common, platforms: [platform], request: own, overrides: {} });
    Object.assign(assets, made.assets);
    if (!provenance) provenance = made.provenance;
  }
  return { assets, provenance };
}

export async function prepareAttachedFile({ sourcePath, destPath, spec, strip }) {
  copyFileSync(sourcePath, destPath);
  let probe = await probeMedia(destPath);
  if (strip && probe.video) {
    probe = await stripAudio(destPath);
    probe = await probeMedia(destPath);
  }
  const check = validateAgainstSpec(probe, spec, { silent: Boolean(strip && probe.video) });
  if (!check.ok) {
    rmSync(destPath, { force: true });
    throw mcpError("media_spec", check.message);
  }
  return { probe, check };
}
