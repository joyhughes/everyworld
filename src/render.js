// Photo-real rendering: the Camera button (renders into the RTR with the black status bar),
// and the Uplink Queue (batch stills, movies and six-face panoramas). All work is paced: each
// display frame renders one strip within a GPU budget, so the machine stays responsive.
import { Camera, v3 } from './camera.js';
import { encodeWorld, decodeWorld } from './world.js';

export const QUALITY = {
  Low: { spp: 4, steps: 150, shadow: 0, cloud: 12, fine: 10, redo: false },
  Medium: { spp: 8, steps: 180, shadow: 0, cloud: 16, fine: 14, redo: false },
  Normal: { spp: 16, steps: 220, shadow: 16, cloud: 22, fine: 20, redo: true },
  High: { spp: 32, steps: 240, shadow: 26, cloud: 28, fine: 24, redo: true },
  Maximum: { spp: 64, steps: 280, shadow: 40, cloud: 34, fine: 30, redo: true },
};
export const PHASES = ['Starting Render', 'Pre-processing', 'Rendering', 'Redoing Blocks', 'Tidying', 'Render Completed'];

const frame = () => new Promise(r => requestAnimationFrame(r));

// Store-only ZIP writer (for PNG sequences and panorama faces).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
export async function zip(files) {
  const parts = [], dir = []; let off = 0;
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer()), name = new TextEncoder().encode(f.name), crc = crc32(data);
    const hd = new DataView(new ArrayBuffer(30));
    hd.setUint32(0, 0x04034b50, true); hd.setUint16(4, 20, true); hd.setUint32(14, crc, true); hd.setUint32(18, data.length, true); hd.setUint32(22, data.length, true); hd.setUint16(26, name.length, true);
    parts.push(hd.buffer, name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true); cd.setUint32(42, off, true);
    dir.push(cd.buffer, name);
    off += 30 + name.length + data.length;
  }
  const size = dir.reduce((s, p) => s + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...dir, end.buffer], { type: 'application/zip' });
}
const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));

export class Renderer2 {
  constructor(app) { this.app = app; this.job = null; this.listeners = new Set(); this.queue = []; this.nextId = 1; this.qrun = null; }
  on(f) { this.listeners.add(f); }
  emit(t) { for (const f of this.listeners) f(t); }

  // Renders one picture with paced strips. onStrip(acc) after each strip; returns the accumulator.
  async paced(cam, W, H, q, { shadows = true, crop = null, onProgress, control = {}, acc } = {}) {
    const a = this.app, r = a.r, quality = { steps: q.steps, shadow: shadows ? q.shadow : 0, cloud: q.cloud, fine: q.fine };
    acc ??= r.makeAccum(); r.ensureAccum(acc, W, H); r.resetAccum(acc);
    const prevQ = r.quality, prevStyle = r.style;
    const t0 = performance.now();
    onProgress?.(0, 0);
    await frame();
    r.map = null; onProgress?.(1, 0); await frame();
    const total = q.spp, main = q.redo ? Math.ceil(total * .75) : total;
    let cols = 8;
    while (acc.samples < total) {
      if (control.cancel) break;
      if (control.paused || r.busy()) { await frame(); r.poll(); continue; }
      r.quality = quality; r.style = 1;
      if (acc.tile === 0 && r.cost.render > 0) cols = Math.min(Math.max(Math.ceil(r.cost.render / (a.focused ? 14 : 6)), 1), 256);
      r.begin('render', cols);
      r.renderSample(cam, a.time, W, H, cols, { acc, columns: true, crop });
      r.end();
      r.quality = prevQ; r.style = prevStyle;
      const frac = (acc.samples + acc.tile / cols) / total;
      onProgress?.(acc.samples < main ? 2 : 3, frac, acc);
      await frame(); r.poll();
    }
    onProgress?.(4, 1, acc); await frame();
    r.map = null;
    return { acc, ms: performance.now() - t0, cancelled: !!control.cancel };
  }

