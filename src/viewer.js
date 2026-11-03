// The Viewer interface: menu bar, RTR with JogNav and RandomCam, ViewPane control bar (which
// becomes the render status bar), Hyperspace Mixer, crop window, and mouse/keyboard input.
import { MIXERS, generateWorld, encodeWorld, decodeWorld } from './world.js';
import { v3 } from './camera.js';
import { TIERS, SENS } from './app.js';
import { QUALITY, PHASES } from './render.js';
import { $, h, svg, icon, ib, fmtDist, fmtLat, oslider, menubar, dropdown, dialog, numField, refreshWindows } from './kit.js';
import { buildPanels } from './panels.js';
import { openWizard } from './wizard.js';
import { buildGenerator } from './generator.js';

export function buildViewer(app, rq) {
  const ui = { app, rq };
  // Rebuilds coalesce: dragging a slider never queues up work.
  let pending = 0, running = false;
  // full = re-measure terrain and sea level; lite = sky, sun, colour changes only
  ui.rebuild = async (full = true) => {
    pending = Math.max(pending, full ? 2 : 1); if (running) return;
    running = true;
    while (pending) { const p = pending; pending = 0; try { await app.rebuild({ scan: p === 2 }); } catch (e) { ui.toast?.(e.message); ui.graphMessage?.(e.message, true); console.error(e); } await new Promise(r => requestAnimationFrame(r)); }
    running = false;
  };
  ui.rebuildLite = () => ui.rebuild(false);
  ui.load = async (w, mix) => {
    $('flash').style.opacity = .7;
    await app.loadWorld(w, mix);
    $('flash').style.opacity = 0;
  };
  ui.renderQuality = 'Medium';
  ui.latlon = c => { const la = Math.asin(c.up[1]) * 180 / Math.PI, lo = Math.atan2(c.up[2], c.up[0]) * 180 / Math.PI; return { la, lo, text: `${fmtLat(la)}  ${fmtLat(lo, 'E', 'W')}` }; };
  ui.thumb = (w = 192, hh = 108) => {
    const t = document.createElement('canvas'); t.width = w; t.height = hh;
    const ctx = t.getContext('2d');
    if (!app.moving && app.r.samples > 0) { app.r.present(app.current.exposure); ctx.drawImage(app.canvas, 0, 0, w, hh); }
    else ctx.drawImage(app.r.snapshot(app.cam, app.time, w, hh, 1), 0, 0);
    return t.toDataURL('image/jpeg', .72);
  };
  // Inside a sandboxed viewer frame downloads are blocked, so show the file instead.
  ui.download = (blob, name) => {
    const url = URL.createObjectURL(blob);
    let framed = true; try { framed = window.self !== window.top; } catch { /* cross-origin parent */ }
    if (!framed) { const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); return; }
    const isImg = /^image\//.test(blob.type);
    dialog('Save ' + name, h('div', { class: 'result' },
      isImg ? h('img', { src: url, alt: name }) : null,
      h('p', { class: 'note' }, isImg ? 'This viewer blocks downloads. Right-click the image and choose Save Image As.' : 'This viewer blocks downloads. Use File > Copy World Code instead, or open Everyworld on its own page to save files.'),
      h('a', { class: 'btn hot', href: url, download: name, style: 'text-decoration:none;display:inline-flex;align-items:center' }, 'Try saving')), [['Close', null]], { wide: isImg });
  };
  ui.toast = m => { $('readout').dataset.msg = m; clearTimeout(ui.toastT); ui.toastT = setTimeout(() => { delete $('readout').dataset.msg; }, 4000); };

  // ---- menu bar ---------------------------------------------------------------
  const fileIn = h('input', { type: 'file', accept: '.json,.ewld,.txt', hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try { const t = (await f.text()).trim(); const d = t.startsWith('{') ? JSON.parse(t) : decodeWorld(t); await ui.load(d.base ?? d, d.mix); } catch (err) { dialog('Open', h('p', {}, 'That file is not an Everyworld planet: ' + err.message)); }
  } });
  document.body.append(fileIn);
  const saveWorld = () => {
    const blob = new Blob([JSON.stringify({ everyworld: 1, base: app.base, mix: app.mix, settings: ui.panels?.settingsList?.() ?? [] }, null, 1)], { type: 'application/json' });
    ui.download(blob, (app.base.name || 'planet').replace(/\W+/g, '') + '.ewld');
  };
  const copyCode = async () => {
    const code = encodeWorld(app);
    const box = h('textarea', { class: 'field', style: 'width:100%;height:110px;border-radius:4px;font:10.5px var(--mono)', readonly: true }, code);
    try { await navigator.clipboard.writeText(code); } catch { /* the dialog still shows it */ }
    dialog('World Code', h('div', {}, h('p', { class: 'note' }, code.length < 40 ? 'Copied. This planet is unedited, so its code is just its seed.' : 'Copied. Edited planets carry their whole description, so the code is long.'), box));
    box.select();
  };
  const openCode = () => {
    const inp = h('input', { class: 'field', style: 'width:100%', placeholder: 'w2k or x...' });
    dialog('Open World Code', h('div', {}, h('p', { class: 'note' }, 'Paste a world code.'), inp), [['Cancel', null], ['Open', async () => { try { const d = decodeWorld(inp.value); await ui.load(d.base, d.mix); } catch (e) { inp.value = e.message; return false; } }, true]]);
    inp.focus();
  };
  const planetInfo = () => {
    const w = app.current, b = app.base;
    const ta = h('textarea', { class: 'field', style: 'width:100%;height:80px;border-radius:4px', onchange: e => { b.info = e.target.value; } }, b.info ?? '');
    dialog('Planet Info', h('div', { class: 'info' }, h('pre', {}, `${w.name}  (seed ${w.seed}, ${w.kind})\nRadius ${fmtDist(w.radius)}   Sea ${['water', 'lava', 'ice', 'none'][w.seaType]}   Moons ${w.moons.length}   Rings ${w.rings ? 'yes' : 'no'}\n`), h('p', { class: 'note' }, 'Author notes, saved with the planet:'), ta));
  };
  const techInfo = () => dialog('Info', h('div', { class: 'info' }, h('pre', {}, [
    `GPU            ${app.r.gpuName}`,
    `Preview tier   ${app.tier.label}${app.tierPref === 'auto' ? ' (automatic)' : ''}`,
    `RTR size       ${app.canvas.width} x ${app.canvas.height}`,
    `GPU timer      ${app.r.tq ? 'yes' : 'no (pacing by fence only)'}`,
    `Motion frame   ${app.r.cost.move.toFixed(1)} ms GPU at ${Math.round(app.r.scale * 100)}% size`,
    `Refine sample  ${app.r.cost.refine.toFixed(1)} ms GPU, in ${app.bands} strips`,
    `Skipped frames ${app.skipped ?? 0} (GPU still busy)`,
  ].join('\n'))));
  const quickRef = () => dialog('Quick Reference', h('div', { class: 'info' }, h('pre', {}, [
    'WALK  (camera rides on stilts above the ground)',
    '  drag            look around (in orbit: spin the globe)',
    '  W A S D, arrows  move     M / N  higher / lower    Q / E  tilt',
    '  wheel           change height     Shift  slow',
    '  double-click    fly to that point',
    '  Shift+dbl-click stand there at 2 m',
    '  JogNav          trackball turns; arrows move; 10K and 2m targets',
    '',
    'FLY / UFO  (right-click the icon for Gentle / Intermediate / Extreme)',
    '  W S  speed      A D  crab      M N  climb / sink',
    '  hold left mouse: drag up/down pitches (down = nose up), left/right rolls',
    '  hold right mouse: yaw',
    '  Space  stop     L  level     B  jump to 10 km',
    '',
    'R / T  start / stop recording a movie     H  back to orbit',
    'RandomCam  six-pip die: anywhere lit; two-pip die: nearby; + saves the view',
  ].join('\n'))), [['Close', null]], { wide: true });
  const about = () => dialog('About Everyworld', h('div', {}, h('p', {}, 'Everyworld is an independent browser re-creation of the ideas in MojoWorld, the fractal planet software by F. Kenton Musgrave and Pandromeda (2000 to 2005). It is not affiliated with them.'), h('p', { class: 'note' }, 'Every planet is a few numbers. Terrain is evaluated per pixel on the GPU with Musgrave-style multifractals, exact to millimetre scale.')));
  const tierItems = () => [
    ['Automatic', () => app.setTier('auto'), { checked: app.tierPref === 'auto' }],
    ...Object.entries(TIERS).map(([k, t]) => [t.label, () => app.setTier(k), { checked: app.tierPref === k }]),
  ];
  ui.menus = () => menubar($('menus'), [
    ['File', () => [
      ['New using Planet Wizard...', () => openWizard(ui), { key: 'Ctrl+N' }],
      ['New Random Planet', () => ui.load(generateWorld(Math.floor(Math.random() * 1e6)))],
      ['Open...', () => fileIn.click()],
      ['Open World Code...', openCode],
      ['Save...', saveWorld, { key: 'Ctrl+S' }],
      ['Copy World Code', copyCode],
      '-',
      ['Planet Info...', planetInfo],
      ['Info...', techInfo],
      '-',
      ui.generator?.on ? ['Go to Viewer', () => ui.generator.toggle(false)] : ['Go to Generator', () => ui.generator.toggle(true)],
    ]],
    ['View', () => [
      ['Preview Quality:', () => {}, { disabled: true }],
      ...tierItems(),
      '-',
      ['Motion 24 fps', () => { app.targetFps = 24; }, { checked: app.targetFps === 24 }],
      ['Motion 30 fps', () => { app.targetFps = 30; }, { checked: app.targetFps === 30 }],
      ['Motion 60 fps', () => { app.targetFps = 60; }, { checked: app.targetFps === 60 }],
      '-',
      ['Keep JogNav Open', () => $('jognav').classList.toggle('locked'), { checked: $('jognav').classList.contains('locked') }],
      ['Keep RandomCam Open', () => $('randomcam').classList.toggle('locked'), { checked: $('randomcam').classList.contains('locked') }],
      ['Back to Orbit', () => home(), { key: 'H' }],
    ]],
    ['Help', [
      ['Viewer Quick Reference...', quickRef],
      ['About Everyworld...', about],
    ]],
  ]);

  // ---- ViewPane control bar ----------------------------------------------------
  const bar = $('ctrlbar');
  const modeBtn = {};
  const sensMenu = btn => dropdown(btn, Object.entries(SENS).map(([k, s]) => [s.label, () => { app.sens = k; }, { checked: app.sens === k }]));
  const renderMenu = btn => dropdown(btn, [
    ...Object.keys(QUALITY).map(k => [k, () => { ui.renderQuality = k; }, { checked: ui.renderQuality === k }]),
    '-',
    ['Render QTVR Now...', () => { const j = rq.addJob('qtvr', { quality: ui.renderQuality, thumb: ui.thumb(96, 54) }); ui.panels.show('uplink', j); rq.startQueue(); }],
    ['Add to Log...', () => { ui.panels.addLog(); ui.panels.show('log'); }],
    ['Process Later...', () => { const j = rq.addJob('still', { quality: ui.renderQuality, thumb: ui.thumb(96, 54) }); ui.panels.show('uplink', j); }],
  ]);
  const statusEl = h('div', { class: 'status' });
  function viewBar() {
    const style = h('select', { title: 'Preview Style', 'aria-label': 'Preview Style', onchange: e => { app.r.style = +e.target.value; app.dirty = true; } },
      ...[['Textured', 0], ['Textured with Clouds', 1], ['Wireframe', 2]].map(([t, v]) => { const o = h('option', { value: v }, t); if (v === app.r.style) o.selected = true; return o; }));
    for (const [m, t] of [['walk', 'Walk Mode'], ['fly', 'Fly Mode (right-click for sensitivity)'], ['ufo', 'UFO Mode (right-click for sensitivity)']]) {
      const b = modeBtn[m] = ib(m, t, () => setMode(m), { cls: app.mode === m ? 'on' : '' });
      if (m !== 'walk') b.addEventListener('contextmenu', e => { e.preventDefault(); sensMenu(b); });
    }
    const pauseB = ib('pause', 'Pause the RTR', () => { app.paused = true; syncPause(); }, { cls: app.paused ? 'on' : '' });
    const jumpB = ib('jump', 'Jump: restart the RTR', () => { app.paused = false; app.dirty = true; syncPause(); });
    const cropB = ib('crop', 'Crop Window', () => toggleCrop(), { cls: crop.on ? 'on' : '' });
    const camB = ib('camera', 'Render the current view', () => startRender());
    const optB = ib('caret', 'Render Options', () => renderMenu(optB)); optB.classList.add('small');
    bar.classList.remove('rendering');
    bar.replaceChildren(style, h('span', { class: 'sep' }), modeBtn.walk, modeBtn.fly, modeBtn.ufo, h('span', { class: 'sep' }), pauseB, jumpB, h('span', { class: 'sep' }), cropB, camB, optB, statusEl);
    ui.syncPause = () => { pauseB.classList.toggle('on', app.paused); $('pauseMark').hidden = !app.paused; };
  }
  const syncPause = () => ui.syncPause();
  function renderBar() {
    const j = rq.job;
    const dots = h('span', { class: 'dots' }, ...Array.from({ length: 10 }, (_, i) => h('i', { class: j.frac * 10 >= i + 1 ? 'on' : '' })));
    const done = j.phase === 5;
    const secs = ((done ? j.ms : performance.now() - j.started) / 1000);
    bar.classList.add('rendering');
    bar.replaceChildren(
      ib('save', 'Save to File', async () => { const r = await rq.saveView(); if (r) ui.download(r.blob, r.name); }, { attrs: { disabled: done ? null : true } }),
      ib('pause', 'Pause rendering', () => { j.control.paused = !j.control.paused; renderBar(); }, { cls: j.control.paused ? 'on' : '' }),
      ib('close', 'Close and return to the RTR', () => rq.closeView()),
      h('span', { class: 'sep' }),
      h('span', { class: 'phase' }, PHASES[j.phase]), dots,
      h('div', { class: 'status' }, `${j.q} · ${j.W} × ${j.H}${j.crop ? ' (crop)' : ''} · ${secs.toFixed(1)} s`));
  }
  rq.on(t => { if (rq.job && (t === 'start' || t === 'progress')) renderBar(); if (t === 'end') viewBar(); });
  function startRender() { rq.renderView(ui.renderQuality, crop.on ? cropRect() : null); }

  function setMode(m) {
    app.setMode(m);
    for (const k in modeBtn) modeBtn[k].classList.toggle('on', k === m);
    $('jognav').hidden = m !== 'walk';
  }
  ui.setMode = setMode;

  // ---- crop window -----------------------------------------------------------------
  const crop = { on: false, zoom: null };
  const cropEl = $('crop');
  function toggleCrop() { crop.on = !crop.on; cropEl.hidden = !crop.on; viewBar(); if (!crop.on && crop.zoom) unzoom(); }
  function cropRect() {
    const b = cropEl.getBoundingClientRect(), r = app.canvas.getBoundingClientRect(), sx = app.canvas.width / r.width, sy = app.canvas.height / r.height;
    const x = Math.max(0, Math.round((b.left - r.left) * sx)), w = Math.min(Math.round(b.width * sx), app.canvas.width - x);
    const yTop = Math.max(0, Math.round((b.top - r.top) * sy)), hh = Math.min(Math.round(b.height * sy), app.canvas.height - yTop);
    return [x, app.canvas.height - yTop - hh, w, hh];
  }
  const dragCrop = (e, mode) => {
    e.preventDefault(); e.stopPropagation();
    const r = $('rtr').getBoundingClientRect(), b0 = cropEl.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    const mv = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      let L = b0.left - r.left, T = b0.top - r.top, W = b0.width, H = b0.height;
      if (mode === 'move') { L += dx; T += dy; } else if (mode === 'tl') { L += dx; T += dy; W -= dx; H -= dy; } else { W += dx; H += dy; }
      W = Math.max(W, 40); H = Math.max(H, 30);
      Object.assign(cropEl.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
      if (crop.zoom) acceptZoom();
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  cropEl.querySelector('.clabel').addEventListener('pointerdown', e => dragCrop(e, 'move'));
  cropEl.querySelector('.tl').addEventListener('pointerdown', e => dragCrop(e, 'tl'));
  cropEl.querySelector('.br').addEventListener('pointerdown', e => dragCrop(e, 'br'));
  const zoomB = cropEl.querySelector('.zoom');
  zoomB.onclick = () => (crop.zoom ? unzoom() : zoomToCrop());
  function zoomToCrop() {
    const c = app.cam, b = cropEl.getBoundingClientRect(), r = app.canvas.getBoundingClientRect();
    const cx = ((b.left + b.width / 2 - r.left) / r.width) * 2 - 1, cy = 1 - ((b.top + b.height / 2 - r.top) / r.height) * 2;
    crop.zoom = { fov: c.fov, fwd: c.fwd.slice(), camUp: c.camUp.slice() };
    const tan = Math.tan(c.fov / 2), asp = r.width / r.height;
    c.fwd = v3.norm(v3.add(v3.add(c.fwd, c.right, cx * tan * asp), c.camUp, cy * tan));
    c.fov = 2 * Math.atan(tan * Math.max(b.height / r.height, b.width / r.width / 1));
    c.derive(); app.dirty = true; zoomB.classList.add('on');
    Object.assign(cropEl.style, { left: (r.width - b.width * r.height / b.height) / 2 + 'px', top: '0px', width: b.width * r.height / b.height + 'px', height: r.height - 2 + 'px' });
  }
  function unzoom() { const c = app.cam, z = crop.zoom; c.fov = z.fov; c.fwd = z.fwd; c.camUp = z.camUp; c.derive(); crop.zoom = null; zoomB.classList.remove('on'); app.dirty = true; }
  function acceptZoom() { crop.zoom = null; zoomB.classList.remove('on'); }

  // ---- JogNav ---------------------------------------------------------------------------
  function buildJogNav() {
    const W = 236, H = 150, cx = 104, cy = 88, R = 30;
    const s = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'JogNav' });
    const defs = svg('defs'); const gr = svg('radialGradient', { id: 'ballGrad', cx: '38%', cy: '32%', r: '70%' });
    gr.append(svg('stop', { offset: '0%', 'stop-color': 'rgba(255,255,255,.55)' }), svg('stop', { offset: '60%', 'stop-color': 'rgba(120,120,135,.35)' }), svg('stop', { offset: '100%', 'stop-color': 'rgba(20,20,30,.5)' }));
    defs.append(gr); s.append(defs);
    // field of view arc over the top
    const a0 = Math.PI * 1.18, a1 = Math.PI * 1.82, ar = 70;
    const arcPt = a => [cx + Math.cos(a) * ar, cy + Math.sin(a) * ar];
    const [x0, y0] = arcPt(a0), [x1, y1] = arcPt(a1);
    const arc = svg('path', { class: 'jg fov', d: `M${x0},${y0}A${ar},${ar} 0 0 1 ${x1},${y1}` }); arc.append(svg('title')); arc.firstChild.textContent = 'Field of view: drag left to zoom in, right to widen';
    const knob = svg('circle', { class: 'jg knob', r: 4.5 });
    const fovT = svg('text', { class: 'jgt', x: cx, y: cy - ar - 9 });
    const placeKnob = () => { const t = (app.cam.fov * 180 / Math.PI - 10) / 100, [x, y] = arcPt(a0 + (a1 - a0) * t); knob.setAttribute('cx', x); knob.setAttribute('cy', y); fovT.textContent = Math.round(app.cam.fov * 180 / Math.PI) + '°'; };
    arc.addEventListener('pointerdown', e => {
      arc.setPointerCapture(e.pointerId); let lx = e.clientX;
      const mv = ev => { const d = ev.clientX - lx; lx = ev.clientX; app.cam.fov = Math.min(Math.max(app.cam.fov + d * .006, 10 * Math.PI / 180), 110 * Math.PI / 180); app.dirty = true; placeKnob(); };
      const up = () => { arc.removeEventListener('pointermove', mv); arc.removeEventListener('pointerup', up); };
      arc.addEventListener('pointermove', mv); arc.addEventListener('pointerup', up);
    });
    s.append(arc, knob, fovT);
    // flat arrows around the trackball
    const hold = (el, v) => {
      const on = e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); app.jog = v.map(x => x * (e.shiftKey ? .2 : 1)); el.classList.add('on'); };
      const off = () => { app.jog = null; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    };
    const arrow = (ang, v, title) => {
      const d = R + 14, px = cx + Math.cos(ang) * d, py = cy + Math.sin(ang) * d;
      const p = svg('path', { class: 'jg arrow', d: 'M0,-8L9,4H-9Z', transform: `translate(${px},${py}) rotate(${ang * 180 / Math.PI + 90})` });
      p.append(svg('title')); p.firstChild.textContent = title; hold(p, v); s.append(p);
    };
    arrow(-Math.PI / 2, [1, 0, 0], 'Forward'); arrow(Math.PI / 2, [-1, 0, 0], 'Back'); arrow(Math.PI, [0, -1, 0], 'Left'); arrow(0, [0, 1, 0], 'Right');
    // trackball
    const ball = svg('circle', { class: 'jg ball', cx, cy, r: R }); ball.append(svg('title')); ball.firstChild.textContent = 'Trackball: drag to turn and pitch. Alt-drag tilts. Double-click levels.';
    const cross = svg('path', { d: `M${cx - 9},${cy}H${cx + 9}M${cx},${cy - 9}V${cy + 9}`, stroke: 'rgba(255,255,255,.6)', 'pointer-events': 'none' });
    ball.addEventListener('pointerdown', e => {
      ball.setPointerCapture(e.pointerId); let lx = e.clientX, ly = e.clientY;
      const mv = ev => {
        const dx = ev.clientX - lx, dy = ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; const k = (ev.shiftKey ? .002 : .008);
        if (ev.altKey) app.cam.roll(dx * k); else app.cam.look(dx * k, -dy * k);
        app.dirty = true;
      };
      const up = () => { ball.removeEventListener('pointermove', mv); ball.removeEventListener('pointerup', up); };
      ball.addEventListener('pointermove', mv); ball.addEventListener('pointerup', up);
    });
    ball.addEventListener('dblclick', () => app.levelNow());
    s.append(ball, cross);
    // vertical arrow with 10K and 2m targets
    const vx = 196;
    const up = svg('path', { class: 'jg arrow', d: `M${vx},${cy - 32}l9,13h-6v14h-6v-14h-6z` }), dn = svg('path', { class: 'jg arrow', d: `M${vx},${cy + 32}l9,-13h-6v-14h-6v14h-6z` });
    up.append(svg('title')); up.firstChild.textContent = 'Higher'; dn.append(svg('title')); dn.firstChild.textContent = 'Lower (minimum 1 m)';
    hold(up, [0, 0, 1]); hold(dn, [0, 0, -1]);
    const target = (y, label, km, tip) => {
      const c = svg('circle', { class: 'jg tgt', cx: vx, cy: y, r: 13 }); c.append(svg('title')); c.firstChild.textContent = tip;
      c.addEventListener('click', () => { app.standAt(km); if (app.mode !== 'walk') setMode('walk'); });
      s.append(c, Object.assign(svg('text', { class: 'jgt', x: vx, y }), { textContent: label }));
    };
    s.append(up, dn);
    target(cy - 52, '10K', 10, 'Level at 10 km above the ground (B)');
    target(cy + 52, '2m', .002, 'Level at 2 m above the ground, about eye height');
    const lock = h('button', { title: 'Keep the JogNav open', 'aria-label': 'Keep the JogNav open', onclick: () => { $('jognav').classList.toggle('locked'); lock.textContent = $('jognav').classList.contains('locked') ? '↑' : '–'; } }, '–');
    $('jognav').replaceChildren(h('div', { class: 'pad' }, s), h('div', { class: 'tab' }, 'JOGNAV', lock));
    ui.placeKnob = placeKnob; placeKnob();
  }

  // ---- RandomCam ---------------------------------------------------------------------
  const rc = { alt: 'walk', stack: [] };
  const RC_ALT = { walk: .005, fly: 10, ufo: 500 };
  function buildRandomCam() {
    const vstack = h('div', { class: 'vstack' });
    const altB = {};
    const pick = k => { rc.alt = k; for (const x in altB) altB[x].classList.toggle('on', x === k); };
    for (const [k, t] of [['walk', 'Random jumps near the ground (about 5 m)'], ['fly', 'Random jumps at airplane height (about 10 km)'], ['ufo', 'Random jumps from high up (about 500 km)']]) altB[k] = ib(k, t, () => pick(k), { cls: 'small' + (k === rc.alt ? ' on' : '') });
    const jump = big => {
      if (!rc.stack.length) push(true);
      app.cam.flight = null;
      app.randomCam(big, RC_ALT[rc.alt] * (big ? 1 : .6 + Math.random() * .8));
    };
    const push = (first = false) => {
      const e = { thumb: ui.thumb(96, 54), pos: app.cam.pos.slice(), fwd: app.cam.fwd.slice(), camUp: app.cam.camUp.slice(), first };
      rc.stack.push(e); draw();
    };
    const draw = () => vstack.replaceChildren(...rc.stack.map(e => h('img', { src: e.thumb, alt: e.first ? 'Where I started' : 'Saved view', title: e.first ? 'Where I started. Click to return; shift-click to add to the Log.' : 'Click to return; shift-click to add to the Log.', class: e.first ? 'first' : '', onclick: ev => {
      app.applyPose(e); app.cam.flight = null; if (app.mode === 'walk') app.stilts = app.cam.altAboveGround;
      if (ev.shiftKey) { ui.panels.addLog(); ui.panels.show('log'); }
    } })));
    ui.clearViewStack = () => { rc.stack = []; draw(); };
    const lock = ib('lock', 'Keep the RandomCam ViewStack open', () => { $('randomcam').classList.toggle('locked'); lock.classList.toggle('on'); }, { cls: 'small' });
    $('randomcam').replaceChildren(vstack, h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'RANDOMCAM'),
      ib('die6', 'Six-pip die: jump anywhere on the lit side', () => jump(true)),
      ib('die2', 'Two-pip die: jump somewhere near here', () => jump(false)),
      ib('plus', 'Add this view to the ViewStack', () => { if (!rc.stack.length) push(true); else push(); }),
      h('span', { class: 'sep', style: 'width:6px' }), altB.walk, altB.fly, altB.ufo, lock));
  }

  // ---- Hyperspace Mixer ------------------------------------------------------------------
  const mixRows = [];
  function buildMixer() {
    const list = h('div', { class: 'mixlist' });
    mixRows.length = 0;
    for (const m of MIXERS) {
      const out = h('output', {}, '');
      const show = () => { const v = app.mix[m.id]; out.textContent = (v > 0 ? '+' : '') + v.toFixed(2); };
      const sl = oslider(() => app.mix[m.id], v => { app.mix[m.id] = v; show(); ui.rebuild(); onMixChange(); }, { label: m.label });
      show();
      list.append(h('div', { class: 'mrow', title: `${m.lo} to ${m.hi}` }, h('label', {}, m.label), sl, out));
      mixRows.push(() => { sl.refresh(); show(); });
    }
    // hyperspace travel toward a neighbouring world
    const dest = numField(() => app.morphSeed ?? (app.base.seed + 1), v => { app.morphSeed = v; if (app.morphTo) { app.morphTo = generateWorld(v); ui.rebuild(); } destName.textContent = generateWorld(v).name; }, { min: 0, max: 999999, step: 1 });
    const destName = h('span', { class: 'hint' }, generateWorld(app.morphSeed ?? (app.base.seed + 1)).name);
    const blendOut = h('output', {}, app.morphT.toFixed(2));
    const blend = oslider(() => app.morphT, v => { app.morphT = v; app.morphTo = v > 0 ? generateWorld(app.morphSeed ?? (app.base.seed + 1)) : null; blendOut.textContent = v.toFixed(2); ui.rebuild(); }, { min: 0, max: 1, label: 'Hyperspace blend' });
    list.append(h('div', { class: 'mrow', style: 'margin-top:6px', title: 'Blend terrain, air, clouds and colour toward another world' }, h('label', {}, 'Blend toward'), blend, blendOut),
      h('div', { class: 'row', style: 'padding-left:min(158px,30%)' }, h('span', { class: 'hint' }, 'World'), dest, destName));
    const rand = k => { for (const m of MIXERS) app.mix[m.id] = Math.max(-1, Math.min(1, k > .5 ? Math.random() * 2 - 1 : app.mix[m.id] + (Math.random() * 2 - 1) * k)); refreshMix(); ui.rebuild(); onMixChange(); };
    $('mixer').replaceChildren(
      h('div', { class: 'shead' }, 'Hyperspace Mixer', h('span', { class: 'grow' }),
        ib('die2', 'Small random change to every slider', () => rand(.18), { cls: 'small' }),
        ib('die6', 'Large random change to every slider', () => rand(1), { cls: 'small' }),
        h('button', { class: 'btn', onclick: () => { for (const m of MIXERS) app.mix[m.id] = 0; refreshMix(); ui.rebuild(); onMixChange(); } }, 'Reset')),
      list);
  }
  const refreshMix = () => mixRows.forEach(f => f());
  const onMixChange = () => { ui.panels?.mixChanged(); ui.clearViewStack?.(); };
  ui.refreshMix = refreshMix;

  // ---- RTR readout ---------------------------------------------------------------------
  function readout() {
    const c = app.cam, r = app.r, ll = ui.latlon(c);
    const st = rq.job ? '' : app.paused ? 'PAUSED' : app.moving ? `MOVING ${Math.round(r.scale * 100)}%` : r.samples >= app.maxSamples ? 'IDLE' : `REFINING ${r.samples}/${app.maxSamples}`;
    const msg = $('readout').dataset.msg;
    $('readout').textContent = (msg ? msg + '\n' : '') + `${app.current.name}\nLAT ${fmtLat(ll.la)}  LON ${fmtLat(ll.lo, 'E', 'W')}\nALT ${fmtDist(c.altAboveGround)} AGL  ${app.mode.toUpperCase()}${app.mode !== 'walk' ? ' ' + SENS[app.sens].label.toUpperCase() : ''}  ${st}`;
    if (!rq.job) statusEl.textContent = app.movie.rec ? '● Recording' : app.movie.play ? '▶ Playing movie' : '';
  }
  setInterval(readout, 200);

  // ---- canvas input ----------------------------------------------------------------------
  const cv = app.canvas; let drag = null, pinch = null; const pts = new Map();
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (rq.job) return;
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, button: e.button };
    app.cam.flight = null; if (app.movie.play) app.pauseMovie();
    if (app.mode !== 'walk') app.stick = { dx: 0, dy: 0, button: e.button };
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) { const k = pinch / d; app.cam.dolly(k); if (app.stilts) app.stilts *= k; app.needGround = true; app.dirty = true; }
      pinch = d; return;
    }
    if (app.mode !== 'walk') { const s = Math.min(cv.clientWidth, cv.clientHeight) * .35; app.stick = { dx: (e.clientX - drag.x0) / s, dy: (e.clientY - drag.y0) / s, button: drag.button }; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    const c = app.cam, k = c.fov / cv.clientHeight * (drag.button === 2 ? 2.5 : 1.1);
    if (c.orbital > .5) { const rate = c.fov / cv.clientHeight * Math.min(c.alt / c.R, 1.2); c.orbit(dx * rate, dy * rate); }
    else c.look(dx * k, dy * k);
    app.dirty = true;
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) app.stick = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', e => {
    if (rq.job) return;
    const c = app.cam, b = cv.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 2 - 1, y = 1 - ((e.clientY - b.top) / b.height) * 2;
    const tan = Math.tan(c.fov / 2), asp = b.width / b.height;
    const d = v3.norm(v3.add(v3.add(c.fwd, c.right, x * tan * asp), c.camUp, y * tan));
    const p = app.r.pick(c, app.time, d); if (!(p.t > 0)) return;
    const q = v3.add(c.pos, d, p.t), dir = v3.norm(q), gh = Math.hypot(...q) - c.R;
    if (app.mode !== 'walk') setMode('walk');
    const alt = e.shiftKey ? .002 : Math.max(p.t * .12, .004);
    const look = v3.norm(v3.add(d, dir, -v3.dot(d, dir) * (e.shiftKey ? 1 : .9)));
    c.flyTo(dir, alt, gh, look, e.shiftKey ? 2.8 : 2.4);
    app.stilts = alt;
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault(); if (rq.job) return;
    app.cam.flight = null; const k = Math.exp(e.deltaY * .0012);
    app.cam.dolly(k); if (app.mode === 'walk') app.stilts = app.cam.orbital < .5 ? Math.max(app.cam.altAboveGround, .001) : null;
    app.needGround = true; app.dirty = true;
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.matches?.('input,select,textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') { e.preventDefault(); openWizard(ui); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); saveWorld(); return; }
    if (e.ctrlKey || e.metaKey || rq.job) return;
    app.keys.add(e.code);
    if (e.code === 'Space') { app.stop(); e.preventDefault(); }
    if (e.code === 'KeyL') app.levelNow();
    if (e.code === 'KeyB') app.popUp();
    if (e.code === 'KeyH') home();
    if (e.code === 'KeyR' && !app.movie.rec) { app.recordStart(); ui.panels.show('movie'); }
    if (e.code === 'KeyT' && app.movie.rec) app.recordStop();
    if (e.code.startsWith('Arrow') || e.code.startsWith('Page')) e.preventDefault();
  });
  addEventListener('keyup', e => app.keys.delete(e.code));
  addEventListener('blur', () => app.keys.clear());
  function home() { const c = app.cam; setMode('walk'); app.stilts = null; const d = c.up.slice(); c.flyTo(d, app.current.radius * 2.1, 0, d.map(v => -v), 3); }
  ui.home = home;

  // ---- world changes ------------------------------------------------------------------------
  app.on(t => {
    if (t === 'tier') ui.toast(`Preview quality: ${app.tier.label}`);
    if (t === 'world') { $('wname').textContent = app.current.name; document.title = `Everyworld - ${app.current.name}`; try { const code = encodeWorld(app); history.replaceState(null, '', code.length < 200 ? '#' + code : location.pathname); } catch { /* the frame may refuse */ } }
    if (t === 'load') { ui.clearViewStack?.(); buildMixer(); ui.panels?.refresh(); refreshWindows(); }
    if (t === 'mode') { for (const k in modeBtn) modeBtn[k].classList.toggle('on', k === app.mode); $('jognav').hidden = app.mode !== 'walk'; }
  });

  buildJogNav(); buildRandomCam(); buildMixer(); viewBar();
  ui.panels = buildPanels(ui);
  ui.generator = buildGenerator(ui);
  ui.menus();
  $('wname').textContent = app.current.name;
  setMode('walk');
  return ui;
}
