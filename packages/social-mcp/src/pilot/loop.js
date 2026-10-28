import { mcpError } from "../errors.js";
import { captionsForTopic, containsBannedPromise, NETWORK_LABELS } from "./captions.js";
import { campaignLabel, findGoal, findTopic, loadPilot, resolvePilotPlatforms } from "./config.js";
import { approvedRows, captionsCsv, captionsText, captionsZip } from "./exportPack.js";

const WAITING = "approved, waiting to post";

function pilotMeta(config, goal, topic, provider) {
  return {
    goal_id: goal.id,
    goal_label: goal.label,
    topic_id: topic.id,
    topic_title: topic.title,
    call_to_action: goal.call_to_action,
    compliance_banner: config.compliance_banner,
    caption_provider: provider,
  };
}

function assertClean(written) {
  const blob = [written.caption, ...Object.values(written.networks || {}).map((row) => row.caption)].join("\n");
  if (containsBannedPromise(blob)) {
    throw mcpError("pilot_compliance", "The draft included a rate, savings, or subsidy promise. It was not saved.", 400);
  }
}

async function writeBundle(engine, { config, goal, topic, platforms, written, profileId }) {
  const profile = config.profile || { id: "broker", name: "Insurance broker" };
  const id = profileId || profile.id || "broker";
  await engine.upsertProfile({ id, name: profile.name || id, require_vidiq: false });
  const created = await engine.createDraft({
    profile_id: id,
    platforms,
    title: written.title,
    caption: written.caption,
    description: written.caption,
    tags: written.tags,
    overrides: written.networks,
    caption_provenance: { provider: written.provider, model: written.model },
    privacy_status: "private",
    source: "desk",
  });
  const meta = pilotMeta(config, goal, topic, written.provider);
  const bundle = engine.store.getBundle(created.bundle.id);
  bundle.pilot = meta;
  bundle.updated_at = new Date().toISOString();
  engine.store.saveBundle(bundle);
  for (const platform of platforms) {
    const post = engine.store.getPost(bundle.child_ids?.[platform]);
    if (!post) continue;
    post.pilot = meta;
    if (written.networks?.[platform]?.caption) post.caption = written.networks[platform].caption;
    if (written.networks?.[platform]?.title) post.title = String(written.networks[platform].title).slice(0, 100);
    post.caption_provenance = { provider: written.provider, model: written.model };
    engine.store.savePost(post);
  }
  return { bundle: engine.store.getBundle(bundle.id), posts: platforms.map((platform) => engine.store.getPost(bundle.child_ids[platform])).filter(Boolean) };
}

export async function generateFromTopic(engine, input = {}, deps = {}) {
  const config = loadPilot(engine.store.homePaths);
  const goal = findGoal(config, String(input.goal_id || ""));
  const topic = findTopic(goal, String(input.topic_id || ""));
  const platforms = resolvePilotPlatforms(config, {
    connections: engine.store.listConnections(),
    selected: input.platforms,
  });
  const written = await captionsForTopic({
    topic,
    goal,
    config,
    platforms,
    env: deps.env || process.env,
    fetchImpl: deps.fetchImpl,
    key: deps.key,
  });
  assertClean(written);
  return writeBundle(engine, { config, goal, topic, platforms, written, profileId: input.profile_id });
}

