// Loads the app, waits for it to settle, saves a screenshot and prints console output.
// node tools/smoke.mjs <out.png> [js to run after load] [width] [height]
import { open } from './cdp.mjs';
import { writeFileSync } from 'node:fs';
const [out = '/tmp/ew.png', js = '', w = 1280, h = 800] = process.argv.slice(2);
const b = await open('http://127.0.0.1:8791/', { w: +w, h: +h });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 80 && !ok; i++) { await sleep(150); ok = await b.ev('!!window.__ready || !document.getElementById("fail").hidden').catch(() => false); }
const failText = await b.ev('document.getElementById("fail").hidden ? "" : document.getElementById("fail").textContent').catch(e => e.message);
if (js) { try { console.log('result:', JSON.stringify(await b.ev(js))); } catch (e) { console.log('js error:', e.message); } }
await sleep(2500);
writeFileSync(out, await b.shot());
console.log('fail:', failText || 'none');
console.log(b.logs.slice(0, 30).join('\n'));
b.close();
