import { App } from './app.js';
import { decodeWorld, generateWorld } from './world.js';
import { Renderer2 } from './render.js';
import { buildViewer } from './viewer.js';

const fail = m => { const f = document.getElementById('fail'); f.textContent = m; f.hidden = false; console.error(m); };
window.addEventListener('error', e => fail(e.message));
window.addEventListener('unhandledrejection', e => fail(e.reason?.message ?? String(e.reason)));

try {
  const canvas = document.getElementById('view');
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('The graphics driver reset. Reload the page, and choose View > Preview Quality > Low if this repeats.'); });
  const app = new App(canvas);
  window.__app = app;
  const hash = location.hash.slice(1);
  let start = { base: generateWorld(1004), mix: null };
  if (hash) try { start = decodeWorld(hash); } catch { /* keep the default world */ }
  await app.loadWorld(start.base, start.mix);
  const rq = new Renderer2(app);
  window.__ui = buildViewer(app, rq);
  // the RTR changes size with the window and when the Generator strip opens
  let rt = 0;
  new ResizeObserver(() => { cancelAnimationFrame(rt); rt = requestAnimationFrame(() => app.resize()); }).observe(canvas);
  app.start();
  window.__ready = true;
} catch (e) { fail(e.message); }
