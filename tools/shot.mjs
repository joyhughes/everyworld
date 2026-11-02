// node tools/shot.mjs <outdir> <page> <seed> alt:lat:lon:heading:pitch[:samples] ...
import { writeFileSync, mkdirSync } from 'node:fs';
import { open } from './cdp.mjs';
const [out, page, seed, ...views] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await open(`http://127.0.0.1:8791/${page}#${seed}`, { gpu: process.env.GPU !== '0' });
for (let i = 0; i < 40; i++) { if (await b.ev('!!window.__ready').catch(() => false)) break; await new Promise(r => setTimeout(r, 500)); }
console.log(b.logs.join('\n') || 'no logs');
console.log(await b.ev(`JSON.stringify({gl:(()=>{const g=__app.r.gl,e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):''})(),kind:__app.current.kind,name:__app.current.name,R:__app.current.radius,sea:__app.current.sea,hmin:__app.r.hmin,hmax:__app.r.hmax})`));
let n = 0;
for (const v of views) {
  if (v.startsWith('scout')) {
    await b.ev(`__app.maxSamples=${v.split(':')[1] ?? 8};JSON.stringify(__app.scout(true))`).then(console.log);
    for (let i = 0; i < 300; i++) { if (await b.ev(`__app.r.samples>=__app.maxSamples&&!__app.moving`)) break; await new Promise(r => setTimeout(r, 100)); }
    const name = `${seed}-${String(n++).padStart(2, '0')}.png`; writeFileSync(`${out}/${name}`, await b.shot()); console.log(name); continue;
  }
  const [alt, la, lo, he = 0, pi = 0, samp = 6] = v.split(':').map(Number);
  const t0 = Date.now();
  await b.ev(`(()=>{const c=__app.cam,la=${la},lo=__app.current.sun.time*6.2832+${lo};c.place([Math.cos(la)*Math.cos(lo),Math.sin(la),Math.cos(la)*Math.sin(lo)],1,0,0);__app.needGround=true;c.ground=0;
    __app.step(0);const g=c.ground;c.place(c.up,${alt}<0?g+${-alt}:${alt},${he},${pi});__app.maxSamples=${samp};__app.dirty=true;})()`);
  for (let i = 0; i < 400; i++) { if (await b.ev(`__app.r.samples>=${samp}&&!__app.moving`)) break; await new Promise(r => setTimeout(r, 100)); }
  const name = `${seed}-${String(n++).padStart(2, '0')}.png`;
  writeFileSync(`${out}/${name}`, await b.shot());
  console.log(name, v, (Date.now() - t0) + 'ms', await b.ev(`JSON.stringify({a:+__app.cam.alt.toFixed(5),g:+__app.cam.ground.toFixed(5),bands:__app.bands})`));
}
if (process.env.BENCH) console.log('bench', await b.ev(`(async()=>{const a=__app,o={};a.paused=true;const g=a.r.gl;
  for(const [n,q] of [['move',{steps:90,shadow:6,cloud:10}],['moveNoShadow',{steps:90,shadow:0,cloud:10}],['noCloud',{steps:90,shadow:6,cloud:1}],['steps40',{steps:40,shadow:6,cloud:10}],['refine',{steps:180,shadow:22,cloud:26}]]){
   a.r.quality=q;a.r.resetAccum();const t=performance.now();for(let i=0;i<3;i++){a.r.resetAccum();a.r.renderSample(a.cam,a.time,640,360,1);g.finish();const px=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.accFb);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,px);g.bindFramebuffer(g.FRAMEBUFFER,null);}o[n]=Math.round((performance.now()-t)/3);}
  a.paused=false;return JSON.stringify(o)})()`));
console.log(b.logs.join('\n'));
b.close();
