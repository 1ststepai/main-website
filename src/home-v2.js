(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('.hero');
  const pauseBtn = document.querySelector('.hero-pause');
  const video = document.querySelector('.work-vid');
  const button = document.querySelector('.reel-sound');
  let userPaused = false;
  let inView = true;
  const syncHero = () => {
    if (!hero) return;
    hero.classList.toggle('is-paused', userPaused);
    hero.classList.toggle('is-on', inView && !userPaused && !reduced);
  };

  if (hero && reduced) {
    hero.classList.remove('is-on');
  } else if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncHero();
    }, { threshold: 0.12 }).observe(hero);
  }
  if (pauseBtn && !reduced) {
    pauseBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      pauseBtn.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      pauseBtn.textContent = userPaused ? 'Play animation' : 'Pause animation';
      syncHero();
    });
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
