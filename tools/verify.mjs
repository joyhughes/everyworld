// End-to-end checks on the real GPU through the real page.
import { writeFileSync } from 'node:fs';
import { open } from './cdp.mjs';
const out = process.argv[2];
const b = await open('http://127.0.0.1:8791/index.html#w7');
for (let i = 0; i < 60; i++) { if (await b.ev('!!window.__ready').catch(() => false)) break; await new Promise(r => setTimeout(r, 300)); }
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click0 = id => b.ev(`document.getElementById('${id}').click()`);

// 1. Same point on the planet gives the same height from any camera distance (lattice exactness).
const consist = JSON.parse(await b.ev(`(()=>{const a=__app,c=a.cam,R=c.R;a.paused=true;const s=a.scoutSpot();const P=s.dir;const r=[];
  const saved=[c.pos,c.fwd,c.camUp];
  // from the target itself, then from cameras progressively further away, sampling at the same feature size
  for(const off of [0,1e-7,1e-5,1e-3,.02,.2]){const q=[P[0]+off*.6,P[1]-off*.5,P[2]+off*.62];const n=Math.hypot(...q);c.pos=q.map(v=>v/n*(R+5));c.ground=0;c.derive();
    r.push(a.r.heightsAt(c,0,[P],R/2048)[0].h)}
  [c.pos,c.fwd,c.camUp]=saved;c.derive();a.paused=false;return JSON.stringify(r)})()`));
const spread = Math.max(...consist) - Math.min(...consist);
check('height independent of camera distance', spread < 2e-3, `spread ${(spread * 1000).toFixed(3)} m over ${consist.length} camera positions`);

// 2. Sub-pixel shifts on visible ground. 0.1 mm is about 1/20 pixel here, so little may change.
const stab = JSON.parse(await b.ev(`(async()=>{const a=__app,c=a.cam,g=a.r.gl;a.scout(true);a.needGround=true;a.step(0);a.needGround=true;a.step(0);c.pos=c.up.map(v=>v*(c.R+c.ground+.002));c.derive();
  const dn=c.fwd[0]*c.up[0]+c.fwd[1]*c.up[1]+c.fwd[2]*c.up[2];c.fwd=c.fwd.map((v,i)=>v-c.up[i]*dn-c.up[i]*.3);c.camUp=c.up.slice();c.derive();a.paused=true;
  const W=640,H=360,Q={steps:120,shadow:8,cloud:4,fine:12};
  const grab=()=>{a.r.quality=Q;a.r.map=null;a.r.resetAccum();a.r.frame=7;a.r.renderSample(c,0,W,H,1);const p=new Float32Array(W*H*4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.accFb);g.readPixels(0,0,W,H,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);return p};
  const diff=(A,B)=>{let d=0,m=0;for(let i=0;i<A.length;i+=4){d+=Math.abs(A[i+1]-B[i+1]);m+=(A[i+1]+B[i+1])*.5}return d/m*100};
  const P0=c.pos.slice(),A=grab();let vr=0,mean=0;for(let i=0;i<A.length;i+=4){mean+=A[i+1]}mean/=A.length/4;for(let i=0;i<A.length;i+=4){vr+=(A[i+1]-mean)**2}
  const res={elev:c.ground,contrast:Math.sqrt(vr/(A.length/4))/mean};
  for(const [n,km] of [['p01',1e-8],['p1',1e-7],['m1',1e-6]]){c.pos=P0.map((v,i)=>v+c.right[i]*km);c.derive();res[n]=diff(A,grab())}
  c.pos=P0;c.derive();
  const q={steps:100,shadow:8,cloud:8,fine:5};a.r.quality=q;res.ms={};
  for(const [n,S] of [['270p',[480,270]],['480p',[854,480]],['720p',[1280,720]]]){const T=[];for(let i=0;i<7;i++){const t0=performance.now();a.r.resetAccum();a.r.renderSample(c,0,S[0],S[1],1);const p=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.accFb);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);T.push(performance.now()-t0)}T.sort((x,y)=>x-y);res.ms[n]=Math.round(T[3])}
  a.paused=false;a.maxSamples=24;a.dirty=true;return JSON.stringify(res)})()`));
check('ground view has real contrast', stab.contrast > .04, `contrast ${stab.contrast.toFixed(3)} at elevation ${stab.elev.toFixed(2)} km`);
check('stable under 0.1 mm move', stab.p1 < 1.5, `change 0.01 mm ${stab.p01.toFixed(2)}%, 0.1 mm ${stab.p1.toFixed(2)}%, 1 mm ${stab.m1.toFixed(2)}%`);
console.log('INFO  GPU-synchronised frame cost at 2 m, ground filling the view:', JSON.stringify(stab.ms));
for (let i = 0; i < 150; i++) { if (await b.ev(`__app.r.samples>=24&&!__app.moving`)) break; await sleep(100); }
await b.ev(`document.getElementById('panel').style.display='none';document.getElementById('hint').style.display='none'`);
writeFileSync(`${out}/ground.png`, await b.shot());
await b.ev(`document.getElementById('panel').style.display=''`);

