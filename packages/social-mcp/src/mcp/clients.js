import { SERVER_DESCRIPTION } from "./instructions.js";

export const SCOPES = ["posts:read", "drafts:write", "accounts:read", "queue:approve"];
export const DEFAULT_SCOPES = ["posts:read", "drafts:write", "accounts:read"];

export function publicBase(env, port) {
  const raw = String(env.SOCIAL_MCP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (!raw) return `http://127.0.0.1:${port}`;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `http://127.0.0.1:${port}`;
  }
  return url.origin;
}

export function resourceUrl(base) {
  return `${base}/mcp`;
}

export function allowedHost(host, env, port) {
  const value = String(host || "");
  if (value === `127.0.0.1:${port}` || value === `localhost:${port}`) return true;
  const raw = String(env.SOCIAL_MCP_PUBLIC_URL || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return value === url.host || value === url.hostname;
  } catch {
    return false;
  }
}

export function originAllowed(origin, base) {
  if (!origin) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (loopback) return true;
  try {
    return url.origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function clientSetup(env, port) {
  const base = publicBase(env, port);
  const mcp = resourceUrl(base);
  const remote = {
    url: mcp,
  };
  const cursorConfig = b64url(JSON.stringify(remote));
  const vscodePayload = JSON.stringify({
    name: "postpath",
    type: "http",
    url: mcp,
  });
  const headerConfig = {
    mcpServers: {
      postpath: {
        command: "npx",
        args: ["-y", "mcp-remote", mcp, "--header", "Authorization: Bearer <POSTPATH_TOKEN>"],
      },
    },
  };
  return {
    description: SERVER_DESCRIPTION,
    base_url: base,
    mcp_url: mcp,
    resource_metadata: `${base}/.well-known/oauth-protected-resource`,
    authorization_server: `${base}/.well-known/oauth-authorization-server`,
    oauth_note: "Clients that support MCP OAuth can use the MCP URL. The desk shows a consent page. queue:approve is off until it is ticked.",
    cursor_install: `cursor://anysphere.cursor-deeplink/mcp/install?name=postpath&config=${cursorConfig}`,
    vscode_install: `vscode:mcp/install?${encodeURIComponent(vscodePayload)}`,
    claude_remote: { mcpServers: { postpath: { url: mcp } } },
    header_remote: headerConfig,
    token_placeholder: "<POSTPATH_TOKEN>",
    scopes: SCOPES,
    default_scopes: DEFAULT_SCOPES,
  };
}
