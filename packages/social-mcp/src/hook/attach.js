import { mcpError } from "../errors.js";
import { PLATFORM_TEXT_LIMITS, DRAFT_FIELD_LIMITS } from "../publish/validate.js";
import { fitText } from "../seo/terms.js";

function limitFor(platform) {
  return PLATFORM_TEXT_LIMITS[platform] || DRAFT_FIELD_LIMITS.caption;
}

function leadCaption(spoken, current, platform) {
  const line = String(spoken || "").trim();
  const rest = String(current || "").trim();
  if (!line) return rest;
  if (rest.startsWith(line)) return fitText(rest, limitFor(platform));
  return fitText(rest ? `${line}\n\n${rest}` : line, limitFor(platform));
}

export function attachHook(ctx, { draft_id, hook, topic }) {
  const id = String(draft_id || "");
  const bundle = ctx.store.getBundle(id) || (ctx.store.getPost(id)?.bundle_id ? ctx.store.getBundle(ctx.store.getPost(id).bundle_id) : null);
  const post = bundle ? null : ctx.store.getPost(id);
  if (!bundle && !post) throw mcpError("not_found", "Draft not found.", 404);
  const stamp = new Date(ctx.now()).toISOString();
  const saved = {
    spoken: hook.spoken,
    on_screen_text: hook.on_screen_text,
    shot: hook.shot,
    beats: hook.beats,
    why: hook.why,
    borrowed_from: hook.borrowed_from || [],
    attached_at: stamp,
  };
  const prompt = fitText(`Opening, 0 to 10 seconds. ${hook.shot} On-screen: ${hook.on_screen_text}`, 2000);
  if (bundle) {
    bundle.hook = saved;
    bundle.on_camera_script = hook.spoken;
    bundle.hook_media_prompt = prompt;
    if (bundle.media_request && bundle.media_status !== "generating") {
      bundle.media_request = { ...bundle.media_request, prompt };
    }
    bundle.caption = leadCaption(hook.spoken, bundle.caption, "instagram");
    bundle.seo = { ...(bundle.seo || {}), topic: topic || bundle.seo?.topic || "", on_screen: { ...(bundle.seo?.on_screen || {}), hook: hook.on_screen_text } };
    bundle.updated_at = stamp;
    ctx.store.saveBundle(bundle);
    for (const [platform, postId] of Object.entries(bundle.child_ids || {})) {
      const child = ctx.store.getPost(postId);
      if (!child) continue;
      child.caption = leadCaption(hook.spoken, child.caption, platform);
      child.description = leadCaption(hook.spoken, child.description, platform === "youtube" ? "youtube" : platform);
      child.hook = saved;
      child.on_camera_script = hook.spoken;
      child.updated_at = stamp;
      ctx.store.savePost(child);
    }
    return { draft_id: bundle.id, hook: saved, media_prompt: prompt, auto_approve: false };
  }
  post.hook = saved;
  post.on_camera_script = hook.spoken;
  post.hook_media_prompt = prompt;
  post.caption = leadCaption(hook.spoken, post.caption, post.platform);
  post.description = leadCaption(hook.spoken, post.description, post.platform);
  if (post.media_request && post.media_status !== "generating") post.media_request = { ...post.media_request, prompt };
  post.updated_at = stamp;
  ctx.store.savePost(post);
  return { draft_id: post.id, hook: saved, media_prompt: prompt, auto_approve: false };
}

export function annotateHook(store, item) {
  const record = item.kind === "bundle" ? store.getBundle(item.id) : store.getPost(item.id);
  if (!record?.hook?.spoken) return item;
  return {
    ...item,
    hook: {
      spoken: record.hook.spoken,
      on_screen_text: record.hook.on_screen_text,
      borrowed_from: record.hook.borrowed_from || [],
    },
  };
}
