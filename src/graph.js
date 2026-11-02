// Terrain function graph: nodes compile to GLSL on dual numbers (vec4: gradient xyz, value w),
// so every height evaluation also yields an exact normal. Parameters live in a uniform array,
// so dragging a slider never recompiles; only rewiring does.

export const NODE_TYPES = {
  fractal: { label: 'Fractal', inputs: [], params: {
    kind: { type: 'enum', options: ['fbm', 'turbulence', 'hetero', 'hybrid', 'ridged'], tip: 'Musgrave basis' },
    freq: { min: .2, max: 4000, log: true, tip: 'Features per planet radius' },
    oct: { min: 1, max: 30, step: 1, tip: 'Most octaves used near the camera' },
    H: { min: .2, max: 1.4 }, lac: { min: 1.6, max: 3.2 },
    offset: { min: 0, max: 1.6 }, gain: { min: 0, max: 4 },
    erosion: { min: 0, max: 2 }, warp: { min: 0, max: 1 }, warpFreq: { min: .3, max: 30, log: true },
  }, make: { kind: 'hybrid', freq: 8, oct: 16, H: .8, lac: 2, offset: .75, gain: 1, erosion: 0, warp: 0, warpFreq: 2 } },
  craters: { label: 'Craters', inputs: [], params: {
    freq: { min: 1, max: 200, log: true }, oct: { min: 1, max: 12, step: 1 },
    depth: { min: 0, max: 3 }, rim: { min: 0, max: 1 }, lac: { min: 1.6, max: 3 },
  }, make: { freq: 9, oct: 7, depth: 1, rim: .3, lac: 2.1 } },
  rock: { label: 'Boulders', inputs: [], params: {
    freq: { min: 100, max: 2e6, log: true }, oct: { min: 1, max: 6, step: 1 }, size: { min: 0, max: 2 }, lac: { min: 1.6, max: 3 },
  }, make: { freq: 3e4, oct: 3, size: 1, lac: 2.3 } },
  scale: { label: 'Scale + bias', inputs: ['a'], params: { scale: { min: -10, max: 10 }, bias: { min: -10, max: 10 } }, make: { scale: 1, bias: 0 } },
  add: { label: 'Add', inputs: ['a', 'b'], params: {}, make: {} },
  mul: { label: 'Multiply', inputs: ['a', 'b'], params: {}, make: {} },
  mix: { label: 'Weighted sum', inputs: ['a', 'b', 'c'], params: { a: { min: -12, max: 12 }, b: { min: -12, max: 12 }, c: { min: -12, max: 12 } }, make: { a: 1, b: 1, c: 0 } },
  blend: { label: 'Blend', inputs: ['a', 'b', 't'], params: {}, make: {} },
  smooth: { label: 'Smoothstep', inputs: ['a'], params: { lo: { min: -2, max: 2 }, hi: { min: -2, max: 2 } }, make: { lo: 0, hi: 1 } },
  power: { label: 'Power', inputs: ['a'], params: { exp: { min: .2, max: 5 } }, make: { exp: 2 } },
  abs: { label: 'Absolute', inputs: ['a'], params: {}, make: {} },
  max: { label: 'Maximum', inputs: ['a', 'b'], params: {}, make: {} },
  min: { label: 'Minimum', inputs: ['a', 'b'], params: {}, make: {} },
  terrace: { label: 'Terrace', inputs: ['a'], params: { steps: { min: 1, max: 24, step: 1 }, sharp: { min: 0, max: 1 } }, make: { steps: 6, sharp: .7 } },
  bomb: { label: 'Parameter bomb', inputs: ['a', 'b'], params: {}, make: {} },
};

const KIND = { fbm: 0, turbulence: 1, hetero: 2, hybrid: 3, ridged: 4 };

function order(g) {
  const byId = new Map(g.nodes.map(n => [n.id, n])), seen = new Map(), out = [];
  const visit = id => {
    const n = byId.get(id);
    if (!n) throw new Error(`The graph is missing a node named ${id}. Connect that input or delete the wire.`);
    const st = seen.get(id);
    if (st === 2) return;
    if (st === 1) throw new Error('The graph has a loop. Remove one wire so values flow one way.');
    seen.set(id, 1);
    for (const key of NODE_TYPES[n.type].inputs) if (n.in?.[key]) visit(n.in[key]);
    seen.set(id, 2); out.push(n);
  };
  visit(g.out);
  return out;
}

