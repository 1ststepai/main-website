import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

const wwwPages = [
  "/",
  "/work/",
  "/os",
  "/journey/",
  "/book/",
  "/pricing/",
  "/fit-check/",
  "/campaigns/outgrown-website/",
  "/campaigns/morris-county-free-website/",
  "/tools/",
  "/tools/auto-model-router/",
  "/tools/1ststep-os-audit/",
  "/tools/1ststep-os/",
  "/app-idea-viability-checker.html",
  "/startup-launch-checker/",
  "/services/app-builds.html",
  "/services/mvp-builds.html",
  "/services/websites.html",
  "/services/revenue-systems.html",
  "/services/internal-tools.html",
  "/privacy.html",
  "/terms.html",
];

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1])
  );
}

function faqNames(html) {
  const faq = jsonLdBlocks(html).find((block) => block["@type"] === "FAQPage");
  assert.ok(faq, "expected FAQPage JSON-LD");
  return faq.mainEntity.map((item) => item.name);
}

test("sitemaps use www, stay complete, and refresh lastmod on converted URLs", async () => {
  const publicMap = await source("public/sitemap.xml");
  const rootMap = await source("sitemap.xml");
  assert.doesNotMatch(publicMap, /https:\/\/1ststep\.ai\//);
  assert.doesNotMatch(rootMap, /<loc>https:\/\/1ststep\.ai\//);
  for (const path of wwwPages) {
    assert.match(publicMap, new RegExp(`https://www\\.1ststep\\.ai${path.replaceAll("/", "\\/")}`));
    assert.match(rootMap, new RegExp(`https://www\\.1ststep\\.ai${path.replaceAll("/", "\\/")}`));
  }
  for (const path of ["/", "/book/", "/fit-check/", "/services/websites.html", "/services/mvp-builds.html", "/services/internal-tools.html", "/services/revenue-systems.html"]) {
    assert.match(publicMap, new RegExp(`${path.replaceAll("/", "\\/")}[\\s\\S]*?<lastmod>2026-09-20</lastmod>`));
  }
});

test("robots.txt allows the public site, blocks private paths, and points at the www sitemap", async () => {
  const robots = await source("public/robots.txt");
  const rootRobots = await source("robots.txt");
  for (const text of [robots, rootRobots]) {
    assert.match(text, /User-agent: \*/);
    assert.match(text, /Allow: \//);
    assert.match(text, /Disallow: \/admin\//);
    assert.match(text, /Disallow: \/demos\//);
    assert.match(text, /Disallow: \/book\/confirmed\//);
    assert.match(text, /Sitemap: https:\/\/www\.1ststep\.ai\/sitemap\.xml/);
    assert.doesNotMatch(text, /Sitemap: https:\/\/1ststep\.ai\/sitemap\.xml/);
  }
});

test("llms.txt names the owner offer, start paths, and canonical www host", async () => {
  const llms = await source("public/llms.txt");
  assert.match(llms, /Commercial project intake: https:\/\/www\.1ststep\.ai\/fit-check\//);
  assert.match(llms, /intent=build_new/);
  assert.match(llms, /intent=finish_build/);
  assert.match(llms, /intent=automate_business/);
  assert.match(llms, /Website Strategy Call: https:\/\/www\.1ststep\.ai\/book\//);
  assert.match(llms, /services\/mvp-builds\.html/);
  assert.match(llms, /Use https:\/\/www\.1ststep\.ai\//);
  assert.match(llms, /evan@1ststep\.ai/);
  assert.match(llms, /Is the \/book\/ calendar a systems audit\? No/);
  assert.match(llms, /Tools: https:\/\/www\.1ststep\.ai\/tools\//);
  assert.match(llms, /Auto Model Router: https:\/\/www\.1ststep\.ai\/tools\/auto-model-router\//);
  assert.match(llms, /1stStep OS Audit: https:\/\/www\.1ststep\.ai\/tools\/1ststep-os-audit\//);
  assert.match(llms, /1stStep OS \(public free core \/ Cycle 1\): https:\/\/www\.1ststep\.ai\/tools\/1ststep-os\//);
  assert.match(llms, /https:\/\/github.com\/1ststepai\/1ststep-os-audit/);
  assert.match(llms, /https:\/\/github.com\/1ststepai\/1ststep-os/);
  assert.match(llms, /localhost:3000\/os/);
  assert.match(llms, /Does not rewrite the target repository/);
  assert.match(llms, /Not a hosted product/);
  assert.match(llms, /No hosted ZIP generator/);
  assert.match(llms, /motion replay of the real suggest/);
  assert.match(llms, /Not a billing or savings claim/);
  assert.match(llms, /https:\/\/github.com\/1ststepai\/auto-model-router/);
  assert.match(llms, /https:\/\/cursor\.directory\/plugins\/auto-model-router/);
  assert.match(llms, /pending Cursor review/);
  assert.match(llms, /pending Anthropic review/);
  assert.match(llms, /does not guarantee billing or token savings/);
});

test("homepage first screen books the call beside an example desk", async () => {
  const html = await source("index.html");
  const heroStart = html.indexOf('<section class="hero');
  const hero = html.slice(heroStart, html.indexOf("</section>", heroStart));
  const work = await source("work/index.html");
  assert.match(hero, /Get more from the business you/);
  assert.match(hero, /href="\/book\/"[^>]*>Book a free 20-min call/);
  assert.match(hero, /Websites, integrations, automations, and custom apps/);
  assert.match(hero, /See pricing/);
  assert.doesNotMatch(hero, /See our work|btn ghost/);
  assert.match(hero, /Pause animation/);
  assert.match(hero, /Illustrative data/);
  assert.doesNotMatch(hero, /SIMULATED|EXAMPLE/);
  assert.match(hero, /Leads in/);
  assert.match(hero, /Replies sent/);
  assert.match(hero, /Today’s leads/);
  assert.match(hero, /Lead in/);
  assert.match(hero, /Added to CRM/);
  assert.doesNotMatch(hero, /SPY|AAPL|TSLA|NVDA|\+0\.|\$/);
  assert.doesNotMatch(hero, /Tap for sound|poster_16x9|<video|Watch with sound|href="\/fit-check\//);
  assert.match(work, /Tap for sound/);
  assert.match(work, /poster="\/home-v2\/poster_16x9\.webp"/);
  assert.match(work, /class="work-vid"/);
  assert.equal((work.match(/class="reel-sound"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="reel-sound"|class="work-vid"/);
  assert.doesNotMatch(html, /TODO: connect the 20-minute booking link|class="sound"/);
  assert.doesNotMatch(html, /id="how"|id="paths"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/"/);
  assert.match(html, /property="og:image" content="https:\/\/www\.1ststep\.ai\/assets\/og-home\.png"/);
});

test("the homepage uses the system cursor and does not hijack scroll", async () => {
  const html = await source("index.html");
  const js = await source("src/home-v2.js");
  const css = await source("src/home-v2.css");
  const site = await source("src/v2-site.css");
  assert.doesNotMatch(html, /class="cursor"|lenis\.min\.js|gsap\.min\.js|ScrollTrigger/);
  assert.doesNotMatch(js, /new Lenis|ScrollTrigger|gsap/);
  assert.match(js, /pointermove/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /addEventListener\('scroll'/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /IntersectionObserver/);
  assert.match(css, /animation-play-state:\s*paused/);
  assert.match(css, /\.hero\.is-on/);
  assert.doesNotMatch(css, /cursor:\s*none|backdrop-filter|\.grain|lenis/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(site, /backdrop-filter/);
});

test("public subpages use the v2 chrome and drop the navy and lavender theme", async () => {
  const pages = [
    "tools/index.html",
    "tools/auto-model-router/index.html",
    "tools/1ststep-os/index.html",
    "tools/1ststep-os-audit/index.html",
    "app-idea-viability-checker.html",
    "services/websites.html",
    "services/revenue-systems.html",
    "services/app-builds.html",
    "services/mvp-builds.html",
    "services/internal-tools.html",
    "journey/index.html",
    "fit-check/index.html",
    "book/index.html",
    "book/confirmed/index.html",
    "os/index.html",
    "privacy.html",
    "terms.html",
    "startup-launch-checker/index.html",
    "campaigns/morris-county-free-website/index.html",
    "campaigns/outgrown-website/index.html",
  ];
  for (const file of pages) {
    const html = await source(file);
    assert.match(html, /class="v2/, file);
    assert.match(html, /href="\/src\/v2-site\.css"/, file);
    assert.match(html, /firststep-logo-transparent-cleaned\.png/, file);
    assert.doesNotMatch(html, /fonts\.googleapis\.com|Space Grotesk|#070912|#6d5efc|#8b7cff/, file);
  }
  const home = await source("index.html");
  assert.doesNotMatch(home, /v2-site\.css/);
  for (const file of ["tools/1ststep-os/index.html", "tools/1ststep-os-audit/index.html"]) {
    const html = await source(file);
    assert.doesNotMatch(html, /class="pill"|href="\/book\/"|href="\/journey\/"/, file);
  }
});

test("the integrations row uses approved marks, pauses, and states the trademark limit", async () => {
  const home = await source("index.html");
  assert.doesNotMatch(home, /id="works"|Works with the tools|integrations\.css/);
  const html = await source("services/websites.html");
  const css = await source("src/integrations.css");
  const start = html.indexOf('id="works"');
  const works = html.slice(start, html.indexOf("</section>", start));
  assert.match(works, /Works with the tools/);
  assert.match(works, /Logos are trademarks of their respective owners\. 1stStep\.ai connects with these tools and is not affiliated with or endorsed by them\./);
  assert.doesNotMatch(works, /partner/i);
  for (const name of ["Zapier", "Make", "n8n", "Calendly", "Square", "Supabase"]) {
    assert.match(works, new RegExp(`alt="${name}"`));
  }
  for (const banned of ["GoHighLevel", "QuickBooks", "ManyChat", "Gmail", "Outlook", "Slack", "Stripe", "Shopify", "HubSpot", "Salesforce", "Follow Up Boss", "Twilio", "OpenAI", "WhatsApp", "Mailchimp", "Notion", "Vercel", "Facebook", "Instagram"]) {
    assert.doesNotMatch(works, new RegExp(banned, "i"));
  }
  assert.match(css, /animation-play-state:\s*paused/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /ul\[aria-hidden="true"\]\{display:none\}/);
  for (const file of ["websites", "revenue-systems", "app-builds", "mvp-builds", "internal-tools"]) {
    assert.match(await source(`services/${file}.html`), /id="works"/);
  }
});

test("homepage FAQ copy matches the visible accordion", async () => {
  const html = await source("index.html");
  const names = faqNames(html);
  for (const question of [
    "What does it cost?",
    "How long does it take?",
    "I already started a build, can you finish it?",
    "I don't know what I need, where do I start?",
    "Do you work with my tools?",
  ]) {
    assert.ok(names.includes(question), question);
    assert.match(html, new RegExp("<summary>" + question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "</summary>"));
  }
});

test("service page H1s use search language and carry basic OG", async () => {
  const pages = {
    "services/websites.html": /<h1>A business website that gets leads\.<\/h1>/,
    "services/mvp-builds.html": /<h1>Build an MVP people can actually use\.<\/h1>/,
    "services/internal-tools.html": /<h1>Internal tools and automation\.<\/h1>/,
    "services/revenue-systems.html": /<h1>Automation for <span class="gradient">lead capture and follow-up\.<\/span><\/h1>/,
  };
  for (const [path, heading] of Object.entries(pages)) {
    const html = await source(path);
    assert.match(html, heading);
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\//);
    assert.match(html, /property="og:image" content="https:\/\/www\.1ststep\.ai\/assets\/og-home\.png"/);
    assert.match(html, /property="og:site_name" content="1stStep\.ai"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  }
});

test("key service FAQs have matching FAQPage JSON-LD", async () => {
  for (const path of ["services/websites.html", "services/mvp-builds.html", "services/internal-tools.html", "services/revenue-systems.html"]) {
    const html = await source(path);
    const names = faqNames(html);
    assert.ok(names.length >= 3);
    for (const name of names) {
      assert.match(html, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("fit-check and book keep www canonical plus complete social tags", async () => {
  const fit = await source("fit-check/index.html");
  const book = await source("book/index.html");
  assert.match(fit, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/fit-check\/"/);
  assert.match(book, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/book\/"/);
  for (const html of [fit, book]) {
    assert.match(html, /property="og:image" content="https:\/\/www\.1ststep\.ai\/assets\/banner-1ststep-og\.png"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image" content="https:\/\/www\.1ststep\.ai\/assets\/banner-1ststep-og\.png"/);
  }
});
