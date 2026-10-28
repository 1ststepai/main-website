const WORD = /[a-z0-9']+/g;

export function wordsOf(value) {
  return String(value || "")
    .toLowerCase()
    .match(WORD) || [];
}

/** More than 4 consecutive words from a source is a copy. A 4-word run is allowed. */
export function copiedRun(text, sources) {
  const words = wordsOf(text);
  if (words.length < 5) return "";
  const hay = sources.map((source) => wordsOf(source).join(" ")).join(" \n ");
  for (let size = Math.min(words.length, 12); size >= 5; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const run = words.slice(index, index + size).join(" ");
      if (hay.includes(run)) return run;
    }
  }
  return "";
}

export function hookText(hook) {
  const beats = Array.isArray(hook?.beats) ? hook.beats.map((beat) => `${beat?.t || ""} ${beat?.text || beat?.do || ""}`) : [];
  return [hook?.spoken, hook?.on_screen_text, hook?.shot, hook?.why, ...beats].filter(Boolean).join("\n");
}

export function guardHook(hook, sources) {
  const run = copiedRun(hookText(hook), sources);
  if (!run) return { ...hook, rejected: false };
  return {
    rejected: true,
    reason: "This opening repeats more than four words in a row from the reference. It was not kept.",
  };
}
