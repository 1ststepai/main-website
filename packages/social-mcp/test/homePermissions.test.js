import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ensureHome } from "../src/home.js";

test("ensureHome makes the media folder owner-only, even when it already existed", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "social-mcp-perm-"));
  try {
    const fresh = join(root, "fresh");
    ensureHome(fresh);
    assert.equal(statSync(join(fresh, "media")).mode & 0o777, 0o700);
    const old = join(root, "old");
    mkdirSync(join(old, "media"), { recursive: true });
    chmodSync(join(old, "media"), 0o755);
    ensureHome(old);
    assert.equal(statSync(join(old, "media")).mode & 0o777, 0o700);
    assert.equal(statSync(old).mode & 0o777, 0o700);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
