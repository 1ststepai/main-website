import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the homepage leads with custom builds and keeps products distinct", async () => {
  const html = await source("index.html");
  const llms = await source("public/llms.txt");
  assert.match(html, /We build it\. <em>You stay in control/);
  assert.match(html, /lead capture, CRM architecture, routing, follow-up, attribution, reporting/i);
  for (const intent of ["build_new", "finish_build", "automate_business"]) assert.match(html, new RegExp(`href="/fit-check/\\?intent=${intent}"`));
  assert.match(html, /href="\/services\/revenue-systems\.html"/);
  assert.match(html, /href="https:\/\/app\.1ststep\.ai\/"/);
  assert.match(html, /href="\/tools\/"/);
  assert.match(html, /Public concept · product flow in development|public concept/i);
  assert.match(html, /firststep-logo-transparent-cleaned\.png/);
  assert.match(llms, /1stStep OS/);
  assert.match(llms, /AI Job Agent/);
  assert.doesNotMatch(html, /A website that undersells the business|\$3,250&ndash;\$12,000/);
  assert.doesNotMatch(html, /<a\b[^>]*\bhref=(?:""|'')/i);
});

test("the commercial funnel and service links have focused destinations", async () => {
  const html = await source("index.html");
  for (const anchor of ["problems", "how", "services", "work"]) assert.match(html, new RegExp('id="' + anchor + '"'));
  for (const path of ["websites", "internal-tools", "revenue-systems", "mvp-builds"]) {
    assert.match(html, new RegExp('href="/services/' + path + '\\.html"'));
  }
  assert.match(html, /href="\/fit-check\/\?intent=build_new"/);
  assert.match(html, /href="\/fit-check\/\?intent=finish_build"/);
  assert.match(html, /href="\/fit-check\/\?intent=automate_business"/);
  assert.doesNotMatch(html, /href="\/book\/"/);
});

