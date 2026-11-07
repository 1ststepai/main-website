import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the homepage leads with the studio offer and keeps products distinct", async () => {
  const html = await source("index.html");
  const llms = await source("public/llms.txt");
  const work = await source("work/index.html");
  assert.match(html, /Get more from the business you <em>already have\.<\/em>/);
  assert.match(work, /Node AI/);
  assert.doesNotMatch(work, /8,000\+|4,000\+|TradingView/);
  assert.match(html, /href="\/tools\/"/);
  assert.match(html, /href="\/journey\/"/);
  assert.match(html, /firststep-logo-transparent-cleaned\.png/);
  assert.equal((html.match(/Book a call/g) || []).length, 15);
  assert.equal((html.match(/href="\/book\/"/g) || []).length, 11);
  assert.match(html, /Book a free 20-min call/);
  assert.doesNotMatch(html, /Book a 20-min call/);
  assert.match(llms, /Get more from the business you already have/);
  assert.match(llms, /1stStep OS/);
  assert.match(llms, /1stStep Job Agent/);
  assert.doesNotMatch(html, /TradingView|guaranteed revenue|A website that undersells the business|\$3,250&ndash;\$12,000|Watch with sound|TODO: connect the 20-minute booking link|Example makeover/);
  assert.match(work, /data-src="\/home-v2\/1ststep-reel-v4\.mp4"/);
  assert.match(work, /poster="\/home-v2\/poster_16x9\.webp"/);
  assert.doesNotMatch(html, /class="piece"|data-src="\/home-v2\/1ststep-reel-v4\.mp4"/);
  assert.match(html, /Happy Boy Theme/);
  assert.match(html, /Kevin MacLeod/);
  assert.match(html, /https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//);
  assert.match(html, /BigSoundBank\.com/);
  const reel = await readFile(new URL("public/home-v2/1ststep-reel-v4.mp4", root));
  assert.ok(reel.includes(Buffer.from("mp4a")));
  assert.doesNotMatch(html, /<a\b[^>]*\bhref=(?:""|'')/i);
});

