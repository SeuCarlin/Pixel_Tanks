import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const destination = 'output/web-game/shot-launch';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const gameState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  await page.goto('http://localhost:3000');
  await page.locator('#audioPromptEnable').click();
  await page.locator('#audioPrompt').waitFor({ state: 'hidden', timeout: 6000 });
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#createForm [name="nickname"]').fill('QA Disparo');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm [name="botDifficulty"]').selectOption('easy');
  await page.locator('#createForm [name="health"]').selectOption('200');
  await page.locator('#createForm [name="turnSeconds"]').selectOption('15');
  await page.locator('#createForm [name="gameSpeed"]').selectOption('2');
  await page.locator('#createForm [name="mapType"]').selectOption('flat');
  await page.locator('#createForm [name="powerupCount"]').selectOption('0');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; });
  await page.locator('#createForm [name="enabledEvents"]').evaluateAll((inputs) => { for (const input of inputs) input.checked = false; });
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#arsenalButton').click();
  for (const weapon of ['heavy', 'zeus', 'gravity']) await page.locator(`#arsenalCatalog [data-arsenal="${weapon}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 55000 });
  await page.evaluate(async () => {
    const { Renderer } = await import('/renderer.js');
    const { BattleAudio } = await import('/audio.js');
    const original = Renderer.prototype.spawnMuzzle;
    window.__launches = [];
    window.__soundLaunches = [];
    const playSound = BattleAudio.prototype.shoot;
    BattleAudio.prototype.shoot = function (flight, weapon, hits, effect) { window.__soundLaunches.push({ weapon, ready: this.isReady() }); return playSound.call(this, flight, weapon, hits, effect); };
    Renderer.prototype.spawnMuzzle = function (shooter, shot) {
      window.__shotRenderer = this;
      const before = this.particles.length;
      original.call(this, shooter, shot);
      window.__launches.push({ shooterId: shooter.id, weapon: shot.weapon, style: this.muzzleBursts.at(-1)?.type, particles: this.particles.length - before, x: this.muzzleBursts.at(-1)?.x, y: this.muzzleBursts.at(-1)?.y });
    };
  });
  await page.waitForFunction(() => { const state = JSON.parse(window.render_game_to_text()); return state.currentPlayerId === state.localPlayerId; }, null, { timeout: 35000 });
  await page.locator('#weaponSelector [data-weapon="standard"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).fire.enabled, null, { timeout: 6000 });
  await page.evaluate(() => { window.__soundLaunches.length = 0; });
  await page.locator('#fireButton').click();
  await page.waitForFunction(() => window.__launches?.some((launch) => launch.weapon === 'standard' && launch.shooterId === JSON.parse(window.render_game_to_text()).localPlayerId), null, { timeout: 10000 });
  await page.screenshot({ path: `${destination}/standard-real.png` });
  const localId = (await gameState()).localPlayerId;
  const standard = (await page.evaluate(() => window.__launches)).find((launch) => launch.weapon === 'standard' && launch.shooterId === localId);
  assert.equal(standard.style, 'kinetic'); assert.ok(standard.particles >= 25);
  assert.ok((await page.evaluate(() => window.__soundLaunches)).some((launch) => launch.weapon === 'standard' && launch.ready));
  await page.waitForFunction(() => { const state = JSON.parse(window.render_game_to_text()); return state.round >= 2 && state.currentPlayerId === state.localPlayerId; }, null, { timeout: 45000 });
  await page.locator('#weaponSelector [data-weapon="heavy"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).fire.enabled, null, { timeout: 6000 });
  await page.evaluate(() => { window.__soundLaunches.length = 0; });
  await page.locator('#fireButton').click();
  await page.waitForFunction(() => window.__launches?.some((launch) => launch.weapon === 'heavy' && launch.shooterId === JSON.parse(window.render_game_to_text()).localPlayerId), null, { timeout: 10000 });
  await page.screenshot({ path: `${destination}/heavy-real.png` });
  const heavy = (await page.evaluate(() => window.__launches)).find((launch) => launch.weapon === 'heavy' && launch.shooterId === localId);
  assert.equal(heavy.style, 'heavy'); assert.ok(heavy.particles > standard.particles);
  assert.ok((await page.evaluate(() => window.__soundLaunches)).some((launch) => launch.weapon === 'heavy' && launch.ready));
  for (const weapon of ['zeus', 'gravity', 'soapBomb']) {
    await page.evaluate((kind) => {
      const renderer = window.__shotRenderer;
      const shooter = renderer.visualPlayers.get(JSON.parse(window.render_game_to_text()).localPlayerId);
      renderer.spawnMuzzle(shooter, { weapon: kind, path: [{ x: shooter.x + 18, y: shooter.y - 12 }, { x: shooter.x + 28, y: shooter.y - 22 }] });
    }, weapon);
    await page.screenshot({ path: `${destination}/${weapon}-preview.png` });
  }
  await writeFile(`${destination}/state.json`, await page.evaluate(() => window.render_game_to_text()));
  await writeFile(`${destination}/launches.json`, JSON.stringify(await page.evaluate(() => window.__launches), null, 2));
  await writeFile(`${destination}/sound-launches.json`, JSON.stringify(await page.evaluate(() => window.__soundLaunches), null, 2));
  await writeFile(`${destination}/errors.json`, JSON.stringify(errors, null, 2));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ standard, heavy, errors }));
} catch (error) {
  await page.screenshot({ path: `${destination}/failure.png` });
  await writeFile(`${destination}/failure-state.json`, await page.evaluate(() => window.render_game_to_text()));
  throw error;
} finally {
  await browser.close();
}
