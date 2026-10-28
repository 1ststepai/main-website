#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { startStdioServer, createEngine } from "../src/index.js";
import { paths } from "../src/home.js";
import { loadOAuthEnvFile } from "../src/envFile.js";
import { createDeskServer } from "../src/desk/server.js";
import { installCursorMcp } from "../src/cursorConfig.js";
import { PRODUCT_NAME, PRODUCT_TITLE } from "../src/brand.js";
import { DEFAULT_OAUTH_PORT } from "../src/home.js";
import { providerRedirectUri } from "../src/oauth/redirect.js";

const args = process.argv.slice(2);
const command = args[0];

function bootEngine() {
  const homePaths = paths();
  loadOAuthEnvFile(homePaths, process.env);
  return createEngine({ home: homePaths.root });
}

async function main() {
  if (!command || command === "serve" || command === "mcp") {
    loadOAuthEnvFile(paths(), process.env);
    await startStdioServer();
    return;
  }

  if (command === "app" || command === "desktop" || command === "ui") {
    const engine = bootEngine();
    const desk = createDeskServer({ engine });
    const { url } = await desk.start({ open: !args.includes("--no-open") });
    console.log(`${PRODUCT_TITLE} desk: ${url}`);
    console.log("Leave this process running. Press Ctrl+C to stop.");
    await new Promise(() => {});
    return;
  }

  if (command === "init") {
    const homePaths = paths();
    const port = Number(process.env.SOCIAL_MCP_OAUTH_PORT || DEFAULT_OAUTH_PORT);
    const redirectUri = providerRedirectUri(process.env, port);
    const example = `# ${PRODUCT_NAME} OAuth apps — local only. Do not commit.
# Google Desktop loopback stays http://127.0.0.1:${port}
# Other providers use SOCIAL_MCP_OAUTH_REDIRECT_HOST (default 127.0.0.1).
# Meta accepts localhost. Example: SOCIAL_MCP_OAUTH_REDIRECT_HOST=localhost
# ${redirectUri}
# GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:${port}/oauth/callback

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
META_APP_ID=
META_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
`;
    writeFileSync(homePaths.envExample, example, { encoding: "utf8", mode: 0o600 });
    bootEngine();
    console.log(`${PRODUCT_TITLE} ready at ${homePaths.root}`);
    console.log(`Open the desk: node ./bin/social-mcp.js app`);
    console.log(`Redirect URI: ${redirectUri}`);
    return;
  }

  if (command === "status") {
    const engine = bootEngine();
    console.log(JSON.stringify(engine.publicStatus(), null, 2));
    await engine.oauth.stop();
    return;
  }

  if (command === "install-cursor") {
    const result = installCursorMcp();
    console.log(JSON.stringify(result, null, 2));
    console.log(`Restart Cursor to load ${PRODUCT_NAME}.`);
    return;
  }

  if (command === "connect") {
    const profileId = args[1];
    const name = args[2] || profileId;
    if (!profileId) {
      console.error("Usage: social-mcp connect <profile_id> [display_name]");
      console.error("Prefer: social-mcp app");
      process.exitCode = 1;
      return;
    }
    const engine = bootEngine();
    await engine.upsertProfile({ id: profileId, name });
    const result = await engine.connectAccounts(profileId);
    console.log(JSON.stringify(result, null, 2));
    console.log("Leave this process running until the browser chain finishes, then Ctrl+C.");
    await new Promise(() => {});
    return;
  }

  console.error(`Unknown command: ${command}
${PRODUCT_TITLE}

Usage:
  social-mcp app             # desktop Connect UI (recommended)
  social-mcp                 # stdio MCP server for Cursor/Claude
  social-mcp install-cursor  # write ~/.cursor/mcp.json entry
  social-mcp init            # create local vault
  social-mcp status
  social-mcp connect <id>    # CLI fallback
`);
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
