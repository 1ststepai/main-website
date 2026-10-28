import { mcpError } from "../errors.js";
import { resolveChannels } from "./channels.js";
import { brandsForDraft } from "./keywords.js";
import { containsTerm, fitText, toHashtag, uniqueStrings } from "./terms.js";
import { scoreChannelCopy } from "./score.js";

const FILL_INSTRUCTION =
  "Fill title, description, caption, hashtags, and on_screen_text for each channel. Use the brand keywords. Do not invent search volumes.";

function providerMode(ctx) {
  if (typeof ctx.captionProvider === "function") return "provider";
  return String(ctx.env.POSTPATH_CAPTION_PROVIDER || "template").trim().toLowerCase() === "brief" ? "brief" : "template";
}

export function buildBrief(topic, brands, channels) {
  return {
    topic,
    instruction: FILL_INSTRUCTION,
    brands: brands.map((brand) => ({
      profile_id: brand.profile_id,
      name: brand.name,
      audience: brand.audience,
      keywords: {
        primary: brand.primary,
        secondary: brand.secondary,
        negative: brand.negative,
      },
      channels: channels.map((channel) => ({
        platform: channel.id,
        label: channel.label,
        copy_only: channel.copyOnly,
        limits: {
          title: channel.title,
          description: channel.description,
          caption: channel.caption,
          hashtags: channel.hashtags,
          on_screen_text: channel.onScreen,
        },
        fields: ["title", "description", "caption", "hashtags", "on_screen_text"],
        note: channel.note || "",
      })),
    })),
  };
}

function hashtagsFor(brand, channel, reserved) {
  const tags = [];
  for (const term of [...(brand.primary || []), ...(brand.secondary || [])]) {
    const tag = toHashtag(term);
    if (!tag || tags.includes(tag)) continue;
    const blocked = (brand.negative || []).some((item) => toHashtag(item) === tag);
    if (blocked) continue;
    const next = [...tags, tag].join(" ");
    if (reserved + next.length + 1 > channel.caption) continue;
    tags.push(tag);
    if (tags.length >= channel.hashtags.usual) break;
  }
  return tags;
}

export function templateCopy(topic, brand, channel) {
  const primary = brand.primary?.[0] || topic;
  const title = fitText(containsTerm(topic, primary) ? topic : `${topic}: ${primary}`, channel.title);
  const tags = hashtagsFor(brand, channel, 0).filter((tag, index, all) => {
    const used = all.slice(0, index + 1).join(" ");
    return used.length + 1 < channel.caption;
  });
  const tagText = tags.join(" ");
  const room = Math.max(0, channel.caption - (tagText ? tagText.length + 1 : 0));
  const sentence = `${topic}. ${brand.audience || ""} Focus: ${primary}.`.replace(/\s+/g, " ").trim();
  const body = fitText(sentence, room || channel.caption);
  const caption = fitText(tagText ? `${body} ${tagText}`.trim() : body, channel.caption);
  return {
    platform: channel.id,
    label: channel.label,
    copy_only: channel.copyOnly,
    title,
    description: fitText(sentence, channel.description),
    caption,
    hashtags: tags.filter((tag) => caption.includes(tag)),
    on_screen_text: fitText(containsTerm(topic, primary) ? primary : topic, channel.onScreen),
    source: "template",
    volume: null,
  };
}

function stripVolumes(copy) {
  const next = { ...copy };
  delete next.volume;
  delete next.search_volume;
  next.volume = null;
  return next;
}

function clipToChannel(copy, channel) {
  return stripVolumes({
    platform: channel.id,
    label: channel.label,
    copy_only: channel.copyOnly,
    title: fitText(copy.title, channel.title),
    description: fitText(copy.description, channel.description),
    caption: fitText(copy.caption, channel.caption),
    hashtags: uniqueStrings(copy.hashtags, channel.hashtags.hardMax).map((tag) => (String(tag).startsWith("#") ? tag : toHashtag(tag))).filter(Boolean),
    on_screen_text: fitText(copy.on_screen_text || copy.onScreen, channel.onScreen),
    source: "caption_provider",
  });
}

async function copiesFromProvider(ctx, brief, brands, channels) {
  try {
    const filled = await ctx.captionProvider(brief);
    const rows = Array.isArray(filled?.brands) ? filled.brands : [];
    const drafts = [];
    for (const brand of brands) {
      const provided = rows.find((row) => row.profile_id === brand.profile_id) || {};
      const channelRows = Array.isArray(provided.channels) ? provided.channels : [];
      const channelsOut = channels.map((channel) => {
        const match = channelRows.find((row) => row.platform === channel.id) || {};
        return clipToChannel(match, channel);
      });
      drafts.push({ profile_id: brand.profile_id, name: brand.name, channels: channelsOut });
    }
    return { ok: true, drafts };
  } catch {
    return { ok: false, error: "The caption provider did not return copy. The brief is included so it can be filled.", drafts: [] };
  }
}

export async function draftCopy(ctx, input = {}) {
  const topic = String(input.topic || "").trim().slice(0, 120);
  if (topic.length < 2) throw mcpError("invalid_topic", "Enter a topic of at least 2 characters.");
  const brands = brandsForDraft(ctx, input);
  const channels = resolveChannels(input.channels || input.platforms);
  if (!channels.length) throw mcpError("invalid_platform", "Name a channel from the SEO list.");
  const brief = buildBrief(topic, brands, channels);
  const mode = providerMode(ctx);
  let drafts = [];
  let providerError = "";
  if (mode === "provider") {
    const provided = await copiesFromProvider(ctx, brief, brands, channels);
    drafts = provided.drafts;
    providerError = provided.error || "";
  } else if (mode === "template") {
    drafts = brands.map((brand) => ({
      profile_id: brand.profile_id,
      name: brand.name,
      channels: channels.map((channel) => templateCopy(topic, brand, channel)),
    }));
  }
  const scored = drafts.map((brand) => ({
    ...brand,
    channels: brand.channels.map((copy) => ({
      ...copy,
      seo: scoreChannelCopy({
        brand: brands.find((row) => row.profile_id === brand.profile_id),
        channel: channels.find((row) => row.id === copy.platform),
        copy,
        peers: brands,
        requireVidiq: false,
        research: null,
      }),
    })),
  }));
  return {
    topic,
    mode: drafts.length ? mode : "brief",
    needs_client_fill: mode !== "provider" || !drafts.length,
    instruction: FILL_INSTRUCTION,
    brief,
    drafts: scored,
    provider_error: providerError || undefined,
    note: "Template copy is a starting point from the topic and saved keywords. It is not a search-volume estimate.",
  };
}
