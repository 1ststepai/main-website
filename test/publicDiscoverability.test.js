import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

const wwwPages = [
  "/",
  "/os",
  "/journey/",
  "/book/",
  "/fit-check/",
  "/campaigns/outgrown-website/",
  "/campaigns/morris-county-free-website/",
  "/tools/",
  "/tools/auto-model-router/",
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
  assert.match(llms, /Website Fit Check: https:\/\/www\.1ststep\.ai\/fit-check\//);
  assert.match(llms, /Website Strategy Call: https:\/\/www\.1ststep\.ai\/book\//);
  assert.match(llms, /services\/mvp-builds\.html/);
  assert.match(llms, /Use https:\/\/www\.1ststep\.ai\//);
  assert.match(llms, /evan@1ststep\.ai/);
  assert.match(llms, /Is the \/book\/ calendar a systems audit\? No/);
  assert.match(llms, /Tools: https:\/\/www\.1ststep\.ai\/tools\//);
  assert.match(llms, /Auto Model Router: https:\/\/www\.1ststep\.ai\/tools\/auto-model-router\//);
});

test("homepage first screen is one fit-check CTA with service links and architecture below", async () => {
  const html = await source("index.html");
  const hero = html.slice(html.indexOf('class="hero'), html.indexOf("signal-strip"));
  assert.match(hero, /href="\/fit-check\/"/);
  assert.equal((hero.match(/button button-primary/g) || []).length, 1);
  assert.doesNotMatch(hero, /href="\/journey\/"/);
  assert.doesNotMatch(hero, /href="\/book\/"/);
  assert.match(hero, /Business website that gets leads/);
  assert.match(hero, /Build an MVP/);
  assert.match(hero, /AI automation/);
  assert.match(hero, /Internal tools/);
  assert.match(html, /id="problems"/);
  assert.match(html, /id="how"/);
  assert.match(html, /Find the leak\. Design the route/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.1ststep\.ai\/"/);
  assert.match(html, /property="og:image" content="https:\/\/www\.1ststep\.ai\/assets\/og-home\.png"/);
});

test("homepage FAQ JSON-LD matches visible questions", async () => {
  const html = await source("index.html");
  const names = faqNames(html);
  for (const name of names) {
    assert.match(html, new RegExp(`<dt>${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</dt>`));
  }
  assert.ok(names.includes("Do you guarantee leads, rankings, or revenue?"));
});

test("service page H1s use search language and carry basic OG", async () => {
  const pages = {
    "services/websites.html": /<h1>A business website that gets leads\.<\/h1>/,
    "services/mvp-builds.html": /<h1>Build an MVP people can actually use\.<\/h1>/,
    "services/internal-tools.html": /<h1>Internal tools and AI automation\.<\/h1>/,
    "services/revenue-systems.html": /<h1>AI automation for <span class="gradient">lead capture and follow-up\.<\/span><\/h1>/,
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
