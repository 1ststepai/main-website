import {
  AI_NOT_IN_APP,
  CREATION,
  assistantConfigured,
  INTENTS,
  YOUTUBE_APP_MISSING,
  channelCatalog,
  connectPlan,
  dismissGuide,
  draftPlans,
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
import { DRAFT_FIELD_LIMITS, PLATFORM_TEXT_LIMITS } from "./limits.js";

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
const accountList = document.getElementById("account-list");
const scheduledList = document.getElementById("scheduled-list");
const draftList = document.getElementById("draft-list");
const pathMeta = document.getElementById("path-meta");
const redirectUri = document.getElementById("redirect-uri");
const connectHint = document.getElementById("connect-hint");
const profileName = document.getElementById("profile-name");
const profileId = document.getElementById("profile-id");
const oauthForm = document.getElementById("oauth-form");
const blueskyForm = document.getElementById("bluesky-form");
const selectedNetworks = new Set(["youtube"]);
const sessionDrafts = [];
let toastTimer = 0;

const DISPATCH_HONESTY =
  "After dispatch starts, PostPath cannot guarantee the platform did not accept the post. Cancel only works while a post is still scheduled. Dispatch-started posts stay needs review and are not auto-retried or undone.";

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
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 4200);
}

function showView(name) {
  for (const button of document.querySelectorAll("[data-view]")) {
    const on = button.dataset.view === name;
    button.setAttribute("aria-current", on ? "page" : "false");
    const view = document.getElementById(`view-${button.dataset.view}`);
    if (view) view.hidden = !on;
  }
}

function rememberDraft(post) {
  if (!post?.id) return;
  const index = sessionDrafts.findIndex((item) => item.id === post.id);
  if (index >= 0) sessionDrafts[index] = post;
  else sessionDrafts.unshift(post);
  renderSessionDrafts();
}

function renderSessionDrafts() {
  if (!draftList) return;
  draftList.replaceChildren();
  if (!sessionDrafts.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No drafts saved in this window.";
    draftList.append(empty);
    return;
  }
  for (const post of sessionDrafts) {
    const item = document.createElement("li");
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = String(post.title || post.caption || post.description || post.id);
    const when = document.createElement("div");
    when.className = "when";
    const state = post.status === "draft" ? "Draft, not published" : String(post.status || "saved");
    when.textContent = `${post.platform || "post"} · ${state}${post.privacy_status ? ` · ${post.privacy_status}` : ""}`;
    copy.append(strong, when);
    item.append(copy);
    draftList.append(item);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || "Request failed");
    error.snippet = payload.snippet || "";
    error.configPath = payload.configPath || "";
    throw error;
  }
  return payload;
}

let openAssistantId = "";

function groupTitle(group) {
  if (group === "paste") return "Copy the steps";
  if (group === "cloud") return "On the internet";
  return "On this computer";
}

function renderAssistants(data) {
  const list = document.getElementById("assistant-list");
  if (!list) return;
  const clients = Array.isArray(data.clients) ? data.clients : [];
  list.replaceChildren();
  let lastGroup = "";
  for (const client of clients) {
    if (client.group !== lastGroup) {
      lastGroup = client.group;
      const heading = document.createElement("h3");
      heading.className = "assistant-group";
      heading.textContent = groupTitle(client.group);
      list.append(heading);
    }
    const row = document.createElement("article");
    row.className = "assistant-row";
    const head = document.createElement("div");
    head.className = "assistant-head";
    const name = document.createElement("h4");
    name.textContent = client.label;
    const pill = document.createElement("span");
    pill.className = `pill ${client.status === "ready" ? "on" : client.status === "invalid" ? "off" : "wait"}`;
    pill.textContent = client.statusLabel;
    head.append(name, pill);
    const detail = document.createElement("p");
    detail.className = "assistant-detail";
    detail.textContent = client.detail;
    row.append(head, detail);
    if (client.configPath) {
      const path = document.createElement("p");
      path.className = "assistant-path";
      path.textContent = client.configPath;
      row.append(path);
    }
    const actions = document.createElement("div");
    actions.className = "assistant-actions";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "btn secondary";
    action.textContent = client.actionLabel || "Set up";
    action.addEventListener("click", async () => {
      if (client.mode === "write") {
        setupAssistant(client.id, action);
        return;
      }
      openAssistantId = client.id;
      renderAssistants(data);
      try {
        await navigator.clipboard.writeText(client.snippet || client.detail);
        showToast(client.group === "cloud" ? "Explanation copied" : "Steps copied");
      } catch {
        showToast("The steps are open below. Select them and copy.", true);
      }
    });
    actions.append(action);
    row.append(actions);
    if (openAssistantId === client.id && client.snippet) {
      row.append(snippetBlock(client));
    }
    list.append(row);
  }
}

