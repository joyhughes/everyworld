import { MIXERS, generateWorld, encodeWorld, decodeWorld, node } from './world.js';
import { v3, Camera } from './camera.js';
import { buildGraph } from './graphui.js';

const $ = id => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const k in attrs) k.startsWith('on') ? e.addEventListener(k.slice(2), attrs[k]) : e.setAttribute(k, attrs[k]);
  e.append(...kids); return e;
};
const fmtDist = km => km >= 1000 ? (km / 1000).toFixed(km > 1e4 ? 0 : 1) + ' Mm' : km >= 1 ? km.toFixed(km < 10 ? 2 : 0) + ' km' : km >= .001 ? (km * 1000).toFixed(km < .01 ? 2 : 0) + ' m' : (km * 1e5).toFixed(1) + ' cm';

// Named gems, picked by eye from the seed space.
export const GALLERY = [1004, 2071, 3188, 4242, 5150, 6616, 7777, 8123];

export function buildUI(app) {
  // Rebuilds coalesce: dragging a slider never queues up work.
  let pending = false, running = false;
  const rebuild = async () => {
    pending = true; if (running) return;
    running = true;
    while (pending) { pending = false; try { await app.rebuild(); } catch (e) { graph.message(e.message, true); } await new Promise(r => requestAnimationFrame(r)); }
    running = false;
  };
  const slider = (label, get, set, min, max, step, fmt = v => (+v).toFixed(2), ends) => {
    const out = h('output', {}, fmt(get()));
    const inp = h('input', { type: 'range', min, max, step, value: get(), 'aria-label': label, oninput: () => { set(+inp.value); out.textContent = fmt(+inp.value); rebuild(); } });
    const row = h('div', { class: 'row' }, h('span', {}, label), out, inp);
    if (ends) row.append(h('div', { class: 'ends' }, h('span', {}, ends[0]), h('span', {}, ends[1])));
    return row;
  };
  const section = (t, ...kids) => [h('h3', {}, t), ...kids];
  const worldButton = seed => { const w = generateWorld(seed); return h('button', { onclick: () => load(generateWorld(seed)) }, w.name, h('small', {}, w.kind)); };

  const load = async (w, mix) => {
    $('flash').style.opacity = .85;
    await app.loadWorld(w, mix);
    $('flash').style.opacity = 0;
    show(tab);
  };

  const tabs = {
    Transport() {
      const code = h('input', { type: 'text', id: 'code', value: encodeWorld(app), 'aria-label': 'World code', spellcheck: 'false' });
      return [
        ...section('World code'),
        h('p', {}, 'A world is only its numbers. Paste a code to visit, or copy this one to share the planet.'),
        h('div', { class: 'code' }, code,
          h('button', { onclick: async e => { try { await navigator.clipboard.writeText(encodeWorld(app)); e.target.textContent = 'Copied'; } catch { code.select(); e.target.textContent = 'Press Cmd+C'; } } }, 'Copy'),
          h('button', { onclick: () => { try { const d = decodeWorld(code.value); load(d.base, d.mix); } catch (err) { code.value = err.message; } } }, 'Go')),
        ...section('Gallery'),
        h('div', { class: 'worlds' }, ...GALLERY.map(worldButton)),
        ...section('Neighbours'),
        h('div', { class: 'worlds' }, ...[1, 2, 3, 4].map(i => worldButton((app.base.seed + i) >>> 0))),
        ...section('Lens'),
        slider('Field of view', () => app.cam.fov * 180 / Math.PI, v => { app.cam.fov = v * Math.PI / 180; app.dirty = true; }, 10, 110, 1, v => Math.round(v) + '°'),
      ];
    },
    Mixers() {
      return [
        h('p', {}, 'Each mixer sweeps one planet-wide quantity. Everything rebuilds as you drag.'),
        ...MIXERS.map(m => slider(m.label, () => app.mix[m.id], v => { app.mix[m.id] = v; }, -1, 1, .01, v => (v > 0 ? '+' : '') + v.toFixed(2), [m.lo, m.hi])),
        h('div', { class: 'btns' }, h('button', { onclick: () => { for (const m of MIXERS) app.mix[m.id] = 0; rebuild(); show('Mixers'); } }, 'Reset mixers')),
        ...section('Hyperspace'),
        h('p', {}, 'Slide this world toward a neighbour. Terrain, air, clouds and colour all blend.'),
        slider('Destination seed', () => app.morphSeed ?? (app.base.seed + 1), v => { app.morphSeed = v; if (app.morphTo) app.morphTo = generateWorld(v); }, 0, 9999, 1, v => generateWorld(v).name),
        slider('Blend', () => app.morphT, v => { app.morphT = v; app.morphTo = v > 0 ? generateWorld(app.morphSeed ?? (app.base.seed + 1)) : null; }, 0, 1, .01),
      ];
    },
    World() {
      const w = app.base, b = app.base;
      const edit = f => v => { f(v); };
      const rows = [
        ...section('Sun'),
        slider('Time of day', () => b.sun.time, edit(v => b.sun.time = v), 0, 1, .002),
        slider('Season', () => b.sun.tilt, edit(v => b.sun.tilt = v), -.6, .6, .01),
        slider('Exposure', () => b.exposure, edit(v => b.exposure = v), .2, 3, .01),
        ...section('Sea'),
        h('div', { class: 'row' }, h('span', {}, 'Surface'), h('select', { 'aria-label': 'Sea surface', onchange: e => { b.seaType = +e.target.value; b.surf.lava = b.seaType === 1 ? 1 : 0; rebuild(); } },
          ...[['Water', 0], ['Lava', 1], ['Ice', 2], ['None', 3]].map(([t, v]) => { const o = h('option', { value: v }, t); if (v === b.seaType) o.selected = true; return o; }))),
        slider('Ocean fraction', () => b.seaFrac, edit(v => b.seaFrac = v), 0, 1, .01),
        ...section('Air'),
        slider('Density', () => b.atmo.scale, edit(v => b.atmo.scale = v), 0, 4, .01),
        slider('Scale height', () => b.atmo.hr, edit(v => b.atmo.hr = v), 3, 20, .1, v => v.toFixed(1) + ' km'),
        slider('Dust', () => b.atmo.mie, edit(v => b.atmo.mie = v), 0, 6, .01),
        ...section('Clouds'),
        slider('Cover', () => b.clouds.cover, edit(v => b.clouds.cover = v), 0, 1, .01),
        slider('Feature size', () => b.clouds.scale, edit(v => b.clouds.scale = v), 1, 12, .1),
        slider('Base height', () => b.clouds.low, edit(v => b.clouds.low = v), .5, 12, .1, v => v.toFixed(1) + ' km'),
        slider('Top height', () => b.clouds.high, edit(v => b.clouds.high = v), 2, 30, .1, v => v.toFixed(1) + ' km'),
        ...section('Climate'),
        slider('Temperature', () => b.surf.temp, edit(v => b.surf.temp = v), -60, 80, 1, v => Math.round(v) + ' °C'),
        slider('Moisture', () => b.surf.moist, edit(v => b.surf.moist = v), -1, 1, .01),
        ...section('Planet'),
        slider('Radius', () => b.radius, edit(v => b.radius = v), 1000, 16000, 10, v => Math.round(v) + ' km'),
      ];
      b.moons.forEach((m, i) => rows.push(...section('Moon ' + (i + 1)),
        slider('Radius', () => m.radius, edit(v => m.radius = v), 100, 6000, 10, v => Math.round(v) + ' km'),
        slider('Distance', () => m.dist, edit(v => m.dist = v), 8000, 600000, 100, fmtDist),
        slider('Position', () => m.az, edit(v => m.az = v), 0, 6.28, .01)));
      rows.push(...section('Rings'));
      if (b.rings) rows.push(
        slider('Inner edge', () => b.rings.inner, edit(v => b.rings.inner = v), 1.1, 3, .01, v => v.toFixed(2) + ' R'),
        slider('Outer edge', () => b.rings.outer, edit(v => b.rings.outer = v), 1.2, 5, .01, v => v.toFixed(2) + ' R'),
        slider('Tilt', () => b.rings.tilt, edit(v => b.rings.tilt = v), 0, 1.4, .01),
        slider('Opacity', () => b.rings.density, edit(v => b.rings.density = v), 0, 1, .01));
      rows.push(h('div', { class: 'btns' }, h('button', { onclick: () => { b.rings = b.rings ? null : { inner: 1.6, outer: 2.5, tilt: .3, spin: 1, color: [.75, .68, .58], density: .8, seed: b.seed }; rebuild(); show('World'); } }, b.rings ? 'Remove rings' : 'Add rings')));
      rows.push(...section('Terrain graph'),
        h('p', {}, 'The height of every point is a graph of fractals and math.'),
        h('div', { class: 'btns' }, h('button', { onclick: () => graph.open() }, 'Open graph')));
      void w;
      return rows;
    },
    Bombs() {
      return [
        h('p', {}, 'A parameter bomb rewrites terrain inside a circle on the planet. Aim at a spot, then drop one.'),
        h('div', { class: 'btns' },
          h('button', { onclick: () => bomb('mesa') }, 'Drop mesa'),
          h('button', { onclick: () => bomb('flat') }, 'Drop plain'),
          h('button', { onclick: () => bomb('crater') }, 'Drop crater field')),
        slider('Radius', () => app.bombRadius ?? 40, v => { app.bombRadius = v; }, 2, 800, 1, v => Math.round(v) + ' km'),
        h('p', {}, `${app.base.bombs.length} of 4 placed.`),
        h('div', { class: 'btns' }, h('button', { onclick: clearBombs }, 'Clear bombs')),
      ];
    },
    Render() {
      const sizes = [['1920 × 1080', 1920, 1080], ['2560 × 1440', 2560, 1440], ['3840 × 2160', 3840, 2160], ['2048 × 2048', 2048, 2048]];
      app.renderSize ??= 0; app.renderSpp ??= 64;
      const sel = h('select', { 'aria-label': 'Render size', onchange: e => { app.renderSize = +e.target.value; } }, ...sizes.map(([t], i) => { const o = h('option', { value: i }, t); if (i === app.renderSize) o.selected = true; return o; }));
      const status = h('p', { id: 'rstat' }, 'The view keeps refining on its own when you stop moving. Use this for a larger picture.');
      const panoBtn = h('button', { onclick: () => panorama(status) }, 'Six-tile panorama');
      return [status,
        h('div', { class: 'row' }, h('span', {}, 'Size'), sel),
        slider('Samples per pixel', () => app.renderSpp, v => { app.renderSpp = v; }, 8, 512, 8, v => String(v)),
        h('div', { class: 'btns' },
          h('button', { class: 'hot', onclick: () => still(sizes[app.renderSize][1], sizes[app.renderSize][2], status) }, 'Render still'), panoBtn),
        ...section('Live quality'),
        slider('Refinement limit', () => app.maxSamples, v => { app.maxSamples = v; }, 16, 512, 8, v => v + ' samples'),
        slider('Motion frame rate', () => app.targetFps, v => { app.targetFps = v; }, 15, 60, 5, v => v + ' fps'),
      ];
    },
    Log() {
      const entries = readLog();
      return [
        h('p', {}, 'Your logbook of discoveries, kept in this browser.'),
        h('div', { class: 'btns' }, h('button', { class: 'hot', onclick: () => { addLog(); show('Log'); } }, 'Record this place')),
        h('div', { class: 'log' }, ...entries.map(e => h('button', { onclick: () => visit(e) }, h('img', { src: e.thumb, alt: '' }), h('span', {}, e.name, h('small', {}, `${e.where} · ${e.alt}`))))),
      ];
    },
  };

  let tab = 'Transport';
  for (const t of Object.keys(tabs)) $('tabs').append(h('button', { role: 'tab', id: 'tab' + t, onclick: () => show(t) }, t));
  function show(t) {
    tab = t;
    for (const b of $('tabs').children) b.setAttribute('aria-selected', b.id === 'tab' + t);
    $('pane').replaceChildren(...tabs[t]());
  }

  // ---- bombs -----------------------------------------------------------
  function bomb(style) {
    const g = app.base.terrain, b = app.base;
    if (b.bombs.length >= 4) return;
    const hit = aimPoint();
    b.bombs.push({ at: hit, radius: (app.bombRadius ?? 40) / b.radius });
    if (!g.nodes.find(n => n.type === 'bomb')) {
      const old = g.out, y = 60;
      g.nodes.push(
        { id: 'bAlt', type: 'scale', x: 1130, y: 380, params: { scale: style === 'mesa' ? .15 : .04, bias: style === 'mesa' ? 3 : 0.3 }, in: { a: 'hills' } },
        { id: 'bMesa', type: 'terrace', x: 1330, y: 380, params: { steps: 3, sharp: .9 }, in: { a: 'bAlt' } },
        { id: 'bomb', type: 'bomb', x: 1530, y, params: {}, in: { a: old, b: style === 'crater' ? 'crater' : 'bMesa' } });
      g.out = 'bomb';
    }
    rebuild(); show('Bombs');
  }
  function clearBombs() {
    const g = app.base.terrain, b = g.nodes.find(n => n.type === 'bomb');
    app.base.bombs = [];
    if (b) { g.out = b.in.a; g.nodes = g.nodes.filter(n => !['bomb', 'bMesa', 'bAlt'].includes(n.id)); }
    rebuild(); show('Bombs');
  }
  function aimPoint() {
    const c = app.cam, p = app.r.pick(c, app.time, c.fwd);
    return v3.norm(p.t > 0 ? v3.add(c.pos, c.fwd, p.t) : c.pos);
  }

  // ---- transport --------------------------------------------------------
  $('bHome').onclick = () => { const c = app.cam; c.walk = false; syncWalk(); const d = c.up.slice(); c.flyTo(d.map(v => v), app.current.radius * 2.1, 0, d.map(v => -v), 3); };
  $('bScout').onclick = () => { app.cam.walk = false; syncWalk(); app.scout(); };
  $('bRandom').onclick = () => {
    const c = app.cam, z = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - z * z), d = [s * Math.cos(a), z, s * Math.sin(a)];
    const g = app.r.heightsAt(c, app.time, [d], .05)[0], gh = Math.max(g.h, app.current.sea);
    const alt = .3 + Math.random() ** 3 * 40, t = v3.norm([Math.random() - .5, Math.random() - .5, Math.random() - .5]);
    c.walk = false; syncWalk();
    c.flyTo(d, alt, gh, v3.norm(v3.add(v3.add(t, d, -v3.dot(t, d)), d, -.08)), 2.5);
  };
  $('bWalk').onclick = () => {
    const c = app.cam;
    if (!c.walk && c.alt > 200) { app.scout(true); }
    c.walk = !c.walk; c.fov = c.walk ? 60 * Math.PI / 180 : c.fov;
    if (c.walk) { app.needGround = true; } syncWalk(); app.dirty = true;
  };
  function syncWalk() { $('bWalk').classList.toggle('on', app.cam.walk); }
  $('bJump').onclick = () => load(generateWorld(Math.floor(Math.random() * 1e6)));

  // ---- input ------------------------------------------------------------
  const cv = app.canvas; let drag = null, moved = 0, pinch = null; const pts = new Map();
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; moved = 0; $('hint').style.opacity = 0; app.cam.flight = null; });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) { app.cam.dolly(pinch / d); app.needGround = true; app.dirty = true; }
      pinch = d; return;
    }
    const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
    const c = app.cam, k = c.fov / cv.clientHeight;
    if (c.orbital > .5) { const rate = k * Math.min(c.alt / c.R, 1.2); c.orbit(dx * rate, dy * rate); }
    else c.look(dx * k * 1.2, dy * k * 1.2);
    app.dirty = true;
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', e => {
    const c = app.cam, b = cv.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 2 - 1, y = 1 - ((e.clientY - b.top) / b.height) * 2;
    const tan = Math.tan(c.fov / 2), asp = b.width / b.height;
    const d = v3.norm(v3.add(v3.add(c.fwd, c.right, x * tan * asp), c.camUp, y * tan));
    const p = app.r.pick(c, app.time, d); if (!(p.t > 0)) return;
    const q = v3.add(c.pos, d, p.t), dir = v3.norm(q), gh = Math.hypot(...q) - c.R;
    c.flyTo(dir, Math.max(p.t * .12, .004), gh, v3.norm(v3.add(d, dir, -v3.dot(d, dir) * .9)), 2.4);
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); app.cam.flight = null; app.cam.dolly(Math.exp(e.deltaY * .0012)); app.needGround = true; app.dirty = true; $('hint').style.opacity = 0; }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.matches('input,select')) return;
    app.keys.add(e.code); $('hint').style.opacity = 0;
    if (e.code === 'KeyH') $('bHome').click();
    if (e.code === 'KeyR') $('bScout').click();
    if (e.code === 'KeyG') $('bWalk').click();
    if (e.code === 'KeyN') $('bJump').click();
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => app.keys.delete(e.code));
  addEventListener('blur', () => app.keys.clear());

  // ---- rendering --------------------------------------------------------
  const wait = () => new Promise(r => setTimeout(r, 0));
  async function capture(cam, W, H, spp, status) {
    const r = app.r, gl = r.gl, savedQ = r.quality, wasPaused = app.paused;
    app.paused = true;
    r.quality = { steps: 260, shadow: 40, cloud: 32, fine: 28 };
    r.map = null; r.resetAccum(); r.accum && gl.deleteTexture(r.accum); r.accum = null;
    const bands = Math.max(4, Math.ceil(H / 90));
    for (let s = 0; s < spp;) {
      if (r.renderSample(cam, app.time, W, H, bands)) { s++; status.textContent = `Rendering ${W} × ${H}: ${s} of ${spp} samples`; }
      gl.finish(); await wait();
    }
    const tex = r.texture(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST), fb = r.fbo(tex);
    r.present(app.current.exposure, fb, W, H);
    const px = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(tex); gl.deleteFramebuffer(fb);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    r.quality = savedQ; r.resetAccum(); app.paused = wasPaused; app.dirty = true;
    return c;
  }
  function deliver(c, name) {
    c.toBlob(b => {
      const url = URL.createObjectURL(b);
      $('rimg').src = url; $('rsave').href = url; $('rsave').download = name; $('result').hidden = false;
    }, 'image/png');
  }
  async function still(W, H, status) {
    deliver(await capture(app.cam, W, H, app.renderSpp, status), `${app.current.name}.png`);
    status.textContent = 'Finished.';
  }
  async function panorama(status) {
    // six 90 degree tiles laid out 3 by 2: front, right, back, left, up, down
    const c0 = app.cam, S = 1024, sheet = document.createElement('canvas'); sheet.width = S * 3; sheet.height = S * 2;
    const ctx = sheet.getContext('2d');
    const u = c0.up, f0 = v3.norm(v3.add(c0.fwd, u, -v3.dot(c0.fwd, u))), r0 = v3.cross(f0, u);
    const views = [[f0, u], [r0, u], [f0.map(v => -v), u], [r0.map(v => -v), u], [u, f0.map(v => -v)], [u.map(v => -v), f0]];
    for (let i = 0; i < 6; i++) {
      const cam = Object.assign(Object.create(Camera.prototype), c0, { fwd: views[i][0], camUp: views[i][1], fov: Math.PI / 2, flight: null });
      cam.derive();
      ctx.drawImage(await capture(cam, S, S, Math.min(app.renderSpp, 32), status), (i % 3) * S, Math.floor(i / 3) * S);
    }
    deliver(sheet, `${app.current.name}-panorama.png`); status.textContent = 'Finished.';
  }
  $('rclose').onclick = () => { $('result').hidden = true; };

  // ---- logbook ----------------------------------------------------------
  const readLog = () => { try { return JSON.parse(localStorage.getItem('everyworld-log') ?? '[]'); } catch { return []; } };
  function addLog() {
    const c = app.cam, t = document.createElement('canvas'); t.width = 192; t.height = 108;
    app.r.present(app.current.exposure);
    t.getContext('2d').drawImage(app.canvas, 0, 0, 192, 108);
    const e = { name: app.current.name, code: encodeWorld(app), pos: c.pos, fwd: c.fwd, camUp: c.camUp, where: latlon(c), alt: fmtDist(c.alt), thumb: t.toDataURL('image/jpeg', .7) };
    try { localStorage.setItem('everyworld-log', JSON.stringify([e, ...readLog()].slice(0, 30))); } catch { /* storage is optional */ }
  }
  async function visit(e) {
    const d = decodeWorld(e.code); await load(d.base, d.mix);
    const c = app.cam; c.pos = e.pos; c.fwd = e.fwd; c.camUp = e.camUp; c.derive(); app.needGround = true; app.dirty = true;
  }
  const latlon = c => {
    const la = Math.asin(c.up[1]) * 180 / Math.PI, lo = Math.atan2(c.up[2], c.up[0]) * 180 / Math.PI;
    return `${Math.abs(la).toFixed(2)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(2)}°${lo >= 0 ? 'E' : 'W'}`;
  };

  // ---- HUD --------------------------------------------------------------
  const syncWorld = () => {
    $('wname').textContent = app.current.name; $('wkind').textContent = app.current.kind + ' · R ' + fmtDist(app.current.radius);
    try { const code = encodeWorld(app); if (code.length < 200) history.replaceState(null, '', '#' + code); } catch { /* the frame may refuse */ }
  };
  app.on(t => { if (t === 'world') syncWorld(); });
  syncWorld();
  setInterval(() => {
    const c = app.cam, r = app.r;
    $('hAlt').textContent = fmtDist(c.alt); $('hAgl').textContent = fmtDist(c.altAboveGround); $('hLoc').textContent = latlon(c);
    $('hFps').textContent = Math.round(app.fps) + ' fps';
    const done = r.samples / app.maxSamples;
    $('hState').textContent = app.moving ? `Moving at ${Math.round(r.scale * 100)}% resolution` : done >= 1 ? 'Finished' : `Refining ${r.samples} of ${app.maxSamples}`;
    $('hBar').style.width = (app.moving ? 0 : Math.min(done, 1) * 100) + '%';
  }, 200);
  const graph = buildGraph(app, rebuild, h);
  show(tab);
  setTimeout(() => { $('hint').style.opacity = 0; }, 14000);
  void node;
}
