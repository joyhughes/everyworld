// Measures E|n| and E[n^2] of one simplex octave, through a one-node terrain graph.
import { open } from './cdp.mjs';
const b = await open('http://127.0.0.1:8791/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 80; i++) { await sleep(150); if (await b.ev('!!window.__ready').catch(() => false)) break; }
const res = await b.ev(`(async()=>{const a=__app,r=a.r;a.paused=true;
  const g=a.base.terrain;const keep=JSON.stringify(g);
  g.nodes=[{id:'f',type:'fractal',x:0,y:0,params:{kind:'fbm',freq:900,oct:1,H:.8,lac:2,offset:0,gain:1,erosion:0,warp:0,warpFreq:2}}];g.out='f';
  await a.rebuild();let s1=0,s2=0,n=0,mx=0;
  for(let b=0;b<64;b++){const dirs=[];for(let i=0;i<64;i++){const z=Math.random()*2-1,t=Math.random()*6.283,c=Math.sqrt(1-z*z);dirs.push([c*Math.cos(t),z,c*Math.sin(t)])}
    for(const o of r.heightsAt(a.cam,0,dirs,1e-6)){s1+=Math.abs(o.h);s2+=o.h*o.h;n++;mx=Math.max(mx,Math.abs(o.h))}}
  const g2=JSON.parse(keep);a.base.terrain=g2;await a.rebuild();
  return {absMean:s1/n,sqMean:s2/n,max:mx,n}})()`);
console.log(JSON.stringify(res));
b.close();
