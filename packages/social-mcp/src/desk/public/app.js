import { initSeo } from "./seo.js";
import { initHook } from "./hook.js";
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
  setXAvailable,
} from "./guide.js";
import { platformIcon } from "./icons.js";
import { bindPilot, renderPilot } from "./pilotDesk.js";

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
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}), "x-postpath-desk": "1" },
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
  setXAvailable(data.x_available === true);
  document.body.classList.toggle("x-on", data.x_available === true);
  if (renderPilot(data)) return;
  document.body.classList.add("owner-mode");
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
    if (network.key === "x" && latestStatus?.x_available !== true) continue;
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
    if (key.endsWith("_SECRET") || key.endsWith("_API_KEY") || key.endsWith("_API_TOKEN") || key === "FAL_KEY") {
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
    connectHint.textContent = "Save the app credentials for the networks you use, then Connect accounts. One click chains YouTube, Facebook, Instagram, and the other browser logins. Bluesky uses the handle and app password in this panel. Nothing is posted.";
  } else if (data.cursor && !data.cursor.installed) {
    connectHint.textContent = "Connect accounts signs in to every network that is not connected yet. Bluesky uses the handle and app password in this panel. Then enable PostPath in Cursor. Nothing is posted.";
  } else {
    connectHint.textContent = "Connect accounts signs in to every network that is not connected yet. Bluesky uses the handle and app password in this panel. Nothing is posted.";
  }

  renderScheduled(data.scheduled_posts);
  renderQueue(data.queue);
  renderMcpRemote(data);
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

function renderMcpRemote(data) {
  const node = document.getElementById("mcp-remote");
  const remote = data?.mcp_remote;
  if (!node || !remote) return;
  node.replaceChildren();
  const links = document.createElement("div");
  links.className = "connect-links";
  for (const [label, href] of [
    ["Cursor install", remote.cursor_install],
    ["VS Code install", remote.vscode_install],
  ]) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    links.append(a);
  }
  const oauth = document.createElement("p");
  oauth.className = "hint";
  oauth.textContent = `${remote.oauth_note} MCP URL: ${remote.mcp_url}`;
  const claude = document.createElement("pre");
  claude.className = "mcp-config";
  claude.textContent = JSON.stringify(remote.claude_remote, null, 2);
  const header = document.createElement("pre");
  header.className = "mcp-config";
  header.textContent = JSON.stringify(remote.header_remote, null, 2);
  node.append(links, oauth, claude, header);
  const list = document.getElementById("pat-list");
  if (!list) return;
  list.replaceChildren();
  for (const pat of data.pats || []) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = `${pat.name} ${pat.prefix}…`;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${(pat.scopes || []).join(" ")} · last used ${pat.last_used_at || "never"}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn danger revoke-pat";
    button.dataset.id = pat.id;
    button.textContent = "Revoke";
    item.append(strong, meta, button);
    list.append(item);
  }
}

document.getElementById("pat-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const scopes = form.getAll("scope");
  try {
    const data = await api("/api/pat", {
      method: "POST",
      body: JSON.stringify({
        name: String(form.get("name") || ""),
        scopes,
        expires_in_days: form.get("expires_in_days") ? Number(form.get("expires_in_days")) : undefined,
      }),
    });
    const once = document.getElementById("pat-once");
    if (once) {
      once.hidden = false;
      once.textContent = `Copy this token now. It is not shown again: ${data.token}`;
    }
    renderStatus(data);
    once?.scrollIntoView({ block: "center" });
    showToast("Access token created");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("pat-list")?.addEventListener("click", (event) => {
  const button = event.target.closest(".revoke-pat");
  if (!button) return;
  api("/api/pat/revoke", { method: "POST", body: JSON.stringify({ id: button.dataset.id }) })
    .then((data) => {
      renderStatus(data);
      showToast("Token revoked");
    })
    .catch((error) => showToast(error.message, true));
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
    const id = profileId.value.trim();
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        id,
        name: profileName.value.trim() || id,
        platforms: ["youtube", "meta", "tiktok", "linkedin", ...(latestStatus?.x_available === true ? ["x"] : []), "threads", "pinterest", "google_business", "reddit", "snapchat"],
      }),
    });
    renderStatus(data);
    const bluesky = (data.connections || []).some((row) => row.platform === "bluesky" && row.profile_id === id);
    const blueskyNote = bluesky ? "" : " Bluesky uses the handle and app password in this panel.";
    if (data.connect?.authorize_url) {
      showToast(`${data.connect.message || "Sign-in opened in your browser"}${blueskyNote}`);
    } else {
      showToast(`${data.connect?.message || "Accounts connected"}${blueskyNote}`);
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
let currentBundleId = "";
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
  showGuideError(guide.step === "queue" || guide.step === "result" ? "" : guide.error);
  clear(guideBody);
  guideBack.hidden = guide.step === "accounts" || guide.step === "queue" || guide.step === "result";
  guideSkip.hidden = guide.step === "queue" || guide.step === "result";
  guideNext.hidden = false;
  guideNext.disabled = false;
  guideNext.textContent = guide.step === "prompt" ? "Save to the queue" : "Continue";

  if (guide.step === "accounts" || guide.step === "channels") renderChannels();
  else if (guide.step === "ai" || guide.step === "creation") renderAiConnect();
  else if (guide.step === "prompt" || guide.step === "content") renderPrompt();
  else renderResult();

  guideTitle.focus();
}

