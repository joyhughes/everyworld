// Steps through the main features and saves a screenshot after each. node tools/tour.mjs <outdir>
import { open } from './cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/ewtour'; mkdirSync(out, { recursive: true });
const b = await open('http://127.0.0.1:8791/', { w: 1280, h: 800 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 80; i++) { await sleep(150); if (await b.ev('!!window.__ready').catch(() => false)) break; }
const idle = async (n = 60) => { for (let i = 0; i < n; i++) { await sleep(150); if (await b.ev('!__app.moving && __app.r.samples >= Math.min(__app.maxSamples, 12)')) break; } };
const snap = async name => { writeFileSync(`${out}/${name}.png`, await b.shot()); console.log('shot', name, JSON.stringify(await b.ev(`({agl:__app.cam.altAboveGround,mode:__app.mode,samples:__app.r.samples,scale:__app.r.scale,move:__app.r.cost.move,refine:__app.r.cost.refine,bands:__app.bands,skipped:__app.skipped||0})`))); };
const step = async (name, js, wait = 1200) => { try { await b.ev(js); } catch (e) { console.log(name, 'ERROR', e.message); } await sleep(wait); await idle(); await snap(name); };
await step('01-random-walk', `__app.randomCam(true, .005)`);
await step('02-stand-2m', `__app.standAt(.002)`);
await step('03-walk-forward', `(async()=>{__app.keys.add('KeyW');await new Promise(r=>setTimeout(r,1500));__app.keys.clear()})()`, 600);
await step('04-wireframe', `(()=>{__app.r.style=2;__app.dirty=true})()`);
await step('05-fly', `(()=>{__app.r.style=1;__ui.setMode('fly');__app.popUp();__app.keys.add('KeyW');setTimeout(()=>__app.keys.clear(),800)})()`, 2000);
await step('06-wizard', `(async()=>{const m=await import('./src/wizard.js');m.openWizard(__ui);document.querySelector('.dlg .row .ib').click()})()`, 4000);
await step('07-wizard-ok', `[...document.querySelectorAll('.dlg .foot button')].find(x=>x.textContent==='OK').click()`, 800);
await step('08-generator', `(()=>{__ui.generator.toggle(true);__ui.generator.openEditor('land');__ui.generator.openGraph()})()`, 1500);
await step('09-render', `(()=>{document.querySelectorAll('#windows .win').forEach(w=>w.close());__ui.generator.toggle(false);__ui.renderQuality='Low';document.querySelector('#ctrlbar [title="Render the current view"]').click()})()`, 6000);
await step('10-uplink', `(()=>{__ui.rq.closeView();const j=__ui.rq.addJob('still',{quality:'Low',thumb:__ui.thumb(96,54)});j.w=320;j.h=180;__ui.panels.show('uplink',j);__ui.rq.startQueue()})()`, 6000);
await step('11-movie', `(async()=>{__ui.panels.show('movie');__app.recordStart();__app.keys.add('KeyD');await new Promise(r=>setTimeout(r,1200));__app.keys.clear();__app.recordStop()})()`, 500);
await step('12-time', `__ui.panels.show('time')`, 300);
await step('13-log', `(()=>{__ui.panels.addLog();__ui.panels.show('log')})()`, 300);
console.log(b.logs.slice(0, 40).join('\n'));
b.close();
