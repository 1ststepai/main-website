(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video = document.querySelector('.hero-vid');
  const button = document.querySelector('.reel-sound');
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
  if (!slow) {
    const play = () => {
      arm();
      video.muted = true;
      video.play().catch(() => {});
    };
    const afterPaint = () => {
      const wait = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      wait.then(() => setTimeout(play, 600));
    };
    if (document.readyState === 'complete') afterPaint();
    else addEventListener('load', afterPaint, { once: true });
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
