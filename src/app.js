import { Renderer } from './renderer.js';
import { Camera, v3 } from './camera.js';
import { applyMixers, MIXERS, morph } from './world.js';

// Preview quality tiers. Every tier keeps the GPU below full load: at most one frame is in
// flight, motion frames get a fixed share of a frame interval, and refinement only spends a
// few milliseconds per display frame, then stops completely once the picture is finished.
export const TIERS = {
  low: {
    label: 'Low', dpr: .75, maxSamples: 12, refineMs: 4, moveShare: .45, minScale: .14, map: [768, 384],
    move: { steps: 56, shadow: 0, cloud: 4, fine: 2 }, refine: { steps: 140, shadow: 12, cloud: 12, fine: 10 },
  },
  medium: {
    label: 'Medium', dpr: 1, maxSamples: 32, refineMs: 6, moveShare: .55, minScale: .18, map: [1024, 512],
    move: { steps: 80, shadow: 4, cloud: 6, fine: 4 }, refine: { steps: 200, shadow: 26, cloud: 20, fine: 18 },
  },
  high: {
    label: 'High', dpr: 2, maxSamples: 64, refineMs: 10, moveShare: .6, minScale: .22, map: [1536, 768],
    move: { steps: 100, shadow: 8, cloud: 8, fine: 5 }, refine: { steps: 220, shadow: 32, cloud: 26, fine: 24 },
  },
};

// Flight sensitivities, after the original's Gentle / Intermediate / Extreme.
export const SENS = {
  gentle: { label: 'Gentle', acc: .04, max: .35, turn: 1.1, level: 1.6 },
  intermediate: { label: 'Intermediate', acc: .25, max: 3, turn: 1.8, level: .5 },
  extreme: { label: 'Extreme', acc: 2, max: 40, turn: 2.8, level: 0 },
};

