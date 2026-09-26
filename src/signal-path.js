// The Signal Path: one illustrative inquiry moves from source to measured outcome, then
// attribution returns to the source. Every visual state is a class on the figure
// (reach-*), so the animation, the step-through and the static fallback share one model.
import { createClock, easeInOut, onReducedMotionChange, reducedMotion, watchVisibility } from './motion/core.js';

export const STAGES = ['capture', 'qualify', 'route', 'follow', 'convert', 'measure'];
const STATION_X = { capture: 132, qualify: 208, route: 284, follow: 360, convert: 432, measure: 494 };
const BUS_END_X = 494;

// Seconds. The sequence resolves once, at ~6s, and rests.
export const TIMELINE = {
  repair: 0.9, signal: 1.5,
  capture: 2.1, qualify: 2.7, route: 3.3, follow: 3.9, convert: 4.5, measure: 5.1,
  loop: 6.1,
};
export const DURATION = 6.2;
const ALL = Object.keys(TIMELINE);

export function reachAt(t) {
  return ALL.filter((name) => t >= TIMELINE[name]);
}

// Manual inspection of stage i (0-based) shows the system online up to and including that stage.
export function reachForStep(i) {
  const reach = ['repair', 'signal', ...STAGES.slice(0, i + 1)];
  if (i === STAGES.length - 1) reach.push('loop');
  return reach;
}

export function currentOf(reach) {
  return [...STAGES].reverse().find((stage) => reach.includes(stage)) || '';
}

// Scroll narrative for the sections that follow the hero.
export const SECTION_STATES = {
  problems: { reach: [], status: 'Disconnected · leads arrive, handoffs break' },
  work: { reach: ['repair'], status: 'Architecture connected' },
  services: { reach: ['repair', 'signal', 'capture', 'qualify', 'route'], status: 'Capture · qualify · route online' },
  how: { reach: ['repair', 'signal', 'capture', 'qualify', 'route', 'follow', 'convert'], status: 'Follow-up fires · outcome recorded' },
  reviews: { reach: reachForStep(4).concat('measure'), status: 'Result measured' },
  start: { reach: reachForStep(5), status: 'Loop closed · attribution returns to the source' },
};

function applyReach(element, reach) {
  for (const name of ALL) element.classList.toggle(`reach-${name}`, reach.includes(name));
  element.dataset.current = currentOf(reach);
}

