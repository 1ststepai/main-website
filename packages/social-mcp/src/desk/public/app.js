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
const pathMeta = document.getElementById("path-meta");
const redirectUri = document.getElementById("redirect-uri");
const connectHint = document.getElementById("connect-hint");
const profileName = document.getElementById("profile-name");
const profileId = document.getElementById("profile-id");
const oauthForm = document.getElementById("oauth-form");
const blueskyForm = document.getElementById("bluesky-form");

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
}

async function refresh() {
  const data = await api("/api/status");
  renderStatus(data);
  return data;
}

document.getElementById("refresh-btn").addEventListener("click", () => {
  refresh().catch((error) => showToast(error.message, true));
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

refresh().catch((error) => showToast(error.message, true));
setInterval(() => {
  refresh().catch(() => {});
}, 5000);