  // ---- Camera button: render the current view into the RTR --------------------------------
  async renderView(qName, crop) {
    if (this.job) return;
    const a = this.app, r = a.r, q = QUALITY[qName], W = a.canvas.width, H = a.canvas.height;
    const cam = this.cloneCam(a.cam);
    const job = this.job = { kind: 'view', phase: 0, frac: 0, control: {}, crop, W, H, q: qName, started: performance.now() };
    a.hold = true; this.emit('start');
    const res = await this.paced(cam, W, H, q, {
      crop, control: job.control,
      onProgress: (ph, f, acc) => { job.phase = ph; job.frac = f; if (acc) r.present(a.current.exposure, null, W, H, acc); this.emit('progress'); },
    });
    job.acc = res.acc; job.ms = res.ms;
    if (res.cancelled) { this.closeView(); return; }
    job.phase = 5; job.frac = 1; r.present(a.current.exposure, null, W, H, res.acc); this.emit('progress');
  }
  // Saves the RTR render (cropped if a crop window was used).
  async saveView() {
    const j = this.job; if (!j?.acc) return;
    let c = this.app.r.toCanvas(j.acc, this.app.current.exposure);
    if (j.crop) { const [x, y, w, hh] = j.crop, o = document.createElement('canvas'); o.width = w; o.height = hh; o.getContext('2d').drawImage(c, x, c.height - y - hh, w, hh, 0, 0, w, hh); c = o; }
    return { blob: await toBlob(c), name: `${this.app.current.name}.png` };
  }
  closeView() {
    const j = this.job; if (!j) return;
    j.control.cancel = true;
    if (j.acc) this.app.r.freeAccum(j.acc);
    this.job = null; this.app.hold = false; this.app.dirty = true; this.app.r.map = null;
    this.emit('end');
  }
  cloneCam(c) { const k = Object.assign(Object.create(Camera.prototype), c, { flight: null }); k.pos = c.pos.slice(); k.fwd = c.fwd.slice(); k.camUp = c.camUp.slice(); k.derive(); return k; }

  // ---- Uplink Queue --------------------------------------------------------------------
  addJob(kind, extra = {}) {
    const a = this.app, c = a.cam;
    const base = a.current.name.replace(/\W+/g, '').toLowerCase() || 'world';
    const j = {
      id: this.nextId++, kind, status: 'queued', quality: 'Normal', shadows: true,
      w: kind === 'qtvr' ? 1024 : 960, h: kind === 'qtvr' ? 1024 : 540, fps: 30, from: 1, to: 1,
      name: base + (kind === 'movie' ? 'movie.webm' : kind === 'qtvr' ? 'qtvr.zip' : '.png'),
      code: encodeWorld(a), time: a.time, pose: { pos: c.pos.slice(), fwd: c.fwd.slice(), camUp: c.camUp.slice(), fov: c.fov },
      thumb: extra.thumb ?? null, ...extra,
    };
    if (kind === 'movie') { j.frames = a.movie.frames.slice(); j.trim = a.movie.trim.slice(); j.duration = +a.movieDuration.toFixed(2); j.to = Math.max(1, Math.round(j.duration * (j.trim[1] - j.trim[0]) * j.fps)); }
    this.queue.push(j); this.emit('queue');
    return j;
  }
  dupJob(j) { const k = { ...JSON.parse(JSON.stringify({ ...j, result: null, blob: null })), id: this.nextId++, status: 'queued', result: null, ms: null }; this.queue.splice(this.queue.indexOf(j) + 1, 0, k); this.emit('queue'); return k; }
  delJob(j) { if (j.status === 'running') return; this.queue = this.queue.filter(x => x !== j); this.emit('queue'); }
  async startQueue() {
    if (this.qrun || this.job) return;
    const ctl = this.qrun = { paused: false, cancel: false };
    this.emit('queue');
    for (const j of this.queue) {
      if (ctl.cancel) break;
      if (j.status !== 'queued') continue;
      j.status = 'running'; j.progress = 0; this.emit('queue');
      try { await this.runJob(j, ctl); j.status = ctl.cancel ? 'queued' : 'done'; } catch (e) { j.status = 'queued'; j.error = e.message; console.error(e); }
      this.emit('queue');
    }
    this.qrun = null; this.app.hold = false; this.app.dirty = true; this.app.r.map = null;
    this.emit('queue');
  }
  pauseQueue() { if (this.qrun) { this.qrun.paused = !this.qrun.paused; this.emit('queue'); } }
  stopQueue() { if (this.qrun) { this.qrun.cancel = true; this.emit('queue'); } }

