import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("supervisor install writes a 0700 script, a 0700 home, starts nothing; uninstall keeps data", () => {
  const home = mkdtempSync(path.join(tmpdir(), "pp-svc-"));
  try {
    const env = { PATH: process.env.PATH, HOME: home };
    const out = execFileSync("bash", [path.join(root, "deploy/install-service.sh"), "--mode", "supervisor", "--bin", "/opt/postpath"], { env, encoding: "utf8" });
    assert.match(out, /not started/);
    const script = path.join(home, ".local/bin/postpath-supervise");
    assert.equal(statSync(script).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(home, ".postpath-real")).mode & 0o777, 0o700);
    assert.match(readFileSync(script, "utf8"), /POSTPATH_BIN:-\/opt\/postpath/);
    assert.ok(!existsSync(path.join(home, ".postpath-real/supervisor.pid")));
    execFileSync("bash", [path.join(root, "deploy/uninstall-service.sh")], { env, encoding: "utf8" });
    assert.ok(!existsSync(script));
    assert.ok(existsSync(path.join(home, ".postpath-real")));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("systemd unit is loopback-only, umask 077, fixed home, restart on failure", () => {
  const unit = readFileSync(path.join(root, "deploy/systemd/postpath.service"), "utf8");
  assert.match(unit, /^UMask=0077$/m);
  assert.match(unit, /^Environment=SOCIAL_MCP_HOME=%h\/\.postpath-real$/m);
  assert.match(unit, /^ExecStart=@POSTPATH_BIN@ app --no-open$/m);
  assert.match(unit, /^Restart=on-failure$/m);
  assert.doesNotMatch(unit, /0\.0\.0\.0|ngrok|cloudflared|tunnel --/);
  const desk = readFileSync(path.join(root, "src/desk/server.js"), "utf8");
  assert.match(desk, /listen\(port, "127\.0\.0\.1"/);
});
