(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video = document.querySelector('.work-vid');
  const button = document.querySelector('.reel-sound');

  const paintSound = (on) => {
    if (!button) return;
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.setAttribute('aria-label', on ? 'Mute' : 'Tap for sound');
    const label = button.querySelector('span');
    if (label) label.textContent = on ? 'Mute' : 'Tap for sound';
  };

  if (!video || !button) return;

  if (reduced) {
    button.hidden = true;
    return;
  }

  video.src = video.dataset.src;
  video.muted = true;
  video.play().catch(() => {});

  button.addEventListener('click', () => {
    if (!video.muted) {
      video.muted = true;
      paintSound(false);
      return;
    }
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
