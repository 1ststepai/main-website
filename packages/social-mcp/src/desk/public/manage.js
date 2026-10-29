import { deskUrl } from "./deskApi.js";
// Manage accounts and the session recorder. Owner-only panels.
// Assistants can only queue account changes; approval happens here, and deletes need a typed confirmation.

const EXAMPLES = {
  "youtube.update_channel": { description: "Short, clear channel description.", keywords: "career jobs \"job search\"" },
  "youtube.upload_banner": { media_path: "banner.png" },
  "youtube.create_playlist": { title: "Playlist title", description: "", privacy_status: "private" },
  "youtube.update_playlist": { playlist_id: "PL…", title: "New title" },
  "youtube.delete_playlist": { playlist_id: "PL…" },
  "youtube.add_playlist_item": { playlist_id: "PL…", video_id: "…" },
  "youtube.remove_playlist_item": { playlist_item_id: "…" },
  "youtube.update_video": { video_id: "…", title: "New title", tags: ["tag"] },
  "youtube.set_visibility": { video_id: "…", privacy_status: "unlisted" },
  "youtube.delete_video": { video_id: "…" },
  "facebook.edit_post": { post_id: "…", message: "Updated text" },
  "facebook.delete_post": { post_id: "…" },
  "facebook.update_page": { about: "Short about text", website: "https://1ststep.ai" },
  "facebook.comment_hide": { comment_id: "…", hidden: true },
  "facebook.comment_delete": { comment_id: "…" },
  "facebook.comment_reply": { comment_id: "…", message: "Thanks!" },
  "instagram.comment_hide": { comment_id: "…", hidden: true },
  "instagram.comment_delete": { comment_id: "…" },
  "instagram.comment_reply": { comment_id: "…", message: "Thanks!" },
  "instagram.set_comments_enabled": { media_id: "…", enabled: false },
  "x.create_post": { text: "Post text", media_paths: [] },
  "x.reply": { in_reply_to: "…", text: "Reply text" },
  "x.delete_post": { tweet_id: "…" },
  "x.like": { tweet_id: "…" },
  "x.follow": { username: "1ststepai" },
};

const STATUS_LABEL = {
  pending_approval: "Waiting for you",
  awaiting_confirm: "Waiting for typed confirmation",
  executing: "Applying",
  done: "Done",
  failed: "Failed",
  discarded: "Discarded",
};

function make(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value !== undefined) node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function pinHeaders() {
  const pin = document.getElementById("manage-pin")?.value || "";
  return { "content-type": "application/json", "x-postpath-desk": "1", ...(pin ? { "x-postpath-owner-pin": pin } : {}) };
}

async function call(route, body, query) {
  const response = await fetch(deskUrl(route, query), body === undefined ? {} : { method: "POST", headers: pinHeaders(), body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || "Request failed");
    error.code = payload.code;
    throw error;
  }
  return payload;
}

function toast(message, isError = false) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
  node.classList.toggle("error", isError);
}

const manageState = { profiles: [], profile: "", view: null, confirm: {} };

async function loadProfiles() {
  const status = await call("status");
  manageState.profiles = (status.profiles || []).map((row) => ({ id: row.id, name: row.name || row.id }));
  const select = document.getElementById("manage-profile");
  if (!select) return;
  const current = manageState.profile || select.value || manageState.profiles[0]?.id || "";
  select.replaceChildren(...manageState.profiles.map((row) => make("option", { value: row.id, selected: row.id === current }, row.name)));
  manageState.profile = current;
}

