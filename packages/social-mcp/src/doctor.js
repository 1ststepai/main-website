// `postpath doctor`: read-only preflight before a production start.
// Never prints secret values, never decrypts tokens, never creates the home folder.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { DEFAULT_DESK_PORT, DEFAULT_OAUTH_PORT, resolveHome } from "./home.js";

const PRIVATE_FILES = ["master.key", "db.json", "oauth.env", "owner-auth.json", "owner-pin.txt", "pilot.json"];
const PRODUCTION_NETWORKS = ["youtube", "facebook", "instagram", "x", "tiktok", "pinterest"];
const APP_KEYS = {
  youtube: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
  facebook: ["META_APP_ID", "META_APP_SECRET"],
  instagram: ["META_APP_ID", "META_APP_SECRET"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  pinterest: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
};

function mode(path) {
  return statSync(path).mode & 0o777;
}

function octal(value) {
  return `0${value.toString(8)}`;
}

/** Key names set in oauth.env (values are read only to test non-empty, never returned). */
export function configuredKeyNames(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .filter((line) => line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") !== "")
    .map((line) => line.slice(0, line.indexOf("=")).trim());
}

export function portFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.unref();
    srv.once("error", (error) => resolve({ free: false, code: error.code }));
    srv.listen(port, host, () => srv.close(() => resolve({ free: true })));
  });
}

