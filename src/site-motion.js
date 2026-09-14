const motionSections = [...document.querySelectorAll('.hero, .closing')];

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-visible', entry.isIntersecting);
  }, { threshold: 0.08 });
  motionSections.forEach((section) => observer.observe(section));
} else {
  motionSections.forEach((section) => section.classList.add('is-visible'));
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
  hero.addEventListener('pointermove', (event) => {
    if (!motionEnabled || frame) return;
    frame = requestAnimationFrame(() => {
      const bounds = hero.getBoundingClientRect();
      product.style.setProperty('--motion-x', `${((event.clientX - bounds.left) / bounds.width - 0.5) * 8}px`);
      product.style.setProperty('--motion-y', `${((event.clientY - bounds.top) / bounds.height - 0.5) * 5}px`);
      frame = 0;
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    product.style.setProperty('--motion-x', '0px');
    product.style.setProperty('--motion-y', '0px');
  });
}
