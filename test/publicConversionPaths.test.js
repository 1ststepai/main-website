import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the website service page keeps website visitors on website-intent paths", async () => {
  const html = await source("services/websites.html");

  assert.match(html, /href="\/book\/"/);
  assert.match(html, /href="\/fit-check\/"/);
  assert.doesNotMatch(html, /href="\/app-idea-viability-checker\.html"/);
  assert.match(html, /data-fsai-page-event="website_service_view"/);
  assert.match(html, /src="\/src\/site-analytics\.js"/);
  assert.match(html, /payment (?:plan|schedule)/i);
});

test("the public homepage has no empty links and gives hesitant website buyers a fit-check path", async () => {
  const html = await source("index.html");

  assert.doesNotMatch(html, /<a\b[^>]*\bhref=(?:""|'')/i);
  assert.match(html, /href="\/fit-check\/"[^>]*>Website Fit Review/);
  assert.match(html, /Two focused, verified reviews/);
  assert.match(html, /class="fsai-transform-mobile"/);
  assert.match(html, /A website that undersells the business/);
  assert.match(html, /Six focused examples of websites, products, and internal tools/);
  assert.match(html, /Concrete outcome:/);
  assert.match(html, /data-fsai-work-secondary hidden/);
  assert.match(html, /Show 3 more projects/);
  assert.match(html, /Showing 3 selected projects/);
  assert.doesNotMatch(html, /href="\/services\/websites\.html#platform-support"/);
  assert.match(html, /class="fsai-client-logos"/);
  assert.match(html, /Unveiling Rarities/);
  assert.match(html, /Custom Quote and Agreement Studio/);
  assert.match(html, /href="\/services\/internal-tools\.html">Explore custom internal tools/);
  assert.match(html, /data-fsai-quote-demo/);
  assert.match(html, /Generate sample quote/);
  assert.match(html, /Interactive demo &middot; sample data/);
  assert.match(html, /Show 2FA/);
  assert.match(html, /Password \+ authenticator 2FA/);
  assert.match(html, /Standards-based 2FA &middot; sample only/);
  assert.match(html, /Typing authenticator code/);
  assert.match(html, /Unlocked quote dashboard sample/);
  assert.match(html, /&#10003; Secure session/);
  assert.doesNotMatch(html, /href="\/app-idea-viability-checker\.html"/);
  assert.doesNotMatch(html, /<section class="fsai-platform-support"/);
  assert.doesNotMatch(html, /<section class="fsai-section" id="services"/);
  assert.doesNotMatch(html, /class="fsai-platform-details"/);
});

test("the homepage keeps one hero decision and exposes section navigation", async () => {
  const html = await source("index.html");
  const hero = html.match(/<section class="fsai-hero"[\s\S]*?<\/section>/)?.[0] || "";
  const header = html.match(/<header class="fsai-nav">[\s\S]*?<\/header>/)?.[0] || "";

  assert.equal((hero.match(/href="\/book\/"/g) || []).length, 1);
  assert.doesNotMatch(hero, /View Website Work|Request a Fit Check|href="#portfolio"/);
  assert.equal((header.match(/href="\/book\/"/g) || []).length, 1);
  assert.match(header, /class="fsai-nav-links"/);
  assert.match(header, /href="#website-offer"/);
  assert.match(header, /href="#portfolio"/);
  assert.match(header, /href="#investment"/);
  assert.match(header, /href="#process"/);
  assert.match(header, /href="#reviews"/);
  assert.match(html, /\$3,250&ndash;\$12,000 for custom website work/);
  assert.match(html, /repairs may start at \$750/);
  assert.match(html, /single-page builds at \$1,250/);
  assert.match(html, /Established businesses ready to invest in a custom result/);
  assert.doesNotMatch(html, /data-fsai-placement="homepage_investment"/);
});

test("the homepage prioritizes website audits while revenue systems stays on its focused service page", async () => {
  const home = await source("index.html");
  const systems = await source("services/revenue-systems.html");
  const config = await source("vite.config.js");
  const sitemap = await source("public/sitemap.xml");

  assert.match(home, /Not sure what your current website is costing you/);
  assert.match(home, /href="\/fit-check\/"[^>]*>Request a Website Fit Review/);
  assert.doesNotMatch(home, /href="\/services\/revenue-systems\.html"/);
  assert.doesNotMatch(home, /CRM stage, tag, and owner cleanup/);
  assert.match(systems, /Revenue Systems Audit and Architecture/);
  assert.match(systems, /GHL \/ LeadConnector, Apollo/);
  assert.match(systems, /href="\/book\/"/);
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

test("the homepage uses a compact process overview instead of the deep-dive panel", async () => {
  const html = await source("index.html");

  assert.match(html, /class="fsai-process-summary"/);
  assert.doesNotMatch(html, /<div class="fsai-process-panel"[^>]*data-fsai-process-panel/);
  assert.doesNotMatch(html, /data-fsai-process-step=/);
  assert.doesNotMatch(html, /class="fsai-process-context"/);
});

test("the exhaustive platform list lives on the focused website service page", async () => {
  const html = await source("services/websites.html");

  assert.match(html, /id="platform-support"/);
  assert.match(html, /id="process"/);
  assert.match(html, /WordPress/);
  assert.match(html, /HighLevel \/ LeadConnector/);
  assert.match(html, /custom HTML, React, Next\.js/);
});

test("the booking page preserves the verified calendar and explains its loading state", async () => {
  const html = await source("book/index.html");

  assert.match(html, /https:\/\/api\.leadconnectorhq\.com\/widget\/booking\/Rb4aqLM1NdU5kvZcqNmj/);
  assert.match(html, /class="calendar-shell"/);
  assert.match(html, /Loading secure Website Strategy Call calendar/);
  assert.match(html, /No pressure\./);
  assert.match(html, /payment schedule/i);
});

test("the fit check reinforces privacy and payment flexibility without adding fields", async () => {
  const html = await source("fit-check/index.html");

  assert.equal((html.match(/class="field"/g) || []).length, 4);
  assert.match(html, /Request a Website Fit Review/);
  assert.match(html, /Reviewed personally by Evan/);
  assert.match(html, /payment schedules are available/i);
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

test("the homepage footer gives the Morris County offer a clear visual shortcut", async () => {
  const html = await source("index.html");
  const footer = html.match(/<footer class="fsai-footer">[\s\S]*?<\/footer>/)?.[0] || "";

  assert.match(footer, /class="fsai-footer-offer"/);
  assert.match(footer, /href="\/campaigns\/morris-county-free-website\/"/);
  assert.match(footer, /src="\/generated\/morris-county-free-website-og\.png"/);
  assert.match(footer, /alt="Free custom website offer for Morris County businesses"/);
  assert.match(footer, /First 10 qualified Morris County businesses/);
});
