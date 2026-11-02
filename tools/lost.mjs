import { open } from './cdp.mjs';
const b = await open('http://127.0.0.1:8791/dev.html#7');
for (let i = 0; i < 40; i++) { if (await b.ev('!!window.__ready').catch(() => false)) break; await new Promise(r => setTimeout(r, 500)); }
await b.ev(`(()=>{__app.r.canvas.addEventListener('webglcontextlost',e=>console.log('CONTEXT LOST at',Math.round(performance.now())));__app.paused=true})()`);
const r = await b.ev(`(async()=>{const a=__app,c=a.cam,g=a.r.gl,lo=a.current.sun.time*6.2832+.2,la=.3,o=[];
 c.place([Math.cos(la)*Math.cos(lo),Math.sin(la),Math.cos(la)*Math.sin(lo)],1,0,0);c.ground=4.36;c.derive();c.place(c.up,4.8,1,-.05);
 const rd=()=>{const p=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.accFb);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);return p[0]};
 for(const [W,H,q] of [[16,9,{steps:120,shadow:12,cloud:10,fine:8}],[640,360,{steps:120,shadow:12,cloud:10,fine:8}],[640,360,{steps:120,shadow:0,cloud:1,fine:8}],[1280,720,{steps:120,shadow:12,cloud:10,fine:8}],[1280,720,{steps:220,shadow:32,cloud:26,fine:24}]]){
  a.r.quality=q;a.r.resetAccum();const t=performance.now();a.r.renderSample(c,0,W,H,1);const v=rd();o.push([W,q.steps,q.shadow,q.cloud,Math.round(performance.now()-t),v,g.isContextLost(),g.getError()].join(' '));await new Promise(r=>setTimeout(r,50));}
 return o.join('\\n')})()`);
console.log(r); console.log(b.logs.join('\n')); b.close();
