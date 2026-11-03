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
  const grab=()=>{a.r.quality=Q;a.r.map=null;a.r.resetAccum();a.r.frame=7;a.r.renderSample(c,0,W,H,1);const p=new Float32Array(W*H*4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.view.fb);g.readPixels(0,0,W,H,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);return p};
  const diff=(A,B)=>{let d=0,m=0;for(let i=0;i<A.length;i+=4){d+=Math.abs(A[i+1]-B[i+1]);m+=(A[i+1]+B[i+1])*.5}return d/m*100};
  const P0=c.pos.slice(),A=grab();let vr=0,mean=0;for(let i=0;i<A.length;i+=4){mean+=A[i+1]}mean/=A.length/4;for(let i=0;i<A.length;i+=4){vr+=(A[i+1]-mean)**2}
  const res={elev:c.ground,contrast:Math.sqrt(vr/(A.length/4))/mean};
  for(const [n,km] of [['p01',1e-8],['p1',1e-7],['m1',1e-6]]){c.pos=P0.map((v,i)=>v+c.right[i]*km);c.derive();res[n]=diff(A,grab())}
  c.pos=P0;c.derive();
  const q={steps:100,shadow:8,cloud:8,fine:5};a.r.quality=q;res.ms={};
  for(const [n,S] of [['270p',[480,270]],['480p',[854,480]],['720p',[1280,720]]]){const T=[];for(let i=0;i<7;i++){const t0=performance.now();a.r.resetAccum();a.r.renderSample(c,0,S[0],S[1],1);const p=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.view.fb);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);T.push(performance.now()-t0)}T.sort((x,y)=>x-y);res.ms[n]=Math.round(T[3])}
  a.paused=false;a.maxSamples=24;a.dirty=true;return JSON.stringify(res)})()`));
check('ground view has real contrast', stab.contrast > .03, `contrast ${stab.contrast.toFixed(3)} at elevation ${stab.elev.toFixed(2)} km`);
check('stable under 0.1 mm move', stab.p1 < 1.5, `change 0.01 mm ${stab.p01.toFixed(2)}%, 0.1 mm ${stab.p1.toFixed(2)}%, 1 mm ${stab.m1.toFixed(2)}%`);
console.log('INFO  GPU-synchronised frame cost at 2 m, ground filling the view:', JSON.stringify(stab.ms));
for (let i = 0; i < 150; i++) { if (await b.ev(`__app.r.samples>=24&&!__app.moving`)) break; await sleep(100); }
await b.ev(`document.getElementById('lower').style.display='none';__app.resize()`);
writeFileSync(`${out}/ground.png`, await b.shot());
await b.ev(`document.getElementById('lower').style.display='';__app.resize()`);

// 3. GPU-synchronised cost for orbit and a mountain flyover at the same resolutions.
for (const [name, set] of [['orbit', `a.homeView()`], ['mountains 1.2 km up', `a.scout(true)`]]) {
  const ms = JSON.parse(await b.ev(`(()=>{const a=__app,c=a.cam,g=a.r.gl;${set};a.step(0);a.paused=true;a.r.map=null;a.r.quality={steps:100,shadow:8,cloud:8,fine:5};const o={};
   for(const [n,S] of [['270p',[480,270]],['480p',[854,480]],['720p',[1280,720]]]){const T=[];for(let i=0;i<7;i++){const t0=performance.now();a.r.resetAccum();a.r.renderSample(c,0,S[0],S[1],1);const p=new Float32Array(4);g.bindFramebuffer(g.FRAMEBUFFER,a.r.view.fb);g.readPixels(0,0,1,1,g.RGBA,g.FLOAT,p);g.bindFramebuffer(g.FRAMEBUFFER,null);T.push(performance.now()-t0)}T.sort((x,y)=>x-y);o[n]=Math.round(T[3])}
   a.paused=false;a.dirty=true;return JSON.stringify(o)})()`));
  console.log(`INFO  GPU-synchronised frame cost, ${name}:`, JSON.stringify(ms));
}

// 4a. Navigation through the real controls.
const alt = () => b.ev(`JSON.stringify({agl:__app.cam.altAboveGround,alt:__app.cam.alt,fly:!!__app.cam.flight,R:__app.cam.R,mode:__app.mode})`).then(JSON.parse);
const landed = async () => { for (let i = 0; i < 80; i++) { await sleep(100); if (!(await alt()).fly) break; } await sleep(400); return alt(); };
const q = sel => `document.querySelector(${JSON.stringify(sel)})`;
const clickQ = sel => b.ev(`${q(sel)}.click()`);
await b.ev(`__app.homeView()`); await sleep(150);
await clickQ('#randomcam [title^="Six-pip"]');
let st = await landed();
check('RandomCam six-pip die lands near the ground', st.agl > .001 && st.agl < .05, `${(st.agl * 1000).toFixed(1)} m above ground`);
await clickQ('#randomcam [title^="Random jumps at airplane"]'); await clickQ('#randomcam [title^="Two-pip"]'); st = await landed();
check('RandomCam two-pip die at airplane height', st.agl > 5 && st.agl < 40, `${st.agl.toFixed(1)} km above ground`);
await b.ev(`${q('#jognav circle.tgt:last-of-type')}`);
await b.ev(`[...document.querySelectorAll('#jognav circle.tgt')].at(-1).dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(600); st = await alt();
check('JogNav 2m target stands at eye height', Math.abs(st.agl - .002) < .0005, `${(st.agl * 1000).toFixed(2)} m above ground`);
await b.ev(`__app.keys.add('KeyW')`); await sleep(1500); await b.ev(`__app.keys.clear()`); await sleep(600); st = await alt();
check('walking holds the height above ground', st.agl > .0012 && st.agl < .004, `${(st.agl * 1000).toFixed(2)} m above ground`);
await b.ev(`[...document.querySelectorAll('#jognav circle.tgt')][0].dispatchEvent(new MouseEvent('click',{bubbles:true}))`); await sleep(500); st = await alt();
check('JogNav 10K target', Math.abs(st.agl - 10) < .5, `${st.agl.toFixed(2)} km`);
await b.ev(`(()=>{const e=new PointerEvent('pointerdown',{bubbles:true,pointerId:7});const el=[...document.querySelectorAll('#jognav path.arrow')][0];el.setPointerCapture=()=>{};el.dispatchEvent(e)})()`); await sleep(700);
const moved = await b.ev(`!!__app.jog`); await b.ev(`(()=>{const el=[...document.querySelectorAll('#jognav path.arrow')][0];el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7}))})()`);
check('JogNav arrow moves while held', moved && !(await b.ev(`!!__app.jog`)));
await b.ev(`__ui.home()`); st = await landed();
check('H returns to orbit', st.alt > st.R * 1.5, `${Math.round(st.alt)} km`);
await b.ev(`(()=>{const c=document.getElementById('view'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('dblclick',{clientX:r.left+r.width*.45,clientY:r.top+r.height*.5,bubbles:true}))})()`);
st = await landed();
check('double-click flies to the point', st.alt < 3000, `${Math.round(st.alt)} km altitude`);
await b.ev(`__app.randomCam(true,10)`); await sleep(300);
await b.ev(`(()=>{const c=document.getElementById('view'),r=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent('dblclick',{clientX:r.left+r.width*.5,clientY:r.top+r.height*.8,bubbles:true,shiftKey:true}))})()`);
st = await landed();
check('shift-double-click stands at 2 m', Math.abs(st.agl - .002) < .001, `${(st.agl * 1000).toFixed(2)} m`);
const a0 = st.agl;
await b.ev(`document.getElementById('view').dispatchEvent(new WheelEvent('wheel',{deltaY:600,bubbles:true,cancelable:true}))`); await sleep(400); st = await alt();
check('scroll raises the walking height', st.agl > a0 * 1.5, `${(a0 * 1000).toFixed(1)} → ${(st.agl * 1000).toFixed(1)} m`);
// fly mode and the panic buttons
await clickQ('#ctrlbar [title^="Fly Mode"]'); await b.ev(`__app.popUp()`);
await b.ev(`__app.keys.add('KeyW')`); await sleep(1200); await b.ev(`__app.keys.delete('KeyW')`);
const v1 = await b.ev(`Math.hypot(...__app.vel)`);
await b.ev(`dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}))`);
check('Fly: W accelerates, Space stops', v1 > .01 && (await b.ev(`Math.hypot(...__app.vel)`)) === 0, `speed ${v1.toFixed(3)} km/s`);
await b.ev(`(()=>{__app.cam.roll(.5);__app.cam.pitch(.3)})()`);
await b.ev(`dispatchEvent(new KeyboardEvent('keydown',{code:'KeyL'}));dispatchEvent(new KeyboardEvent('keyup',{code:'KeyL'}))`);
check('Fly: L levels', Math.abs(await b.ev(`__app.cam.rollAngle`)) < .01 && Math.abs(await b.ev(`__app.cam.pitchAngle`)) < .01);
await clickQ('#ctrlbar [title^="UFO Mode"]'); await b.ev(`__app.keys.add('KeyM')`); await sleep(800); await b.ev(`__app.keys.clear()`);
check('UFO: climbs with M', (await b.ev(`__app.vel[2]`)) > 0);
await b.ev(`__app.stop()`); await clickQ('#ctrlbar [title="Walk Mode"]');

