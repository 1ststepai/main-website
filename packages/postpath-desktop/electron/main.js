"use strict";

const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");
const { decideNavigation, createRedactingWriter } = require("./shellPolicy.js");

const DESK_HOST = "127.0.0.1";
const DESK_PORT = Number(process.env.SOCIAL_MCP_DESK_PORT || 47830);
const DESK_URL = `http://${DESK_HOST}:${DESK_PORT}/`;
const READY_TIMEOUT_MS = Number(process.env.POSTPATH_DESK_READY_MS || 45000);
const POLL_MS = 250;

/** Midnight canvas — PostPath brand background while the window loads. */
const MIDNIGHT = "#0B1020";

let deskChild = null;
let mainWindow = null;
let shuttingDown = false;

function socialMcpBin() {
  if (process.env.POSTPATH_SOCIAL_MCP_BIN) {
    return path.resolve(process.env.POSTPATH_SOCIAL_MCP_BIN);
  }
  return path.resolve(__dirname, "..", "..", "social-mcp", "bin", "social-mcp.js");
}

function nodeCommand() {
  return process.env.POSTPATH_NODE || "node";
}

function probeDesk() {
  return new Promise((resolve) => {
    const req = http.get(DESK_URL, { timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForDesk(timeoutMs = READY_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probeDesk()) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error(
    `PostPath desk did not become ready at ${DESK_URL} within ${timeoutMs}ms. ` +
      `Start it manually: node packages/social-mcp/bin/social-mcp.js app --no-open`
  );
}

function pipeDeskOutput(child) {
  const stdout = createRedactingWriter((text) => {
    process.stdout.write(`[postpath-desk] ${text}`);
  });
  const stderr = createRedactingWriter((text) => {
    process.stderr.write(`[postpath-desk] ${text}`);
  });
  child.stdout?.on("data", (chunk) => stdout.push(chunk));
  child.stderr?.on("data", (chunk) => stderr.push(chunk));
  child.on("exit", () => {
    stdout.flush();
    stderr.flush();
  });
}

function spawnDesk() {
  const bin = socialMcpBin();
  const node = nodeCommand();
  const child = spawn(node, [bin, "app", "--no-open"], {
    cwd: path.dirname(bin),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  pipeDeskOutput(child);
  child.on("exit", (code, signal) => {
    deskChild = null;
    if (!shuttingDown && code && code !== 0) {
      console.error(`[postpath-desktop] desk exited (code=${code}, signal=${signal})`);
    }
  });

  deskChild = child;
  return child;
}

async function ensureDesk() {
  if (await probeDesk()) {
    console.log(`[postpath-desktop] desk already running at ${DESK_URL}`);
    return;
  }
  console.log(`[postpath-desktop] starting desk via ${nodeCommand()} ${socialMcpBin()} app --no-open`);
  spawnDesk();
  await waitForDesk();
}

function resolveIcon() {
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "public", "assets", "postpath", "postpath-mark-512.png"),
    path.resolve(__dirname, "..", "..", "social-mcp", "src", "desk", "public", "assets", "postpath-mark.svg"),
  ];
  for (const file of candidates) {
    try {
      require("node:fs").accessSync(file);
      return file;
    } catch {
      // optional
    }
  }
  return undefined;
}

function openExternalUrl(url) {
  try {
    const result = shell.openExternal(url);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // best effort; do not log the URL (it may carry OAuth material)
  }
}

/**
 * will-navigate and setWindowOpenHandler share decideNavigation:
 * desk origin stays in this window; other http(s) go to the system browser.
 */
function attachNavigationGuards(win) {
  const contents = win.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    const decision = decideNavigation(url, DESK_URL);
    if (decision === "allow") {
      contents.loadURL(url).catch(() => {});
    } else if (decision === "external") {
      openExternalUrl(url);
    }
    return { action: "deny" };
  });

  const onNavigate = (event, url) => {
    const decision = decideNavigation(url, DESK_URL);
    if (decision === "allow") return;
    event.preventDefault();
    if (decision === "external") openExternalUrl(url);
  };

  contents.on("will-navigate", onNavigate);
  contents.on("will-redirect", onNavigate);
}

function createWindow() {
  const icon = resolveIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: MIDNIGHT,
    title: "PostPath",
    autoHideMenuBar: true,
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  attachNavigationGuards(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow.loadURL(DESK_URL);
}

function stopDesk() {
  if (!deskChild || deskChild.killed) return;
  try {
    deskChild.kill("SIGTERM");
  } catch {
    // best effort
  }
  deskChild = null;
}

async function boot() {
  await ensureDesk();
  await createWindow();
}

app.whenReady().then(() => {
  boot().catch((err) => {
    console.error("[postpath-desktop]", err);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => console.error("[postpath-desktop]", err));
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  shuttingDown = true;
  stopDesk();
});

process.on("exit", () => {
  stopDesk();
});
