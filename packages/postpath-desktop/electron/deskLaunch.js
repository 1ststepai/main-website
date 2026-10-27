"use strict";

const path = require("node:path");

/**
 * Packaged PostPath runs the desk with the Electron binary in Node mode.
 * A customer install does not need a separate Node.js or an npm install.
 */
function resolveDeskLaunch({
  packaged = false,
  resourcesPath = "",
  execPath = "",
  moduleDir,
  env = {},
} = {}) {
  const bin = env.POSTPATH_SOCIAL_MCP_BIN
    ? path.resolve(env.POSTPATH_SOCIAL_MCP_BIN)
    : packaged
      ? path.join(resourcesPath, "social-mcp", "bin", "social-mcp.js")
      : path.resolve(moduleDir, "..", "..", "social-mcp", "bin", "social-mcp.js");
  const command = env.POSTPATH_NODE || (packaged ? execPath : "node");
  const childEnv = { ...env };
  if (packaged && !env.POSTPATH_NODE) childEnv.ELECTRON_RUN_AS_NODE = "1";
  return {
    command,
    args: [bin, "app", "--no-open"],
    cwd: path.resolve(path.dirname(bin), ".."),
    env: childEnv,
  };
}

module.exports = { resolveDeskLaunch };
