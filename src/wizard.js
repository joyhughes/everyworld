// Planet Wizard: eight element slots (Land Texture, Land Material, Water, Sun, Moon, Stars,
// Rings, Atmosphere), each filled from a library of presets, plus a Zip Render preview with
// RandomCam dice and Walk / Fly / UFO altitude bands.
import { generateWorld, rng, worldName } from './world.js';
import { h, ib, icon, dialog, $ } from './kit.js';

const LIB_SIZE = 16;
export const ELEMENTS = [
  ['land', 'Land Texture', 'land', 'The shape of the planet\'s surface'],
  ['material', 'Land Material', 'material', 'The colouring of the surface'],
  ['water', 'Water', 'water', 'An ocean and its look'],
  ['sun', 'Sun', 'sun', 'The sun\'s colour and size'],
  ['moon', 'Moon', 'moon', 'A single moon (more can be added in the Generator)'],
  ['stars', 'Stars', 'stars', 'Stars and nebulae'],
  ['rings', 'Rings', 'rings', 'Planetary rings'],
  ['atmo', 'Atmosphere', 'atmo', 'Air and clouds (last, since clouds can hide the rest)'],
];
const optional = { water: true, moon: true, rings: true, atmo: true, stars: true };
// Names describe what the preset actually contains.
const nameCache = new Map();
function presetName(k, seed) {
  const key = k + seed; if (nameCache.has(key)) return nameCache.get(key);
  const w = generateWorld(1); apply(w, k, seed);
  const r = rng((seed * 2654435761 ^ k.length * 977) >>> 0), pick = a => a[Math.floor(r() * a.length)];
  const n = node => w.terrain.nodes.find(q => q.id === node).params;
  let out;
  if (k === 'land') out = (n('relief').a > 13 ? pick(['Titanic', 'Jagged', 'Soaring']) : n('relief').a > 10 ? pick(['Craggy', 'Rugged', 'Broken']) : pick(['Rolling', 'Gentle', 'Weathered'])) + ' ' + (n('cont').freq < 1.2 ? 'Continents' : n('cont').freq < 1.8 ? pick(['Highlands', 'Ranges']) : 'Archipelago');
  else if (k === 'material') { const t = w.surf.temp, v = w.surf.veg; out = v === 'alien' ? pick(['Strange', 'Violet', 'Uncanny']) + ' ' + pick(['Moss', 'Lichen', 'Growth']) : v === 'none' ? (t > 28 ? 'Ochre Dunes' : t < -5 ? 'Frozen Barrens' : 'Bare Rock') : t > 24 ? 'Rainforest' : t > 12 ? pick(['Green Meadows', 'Temperate Woods']) : t > -5 ? 'Tundra' : 'Snowfields'; }
  else if (k === 'water') out = w.seaType === 1 ? 'Lava Sea' : w.seaType === 2 ? 'Frozen Sea' : (w.seaFrac > .8 ? 'World Ocean' : w.seaFrac > .55 ? 'Deep Ocean' : 'Inland Seas') + (w.seaColor[1] > .1 || w.seaColor[0] > .1 ? ' (tinted)' : '');
  else if (k === 'sun') { const c = w.sun.color; out = (c[2] > c[0] ? 'Blue' : c[2] > .88 ? 'White' : c[2] > .7 ? 'Golden' : 'Amber') + ' ' + (w.sun.size < .006 ? 'Dwarf' : w.sun.size > .009 ? 'Giant' : 'Star'); }
  else if (k === 'moon') { const m = w.moons[0], ang = m.radius / m.dist; out = (ang > .012 ? 'Looming' : ang > .005 ? 'Bright' : 'Distant') + ' Moon'; }
  else if (k === 'stars') out = (w.sky.nebula > .9 ? 'Nebula' : w.sky.nebula > .5 ? 'Milky' : 'Sparse') + ' Starfield';
  else if (k === 'rings') { const g = w.rings; out = (g.outer - g.inner > 1 ? 'Broad' : 'Narrow') + ' ' + (g.density > .8 ? 'Dense' : 'Faint') + ' Rings'; }
  else if (k === 'atmo') { const c = w.clouds.cover, d = w.atmo.scale; out = (c < .2 ? 'Clear' : c < .45 ? 'Cloudy' : 'Overcast') + ' ' + (d < .7 ? 'Thin Air' : d > 1.2 ? 'Thick Air' : 'Sky'); }
  nameCache.set(key, out);
  return out;
}

