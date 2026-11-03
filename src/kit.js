// Small UI kit in the style of the original: control stacks, ruler number fields, orange
// Hyperspace sliders, drop-down menus, draggable editor windows, and line icons.

export const $ = id => document.getElementById(id);
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter(x => x != null && x !== false));
  return e;
}
const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.append(...kids); return e; }

export const fmtDist = km => {
  const a = Math.abs(km);
  return a >= 1000 ? (km / 1000).toFixed(a > 1e4 ? 0 : 1) + ' Mm' : a >= 1 ? km.toFixed(a < 10 ? 2 : 0) + ' km' : a >= .001 ? (km * 1000).toFixed(a < .01 ? 2 : a < .1 ? 1 : 0) + ' m' : (km * 1e5).toFixed(1) + ' cm';
};
export const fmtLat = (la, pos = 'N', neg = 'S') => { const a = Math.abs(la), d = Math.floor(a), m = Math.floor((a - d) * 60); return `${d}° ${String(m).padStart(2, '0')}'${la >= 0 ? pos : neg}`; };

// ---- icons (24 x 24 line drawings, filled with currentColor) ----------------------------
const P = {
  walk: 'M12.5 3.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM10 8.2l3.2-.4 2 3.6 2.6 1-.5 1.4-3.3-1.2-1-1.6-.8 3.2 2.5 2.6.6 5h-1.7l-.6-4.3-2.5-2.2-1.2 2.6-3 3.9-1.3-1 2.8-3.8 1.6-5.6-1.3.6-.8 2.7-1.5-.4 1-3.6z',
  fly: 'M11.2 2.5h1.6l.7 6.7 8 4.3v1.8l-8-2.2-.4 5.1 2.6 1.9v1.4l-3.7-1-3.7 1v-1.4l2.6-1.9-.4-5.1-8 2.2v-1.8l8-4.3z',
  ufo: 'M12 6.5c2.5 0 4.2 1.7 4.4 3.9 3.4.6 5.6 1.7 5.6 3 0 2-4.5 3.4-10 3.4S2 15.4 2 13.4c0-1.3 2.2-2.4 5.6-3 .2-2.2 1.9-3.9 4.4-3.9zM7 17.6l-1.6 2.4h1.6l1.4-2.1zm10 0-1.4.3 1.4 2.1h1.6zM12 18.2l-.7 1.8h1.4z',
  pause: 'M7 5h3.4v14H7zm6.6 0H17v14h-3.4z',
  jump: 'M12 2l3 3.4h-2.1v4.2l3-3 1.5 1.5-3 3h4.2V9l3.4 3-3.4 3v-2.1h-4.2l3 3-1.5 1.5-3-3v4.2H15L12 22l-3-3.4h2.1v-4.2l-3 3-1.5-1.5 3-3H5.4V15L2 12l3.4-3v2.1h4.2l-3-3 1.5-1.5 3 3V5.4H9z',
  crop: 'M6 2h2v14h14v2h-4v4h-2v-4H6zM2 6h4v2H2zm8 0h8v8h-2V8h-6z',
  camera: 'M8.5 5h7l1.5 2.2H21V19H3V7.2h4zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  caret: 'M7 10h10l-5 6z',
  die2: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h14V5zm3.2 1.8a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zm7.6 7.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
  die6: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h14V5zm3 1.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm8 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm-8 4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm8 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm-8 4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8zm8 0a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  minus: 'M4 11h16v2H4z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z',
  settings: 'M4 5h10v2H4zm12-1h2v4h-2zM4 11h4v2H4zm6-1h2v4h-2zm4 1h6v2h-6zM4 17h12v2H4zm14-1h2v4h-2z',
  time: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 3h2v5.2l3.6 2.1-1 1.7-4.6-2.7z',
  log: 'M5 3h11l3 3v15H5zm2 2v14h10V7h-2V5zm2 4h6v1.6H9zm0 3h6v1.6H9zm0 3h4v1.6H9z',
  movie: 'M3 6h13v12H3zm2 2v8h9V8zm12 2.5 4-2.5v8l-4-2.5z',
  uplink: 'M5.6 3.4a9 9 0 0 0 0 12.7l1.4-1.4a7 7 0 0 1 0-9.9zm12.8 0-1.4 1.4a7 7 0 0 1 0 9.9l1.4 1.4a9 9 0 0 0 0-12.7zM8.5 6.3a5 5 0 0 0 0 7l1.4-1.4a3 3 0 0 1 0-4.2zm7 0-1.4 1.4a3 3 0 0 1 0 4.2l1.4 1.4a5 5 0 0 0 0-7zM12 8.3a1.5 1.5 0 0 1 1 2.6L15 21h-2l-1-5-1 5H9l2-10.1a1.5 1.5 0 0 1 1-2.6z',
  nav: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm3.5 4.5-2 5-5 2 2-5zm-3.5 2.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
  record: 'M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14z',
  stop: 'M6 6h12v12H6z',
  play: 'M7 5v14l12-7z',
  rew: 'M5 5h2v14H5zm3 7 10-7v14z',
  ffw: 'M17 5h2v14h-2zm-1 7L6 19V5z',
  back: 'M11 12l8-6v12zm-7 0 7-6v12z',
  fwd: 'M13 12 5 6v12zm7 0-7-6v12z',
  save: 'M4 3h13l3 3v15H4zm3 2v5h9V5zm5 9a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  stars: 'M12 2l1.8 5.5H19l-4.4 3.3 1.7 5.4L12 13l-4.3 3.2 1.7-5.4L5 7.5h5.2zM4 17l.6 1.6L6 19l-1.4.6L4 21l-.6-1.4L2 19l1.4-.4zm16-2 .5 1.3 1.5.5-1.5.5L20 19l-.5-1.2-1.5-.5 1.5-.5z',
  sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1h2v4h-2zm0 18h2v4h-2zM1 11h4v2H1zm18 0h4v2h-4zM3.5 5l1.5-1.5 2.8 2.8-1.5 1.5zm12.7 12.7 1.5-1.5 2.8 2.8-1.5 1.5zM3.5 19l2.8-2.8 1.5 1.5L5 20.5zM16.2 6.3 19 3.5 20.5 5l-2.8 2.8z',
  moon: 'M14.5 3a9 9 0 1 0 6.5 13.5A7.5 7.5 0 0 1 14.5 3z',
  sky: 'M7 18a5 5 0 0 1-.6-10 6 6 0 0 1 11.4 1.5A4.3 4.3 0 0 1 17.5 18z',
  land: 'M2 19l6.5-10 3.5 5 2.5-3.5L22 19zm7-4 1 1.5 1.5-2L9 11z',
  material: 'M12 3a9 9 0 0 1 0 18c-1.4 0-2-1-1.6-2.1.5-1.4-.4-2.4-1.9-2.4H6.2A3.2 3.2 0 0 1 3 13.4 9.4 9.4 0 0 1 12 3zM7.5 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm3-3.3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm4.5.8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm2 4.2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  water: 'M2 9c2.5 0 2.5-1.6 5-1.6S9.5 9 12 9s2.5-1.6 5-1.6S19.5 9 22 9v2c-2.5 0-2.5-1.6-5-1.6S14.5 11 12 11 9.5 9.4 7 9.4 4.5 11 2 11zm0 5c2.5 0 2.5-1.6 5-1.6s2.5 1.6 5 1.6 2.5-1.6 5-1.6 2.5 1.6 5 1.6v2c-2.5 0-2.5-1.6-5-1.6S14.5 16 12 16s-2.5-1.6-5-1.6S4.5 16 2 16z',
  rings: 'M12 6.5a5.5 5.5 0 0 1 5.4 4.4c3 .7 4.9 1.8 4.6 3-.4 1.6-5 2.3-10.5 1.6S1.7 13.4 2 11.8c.2-.9 1.8-1.5 4.2-1.7A5.5 5.5 0 0 1 12 6.5zM6.6 12.1c-1.6.2-2.5.5-2.5.8 0 .5 3.3 1.4 7.6 1.8 4.3.5 8.1.2 8.2-.4 0-.3-1-.8-2.5-1.1a5.5 5.5 0 0 1-10.8-1.1z',
  atmo: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2a7 7 0 0 0-6.9 6h13.8A7 7 0 0 0 12 5zM5.3 13a7 7 0 0 0 13.4 0z',
  bomb: 'M14.5 4.5 16 3l2 .5.5 2-1.5 1.5-.9-.9-1.4 1.4a7 7 0 1 1-1.4-1.4l1.4-1.4zM10 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-2 2.5a2 2 0 0 1 2-1v1.5a.6.6 0 0 0-.6.6H8z',
  graph: 'M4 3h7v5H4zm9 0h7v5h-7zM8 13h8v5H8zM7 8h1.6v2.5h3.4V13h-1.6v-1H7zm9.4 0H18v4h-4v1h-1.6v-2.6H16.4z',
  info: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 8v7h2v-7zm0-4v2h2V6z',
  globe: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.5 2.2A8 8 0 0 0 4 11h3.1a15 15 0 0 1 3.4-6.8zm3 0a15 15 0 0 1 3.4 6.8H20a8 8 0 0 0-6.5-6.8zM9.2 11h5.6A13 13 0 0 0 12 5a13 13 0 0 0-2.8 6zM4 13a8 8 0 0 0 6.5 6.8A15 15 0 0 1 7.1 13zm5.2 0A13 13 0 0 0 12 19a13 13 0 0 0 2.8-6zm7.7 0a15 15 0 0 1-3.4 6.8A8 8 0 0 0 20 13z',
  lock: 'M8 10V7a4 4 0 1 1 8 0v3h2v11H6V10zm2 0h4V7a2 2 0 1 0-4 0z',
};
export const icon = name => { const s = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }); s.append(svg('path', { d: P[name] })); return s; };
export const ib = (name, title, onclick, extra = {}) => h('button', { class: 'ib' + (extra.cls ? ' ' + extra.cls : ''), title, 'aria-label': title, onclick, ...extra.attrs }, icon(name));

