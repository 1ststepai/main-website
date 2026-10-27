"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { resolveDeskLaunch } = require("../electron/deskLaunch.js");

test("packaged launch uses the bundled Electron binary as Node", () => {
  const launch = resolveDeskLaunch({
    packaged: true,
    resourcesPath: "C:\\Program Files\\PostPath\\resources",
    execPath: "C:\\Users\\evan\\AppData\\Local\\Programs\\PostPath\\PostPath.exe",
    moduleDir: "C:\\unused",
    env: {},
  });
  assert.equal(launch.command, "C:\\Users\\evan\\AppData\\Local\\Programs\\PostPath\\PostPath.exe");
  assert.equal(launch.env.ELECTRON_RUN_AS_NODE, "1");
  assert.match(launch.args[0], /social-mcp[\\/]bin[\\/]social-mcp\.js$/);
  assert.deepEqual(launch.args.slice(1), ["app", "--no-open"]);
  assert.equal(launch.env.POSTPATH_NODE, undefined);
});

test("unpackaged launch still uses system Node", () => {
  const launch = resolveDeskLaunch({
    packaged: false,
    moduleDir: "/workspace/packages/postpath-desktop/electron",
    env: {},
  });
  assert.equal(launch.command, "node");
  assert.equal(launch.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.match(launch.args[0], /social-mcp\/bin\/social-mcp\.js$/);
});
