// Height statistics for a seed: what fraction is under the sea, and how much relief exists.
import { open } from './cdp.mjs';
const b = await open(`http://127.0.0.1:8791/dev.html#${process.argv[2] ?? 7}`);
for (let i = 0; i < 40; i++) { if (await b.ev('!!window.__ready').catch(() => false)) break; await new Promise(r => setTimeout(r, 500)); }
console.log(await b.ev(`(()=>{const a=__app,R=a.current.radius;a.paused=true;let hs=[];
 for(let b=0;b<20;b++){const d=[];for(let i=0;i<64;i++){const z=Math.random()*2-1,t=Math.random()*6.283,c=Math.sqrt(1-z*z);d.push([c*Math.cos(t),z,c*Math.sin(t)])}
 hs.push(...a.r.heightsAt(a.cam,0,d,R/1500).map(o=>o.h))}
 hs.sort((x,y)=>x-y);const q=p=>+hs[Math.floor(p*(hs.length-1))].toFixed(2);
 return JSON.stringify({kind:a.current.kind,sea:+a.current.sea.toFixed(2),under:+(hs.filter(h=>h<a.current.sea).length/hs.length).toFixed(2),min:q(0),p10:q(.1),p50:q(.5),p90:q(.9),max:q(1),hmin:+a.r.hmin.toFixed(1),hmax:+a.r.hmax.toFixed(1)})})()`));
console.log(b.logs.join('\n')); b.close();
