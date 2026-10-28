import assert from "node:assert/strict";
import { test } from "node:test";
import { DRAFT_FIELD_LIMITS as sourceDraft, PLATFORM_TEXT_LIMITS as source } from "../src/publish/validate.js";
import { DRAFT_FIELD_LIMITS, PLATFORM_TEXT_LIMITS } from "../src/desk/public/limits.js";

test("desk length hints match the publish limits", () => {
  assert.deepEqual(PLATFORM_TEXT_LIMITS, source);
  assert.deepEqual(DRAFT_FIELD_LIMITS, sourceDraft);
});
