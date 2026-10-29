import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { postpathRootRewrite } from "../middleware.js";
import { SAME_AS, SOCIAL_PROFILES, EXPLORE_LINKS } from "../src/site-social.js";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

const fileForPath = {
  "/": "index.html",
  "/os": "os/index.html",
  "/journey/": "journey/index.html",
  "/book/": "book/index.html",
  "/work/": "work/index.html",
  "/work/universal-relocations/": "public/work/universal-relocations/index.html",
  "/pricing/": "pricing/index.html",
  "/fit-check/": "fit-check/index.html",
  "/campaigns/outgrown-website/": "campaigns/outgrown-website/index.html",
  "/campaigns/morris-county-free-website/": "campaigns/morris-county-free-website/index.html",
  "/tools/": "tools/index.html",
  "/tools/auto-model-router/": "tools/auto-model-router/index.html",
  "/tools/1ststep-os-audit/": "tools/1ststep-os-audit/index.html",
  "/tools/1ststep-os/": "tools/1ststep-os/index.html",
  "/app-idea-viability-checker.html": "app-idea-viability-checker.html",
  "/startup-launch-checker/": "startup-launch-checker/index.html",
  "/services/app-builds.html": "services/app-builds.html",
  "/services/mvp-builds.html": "services/mvp-builds.html",
  "/services/websites.html": "services/websites.html",
  "/services/revenue-systems.html": "services/revenue-systems.html",
  "/services/internal-tools.html": "services/internal-tools.html",
  "/services/gohighlevel-insurance-agencies.html": "services/gohighlevel-insurance-agencies.html",
  "/services/gohighlevel-real-estate-brokers.html": "services/gohighlevel-real-estate-brokers.html",
  "/privacy.html": "privacy.html",
  "/terms.html": "terms.html",
};

test("sitemap URLs are canonical files that are not noindex", async () => {
  const xml = await source("public/sitemap.xml");
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.ok(locs.every((loc) => /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(xml.slice(xml.indexOf(loc), xml.indexOf(loc) + 180))));
  for (const loc of locs) {
    assert.doesNotMatch(loc, /\/postpath\/$/);
    if (loc === "https://postpath.1ststep.ai/") {
      const html = await source("postpath/index.html");
      assert.match(html, /rel="canonical" href="https:\/\/postpath\.1ststep\.ai\/"/);
      assert.doesNotMatch(html, /noindex/);
      continue;
    }
    assert.match(loc, /^https:\/\/www\.1ststep\.ai/);
    const path = loc.replace("https://www.1ststep.ai", "") || "/";
    const file = fileForPath[path];
    assert.ok(file, path);
    await access(new URL(file, root), constants.F_OK);
    const html = await source(file);
    assert.doesNotMatch(html, /noindex/);
    assert.match(html, new RegExp(`rel="canonical" href="${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  const missing = await source("404.html");
  assert.match(missing, /noindex/);
  assert.doesNotMatch(xml, /404\.html/);
});

test("PostPath host root rewrites to the marketing file and does not redirect", async () => {
  const response = postpathRootRewrite(new Request("https://postpath.1ststep.ai/"));
  assert.equal(response.headers.get("x-middleware-rewrite"), "https://postpath.1ststep.ai/postpath/index.html");
  assert.equal(postpathRootRewrite(new Request("https://www.1ststep.ai/")), undefined);
  assert.equal(postpathRootRewrite(new Request("https://postpath.1ststep.ai/postpath/")), undefined);
});

test("homepage and service pages link the important paths, including PostPath", async () => {
  const pages = [
    "index.html",
    "services/websites.html",
    "services/revenue-systems.html",
    "services/internal-tools.html",
    "services/mvp-builds.html",
    "services/app-builds.html",
    "services/gohighlevel-insurance-agencies.html",
    "services/gohighlevel-real-estate-brokers.html",
  ];
  for (const file of pages) {
    const html = await source(file);
    for (const link of EXPLORE_LINKS) {
      if (file === "index.html" && link.href === "/book/") continue;
      if (file.startsWith("services/") && link.href.includes("app-idea-viability-checker")) continue;
      assert.match(html, new RegExp(`href="${link.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${file} ${link.href}`);
    }
  }
});

test("social profiles are in the footer and Organization sameAs", async () => {
  const html = await source("index.html");
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const organization = graph["@graph"].find((item) => item["@type"] === "Organization");
  const practice = graph["@graph"].find((item) => item["@type"] === "ProfessionalService");
  assert.deepEqual(organization.sameAs, SAME_AS);
  assert.deepEqual(practice.sameAs, SAME_AS);
  assert.equal(practice.telephone, "+1-973-800-3729");
  assert.equal(practice.address.addressLocality, "Morris Plains");
  assert.equal(practice.address.addressRegion, "NJ");
  assert.ok(practice.areaServed.some((area) => area.name === "Morris Plains"));
  assert.doesNotMatch(JSON.stringify(practice), /aggregateRating|reviewCount|ratingValue/);
  for (const profile of SOCIAL_PROFILES) {
    assert.match(html, new RegExp(`href="${profile.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" rel="me noopener"`));
  }
  assert.match(await source("services/websites.html"), /rel="me noopener"/);
  assert.match(await source("postpath/index.html"), /rel="me noopener"/);
  assert.match(await source("postpath/index.html"), /name="twitter:title"/);
  assert.match(await source("postpath/index.html"), /name="twitter:description"/);
});

test("draft GoHighLevel pages have one H1, FAQ schema, and a book CTA", async () => {
  for (const file of [
    "services/gohighlevel-insurance-agencies.html",
    "services/gohighlevel-real-estate-brokers.html",
  ]) {
    const html = await source(file);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /DRAFT COPY: pending Evan Pancis review/);
    assert.match(html, /href="https:\/\/www\.1ststep\.ai\/book\/"/);
    assert.match(html, /not affiliated with or endorsed by HighLevel/);
    assert.doesNotMatch(html, /aggregateRating|\$\d|% of/);
    assert.match(html, /does not guarantee revenue/);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
      JSON.parse(match[1]),
    );
    const pageFaq = blocks.find((block) => block["@type"] === "FAQPage");
    assert.ok(pageFaq);
    for (const item of pageFaq.mainEntity) {
      assert.match(html, new RegExp(`<summary>${item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</summary>`));
      assert.ok(html.includes(item.acceptedAnswer.text), item.name);
    }
  }
});

test("analytics stays privacy-friendly and the beacon is allowed", async () => {
  const analytics = await source("src/site-analytics.js");
  const vercel = JSON.parse(await source("vercel.json"));
  const csp = vercel.headers[0].headers.find((header) => header.key === "Content-Security-Policy").value;
  assert.match(analytics, /injectSpeedInsights/);
  assert.doesNotMatch(analytics, /gtag|googletagmanager|G-[A-Z0-9]{6,}/);
  assert.match(csp, /https:\/\/vitals\.vercel-insights\.com/);
  assert.match(csp, /https:\/\/va\.vercel-scripts\.com/);
  const env = await source(".env.example");
  assert.match(env, /PUBLIC_GA4_MEASUREMENT_ID=\s*$/m);
  const full = await source("public/llms-full.txt");
  assert.match(full, /https:\/\/postpath\.1ststep\.ai\//);
  assert.match(full, /DRAFT copy pending Evan Pancis/);
  assert.match(full, /resume\.1ststep\.ai is a separate product/);
});
