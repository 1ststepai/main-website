"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const {
  decideNavigation,
  redactLogLine,
  createRedactingWriter,
} = require("../electron/shellPolicy.js");

const DESK = "http://127.0.0.1:47830/";

test("desk origin is the only in-shell navigation", () => {
  assert.equal(decideNavigation("http://127.0.0.1:47830/", DESK), "allow");
  assert.equal(decideNavigation("http://127.0.0.1:47830/settings?tab=accounts", DESK), "allow");
  assert.equal(decideNavigation("https://accounts.example/oauth/authorize", DESK), "external");
  assert.equal(decideNavigation("http://127.0.0.1:47831/oauth/callback", DESK), "external");
  assert.equal(decideNavigation("http://localhost:47830/", DESK), "external");
  assert.equal(decideNavigation("file:///etc/passwd", DESK), "deny");
  assert.equal(decideNavigation("javascript:alert(1)", DESK), "deny");
  assert.equal(decideNavigation("http://user:secret@127.0.0.1:47830/", DESK), "deny");
  assert.equal(decideNavigation("not a url", DESK), "deny");
});

test("log lines that look like credentials are redacted before write", () => {
  assert.equal(redactLogLine("desk listening"), "desk listening");
  assert.equal(redactLogLine("Authorization: Bearer abc.def"), "[redacted]");
  assert.equal(redactLogLine("api_key=super"), "[redacted]");
  assert.equal(redactLogLine("api-key: super"), "[redacted]");
  assert.equal(redactLogLine("password=hunter2"), "[redacted]");
  assert.equal(redactLogLine("refresh token present"), "[redacted]");
  assert.equal(redactLogLine("client secret missing"), "[redacted]");
  assert.equal(redactLogLine("oauth callback ready"), "[redacted]");

  const written = [];
  const writer = createRedactingWriter((text) => written.push(text));
  writer.push("hello to");
  assert.deepEqual(written, []);
  writer.push("ken=abc\nsafe line\n");
  writer.push("pass");
  writer.flush();
  assert.deepEqual(written, ["[redacted]\n", "safe line\n", "pass"]);
  assert.equal(written.join("").includes("ken=abc"), false);
  assert.equal(written.join("").includes("token"), false);
});

test("electron main keeps the hardened window flags", () => {
  const main = readFileSync(join(__dirname, "..", "electron", "main.js"), "utf8");
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /will-navigate/);
  assert.match(main, /will-redirect/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /decideNavigation/);
  assert.match(main, /createRedactingWriter/);
  assert.equal(main.includes("openExternal(url)"), true);
});
