"use strict";

/**
 * Pure helpers for the Electron shell. No Electron import, so node:test can
 * cover navigation policy and log redaction without launching a window.
 */

const SECRET_LINE = /token|secret|password|authorization|api[_-]?key|oauth/i;

function redactLogLine(line) {
  const text = String(line);
  if (SECRET_LINE.test(text)) return "[redacted]";
  return text;
}

/**
 * @returns {"allow" | "external" | "deny"}
 * allow    — same origin as the local desk URL (load in the shell)
 * external — other http(s) (hand to shell.openExternal, do not navigate)
 * deny     — non-http(s), unparseable, or embedded credentials
 */
function decideNavigation(url, deskUrl) {
  let parsed;
  let desk;
  try {
    parsed = new URL(url);
    desk = new URL(deskUrl);
  } catch {
    return "deny";
  }
  if (parsed.username || parsed.password) return "deny";
  const http = parsed.protocol === "http:" || parsed.protocol === "https:";
  const sameOrigin =
    parsed.protocol === desk.protocol &&
    parsed.hostname === desk.hostname &&
    parsed.port === desk.port;
  if (http && sameOrigin) return "allow";
  if (http) return "external";
  return "deny";
}

/**
 * Line-buffer so a secret split across stdout chunks is redacted before write.
 * `write` receives already-redacted text, with a trailing newline for complete lines.
 */
function createRedactingWriter(write) {
  let buffer = "";
  function emit(line, withNewline) {
    write(`${redactLogLine(line)}${withNewline ? "\n" : ""}`);
  }
  return {
    push(chunk) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) emit(line, true);
    },
    flush() {
      if (!buffer) return;
      emit(buffer, false);
      buffer = "";
    },
  };
}

module.exports = {
  SECRET_LINE,
  redactLogLine,
  decideNavigation,
  createRedactingWriter,
};
