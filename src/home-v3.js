// 1stStep.ai homepage v3: menu, services dropdown, testimonial video, sticky CTA.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mobile menu
(() => {
  const btn = document.querySelector('.menu-btn');
  const menu = document.getElementById('site-menu');
  if (!btn || !menu) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) set(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') set(false);
  });
})();

// Services dropdown: click/tap toggle with aria-expanded; hover handled in CSS.
(() => {
  const wrap = document.querySelector('.has-sub');
  const btn = wrap && wrap.querySelector('.sub-btn');
  if (!btn) return;
  const set = (open) => {
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  btn.addEventListener('click', () => set(!wrap.classList.contains('open')));
  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) set(false);
  });
  wrap.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { set(false); btn.focus(); }
  });
})();

// Pause hero motion when it scrolls out of view.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero || reduced || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entry]) => {
    hero.classList.toggle('is-paused', !entry.isIntersecting);
  }, { threshold: 0.05 }).observe(hero);
})();

// Client video testimonial: no autoplay; tap to play with sound.
(() => {
  const wrap = document.querySelector('.tm');
  if (!wrap) return;
  const video = wrap.querySelector('.tm-video');
  const play = wrap.querySelector('.tm-play');
  if (!video || !play) return;
  const start = () => { video.muted = false; video.play().catch(() => {}); };
  play.addEventListener('click', start);
  video.addEventListener('click', () => (video.paused ? start() : video.pause()));
  video.addEventListener('play', () => wrap.classList.add('is-playing'));
  video.addEventListener('pause', () => wrap.classList.remove('is-playing'));
  video.addEventListener('ended', () => { wrap.classList.remove('is-playing'); video.currentTime = 0; });
})();

// Sticky mobile CTA hides while the final booking band is on screen.
(() => {
  const bar = document.querySelector('.book-bar');
  const band = document.getElementById('book');
  if (!bar || !band || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entry]) => {
    bar.classList.toggle('is-hidden', entry.isIntersecting);
  }).observe(band);
})();

// Subtle desktop tilt for the hero device; reduced-motion and coarse pointers stay still.
(() => {
  const tilt = document.querySelector(".device-tilt");
  const hero = document.querySelector(".hero");
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!tilt || !hero || reduced || !fine) return;
  const baseX = 6;
  const baseY = -11;
  let frame = 0;
  const setTilt = (x, y) => {
    tilt.style.setProperty("--tilt-x", `${x.toFixed(2)}deg`);
    tilt.style.setProperty("--tilt-y", `${y.toFixed(2)}deg`);
  };
  hero.addEventListener("pointermove", (event) => {
    if (hero.classList.contains("is-paused")) return;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const rect = tilt.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      setTilt(baseX + py * -5, baseY + px * 7);
    });
  }, { passive: true });
  hero.addEventListener("pointerleave", () => setTilt(baseX, baseY));
})();

// Activity feed: newest item slides in at the top; the oldest leaves through a bottom fade.
(() => {
  const list = document.querySelector(".cc-feed-list");
  const frame = document.querySelector(".cc-feed-window");
  const hero = document.querySelector(".hero");
  if (!list || reduced || list.children.length < 2) return;
  let busy = false;
  const rowHeight = () => {
    const item = list.firstElementChild;
    return item ? item.getBoundingClientRect().height : 0;
  };
  const tick = () => {
    if (busy || (hero && hero.classList.contains("is-paused"))) return;
    const last = list.lastElementChild;
    const distance = rowHeight();
    if (!last || !distance) return;
    busy = true;
    list.classList.remove("is-animating");
    if (frame) frame.classList.add("is-fading");
    list.insertBefore(last, list.firstElementChild);
    list.style.transform = `translateY(${-distance}px)`;
    void list.offsetHeight;
    list.classList.add("is-animating");
    list.style.transform = "translateY(0)";
    let settled = false;
    const settle = (event) => {
      if (event && event.target !== list) return;
      if (settled) return;
      settled = true;
      list.classList.remove("is-animating");
      if (frame) frame.classList.remove("is-fading");
      list.style.transform = "";
      busy = false;
    };
    list.addEventListener("transitionend", settle);
    setTimeout(() => settle(), 700);
  };
  setInterval(tick, 3200);
})();

// KPI counters ease up once when the hero is in view.
(() => {
  const metrics = [...document.querySelectorAll(".cc-metric[data-count]")];
  const hero = document.querySelector(".hero");
  if (!metrics.length || reduced) return;
  const ease = (t) => 1 - (1 - t) ** 3;
  const run = () => {
    const start = performance.now();
    const targets = metrics.map((el) => ({ el, end: Number(el.dataset.count) || 0 }));
    targets.forEach(({ el }) => { el.textContent = "0"; });
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      targets.forEach(({ el, end }) => { el.textContent = String(Math.round(end * ease(t))); });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (!hero || !("IntersectionObserver" in window)) {
    run();
    return;
  }
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    run();
  }, { threshold: 0.25 });
  io.observe(hero);
})();