test("the journey gives a local diagnosis and only opens email by choice", async () => {
  const html = await source("journey/index.html");
  const script = await source("journey/journey.js");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  assert.equal((html.match(/class="step" data-step=/g) || []).length, 6);
  assert.match(html, /INITIAL FIT SIGNAL/);
  assert.match(html, /No account or AI request is created/);
  assert.match(script, /document\.createElement\('dd'\)/);
  assert.match(script, /encodeURIComponent\(emailBody\)/);
  assert.doesNotMatch(script, /fetch\(|localStorage|sessionStorage/);
  assert.match(config, /journey: "journey\/index\.html"/);
  assert.match(sitemap, /www\.1ststep\.ai\/journey\//);
});

test("the showcase includes six reachable panels and no cafe proof", async () => {
  const home = await source("index.html");
  const campaign = await source("campaigns/outgrown-website/index.html");
  const llms = await source("public/llms.txt");
  const generated = await readdir(new URL("public/generated/", root));
  const css = await source("src/home.css");
  const script = await source("src/home.js");

  for (const content of [home, campaign, llms, ...generated]) assert.doesNotMatch(content, /the.?spot|spot.?cafe/i);
  const tabIds = [...home.matchAll(/role="tab" aria-controls="(showcase-[a-z]+)"/g)].map((match) => match[1]);
  assert.equal(tabIds.length, 6);
  for (const id of tabIds) assert.match(home, new RegExp(`id="${id}" role="tabpanel"`));
  for (const project of ["Unveiling Rarities", "DaySetGo", "SwingTradePros", "Real-Rank.ai", "AI Job Agent", "1stStep OS"]) assert.ok(home.includes(project));
  assert.match(script, /ArrowRight/);
  assert.match(script, /IntersectionObserver/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("homepage metadata and assets identify the systems consultancy", async () => {
  const html = await source("index.html");
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const data = JSON.parse(jsonLd);

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/"/);
  assert.match(html, /og-home\.png/);
  assert.match(html, /<meta name="description" content="1stStep\.ai designs, builds, launches, and hands off/);
  assert.deepEqual(data["@graph"].map((item) => item["@type"]), ["Organization", "WebSite", "WebPage", "CreativeWork", "SoftwareApplication"]);
  assert.equal((await stat(new URL("public/assets/og-home.png", root))).size > 5000, true);
});

test("the website service page keeps website visitors on website-intent paths", async () => {
  const html = await source("services/websites.html");
  assert.match(html, /href="\/book\/"/);
  assert.match(html, /href="\/fit-check\/\?intent=build_new"/);
  assert.doesNotMatch(html, /href="\/app-idea-viability-checker\.html"/);
  assert.match(html, /data-fsai-page-event="website_service_view"/);
  assert.match(html, /src="\/src\/site-analytics\.js"/);
  assert.match(html, /payment (?:plan|schedule)/i);
});

test("revenue systems remains on its focused service page", async () => {
  const systems = await source("services/revenue-systems.html");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  assert.match(systems, /Revenue Systems Audit and Architecture/);
  assert.match(systems, /GHL \/ LeadConnector, Apollo/);
  assert.match(systems, /href="\/fit-check\/\?intent=automate_business"/);
  assert.match(systems, /mailto:evan@1ststep\.ai\?subject=1stStep%20System%20Audit/);
  assert.doesNotMatch(systems, /href="\/app-idea-viability-checker\.html"/);
  assert.match(config, /revenueSystems/);
  assert.match(sitemap, /services\/revenue-systems\.html/);
});

test("supporting service pages route to the matching commercial intent", async () => {
  const appBuilds = await source("services/app-builds.html");
  const internalTools = await source("services/internal-tools.html");
  const mvpBuilds = await source("services/mvp-builds.html");
  for (const html of [appBuilds, mvpBuilds]) assert.match(html, /href="\/fit-check\/\?intent=build_new"/);
  assert.match(internalTools, /href="\/fit-check\/\?intent=automate_business"/);
  for (const html of [appBuilds, internalTools, mvpBuilds]) assert.doesNotMatch(html, /href="\/app-idea-viability-checker\.html"/);
});

test("the exhaustive platform list lives on the focused website service page", async () => {
  const html = await source("services/websites.html");
  assert.match(html, /id="platform-support"/);
  assert.match(html, /id="process"/);
  assert.match(html, /WordPress/);
  assert.match(html, /HighLevel \/ LeadConnector/);
  assert.match(html, /custom HTML, React, Next\.js/);
});

test("the booking path remains and commercial intake exposes three honest paths", async () => {
  const booking = await source("book/index.html");
  const fitCheck = await source("fit-check/index.html");
  assert.match(booking, /https:\/\/api\.leadconnectorhq\.com\/widget\/booking\/Rb4aqLM1NdU5kvZcqNmj/);
  assert.match(booking, /class="calendar-shell"/);
  assert.match(booking, /Loading secure Website Strategy Call calendar/);
  assert.match(booking, /No pressure\./);
  assert.match(booking, /payment schedule/i);
  for (const intent of ["build_new", "finish_build", "automate_business"]) assert.match(fitCheck, new RegExp(`value="${intent}"`));
  assert.match(fitCheck, /approved delivery provider accepted the request/i);
  assert.match(fitCheck, /does not prove inbox delivery/i);
  assert.match(fitCheck, /keeps your answers on screen after an error/i);
});

test("commercial intake preserves intent and attribution without personal analytics", async () => {
  const intake = await source("src/commercial-intake.js");
  const analytics = await source("src/site-analytics.js");
  assert.match(intake, /params\.get\("intent"\)/);
  assert.match(intake, /window\.fsaiAttribution/);
  assert.match(intake, /Idempotency-Key/);
  assert.doesNotMatch(analytics, /email:/);
  assert.match(analytics, /commercial_intake_path_click/);
});

test("reviews are source-linked and portfolio work has the approved ownership label", async () => {
  const html = await source("index.html");
  assert.match(html, /https:\/\/maps\.app\.goo\.gl\/Xe6z1vueaEDnTa6F8/);
  assert.match(html, /https:\/\/maps\.app\.goo\.gl\/sAkN17AerGYeXzAX9/);
  assert.equal((html.match(/1stStep product\/project/g) || []).length, 6);
  assert.match(html, /do not classify any showcased project as a paid client engagement/i);
});

test("the Morris County campaign is focused, transparent, and locally qualified", async () => {
  const html = await source("campaigns/morris-county-free-website/index.html");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  assert.match(html, /first 10 qualified Morris County businesses/i);
  assert.match(html, /Design and build fee: <strong>\$0<\/strong>/);
  assert.match(html, /other third-party services/i);
  assert.match(html, /1stStep\.ai does not purchase or reimburse domains, hosting/i);
  assert.match(html, /You provide a domain you already own or purchase it directly/i);
  assert.match(html, /Submitting an application does not guarantee acceptance/i);
  assert.match(html, /name="town"/);
  assert.match(html, /name="eligibility_confirmed"/);
  assert.match(html, /name="marketing_opt_in"/);
  assert.match(html, /future local-business website tips and offers/i);
  assert.match(html, /fetch\("\/api\/morris-county-offer"/);
  assert.match(html, /data-fsai-page-event="morris_county_offer_view"/);
  assert.match(html, /morris-county-free-website-og\.png/);
  assert.doesNotMatch(html, /countdown|spots remaining/i);
  assert.match(config, /morrisCountyFreeWebsiteCampaign/);
  assert.match(sitemap, /campaigns\/morris-county-free-website/);
});

test("the Tools hub lists live builder utilities and honest in-development listings", async () => {
  const html = await source("tools/index.html");
  const home = await source("index.html");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  const vercel = await source("vercel.json");
  const readme = await source("README.md");
  assert.match(html, /Tools for your own build/);
  assert.match(html, /Open utilities for/);
  assert.match(html, /href="\/tools\/auto-model-router\/"/);
  assert.match(html, /href="\/tools\/1ststep-os-audit\/"/);
  assert.match(html, /href="\/tools\/1ststep-os\/"/);
  assert.match(html, /motion replay of the real suggest/);
  assert.match(html, /illustrative CSS flow/);
  assert.match(html, /playable motion replay/);
  assert.match(html, /https:\/\/github.com\/1ststepai\/auto-model-router/);
  assert.match(html, /https:\/\/cursor\.directory\/plugins\/auto-model-router/);
  assert.match(html, /cursor\.directory is a community listing/);
  assert.match(html, /not Cursor's official Marketplace/);
  assert.match(html, /submitted, pending review/);
  assert.match(html, /INSTALL\.md/);
  assert.doesNotMatch(html, /cursor\.com\/marketplace\/publish/);
  assert.match(html, /1stStep OS Audit/);
  assert.match(html, /Evidence over docs/);
  assert.match(html, /Zero metered API cost path/);
  assert.match(html, /does not rewrite your repo/i);
  assert.match(html, /https:\/\/github.com\/1ststepai\/1ststep-os-audit/);
  assert.match(html, /Live · local Cycle 1/);
  assert.match(html, /Cycle 1/);
  assert.match(html, /idea &rarr; profile &rarr; Project OS markdown ZIP/);
  assert.match(html, /npm install &amp;&amp; npm test &amp;&amp; npm run build &amp;&amp; npm start/);
  assert.match(html, /localhost:3000\/os/);
  assert.match(html, /Not a hosted product/);
  assert.match(html, /href="https:\/\/github.com\/1ststepai\/1ststep-os"/);
  assert.match(html, /No hosted ZIP generator/);
  assert.doesNotMatch(html, /Source available soon/);
  assert.match(html, /More coming/);
  assert.match(html, /until they exist|until it is public and usable/i);
  assert.match(html, /href="\/services\/internal-tools\.html"/);
  assert.doesNotMatch(html, /lean\.ctx|ponytail/i);
  assert.match(home, /<nav class="main-nav"[^>]*>[\s\S]*href="\/tools\/"/);
  assert.match(config, /tools: "tools\/index.html"/);
  assert.match(config, /osAudit: "tools\/1ststep-os-audit\/index.html"/);
  assert.match(config, /osFoundation: "tools\/1ststep-os\/index.html"/);
  assert.match(config, /["']\/tools["']/);
  assert.match(sitemap, /www\.1ststep\.ai\/tools\//);
  assert.match(sitemap, /www\.1ststep\.ai\/tools\/1ststep-os-audit\//);
  assert.match(sitemap, /www\.1ststep\.ai\/tools\/1ststep-os\//);
  assert.match(vercel, /"source": "\/tools"/);
  assert.match(vercel, /"source": "\/tools\/1ststep-os-audit"/);
  assert.match(vercel, /"source": "\/tools\/1ststep-os"/);
  assert.match(readme, /\/tools\//);
  assert.match(readme, /\/tools\/1ststep-os-audit\//);
  assert.match(readme, /\/tools\/1ststep-os\//);
  assert.match(await source("tools/tools-shelf.css"), /chip-primary/);
});

test("the Auto Model Router page is optional, honest, and opt-in", async () => {
  const html = await source("tools/auto-model-router/index.html");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  const readme = await source("README.md");
  assert.match(html, /Suggest a lighter/);
  assert.match(html, /confirm before it runs/i);
  assert.match(html, /href="\/tools\/"/);
  assert.match(html, /https:\/\/github.com\/1ststepai\/auto-model-router/);
  assert.match(html, /https:\/\/cursor\.directory\/plugins\/auto-model-router/);
  assert.match(html, /Install &amp; listings|Install & listings/);
  assert.match(html, /Submitted &mdash; pending Cursor review/);
  assert.match(html, /Submitted &mdash; pending Anthropic review/);
  assert.match(html, /cursor\.directory · community|cursor\.directory/);
  assert.match(html, /not Cursor's official Marketplace/);
  assert.match(html, /does not guarantee billing or token savings/);
  assert.match(html, /\/plugin marketplace add 1ststepai\/auto-model-router/);
  assert.match(html, /codex plugin marketplace add 1ststepai\/auto-model-router/);
  assert.match(html, /https:\/\/code\.claude\.com\/docs\/en\/discover-plugins/);
  assert.match(html, /INSTALL\.md/);
  assert.doesNotMatch(html, /cursor\.com\/marketplace\/publish/);
  assert.doesNotMatch(html, /href="https:\/\/cursor\.com\/marketplace/);
  assert.match(html, /billing dashboard/i);
  assert.match(html, /mapped to a cheaper or faster model/i);
  assert.match(html, /name="opt_in"/);
  assert.match(html, /href="\/privacy.html"/);
  assert.match(html, /fetch\("\/api\/auto-model-router-feedback"/);
  assert.match(html, /data-fsai-page-event="auto_model_router_view"/);
  assert.match(html, /No silent email harvesting/);
  assert.match(html, /usable without an email|works the same either way/i);
  assert.match(html, /id="live-demo"/);
  assert.match(html, /Motion replay of the real pass/);
  assert.match(html, /<video[^>]*controls[^>]*playsinline/i);
  assert.match(html, /poster="\/assets\/amr-codex-live-pass\.png"/);
  assert.match(html, /amr-codex-live-demo\.mp4/);
  assert.match(html, /amr-codex-live-pass\.png/);
  assert.match(html, /Play the live-motion chat replay/);
  assert.match(html, /not a slide explainer/);
  assert.match(html, /Auto suggests fast — no substantial work has been requested yet/);
  assert.match(html, /small, reversible, single-file rename with same-file call sites/);
  assert.match(html, /Try this in Codex/);
  assert.match(html, /Rename the function getUserName to fetchUserName/);
  assert.match(html, /suggest&nbsp;&rarr; wait/);
  assert.match(html, /does not claim usage or cost savings/);
  assert.match(html, /Example flow \(illustrative\)/);
  assert.match(html, /Illustrative CSS animation/);
  assert.match(html, /not a live IDE recording/i);
  assert.match(html, /Separate from the live-motion chat replay/);
  assert.match(html, /Rename getUserName/);
  assert.match(html, /Running on fast tier/);
  assert.match(html, /Running on reasoning tier/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /id="amr-demo-toggle"/);
  assert.match(html, /Play example/);
  assert.match(html, /id="amr-copy-prompt"/);
  assert.equal((await stat(new URL("public/assets/amr-codex-live-pass.png", root))).size > 5000, true);
  assert.equal((await stat(new URL("public/assets/amr-codex-live-demo.mp4", root))).size > 50000, true);
  assert.match(config, /autoModelRouter: "tools\/auto-model-router\/index.html"/);
  assert.match(sitemap, /tools\/auto-model-router\//);
  assert.match(readme, /\/tools\/auto-model-router\//);
  assert.match(readme, /Live demo with a playable motion replay/);
});

test("the 1stStep OS Audit page is a free CLI listing, not a hire form", async () => {
  const html = await source("tools/1ststep-os-audit/index.html");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  const readme = await source("README.md");
  const os = await source("os/index.html");
  assert.match(html, /Audit the project/);
  assert.match(html, /not the docs/i);
  assert.match(html, /href="\/tools\/"/);
  assert.match(html, /https:\/\/github.com\/1ststepai\/1ststep-os-audit/);
  assert.match(html, /Evidence over docs/);
  assert.match(html, /Zero metered API cost/);
  assert.match(html, /Does not rewrite your repo/);
  assert.match(html, /--help/);
  assert.match(html, /node engine\/src\/cli\.ts --help/);
  assert.match(html, /npm run audit:free -- --help/);
  assert.match(html, /Never writes into the target project tree/);
  assert.match(html, /Scores can be draft|Readiness scores can be draft/i);
  assert.match(html, /not a hire-us form/i);
  assert.doesNotMatch(html, /href="\/book\/"/);
  assert.doesNotMatch(html, /href="\/journey\/"/);
  assert.doesNotMatch(html, /Book a|Begin Your Journey|hire us/i);
  assert.match(html, /href="\/tools\/tools-shelf\.css"/);
  assert.match(html, /data-fsai-page-event="os_audit_tool_view"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/tools\/1ststep-os-audit\/"/);
  assert.match(config, /osAudit: "tools\/1ststep-os-audit\/index.html"/);
  assert.match(sitemap, /tools\/1ststep-os-audit\//);
  assert.match(readme, /\/tools\/1ststep-os-audit\//);
  assert.match(os, /href="\/tools\/1ststep-os-audit\/"/);
  assert.match(os, /CLI LISTED ON TOOLS/);
});

test("the 1stStep OS tools listing is a public free core with a local Cycle 1 ZIP path", async () => {
  const html = await source("tools/1ststep-os/index.html");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  const readme = await source("README.md");
  const os = await source("os/index.html");
  assert.match(html, /Cycle 1 runs locally/);
  assert.match(html, /Cycle 1/);
  assert.match(html, /free core/i);
  assert.match(html, /idea &rarr; project profile &rarr; markdown ZIP|Idea &rarr; profile &rarr; ZIP/);
  assert.match(html, /href="https:\/\/github.com\/1ststepai\/1ststep-os"/);
  assert.match(html, /npm install && npm test && npm run build && npm start/);
  assert.match(html, /http:\/\/localhost:3000\/os/);
  assert.match(html, /not production-ready/i);
  assert.match(html, /must not be deployed publicly/);
  assert.match(html, /does not host a ZIP generator/);
  assert.match(html, /not a hosted control plane/i);
  assert.match(html, /not a full agent OS|not a complete agent OS/i);
  assert.match(html, /illustrative/);
  assert.match(html, /href="\/os"/);
  assert.match(html, /href="\/tools\/"/);
  assert.match(html, /href="\/tools\/1ststep-os-audit\/"/);
  assert.match(html, /href="\/tools\/tools-shelf\.css"/);
  assert.doesNotMatch(html, /Source available soon/);
  assert.doesNotMatch(html, /OS is live as a hosted/);
  assert.doesNotMatch(html, /production-ready product/);
  assert.doesNotMatch(html, /href="\/book\/"/);
  assert.doesNotMatch(html, /href="\/journey\/"/);
  assert.doesNotMatch(html, /Book a|Begin Your Journey|hire us/i);
  assert.match(html, /data-fsai-page-event="os_foundation_tool_view"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/tools\/1ststep-os\/"/);
  assert.match(config, /osFoundation: "tools\/1ststep-os\/index.html"/);
  assert.match(sitemap, /tools\/1ststep-os\//);
  assert.match(readme, /github.com\/1ststepai\/1ststep-os/);
  assert.match(readme, /localhost:3000\/os/);
  assert.match(os, /href="https:\/\/github.com\/1ststepai\/1ststep-os"/);
  assert.match(os, /href="\/tools\/1ststep-os\/"/);
  assert.match(os, /illustrative/);
  assert.match(os, /not a hosted product/i);
});
