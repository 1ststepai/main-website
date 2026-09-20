import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

const pages = [
  {
    path: "index.html",
    title: "Websites, Apps &amp; AI That Get Leads | 1stStep.ai",
    description: "1stStep.ai designs and builds the systems",
    canonical: "https://www.1ststep.ai/",
    faq: "What does 1stStep.ai actually build?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "services/websites.html",
    title: "Websites That Get Leads | 1stStep.ai",
    description: "Hire 1stStep.ai to build or rebuild a website",
    canonical: "https://www.1ststep.ai/services/websites.html",
    faq: "What kind of websites do you build?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "services/app-builds.html",
    title: "Hire to Design an iOS App | 1stStep.ai",
    description: "Hire 1stStep.ai to shape an iOS app",
    canonical: "https://www.1ststep.ai/services/app-builds.html",
    faq: "Do you ship finished App Store apps?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "services/mvp-builds.html",
    title: "Hire to Build an MVP or Web App | 1stStep.ai",
    description: "Hire 1stStep.ai to build a focused MVP",
    canonical: "https://www.1ststep.ai/services/mvp-builds.html",
    faq: "What does an MVP include here?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "services/internal-tools.html",
    title: "Internal Tools for Small Business | 1stStep.ai",
    description: "Replace spreadsheet chaos with one internal tool",
    canonical: "https://www.1ststep.ai/services/internal-tools.html",
    faq: "When should I replace spreadsheets with a custom tool?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "services/revenue-systems.html",
    title: "Revenue Systems Audit &amp; Architecture | 1stStep.ai",
    description: "A focused Revenue Systems Audit and Architecture",
    canonical: "https://www.1ststep.ai/services/revenue-systems.html",
    faq: "What is a revenue systems audit?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "fit-check/index.html",
    title: "Check If Your Website Project Fits | 1stStep.ai",
    description: "Share your website, timeline, and budget range",
    canonical: "https://www.1ststep.ai/fit-check/",
    faq: "What do I need to submit?",
    book: true,
    tools: true,
  },
  {
    path: "book/index.html",
    title: "Book a Website Strategy Call | 1stStep.ai",
    description: "Book a 30-minute Website Strategy Call",
    canonical: "https://www.1ststep.ai/book/",
    faq: "What is this call?",
    fitCheck: true,
    tools: true,
  },
  {
    path: "journey/index.html",
    title: "Find Your Business Bottleneck | 1stStep.ai",
    description: "Answer six questions about your offer",
    canonical: "https://www.1ststep.ai/journey/",
    faq: "Are my answers saved?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "os/index.html",
    title: "1stStep OS — An Operating System for AI Engineering",
    description: "1stStep OS is a public concept",
    canonical: "https://www.1ststep.ai/os",
    faq: "Is 1stStep OS a live product?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "app-idea-viability-checker.html",
    title: "Is My App Idea Worth Building? | 1stStep.ai",
    description: "Free first-pass check: is your app idea worth building?",
    canonical: "https://www.1ststep.ai/app-idea-viability-checker.html",
    faq: "Is the checker a guarantee that my idea will work?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "startup-launch-checker/index.html",
    title: "Is Your Startup Ready to Launch? | 1stStep.ai",
    description: "Is your startup ready to launch?",
    canonical: "https://www.1ststep.ai/startup-launch-checker/",
    faq: "Is this legal or financial advice?",
    book: true,
    fitCheck: true,
    tools: true,
  },
  {
    path: "campaigns/outgrown-website/index.html",
    title: "Your Business Outgrew Its Website | 1stStep.ai",
    description: "Your business grew. Your website",
    canonical: "https://www.1ststep.ai/campaigns/outgrown-website/",
    faq: "How do I know I outgrew my website?",
    book: true,
    fitCheck: true,
    tools: true,
  },
];

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

function collectTypes(data) {
  const types = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value["@type"]) types.push(value["@type"]);
    if (value["@graph"]) visit(value["@graph"]);
    if (value.mainEntity) visit(value.mainEntity);
    if (value.makesOffer) visit(value.makesOffer);
  };
  visit(data);
  return types;
}

function faqQuestions(data) {
  const questions = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value["@type"] === "FAQPage") visit(value.mainEntity);
    if (value["@type"] === "Question" && value.name) questions.push(value.name);
    if (value["@graph"]) visit(value["@graph"]);
  };
  visit(data);
  return questions;
}