// ---- control stack ------------------------------------------------------
// A number shown as text above a ruler; drag the ruler (or type) to change it.
export function numField(get, set, { min = 0, max = 1, log = false, step = 0, fmt, unit = '' } = {}) {
  const toS = v => log ? Math.log(Math.max(v, 1e-12)) : v, fromS = s => log ? Math.exp(s) : s;
  const show = v => fmt ? fmt(v) : (Math.abs(v) >= 1000 || step >= 1 ? (+v).toFixed(step >= 1 ? 0 : 1) : (+v).toFixed(4)) + unit;
  const inp = h('input', { type: 'text', spellcheck: 'false', value: show(get()) });
  const knob = h('i');
  const ruler = h('div', { class: 'ruler', tabindex: 0, role: 'slider', 'aria-valuemin': min, 'aria-valuemax': max });
  ruler.append(knob);
  const place = () => { const t = (toS(get()) - toS(min)) / (toS(max) - toS(min)); knob.style.left = Math.min(Math.max(t, 0), 1) * 100 + '%'; ruler.setAttribute('aria-valuenow', get()); };
  const put = v => { v = Math.min(Math.max(v, min), max); if (step) v = Math.round(v / step) * step; set(v); inp.value = show(v); place(); };
  inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) put(v); else inp.value = show(get()); });
  ruler.addEventListener('pointerdown', e => {
    ruler.setPointerCapture(e.pointerId);
    const b = ruler.getBoundingClientRect();
    const at = ev => put(fromS(toS(min) + (toS(max) - toS(min)) * Math.min(Math.max((ev.clientX - b.left) / b.width, 0), 1)));
    at(e);
    const mv = ev => at(ev), up = () => { ruler.removeEventListener('pointermove', mv); ruler.removeEventListener('pointerup', up); };
    ruler.addEventListener('pointermove', mv); ruler.addEventListener('pointerup', up);
  });
  ruler.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return; e.preventDefault();
    put(fromS(toS(get()) + d * (toS(max) - toS(min)) / 100));
  });
  place();
  const el = h('div', { class: 'num' }, inp, ruler);
  el.refresh = () => { inp.value = show(get()); place(); };
  return el;
}
export const field = (get, set, attrs = {}) => h('input', { class: 'field', type: 'text', value: get(), spellcheck: 'false', onchange: e => set(e.target.value), ...attrs });
export function choice(options, get, set) {
  const s = h('select', { class: 'field', onchange: e => set(e.target.value) });
  for (const [v, t] of options) { const o = h('option', { value: v }, t); if (String(v) === String(get())) o.selected = true; s.append(o); }
  return s;
}
export const check = (get, set) => h('input', { type: 'checkbox', class: 'check', checked: get() ? true : null, onchange: e => set(e.target.checked) });
export const srow = (label, control, { anim = false, tip } = {}) => h('div', { class: 'srow' + (anim ? ' anim' : ''), title: tip ?? null }, h('label', {}, label), h('div', { class: 'v' }, control));
export const stack = (...rows) => h('div', { class: 'stack' }, h('div', { class: 'srow head' }, h('span', { class: 'k' }), h('div', { class: 'v' })), ...rows);

