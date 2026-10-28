import {
  AI_NOT_IN_APP,
  CREATION,
  INTENTS,
  YOUTUBE_APP_MISSING,
  youtubeSetupMessage,
  channelCatalog,
  connectPlan,
  dismissGuide,
  draftRequest,
  emptyGuide,
  goBack,
  goNext,
  loadGuide,
  profileFor,
  reopenGuide,
  resultFromSaves,
  reviewView,
  saveGuide,
  shouldAutoOpen,
  skipGuide,
  stepContent,
  suggestedRequests,
  toggleChannel,
} from "./guide.js";
import { platformIcon } from "./icons.js";

const NETWORKS = [
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "threads", label: "Threads" },
  { key: "pinterest", label: "Pinterest" },
  { key: "bluesky", label: "Bluesky" },
  { key: "google_business", label: "Google Business" },
  { key: "reddit", label: "Reddit" },
  { key: "snapchat", label: "Snapchat", limited: true },
  { key: "whatsapp", label: "WhatsApp Channels", limited: true },
];

const toastEl = document.getElementById("toast");
const networkList = document.getElementById("network-list");
const scheduledList = document.getElementById("scheduled-list");
const pathMeta = document.getElementById("path-meta");
const redirectUri = document.getElementById("redirect-uri");
const connectHint = document.getElementById("connect-hint");
const profileName = document.getElementById("profile-name");
const profileId = document.getElementById("profile-id");
const oauthForm = document.getElementById("oauth-form");
const blueskyForm = document.getElementById("bluesky-form");

const DISPATCH_HONESTY =
  "After dispatch starts, PostPath cannot guarantee the platform did not accept the post. Cancel only works while a post is still scheduled. Dispatch-started posts stay needs review and are not auto-retried or undone.";

const OUTCOME_LABEL = {
  posted: "Posted",
  failed: "Failed",
  rate_limited: "Rate limited",
  needs_review: "Needs review",
  handed_off: "Handed off",
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
};

function outcomeChipClass(post, publishMode) {
  if (post?.result_source === "mock" || publishMode === "mock") return "chip mock";
  const outcome = post?.outcome || post?.status || "";
  const kind = {
    posted: "posted",
    failed: "failed",
    rate_limited: "rate",
    needs_review: "review",
    draft: "draft",
    scheduled: "draft",
    publishing: "review",
    handed_off: "review",
  }[outcome] || "draft";
  return `chip ${kind}`;
}

function secretPlaceholder(value) {
  const text = String(value || "");
  if (!text) return "";
  if (!/[•*]/.test(text)) return "Saved";
  return text;
}

function outcomeLabel(post) {
  const outcome = post?.outcome || post?.status || "";
  const label =
    post?.status === "handed_off" && post?.platform === "facebook"
      ? "Saved on Facebook, not public"
      : OUTCOME_LABEL[outcome] || outcome || "Unknown";
  if (post?.result_source === "mock") return `MOCK · ${label}`;
  return label;
}

function sourceLabel(post) {
  if (post?.result_source === "mock") return "MOCK — not sent";
  if (post?.result_source === "platform") return "Platform response";
  if (post?.status === "draft" || post?.status === "scheduled") return "Saved on this computer";
  return "Recorded on this computer";
}

function formatWhen(iso) {
  if (!iso) return "No time set";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso);
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(iso);
  }
}

function renderScheduled(posts) {
  scheduledList.replaceChildren();
  const rows = Array.isArray(posts) ? posts : [];
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No scheduled posts.";
    scheduledList.append(empty);
    return;
  }
  for (const post of rows) {
    const title = post.title || post.caption || post.description || post.id;
    const platform = post.platform || "unknown";
    const item = document.createElement("li");
    item.dataset.postId = String(post.id || "");

    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = String(title || "");
    const when = document.createElement("div");
    when.className = "when";
    when.textContent = `${platform} · ${formatWhen(post.scheduled_at)}`;
    copy.append(strong, when);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn danger cancel-scheduled";
    button.dataset.postId = String(post.id || "");
    button.textContent = "Cancel";

    item.append(copy, button);
    scheduledList.append(item);
  }
}

function showToast(message, isError = false) {
  toastEl.hidden = false;
  toastEl.textContent = message;
  toastEl.classList.toggle("error", isError);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Request failed");
  }
  return payload;
}

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

profileName.addEventListener("input", () => {
  if (!profileId.dataset.touched) {
    profileId.value = slugify(profileName.value);
  }
});

profileId.addEventListener("input", () => {
  profileId.dataset.touched = "1";
});

