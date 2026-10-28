import { DRAFT_FIELD_LIMITS, PLATFORM_TEXT_LIMITS } from "../publish/validate.js";

/**
 * Copy targets for the SEO step.
 * Length caps come from publish/validate.js and the publish adapters.
 * Hashtag "usual" counts are desk guidance. hardMax is a known platform cap
 * where one exists (YouTube ignores a description with more than 15 hashtags;
 * Instagram captions allow 30). Other hardMax values are the desk ceiling.
 */
export const SEO_CHANNELS = [
  {
    id: "youtube",
    label: "YouTube",
    copyOnly: false,
    title: DRAFT_FIELD_LIMITS.title,
    description: PLATFORM_TEXT_LIMITS.youtube,
    caption: PLATFORM_TEXT_LIMITS.youtube,
    hashtags: { usual: 3, hardMax: 15 },
    onScreen: 80,
  },
  {
    id: "facebook",
    label: "Facebook",
    copyOnly: false,
    title: DRAFT_FIELD_LIMITS.title,
    description: PLATFORM_TEXT_LIMITS.facebook,
    caption: PLATFORM_TEXT_LIMITS.facebook,
    hashtags: { usual: 5, hardMax: 10 },
    onScreen: 80,
  },
  {
    id: "instagram",
    label: "Instagram",
    copyOnly: false,
    title: DRAFT_FIELD_LIMITS.title,
    description: PLATFORM_TEXT_LIMITS.instagram,
    caption: PLATFORM_TEXT_LIMITS.instagram,
    hashtags: { usual: 8, hardMax: 30 },
    onScreen: 80,
  },
  {
    id: "bluesky",
    label: "Bluesky",
    copyOnly: false,
    title: DRAFT_FIELD_LIMITS.title,
    description: PLATFORM_TEXT_LIMITS.bluesky,
    caption: PLATFORM_TEXT_LIMITS.bluesky,
    hashtags: { usual: 3, hardMax: 5 },
    onScreen: 80,
  },
  {
    id: "tiktok",
    label: "TikTok",
    copyOnly: true,
    title: DRAFT_FIELD_LIMITS.title,
    description: DRAFT_FIELD_LIMITS.caption,
    caption: DRAFT_FIELD_LIMITS.caption,
    hashtags: { usual: 5, hardMax: 8 },
    onScreen: 80,
    note: "Copy only. The TikTok inbox handoff does not send this caption.",
  },
  {
    id: "x",
    label: "X",
    copyOnly: true,
    title: DRAFT_FIELD_LIMITS.title,
    description: PLATFORM_TEXT_LIMITS.x,
    caption: PLATFORM_TEXT_LIMITS.x,
    hashtags: { usual: 2, hardMax: 3 },
    onScreen: 80,
    note: "Copy only in this step. The caption must fit 280 characters.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    copyOnly: true,
    title: DRAFT_FIELD_LIMITS.title,
    description: PLATFORM_TEXT_LIMITS.linkedin,
    caption: PLATFORM_TEXT_LIMITS.linkedin,
    hashtags: { usual: 3, hardMax: 5 },
    onScreen: 80,
    note: "Copy only in this step.",
  },
];

const BY_ID = new Map(SEO_CHANNELS.map((channel) => [channel.id, channel]));

export function channelById(id) {
  return BY_ID.get(String(id || "")) || null;
}

export function resolveChannels(requested) {
  if (!Array.isArray(requested) || !requested.length) return SEO_CHANNELS.map((channel) => ({ ...channel }));
  const out = [];
  for (const item of requested) {
    const channel = channelById(item);
    if (channel && !out.some((row) => row.id === channel.id)) out.push({ ...channel });
  }
  return out;
}

export function publishableChannels(channels) {
  return channels.filter((channel) => !channel.copyOnly);
}
