import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const directory = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node scripts/qa-itch.mjs <extracted game directory>');
const output = path.resolve('output/web-game/itch');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name === '/wrapper') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><style>html,body{margin:0;width:100%;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms" allow="autoplay; fullscreen" src="/nested/itch/index.html"></iframe>');
    return;
  }
  if (!name.startsWith('/nested/itch/')) { res.writeHead(404).end(); return; }
  const file = path.resolve(directory, name.slice('/nested/itch/'.length) || 'index.html');
  if (!file.startsWith(directory + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/nested/itch/index.html`;
if (process.env.SERVE_ONLY) { console.log(url); await new Promise(() => {}); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.addInitScript(() => localStorage.setItem('tankTutorialSeen', '1'));
const host = await context.newPage(), errors = [], requests = [];
let page = host;
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('websocket', socket => errors.push(`Unexpected network socket: ${socket.url()}`));
page.on('request', request => requests.push(request.url()));
page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  await host.goto(url.replace('/nested/itch/index.html', '/wrapper'));
  page = await (await host.locator('iframe').elementHandle()).contentFrame();
  await page.locator('#audioPromptSkip').click();
  await page.waitForFunction(() => document.querySelector('#connectionText').textContent === 'modo local pronto');
  await page.locator('#audioTestButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.ready);
  await page.waitForTimeout(3500);
  assert.ok(requests.some(request => request.includes('/sounds/') && request.includes('.wav')), 'Audio test must load packaged sounds');
  assert.equal(await page.locator('#accountButton').isVisible(), false);
  assert.equal(await page.locator('[data-tab="join"]').isVisible(), false);
  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', { timeout: 30000 });
  await page.locator('#trainingClose').click();
  await page.waitForTimeout(1000);
  assert.equal((await state()).players.length, 2);
  await host.screenshot({ path: path.join(output, 'training.png') });
  // Launch the actual normal setup flow in a fresh page.
  await page.goto(url);
  await page.locator('#audioPromptSkip').click();
  await page.locator('#createForm [name="nickname"]').fill('Offline QA');
  await page.locator('#createForm [name="botCount"]').selectOption('2');
  await page.locator('#createForm button[type="submit"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).lobbyPlayers?.length === 3);
  await page.locator('#arsenalButton').click();
  await page.locator('#classCatalog [data-class-type="armored"]').click();
  await page.locator('#classNext').click();
  for (const card of await page.locator('#arsenalCatalog [data-arsenal]').all()) {
    if (await page.locator('#arsenalSelectedCount').textContent() === '3 / 3') break;
    await card.click();
  }
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('#fireButton').disabled, { timeout: 60000 });
  const before = await state();
  await context.setOffline(true);
  await page.locator('#fireButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shots.length > 0);
  await host.screenshot({ path: path.join(output, 'offline-shot.png') });
  await page.waitForFunction(turn => JSON.parse(window.render_game_to_text()).turn > turn, before.turn, { timeout: 60000 });
  await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.currentPlayerId === s.localPlayerId && !document.querySelector('#fireButton').disabled; }, { timeout: 90000 });
  await host.screenshot({ path: path.join(output, 'offline-after-bots.png') });
  await writeFile(path.join(output, 'state.json'), JSON.stringify(await state(), null, 2));
  // Network-off errors from late lazy media requests are recorded separately.
  assert.deepEqual(errors.filter(error => !error.includes('ERR_INTERNET_DISCONNECTED')), []);
  assert.equal(requests.some(request => /\/(api\/account|host-info)/.test(request)), false);
  console.log(JSON.stringify({ passed: true, requests: requests.length, offlineTurn: (await state()).turn, errors }));
} catch (error) { await host.screenshot({ path: path.join(output, 'failure.png') }); console.error(JSON.stringify({ errors, state: await state().catch(() => null), requests: requests.slice(-15) })); throw error; }
finally { await browser.close(); server.close(); }
