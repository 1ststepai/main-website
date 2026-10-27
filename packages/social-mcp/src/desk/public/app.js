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

function renderStatus(data) {
  const dispatchHonesty = document.getElementById("dispatch-honesty");
  if (dispatchHonesty) dispatchHonesty.textContent = DISPATCH_HONESTY;

  const byPlatform = new Map((data.connections || []).map((row) => [row.platform, row]));
  networkList.innerHTML = NETWORKS.map((network) => {
    const row = byPlatform.get(network.key);
    const detail = row
      ? row.account_label || "Connected"
      : network.limited
        ? "API approval required"
        : "Not connected";
    const on = Boolean(row);
    const pill = on ? "Live" : network.limited ? "Limited" : "Needed";
    return `<li>
      <div>
        <strong>${network.label}</strong>
        <div class="meta" style="margin:0.2rem 0 0">${detail}</div>
      </div>
      <span class="pill ${on ? "on" : "off"}">${pill}</span>
    </li>`;
  }).join("");

  redirectUri.textContent = data.oauth_redirect_uri || "http://127.0.0.1:47831/oauth/callback";
  const cursor = data.cursor?.installed ? "PostPath enabled in Cursor" : "PostPath not enabled in Cursor yet";
  pathMeta.textContent = `${cursor} · vault ${data.home || ""} · media ${data.media_dir || ""}`;

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
    connectHint.textContent = "Save at least one provider’s credentials below, then connect.";
  } else if (data.cursor && !data.cursor.installed) {
    connectHint.textContent = "Connect accounts, then click Enable in Cursor so any AI can use them.";
  } else {
    connectHint.textContent = "Connect opens each configured OAuth provider in order. Bluesky uses the form below.";
  }

  renderScheduled(data.scheduled_posts);
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

document.getElementById("connect-youtube").addEventListener("click", async () => {
  const button = document.getElementById("connect-youtube");
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

refresh().catch((error) => showToast(error.message, true));
setInterval(() => {
  refresh().catch(() => {});
}, 5000);
