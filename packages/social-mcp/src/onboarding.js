import { mcpError } from "./errors.js";
import { normalizeProfileId } from "./store.js";
import { saveBrandContext } from "./brand/context.js";
import { starterPackInput, STARTER_PACK_IDS, listStarterPacks } from "./brand/starterPacks.js";
import { queueApproved } from "./pilot/loop.js";

/** One screen at a time. Every step after "name" has a "Set up later" exit. */
export const ONBOARDING_STEPS = ["name", "pack", "connect", "draft", "approve", "done"];

function slug(name) {
  return normalizeProfileId(
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64),
  );
}

function fresh() {
  return { step: "name", profile_id: null, pack: null, bundle_id: null, skipped: [], timings: {}, started_at: null, finished_at: null, outcome: null };
}

export function onboardingState(engine) {
  const pilot = engine.pilotOn ? engine.pilotOn() : false;
  const state = { ...fresh(), ...(engine.store.readSection("onboarding").current || {}) };
  const connected = state.profile_id ? engine.store.listConnections(state.profile_id).map((row) => row.platform) : [];
  return { ...state, pilot, steps: ONBOARDING_STEPS, packs: listStarterPacks(), connected };
}

function save(engine, mutate) {
  engine.store.updateSection("onboarding", (section) => {
    const current = { ...fresh(), ...(section.current || {}) };
    mutate(current);
    section.current = current;
    return current;
  });
  return onboardingState(engine);
}

function advance(state, from, to, at, skipped = false) {
  state.timings[from] = at;
  if (skipped && !state.skipped.includes(from)) state.skipped.push(from);
  state.step = to;
  if (to === "done") state.finished_at = new Date(at).toISOString();
}

function expect(state, step) {
  if (state.step !== step) throw mcpError("onboarding_step", `Onboarding is on "${state.step}", not "${step}".`, 409);
}

/**
 * Run one onboarding step. `later: true` skips the step ("Set up later").
 * Gates are the normal ones: pilot approval ends at "approved, waiting to post"; outside pilot,
 * approval schedules the draft for the time the owner picked and never posts immediately.
 */
export async function onboardingStep(engine, input = {}, { now = Date.now() } = {}) {
  const store = engine.store;
  const pilot = engine.pilotOn ? engine.pilotOn() : false;
  const state = { ...fresh(), ...(store.readSection("onboarding").current || {}) };
  const step = String(input.step || "");

  if (step === "restart") return save(engine, (s) => Object.assign(s, fresh()));

  if (step === "name") {
    expect(state, "name");
    const name = String(input.name || "").trim().slice(0, 120);
    const id = slug(input.profile_id || name);
    if (!name || id.length < 2) throw mcpError("invalid_request", "Give the brand a name (2+ letters or numbers).", 400);
    saveBrandContext(engine, { profile_id: id, name }, { pilot: false });
    return save(engine, (s) => {
      s.started_at = s.started_at || new Date(now).toISOString();
      s.profile_id = id;
      advance(s, "name", "pack", now);
    });
  }

  if (step === "pack") {
    expect(state, "pack");
    const later = input.later === true;
    const pack = later ? null : String(input.pack || "");
    if (!later && pack !== "blank" && !STARTER_PACK_IDS.includes(pack)) throw mcpError("invalid_request", "Pick a starter pack or Start blank.", 400);
    if (pack && pack !== "blank") {
      const profile = store.getProfile(state.profile_id);
      saveBrandContext(engine, starterPackInput(pack, { profile_id: state.profile_id, name: profile?.name }), { pilot: false });
    }
    return save(engine, (s) => {
      s.pack = later ? null : pack;
      advance(s, "pack", "connect", now, later);
    });
  }

  if (step === "connect") {
    expect(state, "connect");
    const later = input.later === true;
    const connected = store.listConnections(state.profile_id);
    if (!later && !connected.length) throw mcpError("not_connected", "Connect one account first, or choose Set up later.", 409);
    return save(engine, (s) => advance(s, "connect", "draft", now, later));
  }

  if (step === "draft") {
    expect(state, "draft");
    if (input.later === true) return save(engine, (s) => { advance(s, "draft", "done", now, true); s.outcome = "no_draft"; });
    const caption = String(input.caption || "").trim();
    if (!caption) throw mcpError("invalid_request", "Write a caption for the first draft.", 400);
    const connected = store.listConnections(state.profile_id).map((row) => row.platform);
    const presets = store.getProfile(state.profile_id)?.presets || {};
    const platforms = [...new Set(connected.length ? connected : presets.platforms || [])].filter((p) => p !== "youtube" || input.media_url || input.media_path);
    if (!platforms.length) throw mcpError("invalid_request", "No network to draft for yet. Connect one account or choose Set up later.", 409);
    const created = await engine.createDraft({
      profile_id: state.profile_id,
      platforms,
      title: String(input.title || caption).slice(0, 100),
      caption,
      description: caption,
      media_url: input.media_url,
      media_path: input.media_path,
      source: "desk",
    });
    const bundleId = created.bundle?.id || null;
    return save(engine, (s) => {
      s.bundle_id = bundleId;
      advance(s, "draft", "approve", now);
    });
  }

  if (step === "approve") {
    expect(state, "approve");
    if (input.later === true) return save(engine, (s) => { advance(s, "approve", "done", now, true); s.outcome = "draft_saved"; });
    let outcome;
    if (pilot) {
      queueApproved(engine, { bundle_id: state.bundle_id });
      outcome = "approved, waiting to post";
    } else {
      if (!input.scheduled_at) throw mcpError("invalid_request", "Pick when it should post. Onboarding never posts right away.", 400);
      const result = await engine.approveBundle({
        bundle_id: state.bundle_id,
        scheduled_at: input.scheduled_at,
        instagram_public_confirmed: input.instagram_public_confirmed === true,
      });
      const failed = (result.results || []).filter((row) => !row.ok);
      if (failed.length) throw mcpError(failed[0].error?.code || "schedule_failed", failed[0].error?.message || "Could not schedule.", 409);
      outcome = "scheduled";
    }
    return save(engine, (s) => {
      advance(s, "approve", "done", now);
      s.outcome = outcome;
    });
  }

  throw mcpError("invalid_request", "Unknown onboarding step.", 400);
}
