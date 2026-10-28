import { mcpError } from "../errors.js";

/** Network presets PostPath uses to size a generated file and to reject a mismatch. */
export const PLACEMENTS = [
  { id: "youtube_short", platform: "youtube", label: "YouTube Short", kind: "video", aspect: "9:16", width: 1080, height: 1920, minDuration: 1, maxDuration: 180, container: "mp4" },
  { id: "youtube_long", platform: "youtube", label: "YouTube long-form", kind: "video", aspect: "16:9", width: 1920, height: 1080, minDuration: 1, maxDuration: 3600, container: "mp4" },
  { id: "instagram_feed", platform: "instagram", label: "Instagram feed", kind: "image", aspect: "4:5", width: 1080, height: 1350, container: "jpg" },
  { id: "instagram_reel", platform: "instagram", label: "Instagram Reel", kind: "video", aspect: "9:16", width: 1080, height: 1920, minDuration: 3, maxDuration: 90, container: "mp4" },
  { id: "instagram_story", platform: "instagram", label: "Instagram Story", kind: "either", aspect: "9:16", width: 1080, height: 1920, minDuration: 1, maxDuration: 60, container: "mp4" },
  { id: "facebook_feed", platform: "facebook", label: "Facebook feed", kind: "image", aspect: "1:1", width: 1080, height: 1080, container: "jpg" },
  { id: "facebook_reel", platform: "facebook", label: "Facebook Reel", kind: "video", aspect: "9:16", width: 1080, height: 1920, minDuration: 3, maxDuration: 90, container: "mp4" },
  { id: "linkedin_image", platform: "linkedin", label: "LinkedIn image", kind: "image", aspect: "1:1", width: 1200, height: 1200, container: "jpg" },
  { id: "linkedin_video", platform: "linkedin", label: "LinkedIn video", kind: "video", aspect: "16:9", width: 1920, height: 1080, minDuration: 1, maxDuration: 600, container: "mp4" },
  { id: "x_image", platform: "x", label: "X image", kind: "image", aspect: "16:9", width: 1600, height: 900, container: "jpg" },
  { id: "x_video", platform: "x", label: "X video", kind: "video", aspect: "16:9", width: 1280, height: 720, minDuration: 1, maxDuration: 140, container: "mp4" },
  { id: "tiktok", platform: "tiktok", label: "TikTok", kind: "video", aspect: "9:16", width: 1080, height: 1920, minDuration: 1, maxDuration: 600, container: "mp4" },
  { id: "bluesky_image", platform: "bluesky", label: "Bluesky image", kind: "image", aspect: "1:1", width: 1000, height: 1000, container: "jpg" },
  { id: "bluesky_video", platform: "bluesky", label: "Bluesky video", kind: "video", aspect: "16:9", width: 1280, height: 720, minDuration: 1, maxDuration: 60, container: "mp4" },
  { id: "threads_image", platform: "threads", label: "Threads image", kind: "image", aspect: "1:1", width: 1080, height: 1080, container: "jpg" },
  { id: "threads_video", platform: "threads", label: "Threads video", kind: "video", aspect: "9:16", width: 1080, height: 1920, minDuration: 1, maxDuration: 300, container: "mp4" },
];

const PLATFORM_LABEL = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
  bluesky: "Bluesky",
  threads: "Threads",
};

export function placementById(id) {
  return PLACEMENTS.find((row) => row.id === id) || null;
}

export function resolvePlacement(platform, { type = "video", placement } = {}) {
  const rows = PLACEMENTS.filter((row) => row.platform === platform);
  const label = PLATFORM_LABEL[platform] || platform;
  if (!rows.length) {
    throw mcpError("media_spec", `${label} has no media preset. Attach a file only if that network already accepts it.`);
  }
  if (placement) {
    const found = rows.find((row) => row.id === placement);
    if (!found) throw mcpError("media_spec", `${placement} is not a ${label} preset.`);
    if (found.kind !== "either" && found.kind !== type) {
      throw mcpError("media_spec", `${found.label} is a ${found.kind}. This request is a ${type}.`);
    }
    return found;
  }
  const found = rows.find((row) => row.kind === type || row.kind === "either");
  if (!found) throw mcpError("media_spec", `${label} has no ${type} preset.`);
  return found;
}