export async function runDoctor({ env = process.env, home = resolveHome(env), now = Date.now() } = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  const deskPort = Number(env.SOCIAL_MCP_DESK_PORT || DEFAULT_DESK_PORT);
  const oauthPort = Number(env.SOCIAL_MCP_OAUTH_PORT || DEFAULT_OAUTH_PORT);

  // 1. Home folder and file permissions.
  if (!existsSync(home)) {
    add("home", "fail", `${home} does not exist. Run \`postpath init\` with SOCIAL_MCP_HOME set.`);
  } else {
    const m = mode(home);
    add("home", m & 0o077 ? "fail" : "ok", `${home} mode ${octal(m)}${m & 0o077 ? " (should be 0700: chmod 700)" : ""}`);
    for (const name of PRIVATE_FILES) {
      const file = join(home, name);
      if (!existsSync(file)) continue;
      const fm = mode(file);
      add(`file:${name}`, fm & 0o077 ? "fail" : "ok", `mode ${octal(fm)}${fm & 0o077 ? " (should be 0600)" : ""}`);
    }
    const media = join(home, "media");
    if (existsSync(media)) {
      const mm = mode(media);
      add("file:media/", mm & 0o077 ? "fail" : "ok", `mode ${octal(mm)}`);
    }
  }
  if (!String(env.SOCIAL_MCP_HOME || "").trim()) add("SOCIAL_MCP_HOME", "warn", "Not set; using the default. Set it to a fixed path for a production start.");
  else add("SOCIAL_MCP_HOME", "ok", "set");

  // 2. Config (key names only).
  const keys = new Set(configuredKeyNames(join(home, "oauth.env")));
  for (const name of Object.values(APP_KEYS).flat()) if (String(env[name] || "").trim()) keys.add(name);
  const mode_ = String(env.SOCIAL_MCP_PUBLISH_MODE || env.POSTPATH_PUBLISH_MODE || "").toLowerCase() === "mock" ? "mock" : "live";
  add("publish_mode", mode_ === "mock" ? "warn" : "ok", mode_ === "mock" ? "mock: nothing reaches a platform" : "live");
  if (String(env.SOCIAL_MCP_PUBLIC_URL || "").trim()) add("public_url", "warn", "SOCIAL_MCP_PUBLIC_URL is set; a tunnel is not needed on the shared box.");
  const apps = {};
  for (const [network, names] of Object.entries(APP_KEYS)) {
    apps[network] = names.every((name) => keys.has(name));
    add(`app:${network}`, apps[network] ? "ok" : "warn", apps[network] ? `configured (${names.join(", ")})` : `missing ${names.filter((n) => !keys.has(n)).join(", ")}`);
  }

  // 3. Brand x network connection matrix (labels and flags only).
  const matrix = [];
  let pats = [];
  const dbFile = join(home, "db.json");
  if (existsSync(dbFile)) {
    let db = null;
    try {
      db = JSON.parse(readFileSync(dbFile, "utf8"));
    } catch {
      add("db", "fail", "db.json is not readable JSON.");
    }
    if (db) {
      const profiles = Object.keys(db.profiles || {});
      const conns = Object.values(db.connections || {});
      for (const profile of profiles) {
        for (const platform of PRODUCTION_NETWORKS) {
          const row = conns.find((c) => c.profile_id === profile && c.platform === platform);
          const expiresAt = row?.expires_at || row?.token_expires_at || null;
          const expired = expiresAt ? Date.parse(expiresAt) < now : false;
          matrix.push({
            profile_id: profile,
            platform,
            connected: Boolean(row && row.secrets_enc),
            account_label: row?.account_label || null,
            updated_at: row?.updated_at || null,
            expires_at: expiresAt,
            status: !row ? "not_connected" : expired ? "expired" : "connected",
          });
        }
      }
      add("connections", "ok", `${matrix.filter((r) => r.connected).length} of ${matrix.length} brand x network slots connected`);
      pats = Object.values(db.mcpAuth?.pats || {})
        .filter((p) => !p.revoked)
        .map((p) => ({
          name: p.name,
          scopes: p.scopes || [],
          // Brand scope (#77): brand ids, or ["*"] for every brand. Legacy `profiles` is read too.
          brands: Array.isArray(p.brands) && p.brands.length ? p.brands : Array.isArray(p.profiles) && p.profiles.length ? p.profiles : ["*"],
          expires_at: p.expires_at || null,
        }));
      const allBrands = pats.filter((p) => p.brands.includes("*"));
      if (allBrands.length) add("mcp_token_brands", "warn", `${allBrands.map((p) => p.name).join(", ")} can draft for every brand; create one brand-scoped token per brand if you want isolation`);
      const owners = pats.filter((p) => p.scopes.includes("queue:approve") || p.scopes.includes("owner"));
      add("mcp_tokens", owners.length ? "warn" : "ok", `${pats.length} active PAT(s)${owners.length ? `; ${owners.map((p) => p.name).join(", ")} can approve/publish (draft-only is the default)` : ", all draft-only"}`);
    }
  } else {
    add("db", "warn", "No db.json yet (no brands or connections).");
  }

  // 4. Port binding on loopback.
  for (const [name, port] of [["desk_port", deskPort], ["oauth_port", oauthPort]]) {
    const result = await portFree(port);
    add(name, result.free ? "ok" : "fail", result.free ? `127.0.0.1:${port} is free` : `127.0.0.1:${port} is in use (${result.code}); stop the other process or pick another port`);
  }

  const ok = !checks.some((c) => c.status === "fail");
  return { ok, home, desk_port: deskPort, oauth_port: oauthPort, mcp_url: `http://127.0.0.1:${deskPort}/mcp`, checks, connections: matrix, pats };
}

export function formatDoctor(report) {
  const icon = { ok: "OK  ", warn: "WARN", fail: "FAIL" };
  const lines = [`PostPath doctor — ${report.ok ? "ready" : "not ready"}`, `MCP endpoint: ${report.mcp_url}`, ""];
  for (const c of report.checks) lines.push(`[${icon[c.status]}] ${c.name}: ${c.detail}`);
  if (report.connections.length) {
    lines.push("", "Connections (names only):");
    for (const r of report.connections) lines.push(`  ${r.profile_id.padEnd(20)} ${r.platform.padEnd(10)} ${r.status}${r.account_label ? ` (${r.account_label})` : ""}${r.expires_at ? ` expires ${r.expires_at}` : ""}`);
  }
  if (report.pats.length) {
    lines.push("", "MCP tokens (names, scopes and brands only):");
    for (const p of report.pats) lines.push(`  ${p.name}: ${p.scopes.join(" ")} | brands: ${p.brands.includes("*") ? "all" : p.brands.join(", ")}`);
  }
  return lines.join("\n");
}