// 4b. Interface paths.
for (const [k, t] of [['settings', 'Settings'], ['time', 'Time'], ['log', 'Log'], ['movie', 'Movie'], ['uplink', 'Uplink Queue'], ['nav', 'Nav Console']]) { await clickQ(`#ptools [title="${t}"]`); check(`panel ${t}`, (await b.ev(`document.getElementById('pbody').children.length`)) > 0 && (await b.ev(`${q('#ptools .pname')}.textContent`)) === t.toUpperCase()); }
const before = await b.ev(`__app.current.terrain.nodes.find(n=>n.id==='ridge').params.freq`);
await b.ev(`(()=>{const s=document.querySelector('[aria-label="Mountain spacing"]');s.setPointerCapture=()=>{};const r=s.getBoundingClientRect();const x=r.left+r.width*.9;s.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:r.top+5,bubbles:true}));s.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:r.top+5,bubbles:true}))})()`);
await sleep(900);
const after = await b.ev(`__app.current.terrain.nodes.find(n=>n.id==='ridge').params.freq`), mixv = await b.ev(`__app.mix.spacing`);
check('Hyperspace slider changes the world', Math.abs(after / before - 2.5 ** mixv) < .01 && mixv > .7, `spacing ${mixv.toFixed(2)}, ridge frequency ${before.toFixed(1)} → ${after.toFixed(1)}`);
await clickQ('#ptools [title="Settings"]'); await clickQ('#pbody [title^="Save the current"]');
check('Settings panel saves a mixer setting', (await b.ev(`document.querySelectorAll('#pbody .item').length`)) === 1);
const code = await b.ev(`(async()=>{const {encodeWorld,decodeWorld}=await import('./src/world.js');const c=encodeWorld(__app);const d=decodeWorld(c);return JSON.stringify({len:c.length,same:JSON.stringify(d.base)===JSON.stringify(__app.base),mix:d.mix.spacing===__app.mix.spacing})})()`);
check('edited world code round-trips', JSON.parse(code).same && JSON.parse(code).mix, code);
await b.ev(`(()=>{for(const k in __app.mix)__app.mix[k]=0;__ui.refreshMix();return __ui.rebuild()})()`); await sleep(500);
// time panel turns the sun
const t0 = await b.ev(`__app.current.sun.time`);
await clickQ('#ptools [title="Time"]');
await b.ev(`(()=>{const d=document.querySelector('#pbody .dial');d.setPointerCapture=()=>{};const r=d.getBoundingClientRect();d.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+r.width/2,clientY:r.bottom-4,bubbles:true}));d.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))})()`);
check('Day Time dial moves the sun', Math.abs((await b.ev(`__app.current.sun.time`)) - .5) < .02, `${t0.toFixed(3)} → ${(await b.ev(`__app.current.sun.time`)).toFixed(3)}`);
await b.ev(`(()=>{__app.base.sun.time=__app.current.sun.time=${t0};__app.dirty=true})()`);
// graph: add a terrace block wired to the output, confirm recompile
await b.ev(`__ui.generator.toggle(true)`); await clickQ('#hot [title^="MojoGraph"]');
check('MojoGraph window opens', await b.ev(`document.querySelectorAll('.win .gn').length>5`));
const key0 = await b.ev(`__app.r.programKey.length`);
await b.ev(`(()=>{const g=__app.base.terrain;g.nodes.push({id:'tt',type:'terrace',x:0,y:0,params:{steps:8,sharp:.7},in:{a:g.out}});g.out='tt';return __app.rebuild()})()`);
const key1 = await b.ev(`__app.r.programKey.length`);
check('graph edit recompiles', key1 !== key0, `glsl ${key0} → ${key1} chars`);
writeFileSync(`${out}/graph.png`, await b.shot());
await b.ev(`(()=>{const g=__app.base.terrain;g.out=g.nodes.find(n=>n.id==='tt').in.a;g.nodes=g.nodes.filter(n=>n.id!=='tt');return __app.rebuild()})()`);
const loopMsg = await b.ev(`(async()=>{const {compileGraph}=await import('./src/graph.js');const g=JSON.parse(JSON.stringify(__app.base.terrain));g.nodes.find(n=>n.id==='land').in.a='height';try{compileGraph(g,80,320);return 'no error'}catch(e){return e.message}})()`);
check('graph loop refused', /loop/.test(loopMsg), loopMsg);
// every editor opens
for (const k of ['stars', 'sun', 'moon', 'sky', 'land', 'material', 'water', 'rings', 'bomb']) { await b.ev(`__ui.generator.openEditor('${k}')`); }
check('all nine editors open', (await b.ev(`document.querySelectorAll('#windows .win').length`)) === 10);
await b.ev(`document.querySelectorAll('#windows .win').forEach(w=>w.close())`);
// bomb through the Parameter Bomb editor
await b.ev(`__app.homeView()`); await sleep(200);
await b.ev(`__ui.generator.openEditor('bomb')`);
await b.ev(`[...document.querySelectorAll('.win button')].find(x=>x.textContent==='Drop Bomb').click()`); await sleep(1500);
check('parameter bomb placed', await b.ev(`__app.base.bombs.length===1&&__app.base.terrain.out==='bomb'`));
await b.ev(`[...document.querySelectorAll('.win button')].find(x=>x.textContent==='Clear All').click()`); await sleep(1000);
check('bomb cleared', await b.ev(`__app.base.bombs.length===0&&__app.base.terrain.out!=='bomb'`));
await b.ev(`document.querySelectorAll('#windows .win').forEach(w=>w.close());__ui.generator.toggle(false)`);
// camera button: render into the RTR, compare with the live view
await b.ev(`(()=>{__app.homeView();__app.maxSamples=16;__app.dirty=true})()`); await sleep(300);
for (let i = 0; i < 100; i++) { await sleep(100); if (await b.ev(`__app.r.samples>=16&&!__app.moving`)) break; }
const mean = `(()=>{const a=__app,g=a.r.gl;const W=a.canvas.width,H=a.canvas.height,S=H>>1,p=new Uint8Array(S*S*4);g.readPixels((W-S)>>1,(H-S)>>1,S,S,g.RGBA,g.UNSIGNED_BYTE,p);const s=[0,0,0];for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++)s[c]+=p[i+c];return JSON.stringify(s.map(v=>v/(S*S)))})()`;
await b.ev(`__app.r.present(__app.current.exposure)`); const live = JSON.parse(await b.ev(mean));
await b.ev(`__ui.renderQuality='Medium'`); await clickQ('#ctrlbar [title="Render the current view"]');
let done = false; for (let i = 0; i < 200 && !done; i++) { await sleep(150); done = await b.ev(`!!__ui.rq.job&&__ui.rq.job.phase===5`); }
check('Camera render completes in the RTR', done, await b.ev(`document.querySelector('#ctrlbar .phase')?.textContent`));
check('render status bar is black with ten dots', await b.ev(`document.getElementById('ctrlbar').classList.contains('rendering')&&document.querySelectorAll('#ctrlbar .dots i.on').length===10`));
writeFileSync(`${out}/render.png`, await b.shot());
const shotM = JSON.parse(await b.ev(mean));
const dc = Math.max(...live.map((v, i) => Math.abs(v - shotM[i])));
check('render matches live view', dc < 14, `live ${live.map(Math.round)} render ${shotM.map(Math.round)}`);
const saved = await b.ev(`(async()=>{const r=await __ui.rq.saveView();return r.blob.size})()`);
check('render saves as PNG', saved > 1000, `${saved} bytes`);
await clickQ('#ctrlbar [title^="Close and return"]'); await sleep(300);
check('closing the render restores the control bar', !(await b.ev(`document.getElementById('ctrlbar').classList.contains('rendering')`)) && !(await b.ev(`__app.hold`)));
// Uplink Queue: a small still and a QTVR
await b.ev(`(()=>{const j=__ui.rq.addJob('still',{quality:'Low'});j.w=160;j.h=90;const k=__ui.rq.addJob('qtvr',{quality:'Low'});k.w=k.h=64;__ui.panels.show('uplink',j)})()`);
await clickQ('#pbody .btn.hot');
for (let i = 0; i < 300; i++) { await sleep(150); if (await b.ev(`__ui.rq.queue.every(j=>j.status==='done')`)) break; }
check('Uplink Queue renders a still and a QTVR', await b.ev(`__ui.rq.queue.every(j=>j.status==='done'&&j.result)`), await b.ev(`JSON.stringify(__ui.rq.queue.map(j=>[j.kind,j.status,Math.round(j.ms||0)]))`));
// Movie: record, play back
await clickQ('#ptools [title="Movie"]');
await b.ev(`dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR'}));dispatchEvent(new KeyboardEvent('keyup',{code:'KeyR'}))`);
await b.ev(`__app.keys.add('KeyD')`); await sleep(1200); await b.ev(`__app.keys.clear()`);
await b.ev(`dispatchEvent(new KeyboardEvent('keydown',{code:'KeyT'}));dispatchEvent(new KeyboardEvent('keyup',{code:'KeyT'}))`);
const dur = await b.ev(`__app.movieDuration`);
await clickQ('#pbody [title="Play"]'); await sleep(300);
const playing = await b.ev(`!!__app.movie.play`); await sleep(1500);
check('Movie records and plays back', dur > 1 && playing && !(await b.ev(`!!__app.movie.play`)), `${dur.toFixed(2)} s, ${await b.ev(`__app.movie.frames.length`)} samples`);
await b.ev(`(()=>{const j=__ui.rq.addJob('movie',{quality:'Low'});j.w=96;j.h=54;j.fps=6;j.to=Math.max(1,Math.round(j.duration*6));j.name='t.zip'})()`);
await b.ev(`__ui.rq.startQueue()`);
for (let i = 0; i < 300; i++) { await sleep(150); if (await b.ev(`__ui.rq.queue.at(-1).status==='done'`)) break; }
check('movie renders to a PNG sequence', await b.ev(`!!__ui.rq.queue.at(-1).result`), await b.ev(`JSON.stringify(__ui.rq.queue.at(-1).ms)`));
// Log
await clickQ('#ptools [title="Log"]'); await clickQ('#pbody [title="Add this view to the Log"]');
check('Log records the place', (await b.ev(`document.querySelectorAll('#pbody .item').length`)) >= 1);
// Planet Wizard
await b.ev(`(async()=>{const m=await import('./src/wizard.js');m.openWizard(__ui)})()`); await sleep(300);
await clickQ('.dlg [title="Randomize all eight elements"]');
for (let i = 0; i < 60; i++) { await sleep(150); if (await b.ev(`!!document.querySelector('.zip img').getAttribute('src')`)) break; }
writeFileSync(`${out}/wizard.png`, await b.shot());
check('Planet Wizard builds a planet with a Zip Render', await b.ev(`!!document.querySelector('.zip img').getAttribute('src')&&__app.base.kind==='wizard'`));
await b.ev(`[...document.querySelectorAll('.dlg .foot button')].find(x=>x.textContent==='OK').click()`); await sleep(300);
check('Wizard OK keeps the new planet', await b.ev(`document.getElementById('modal').hidden&&__app.base.kind==='wizard'`));
// Pacing: once refinement finishes, the GPU gets no more work
await b.ev(`(()=>{__app.maxSamples=undefined;__app.maxOverride=8;__app.dirty=true})()`);
for (let i = 0; i < 200; i++) { await sleep(100); if (await b.ev(`!__app.moving&&__app.r.samples>=8`)) break; }
const f0 = await b.ev(`__app.r.frame`); await sleep(1500);
check('idle view stops using the GPU', (await b.ev(`__app.r.frame`)) === f0, `frames ${f0} → ${await b.ev(`__app.r.frame`)}`);
const pace = JSON.parse(await b.ev(`(async()=>{const a=__app,r=a.r;a.randomCam(true,.005);a.standAt(.002);a.maxOverride=64;a.dirty=true;await new Promise(q=>setTimeout(q,1000));const t0=performance.now(),s0=r.samples,k0=a.skipped||0,f0=a.frames;await new Promise(q=>setTimeout(q,3000));const dt=performance.now()-t0;return JSON.stringify({samples:r.samples-s0,perSample:r.cost.refine,bands:a.bands,duty:(r.samples-s0)*r.cost.refine/dt,busyFrames:((a.skipped||0)-k0)/(a.frames-f0)})})()`));
check('refinement at ground level leaves the GPU idle most frames', pace.busyFrames < .5 && pace.duty < .75, `GPU still busy at ${(pace.busyFrames * 100).toFixed(0)}% of display frames; timer duty ${(pace.duty * 100).toFixed(0)}% (${pace.samples} samples × ${pace.perSample.toFixed(0)} ms in 3 s, ~${pace.bands} strips)`);
await b.ev(`__app.maxOverride=undefined`);
check('no errors logged', !b.logs.some(l => /error|EXCEPTION/i.test(l)), b.logs.join(' | ').slice(0, 400));
check('context alive', !(await b.ev(`__app.r.gl.isContextLost()`)));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
b.close();
