import { lat, fillSlots, SLOTS } from './lattice.js';
import { compileGraph } from './graph.js';
import { VS, FS_LUT, FS_BLIT, fsMain, fsProbe, fsMap, FIXED } from './shaders.js';
import { rng } from './world.js';

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm = a => { const l = Math.hypot(...a); return [a[0]/l, a[1]/l, a[2]/l]; };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This browser has no WebGL2. Update it or turn on hardware acceleration.');
    this.gl = gl;
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This GPU cannot render to floating-point buffers, which Everyworld needs.');
    gl.getExtension('OES_texture_float_linear');
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, lat.buf.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
    this.lutProg = this.link(VS, FS_LUT);
    this.blit = this.link(VS, FS_BLIT);
    this.P = new Float32Array(96 * 4);
    this.lutTex = this.texture(128, 64, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.lutFb = this.fbo(this.lutTex);
    this.palTex = gl.createTexture(); this.ringTex = gl.createTexture();
    // Probe targets
    this.probeTex = this.texture(64, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.probeFb = this.fbo(this.probeTex);
    this.qTex = this.texture(64, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    this.setMapSize(1536, 768);
    this.view = this.makeAccum();
    this.frame = 0;
    this.quality = { steps: 90, shadow: 10, cloud: 14 };
    this.style = 1; // 0 textured, 1 textured with clouds, 2 wireframe
    this.scale = 0.6;
    this.programKey = null;
    this.hmin = -6; this.hmax = 12;
    // GPU pacing: a timer query measures real GPU time; a fence keeps at most one frame in flight,
    // so the browser never queues work faster than the GPU drains it.
    this.tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = []; this.active = null; this.fence = null; this.fenceAt = 0;
    this.cost = { move: 0, refine: 0, fence: 0 };
    this.pbo = gl.createBuffer(); this.probeJob = null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }
  setMapSize(w, h) {
    const gl = this.gl;
    if (this.mapW === w && this.mapH === h) return;
    if (this.mapTex) { gl.deleteTexture(this.mapTex); gl.deleteFramebuffer(this.mapFb); }
    this.mapW = w; this.mapH = h;
    this.mapTex = this.texture(w, h, gl.R32F, gl.RED, gl.FLOAT, gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, this.mapTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.mapFb = this.fbo(this.mapTex); this.map = null;
  }
  // The live view's accumulation state; offscreen renders (thumbnails, globe, stills) make their own.
  makeAccum() { return { tex: null, fb: null, w: 0, h: 0, samples: 0, tile: 0 }; }
  get samples() { return this.view.samples; }
  get tile() { return this.view.tile; }
  set tile(v) { this.view.tile = v; }
  get accum() { return this.view.tex; }
  freeAccum(a) { if (a.tex) { this.gl.deleteTexture(a.tex); this.gl.deleteFramebuffer(a.fb); a.tex = null; a.w = 0; } }

  // ---- pacing -----------------------------------------------------------
  busy() {
    const gl = this.gl;
    if (!this.fence) return false;
    if (gl.getSyncParameter(this.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return true;
    gl.deleteSync(this.fence); this.fence = null;
    this.cost.fence = performance.now() - this.fenceAt;
    return false;
  }
  begin(kind, k = 1, meta = null) {
    const gl = this.gl;
    if (this.tq && !this.active) { const q = gl.createQuery(); gl.beginQuery(this.tq.TIME_ELAPSED_EXT, q); this.active = { q, kind, k, meta }; }
  }
  end() {
    const gl = this.gl;
    if (this.active) { gl.endQuery(this.tq.TIME_ELAPSED_EXT); this.queries.push(this.active); this.active = null; }
    if (!this.fence) { this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); this.fenceAt = performance.now(); }
    gl.flush();
  }
  // Collects finished timer results and finished asynchronous probes. Never blocks.
  poll() {
    const gl = this.gl;
    while (this.queries.length) {
      const a = this.queries[0];
      if (!gl.getQueryParameter(a.q, gl.QUERY_RESULT_AVAILABLE)) break;
      const bad = gl.getParameter(this.tq.GPU_DISJOINT_EXT), ms = gl.getQueryParameter(a.q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(a.q); this.queries.shift();
      if (!bad) { if (a.meta) this.onTimed?.(a.meta, ms); else { const old = this.cost[a.kind], v = ms * a.k; this.cost[a.kind] = old ? old * .6 + v * .4 : v; } this.timed = true; }
    }
    const j = this.probeJob;
    if (j && gl.getSyncParameter(j.fence, gl.SYNC_STATUS) === gl.SIGNALED) {
      gl.deleteSync(j.fence); this.probeJob = null;
      const out = new Float32Array(j.count * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      j.done(out);
    }
  }

  texture(w, h, ifmt, fmt, type, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  fbo(tex) {
    const gl = this.gl, f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return f;
  }
  link(vs, fs, wait = true) {
    const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s); (p._s ??= []).push(s);
    }
    gl.linkProgram(p); p._fs = fs;
    return wait ? this.finish(p) : p;
  }
  finish(p) {
    const gl = this.gl;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = p._s.map(s => gl.getShaderInfoLog(s)).join('\n') || gl.getProgramInfoLog(p);
      console.error(log);
      const m = /ERROR: \d+:(\d+)/.exec(log);
      if (m) console.error('line:', (p._fs.split('\n')[+m[1] - 1] ?? '').slice(0, 300));
      throw new Error('Shader failed to compile: ' + log.slice(0, 400));
    }
    p.u = new Proxy({}, { get: (c, n) => (n in c ? c[n] : (c[n] = gl.getUniformLocation(p, n))) });
    const bi = gl.getUniformBlockIndex(p, 'Lat');
    if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0);
    return p;
  }

  // Compiles only if the graph's structure changed.
  async setWorld(w) {
    this.world = w;
    const g = compileGraph(w.terrain, FIXED.graph, SLOTS);
    if (g.key !== this.programKey) {
      const main = this.link(VS, fsMain(g.glsl), false), probe = this.link(VS, fsProbe(g.glsl), false), map = this.link(VS, fsMap(g.glsl), false);
      await this.whenLinked([main, probe, map]);
      this.finish(main); this.finish(probe); this.finish(map);
      this.main = main; this.probe = probe; this.mapProg = map; this.programKey = g.key;
    }
    this.graph = g;
    g.writeParams(this.P, w.terrain);
    this.P[95 * 4] = w.sun.size;
    this.bakeWorld(w);
    this.resetAccum();
  }

  whenLinked(list) {
    const gl = this.gl, ext = this.parallel;
    if (!ext) return Promise.resolve();
    return new Promise(res => {
      const tick = () => list.every(p => gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR)) ? res() : setTimeout(tick, 30);
      tick();
    });
  }

  bakeWorld(w) {
    const gl = this.gl, a = w.atmo;
    this.atmOn = a.scale > .001 ? 1 : 0;
    this.betaR = a.rayleigh.map(v => v * .01 * a.scale); // Earth is about [.0058, .0135, .0331] per km
    this.betaM = [1, 1, 1].map(() => .0013 * a.mie * a.scale);
    this.hr = a.hr; this.hm = a.hm; this.atmTop = a.hr * 11;
    gl.useProgram(this.lutProg);
    const u = this.lutProg.u;
    gl.uniform3fv(u.uBetaR, this.betaR); gl.uniform3fv(u.uBetaM, this.betaM);
    gl.uniform1f(u.uHr, a.hr); gl.uniform1f(u.uHm, a.hm); gl.uniform1f(u.uAtmTop, this.atmTop); gl.uniform1f(u.uR, w.radius);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lutFb);
    gl.viewport(0, 0, 128, 64);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.bakePalette(w);
    this.bakeRing(w);
  }

  bakePalette(w) {
    const gl = this.gl, S = 32, d = new Uint8Array(S * S * 4), s = w.surf;
    const r = rng((w.seed ^ 77) >>> 0);
    const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const hueShift = (c, amt) => { const k = amt * 6.283, cs = Math.cos(k), sn = Math.sin(k), m = (c[0]+c[1]+c[2])/3; return [m + (c[0]-m)*cs + (c[1]-c[2])*sn*.58, m + (c[1]-m)*cs + (c[2]-c[0])*sn*.58, m + (c[2]-m)*cs + (c[0]-c[1])*sn*.58].map(v => Math.max(0, v)); };
    const rock0 = s.lava ? [.05, .04, .04] : lerp3([.12, .11, .1], [.22, .16, .12], r());
    const rock1 = s.lava ? [.1, .07, .06] : lerp3([.2, .18, .17], [.32, .24, .18], r());
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const t = x / (S - 1), m = y / (S - 1);
      const sand = [.62, .52, .36], dry = [.42, .34, .2], soil = [.2, .17, .13];
      let c;
      if (s.veg === 'none') {
        c = lerp3(lerp3([.4, .4, .42], soil, Math.min(t * 2, 1)), lerp3(sand, [.55, .3, .17], s.seedHue), Math.max(t * 2 - 1, 0) * .7 + .3 * (1 - m));
        if (s.lava) c = c.map(v => v * .16);
      } else {
        const forest = [.045, .1, .045], grass = [.14, .22, .07], tundra = [.26, .26, .2], jungle = [.03, .13, .05];
        const wet = t > .62 ? lerp3(forest, jungle, (t - .62) / .38) : t > .32 ? lerp3(tundra, forest, (t - .32) / .3) : lerp3([.36, .37, .36], tundra, t / .32);
        const mid = t > .4 ? lerp3(wet, grass, .55) : wet;
        const arid = t > .5 ? lerp3(dry, sand, (t - .5) / .5) : lerp3([.32, .3, .26], dry, t / .5);
        c = m < .45 ? lerp3(arid, mid, m / .45) : lerp3(mid, wet, (m - .45) / .55);
        if (s.veg === 'alien') c = hueShift(c, s.seedHue);
      }
      if (y === S - 1 && x < 5) c = x < 2 ? rock0 : rock1;
      const o = (y * S + x) * 4;
      d[o] = c[0] * 255; d[o+1] = c[1] * 255; d[o+2] = c[2] * 255; d[o+3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  bakeRing(w) {
    const gl = this.gl, N = 1024, d = new Uint8Array(N * 4), R = w.rings;
    if (R) {
      const r = rng(R.seed), a = Array.from({ length: 9 }, (_, i) => ({ f: 2 ** i * (1 + r()), p: r() * 6.28, m: 1 / (1.4 ** i) }));
      const gaps = Array.from({ length: 5 }, () => ({ c: r(), w: r.range(.004, .03) }));
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1); let v = 0;
        for (const o of a) v += Math.sin(u * o.f * 6.28 + o.p) * o.m;
        let k = .55 + v * .28;
        for (const g of gaps) k *= 1 - Math.exp(-(((u - g.c) / g.w) ** 2));
        const e = Math.min(u / .06, (1 - u) / .03, 1);
        k = Math.max(0, Math.min(1, k)) * Math.max(0, e);
        d[i*4] = k * 255; d[i*4+1] = (.6 + .4 * Math.sin(u * 31 + a[0].p)) * 255; d[i*4+3] = 255;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.ringTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  sunDir(w) {
    // time 0..1 is a planetary day; tilt is the seasonal latitude of the sun
    const a = w.sun.time * 6.2832, t = w.sun.tilt;
    return [Math.cos(a) * Math.cos(t), Math.sin(t), Math.sin(a) * Math.cos(t)];
  }

  // Everything the lattice needs is recomputed from the double-precision camera each frame.
  updateLattice(cam, time) {
    const w = this.world, s0 = cam.up, sd = w.seed;
    fillSlots(FIXED.detail, FIXED.detailOct, s0, 1, 2, sd + 11);
    const a = -time * w.clouds.speed * 1e-4, ca = Math.cos(a), sa = Math.sin(a);
    this.cloudRot = [ca, 0, -sa, 0, 1, 0, sa, 0, ca]; // column major
    const sc = [ca*s0[0] + sa*s0[2], s0[1], -sa*s0[0] + ca*s0[2]];
    // fixed slots use exact doubles too, offset so uCloudRot*delta stays small
    fillSlots(FIXED.cloud, FIXED.cloudOct, sc, w.clouds.scale, 2.02, sd + 23);
    fillSlots(FIXED.wave, FIXED.waveOct, s0, 8, 2, sd + 37);
    for (const f of this.graph.fills) {
      fillSlots(f.s, f.oct, s0, f.freq(), f.lac(), sd + f.s);
      if (f.warpAt) for (let i = 0; i < 3; i++) fillSlots(f.warpAt + i * 2, 2, s0, f.warpFreq(), 2.1, sd + f.s + 100 * i);
    }
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, new Uint8Array(lat.buf));
  }

  setUniforms(p, cam, time, res) {
    const gl = this.gl, u = p.u, w = this.world;
    gl.useProgram(p);
    gl.uniform4fv(u.uP, this.P);
    gl.uniform3fv(u.uU, cam.up); gl.uniform3fv(u.uRight, cam.right); gl.uniform3fv(u.uUp, cam.camUp); gl.uniform3fv(u.uFwd, cam.fwd);
    const sun = this.sunDir(w); gl.uniform3fv(u.uSun, sun);
    gl.uniform3fv(u.uSunCol, w.sun.color.map(v => v * w.sun.power));
    gl.uniform1f(u.uA, cam.alt); gl.uniform1f(u.uR, w.radius);
    gl.uniform1f(u.uHMin, this.hmin); gl.uniform1f(u.uHMax, this.hmax);
    gl.uniform1f(u.uSea, w.sea); gl.uniform1i(u.uSeaType, w.seaType);
    const tan = Math.tan(cam.fov / 2);
    gl.uniform1f(u.uTan, tan); gl.uniform1f(u.uAspect, res[0] / res[1]);
    gl.uniform1f(u.uPix, 2 * tan / res[1]); gl.uniform2f(u.uRes, res[0], res[1]);
    gl.uniform1f(u.uTime, time); gl.uniform1i(u.uFrame, this.frame);
    gl.uniform1i(u.uFine, this.quality.fine ?? 10); gl.uniform1i(u.uStyle, this.style);
    const m = this.map;
    if (m) {
      const e = sub(cam.up, m.c);
      gl.uniform3fv(u.uMapE, e); gl.uniform3fv(u.uMapT1, m.t1); gl.uniform3fv(u.uMapT2, m.t2); gl.uniform3fv(u.uMapC, m.c);
      gl.uniform2f(u.uMapL, m.l0, m.ls); gl.uniform1f(u.uMapTexel, m.texel);
    }
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.mapTex); gl.uniform1i(u.uMap, 4);
    gl.uniform1i(u.uSteps, this.quality.steps); gl.uniform1i(u.uShadow, this.quality.shadow); gl.uniform1i(u.uCloudSteps, this.quality.cloud);
    gl.uniform3fv(u.uBetaR, this.betaR); gl.uniform3fv(u.uBetaM, this.betaM);
    gl.uniform1f(u.uHr, this.hr); gl.uniform1f(u.uHm, this.hm); gl.uniform1f(u.uAtmTop, this.atmTop); gl.uniform1f(u.uMieG, w.atmo.g); gl.uniform1f(u.uAtmOn, this.atmOn);
    gl.uniform1f(u.uCover, w.clouds.cover); gl.uniform1f(u.uCloudLo, w.clouds.low); gl.uniform1f(u.uCloudHi, w.clouds.high); gl.uniform1f(u.uCloudDen, w.clouds.density);
    gl.uniform3fv(u.uCloudCol, w.clouds.color); gl.uniformMatrix3fv(u.uCloudRot, false, this.cloudRot);
    gl.uniform1f(u.uTemp, w.surf.temp); gl.uniform1f(u.uMoist, w.surf.moist); gl.uniform1f(u.uLava, w.surf.lava); gl.uniform3fv(u.uSeaCol, w.seaColor);
    // moons as camera-relative positions: doubles here, float-safe in the shader
    const mv = new Float32Array(12), mc = new Float32Array(12); let nm = 0;
    for (const m of w.moons.slice(0, 3)) {
      const ca = Math.cos(m.az + time * 2e-5), sa = Math.sin(m.az + time * 2e-5), ci = Math.cos(m.incl), si = Math.sin(m.incl);
      const pos = [ca * ci * m.dist, si * m.dist, sa * ci * m.dist];
      const rel = sub(pos, cam.pos);
      mv.set([rel[0], rel[1], rel[2], m.radius], nm * 4); mc.set([...m.color, m.seed], nm * 4); nm++;
    }
    gl.uniform4fv(u['uMoon[0]'] ?? u.uMoon, mv); gl.uniform4fv(u['uMoonCol[0]'] ?? u.uMoonCol, mc); gl.uniform1i(u.uMoons, nm);
    const R = w.rings;
    if (R) {
      const n = [Math.sin(R.tilt) * Math.cos(R.spin), Math.cos(R.tilt), Math.sin(R.tilt) * Math.sin(R.spin)];
      gl.uniform4f(u.uRingA, R.inner, R.outer, 0, R.density); gl.uniform3fv(u.uRingN, n); gl.uniform3fv(u.uRingCol, R.color);
    } else gl.uniform4f(u.uRingA, 0, 0, 0, 0);
    gl.uniform1f(u.uStars, w.sky.stars); gl.uniform1f(u.uNebula, w.sky.nebula); gl.uniform1f(u.uHue, w.sky.hue);
    const b = new Float32Array(16), bs = (w.bombs ?? []).slice(0, 4);
    bs.forEach((k, i) => b.set([k.at[0], k.at[1], k.at[2], k.radius], i * 4));
    gl.uniform4fv(u['uBomb[0]'] ?? u.uBomb, b); gl.uniform1i(u.uBombs, bs.length);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.lutTex); gl.uniform1i(u.uTrans, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.palTex); gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.ringTex); gl.uniform1i(u.uRing, 2);
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.resetAccum();
  }
  ensureAccum(a, w, h) {
    const gl = this.gl;
    if (a.tex && a.w === w && a.h === h) return;
    this.freeAccum(a);
    a.tex = this.texture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    a.fb = this.fbo(a.tex); a.w = w; a.h = h; a.samples = 0; a.tile = 0;
  }
  resetAccum(a = this.view) { a.samples = 0; a.tile = 0; a.row = 0; }

  // The map stays valid until the camera has moved a good fraction of its own height.
  mapStale(cam) {
    const m = this.map, e = sub(cam.up, m.c), moved = Math.hypot(...e) * cam.R;
    return moved > cam.altAboveGround * .2 || Math.abs(Math.log(cam.altAboveGround / m.agl)) > .25;
  }

  // Bakes terrain height into the log-polar map, centred at the camera's nadir.
  bakeMap(cam, time) {
    this.mapArgs = [Object.assign(Object.create(Object.getPrototypeOf(cam)), cam, { pos: cam.pos.slice(), up: cam.up.slice(), fwd: cam.fwd.slice(), camUp: cam.camUp.slice(), right: cam.right.slice() }), time];
    const gl = this.gl, c = cam.up.slice();
    const a = Math.abs(c[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const t1 = norm(cross(a, c)), t2 = cross(c, t1);
    const rho0 = Math.max(Math.min(cam.altAboveGround, cam.R) / cam.R * .15, 1e-9);
    const l0 = Math.log(rho0), ls = 1 / (Math.log(Math.PI) - l0);
    this.map = { agl: cam.altAboveGround, c, t1, t2, l0, ls, texel: Math.max(2 * Math.PI / this.mapW, (Math.log(Math.PI) - l0) / this.mapH) };
    this.updateLattice(cam, time);
    this.setUniforms(this.mapProg, cam, time, [this.mapW, this.mapH]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mapFb);
    gl.viewport(0, 0, this.mapW, this.mapH); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Draws one sample into an accumulation buffer, one strip at a time so a slow GPU never
  // gets a long uninterruptible job. Strips are rows, or columns left to right (like the
  // original renderer's status bar describes). `crop` limits the work to a rectangle.
  renderSample(cam, time, W, H, bands, { acc = this.view, columns = false, crop = null } = {}) {
    const gl = this.gl;
    this.ensureAccum(acc, W, H);
    if (acc.tile === 0 && (!this.map || this.mapStale(cam))) this.bakeMap(cam, time);
    this.updateLattice(cam, time);
    this.setUniforms(this.main, cam, time, [W, H]);
    const u = this.main.u, n = acc.samples;
    const j = this.jitter(n);
    gl.uniform2f(u.uJit, j[0], j[1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb);
    gl.viewport(0, 0, W, H);
    if (n === 0) { gl.disable(gl.BLEND); } else {
      gl.enable(gl.BLEND); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (n + 1));
    }
    gl.enable(gl.SCISSOR_TEST);
    const [cx, cy, cw, ch] = crop ?? [0, 0, W, H];
    if (columns) { const x0 = cx + Math.floor(acc.tile * cw / bands), x1 = cx + Math.floor((acc.tile + 1) * cw / bands); gl.scissor(x0, cy, x1 - x0, ch); }
    else { const y0 = cy + Math.floor(acc.tile * ch / bands), y1 = cy + Math.floor((acc.tile + 1) * ch / bands); gl.scissor(cx, y0, cw, y1 - y0); }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    acc.tile++;
    if (acc.tile >= bands) { acc.tile = 0; acc.samples++; this.frame++; return true; }
    return false;
  }
  // Renders rows [y0, y1) of the current sample; the sample completes when y1 reaches H.
  renderRows(cam, time, W, H, y0, y1, acc = this.view) {
    const gl = this.gl;
    this.ensureAccum(acc, W, H);
    if (y0 === 0 && (!this.map || this.mapStale(cam))) this.bakeMap(cam, time);
    this.updateLattice(cam, time);
    this.setUniforms(this.main, cam, time, [W, H]);
    const n = acc.samples, j = this.jitter(n);
    gl.uniform2f(this.main.u.uJit, j[0], j[1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb);
    gl.viewport(0, 0, W, H);
    if (n === 0) gl.disable(gl.BLEND); else { gl.enable(gl.BLEND); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA); gl.blendColor(0, 0, 0, 1 / (n + 1)); }
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, W, y1 - y0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    acc.row = y1 >= H ? 0 : y1; acc.tile = acc.row ? 1 : 0;
    if (y1 >= H) { acc.samples++; this.frame++; return true; }
    return false;
  }
  jitter(n) { // R2 low-discrepancy sequence for pixel antialiasing
    if (n === 0) return [.5, .5];
    return [(.7548776662 * n) % 1, (.5698402910 * n) % 1];
  }
  present(exposure, target = null, w = this.canvas.width, h = this.canvas.height, acc = this.view) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.blit);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, acc.tex);
    gl.uniform1i(this.blit.u.uTex, 0); gl.uniform1f(this.blit.u.uExp, exposure);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }
  // Reads an accumulation buffer back as an 8-bit canvas (top row first).
  toCanvas(acc, exposure) {
    const gl = this.gl, W = acc.w, H = acc.h;
    const tex = this.texture(W, H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST), fb = this.fbo(tex);
    this.present(exposure, fb, W, H, acc);
    const px = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(tex); gl.deleteFramebuffer(fb);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    return c;
  }
  // A small one-off picture from any camera (thumbnails, the GPS globe, the wizard's Zip Render).
  // Uses its own buffers and restores the live view's map afterwards.
  snapshot(cam, time, W, H, spp = 1, quality = { steps: 90, shadow: 6, cloud: 8, fine: 4 }) {
    const acc = this.makeAccum(), q = this.quality, had = this.map, args = this.mapArgs;
    this.quality = quality; this.map = null;
    for (let s = 0; s < spp; s++) this.renderSample(cam, time, W, H, 1, { acc });
    const c = this.toCanvas(acc, this.world.exposure);
    this.freeAccum(acc); this.quality = q;
    // put the live view's height map back, so its refinement carries on undisturbed
    if (had && args) this.bakeMap(...args); else this.map = null;
    return c;
  }

  // Probes run the real terrain shader so collision, picking and scouting match the picture.
  runProbe(cam, time, mode, data, count) {
    const gl = this.gl;
    if (mode === 0 && !this.map) this.bakeMap(cam, time);
    gl.bindTexture(gl.TEXTURE_2D, this.qTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 1, gl.RGBA, gl.FLOAT, data);
    this.updateLattice(cam, time);
    this.setUniforms(this.probe, cam, time, [this.canvas.width, this.canvas.height]);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.qTex);
    gl.uniform1i(this.probe.u.uQ, 3); gl.uniform1i(this.probe.u.uMode, mode);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeFb);
    gl.viewport(0, 0, 64, 1); gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    const out = new Float32Array(64 * 4);
    gl.readPixels(0, 0, count, 1, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  // Height at given unit-sphere directions, at the given feature size in km.
  heightsAt(cam, time, dirs, footKm) {
    const R = this.world.radius, lod = -Math.log2(footKm / R), q = new Float32Array(64 * 4);
    dirs.forEach((s, i) => q.set([s[0] - cam.up[0], s[1] - cam.up[1], s[2] - cam.up[2], lod], i * 4));
    const o = this.runProbe(cam, time, 1, q, dirs.length);
    return dirs.map((_, i) => ({ h: o[i * 4], slope: o[i * 4 + 1] }));
  }
  groundAt(cam, time) { return this.heightsAt(cam, time, [cam.up], Math.max(cam.altAboveGround * .02, 2e-4))[0]; }
  // Same as groundAt, but the result arrives a frame or two later through a pixel buffer, so
  // walking and flying never stall the CPU waiting for the GPU.
  groundAsync(cam, time, done) {
    if (this.probeJob) return false;
    const gl = this.gl, R = this.world.radius, foot = Math.max(cam.altAboveGround * .02, 2e-4);
    const q = new Float32Array(64 * 4); q.set([0, 0, 0, -Math.log2(foot / R)], 0);
    gl.bindTexture(gl.TEXTURE_2D, this.qTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 1, gl.RGBA, gl.FLOAT, q);
    this.updateLattice(cam, time);
    this.setUniforms(this.probe, cam, time, [this.canvas.width, this.canvas.height]);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.qTex);
    gl.uniform1i(this.probe.u.uQ, 3); gl.uniform1i(this.probe.u.uMode, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.probeFb);
    gl.viewport(0, 0, 64, 1); gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.probeJob = { fence: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), count: 1, done: o => done({ h: o[0], slope: o[1] }) };
    gl.flush();
    return true;
  }

  pick(cam, time, dir) {
    const q = new Float32Array(64 * 4), pix = 2 * Math.tan(cam.fov / 2) / this.canvas.height;
    q.set([dir[0], dir[1], dir[2], pix], 0);
    const o = this.runProbe(cam, time, 0, q, 1);
    return { t: o[0], kind: o[1] };
  }

  // Samples the whole planet: sets sea level from the world's ocean fraction, then sizes
  // the marching shell around the real extremes.
  scanBounds(cam) {
    const r = rng(12345), R = this.world.radius, w = this.world, all = [];
    this.hmin = -50; this.hmax = 50;
    for (let b = 0; b < 16; b++) {
      const dirs = [];
      for (let i = 0; i < 64; i++) { const z = r.range(-1, 1), a = r.range(0, 6.283), c = Math.sqrt(1 - z * z); dirs.push([c * Math.cos(a), z, c * Math.sin(a)]); }
      for (const o of this.heightsAt(cam, 0, dirs, R / 400)) all.push(o.h);
    }
    all.sort((x, y) => x - y);
    const lo = all[0], hi = all[all.length - 1], span = Math.max(hi - lo, .5);
    w.sea = w.seaType === 3 ? lo - span : all[Math.floor(w.seaFrac * (all.length - 1))];
    this.hmin = lo - span * .4; this.hmax = hi + span * .4;
    if (w.seaType !== 3) { this.hmin = Math.min(this.hmin, w.sea - .5); this.hmax = Math.max(this.hmax, w.sea + .1); }
    this.map = null;
    return { lo, hi };
  }
}

export const vec = { sub, dot, norm, cross };
