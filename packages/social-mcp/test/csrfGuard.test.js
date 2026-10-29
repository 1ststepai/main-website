import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createDeskServer } from "../src/desk/server.js";

test("desk refuses cross-site and non-JSON writes, allows its own", async () => {
  const home = mkdtempSync(join(tmpdir(), "social-mcp-csrf-"));
  const env = { SOCIAL_MCP_OAUTH_PORT: "48812", SOCIAL_MCP_DESK_PORT: "48811" };
  const engine = createEngine({ home, env });
  const desk = createDeskServer({ engine, env, port: 48811 });
  try {
    const { url } = await desk.start({ open: false });
    const post = (headers) =>
      fetch(`${url}api/profile`, { method: "POST", headers, body: JSON.stringify({ id: "acme", name: "Acme" }) });
    assert.equal((await post({ "content-type": "text/plain" })).status, 403);
    assert.equal((await post({ "content-type": "application/json", origin: "https://evil.example" })).status, 403);
    assert.equal((await post({ "content-type": "application/json", "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await post({ "content-type": "text/plain", "x-postpath-desk": "1", origin: "https://evil.example" })).status, 403);
    assert.equal((await post({ "content-type": "application/json", origin: "http://127.0.0.1:48811" })).status, 200);
    assert.equal((await post({ "content-type": "text/plain", "x-postpath-desk": "1" })).status, 200);
    assert.equal((await fetch(`${url}api/status`)).status, 200);
  } finally {
    await desk.stop?.();
    rmSync(home, { recursive: true, force: true });
  }
});
