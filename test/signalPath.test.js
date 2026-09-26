import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DURATION, SECTION_STATES, STAGES, TIMELINE, currentOf, reachAt, reachForStep } from "../src/signal-path.js";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const RESOLVED = ["repair", "signal", ...STAGES, "loop"];

test("the hero explains the offer and converts in plain HTML, before any script runs", async () => {
  const html = await source("index.html");
  const hero = html.slice(html.indexOf('<section class="hero'), html.indexOf("</section>"));
  assert.match(hero, /<h1 id="hero-title">Build the system <br>your business <br><em>is missing\.<\/em><\/h1>/);
  assert.match(hero, /<a class="button button-primary" href="\/fit-check\/" data-fsai-placement="hero">/);
  // Every stage of the Signal Path is readable, crawlable text, not only SVG or animation frames.
  const stages = [...hero.matchAll(/<li data-stage="(\w+)"><button[^>]*><span>\d\d<\/span> ([^<]+)<\/button>[\s\S]*?<p class="sp-desc">([^<]+)<\/p><\/li>/g)];
  assert.deepEqual(stages.map((m) => m[1]), STAGES);
  assert.deepEqual(stages.map((m) => m[2]), ["Capture", "Qualify", "Route", "Follow up", "Convert", "Measure"]);
  for (const m of stages) assert.ok(m[3].length > 30, `${m[1]} needs a real description`);
  assert.match(hero, /<figure class="workflow-figure signal-path[^"]*" id="signal-path" aria-labelledby="sp-title">/);
  assert.match(hero, /<svg class="sp-map"[^>]*aria-hidden="true"/);
  assert.match(hero, /ILLUSTRATIVE WORKFLOW · NOT LIVE DATA/);
  assert.match(hero, /<p class="sp-announce" aria-live="polite"><\/p>/);
});

test("Fit Check stays primary and Begin Your Journey is a visible secondary path", async () => {
  const html = await source("index.html");
  const hero = html.slice(html.indexOf('<section class="hero'), html.indexOf("</section>"));
  const primary = hero.indexOf('class="button button-primary" href="/fit-check/"');
  const journey = hero.indexOf('href="/journey/"');
  assert.ok(primary > -1 && journey > primary, "Journey follows the primary CTA");
  assert.match(hero, /<p class="hero-secondary">Need to understand what&rsquo;s broken first\? <a href="\/journey\/" data-fsai-event="journey_start_click" data-fsai-placement="hero_secondary">Begin Your Journey/);
  assert.equal((html.match(/class="button button-primary"/g) || []).length, 2, "only the hero and final Fit Check CTAs are primary buttons");
  assert.doesNotMatch(html, /class="button[^"]*" href="\/journey\/"/);
  const closing = html.slice(html.indexOf('<section class="closing"'));
  assert.match(closing, /href="\/fit-check\/" data-fsai-placement="home_final"[\s\S]*href="\/journey\/"[^>]*data-fsai-placement="home_final_secondary"/);
  assert.doesNotMatch(html, /Deploy Our OS/i);
});

test("the figure ships resolved, and a failed or slow animation returns to the resolved system", async () => {
  const html = await source("index.html");
  const figureClass = html.match(/<figure class="([^"]+)" id="signal-path"/)[1].split(" ");
  for (const name of RESOLVED) assert.ok(figureClass.includes(`reach-${name}`), `no-JS markup includes reach-${name}`);
  const start = html.search(/<\/figure>\r?\n<script>/);
  assert.ok(start > -1, "the pending-frame script sits directly after the figure");
  const inline = html.slice(start, html.indexOf("</script>", start));
  assert.match(inline, /prefers-reduced-motion: reduce\)'\)\.matches\) return;/, "reduced motion never enters the pending frame");
  assert.match(inline, /setTimeout\(function \(\) \{ if \(figure\.hasAttribute\('data-pending'\)\) \{ figure\.className = resolved;/);
  const home = await source("src/outcome-home.js");
  assert.match(home, /import\('\.\/signal-path\.js'\)/);
  assert.match(home, /\.catch\(\(\) => \{[\s\S]*figure\.classList\.add\(\.\.\.RESOLVED\.split\(' '\)\)/);
  for (const name of RESOLVED) assert.match(home, new RegExp(`reach-${name}\\b`));
});

test("reduced motion is a designed static state with step-through, not a disabled animation", async () => {
  const script = await source("src/signal-path.js");
  const css = await source("src/outcome-home.css");
  assert.match(script, /if \(reducedMotion\(\)\) \{ showResolved\(\); \}/);
  assert.match(script, /onReducedMotionChange\(\(reduce\) => \{ if \(reduce\) showResolved\(\); \}\)/);
  assert.match(script, /button\.disabled = false;[\s\S]*showStep\(i\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@media\(max-width:1179px\) \{ \.sp-rail \{ display:none; \} \}/);
});

test("the timeline resolves once, in order, in about six seconds", () => {
  assert.ok(DURATION >= 5.5 && DURATION <= 6.5);
  assert.deepEqual(reachAt(0), []);
  assert.deepEqual(reachAt(DURATION), RESOLVED);
  let previous = -1;
  for (const name of RESOLVED) { assert.ok(TIMELINE[name] > previous, `${name} follows the previous state`); previous = TIMELINE[name]; }
  assert.equal(currentOf(reachAt(TIMELINE.route)), "route");
  assert.equal(currentOf(reachAt(TIMELINE.signal)), "");
});

test("manual steps and scroll states only ever add system layers", () => {
  assert.deepEqual(reachForStep(0), ["repair", "signal", "capture"]);
  assert.deepEqual(reachForStep(STAGES.length - 1), RESOLVED);
  const order = ["problems", "work", "services", "how", "reviews", "start"];
  assert.deepEqual(Object.keys(SECTION_STATES), order);
  assert.deepEqual(SECTION_STATES.problems.reach, []);
  for (let i = 1; i < order.length; i++) {
    const before = SECTION_STATES[order[i - 1]].reach, after = SECTION_STATES[order[i]].reach;
    assert.ok(before.every((name) => after.includes(name)), `${order[i]} keeps every layer from ${order[i - 1]}`);
  }
  assert.deepEqual(SECTION_STATES.start.reach, RESOLVED);
});
