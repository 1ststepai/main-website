const motionSections = [...document.querySelectorAll('.hero, .closing, .human-pause')];

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.08 });
  motionSections.forEach((section) => observer.observe(section));
  const routeObserver = new IntersectionObserver(([entry]) => {
    entry.target.classList.toggle('is-in-viewport', entry.intersectionRatio >= 0.15);
  }, { threshold: 0.15 });
  const routeSection = document.querySelector('.hero');
  if (routeSection) routeObserver.observe(routeSection);
} else {
  motionSections.forEach((section) => section.classList.add('is-visible'));
  document.querySelector('.hero')?.classList.add('is-in-viewport');
}

const hero = document.querySelector('.hero');
const product = hero?.querySelector('.hero-product');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const motionToggle = document.querySelector('[data-motion-toggle]');
let motionEnabled = !reduceMotion.matches;

function setMotion(enabled) {
  motionEnabled = enabled;
  document.body.classList.toggle('motion-enabled', enabled);
  document.body.classList.toggle('motion-disabled', !enabled);
  motionToggle?.setAttribute('aria-pressed', String(enabled));
  if (motionToggle) motionToggle.querySelector('[data-motion-label]').textContent = enabled ? 'Pause motion' : 'Enable motion';
}

setMotion(motionEnabled);
motionToggle?.addEventListener('click', () => setMotion(!motionEnabled));

if (hero && product && finePointer.matches) {
  let frame = 0;
  product.addEventListener('pointermove', (event) => {
    if (!motionEnabled || frame) return;
    frame = requestAnimationFrame(() => {
      const bounds = product.getBoundingClientRect();
      product.style.setProperty('--motion-x', `${((event.clientX - bounds.left) / bounds.width - 0.5) * 5}px`);
      product.style.setProperty('--motion-y', `${((event.clientY - bounds.top) / bounds.height - 0.5) * 4}px`);
      frame = 0;
    });
  }, { passive: true });
  product.addEventListener('pointerleave', () => {
    product.style.setProperty('--motion-x', '0px');
    product.style.setProperty('--motion-y', '0px');
  });
}