function renderMode(data) {
  const banner = document.getElementById("publish-mode");
  const note = document.getElementById("results-note");
  if (!banner) return;
  const mock = data.publish_mode === "mock";
  banner.className = mock ? "mode-banner mock" : "mode-banner live";
  banner.textContent = mock
    ? "MOCK MODE. These rows are practice results. PostPath did not call YouTube, Meta, or any other network."
    : "Live mode. Posted, failed, rate limited, and needs review are saved from the platform response. A real post still needs your Google or Meta app. Live publishing has not been verified on a real account yet.";
  if (note) note.textContent = mock ? "MOCK — not sent" : "From the platform response";
}

function renderResults(posts, publishMode) {
  const list = document.getElementById("result-list");
  if (!list) return;
  list.replaceChildren();
  const rows = Array.isArray(posts) ? posts : [];
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No posts yet. A saved draft shows up here as Draft. Publish writes Posted, Failed, Rate limited, or Needs review from the platform response.";
    list.append(empty);
    return;
  }
  for (const post of rows) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = String(post.title || post.caption || post.description || post.id || "Post");
    const pill = document.createElement("span");
    pill.className = outcomeChipClass(post, publishMode);
    pill.textContent = outcomeLabel(post);
    const head = document.createElement("div");
    head.className = "result-head";
    head.append(platformIcon(post.platform), title, pill);
    const meta = document.createElement("div");
    meta.className = "meta";
    const bits = [post.platform || "unknown", sourceLabel(post)];
    if (post.privacy_status) bits.push(post.privacy_status);
    if (post.platform_post_id) bits.push(post.platform_post_id);
    meta.textContent = bits.join(" · ");
    item.append(head, meta);
    if (post.publish_note) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = post.publish_note;
      item.append(note);
    }
    if (post.error?.message) {
      const err = document.createElement("p");
      err.className = "hint";
      err.textContent = post.error.message;
      item.append(err);
    }
    if (post.published_url) {
      const link = document.createElement("a");
      link.href = post.published_url;
      link.textContent = post.published_url;
      link.rel = "noreferrer";
      item.append(link);
    }
    list.append(item);
  }
}

function renderStatus(data) {
  latestStatus = data;
  const dispatchHonesty = document.getElementById("dispatch-honesty");
  if (dispatchHonesty) dispatchHonesty.textContent = DISPATCH_HONESTY;
  renderMode(data);
  renderResults(data.recent_posts, data.publish_mode);

  const activeId = profileId.value.trim();
  const connections = (data.connections || []).filter((row) => !activeId || row.profile_id === activeId);
  const byPlatform = new Map(connections.map((row) => [row.platform, row]));
  const brand = document.getElementById("brand-live");
  const profiles = (data.profiles || []).filter((profile) => !activeId || profile.id === activeId);
  if (brand) {
    brand.textContent = profiles.length
      ? profiles.map((profile) => profile.name || profile.id).join(" · ")
      : "No brand yet";
  }
  networkList.replaceChildren();
  for (const network of NETWORKS) {
    const row = byPlatform.get(network.key);
    const on = Boolean(row);
    const item = document.createElement("li");
    const copy = document.createElement("div");
    copy.className = "network-copy";
    const strong = document.createElement("strong");
    strong.textContent = network.label;
    const detail = document.createElement("div");
    detail.className = "meta";
    detail.textContent = row
      ? row.account_label || "Connected"
      : network.limited
        ? "API approval required"
        : "Not connected";
    copy.append(strong, detail);
    const pill = document.createElement("span");
    if (on) {
      pill.className = "chip connected";
      pill.textContent = "Connected";
    } else if (network.limited) {
      pill.className = "chip limited";
      pill.textContent = "Limited";
    } else {
      pill.className = "chip needed";
      pill.textContent = "Not connected";
    }
    item.append(platformIcon(network.key), copy, pill);
    networkList.append(item);
  }
  const mcpConfig = document.getElementById("mcp-config");
  if (mcpConfig && data.mcp_config) {
    mcpConfig.textContent = JSON.stringify(data.mcp_config, null, 2);
  }

  redirectUri.textContent = data.oauth_redirect_uri || "http://127.0.0.1:47831/oauth/callback";
  const googleRedirect = document.getElementById("google-redirect-uri");
  if (googleRedirect) googleRedirect.textContent = data.google_redirect_uri || "http://127.0.0.1:47831";
  const readiness = document.getElementById("youtube-readiness");
  if (readiness) {
    readiness.textContent = data.oauth_ready?.google
      ? `Google client saved on this computer. Connect YouTube opens Google. Loopback redirect: ${googleRedirect?.textContent || "http://127.0.0.1:47831"}. New drafts stay private unless you change them.`
      : youtubeSetupMessage(data.google_redirect_uri);
  }
  const metaReady = document.getElementById("meta-readiness");
  if (metaReady) {
    const metaErrors = data.oauth_check?.meta?.errors || [];
    metaReady.textContent = data.oauth_ready?.meta
      ? "Meta app saved on this computer. Connect Meta opens Facebook. Instagram publishes only when privacy is Public."
      : metaErrors[0] || "Meta sign-in needs META_APP_ID and META_APP_SECRET saved on this computer. PostPath does not include a Meta app.";
  }
  const oauthErrors = document.getElementById("oauth-errors");
  if (oauthErrors) {
    const problems = [...(data.oauth_check?.google?.errors || []), ...(data.oauth_check?.meta?.errors || [])];
    oauthErrors.hidden = problems.length === 0;
    oauthErrors.textContent = problems.join(" ");
  }
  const cursor = data.cursor?.installed ? "PostPath enabled in Cursor" : "PostPath not enabled in Cursor yet";
  pathMeta.textContent = `${cursor} · vault ${data.home || ""} · media ${data.media_dir || ""}`;

  if (data.profiles?.[0] && !profileId.dataset.touched) {
    profileId.value = data.profiles[0].id;
    profileName.value = data.profiles[0].name;
  }

  const oauth = data.oauth || {};
  for (const [key, value] of Object.entries(oauth)) {
    const input = oauthForm.elements.namedItem(key);
    if (!input || typeof value !== "string" || input instanceof RadioNodeList) continue;
    if (key.endsWith("_SECRET")) {
      input.placeholder = secretPlaceholder(value);
      if (input.value && value && input.value === value && !/[•*]/.test(value)) input.value = "";
      continue;
    }
    if (String(value).includes("••••")) continue;
    if (key.endsWith("_ID") || key.endsWith("_KEY")) {
      input.value = value;
    }
  }

  if (data.next_step === "save_apps") {
    connectHint.textContent = "Save at least one provider’s credentials below, then connect.";
  } else if (data.cursor && !data.cursor.installed) {
    connectHint.textContent = "Connect accounts, then click Enable in Cursor so Cursor can use them.";
  } else {
    connectHint.textContent = "Connect opens each configured OAuth provider in order. Bluesky uses the form below.";
  }

  renderScheduled(data.scheduled_posts);
  for (const node of document.querySelectorAll("[data-channel-status]")) {
    node.textContent = connectPlan(node.dataset.channelStatus, data).message;
  }
}

