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

  const scene = document.querySelector('.hero-scene');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (scene && hero && fine && !reduced) {
    let last = 0;
    hero.addEventListener('pointermove', (event) => {
      if (!hero.classList.contains('is-on') || hero.classList.contains('is-paused')) return;
      const now = performance.now();
      if (now - last < 40) return;
      last = now;
      const rect = hero.getBoundingClientRect();
      scene.style.setProperty('--px', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
      scene.style.setProperty('--py', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
    });
  }
  if (scene && hero && !reduced) {
    let lit = false;
    let ticking = false;
    const lightOnce = () => {
      if (lit || !inView) return;
      lit = true;
      hero.classList.add('is-lit');
    };
    const applyScroll = () => {
      ticking = false;
      const top = hero.getBoundingClientRect().top;
      const y = Math.max(-280, Math.min(280, -top));
      scene.style.setProperty('--bg-y', (y * 0.05).toFixed(2) + 'px');
      scene.style.setProperty('--prop-y', (y * 0.11).toFixed(2) + 'px');
      scene.style.setProperty('--mon-y', (y * 0.17).toFixed(2) + 'px');
      lightOnce();
    };
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(applyScroll);
    }, { passive: true });
    requestAnimationFrame(applyScroll);
  }

  const ops = document.querySelector('.ops');
  const opsPause = document.querySelector('.ops-pause');
  let opsPaused = false;
  let opsIn = false;
  const syncOps = () => {
    if (!ops) return;
    ops.classList.toggle('is-paused', opsPaused);
    ops.classList.toggle('is-on', opsIn && !opsPaused && !reduced);
  };
  if (ops && !reduced && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      opsIn = entry.isIntersecting;
      syncOps();
    }, { threshold: 0.28 }).observe(ops);
  }
  if (opsPause && !reduced) {
    opsPause.addEventListener('click', () => {
      opsPaused = !opsPaused;
      opsPause.setAttribute('aria-pressed', opsPaused ? 'true' : 'false');
      opsPause.textContent = opsPaused ? 'Play animation' : 'Pause animation';
      syncOps();
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

// Client video testimonial: no autoplay; tap to play with sound.
(() => {
  const wrap = document.querySelector(".tm");
  if (!wrap) return;
  const video = wrap.querySelector(".tm-video");
  const play = wrap.querySelector(".tm-play");
  if (!video || !play) return;
  const start = () => { video.muted = false; video.play().catch(() => {}); };
  play.addEventListener("click", start);
  video.addEventListener("click", () => (video.paused ? start() : video.pause()));
  video.addEventListener("play", () => wrap.classList.add("is-playing"));
  video.addEventListener("pause", () => wrap.classList.remove("is-playing"));
  video.addEventListener("ended", () => { wrap.classList.remove("is-playing"); video.currentTime = 0; });
})();
