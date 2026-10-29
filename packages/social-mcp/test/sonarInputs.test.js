import assert from "node:assert/strict";
import { test } from "node:test";
import { deskUrl, DESK_ROUTES } from "../src/desk/public/deskApi.js";
import { safeFfmpegBinary, assertThumbnailPath, THUMBNAIL_ARGS } from "../src/score/score.js";

const ORIGIN = "http://127.0.0.1:47840";

test("desk URLs come only from the route allowlist, pinned to the desk origin", () => {
  assert.equal(deskUrl("status", {}, ORIGIN), `${ORIGIN}/api/status`);
  assert.equal(deskUrl("manage", { profile_id: "acme_co-2" }, ORIGIN), `${ORIGIN}/api/manage?profile_id=acme_co-2`);
  assert.equal(deskUrl("manage", { profile_id: "" }, ORIGIN), `${ORIGIN}/api/manage`);
  assert.equal(deskUrl("recordingsVideo", { id: "rec_1a" }, ORIGIN), `${ORIGIN}/api/recordings/video?id=rec_1a`);
  assert.throws(() => deskUrl("recordingsVideo", { id: "x/../y" }, ORIGIN), /Invalid query value/);
  for (const href of Object.values(DESK_ROUTES)) assert.match(href, /^\/api\/[a-z/-]+$/);
  assert.throws(() => deskUrl("https://evil.example/api", {}, ORIGIN), /Unknown desk route/);
  assert.throws(() => deskUrl("/api/status", {}, ORIGIN), /Unknown desk route/);
  assert.throws(() => deskUrl("__proto__", {}, ORIGIN), /Unknown desk route/);
  assert.throws(() => deskUrl("manage", { profile_id: "a&b=c" }, ORIGIN), /Invalid query value/);
  assert.throws(() => deskUrl("manage", { profile_id: "../x" }, ORIGIN), /Invalid query value/);
  assert.throws(() => deskUrl("manage", { redirect: "x" }, ORIGIN), /Unknown query parameter/);
  assert.throws(() => deskUrl("status", { profile_id: "acme" }, ORIGIN), /Unknown query parameter/);
});

test("ffmpeg runs only as ffmpeg, with fixed args and a file: input", () => {
  assert.equal(safeFfmpegBinary(), "ffmpeg");
  for (const bad of ["sh", "/bin/sh", "/usr/bin/ffmpeg", "ffmpeg; rm -rf /", "./ffmpeg", "/tmp/ffmpeg-evil", "-i"]) {
    assert.throws(() => safeFfmpegBinary(bad), /not allowed/);
  }
  assert.ok(Object.isFrozen(THUMBNAIL_ARGS));
  assert.equal(THUMBNAIL_ARGS[THUMBNAIL_ARGS.indexOf("-i") + 1], "pipe:0", "image goes in on stdin, never on argv");
  assert.equal(assertThumbnailPath("/home/u/media/thumb.png"), "/home/u/media/thumb.png");
  for (const bad of ["-y", "thumb.png", "/m/x.sh", "/m/a.png\0b", "concat:/a.png|/b.png", "http://x/a.png"]) {
    assert.throws(() => assertThumbnailPath(bad), /not allowed/);
  }
});