  async runJob(j, ctl) {
    const a = this.app;
    if (encodeWorld(a) !== j.code) { const d = decodeWorld(j.code); await a.loadWorld(d.base, d.mix); }
    a.hold = true;
    const prevTime = a.time; a.time = j.time;
    const q = QUALITY[j.quality], t0 = performance.now();
    const cam = this.cloneCam(a.cam); Object.assign(cam, { pos: j.pose.pos.slice(), fwd: j.pose.fwd.slice(), camUp: j.pose.camUp.slice(), fov: j.pose.fov }); cam.derive();
    const ground = a.r.groundAt(cam, a.time); cam.ground = ground.h; cam.derive();
    const prog = (f) => { j.progress = f; this.emit('progress'); };
    let blob;
    if (j.kind === 'still') {
      const { acc, cancelled } = await this.paced(cam, j.w, j.h, q, { shadows: j.shadows, control: ctl, onProgress: (ph, f) => prog(f) });
      if (!cancelled) blob = await toBlob(a.r.toCanvas(acc, a.current.exposure));
      a.r.freeAccum(acc);
    } else if (j.kind === 'qtvr') {
      const S = Math.min(j.w, j.h), u = cam.up, f0 = v3.norm(v3.add(cam.fwd, u, -v3.dot(cam.fwd, u))), r0 = v3.cross(f0, u);
      const faces = [['front', f0, u], ['right', r0, u], ['back', f0.map(v => -v), u], ['left', r0.map(v => -v), u], ['up', u, f0.map(v => -v)], ['down', u.map(v => -v), f0]];
      const files = [];
      for (let i = 0; i < 6 && !ctl.cancel; i++) {
        const c = this.cloneCam(cam); c.fwd = faces[i][1]; c.camUp = faces[i][2]; c.fov = Math.PI / 2; c.derive();
        const { acc } = await this.paced(c, S, S, q, { shadows: j.shadows, control: ctl, onProgress: (ph, f) => prog((i + f) / 6) });
        files.push({ name: `${j.name.replace(/\.\w+$/, '')}_${faces[i][0]}.png`, blob: await toBlob(a.r.toCanvas(acc, a.current.exposure)) });
        a.r.freeAccum(acc);
      }
      if (!ctl.cancel) blob = /\.png$/i.test(j.name) ? files[0].blob : await zip(files);
    } else if (j.kind === 'movie') {
      blob = await this.renderMovie(j, cam, q, ctl, prog);
    }
    a.time = prevTime;
    if (blob) { j.blob = blob; j.result = URL.createObjectURL(blob); j.ms = performance.now() - t0; }
  }
  // Movie: renders each frame, then either zips the PNG sequence or plays the frames back in
  // real time into a MediaRecorder for a WebM file.
  async renderMovie(j, cam, q, ctl, prog) {
    const a = this.app, path = { frames: j.frames }, d = j.duration, [t0] = j.trim;
    const poseAt = sec => { const keep = a.movie; a.movie = path; const p = a.poseAt(sec); a.movie = keep; return p; };
    const files = [], from = Math.max(1, j.from), to = Math.max(from, j.to), n = to - from + 1;
    const mq = { ...q, spp: Math.max(1, Math.round(q.spp / 4)), redo: false };
    for (let i = from; i <= to && !ctl.cancel; i++) {
      const sec = t0 * d + (i - 1) / j.fps, p = poseAt(sec); if (!p) break;
      cam.pos = p.pos; cam.fwd = p.fwd; cam.camUp = p.camUp; cam.derive();
      const g = a.r.groundAt(cam, a.time); cam.ground = g.h; cam.derive();
      const { acc } = await this.paced(cam, j.w, j.h, mq, { shadows: j.shadows, control: ctl, onProgress: (ph, f) => prog((i - from + f) / n) });
      files.push({ name: `${j.name.replace(/\.\w+$/, '')}_${String(i).padStart(4, '0')}.png`, blob: await toBlob(a.r.toCanvas(acc, a.current.exposure)) });
      a.r.freeAccum(acc);
    }
    if (ctl.cancel || !files.length) return null;
    if (!/\.webm$/i.test(j.name) || typeof MediaRecorder === 'undefined') return zip(files);
    const c = document.createElement('canvas'); c.width = j.w; c.height = j.h;
    const ctx = c.getContext('2d'), stream = c.captureStream(j.fps), rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
    const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    const stopped = new Promise(r => { rec.onstop = r; });
    rec.start();
    for (const f of files) { const bm = await createImageBitmap(f.blob); ctx.drawImage(bm, 0, 0); bm.close(); await new Promise(r => setTimeout(r, 1000 / j.fps)); }
    rec.stop(); await stopped;
    return new Blob(chunks, { type: 'video/webm' });
  }
}
