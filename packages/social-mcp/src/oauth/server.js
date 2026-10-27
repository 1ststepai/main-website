import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { CONNECT_ORDER, DEFAULT_OAUTH_PORT } from "../home.js";
import { signState, verifyState } from "../crypto.js";
import { mcpError } from "../errors.js";
import { authorizationUrl, createPkcePair, exchangeCode, missingProviders, oauthConfig } from "./providers.js";

function htmlPage(title, body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e8eefc;display:grid;place-items:center;min-height:100vh;margin:0}
  main{max-width:34rem;padding:2rem;border:1px solid #243149;border-radius:16px;background:#121a2b}
  h1{font-size:1.25rem;margin:0 0 .75rem} p{line-height:1.5;color:#b7c3da}
  a{color:#7db7ff}
</style></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`;
}

const BROWSER_OPENERS = {
  darwin: "/usr/bin/open",
  linux: "/usr/bin/xdg-open",
  win32: process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\cmd.exe` : "",
};

const PROVIDER_ALIASES = {
  instagram: "meta",
  facebook: "meta",
  google_business: "google_business",
};

function normalizeProvider(item) {
  const key = String(item || "").trim();
  if (PROVIDER_ALIASES[key]) return PROVIDER_ALIASES[key];
  return key;
}

function providerStillNeeded(provider, connections) {
  const have = (platform) => connections.some((row) => row.platform === platform);
  if (provider === "youtube") return !have("youtube");
  if (provider === "tiktok") return !have("tiktok");
  if (provider === "meta") return !(have("facebook") && have("instagram"));
  if (provider === "linkedin") return !have("linkedin");
  if (provider === "x") return !have("x");
  if (provider === "threads") return !have("threads");
  if (provider === "pinterest") return !have("pinterest");
  if (provider === "google_business") return !have("google_business");
  if (provider === "reddit") return !have("reddit");
  if (provider === "snapchat") return !have("snapchat");
  return true;
}

function openBrowser(url) {
  try {
    if (!/^https:\/\//i.test(url) && !/^http:\/\/127\.0\.0\.1(?::\d+)?\//i.test(url)) return;
    const platform = process.platform;
    if (platform === "darwin" && existsSync(BROWSER_OPENERS.darwin)) {
      spawn(BROWSER_OPENERS.darwin, [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    if (platform === "linux" && existsSync(BROWSER_OPENERS.linux)) {
      spawn(BROWSER_OPENERS.linux, [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    if (platform === "win32" && BROWSER_OPENERS.win32 && existsSync(BROWSER_OPENERS.win32)) {
      spawn(BROWSER_OPENERS.win32, ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // Caller still returns authorize_url for manual open.
  }
}

export function createOAuthRuntime({ store, env = process.env, fetchImpl = fetch, port = Number(env.SOCIAL_MCP_OAUTH_PORT || DEFAULT_OAUTH_PORT) }) {
  let server = null;
  let redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

  async function ensureListening() {
    if (server?.listening) return redirectUri;
    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/oauth/callback") {
          res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
          res.end(htmlPage("Not found", "<p>Use connect_accounts from your AI client.</p>"));
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end(htmlPage("Connection cancelled", `<p>${String(error)}</p>`));
          return;
        }
        const code = url.searchParams.get("code");
        const stateToken = url.searchParams.get("state");
        if (!code || !stateToken) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end(htmlPage("Missing code", "<p>Restart connect_accounts.</p>"));
          return;
        }
        const state = verifyState(stateToken, store.key);
        if (Date.now() - Number(state.ts || 0) > 15 * 60 * 1000) {
          throw mcpError("invalid_state", "The connection attempt expired. Start again.");
        }
        const config = oauthConfig(env, redirectUri);
        const exchanged = await exchangeCode(state.provider, {
          code,
          config,
          fetchImpl,
          codeVerifier: state.code_verifier || "",
        });
        for (const [platform, bundle] of Object.entries(exchanged.platforms || {})) {
          store.saveConnection(
            {
              profile_id: state.profile_id,
              ...bundle.record,
            },
            bundle.secrets,
          );
          store.appendAudit({
            id: store.newId("aud"),
            at: new Date().toISOString(),
            action: "connected",
            profile_id: state.profile_id,
            platform,
            detail: bundle.record.account_label,
          });
        }

        const chain = Array.isArray(state.chain) ? state.chain : [];
        const next = chain[0];
        if (next) {
          const nextUrl = await beginProvider(state.profile_id, next, chain.slice(1), { open: false });
          res.writeHead(302, { location: nextUrl });
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          htmlPage(
            "Connected",
            `<p>Profile <strong>${state.profile_id}</strong> is linked. You can close this tab and return to your AI client.</p>`,
          ),
        );
      } catch (error) {
        res.writeHead(error.statusCode || 500, { "content-type": "text/html; charset=utf-8" });
        res.end(htmlPage("Connection failed", `<p>${error.message || "Unexpected error."}</p>`));
      }
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
        resolve();
      });
    });
    return redirectUri;
  }

  async function beginProvider(profileId, provider, remainingChain = [], { open = true } = {}) {
    await ensureListening();
    const config = oauthConfig(env, redirectUri);
    const pkce = provider === "x" || provider === "youtube" || provider === "google_business" ? createPkcePair() : null;
    const state = signState(
      {
        profile_id: profileId,
        provider,
        chain: remainingChain,
        ts: Date.now(),
        nonce: store.newId("nonce"),
        code_verifier: pkce?.verifier || "",
      },
      store.key,
    );
    const url = authorizationUrl(provider, { state, config, pkce });
    if (open) openBrowser(url);
    return url;
  }

  async function connectAccounts(profileId, { platforms, open = true } = {}) {
    const profile = store.getProfile(profileId);
    if (!profile) throw mcpError("unknown_profile", "Create the profile first with upsert_profile.");
    await ensureListening();
    const connections = store.listConnections(profileId);
    const requested = platforms?.length
      ? platforms.map(normalizeProvider).filter((item) => CONNECT_ORDER.includes(item))
      : missingProviders(connections);
    const steps = [];
    for (const item of requested.length ? requested : CONNECT_ORDER) {
      const provider = normalizeProvider(item);
      if (!steps.includes(provider) && CONNECT_ORDER.includes(provider)) steps.push(provider);
    }
    const filtered = steps.filter((provider) => providerStillNeeded(provider, connections));
    if (!filtered.length) {
      return {
        profile_id: profileId,
        status: "complete",
        connections: store.listConnections(profileId),
        message: "All requested networks are already connected.",
      };
    }
    const [first, ...rest] = filtered;
    const url = await beginProvider(profileId, first, rest, { open });
    return {
      profile_id: profileId,
      status: "pending",
      started: first,
      remaining: rest,
      authorize_url: url,
      redirect_uri: redirectUri,
      message: open
        ? "Browser opened for sign-in. Finish each consent screen; the chain continues automatically."
        : "Open authorize_url to sign in. Finish each consent screen; the chain continues automatically.",
    };
  }

  async function stop() {
    if (!server) return;
    await new Promise((resolve) => server.close(() => resolve()));
    server = null;
  }

  return {
    connectAccounts,
    ensureListening,
    stop,
    get redirectUri() {
      return redirectUri;
    },
  };
}
