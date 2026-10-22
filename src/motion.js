(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const skip = (el) => {
    if (el.closest('.hero')) return true;
    if (el.matches('h1, h2, h3') && el.closest('.piece, .panel, .card, .sec, .device, .tilt, .cta, .faq-list')) return true;
    return false;
  };

  const nodes = document.querySelectorAll('.piece, .sec, .panel, .close figure, main h1, main h2, .card, .listing, .process-grid > li, .intro-card, .system-card, .faq-list > div, .cta');
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

  nodes.forEach((el) => {
    if (seen.has(el) || skip(el)) return;
    seen.add(el);
    el.classList.add('reveal');
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add('is-in');
    else io.observe(el);
  });

  document.querySelectorAll('main section').forEach((section, index) => {
    if (section.classList.contains('hero') || index === 0) return;
    section.classList.add('section-glow');
  });

  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.piece').forEach((piece) => {
    const tilt = piece.querySelector('.tilt');
    if (!tilt) return;
    piece.addEventListener('pointermove', (event) => {
      const rect = tilt.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      tilt.style.setProperty('--rx', (x * 4.5).toFixed(2) + 'deg');
      tilt.style.setProperty('--ry', (-y * 3).toFixed(2) + 'deg');
    });
    piece.addEventListener('pointerleave', () => {
      tilt.style.removeProperty('--rx');
      tilt.style.removeProperty('--ry');
    });
  });
})();
