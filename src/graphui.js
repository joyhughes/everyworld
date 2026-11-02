import { NODE_TYPES } from './graph.js';

const W = 170, H = 48;
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.append(...kids); return e; };
const $ = id => document.getElementById(id);

export function buildGraph(app, rebuild, h) {
  let sel = null, wiring = null, uid = 0;
  const g = () => app.base.terrain;
  const inPos = (n, i) => [n.x, n.y + 14 + i * 13];
  const outPos = n => [n.x + W, n.y + H / 2];
  const path = (a, b) => { const d = Math.max(40, Math.abs(b[0] - a[0]) * .5); return `M${a[0]},${a[1]}C${a[0] + d},${a[1]} ${b[0] - d},${b[1]} ${b[0]},${b[1]}`; };

  function message(m, err) { $('gmsg').textContent = m; $('gmsg').classList.toggle('err', !!err); }
  function draw() {
    const svg = $('gsvg'), G = g();
    const maxX = Math.max(...G.nodes.map(n => n.x)) + W + 60, maxY = Math.max(...G.nodes.map(n => n.y)) + H + 40;
    svg.setAttribute('width', maxX); svg.setAttribute('height', maxY);
    const byId = new Map(G.nodes.map(n => [n.id, n])), kids = [];
    for (const n of G.nodes) NODE_TYPES[n.type].inputs.forEach((k, i) => {
      const from = byId.get(n.in?.[k]); if (from) kids.push(s('path', { class: 'wire', d: path(outPos(from), inPos(n, i)) }));
    });
    for (const n of G.nodes) {
      const T = NODE_TYPES[n.type], isOut = n.id === G.out;
      const box = s('g', { class: 'gn' + (sel === n.id ? ' sel' : ''), tabindex: 0 });
      box.append(s('rect', { x: n.x, y: n.y, width: W, height: H, rx: 4 }));
      const title = s('text', { x: n.x + 14, y: n.y + 20 }); title.textContent = n.type === 'fractal' ? n.params.kind : T.label;
      const sub = s('text', { class: 'k', x: n.x + 14, y: n.y + 37 }); sub.textContent = n.id + (isOut ? ' → height' : '');
      box.append(title, sub);
      box.addEventListener('pointerdown', e => { e.stopPropagation(); sel = n.id; params(); startDrag(e, n); });
      box.addEventListener('keydown', e => { if (e.key === 'Enter') { sel = n.id; params(); draw(); } });
      kids.push(box);
      T.inputs.forEach((k, i) => {
        const [x, y] = inPos(n, i), c = s('circle', { class: 'port', cx: x, cy: y, r: 5.5 });
        c.append(s('title')); c.firstChild.textContent = 'Input ' + k;
        c.addEventListener('pointerup', e => { e.stopPropagation(); if (wiring) connect(wiring, n, k); });
        c.addEventListener('pointerdown', e => { e.stopPropagation(); if (wiring) connect(wiring, n, k); else if (n.in?.[k]) { delete n.in[k]; structural(); } });
        kids.push(c);
      });
      const [x, y] = outPos(n), o = s('circle', { class: 'port out', cx: x, cy: y, r: 6 });
      o.append(s('title')); o.firstChild.textContent = 'Output. Click, then click an input to wire it.';
      o.addEventListener('pointerdown', e => { e.stopPropagation(); wiring = n.id; message(`Choose an input for ${n.id}.`); });
      kids.push(o);
    }
    svg.replaceChildren(...kids);
  }
  function connect(from, n, k) {
    n.in ??= {}; n.in[k] = from; wiring = null; message(''); structural();
  }
  async function structural() { draw(); await rebuild(); }
  function startDrag(e, n) {
    const x0 = e.clientX, y0 = e.clientY, nx = n.x, ny = n.y;
    const mv = ev => { n.x = Math.max(0, nx + ev.clientX - x0); n.y = Math.max(0, ny + ev.clientY - y0); draw(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    draw();
  }
  function params() {
    const box = $('gparams'), n = g().nodes.find(x => x.id === sel);
    if (!n) { box.replaceChildren(h('p', {}, 'Select a node to edit it. Click an output, then an input, to wire. Click a wired input to cut it.')); return; }
    const T = NODE_TYPES[n.type], kids = [h('h3', {}, T.label + ': ' + n.id)];
    for (const [k, c] of Object.entries(T.params)) {
      if (c.type === 'enum') {
        const se = h('select', { 'aria-label': k, onchange: e => { n.params[k] = e.target.value; draw(); rebuild(); } }, ...c.options.map(o => { const op = h('option', {}, o); if (o === n.params[k]) op.selected = true; return op; }));
        kids.push(h('div', { class: 'row' }, h('span', {}, k), se)); continue;
      }
      const toS = v => c.log ? Math.log(v) : v, fromS = v => c.log ? Math.exp(v) : v;
      const out = h('output', {}, (+n.params[k]).toPrecision(3));
      const r = h('input', { type: 'range', 'aria-label': k, min: toS(c.min), max: toS(c.max), step: c.step ?? (toS(c.max) - toS(c.min)) / 300, value: toS(n.params[k]), oninput: () => { n.params[k] = fromS(+r.value); out.textContent = (+n.params[k]).toPrecision(3); rebuild(); } });
      kids.push(h('div', { class: 'row', title: c.tip ?? '' }, h('span', {}, k), out, r));
    }
    kids.push(h('div', { class: 'btns' }, h('button', { onclick: () => { g().out = n.id; structural(); } }, 'Use as output')));
    box.replaceChildren(...kids);
  }
  $('gadd').append(h('option', { value: '' }, 'Add a node'), ...Object.entries(NODE_TYPES).filter(([k]) => k !== 'bomb').map(([k, v]) => h('option', { value: k }, v.label)));
  $('gadd').onchange = e => {
    const t = e.target.value; if (!t) return; e.target.value = '';
    const G = g(); let id; do { id = t + ++uid; } while (G.nodes.some(n => n.id === id));
    G.nodes.push({ id, type: t, x: 60 + $('gcanvas').scrollLeft, y: 30 + $('gcanvas').scrollTop, params: { ...NODE_TYPES[t].make }, in: {} });
    sel = id; params(); structural();
  };
  $('gdel').onclick = () => {
    const G = g(); if (!sel) return;
    if (sel === G.out) { message('This node is the output. Pick another output first.', true); return; }
    G.nodes = G.nodes.filter(n => n.id !== sel);
    for (const n of G.nodes) for (const k in n.in ?? {}) if (n.in[k] === sel) delete n.in[k];
    sel = null; params(); structural();
  };
  $('gclose').onclick = () => { $('graph').hidden = true; };
  return { open() { $('graph').hidden = false; sel = null; params(); draw(); message(''); }, message };
}
