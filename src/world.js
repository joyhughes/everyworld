// A world is a small document: a seed plus parameters. Nothing is stored as geometry.
// Everything visible is derived from this object, so a whole planet fits in a short code.

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = list => list[Math.floor(next() * list.length)];
  next.chance = p => next() < p;
  return next;
}

const hsl = (h, s, l) => {
  h = ((h % 1) + 1) % 1;
  const f = n => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};

// ---- terrain graph -------------------------------------------------------
// Every generated world shares this topology, so any two can be blended in hyperspace.
export function baseGraph() {
  const n = (id, type, x, y, params, inputs = {}) => ({ id, type, x, y, params, in: inputs });
  return {
    out: 'height',
    nodes: [
      n('cont', 'fractal', 40, 40, { kind: 'fbm', freq: 1.3, oct: 11, H: 0.8, lac: 2.03, offset: 0.7, gain: 1, erosion: 0, warp: 0.22, warpFreq: 1.6 }),
      n('land', 'smooth', 290, 30, { lo: 0.0, hi: 0.5 }, { a: 'cont' }),
      n('range', 'fractal', 40, 250, { kind: 'fbm', freq: 2.6, oct: 6, H: 0.9, lac: 2.1, offset: 0, gain: 1, erosion: 0, warp: 0, warpFreq: 2 }),
      n('rmask', 'smooth', 290, 220, { lo: -0.1, hi: 0.45 }, { a: 'range' }),
      n('ridge', 'fractal', 40, 460, { kind: 'ridged', freq: 40, oct: 24, H: 0.76, lac: 2.0, offset: 1, gain: 2, erosion: 0.35, warp: 0.05, warpFreq: 7 }),
      n('hills', 'fractal', 40, 670, { kind: 'hybrid', freq: 130, oct: 23, H: 0.74, lac: 2.0, offset: 0.75, gain: 1.3, erosion: 0.5, warp: 0, warpFreq: 2 }),
      n('crater', 'craters', 40, 880, { freq: 9, oct: 7, depth: 1, rim: 0.3, lac: 2.1 }),
      n('peaks', 'mul', 520, 340, {}, { a: 'ridge', b: 'rmask' }),
      n('rocks', 'rock', 40, 1080, { freq: 2e6, oct: 3, size: 1, lac: 2.3 }),
      n('relief', 'mix', 730, 430, { a: 10, b: 0.45, c: 1 }, { a: 'peaks', b: 'hills', c: 'rocks' }),
      n('inland', 'mul', 930, 280, {}, { a: 'relief', b: 'land' }),
      n('height', 'mix', 1130, 180, { a: 3.5, b: 1, c: 1 }, { a: 'cont', b: 'inland', c: 'crater2' }),
      n('crater2', 'scale', 930, 880, { scale: 0, bias: 0 }, { a: 'crater' }),
    ],
  };
}

export const node = (w, id) => w.terrain.nodes.find(n => n.id === id);

const ARCHETYPES = {
  terran: r => ({ sea: r.range(.5, .72), temp: r.range(9, 26), moist: r.range(0, .25), atmo: 1, cloud: r.range(.42, .6), seaType: 0, veg: 'green', rugged: 1 }),
  ocean: r => ({ sea: r.range(.84, .95), temp: r.range(12, 32), moist: r.range(.2, .4), atmo: 1.2, cloud: r.range(.5, .68), seaType: 0, veg: 'green', rugged: 1 }),
  desert: r => ({ sea: 0, temp: r.range(25, 44), moist: -.7, atmo: r.range(.4, .9), cloud: r.range(.1, .3), seaType: 3, veg: 'none', rugged: 1.25, terrace: true }),
  ice: r => ({ sea: r.range(.45, .7), temp: r.range(-38, -14), moist: r.range(-.1, .2), atmo: r.range(.6, 1), cloud: r.range(.3, .5), seaType: 2, veg: 'none', rugged: .9 }),
  volcanic: r => ({ sea: r.range(.3, .5), temp: r.range(40, 70), moist: -.6, atmo: r.range(.8, 1.5), cloud: r.range(.3, .55), seaType: 1, veg: 'none', rugged: 1.4 }),
  alien: r => ({ sea: r.range(.4, .7), temp: r.range(8, 30), moist: r.range(0, .3), atmo: r.range(.8, 1.4), cloud: r.range(.3, .55), seaType: 0, veg: 'alien', rugged: 1.1 }),
  barren: r => ({ sea: 0, temp: r.range(-30, 20), moist: -1, atmo: 0, cloud: 0, seaType: 3, veg: 'none', rugged: .8, cratered: true }),
};

