// Minimal personal desk. The assistant drafts; this page approves, connects and issues tokens.
const $ = (id) => document.getElementById(id);
let state = null;

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) node.append(kid);
  return node;
}

function flash(text) { $("flash").textContent = text; }

async function api(path, body) {
  const headers = { "content-type": "application/json", "x-postpath-desk": "1" };
  const pin = $("tok-pin").value;
  if (pin) headers["x-postpath-owner-pin"] = pin;
  const res = await fetch(path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

const STATE_TEXT = { connected: "Connected", expiring: "Expiring", expired: "Expired", not_connected: "Not connected", needs_app: "Needs your app" };

function renderGrid(grid) {
  const table = $("grid");
  table.querySelectorAll("thead,tbody").forEach((n) => n.remove());
  table.append(el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Brand"), ...grid.networks.map((n) => el("th", { scope: "col" }, n.label)))));
  const body = el("tbody");
  for (const row of grid.rows) {
    const tr = el("tr", {}, el("th", { scope: "row" }, row.brand_name));
    for (const cell of row.cells) {
      const action = cell.state === "needs_app"
        ? el("a", { href: "/#settings" }, "Add app")
        : el("button", {
            type: "button",
            class: cell.state === "connected" ? "secondary" : "",
            "aria-label": `${cell.state === "not_connected" ? "Connect" : "Reconnect"} ${cell.label} for ${row.brand_name}`,
            onclick: () => connect(row, cell),
          }, cell.state === "not_connected" ? "Connect" : "Reconnect");
      const note = cell.note || (cell.expires_at ? `Until ${new Date(cell.expires_at).toLocaleDateString()}` : "");
      tr.append(el("td", { class: "cell" }, el("span", { class: `st ${cell.state}` }, STATE_TEXT[cell.state]), note ? el("small", {}, note) : null, action));
    }
    body.append(tr);
  }
  table.append(body);
  const nudge = $("nudge");
  nudge.hidden = !grid.youtube_nudge;
  nudge.textContent = grid.youtube_nudge ? grid.youtube_nudge.message : "";
}

async function connect(row, cell) {
  try {
    flash(`Opening ${cell.label} sign-in for ${row.brand_name}…`);
    await api("/api/connect", { profile_id: row.brand_id, name: row.brand_name, platforms: [cell.platform], reconnect: cell.state !== "not_connected" });
    flash(`Finish signing in to ${cell.label} in the browser tab that opened, then refresh.`);
  } catch (e) { flash(e.message); }
}

function renderQueue(items) {
  const list = $("queue");
  list.replaceChildren();
  if (!items.length) { list.append(el("li", {}, "Nothing waiting. Ask your assistant for drafts.")); return; }
  for (const item of items) {
    const nets = (item.platforms || []).map((p) => p.platform).join(", ");
    const target = item.kind === "bundle" ? { bundle_id: item.id } : { post_id: item.id };
    list.append(el("li", {},
      el("div", { class: "meta" }, `${item.profile_name} · ${nets}${item.scheduled_at ? ` · scheduled ${new Date(item.scheduled_at).toLocaleString()}` : ""}`),
      el("strong", {}, item.title || "Draft"),
      item.caption && item.caption !== item.title ? el("p", {}, item.caption) : null,
      el("div", { class: "actions" },
        el("button", { type: "button", "aria-label": `Approve ${item.title}`, onclick: () => decide("/api/approve", target, "Approved.") }, "Approve"),
        el("button", { type: "button", class: "secondary", "aria-label": `Discard ${item.title}`, onclick: () => decide("/api/discard", target, "Discarded.") }, "Discard"))));
  }
}

async function decide(path, target, done) {
  try { await api(path, target); flash(done); await load(); } catch (e) { flash(e.message); }
}

function renderPats(pats) {
  const body = $("pats").querySelector("tbody");
  body.replaceChildren();
  if (!pats.length) { body.append(el("tr", {}, el("td", { colspan: "5" }, "No tokens yet."))); return; }
  for (const pat of pats) {
    const brands = pat.brands?.includes("*") ? "All brands" : (pat.brands || []).map((id) => state.brands.find((b) => b.id === id)?.name || id).join(", ");
    const draftOnly = !pat.scopes.some((s) => ["owner", "queue:approve", "accounts:write"].includes(s));
    body.append(el("tr", {}, el("td", {}, pat.name), el("td", {}, el("code", {}, `${pat.prefix}…`)), el("td", {}, brands), el("td", {}, draftOnly ? "Draft-only" : pat.scopes.join(", ")),
      el("td", {}, el("button", { type: "button", class: "secondary", "aria-label": `Revoke ${pat.name}`, onclick: () => revoke(pat) }, "Revoke"))));
  }
}

async function revoke(pat) {
  if (!confirm(`Revoke "${pat.name}"? The assistant using it loses access.`)) return;
  try { await api("/api/pat/revoke", { id: pat.id }); flash("Token revoked."); await load(); } catch (e) { flash(e.message); }
}

async function createToken(event) {
  event.preventDefault();
  const some = document.querySelector('input[name="scope"][value="some"]').checked;
  const brands = some ? [...document.querySelectorAll("#brand-boxes input:checked")].map((i) => i.value) : ["*"];
  if (!brands.length) { flash("Pick at least one brand."); return; }
  try {
    const out = await api("/api/personal/token", { name: $("tok-name").value, brands });
    $("new-token-value").textContent = out.token;
    $("new-token").hidden = false;
    flash("Token created. Copy it into your assistant's MCP settings.");
    await load();
  } catch (e) { flash(e.message); }
}

async function load() {
  const brand = $("brand-filter").value;
  state = await api(`/api/personal${brand ? `?brand=${encodeURIComponent(brand)}` : ""}`);
  $("mcp-url").textContent = state.mcp_url;
  $("pin-label").hidden = $("tok-pin").hidden = !state.pin_required;
  renderGrid(state.grid);
  renderQueue(state.queue);
  renderPats(state.pats);
}

function init() {
  // Brand pickers come from the server list so ids always match the `brands` field.
  fetch("/api/personal").then((r) => r.json()).then((s) => {
    for (const b of s.brands) {
      $("brand-filter").append(el("option", { value: b.id }, b.name));
      $("brand-boxes").append(el("label", {}, el("input", { type: "checkbox", value: b.id, onchange: () => { document.querySelector('input[name="scope"][value="some"]').checked = true; } }), ` ${b.name}`));
    }
    const fromUrl = new URLSearchParams(location.search).get("brand");
    if (fromUrl) $("brand-filter").value = fromUrl;
    return load();
  }).catch((e) => flash(e.message));
  $("brand-filter").addEventListener("change", () => load().catch((e) => flash(e.message)));
  $("token-form").addEventListener("submit", createToken);
  $("copy-token").addEventListener("click", () => navigator.clipboard?.writeText($("new-token-value").textContent).then(() => flash("Copied.")));
}

init();
