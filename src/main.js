import { App } from './app.js';
import { decodeWorld, generateWorld } from './world.js';
import { buildUI } from './ui.js';

const fail = m => { const f = document.getElementById('fail'); f.textContent = m; f.hidden = false; console.error(m); };
window.addEventListener('error', e => fail(e.message));
window.addEventListener('unhandledrejection', e => fail(e.reason?.message ?? String(e.reason)));

try {
  const canvas = document.getElementById('view');
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('The graphics driver reset. Reload the page, and lower Refine quality if this repeats.'); });
  const app = new App(canvas);
  window.__app = app;
  const hash = location.hash.slice(1);
  let start = { base: generateWorld(1004), mix: null };
  if (hash) try { start = decodeWorld(hash); } catch { /* keep the default world */ }
  await app.loadWorld(start.base, start.mix);
  buildUI(app);
  addEventListener('resize', () => app.resize());
  app.start();
  window.__ready = true;
} catch (e) { fail(e.message); }