const guessTier = name => {
  const n = (name || '').toLowerCase();
  if (/swiftshader|llvmpipe|software|mali|adreno|powervr|intel|iris|uhd|hd graphics|apple gpu$/.test(n) || /mobi|android|iphone|ipad/i.test(navigator.userAgent)) return 'low';
  return 'medium';
};

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new Renderer(canvas);
    this.mix = Object.fromEntries(MIXERS.map(m => [m.id, 0]));
    this.keys = new Set(); this.time = 0; this.frames = 0; this.fps = 0;
    this.dirty = true; this.idle = 0; this.bands = 2;
    this.targetFps = 30; this.moving = false; this.paused = false; this.focused = true;
    this.mode = 'walk'; this.sens = 'gentle'; this.vel = [0, 0, 0]; this.stick = null;
    this.listeners = new Set();
    let saved = null; try { saved = localStorage.getItem('everyworld-tier'); } catch { /* optional */ }
    this.tierPref = saved || 'auto';
    this.tierName = this.tierPref === 'auto' ? guessTier(this.r.gpuName) : this.tierPref;
    this.applyTier();
    this.movie = { rec: false, frames: [], play: null, trim: [0, 1] };
    this.r.onTimed = (m, ms) => this.learnRows(m, ms);
    this.rowGuess = 1;
    addEventListener('focus', () => { this.focused = true; });
    addEventListener('blur', () => { this.focused = false; });
  }
  get tier() { return TIERS[this.tierName]; }
  // Refinement stops at the tier's sample count, or sooner when each pass is expensive, so an
  // idle view never keeps the GPU busy for more than about 15 seconds of GPU time.
  get maxSamples() {
    if (this.maxOverride) return this.maxOverride;
    const per = this.r.cost.refine, cap = per > 0 ? Math.max(6, Math.floor(15000 / per)) : Infinity;
    return Math.min(this.tier.maxSamples, cap);
  }
  set maxSamples(v) { this.maxOverride = v; }
  setTier(pref) {
    this.tierPref = pref;
    try { localStorage.setItem('everyworld-tier', pref); } catch { /* optional */ }
    this.tierName = pref === 'auto' ? guessTier(this.r.gpuName) : pref;
    this.maxOverride = undefined; this.applyTier(); this.emit('tier');
  }
  applyTier() {
    const t = this.tier;
    this.r.setMapSize(...t.map);
    this.r.scale = Math.max(this.r.scale, t.minScale);
    this.resize();
  }
  on(f) { this.listeners.add(f); }
  emit(type) { for (const f of this.listeners) f(type); }
  resize() {
    const b = this.canvas.getBoundingClientRect();
    this.r.resize(Math.max(b.width, 2), Math.max(b.height, 2), Math.min(devicePixelRatio || 1, this.tier.dpr));
    this.dirty = true;
  }
  get world() { return this.current; }
  // Rebuilds the derived world. Structural graph edits recompile; parameter edits do not.
  // { scan: false } skips re-measuring the terrain (for sky, sun and colour edits).
  async rebuild({ scan = true } = {}) {
    const b = this.morphTo ? morph(this.base, this.morphTo, this.morphT) : this.base;
    const prevSea = this.current?.sea;
    this.current = applyMixers(b, this.mix);
    const prevR = this.cam?.R;
    if (!scan && prevSea != null && prevR === this.current.radius) {
      this.current.sea = prevSea;
      await this.r.setWorld(this.current);
      this.dirty = true; this.emit('world');
      return;
    }
    await this.r.setWorld(this.current);
    if (!this.cam) { this.cam = new Camera(this.current.radius); }
    else if (prevR !== this.current.radius) {
      const k = this.cam.alt / prevR; this.cam.R = this.current.radius;
      this.cam.pos = this.cam.up.map(c => c * (this.current.radius * (1 + k)));
      this.cam.derive();
    }
    this.r.scanBounds(this.cam);
    this.dirty = true; this.emit('world');
  }
  async loadWorld(base, mix) {
    this.base = base; this.morphTo = null; this.morphT = 0;
    for (const m of MIXERS) this.mix[m.id] = mix?.[m.id] ?? 0;
    const R = base.radius;
    if (this.cam) { this.cam.R = R; this.cam.ground = 0; this.cam.flight = null; }
    this.vel = [0, 0, 0];
    await this.rebuild();
    this.homeView();
    this.emit('load');
  }
  homeView() {
    const c = this.cam, s = this.r.sunDir(this.current);
    const d = v3.norm([s[0] + .55 * -s[2], .34 + s[1] * .5, s[2] + .55 * s[0]]);
    c.place(d, this.current.radius * 2.1, 0, 0);
    c.fwd = d.map(v => -v); c.camUp = [0, 1, 0]; c.derive();
    this.stilts = null; this.vel = [0, 0, 0];
    this.dirty = true;
  }
  // Puts the camera level at a height above the ground right here (the JogNav's 10K and 2m targets).
  standAt(aglKm) {
    const c = this.cam;
    c.flight = null; this.vel = [0, 0, 0];
    const g = this.r.groundAt(c, this.time), sea = this.current.seaType !== 3 ? this.current.sea : -1e9;
    c.ground = Math.max(g.h, sea);
    c.pos = c.up.map(v => v * (c.R + c.ground + aglKm)); c.derive();
    const f = v3.norm(v3.add(c.fwd, c.up, -v3.dot(c.fwd, c.up)));
    if (Math.hypot(...f) > .1) { c.fwd = v3.norm(v3.add(f, c.up, -.06)); c.camUp = c.up.slice(); }
    c.derive(); c.level(1); c.derive();
    this.stilts = aglKm; this.needGround = true; this.dirty = true;
  }
  // Finds a dramatic spot: real relief, near the sunlit side, above the sea.
  scoutSpot(near = null, spread = 1) {
    const r = this.r, w = this.current, sun = r.sunDir(w);
    let best = null, seed = (this.scoutN = (this.scoutN ?? 0) + 1) * 7919 + w.seed;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const centre = near ?? sun;
    for (let b = 0; b < (near ? 3 : 8); b++) {
      const dirs = [];
      for (let i = 0; i < 64; i++) {
        const z = rand() * 2 - 1, a = rand() * 6.283, c = Math.sqrt(1 - z * z), d = [c * Math.cos(a), z, c * Math.sin(a)];
        dirs.push(v3.norm(near ? v3.add(centre, d, spread) : v3.add(d, sun, .9)));
      }
      r.heightsAt(this.cam, this.time, dirs, near ? Math.max(spread * w.radius / 40, .05) : w.radius / 2500).forEach((o, i) => {
        const land = o.h > w.sea + .03, ln = v3.dot(dirs[i], sun);
        if (!land || ln < (near ? .05 : .22)) return;
        const cl = w.clouds, inCloud = cl.cover > .02 && o.h + 2 > w.sea + cl.low;
        if (inCloud) return;
        const score = (o.h - w.sea) * .4 + o.slope * 8 + ln + rand() * .5;
        if (!best || score > best.score) best = { dir: dirs[i], score, h: o.h, slope: o.slope };
      });
    }
    return best;
  }
  // RandomCam: jumps to a lit spot at the chosen altitude band and looks at something.
  // big = six-pip die (anywhere on the day side), small = two-pip die (near here).
  randomCam(big, altKm) {
    const c = this.cam, w = this.current;
    // airplane heights sit above the cloud deck so the view is not fog
    if (altKm > 1 && altKm < 100 && w.clouds.cover > .05) altKm = Math.max(altKm, w.clouds.high + Math.max(w.sea, 0) + 3);
    const near = big ? null : c.up, spread = Math.min(Math.max(altKm * 30 / w.radius, .002), .2);
    const s = this.scoutSpot(near, spread) ?? { dir: c.up, h: c.ground };
    const sun = this.r.sunDir(w);
    const flat = v3.norm(v3.add(sun, s.dir, -v3.dot(sun, s.dir)));
    const back = Math.max(altKm * 6, .02);
    const yaw = (Math.random() - .5) * 2.2;
    const away = v3.rotate(flat, s.dir, yaw);
    const standDir = v3.norm(v3.add(s.dir, away, back / c.R));
    const [ground] = this.r.heightsAt(c, this.time, [standDir], Math.max(altKm * .02, .002));
    const gh = Math.max(ground.h, w.seaType !== 3 ? w.sea : -1e9);
    c.flight = null; this.vel = [0, 0, 0];
    c.ground = gh; c.pos = standDir.map(v => v * (c.R + gh + altKm)); c.derive();
    const look = away.map(v => -v), drop = Math.max(Math.min((s.h - gh - altKm) / back, .3), altKm < .1 ? -.1 : -.45);
    c.fwd = v3.norm(v3.add(look, c.up, drop)); c.camUp = c.up.slice(); c.derive(); c.level(1); c.derive();
    if (this.mode === 'walk') this.stilts = altKm;
    this.needGround = true; this.dirty = true;
    return s;
  }
  // Teleports just off a scouted peak and turns to face it with the sun behind you.
  scout(instant = false) {
    const s = this.scoutSpot(), c = this.cam; if (!s) return null;
    const sun = this.r.sunDir(this.current);
    const flat = v3.norm(v3.add(sun, s.dir, -v3.dot(sun, s.dir)));
    const standDir = v3.norm(v3.add(s.dir, flat, 14 / c.R));
    const [ground] = this.r.heightsAt(c, this.time, [standDir], .05);
    const gh = Math.max(ground.h, this.current.sea);
    const lookFlat = flat.map(v => -v);
    if (instant) {
      c.ground = gh; c.pos = standDir.map(v => v * (c.R + gh + 1.2)); c.derive();
      c.fwd = v3.norm(v3.add(lookFlat, c.up, Math.max((s.h - gh - 1.2) / 14, -.1))); c.camUp = c.up.slice(); c.derive();
      this.dirty = true;
    } else c.flyTo(standDir, 1.2, gh, v3.norm(v3.add(lookFlat, standDir, .02)), 3.5);
    return s;
  }
  // Panic buttons from the original: stop, level, and pop up to 10 km.
  stop() { this.vel = [0, 0, 0]; }
  levelNow() { const c = this.cam; const f = v3.norm(v3.add(c.fwd, c.up, -v3.dot(c.fwd, c.up))); c.fwd = f; c.camUp = c.up.slice(); c.derive(); this.dirty = true; }
  popUp() { this.standAt(10); this.vel = [0, 0, 0]; if (this.mode === 'walk') this.stilts = 10; }

  setMode(m) {
    this.mode = m; this.vel = [0, 0, 0]; this.stick = null;
    const c = this.cam; c.autoLevel = m === 'walk';
    if (m === 'walk') { this.stilts = c.orbital < .5 ? c.altAboveGround : null; this.needGround = true; }
    this.dirty = true; this.emit('mode');
  }

  step(dt) {
    const c = this.cam, k = this.keys, shift = k.has('ShiftLeft') || k.has('ShiftRight');
    let f = 0, s = 0, u = 0, tilt = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f++;
    if (k.has('KeyS') || k.has('ArrowDown')) f--;
    if (k.has('KeyD') || k.has('ArrowRight')) s++;
    if (k.has('KeyA') || k.has('ArrowLeft')) s--;
    if (k.has('KeyM') || k.has('PageUp')) u++;
    if (k.has('KeyN') || k.has('PageDown')) u--;
    if (k.has('KeyQ')) tilt--;
    if (k.has('KeyE')) tilt++;
    if (this.jog) { f += this.jog[0]; s += this.jog[1]; u += this.jog[2]; }
    let active = !!(f || s || u || tilt) || !!this.stick;
    const play = this.movie.play;
    if (play) { this.playStep(dt); active = true; }
    else if (this.mode === 'walk') {
      if (tilt) c.roll(tilt * dt * .8);
      if ((f || s || u) && !this.stilts && c.orbital < .5) this.stilts = c.altAboveGround;
      if (f || s) {
        const sp = (shift ? .15 : 1) * dt * .7 * c.altAboveGround;
        const fl = v3.norm(v3.add(c.fwd, c.up, -v3.dot(c.fwd, c.up)));
        const fwd = Math.hypot(...fl) > .2 ? fl : v3.norm(v3.add(c.camUp, c.up, -v3.dot(c.camUp, c.up)));
        const right = v3.norm(v3.cross(fwd, c.up));
        c.transport(v3.add(v3.add(c.pos, fwd, f * sp), right, s * sp));
      }
      if (u) { const k2 = Math.exp(u * dt * (shift ? .3 : 1.4)); c.dolly(k2); if (this.stilts) this.stilts *= k2; }
      c.frame(dt);
    } else {
      // Fly and UFO: keys accelerate; the mouse is a stick (offset from the press point sets rates).
      const S = SENS[this.sens], ufo = this.mode === 'ufo';
      const scale = ufo ? Math.max(c.altAboveGround, .005) * 1.5 : 1;
      const acc = S.acc * scale * (shift ? .1 : 1) * dt;
      const v = this.vel;
      v[0] += f * acc; v[1] += s * acc; v[2] += u * acc;
      const sp = Math.hypot(...v), cap = S.max * scale;
      if (sp > cap) for (let i = 0; i < 3; i++) v[i] *= cap / sp;
      if (this.stick) {
        const st = this.stick, kk = S.turn * dt;
        if (st.button === 2) c.yaw(st.dx * kk * 1.2);
        else { c.pitch(-st.dy * kk); c.roll(st.dx * kk * 1.4); }
      }
      if (tilt) c.roll(tilt * dt * S.turn * .6);
      if (!ufo && S.level > 0) {
        // coordinated turn: bank yaws the nose; less advanced modes also drop it a little
        const roll = c.rollAngle; c.yaw(-Math.sin(roll) * dt * .9);
        if (!this.stick) { c.roll(-roll * Math.min(dt * S.level, 1)); c.pitch(-c.pitchAngle * Math.min(dt * S.level * .5, 1)); }
        else c.pitch(-Math.abs(Math.sin(roll)) * dt * .12);
      }
      const d = v3.add(v3.add(c.fwd.map(x => x * v[0] * dt), c.right, v[1] * dt), c.camUp, v[2] * dt);
      const np = v3.add(c.pos, d);
      if (ufo) { c.pos = np; c.derive(); } else c.transport(np);
      const floor = c.R + c.ground + .001, l = Math.hypot(...c.pos);
      if (l < floor) { c.pos = c.pos.map(x => x * floor / l); c.derive(); if (this.vel[2] < 0) this.vel[2] = 0; }
      if (Math.hypot(...v) > 1e-9) active = true;
      c.frame(dt);
    }
    if (this.movie.rec) this.movie.frames.push({ t: performance.now(), pos: c.pos.slice(), fwd: c.fwd.slice(), camUp: c.camUp.slice() });
    const flying = !!c.flight;
    if (this.wasFlying && !flying) this.needGround = true; // re-measure at full detail after landing
    this.wasFlying = flying;
    if (active || flying || this.dirty) { this.r.resetAccum(); this.idle = 0; this.moving = true; }
    else { this.idle += dt; if (this.idle > .15) this.moving = false; }
    this.dirty = false;
    // ground under the camera, read back asynchronously so the CPU never waits on the GPU
    if ((this.moving && (active || flying)) || this.needGround) {
      const ok = this.r.groundAsync(c, this.time, g => {
        c.ground = Math.max(g.h, this.current.seaType !== 3 ? this.current.sea : -1e9);
        c.derive();
        if (this.mode === 'walk' && this.stilts && c.orbital < .5 && !c.flight && !this.movie.play) {
          // walk on stilts: hold the height above ground as the terrain rises and falls
          const want = c.R + c.ground + this.stilts, l = Math.hypot(...c.pos);
          if (Math.abs(l - want) > this.stilts * .002) { c.pos = c.pos.map(x => x * want / l); c.derive(); this.r.resetAccum(); this.moving = true; this.idle = 0; if (Math.abs(l - want) > this.stilts * .05) this.needGround = true; }
        }
        this.emit('ground');
      });
      if (ok) this.needGround = false;
    }
  }

  // ---- movie --------------------------------------------------------------
  recordStart() { this.movie = { rec: true, frames: [], play: null, trim: [0, 1] }; this.emit('movie'); }
  recordStop() { this.movie.rec = false; this.emit('movie'); }
  get movieDuration() { const f = this.movie.frames; return f.length > 1 ? (f[f.length - 1].t - f[0].t) / 1000 : 0; }
  // Camera at a time (seconds) along the recorded path, interpolated.
  poseAt(sec) {
    const f = this.movie.frames; if (!f.length) return null;
    const t = f[0].t + sec * 1000;
    let i = 1; while (i < f.length - 1 && f[i].t < t) i++;
    const a = f[i - 1], b = f[Math.min(i, f.length - 1)], k = b.t > a.t ? Math.min(Math.max((t - a.t) / (b.t - a.t), 0), 1) : 0;
    const L = (x, y) => x.map((v, j) => v + (y[j] - v) * k);
    return { pos: L(a.pos, b.pos), fwd: L(a.fwd, b.fwd), camUp: L(a.camUp, b.camUp) };
  }
  play(from = null) {
    const d = this.movieDuration; if (!d) return;
    const [t0, t1] = this.movie.trim;
    this.movie.play = { at: from ?? t0 * d, end: t1 * d };
    this.emit('movie');
  }
  pauseMovie() { this.movie.play = null; this.emit('movie'); }
  seekMovie(sec) { const p = this.poseAt(sec); if (!p) return; this.applyPose(p); this.movie.cursor = sec; this.emit('movie'); }
  applyPose(p) { const c = this.cam; c.pos = p.pos; c.fwd = p.fwd; c.camUp = p.camUp; c.derive(); this.dirty = true; this.needGround = true; }
  playStep(dt) {
    const p = this.movie.play; p.at += dt;
    if (p.at >= p.end) { p.at = p.end; this.movie.play = null; this.emit('movie'); }
    this.movie.cursor = p.at;
    const pose = this.poseAt(p.at); if (pose) this.applyPose(pose);
  }

  // ---- drawing ------------------------------------------------------------
  draw() {
    const r = this.r, t = this.tier, cw = this.canvas.width, ch = this.canvas.height;
    const style = r.style;
    if (this.moving) {
      // resolution follows measured GPU time, so motion costs a fixed share of each frame
      const budget = 1000 / this.targetFps * t.moveShare;
      const cost = r.cost.move || (r.timed ? 0 : Math.max(r.cost.fence - 4, 0));
      if (cost > 0) {
        const k = Math.sqrt(budget / cost);
        r.scale = Math.min(Math.max(r.scale * Math.min(Math.max(k, .82), 1.08), t.minScale), 1);
      }
      // a machine that cannot keep up even at the smallest size drops to a lighter tier
      if (cost > budget * 1.6 && r.scale <= t.minScale + 1e-6) this.over = (this.over ?? 0) + 1; else this.over = 0;
      if (this.over > this.targetFps * 3 && this.tierPref === 'auto' && this.tierName !== 'low') {
        this.over = 0; this.tierName = this.tierName === 'high' ? 'medium' : 'low'; this.applyTier(); this.emit('tier');
      }
      const q = Math.round(r.scale * 16) / 16;
      r.quality = style === 2 ? { ...t.move, fine: 0, shadow: 0 } : t.move;
      const w = Math.max(Math.round(cw * q), 8), h = Math.max(Math.round(ch * q), 8);
      r.resetAccum();
      r.begin('move', 1);
      r.renderSample(this.cam, this.time, w, h, 1);
      r.present(this.current.exposure);
      r.end();
    } else if (r.samples < this.maxSamples) {
      r.quality = style === 2 ? { ...t.refine, fine: 0, shadow: 0 } : t.refine;
      // Refine in horizontal strips sized from a per-row cost profile (near ground costs far more
      // than sky), so each display frame spends only a few milliseconds of GPU time.
      const budget = this.focused ? t.refineMs : Math.min(t.refineMs, 4);
      const P = this.rowProfile(ch), N = P.length, y0 = r.view.row ?? 0;
      let y1 = y0, pred = 0;
      const step = Math.max(1, Math.ceil(ch / N / 2));
      const limit = this.fresh > 0 ? Math.ceil(ch / 16) : ch;
      while (y1 < ch && y1 - y0 < limit) { pred += P[Math.min(N - 1, (y1 * N / ch) | 0)] * step; y1 += step; if (pred >= budget) break; }
      if (!r.tq) y1 = y0 + Math.max(step, Math.round((y1 - y0) * this.rowGuess));
      y1 = Math.min(y1, ch);
      this.fresh = Math.max((this.fresh | 0) - 1, 0); this.bands = Math.max(1, Math.round(ch / Math.max(y1 - y0, 1)));
      r.begin('refine', 1, { y0, y1, H: ch });
      const done = r.renderRows(this.cam, this.time, cw, ch, y0, y1);
      if (done || r.samples === 0) r.present(this.current.exposure);
      r.end();
    }
  }
  // ms per row, in N bands of the screen, learned from timer results.
  rowProfile(H) {
    if (!this.prof || this.prof.H !== H) { this.prof = new Float32Array(32).fill(.02); this.prof.H = H; this.fresh = 3; }
    return this.prof;
  }
  learnRows(m, ms) {
    const P = this.rowProfile(m.H), N = P.length, per = ms / Math.max(m.y1 - m.y0, 1);
    for (let i = (m.y0 * N / m.H) | 0; i < Math.min(N, Math.ceil(m.y1 * N / m.H)); i++) P[i] = P[i] * .3 + per * .7;
    let tot = 0; for (let i = 0; i < N; i++) tot += P[i] * m.H / N;
    this.r.cost.refine = tot;
  }
  tick(now) {
    const ms = Math.min(now - (this.last ?? now), 250); this.last = now;
    this.r.poll();
    if (this.paused || this.hold) return;
    this.frames++;
    this.fps = this.fps * .9 + (1000 / Math.max(ms, 1)) * .1;
    this.step(ms / 1000);
    if (this.r.busy()) { this.skipped = (this.skipped ?? 0) + 1; if (!this.r.tq) this.rowGuess = Math.max(this.rowGuess * .85, .05); return; }
    if (!this.r.tq && !this.moving) this.rowGuess = Math.min(this.rowGuess * 1.03, 8);
    if (this.moving) this.fresh = 3;
    // motion frames are capped at the target rate, so they use only their share of the GPU
    if (this.moving && now - (this.lastDraw ?? 0) < 1000 / this.targetFps - 2) return;
    this.lastDraw = now;
    this.draw();
  }
  start() { const loop = n => { this.tick(n); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
}
