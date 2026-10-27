import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const LINUX_OPEN = "/usr/bin/xdg-open";
const MAC_OPEN = "/usr/bin/open";

function windowsCmd() {
  return process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\cmd.exe` : "";
}

function windowsAppBrowser(url) {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const candidates = [
    `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  for (const exe of candidates) {
    if (exe && existsSync(exe)) {
      spawn(exe, [`--app=${url}`, `--new-window`], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
  }
  const cmd = windowsCmd();
  if (cmd && existsSync(cmd)) {
    spawn(cmd, ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return true;
  }
  return false;
}

/** Open a local URL in an app-style window when possible. */
export function openDesktopApp(url) {
  if (!/^http:\/\/127\.0\.0\.1(?::\d+)?\//i.test(url) && !/^https:\/\//i.test(url)) {
    return false;
  }
  try {
    if (process.platform === "darwin" && existsSync(MAC_OPEN)) {
      spawn(MAC_OPEN, ["-n", "-a", "Google Chrome", "--args", `--app=${url}`], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return true;
    }
    if (process.platform === "win32") {
      return windowsAppBrowser(url);
    }
    if (existsSync(LINUX_OPEN)) {
      spawn(LINUX_OPEN, [url], { detached: true, stdio: "ignore" }).unref();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
