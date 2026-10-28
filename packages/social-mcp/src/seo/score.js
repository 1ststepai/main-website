import { profileRequiresVidiq } from "../multiPost.js";
import { channelById } from "./channels.js";
import { effectiveKeywords } from "./keywords.js";
import {
  containsTerm,
  firstLine,
  hashtagRelevant,
  isWeakTerm,
  nearDuplicateTitle,
  normalizeTerm,
} from "./terms.js";

export const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const DEDUCTIONS = {
  keyword: 25,
  length: 20,
  hashtag: 15,
  weak: 10,
  overlap: 20,
};

function clamp(score) {
  return Math.max(0, Math.min(100, score));
}

function researchHasVidiq(research, vidiq) {
  if (vidiq?.checked_at) return true;
  if (research?.source === "vidiq" && research.checked_at) return true;
  return Boolean(research?.keywords?.some((row) => row.source === "vidiq" && row.checked_at));
}

export function overlapNotes({ brand, title, peers }) {
  const notes = [];
  const mine = new Set((brand?.primary || []).map(normalizeTerm).filter(Boolean));
  for (const peer of peers || []) {
    if (!peer || peer.profile_id === brand?.profile_id) continue;
    for (const term of peer.primary || []) {
      const key = normalizeTerm(term);
      if (key && mine.has(key)) notes.push(`Same primary keyword as ${peer.name || peer.profile_id}: ${term}.`);
    }
    for (const other of peer.titles || []) {
      if (nearDuplicateTitle(title, other)) {
        notes.push(`Title is close to a ${peer.name || peer.profile_id} draft in this window.`);
        break;
      }
    }
  }
  return [...new Set(notes)];
}