// Hyperspace slider: orange bar with a white dot at the tip.
export function oslider(get, set, { min = -1, max = 1, label = '' } = {}) {
  const fill = h('div', { class: 'fill' }), tip = h('div', { class: 'tip' });
  const el = h('div', { class: 'oslider', tabindex: 0, role: 'slider', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max }, fill, tip);
  const place = () => { const t = (get() - min) / (max - min); fill.style.width = t * 100 + '%'; tip.style.left = t * 100 + '%'; el.setAttribute('aria-valuenow', get().toFixed(2)); };
  const put = v => { set(Math.min(Math.max(v, min), max)); place(); };
  el.addEventListener('pointerdown', e => {
    el.setPointerCapture(e.pointerId);
    const b = el.getBoundingClientRect(), at = ev => put(min + (max - min) * (ev.clientX - b.left) / b.width);
    at(e);
    const mv = ev => at(ev), up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  });
  el.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (d) { e.preventDefault(); put(get() + d * (max - min) / 50); }
  });
  place(); el.refresh = place;
  return el;
}

// ---- menus ----------------------------------------------------------------
let openMenu = null;
const closeMenus = () => { if (openMenu) { openMenu(); openMenu = null; } };
addEventListener('pointerdown', e => { if (!e.target.closest('.menu,.ddmenu')) closeMenus(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
// items: [label, fn, {key, disabled, checked}] or '-'
function menuList(items) {
  const ul = h('ul', { role: 'menu' });
  for (const it of items) {
    if (it === '-') { ul.append(h('li', { class: 'sep', role: 'separator' })); continue; }
    const [label, fn, o = {}] = it;
    ul.append(h('li', { role: 'none' }, h('button', { role: 'menuitem', disabled: o.disabled ? true : null, onclick: () => { closeMenus(); fn(); } },
      h('span', {}, o.checked != null ? h('span', { class: 'chk' }, o.checked ? '✓' : '') : null, label), o.key ? h('kbd', {}, o.key) : null)));
  }
  return ul;
}
export function menubar(root, menus) {
  root.replaceChildren();
  for (const [name, items] of menus) {
    const wrap = h('div', { class: 'menu' }), btn = h('button', { 'aria-haspopup': 'true', 'aria-expanded': 'false' }, name);
    const open = () => {
      closeMenus();
      const ul = menuList(typeof items === 'function' ? items() : items); wrap.append(ul); btn.setAttribute('aria-expanded', 'true');
      openMenu = () => { ul.remove(); btn.setAttribute('aria-expanded', 'false'); };
      ul.querySelector('button')?.focus({ preventScroll: true });
    };
    btn.onclick = () => (btn.getAttribute('aria-expanded') === 'true' ? closeMenus() : open());
    btn.onpointerenter = () => { if (openMenu && btn.getAttribute('aria-expanded') !== 'true') open(); };
    wrap.append(btn); root.append(wrap);
  }
}
export function dropdown(anchor, items) {
  closeMenus();
  const ul = menuList(items); ul.className = 'ddmenu';
  document.body.append(ul);
  const b = anchor.getBoundingClientRect(), H = ul.offsetHeight;
  ul.style.left = Math.min(b.left, innerWidth - ul.offsetWidth - 4) + 'px';
  ul.style.top = (b.top - H - 2 > 0 ? b.top - H - 2 : b.bottom + 2) + 'px';
  openMenu = () => ul.remove();
}

// ---- floating editor windows ------------------------------------------------
const wins = new Map(); let z = 1, cascade = 0;
export function openWindow(id, title, iconName, build, { w = 420, h: hh = 360, onClose } = {}) {
  if (wins.has(id)) { const e = wins.get(id); e.style.zIndex = ++z; e.refresh(); return e; }
  const body = h('div', { class: 'body' });
  const el = h('div', { class: 'win', role: 'dialog', 'aria-label': title });
  const close = () => { el.remove(); wins.delete(id); onClose?.(); };
  const tb = h('div', { class: 'tb' }, h('b', {}, title),
    h('button', { title: 'Minimise', 'aria-label': 'Minimise', onclick: () => el.classList.toggle('min') }, '▁'),
    h('button', { title: 'Close', 'aria-label': 'Close', onclick: close }, '✕'));
  const strip = h('div', { class: 'strip' }, h('span', { class: 'tabk' }, iconName ? icon(iconName) : '', ' '), h('span', { class: 'grow' }));
  strip.querySelector('svg')?.setAttribute('style', 'width:16px;height:16px;fill:#ddd');
  el.append(tb, strip, body);
  const W = Math.min(w, innerWidth - 20), H = Math.min(hh, innerHeight - 60);
  el.style.width = W + 'px'; el.style.height = H + 'px';
  el.style.left = Math.max(8, Math.min(80 + cascade * 26, innerWidth - W - 8)) + 'px';
  el.style.top = Math.max(30, Math.min(40 + cascade * 26, innerHeight - H - 8)) + 'px';
  cascade = (cascade + 1) % 8; el.style.zIndex = ++z;
  el.addEventListener('pointerdown', () => { el.style.zIndex = ++z; });
  tb.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    tb.setPointerCapture(e.pointerId);
    const x0 = e.clientX - el.offsetLeft, y0 = e.clientY - el.offsetTop;
    const mv = ev => { el.style.left = Math.min(Math.max(ev.clientX - x0, -W + 60), innerWidth - 60) + 'px'; el.style.top = Math.min(Math.max(ev.clientY - y0, 22), innerHeight - 30) + 'px'; };
    const up = () => { tb.removeEventListener('pointermove', mv); tb.removeEventListener('pointerup', up); };
    tb.addEventListener('pointermove', mv); tb.addEventListener('pointerup', up);
  });
  el.refresh = () => body.replaceChildren(...[build(el)].flat());
  el.close = close; el.strip = strip; el.body = body;
  $('windows').append(el); wins.set(id, el);
  el.refresh();
  return el;
}
export const refreshWindows = () => { for (const w of wins.values()) w.refresh(); };
export const closeWindow = id => wins.get(id)?.close();

// ---- modal dialog ------------------------------------------------------------
export function dialog(title, body, buttons = [['Close', null]], { wide = false } = {}) {
  const m = $('modal');
  const close = () => { m.hidden = true; m.replaceChildren(); };
  const foot = h('div', { class: 'foot' }, ...buttons.map(([t, fn, hot]) => h('button', { class: 'btn' + (hot ? ' hot' : ''), onclick: async () => { if (fn) { const keep = await fn(); if (keep === false) return; } close(); } }, t)));
  const box = h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? 'width:min(940px,100%)' : 'width:min(560px,100%)' },
    h('div', { class: 'win' + '', style: 'position:static;box-shadow:none;border:0;min-height:0;resize:none;display:contents' }),
    h('div', { class: 'tb', style: 'height:20px;display:flex;align-items:center;padding:0 8px;background:linear-gradient(#e2e2e2,#acacac);color:#000;border-bottom:1px solid #222' }, h('b', { style: 'letter-spacing:.14em;text-transform:uppercase;font-size:10.5px' }, title)),
    h('div', { class: 'body' }, body), foot);
  m.replaceChildren(box); m.hidden = false;
  m.onclick = e => { if (e.target === m) close(); };
  box.close = close;
  return box;
}