// 3. GPU-synchronised cost for orbit and a mountain flyover at the same resolutions.
for (const [name, set] of [['orbit', `a.homeView()`], ['mountains 1.2 km up', `a.scout(true)`]]) {
  const ms = JSON.parse(await b.ev(`(()=>{const a=__app,c=a.cam,g=a.r.gl;${set};a.step(0);a.paused=true;a.r.map=null;a.r.quality={steps:100,shadow:8,cloud:8,fine:5};const o={};
   for(const [n,S] of [['270p',[480,270]],['480p',[854,480]],['720p',[1280,720]]]){const T=[];for(let i=0;i<7;i++){const t0=performance.now();a.r.resetAccum();a.r.renderSample(c,0,S[0],S[1],1);const p=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.accFb);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);T.push(performance.now()-t0)}T.sort((x,y)=>x-y);o[n]=Math.round(T[3])}
   a.paused=false;a.dirty=true;return JSON.stringify(o)})()`));
  console.log(`INFO  GPU-synchronised frame cost, ${name}:`, JSON.stringify(ms));
}

// 4a. Transport controls through their real buttons and events.
const alt = () => b.ev(`JSON.stringify({agl:__app.cam.altAboveGround,alt:__app.cam.alt,fly:!!__app.cam.flight,R:__app.cam.R})`).then(JSON.parse);
const landed = async () => { for (let i = 0; i < 80; i++) { await sleep(100); if (!(await alt()).fly) break; } await sleep(350); return alt(); };
await b.ev(`__app.homeView()`); await sleep(150);
await click0('bScout'); let st = await landed();
check('Scout flies to the surface', st.agl > .3 && st.agl < 4, `${st.agl.toFixed(2)} km above ground`);
await click0('bRandom'); st = await landed();
check('Random view lands near the surface', st.agl > .05 && st.agl < 80, `${st.agl.toFixed(2)} km above ground`);
await click0('bWalk'); await sleep(900);
await b.ev(`__app.needGround=true;__app.dirty=true`); await sleep(500); st = await alt();
check('Walk stands at eye height', st.agl > .0005 && st.agl < .01, `${(st.agl * 1000).toFixed(2)} m above ground`);
await b.ev(`__app.keys.add('KeyW')`); await sleep(1500); await b.ev(`__app.keys.clear()`); await sleep(500); st = await alt();
check('walking keeps eye height', st.agl > .0005 && st.agl < .02, `${(st.agl * 1000).toFixed(2)} m above ground`);
await click0('bWalk'); await click0('bHome'); st = await landed();
check('Orbit returns to space', st.alt > st.R * 1.5, `${Math.round(st.alt)} km`);
await b.ev(`(()=>{const c=document.getElementById('view'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('dblclick',{clientX:r.width*.36,clientY:r.height*.5,bubbles:true}))})()`);
st = await landed();
check('double-click flies to the point', st.alt < 3000, `${Math.round(st.alt)} km altitude`);
const a0 = st.agl;
await b.ev(`document.getElementById('view').dispatchEvent(new WheelEvent('wheel',{deltaY:400,bubbles:true,cancelable:true}))`); await sleep(250); st = await alt();
check('scroll changes altitude', st.agl > a0 * 1.2, `${a0.toFixed(1)} → ${st.agl.toFixed(1)} km`);