export function scoreChannelCopy({ brand, channel, copy, peers = [], requireVidiq = false, research = null, vidiq = null }) {
  const notes = [];
  let score = 100;
  const title = String(copy?.title || "");
  const description = String(copy?.description || "");
  const caption = String(copy?.caption || "");
  const opening = `${title}\n${firstLine(caption || description)}`;
  const primary = brand?.primary || [];
  if (!primary.length) {
    notes.push(`${channel.label}: No primary keyword is saved.`);
    score -= DEDUCTIONS.keyword;
  } else if (!primary.some((term) => containsTerm(opening, term))) {
    notes.push(`${channel.label}: Primary keyword is not in the title or first line.`);
    score -= DEDUCTIONS.keyword;
  }
  const lengthProblems = [];
  if (title.length > channel.title) lengthProblems.push(`title is ${title.length} characters (limit ${channel.title})`);
  if (description.length > channel.description) {
    lengthProblems.push(`description is ${description.length} characters (limit ${channel.description})`);
  }
  if (caption.length > channel.caption) lengthProblems.push(`caption is ${caption.length} characters (limit ${channel.caption})`);
  if (!caption.trim() && !description.trim()) lengthProblems.push("caption is empty");
  if (lengthProblems.length) {
    notes.push(`${channel.label}: ${lengthProblems.join("; ")}.`);
    score -= DEDUCTIONS.length;
  }
  const tags = Array.isArray(copy?.hashtags) ? copy.hashtags : [];
  const keywordPool = [...primary, ...(brand?.secondary || []), ...(brand?.negative || [])];
  const seen = new Set();
  let hashtagProblem = false;
  if (tags.length > channel.hashtags.hardMax) {
    notes.push(`${channel.label}: ${tags.length} hashtags is over the limit of ${channel.hashtags.hardMax}.`);
    hashtagProblem = true;
  } else if (tags.length > channel.hashtags.usual) {
    notes.push(`${channel.label}: ${tags.length} hashtags is more than the usual ${channel.hashtags.usual}.`);
    hashtagProblem = true;
  }
  for (const tag of tags) {
    const key = normalizeTerm(tag);
    if (seen.has(key)) {
      notes.push(`${channel.label}: Repeated hashtag ${tag}.`);
      hashtagProblem = true;
    }
    seen.add(key);
    if (!hashtagRelevant(tag, [...primary, ...(brand?.secondary || [])])) {
      notes.push(`${channel.label}: Hashtag ${tag} does not match a saved keyword.`);
      hashtagProblem = true;
    }
  }
  if (hashtagProblem) score -= DEDUCTIONS.hashtag;
  const negatives = new Set((brand?.negative || []).map(normalizeTerm));
  const blob = `${title}\n${description}\n${caption}`;
  let weak = false;
  for (const term of primary) {
    if (isWeakTerm(term)) {
      notes.push(`${channel.label}: Weak keyword in the list: ${term}.`);
      weak = true;
    }
  }
  for (const term of brand?.negative || []) {
    if (containsTerm(blob, term)) {
      notes.push(`${channel.label}: Avoid keyword used: ${term}.`);
      weak = true;
    }
  }
  for (const tag of tags) {
    if (negatives.has(normalizeTerm(tag.replace(/^#/, "")))) {
      notes.push(`${channel.label}: Hashtag matches an avoid keyword: ${tag}.`);
      weak = true;
    }
  }
  if (weak) score -= DEDUCTIONS.weak;
  const overlaps = overlapNotes({ brand, title, peers });
  if (overlaps.length) score -= DEDUCTIONS.overlap;
  const blocking = Boolean(requireVidiq && channel.id === "youtube" && !researchHasVidiq(research, vidiq));
  if (blocking) notes.push("YouTube needs a vidIQ check before this can be approved.");
  return {
    platform: channel.id,
    checklist_score: clamp(score),
    advisory: true,
    blocking,
    notes: [...notes, ...overlaps],
    auto_approve: false,
  };
}

function copyFromPost(post, channel) {
  return {
    title: post?.title || "",
    description: post?.description || "",
    caption: post?.caption || "",
    hashtags: Array.isArray(post?.tags) ? post.tags : [],
  };
}

export function collectPeers(store, { now, exceptId, windowMs = WINDOW_MS }) {
  const keywords = effectiveKeywords(store, new Date(now).toISOString());
  const peers = keywords.map((row) => ({
    profile_id: row.profile_id,
    name: row.name,
    primary: row.primary || [],
    titles: [],
  }));
  const cutoff = now - windowMs;
  const addTitle = (id, profileId, title, at) => {
    if (!title || id === exceptId) return;
    const when = Date.parse(at || "");
    if (!Number.isFinite(when) || when < cutoff) return;
    const peer = peers.find((row) => row.profile_id === profileId);
    if (peer) peer.titles.push(title);
  };
  for (const bundle of store.listBundles()) {
    if (bundle.status === "discarded") continue;
    addTitle(bundle.id, bundle.profile_id, bundle.title, bundle.updated_at);
  }
  for (const post of store.listPosts()) {
    if (post.bundle_id) continue;
    if (!["draft", "scheduled", "published", "handed_off"].includes(post.status)) continue;
    addTitle(post.id, post.profile_id, post.title, post.updated_at);
  }
  return peers;
}

export function annotateQueueItem(ctx, item) {
  const profile = ctx.store.getProfile(item.profile_id);
  const brands = effectiveKeywords(ctx.store, new Date(ctx.now()).toISOString());
  const brand = brands.find((row) => row.profile_id === item.profile_id) || {
    profile_id: item.profile_id,
    name: item.profile_name || item.profile_id,
    primary: [],
    secondary: [],
    negative: [],
  };
  const peers = collectPeers(ctx.store, { now: ctx.now(), exceptId: item.id });
  const requireVidiq = profileRequiresVidiq(profile) && (item.platforms || []).some((row) => row.platform === "youtube");
  const copies = [];
  let research = null;
  let vidiq = null;
  if (item.kind === "bundle") {
    const bundle = ctx.store.getBundle(item.id);
    research = bundle?.keyword_research || null;
    vidiq = bundle?.vidiq || null;
    for (const target of item.platforms || []) {
      const channel = channelById(target.platform);
      if (!channel) continue;
      const post = ctx.store.getPost(target.post_id);
      copies.push({ channel, copy: copyFromPost(post || bundle, channel) });
    }
  } else {
    const post = ctx.store.getPost(item.id);
    research = post?.keyword_research || null;
    vidiq = post?.vidiq || null;
    const channel = channelById(post?.platform || item.platforms?.[0]?.platform);
    if (channel) copies.push({ channel, copy: copyFromPost(post, channel) });
  }
  const parts = copies.map(({ channel, copy }) =>
    scoreChannelCopy({
      brand,
      channel,
      copy,
      peers,
      requireVidiq: requireVidiq && channel.id === "youtube",
      research,
      vidiq,
    }),
  );
  const notes = [];
  for (const part of parts) {
    for (const note of part.notes) if (!notes.includes(note)) notes.push(note);
  }
  const checklist = parts.length ? Math.round(parts.reduce((sum, part) => sum + part.checklist_score, 0) / parts.length) : 100;
  const blocking = parts.some((part) => part.blocking);
  return {
    ...item,
    seo: {
      advisory: true,
      blocking,
      checklist_score: checklist,
      notes,
      vidiq_needed: Boolean(item.vidiq_needed || blocking),
      auto_approve: false,
    },
  };
}

export function scoreSupplied(ctx, input = {}) {
  const brands = effectiveKeywords(ctx.store, new Date(ctx.now()).toISOString());
  const brand = brands.find((row) => row.profile_id === input.profile_id) || brands[0];
  if (!brand) return { checklist_score: 0, notes: ["Save a keyword list first."], advisory: true, blocking: false, auto_approve: false };
  const channel = channelById(input.platform || input.channel || "youtube");
  if (!channel) return { notes: ["Unknown channel."], advisory: true, blocking: false, checklist_score: 0, auto_approve: false };
  const peers = collectPeers(ctx.store, { now: ctx.now(), exceptId: input.except_id || "" });
  const profile = ctx.store.getProfile(brand.profile_id);
  return scoreChannelCopy({
    brand,
    channel,
    copy: {
      title: input.title,
      description: input.description,
      caption: input.caption,
      hashtags: input.hashtags || input.tags || [],
    },
    peers,
    requireVidiq: Boolean(input.require_vidiq) || (profileRequiresVidiq(profile) && channel.id === "youtube"),
    research: input.research || null,
    vidiq: input.vidiq || null,
  });
}
