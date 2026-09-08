import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/admin/main.jsx", import.meta.url), "utf8");

test("expired protected admin requests return the UI to owner verification", () => {
  assert.match(source, /response\.status === 401 && path !== "\/api\/admin-session"/);
  assert.match(source, /dispatchEvent\(new Event\(ADMIN_SESSION_EXPIRED_EVENT\)\)/);
  assert.match(source, /addEventListener\(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired\)/);
  assert.match(source, /handleSessionExpired = \(\) => \{[\s\S]*setAuthenticated\(false\)/);
});

test("invalid owner credentials remain an inline login error", () => {
  assert.match(source, /path !== "\/api\/admin-session"/);
  assert.match(source, /error\.code === "invalid_credentials"/);
});