// Each element copies one part of a donor world into the planet being built.
function apply(w, k, seed) {
  if (seed == null) {
    if (k === 'water') { w.seaType = 3; w.seaFrac = 0; w.surf.lava = 0; }
    if (k === 'moon') w.moons = [];
    if (k === 'rings') w.rings = null;
    if (k === 'atmo') { w.atmo.scale = 0; w.clouds.cover = 0; }
    if (k === 'stars') { w.sky.stars = 0; w.sky.nebula = 0; }
    return;
  }
  const d = generateWorld(seed), r = rng(seed ^ 0x5bd1);
  if (k === 'land') { w.terrain = d.terrain; w.radius = d.radius; w.terraced = d.terraced; }
  if (k === 'material') { const lava = w.surf.lava; w.surf = { ...d.surf, lava }; if (w.surf.veg === 'none' && r.chance(.5)) w.surf.veg = 'green'; }
  if (k === 'water') {
    w.seaType = d.seaType === 3 ? r.pick([0, 0, 2]) : d.seaType; w.seaFrac = d.seaType === 3 ? r.range(.35, .7) : d.seaFrac;
    w.seaColor = w.seaType === 1 ? [1, .28, .03] : d.seaColor; w.surf.lava = w.seaType === 1 ? 1 : 0;
  }
  if (k === 'sun') w.sun = { ...d.sun, time: w.sun.time, tilt: w.sun.tilt };
  if (k === 'moon') { const m = d.moons[0] ?? { dist: d.radius * r.range(9, 50), radius: d.radius * r.range(.08, .28), az: r.range(0, 6.28), incl: r.range(-.3, .3), seed: r.int(1, 1e6), color: [.62, .6, .58] }; w.moons = [{ ...m, dist: w.radius * m.dist / d.radius, radius: w.radius * m.radius / d.radius }]; }
  if (k === 'stars') w.sky = { ...d.sky, stars: r.range(.6, 1.4), nebula: r.range(.2, 1.2) };
  if (k === 'rings') w.rings = d.rings ?? { inner: r.range(1.5, 1.85), outer: r.range(2.1, 3.1), tilt: r.range(.1, .55), spin: r.range(0, 6.283), color: [.78, .7, .58].map(v => v * r.range(.8, 1.1)), density: r.range(.5, .95), seed: r.int(1, 1e6) };
  if (k === 'atmo') { w.atmo = { ...d.atmo, scale: Math.max(d.atmo.scale, .35) }; w.clouds = d.clouds; }
}
export function compose(slots, nameSeed) {
  const w = generateWorld(slots.land ?? 1);
  w.seed = nameSeed >>> 0; w.name = worldName(w.seed); w.kind = 'wizard'; w.bombs = [];
  for (const [k] of ELEMENTS) apply(w, k, slots[k]);
  return w;
}

