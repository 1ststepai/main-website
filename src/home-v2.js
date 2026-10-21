(() => {
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOB = matchMedia('(max-width: 900px)').matches;
const FINE = matchMedia('(pointer: fine)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const media = (file) => `/home-v2/${file}`;

const hv = $('.hero-vid');
if (MOB && hv) hv.poster = hv.dataset.poster9;
const startHero = () => {
  if (!hv || RM || hv.src) return;
  hv.src = MOB ? hv.dataset.src9 : hv.dataset.src16;
  hv.play().catch(() => {});
};
const snd = $('.sound');
snd?.addEventListener('click', () => {
  if (!hv.src) startHero();
  hv.muted = !hv.muted;
  if (!hv.muted) { hv.currentTime = 0; hv.play().catch(() => {}); }
  snd.textContent = hv.muted ? '▶ Watch with sound' : '■ Mute';
  snd.setAttribute('aria-pressed', String(!hv.muted));
});
if (!RM) requestAnimationFrame(() => requestAnimationFrame(startHero));

const mk = $('.mk');
if (MOB && mk) mk.dataset.v = 'm';
const [COLS, ROWS] = MOB ? [4, 8] : [10, 6];
const build = (el, img) => {
  if (!el || el.childElementCount) return;
  el.style.gridTemplateColumns = `repeat(${COLS},1fr)`;
  el.style.gridTemplateRows = `repeat(${ROWS},1fr)`;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = document.createElement('div');
    t.className = 'tile';
    t.style.backgroundImage = `url(${img})`;
    t.style.backgroundSize = `${COLS * 100}% ${ROWS * 100}%`;
    t.style.backgroundPosition = `${COLS > 1 ? c / (COLS - 1) * 100 : 0}% ${ROWS > 1 ? r / (ROWS - 1) * 100 : 0}%`;
    t.dataset.c = c;
    t.dataset.r = r;
    el.appendChild(t);
  }
};
const v = MOB ? 'mobile' : 'desktop';
let makeoverReady = false;
const mountTiles = () => {
  if (makeoverReady) return;
  makeoverReady = true;
  if (!RM) build($('.before-tiles'), media(`before_${v}.webp`));
  build($('.after-tiles'), media(`after_${v}.webp`));
};

$$('.kinetic > *').forEach((w) => {
  const m = document.createElement('span');
  m.className = 'w-mask';
  w.replaceWith(m);
  m.appendChild(w);
});

const staticFallback = () => {
  mountTiles();
  $$('.node').forEach((n) => n.classList.add('lit'));
  const pct = $('.mk-pct');
  if (pct) pct.textContent = '100%';
  $$('.mk-steps li').forEach((l) => l.classList.add('on'));
  const bar = $('.mk-meter em');
  if (bar) bar.style.width = '100%';
};

if (RM || !window.gsap) {
  staticFallback();
  return;
}
gsap.registerPlugin(ScrollTrigger);
mountTiles();

const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, syncTouch: false });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  if (id.length > 1 && $(id)) { e.preventDefault(); lenis.scrollTo(id, { offset: 0 }); }
}));

gsap.from('.kinetic .w-mask > *', { yPercent: 110, rotate: 4, duration: 1.1, ease: 'expo.out', stagger: .09, delay: .2 });
gsap.from('.reveal-up', { y: 30, opacity: 0, duration: 1, ease: 'power3.out', stagger: .15, delay: .9 });
gsap.from('.nav', { y: -30, opacity: 0, duration: .8, delay: .4 });
gsap.to('.hero-vid', { scale: 1.25, yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
gsap.to('.hero-in', { yPercent: -25, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: true } });

const bt = $$('.before-tiles .tile');
const at = $$('.after-tiles .tile');
const cx = (COLS - 1) / 2;
const cy = (ROWS - 1) / 2;
const rnd = gsap.utils.random;
const steps = $$('.mk-steps li');
const pct = $('.mk-pct');
const bar = $('.mk-meter em');
const cta = $('.snap-cta');
gsap.timeline({
  defaults: { ease: 'power2.inOut' },
  scrollTrigger: {
    trigger: '.mk',
    start: 'top top',
    end: MOB ? '+=1600' : '+=2800',
    scrub: MOB ? .6 : 1,
    pin: '.mk-pin',
    anticipatePin: 1,
    onUpdate: (s) => {
      const p = s.progress;
      if (pct) pct.textContent = `${Math.round(p * 100)}%`;
      if (bar) bar.style.width = `${p * 100}%`;
      steps.forEach((l, i) => l.classList.toggle('on', p >= [0, .22, .5, .82][i]));
      cta?.classList.toggle('pulse', p > .95);
    },
  },
})
  .to('.flaw', { opacity: 1, scale: 1, duration: .12, stagger: .05, ease: 'back.out(3)', startAt: { scale: .4 } }, 0)
  .to('.b-view', { x: 0, duration: .1 }, .25)
  .to('.flaw', { opacity: 0, y: -20, duration: .08, stagger: .02 }, .3)
  .to(bt, {
    duration: .35,
    x: (i) => (bt[i].dataset.c - cx) * rnd(30, 90) + rnd(-40, 40),
    y: (i) => (bt[i].dataset.r - cy) * rnd(30, 90) + rnd(60, 220),
    rotation: () => rnd(-70, 70),
    scale: () => rnd(.3, .8),
    opacity: 0,
    stagger: { each: .004, from: 'center' },
  }, .32)
  .to('.browser', { backgroundColor: '#10302A', duration: .3 }, .4)
  .fromTo(at, {
    x: () => rnd(-500, 500),
    y: () => rnd(-400, 400),
    rotation: () => rnd(-90, 90),
    scale: () => rnd(.2, .6),
    opacity: 0,
  }, {
    x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, duration: .32, ease: 'power3.out', stagger: { each: .004, from: 'random' },
  }, .52)
  .fromTo(cta, { scale: 2.4, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: .08, ease: 'back.out(2.2)' }, .88)
  .fromTo('.snap-tap', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: .06 }, .93)
  .to({}, { duration: .06 });

