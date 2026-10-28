/**
 * Title checklist score (port of the v2 prototype in postpath-content/scorer-proto/score.py).
 * A checklist score with tips: hand-set weights, not a prediction, and not a vidIQ score.
 * Search-suggest only when a fetcher is passed; Google Trends is off unless opts.trends is given.
 */
const STOP = new Set("a an the and or of for to in on with my your our is are be from how why what which who i you it this that vs can will not just do does at by as me we own built build building made make get got be specific new quick live using use testing watch stop meet".split(" "));
const HYPE = new Set("insane crazy shocking unbelievable ultimate secret secrets mindblowing mind-blowing epic best ever must insanely destroy destroyed exposed literally guaranteed".split(" "));
const CLICKBAIT = [/you won'?t believe/, /gone wrong/, /\bdo(n'?t| not) miss\b/, /\?\?+/, /!!+/, /click here/, /watch till the end/, /\bomg\b/];
const HOOK_START = /^(i |i'm |i've |my |how |why |what |which |watch |stop |building |testing |using |meet )/;
export const BRANDS = ["chatgpt", "claude", "gemini", "perplexity", "capcut", "kilo", "1ststep.ai", "granola", "lovable", "canva", "clawdbot", "python", "node.js", "tiktok", "amazon", "linkedin", "chrome", "windows", "postpath", "openai", "grok", "notion", "zapier"];
const PROMISE = /\b(how|why|what|to|for|without|from|into|in \d+|walkthrough|demo|beginners?|step by step|tutorial|guide|which)\b/;
const ANCHOR = "ai tools";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function keywordPhrase(core) {
  const w = core.slice(0, 45).toLowerCase().match(/[A-Za-z0-9.+'-]+/g) || [];
  return w.filter((x) => !STOP.has(x) && x.length > 1).slice(0, 3);
}

/** Brands found, in title order, with positions. */
export function brandsIn(low) {
  const found = [];
  for (const b of BRANDS) {
    const m = new RegExp(`(?<![\\w.])${esc(b)}(?![\\w])`).exec(low);
    if (m) found.push({ name: b, start: m.index, end: m.index + b.length });
  }
  return found.sort((x, y) => x.start - y.start);
}

/**
 * Fix over v2: brands that ARE the topic ("Amazon Seller Chrome Extension With Claude") aren't a tool list.
 * It's a list only when brands sit next to each other with just separators (, & + / and or vs) between them.
 */
export function brandsAreListed(low, found) {
  if (found.length < 2) return false;
  let adjacent = 0;
  for (let i = 1; i < found.length; i += 1) {
    const gap = low.slice(found[i - 1].end, found[i].start);
    if (/^[\s,&+/|:-]*(and|or|vs\.?|versus)?[\s,&+/|:-]*$/.test(gap)) adjacent += 1;
  }
  return adjacent >= 1 && adjacent >= Math.ceil((found.length - 1) / 2);
}

/** A leading brand that's part of a compound topic ("Amazon Seller ...", "Chrome Extension ...") is the subject, not a name-drop. */
function brandIsTopic(low, brand) {
  const next = (low.slice(brand.end).match(/^\s+([a-z0-9'-]+)/) || [])[1];
  return Boolean(next && !STOP.has(next) && !BRANDS.includes(next));
}

function demand(words, fetch) {
  if (!words.length) return Promise.resolve([0, {}]);
  const cands = [words.slice(0, 2).join(" "), ...(words.length === 3 ? [words.join(" ")] : []), words[0]];
  const weights = cands.length === 3 ? [1, 1, 0.5] : [1, 0.5];
  return (async () => {
    const detail = {};
    let best = 0;
    let unavailable = true;
    for (let i = 0; i < weights.length; i += 1) {
      const ph = cands[i];
      let sg = null;
      try {
        sg = await fetch(ph);
      } catch {
        sg = null;
      }
      if (!Array.isArray(sg)) {
        detail[ph] = null;
        continue;
      }
      unavailable = false;
      const hits = sg.map((s, idx) => (String(s).includes(ph) ? idx : -1)).filter((x) => x >= 0);
      const pos = hits.length ? hits[0] : null;
      const v = weights[i] * ((Math.min(hits.length, 8) / 8) * 0.7 + (pos !== null ? 0.3 * (1 - pos / 10) : 0));
      detail[ph] = { completions: hits.length, first_rank: pos };
      best = Math.max(best, v);
    }
    return [unavailable ? null : best, detail];
  })();
}

/** scoreTitle(title, { fetcher, trends, a, b }) -> { score, feedback, signals, label } */
export async function scoreTitle(title, opts = {}) {
  const o = { fetcher: null, trends: null, a: 1, b: 0, ...opts };
  const fb = [];
  const sig = {};
  const core = String(title || "").replace(/#\w+/g, "").trim();
  const L = core.length;
  const low = core.toLowerCase();
  const words = core.split(/\s+/).filter(Boolean);
  const wc = words.length;

  sig.length = L;
  let ln;
  if (L >= 40 && L <= 70) {
    ln = 25;
    fb.push(`Length ${L} characters: in the 40-70 sweet spot.`);
  } else {
    const d = L < 40 ? 40 - L : L - 70;
    ln = Math.max(0, 25 - d * 0.8);
    fb.push(`Length ${L} characters: ${L < 40 ? "short" : "long"}; aim for 40-70 and put the point first.`);
  }

  let h = 0;
  if (HOOK_START.test(low) || /\b(how|why|what) to\b/.test(low.slice(0, 45))) { h += 10; fb.push("Strong opener (first person, how/why, or an action verb)."); }
  if (/\bi (built|asked|tried|made|tested)\b|\bmy own\b/.test(low)) { h += 6; fb.push("Personal \"I built / I tried\" story hook."); }
  if (/\d/.test(core)) { h += 4; fb.push("Uses a number."); }
  if (core.includes("?") || /\b(vs|versus|before|without|stop|not just|replace)\b/.test(low)) { h += 5; fb.push("Has a curiosity or contrast element."); }
  if (core.slice(0, 45).includes(":")) h += 3;
  h = Math.min(h, 25);
  if (h < 8) fb.push("Weak hook: try first person, a how/why, a number, or a contrast.");

  const kw = keywordPhrase(core);
  sig.keyword = kw.slice(0, 2).join(" ");
  const tp = (kw.length && low.indexOf(kw[0]) < 40 ? 14 : 0) + (core.slice(0, 40).split(/\s+/).filter(Boolean).length >= 3 ? 6 : 0);
  const rd = wc >= 6 && wc <= 12 ? 15 : Math.max(0, 15 - 2 * Math.min(Math.abs(wc - 6), Math.abs(wc - 12)));
  if (rd < 15) fb.push(`${wc} words; 6-12 reads fastest.`);

  const [dm, det] = o.fetcher ? await demand(kw.slice(0, 3), o.fetcher) : [null, {}];
  sig.suggest = det;
  sig.demand = dm;
  let sd;
  if (dm === null) {
    sd = 7.5;
    fb.push(o.fetcher ? "Search suggestions unavailable; search signal neutral." : "Search check is off; search signal neutral.");
  } else {
    sd = 15 * dm;
    fb.push(`Search demand ${dm.toFixed(2)}/1 for "${sig.keyword}" (YouTube autocomplete).${dm > 0.4 ? "" : " Consider a more-searched phrase."}`);
  }
  let tr = null;
  if (o.trends && sig.keyword) {
    try { tr = await o.trends(sig.keyword); } catch { tr = null; }
    if (typeof tr !== "number") tr = null;
  }
  sig.trends_rel = tr;
  if (tr !== null) {
    sd += Math.max(-3, Math.min(3, (3 * (Math.min(tr, 2) - 0.5)) / 1.5));
    fb.push(`Google Trends (YouTube) interest ${tr.toFixed(2)}x vs "${ANCHOR}".`);
  }

  let pen = 0;
  const hype = (low.match(/[a-z'-]+/g) || []).filter((w) => HYPE.has(w));
  if (hype.length) { pen += 6 * hype.length; fb.push(`Hype words: ${hype.join(", ")}.`); }
  const caps = words.filter((w) => w.length > 3 && /^[A-Za-z]+$/.test(w) && w === w.toUpperCase());
  if (caps.length) { pen += 4 * caps.length; fb.push(`ALL CAPS words: ${caps.join(", ")}.`); }
  if (CLICKBAIT.some((p) => p.test(low))) { pen += 10; fb.push("Clickbait phrasing."); }

  const found = brandsIn(low);
  const br = found.map((f) => f.name);
  sig.brands = br;
  const listed = brandsAreListed(low, found);
  sig.brands_listed = listed;
  let bp = 0;
  if (listed) {
    bp += Math.min(12, 4 * (br.length - 1) + 2);
    fb.push(`Lists ${br.length} tool or brand names (${br.join(", ")}): lead with the outcome, not the tools.`);
  }
  const lead = found.find((f) => f.start === 0);
  const leadIsTopic = lead && !listed && brandIsTopic(low, lead);
  if (lead && !leadIsTopic) {
    if (!PROMISE.test(low.slice(0, Math.max(45, lead.name.length + 25)))) {
      bp += 6;
      fb.push(`Leads with "${lead.name}" without a clear promise.`);
    } else if (br.length === 1) {
      bp += 2;
      fb.push(`Leads with "${lead.name}"; fine with a promise, but the benefit usually reads stronger first.`);
    }
  }
  sig.brand_penalty = bp;
  pen += bp;

  const raw = Math.max(0, Math.min(100, ln + h + tp + rd + sd - pen));
  sig.raw = raw;
  sig.parts = { length: ln, hook: h, topic: tp, readability: rd, search: Math.round(sd * 100) / 100, penalty: pen };
  return { score: Math.round(Math.max(0, Math.min(100, o.a * raw + o.b))), feedback: fb, signals: sig, label: "Checklist score with tips" };
}
