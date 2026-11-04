import test from "node:test";
import assert from "node:assert/strict";
import { exchangeCode, oauthConfig } from "../src/oauth/providers.js";

const res = (status, body) => ({ ok: status < 300, status, headers: { get: () => "" }, text: async () => JSON.stringify(body) });
const PAGES = [
  { id: "111", name: "Swing Trade Pros", access_token: "PAGE_TOKEN_111", instagram_business_account: { id: "ig111", username: "swing" } },
  { id: "222", name: "Crypto Hacks", access_token: "PAGE_TOKEN_222", instagram_business_account: { id: "ig222", username: "crypto" } },
];
const metaLogin = async (url) => {
  const href = String(url);
  if (href.includes("/oauth/access_token")) return res(200, { access_token: "USER_TOKEN_SAME_LOGIN", expires_in: 5184000 });
  if (href.includes("/me/accounts")) return res(200, { data: PAGES });
  throw new Error(`unexpected ${href}`);
};
const config = oauthConfig({ META_APP_ID: "app", META_APP_SECRET: "sec" }, "http://127.0.0.1:1/cb");

test("two profiles on different Pages from one Meta login never share Page tokens", async () => {
  const a = await exchangeCode("meta", { code: "c", config, fetchImpl: metaLogin, pagePreference: "111" });
  const b = await exchangeCode("meta", { code: "c", config, fetchImpl: metaLogin, pagePreference: "Crypto Hacks" });
  assert.equal(a.platforms.facebook.record.page_id, "111");
  assert.equal(b.platforms.facebook.record.page_id, "222");
  assert.equal(a.platforms.facebook.secrets.page_access_token, "PAGE_TOKEN_111");
  assert.equal(b.platforms.facebook.secrets.page_access_token, "PAGE_TOKEN_222");
  assert.equal(a.platforms.instagram.record.instagram_id, "ig111");
  assert.equal(b.platforms.instagram.record.instagram_id, "ig222");
  const aBlob = JSON.stringify(a);
  const bBlob = JSON.stringify(b);
  assert.ok(!aBlob.includes("PAGE_TOKEN_222") && !aBlob.includes('"222"'));
  assert.ok(!bBlob.includes("PAGE_TOKEN_111") && !bBlob.includes('"111"'));
  // Instagram rides on its own Page's token, not the other profile's.
  assert.equal(a.platforms.instagram.secrets.page_access_token, "PAGE_TOKEN_111");
  assert.equal(b.platforms.instagram.secrets.page_access_token, "PAGE_TOKEN_222");
});

test("a profile whose Page is missing from the login fails instead of borrowing another Page", async () => {
  await assert.rejects(exchangeCode("meta", { code: "c", config, fetchImpl: metaLogin, pagePreference: "333" }), (e) => e.code === "page_not_found");
});
