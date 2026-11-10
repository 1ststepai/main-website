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
