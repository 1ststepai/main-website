"use strict";

// X is bring-your-own-app. The downloadable and broker zips must never carry
// X credentials, an oauth.env, or any switch that turns X on.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const repoRoot = join(__dirname, "..", "..", "..");
const script = join(repoRoot, "packages", "social-mcp", "scripts", "build-downloads.sh");
const X_ASSIGNMENT = /^\s*(?:export\s+|set\s+|\$env:)?X_CLIENT_(?:ID|SECRET)\s*=\s*["']?[A-Za-z0-9]/m;
const X_SWITCH = /POSTPATH_ENABLE_X|SOCIAL_MCP_ENABLE_X/;

test("download zips carry no X credentials, no oauth.env, and no X enable switch", () => {
  const out = mkdtempSync(join(tmpdir(), "postpath-dl-nox-"));
  try {
    const env = { ...process.env, POSTPATH_DOWNLOADS_OUT: out, X_CLIENT_ID: "leak-check-id", X_CLIENT_SECRET: "leak-check-value" };
    const built = spawnSync("bash", [script], { cwd: repoRoot, env, encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    const zips = readdirSync(out).filter((name) => name.endsWith(".zip"));
    assert.equal(zips.length, 2);
    for (const zip of zips) {
      const listed = spawnSync("unzip", ["-Z1", join(out, zip)], { encoding: "utf8" });
      assert.equal(listed.status, 0, listed.stderr);
      const entries = listed.stdout.split("\n").filter(Boolean);
      assert.ok(!entries.some((entry) => /(^|\/)(oauth\.env|\.env(\..*)?)$/.test(entry)), `${zip} contains an env file`);
      for (const entry of entries) {
        if (entry.endsWith("/") || !/\.(js|cjs|mjs|json|sh|command|bat|ps1|md|txt|html|env)$/i.test(entry)) continue;
        const text = spawnSync("unzip", ["-p", join(out, zip), entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout;
        assert.equal(text.includes("leak-check-id") || text.includes("leak-check-value"), false, `${zip}:${entry} leaked build env X values`);
        assert.equal(X_ASSIGNMENT.test(text), false, `${zip}:${entry} assigns an X credential`);
        assert.equal(X_SWITCH.test(text), false, `${zip}:${entry} carries an X enable switch`);
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