export async function regeneratePilot(engine, { bundle_id, replace_edits = false } = {}, deps = {}) {
  const bundle = engine.store.getBundle(bundle_id);
  if (!bundle?.pilot) throw mcpError("not_found", "That draft is not a pilot topic.", 404);
  if (!["draft", "approved"].includes(bundle.status)) {
    throw mcpError("invalid_status", "Only a draft or an approved item can be regenerated.", 409);
  }
  const config = loadPilot(engine.store.homePaths);
  const goal = findGoal(config, bundle.pilot.goal_id);
  const topic = findTopic(goal, bundle.pilot.topic_id);
  const platforms = bundle.platforms || [];
  const written = await captionsForTopic({
    topic,
    goal,
    config,
    platforms,
    env: deps.env || process.env,
    fetchImpl: deps.fetchImpl,
    key: deps.key,
  });
  assertClean(written);
  // Inline edits survive a regenerate unless the broker explicitly says to replace them.
  const edited = replace_edits ? {} : { ...(bundle.edited || {}) };
  const kept = Object.keys(edited).filter((platform) => edited[platform] && platforms.includes(platform));
  for (const platform of kept) {
    if (bundle.overrides?.[platform]) written.networks[platform] = bundle.overrides[platform];
  }
  bundle.edited = Object.fromEntries(kept.map((platform) => [platform, true]));
  bundle.overrides = written.networks;
  bundle.caption = written.caption;
  bundle.title = written.title;
  bundle.caption_provenance = { provider: written.provider, model: written.model };
  bundle.pilot = { ...bundle.pilot, ...pilotMeta(config, goal, topic, written.provider) };
  bundle.updated_at = new Date().toISOString();
  engine.store.saveBundle(bundle);
  for (const platform of platforms) {
    const post = engine.store.getPost(bundle.child_ids?.[platform]);
    if (!post || !["draft", "approved"].includes(post.status)) continue;
    if (kept.includes(platform)) continue;
    const row = written.networks?.[platform] || {};
    post.caption = row.caption || written.caption;
    post.description = post.caption;
    post.title = String(row.title || written.title || post.title).slice(0, 100);
    post.pilot = bundle.pilot;
    post.caption_provenance = bundle.caption_provenance;
    post.updated_at = bundle.updated_at;
    engine.store.savePost(post);
  }
  return { bundle: engine.store.getBundle(bundle.id), kept_edits: kept };
}

function cleanEdit(engine, caption, bannerHint) {
  const next = String(caption ?? "");
  if (!next.trim()) throw mcpError("invalid_request", "The caption is empty.", 400);
  if (containsBannedPromise(next)) {
    throw mcpError("pilot_compliance", "Remove rate, savings, and subsidy promises before saving.", 400);
  }
  const banner = bannerHint || pilotBanner(engine);
  return banner && !next.includes(banner) ? `${next.trim()}\n\n${banner}`.slice(0, 2200) : next.slice(0, 2200);
}

function pilotBanner(engine) {
  try {
    return loadPilot(engine.store.homePaths)?.compliance_banner || "";
  } catch {
    return "";
  }
}

export function editPilotCaption(engine, { bundle_id, post_id, platform, caption, title } = {}) {
  if (!bundle_id && post_id) {
    const post = engine.store.getPost(post_id);
    if (!post || post.bundle_id) throw mcpError("not_found", "Draft not found.", 404);
    if (!["draft", "approved"].includes(post.status)) throw mcpError("invalid_status", "Only a draft or an approved item can be edited.", 409);
    const text = cleanEdit(engine, caption);
    post.caption = text;
    post.description = text;
    post.edited = true;
    if (title) post.title = String(title).slice(0, 100);
    post.updated_at = new Date().toISOString();
    engine.store.savePost(post);
    return { post: engine.store.getPost(post.id) };
  }
  const bundle = engine.store.getBundle(bundle_id);
  if (!bundle) throw mcpError("not_found", "Draft not found.", 404);
  if (!["draft", "approved"].includes(bundle.status)) {
    throw mcpError("invalid_status", "Only a draft or an approved item can be edited.", 409);
  }
  const key = String(platform || "");
  if (!bundle.platforms?.includes(key)) throw mcpError("invalid_platform", "That network is not on this draft.", 400);
  const withBanner = cleanEdit(engine, caption, bundle.pilot?.compliance_banner);
  bundle.edited = { ...(bundle.edited || {}), [key]: true };
  bundle.overrides = { ...(bundle.overrides || {}) };
  bundle.overrides[key] = { ...(bundle.overrides[key] || {}), caption: withBanner, title: title ? String(title).slice(0, 100) : bundle.overrides[key]?.title };
  bundle.updated_at = new Date().toISOString();
  engine.store.saveBundle(bundle);
  const post = engine.store.getPost(bundle.child_ids?.[key]);
  if (post && ["draft", "approved"].includes(post.status)) {
    post.caption = withBanner;
    post.description = withBanner;
    if (title) post.title = String(title).slice(0, 100);
    post.updated_at = bundle.updated_at;
    engine.store.savePost(post);
  }
  return { bundle: engine.store.getBundle(bundle.id), post: engine.store.getPost(bundle.child_ids?.[key]) };
}

