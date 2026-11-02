import { Renderer } from './renderer.js';
import { Camera, v3 } from './camera.js';
import { generateWorld, applyMixers, MIXERS, morph } from './world.js';

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new Renderer(canvas);
    this.mix = Object.fromEntries(MIXERS.map(m => [m.id, 0]));
    this.keys = new Set(); this.time = 0; this.frames = 0; this.fps = 0;
    this.dirty = true; this.idle = 0; this.maxSamples = 96; this.bands = 4;
    this.targetFps = 30; this.moving = false; this.paused = false;
    this.listeners = new Set();
    this.resize();
  }
  on(f) { this.listeners.add(f); }
  emit(type) { for (const f of this.listeners) f(type); }
  resize() {
    const b = this.canvas.getBoundingClientRect();
    this.r.resize(Math.max(b.width, 2), Math.max(b.height, 2), Math.min(devicePixelRatio || 1, 2));
    this.dirty = true;
  }
  get world() { return this.current; }
  // Rebuilds the derived world. Structural graph edits recompile; parameter edits do not.
  async rebuild(keepView = true) {
    const b = this.morphTo ? morph(this.base, this.morphTo, this.morphT) : this.base;
    this.current = applyMixers(b, this.mix);
    const prevR = this.cam?.R;
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
    if (this.cam) { this.cam.R = R; this.cam.ground = 0; this.cam.flight = null; this.cam.walk = false; }
    await this.rebuild(false);
    this.homeView();
  }
  homeView() {
    const c = this.cam, s = this.r.sunDir(this.current);
    const d = v3.norm([s[0] + .55 * -s[2], .34 + s[1] * .5, s[2] + .55 * s[0]]);
    c.place(d, this.current.radius * 2.1, 0, 0);
    c.fwd = d.map(v => -v); c.camUp = [0, 1, 0]; c.derive();
    this.dirty = true;
  }
  // Finds a dramatic spot: real relief, near the sunlit side, above the sea.
  scoutSpot() {
    const r = this.r, w = this.current, sun = r.sunDir(w);
    let best = null, seed = (this.scoutN = (this.scoutN ?? 0) + 1) * 7919 + w.seed;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let b = 0; b < 8; b++) {
      const dirs = [];
      for (let i = 0; i < 64; i++) {
        const z = rand() * 2 - 1, a = rand() * 6.283, c = Math.sqrt(1 - z * z), d = [c * Math.cos(a), z, c * Math.sin(a)];
        dirs.push(v3.norm(v3.add(d, sun, .9)));
      }
      r.heightsAt(this.cam, this.time, dirs, w.radius / 2500).forEach((o, i) => {
        const land = o.h > w.sea + .03, ln = v3.dot(dirs[i], sun);
        if (!land || ln < .22) return;
        // the camera ends up near this height, so stay out of the cloud deck
        const cl = w.clouds, inCloud = cl.cover > .02 && o.h + 2 > w.sea + cl.low;
        if (inCloud) return;
        const score = (o.h - w.sea) * .4 + o.slope * 8 + ln + rand() * .5;
        if (!best || score > best.score) best = { dir: dirs[i], score, h: o.h, slope: o.slope };
      });
    }
    return best;
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
  step(dt) {
    const c = this.cam;
    let f = 0, s = 0, u = 0; const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) f++;
    if (k.has('KeyS') || k.has('ArrowDown')) f--;
    if (k.has('KeyD') || k.has('ArrowRight')) s++;
    if (k.has('KeyA') || k.has('ArrowLeft')) s--;
    if (k.has('KeyE') || k.has('Space')) u++;
    if (k.has('KeyQ') || k.has('ShiftLeft')) u--;
    const fly = f || s || u, flying = !!c.flight;
    if (fly) { const sp = (k.has('ControlLeft') ? 3 : 1) * dt * .7; c.move(f * sp, s * sp, u * sp); }
    c.frame(dt);
    if (fly || flying || this.dirty) { this.r.resetAccum(); this.idle = 0; this.moving = true; }
    else { this.idle += dt; if (this.idle > .15) this.moving = false; }
    this.dirty = false;
    if ((this.frames % 6 === 0 && (fly || flying)) || this.needGround) {
      this.needGround = false;
      const g = this.r.groundAt(c, this.time);
      c.ground = Math.max(g.h, this.current.seaType !== 3 ? this.current.sea : -1e9);
      c.derive();
      this.emit('ground');
      if (c.walk) { c.pos = c.up.map(v => v * (c.R + c.ground + c.eye)); c.derive(); }
    }
  }
  draw(ms) {
    const r = this.r, cw = this.canvas.width, ch = this.canvas.height;
    if (this.moving) {
      // keep motion smooth: adapt resolution, in coarse steps so buffers are rarely reallocated
      if (ms > 1000 / this.targetFps * 1.35) r.scale = Math.max(r.scale * .9, .22);
      else if (ms < 1000 / this.targetFps * .7) r.scale = Math.min(r.scale * 1.04, 1);
      const q = Math.round(r.scale * 12) / 12;
      r.quality = { steps: 100, shadow: 8, cloud: 8, fine: 5 };
      const w = Math.round(cw * q), h = Math.round(ch * q);
      r.resetAccum();
      r.renderSample(this.cam, this.time, w, h, 1);
      r.present(this.current.exposure);
    } else if (r.samples < this.maxSamples) {
      r.quality = { steps: 220, shadow: 32, cloud: 26, fine: 24 };
      if (ms > 110) this.bands = Math.min(this.bands * 2, 32); else if (ms < 45 && this.bands > 1) this.bands >>= 1;
      if (r.tile >= this.bands) r.tile = 0;
      const done = r.renderSample(this.cam, this.time, cw, ch, this.bands);
      if (done || r.samples === 0) r.present(this.current.exposure);
    }
  }
  tick(now) {
    const ms = Math.min(now - (this.last ?? now), 250); this.last = now;
    if (!this.paused) {
      this.frames++;
      this.fps = this.fps * .9 + (1000 / Math.max(ms, 1)) * .1;
      this.step(ms / 1000);
      this.draw(ms);
    }
  }
  start() { const loop = n => { this.tick(n); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
}
