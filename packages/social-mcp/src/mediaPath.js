import { realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { mcpError } from "./errors.js";

const MEDIA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

function isInsideRoot(candidate, root) {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(prefix);
}

/**
 * Media must live under the Social MCP media directory.
 * Agents copy or save files there; arbitrary filesystem paths are rejected.
 */
export function resolveSafeMediaPath(userPath, mediaRoot) {
  if (typeof userPath !== "string" || !userPath || userPath.includes("\0")) {
    throw mcpError("invalid_media", "media_path is invalid.");
  }
  if (userPath.includes("..")) {
    throw mcpError("invalid_media", "media_path must not contain parent segments.");
  }

  let rootReal;
  try {
    rootReal = realpathSync(mediaRoot);
  } catch {
    throw mcpError("media_root_missing", "Social MCP media directory is not available.", 503);
  }

  const trimmed = userPath.trim();
  let candidate;
  if (isAbsolute(trimmed)) {
    candidate = resolve(trimmed);
  } else {
    // Relative paths are always rooted at the media directory.
    const safeParts = trimmed.split(/[/\\]+/).filter(Boolean);
    if (!safeParts.length || safeParts.some((part) => part === ".." || !MEDIA_NAME.test(part))) {
      throw mcpError("invalid_media", "media_path must be a file under the Social MCP media directory.");
    }
    candidate = resolve(join(rootReal, ...safeParts));
  }

  if (!isInsideRoot(candidate, rootReal)) {
    throw mcpError(
      "invalid_media",
      `media_path must be inside the Social MCP media directory (${rootReal}).`,
    );
  }

  // Validate leaf name even for absolute paths under the root.
  if (!MEDIA_NAME.test(basename(candidate))) {
    throw mcpError("invalid_media", "media file name is invalid.");
  }

  let realFile;
  try {
    realFile = realpathSync(candidate);
  } catch {
    throw mcpError("media_missing", "Media file is not available under the Social MCP media directory.");
  }

  if (!isInsideRoot(realFile, rootReal)) {
    throw mcpError("invalid_media", "media_path escaped the Social MCP media directory.");
  }

  let stat;
  try {
    stat = statSync(realFile);
  } catch {
    throw mcpError("media_missing", "Media file is not available under the Social MCP media directory.");
  }
  if (!stat.isFile() || stat.size < 1) {
    throw mcpError("invalid_media", "media_path must point to a non-empty file.");
  }

  // Keep dirname check so symlinks outside the root cannot sneak through basename alone.
  if (!isInsideRoot(dirname(realFile), rootReal) && realFile !== rootReal) {
    throw mcpError("invalid_media", "media_path escaped the Social MCP media directory.");
  }

  return realFile;
}
