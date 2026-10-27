import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const exists = async (path) => {
  try {
    await access(new URL(path, root), constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

test("PostPath marketing page carries product identity and conversion hooks", async () => {
  const html = await source("postpath/index.html");
  assert.match(html, /rel="canonical" href="https:\/\/postpath\.1ststep\.ai\/"/);
  assert.match(html, /PostPath/);
  assert.match(html, /1stStep\.ai/);
  assert.match(html, /Any AI can post/);
  assert.match(html, /Request early access/);
  assert.match(html, /id="demo"/);
  assert.match(html, />Simulated</);
  assert.match(html, /Simulated demo/);
  assert.match(html, /mailto:evan@1ststep\.ai/);
  assert.match(html, /action="mailto:evan@1ststep\.ai"/);
  assert.match(html, /data-fsai-event="postpath_early_access_click"/);
  assert.match(html, /assets\/postpath\/postpath-mark-3d\.png|assets\/postpath\/postpath-mark\.svg/);
  assert.match(html, /postpath-hero-banner\.png/);
  assert.match(html, /name="twitter:title"/);
  assert.match(html, /name="twitter:description"/);
  assert.match(html, /Real-account publishing acceptance is not claimed/);
  assert.match(html, /Inbox handoff/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /FAQPage/);
  assert.doesNotMatch(html, /Download for Mac/);
  assert.doesNotMatch(html, /LIVE DEMO/);
  assert.doesNotMatch(html, /\.zip|\/downloads\/postpath\//);
  assert.doesNotMatch(html, /developer preview/i);
  assert.doesNotMatch(html, /snapchat\.svg|whatsapp\.svg/);
  assert.doesNotMatch(html, /epancis12@gmail\.com/);
  assert.doesNotMatch(html, /guaranteed revenue|fake review|#1 social tool/i);
  for (const name of ["X", "LinkedIn", "Bluesky", "YouTube", "Instagram", "Facebook", "TikTok", "Reddit", "Google Business", "Threads", "Pinterest"]) {
    assert.match(html, new RegExp(name));
  }
  assert.doesNotMatch(html, /Snapchat[\s\S]{0,80}publish/i);
  assert.doesNotMatch(html, /WhatsApp[\s\S]{0,80}publish/i);
  assert.match(html, /Snapchat/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /id="restricted"/);
  const crmStart = html.indexOf('id="crm"');
  const crm = html.slice(crmStart, html.indexOf("</section>", crmStart));
  for (const name of ["HubSpot", "Salesforce", "GoHighLevel", "Pipedrive", "Planned"]) {
    assert.match(crm, new RegExp(name));
  }
  assert.doesNotMatch(crm, /\b(live|shipping|connected)\b/i);
  assert.doesNotMatch(crm, /hubspot\.svg|salesforce\.svg|pipedrive\.svg|gohighlevel\.svg/i);
});

test("early access email is tracked without personal fields, and PostPath is linked from the parent site", async () => {
  const page = await source("postpath/index.html");
  const script = await source("postpath/postpath.js");
  const home = await source("index.html");
  const work = await source("work/index.html");
  const tools = await source("tools/index.html");
  const analytics = await source("src/site-analytics.js");
  assert.match(script, /mailto:evan@1ststep\.ai/);
  assert.match(script, /fsaiTrack\("postpath_early_access_click", \{ placement: "access_form" \}\)/);
  assert.doesNotMatch(script, /fsaiTrack\([\s\S]*email/);
  assert.match(analytics, /dataset\.fsaiEvent/);
  assert.doesNotMatch(analytics, /email:/);
  const heroStart = home.indexOf('<section class="hero');
  const hero = home.slice(heroStart, home.indexOf("</section>", heroStart));
  assert.doesNotMatch(hero, /postpath/i);
  assert.match(home, /Begin Your Journey/);
  assert.match(home, /Book a free 20-min call|Book a call/);
  const spot = home.slice(home.indexOf('id="postpath"'), home.indexOf('id="pricing"'));
  for (const step of ["Connect", "Draft", "Review", "Schedule"]) assert.match(spot, new RegExp(step));
  assert.match(spot, /data-fsai-event="postpath_nav_click"/);
  assert.match(spot, /HubSpot/);
  assert.match(spot, /Salesforce/);
  assert.match(spot, /GoHighLevel/);
  assert.match(spot, /Pipedrive/);
  assert.doesNotMatch(spot, /\$\d|%|\btestimonial\b/i);
  assert.doesNotMatch(spot, /snapchat\.svg|whatsapp\.svg/);
  assert.match(home, /<nav aria-label="Primary">[\s\S]*data-fsai-event="postpath_nav_click"[\s\S]*PostPath<\/a>/);
  assert.match(home, /<nav aria-label="Footer"[\s\S]*href="\/postpath\/"/);
  assert.match(work, /class="piece piece-postpath"/);
  assert.match(work, /href="\/postpath\/"/);
  assert.match(work, /data-fsai-event="postpath_nav_click"/);
  assert.match(tools, /Early access/);
  assert.match(tools, /href="\/postpath\/"/);
  assert.match(tools, /data-fsai-event="postpath_nav_click"/);
  assert.match(page, /data-fsai-event="postpath_early_access_click"/);
  assert.equal((work.match(/class="piece"/g) || []).length, 5);
});

test("PostPath logo assets exist", async () => {
  assert.equal(await exists("public/assets/postpath/postpath-mark.svg"), true);
  assert.equal(await exists("public/assets/postpath/postpath-mark-on-dark.svg"), true);
  assert.equal(await exists("public/assets/postpath/postpath-lockup.svg"), true);
  assert.equal(await exists("public/assets/postpath/postpath-mark-3d.png"), true);
  assert.equal(await exists("public/assets/postpath/postpath-hero-banner.png"), true);
  assert.equal(await exists("public/assets/postpath/postpath-brand-board.png"), true);
  const mark = await source("public/assets/postpath/postpath-mark.svg");
  assert.match(mark, /#3b82f6|#8b5cf6/i);
  assert.match(mark, /PostPath/);
});

test("Vercel maps postpath host and www path", async () => {
  const vercel = JSON.parse(await source("vercel.json"));
  const rewrites = vercel.rewrites.map((row) => JSON.stringify(row));
  const redirects = (vercel.redirects || []).map((row) => JSON.stringify(row));
  assert.ok(
    redirects.some((row) => row.includes("postpath.1ststep.ai") && row.includes("/postpath/")),
    "host root should redirect to /postpath/ before filesystem index.html",
  );
  assert.ok(rewrites.some((row) => row.includes("postpath.1ststep.ai") && row.includes("/postpath")));
  assert.ok(rewrites.some((row) => row.includes('"/postpath/"')));
});
