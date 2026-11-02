// Contact sheet: orbit + scouted view per seed, tiled by the browser. node tools/sheet.mjs <out.png> <seeds...>
import { writeFileSync } from 'node:fs';
import { open } from './cdp.mjs';
const [out, ...seeds] = process.argv.slice(2);
const b = await open(`http://127.0.0.1:8791/dev.html#${seeds[0]}`, { w: 1440, h: 810 });
for (let i = 0; i < 40; i++) { if (await b.ev('!!window.__ready').catch(() => false)) break; await new Promise(r => setTimeout(r, 400)); }
await b.ev(`window.__t=[];document.body.style.background='#000';null`);
const grab = () => b.ev(`(()=>{const c=document.createElement('canvas');c.width=360;c.height=202;__app.r.present(__app.current.exposure);c.getContext('2d').drawImage(__app.canvas,0,0,360,202);window.__t.push(c);return 1})()`);
const settle = async n => { for (let i = 0; i < 80; i++) { if (await b.ev(`__app.r.samples>=${n}&&!__app.moving`)) break; await new Promise(r => setTimeout(r, 100)); } };
for (const s of seeds) {
  await b.ev(`__app.maxSamples=8;__app.loadWorld(__gen(${s})).then(()=>{__app.dirty=true})`);
  await settle(6); await grab();
  console.log(s, await b.ev(`(__app.scout(true),__app.current.kind+' '+__app.current.name+' sea '+__app.current.sea.toFixed(2)+' hi '+__app.r.hmax.toFixed(1))`));
  await new Promise(r => setTimeout(r, 200)); await settle(6); await grab();
}
await b.ev(`(()=>{document.body.innerHTML='';const n=__t.length,cols=4;const c=document.createElement('canvas');c.width=360*cols;c.height=202*Math.ceil(n/cols);const x=c.getContext('2d');__t.forEach((t,i)=>x.drawImage(t,(i%cols)*360,Math.floor(i/cols)*202));c.style.cssText='display:block;width:1440px';document.body.append(c);return 1})()`);
await new Promise(r => setTimeout(r, 300));
writeFileSync(out, await b.shot()); console.log(b.logs.join('\n')); b.close();