export function generateWorld(seed) {
  seed = seed >>> 0;
  const r = rng(seed);
  const kind = r.pick(['terran', 'terran', 'terran', 'ocean', 'desert', 'ice', 'volcanic', 'alien', 'alien', 'barren']);
  const a = ARCHETYPES[kind](r);
  const g = baseGraph();
  const w = {
    seed, kind, name: worldName(seed),
    radius: Math.round(r.range(3200, 8800)),
    seaFrac: a.sea, sea: -1e3, seaType: a.seaType,
    seaColor: a.seaType === 1 ? [1, .28, .03] : a.seaType === 0 && a.veg === 'alien'
      ? hsl(r.range(.42, .9), .55, .3) : [.012, .055, .1],
    terrain: g,
    atmo: { scale: a.atmo, hr: r.range(7, 10), hm: r.range(1, 1.6), mie: r.range(.6, 1.6), g: .78,
      rayleigh: a.veg === 'alien' ? hsl(r.range(0, 1), .4, .55).map(v => v * 2)
        : kind === 'desert' ? [1.5, 1.05, .7]
        : kind === 'volcanic' ? [1.6, .8, .45] : [.58, 1.35, 3.31] },
    clouds: { cover: a.cloud, scale: r.range(3, 6), low: r.range(5, 7.5), high: r.range(10, 14), density: r.range(1, 1.6), speed: r.range(.5, 2),
      color: kind === 'volcanic' ? [.5, .45, .42] : [1, 1, 1] },
    surf: { temp: a.temp, moist: a.moist, veg: a.veg, seedHue: r(), lava: a.seaType === 1 ? 1 : 0 },
    sun: { time: r.range(.32, .42), tilt: r.range(-.42, .42), color: r.pick([[1, .97, .92], [1, .9, .76], [1, .8, .62], [.86, .92, 1]]), power: 22, size: r.range(.0045, .011) },
    moons: [], rings: null,
    sky: { stars: 1, nebula: r.range(.3, 1), hue: r() },
    exposure: 1,
    bombs: [],
  };
  // terrain parameters
  const set = (id, o) => Object.assign(node(w, id).params, o);
  set('cont', { freq: r.range(.8, 2.2), H: r.range(.65, .9), warp: r.range(.1, .4) });
  set('range', { freq: r.range(1.8, 4) });
  set('ridge', { freq: r.range(22, 55), H: r.range(.8, .9), erosion: r.range(.15, .6), warp: r.range(0, .09) });
  set('hills', { freq: r.range(90, 220), H: r.range(.78, .86) });
  node(w, 'relief').params.a = r.range(8, 15) * a.rugged;
  node(w, 'relief').params.b = r.range(.3, .6) * a.rugged;
  node(w, 'height').params.a = r.range(2.2, 4.8);
  if (a.terrace) { /* inserted lazily so the common topology stays intact */ w.terraced = true; }
  if (a.cratered) {
    node(w, 'relief').params.a *= .35;
    node(w, 'crater2').params.scale = r.range(1.6, 3.4);
    node(w, 'height').params.a *= .4;
  }
  set('crater', { freq: r.range(6, 12) });
  // moons
  const nm = r.pick([0, 1, 1, 1, 2, 2, 3]);
  for (let i = 0; i < nm; i++) w.moons.push({
    dist: w.radius * r.range(9, 60), radius: w.radius * r.range(.06, .3),
    az: r.range(0, 6.283), incl: r.range(-.35, .35), seed: r.int(1, 1e6),
    color: hsl(r.range(0, .16), r.range(0, .22), r.range(.45, .68)),
  });
  if (r.chance(.3)) w.rings = { inner: r.range(1.5, 1.85), outer: r.range(2.1, 3.1), tilt: r.range(.1, .55), spin: r.range(0, 6.283), color: hsl(r.range(.05, .14), r.range(.1, .4), r.range(.55, .8)), density: r.range(.5, .95), seed: r.int(1, 1e6) };
  return w;
}

const SYL_A = ['Ka', 'Mi', 'Oro', 'Te', 'Vel', 'Ly', 'Sa', 'Du', 'Ne', 'Ar', 'Ish', 'Tho', 'Ze', 'Quo', 'Bel', 'Ha', 'Ry', 'Ael'];
const SYL_B = ['ra', 'lo', 'mir', 'va', 'then', 'nor', 'dis', 'ka', 'phe', 'ri', 'lune', 'gar', 'sol', 'mae', 'tar'];
const SYL_C = ['', '', ' Prime', ' Minor', 'ia', 'on', 'us', 'ae', 'is', 'ar'];
export function worldName(seed) {
  const r = rng((seed ^ 0xA5A5A5) >>> 0);
  return r.pick(SYL_A) + r.pick(SYL_B) + r.pick(SYL_C);
}

