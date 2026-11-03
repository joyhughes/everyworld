// Generator: hot buttons down the left open editor windows (control stacks), plus the MojoGraph
// function graph editor and the Parameter Bomb editor.
import { NODE_TYPES } from './graph.js';
import { node, rng } from './world.js';
import { v3 } from './camera.js';
import { $, h, svg, icon, ib, numField, choice, check, srow, stack, field, openWindow, refreshWindows, closeWindow } from './kit.js';

export function buildGenerator(ui) {
  const app = ui.app, G = { on: false };
  const b = () => app.base;
  const lite = () => ui.rebuildLite(), full = () => ui.rebuild(true);
  const num = (label, get, set, o = {}) => srow(label, numField(get, v => { set(v); (o.full ? full : lite)(); }, o), { anim: o.anim !== false, tip: o.tip });
  const rgb = (label, get, set) => srow(label, h('span', { class: 'row', style: 'margin:0;gap:4px' },
    ...[0, 1, 2].map(i => numField(() => get()[i], v => { const c = get().slice(); c[i] = v; set(c); lite(); }, { min: 0, max: i === 3 ? 1 : 1, fmt: v => ['R', 'G', 'B'][i] + ' ' + v.toFixed(2) }))), { anim: true });
  const p = id => node(app.base, id)?.params ?? {};

  const EDITORS = {
    stars: ['Stars Editor', 'stars', () => [stack(
      num('Star Intensity', () => b().sky.stars, v => { b().sky.stars = v; }, { min: 0, max: 3 }),
      num('Nebula', () => b().sky.nebula, v => { b().sky.nebula = v; }, { min: 0, max: 2 }),
      num('Nebula Hue', () => b().sky.hue, v => { b().sky.hue = v; }, { min: 0, max: 1 }))]],
    sun: ['Sun Editor', 'sun', () => [stack(
      rgb('Colour', () => b().sun.color, v => { b().sun.color = v; }),
      num('Brightness', () => b().sun.power, v => { b().sun.power = v; }, { min: 2, max: 80 }),
      num('Disc Size', () => b().sun.size * 180 / Math.PI, v => { b().sun.size = v * Math.PI / 180; }, { min: .1, max: 3, fmt: v => v.toFixed(2) + '°' }),
      num('Time of Day', () => b().sun.time * 24, v => { b().sun.time = v / 24; }, { min: 0, max: 24, fmt: v => `${Math.floor(v)}h ${String(Math.floor(v % 1 * 60)).padStart(2, '0')}m` }),
      num('Season Tilt', () => b().sun.tilt * 180 / Math.PI, v => { b().sun.tilt = v * Math.PI / 180; }, { min: -35, max: 35, fmt: v => v.toFixed(1) + '°' }))]],
    moon: ['Moon Editor', 'moon', () => [
      ...b().moons.map((m, i) => h('div', {}, h('b', {}, `Moon ${i + 1}`), stack(
        num('Radius', () => m.radius, v => { m.radius = v; }, { min: 20, max: 8000, log: true, fmt: v => Math.round(v) + ' km' }),
        num('Distance', () => m.dist, v => { m.dist = v; }, { min: b().radius * 2, max: b().radius * 200, log: true, fmt: v => Math.round(v).toLocaleString() + ' km' }),
        num('Position', () => m.az * 180 / Math.PI, v => { m.az = v * Math.PI / 180; }, { min: 0, max: 360, fmt: v => v.toFixed(1) + '°' }),
        num('Inclination', () => m.incl * 180 / Math.PI, v => { m.incl = v * Math.PI / 180; }, { min: -60, max: 60, fmt: v => v.toFixed(1) + '°' }),
        rgb('Colour', () => m.color, v => { m.color = v; }),
        srow('', h('button', { class: 'btn red', onclick: () => { b().moons.splice(i, 1); lite(); refreshWindows(); } }, 'Delete Moon'), { anim: false })))),
      h('div', { class: 'row' }, h('button', { class: 'btn', disabled: b().moons.length >= 3 ? true : null, onclick: () => { const r = rng(Date.now() >>> 0); b().moons.push({ dist: b().radius * r.range(10, 40), radius: b().radius * r.range(.06, .25), az: r.range(0, 6.28), incl: r.range(-.3, .3), seed: r.int(1, 1e6), color: [.62, .6, .57] }); lite(); refreshWindows(); } }, 'Add Moon'), h('span', { class: 'hint' }, 'Up to three moons are drawn.'))]],
    sky: ['Sky Editor', 'sky', () => [h('b', {}, 'Atmosphere'), stack(
      num('Density', () => b().atmo.scale, v => { b().atmo.scale = v; }, { min: 0, max: 5 }),
      num('Scale Height', () => b().atmo.hr, v => { b().atmo.hr = v; }, { min: 2, max: 25, fmt: v => v.toFixed(1) + ' km' }),
      rgb('Scattering', () => b().atmo.rayleigh, v => { b().atmo.rayleigh = v; }),
      num('Haze', () => b().atmo.mie, v => { b().atmo.mie = v; }, { min: 0, max: 8 }),
      num('Haze Height', () => b().atmo.hm, v => { b().atmo.hm = v; }, { min: .3, max: 6, fmt: v => v.toFixed(2) + ' km' }),
      num('Haze Glow', () => b().atmo.g, v => { b().atmo.g = v; }, { min: 0, max: .95 })),
    h('b', {}, 'Cloud Layer'), stack(
      num('Cover', () => b().clouds.cover, v => { b().clouds.cover = v; }, { min: 0, max: 1 }),
      num('Feature Size', () => b().clouds.scale, v => { b().clouds.scale = v; }, { min: 1, max: 14 }),
      num('Base', () => b().clouds.low, v => { b().clouds.low = Math.min(v, b().clouds.high - .3); }, { min: .3, max: 15, fmt: v => v.toFixed(1) + ' km' }),
      num('Top', () => b().clouds.high, v => { b().clouds.high = Math.max(v, b().clouds.low + .3); }, { min: 1, max: 30, fmt: v => v.toFixed(1) + ' km' }),
      num('Density', () => b().clouds.density, v => { b().clouds.density = v; }, { min: .1, max: 4 }),
      num('Drift Speed', () => b().clouds.speed, v => { b().clouds.speed = v; }, { min: 0, max: 8 }),
      rgb('Colour', () => b().clouds.color, v => { b().clouds.color = v; }))]],
    land: ['Land Editor', 'land', () => [stack(
      srow('Name', field(() => b().name, v => { b().name = v; app.current.name = v; app.emit('world'); }), { anim: false }),
      num('Planet Radius', () => b().radius, v => { b().radius = v; }, { min: 500, max: 20000, log: true, full: true, fmt: v => (v * 1000).toFixed(0) + ' m' }),
      num('Mountain Height', () => p('relief').a, v => { p('relief').a = v; }, { min: 0, max: 40, full: true }),
      num('Hill Height', () => p('relief').b, v => { p('relief').b = v; }, { min: 0, max: 3, full: true }),
      num('Continent Size', () => p('cont').freq, v => { p('cont').freq = v; }, { min: .3, max: 8, log: true, full: true, tip: 'Features per planet radius' }),
      num('Continent Height', () => p('height').a, v => { p('height').a = v; }, { min: 0, max: 10, full: true }),
      num('Mountain Spacing', () => p('ridge').freq, v => { p('ridge').freq = v; }, { min: 5, max: 400, log: true, full: true }),
      num('Ruggedness', () => 1 - p('ridge').H, v => { p('ridge').H = 1 - v; p('hills').H = 1 - v; }, { min: 0, max: .7, full: true }),
      num('Erosion', () => p('ridge').erosion, v => { p('ridge').erosion = v; p('hills').erosion = v * 1.3; }, { min: 0, max: 1.5, full: true }),
      num('Crater Depth', () => p('crater2').scale, v => { p('crater2').scale = v; }, { min: 0, max: 5, full: true }),
      num('Boulders', () => p('rocks').size, v => { p('rocks').size = v; }, { min: 0, max: 2, full: true }),
      srow('Function', h('button', { class: 'btn', onclick: () => openGraph() }, 'Open MojoGraph...'), { anim: false }))]],
    material: ['Land Material Editor', 'material', () => [stack(
      choiceRow('Vegetation', [['green', 'Green'], ['alien', 'Alien'], ['none', 'Bare']], () => b().surf.veg, v => { b().surf.veg = v; }),
      num('Temperature', () => b().surf.temp, v => { b().surf.temp = v; }, { min: -70, max: 90, fmt: v => Math.round(v) + ' °C' }),
      num('Moisture', () => b().surf.moist, v => { b().surf.moist = v; }, { min: -1, max: 1 }),
      num('Alien Hue', () => b().surf.seedHue, v => { b().surf.seedHue = v; }, { min: 0, max: 1 }),
      num('Exposure', () => b().exposure, v => { b().exposure = v; }, { min: .2, max: 3 }))]],
    water: ['Water Editor', 'water', () => [stack(
      choiceRow('Surface', [[0, 'Water'], [1, 'Lava'], [2, 'Ice'], [3, 'None']], () => b().seaType, v => { b().seaType = +v; b().surf.lava = +v === 1 ? 1 : 0; if (+v === 1) b().seaColor = [1, .28, .03]; }, true),
      num('Ocean Fraction', () => b().seaFrac, v => { b().seaFrac = v; }, { min: 0, max: 1, full: true, tip: 'Share of the planet below sea level' }),
      rgb('Colour', () => b().seaColor, v => { b().seaColor = v; }))]],
    rings: ['Rings Editor', 'rings', () => b().rings ? [stack(
      num('Inner Edge', () => b().rings.inner, v => { b().rings.inner = Math.min(v, b().rings.outer - .05); }, { min: 1.05, max: 4, fmt: v => v.toFixed(2) + ' R' }),
      num('Outer Edge', () => b().rings.outer, v => { b().rings.outer = Math.max(v, b().rings.inner + .05); }, { min: 1.2, max: 6, fmt: v => v.toFixed(2) + ' R' }),
      num('Tilt', () => b().rings.tilt * 180 / Math.PI, v => { b().rings.tilt = v * Math.PI / 180; }, { min: 0, max: 85, fmt: v => v.toFixed(1) + '°' }),
      num('Spin', () => b().rings.spin * 180 / Math.PI, v => { b().rings.spin = v * Math.PI / 180; }, { min: 0, max: 360, fmt: v => v.toFixed(1) + '°' }),
      num('Opacity', () => b().rings.density, v => { b().rings.density = v; }, { min: 0, max: 1 }),
      rgb('Colour', () => b().rings.color, v => { b().rings.color = v; }),
      srow('', h('button', { class: 'btn red', onclick: () => { b().rings = null; lite(); refreshWindows(); } }, 'Remove Rings'), { anim: false }))]
      : [h('p', { class: 'note' }, 'This planet has no rings.'), h('button', { class: 'btn', onclick: () => { b().rings = { inner: 1.6, outer: 2.5, tilt: .3, spin: 1, color: [.75, .68, .58], density: .8, seed: b().seed }; lite(); refreshWindows(); } }, 'Add Rings')]],
    bomb: ['Parameter Bomb Editor', 'bomb', () => bombEditor()],
  };
  function choiceRow(label, opts, get, set, isFull) { return srow(label, choice(opts, get, v => { set(v); (isFull ? full : lite)(); refreshWindows(); }), { anim: false }); }
  const openEditor = k => { const [t, ic, build] = EDITORS[k]; openWindow(k, t, ic, () => build(), { w: k === 'sky' ? 470 : 440, h: k === 'land' || k === 'sky' ? 470 : 340 }); };

  // ---- Parameter Bombs -------------------------------------------------------------------------
  // A bomb is a circle on the planet where terrain switches to another function, blended at the edge.
  app.bombRadius ??= 40; app.bombStyle ??= 'mesa';
  function aimPoint() { const c = app.cam, r = app.r.pick(c, app.time, c.fwd); return v3.norm(r.t > 0 ? v3.add(c.pos, c.fwd, r.t) : c.pos); }
  function dropBomb() {
    const g = b().terrain, bs = b().bombs, style = app.bombStyle;
    if (bs.length >= 4) return;
    bs.push({ at: aimPoint(), radius: app.bombRadius / b().radius });
    const bomb = g.nodes.find(n => n.type === 'bomb');
    if (!bomb) {
      const old = g.out;
      g.nodes.push(
        { id: 'bAlt', type: 'scale', x: 1130, y: 380, params: { scale: style === 'mesa' ? .15 : .04, bias: style === 'mesa' ? 3 : .3 }, in: { a: 'hills' } },
        { id: 'bMesa', type: 'terrace', x: 1330, y: 380, params: { steps: 3, sharp: .9 }, in: { a: 'bAlt' } },
        { id: 'bomb', type: 'bomb', x: 1530, y: 60, params: {}, in: { a: old, b: style === 'crater' ? 'crater' : 'bMesa' } });
      g.out = 'bomb';
    } else bomb.in.b = style === 'crater' ? 'crater' : 'bMesa';
    const alt = g.nodes.find(n => n.id === 'bAlt'); if (alt) Object.assign(alt.params, style === 'mesa' ? { scale: .15, bias: 3 } : { scale: .04, bias: .3 });
    full(); refreshWindows();
  }
  function clearBombs() {
    const g = b().terrain, bomb = g.nodes.find(n => n.type === 'bomb');
    b().bombs = [];
    if (bomb) { g.out = bomb.in.a; g.nodes = g.nodes.filter(n => !['bomb', 'bMesa', 'bAlt'].includes(n.id)); }
    full(); refreshWindows();
  }
  function bombEditor() {
    const bs = b().bombs;
    return [
      h('p', { class: 'note' }, 'A Parameter Bomb is a local area where the land follows a different function, blended smoothly into the rest of the planet. Aim the centre of the view at a spot, then drop.'),
      stack(
        choiceRow('Contents', [['mesa', 'Terraced mesa'], ['plain', 'Low plain'], ['crater', 'Crater field']], () => app.bombStyle, v => { app.bombStyle = v; }),
        srow('Radius', numField(() => app.bombRadius, v => { app.bombRadius = v; }, { min: 1, max: 1500, log: true, fmt: v => v.toFixed(1) + ' km' }), { anim: true }),
        srow('', h('span', { class: 'row', style: 'margin:0' }, h('button', { class: 'btn hot', disabled: bs.length >= 4 ? true : null, onclick: dropBomb }, 'Drop Bomb'), h('button', { class: 'btn', disabled: bs.length ? null : true, onclick: clearBombs }, 'Clear All')), { anim: false })),
      h('b', {}, `${bs.length} of 4 placed`),
      ...bs.map((k, i) => h('div', { class: 'row' }, h('span', { class: 'readings' }, `${i + 1}. radius ${(k.radius * b().radius).toFixed(1)} km`),
        h('button', { class: 'btn', onclick: () => { const c = app.cam; c.flyTo(k.at, Math.max(k.radius * b().radius * 2.5, 1), 0, k.at.map(v => -v).map((v, j) => v * .7 + c.fwd[j] * .3), 2.5); } }, 'Go'),
        h('button', { class: 'btn red', onclick: () => { bs.splice(i, 1); if (!bs.length) clearBombs(); else { full(); refreshWindows(); } } }, 'Delete'))),
    ];
  }

  // ---- MojoGraph ------------------------------------------------------------------------------
  let sel = null, wiring = null, uid = 0, msgEl = null;
  const BW = 124, BH = 22, DEP = 7;
  ui.graphMessage = (m, err) => { if (msgEl) { msgEl.textContent = m; msgEl.classList.toggle('err', !!err); } };
  function layout(g) {
    // levels from the output upward, so values flow down toward the orange output block
    const byId = new Map(g.nodes.map(n => [n.id, n])), level = new Map();
    const walk = (id, d) => { if (!byId.has(id) || (level.get(id) ?? -1) >= d || d > 40) return; level.set(id, d); for (const k of NODE_TYPES[byId.get(id).type].inputs) if (byId.get(id).in?.[k]) walk(byId.get(id).in[k], d + 1); };
    walk(g.out, 0);
    const maxL = Math.max(0, ...level.values()), rows = [];
    for (const n of g.nodes) { const l = level.get(n.id) ?? maxL + 1; (rows[l] ??= []).push(n); }
    rows.forEach((row, l) => row.forEach((n, i) => { if (n.gx == null) { n.gx = 20 + i * (BW + 26) + (l % 2) * 30; n.gy = 20 + (rows.length - 1 - l) * 62; } }));
  }
  function graphBody(win) {
    const g = b().terrain;
    layout(g);
    const svgEl = svg('svg', {}), canvas = h('div', { class: 'gcanvas' }, svgEl), params = h('div', { class: 'gparams' });
    msgEl = h('span', { class: 'gmsg' });
    const inPos = (n, i, k) => [n.gx + 14 + i * ((BW - 28) / Math.max(k - 1, 1)) + (k === 1 ? (BW - 28) / 2 : 0), n.gy - DEP];
    const outPos = n => [n.gx + BW / 2, n.gy + BH];
    const draw = () => {
      const G2 = b().terrain, byId = new Map(G2.nodes.map(n => [n.id, n])), kids = [];
      const W = Math.max(...G2.nodes.map(n => n.gx)) + BW + 40, H = Math.max(...G2.nodes.map(n => n.gy)) + BH + 40;
      svgEl.setAttribute('width', W); svgEl.setAttribute('height', H);
      for (const n of G2.nodes) { const ins = NODE_TYPES[n.type].inputs; ins.forEach((k, i) => { const from = byId.get(n.in?.[k]); if (!from) return; const a = outPos(from), c = inPos(n, i, ins.length), m = (a[1] + c[1]) / 2; kids.push(svg('path', { class: 'wire', d: `M${a[0]},${a[1]}C${a[0]},${m} ${c[0]},${m} ${c[0]},${c[1]}` })); }); }
      for (const n of G2.nodes) {
        const T = NODE_TYPES[n.type], x = n.gx, y = n.gy;
        const gEl = svg('g', { class: 'gn' + (sel === n.id ? ' sel' : '') + (n.id === G2.out ? ' out' : '') });
        gEl.append(svg('path', { class: 'top', d: `M${x},${y}l${DEP},${-DEP}h${BW}l${-DEP},${DEP}z` }), svg('path', { class: 'side', d: `M${x + BW},${y}l${DEP},${-DEP}v${BH}l${-DEP},${DEP}z` }), svg('rect', { class: 'face', x, y, width: BW, height: BH }),
          svg('rect', { class: 'lab', x: x + 4, y: y + 4, width: BW - 22, height: BH - 8 }));
        const t = svg('text', { x: x + 7, y: y + 15 }); t.textContent = (n.type === 'fractal' ? n.params.kind : T.label).slice(0, 15);
        const k = svg('text', { class: 'kind', x: x + BW - 15, y: y + 15 }); k.textContent = n.id === G2.out ? '▼' : '';
        gEl.append(t, k, svg('title', {}));
        gEl.lastChild.textContent = `${n.id} (${T.label})`;
        gEl.addEventListener('pointerdown', e => { e.stopPropagation(); sel = n.id; showParams(); startDrag(e, n); });
        kids.push(gEl);
        T.inputs.forEach((key, i) => {
          const [px, py] = inPos(n, i, T.inputs.length), c = svg('rect', { class: 'port', x: px - 4, y: py - 4, width: 8, height: 6 });
          c.append(svg('title')); c.firstChild.textContent = `Input ${key}${n.in?.[key] ? ' (click to cut)' : ''}`;
          c.addEventListener('pointerdown', e => { e.stopPropagation(); if (wiring) connect(wiring, n, key); else if (n.in?.[key]) { delete n.in[key]; structural(); } });
          kids.push(c);
        });
        const [ox, oy] = outPos(n), o = svg('rect', { class: 'port out', x: ox - 5, y: oy - 1, width: 10, height: 6 });
        o.append(svg('title')); o.firstChild.textContent = 'Output: click, then click an input to wire it';
        o.addEventListener('pointerdown', e => { e.stopPropagation(); wiring = n.id; ui.graphMessage(`Now click an input to connect ${n.id}.`); });
        kids.push(o);
      }
      svgEl.replaceChildren(...kids);
    };
    const connect = (from, n, key) => { n.in ??= {}; n.in[key] = from; wiring = null; ui.graphMessage(''); structural(); };
    const structural = async () => { draw(); await full(); };
    const startDrag = (e, n) => {
      const x0 = e.clientX, y0 = e.clientY, nx = n.gx, ny = n.gy;
      const mv = ev => { n.gx = Math.max(0, nx + ev.clientX - x0); n.gy = Math.max(DEP + 4, ny + ev.clientY - y0); draw(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
      draw();
    };
    const showParams = () => {
      const n = b().terrain.nodes.find(x => x.id === sel);
      if (!n) { params.replaceChildren(h('p', { class: 'note' }, 'Click a block to edit it. Click a block\'s output tab (bottom), then an input tab (top), to wire them. Click a wired input to cut it. The orange block is the land height.')); return; }
      const T = NODE_TYPES[n.type], rows = [srow('Name', h('span', {}, n.id), { anim: false }), srow('Type', h('span', {}, T.label), { anim: false })];
      for (const [k, c] of Object.entries(T.params)) {
        if (c.type === 'enum') { rows.push(srow(k, choice(c.options.map(o => [o, o]), () => n.params[k], v => { n.params[k] = v; draw(); full(); }), { anim: false })); continue; }
        rows.push(srow(k, numField(() => n.params[k], v => { n.params[k] = v; full(); }, { min: c.min, max: c.max, log: c.log, step: c.step, fmt: v => (+v).toPrecision(4) }), { anim: true, tip: c.tip }));
      }
      params.replaceChildren(h('div', { class: 'stack', style: '--x:90px' }, ...rows), h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { b().terrain.out = n.id; structural(); } }, 'Use as Output'),
        h('button', { class: 'btn red', onclick: del }, 'Delete')));
    };
    const del = () => {
      const G2 = b().terrain; if (!sel) return;
      if (sel === G2.out) { ui.graphMessage('That block is the output. Choose another output first.', true); return; }
      G2.nodes = G2.nodes.filter(n => n.id !== sel);
      for (const n of G2.nodes) for (const k in n.in ?? {}) if (n.in[k] === sel) delete n.in[k];
      sel = null; showParams(); structural();
    };
    const add = h('select', { class: 'field', 'aria-label': 'Add a block', onchange: e => {
      const t = e.target.value; if (!t) return; e.target.value = '';
      const G2 = b().terrain; let id; do { id = t + ++uid; } while (G2.nodes.some(n => n.id === id));
      G2.nodes.push({ id, type: t, x: 0, y: 0, gx: 20 + canvas.scrollLeft, gy: 20 + canvas.scrollTop, params: { ...NODE_TYPES[t].make }, in: {} });
      sel = id; showParams(); structural();
    } }, h('option', { value: '' }, 'Add Block...'), ...Object.entries(NODE_TYPES).filter(([k]) => k !== 'bomb').map(([k, v]) => h('option', { value: k }, v.label)));
    win.strip.replaceChildren(h('span', { class: 'tabk' }, 'ƒ'), add, msgEl, h('span', { class: 'grow' }));
    draw(); showParams();
    return h('div', { class: 'gwrap' }, canvas, params);
  }
  function openGraph() { openWindow('graph', 'Function Graph Editor [LAND:HEIGHT]', 'graph', w => graphBody(w), { w: Math.min(980, innerWidth - 40), h: Math.min(560, innerHeight - 80), onClose: () => { msgEl = null; } }); }

  // ---- hot buttons ------------------------------------------------------------------------------
  const HOT = [['stars', 'Stars Editor'], ['sun', 'Sun Editor'], ['moon', 'Moon Editor'], ['sky', 'Sky Editor'], null, ['land', 'Land Editor'], ['material', 'Land Material Editor'], ['water', 'Water Editor'], ['rings', 'Rings Editor'], null, ['bomb', 'Parameter Bomb Editor'], ['graph', 'MojoGraph function graph']];
  $('hot').replaceChildren(...HOT.map(x => x ? ib(x[0], x[1], () => (x[0] === 'graph' ? openGraph() : openEditor(x[0]))) : h('div', { class: 'gap' })));
  G.toggle = on => {
    G.on = on; $('hot').hidden = !on; app.resize();
    if (!on) for (const k of [...Object.keys(EDITORS), 'graph']) closeWindow(k);
  };
  G.openEditor = openEditor; G.openGraph = openGraph; G.dropBomb = dropBomb; G.clearBombs = clearBombs;
  return G;
}
