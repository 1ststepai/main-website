export const MANUAL_STEPS = [
  "Search YouTube for the topic.",
  "Keep videos from about the last 90 days.",
  "Separate Shorts from longer videos.",
  "Read the view count.",
  "Read the channel's subscriber count.",
  "Divide views by subscribers and keep the ratio.",
  "Watch the first 10 seconds without downloading the video.",
  "Name the opening type.",
  "Write the question or claim as a fill-in pattern.",
  "Note the visual surprise.",
  "Count the cuts or beats and the seconds until the first payoff.",
  "Note on camera or voiceover, energy, eye contact, and on-screen text.",
  "Write the promise or the curiosity gap.",
  "Write a new spoken line for this brand and topic.",
  "Write the on-screen text.",
  "Write the shot you will film yourself.",
  "Mark what happens from 0 to 10 seconds.",
  "Write why that shape fits this topic.",
  "Compare your line with the source title and description and remove any copied run of words.",
  "Put the spoken line on the draft and the shot on the media prompt.",
];

export const HOOK_STEPS = [
  { id: "brand", text: "Choose the brand. Skip this when that brand is already selected.", skipWhenBrandSelected: true },
  { id: "topic", text: "Type the topic once. Skip this when the keyword step already has it.", skipWhenTopicEntered: true },
  { id: "find", text: "Click Find examples." },
  { id: "pick", text: "Click the example you want." },
  { id: "read", text: "Click Read the opening." },
  { id: "write", text: "Click Write 3 hooks." },
  { id: "use", text: "Click Use this hook." },
];

export const HOOK_STEPS_NO_KEY = [
  { id: "brand", text: "Choose the brand. Skip this when that brand is already selected.", skipWhenBrandSelected: true },
  { id: "topic", text: "Type the topic once. Skip this when the keyword step already has it.", skipWhenTopicEntered: true },
  { id: "find", text: "Click Find examples." },
  { id: "pick", text: "Click the example you want." },
  { id: "paste", text: "Paste what you saw in the first 10 seconds." },
  { id: "save", text: "Click Save observation." },
  { id: "write", text: "Click Write 3 hooks." },
  { id: "use", text: "Click Use this hook." },
];

function kept(steps, { brandAlreadySelected = false, topicAlreadyEntered = false } = {}) {
  return steps.filter((step) => {
    if (brandAlreadySelected && step.skipWhenBrandSelected) return false;
    if (topicAlreadyEntered && step.skipWhenTopicEntered) return false;
    return true;
  });
}

export function stepComparison() {
  return {
    manual: MANUAL_STEPS.length,
    withKey: kept(HOOK_STEPS).length,
    withKeyReady: kept(HOOK_STEPS, { brandAlreadySelected: true, topicAlreadyEntered: true }).length,
    withoutKey: kept(HOOK_STEPS_NO_KEY).length,
    withoutKeyReady: kept(HOOK_STEPS_NO_KEY, { brandAlreadySelected: true, topicAlreadyEntered: true }).length,
    manualSteps: MANUAL_STEPS,
    hookSteps: kept(HOOK_STEPS).map((step) => step.text),
    hookStepsNoKey: kept(HOOK_STEPS_NO_KEY).map((step) => step.text),
  };
}

export function helpCopy() {
  const steps = stepComparison();
  return {
    headline: `${steps.manual} actions by hand, ${steps.withKey} in this step`,
    disclaimer: "This is a count of actions, not a promise about minutes saved.",
    summary: `Finding a recent video, working out why its opening outperformed the channel, and writing an original 10-second opening is ${steps.manual} actions. With a Gemini key on this computer it is ${steps.withKey} actions. If the brand and topic are already filled in, it is ${steps.withKeyReady}.`,
    withoutKey: `Without that key, you paste what you saw in the first 10 seconds. That path is ${steps.withoutKey} actions, or ${steps.withoutKeyReady} when the brand and topic are already filled in.`,
    copyright:
      "This is concept-level only. A pattern is not something we copy as footage or as a script. The video and its wording stay theirs. PostPath keeps the shape, the link, and the public counts. It does not keep the video, the audio, or a transcript.",
    flow: [
      "Start from the same topic as the keyword step.",
      "Pick a recent example and keep its opening shape.",
      "Choose one original hook. It becomes the on-camera script, the caption lead, and the media prompt.",
      "The approval queue still shows the SEO notes. One Approve is still the only way it posts.",
    ],
    manualSteps: steps.manualSteps,
    hookSteps: steps.hookSteps,
    setup: [
      "Find examples uses the YouTube account already connected for posting, or a YouTube API key saved on this computer.",
      "Read the opening uses a Gemini key saved on this computer. It sends the public video link and asks only about 0 to 10 seconds. It does not download the file.",
      "Write 3 hooks uses a Claude key saved on this computer. Tests and a missing key do not invent a personality. Tone, energy, and whether you appear on camera stay blank until you fill them.",
      "vidIQ is not used for this search.",
    ],
  };
}