function snippetBlock(client) {
  const wrap = document.createElement("div");
  wrap.className = "assistant-snippet";
  const pre = document.createElement("textarea");
  pre.readOnly = true;
  pre.rows = Math.min(12, String(client.snippet).split("\n").length + 1);
  pre.value = client.snippet;
  pre.setAttribute("aria-label", `${client.label} setup steps`);
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn tiny";
  copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(client.snippet);
      showToast("Steps copied");
    } catch {
      pre.focus();
      pre.select();
      showToast("Select the steps and copy them", true);
    }
  });
  wrap.append(pre, copy);
  return wrap;
}

async function setupAssistant(id, button) {
  button.disabled = true;
  try {
    const data = await api("/api/install-client", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    const client = (data.clients || []).find((item) => item.id === id);
    renderStatus(data);
    const name = client?.label || "That app";
    const lead = data.installed?.changed ? `${name} is set up.` : `${name} already had PostPath.`;
    const restart = client?.restart ? ` ${client.restart}` : "";
    showToast(`${lead}${restart}`);
  } catch (error) {
    if (error.snippet) openAssistantId = id;
    showToast(error.message, true);
    if (error.snippet) {
      const current = latestStatus || {};
      const clients = (current.clients || []).map((item) =>
        item.id === id ? { ...item, snippet: error.snippet } : item,
      );
      renderAssistants({ ...current, clients });
    }
  } finally {
    button.disabled = false;
  }
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

function renderStatus(data) {
  latestStatus = data;
  const dispatchHonesty = document.getElementById("dispatch-honesty");
  if (dispatchHonesty) dispatchHonesty.textContent = DISPATCH_HONESTY;

  const byPlatform = new Map((data.connections || []).map((row) => [row.platform, row]));
  renderAccounts(byPlatform, data);

  redirectUri.textContent = data.oauth_redirect_uri || "http://127.0.0.1:47831/oauth/callback";
  const readyClients = (data.clients || []).filter((client) => client.installed).map((client) => client.label);
  pathMeta.textContent = readyClients.length
    ? `Set up: ${readyClients.join(", ")}. Restart each one before you ask it to post.`
    : "No assistant is set up yet. Use Assistant when you want one.";
  renderAssistants(data);

  if (data.profiles?.[0] && !profileId.dataset.touched) {
    profileId.value = data.profiles[0].id;
    profileName.value = data.profiles[0].name;
  }

  const oauth = data.oauth || {};
  for (const [key, value] of Object.entries(oauth)) {
    const input = oauthForm.elements.namedItem(key);
    if (!input || typeof value !== "string") continue;
    if (String(value).includes("••••")) continue;
    if (key.endsWith("_ID") || key.endsWith("_KEY") || key.endsWith("_SECRET")) {
      input.value = value;
    }
  }

  if (data.next_step === "save_apps") {
    connectHint.textContent = "Sign-in apps are not set up yet. You can still write a draft. Owner setup is in Settings.";
  } else if (!assistantConfigured(data)) {
    connectHint.textContent = "Connect a channel when you are ready. An assistant is optional.";
  } else {
    connectHint.textContent = "Connect opens each ready network in your browser. Bluesky uses the form on this page.";
  }

  renderScheduled(data.scheduled_posts);
  renderSessionDrafts();
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

document.getElementById("copy-redirect").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(redirectUri.textContent);
    showToast("Redirect URI copied");
  } catch {
    showToast("Copy failed — select the URI manually", true);
  }
});

function renderAccounts(byPlatform, data) {
  if (!accountList) return;
  accountList.replaceChildren();
  const ordered = [...NETWORKS].sort((a, b) => Number(!byPlatform.has(a.key)) - Number(!byPlatform.has(b.key)));
  for (const network of ordered) {
    const row = byPlatform.get(network.key);
    const card = document.createElement("article");
    card.className = "account-card";
    const top = document.createElement("div");
    top.className = "account-top";
    const title = document.createElement("h3");
    title.textContent = network.label;
    const state = document.createElement("span");
    state.className = `status-label${row ? " on" : ""}`;
    state.textContent = row ? "Connected" : "Not connected";
    top.append(title, state);
    card.append(top);
    const note = document.createElement("p");
    note.className = "note";
    if (row) note.textContent = row.account_label || "Connected on this computer.";
    else if (network.key === "youtube" && !data.oauth_ready?.google) note.textContent = "YouTube sign-in is not included yet. You can still save a private draft.";
    else if (network.key === "bluesky") note.textContent = "Use the app password form below.";
    else if (network.key === "tiktok") note.textContent = "TikTok is not available from this window.";
    else if (network.limited) note.textContent = `${network.label} is not available from this window.`;
    else note.textContent = "Sign-in is not set up yet. You can still save a draft. It will not be sent.";
    card.append(note);
    if (!row && network.key !== "bluesky" && network.key !== "tiktok" && !network.limited) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn secondary";
      button.dataset.connect = network.key;
      button.textContent = `Connect ${network.label}`;
      card.append(button);
    }
    accountList.append(card);
  }
}

