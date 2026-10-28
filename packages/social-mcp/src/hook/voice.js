/** On-camera voice fields Evan still has to fill. Empty means unknown, not a guess. */
export const VOICE_SEEDS = [
  {
    id: "1ststep-ai",
    name: "1stStep.ai",
    tone: "",
    avoid: [],
    on_camera_style: "",
    energy: "",
    appears_on_camera: null,
    todo: ["tone", "avoid", "on_camera_style", "energy", "appears_on_camera"],
  },
  {
    id: "skillsprout",
    name: "SkillSprout",
    tone: "",
    avoid: [],
    on_camera_style: "",
    energy: "",
    appears_on_camera: null,
    todo: ["tone", "avoid", "on_camera_style", "energy", "appears_on_camera"],
  },
  {
    id: "swing-trade-pros",
    name: "Swing Trade Pros",
    tone: "",
    avoid: [],
    on_camera_style: "",
    energy: "",
    appears_on_camera: null,
    todo: ["tone", "avoid", "on_camera_style", "energy", "appears_on_camera"],
  },
  {
    id: "daysetgo",
    name: "DaySetGo",
    tone: "",
    avoid: [],
    on_camera_style: "",
    energy: "",
    appears_on_camera: null,
    todo: ["tone", "avoid", "on_camera_style", "energy", "appears_on_camera"],
  },
];

function cleanList(value) {
  return (Array.isArray(value) ? value : String(value || "").split(/\n|,/))
    .map((item) => String(item || "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
}

export function voiceFromSeed(seed) {
  return {
    profile_id: seed.id,
    name: seed.name,
    tone: "",
    avoid: [],
    on_camera_style: "",
    energy: "",
    appears_on_camera: null,
    todo: [...seed.todo],
    source: "todo",
  };
}

export function listVoices(store) {
  const saved = store.readSeo().voices || {};
  return VOICE_SEEDS.map((seed) => saved[seed.id] || voiceFromSeed(seed));
}

export function voiceFor(store, profileId) {
  const id = String(profileId || "");
  const saved = store.readSeo().voices?.[id];
  if (saved) return saved;
  const seed = VOICE_SEEDS.find((row) => row.id === id);
  return seed ? voiceFromSeed(seed) : voiceFromSeed({ id: id || "brand", name: id || "Brand", todo: ["tone", "avoid", "on_camera_style", "energy", "appears_on_camera"] });
}

export function saveVoice(store, input, stamp) {
  const profileId = String(input.profile_id || "").trim();
  const record = buildVoiceRecord(voiceFor(store, profileId), { ...input, profile_id: profileId }, stamp);
  store.updateSeo((seo) => {
    seo.voices = seo.voices || {};
    seo.voices[profileId] = record;
    return record;
  });
  return record;
}

/** Merge new voice answers over the current record. Blank stays blank. */
export function buildVoiceRecord(current, input, stamp) {
  const profileId = String(input.profile_id || "").trim();
  const appears = input.appears_on_camera;
  const record = {
    profile_id: profileId,
    name: String(input.name || current.name || profileId).slice(0, 120),
    tone: String(input.tone ?? current.tone ?? "").trim().slice(0, 200),
    avoid: input.avoid !== undefined ? cleanList(input.avoid) : current.avoid || [],
    on_camera_style: String(input.on_camera_style ?? current.on_camera_style ?? "").trim().slice(0, 200),
    energy: String(input.energy ?? current.energy ?? "").trim().slice(0, 80),
    appears_on_camera: appears === true || appears === false ? appears : appears === "yes" ? true : appears === "no" ? false : current.appears_on_camera,
    updated_at: stamp,
    source: "saved",
  };
  record.todo = ["tone", "avoid", "on_camera_style", "energy", "appears_on_camera"].filter((field) => {
    if (field === "appears_on_camera") return record.appears_on_camera !== true && record.appears_on_camera !== false;
    if (field === "avoid") return !record.avoid.length;
    return !record[field];
  });
  return record;
}