export function init() {
  const figure = document.getElementById('signal-path');
  if (!figure) return;
  const replay = figure.querySelector('#replay');
  const pause = figure.querySelector('#pause');
  const announce = figure.querySelector('.sp-announce');
  const steps = [...figure.querySelectorAll('.sp-step')];
  const route = figure.querySelector('#sp-route');
  const back = figure.querySelector('#sp-return');
  const [token, returnToken] = figure.querySelectorAll('.sp-token');
  const stagesList = figure.querySelector('.sp-stages');
  const map = figure.querySelector('.sp-map');

  const routeLength = route.getTotalLength();
  const backLength = back.getTotalLength();
  // The bus is horizontal after the source curve, so a station's distance is direct.
  const lengthAt = (x) => routeLength - (BUS_END_X - x);
  const keys = [[TIMELINE.signal, 0], ...STAGES.map((s) => [TIMELINE[s], lengthAt(STATION_X[s])])];

  function place(circle, path, length) {
    const point = path.getPointAtLength(length);
    circle.setAttribute('cx', point.x.toFixed(1));
    circle.setAttribute('cy', point.y.toFixed(1));
  }

  function tokenAt(t) {
    if (t < TIMELINE.signal) return;
    for (let k = 1; k < keys.length; k++) {
      const [t0, l0] = keys[k - 1], [t1, l1] = keys[k];
      if (t <= t1) return place(token, route, l0 + (l1 - l0) * easeInOut((t - t0) / (t1 - t0)));
    }
    place(token, route, keys[keys.length - 1][1]);
  }

  function returnAt(t) {
    const p = Math.min(1, Math.max(0, (t - TIMELINE.measure) / (TIMELINE.loop - TIMELINE.measure)));
    place(returnToken, back, backLength * easeInOut(p));
    figure.style.setProperty('--sp-return', (1 - easeInOut(p)).toFixed(3));
  }

  // Mobile/tablet: the vertical path fills to the current stage.
  function fillTo(stage) {
    const item = stage && stagesList.querySelector(`[data-stage="${stage}"]`);
    if (!item) { stagesList.style.removeProperty('--sp-fill'); return; } // CSS decides: empty while disconnected, full at rest.
    const height = stagesList.offsetHeight || 1;
    const y = item.offsetTop + 14;
    stagesList.style.setProperty('--sp-fill', (y / height).toFixed(3));
  }

  let lastReach = '';
  function render(t) {
    const reach = reachAt(t);
    const key = reach.join();
    if (key !== lastReach) {
      lastReach = key;
      applyReach(figure, reach);
      markCurrent(figure.dataset.current);
    }
    if (map.getClientRects().length) { tokenAt(t); returnAt(t); }
  }

  function markCurrent(stage) {
    for (const li of stagesList.children) {
      const on = li.dataset.stage === stage;
      if (on) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    }
    fillTo(stage);
  }

  let mode = 'idle'; // idle | playing | paused | done | manual
  let userPaused = false, visible = false;
  const clock = createClock(DURATION, render, () => { mode = 'done'; markCurrent(''); figure.dataset.current = ''; controls(); });

  function controls() {
    replay.hidden = false;
    replay.textContent = reducedMotion() ? 'Show full system' : 'Replay ↻';
    pause.hidden = false;
    pause.disabled = mode === 'done' || mode === 'manual' || mode === 'idle';
    pause.textContent = mode === 'paused' ? 'Resume' : 'Pause';
    pause.setAttribute('aria-pressed', String(mode === 'paused'));
    figure.classList.toggle('is-playing', mode === 'playing' || mode === 'paused');
  }

  function sync() {
    if (mode === 'playing' && (!visible || document.hidden)) clock.pause();
    if (mode === 'playing' && visible && !document.hidden) clock.play();
  }

  function start() {
    figure.classList.remove('is-manual');
    mode = 'playing'; userPaused = false;
    clock.restart();
    sync(); controls();
  }

  function showStep(i) {
    clock.pause();
    mode = 'manual';
    figure.classList.add('is-manual');
    const reach = reachForStep(i);
    applyReach(figure, reach);
    lastReach = '';
    markCurrent(STAGES[i]);
    const stationLength = lengthAt(STATION_X[STAGES[i]]);
    place(token, route, stationLength);
    figure.style.setProperty('--sp-return', i === STAGES.length - 1 ? '0' : '1');
    place(returnToken, back, i === STAGES.length - 1 ? backLength : 0);
    const item = stagesList.children[i];
    announce.textContent = `Step ${i + 1} of ${STAGES.length}, ${item.querySelector('.sp-step').textContent.replace(/^\d+\s*/, '')}: ${item.querySelector('.sp-result').textContent}.`;
    controls();
  }

  function showResolved() {
    clock.finish();
    mode = 'done';
    applyReach(figure, ALL);
    figure.dataset.current = '';
    markCurrent('');
    controls();
  }

  steps.forEach((button, i) => {
    button.disabled = false;
    button.addEventListener('click', () => showStep(i));
  });
  replay.addEventListener('click', () => (reducedMotion() ? showResolved() : start()));
  pause.addEventListener('click', () => {
    if (mode === 'playing') { mode = 'paused'; userPaused = true; clock.pause(); }
    else if (mode === 'paused') { mode = 'playing'; userPaused = false; sync(); }
    controls();
  });
  document.addEventListener('visibilitychange', sync);
  onReducedMotionChange((reduce) => { if (reduce) showResolved(); });

  figure.removeAttribute('data-pending');
  figure.classList.add('is-interactive');
  window.addEventListener('resize', () => fillTo(figure.dataset.current), { passive: true });

  if (reducedMotion()) { showResolved(); }
  else {
    render(0); controls();
    watchVisibility(figure, (isVisible) => {
      visible = isVisible;
      if (isVisible && mode === 'idle') start();
      else if (!userPaused) sync();
    });
  }

  initRail(figure);
}

// Desktop only: a slim status rail carries the same system through the sections below the hero.
function initRail(figure) {
  const wide = matchMedia('(min-width: 1280px)');
  const sections = Object.keys(SECTION_STATES).map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;

  const rail = document.createElement('div');
  rail.className = 'sp-rail';
  rail.setAttribute('aria-hidden', 'true');
  const names = ['Source', 'Capture', 'Qualify', 'Route', 'Follow up', 'Convert', 'Measure'];
  const keys = ['source', ...STAGES];
  rail.innerHTML = `<div class="container sp-rail-inner"><span class="sp-rail-title">THE SIGNAL PATH</span><ol>${
    names.map((name, i) => `<li data-stage="${keys[i]}"><i></i>${name}</li>`).join('')
  }</ol><span class="sp-rail-status"></span></div>`;
  document.body.append(rail);
  const status = rail.querySelector('.sp-rail-status');

  let heroVisible = true, active = null;
  const update = () => {
    const show = wide.matches && !heroVisible && active;
    rail.classList.toggle('is-visible', Boolean(show));
    if (!active) return;
    const state = SECTION_STATES[active];
    applyReach(rail, state.reach);
    status.textContent = state.status;
  };

  watchVisibility(figure, (v) => { heroVisible = v; update(); }, { threshold: [0, 0.25] });
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) active = entry.target.id;
      else if (active === entry.target.id) active = null;
    }
    update();
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((section) => observer.observe(section));
  wide.addEventListener('change', update);
}