// ---- dial: drag around a circle (Time panel) ----------------------------------
export function dial(size, get, set, { glyph = 'sun', label = '' } = {}) {
  const c = size / 2, R = c - 12;
  const s = svg('svg', { width: size, height: size, class: 'dial', role: 'slider', tabindex: 0, 'aria-label': label });
  s.append(svg('circle', { cx: c, cy: c, r: R, fill: '#262626', stroke: '#8d8d8d', 'stroke-width': 1.5 }));
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r1 = i % 6 ? R - 4 : R - 8; s.append(svg('line', { x1: c + Math.sin(a) * r1, y1: c - Math.cos(a) * r1, x2: c + Math.sin(a) * R, y2: c - Math.cos(a) * R, stroke: '#888' })); }
  const hand = svg('line', { x1: c, y1: c, stroke: '#e8892b', 'stroke-width': 2 });
  const g = svg('g'); g.append(svg('circle', { r: 8, fill: glyph === 'sun' ? '#ffd27a' : '#cfd8ff', stroke: '#000' }));
  s.append(hand, g);
  const place = () => { const a = get() / 360 * Math.PI * 2, x = c + Math.sin(a) * R, y = c - Math.cos(a) * R; hand.setAttribute('x2', x); hand.setAttribute('y2', y); g.setAttribute('transform', `translate(${x},${y})`); s.setAttribute('aria-valuenow', get().toFixed(1)); };
  s.addEventListener('pointerdown', e => {
    s.setPointerCapture(e.pointerId);
    const b = s.getBoundingClientRect();
    const at = ev => { let a = Math.atan2(ev.clientX - b.left - c, -(ev.clientY - b.top - c)) / (Math.PI * 2) * 360; if (a < 0) a += 360; set(a); place(); };
    at(e); const mv = ev => at(ev), up = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', up); };
    s.addEventListener('pointermove', mv); s.addEventListener('pointerup', up);
  });
  s.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 2 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -2 : 0; if (d) { e.preventDefault(); set((get() + d + 360) % 360); place(); } });
  place(); s.refresh = place;
  return s;
}