export function requestPilotChanges(engine, { bundle_id, post_id, note } = {}) {
  if (!bundle_id && post_id) {
    const post = engine.store.getPost(post_id);
    if (!post || post.bundle_id) throw mcpError("not_found", "Draft not found.", 404);
    if (!["draft", "approved"].includes(post.status)) throw mcpError("invalid_status", "That draft can no longer change.", 409);
    post.change_request = String(note || "").slice(0, 2000);
    post.status = "draft";
    post.queue_label = "";
    post.updated_at = new Date().toISOString();
    engine.store.savePost(post);
    return { post: engine.store.getPost(post.id), queued: false };
  }
  const bundle = engine.store.getBundle(bundle_id);
  if (!bundle) throw mcpError("not_found", "Draft not found.", 404);
  bundle.change_request = String(note || "").slice(0, 2000);
  bundle.status = "draft";
  bundle.updated_at = new Date().toISOString();
  engine.store.saveBundle(bundle);
  for (const id of Object.values(bundle.child_ids || {})) {
    const post = engine.store.getPost(id);
    if (!post || !["draft", "approved"].includes(post.status)) continue;
    post.status = "draft";
    post.change_request = bundle.change_request;
    post.updated_at = bundle.updated_at;
    engine.store.savePost(post);
  }
  return { bundle: engine.store.getBundle(bundle.id), queued: false };
}

function assertApprovable(captions) {
  if (containsBannedPromise(captions.filter(Boolean).join("\n"))) {
    throw mcpError("pilot_compliance", "This draft promises a rate, savings, or subsidy. Edit it before approving.", 400);
  }
}

export function queueApproved(engine, { bundle_id, post_id } = {}) {
  const stamp = new Date().toISOString();
  if (bundle_id) {
    const bundle = engine.store.getBundle(bundle_id);
    if (!bundle) throw mcpError("not_found", "Draft not found.", 404);
    if (!["draft", "approved"].includes(bundle.status)) {
      throw mcpError("invalid_status", "That draft can no longer be approved.", 409);
    }
    assertApprovable([bundle.caption, ...Object.values(bundle.child_ids || {}).map((id) => engine.store.getPost(id)?.caption)]);
    bundle.status = "approved";
    bundle.queue_label = WAITING;
    bundle.scheduled_at = null;
    bundle.updated_at = stamp;
    engine.store.saveBundle(bundle);
    const posts = [];
    for (const id of Object.values(bundle.child_ids || {})) {
      const post = engine.store.getPost(id);
      if (!post || !["draft", "approved", "failed"].includes(post.status)) continue;
      post.status = "approved";
      post.queue_label = WAITING;
      post.scheduled_at = null;
      post.updated_at = stamp;
      engine.store.savePost(post);
      posts.push(engine.store.getPost(post.id));
    }
    engine.store.appendAudit({
      id: engine.store.newId("aud"),
      at: stamp,
      action: "approved_waiting",
      profile_id: bundle.profile_id,
      post_id: bundle.id,
      detail: WAITING,
    });
    return { bundle: engine.store.getBundle(bundle.id), posts, queued: true, queue_label: WAITING, publishers_called: 0 };
  }
  const post = engine.store.getPost(post_id);
  if (!post) throw mcpError("not_found", "Post not found.", 404);
  if (!["draft", "approved", "failed"].includes(post.status)) {
    throw mcpError("invalid_status", "That draft can no longer be approved.", 409);
  }
  assertApprovable([post.caption]);
  post.status = "approved";
  post.queue_label = WAITING;
  post.scheduled_at = null;
  post.updated_at = stamp;
  engine.store.savePost(post);
  engine.store.appendAudit({
    id: engine.store.newId("aud"),
    at: stamp,
    action: "approved_waiting",
    profile_id: post.profile_id,
    post_id: post.id,
    detail: WAITING,
  });
  return { post: engine.store.getPost(post.id), queued: true, queue_label: WAITING, publishers_called: 0 };
}

