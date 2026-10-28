import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

// Stubs: npm does nothing (or fails on demand); node passes through except the final app start.
function writeStubs(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "npm"),
    `#!/bin/bash\nif [ "\${STUB_NPM_FAIL:-}" = "1" ]; then echo "npm stub failure" >&2; exit 1; fi\necho "npm stub $*"\n`,
  );
  writeFileSync(
    path.join(dir, "node"),
    `#!/bin/bash\nif [ "\${1:-}" = "./bin/social-mcp.js" ]; then echo "APP_START $(pwd)"; exit 0; fi\nexec "${process.execPath}" "$@"\n`,
  );
  chmodSync(path.join(dir, "npm"), 0o755);
  chmodSync(path.join(dir, "node"), 0o755);
}

test("mac launcher replaces a stale app copy and leaves the data home alone", { timeout: 180000 }, async () => {
  const work = mkdtempSync(path.join(tmpdir(), "postpath-launch-"));
  try {
    const out = path.join(work, "downloads");
    const unpack = path.join(work, "unpack");
    const fakeHome = path.join(work, "home");
    const stubs = path.join(work, "stubs");
    mkdirSync(fakeHome, { recursive: true });
    writeStubs(stubs);
    await exec("bash", ["packages/social-mcp/scripts/build-downloads.sh"], {
      cwd: repoRoot,
      env: { ...process.env, POSTPATH_DOWNLOADS_OUT: out },
      maxBuffer: 20 * 1024 * 1024,
    });
    const macZip = readFileSync(path.join(out, "SHA256SUMS.txt"), "utf8")
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[1])
      .find((name) => name && /mac/i.test(name));
    await exec("unzip", ["-q", path.join(out, macZip), "-d", unpack]);
    const macDir = path.join(unpack, "PostPath-macOS");
    const bundleBuild = readFileSync(path.join(macDir, "postpath-app.build"), "utf8").trim();
    assert.match(bundleBuild, /^\d+\.\d+\.\d+-[0-9a-f]{16}$/);

    const env = { ...process.env, HOME: fakeHome, PATH: `${stubs}:${process.env.PATH}`, POSTPATH_NO_OPEN: "1" };
    delete env.SOCIAL_MCP_HOME;
    delete env.SOCIAL_MCP_PILOT_MODE;
    const launch = (extra = {}) =>
      exec("bash", [path.join(macDir, "Open PostPath Pilot.command")], { env: { ...env, ...extra } });
    const app = path.join(fakeHome, ".postpath", "app");

    const first = await launch();
    assert.match(first.stdout, /First run/);
    assert.match(first.stdout, /APP_START/);
    assert.equal(readFileSync(path.join(app, ".postpath-build"), "utf8").trim(), bundleBuild);

    // Data home with the files a broker would have.
    const data = path.join(fakeHome, ".social-mcp");
    mkdirSync(data, { recursive: true });
    const dataFiles = { "db.json": '{"posts":[1]}\n', "master.key": "secret-key-bytes\n", "pilot.json": '{"pilot_mode":true}\n' };
    for (const [name, body] of Object.entries(dataFiles)) writeFileSync(path.join(data, name), body);

    // Simulate an older install: different build id and a file the new bundle does not ship.
    writeFileSync(path.join(app, ".postpath-build"), "0.0.9-oldbuild\n");
    writeFileSync(path.join(app, "STALE_FILE"), "old");

    const same = await launch();
    assert.match(same.stdout, /Update: installed app 0\.0\.9-oldbuild differs/);
    assert.equal(existsSync(path.join(app, "STALE_FILE")), false);
    assert.equal(readFileSync(path.join(app, ".postpath-build"), "utf8").trim(), bundleBuild);
    assert.ok(existsSync(path.join(app, "bin", "social-mcp.js")));
    for (const [name, body] of Object.entries(dataFiles)) assert.equal(readFileSync(path.join(data, name), "utf8"), body);

    const again = await launch();
    assert.match(again.stdout, /Relaunch: using existing app/);
    assert.doesNotMatch(again.stdout, /Update:/);

    // A failed update keeps the old app working and the data home intact.
    writeFileSync(path.join(app, ".postpath-build"), "0.0.8-older\n");
    writeFileSync(path.join(app, "OLD_MARKER"), "keep");
    await assert.rejects(launch({ STUB_NPM_FAIL: "1" }));
    assert.equal(readFileSync(path.join(app, "OLD_MARKER"), "utf8"), "keep");
    assert.ok(existsSync(path.join(app, "bin", "social-mcp.js")));
    for (const [name, body] of Object.entries(dataFiles)) assert.equal(readFileSync(path.join(data, name), "utf8"), body);

    // Windows launcher carries the same check.
    await exec("unzip", ["-q", "-o", path.join(out, readdirZip(out, /win/i)), "-d", unpack]);
    const ps1 = readFileSync(path.join(unpack, "PostPath-Windows", "Open-PostPath.ps1"), "utf8");
    assert.match(ps1, /\$BundleBuild -ne \$InstalledBuild/);
    assert.match(ps1, /app\.next/);
    assert.doesNotMatch(ps1, /Remove-Item[^\n]*social-mcp/);
    assert.ok(existsSync(path.join(unpack, "PostPath-Windows", "postpath-app.build")));
    assert.match(ps1, /^[\x09\x0a\x0d\x20-\x7e]*$/, "Open-PostPath.ps1 must be ASCII for Windows PowerShell 5.1");
    for (const bat of ["Open-PostPath.bat", "Open-PostPath-Pilot.bat"]) {
      const body = readFileSync(path.join(unpack, "PostPath-Windows", bat), "utf8");
      assert.doesNotMatch(body, /[^\r]\n/, `${bat} needs CRLF line endings`);
      assert.match(body, /-File "%~dp0Open-PostPath\.ps1"/);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

function readdirZip(out, pattern) {
  return readFileSync(path.join(out, "SHA256SUMS.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[1])
    .find((name) => name && pattern.test(name));
}
