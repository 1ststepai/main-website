import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createStore } from "../src/store.js";

const writer = fileURLToPath(new URL("./helpers/vaultWriter.js", import.meta.url));

function runWriter(home, tag) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [writer], {
      env: { ...process.env, SOCIAL_MCP_HOME: home, WORKER_TAG: tag },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`writer ${tag} exited ${code}\n${stderr}`));
    });
  });
}

test("two processes on one SOCIAL_MCP_HOME do not corrupt db.json", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "postpath-lock-"));
  try {
    const first = createStore({ home });
    first.upsertProfile({ id: "broker", name: "Broker" });
    assert.equal(readFileSync(first.homePaths.keyFile, "utf8").trim().length, 64);
    await Promise.all([runWriter(home, "a"), runWriter(home, "b")]);
    const dbText = readFileSync(path.join(home, "db.json"), "utf8");
    const parsed = JSON.parse(dbText);
    const ids = Object.keys(parsed.posts);
    assert.equal(ids.length, 30);
    for (let i = 0; i < 15; i += 1) {
      assert.ok(ids.includes(`post_a_${String(i).padStart(2, "0")}`));
      assert.ok(ids.includes(`post_b_${String(i).padStart(2, "0")}`));
    }
    const reader = createStore({ home });
    assert.equal(reader.readSecrets("broker", "facebook").access_token, "secret-from-a");
    assert.equal(reader.listPosts().length, 30);
    assert.equal(reader.getProfile("broker").id, "broker");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
