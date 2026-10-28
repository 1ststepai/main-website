import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DRAFT_FIELD_LIMITS,
  PLATFORM_TEXT_LIMITS,
  validateDraftForPublish,
} from "../src/publish/validate.js";

test("rejects missing or unknown platform", () => {
  assert.equal(validateDraftForPublish(null).ok, false);
  assert.match(validateDraftForPublish({}).errors.join(" "), /platform is required/i);
  const unknown = validateDraftForPublish({ platform: "myspace", caption: "hi" });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join(" "), /Unknown platform/i);
});

test("x: requires text and warns over ~280", () => {
  const empty = validateDraftForPublish({ platform: "x" });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(" "), /caption or description/i);

  const ok = validateDraftForPublish({ platform: "x", caption: "hello from postpath" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);

  const warned = validateDraftForPublish({
    platform: "x",
    caption: "x".repeat(PLATFORM_TEXT_LIMITS.x + 1),
  });
  assert.equal(warned.ok, true);
  assert.match(warned.warnings.join(" "), /280/);
});

test("linkedin / bluesky / google_business: require text and warn on platform caps", () => {
  for (const platform of ["linkedin", "bluesky", "google_business"]) {
    const empty = validateDraftForPublish({ platform });
    assert.equal(empty.ok, false, platform);
    assert.match(empty.errors.join(" "), /caption or description/i);
  }

  assert.equal(validateDraftForPublish({ platform: "linkedin", caption: "ops update" }).ok, true);
  assert.equal(validateDraftForPublish({ platform: "bluesky", caption: "short" }).ok, true);
  assert.equal(validateDraftForPublish({ platform: "google_business", caption: "open late" }).ok, true);

  const linkedinWarn = validateDraftForPublish({
    platform: "linkedin",
    caption: "L".repeat(PLATFORM_TEXT_LIMITS.linkedin + 1),
  });
  assert.equal(linkedinWarn.ok, true);
  assert.match(linkedinWarn.warnings.join(" "), /3000/);

  const blueskyWarn = validateDraftForPublish({
    platform: "bluesky",
    caption: "b".repeat(PLATFORM_TEXT_LIMITS.bluesky + 1),
  });
  assert.equal(blueskyWarn.ok, true);
  assert.match(blueskyWarn.warnings.join(" "), /300/);

  const gbpWarn = validateDraftForPublish({
    platform: "google_business",
    caption: "g".repeat(PLATFORM_TEXT_LIMITS.google_business + 1),
  });
  assert.equal(gbpWarn.ok, true);
  assert.match(gbpWarn.warnings.join(" "), /1500/);
});

test("threads: text and/or https media_url; warns over 500", () => {
  const empty = validateDraftForPublish({ platform: "threads" });
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join(" "), /caption text and\/or media_url/i);

  assert.equal(validateDraftForPublish({ platform: "threads", caption: "hello" }).ok, true);
  assert.equal(
    validateDraftForPublish({
      platform: "threads",
      media_url: "https://cdn.example.com/a.jpg",
    }).ok,
    true,
  );

  const badUrl = validateDraftForPublish({
    platform: "threads",
    media_url: "http://cdn.example.com/a.jpg",
  });
  assert.equal(badUrl.ok, false);
  assert.match(badUrl.errors.join(" "), /https media_url/i);

  const warned = validateDraftForPublish({
    platform: "threads",
    caption: "t".repeat(PLATFORM_TEXT_LIMITS.threads + 1),
  });
  assert.equal(warned.ok, true);
  assert.match(warned.warnings.join(" "), /500/);
});

test("youtube / tiktok: require media_path", () => {
  for (const platform of ["youtube", "tiktok"]) {
    const missing = validateDraftForPublish({ platform, caption: "clip" });
    assert.equal(missing.ok, false, platform);
    assert.match(missing.errors.join(" "), /media_path/i);
  }

  assert.equal(
    validateDraftForPublish({ platform: "youtube", media_path: "clip.mp4", title: "Demo" }).ok,
    true,
  );
  assert.equal(
    validateDraftForPublish({ platform: "tiktok", media_path: "clip.mp4" }).ok,
    true,
  );
});

