// The Signal Path loads after the page is usable. If it fails, the figure keeps (or
// returns to) its complete static state; content and CTAs never depend on it.
const RESOLVED = 'reach-repair reach-signal reach-capture reach-qualify reach-route reach-follow reach-convert reach-measure reach-loop';
import('./signal-path.js')
  .then((signalPath) => signalPath.init())
  .catch(() => {
    const figure = document.getElementById('signal-path');
    if (!figure) return;
    figure.removeAttribute('data-pending');
    figure.classList.add(...RESOLVED.split(' '));
  });

// Homepage-only preference; never forwarded to analytics or other routes.
const appearance = document.querySelector('#appearance');
appearance.value = document.documentElement.dataset.theme || 'original';
appearance.addEventListener('change', () => {
  const theme = appearance.value === 'light' ? 'light' : 'original';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('firststep-home-appearance', theme); } catch { /* Session-only when storage is blocked. */ }
});
