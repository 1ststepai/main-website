// Explicit local/Preview opt-in only. No network, storage or analytics integration.
export function createMeter(renderer, tier, started = performance.now()) {
  const enabled = typeof __FOUNDRY_RD__ !== 'undefined' && __FOUNDRY_RD__ &&
    /^(localhost|127\.0\.0\.1)$|\.vercel\.app$/.test(location.hostname) &&
    new URLSearchParams(location.search).get('rd') === '1';
  if (!enabled) return { frame() {}, idle() {}, dispose() {} };
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const identity = debug ? { vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) } : { vendor: 'privacy restricted', renderer: 'privacy restricted' };
  let frames = [], previous = 0, count = 0, first = null, stage = 'ENTRY';
  const api = {
    reset() { frames = []; previous = 0; },
    sample() {
      const sorted = [...frames].sort((a,b)=>a-b);
      const mean = frames.reduce((a,b)=>a+b,0) / frames.length;
      const p99 = sorted[Math.max(0,Math.ceil(sorted.length*.99)-1)];
      return { stage, tier, ...identity, samples: frames.length, totalFrames: count,
        averageFPS: frames.length ? +(1000/mean).toFixed(1) : null,
        onePercentLowFPS: p99 ? +(1000/p99).toFixed(1) : null,
        worstFrameMs: sorted.at(-1) ?? null, long32: frames.filter(n=>n>32).length,
        long50: frames.filter(n=>n>50).length, firstFrameMs: first,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        devicePixelRatio, renderDPR: renderer.getPixelRatio(),
        powerPreference: gl.getContextAttributes()?.powerPreference };
    },
  };
  window.__foundryRD = api;
  return {
    frame(now, progress) { if(previous) frames.push(now-previous); previous=now; count++; if(first===null) first=performance.now()-started;
      stage=progress<.2?'ENTRY':progress<.6?'ASSEMBLY':progress<.8?'PRODUCT':'HANDOFF';
      if(frames.length>1200)frames.shift(); },
    idle() { previous=0; },
    dispose() { if(window.__foundryRD===api)delete window.__foundryRD; },
  };
}
