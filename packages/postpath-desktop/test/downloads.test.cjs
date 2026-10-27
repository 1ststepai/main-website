"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");

const repoRoot = join(__dirname, "..", "..", "..");
const script = join(repoRoot, "packages", "social-mcp", "scripts", "build-downloads.sh");

const CREDENTIAL_LITERALS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bBearer\s+[A-Za-z0-9\-._~+/]{16,}/i,
  /(?:password|secret|api_key|access_token|refresh_token|authorization)\s*[:=]\s*["'][^"']{8,}["']/i,
];

function assertNoCredentialLiterals(label, text) {
  for (const pattern of CREDENTIAL_LITERALS) {
    assert.equal(pattern.test(text), false, `${label} matched ${pattern}`);
  }
}

function unzipText(zipPath, entry) {
  const result = spawnSync("unzip", ["-p", zipPath, entry], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || `unzip failed for ${entry}`);
  return result.stdout;
}

test("download builder manifest checksums match the zip bytes", () => {
  const out = mkdtempSync(join(tmpdir(), "postpath-dl-"));
  try {
    const built = spawnSync("bash", [script], {
      cwd: repoRoot,
      env: { ...process.env, POSTPATH_DOWNLOADS_OUT: out },
      encoding: "utf8",
    });
    assert.equal(built.status, 0, built.stderr || built.stdout);

    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    const pkg = JSON.parse(readFileSync(join(repoRoot, "packages", "social-mcp", "package.json"), "utf8"));
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.version, "0.1.0");
    assert.equal(manifest.signed, false);
    assert.equal(manifest.kind, "developer-preview");
    assert.equal(manifest.nodeRequirement, pkg.engines.node);
    assert.match(manifest.nodeRequirement, /20/);
    assert.match(manifest.gitSha, /^[0-9a-f]{40}$/);
    assert.equal(Array.isArray(manifest.artifacts), true);
    assert.equal(manifest.artifacts.length, 2);

    const sums = readFileSync(join(out, "SHA256SUMS.txt"), "utf8");
    const names = readdirSync(out);
    assert.equal(names.includes("PostPath-macOS.zip"), false);
    assert.equal(names.includes("PostPath-Windows.zip"), false);
    assert.equal(names.includes("postpath-app.tgz"), false);

    for (const artifact of manifest.artifacts) {
      assert.match(artifact.filename, new RegExp(manifest.version.replace(/\./g, "\\.")));
      assert.match(artifact.filename, /developer-preview\.zip$/);
      const bytes = readFileSync(join(out, artifact.filename));
      const hash = createHash("sha256").update(bytes).digest("hex");
      assert.equal(artifact.sha256, hash);
      assert.match(sums, new RegExp(`^${hash}  ${artifact.filename}$`, "m"));
    }

    const mac = manifest.artifacts.find((item) => item.platform === "macOS");
    const win = manifest.artifacts.find((item) => item.platform === "Windows");
    assert.ok(mac && win);

    const macLauncher = unzipText(join(out, mac.filename), "PostPath-macOS/Open PostPath.command");
    const macReadme = unzipText(join(out, mac.filename), "PostPath-macOS/README.txt");
    const winPs1 = unzipText(join(out, win.filename), "PostPath-Windows/Open-PostPath.ps1");
    const winBat = unzipText(join(out, win.filename), "PostPath-Windows/Open-PostPath.bat");
    const winReadme = unzipText(join(out, win.filename), "PostPath-Windows/README.txt");

    for (const [label, text] of [
      ["mac launcher", macLauncher],
      ["mac readme", macReadme],
      ["windows ps1", winPs1],
      ["windows bat", winBat],
      ["windows readme", winReadme],
    ]) {
      assertNoCredentialLiterals(label, text);
      assert.match(text, /developer preview/i);
      assert.match(text, /not a one-click installer/i);
      assert.match(text, new RegExp(manifest.version.replace(/\./g, "\\.")));
    }

    assert.match(macLauncher, /-lt 20/);
    assert.match(macLauncher, /osascript/);
    assert.match(macReadme, /does not delete the vault/i);
    assert.match(winPs1, /-lt 20/);
    assert.match(winBat, /errorlevel 1/);
    assert.match(winReadme, /does not delete the vault/i);
    assert.match(macReadme, /~\/\.social-mcp/);
    assert.match(winReadme, /\.social-mcp/);

    const listing = spawnSync("unzip", ["-Z1", join(out, mac.filename)], { encoding: "utf8" });
    assert.equal(listing.status, 0, listing.stderr);
    assert.match(listing.stdout, /postpath-app\.tgz/);
    assert.doesNotMatch(listing.stdout, /(^|\/)\.env$/m);
    const tarList = spawnSync("bash", ["-lc", `unzip -p ${JSON.stringify(join(out, mac.filename))} PostPath-macOS/postpath-app.tgz | tar -tzf -`], {
      encoding: "utf8",
    });
    assert.equal(tarList.status, 0, tarList.stderr);
    assert.doesNotMatch(tarList.stdout, /(^|\/)\.env($|\.)/m);
    assert.doesNotMatch(tarList.stdout, /node_modules\//);
    assert.doesNotMatch(tarList.stdout, /(^|\/)test\//);
    assert.doesNotMatch(tarList.stdout, /(^|\/)oauth\.env$/m);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("checkout launchers do not contain credential literals", () => {
  const dir = join(repoRoot, "packages", "social-mcp", "scripts");
  const files = [
    "Open-PostPath.command",
    "Open-PostPath.ps1",
    "Open-PostPath.bat",
    "Open-SocialConnector.ps1",
    "Open-SocialConnector.bat",
    "build-downloads.sh",
  ];
  for (const name of files) {
    const text = readFileSync(join(dir, name), "utf8");
    assertNoCredentialLiterals(name, text);
  }
  const command = readFileSync(join(dir, "Open-PostPath.command"), "utf8");
  const ps1 = readFileSync(join(dir, "Open-PostPath.ps1"), "utf8");
  const bat = readFileSync(join(dir, "Open-PostPath.bat"), "utf8");
  assert.match(command, /PostPath needs Node\.js 20 or newer/);
  assert.match(command, /-lt 20/);
  assert.match(ps1, /PostPath needs Node\.js 20 or newer/);
  assert.match(ps1, /-lt 20/);
  assert.match(bat, /Need Node 20\+/);
  assert.match(bat, /exit \/b %ERR%/);
});
