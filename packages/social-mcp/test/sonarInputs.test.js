import assert from "node:assert/strict";
import { test } from "node:test";
import { deskUrl, DESK_ROUTES, profileBody, cleanBrandId } from "../src/desk/public/deskApi.js";
import { readFileSync } from "node:fs";
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

test("profile route body allows only a valid brand id, name and Page", () => {
  assert.deepEqual(profileBody({ id: "acme", name: " Acme ", metaPage: "Acme Page" }), { id: "acme", name: "Acme", presets: { meta_page: "Acme Page" } });
  for (const id of ["", "../x", "a b", "-x", "x".repeat(70)]) assert.throws(() => profileBody({ id, name: "A" }), /brand id/);
  assert.throws(() => profileBody({ id: "acme", name: "" }), /name/);
  assert.throws(() => profileBody({ id: "acme", name: "A", metaPage: "p".repeat(201) }), /too long/);
});

test("manage.js never passes a raw /api path to call()", () => {
  const src = readFileSync(new URL("../src/desk/public/manage.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /call\(\s*["'`]\//);
});

test("a saved brand id from browser storage is used only when well formed", () => {
  assert.equal(cleanBrandId("acme"), "acme");
  for (const bad of [null, "", "<img>", "../x", "a b", "x".repeat(70)]) assert.equal(cleanBrandId(bad), "");
});