export function pilotQueue(engine) {
  const items = [];
  const banner = pilotBanner(engine);
  // Every open draft shows here: goal-based bundles, bundles made over MCP or the CLI, and single posts.
  for (const bundle of engine.store.listBundles()) {
    if (!["draft", "approved"].includes(bundle.status)) continue;
    const networks = (bundle.platforms || []).map((platform) => {
      const post = engine.store.getPost(bundle.child_ids?.[platform]);
      return {
        platform,
        label: NETWORK_LABELS[platform] || platform,
        post_id: post?.id || "",
        title: post?.title || bundle.overrides?.[platform]?.title || bundle.title || "",
        caption: post?.caption || bundle.overrides?.[platform]?.caption || bundle.caption || "",
        status: post?.status || bundle.status,
        edited: Boolean(bundle.edited?.[platform]),
      };
    });
    items.push({
      kind: "bundle",
      id: bundle.id,
      title: bundle.title,
      status: bundle.status,
      queue_label: bundle.status === "approved" ? WAITING : "Draft",
      source: bundle.pilot ? "topic" : bundle.source || "mcp",
      can_regenerate: Boolean(bundle.pilot),
      goal_label: bundle.pilot?.goal_label || "",
      topic_title: bundle.pilot?.topic_title || "",
      compliance_banner: bundle.pilot?.compliance_banner || banner,
      call_to_action: bundle.pilot?.call_to_action || "",
      change_request: bundle.change_request || "",
      caption_provider: bundle.caption_provenance?.provider || bundle.pilot?.caption_provider || "",
      networks,
      updated_at: bundle.updated_at,
    });
  }
  for (const post of engine.store.listPosts()) {
    if (post.bundle_id) continue;
    if (!["draft", "approved"].includes(post.status)) continue;
    items.push({
      kind: "post",
      id: post.id,
      title: post.title || "Draft",
      status: post.status,
      queue_label: post.status === "approved" ? WAITING : "Draft",
      source: post.source || "mcp",
      can_regenerate: false,
      goal_label: "",
      topic_title: "",
      compliance_banner: banner,
      call_to_action: "",
      change_request: post.change_request || "",
      caption_provider: post.caption_provenance?.provider || "",
      networks: [
        {
          platform: post.platform,
          label: NETWORK_LABELS[post.platform] || post.platform,
          post_id: post.id,
          title: post.title || "",
          caption: post.caption || "",
          status: post.status,
          edited: Boolean(post.edited),
        },
      ],
      updated_at: post.updated_at,
    });
  }
  return items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export function pilotDeskView(engine) {
  let config = null;
  try {
    config = loadPilot(engine.store.homePaths);
  } catch {
    config = null;
  }
  return {
    ready: Boolean(config),
    niche: config?.niche || "",
    campaign: config?.campaign || null,
    campaign_label: config ? campaignLabel(config) : "",
    compliance_banner: config?.compliance_banner || "",
    compliance_notes: config?.compliance_notes || "",
    goals: (config?.goals || []).map((goal) => ({
      id: goal.id,
      label: goal.label,
      call_to_action: goal.call_to_action,
      topics: (goal.topics || []).map((topic) => ({ id: topic.id, title: topic.title, angle: topic.angle })),
    })),
    queue: pilotQueue(engine),
  };
}

export function exportApproved(engine, format) {
  const rows = approvedRows(engine.store).filter((row) => row.status.startsWith("approved"));
  if (format === "csv") return { type: "text/csv; charset=utf-8", filename: "postpath-approved.csv", body: captionsCsv(rows) };
  if (format === "zip") {
    return {
      type: "application/zip",
      filename: "postpath-approved.zip",
      body: captionsZip(rows, engine.store.homePaths.mediaDir),
    };
  }
  return { type: "text/plain; charset=utf-8", filename: "postpath-approved.txt", body: captionsText(rows) };
}
