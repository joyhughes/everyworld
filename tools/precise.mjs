// Sub-pixel stability at human scale, and true GPU-synchronised frame cost.
import { writeFileSync } from 'node:fs';
import { open } from './cdp.mjs';
const out = process.argv[2];
const b = await open('http://127.0.0.1:8791/index.html#w7');
for (let i = 0; i < 60; i++) { if (await b.ev('!!window.__ready').catch(() => false)) break; await new Promise(r => setTimeout(r, 300)); }
const run = spot => b.ev(`(async()=>{const a=__app,c=a.cam,g=a.r.gl;
  a.cam.flight=null;${spot};c.ground=0;c.derive();a.needGround=true;a.step(0);a.needGround=true;a.step(0);
  c.pos=c.up.map(v=>v*(c.R+c.ground+.002));c.derive();
  const dn=c.fwd[0]*c.up[0]+c.fwd[1]*c.up[1]+c.fwd[2]*c.up[2];c.fwd=c.fwd.map((v,i)=>v-c.up[i]*dn-c.up[i]*.3);c.camUp=c.up.slice();c.derive();a.paused=true;
  const W=640,H=360,Q={steps:120,shadow:8,cloud:4,fine:12};
  const grab=()=>{a.r.quality=Q;a.r.map=null;a.r.resetAccum();a.r.frame=7;a.r.renderSample(c,0,W,H,1);const p=new Float32Array(W*H*4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.accFb);g.readPixels(0,0,W,H,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);return p};
  const diff=(A,B)=>{let d=0,m=0;for(let i=0;i<A.length;i+=4){d+=Math.abs(A[i+1]-B[i+1]);m+=(A[i+1]+B[i+1])*.5}return +(d/m*100).toFixed(3)};
  const P0=c.pos.slice(),A=grab(),res={elev:+c.ground.toFixed(3)};
  for(const [n,km] of [['0.01mm',1e-8],['0.1mm',1e-7],['1mm',1e-6]]){c.pos=P0.map((v,i)=>v+c.right[i]*km);c.derive();res[n]=diff(A,grab())}
  c.pos=P0;c.derive();
  const q={steps:100,shadow:8,cloud:8,fine:5},t={};a.r.map=null;
  for(const [n,S] of [['270p',[480,270]],['480p',[854,480]],['720p',[1280,720]]]){a.r.quality=q;const T=[];for(let i=0;i<7;i++){const t0=performance.now();a.r.resetAccum();a.r.renderSample(c,0,S[0],S[1],1);const p=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.accFb);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);T.push(performance.now()-t0)}T.sort((x,y)=>x-y);t[n]=Math.round(T[3])}
  res.ms=t;a.paused=false;a.maxSamples=24;a.dirty=true;return JSON.stringify(res)})()`);
const high = await run(`a.scout(true)`);
console.log('peak ', high);
for (let i = 0; i < 150; i++) { if (await b.ev(`__app.r.samples>=24&&!__app.moving`)) break; await new Promise(r => setTimeout(r, 100)); }
await b.ev(`document.getElementById('panel').style.display='none';document.getElementById('hint').style.display='none'`);
writeFileSync(`${out}/two-metres.png`, await b.shot());
await b.ev(`document.getElementById('panel').style.display=''`);
// a spot near sea level: same test, lower absolute height
const low = await run(`(()=>{const R=a.current.radius,sea=a.current.sea,sun=a.r.sunDir(a.current);let bs=null,sd=3;const rd=()=>(sd=(Math.imul(sd,1664525)+1013904223)>>>0)/4294967296;
  for(let k=0;k<6&&!bs;k++){const D=[];for(let i=0;i<64;i++){const z=rd()*2-1,t=rd()*6.283,o=Math.sqrt(1-z*z);D.push([o*Math.cos(t)+sun[0],z+sun[1],o*Math.sin(t)+sun[2]].map((v,_,q)=>v/Math.hypot(...q)))}
   a.r.heightsAt(c,0,D,.5).forEach((o,i)=>{if(!bs&&o.h>sea+.02&&o.h<sea+.2)bs=D[i]})}
  c.pos=bs.map(v=>v*(R+1));c.derive();})()`);
console.log('coast', low);
// clean orbit view of the unedited world
await b.ev(`__app.homeView();__app.maxSamples=16;__app.dirty=true`);
for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100)); if (await b.ev(`__app.r.samples>=16&&!__app.moving`)) break; }
writeFileSync(`${out}/orbit-clean.png`, await b.shot());
await b.ev(`(()=>{const r=document.getElementById('tabMixers');r.click();const s=document.querySelector('[aria-label="Mountain spacing"]');s.value=.8;s.dispatchEvent(new Event('input'))})()`);
await new Promise(r => setTimeout(r, 900));
for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100)); if (await b.ev(`__app.r.samples>=16&&!__app.moving`)) break; }
writeFileSync(`${out}/orbit-spacing.png`, await b.shot());

console.log(b.logs.join('\n')); b.close();