async function refresh() {
  const data = await api("/api/status");
  renderStatus(data);
  return data;
}

document.getElementById("refresh-btn").addEventListener("click", () => {
  refresh().catch((error) => showToast(error.message, true));
});

scheduledList.addEventListener("click", async (event) => {
  const button = event.target.closest(".cancel-scheduled");
  if (!button) return;
  const postId = button.dataset.postId;
  if (!postId) return;
  button.disabled = true;
  try {
    const data = await api("/api/cancel-scheduled", {
      method: "POST",
      body: JSON.stringify({ post_id: postId }),
    });
    renderStatus(data);
    showToast("Schedule cancelled — post is a draft again");
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
  }
});

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(`${label} copied`);
  } catch {
    showToast("Copy failed — select the URI manually", true);
  }
}

document.getElementById("copy-redirect").addEventListener("click", () => {
  copyText(redirectUri.textContent, "Redirect URI");
});

document.getElementById("copy-google-redirect").addEventListener("click", () => {
  const node = document.getElementById("google-redirect-uri");
  copyText(node?.textContent || "", "Google loopback URI");
});

document.getElementById("copy-mcp")?.addEventListener("click", () => {
  copyText(document.getElementById("mcp-config")?.textContent || "", "MCP config");
});

for (const input of oauthForm.querySelectorAll('input[type="password"]')) {
  input.readOnly = true;
  input.addEventListener("focus", () => {
    input.readOnly = false;
  });
}

