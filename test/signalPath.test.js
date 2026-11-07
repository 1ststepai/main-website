import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DURATION, SECTION_STATES, STAGES, TIMELINE, currentOf, reachAt, reachForStep } from "../src/signal-path.js";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const RESOLVED = ["repair", "signal", ...STAGES, "loop"];

test("the homepage states the offer in HTML and leaves the signal-path figure unmounted", async () => {
  const html = await source("index.html");
  const hero = html.slice(html.indexOf('<section class="hero'), html.indexOf("</section>"));
  assert.match(hero, /id="hero-title"/);
  assert.match(hero, /Get more from the business you <em>already have\.<\/em>/);
  assert.match(hero, /Book a free 30-minute call/);
  assert.doesNotMatch(html, /id="signal-path"|Deploy Our OS/i);
  assert.doesNotMatch(html, /<h4>Capture<\/h4>|Illustrative example, not a client's data/);
  const js = await source("src/home-v2.js");
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(js, /staticFallback|new Lenis/);
});

test("reduced motion is a designed static state with step-through, not a disabled animation", async () => {
  const script = await source("src/signal-path.js");
  const css = await source("src/outcome-home.css");
  assert.match(script, /if \(reducedMotion\(\)\) \{ showResolved\(\); \}/);
  assert.match(script, /onReducedMotionChange\(\(reduce\) => \{ if \(reduce\) showResolved\(\); \}\)/);
  assert.match(script, /button\.disabled = false;[\s\S]*showStep\(i\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /@media\(max-width:1279px\) \{ \.sp-rail \{ display:none; \} \}/);
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
