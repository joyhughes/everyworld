// Same points at coarse and fine footprints: mean height shift and land/sea flips.
import { open } from './cdp.mjs';
const b = await open('http://127.0.0.1:8791/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 80; i++) { await sleep(150); if (await b.ev('!!window.__ready').catch(() => false)) break; }
const out = {};
for (const seed of [1004, 2071, 5150]) {
  out[seed] = await b.ev(`(async()=>{const {generateWorld}=await import('./src/world.js');const a=__app,r=a.r;await a.loadWorld(generateWorld(${seed}));a.paused=true;const w=a.current,R=w.radius;
    const rnd=(()=>{let s=7;return()=>(s=Math.imul(s,1664525)+1013904223>>>0)/4294967296})();
    const dirs=[];for(let i=0;i<4096;i++){const z=rnd()*2-1,t=rnd()*6.283,c=Math.sqrt(1-z*z);dirs.push([c*Math.cos(t),z,c*Math.sin(t)])}
    const at=foot=>{const o=[];for(let i=0;i<dirs.length;i+=64)o.push(...r.heightsAt(a.cam,0,dirs.slice(i,i+64),foot).map(x=>x.h));return o};
    const fine=at(.001),res={};
    for(const [name,foot] of [['R/400',R/400],['10 km',10],['1 km',1],['100 m',.1]]){const h=at(foot);let d=0,flip=0;for(let i=0;i<h.length;i++){d+=fine[i]-h[i];if((h[i]>w.sea)!==(fine[i]>w.sea))flip++}res[name]={meanShiftKm:+(d/h.length).toFixed(4),flipPct:+(flip/h.length*100).toFixed(2)}}
    return res})()`);
}
console.log(JSON.stringify(out));
b.close();
