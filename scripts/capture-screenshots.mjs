import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.TANKDOTS_WARS_URL || process.env.PIXEL_TANKS_URL || 'http://localhost:3012';
const debugPort = 9333;
const profile = `${process.env.TEMP || '.'}\\tankdots-wars-screenshot-profile`;
const chrome = spawn(chromePath, [`--headless=new`, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1440,900', '--hide-scrollbars', baseUrl], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let tries = 0; tries < 30; tries += 1) {
  try { await fetch(`http://localhost:${debugPort}/json/version`); break; } catch { await sleep(200); }
}
const tabs = await (await fetch(`http://localhost:${debugPort}/json`)).json();
const tab = tabs.find((entry) => entry.type === 'page');
if (!tab) throw new Error('Chrome não abriu uma página para captura.');
const ws = new WebSocket(tab.webSocketDebuggerUrl); let serial = 0; const pending = new Map();
ws.onmessage = ({ data }) => { const message = JSON.parse(data); if (!message.id) return; const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result); };
await new Promise((resolve) => { ws.onopen = resolve; });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = (expression) => call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
const capture = async (name) => { const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(`docs/screenshots/${name}.png`, Buffer.from(result.data, 'base64')); };

await mkdir('docs/screenshots', { recursive: true }); await call('Page.enable'); await call('Runtime.enable'); await sleep(1800);
await evaluate(`localStorage.setItem('tankTutorialSeen','1'); document.querySelector('#tutorialModal').hidden=true; document.body.classList.remove('modal-open')`);
await capture('home');
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await sleep(300); await capture('home-mobile');
await call('Emulation.clearDeviceMetricsOverride'); await call('Emulation.setTouchEmulationEnabled', { enabled: false });
await evaluate(`(() => { const f=document.querySelector('#createForm'); f.nickname.value='Comandante Dot'; f.roomName.value='Arena Showcase'; f.maxPlayers.value='4'; f.botCount.value='3'; f.gameSpeed.value='1.5'; f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); })()`);
await sleep(1200); await capture('lobby');
await evaluate(`document.querySelector('#arsenalButton').click()`); await sleep(400); await capture('arsenal');
await evaluate(`document.querySelector('#arsenalClose').click(); document.querySelector('#startButton').click()`); await sleep(800); await capture('arsenal-countdown');
await sleep(25000); await capture('roulette');
await sleep(6000); await capture('battle');
await call('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true, screenWidth: 844, screenHeight: 390 });
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await sleep(600); await capture('battle-mobile');
await call('Emulation.clearDeviceMetricsOverride'); await call('Emulation.setTouchEmulationEnabled', { enabled: false });
await evaluate(`window.__capturePass=setInterval(()=>{const b=document.querySelector('#passButton');if(b&&!b.disabled)b.click()},250)`); await sleep(6000); await capture('powerup-cards'); await evaluate(`clearInterval(window.__capturePass)`);
ws.close(); chrome.kill();
console.log('Screenshots salvos em docs/screenshots/.');
