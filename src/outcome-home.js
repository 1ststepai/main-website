const figure = document.querySelector('.workflow-figure');
const replay = document.querySelector('#replay');
const pause = document.querySelector('#pause');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let userPaused = false, visible = true;
function pauseState() {
  figure.classList.toggle('paused', userPaused || document.hidden || !visible);
  pause.textContent = userPaused ? 'Resume' : 'Pause';
  pause.setAttribute('aria-pressed', String(userPaused));
}
function play() {
  figure.classList.remove('running');
  if (reduced.matches) return;
  void figure.offsetWidth;
  userPaused = false;
  figure.classList.add('running');
  pauseState();
}
function preferences() {
  replay.hidden = pause.hidden = reduced.matches;
  if (reduced.matches) figure.classList.remove('running');
}
replay.addEventListener('click', play);
pause.addEventListener('click', () => { userPaused = !userPaused; pauseState(); });
reduced.addEventListener('change', preferences);
document.addEventListener('visibilitychange', pauseState);
if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting; pauseState();
}).observe(figure);
preferences(); play();

// Homepage-only preference; never forwarded to analytics or other routes.
const appearance = document.querySelector('#appearance');
appearance.value = document.documentElement.dataset.theme || 'original';
appearance.addEventListener('change', () => {
  const theme = appearance.value === 'light' ? 'light' : 'original';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('firststep-home-appearance', theme); } catch { /* Session-only when storage is blocked. */ }
});