function renderAccess(access) {
  const box = document.getElementById("manage-access");
  box.replaceChildren();
  for (const row of access) {
    const card = make("div", { className: `access-row ${row.action}`, dataset: { platform: row.platform } });
    const head = make("div", { className: "access-head" });
    head.append(make("strong", {}, row.label));
    head.append(make("span", { className: `access-badge ${row.action}` }, row.action === "ok" ? "Full access" : row.action === "connect" ? "Not connected" : "Reconnect for full access"));
    card.append(head);
    if (row.connected) card.append(make("p", { className: "hint" }, `${row.account_label || "Connected account"}${row.scopes_known ? "" : " · connected before this update, so its permissions are unknown. It keeps posting until you reconnect."}`));
    const lists = make("div", { className: "access-lists" });
    const granted = make("ul", { className: "granted" });
    for (const scope of row.granted) granted.append(make("li", {}, `✓ ${scope.label}`));
    const missing = make("ul", { className: "missing" });
    for (const scope of row.missing) missing.append(make("li", {}, `✗ ${scope.label}`));
    if (row.granted.length) lists.append(make("div", {}, "Granted"), granted);
    if (row.missing.length) lists.append(make("div", {}, "Missing"), missing);
    card.append(lists);
    if (row.action !== "ok") {
      card.append(make("button", { type: "button", className: "btn primary manage-reconnect", dataset: { provider: row.provider, platform: row.platform } }, row.action === "connect" ? "Connect" : "Reconnect"));
    }
    box.append(card);
  }
}

function describeParams(params) {
  return Object.entries(params || {})
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join(" · ");
}

function renderActions(actions) {
  const box = document.getElementById("manage-actions");
  box.replaceChildren();
  if (!actions.length) {
    box.append(make("p", { className: "hint" }, "No account changes queued. Your assistant can queue one, or use the form above."));
    return;
  }
  for (const action of actions) {
    const card = make("article", { className: `manage-item ${action.destructive ? "destructive" : ""} ${action.status}`, dataset: { id: action.id } });
    const head = make("div", { className: "access-head" });
    head.append(make("strong", {}, action.summary || action.label || action.type));
    head.append(make("span", { className: `access-badge ${action.status}` }, STATUS_LABEL[action.status] || action.status));
    card.append(head);
    card.append(make("p", { className: "hint" }, `${action.label || action.type} · from ${action.source === "mcp" ? "your assistant" : "this desk"} · ${new Date(action.created_at).toLocaleString()}`));
    if (action.note) card.append(make("p", {}, `Why: ${action.note}`));
    const params = describeParams(action.params);
    if (params) card.append(make("p", { className: "params" }, params));
    if (action.destructive) card.append(make("p", { className: "warn" }, "This can't be undone on the network. You'll be asked to type a confirmation."));
    if (action.error) card.append(make("p", { className: "error-text" }, `${action.error.code}: ${action.error.message}`));
    if (action.result?.url) card.append(make("a", { href: action.result.url, target: "_blank", rel: "noreferrer" }, "Open on the network"));
    const pending = manageState.confirm[action.id];
    if (["pending_approval", "awaiting_confirm", "failed"].includes(action.status)) {
      const buttons = make("div", { className: "row-buttons" });
      if (pending) {
        const confirmBox = make("div", { className: "confirm-box" });
        confirmBox.append(make("p", {}, `Second confirmation: type ${pending.phrase} to apply this change.`));
        const input = make("input", { type: "text", className: "confirm-input", placeholder: pending.phrase, autocomplete: "off", "aria-label": `Type ${pending.phrase} to confirm` });
        confirmBox.append(input);
        confirmBox.append(make("button", { type: "button", className: "btn danger manage-confirm", dataset: { id: action.id } }, "Confirm and apply"));
        confirmBox.append(make("button", { type: "button", className: "btn ghost manage-cancel-confirm", dataset: { id: action.id } }, "Cancel"));
        card.append(confirmBox);
      } else {
        buttons.append(make("button", { type: "button", className: `btn ${action.destructive ? "danger" : "primary"} manage-approve`, dataset: { id: action.id } }, action.status === "failed" ? "Try again" : action.destructive ? "Approve…" : "Approve"));
      }
      buttons.append(make("button", { type: "button", className: "btn ghost manage-discard", dataset: { id: action.id } }, "Discard"));
      card.append(buttons);
    }
    box.append(card);
  }
}

function renderCatalog(catalog) {
  const select = document.getElementById("manage-type");
  if (!select || select.options.length) return;
  for (const row of catalog) select.append(make("option", { value: row.type }, `${row.label}${row.destructive === true ? " (needs typed confirmation)" : ""}`));
  fillExample();
}

