import { helpCopy } from "./steps.js";
import { listVoices, saveVoice } from "./voice.js";
import { findHookExamples } from "./find.js";
import { captureHookStructure } from "./analyze.js";
import { generateHooks } from "./generate.js";
import { attachHook, annotateHook } from "./attach.js";

export function createHooks({
  store,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  hookGenerator = null,
  structureProvider = null,
} = {}) {
  if (!store) throw new Error("createHooks requires a store.");
  const ctx = { store, env, fetchImpl, now, hookGenerator, structureProvider };
  return {
    help: () => helpCopy(),
    listVoices: () => ({ voices: listVoices(store) }),
    saveVoice: (input) => ({ voice: saveVoice(store, input, new Date(now()).toISOString()) }),
    find: (input) => findHookExamples(ctx, input),
    capture: (input) => captureHookStructure(ctx, input),
    generate: (input) => generateHooks(ctx, input),
    attach: (input) => attachHook(ctx, input),
    annotate: (item) => annotateHook(store, item),
  };
}