// Slot layout: warp slots, then each fractal's octaves. Returns GLSL plus a binder.
export function compileGraph(g, firstSlot, maxSlot) {
  const nodes = order(g);
  const lines = [], P = [], fills = [];
  let slot = firstSlot;
  const pslot = n => { const i = P.length; P.push(n); return i; };
  const ref = (n, k) => n.in?.[k] ? `n_${n.in[k]}` : 'vec4(0.)';
  for (const n of nodes) {
    const t = n.type, p = n.params, v = `n_${n.id}`;
    if (t === 'fractal') {
      const oct = Math.round(p.oct), warpSlots = p.warp > 0 ? 6 : 0;
      const s = slot; slot += oct + 6;
      const i = pslot(n); pslot(null); pslot(null);
      fills.push({ s, oct, freq: () => n.params.freq, lac: () => n.params.lac, id: n.id, warpAt: s + oct, warpFreq: () => n.params.warpFreq });
      lines.push(`vec4 ${v}=fractal(${i},d,lod);`);
      void warpSlots;
    } else if (t === 'craters' || t === 'rock') {
      const oct = Math.round(p.oct), s = slot; slot += oct;
      const i = pslot(n); pslot(null);
      fills.push({ s, oct, freq: () => n.params.freq, lac: () => n.params.lac, id: n.id });
      lines.push(`vec4 ${v}=${t === 'craters' ? 'craters' : 'boulders'}(${i},d,lod);`);
    } else if (t === 'scale') { const i = pslot(n); lines.push(`vec4 ${v}=${ref(n, 'a')}*uP[${i}].x;${v}.w+=uP[${i}].y;`); }
    else if (t === 'add') lines.push(`vec4 ${v}=${ref(n, 'a')}+${ref(n, 'b')};`);
    else if (t === 'mul') lines.push(`vec4 ${v}=dmul(${ref(n, 'a')},${ref(n, 'b')});`);
    else if (t === 'mix') { const i = pslot(n); lines.push(`vec4 ${v}=${ref(n, 'a')}*uP[${i}].x+${ref(n, 'b')}*uP[${i}].y+${ref(n, 'c')}*uP[${i}].z;`); }
    else if (t === 'blend') lines.push(`vec4 ${v}=dblend(${ref(n, 'a')},${ref(n, 'b')},${ref(n, 't')});`);
    else if (t === 'smooth') { const i = pslot(n); lines.push(`vec4 ${v}=dsmooth(${ref(n, 'a')},uP[${i}].x,uP[${i}].y);`); }
    else if (t === 'power') { const i = pslot(n); lines.push(`vec4 ${v}=dpow(${ref(n, 'a')},uP[${i}].x);`); }
    else if (t === 'abs') lines.push(`vec4 ${v}=${ref(n, 'a')}*(${ref(n, 'a')}.w<0.?-1.:1.);`);
    else if (t === 'max') lines.push(`vec4 ${v}=${ref(n, 'a')}.w>${ref(n, 'b')}.w?${ref(n, 'a')}:${ref(n, 'b')};`);
    else if (t === 'min') lines.push(`vec4 ${v}=${ref(n, 'a')}.w<${ref(n, 'b')}.w?${ref(n, 'a')}:${ref(n, 'b')};`);
    else if (t === 'terrace') { const i = pslot(n); lines.push(`vec4 ${v}=dterrace(${ref(n, 'a')},uP[${i}].x,uP[${i}].y);`); }
    else if (t === 'bomb') lines.push(`vec4 ${v}=dblend(${ref(n, 'a')},${ref(n, 'b')},bombMask(d));`);
    else throw new Error(`Unknown node type ${t}`);
  }
  if (slot > maxSlot) throw new Error(`The graph needs ${slot - firstSlot} octave slots and only ${maxSlot - firstSlot} exist. Reduce octaves on a fractal.`);
  if (P.length * 1 > 96) throw new Error('The graph is too large. Remove a few nodes.');
  const glsl = `vec4 terrain(vec3 d,float lod){\n${lines.join('\n')}\nreturn n_${g.out};}`;
  const key = glsl;

  // Writes parameters into uP. Called whenever a slider moves; no recompile.
  function writeParams(arr, graph) {
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    let i = 0, fi = 0;
    for (const n0 of nodes) {
      const n = byId.get(n0.id) ?? n0, p = n.params, o = i * 4, t = n.type;
      if (t === 'fractal') {
        const f = fills[fi++], lac = p.lac;
        const amp = lac ** -p.H;
        arr.set([f.s, Math.round(p.oct), KIND[p.kind], amp], o);
        arr.set([p.offset, p.gain, p.erosion, p.warp], o + 4);
        arr.set([Math.log2(p.freq) + 1, 1 / Math.log2(lac), f.warpAt, 0], o + 8);
        i += 3;
      } else if (t === 'craters') {
        const f = fills[fi++];
        arr.set([f.s, Math.round(p.oct), p.depth, p.rim], o);
        arr.set([Math.log2(p.freq) + 1, 1 / Math.log2(p.lac), p.lac ** -1, 0], o + 4);
        i += 2;
      } else if (t === 'rock') {
        const f = fills[fi++];
        arr.set([f.s, Math.round(p.oct), p.size, 0], o);
        arr.set([Math.log2(p.freq) + 1, 1 / Math.log2(p.lac), 1 / p.lac, 0], o + 4);
        i += 2;
      } else if (t === 'scale') { arr.set([p.scale, p.bias, 0, 0], o); i++; }
      else if (t === 'mix') { arr.set([p.a, p.b, p.c, 0], o); i++; }
      else if (t === 'smooth') { arr.set([p.lo, p.hi, 0, 0], o); i++; }
      else if (t === 'power') { arr.set([p.exp, 0, 0, 0], o); i++; }
      else if (t === 'terrace') { arr.set([p.steps, p.sharp, 0, 0], o); i++; }
    }
  }
  return { glsl, key, fills, writeParams, end: slot };
}
