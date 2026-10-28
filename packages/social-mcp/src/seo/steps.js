/** Action counts for the owner doc and the desk help. A step is one lookup, one field, or one click. */

export const COMPARISON_CHANNELS = ["YouTube", "Facebook", "Instagram", "Bluesky"];
export const COPY_ONLY_CHANNELS = ["TikTok", "X", "LinkedIn"];

export const MANUAL_SHARED = [
  { id: "yt-suggest", text: "Look up the topic in YouTube search suggestions." },
  { id: "google-suggest", text: "Look up the topic in Google search suggestions." },
  { id: "vidiq", text: "Look up the topic in vidIQ and copy the scores you want to keep.", vidiq: true },
];

export const MANUAL_PER_BRAND = [
  { id: "keywords", text: "Write the primary, secondary, and avoid keywords." },
];

export function manualChannelSteps(channel) {
  return [
    { id: `${channel}-title`, text: `Write the ${channel} title.` },
    { id: `${channel}-description`, text: `Write the ${channel} description.` },
    { id: `${channel}-caption`, text: `Write the ${channel} caption.` },
    { id: `${channel}-hashtags`, text: `Write the ${channel} hashtags.` },
    { id: `${channel}-length`, text: `Check the ${channel} title, description, and caption against the length limits.` },
  ];
}

export const MANUAL_TAIL = [
  { id: "save", text: "Save the draft." },
  { id: "approve", text: "Approve it." },
];

export const SEO_STEPS = [
  { id: "brand", text: "Choose the brand. Skip this when that brand is already selected.", skipWhenBrandSelected: true },
  { id: "topic", text: "Type the topic once." },
  { id: "suggest", text: "Click Suggest keywords." },
  { id: "vidiq", text: "Paste the vidIQ scores and click Attach keyword check.", vidiq: true },
  { id: "draft", text: "Click Draft copy." },
  { id: "queue", text: "Click Add to approval queue." },
  { id: "approve", text: "Click Approve on that draft." },
];

function count(list) {
  return list.length;
}

export function manualSteps({ brands = 1, includeVidiq = true, channels = COMPARISON_CHANNELS } = {}) {
  const shared = MANUAL_SHARED.filter((step) => includeVidiq || !step.vidiq);
  const perBrand = [
    ...MANUAL_PER_BRAND,
    ...channels.flatMap((channel) => manualChannelSteps(channel)),
    ...MANUAL_TAIL,
  ];
  return [...shared, ...Array.from({ length: brands }, () => perBrand).flat()];
}

export function seoSteps({ brands = 1, includeVidiq = true, brandAlreadySelected = false } = {}) {
  const steps = SEO_STEPS.filter((step) => {
    if (!includeVidiq && step.vidiq) return false;
    if (brandAlreadySelected && step.skipWhenBrandSelected) return false;
    return true;
  });
  const approve = steps.filter((step) => step.id === "approve");
  const rest = steps.filter((step) => step.id !== "approve");
  const approvals = Array.from({ length: brands }, () => approve).flat();
  return [...rest, ...approvals];
}

export function stepComparison() {
  const oneWith = {
    brands: 1,
    channels: COMPARISON_CHANNELS.length,
    includeVidiq: true,
    manual: count(manualSteps({ brands: 1, includeVidiq: true })),
    seo: count(seoSteps({ brands: 1, includeVidiq: true, brandAlreadySelected: false })),
  };
  const oneWithout = {
    brands: 1,
    channels: COMPARISON_CHANNELS.length,
    includeVidiq: false,
    brandAlreadySelected: true,
    manual: count(manualSteps({ brands: 1, includeVidiq: false })),
    seo: count(seoSteps({ brands: 1, includeVidiq: false, brandAlreadySelected: true })),
  };
  const fourWith = {
    brands: 4,
    channels: COMPARISON_CHANNELS.length,
    includeVidiq: true,
    manual: count(manualSteps({ brands: 4, includeVidiq: true })),
    seo: count(seoSteps({ brands: 4, includeVidiq: true, brandAlreadySelected: false })),
  };
  const copyOnlyExtra = COPY_ONLY_CHANNELS.length * 5;
  return {
    channels: COMPARISON_CHANNELS,
    copyOnlyChannels: COPY_ONLY_CHANNELS,
    copyOnlyExtraManualSteps: copyOnlyExtra,
    oneBrandWithVidiq: oneWith,
    oneBrandWithoutVidiq: oneWithout,
    fourBrandsWithVidiq: fourWith,
    manualOneBrand: manualSteps({ brands: 1, includeVidiq: true }).map((step) => step.text),
    seoOneBrand: seoSteps({ brands: 1, includeVidiq: true }).map((step) => step.text),
  };
}

export function helpCopy() {
  const comparison = stepComparison();
  const withVidiq = comparison.oneBrandWithVidiq;
  const without = comparison.oneBrandWithoutVidiq;
  const four = comparison.fourBrandsWithVidiq;
  return {
    headline: `${withVidiq.manual} actions by hand, ${withVidiq.seo} in this step`,
    disclaimer: "This is a count of actions, not a promise about minutes saved.",
    summary: `For one brand and ${comparison.channels.join(", ")}, writing the keywords and the four text fields yourself is ${withVidiq.manual} actions. This step is ${withVidiq.seo} actions when you also paste a vidIQ check and the brand was not already selected.`,
    also: `When the brand is already selected and the post does not need a vidIQ check, the same work is ${without.manual} actions by hand and ${without.seo} here. Draft copy also returns TikTok, X, and LinkedIn text in that same click. Writing those three by hand is ${comparison.copyOnlyExtraManualSteps} more actions per brand. On-screen text is included here and is not in the hand count.`,
    fourBrands: `The same topic for all ${four.brands} saved brands is ${four.manual} actions by hand and ${four.seo} here, because each brand still needs its own Approve click.`,
    flow: [
      "Type one topic.",
      "Get keywords, then a title, description, caption, hashtags, and on-screen text for each channel and each brand.",
      "Read the notes beside each draft in the approval queue.",
      "Approve the draft yourself. Nothing posts until you do.",
    ],
    manualSteps: comparison.manualOneBrand,
    seoSteps: comparison.seoOneBrand,
    setup: [
      "Keyword ideas come from YouTube and Google search suggestions, from a vidIQ result you paste, and from search terms already saved on this computer.",
      "PostPath does not sign in to vidIQ. Paste the scores from the assistant that already has that login.",
      "YouTube for 1stStep.ai still needs that vidIQ check before approval. The other notes are there to read. They do not approve the draft.",
      "Search terms from your YouTube channel and from Google Search can be added after you click Connect search data. That sign-in is separate from the one used to post.",
      "Keyword Planner and Google Trends are switched off.",
    ],
  };
}
