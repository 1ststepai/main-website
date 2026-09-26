// Small motion primitives shared by 1stStep.ai pages. Each brand configures its own
// choreography; this file only owns timing, visibility and reduced-motion policy.

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function onReducedMotionChange(callback) {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => callback(reducedMotion()));
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Calls back with true/false as at least the (last) threshold of the element is in view.
export function watchVisibility(element, callback, options = { threshold: 0.35 }) {
  if (!('IntersectionObserver' in window)) { callback(true); return () => {}; }
  const min = [].concat(options.threshold ?? 0).pop();
  const observer = new IntersectionObserver(([entry]) => callback(entry.isIntersecting && entry.intersectionRatio >= min), options);
  observer.observe(element);
  return () => observer.disconnect();
}

// A pausable timeline clock. onTick receives elapsed seconds; it stops itself at `duration`.
// Hidden tabs never advance the clock, so an offscreen or backgrounded scene cannot "finish unseen".
export function createClock(duration, onTick, onEnd) {
  let elapsed = 0, last = 0, frame = 0, running = false;
  const step = (now) => {
    if (!running) return;
    elapsed = Math.min(duration, elapsed + (last ? Math.min(now - last, 64) : 0) / 1000);
    last = now;
    onTick(elapsed);
    if (elapsed >= duration) { running = false; onEnd?.(); return; }
    frame = requestAnimationFrame(step);
  };
  const clock = {
    get running() { return running; },
    get done() { return elapsed >= duration; },
    play() { if (running || elapsed >= duration) return; running = true; last = 0; frame = requestAnimationFrame(step); },
    pause() { running = false; cancelAnimationFrame(frame); },
    restart() { clock.pause(); elapsed = 0; onTick(0); clock.play(); },
    finish() { clock.pause(); elapsed = duration; onTick(duration); },
  };
  return clock;
}
