import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createEngine } from "../src/engine.js";
import { createPat } from "../src/mcp/auth.js";
import { formatDoctor, runDoctor } from "../src/doctor.js";
import { freePorts } from "./helpers/ports.js";

async function seeded() {
  const home = mkdtempSync(join(tmpdir(), "pp-doctor-"));
  const [desk, oauth] = await freePorts(2);
  const env = { SOCIAL_MCP_HOME: home, SOCIAL_MCP_DESK_PORT: String(desk), SOCIAL_MCP_OAUTH_PORT: String(oauth) };
  const engine = createEngine({ home, env, fetchImpl: async () => { throw new Error("offline"); } });
  await engine.upsertProfile({ id: "skillsprout", name: "SkillSprout", require_vidiq: false });
  engine.store.saveConnection({ profile_id: "skillsprout", platform: "youtube", account_label: "@skillsprout" }, { refresh_token: "DOCTOR_SECRET_RT" });
  createPat(engine.store, { name: "Marketing Desk" });
  createPat(engine.store, { name: "SkillSprout only", brands: ["skillsprout"] });
  await engine.oauth?.stop?.();
  writeFileSync(join(home, "oauth.env"), "GOOGLE_OAUTH_CLIENT_ID=abc\nGOOGLE_OAUTH_CLIENT_SECRET=DOCTOR_SECRET_APP\nX_CLIENT_ID=\n", { mode: 0o600 });
  return { home, env, desk };
}

test("doctor reports permissions, app key names, brand x network matrix and ports without secrets", async () => {
  const { home, env } = await seeded();
  try {
    const report = await runDoctor({ env, home });
    const text = JSON.stringify(report) + formatDoctor(report);
    assert.equal(text.includes("DOCTOR_SECRET"), false, "no secret values");
    assert.equal(text.includes("pp_pat_"), false, "no token values");
    assert.equal(text.includes("secrets_enc"), false);
    assert.equal(report.checks.find((c) => c.name === "home").status, "ok");
    assert.equal(report.checks.find((c) => c.name === "app:youtube").status, "ok");
    assert.equal(report.checks.find((c) => c.name === "app:x").status, "warn", "empty value is not configured");
    const yt = report.connections.find((r) => r.profile_id === "skillsprout" && r.platform === "youtube");
    assert.equal(yt.status, "connected");
    assert.equal(report.connections.find((r) => r.platform === "tiktok").status, "not_connected");
    assert.equal(report.connections.length, 6);
    assert.deepEqual(report.pats.map((p) => [p.name, p.brands]), [["Marketing Desk", ["*"]], ["SkillSprout only", ["skillsprout"]]]);
    assert.match(formatDoctor(report), /SkillSprout only: .*\| brands: skillsprout/);
    assert.match(formatDoctor(report), /Marketing Desk: .*\| brands: all/);
    assert.equal(report.checks.find((c) => c.name === "mcp_token_brands").status, "warn");
    assert.equal(report.checks.find((c) => c.name === "mcp_tokens").status, "ok");
    assert.equal(report.checks.find((c) => c.name === "desk_port").status, "ok");
    assert.equal(report.ok, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("doctor fails on a group/world-readable home and a busy desk port", async () => {
  const { home, env, desk } = await seeded();
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(desk, "127.0.0.1", resolve));
  try {
    chmodSync(home, 0o755);
    const report = await runDoctor({ env, home });
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((c) => c.name === "home").status, "fail");
    assert.equal(report.checks.find((c) => c.name === "desk_port").status, "fail");
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
    rmSync(home, { recursive: true, force: true });
  }
});

test("doctor on a missing home does not create it", async () => {
  const home = join(tmpdir(), `pp-doctor-missing-${process.pid}-${Date.now()}`);
  const report = await runDoctor({ env: { SOCIAL_MCP_HOME: home }, home });
  assert.equal(report.ok, false);
  assert.equal(report.checks.find((c) => c.name === "home").status, "fail");
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(home), false);
});

test("postpath doctor CLI prints the report and never a secret", async () => {
  const { home, env } = await seeded();
  try {
    const out = execFileSync(process.execPath, [new URL("../bin/social-mcp.js", import.meta.url).pathname, "doctor", "--json"], { env: { ...process.env, ...env, HOME: home }, encoding: "utf8" });
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(out.includes("DOCTOR_SECRET"), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