function renderLimits(limits) {
  const box = document.getElementById("manage-limits");
  if (!box || box.childElementCount) return;
  for (const [network, notes] of Object.entries(limits || {})) {
    const block = make("div", {});
    block.append(make("strong", {}, network));
    const ul = make("ul", {});
    for (const note of notes) ul.append(make("li", {}, note));
    block.append(ul);
    box.append(block);
  }
}

function fillExample() {
  const type = document.getElementById("manage-type").value;
  document.getElementById("manage-params").value = JSON.stringify(EXAMPLES[type] || {}, null, 2);
}

async function loadManage() {
  const panel = document.getElementById("manage-panel");
  if (!panel || document.body.classList.contains("pilot-mode")) return;
  if (!manageState.profiles.length) await loadProfiles();
  if (!manageState.profile) {
    document.getElementById("manage-access").replaceChildren(make("p", { className: "hint" }, "Add a brand first."));
    return;
  }
  const view = await call("manage", undefined, { profile_id: manageState.profile });
  manageState.view = view;
  renderAccess(view.access);
  renderCatalog(view.catalog);
  renderActions(view.actions);
  renderLimits(view.limits);
}

async function onManageClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  try {
    if (target.classList.contains("manage-reconnect")) {
      const provider = target.dataset.provider;
      fetch("/api/recordings/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "reconnect_started", provider, platform: target.dataset.platform }) }).catch(() => {});
      const data = await call("connect", { id: manageState.profile, name: manageState.profile, platforms: [provider], reconnect: true });
      toast(data.connect?.message || "Sign-in opened in your browser. Approve every permission, then come back.");
      return;
    }
    const id = target.dataset.id;
    if (target.classList.contains("manage-approve")) {
      const data = await call("manageApprove", { action_id: id });
      if (data.needs_confirm) {
        manageState.confirm[id] = { nonce: data.confirm_nonce, phrase: data.confirm_phrase };
        toast(`Type ${data.confirm_phrase} to confirm.`);
      } else toast(data.action?.status === "done" ? "Change applied." : "Approved.");
    } else if (target.classList.contains("manage-confirm")) {
      const pending = manageState.confirm[id];
      const text = target.parentElement.querySelector(".confirm-input").value;
      const data = await call("manageApprove", { action_id: id, confirm_nonce: pending?.nonce, confirm_text: text });
      delete manageState.confirm[id];
      toast(data.action?.status === "done" ? "Change applied." : "Approved.");
    } else if (target.classList.contains("manage-cancel-confirm")) {
      delete manageState.confirm[id];
    } else if (target.classList.contains("manage-discard")) {
      await call("manageDiscard", { action_id: id });
      delete manageState.confirm[id];
      toast("Discarded.");
    } else if (target.id === "manage-queue-btn") {
      let params;
      try {
        params = JSON.parse(document.getElementById("manage-params").value || "{}");
      } catch {
        throw new Error("Details must be valid JSON.");
      }
      await call("manageQueue", {
        profile_id: manageState.profile,
        type: document.getElementById("manage-type").value,
        params,
        note: document.getElementById("manage-note").value,
      });
      toast("Queued. Approve it below when you're ready.");
    }
    await loadManage();
  } catch (error) {
    if (error.code === "confirm_mismatch" || error.code === "confirm_expired") delete manageState.confirm[target.dataset.id];
    toast(error.message, true);
    await loadManage().catch(() => {});
  }
}

// ---------- Session recorder ----------
const rec = { media: null, recorder: null, chunks: [], id: null };

function renderIndicator(active) {
  const badge = document.getElementById("recording-indicator");
  if (!badge) return;
  badge.hidden = !active;
  if (active) badge.querySelector(".rec-name").textContent = active.name;
}

