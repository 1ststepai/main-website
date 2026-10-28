export const GUIDE_STORAGE_KEY = "postpath.guide.v1";

export const STEPS = ["intent", "channels", "content", "creation", "review", "result"];

export const YOUTUBE_APP_MISSING =
  "YouTube sign-in is not available in this preview. PostPath does not include a Google app, and customers do not create one. A private draft can still be saved on this computer. Connecting waits until 1stStep publishes a Google sign-in app, or until an owner saves one for a private test.";

export const PUBLISH_NOT_IN_GUIDE =
  "This guide does not publish. Nothing is sent to YouTube or any other network.";

export const SCHEDULE_NOT_IN_GUIDE =
  "Not scheduled. A scheduled post sends only while PostPath is open and this computer is on. This guide does not schedule one.";

export const AI_NOT_IN_APP =
  "PostPath does not write the post. Use Connect your AI assistant in the desk, restart that app, and paste a request there. The assistant must not publish unless you approve it. A settings file is not proof the app has connected.";

export const SNAPCHAT_RESTRICTED = "Restricted. PostPath does not publish to Snapchat.";
export const WHATSAPP_RESTRICTED = "Restricted. PostPath does not publish to WhatsApp.";
export const TIKTOK_GUIDE = "TikTok is an inbox handoff. This guide does not upload to TikTok.";

export const SUGGESTED_PREPARE_VIDEO = "Help me prepare this video for my connected channels.";
export const SUGGESTED_DO_NOT_PUBLISH = "Show me the saved accounts and do not publish anything.";

export const INTENTS = [
  {
    id: "video",
    label: "Post a video",
    detail: "Save a private YouTube draft from a video file on this computer. This does not upload it.",
  },
  {
    id: "post",
    label: "Create a post",
    detail: "Save the words as a draft on this computer. This window does not publish text posts.",
  },
  {
    id: "ai",
    label: "Connect an AI",
    detail: "Connect the assistant you already use. PostPath does not write posts.",
  },
];

export const CREATION = [
  { id: "manual", label: "I'll write it", detail: "Use the title and description you entered." },
  { id: "ai", label: "Ask an assistant for help", detail: AI_NOT_IN_APP },
];

const CHANNELS = [
  { key: "youtube", label: "YouTube", oauth: "google", flow: "youtube" },
  { key: "bluesky", label: "Bluesky", oauth: null, flow: "bluesky" },
  { key: "instagram", label: "Instagram", oauth: "meta", flow: "oauth" },
  { key: "facebook", label: "Facebook", oauth: "meta", flow: "oauth" },
  { key: "threads", label: "Threads", oauth: "meta", flow: "oauth" },
  { key: "linkedin", label: "LinkedIn", oauth: "linkedin", flow: "oauth" },
  { key: "x", label: "X", oauth: "x", flow: "oauth" },
  { key: "pinterest", label: "Pinterest", oauth: "pinterest", flow: "oauth" },
  { key: "reddit", label: "Reddit", oauth: "reddit", flow: "oauth" },
  { key: "google_business", label: "Google Business", oauth: "google", flow: "oauth" },
  { key: "tiktok", label: "TikTok", oauth: "tiktok", flow: "tiktok" },
  { key: "snapchat", label: "Snapchat", oauth: "snapchat", flow: "restricted" },
  { key: "whatsapp", label: "WhatsApp", oauth: null, flow: "restricted" },
];

export function emptyGuide() {
  return {
    version: 1,
    step: "intent",
    open: true,
    skipped: false,
    completed: false,
    intent: "",
    channels: [],
    profileName: "",
    title: "",
    description: "",
    filename: "",
    creation: "",
    assistantRequest: "",
    outcome: null,
    error: "",
  };
}

export function profileIdFromName(name) {
  const raw = String(name || "").trim().toLowerCase();
  let out = "";
  for (const ch of raw) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "_" || ch === "-") out += ch;
    else if (out && !out.endsWith("-")) out += "-";
    if (out.length >= 64) break;
  }
  while (out.startsWith("-")) out = out.slice(1);
  while (out.endsWith("-")) out = out.slice(0, -1);
  return out.slice(0, 64);
}

