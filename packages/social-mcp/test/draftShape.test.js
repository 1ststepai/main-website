import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { draftShape } from "../src/mcp/server.js";

test("create_draft keeps per-network hashtags, captions, and a Reddit community", () => {
  const parsed = z.object(draftShape).parse({
    profile_id: "acme",
    platforms: ["youtube", "linkedin", "reddit"],
    overrides: {
      youtube: { hashtags: ["Shorts"], tags: ["shortform"] },
      linkedin: { caption: "LI only" },
      reddit: { subreddit: "news" },
      not_a_network: { caption: "nope" },
    },
  });
  assert.deepEqual(parsed.overrides.youtube.hashtags, ["Shorts"]);
  assert.deepEqual(parsed.overrides.youtube.tags, ["shortform"]);
  assert.equal(parsed.overrides.linkedin.caption, "LI only");
  assert.equal(parsed.overrides.reddit.subreddit, "news");
  assert.equal(parsed.overrides.not_a_network, undefined);
});