function renderRecordings(payload) {
  renderIndicator(payload.active);
  document.getElementById("rec-start").disabled = Boolean(payload.active);
  document.getElementById("rec-stop").disabled = !payload.active;
  const list = document.getElementById("recordings-list");
  list.replaceChildren();
  if (!payload.recordings.length) {
    list.append(make("p", { className: "hint" }, "No recordings yet. Recording is off until you start it."));
    return;
  }
  for (const row of payload.recordings) {
    const card = make("article", { className: "recording-item", dataset: { id: row.id } });
    const head = make("div", { className: "access-head" });
    head.append(make("strong", {}, row.name));
    head.append(make("span", { className: `access-badge ${row.active ? "recording" : "ok"}` }, row.active ? "Recording" : `${row.events} events`));
    card.append(head);
    card.append(make("p", { className: "hint" }, `${new Date(row.started_at).toLocaleString()}${row.stopped_at ? ` – ${new Date(row.stopped_at).toLocaleTimeString()}` : ""} · ${row.files.map((file) => file.name).join(", ")}`));
    const hasVideo = row.files.some((file) => file.name === "desk.webm");
    if (hasVideo) {
      const video = make("video", { controls: true, preload: "metadata", src: `/api/recordings/${row.id}/desk.webm`, className: "rec-video" });
      card.append(video);
    }
    const buttons = make("div", { className: "row-buttons" });
    for (const file of row.files) {
      buttons.append(make("a", { className: "btn ghost", href: `/api/recordings/${row.id}/${file.name}?download=1`, download: `${row.id}-${file.name}` }, `Export ${file.name}`));
    }
    if (row.files.some((file) => file.name === "summary.md")) buttons.append(make("a", { className: "btn ghost", href: `/api/recordings/${row.id}/summary.md`, target: "_blank" }, "Open summary"));
    buttons.append(make("button", { type: "button", className: "btn ghost rec-rename", dataset: { id: row.id } }, "Rename"));
    if (!row.active) buttons.append(make("button", { type: "button", className: "btn danger rec-delete", dataset: { id: row.id } }, "Delete"));
    card.append(buttons);
    list.append(card);
  }
}

async function loadRecordings() {
  if (!document.getElementById("recordings-panel") || document.body.classList.contains("pilot-mode")) return;
  renderRecordings(await call("recordings"));
}

async function startScreen(id) {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("This browser can't record a window.");
  // You pick the window. Audio stays off. Nothing outside the window you pick is captured.
  const media = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, selfBrowserSurface: "include", systemAudio: "exclude" });
  const recorder = new MediaRecorder(media, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
  rec.media = media;
  rec.recorder = recorder;
  rec.chunks = [];
  rec.id = id;
  recorder.ondataavailable = (event) => event.data.size && rec.chunks.push(event.data);
  recorder.start(1000);
  media.getVideoTracks()[0].addEventListener("ended", () => stopRecording().catch(() => {}));
  fetch("/api/recordings/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "screen_capture_started" }) }).catch(() => {});
}

async function finishScreen() {
  if (!rec.recorder) return;
  const recorder = rec.recorder;
  const done = new Promise((resolve) => (recorder.onstop = resolve));
  if (recorder.state !== "inactive") recorder.stop();
  await done;
  rec.media.getTracks().forEach((track) => track.stop());
  const blob = new Blob(rec.chunks, { type: "video/webm" });
  const id = rec.id;
  rec.media = rec.recorder = rec.id = null;
  rec.chunks = [];
  await fetch(deskUrl("recordingsVideo", { id }), { method: "POST", headers: { "content-type": "video/webm", "x-postpath-desk": "1" }, body: blob });
}

let stopping = false;
async function stopRecording() {
  if (stopping) return;
  stopping = true;
  try {
    await call("recordingsEvent", { type: "screen_capture_stopped" }).catch(() => {});
    await call("recordingsStop", {});
    await finishScreen();
    toast("Recording stopped and saved on this computer.");
  } finally {
    stopping = false;
    await loadRecordings().catch(() => {});
  }
}

async function onRecordingsClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  try {
    if (target.id === "rec-start") {
      const screen = document.getElementById("rec-screen").checked;
      const data = await call("recordingsStart", { name: document.getElementById("rec-name").value, screen });
      if (screen) {
        try {
          await startScreen(data.recording.id);
        } catch (error) {
          toast(`Recording events only: ${error.message}`, true);
        }
      } else toast("Recording events on this computer.");
    } else if (target.id === "rec-stop" || target.classList.contains("rec-stop-now")) {
      await stopRecording();
      return;
    } else if (target.classList.contains("rec-rename")) {
      const name = window.prompt("New name for this recording");
      if (!name) return;
      await call("recordingsRename", { id: target.dataset.id, name });
    } else if (target.classList.contains("rec-delete")) {
      if (!window.confirm("Delete this recording and its files from this computer?")) return;
      await call("recordingsDelete", { id: target.dataset.id, confirm: true });
      toast("Recording deleted.");
    }
    await loadRecordings();
  } catch (error) {
    toast(error.message, true);
  }
}