test("the homepage keeps a short section order and service pages keep their own destinations", async () => {
  const html = await source("index.html");
  const order = ["problem", "process", "pricing", "proof", "founder", "faq", "book"];
  let at = -1;
  for (const anchor of order) {
    const next = html.indexOf('id="' + anchor + '"');
    assert.ok(next > at, anchor);
    at = next;
  }
  assert.match(html, /Leads slip through the cracks/);
  assert.match(html, /Too many tools that don't talk/);
  assert.match(html, /No time to fix it/);
  assert.match(html, /<h3>Audit<\/h3>/);
  assert.match(html, /<h3>Build<\/h3>/);
  assert.match(html, /<h3>Grow<\/h3>/);
  assert.match(html, /The audit is credited toward your build\./);
  assert.match(html, /Based in Morris Plains, NJ\./);
  assert.doesNotMatch(html, /id="quotes" hidden|data-testimonials="pending"/);
  assert.ok(html.indexOf('id="quotes"') < html.indexOf('id="book"'));
  assert.match(html, /class="book-bar"/);
  assert.doesNotMatch(html, /id="makeover"|id="flow"|id="paths"|id="works"|id="how"|id="example"|id="agents"/);
  assert.equal((html.match(/href="\/book\/"/g) || []).length, 11);
  assert.match(html, /Illustrative data/);
  assert.doesNotMatch(html, /Example console, simulated|SIMULATED|SAMPLE DEMO/);
  const demo = await source("public/work/lyons-life-demo/index.html");
  assert.doesNotMatch(demo, /Florida Private Health|Self Employed Health|ACA Florida/);
  assert.match(demo, /Acquisition Site A/);
  assert.match(demo, /Acquisition Site B/);
  assert.match(demo, /Acquisition Site C/);
  assert.match(demo, /Lyons Life/);
  assert.match(demo, /Illustrative data/);
  assert.match(demo, /Generate brief/);
  assert.match(demo, /Download brief/);
  assert.match(demo, /Supervised/);
  assert.match(demo, /Approval-gated/);
  assert.doesNotMatch(demo, /SAMPLE DEMO|Generate sample brief|No agent runs|Saved sample|Sample status only/);
  assert.match(demo, /id="siteFilter"/);
  assert.match(demo, /id="generate"/);
  assert.match(demo, /id="download"/);
  assert.match(demo, /id="themeToggle"/);
  assert.match(demo, /prefers-reduced-motion:\s*reduce/);
  for (const path of ["websites", "internal-tools", "revenue-systems", "mvp-builds"]) {
    assert.match(await source(`services/${path}.html`), /<h1/);
  }
});

test("the journey gives a local diagnosis and only opens email by choice", async () => {
  const html = await source("journey/index.html");
  const script = await source("journey/journey.js");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  assert.equal((html.match(/class="step" data-step=/g) || []).length, 6);
  assert.match(html, /INITIAL FIT SIGNAL/);
  assert.match(html, /No account or model request is created/);
  assert.match(script, /document\.createElement\('dd'\)/);
  assert.match(script, /encodeURIComponent\(emailBody\)/);
  assert.doesNotMatch(script, /fetch\(|localStorage|sessionStorage/);
  assert.match(config, /journey: "journey\/index\.html"/);
  assert.match(sitemap, /www\.1ststep\.ai\/journey\//);
});

test("selected work shows first-party products without invented metrics", async () => {
  const home = await source("index.html");
  const work = await source("work/index.html");
  assert.equal((work.match(/class="piece"/g)||[]).length, 5);
  assert.equal((work.match(/class="piece piece-reel"/g)||[]).length, 1);
  assert.equal((work.match(/class="piece piece-lyons"/g)||[]).length, 1);
  assert.equal((work.match(/class="piece piece-universal"/g)||[]).length, 1);
  assert.equal((work.match(/piece-soon|Case study coming soon/g)||[]).length, 0);
  assert.match(work, /Lyons Life Command Center/);
  assert.match(work, /href="\/work\/lyons-life-demo\/"/);
  assert.match(work, /Try the interactive demo/);
  assert.match(work, /A command center for an insurance agency's website portfolio/);
  assert.match(work, /Universal Relocations: Origin Service portal/);
  assert.match(work, /href="\/work\/universal-relocations\/"/);
  assert.match(work, /A staff workspace for quoting and preparing the U\.S\. origin leg of international moves\./);
  assert.match(home, /Universal Relocations: Origin Service portal/);
  assert.match(home, /href="\/work\/universal-relocations\/"/);
  assert.match(home, /Try the demo/);
  const universal = await source("public/work/universal-relocations/index.html");
  assert.equal((universal.match(/Fictional placeholders only/g) || []).length, 1);
  assert.match(universal, /Nothing here is a quote or a rate\./);
  assert.doesNotMatch(universal, /class="banner"|Public demo\./);
  assert.match(universal, /id="start"/);
  assert.match(universal, /id="walk"/);
  assert.match(universal, /data-view="queue"/);
  assert.match(universal, /data-view="quote"/);
  const universalVisible = universal.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  assert.doesNotMatch(universalVisible, /\$\d|%|\d[\d,]*\+/);
  const lyons = work.slice(work.indexOf("Lyons Life Command Center"), work.indexOf("Studio reel"));
  assert.doesNotMatch(lyons, /\$|%|\d[\d,]*\+|clients say|revenue|Lions Life/);
  let at = 0;
  for (const project of ["DaySetGo", "SwingTradePros", "Job Agent", "SkillSprout", "Real-Rank.ai", "Studio reel"]) {
    const next = work.indexOf(project, at);
    assert.ok(next > at, project);
    at = next;
  }
  assert.match(work, /Products we built/);
  const skill = work.slice(work.indexOf("SkillSprout"), work.indexOf("Real-Rank.ai"));
  assert.doesNotMatch(skill, /\d[\d,]*\+|\$|%/);
  assert.doesNotMatch(home, /TradingView|<iframe|<canvas|three\/|scene\.js|the.?spot|spot.?cafe/i);
  const css = await source("src/home-v2.css");
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /cursor:\s*none/);
});

test("homepage metadata and assets identify the systems consultancy", async () => {
  const html = await source("index.html");
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const data = JSON.parse(jsonLd);

  assert.match(html, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/"/);
  assert.match(html, /og-home-v2\.png/);
  assert.match(html, /<meta name="description" content="Software, automation, and websites for a business that already has demand/);
  assert.deepEqual(data["@graph"].map((item) => item["@type"]), ["Organization", "WebSite", "WebPage", "CreativeWork", "SoftwareApplication"]);
  assert.equal((await stat(new URL("public/assets/og-home-v2.png", root))).size > 5000, true);
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

test("the homepage has one real video testimonial and shows Evan's headshot", async () => {
  const html = await source("index.html");
  assert.doesNotMatch(html, /Real, named quotes go here|Needed from Evan|Client sample reel slot|Sara E Ford|Evan photo here/);
  assert.equal((html.match(/<blockquote/g) || []).length, 7);
  assert.match(html, /He knows what he&rsquo;s doing&hellip; So, book a consult\./);
  assert.match(html, /Alon Bendory, <a href="https:\/\/yibble\.co\/"[^>]*>Yibble<\/a>/);
  assert.match(html, /<track kind="captions" src="\/testimonials\/alon-bendory\.en\.vtt"/);
  assert.doesNotMatch(html, /<video[^>]*autoplay/);
  assert.match(html, /srcset="\/home-v2\/evan-pancis\.avif"/);
  assert.match(html, /srcset="\/home-v2\/evan-pancis\.webp"/);
  assert.match(html, /src="\/home-v2\/evan-pancis\.jpg"/);
  assert.match(html, /alt="Evan Pancis, founder of 1stStep\.ai"/);
  assert.match(html, /width="400" height="400"/);
  assert.match(html, /"image":"https:\/\/www\.1ststep\.ai\/home-v2\/evan-pancis\.jpg"/);
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
  assert.match(home, /<nav aria-label="Footer"[^>]*>[\s\S]*href="\/tools\/"/);
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

test("pricing publishes the approved starting ranges and books a call", async () => {
  const home = await source("index.html");
  const page = await source("pricing/index.html");
  const config = await source("vite.config.js");
  const vercel = await source("vercel.json");
  const sitemap = await source("public/sitemap.xml");
  const rootMap = await source("sitemap.xml");
  const css = await source("src/home-v2.css");
  const section = home.slice(home.indexOf('id="pricing"'), home.indexOf('id="proof"'));
  const lines = [
    "Business &amp; Bottleneck Audit",
    "$750–$1,500 flat",
    "Credited toward your build.",
    "Website Build",
    "from $3,500",
    "A site for a business that already has demand.",
    "Automations &amp; Integrations",
    "from $2,500 per workflow",
    "One workflow, connected to the tools you already use.",
    "App Development",
    "from $10,000 (MVP)",
    "A first version of the product.",
    "Build Rescue &amp; Handoff",
    "Starts with a $1,000 code review",
    "Finish what a vibe coder or you started.",
    "Consulting &amp; Support",
    "$150–$200/hr or retainers from $1,500/mo",
    "Direct time, by the hour or the month.",
    "Every project is scoped on a free call.",
  ];
  for (const line of lines) {
    const pattern = new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.match(section, pattern, line);
    assert.match(page, pattern, line);
  }
  assert.equal((section.match(/Book a call/g) || []).length, 12);
  assert.equal((section.match(/href="\/book\/"/g) || []).length, 6);
  assert.equal((page.match(/Book a call/g) || []).length, 13);
  assert.match(home, /<nav aria-label="Primary">[\s\S]*href="\/pricing\/">Pricing<\/a>/);
  assert.match(page, /aria-current="page">Pricing<\/a>/);
  assert.match(home, /<nav aria-label="Footer"[\s\S]*href="\/pricing\/">Pricing<\/a>/);
  assert.doesNotMatch(section, /cartoon|Cartoon ad|studio reel/i);
  assert.doesNotMatch(page, /cartoon|Cartoon ad/i);
  assert.match(css, /\.price-grid \.card:hover,\.price-grid \.card:focus-within\{transform:translateY\(-10px\)\}/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.match(config, /pricing: "pricing\/index.html"/);
  assert.match(config, /["']\/pricing["']/);
  assert.match(vercel, /"source": "\/pricing"/);
  assert.match(sitemap, /www\.1ststep\.ai\/pricing\//);
  assert.match(rootMap, /www\.1ststep\.ai\/pricing\//);
  assert.ok(home.indexOf('id="process"') < home.indexOf('id="pricing"') && home.indexOf('id="pricing"') < home.indexOf('id="proof"'));
  assert.match(config, /work: "work\/index.html"/);
  assert.match(sitemap, /www\.1ststep\.ai\/work\//);
});

test("the homepage shows six verbatim Google reviews before the booking band", async () => {
  const html = await source("index.html");
  const start = html.indexOf('class="wrap rv"');
  assert.ok(start > html.indexOf('id="quotes"') && start < html.indexOf('id="book"'));
  assert.match(html, /href="https:\/\/www\.google\.com\/search\?kgmid=\/g\/11nbwvpwjm&amp;q=1ststep\.ai"/);
  assert.match(html, /<strong>5\.0<\/strong>/);
  assert.match(html, /9 Google reviews/);
  assert.equal((html.match(/class="rv-card"/g) || []).length, 6);
  for (const name of ["Steven Bunker", "Rob Green", "David Williams", "Shawon E", "Sazzad Hossain", "Alon Bendory"]) assert.match(html, new RegExp(name + " <span>· Google</span>"));
  assert.match(html, /I tried other companies nd each one of them failed\./);
  assert.match(html, /high-quality online store<\/p>/);
  assert.match(html, /you just can’t figure out how to use it/);
  assert.doesNotMatch(html, /burak|buys low, sells high|T Shares|1manshow|AggregateRating/);
});

test("the Meet Evan intro is hidden from the homepage but its assets are kept", async () => {
  const html = await source("index.html");
  assert.doesNotMatch(html, /meet-evan|evan-intro|Meet Evan/);
  const vtt = await source("public/intro/evan-intro.en.vtt");
  assert.match(vtt, /^WEBVTT/);
});