// ---- thumbnails, drawn on the CPU so the library opens instantly ----------------------
function noise2(seed) {
  const r = rng(seed), P = new Float32Array(64 * 64).map(() => r());
  const at = (x, y) => P[((y & 63) << 6) | (x & 63)];
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
}
const css = c => `rgb(${c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(',')})`;
export function thumb(k, seed, S = 84) {
  const cv = h('canvas', { width: S, height: S }), x = cv.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, S, S);
  if (seed == null) { x.strokeStyle = '#666'; x.beginPath(); x.moveTo(10, 10); x.lineTo(S - 10, S - 10); x.moveTo(S - 10, 10); x.lineTo(10, S - 10); x.stroke(); return cv; }
  const d = generateWorld(seed), r = rng(seed ^ 0x77);
  if (k === 'land' || k === 'material') {
    const n = noise2(seed), img = x.createImageData(S, S), ridge = d.terrain.nodes.find(q => q.id === 'ridge').params.freq / 40;
    const f = (u, v) => { let s = 0, a = 1, fr = 4 * ridge; for (let o = 0; o < 5; o++) { const q = n(u * fr, v * fr); s += (k === 'land' ? 1 - Math.abs(q * 2 - 1) : q) * a; a *= .5; fr *= 2; } return s / 1.9; };
    const veg = { green: [[.14, .22, .07], [.36, .3, .2]], none: [[.55, .45, .32], [.3, .26, .22]], alien: [[.2, .1, .3], [.45, .2, .35]] }[d.surf.veg] ?? [[.3, .3, .3], [.5, .5, .5]];
    if (d.surf.temp < -5) veg[1] = [.85, .88, .92];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = i / S, v = j / S, hgt = f(u, v), sh = Math.max(0, Math.min(1, .55 + (f(u + .01, v) - hgt) * -18 + (f(u, v + .01) - hgt) * -10));
      const c = k === 'land' ? [sh, sh, sh * 1.05].map(q => q * .9) : veg[0].map((q, z) => (q + (veg[1][z] - q) * hgt) * (.6 + sh * .8));
      const o = (j * S + i) * 4; img.data[o] = c[0] * 255; img.data[o + 1] = c[1] * 255; img.data[o + 2] = c[2] * 255; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  } else if (k === 'water') {
    const col = d.seaType === 1 ? [1, .3, .05] : d.seaType === 2 ? [.75, .85, .95] : d.seaType === 3 ? [.03, .2, .35] : d.seaColor.map(v => v * 5);
    x.fillStyle = css(col.map(v => v * .5)); x.fillRect(0, 0, S, S);
    x.strokeStyle = css(col.map(v => Math.min(1, v * 1.2 + .2))); x.lineWidth = 1.5;
    for (let j = 8; j < S; j += 9) { x.beginPath(); for (let i = 0; i <= S; i += 3) x.lineTo(i, j + Math.sin(i * .25 + j + seed) * 2.2); x.stroke(); }
  } else if (k === 'sun') {
    const g = x.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2); const c = d.sun.color, s = d.sun.size / .011;
    g.addColorStop(0, '#fff'); g.addColorStop(.18 * s, css(c)); g.addColorStop(.45 * s, css(c.map(v => v * .35))); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  } else if (k === 'moon') {
    const R = 14 + r() * 22, g = x.createRadialGradient(S / 2 - R * .4, S / 2 - R * .4, 1, S / 2, S / 2, R);
    const c = d.moons[0]?.color ?? [.6, .6, .6]; g.addColorStop(0, css(c.map(v => v * 1.3))); g.addColorStop(1, css(c.map(v => v * .25)));
    x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, R, 0, 7); x.fill();
    x.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 9; i++) { const a = r() * 7, q = r() * R * .8; x.beginPath(); x.arc(S / 2 + Math.cos(a) * q, S / 2 + Math.sin(a) * q, 1 + r() * R * .18, 0, 7); x.fill(); }
  } else if (k === 'stars') {
    const hue = d.sky.hue * 360; x.fillStyle = `hsl(${hue},45%,${6 + d.sky.nebula * 8}%)`; x.fillRect(0, 0, S, S);
    const g = x.createRadialGradient(S * r(), S * r(), 2, S / 2, S / 2, S * .7); g.addColorStop(0, `hsla(${hue},70%,55%,${.25 * d.sky.nebula})`); g.addColorStop(1, 'transparent'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${r() ** 2})`; x.fillRect(r() * S, r() * S, 1, 1); }
  } else if (k === 'rings') {
    const c = d.rings?.color ?? [.78, .7, .58], t = (d.rings?.tilt ?? .3);
    x.translate(S / 2, S / 2); x.rotate(-.35);
    for (let i = 0; i < 14; i++) { x.strokeStyle = css(c.map(v => v * (.5 + r() * .6))); x.globalAlpha = .4 + r() * .6; x.lineWidth = 1.4; x.beginPath(); x.ellipse(0, 0, 18 + i * 1.6, (18 + i * 1.6) * (.15 + t * .5), 0, 0, 7); x.stroke(); }
    x.globalAlpha = 1; x.fillStyle = '#556'; x.beginPath(); x.arc(0, 0, 12, 0, 7); x.fill(); x.setTransform(1, 0, 0, 1, 0, 0);
  } else if (k === 'atmo') {
    const ray = d.atmo.rayleigh, top = ray.map(v => .08 * v / Math.max(...ray)), hor = ray.map(v => .35 + .35 * v / Math.max(...ray));
    const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, css(top.map(v => v * (.5 + d.atmo.scale)))); g.addColorStop(1, css(hor)); x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.fillStyle = `rgba(255,255,255,${.4 + d.clouds.cover * .5})`;
    for (let i = 0; i < d.clouds.cover * 26; i++) { x.beginPath(); x.ellipse(r() * S, S * (.35 + r() * .55), 4 + r() * 12, 2 + r() * 4, 0, 0, 7); x.fill(); }
  }
  return cv;
}

// ---- the dialog --------------------------------------------------------------------------
export function openWizard(ui) {
  const app = ui.app;
  const saved = { base: app.base, mix: { ...app.mix }, cam: { pos: app.cam.pos.slice(), fwd: app.cam.fwd.slice(), camUp: app.cam.camUp.slice() } };
  const rnd = () => Math.floor(Math.random() * 1e6);
  const slots = {}; let nameSeed = rnd(), alt = 10, accepted = false;
  for (const [k] of ELEMENTS) slots[k] = null;
  const slotEls = {};
  const zipImg = h('img', { alt: 'Zip Render preview' });
  const zipNote = h('p', { class: 'note' }, 'Fill the slots, or roll the big die for a whole planet.');
  let busy = false, again = false;
  async function zip(big = true) {
    if (busy) { again = true; return; }
    busy = true;
    do {
      again = false;
      if (!slots.land) { zipNote.textContent = 'Choose a Land Texture to see the planet.'; zipImg.removeAttribute('src'); break; }
      zipNote.textContent = 'Rendering...';
      await new Promise(r => requestAnimationFrame(r));
      const w = compose(slots, nameSeed);
      await app.loadWorld(w);
      app.randomCam(big, alt * (big ? 1 : .6 + Math.random() * .8));
      const W = 384, H = 216;
      zipImg.src = app.r.snapshot(app.cam, app.time, W, H, 2, { steps: 120, shadow: 8, cloud: 10, fine: 8 }).toDataURL('image/jpeg', .85);
      zipNote.textContent = `${w.name}  ·  radius ${Math.round(w.radius)} km`;
    } while (again);
    busy = false;
  }
  const altBtns = {};
  const setAlt = (k, km) => { alt = km; for (const x in altBtns) altBtns[x].classList.toggle('on', x === k); zip(false); };
  altBtns.walk = ib('walk', 'Preview near the ground (about 5 m)', () => setAlt('walk', .005), { cls: 'small' });
  altBtns.fly = ib('fly', 'Preview from airplane height (about 10 km)', () => setAlt('fly', 10), { cls: 'small on' });
  altBtns.ufo = ib('ufo', 'Preview from high up (about 500 km)', () => setAlt('ufo', 500), { cls: 'small' });

  function drawSlot(k) {
    const el = slotEls[k], s = slots[k];
    el.pic.replaceChildren(s == null ? h('span', {}, 'Load From', h('br'), 'Disk') : thumb(k, s));
    el.preset.textContent = s == null ? (optional[k] ? 'None' : 'Empty') : presetName(k, s);
  }
  function library(k, label) {
    const items = (optional[k] ? [null] : []).concat(Array.from({ length: LIB_SIZE }, (_, i) => (i + 1) * 101 + (k.length * 13)));
    const grid = h('div', { class: 'lib' }, ...items.map(s => h('button', { title: s == null ? 'None' : presetName(k, s), onclick: () => { slots[k] = s; drawSlot(k); box.close(); zip(true); } }, thumb(k, s), s == null ? 'None' : presetName(k, s))));
    const box = dialog(label + ' Library', grid, [['Cancel', null]], { wide: true });
    // a second modal replaces the wizard; reopen it on close
    box.querySelector('.foot button').addEventListener('click', () => reopen());
    grid.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(reopen, 0); });
  }
  const slotRow = h('div', { class: 'slots' }, ...ELEMENTS.map(([k, label, ic, tip]) => {
    const pic = h('button', { class: 'pic', title: 'Open the ' + label + ' library', onclick: () => library(k, label) });
    const preset = h('div', { class: 'preset' });
    slotEls[k] = { pic, preset };
    return h('div', { class: 'slot', title: tip }, h('div', { class: 'icon' }, icon(ic)), h('div', { class: 'nm' }, label),
      h('div', { class: 'ctl' }, ib('die6', 'Random ' + label, () => { slots[k] = (rnd() % 5000) + 1; drawSlot(k); zip(true); }, { cls: 'small' }), ib('close', 'Clear ' + label, () => { slots[k] = null; drawSlot(k); zip(true); }, { cls: 'small' })),
      pic, preset);
  }));
  const body = h('div', {},
    h('div', { class: 'row', style: 'margin-bottom:8px' },
      ib('die6', 'Randomize all eight elements', () => { for (const [k] of ELEMENTS) slots[k] = optional[k] && Math.random() < (k === 'rings' ? .65 : k === 'moon' ? .3 : .08) ? null : (rnd() % 5000) + 1; nameSeed = rnd(); ELEMENTS.forEach(([k]) => drawSlot(k)); zip(true); }),
      ib('close', 'Clear all elements', () => { for (const [k] of ELEMENTS) slots[k] = null; ELEMENTS.forEach(([k]) => drawSlot(k)); zip(true); }),
      h('span', { class: 'hint' }, 'Each slot takes one element from its library. The six-pip die picks for every slot.')),
    slotRow,
    h('div', { class: 'zip' }, zipImg, h('div', {},
      h('b', {}, 'Zip Render'),
      h('div', { class: 'row' }, ib('die2', 'A slightly different view', () => zip(false)), ib('die6', 'A totally new view', () => zip(true)), h('span', { class: 'sep', style: 'width:8px' }), altBtns.walk, altBtns.fly, altBtns.ufo),
      zipNote)));
  const restore = async () => { if (accepted) return; await app.loadWorld(saved.base, saved.mix); app.applyPose(saved.cam); };
  let box;
  function reopen() {
    box = dialog('Planet Wizard', body, [['Cancel', restore], ['OK', () => { if (!slots.land) return false; accepted = true; app.emit('load'); }, true]], { wide: true });
    $('modal').onclick = null;
  }
  ELEMENTS.forEach(([k]) => drawSlot(k));
  reopen();
}
