// The Panel Toolbar and its six panels, in the original's order: Settings, Time, Log, Movie,
// Uplink Queue, Navigation Console.
import { MIXERS, encodeWorld, decodeWorld } from './world.js';
import { Camera, v3 } from './camera.js';
import { QUALITY } from './render.js';
import { $, h, svg, icon, ib, fmtDist, fmtLat, dial, numField, choice, check, srow, stack, dropdown, dialog } from './kit.js';

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const r4 = a => a.map(v => +v.toFixed(6));

export function buildPanels(ui) {
  const app = ui.app, rq = ui.rq;
  const P = { current: 'nav', selSetting: -1, selJob: null };
  const TOOLS = [['settings', 'Settings', 'Settings'], ['time', 'time', 'Time'], ['log', 'log', 'Log'], ['movie', 'movie', 'Movie'], ['uplink', 'uplink', 'Uplink Queue'], ['nav', 'nav', 'Nav Console']];
  const btns = {};
  const nameEl = h('span', { class: 'pname' });
  $('ptools').replaceChildren(...TOOLS.map(([k, ic, t]) => (btns[k] = ib(ic === 'Settings' ? 'settings' : ic, t, () => show(k), { attrs: { role: 'tab' } }))), h('span', { class: 'grow' }), nameEl);
  function show(k, sel) {
    P.current = k; if (sel) P.selJob = sel;
    for (const [n] of TOOLS) btns[n].setAttribute('aria-selected', n === k);
    nameEl.textContent = TOOLS.find(t => t[0] === k)[2].toUpperCase();
    stopGps();
    $('pbody').replaceChildren(...[PANELS[k]()].flat());
  }
  const refresh = () => show(P.current);

  // ---- Settings: named Hyperspace Mixer combinations -----------------------------------
  const skey = () => 'everyworld-settings-' + app.base.seed;
  const settingsList = () => store.get(skey(), []);
  function settings() {
    const list = settingsList();
    const add = () => { const l = settingsList(); l.push({ name: 'Setting ' + (l.length + 1), desc: 'Enter Description Here...', mix: { ...app.mix } }); store.set(skey(), l); P.selSetting = l.length - 1; refresh(); };
    const del = () => { const l = settingsList(); if (P.selSetting < 0) return; l.splice(P.selSetting, 1); store.set(skey(), l); P.selSetting = -1; refresh(); };
    const rows = list.map((s, i) => h('div', { class: 'item' + (i === P.selSetting ? ' sel' : ''), style: 'grid-template-columns:auto 1fr' },
      h('button', { class: 'numbtn' + (i === P.selSetting ? ' on' : ''), title: 'Use this setting', onclick: () => { Object.assign(app.mix, s.mix); P.selSetting = i; ui.refreshMix(); ui.rebuild(); ui.clearViewStack(); refresh(); } }, String(i + 1)),
      h('div', { class: 'meta' },
        h('input', { value: s.name, 'aria-label': 'Setting name', onchange: e => { const l = settingsList(); l[i].name = e.target.value; store.set(skey(), l); } }),
        h('textarea', { 'aria-label': 'Setting description', onchange: e => { const l = settingsList(); l[i].desc = e.target.value; store.set(skey(), l); } }, s.desc))));
    return [
      h('div', { class: 'row' }, ib('plus', 'Save the current Hyperspace Mixer sliders as a setting', add), ib('minus', 'Delete the selected setting', del, { attrs: { disabled: P.selSetting < 0 ? true : null } }), h('span', { class: 'hint' }, 'Named Hyperspace Mixer combinations for this planet.')),
      list.length ? h('div', { class: 'list' }, ...rows) : h('p', { class: 'note' }, 'No settings yet. Move the Hyperspace sliders, then click + to keep that combination.'),
    ];
  }

  // ---- Time: day and season ------------------------------------------------------------
  function time() {
    const setSun = f => { f(app.base.sun); f(app.current.sun); app.dirty = true; ui.clearViewStack(); };
    const dayT = h('b'), yearT = h('b');
    const year = () => app.base.sun.year ?? (Math.asin(Math.max(-1, Math.min(1, app.base.sun.tilt / .41))) / (Math.PI * 2) * 360 + 360) % 360;
    const showT = () => { dayT.textContent = (app.base.sun.time * 360).toFixed(2); yearT.textContent = year().toFixed(2); };
    const day = dial(112, () => app.base.sun.time * 360, v => { setSun(s => { s.time = v / 360; }); showT(); }, { glyph: 'sun', label: 'Day Time' });
    const yr = dial(112, year, v => { setSun(s => { s.year = v; s.tilt = .41 * Math.sin(v / 360 * Math.PI * 2); }); showT(); }, { glyph: 'moon', label: 'Year Time' });
    showT();
    const spin = check(() => app.spinDay, v => { app.spinDay = v; });
    return [
      h('div', { class: 'dials' },
        h('figure', {}, day, h('figcaption', {}, 'Day Time ', dayT)),
        h('figure', {}, yr, h('figcaption', {}, 'Year Time ', yearT)),
        h('div', { style: 'flex:1;min-width:150px' },
          h('p', { class: 'note' }, 'Drag the sun around the Day Time dial to turn the planet; the sun and moons rise and set. The Year Time dial moves the seasons.'),
          h('label', { class: 'row' }, spin, 'Let the day pass (one turn a minute)'),
          h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Exposure'), numField(() => app.base.exposure, v => { app.base.exposure = v; app.current.exposure = v; app.dirty = true; }, { min: .2, max: 3 })))),
    ];
  }
  let lastSpin = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = (now - lastSpin) / 1000; lastSpin = now;
    if (!app.spinDay || rq.job) return;
    for (const s of [app.base.sun, app.current.sun]) s.time = (s.time + dt / 60) % 1;
    app.dirty = true;
  }, 100);

  // ---- Log: travelogue of places and movies -------------------------------------------
  const readLog = () => store.get('everyworld-log', []);
  function addLog(movie = false) {
    const c = app.cam, ll = ui.latlon(c);
    const e = {
      name: app.current.name + (movie ? ' movie' : ''), desc: 'Enter Description Here...', code: encodeWorld(app),
      pos: c.pos, fwd: c.fwd, camUp: c.camUp, fov: c.fov, time: app.time, sunTime: app.base.sun.time,
      la: ll.la, lo: ll.lo, alt: c.altAboveGround, date: new Date().toISOString(), thumb: ui.thumb(160, 90),
    };
    if (movie && app.movie.frames.length) {
      const f = app.movie.frames, t0 = f[0].t; let last = -1e9; e.movie = [];
      for (const k of f) if (k.t - last >= 66) { e.movie.push({ t: Math.round(k.t - t0), pos: r4(k.pos), fwd: r4(k.fwd), camUp: r4(k.camUp) }); last = k.t; }
      e.trim = app.movie.trim.slice();
    }
    const all = [e, ...readLog()];
    while (!store.set('everyworld-log', all) && all.length > 1) all.pop();
    if (P.current === 'log') refresh();
    return e;
  }
  async function visit(e, playIt = false) {
    if (encodeWorld(app) !== e.code) { const d = decodeWorld(e.code); await ui.load(d.base, d.mix); }
    if (e.sunTime != null) { app.base.sun.time = e.sunTime; app.current.sun.time = e.sunTime; }
    if (e.movie) { app.movie = { rec: false, frames: e.movie.map(f => ({ ...f })), play: null, trim: e.trim ?? [0, 1] }; }
    const c = app.cam; c.flight = null; c.pos = e.pos; c.fwd = e.fwd; c.camUp = e.camUp; if (e.fov) c.fov = e.fov; c.derive();
    app.stilts = app.mode === 'walk' ? c.altAboveGround : null; app.needGround = true; app.dirty = true; ui.placeKnob?.();
    if (playIt && e.movie) app.play();
  }
  function log() {
    const entries = readLog();
    const upd = (i, k, v) => { const l = readLog(); l[i][k] = v; store.set('everyworld-log', l); };
    return [
      h('div', { class: 'row' }, ib('plus', 'Add this view to the Log', () => addLog()), h('span', { class: 'hint' }, 'Places you have found, with notes. Each entry keeps the whole planet, so one log can span many worlds.')),
      entries.length ? h('div', { class: 'list' }, ...entries.map((e, i) => h('div', { class: 'item' },
        h('div', { class: 'thumbwrap' }, h('img', { src: e.thumb, alt: '' }), ib(e.movie ? 'play' : 'jump', e.movie ? 'Play this movie' : 'Jump: go to this place', () => visit(e, true))),
        h('div', { class: 'meta' },
          h('input', { value: e.name, 'aria-label': 'Log entry name', onchange: ev => upd(i, 'name', ev.target.value) }),
          h('textarea', { 'aria-label': 'Log entry notes', onchange: ev => upd(i, 'desc', ev.target.value) }, e.desc ?? ''),
          h('span', { class: 'where' }, `lat ${fmtLat(e.la ?? 0)}  long ${fmtLat(e.lo ?? 0, 'E', 'W')}  ${fmtDist(e.alt ?? 0)} up`)),
        h('button', { class: 'btn red', onclick: () => { const l = readLog(); l.splice(i, 1); store.set('everyworld-log', l); refresh(); } }, 'Delete')))) : h('p', { class: 'note' }, 'The log is empty. Click + to record this place.'),
    ];
  }

  // ---- Movie: record and play back a camera path -------------------------------------------
  function movie() {
    const m = app.movie, d = app.movieDuration, has = d > 0;
    const dur = h('span', { class: 'readings' }, `Duration ${d.toFixed(1)} s   ${m.frames.length} samples`);
    const tl = h('div', { class: 'timeline' }), range = h('div', { class: 'range', title: 'Drag the ends to trim the movie' }), cur = h('div', { class: 'cur' });
    tl.append(range, cur);
    const place = () => { range.style.left = m.trim[0] * 100 + '%'; range.style.width = (m.trim[1] - m.trim[0]) * 100 + '%'; cur.style.left = (has ? (m.cursor ?? 0) / d * 100 : 0) + '%'; };
    tl.addEventListener('pointerdown', e => {
      if (!has) return;
      tl.setPointerCapture(e.pointerId);
      const b = tl.getBoundingClientRect(), t = (e.clientX - b.left) / b.width;
      const which = Math.abs(t - m.trim[0]) < .03 ? 0 : Math.abs(t - m.trim[1]) < .03 ? 1 : -1;
      const mv = ev => { const x = Math.min(Math.max((ev.clientX - b.left) / b.width, 0), 1); if (which === 0) m.trim[0] = Math.min(x, m.trim[1] - .02); else if (which === 1) m.trim[1] = Math.max(x, m.trim[0] + .02); else app.seekMovie(x * d); place(); };
      mv(e);
      const up = () => { tl.removeEventListener('pointermove', mv); tl.removeEventListener('pointerup', up); };
      tl.addEventListener('pointermove', mv); tl.addEventListener('pointerup', up);
    });
    place();
    const camB = ib('camera', 'Movie Camera: add to Log, or process later', () => dropdown(camB, [
      ['Add to Log...', () => { addLog(true); show('log'); }],
      ['Process Later...', () => { const j = rq.addJob('movie', { thumb: ui.thumb(96, 54) }); show('uplink', j); }],
    ]), { attrs: { disabled: has ? null : true } });
    const ctl = (n, t, f, on) => ib(n, t, f, { attrs: { disabled: on ? null : true } });
    const recB = ib('record', m.rec ? 'Stop recording (T)' : 'Record (R)', () => { if (m.rec) app.recordStop(); else app.recordStart(); refresh(); }, { cls: m.rec ? 'on' : '' });
    return [
      h('div', { class: 'row' }, recB,
        ctl('stop', 'Stop', () => { if (m.rec) app.recordStop(); else app.pauseMovie(); refresh(); }, m.rec || m.play),
        ctl('rew', 'Go to start', () => app.seekMovie(m.trim[0] * d), has),
        ctl('back', 'Step back', () => app.seekMovie(Math.max((m.cursor ?? 0) - 1, 0)), has),
        ctl('play', 'Play', () => app.play(), has && !m.rec),
        ctl('fwd', 'Step forward', () => app.seekMovie(Math.min((m.cursor ?? 0) + 1, d)), has),
        ctl('ffw', 'Go to end', () => app.seekMovie(m.trim[1] * d), has),
        h('span', { class: 'sep', style: 'width:8px' }), camB,
        h('button', { class: 'btn', disabled: has ? null : true, onclick: () => { app.movie = { rec: false, frames: [], play: null, trim: [0, 1] }; refresh(); } }, 'Reset')),
      tl, dur,
      h('p', { class: 'note' }, m.rec ? 'Recording. Move around, then click Stop or press T.' : has ? 'Drag the ends of the timeline to trim. The Movie Camera sends it to the Log or the Uplink Queue for rendering.' : 'Click Record (or press R), explore in any mode, then Stop (T). Fly and UFO give the smoothest paths.'),
    ];
  }
  app.on(t => { if (t === 'movie' && P.current === 'movie') refresh(); });
  setInterval(() => { if (P.current === 'movie' && (app.movie.rec || app.movie.play)) { const r = $('pbody').querySelector('.readings'); if (r) r.textContent = `Duration ${app.movieDuration.toFixed(1)} s   ${app.movie.frames.length} samples`; const c = $('pbody').querySelector('.cur'); if (c && app.movieDuration) c.style.left = (app.movie.cursor ?? 0) / app.movieDuration * 100 + '%'; } }, 150);

  // ---- Uplink Queue -----------------------------------------------------------------------
  function uplink() {
    const q = rq.queue, j = P.selJob && q.includes(P.selJob) ? P.selJob : q[0];
    P.selJob = j;
    const list = h('div', { class: 'list' }, ...q.map(x => h('div', { class: 'qitem' + (x === j ? ' sel' : ''), onclick: () => { P.selJob = x; refresh(); } },
      h('span', { class: 'st ' + (x.status === 'done' ? 'done' : x.status === 'running' ? 'running' : x.status === 'queued' ? 'queued' : ''), title: x.status === 'done' ? 'Completed' : x.status === 'queued' ? 'Queued: click to unqueue' : x.status === 'running' ? 'Rendering' : 'Unqueued: click to queue',
        onclick: e => { e.stopPropagation(); if (x.status === 'queued') x.status = 'unqueued'; else if (x.status === 'unqueued') x.status = 'queued'; refresh(); } }),
      h('span', { class: 'id' }, String(x.id)), icon(x.kind === 'movie' ? 'movie' : 'camera'), h('span', {}, x.name + (x.status === 'running' ? `  ${Math.round((x.progress ?? 0) * 100)}%` : '')))));
    const run = rq.qrun;
    const ctrl = h('div', { class: 'row' },
      h('button', { class: 'btn hot', disabled: run || !q.some(x => x.status === 'queued') ? true : null, onclick: () => rq.startQueue() }, 'Start'),
      h('button', { class: 'btn', disabled: run ? null : true, onclick: () => rq.pauseQueue() }, run?.paused ? 'Resume' : 'Pause'),
      h('button', { class: 'btn', disabled: run ? null : true, onclick: () => rq.stopQueue() }, 'Stop'),
      h('button', { class: 'btn', disabled: j ? null : true, onclick: () => { P.selJob = rq.dupJob(j); refresh(); } }, 'Duplicate'),
      h('button', { class: 'btn red', disabled: j && j.status !== 'running' ? null : true, onclick: () => { rq.delJob(j); P.selJob = null; refresh(); } }, 'Delete'));
    let detail = h('p', { class: 'note' }, 'The queue is empty. Use Process Later in the Render Options menu (the arrow beside the camera) or in the Movie panel, then Start. Renders run unattended.');
    if (j) {
      const ed = j.status !== 'running';
      const frames = () => j.kind === 'movie' ? Math.max(1, Math.round(j.duration * (j.trim[1] - j.trim[0]) * j.fps)) : 1;
      const fr = h('span', { class: 'readings' }, String(frames()));
      const rows = [
        srow('Quality', choice(Object.keys(QUALITY).map(k => [k, k]), () => j.quality, v => { j.quality = v; j.shadows = QUALITY[v].shadow > 0; refresh(); })),
        srow('Shadows', check(() => j.shadows, v => { j.shadows = v; })),
        srow('Size', h('span', { class: 'row', style: 'margin:0' }, h('input', { class: 'field', style: 'width:56px;min-width:0', value: j.w, onchange: e => { j.w = Math.max(16, Math.min(8192, +e.target.value || j.w)); } }), 'w',
          h('input', { class: 'field', style: 'width:56px;min-width:0', value: j.h, onchange: e => { j.h = Math.max(16, Math.min(8192, +e.target.value || j.h)); } }), 'h')),
      ];
      if (j.kind === 'movie') rows.push(
        srow('Duration', h('input', { class: 'field', style: 'width:70px', value: j.duration, onchange: e => { j.duration = Math.max(.1, +e.target.value || j.duration); j.to = frames(); refresh(); } })),
        srow('FPS', h('input', { class: 'field', style: 'width:56px', value: j.fps, onchange: e => { j.fps = Math.max(1, Math.min(60, +e.target.value || 30)); j.to = frames(); refresh(); } })),
        srow('Frames', fr),
        srow('From / To', h('span', { class: 'row', style: 'margin:0' }, h('input', { class: 'field', style: 'width:56px', value: j.from, onchange: e => { j.from = Math.max(1, +e.target.value || 1); } }), h('input', { class: 'field', style: 'width:56px', value: j.to, onchange: e => { j.to = Math.max(1, +e.target.value || 1); } }))));
      else rows.push(srow('QTVR', check(() => j.kind === 'qtvr', v => { j.kind = v ? 'qtvr' : 'still'; j.name = j.name.replace(/\.\w+$/, v ? '.zip' : '.png'); if (v) { j.w = j.h = Math.min(j.w, j.h); } refresh(); }), { tip: 'Six 90-degree faces of a cube around the camera' }));
      rows.push(
        srow('Save as', h('input', { class: 'field', value: j.name, onchange: e => { j.name = e.target.value; }, title: j.kind === 'movie' ? '.webm makes a video; .zip gives numbered PNG frames' : j.kind === 'qtvr' ? '.zip holds the six faces' : 'PNG image' })),
        srow('Status', h('span', {}, j.status === 'done' ? 'Completed' : j.status === 'running' ? `Rendering ${Math.round((j.progress ?? 0) * 100)}%` : j.status === 'queued' ? 'Queued' : 'Unqueued', j.error ? h('span', { class: 'hint' }, ' ' + j.error) : '')),
        srow('Render Time', h('span', { class: 'readings' }, j.ms ? new Date(j.ms).toISOString().slice(11, 19) : '--:--:--')));
      if (j.result) rows.push(srow('Result', h('button', { class: 'btn hot', onclick: () => ui.download(j.blob, j.name) }, 'Save to Disk')));
      detail = h('div', {},
        j.thumb ? h('div', { class: 'thumbwrap', style: 'display:inline-block;margin:0 0 4px 0' }, h('img', { src: j.thumb, alt: '', style: 'width:128px;height:72px;border:1px solid #666;display:block' }),
          ib('jump', 'Jump: show this view in the RTR', async () => { if (encodeWorld(app) !== j.code) { const d = decodeWorld(j.code); await ui.load(d.base, d.mix); } app.applyPose(j.pose); app.cam.fov = j.pose.fov; app.cam.derive(); })) : '',
        h('div', { style: ed ? '' : 'pointer-events:none;opacity:.6' }, h('div', { class: 'stack', style: '--x:96px' }, ...rows)));
    }
    return [h('div', { class: 'uplink' }, h('div', {}, list, ctrl), detail)];
  }
  rq.on(t => { if ((t === 'queue' || (t === 'progress' && rq.qrun)) && P.current === 'uplink') { if (t === 'progress') { const s = $('pbody').querySelector('.qitem.sel span:last-child'); const j = rq.queue.find(x => x.status === 'running'); if (s && j) s.textContent = j.name + `  ${Math.round((j.progress ?? 0) * 100)}%`; } else refresh(); } });

  // ---- Navigation Console --------------------------------------------------------------------
  let gpsT = null, gpsImg = null, gpsKey = '';
  const stopGps = () => { clearInterval(gpsT); gpsT = null; };
  function nav() {
    const S = 80, c = S / 2;
    // compass: drag to turn
    const comp = svg('svg', { width: S, height: S, class: 'inst', role: 'img', 'aria-label': 'Compass' });
    const rose = svg('g');
    for (let i = 0; i < 36; i++) { const a = i * 10 * Math.PI / 180, r1 = i % 9 ? c - 6 : c - 12; rose.append(svg('line', { x1: c + Math.sin(a) * r1, y1: c - Math.cos(a) * r1, x2: c + Math.sin(a) * (c - 2), y2: c - Math.cos(a) * (c - 2), stroke: '#999' })); }
    for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const r = a * Math.PI / 180; rose.append(Object.assign(svg('text', { x: c + Math.sin(r) * (c - 20), y: c - Math.cos(r) * (c - 20) + 4, fill: t === 'N' ? '#e8892b' : '#ddd', 'font-size': 11, 'text-anchor': 'middle', 'font-weight': 'bold' }), { textContent: t })); }
    comp.append(rose, svg('path', { d: `M${c},6l5,10h-10z`, fill: '#e0312a' }));
    // artificial horizon: drag up/down pitches, left/right rolls
    const hor = svg('svg', { width: S, height: S, class: 'inst', role: 'img', 'aria-label': 'Artificial horizon' });
    const clip = svg('clipPath', { id: 'hclip' }); clip.append(svg('circle', { cx: c, cy: c, r: c - 1 })); hor.append(clip);
    const hg = svg('g', { 'clip-path': 'url(#hclip)' }), ball = svg('g');
    ball.append(svg('rect', { x: -S, y: -2 * S, width: 3 * S, height: 2 * S, fill: '#3e6ea8' }), svg('rect', { x: -S, y: 0, width: 3 * S, height: 2 * S, fill: '#7a5a34' }), svg('line', { x1: -S, x2: 2 * S, y1: 0, y2: 0, stroke: '#fff', 'stroke-width': 1.5 }));
    for (const p of [-20, -10, 10, 20]) ball.append(svg('line', { x1: c - 12, x2: c + 12, y1: -p * 1.6, y2: -p * 1.6, stroke: '#fff', 'stroke-opacity': .7 }));
    hg.append(ball); hor.append(hg, svg('path', { d: `M${c - 26},${c}h16l4,5l4,-5h16`, stroke: '#ffcc33', 'stroke-width': 2.5, fill: 'none' }));
    const readings = h('div', { class: 'readings' });
    const draw = () => {
      const k = app.cam, ll = ui.latlon(k);
      rose.setAttribute('transform', `rotate(${-k.heading * 180 / Math.PI} ${c} ${c})`);
      ball.setAttribute('transform', `rotate(${-k.rollAngle * 180 / Math.PI} ${c} ${c}) translate(0 ${c + k.pitchAngle * 180 / Math.PI * 1.6})`);
      const horizon = Math.sqrt(Math.max(0, (k.R + k.alt) ** 2 - (k.R + k.ground) ** 2));
      readings.textContent = '';
      readings.append(`Pitch    ${(k.pitchAngle * 180 / Math.PI).toFixed(2).padStart(7)}°\nRoll     ${(k.rollAngle * 180 / Math.PI).toFixed(2).padStart(7)}°\nHeading  ${((k.heading * 180 / Math.PI + 360) % 360).toFixed(1).padStart(7)}°\nLat   ${fmtLat(ll.la)}\nLong  ${fmtLat(ll.lo, 'E', 'W')}\nAltitude ${fmtDist(k.altAboveGround)}\nHorizon  ${fmtDist(horizon)}\n`, h('b', {}, app.moving ? 'Moving' : 'Idle'));
    };
    const dragInst = (el, f) => el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId); let lx = e.clientX, ly = e.clientY;
      const mv = ev => { f(ev.clientX - lx, ev.clientY - ly); lx = ev.clientX; ly = ev.clientY; app.dirty = true; draw(); };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    });
    dragInst(comp, dx => app.cam.look(dx * .01, 0));
    dragInst(hor, (dx, dy) => { app.cam.pitch(dy * .006); app.cam.roll(dx * .008); });
    // GPS globe: a small render of the planet centred on you. Click to go somewhere; right-click jumps.
    const G = 132, gps = h('canvas', { width: G, height: G, class: 'inst', style: 'cursor:crosshair;border-radius:50%', title: 'GPS: click a spot to fly there; right-click to jump there' });
    const gctx = gps.getContext('2d');
    let gpsStyle = 'rendered', gpsPaused = false, gpsBasis = null;
    const renderGps = force => {
      const k = app.cam, key = k.up.map(v => v.toFixed(2)).join() + app.current.seed + gpsStyle;
      if (!force && (key === gpsKey || gpsPaused || app.moving || rq.job)) return paintGps();
      gpsKey = key;
      const north = v3.norm(v3.add([0, 1, 0], k.up, -k.up[1])), right = v3.cross(north, k.up);
      gpsBasis = { up: k.up.slice(), north, right };
      if (gpsStyle === 'wire') { gpsImg = null; return paintGps(); }
      const cam = Object.assign(Object.create(Camera.prototype), k, { flight: null, ground: 0 });
      cam.pos = k.up.map(v => v * k.R * 3.2); cam.fwd = k.up.map(v => -v); cam.camUp = north; cam.fov = 2 * Math.asin(1 / 3.2) * 1.25; cam.derive();
      gpsImg = app.r.snapshot(cam, app.time, G, G, 1, { steps: 40, shadow: 0, cloud: 0, fine: 2 });
      paintGps();
    };
    const paintGps = () => {
      gctx.fillStyle = '#111'; gctx.fillRect(0, 0, G, G);
      if (gpsImg) gctx.drawImage(gpsImg, 0, 0);
      else {
        gctx.strokeStyle = '#8a8aa8'; gctx.lineWidth = 1;
        gctx.beginPath(); gctx.arc(G / 2, G / 2, G / 2 - 6, 0, Math.PI * 2); gctx.stroke();
        for (let i = 1; i < 6; i++) { gctx.beginPath(); gctx.ellipse(G / 2, G / 2, (G / 2 - 6) * Math.cos(i * Math.PI / 12 * 2 - Math.PI / 2 + Math.PI / 2) , G / 2 - 6, 0, 0, Math.PI * 2); gctx.stroke(); }
        for (let i = -2; i <= 2; i++) { const y = G / 2 + i * (G / 2 - 6) / 3; gctx.beginPath(); gctx.moveTo(G / 2 - Math.sqrt(Math.max(0, (G / 2 - 6) ** 2 - (y - G / 2) ** 2)), y); gctx.lineTo(G / 2 + Math.sqrt(Math.max(0, (G / 2 - 6) ** 2 - (y - G / 2) ** 2)), y); gctx.stroke(); }
      }
      gctx.strokeStyle = '#ffcc33'; gctx.lineWidth = 2; gctx.beginPath(); gctx.arc(G / 2, G / 2, 6, 0, Math.PI * 2); gctx.stroke();
    };
    const gpsDir = e => {
      const b = gps.getBoundingClientRect(), R = (G / 2) / 1.25 * (G / b.width);
      const x = (e.clientX - b.left) * G / b.width - G / 2, y = -((e.clientY - b.top) * G / b.height - G / 2);
      const rr = Math.hypot(x, y) / R; if (rr >= 1 || !gpsBasis) return null;
      const z = Math.sqrt(1 - rr * rr), B = gpsBasis;
      return v3.norm(v3.add(v3.add(B.up.map(v => v * z), B.right, x / R), B.north, y / R));
    };
    gps.addEventListener('click', e => { const d = gpsDir(e); if (!d) return; const k = app.cam, alt = Math.max(k.altAboveGround, .01); const [g] = app.r.heightsAt(k, app.time, [d], Math.max(alt * .02, .01)); k.flyTo(d, alt, Math.max(g.h, app.current.sea), null, 2.5); if (app.mode === 'walk') app.stilts = alt; });
    gps.addEventListener('contextmenu', e => { e.preventDefault(); const d = gpsDir(e); if (!d) return; const k = app.cam, alt = Math.max(k.altAboveGround, .01); k.flight = null; k.transport(d.map(v => v * (k.R + k.ground + alt))); app.needGround = true; app.dirty = true; if (app.mode === 'walk') app.stilts = alt; });
    const fov = numField(() => app.cam.fov * 180 / Math.PI, v => { app.cam.fov = v * Math.PI / 180; app.dirty = true; ui.placeKnob?.(); }, { min: 5, max: 120, fmt: v => v.toFixed(2) + '°' });
    draw(); renderGps(true);
    stopGps(); gpsT = setInterval(() => { if (P.current !== 'nav') return stopGps(); draw(); renderGps(false); fov.refresh(); }, 250);
    return [h('div', { class: 'nav' },
      h('div', {}, comp, h('div', { style: 'height:6px' }), hor),
      readings,
      h('div', { style: 'display:flex;flex-direction:column;gap:4px;align-items:flex-start' },
        h('div', { class: 'row', style: 'margin:0' }, h('b', {}, 'GPS'), choice([['rendered', 'Rendered'], ['wire', 'Wireframe']], () => gpsStyle, v => { gpsStyle = v; renderGps(true); }),
          ib('pause', 'Pause the GPS globe', function () { gpsPaused = !gpsPaused; this.classList.toggle('on', gpsPaused); }, { cls: 'small' })),
        gps, h('div', { class: 'row', style: 'margin:0' }, h('b', {}, 'FOV'), fov)))];
  }

  const PANELS = { settings, time, log, movie, uplink, nav };
  show('nav');
  return {
    show, refresh, addLog, settingsList,
    mixChanged() { if (P.selSetting >= 0) { P.selSetting = -1; if (P.current === 'settings') refresh(); } },
    get current() { return P.current; },
  };
}