function renderAiConnect() {
  const list = document.createElement("div");
  list.className = "guide-list";
  for (const item of [
    { id: "ai", label: "Claude writes the captions", detail: "Uses your Anthropic key on this computer. The draft still waits in the queue." },
    { id: "manual", label: "I'll write them", detail: "The prompt is saved as the draft. Nothing is sent." },
  ]) {
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
  addNote(guideBody, "Paste the Anthropic key under App credentials. This guide never sees the key, and it does not approve or publish.");
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
      showToast("PostPath was written into Cursor's config. Restart Cursor. Nothing was published.");
    } catch (error) {
      showGuideError(error.message);
    } finally {
      button.disabled = false;
    }
  });
  guideBody.append(button);
}

function renderPrompt() {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = "What should this post be?";
  const input = document.createElement("textarea");
  input.rows = 4;
  input.maxLength = 2000;
  input.value = guide.description || guide.title || "";
  input.addEventListener("input", () => {
    guide = { ...guide, description: input.value, title: guide.title || input.value.slice(0, 80), error: "" };
    persistGuide();
  });
  label.append(span, input);
  guideBody.append(label);
  addNote(guideBody, "Save sends this to the queue as a private draft. Generate the asset from the composer if you want one. Nothing posts until you approve.");
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
  addNote(guideBody, "Review the queue. Nothing posts until you approve it there.");
  if (!outcome.ok) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn secondary";
    retry.textContent = "Back to the prompt";
    retry.addEventListener("click", () => {
      guide = { ...guide, step: "prompt", error: "" };
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
    guide = { ...guide, step: "queue", error: message, outcome: { ok: false, message, saves: [] }, completed: false };
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
  guide = { ...guide, step: "queue", outcome, error: outcome.ok ? "" : outcome.message, completed: outcome.ok };
  persistGuide();
  renderGuide();
  showToast(outcome.message, !outcome.ok);
}

function bootGuide() {
  if (document.body.classList.contains("pilot-mode")) return;
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
  if (guide.step === "prompt" || guide.step === "review") {
    saveGuideDrafts().catch((error) => {
      guide = { ...guide, step: "queue", error: error.message, outcome: resultFromSaves([{ ok: false, message: error.message }]) };
      persistGuide();
      renderGuide();
    });
    return;
  }
  if (guide.step === "queue" || guide.step === "result") {
    guide = dismissGuide(guide);
    persistGuide();
    renderGuide();
    document.getElementById("queue-list")?.scrollIntoView({ block: "center" });
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
    const provider = document.getElementById("media-provider")?.value || "none";
    const prompt = document.getElementById("media-prompt")?.value.trim() || "";
    const writer = document.getElementById("caption-provider")?.value || "none";
    const generate = provider !== "none";
    const description = String(form.get("description") || "");
    if ((generate || writer !== "none") && !prompt && !description) throw new Error("Write one prompt.");
    if (!generate && writer === "none" && (!file || !file.size)) throw new Error("Choose your file, or pick a provider and write a prompt.");
    let mediaPath = "";
    if (!generate && file && typeof file === "object" && file.size) {
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
    const platforms = [...document.querySelectorAll("#platform-toggles input:checked")].map((input) => input.value);
    if (!platforms.length) throw new Error("Pick at least one platform.");
    const score = document.getElementById("vidiq-score")?.value.trim();
    const notes = document.getElementById("vidiq-notes")?.value.trim();
    const duration = document.getElementById("media-duration")?.value.trim();
    const overrides = {
      facebook: { caption: document.getElementById("facebook-caption")?.value || undefined },
      instagram: { caption: document.getElementById("instagram-caption")?.value || undefined },
    };
    if (document.getElementById("youtube-long")?.checked) overrides.youtube = { placement: "youtube_long" };
    const data = await api("/api/draft", {
      method: "POST",
      body: JSON.stringify({
        id: profileId.value.trim(),
        name: profileName.value.trim() || profileId.value.trim(),
        platforms,
        title: String(form.get("title") || ""),
        description: writer === "none" ? description : undefined,
        caption: writer === "none" ? description : undefined,
        brief: writer === "none" ? undefined : prompt || description,
        tags: String(form.get("tags") || ""),
        privacy_status: String(form.get("privacy_status") || "private"),
        media_path: mediaPath || undefined,
        media_content_type: generate
          ? document.getElementById("media-type")?.value === "image"
            ? "image/jpeg"
            : "video/mp4"
          : file && file.type
            ? file.type
            : "video/mp4",
        media: generate
          ? {
              generate: {
                prompt,
                type: document.getElementById("media-type")?.value || "video",
                style: document.getElementById("media-style")?.value.trim() || undefined,
                duration: duration ? Number(duration) : undefined,
                provider,
              },
            }
          : undefined,
        caption_provider: document.getElementById("caption-provider")?.value || "none",
        review: document.getElementById("claude-review")?.checked === true,
        review_provider: document.getElementById("claude-review")?.checked ? "claude" : undefined,
        instagram_public_confirmed: document.getElementById("instagram-confirm")?.checked === true,
        facebook_public: document.getElementById("facebook-public")?.checked === true,
        overrides,
        vidiq: score || notes ? { score: score ? Number(score) : undefined, notes } : undefined,
      }),
    });
    currentDraftId = data.post?.id || "";
    currentBundleId = data.bundle?.id || "";
    const privacy = data.post?.privacy_status || "private";
    draftResult.textContent = data.bundle
      ? data.bundle.media_status === "generating"
        ? `Draft saved for ${(data.bundle.platforms || []).join(", ")}. The asset is generating. Nothing posts until you approve it.`
        : `Draft saved for ${(data.bundle.platforms || []).join(", ")}. Nothing posts until you approve it.`
      : currentDraftId
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

function renderQueue(items) {
  const list = document.getElementById("queue-list");
  const empty = document.getElementById("queue-empty");
  if (!list) return;
  list.replaceChildren();
  const rows = Array.isArray(items) ? items : [];
  if (empty) empty.hidden = rows.length > 0;
  for (const item of rows) {
    const li = document.createElement("li");
    const top = document.createElement("div");
    top.className = "queue-top";
    const strong = document.createElement("strong");
    strong.textContent = `${item.profile_name || item.profile_id}: ${item.title || "Draft"}`;
    top.append(strong);
    if (item.source === "mcp") {
      const ai = document.createElement("span");
      ai.className = "chip ai";
      ai.textContent = "From AI";
      top.append(ai);
    }
    if (item.vidiq_needed) {
      const chip = document.createElement("span");
      chip.className = "chip vidiq";
      chip.textContent = "vidIQ check needed";
      top.append(chip);
    }
    for (const target of item.platforms || []) {
      top.append(platformIcon(target.platform));
    }
    const actions = document.createElement("div");
    actions.className = "queue-actions";
    const now = document.createElement("button");
    now.type = "button";
    now.className = "btn primary approve-now";
    now.dataset.id = item.id;
    now.dataset.kind = item.kind;
    now.textContent = "Approve and post now";
    const when = document.createElement("input");
    when.type = "datetime-local";
    when.className = "queue-when";
    when.setAttribute("aria-label", `Approve ${item.title || "draft"} for date and time`);
    const later = document.createElement("button");
    later.type = "button";
    later.className = "btn secondary approve-later";
    later.dataset.id = item.id;
    later.dataset.kind = item.kind;
    later.textContent = "Approve for time";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn tiny edit-queue";
    edit.dataset.id = item.id;
    edit.dataset.kind = item.kind;
    edit.textContent = "Edit";
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "btn danger discard-queue";
    discard.dataset.id = item.id;
    discard.dataset.kind = item.kind;
    discard.textContent = "Discard";
    if (!document.body.classList.contains("pilot-mode")) actions.append(now, when, later);
    actions.append(edit, discard);
    li.append(top);
    if (Array.isArray(item.seo?.notes) && item.seo.notes.length) {
      const seoNotes = document.createElement("p");
      seoNotes.className = "seo-notes";
      seoNotes.textContent = item.seo.notes.join(" ");
      li.append(seoNotes);
    }
    if (item.hook?.spoken) {
      const script = document.createElement("p");
      script.className = "hook-script";
      const from = item.hook.borrowed_from?.[0]?.url ? ` Structure borrowed from ${item.hook.borrowed_from[0].url}` : "";
      script.textContent = `On camera: ${item.hook.spoken}.${from}`;
      li.append(script);
    }
    if (item.media_status === "generating") {
      const pending = document.createElement("p");
      pending.className = "hint";
      pending.textContent = `Generating${item.provider ? ` with ${item.provider}` : ""}…`;
      li.append(pending);
    } else if (item.media_status === "failed") {
      const failed = document.createElement("p");
      failed.className = "hint";
      failed.textContent = item.media_error || "Generation failed.";
      li.append(failed);
    }
    const cards = document.createElement("div");
    cards.className = "asset-row";
    for (const asset of item.assets || []) {
      if (!asset.media_path && !asset.prompt && !asset.provider) continue;
      const card = document.createElement("article");
      card.className = "asset-card";
      if (asset.media_path) {
        const visual = String(asset.content_type || "").startsWith("video/") ? document.createElement("video") : document.createElement("img");
        visual.src = `/media/${encodeURIComponent(asset.media_path)}`;
        if (visual.tagName === "VIDEO") {
          visual.controls = true;
          visual.preload = "metadata";
        } else {
          visual.alt = asset.label || asset.platform;
        }
        card.append(visual);
      }
      const meta = document.createElement("div");
      meta.className = "asset-meta";
      const badge = document.createElement("span");
      badge.className = "chip aspect-badge";
      badge.textContent = [asset.label, asset.aspect].filter(Boolean).join(" ");
      const check = document.createElement("p");
      check.textContent = asset.spec_message || (asset.spec_ok === false ? "Does not match the network preset." : "");
      const who = document.createElement("p");
      who.textContent = [asset.provider, asset.model, asset.prompt].filter(Boolean).join(" · ");
      const assetActions = document.createElement("div");
      assetActions.className = "queue-actions";
      for (const [className, label] of [
        ["regenerate-asset", "Regenerate"],
        ["swap-asset", "Replace"],
        ["remove-asset", "Remove"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn tiny ${className}`;
        button.dataset.id = item.id;
        button.dataset.kind = item.kind;
        button.dataset.platform = asset.platform;
        button.textContent = label;
        assetActions.append(button);
      }
      meta.append(badge, check, who, assetActions);
      card.append(meta);
      cards.append(card);
    }
    if (cards.childElementCount) li.append(cards);
    if (item.media_review?.items?.length) {
      const notes = document.createElement("ul");
      notes.className = "review-notes";
      const intro = document.createElement("li");
      intro.textContent = item.media_review.summary || "Advisory notes only. Nothing was approved.";
      notes.append(intro);
      for (const note of item.media_review.items) {
        const row = document.createElement("li");
        const chip = document.createElement("span");
        chip.className = `chip ${note.status || "warn"}`;
        chip.textContent = note.label || note.id;
        const detail = document.createElement("span");
        detail.textContent = note.detail || "";
        row.append(chip, detail);
        notes.append(row);
      }
      li.append(notes);
    }
    else if (item.prompt || item.media_status === "failed" || item.media_status === "generating") {
      const again = document.createElement("button");
      again.type = "button";
      again.className = "btn tiny regenerate-asset";
      again.dataset.id = item.id;
      again.dataset.kind = item.kind;
      again.textContent = "Regenerate";
      li.append(again);
    }
    if (item.instagram_needs_confirm) {
      const label = document.createElement("label");
      label.className = "check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "queue-ig";
      label.append(box, document.createTextNode("Instagram will be public"));
      actions.append(label);
    }
    li.append(actions);
    list.append(li);
  }
}

function isoFromLocal(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) throw new Error("Pick a date and time.");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  if (!Number.isFinite(date.getTime())) throw new Error("Pick a date and time.");
  return date.toISOString();
}

async function approveQueue(button, scheduledAt) {
  const row = button.closest("li");
  const kind = button.dataset.kind;
  const id = button.dataset.id;
  const confirmed = row?.querySelector(".queue-ig")?.checked === true || document.getElementById("instagram-confirm")?.checked === true;
  button.disabled = true;
  try {
    const score = document.getElementById("vidiq-score")?.value.trim();
    const notes = document.getElementById("vidiq-notes")?.value.trim();
    if (kind === "bundle" && (score || notes)) {
      await api("/api/vidiq", {
        method: "POST",
        body: JSON.stringify({ bundle_id: id, score: score ? Number(score) : undefined, notes }),
      });
    }
    const data = await api("/api/approve", {
      method: "POST",
      body: JSON.stringify({
        bundle_id: kind === "bundle" ? id : undefined,
        post_id: kind === "post" ? id : undefined,
        scheduled_at: scheduledAt || undefined,
        instagram_public_confirmed: confirmed,
      }),
    });
    renderStatus(data);
    const results = data.results || [];
    const failed = results.filter((item) => item.ok === false);
    const messages = [...new Set(failed.map((item) => item.error?.message).filter(Boolean))];
    const note = scheduledAt
      ? "Approved for that time. Nothing is posted yet."
      : failed.length && failed.length === results.length
        ? messages.join(" ") || "Nothing was posted."
        : failed.length
          ? "Approved. Check each platform in Results."
          : "Approved and sent. Nothing posted before this click.";
    showToast(note);
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
  }
}

const replaceInput = document.createElement("input");
replaceInput.type = "file";
replaceInput.accept = "video/mp4,video/*,image/*";
replaceInput.hidden = true;
document.body.append(replaceInput);
let replaceTarget = null;
replaceInput.addEventListener("change", async () => {
  const file = replaceInput.files?.[0];
  const target = replaceTarget;
  replaceInput.value = "";
  replaceTarget = null;
  if (!file || !target) return;
  try {
    const saved = await api("/api/media", {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-postpath-filename": file.name || "upload.bin",
      },
      body: file,
    });
    const data = await api("/api/media/attach", {
      method: "POST",
      body: JSON.stringify({
        bundle_id: target.kind === "bundle" ? target.id : undefined,
        post_id: target.kind === "post" ? target.id : undefined,
        platform: target.platform,
        media_path: saved.media.filename,
        ai_generated: false,
        type: String(file.type || "").startsWith("image/") ? "image" : "video",
      }),
    });
    renderStatus(data);
    showToast("Asset replaced. Nothing posts until you approve.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("queue-list")?.addEventListener("click", async (event) => {
  const regen = event.target.closest(".regenerate-asset");
  const swap = event.target.closest(".swap-asset");
  const remove = event.target.closest(".remove-asset");
  if (regen || remove) {
    const button = regen || remove;
    button.disabled = true;
    try {
      const data = await api(regen ? "/api/media/generate" : "/api/media/remove", {
        method: "POST",
        body: JSON.stringify({
          bundle_id: button.dataset.kind === "bundle" ? button.dataset.id : undefined,
          post_id: button.dataset.kind === "post" ? button.dataset.id : undefined,
          platform: button.dataset.platform,
        }),
      });
      renderStatus(data);
      showToast(regen ? "Regenerating. Nothing posts until you approve." : "Asset removed.");
    } catch (error) {
      showToast(error.message, true);
      button.disabled = false;
    }
    return;
  }
  if (swap) {
    replaceTarget = { id: swap.dataset.id, kind: swap.dataset.kind, platform: swap.dataset.platform };
    replaceInput.click();
    return;
  }
  const now = event.target.closest(".approve-now");
  const later = event.target.closest(".approve-later");
  const discard = event.target.closest(".discard-queue");
  const edit = event.target.closest(".edit-queue");
  if (now) {
    approveQueue(now).catch((error) => showToast(error.message, true));
    return;
  }
  if (later) {
    const when = later.parentElement?.querySelector(".queue-when")?.value;
    approveQueue(later, isoFromLocal(when)).catch((error) => showToast(error.message, true));
    return;
  }
  if (edit) {
    document.getElementById("youtube-title")?.scrollIntoView({ block: "center" });
    showToast("Edit the composer, then save the draft again.");
    return;
  }
  if (!discard) return;
  discard.disabled = true;
  api("/api/discard", {
    method: "POST",
    body: JSON.stringify({
      bundle_id: discard.dataset.kind === "bundle" ? discard.dataset.id : undefined,
      post_id: discard.dataset.kind === "post" ? discard.dataset.id : undefined,
    }),
  })
    .then((data) => {
      renderStatus(data);
      showToast("Draft discarded");
    })
    .catch((error) => {
      showToast(error.message, true);
      discard.disabled = false;
    });
});

publishDraftButton.addEventListener("click", async () => {
  if (currentBundleId) {
    publishDraftButton.disabled = true;
    try {
      const data = await api("/api/approve", {
        method: "POST",
        body: JSON.stringify({
          bundle_id: currentBundleId,
          instagram_public_confirmed: document.getElementById("instagram-confirm")?.checked === true,
        }),
      });
      renderStatus(data);
      draftResult.textContent = "Approved. Each platform has its own result.";
      showToast("Approved and sent");
    } catch (error) {
      showToast(error.message, true);
      publishDraftButton.disabled = false;
    }
    return;
  }
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

bindPilot(renderStatus);
// SEO and Opening panels are owner tools. The pilot (broker) desk does not load them.
function initOwnerSteps() {
  if (document.body.classList.contains("pilot-mode")) return;
  initSeo({ api, showToast, refresh });
  initHook({ api, showToast, refresh });
}
refresh()
  .then(() => {
    initOwnerSteps();
    bootGuide();
  })
  .catch((error) => {
    showToast(error.message, true);
    initOwnerSteps();
    bootGuide();
  });
setInterval(() => {
  refresh().catch(() => {});
}, 5000);
window.addEventListener("focus", () => {
  refresh().catch(() => {});
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh().catch(() => {});
});

// Auto-post: owner-only. The assistant can request it; only this panel (or the consent screen) turns it on.
const AUTO_NETWORKS = ["youtube", "facebook", "instagram", "tiktok", "linkedin", "x", "threads", "pinterest", "bluesky", "google_business", "reddit"];

function autoPostPinHeaders() {
  const pin = document.getElementById("auto-post-pin")?.value || "";
  return { "content-type": "application/json", ...(pin ? { "x-postpath-owner-pin": pin } : {}) };
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderAutoPost(view) {
  const list = document.getElementById("auto-post-list");
  if (!list) return;
  list.replaceChildren();
  document.getElementById("auto-post-pin-row").hidden = !view.pin_required;
  if (!view.brands.length) {
    list.append(el("p", { className: "hint" }, "Add a brand first."));
    return;
  }
  for (const brand of view.brands) {
    const card = el("div", { className: "auto-brand", dataset: { profile: brand.profile_id } });
    card.append(el("h3", {}, brand.name || brand.profile_id));
    if (!brand.connections.length) card.append(el("p", { className: "hint" }, "No AI connections yet. Auto-post is off."));
    for (const conn of brand.connections) {
      const row = el("div", { className: "auto-conn", dataset: { connection: conn.connection_id } });
      row.append(el("div", {}, `${conn.name} (${conn.kind === "pat" ? "access token" : conn.kind === "oauth" ? "OAuth" : "inactive"})`));
      const state = conn.enabled
        ? `On for ${conn.networks.join(", ")} since ${new Date(conn.enabled_at).toLocaleString()} (${conn.enabled_by})`
        : "Off: every draft waits for your approval";
      row.append(el("div", { className: `auto-state ${conn.enabled ? "on" : "off"}` }, state));
      if (conn.pending_request) {
        row.append(el("div", { className: "auto-pending" }, `Assistant asked for: ${conn.pending_request.networks.join(", ")} (${new Date(conn.pending_request.requested_at).toLocaleString()}). Not on until you confirm.`));
      }
      if (conn.active) {
        const nets = el("div", { className: "auto-nets" });
        const chosen = conn.enabled ? conn.networks : conn.pending_request?.networks || [];
        for (const net of (view.networks || AUTO_NETWORKS).filter((item) => item !== "x" || latestStatus?.x_available === true)) {
          const label = el("label", { className: "check" });
          const box = el("input", { type: "checkbox", value: net, className: "auto-net" });
          box.checked = chosen.includes(net);
          label.append(box, document.createTextNode(` ${net}`));
          nets.append(label);
        }
        const risk = el("p", { className: "auto-risk" }, view.risk_label);
        const confirmLabel = el("label", { className: "check" });
        const confirm = el("input", { type: "checkbox", className: "auto-confirm" });
        confirmLabel.append(confirm, document.createTextNode(" I understand. Post without asking me for the ticked networks."));
        const enable = el("button", { type: "button", className: "btn danger auto-enable" }, conn.enabled ? "Update auto-post" : "Turn on auto-post");
        row.append(nets, risk, confirmLabel, enable);
      }
      if (conn.enabled || conn.pending_request) {
        row.append(el("button", { type: "button", className: "btn secondary auto-disable" }, conn.enabled ? "Turn off now" : "Clear request"));
      }
      card.append(row);
    }
    list.append(card);
  }
}

async function loadAutoPost() {
  const panel = document.getElementById("auto-post-panel");
  if (!panel) return;
  const response = await fetch("/api/auto-post");
  if (response.status === 403) {
    panel.hidden = true;
    return;
  }
  const payload = await response.json();
  if (payload.auto_post) renderAutoPost(payload.auto_post);
}

document.getElementById("auto-post-list")?.addEventListener("click", async (event) => {
  const button = event.target.closest(".auto-enable, .auto-disable");
  if (!button) return;
  const row = button.closest(".auto-conn");
  const card = button.closest(".auto-brand");
  const body = { profile_id: card.dataset.profile, connection_id: row.dataset.connection };
  try {
    if (button.classList.contains("auto-enable")) {
      const networks = [...row.querySelectorAll(".auto-net:checked")].map((box) => box.value);
      if (!networks.length) throw new Error("Tick at least one network.");
      if (!row.querySelector(".auto-confirm").checked) throw new Error("Tick the confirm box first.");
      if (!window.confirm(`Highest risk: the assistant will post without asking you each time.\n\nTurn on auto-post for ${networks.join(", ")}?`)) return;
      const data = await api("/api/auto-post/enable", {
        method: "POST",
        headers: autoPostPinHeaders(),
        body: JSON.stringify({ ...body, networks, confirm: true }),
      });
      renderAutoPost(data.auto_post);
      showToast("Auto-post is on for this connection.");
    } else {
      const data = await api("/api/auto-post/disable", { method: "POST", body: JSON.stringify(body) });
      renderAutoPost(data.auto_post);
      showToast("Auto-post is off. The next draft waits for approval.");
    }
  } catch (error) {
    showToast(error.message, true);
  }
});

loadAutoPost().catch(() => {});

// Guided onboarding: one screen at a time, every step after the name has "Set up later".
const ONB_LABELS = { name: "Name", pack: "Starter pack", connect: "Connect", draft: "First draft", approve: "Approve", done: "Done" };

function pinHeaders(inputId) {
  const pin = document.getElementById(inputId)?.value || "";
  return { "content-type": "application/json", ...(pin ? { "x-postpath-owner-pin": pin } : {}) };
}

async function onbStep(body) {
  const data = await api("/api/onboarding/step", { method: "POST", headers: pinHeaders("onboarding-pin"), body: JSON.stringify(body) });
  renderOnboarding(data.onboarding, data.pin_required);
}

function onbButton(text, className, handler) {
  const button = el("button", { type: "button", className }, text);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await handler();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function laterLink(step) {
  return onbButton("Set up later", "onb-later", () => onbStep({ step, later: true }));
}

function renderOnboarding(state, pinRequired) {
  const body = document.getElementById("onboarding-body");
  const steps = document.getElementById("onboarding-steps");
  if (!body || !steps) return;
  document.getElementById("onboarding-pin-row").hidden = !pinRequired;
  steps.replaceChildren();
  const index = state.steps.indexOf(state.step);
  state.steps.forEach((step, i) => steps.append(el("li", { className: i === index ? "now" : i < index ? "past" : "" }, ONB_LABELS[step])));
  body.replaceChildren();
  const title = document.getElementById("onboarding-title");
  if (state.step === "name") {
    title.textContent = "What's the brand called?";
    const input = el("input", { id: "onb-name", placeholder: "Harbor Realty", autocomplete: "off" });
    body.append(el("label", {}, "Brand name"), input, onbButton("Continue", "btn primary", () => onbStep({ step: "name", name: input.value })));
  } else if (state.step === "pack") {
    title.textContent = "Start from a pack, or blank";
    body.append(el("p", { className: "hint" }, "A pack fills audience, voice, words to avoid, hashtags, footer and search terms. You can edit every field after."));
    const packs = el("div", { className: "onb-packs" });
    for (const pack of state.packs) packs.append(onbButton(pack.label, "btn secondary onb-pack", () => onbStep({ step: "pack", pack: pack.id })));
    packs.append(onbButton("Start blank", "btn secondary onb-pack", () => onbStep({ step: "pack", pack: "blank" })));
    body.append(packs, laterLink("pack"));
  } else if (state.step === "connect") {
    title.textContent = "Connect one account";
    body.append(
      el("p", { className: "hint" }, state.connected.length ? `Connected: ${state.connected.join(", ")}` : "Use Connect accounts on this page for one network, then come back here."),
      el("div", { className: "onb-actions" }),
    );
    const actions = body.lastChild;
    actions.append(onbButton("Check again", "btn secondary", async () => {
      const data = await api("/api/onboarding");
      renderOnboarding(data.onboarding, data.pin_required);
    }));
    if (state.connected.length) actions.append(onbButton("Continue", "btn primary", () => onbStep({ step: "connect" })));
    actions.append(laterLink("connect"));
  } else if (state.step === "draft") {
    title.textContent = "Write a first draft";
    const caption = el("textarea", { id: "onb-caption", rows: "4", placeholder: "What should the first post say?" });
    body.append(el("label", {}, "Caption"), caption, el("div", { className: "onb-actions" }));
    body.lastChild.append(onbButton("Save draft", "btn primary", () => onbStep({ step: "draft", caption: caption.value })), laterLink("draft"));
  } else if (state.step === "approve") {
    title.textContent = state.pilot ? "Approve it" : "Approve and pick a time";
    body.append(el("p", { className: "hint" }, state.pilot ? "Approval puts it in the queue as approved, waiting to post. Nothing posts from here." : "Pick when it should post. Nothing posts right away."));
    const when = el("input", { id: "onb-when", type: "datetime-local" });
    if (!state.pilot) body.append(el("label", {}, "Post at"), when);
    body.append(el("div", { className: "onb-actions" }));
    body.lastChild.append(
      onbButton("Approve", "btn primary", () => onbStep(state.pilot ? { step: "approve" } : { step: "approve", scheduled_at: when.value ? new Date(when.value).toISOString() : "" })),
      laterLink("approve"),
    );
  } else {
    title.textContent = "You're set up";
    const outcome = { "approved, waiting to post": "Your first draft is approved, waiting to post.", scheduled: "Your first draft is scheduled.", draft_saved: "Your first draft is saved for later.", no_draft: "Your brand is saved. Draft whenever you're ready." }[state.outcome] || "Your brand is saved.";
    body.append(el("p", {}, outcome));
    if (state.skipped.length) body.append(el("p", { className: "hint" }, `Left for later: ${state.skipped.map((s) => ONB_LABELS[s]).join(", ")}.`));
    body.append(onbButton("Set up another brand", "btn secondary", () => onbStep({ step: "restart" })));
  }
}

async function loadOnboarding() {
  const data = await api("/api/onboarding");
  renderOnboarding(data.onboarding, data.pin_required);
}

// Shareable brand page: owner opt-in, off by default.
function renderBrandPages(view) {
  const list = document.getElementById("brand-page-list");
  if (!list) return;
  document.getElementById("brand-page-pin-row").hidden = !view.pin_required;
  list.replaceChildren();
  if (!view.brands.length) list.append(el("li", { className: "hint" }, "Add a brand first."));
  for (const brand of view.brands) {
    const row = el("li", { className: "bp-row" });
    row.append(el("strong", {}, brand.name || brand.profile_id));
    if (brand.enabled) {
      const link = el("a", { href: brand.path, target: "_blank", rel: "noopener" }, `${location.origin}${brand.path}`);
      const exportLink = el("a", { href: `/api/brand-page/export.html?profile_id=${encodeURIComponent(brand.profile_id)}` }, "Download static HTML");
      row.append(el("div", { className: "meta" }, "On. Anyone with this link on this computer can read it:"), link, exportLink);
      row.append(onbButton("Turn off", "btn secondary", async () => {
        const data = await api("/api/brand-page/disable", { method: "POST", body: JSON.stringify({ profile_id: brand.profile_id }) });
        renderBrandPages(data.brand_page);
      }));
    } else {
      row.append(el("div", { className: "meta" }, "Off"));
      row.append(onbButton("Share a read-only page", "btn secondary", async () => {
        const data = await api("/api/brand-page/enable", { method: "POST", headers: pinHeaders("brand-page-pin"), body: JSON.stringify({ profile_id: brand.profile_id }) });
        renderBrandPages(data.brand_page);
      }));
    }
    list.append(row);
  }
}

async function loadBrandPages() {
  const data = await api("/api/brand-page");
  renderBrandPages(data.brand_page);
}

loadOnboarding().catch(() => {});
loadBrandPages().catch(() => {});
