import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('output/web-game/climate-cycle', { recursive: true });
try {
  await page.goto('http://localhost:3000');
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#createForm [name="nickname"]').fill('ClimaQA');
  await page.locator('#createForm .home-advanced > summary').click();
  await page.locator('#createForm [name="mapType"]').selectOption('platforms');
  await page.locator('#createForm [name="seed"]').fill('rain-10');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor();
  await page.locator('#arsenalButton').click();
  const cards = page.locator('#arsenalCatalog [data-arsenal]');
  for (let index = 0; index < 3; index += 1) await cards.nth(index).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton:not([disabled])').waitFor();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => { try { return JSON.parse(window.render_game_to_text()).phase === 'playing'; } catch { return false; } }, { timeout: 22000 });
  await page.waitForFunction(() => { try { return JSON.parse(window.render_game_to_text()).weather?.visual?.ambient > .2; } catch { return false; } }, { timeout: 12000 });
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.weather.kind, 'clear');
  assert.ok(state.weather.visual.rain > .2 && state.weather.visual.rain <= .3);
  assert.equal(state.weather.lakes.length, 0);
  await page.locator('#gameCanvas').screenshot({ path: 'output/web-game/climate-cycle/ambient-rain.png' });
  await page.screenshot({ path: 'output/web-game/climate-cycle/ambient-game.png', fullPage: true });
  assert.equal(state.currentPlayerId, state.localPlayerId);
  assert.equal(state.fire.enabled, true);
  await page.locator('#fireButton').click();
  await page.waitForFunction((turn) => { try { const next = JSON.parse(window.render_game_to_text()); return next.shots.length > 0 || next.turn > turn; } catch { return false; } }, state.turn, { timeout: 10000 });
  const afterShot = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.ok(afterShot.weather.visual.rain > 0);
  await page.locator('#gameCanvas').screenshot({ path: 'output/web-game/climate-cycle/rain-shot.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ phase: state.phase, rain: state.weather.visual.rain, clouds: state.weather.visual.cloud, lakes: state.weather.lakes.length, shotSeen: true, errors }));
} finally {
  await browser.close();
}