test("business pages have answer-first titles, descriptions, and matching FAQ schema", async () => {
  for (const page of pages) {
    const html = await source(page.path);
    assert.match(html, new RegExp(`<title>${page.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`), page.path);
    assert.match(html, new RegExp(`content="${page.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), page.path);
    assert.match(html, new RegExp(`rel="canonical" href="${page.canonical}"`), page.path);
    assert.match(html, new RegExp(page.faq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), page.path);

    const blocks = jsonLdBlocks(html);
    assert.ok(blocks.length > 0, `${page.path} should have JSON-LD`);
    const questions = blocks.flatMap(faqQuestions);
    assert.ok(questions.includes(page.faq), `${page.path} FAQ JSON-LD should include "${page.faq}"`);
    const types = blocks.flatMap(collectTypes);
    assert.ok(types.includes("FAQPage"), `${page.path} should declare FAQPage`);

    if (page.book) assert.match(html, /href="\/book\/"/);
    if (page.fitCheck) assert.match(html, /href="\/fit-check\/"/);
    if (page.tools) assert.match(html, /href="\/tools\/"/);
    assert.match(html, /property="og:title"/, `${page.path} should have og:title`);
    assert.match(html, /name="twitter:card"/, `${page.path} should have twitter:card`);
    assert.match(html, /property="og:image"/, `${page.path} should have og:image`);
    assert.doesNotMatch(html, /rel="canonical" href="https:\/\/1ststep\.ai/, `${page.path} canonical should use www`);
  }
});

test("homepage organization schema still names the consultancy and its services", async () => {
  const html = await source("index.html");
  const data = jsonLdBlocks(html)[0];
  const organization = data["@graph"].find((item) => item["@type"] === "Organization");
  assert.equal(organization.name, "1stStep.ai");
  assert.ok(organization.makesOffer.some((offer) => offer.url.includes("/services/websites.html")));
  assert.ok(organization.makesOffer.some((offer) => offer.url.includes("/services/internal-tools.html")));
  assert.match(html, /href="\/book\/"/);
  assert.match(html, /href="\/fit-check\/"/);
  assert.match(html, /href="\/tools\/"/);
});

test("sitemap lists business conversion pages and leaves tools URLs in place", async () => {
  const sitemap = await source("public/sitemap.xml");
  for (const loc of [
    "https://www.1ststep.ai/",
    "https://www.1ststep.ai/journey/",
    "https://www.1ststep.ai/book/",
    "https://www.1ststep.ai/fit-check/",
    "https://www.1ststep.ai/os",
    "https://www.1ststep.ai/app-idea-viability-checker.html",
    "https://www.1ststep.ai/startup-launch-checker/",
    "https://www.1ststep.ai/campaigns/outgrown-website/",
    "https://www.1ststep.ai/services/websites.html",
    "https://www.1ststep.ai/services/mvp-builds.html",
    "https://www.1ststep.ai/services/app-builds.html",
    "https://www.1ststep.ai/services/internal-tools.html",
    "https://www.1ststep.ai/services/revenue-systems.html",
    "https://www.1ststep.ai/tools/",
    "https://www.1ststep.ai/tools/auto-model-router/",
    "https://www.1ststep.ai/privacy.html",
    "https://www.1ststep.ai/terms.html",
    "https://www.1ststep.ai/campaigns/morris-county-free-website/",
  ]) {
    assert.match(sitemap, new RegExp(loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sitemap, /<lastmod>2026-09-20<\/lastmod>/);
  assert.doesNotMatch(sitemap, /https:\/\/1ststep\.ai\//);
  assert.doesNotMatch(sitemap, /\/admin\/|\/demos\/|\/book\/confirmed\/|\/tools\/visual-renders\//);
});

test("llms.txt summarizes owner services and key URLs for LLM crawlers", async () => {
  const llms = await source("public/llms.txt");
  assert.match(llms, /websites, apps, internal tools, and practical AI that get leads/i);
  assert.match(llms, /https:\/\/www\.1ststep\.ai\/journey\//);
  assert.match(llms, /https:\/\/www\.1ststep\.ai\/fit-check\//);
  assert.match(llms, /https:\/\/www\.1ststep\.ai\/book\//);
  assert.match(llms, /https:\/\/www\.1ststep\.ai\/services\/websites\.html/);
  assert.match(llms, /https:\/\/www\.1ststep\.ai\/tools\//);
  assert.match(llms, /does not guarantee revenue, rankings/);
});

test("www canonicals and sitemap robots stay consistent", async () => {
  const robots = await source("public/robots.txt");
  const rootRobots = await source("robots.txt");
  const rootSitemap = await source("sitemap.xml");
  assert.match(robots, /Sitemap: https:\/\/www\.1ststep\.ai\/sitemap\.xml/);
  assert.match(rootRobots, /Sitemap: https:\/\/www\.1ststep\.ai\/sitemap\.xml/);
  assert.doesNotMatch(rootSitemap, /https:\/\/1ststep\.ai\//);
  for (const path of ["privacy.html", "terms.html"]) {
    const html = await source(path);
    assert.match(html, new RegExp(`rel="canonical" href="https://www.1ststep.ai/${path}"`));
    assert.match(html, /name="twitter:card"/);
    assert.match(html, /href="\/services\/websites\.html"/);
    assert.match(html, /href="\/fit-check\/"/);
    assert.match(html, /href="\/book\/"/);
    assert.match(html, /href="\/tools\/"/);
  }
});

test("this SEO pass does not rewrite Tools pages owned by the Tools SEO PR", async () => {
  const hub = await source("tools/index.html");
  const router = await source("tools/auto-model-router/index.html");
  assert.doesNotMatch(hub, /Websites That Get Leads|Hire to Build an MVP|Internal Tools for Small Business/);
  assert.doesNotMatch(router, /Websites That Get Leads|Hire to Build an MVP|Internal Tools for Small Business/);
  assert.match(hub, /href="\/tools\/auto-model-router\/"/);
  assert.match(router, /href="\/tools\/"/);
});