// 4. UI paths.
const click = click0;
for (const t of ['Transport', 'Mixers', 'World', 'Bombs', 'Render', 'Log']) { await click('tab' + t); check(`tab ${t}`, (await b.ev(`document.getElementById('pane').children.length`)) > 1); }
await click('tabMixers');
const before = await b.ev(`__app.current.terrain.nodes.find(n=>n.id==='ridge').params.freq`);
await b.ev(`(()=>{const r=document.querySelector('[aria-label="Mountain spacing"]');r.value=.8;r.dispatchEvent(new Event('input'))})()`);
await sleep(700);
const after = await b.ev(`__app.current.terrain.nodes.find(n=>n.id==='ridge').params.freq`);
check('mixer changes the world', Math.abs(after / before - 2.5 ** .8) < .01, `ridge frequency ${before.toFixed(1)} → ${after.toFixed(1)}`);
const code = await b.ev(`(async()=>{const {encodeWorld,decodeWorld}=await import('./src/world.js');const c=encodeWorld(__app);const d=decodeWorld(c);return JSON.stringify({len:c.length,same:JSON.stringify(d.base)===JSON.stringify(__app.base),mix:d.mix.spacing})})()`);
check('edited world code round-trips', JSON.parse(code).same && JSON.parse(code).mix === .8, code);
await b.ev(`(()=>{const c=document.querySelector('[aria-label="Blend"]');c.value=.5;c.dispatchEvent(new Event('input'))})()`);
await sleep(700);
check('hyperspace blend', await b.ev(`__app.morphT===.5&&!!__app.morphTo`));
await b.ev(`(()=>{const c=document.querySelector('[aria-label="Blend"]');c.value=0;c.dispatchEvent(new Event('input'))})()`);
await sleep(500);
// graph: open, add a terrace node, wire it to the output, confirm recompile changed the program
await click('tabWorld');
await b.ev(`[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Open graph').click()`);
const key0 = await b.ev(`__app.r.programKey.length`);
await b.ev(`(()=>{const g=__app.base.terrain;g.nodes.push({id:'tt',type:'terrace',x:1350,y:200,params:{steps:8,sharp:.7},in:{a:g.out}});g.out='tt';return __app.rebuild()})()`);
const key1 = await b.ev(`__app.r.programKey.length`);
check('graph edit recompiles', key1 !== key0, `glsl ${key0} → ${key1} chars`);
writeFileSync(`${out}/graph.png`, await b.shot());
await b.ev(`(()=>{const g=__app.base.terrain;g.out=g.nodes.find(n=>n.id==='tt').in.a;g.nodes=g.nodes.filter(n=>n.id!=='tt');document.getElementById('gclose').click();return __app.rebuild()})()`);
// a loop is refused with a readable message
const loopMsg = await b.ev(`(async()=>{const {compileGraph}=await import('./src/graph.js');const g=JSON.parse(JSON.stringify(__app.base.terrain));g.nodes.find(n=>n.id==='land').in.a='height';try{compileGraph(g,80,320);return 'no error'}catch(e){return e.message}})()`);
check('graph loop refused', /loop/.test(loopMsg), loopMsg);
// bomb
await b.ev(`__app.homeView()`); await sleep(200);
await click('tabBombs');
await b.ev(`[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Drop mesa').click()`);
await sleep(1500);
check('parameter bomb placed', await b.ev(`__app.base.bombs.length===1&&__app.base.terrain.out==='bomb'`));
await b.ev(`[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Clear bombs').click()`);
await sleep(1000);
check('bomb cleared', await b.ev(`__app.base.bombs.length===0&&__app.base.terrain.out!=='bomb'`));
// render a small still through the real button path, and compare it with the live view
await b.ev(`(()=>{__app.homeView();__app.maxSamples=16;__app.dirty=true})()`);
for (let i = 0; i < 100; i++) { await sleep(100); if (await b.ev(`__app.r.samples>=16&&!__app.moving`)) break; }
const live = JSON.parse(await b.ev(`(()=>{const a=__app,g=a.r.gl;a.r.present(a.current.exposure);const W=a.canvas.width,H=a.canvas.height,S=H>>1,p=new Uint8Array(S*S*4);g.readPixels((W-S)>>1,(H-S)>>1,S,S,g.RGBA,g.UNSIGNED_BYTE,p);const s=[0,0,0];for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++)s[c]+=p[i+c];return JSON.stringify(s.map(v=>v/(S*S)))})()`));
await click('tabRender');
await b.ev(`(()=>{__app.renderSpp=8;[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Render still').click()})()`);
let done = false; for (let i = 0; i < 150 && !done; i++) { await sleep(200); done = await b.ev(`!document.getElementById('result').hidden`); }
check('still render finishes', done, await b.ev(`(()=>{const i=document.getElementById('rimg');return i.naturalWidth+'x'+i.naturalHeight})()`));
await sleep(300); writeFileSync(`${out}/render.png`, await b.shot());
const shotM = JSON.parse(await b.ev(`(()=>{const i=document.getElementById('rimg'),W=i.naturalWidth,H=i.naturalHeight,S=H>>1,c=document.createElement('canvas');c.width=S;c.height=S;const x=c.getContext('2d');x.drawImage(i,(W-S)>>1,(H-S)>>1,S,S,0,0,S,S);const p=x.getImageData(0,0,S,S).data,s=[0,0,0];for(let k=0;k<p.length;k+=4)for(let n=0;n<3;n++)s[n]+=p[k+n];return JSON.stringify(s.map(v=>v/(S*S)))})()`));
const dc = Math.max(...live.map((v, i) => Math.abs(v - shotM[i])));
check('still matches live view', dc < 14, `live ${live.map(Math.round)} render ${shotM.map(Math.round)}`);
await b.ev(`document.getElementById('rclose').click()`);
await click('tabLog');
await b.ev(`[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Record this place').click()`);
check('logbook records', (await b.ev(`document.querySelectorAll('.log img').length`)) === 1);
check('no errors logged', !b.logs.some(l => /error|EXCEPTION/i.test(l)), b.logs.join(' | ').slice(0, 300));
check('context alive', !(await b.ev(`__app.r.gl.isContextLost()`)));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
b.close();