// ---- hyperspace ---------------------------------------------------------
// Mixers are multipliers/offsets over a base world, in the spirit of the originals:
// one control sweeps a meaningful planet-wide quantity.
export const MIXERS = [
  { id: 'continents', label: 'Continent size', lo: 'Islands', hi: 'Pangaea', v: 0 },
  { id: 'sea', label: 'Sea level', lo: 'Dry', hi: 'Flooded', v: 0 },
  { id: 'mountains', label: 'Mountain height', lo: 'Worn', hi: 'Colossal', v: 0 },
  { id: 'spacing', label: 'Mountain spacing', lo: 'Wide', hi: 'Crowded', v: 0 },
  { id: 'rough', label: 'Roughness', lo: 'Smooth', hi: 'Jagged', v: 0 },
  { id: 'swirl', label: 'Distortion', lo: 'Calm', hi: 'Marbled', v: 0 },
  { id: 'air', label: 'Atmosphere', lo: 'Thin', hi: 'Thick', v: 0 },
  { id: 'cloud', label: 'Cloud cover', lo: 'Clear', hi: 'Overcast', v: 0 },
  { id: 'climate', label: 'Climate', lo: 'Glacial', hi: 'Scorched', v: 0 },
  { id: 'moon', label: 'Moon size', lo: 'Small', hi: 'Looming', v: 0 },
];

const clone = o => JSON.parse(JSON.stringify(o));
const lerp = (a, b, t) => a + (b - a) * t;
function blend(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((v, i) => blend(v, b[i], t));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const o = {};
    for (const k in a) o[k] = k in b ? blend(a[k], b[k], t) : a[k];
    return o;
  }
  return t < .5 ? a : b;
}

// Blends two worlds; graphs blend node-by-node when ids and wiring match.
export function morph(a, b, t) {
  if (t <= 0) return clone(a);
  const o = clone(a);
  const same = a.terrain.nodes.length === b.terrain.nodes.length && a.terrain.nodes.every((n, i) => n.id === b.terrain.nodes[i].id && n.type === b.terrain.nodes[i].type);
  for (const k of ['radius', 'seaFrac', 'seaColor', 'atmo', 'clouds', 'sun', 'sky', 'surf']) o[k] = blend(a[k], b[k], t);
  if (same) o.terrain.nodes.forEach((n, i) => { n.params = blend(n.params, b.terrain.nodes[i].params, t); });
  return o;
}

export function applyMixers(base, mix) {
  const w = clone(base), m = mix;
  const mul = (id, key, v) => { const n = node(w, id); if (n) n.params[key] *= v; };
  const add = (id, key, v) => { const n = node(w, id); if (n) n.params[key] += v; };
  mul('cont', 'freq', 2 ** (-m.continents * 1.5));
  w.seaFrac = Math.max(.02, Math.min(.98, w.seaFrac + m.sea * .35));
  mul('relief', 'a', 3 ** m.mountains); mul('relief', 'b', 2 ** m.mountains);
  mul('ridge', 'freq', 2.5 ** m.spacing); mul('range', 'freq', 2 ** m.spacing);
  add('ridge', 'H', -m.rough * .12); add('hills', 'H', -m.rough * .12);
  mul('cont', 'warp', 2.5 ** m.swirl); mul('ridge', 'warp', 3 ** m.swirl);
  w.atmo.scale *= 3 ** m.air;
  w.clouds.cover = Math.max(0, Math.min(1, w.clouds.cover + m.cloud * .45));
  w.surf.temp += m.climate * 35;
  for (const o of w.moons) o.radius *= 3 ** m.moon;
  return w;
}

// World codes: the seed alone when unedited, otherwise the whole document.
export function encodeWorld(state) {
  const { base, mix } = state;
  const plain = JSON.stringify(base) === JSON.stringify(generateWorld(base.seed));
  const anyMix = Object.values(mix).some(Math.abs);
  if (plain && !anyMix) return 'w' + base.seed.toString(36);
  const json = JSON.stringify({ base, mix });
  const bytes = new TextEncoder().encode(json);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return 'x' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeWorld(code) {
  code = (code || '').trim();
  if (/^w[0-9a-z]+$/i.test(code)) return { base: generateWorld(parseInt(code.slice(1), 36)), mix: null };
  if (/^x[\w-]+$/.test(code)) {
    const bin = atob(code.slice(1).replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    return JSON.parse(json);
  }
  if (/^\d+$/.test(code)) return { base: generateWorld(+code), mix: null };
  throw new Error('That is not a world code. Codes start with w or x.');
}