export function profileFor(guide, status = {}) {
  const existing = status.profiles?.[0];
  if (existing?.id) return { id: existing.id, name: existing.name || existing.id, known: true };
  const name = String(guide.profileName || "").trim();
  return { id: profileIdFromName(name), name, known: false };
}

function knownChannel(key) {
  return CHANNELS.some((channel) => channel.key === key);
}

export function loadGuide(storage) {
  if (!storage) return null;
  let parsed;
  try {
    const raw = storage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || parsed.version !== 1) return null;
  const base = emptyGuide();
  return {
    ...base,
    step: STEPS.includes(parsed.step) ? parsed.step : base.step,
    open: parsed.open !== false,
    skipped: Boolean(parsed.skipped),
    completed: Boolean(parsed.completed),
    intent: INTENTS.some((item) => item.id === parsed.intent) ? parsed.intent : "",
    channels: Array.isArray(parsed.channels) ? parsed.channels.filter(knownChannel) : [],
    profileName: String(parsed.profileName || "").slice(0, 120),
    title: String(parsed.title || "").slice(0, 100),
    description: String(parsed.description || "").slice(0, 5000),
    filename: String(parsed.filename || "").slice(0, 180),
    creation: parsed.creation === "manual" || parsed.creation === "ai" ? parsed.creation : "",
    assistantRequest: String(parsed.assistantRequest || "").slice(0, 500),
    outcome: parsed.outcome && typeof parsed.outcome === "object" ? parsed.outcome : null,
    error: String(parsed.error || "").slice(0, 500),
  };
}

