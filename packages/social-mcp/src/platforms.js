/** Product platforms (publish targets) and OAuth provider chain steps. */

export const PLATFORMS = [
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "x",
  "threads",
  "pinterest",
  "bluesky",
  "google_business",
  "reddit",
  "snapchat",
  "whatsapp",
];

/** Browser OAuth providers run in connect chain order. */
export const CONNECT_ORDER = [
  "youtube",
  "meta",
  "tiktok",
  "linkedin",
  "x",
  "threads",
  "pinterest",
  "google_business",
  "reddit",
  "snapchat",
];

export const PLATFORM_LABELS = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  google_business: "Google Business",
  reddit: "Reddit",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp Channels",
};

/** Map product platform → OAuth provider id (or null for app-password style). */
export const PLATFORM_PROVIDER = {
  youtube: "youtube",
  instagram: "meta",
  facebook: "meta",
  tiktok: "tiktok",
  linkedin: "linkedin",
  x: "x",
  threads: "threads",
  pinterest: "pinterest",
  bluesky: null,
  google_business: "google_business",
  reddit: "reddit",
  snapchat: "snapchat",
  whatsapp: "meta",
};

export function providerForPlatform(platform) {
  return PLATFORM_PROVIDER[platform] ?? null;
}
