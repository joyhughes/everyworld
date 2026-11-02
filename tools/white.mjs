// Which step of the UI sequence turns the planet white? Mean colour of the disc after each step.
import { writeFileSync } from 'node:fs';
import { open } from './cdp.mjs';
const out = process.argv[2];
const b = await open('http://127.0.0.1:8791/index.html#w7');
for (let i = 0; i < 60; i++) { if (await b.ev('!!window.__ready').catch(() => false)) break; await new Promise(r => setTimeout(r, 300)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
await b.ev(`__app.maxSamples=8`);
const measure = async name => {
  await b.ev(`__app.homeView()`);
  for (let i = 0; i < 80; i++) { await sleep(100); if (await b.ev(`__app.r.samples>=8&&!__app.moving`)) break; }
  const m = await b.ev(`(()=>{const a=__app,g=a.r.gl;a.r.present(1);const W=a.canvas.width,H=a.canvas.height,p=new Uint8Array(4*400);g.readPixels((W>>1)-10,(H>>1)-10,20,20,g.RGBA,g.UNSIGNED_BYTE,p);let s=[0,0,0];for(let i=0;i<400;i++)for(let c=0;c<3;c++)s[c]+=p[i*4+c];return s.map(v=>Math.round(v/400)).join(',')+' temp '+a.current.surf.temp.toFixed(1)+' cover '+a.current.clouds.cover.toFixed(2)+' sea '+a.current.sea.toFixed(2)+' hmax '+a.r.hmax.toFixed(1)+' out '+a.current.terrain.out})()`);
  console.log(name.padEnd(22), m);
};
const click = id => b.ev(`document.getElementById('${id}').click()`);
await measure('clean');
await b.ev(`(()=>{document.getElementById('tabMixers').click();const r=document.querySelector('[aria-label="Mountain spacing"]');r.value=.8;r.dispatchEvent(new Event('input'))})()`); await sleep(700);
await measure('spacing .8');
await b.ev(`(()=>{const c=document.querySelector('[aria-label="Blend"]');c.value=.5;c.dispatchEvent(new Event('input'))})()`); await sleep(700);
await measure('blend .5');
await b.ev(`(()=>{const c=document.querySelector('[aria-label="Blend"]');c.value=0;c.dispatchEvent(new Event('input'))})()`); await sleep(700);
await measure('blend back to 0');
await b.ev(`(()=>{const g=__app.base.terrain;g.nodes.push({id:'tt',type:'terrace',x:1350,y:200,params:{steps:8,sharp:.7},in:{a:g.out}});g.out='tt';return __app.rebuild()})()`);
await measure('terrace added');
await b.ev(`(()=>{const g=__app.base.terrain;g.out=g.nodes.find(n=>n.id==='tt').in.a;g.nodes=g.nodes.filter(n=>n.id!=='tt');return __app.rebuild()})()`);
await measure('terrace removed');
await click('tabBombs');
await b.ev(`[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Drop mesa').click()`); await sleep(1500);
await measure('bomb placed');
await b.ev(`[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Clear bombs').click()`); await sleep(1000);
await measure('bomb cleared');
await click('tabRender');
await b.ev(`(()=>{__app.renderSpp=8;[...document.querySelectorAll('#pane button')].find(x=>x.textContent==='Render still').click()})()`);
for (let i = 0; i < 150; i++) { await sleep(200); if (await b.ev(`!document.getElementById('result').hidden`)) break; }
await sleep(300); writeFileSync(`${out}/render2.png`, await b.shot());
await b.ev(`document.getElementById('rclose').click()`);
await measure('after render');
console.log(b.logs.join('\n')); b.close();