document.getElementById("connect-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("connect-btn");
  button.disabled = true;
  try {
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        id: profileId.value.trim(),
        name: profileName.value.trim() || profileId.value.trim(),
      }),
    });
    renderStatus(data);
    if (data.connect?.authorize_url) {
      showToast(data.connect.message || "Sign-in opened in your browser");
    } else {
      showToast(data.connect?.message || "Accounts connected");
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("cursor-btn").addEventListener("click", async () => {
  const button = document.getElementById("cursor-btn");
  button.disabled = true;
  try {
    const data = await api("/api/install-cursor", { method: "POST", body: "{}" });
    renderStatus(data);
    showToast(`Cursor MCP installed at ${data.installed?.configPath || "mcp.json"}. Restart Cursor.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

oauthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(oauthForm);
  const body = Object.fromEntries(form.entries());
  try {
    const data = await api("/api/oauth-config", {
      method: "POST",
      body: JSON.stringify(body),
    });
    renderStatus(data);
    showToast("Credentials saved to the local vault");
  } catch (error) {
    showToast(error.message, true);
  }
});

blueskyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(blueskyForm);
  try {
    const data = await api("/api/connect-bluesky", {
      method: "POST",
      body: JSON.stringify({
        id: profileId.value.trim(),
        name: profileName.value.trim() || profileId.value.trim(),
        handle: String(form.get("handle") || ""),
        app_password: String(form.get("app_password") || ""),
      }),
    });
    renderStatus(data);
    showToast(data.connect?.message || "Bluesky connected");
  } catch (error) {
    showToast(error.message, true);
  }
});

const youtubeForm = document.getElementById("youtube-form");
const publishDraftButton = document.getElementById("publish-draft");
const draftResult = document.getElementById("draft-result");
let currentDraftId = "";
let latestStatus = null;
let guideFile = null;
let guide = emptyGuide();
let guideBooted = false;

const guideRoot = document.getElementById("guide");
const guideBody = document.getElementById("guide-body");
const guideTitle = document.getElementById("guide-title");
const guideKicker = document.getElementById("guide-kicker");
const guideError = document.getElementById("guide-error");
const guideNext = document.getElementById("guide-next");
const guideBack = document.getElementById("guide-back");
const guideSkip = document.getElementById("guide-skip");

function guideStorage() {
  return localStorage;
}

function persistGuide() {
  try {
    guide = saveGuide(guideStorage(), guide);
  } catch {
    // The guide still works for this visit if storage is blocked.
  }
}

function hasGuideProfile() {
  return Boolean(latestStatus?.profiles?.length);
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function addChoice(parent, { label, detail, selected, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `guide-choice${selected ? " selected" : ""}`;
  button.setAttribute("aria-pressed", selected ? "true" : "false");
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = detail;
  button.append(strong, span);
  button.addEventListener("click", onClick);
  parent.append(button);
  return button;
}

function addNote(parent, text) {
  const note = document.createElement("p");
  note.className = "guide-note";
  note.textContent = text;
  parent.append(note);
  return note;
}

function showGuideError(message) {
  guideError.hidden = !message;
  guideError.textContent = message || "";
}

function renderGuide() {
  const visible = guide.open === true;
  guideRoot.hidden = !visible;
  const shell = document.querySelector(".shell");
  if (shell) shell.inert = visible;
  if (!visible) return;
  const copy = stepContent(guide);
  guideKicker.textContent = copy.kicker;
  guideTitle.textContent = copy.title;
  showGuideError(guide.step === "result" ? "" : guide.error);
  clear(guideBody);
  guideBack.hidden = guide.step === "intent" || guide.step === "result";
  guideSkip.hidden = guide.step === "result";
  guideNext.hidden = false;
  guideNext.disabled = false;
  guideNext.textContent = "Continue";

  if (guide.step === "intent") renderIntent();
  else if (guide.step === "channels") renderChannels();
  else if (guide.step === "content") renderContent();
  else if (guide.step === "creation") renderCreation();
  else if (guide.step === "review") renderReview();
  else renderResult();

  guideTitle.focus();
}

function renderIntent() {
  const list = document.createElement("div");
  list.className = "guide-list";
  for (const item of INTENTS) {
    addChoice(list, {
      label: item.label,
      detail: item.detail,
      selected: guide.intent === item.id,
      onClick: () => {
        guide = { ...guide, intent: item.id, error: "" };
        persistGuide();
        renderGuide();
      },
    });
  }
  guideBody.append(list);
  addNote(guideBody, "One step at a time. You can skip and come back from Setup guide.");
}

function renderChannels() {
  const known = profileFor(guide, latestStatus || {});
  if (known.known) {
    addNote(guideBody, `Using the profile already on this computer: ${known.name}.`);
  } else {
    const label = document.createElement("label");
    label.className = "field";
    const span = document.createElement("span");
    span.textContent = "What should we call this profile?";
    const input = document.createElement("input");
    input.value = guide.profileName || "";
    input.autocomplete = "organization";
    input.addEventListener("input", () => {
      guide = { ...guide, profileName: input.value, error: "" };
      persistGuide();
    });
    label.append(span, input);
    guideBody.append(label);
  }
  const list = document.createElement("div");
  list.className = "guide-list";
  for (const channel of channelCatalog()) {
    const plan = connectPlan(channel.key, latestStatus || {});
    const selected = guide.channels.includes(channel.key);
    const row = document.createElement("div");
    row.className = `guide-row${selected ? " selected" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "guide-choice";
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    const strong = document.createElement("strong");
    strong.textContent = channel.label;
    const status = document.createElement("span");
    status.className = "guide-status";
    status.dataset.channelStatus = channel.key;
    status.textContent = plan.message;
    button.append(strong, status);
    button.addEventListener("click", () => {
      guide = toggleChannel(guide, channel.key);
      persistGuide();
      renderGuide();
    });
    row.append(button);
    if (selected && plan.action === "oauth") {
      const connect = document.createElement("button");
      connect.type = "button";
      connect.className = "btn secondary";
      connect.textContent = `Connect ${channel.label}`;
      connect.addEventListener("click", () => connectFromGuide(plan.platforms, connect));
      row.append(connect);
    }
    if (selected && plan.action === "bluesky") {
      row.append(blueskyFields());
    }
    list.append(row);
  }
  guideBody.append(list);
  addNote(guideBody, "Choose a channel even if it is not connected yet. Saving a draft does not send it.");
}

function blueskyFields() {
  const form = document.createElement("form");
  form.className = "oauth-form";
  const handle = document.createElement("input");
  handle.placeholder = "you.bsky.social";
  handle.autocomplete = "off";
  handle.setAttribute("aria-label", "Bluesky handle");
  const password = document.createElement("input");
  password.type = "password";
  password.autocomplete = "off";
  password.setAttribute("aria-label", "Bluesky app password");
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn secondary";
  button.textContent = "Connect Bluesky";
  form.append(handle, password, button);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      const profile = profileFor(guide, latestStatus || {});
      if (!profile.id) throw new Error("Name this profile before connecting Bluesky.");
      const data = await api("/api/connect-bluesky", {
        method: "POST",
        body: JSON.stringify({
          id: profile.id,
          name: profile.name || profile.id,
          handle: handle.value,
          app_password: password.value,
        }),
      });
      password.value = "";
      latestStatus = data;
      renderStatus(data);
      guide = { ...guide, error: "" };
      persistGuide();
      renderGuide();
      showToast(data.connect?.message || "Bluesky connected");
    } catch (error) {
      guide = { ...guide, error: error.message };
      showGuideError(error.message);
    } finally {
      button.disabled = false;
    }
  });
  return form;
}

async function connectFromGuide(platforms, button) {
  button.disabled = true;
  try {
    const profile = profileFor(guide, latestStatus || {});
    if (!profile.id) throw new Error("Name this profile before connecting.");
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        id: profile.id,
        name: profile.name || profile.id,
        platforms,
      }),
    });
    latestStatus = data;
    renderStatus(data);
    guide = { ...guide, error: "" };
    persistGuide();
    renderGuide();
    showToast(data.connect?.message || "Continue sign-in in your browser");
  } catch (error) {
    guide = { ...guide, error: error.message };
    showGuideError(error.message);
  } finally {
    button.disabled = false;
  }
}