function boot() {
  document.getElementById("manage-panel")?.addEventListener("click", onManageClick);
  document.getElementById("manage-type")?.addEventListener("change", fillExample);
  document.getElementById("manage-profile")?.addEventListener("change", (event) => {
    manageState.profile = event.target.value;
    manageState.confirm = {};
    loadManage().catch((error) => toast(error.message, true));
  });
  document.getElementById("recordings-panel")?.addEventListener("click", onRecordingsClick);
  document.getElementById("recording-indicator")?.addEventListener("click", onRecordingsClick);
  const tick = () => {
    if (document.querySelector(".confirm-input:focus")) return;
    loadProfiles()
      .then(loadManage)
      .catch(() => {});
    loadRecordings().catch(() => {});
  };
  tick();
  setInterval(tick, 5000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

// "Score it": free built-in scorer, on demand only. Informational; it never blocks saving.
const scoreButton = document.getElementById("score-it");
if (scoreButton) {
  scoreButton.addEventListener("click", async () => {
    const form = document.getElementById("youtube-form");
    const out = document.getElementById("score-result");
    const fd = new FormData(form);
    const body = {
      title: fd.get("title") || "",
      description: fd.get("description") || "",
      tags: String(fd.get("tags") || ""),
      keyword: fd.get("score_keyword") || undefined,
      thumbnail_text: fd.get("thumbnail_text") || undefined,
      interest: document.getElementById("score-interest")?.checked ? "youtube_suggest" : "off",
    };
    out.hidden = false;
    out.textContent = "Scoring...";
    try {
      const res = await fetch("/api/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      out.replaceChildren();
      for (const [label, part] of [["Title checklist", data.title], ["Description and tags checklist", data.text], ["Thumbnail checklist", data.thumbnail]]) {
        if (!part) continue;
        const h = document.createElement("strong");
        h.textContent = `${label}: ${part.score}/100`;
        const ul = document.createElement("ul");
        for (const line of part.feedback) { const li = document.createElement("li"); li.textContent = line; ul.append(li); }
        out.append(h, ul);
      }
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = "Checklist scores with tips. A guide only; you can save whatever you like.";
      out.append(note);
      if (data.upsell) out.append(renderVidiqUpsell(data.upsell));
    } catch {
      out.textContent = "Couldn't score right now.";
    }
  });
}

// Optional vidIQ upsell beside the free score. A plain link; it never blocks or changes anything.
function renderVidiqUpsell(upsell) {
  const box = document.createElement("div");
  box.className = "vidiq-upsell";
  box.id = "vidiq-upsell";
  const text = document.createElement("p");
  text.textContent = `${upsell.text} (Optional.)`;
  const link = document.createElement("a");
  link.className = "btn ghost";
  link.id = "vidiq-connect";
  link.href = upsell.url;
  link.target = "_blank";
  link.rel = upsell.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer";
  link.textContent = upsell.button;
  box.append(text, link);
  if (upsell.promo) {
    const promo = document.createElement("p");
    promo.className = "vidiq-promo";
    promo.textContent = upsell.promo;
    box.append(promo);
  }
  if (upsell.disclosure) {
    const small = document.createElement("small");
    small.className = "vidiq-disclosure";
    small.textContent = upsell.disclosure;
    box.append(small);
  }
  return box;
}

const vidiqForm = document.getElementById("vidiq-settings");
if (vidiqForm) {
  fetch("/api/vidiq-upsell").then((r) => r.json()).then((d) => {
    if (d.upsell?.affiliate) vidiqForm.querySelector('[name="affiliate_url"]').placeholder = "Saved";
  }).catch(() => {});
  vidiqForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(vidiqForm);
    try {
      await call("settingsVidiq", { affiliate_url: fd.get("affiliate_url") || "", promo_code: fd.get("promo_code") || "" });
      toast("vidIQ link saved.");
    } catch (error) {
      toast(error.message || "Couldn't save.");
    }
  });
}
