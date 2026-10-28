import { writeCaptions } from "../media/claude.js";
import { COMPLIANCE_BANNER } from "./example.js";

const NEGATION = /[^.]*\b(?:do not|does not|don't|without)\b[^.]*\./gi;

export const BANNED_PROMISE =
  /\b(subsid(?:y|ies)|savings|save money|lowest rate|guaranteed rate|premium discount|cheaper plan|\$\s?\d)/i;

export const NETWORK_LABELS = {
  facebook: "Facebook Page",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube Shorts script",
};

export function containsBannedPromise(text) {
  const body = String(text || "").split(COMPLIANCE_BANNER).join(" ").replace(NEGATION, " ");
  return BANNED_PROMISE.test(body);
}

function ensureParts(text, cta, banner) {
  let body = String(text || "").trim();
  const action = String(cta || "").trim();
  const note = String(banner || COMPLIANCE_BANNER).trim();
  if (action && !body.includes(action)) body = body ? `${body}\n\n${action}` : action;
  if (note && !body.includes(note)) body = body ? `${body}\n\n${note}` : note;
  return body.slice(0, 2200);
}

export function applyCompliance(written, { banner, cta } = {}) {
  const networks = {};
  for (const [platform, row] of Object.entries(written?.networks || {})) {
    networks[platform] = {
      ...row,
      title: String(row?.title || written.title || "").slice(0, 100),
      caption: ensureParts(row?.caption || written.caption, cta, banner),
      tags: Array.isArray(row?.tags) ? row.tags : written.tags || [],
    };
  }
  return {
    ...written,
    title: String(written?.title || "").slice(0, 100),
    caption: ensureParts(written?.caption, cta, banner),
    networks,
  };
}

function bullet(points) {
  return (Array.isArray(points) ? points : []).map((point) => `• ${String(point).trim()}`).filter((line) => line !== "•");
}

export function youtubeScript(topic, goal, banner) {
  const lines = [
    "YOUTUBE SHORTS SCRIPT",
    `Hook: ${topic.shorts_hook || topic.title}`,
    `Title card: ${topic.title}`,
    "Say:",
    ...bullet(topic.points).map((line) => line.replace(/^• /, "")),
    `Close: ${goal.call_to_action || ""}`.trim(),
    String(banner || COMPLIANCE_BANNER),
  ];
  return lines.filter(Boolean).join("\n").slice(0, 2200);
}

export function templateCaptions({ topic, goal, platforms, banner }) {
  const body = [topic.title, "", topic.angle, "", ...bullet(topic.points)].filter((line, index, all) => {
    if (line !== "") return true;
    return all[index - 1] !== "";
  });
  const caption = body.join("\n").trim();
  const networks = {};
  for (const platform of platforms) {
    networks[platform] =
      platform === "youtube"
        ? {
            title: String(topic.title || "").slice(0, 100),
            caption: youtubeScript(topic, goal, banner),
            tags: ["openenrollment", "healthplan"],
          }
        : {
            title: String(topic.title || "").slice(0, 100),
            caption,
            tags: ["openenrollment"],
          };
  }
  return applyCompliance(
    {
      title: String(topic.title || "Draft").slice(0, 100),
      caption,
      tags: ["openenrollment"],
      networks,
      provider: "template",
      model: "pilot-template",
    },
    { banner, cta: goal.call_to_action },
  );
}

export function captionPrompt({ topic, goal, config, platforms }) {
  return [
    `Write captions for ${platforms.join(", ")}.`,
    `Niche: ${config.niche || ""}`,
    `Campaign: ${config.campaign?.name || ""} (${config.campaign?.start || ""} to ${config.campaign?.end || ""}).`,
    `Goal: ${goal.label}. Call to action to include: ${goal.call_to_action}`,
    `Topic: ${topic.title}. Angle: ${topic.angle}. Points: ${(topic.points || []).join("; ")}.`,
    "YouTube must be a short spoken script, not a feed caption.",
    "Do not promise rates, savings, subsidies, discounts, or plan outcomes.",
    `End every caption with: ${config.compliance_banner || COMPLIANCE_BANNER}`,
  ].join("\n");
}

export async function captionsForTopic({ topic, goal, config, platforms, env = process.env, fetchImpl, key }) {
  const banner = config.compliance_banner || COMPLIANCE_BANNER;
  const anthropic = key || env.ANTHROPIC_API_KEY || "";
  if (!anthropic) return templateCaptions({ topic, goal, platforms, banner });
  try {
    const written = await writeCaptions({
      provider: "claude",
      prompt: captionPrompt({ topic, goal, config, platforms }),
      platforms,
      presets: {},
      key: anthropic,
      fetchImpl,
      env,
    });
    const stamped = applyCompliance(written, { banner, cta: goal.call_to_action });
    const blob = [stamped.caption, ...Object.values(stamped.networks).map((row) => row.caption)].join("\n");
    if (containsBannedPromise(blob)) return templateCaptions({ topic, goal, platforms, banner });
    return { ...stamped, provider: "claude", model: written.model };
  } catch {
    return templateCaptions({ topic, goal, platforms, banner });
  }
}
