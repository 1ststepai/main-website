import { chmodSync, writeFileSync } from "node:fs";
import { createStore } from "./store.js";
import { createEngine } from "./engine.js";
import { paths } from "./home.js";
import { createPat, revokePat } from "./mcp/auth.js";
import { ensureExamplePilot, writePilotFile } from "./pilot/config.js";
import { generateFromTopic, pilotQueue } from "./pilot/loop.js";
import { initOwnerPin } from "./pilot/ownerAuth.js";
import { DEFAULT_SCOPES } from "./mcp/clients.js";

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function print(io, line) {
  (io.stdout || ((text) => console.log(text)))(line);
}

function fail(io, line) {
  (io.stderr || ((text) => console.error(text)))(line);
}

export function initPilot({ home, pin, env = process.env } = {}) {
  const homePaths = paths(home);
  const example = ensureExamplePilot(homePaths);
  const config = { ...example.config, pilot_mode: true, mcp_access: "draft-only" };
  writePilotFile(homePaths, config);
  const store = createStore({ home: homePaths.root, env });
  store.upsertProfile({
    id: config.profile?.id || "broker",
    name: config.profile?.name || "Insurance broker",
    require_vidiq: false,
  });
  const pinResult = initOwnerPin(homePaths, pin);
  return {
    home: homePaths.root,
    pilotFile: homePaths.pilotFile,
    dbFile: homePaths.dbFile,
    keyFile: homePaths.keyFile,
    pinFile: pinResult.pinFile,
    pinPrinted: false,
  };
}

export function createPatFile({ home, scopes, out, name, env = process.env } = {}) {
  if (!out) {
    const error = new Error("pat create needs --out <file>.");
    error.statusCode = 400;
    throw error;
  }
  const engine = createEngine({ home, env });
  try {
    const chosen = scopes ? String(scopes).split(/[\s,]+/).filter(Boolean) : DEFAULT_SCOPES;
    const created = createPat(engine.store, { name: name || "draft-only", scopes: chosen });
    writeFileSync(out, `${created.token}\n`, { encoding: "utf8", mode: 0o600 });
    try {
      chmodSync(out, 0o600);
    } catch {
      // Mode is best effort on Windows.
    }
    return { file: out, id: created.pat.id, scopes: created.pat.scopes, printed: false };
  } finally {
    engine.oauth.stop();
  }
}

export function revokePatCli({ home, id, env = process.env } = {}) {
  const engine = createEngine({ home, env });
  try {
    const revoked = revokePat(engine.store, id);
    return { id, revoked };
  } finally {
    engine.oauth.stop();
  }
}

export async function draftsCreate({ home, args, env = process.env } = {}) {
  const engine = createEngine({ home, env: { ...process.env, ...env, SOCIAL_MCP_HOME: home || env.SOCIAL_MCP_HOME || process.env.SOCIAL_MCP_HOME } });
  try {
    if (args.includes("approve") || args.includes("publish")) {
      const error = new Error("drafts create only writes drafts. It does not approve or publish.");
      error.statusCode = 403;
      throw error;
    }
    const goal = flag(args, "--goal");
    const topic = flag(args, "--topic");
    if (goal && topic) {
      const created = await generateFromTopic(engine, {
        goal_id: goal,
        topic_id: topic,
        profile_id: flag(args, "--profile"),
        platforms: flag(args, "--platforms")?.split(",").map((item) => item.trim()).filter(Boolean),
      }, { env });
      return { bundle_id: created.bundle.id, status: created.bundle.status, platforms: created.bundle.platforms };
    }
    const profile = flag(args, "--profile");
    const caption = flag(args, "--caption");
    if (!profile || !caption) {
      const error = new Error("drafts create needs --goal and --topic, or --profile and --caption.");
      error.statusCode = 400;
      throw error;
    }
    await engine.upsertProfile({ id: profile, name: flag(args, "--name") || profile, require_vidiq: false });
    const platforms = flag(args, "--platforms")?.split(",").map((item) => item.trim()).filter(Boolean);
    const created = await engine.createDraft({
      profile_id: profile,
      platforms,
      platform: platforms?.length ? undefined : flag(args, "--platform") || "facebook",
      title: flag(args, "--title") || "",
      caption,
      description: caption,
      source: "cli",
    });
    return { id: created.bundle?.id || created.post?.id, status: created.bundle?.status || created.post?.status };
  } finally {
    await engine.oauth.stop();
  }
}

export function draftsList({ home, env = process.env } = {}) {
  const engine = createEngine({ home, env });
  try {
    return {
      queue: pilotQueue(engine).map((item) => ({
        id: item.id,
        status: item.status,
        queue_label: item.queue_label,
        title: item.title,
        networks: item.networks.map((row) => ({ platform: row.platform, caption: row.caption })),
      })),
      posts: engine.store.listPosts().map((post) => ({
        id: post.id,
        status: post.status,
        platform: post.platform,
        title: post.title,
        caption: post.caption,
      })),
    };
  } finally {
    engine.oauth.stop();
  }
}

export async function runPilotCommands(args, io = {}) {
  const command = args[0];
  const home = flag(args, "--home");
  const env = { ...process.env, ...(home ? { SOCIAL_MCP_HOME: home } : {}), ...(io.env || {}) };
  if (command === "pilot" && args[1] === "init") {
    const result = initPilot({ home, pin: flag(args, "--pin"), env });
    print(io, `Pilot home ready at ${result.home}`);
    print(io, `pilot.json: ${result.pilotFile}`);
    print(io, `db.json: ${result.dbFile}`);
    print(io, `master.key: ${result.keyFile}`);
    if (result.pinFile) print(io, `Owner PIN written to ${result.pinFile}. It was not printed.`);
    else print(io, "Owner PIN stored as a hash. It was not printed.");
    return 0;
  }
  if (command === "pat" && args[1] === "create") {
    const result = createPatFile({
      home,
      scopes: flag(args, "--scopes"),
      out: flag(args, "--out"),
      name: flag(args, "--name"),
      env,
    });
    print(io, `Wrote a token for ${result.id} to ${result.file} (mode 0600). Scopes: ${result.scopes.join(" ")}. The token was not printed.`);
    return 0;
  }
  if (command === "pat" && args[1] === "revoke") {
    const id = args[2] && !args[2].startsWith("--") ? args[2] : flag(args, "--id");
    if (!id) {
      fail(io, "Usage: social-mcp pat revoke <id> [--home <dir>]");
      return 1;
    }
    const result = revokePatCli({ home, id, env });
    print(io, result.revoked ? `Revoked ${result.id}` : `Token ${id} was not found.`);
    return result.revoked ? 0 : 1;
  }
  if (command === "drafts" && args[1] === "list") {
    print(io, JSON.stringify(draftsList({ home, env }), null, 2));
    return 0;
  }
  if (command === "drafts" && args[1] === "create") {
    const result = await draftsCreate({ home, args, env });
    print(io, JSON.stringify(result, null, 2));
    return 0;
  }
  return null;
}
