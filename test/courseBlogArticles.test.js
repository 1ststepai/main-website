import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const slugs = ["how-to-start-using-ai-in-your-small-business", "ai-for-business-privacy-and-checking-answers"];

for (const slug of slugs) {
  test(`course article ${slug} has consistent metadata, visible FAQs and discovery paths`, async () => {
    const html = await source(`blog/${slug}/index.html`);
    assert.match(html, /<body class="course-article">/);
    assert.ok(html.includes('href="/src/blog-course-articles.css"'));
    assert.ok(!html.includes('home-v2.css'));
    const byline = html.match(/<p class="blog-byline">([\s\S]*?)<\/p>/)[1];
    assert.doesNotMatch(byline, /\bDraft\b/i);
    assert.ok(html.includes("<!--course-article-chrome:header-->"));
    assert.ok(html.includes("<!--course-article-chrome:footer-->"));
    const header = await source("src/partials/course-article-header.html");
    const footer = await source("src/partials/course-article-footer.html");
    assert.match(header, /<a class="brand" href="\/"[^>]*>[\s\S]*?<img[^>]+firststep-logo-transparent-cleaned\.png[\s\S]*?class="wordmark">1ststep<i>\.ai<\/i><\/span><\/a>/);
    assert.match(header, /<a class="back-home" href="\/">Back to 1ststep\.ai<\/a>/);
    for (const [href, label] of [["/privacy.html", "Privacy"], ["/", "Back to 1ststep.ai"], ["/course/", "Course"], ["/course/library/", "Prompt library"]]) {
      assert.ok(footer.includes(`<a href="${href}">${label}</a>`));
    }
    const url = `https://www.1ststep.ai/blog/${slug}/`;
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.ok(html.includes(`<link rel="canonical" href="${url}"`));
    assert.ok(html.includes(`property="og:url" content="${url}"`));
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const article = schema["@graph"].find((item) => item["@type"] === "Article");
    assert.equal(article.datePublished, "2026-11-11");
    assert.equal(article.author.name, "Evan Pancis");
    assert.equal(article.url, url);
    assert.ok(html.includes(`<h1>${article.headline}</h1>`));
    const faq = schema["@graph"].find((item) => item["@type"] === "FAQPage");
    for (const item of faq.mainEntity) {
      assert.ok(html.includes(`<h3>${item.name}</h3><p>${item.acceptedAnswer.text}</p>`));
    }
    for (const path of ["/course/library/", "/course/", `/blog/${slugs.find((item) => item !== slug)}/`]) {
      assert.ok(html.includes(`href="${path}"`));
    }
    assert.match(html, /Examples in this article are fictional and written for teaching\./);
    for (const file of ["sitemap.xml", "public/sitemap.xml"]) {
      assert.ok((await source(file)).includes(`<loc>${url}</loc><lastmod>2026-11-11</lastmod>`));
    }
    assert.ok((await source("blog/index.html")).includes(`href="/blog/${slug}/"`));
    assert.ok((await source("vite.config.js")).includes(`"blog/${slug}/index.html"`));
    const rewrites = JSON.parse(await source("vercel.json")).rewrites;
    assert.ok(rewrites.some((item) => item.source === `/blog/${slug}` && item.destination === `/blog/${slug}/index.html`));
  });
}