function renderContent() {
  if (guide.intent === "video" && guide.filename && !guideFile) {
    addNote(guideBody, `Choose ${guide.filename} again. The guide does not keep the file after you leave.`);
  }
  const title = document.createElement("input");
  title.value = guide.title || "";
  title.maxLength = 100;
  title.placeholder = guide.intent === "post" ? "Post title" : "Video title";
  title.setAttribute("aria-label", "Title");
  title.addEventListener("input", () => {
    guide = { ...guide, title: title.value, error: "" };
    persistGuide();
  });
  const description = document.createElement("textarea");
  description.value = guide.description || "";
  description.rows = 4;
  description.maxLength = 5000;
  description.placeholder = guide.intent === "ai" ? "Describe the idea" : "Description";
  description.setAttribute("aria-label", guide.intent === "ai" ? "Idea" : "Description");
  description.addEventListener("input", () => {
    guide = { ...guide, description: description.value, error: "" };
    persistGuide();
  });
  guideBody.append(title, description);
  if (guide.intent === "video") {
    if (guideFile) addNote(guideBody, `Selected file: ${guide.filename}. It stays selected until you pick another.`);
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "video/mp4,video/*";
    file.setAttribute("aria-label", "Video file");
    file.addEventListener("change", () => {
      guideFile = file.files && file.files[0] ? file.files[0] : null;
      guide = { ...guide, filename: guideFile ? guideFile.name : "", error: "" };
      persistGuide();
    });
    guideBody.append(file);
    addNote(guideBody, "The file stays on this computer until you save a draft. Nothing is uploaded on this step.");
  }
  if (guide.intent === "ai" || guide.intent === "video") {
    const requests = suggestedRequests(guide, latestStatus || {});
    const list = document.createElement("div");
    list.className = "guide-list";
    for (const item of requests) {
      addChoice(list, {
        label: item.text,
        detail: item.note,
        selected: guide.assistantRequest === item.text,
        onClick: async () => {
          guide = { ...guide, assistantRequest: item.text, error: "" };
          persistGuide();
          renderGuide();
          try {
            await navigator.clipboard.writeText(item.text);
            showToast("Request copied. Paste it in Cursor. PostPath did not run it.");
          } catch {
            showToast("Select the request and copy it. PostPath did not run it.");
          }
        },
      });
    }
    guideBody.append(list);
    addNote(guideBody, "Suggested requests are for a connected assistant. PostPath does not run them.");
  }
}

