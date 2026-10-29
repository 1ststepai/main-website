import test from "node:test";
import assert from "node:assert/strict";
import { refreshAccess, YOUTUBE_REAUTH_MESSAGE } from "../src/publish/youtube.js";
import { reconnectMessage } from "../src/desk/public/guide.js";

const oauth = { clientId: "id", clientSecret: "sec" };

test("Google Testing-mode 7-day expiry (invalid_grant) gives a clear reconnect error", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, headers: { get: () => "" }, text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }) });
  await assert.rejects(refreshAccess({ secrets: { refresh_token: "old" }, oauth, fetchImpl }), (e) => {
    assert.equal(e.code, "invalid_grant");
    assert.equal(e.revoked, true);
    assert.match(e.message, /7 days/);
    assert.match(e.message, /Testing/);
    assert.match(e.message, /Reconnect YouTube/);
    assert.ok(!e.message.includes("old"));
    return true;
  });
  assert.equal(YOUTUBE_REAUTH_MESSAGE.includes("In production"), true);
});

test("desk reconnect text for an expired YouTube connection", () => {
  assert.match(reconnectMessage("youtube"), /7 days.*Testing/);
  assert.match(reconnectMessage("linkedin"), /Connect this account again/);
});