test("instagram / facebook accept a local file; pinterest still needs https", () => {
  for (const platform of ["instagram", "facebook", "pinterest"]) {
    const missing = validateDraftForPublish({ platform, caption: "hi" });
    assert.equal(missing.ok, false, platform);
    assert.match(missing.errors.join(" "), /https media_url|media_path/i);

    const http = validateDraftForPublish({
      platform,
      media_url: "http://cdn.example.com/v.mp4",
    });
    assert.equal(http.ok, false, platform);
  }

  const instagram = validateDraftForPublish({
    platform: "instagram",
    media_url: "https://cdn.example.com/v.mp4",
    caption: "hi",
    privacy_status: "public",
  });
  assert.equal(instagram.ok, true);
  const instagramFile = validateDraftForPublish({
    platform: "instagram",
    media_path: "clip.mp4",
    privacy_status: "public",
  });
  assert.equal(instagramFile.ok, true);
  const instagramPrivate = validateDraftForPublish({
    platform: "instagram",
    media_path: "clip.mp4",
    privacy_status: "private",
  });
  assert.equal(instagramPrivate.ok, false);
  assert.match(instagramPrivate.errors.join(" "), /public/i);

  const facebook = validateDraftForPublish({
    platform: "facebook",
    media_path: "clip.mp4",
    privacy_status: "private",
  });
  assert.equal(facebook.ok, true);
  const facebookUrl = validateDraftForPublish({
    platform: "facebook",
    media_url: "https://cdn.example.com/v.mp4",
    caption: "hi",
  });
  assert.equal(facebookUrl.ok, true);

  const pinterest = validateDraftForPublish({
    platform: "pinterest",
    media_url: "https://cdn.example.com/v.mp4",
    caption: "hi",
  });
  assert.equal(pinterest.ok, true);

  const pinWarn = validateDraftForPublish({
    platform: "pinterest",
    media_url: "https://cdn.example.com/pin.jpg",
    description: "d".repeat(PLATFORM_TEXT_LIMITS.pinterest + 1),
  });
  assert.equal(pinWarn.ok, true);
  assert.match(pinWarn.warnings.join(" "), /800/);
});

test("reddit: require tags[0] subreddit and title", () => {
  const noSub = validateDraftForPublish({ platform: "reddit", title: "Hello" });
  assert.equal(noSub.ok, false);
  assert.match(noSub.errors.join(" "), /tags\[0\].*subreddit/i);

  const noTitle = validateDraftForPublish({ platform: "reddit", tags: ["localbiz"] });
  assert.equal(noTitle.ok, false);
  assert.match(noTitle.errors.join(" "), /title/i);

  const ok = validateDraftForPublish({
    platform: "reddit",
    tags: ["r/localbiz"],
    title: "Weekly tips",
    description: "body",
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.errors, []);
});

test("snapchat / whatsapp: hard API-restricted errors", () => {
  const snap = validateDraftForPublish({ platform: "snapchat", caption: "hi" });
  assert.equal(snap.ok, false);
  assert.match(snap.errors.join(" "), /Marketing API/i);

  const wa = validateDraftForPublish({ platform: "whatsapp", caption: "hi" });
  assert.equal(wa.ok, false);
  assert.match(wa.errors.join(" "), /third-party publish API/i);
});

test("warnings vs errors: over draft caption ceiling still ok when platform allows publish", () => {
  const result = validateDraftForPublish({
    platform: "linkedin",
    caption: "c".repeat(DRAFT_FIELD_LIMITS.caption + 1),
  });
  // LinkedIn publish cap is 3000; draft caption ceiling warning fires, no hard error.
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings.join(" "), /2200/);
});