function renderCreation() {
  const list = document.createElement("div");
  list.className = "guide-list";
  for (const item of CREATION) {
    addChoice(list, {
      label: item.label,
      detail: item.detail,
      selected: guide.creation === item.id,
      onClick: () => {
        guide = { ...guide, creation: item.id, error: "" };
        persistGuide();
        renderGuide();
      },
    });
  }
  guideBody.append(list);
  if (guide.creation === "ai") {
    const enabled = Boolean(latestStatus?.cursor?.installed);
    addNote(
      guideBody,
      enabled
        ? "PostPath is listed in Cursor's config file. Restart Cursor before asking it for help. That file is not proof Cursor is connected."
        : AI_NOT_IN_APP,
    );
    if (!enabled) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn secondary";
      button.textContent = "Enable in Cursor";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const data = await api("/api/install-cursor", { method: "POST", body: "{}" });
          latestStatus = data;
          renderStatus(data);
          guide = { ...guide, error: "" };
          persistGuide();
          renderGuide();
          showToast("PostPath was written into Cursor's config. Restart Cursor. Nothing was published.");
        } catch (error) {
          guide = { ...guide, error: error.message };
          showGuideError(error.message);
        } finally {
          button.disabled = false;
        }
      });
      guideBody.append(button);
    }
  }
}

function addReviewRow(list, label, value) {
  const wrap = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value || "—";
  wrap.append(term, detail);
  list.append(wrap);
}

function renderReview() {
  const view = reviewView(guide, latestStatus || {}, { hasFile: Boolean(guideFile) });
  const list = document.createElement("dl");
  list.className = "guide-review";
  addReviewRow(list, "Title", view.title || "No title");
  addReviewRow(list, "Description", view.description || "No description");
  if (guide.intent === "video") addReviewRow(list, "Video file", view.filename || view.fileNote || "No file selected");
  addReviewRow(
    list,
    "Accounts",
    view.accounts.map((account) => `${account.label}: ${account.connected ? account.account : "Not connected"}`).join("\n") ||
      "No channel selected",
  );
  addReviewRow(list, "Privacy", view.privacy);
  addReviewRow(list, "Timing", view.timing);
  addReviewRow(list, "Publishing", view.publish);
  if (view.assistantRequest) addReviewRow(list, "Request for Cursor", view.assistantRequest);
  if (view.aiNote) addReviewRow(list, "AI", view.aiNote);
  guideBody.append(list);
  for (const plan of view.plans) {
    if (plan.note) addNote(guideBody, `${plan.label}: ${plan.note}`);
  }
  for (const blocker of view.blockers) addNote(guideBody, blocker);
  guideNext.textContent = "Save draft";
  guideNext.disabled = !view.canSave;
}

function renderResult() {
  const outcome = guide.outcome || { ok: false, message: guide.error || "The draft was not saved.", saves: [] };
  addNote(guideBody, outcome.message || guide.error || "The draft was not saved.");
  const saves = Array.isArray(outcome.saves) ? outcome.saves : [];
  for (const row of saves) {
    if (row.ok && row.post) {
      addNote(
        guideBody,
        `${row.post.platform}: status ${row.post.status}, privacy ${row.post.privacy_status}. Not published.`,
      );
    }
  }
  addNote(guideBody, "Next: connect a channel when sign-in is available, or publish later from the YouTube panel after you approve that exact draft. This guide will not publish it.");
  if (!outcome.ok) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn secondary";
    retry.textContent = "Back to review";
    retry.addEventListener("click", () => {
      guide = { ...guide, step: "review", error: "" };
      persistGuide();
      renderGuide();
    });
    guideBody.append(retry);
  }
  guideNext.textContent = "Done";
}

async function saveGuideDrafts() {
  const view = reviewView(guide, latestStatus || {}, { hasFile: Boolean(guideFile) });
  if (!view.canSave) {
    const message = view.blockers[0] || "The draft was not saved.";
    guide = { ...guide, step: "result", error: message, outcome: { ok: false, message, saves: [] }, completed: false };
    persistGuide();
    renderGuide();
    return;
  }
  const profile = profileFor(guide, latestStatus || {});
  const saves = [];
  for (const plan of view.plans) {
    try {
      let mediaPath = "";
      if (plan.needsFile) {
        if (!guideFile) throw new Error(plan.reason || "Choose the video file.");
        const saved = await api("/api/media", {
          method: "POST",
          headers: {
            "content-type": guideFile.type || "application/octet-stream",
            "x-postpath-filename": guideFile.name || "video.mp4",
          },
          body: guideFile,
        });
        mediaPath = saved.media.filename;
      }
      const data = await api("/api/draft", {
        method: "POST",
        body: JSON.stringify(draftRequest(plan, profile, mediaPath)),
      });
      saves.push({ ok: true, post: data.post });
      if (data.post?.platform === "youtube" && data.post.id) {
        currentDraftId = data.post.id;
        publishDraftButton.disabled = false;
        draftResult.textContent = `Draft ${data.post.id} saved. Privacy is ${data.post.privacy_status}. It is not published.`;
      }
      latestStatus = data;
    } catch (error) {
      saves.push({ ok: false, platform: plan.platform, message: error.message });
    }
  }
  const outcome = resultFromSaves(saves);
  guide = { ...guide, step: "result", outcome, error: outcome.ok ? "" : outcome.message, completed: outcome.ok };
  persistGuide();
  renderGuide();
  showToast(outcome.message, !outcome.ok);
}

