import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { mcpError } from "../errors.js";
import { paths as homePathsFor } from "../home.js";
import { DEFAULT_PILOT_PLATFORMS, insuranceOpenEnrollmentPilot } from "./example.js";
import { knownPlatforms } from "../multiPost.js";

const ON = new Set(["1", "true", "on", "yes"]);
const OFF = new Set(["0", "false", "off", "no"]);

export const PILOT_PUBLISH_MESSAGE =
  "Pilot mode does not publish. Approve queues the draft. Export the captions and post them yourself.";

export function pilotFilePath(homePaths) {
  return homePaths.pilotFile || path.join(homePaths.root, "pilot.json");
}

export function readPilotFile(homePaths) {
  const file = pilotFilePath(homePaths);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw mcpError("pilot_config", "pilot.json must be a JSON object.", 500);
    }
    return parsed;
  } catch (error) {
    if (error?.code === "pilot_config") throw error;
    throw mcpError("pilot_config", "pilot.json could not be read.", 500);
  }
}

export function isPilotMode(env = process.env, homePaths) {
  const flag = String(env?.SOCIAL_MCP_PILOT_MODE ?? "").trim().toLowerCase();
  if (OFF.has(flag)) return false;
  if (ON.has(flag)) return true;
  if (!homePaths) return false;
  return readPilotFile(homePaths)?.pilot_mode === true;
}

export function isDraftOnly(env = process.env, homePaths) {
  const flag = String(env?.SOCIAL_MCP_DRAFT_ONLY ?? "").trim().toLowerCase();
  if (ON.has(flag)) return true;
  if (isPilotMode(env, homePaths)) return true;
  if (!homePaths) return false;
  return readPilotFile(homePaths)?.mcp_access === "draft-only";
}

export function writePilotFile(homePaths, config) {
  const file = pilotFilePath(homePaths);
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows may ignore the mode. The file is still local to the home.
  }
  return file;
}

export function loadPilot(homePaths) {
  const config = readPilotFile(homePaths);
  if (!config) throw mcpError("pilot_missing", "pilot.json is not in this PostPath home. Run pilot init.", 404);
  if (!Array.isArray(config.goals) || !config.goals.length) {
    throw mcpError("pilot_config", "pilot.json needs at least one goal.", 500);
  }
  return config;
}

export function findGoal(config, goalId) {
  const goal = (config.goals || []).find((item) => item.id === goalId);
  if (!goal) throw mcpError("unknown_goal", "That goal is not in pilot.json.", 404);
  return goal;
}

export function findTopic(goal, topicId) {
  const topic = (goal.topics || []).find((item) => item.id === topicId);
  if (!topic) throw mcpError("unknown_topic", "That topic is not on this goal.", 404);
  return topic;
}

export function resolvePilotPlatforms(config, { connections = [], selected } = {}) {
  const defaults = knownPlatforms(config?.default_platforms?.length ? config.default_platforms : DEFAULT_PILOT_PLATFORMS);
  const base = defaults.length ? defaults : [...DEFAULT_PILOT_PLATFORMS];
  const picked = knownPlatforms(selected);
  if (picked.length) return picked;
  const connected = new Set((connections || []).map((row) => row.platform || row));
  const anyConnected = base.some((platform) => platform !== "youtube" && connected.has(platform));
  if (!anyConnected) return base;
  const overlap = base.filter((platform) => platform === "youtube" || connected.has(platform));
  return overlap.length ? overlap : base;
}

export function campaignLabel(config) {
  const campaign = config?.campaign || {};
  const start = String(campaign.start || "");
  const end = String(campaign.end || "");
  if (start === "2026-11-01" && end === "2026-11-15") return "November 1–15, 2026";
  if (start && end) return `${start} to ${end}`;
  return campaign.name || "Campaign";
}

/** Platform-shaped paths. Tests pass path.win32 on Linux to prove separators stay native. */
export function describeHomeLayout(home, pathImpl = path) {
  const root = pathImpl.resolve(String(home || ""));
  return {
    root,
    pilot: pathImpl.join(root, "pilot.json"),
    db: pathImpl.join(root, "db.json"),
    key: pathImpl.join(root, "master.key"),
    lock: pathImpl.join(root, "db.json.lock"),
  };
}

export function ensureExamplePilot(homePaths) {
  const existing = readPilotFile(homePaths);
  if (existing) return { file: pilotFilePath(homePaths), created: false, config: existing };
  const config = insuranceOpenEnrollmentPilot();
  const file = writePilotFile(homePaths, config);
  return { file, created: true, config };
}

export function pilotHomePaths(home, env = process.env) {
  return homePathsFor(home || env.SOCIAL_MCP_HOME || undefined);
}
