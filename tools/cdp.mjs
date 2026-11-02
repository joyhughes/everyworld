// Headless Chrome on the real GPU, driven over CDP. Port 9555 / 8791 avoid other sessions' 9333, 9444.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function open(url, { w = 1280, h = 720, gpu = true } = {}) {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--remote-debugging-port=9555', gpu ? '--use-angle=metal' : '--use-angle=swiftshader', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
    '--disable-gpu-watchdog', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--mute-audio',
    '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'ew-')), `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1800));
  const tabs = await (await fetch('http://127.0.0.1:9555/json')).json();
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map(), logs = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const shot = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64');
  return { ev, shot, logs, send, close() { ws.close(); chrome.kill(); } };
}