function bootGuide() {
  if (guideBooted) return;
  guideBooted = true;
  let saved = null;
  try {
    saved = loadGuide(guideStorage());
  } catch {
    saved = null;
  }
  guide = saved || emptyGuide();
  if (shouldAutoOpen(saved)) guide = { ...guide, open: true };
  renderGuide();
}

document.getElementById("reopen-guide").addEventListener("click", () => {
  guide = reopenGuide(guide.step ? guide : emptyGuide());
  persistGuide();
  renderGuide();
});

guideBack.addEventListener("click", () => {
  guide = goBack(guide);
  persistGuide();
  renderGuide();
});

guideSkip.addEventListener("click", () => {
  guide = skipGuide(guide);
  persistGuide();
  renderGuide();
});

guideNext.addEventListener("click", () => {
  if (guide.step === "review") {
    saveGuideDrafts().catch((error) => {
      guide = { ...guide, step: "result", error: error.message, outcome: resultFromSaves([{ ok: false, message: error.message }]) };
      persistGuide();
      renderGuide();
    });
    return;
  }
  if (guide.step === "result") {
    guide = dismissGuide(guide);
    persistGuide();
    renderGuide();
    return;
  }
  guide = goNext(guide, { hasProfile: hasGuideProfile() });
  persistGuide();
  renderGuide();
});

document.getElementById("connect-youtube").addEventListener("click", async () => {
  const button = document.getElementById("connect-youtube");
  const plan = connectPlan("youtube", latestStatus || {});
  if (plan.action === "blocked") {
    showToast(plan.message || YOUTUBE_APP_MISSING, true);
    document.getElementById("apps-title")?.scrollIntoView();
    return;
  }
  button.disabled = true;
  try {
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        id: profileId.value.trim(),
        name: profileName.value.trim() || profileId.value.trim(),
        platforms: ["youtube"],
      }),
    });
    renderStatus(data);
    showToast(data.connect?.message || "Continue YouTube sign-in in your browser");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

youtubeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("save-draft");
  button.disabled = true;
  publishDraftButton.disabled = true;
  try {
    const form = new FormData(youtubeForm);
    const file = form.get("video");
    if (!file || !file.size) throw new Error("Choose the video file before saving the draft.");
    let mediaPath = "";
    if (file && typeof file === "object" && file.size) {
      const saved = await api("/api/media", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-postpath-filename": file.name || "video.mp4",
        },
        body: file,
      });
      mediaPath = saved.media.filename;
    }
    const data = await api("/api/draft", {
      method: "POST",
      body: JSON.stringify({
        id: profileId.value.trim(),
        name: profileName.value.trim() || profileId.value.trim(),
        platform: "youtube",
        title: String(form.get("title") || ""),
        description: String(form.get("description") || ""),
        tags: String(form.get("tags") || ""),
        privacy_status: String(form.get("privacy_status") || "private"),
        media_path: mediaPath || undefined,
        media_content_type: file && file.type ? file.type : "video/mp4",
      }),
    });
    currentDraftId = data.post?.id || "";
    const privacy = data.post?.privacy_status || "private";
    draftResult.textContent = currentDraftId
      ? `Draft ${currentDraftId} saved. Privacy is ${privacy}. Read it, then publish only if this is the approved video.`
      : "Draft was not saved.";
    publishDraftButton.disabled = !currentDraftId;
    showToast("Draft saved on this computer");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