export function saveGuide(storage, guide) {
  const next = { ...emptyGuide(), ...guide, version: 1 };
  delete next.file;
  storage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function shouldAutoOpen(saved) {
  if (!saved) return true;
  return saved.open === true;
}

export function skipGuide(guide) {
  return { ...guide, open: false, skipped: true, error: "" };
}

export function reopenGuide(guide) {
  return { ...(guide || emptyGuide()), open: true };
}

export function dismissGuide(guide) {
  return { ...guide, open: false };
}

export function channelCatalog() {
  return CHANNELS.map((channel) => ({ ...channel }));
}

export function connectPlan(channelKey, status = {}) {
  const channel = CHANNELS.find((item) => item.key === channelKey);
  if (!channel) return { action: "unavailable", message: "That channel is not in PostPath." };
  const row = (status.connections || []).find((item) => item.platform === channelKey);
  if (row) {
    const label = row.account_label || "a saved account";
    return { action: "connected", label, message: `${channel.label} is connected as ${label}.` };
  }
  if (channel.flow === "restricted") {
    return {
      action: "unavailable",
      message: channel.key === "whatsapp" ? WHATSAPP_RESTRICTED : SNAPCHAT_RESTRICTED,
    };
  }
  if (channel.flow === "tiktok") return { action: "unavailable", message: TIKTOK_GUIDE };
  if (channel.flow === "bluesky") {
    return {
      action: "bluesky",
      message: "Bluesky uses an app password from Bluesky settings. Type it here. Do not paste it into chat.",
    };
  }
  if (channel.key === "youtube" && !status.oauth_ready?.google) {
    return { action: "blocked", message: YOUTUBE_APP_MISSING };
  }
  const ready = channel.oauth && status.oauth_ready?.[channel.oauth];
  if (!ready) {
    return {
      action: "unavailable",
      message: `${channel.label} sign-in is not available in this preview. PostPath does not include that network's app. You can still save a local draft. It will not be sent.`,
    };
  }
  return {
    action: "oauth",
    platforms: [channel.key === "youtube" ? "youtube" : channel.key],
    message: `Connect ${channel.label} opens that network in your browser. This guide does not publish there.`,
  };
}

export function leaveBlocker(guide, { hasProfile = false } = {}) {
  if (guide.step === "intent" && !guide.intent) return "Choose one to continue.";
  if (guide.step === "channels") {
    if (!guide.channels?.length) return "Choose at least one channel. You can continue without connecting it.";
    if (!hasProfile && !profileFor(guide, {}).id) return "Name this profile. PostPath does not have one yet.";
  }
  if (guide.step === "content") {
    if (guide.intent === "video" && !String(guide.title || "").trim()) return "Add a title for the video.";
    if (guide.intent === "post" && !String(guide.title || guide.description || "").trim()) return "Write the post, or skip this guide.";
    if (guide.intent === "ai" && !String(guide.assistantRequest || guide.description || guide.title || "").trim()) {
      return "Choose a suggested request or describe the idea.";
    }
  }
  if (guide.step === "creation" && !guide.creation) return "Choose whether you will write it, or ask an assistant for help.";
  return "";
}

export function goNext(guide, context) {
  const error = leaveBlocker(guide, context);
  if (error) return { ...guide, error };
  const index = STEPS.indexOf(guide.step);
  if (index < 0 || index >= STEPS.length - 2) return guide;
  return { ...guide, step: STEPS[index + 1], error: "" };
}

export function goBack(guide) {
  const index = STEPS.indexOf(guide.step);
  if (index <= 0) return guide;
  return { ...guide, step: STEPS[index - 1], error: "" };
}

export function toggleChannel(guide, key) {
  if (!knownChannel(key)) return guide;
  const channels = guide.channels.includes(key)
    ? guide.channels.filter((item) => item !== key)
    : [...guide.channels, key];
  return { ...guide, channels, error: "" };
}

export function draftPlans(guide, { hasFile = false } = {}) {
  return (guide.channels || []).map((platform) => {
    const channel = CHANNELS.find((item) => item.key === platform);
    const title = String(guide.title || "").trim().slice(0, 100);
    const description = String(guide.description || "").trim().slice(0, 5000);
    const plan = {
      platform,
      label: channel?.label || platform,
      privacy_status: "private",
      scheduled_at: null,
      title,
      description,
      caption: (description || title).slice(0, 2200),
      needsFile: platform === "youtube" && guide.intent === "video",
      canSave: true,
      reason: "",
      note: "",
    };
    if (channel?.flow === "restricted" || channel?.flow === "tiktok") {
      plan.canSave = false;
      plan.reason = connectPlan(platform, {}).message;
    } else if (plan.needsFile && !hasFile) {
      plan.canSave = false;
      plan.reason = "Choose the video file on this computer. The guide does not keep the file after you leave.";
    } else if (platform === "youtube" && guide.intent === "video" && !title) {
      plan.canSave = false;
      plan.reason = "Add a title for the YouTube draft.";
    } else if (!title && !description) {
      plan.canSave = false;
      plan.reason = "Add a title or description before saving a draft.";
    } else if (guide.intent === "video" && platform !== "youtube") {
      plan.note = "The video file is not sent to this channel. This saves the words as a draft.";
    }
    return plan;
  });
}

export function draftRequest(plan, profile, mediaPath) {
  return {
    id: profile.id,
    name: profile.name || profile.id,
    platform: plan.platform,
    title: plan.title,
    description: plan.description,
    caption: plan.caption,
    privacy_status: "private",
    media_path: mediaPath || undefined,
    media_content_type: plan.needsFile ? "video/mp4" : undefined,
  };
}

export function reviewView(guide, status = {}, { hasFile = false } = {}) {
  const plans = draftPlans(guide, { hasFile });
  const accounts = (guide.channels || []).map((key) => {
    const row = (status.connections || []).find((item) => item.platform === key);
    const channel = CHANNELS.find((item) => item.key === key);
    return {
      platform: key,
      label: channel?.label || key,
      connected: Boolean(row),
      account: row?.account_label || "Not connected",
    };
  });
  const blockers = plans.filter((plan) => !plan.canSave).map((plan) => `${plan.label}: ${plan.reason}`);
  return {
    intent: guide.intent,
    creation: guide.creation,
    assistantRequest: guide.assistantRequest || "",
    accounts,
    privacy: "Private",
    timing: SCHEDULE_NOT_IN_GUIDE,
    publish: PUBLISH_NOT_IN_GUIDE,
    filename: hasFile ? guide.filename : "",
    fileNote: guide.intent === "video" && !hasFile ? "No video file is selected right now." : "",
    title: guide.title || "",
    description: guide.description || "",
    plans,
    canSave: plans.length > 0 && blockers.length === 0,
    blockers,
    cursorInstalled: Boolean(status.cursor?.installed),
    assistantConfigured: assistantConfigured(status),
    aiNote: guide.creation === "ai" ? AI_NOT_IN_APP : "",
  };
}

export function assistantConfigured(status = {}) {
  if (status.cursor?.installed) return true;
  return (status.clients || []).some((client) => client.mode === "write" && client.installed);
}

export function suggestedRequests(guide, status = {}) {
  const connected = (status.connections || []).length > 0;
  const items = [
    {
      id: "prepare-video",
      text: SUGGESTED_PREPARE_VIDEO,
      show: guide.intent === "video" || Boolean(guide.filename),
      runsInPostPath: false,
      note: connected
        ? "Copy this into your assistant. PostPath does not run it and does not publish."
        : "No channel is connected yet. You can still copy this into your assistant to draft a title and description. It will not post anywhere.",
    },
    {
      id: "do-not-publish",
      text: SUGGESTED_DO_NOT_PUBLISH,
      show: true,
      runsInPostPath: false,
      note: assistantConfigured(status)
        ? "PostPath is listed in an assistant's settings. Restart that app, then paste this. That file is not proof the app has connected."
        : "Use Connect your AI assistant in the desk, restart that app, then paste this. PostPath will not send it.",
    },
  ];
  return items.filter((item) => item.show);
}

export function resultFromSaves(saves) {
  const rows = Array.isArray(saves) ? saves : [];
  const failed = rows.filter((row) => !row.ok);
  const saved = rows.filter((row) => row.ok && row.post?.status === "draft");
  const ok = rows.length > 0 && failed.length === 0 && saved.length === rows.length;
  if (!rows.length) {
    return { ok: false, saves: rows, message: "The draft was not saved." };
  }
  if (!ok) {
    const reason = failed[0]?.message || "The draft was not saved.";
    const partial = saved.length ? ` ${saved.length} draft row${saved.length === 1 ? "" : "s"} saved. Nothing was published.` : "";
    return { ok: false, saves: rows, message: `${reason}${partial}` };
  }
  const ids = saved.map((row) => row.post.id).filter(Boolean).join(", ");
  return {
    ok: true,
    saves: rows,
    message: `Draft saved on this computer${ids ? ` (${ids})` : ""}. Status is draft. Privacy is private. It is not published.`,
  };
}

export function stepContent(guide) {
  const index = Math.max(0, STEPS.indexOf(guide.step));
  const kicker = `Step ${index + 1} of ${STEPS.length}`;
  if (guide.step === "intent") return { kicker, title: "What do you want to do first?" };
  if (guide.step === "channels") return { kicker, title: "Which channel is this for?" };
  if (guide.step === "content" && guide.intent === "post") return { kicker, title: "What should the post say?" };
  if (guide.step === "content" && guide.intent === "ai") return { kicker, title: "What should the assistant help with?" };
  if (guide.step === "content") return { kicker, title: "What is the video called?" };
  if (guide.step === "creation") return { kicker, title: "How do you want to make it?" };
  if (guide.step === "review") return { kicker, title: "Does this look right?" };
  if (guide.outcome?.ok) return { kicker, title: "Draft saved on this computer" };
  return { kicker, title: "That did not finish" };
}