function currentProfile() {
  const id = profileId.value.trim();
  const name = profileName.value.trim() || id;
  return { id, name };
}

function ensureProfile() {
  const profile = currentProfile();
  if (profile.id) return profile;
  showView("settings");
  profileName.focus();
  throw new Error("Add a name in Settings first.");
}

document.getElementById("connect-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("connect-btn");
  button.disabled = true;
  try {
    ensureProfile();
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        id: currentProfile().id,
        name: currentProfile().name,
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
            showToast("Request copied. Paste it into your assistant. PostPath did not run it.");
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
    const enabled = assistantConfigured(latestStatus || {});
    addNote(
      guideBody,
      enabled
        ? "PostPath is listed in an assistant's settings. Restart that app before asking it for help. That file is not proof the app has connected."
        : AI_NOT_IN_APP,
    );
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn secondary";
    button.textContent = "Connect your AI assistant";
    button.addEventListener("click", () => {
      showView("assistant");
    });
    guideBody.append(button);
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
  if (view.assistantRequest) addReviewRow(list, "Request for your assistant", view.assistantRequest);
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
      rememberDraft(data.post);
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

for (const button of document.querySelectorAll("[data-reopen-guide]")) {
  button.addEventListener("click", () => {
    guide = reopenGuide(guide.step ? guide : emptyGuide());
    persistGuide();
    renderGuide();
  });
}

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

accountList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-connect]");
  if (!button) return;
  const platform = button.dataset.connect;
  if (platform === "youtube" && !latestStatus?.oauth_ready?.google) {
    showToast(YOUTUBE_APP_MISSING, true);
    return;
  }
  button.disabled = true;
  try {
    const profile = ensureProfile();
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify({
        id: profile.id,
        name: profile.name,
        platforms: [platform],
      }),
    });
    renderStatus(data);
    showToast(data.connect?.message || "Continue sign-in in your browser");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

function selectedList() {
  return [...selectedNetworks];
}

function bodyText() {
  return String(new FormData(youtubeForm).get("description") || "");
}

function renderLengthHints() {
  const host = document.getElementById("length-hints");
  if (!host) return;
  host.replaceChildren();
  const title = String(new FormData(youtubeForm).get("title") || "");
  const body = bodyText();
  const pills = [{ label: "Title", used: title.length, limit: DRAFT_FIELD_LIMITS.title }];
  for (const key of selectedList()) {
    const limit = PLATFORM_TEXT_LIMITS[key];
    if (!limit) continue;
    const network = NETWORKS.find((item) => item.key === key);
    pills.push({ label: network?.label || key, used: body.length, limit });
  }
  for (const pill of pills) {
    const node = document.createElement("span");
    node.className = `hint-pill${pill.used > pill.limit ? " over" : ""}`;
    node.textContent = `${pill.label} ${pill.used} / ${pill.limit}`;
    host.append(node);
  }
}

function reviewIssues() {
  const form = new FormData(youtubeForm);
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const file = form.get("video");
  const issues = [];
  if (!selectedList().length) issues.push("Choose at least one network.");
  if (!currentProfile().id) issues.push("Add a name in Settings first.");
  if (!title && !description) issues.push("Add a title or the words for the post.");
  if (selectedNetworks.has("youtube") && (!file || !file.size)) issues.push("Choose the video file before saving a YouTube draft.");
  for (const key of selectedList()) {
    if (key === "youtube") continue;
    const plans = draftPlans({ channels: [key], title, description, intent: "post" }, { hasFile: false });
    if (plans[0] && !plans[0].canSave) issues.push(`${plans[0].label}: ${plans[0].reason}`);
  }
  return issues;
}

function renderComposeReview() {
  const summary = document.getElementById("review-summary");
  const form = new FormData(youtubeForm);
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const privacy = String(form.get("privacy_status") || "private");
  const file = form.get("video");
  const issues = reviewIssues();
  summary.replaceChildren();
  const lines = [
    ["Networks", selectedList().map((key) => NETWORKS.find((item) => item.key === key)?.label || key).join(", ") || "None"],
    ["Title", title || "No title"],
    ["Words", description || "No words yet"],
  ];
  if (selectedNetworks.has("youtube")) {
    lines.push(["YouTube privacy", privacy]);
    lines.push(["Video", file && file.name ? file.name : "No video file"]);
  }
  for (const [label, value] of lines) {
    const row = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    row.append(strong, document.createTextNode(value));
    summary.append(row);
  }
  if (issues.length) {
    for (const issue of issues) {
      const row = document.createElement("p");
      row.textContent = issue;
      summary.append(row);
    }
  } else {
    const row = document.createElement("p");
    row.textContent = "Saving keeps this on this computer. It does not publish.";
    summary.append(row);
  }
  document.getElementById("save-draft").disabled = issues.length > 0;
}

