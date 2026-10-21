(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('.hero');
  const video = document.querySelector('.work-vid');
  const button = document.querySelector('.reel-sound');

  if (hero && !reduced && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      hero.classList.toggle('is-on', entry.isIntersecting);
    }, { threshold: 0.12 }).observe(hero);
  } else if (hero && reduced) {
    hero.classList.remove('is-on');
  }

  if (!video || !button) return;

  const paintSound = (on) => {
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', on ? 'Mute' : 'Tap for sound');
    const label = button.querySelector('span');
    if (label) label.textContent = on ? 'Mute' : 'Tap for sound';
  };

  const arm = () => {
    if (!video.getAttribute('src')) video.src = video.dataset.src;
  };

  if (reduced) {
    button.hidden = true;
    return;
  }

  const conn = navigator.connection;
  const slow = conn && (conn.saveData || /2g/.test(conn.effectiveType || ''));
  const play = () => {
    const first = !video.getAttribute('src');
    arm();
    if (first) video.muted = true;
    const attempt = video.play();
    if (attempt) attempt.catch(() => {
      video.muted = true;
      paintSound(false);
      video.play().catch(() => {});
    });
  };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        if (video.getAttribute('src')) video.pause();
        return;
      }
      if (!slow || video.getAttribute('src')) play();
    }, { rootMargin: '240px 0px' }).observe(video);
  } else if (!slow) {
    play();
  }

  button.addEventListener('click', () => {
    if (video.getAttribute('src') && !video.muted) {
      video.muted = true;
      paintSound(false);
      return;
    }
    arm();
    video.volume = 1;
    video.muted = false;
    video.removeAttribute('muted');
    const restart = () => {
      try { video.currentTime = 0; } catch {}
    };
    if (video.readyState >= 1) restart();
    else video.addEventListener('loadedmetadata', restart, { once: true });
    video.play().catch(() => {});
    paintSound(true);
  });
})();
