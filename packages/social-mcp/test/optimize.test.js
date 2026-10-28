import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_FIELD_LIMITS as sourceDraft, PLATFORM_TEXT_LIMITS as sourceLimits } from "../src/publish/validate.js";
import { DRAFT_FIELD_LIMITS, PLATFORM_TEXT_LIMITS } from "../src/desk/public/limits.js";
import { checkNetwork, readMp4Meta } from "../src/desk/public/optimize.js";

function mp4({ width, height, duration, timescale = 1000 }) {
  function box(type, payload) {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length);
    header.write(type, 4, "ascii");
    return Buffer.concat([header, payload]);
  }
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(duration, 16);
  const tkhd = Buffer.alloc(92);
  tkhd.writeUInt32BE(Math.round(width * 65536), 76);
  tkhd.writeUInt32BE(Math.round(height * 65536), 80);
  return Buffer.concat([box("ftyp", Buffer.from("mp42")), box("moov", Buffer.concat([box("mvhd", mvhd), box("trak", box("tkhd", tkhd))]))]);
}

test("desk limits match publish validation", () => {
  assert.deepEqual(PLATFORM_TEXT_LIMITS, sourceLimits);
  assert.deepEqual(DRAFT_FIELD_LIMITS, sourceDraft);
});

test("hashtag checks are rules only where a platform page states a limit", () => {
  const instagram = checkNetwork({
    platform: "instagram",
    post: { caption: "Hello #one #two #three #four #five #six" },
  });
  assert.ok(instagram.some((item) => item.kind === "rule" && /5 tags/.test(item.message)));
  const linkedin = checkNetwork({
    platform: "linkedin",
    post: { caption: "Hello #one #two #three #four #five #six" },
  });
  assert.ok(linkedin.some((item) => item.kind === "tip"));
  assert.equal(linkedin.some((item) => item.kind === "rule" && /hashtag/i.test(item.message)), false);
  const x = checkNetwork({ platform: "x", post: { caption: "Hello #one" } });
  assert.ok(x.some((item) => item.kind === "tip" && /280/.test(item.message)));
});

test("YouTube Shorts shape comes from the local file when it can be read", () => {
  const fit = checkNetwork({
    platform: "youtube",
    post: { title: "Desk", description: "Words" },
    media: readMp4Meta(mp4({ width: 1080, height: 1920, duration: 90000 })),
  });
  assert.ok(fit.some((item) => item.kind === "ok"));
  const wide = checkNetwork({
    platform: "youtube",
    post: { title: "Desk", description: "Words" },
    media: readMp4Meta(mp4({ width: 1920, height: 1080, duration: 200000 })),
  });
  assert.ok(wide.some((item) => item.kind === "rule" && /wider/i.test(item.message)));
  assert.ok(wide.some((item) => item.kind === "rule" && /3 minutes/.test(item.message)));
});
