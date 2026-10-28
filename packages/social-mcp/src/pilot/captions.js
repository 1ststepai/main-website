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

function joinLines(lines) {
  return lines
    .filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""))
    .join("\n")
    .trim();
}

export const INSTAGRAM_HASHTAGS = "#openenrollment #healthinsurance #healthplan #insurancebroker";

// Each network gets its own voice. None of them quote a rate, savings, or subsidy; the banner is added after.
export function networkTemplate(platform, topic, goal, banner) {
  const title = String(topic.title || "").trim();
  const angle = String(topic.angle || "").trim();
  const points = bullet(topic.points);
  if (platform === "youtube") return youtubeScript(topic, goal, banner);
  if (platform === "facebook") {
    return joinLines([
      `${title}`,
      "",
      `Open enrollment can feel like a lot. ${angle}`,
      "",
      "Here is what helps most people get started:",
      ...points,
      "",
      "No pressure and no sales pitch. If you have questions about your own situation, we are happy to talk it through with you.",
    ]);
  }
  if (platform === "instagram") {
    return joinLines([
      `${title} 📋`,
      "",
      ...points.slice(0, 3),
      "",
      INSTAGRAM_HASHTAGS,
    ]);
  }
  if (platform === "linkedin") {
    return joinLines([
      `${title}`,
      "",
      `During open enrollment, a short, structured review helps households and employees make informed coverage decisions. ${angle}`,
      "",
      "Key points:",
      ...points.map((line) => line.replace(/^• /, "– ")),
      "",
      "Our office works with individuals and families to review their options clearly and compliantly.",
    ]);
  }
  return joinLines([title, "", angle, "", ...points]);
}

export function templateCaptions({ topic, goal, platforms, banner }) {
  const caption = joinLines([topic.title, "", topic.angle, "", ...bullet(topic.points)]);
  const networks = {};
  for (const platform of platforms) {
    networks[platform] = {
      title: String(topic.title || "").slice(0, 100),
      caption: networkTemplate(platform, topic, goal, banner),
      tags: platform === "youtube" ? ["openenrollment", "healthplan"] : ["openenrollment"],
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