document.getElementById("network-chips").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-network]");
  if (!chip || chip.disabled) return;
  const key = chip.dataset.network;
  if (selectedNetworks.has(key)) selectedNetworks.delete(key);
  else selectedNetworks.add(key);
  chip.setAttribute("aria-pressed", selectedNetworks.has(key) ? "true" : "false");
  document.getElementById("privacy-field").hidden = !selectedNetworks.has("youtube");
  renderLengthHints();
});

for (const field of youtubeForm.querySelectorAll("input, textarea")) {
  field.addEventListener("input", renderLengthHints);
}

const drop = document.getElementById("drop-zone");
const videoInput = document.getElementById("video-input");
function labelFile() {
  const file = videoInput.files && videoInput.files[0];
  document.getElementById("drop-label").textContent = file ? file.name : "Drop a video here, or choose a file";
  renderLengthHints();
}
videoInput.addEventListener("change", labelFile);
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("drag");
});
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("drag");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  videoInput.files = transfer.files;
  labelFile();
});

document.getElementById("review-draft").addEventListener("click", () => {
  renderComposeReview();
  document.getElementById("compose-editor").hidden = true;
  document.getElementById("compose-review").hidden = false;
});

document.getElementById("review-back").addEventListener("click", () => {
  document.getElementById("compose-review").hidden = true;
  document.getElementById("compose-editor").hidden = false;
});

for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => showView(button.dataset.view));
}

youtubeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("save-draft");
  const issues = reviewIssues();
  if (issues.length) {
    renderComposeReview();
    showToast(issues[0], true);
    return;
  }
  button.disabled = true;
  publishDraftButton.disabled = true;
  try {
    const form = new FormData(youtubeForm);
    const file = form.get("video");
    const title = String(form.get("title") || "");
    const description = String(form.get("description") || "");
    const privacy = String(form.get("privacy_status") || "private");
    const profile = ensureProfile();
    if (selectedNetworks.has("youtube")) {
      const saved = await api("/api/media", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-postpath-filename": file.name || "video.mp4",
        },
        body: file,
      });
      const data = await api("/api/draft", {
        method: "POST",
        body: JSON.stringify({
          id: profile.id,
          name: profile.name,
          platform: "youtube",
          title,
          description,
          privacy_status: privacy,
          media_path: saved.media.filename,
          media_content_type: file.type || "video/mp4",
        }),
      });
      currentDraftId = data.post?.id || "";
      rememberDraft(data.post);
      draftResult.textContent = currentDraftId
        ? `Draft ${currentDraftId} saved. Privacy is ${data.post?.privacy_status || privacy}. Read it, then publish only if this is the approved video.`
        : "Draft was not saved.";
      publishDraftButton.disabled = !currentDraftId;
      latestStatus = data;
    } else {
      currentDraftId = "";
      publishDraftButton.disabled = true;
      draftResult.textContent = "Draft saved on this computer. It is not published. Publish from this window is only for a YouTube draft you just saved.";
    }
    const plans = draftPlans(
      { channels: selectedList().filter((key) => key !== "youtube"), title, description, intent: "post" },
      { hasFile: false },
    );
    for (const plan of plans) {
      if (!plan.canSave) continue;
      const data = await api("/api/draft", {
        method: "POST",
        body: JSON.stringify(draftRequest(plan, profile)),
      });
      rememberDraft(data.post);
      latestStatus = data;
    }
    showToast("Draft saved on this computer");
  } catch (error) {
    showToast(error.message, true);
    publishDraftButton.disabled = !currentDraftId;
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
    if (data.post) rememberDraft(data.post);
    const url = data.result?.published_url || data.post?.published_url || "";
    draftResult.textContent = url
      ? `Published ${data.post?.privacy_status || privacy}. Open ${url} and confirm it, then delete it on YouTube when the check is done.`
      : "Publish finished without a video URL. Check the channel before trying again.";
    showToast("Publish finished");
  } catch (error) {
    showToast(error.message, true);
    publishDraftButton.disabled = false;
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

renderLengthHints();
renderSessionDrafts();
showView("compose");

refresh()
  .then(() => bootGuide())
  .catch((error) => {
    showToast(error.message, true);
    bootGuide();
  });
setInterval(() => {
  refresh().catch(() => {});
}, 5000);