publishDraftButton.addEventListener("click", async () => {
  if (!currentDraftId) return;
  const privacy = String(new FormData(youtubeForm).get("privacy_status") || "private");
  if (privacy !== "private") {
    const proceed = window.confirm(`This draft is ${privacy}. Publish it anyway?`);
    if (!proceed) return;
  }
  publishDraftButton.disabled = true;
  try {
    const data = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({ post_id: currentDraftId }),
    });
    const url = data.result?.published_url || data.post?.published_url || "";
    const outcome = data.post?.outcome || data.post?.status || "finished";
    const source = data.post?.result_source === "mock" ? "MOCK — not sent. " : "";
    draftResult.textContent = url
      ? `${source}${outcomeLabel(data.post)} ${data.post?.privacy_status || privacy}. ${url}`
      : `${source}${outcome}. ${data.post?.publish_note || "Check the Results list for the platform response."}`;
    renderStatus(data);
    showToast(data.post?.result_source === "mock" ? "Mock result saved" : "Publish finished");
  } catch (error) {
    showToast(error.message, true);
    publishDraftButton.disabled = false;
    refresh().catch(() => {});
  }
});

const metaForm = document.getElementById("meta-form");
const publishMetaButton = document.getElementById("publish-meta");
const metaResult = document.getElementById("meta-result");
let currentMetaDraftId = "";

document.getElementById("connect-meta").addEventListener("click", async () => {
  const button = document.getElementById("connect-meta");
  if (!latestStatus?.oauth_ready?.meta) {
    showToast(document.getElementById("meta-readiness")?.textContent || "Save the Meta app id and secret first.", true);
    document.getElementById("apps-title")?.scrollIntoView();
    return;
  }
  button.disabled = true;
  try {
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        id: profileId.value.trim(),
        name: profileName.value.trim() || profileId.value.trim(),
        platforms: ["meta"],
      }),
    });
    renderStatus(data);
    showToast(data.connect?.message || "Continue Meta sign-in in your browser");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

metaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("save-meta-draft");
  button.disabled = true;
  publishMetaButton.disabled = true;
  try {
    const form = new FormData(metaForm);
    const file = form.get("video");
    if (!file || !file.size) throw new Error("Choose the video file before saving the draft.");
    const saved = await api("/api/media", {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-postpath-filename": file.name || "video.mp4",
      },
      body: file,
    });
    const platform = String(form.get("platform") || "facebook");
    const data = await api("/api/draft", {
      method: "POST",
      body: JSON.stringify({
        id: profileId.value.trim(),
        name: profileName.value.trim() || profileId.value.trim(),
        platform,
        caption: String(form.get("caption") || ""),
        title: String(form.get("caption") || "").slice(0, 100),
        privacy_status: String(form.get("privacy_status") || "private"),
        media_path: saved.media.filename,
        media_content_type: file.type || "video/mp4",
      }),
    });
    currentMetaDraftId = data.post?.id || "";
    metaResult.textContent = currentMetaDraftId
      ? `Draft ${currentMetaDraftId} saved for ${platform}. Privacy is ${data.post?.privacy_status || "private"}. It is not published.`
      : "Draft was not saved.";
    publishMetaButton.disabled = !currentMetaDraftId;
    showToast("Draft saved on this computer");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

publishMetaButton.addEventListener("click", async () => {
  if (!currentMetaDraftId) return;
  const privacy = String(new FormData(metaForm).get("privacy_status") || "private");
  const platform = String(new FormData(metaForm).get("platform") || "facebook");
  if (platform === "instagram" && privacy !== "public") {
    showToast("Instagram Reels publish is public. Choose Public to upload it.", true);
    return;
  }
  if (privacy === "public") {
    const proceed = window.confirm(`This ${platform} draft is public. Publish it anyway?`);
    if (!proceed) return;
  }
  publishMetaButton.disabled = true;
  try {
    const data = await api("/api/publish", {
      method: "POST",
      body: JSON.stringify({ post_id: currentMetaDraftId }),
    });
    const source = data.post?.result_source === "mock" ? "MOCK — not sent. " : "";
    metaResult.textContent = `${source}${outcomeLabel(data.post)}. ${data.post?.publish_note || ""}`.trim();
    renderStatus(data);
    showToast(data.post?.result_source === "mock" ? "Mock result saved" : "Publish finished");
  } catch (error) {
    showToast(error.message, true);
    publishMetaButton.disabled = false;
    refresh().catch(() => {});
  }
});

document.getElementById("forget-vault").addEventListener("click", async () => {
  const proceed = window.confirm(
    "Remove saved accounts from this computer? PostPath stays installed. This does not delete videos already on YouTube.",
  );
  if (!proceed) return;
  try {
    const data = await api("/api/forget-vault", {
      method: "POST",
      body: JSON.stringify({ confirm: "remove saved accounts" }),
    });
    draftResult.textContent = data.message || "Saved accounts were removed. Quit PostPath and open it again.";
    showToast(draftResult.textContent);
  } catch (error) {
    showToast(error.message, true);
  }
});

refresh()
  .then(() => bootGuide())
  .catch((error) => {
    showToast(error.message, true);
    bootGuide();
  });
setInterval(() => {
  refresh().catch(() => {});
}, 5000);
