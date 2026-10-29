// Earned auto-post: the owner's posting mode per brand + network, the suggestion that
// appears once they have approved enough drafts unchanged, and the auto-post activity log.
// Turning auto-post on always goes through the PIN step; turning it off is one click.
import { autoPostNetworkBody, autoPostSnoozeBody, deskUrl } from "./deskApi.js";

const NETWORK_NAMES = {
  youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", x: "X",
  threads: "Threads", pinterest: "Pinterest", bluesky: "Bluesky", google_business: "Google Business", reddit: "Reddit", snapchat: "Snapchat", whatsapp: "WhatsApp",
};
const netName = (id) => NETWORK_NAMES[id] || id;

let view = null;
let pending = null;

function node(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else el.setAttribute(key, value);
  }
  if (text !== undefined) el.textContent = text;
  return el;
}

function toast(message, bad = false) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.textContent = message;
  box.classList.toggle("error", bad);
  box.hidden = false;
  setTimeout(() => { box.hidden = true; }, 4000);
}

async function post(route, body, pin = "") {
  const headers = { "content-type": "application/json", "x-postpath-desk": "1" };
  if (pin) headers["x-postpath-owner-pin"] = pin;
  const response = await fetch(deskUrl(route), { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.message || "Request failed");
  return payload;
}

export function promptText(row) {
  const r = row.readiness;
  return `You've approved ${r.approved_unedited} of your last ${r.window_size} drafts for ${row.brand} on ${netName(row.platform)} without changes. Let your assistant post these automatically?`;
}

function statsText(r) {
  if (!r.decided_total) return "No decisions yet";
  return `${r.approved_unedited} unchanged · ${r.approved_edited} edited · ${r.rejected} rejected (last ${r.window_size})`;
}

function renderPrompts(rows) {
  const box = document.getElementById("earned-prompts");
  box.replaceChildren();
  for (const row of rows.filter((item) => item.mode !== "auto" && item.readiness.suggest)) {
    const card = node("div", { className: "earned-card", dataset: { profile: row.profile_id, platform: row.platform } });
    card.append(node("p", {}, promptText(row)));
    card.append(node("p", { className: "earned-sub" }, `${row.readiness.rejected} rejected and ${row.readiness.approved_edited} edited in that stretch. You can turn it off any time with one click.`));
    const actions = node("div", { className: "earned-actions" });
    actions.append(
      node("button", { type: "button", className: "btn primary earned-on" }, view.pin_required ? "Turn on (PIN)" : "Turn on"),
      node("button", { type: "button", className: "btn secondary earned-snooze" }, "Not now"),
    );
    card.append(actions);
    box.append(card);
  }
}

function renderModes(rows) {
  const body = document.getElementById("posting-modes-body");
  body.replaceChildren();
  if (!rows.length) {
    const tr = node("tr");
    tr.append(node("td", { colspan: "5", className: "hint" }, "Add a brand and connect a network first."));
    body.append(tr);
    return;
  }
  for (const row of rows) {
    const tr = node("tr", { dataset: { profile: row.profile_id, platform: row.platform } });
    const auto = row.mode === "auto";
    const mode = node("td");
    mode.append(node("span", { className: `mode-pill ${auto ? "auto" : "review"}` }, auto ? "Auto-post" : "Review each post"));
    const action = node("td");
    action.append(node("button", { type: "button", className: `btn ${auto ? "secondary earned-off" : "secondary earned-on"}` }, auto ? "Turn off" : "Turn on"));
    tr.append(node("td", {}, row.brand), node("td", {}, netName(row.platform)), mode, node("td", {}, statsText(row.readiness)), action);
    body.append(tr);
  }
}

function renderActivity(entries) {
  const list = document.getElementById("auto-activity-list");
  list.replaceChildren();
  if (!entries.length) {
    list.append(node("li", { className: "hint" }, "Nothing auto-posted yet."));
    return;
  }
  for (const entry of entries) {
    list.append(node("li", {}, `${new Date(entry.at).toLocaleString()} · ${entry.profile_id} on ${netName(entry.platform)} · "${entry.title}" · ${entry.status || ""} · by ${entry.assistant}`));
  }
}

function render(payload) {
  if (!payload?.posting) return;
  view = payload.posting;
  renderPrompts(view.networks);
  renderModes(view.networks);
  renderActivity(view.activity || []);
}

function openPinStep(profileId, platform) {
  const row = view.networks.find((item) => item.profile_id === profileId && item.platform === platform);
  pending = { profileId, platform };
  document.getElementById("earned-pin-what").textContent = `${row?.brand || profileId} on ${netName(platform)}`;
  document.getElementById("earned-pin-row").hidden = !view.pin_required;
  document.getElementById("earned-nopin").hidden = view.pin_required;
  document.getElementById("earned-pin").value = "";
  document.getElementById("earned-confirm").checked = false;
  const step = document.getElementById("earned-pin-step");
  step.hidden = false;
  (view.pin_required ? document.getElementById("earned-pin") : document.getElementById("earned-confirm")).focus();
}

async function load() {
  const response = await fetch(deskUrl("autoPost"));
  if (!response.ok) return;
  render(await response.json());
}

document.getElementById("auto-post-panel")?.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const holder = target.closest("[data-profile]");
  try {
    if (target.classList.contains("earned-on")) {
      openPinStep(holder.dataset.profile, holder.dataset.platform);
    } else if (target.classList.contains("earned-off")) {
      render(await post("autoPostNetwork", autoPostNetworkBody({ profileId: holder.dataset.profile, platform: holder.dataset.platform, enabled: false })));
      toast("Auto-post is off. The next draft waits for your review.");
    } else if (target.classList.contains("earned-snooze")) {
      render(await post("autoPostSnooze", autoPostSnoozeBody({ profileId: holder.dataset.profile, platform: holder.dataset.platform })));
      toast("Okay. We'll ask again after 10 more decisions.");
    } else if (target.id === "earned-pin-cancel") {
      document.getElementById("earned-pin-step").hidden = true;
      pending = null;
    } else if (target.id === "earned-pin-go" && pending) {
      const pin = document.getElementById("earned-pin").value;
      const confirm = document.getElementById("earned-confirm").checked;
      if (view.pin_required && !pin) throw new Error("Enter your owner PIN.");
      if (!view.pin_required && !confirm) throw new Error("Tick the confirm box first.");
      const body = autoPostNetworkBody({ ...pending, enabled: true, confirm: !view.pin_required && confirm });
      render(await post("autoPostNetwork", body, view.pin_required ? pin : ""));
      document.getElementById("earned-pin-step").hidden = true;
      pending = null;
      toast("Auto-post is on for that brand and network.");
    }
  } catch (error) {
    toast(error.message, true);
  }
});

load().catch(() => {});
