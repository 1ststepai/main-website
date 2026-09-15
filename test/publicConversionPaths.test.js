import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("the homepage leads with consultancy and preserves the free audit and OS paths", async () => {
  const html = await source("index.html");
  const llms = await source("public/llms.txt");
  assert.match(html, /We build the systems/);
  assert.match(html, /that move your business forward/);
  assert.match(html, /Find What We Can Automate/);
  assert.match(html, /href="\/journey\/\?intent=ai-operations-audit"/);
  assert.match(html, /id="home-audit-form"/);
  for (const type of ['website', 'web_app', 'github', 'mobile_app']) assert.match(html, new RegExp(`name="source_type" value="${type}"`));
  assert.match(html, /Run my free audit/);
  assert.match(html, /AI Operations Audit/);
  assert.match(html, /Lead paths, CRM architecture, follow-up, reporting/i);
  assert.match(html, /href="\/services\/ai-operations\.html"/);
  assert.match(html, /href="\/services\/revenue-systems\.html"/);
  assert.match(html, /href="https:\/\/app\.1ststep\.ai\/"/);
  assert.match(html, /Public concept · product flow in development|public concept/i);
  assert.match(html, /firststep-logo-transparent-cleaned\.png/);
  assert.match(llms, /1stStep OS/);
  assert.match(llms, /AI Job Agent/);
  assert.doesNotMatch(html, /A website that undersells the business|\$3,250&ndash;\$12,000/);
  assert.doesNotMatch(html, /<a\b[^>]*\bhref=(?:""|'')/i);
});

test("the consultancy funnel and service links have focused destinations", async () => {
  const html = await source("index.html");
  for (const anchor of ["problems", "how", "services", "work"]) assert.match(html, new RegExp('id="' + anchor + '"'));
  for (const path of ["websites", "app-builds", "ai-operations", "revenue-systems"]) {
    assert.match(html, new RegExp('href="/services/' + path + '\\.html"'));
  }
  assert.match(html, /Starting around \$1,500/);
  assert.doesNotMatch(html, /href="\/book\/"/);
});

test("the journey gives a local diagnosis and requires explicit consent to request review", async () => {
  const html = await source("journey/index.html");
  const script = await source("journey/journey.js");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  assert.equal((html.match(/class="step" data-step=/g) || []).length, 6);
  assert.match(html, /INITIAL FIT SIGNAL/);
  assert.match(html, /No account or AI audit is created/);
  assert.match(html, /id="request-consent"[^>]*type="checkbox"[^>]*required/);
  assert.match(html, /id="clear-action"/);
  assert.match(script, /document\.createElement\('dd'\)/);
  assert.match(script, /encodeURIComponent\(emailBody\)/);
  assert.match(script, /fetch\('\/api\/journey-intake'/);
  assert.match(script, /localStorage\.setItem/);
  assert.match(script, /journey_ai_operations_complete/);
  assert.match(script, /intent/);
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
  assert.match(html, /<meta name="description" content="1stStep\.ai finds operational bottlenecks/);
  assert.deepEqual(data["@graph"].map((item) => item["@type"]), ["Organization", "WebSite", "WebPage", "Service", "CreativeWork", "SoftwareApplication"]);
  assert.equal((await stat(new URL("public/assets/og-home.png", root))).size > 5000, true);
});

test("AI Operations has an indexable service page and one qualified Journey route", async () => {
  const page = await source("services/ai-operations.html");
  const config = await source("public/commercial-config.js");
  const vite = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");
  assert.match(page, /AI Operations Audit/);
  assert.match(page, /href="\/journey\/\?intent=ai-operations-audit"/);
  assert.match(page, /paid diagnostic/i);
  assert.doesNotMatch(page, /Buy now/i);
  assert.match(config, /priceDisplay: "Starting around \$1,500"/);
  assert.match(config, /checkoutEnabled: false/);
  assert.match(vite, /aiOperations/);
  assert.match(sitemap, /services\/ai-operations\.html/);
});

test("the website service page keeps website visitors on website-intent paths", async () => {
  const html = await source("services/websites.html");
  assert.match(html, /href="\/book\/"/);
  assert.match(html, /href="\/fit-check\/"/);
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
  assert.match(systems, /href="\/journey\/"/);
  assert.match(systems, /mailto:evan@1ststep\.ai\?subject=1stStep%20System%20Audit/);
  assert.doesNotMatch(systems, /href="\/app-idea-viability-checker\.html"/);
  assert.match(config, /revenueSystems/);
  assert.match(sitemap, /services\/revenue-systems\.html/);
});

test("supporting service pages use service-specific booking CTAs", async () => {
  const appBuilds = await source("services/app-builds.html");
  const internalTools = await source("services/internal-tools.html");
  const mvpBuilds = await source("services/mvp-builds.html");
  for (const html of [appBuilds, internalTools, mvpBuilds]) {
    assert.match(html, /href="\/book\/"/);
    assert.doesNotMatch(html, /href="\/app-idea-viability-checker\.html"/);
  }
  assert.match(appBuilds, /Book an App Build Call/);
  assert.match(internalTools, /Book a Workflow Call/);
  assert.match(mvpBuilds, /Book an MVP Scope Call/);
});

test("the exhaustive platform list lives on the focused website service page", async () => {
  const html = await source("services/websites.html");
  assert.match(html, /id="platform-support"/);
  assert.match(html, /id="process"/);
  assert.match(html, /WordPress/);
  assert.match(html, /HighLevel \/ LeadConnector/);
  assert.match(html, /custom HTML, React, Next\.js/);
});

test("the booking and fit-check pages preserve their verified paths", async () => {
  const booking = await source("book/index.html");
  const fitCheck = await source("fit-check/index.html");
  assert.match(booking, /https:\/\/api\.leadconnectorhq\.com\/widget\/booking\/Rb4aqLM1NdU5kvZcqNmj/);
  assert.match(booking, /class="calendar-shell"/);
  assert.match(booking, /Loading secure Website Strategy Call calendar/);
  assert.match(booking, /No pressure\./);
  assert.match(booking, /payment schedule/i);
  assert.equal((fitCheck.match(/class="field"/g) || []).length, 4);
  assert.match(fitCheck, /Request a Website Fit Review/);
  assert.match(fitCheck, /Reviewed personally by Evan/);
  assert.match(fitCheck, /payment schedules are available/i);
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