export function planFor(platforms, { type = "video", placement, overrides } = {}) {
  const targets = [];
  for (const platform of platforms) {
    const own = overrides?.[platform] || {};
    const chosen = own.placement || own.media?.placement || (platforms.length === 1 ? placement : "");
    targets.push(resolvePlacement(platform, { type: own.generate?.type || type, placement: chosen || (platform === platforms[0] ? placement : "") }));
  }
  return targets;
}

export function groupByAspect(targets) {
  const groups = [];
  for (const target of targets) {
    const key = `${target.kind}:${target.aspect}`;
    let group = groups.find((row) => row.key === key);
    if (!group) {
      group = { key, aspect: target.aspect, kind: target.kind, targets: [] };
      groups.push(group);
    }
    group.targets.push(target);
  }
  return groups;
}

export function masterSize(targets) {
  return targets.reduce((best, row) => (row.width * row.height > best.width * best.height ? row : best), targets[0]);
}

export function durationWindow(targets) {
  const videos = targets.filter((row) => row.kind !== "image" && row.maxDuration);
  if (!videos.length) return null;
  const min = Math.max(...videos.map((row) => row.minDuration || 1));
  const max = Math.min(...videos.map((row) => row.maxDuration));
  return { min, max };
}

export function resolveDuration(targets, requested) {
  const window = durationWindow(targets);
  if (!window) return null;
  if (window.min > window.max) {
    const names = targets.map((row) => row.label).join(", ");
    throw mcpError(
      "media_spec",
      `${names} do not share a duration. Generate them separately. The overlap would need at least ${window.min} seconds and at most ${window.max}.`,
    );
  }
  const wanted = Number(requested);
  const seconds = Number.isFinite(wanted) && wanted > 0 ? wanted : Math.min(4, window.max);
  if (seconds < window.min || seconds > window.max) {
    throw mcpError(
      "media_spec",
      `These networks need a video between ${window.min} and ${window.max} seconds. ${seconds} seconds does not fit.`,
    );
  }
  return seconds;
}

export function validateAgainstSpec(probe, spec, { silent = false } = {}) {
  const errors = [];
  const width = Number(probe?.width || 0);
  const height = Number(probe?.height || 0);
  const ratio = height ? width / height : 0;
  const target = spec.height ? spec.width / spec.height : 0;
  if (!width || !height || !target || Math.abs(ratio - target) / target > 0.03) {
    errors.push(`${spec.label} needs ${spec.aspect} (${spec.width}×${spec.height}). This file is ${width || "unknown"}×${height || "unknown"}.`);
  } else if (Math.min(width, height) < 320) {
    errors.push(`${spec.label} needs a file close to ${spec.width}×${spec.height}. This file is ${width}×${height}.`);
  }
  const videoSpec = spec.kind === "video" || (spec.kind === "either" && probe?.video);
  if (spec.kind === "video" && !probe?.video) errors.push(`${spec.label} needs a video file.`);
  if (spec.kind === "image" && probe?.video) errors.push(`${spec.label} needs an image, and this file is a video.`);
  if (videoSpec) {
    const duration = Number(probe?.duration || 0);
    if (spec.minDuration && duration + 0.05 < spec.minDuration) {
      errors.push(`${spec.label} needs at least ${spec.minDuration} seconds. This file is ${duration.toFixed(1)} seconds.`);
    }
    if (spec.maxDuration && duration > spec.maxDuration + 0.05) {
      errors.push(`${spec.label} allows up to ${spec.maxDuration} seconds. This file is ${duration.toFixed(1)} seconds.`);
    }
    if (silent && probe?.hasAudio) {
      errors.push(`${spec.label} still has an audio track. Generated video must be silent, with no music and no voice.`);
    }
  }
  return { ok: errors.length === 0, spec_ok: errors.length === 0, message: errors.join(" ") };
}
