#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { startStdioServer, createEngine } from "../src/index.js";
import { paths } from "../src/home.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (!command || command === "serve" || command === "mcp") {
    await startStdioServer();
    return;
  }

  if (command === "init") {
    const homePaths = paths();
    const example = `# Copy values into your shell or Cursor MCP env.
# Register this redirect URI on Google, Meta, and TikTok developer consoles:
# http://127.0.0.1:47831/oauth/callback

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
META_APP_ID=
META_APP_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
# SOCIAL_MCP_OAUTH_PORT=47831
# SOCIAL_MCP_HOME=
# SOCIAL_MCP_ENC_KEY=
`;
    writeFileSync(homePaths.envExample, example, { encoding: "utf8", mode: 0o600 });
    // Touch vault key + db through engine construction.
    createEngine();
    console.log(`Social MCP ready at ${homePaths.root}`);
    console.log(`Media directory: ${homePaths.mediaDir}`);
    console.log(`OAuth env template: ${homePaths.envExample}`);
    console.log("Redirect URI: http://127.0.0.1:47831/oauth/callback");
    return;
  }

  if (command === "status") {
    const engine = createEngine();
    console.log(JSON.stringify(engine.publicStatus(), null, 2));
    await engine.oauth.stop();
    return;
  }

  if (command === "connect") {
    const profileId = args[1];
    const name = args[2] || profileId;
    if (!profileId) {
      console.error("Usage: social-mcp connect <profile_id> [display_name]");
      process.exitCode = 1;
      return;
    }
    const engine = createEngine();
    await engine.upsertProfile({ id: profileId, name });
    const result = await engine.connectAccounts(profileId);
    console.log(JSON.stringify(result, null, 2));
    console.log("Leave this process running until the browser chain finishes, then Ctrl+C.");
    // Keep OAuth server alive.
    await new Promise(() => {});
    return;
  }

  console.error(`Unknown command: ${command}
Usage:
  social-mcp                 # stdio MCP server (for Cursor/Claude)
  social-mcp init            # create ~/.social-mcp vault
  social-mcp status          # show profiles/connections
  social-mcp connect <id>    # open browser connect chain
`);
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
