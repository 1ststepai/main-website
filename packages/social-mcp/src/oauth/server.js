import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { CONNECT_ORDER, DEFAULT_OAUTH_PORT } from "../home.js";
import { signState, verifyState } from "../crypto.js";
import { mcpError } from "../errors.js";
import { authorizationUrl, exchangeCode, missingProviders, oauthConfig } from "./providers.js";

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

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else if (platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // User can open the URL manually.
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
        const exchanged = await exchangeCode(state.provider, { code, config, fetchImpl });
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
    const state = signState(
      {
        profile_id: profileId,
        provider,
        chain: remainingChain,
        ts: Date.now(),
        nonce: store.newId("nonce"),
      },
      store.key,
    );
    const url = authorizationUrl(provider, { state, config });
    if (open) openBrowser(url);
    return url;
  }

  async function connectAccounts(profileId, { platforms } = {}) {
    const profile = store.getProfile(profileId);
    if (!profile) throw mcpError("unknown_profile", "Create the profile first with upsert_profile.");
    await ensureListening();
    const connections = store.listConnections(profileId);
    const missing = platforms?.length
      ? platforms.filter((item) => CONNECT_ORDER.includes(item) || item === "youtube" || item === "meta" || item === "tiktok")
      : missingProviders(connections);
    // Normalize aliases
    const steps = [];
    for (const item of missing.length ? missing : CONNECT_ORDER) {
      const provider = item === "instagram" || item === "facebook" ? "meta" : item;
      if (!steps.includes(provider) && CONNECT_ORDER.includes(provider)) steps.push(provider);
    }
    // Skip already satisfied providers
    const filtered = steps.filter((provider) => {
      if (provider === "youtube") return !connections.some((row) => row.platform === "youtube");
      if (provider === "tiktok") return !connections.some((row) => row.platform === "tiktok");
      if (provider === "meta") {
        return !(connections.some((row) => row.platform === "facebook") && connections.some((row) => row.platform === "instagram"));
      }
      return true;
    });
    if (!filtered.length) {
      return {
        profile_id: profileId,
        status: "complete",
        connections: store.listConnections(profileId),
        message: "All requested networks are already connected.",
      };
    }
    const [first, ...rest] = filtered;
    const url = await beginProvider(profileId, first, rest, { open: true });
    return {
      profile_id: profileId,
      status: "pending",
      started: first,
      remaining: rest,
      authorize_url: url,
      redirect_uri: redirectUri,
      message: "Browser opened for sign-in. Finish each consent screen; the chain continues automatically.",
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