const nodes = $$('.node');
if (!MOB) {
  const path = $('.flow-line');
  const len = path.getTotalLength();
  const dot = $('.lead-dot');
  const svg = $('.flow-svg');
  gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
  const st = { p: 0 };
  const place = () => {
    const pt = path.getPointAtLength(st.p * len);
    const r = svg.getBoundingClientRect();
    const mr = $('.flow-map').getBoundingClientRect();
    dot.style.left = `${(pt.x / 1200) * r.width + r.left - mr.left}px`;
    dot.style.top = `${(pt.y / 300) * r.height + r.top - mr.top}px`;
    path.style.strokeDashoffset = len * (1 - st.p);
    nodes.forEach((n, i) => n.classList.toggle('lit', st.p >= (i + .6) / 6.4));
    dot.textContent = st.p > .97 ? 'Booked ✓' : 'Lead';
  };
  place();
  gsap.to(st, {
    p: 1,
    ease: 'none',
    onUpdate: place,
    scrollTrigger: { trigger: '.flow', start: 'top top', end: '+=2000', scrub: .8, pin: '.flow-pin', onRefresh: place },
  });
  addEventListener('resize', place);
} else {
  ScrollTrigger.create({
    trigger: '.nodes',
    start: 'top 70%',
    end: 'bottom 50%',
    scrub: true,
    onUpdate: (s) => {
      $('.nodes').style.setProperty('--fp', `${s.progress * 100}%`);
      nodes.forEach((n, i) => n.classList.toggle('lit', s.progress >= i / 6 + .05));
    },
  });
}
gsap.from('.flow-head .h2', { y: 60, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.flow', start: 'top 70%' } });

if (!MOB) {
  const track = $('.work-track');
  const dist = () => track.scrollWidth - innerWidth + $('.work-intro').offsetWidth * .2 + 80;
  gsap.to(track, {
    x: () => -dist(),
    ease: 'none',
    scrollTrigger: { trigger: '.work', start: 'top top', end: () => `+=${dist()}`, scrub: 1, pin: '.work-pin', invalidateOnRefresh: true },
  });
  $$('.shot img').forEach((img) => gsap.fromTo(img, { xPercent: -4 }, {
    xPercent: 4,
    ease: 'none',
    scrollTrigger: { trigger: '.work', start: 'top top', end: () => `+=${dist()}`, scrub: true },
  }));
} else {
  $$('.proj').forEach((p) => gsap.from(p, { y: 80, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: p, start: 'top 85%' } }));
}
if (FINE) $$('.proj').forEach((p) => {
  const s = $('.shot', p);
  p.addEventListener('pointermove', (e) => {
    const r = s.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    s.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg) scale(1.02)`;
  });
  p.addEventListener('pointerleave', () => { s.style.transform = ''; });
});

$$('.path, .how-row, .founder > *, .v-slot, .ads-copy, .cinema').forEach((el) => gsap.from(el, {
  y: 70, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' },
}));
$$('.giant span').forEach((s, i) => gsap.from(s, {
  yPercent: 60, opacity: 0, duration: 1.2, ease: 'expo.out', delay: i * .1, scrollTrigger: { trigger: '.cta', start: 'top 75%' },
}));
gsap.from('.cinema', { rotateX: 18, transformPerspective: 1400, ease: 'none', scrollTrigger: { trigger: '.ads', start: 'top bottom', end: 'center center', scrub: true } });

const av = $('.ads-vid');
ScrollTrigger.create({
  trigger: '.cinema',
  start: 'top 80%',
  end: 'bottom top',
  onToggle: (s) => {
    if (!av) return;
    if (s.isActive) {
      if (!av.getAttribute('src')) av.src = av.dataset.src;
      av.play().catch(() => {});
    } else av.pause();
  },
});
ScrollTrigger.create({
  trigger: '.hero',
  start: 'top top',
  end: 'bottom top',
  onToggle: (s) => { if (hv) s.isActive ? hv.play().catch(() => {}) : hv.pause(); },
});

if (FINE) {
  document.documentElement.classList.add('has-cursor');
  const c = $('.cursor');
  const dot = $('.c-dot');
  const ring = $('.c-ring');
  const lbl = $('.c-ring b');
  const dx = gsap.quickTo(dot, 'x', { duration: .08 });
  const dy = gsap.quickTo(dot, 'y', { duration: .08 });
  const rx = gsap.quickTo(ring, 'x', { duration: .45, ease: 'power3' });
  const ry = gsap.quickTo(ring, 'y', { duration: .45, ease: 'power3' });
  addEventListener('pointermove', (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); });
  $$('[data-cursor]').forEach((el) => {
    el.addEventListener('pointerenter', () => { lbl.textContent = el.dataset.cursor; c.classList.add('big'); });
    el.addEventListener('pointerleave', () => c.classList.remove('big'));
  });
  $$('.mag').forEach((b) => {
    const xt = gsap.quickTo(b, 'x', { duration: .5, ease: 'elastic.out(1,.4)' });
    const yt = gsap.quickTo(b, 'y', { duration: .5, ease: 'elastic.out(1,.4)' });
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      xt((e.clientX - r.left - r.width / 2) * .35);
      yt((e.clientY - r.top - r.height / 2) * .45);
    });
    b.addEventListener('pointerleave', () => { xt(0); yt(0); });
  });
}
addEventListener('load', () => ScrollTrigger.refresh());
})();
