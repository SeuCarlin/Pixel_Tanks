import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, fire, publicGame, sanitizeRules, updateWaterCannonStreams } from '../server/game.js';

const destination = 'output/web-game/continuous-forces';
await mkdir(destination, { recursive: true });
const makeRoom = (classType, weapon) => {
  const room = { rules: sanitizeRules({ seed: `qa-${weapon}`, mapType: 'flat', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'one', nickname: 'QA', classType, color: '#67deff', arsenal: [weapon, 'heavy', 'jump'] },
    { id: 'two', nickname: 'Alvo', classType: 'healer', color: '#ff755c' },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 2; room.game.openingRestrictionsActive = false;
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.powerups = []; room.game.mines = [];
  room.game.players[0].x = 600; room.game.players[0].y = 691; room.game.players[0].facing = 1;
  room.game.players[1].x = 800; room.game.players[1].y = 691;
  return room;
};

const waterRoom = makeRoom('amphibian', 'waterCannon');
const waterShot = fire(waterRoom, 'one', { weapon: 'waterCannon', angle: 0, direction: 1, power: 300 });
const crossingRoom = makeRoom('amphibian', 'waterCannon');
crossingRoom.game.players[1].y = 500;
const crossingShot = fire(crossingRoom, 'one', { weapon: 'waterCannon', angle: 0, direction: 1, power: 300 });
const crossingBefore = structuredClone(publicGame(crossingRoom.game, 'one'));
crossingRoom.game.players[1].y = crossingShot[0].path[0].y;
updateWaterCannonStreams(crossingRoom.game, crossingRoom.game.waterCannonStreams[0].startedAt + 300);
const crossingAfter = publicGame(crossingRoom.game, 'one');
const gravityRoom = makeRoom('backpacker', 'gravity');
const gravityShot = fire(gravityRoom, 'one', { weapon: 'gravity', angle: 75, direction: 1, power: 180 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  const url = process.env.QA_URL || 'http://localhost:3101';
  await page.route('**/qa-continuous-forces', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#081626"><div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas></div></body></html>' }));
  await page.goto(`${url}/qa-continuous-forces`);
  const preview = async (state, results, screenshot, elapsedMs) => {
    await page.evaluate(async ({ state, results }) => {
      const { Renderer } = await import('/renderer.js');
      const canvas = document.querySelector('#scene');
      const renderer = window.qaRenderer || new Renderer(canvas);
      renderer.setPlayer('one'); renderer.setGame(state);
      renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
      renderer.camera.zoom = 1.15; renderer.camera.x = 360; renderer.camera.y = 120; renderer.clampCamera();
      renderer.playShot({ shooterId: 'one', results });
      window.qaRenderer = renderer;
    }, { state, results });
    await page.waitForTimeout(elapsedMs);
    const result = await page.evaluate(() => ({ shotIndex: window.qaRenderer.shotIndex(window.qaRenderer.shots[0], performance.now()), pathLength: window.qaRenderer.shots[0].path.length, exploded: window.qaRenderer.shots[0].exploded, renderErrorAt: window.qaRenderer.lastRenderErrorAt }));
    await page.screenshot({ path: `${destination}/${screenshot}`, animations: 'disabled' });
    assert.equal(result.exploded, false, `the effect must still be visible at ${elapsedMs}ms`);
    assert.ok(result.shotIndex < result.pathLength);
    assert.equal(result.renderErrorAt, -Infinity);
    return result;
  };
  const water = await preview(publicGame(waterRoom.game, 'one'), waterShot, 'water-jet-midway.png', 900);
  await page.evaluate(({ before, after, results }) => {
    const renderer = window.qaRenderer;
    renderer.setGame(before); renderer.playShot({ shooterId: 'one', results }); renderer.setGame(after);
  }, { before: crossingBefore, after: crossingAfter, results: crossingShot });
  await page.waitForTimeout(550);
  const crossing = await page.evaluate(() => ({ hits: window.qaRenderer.game.lastWaterCannonHits.length, feedback: window.qaRenderer.floaters.some((floater) => floater.text.includes('JATO')), renderErrorAt: window.qaRenderer.lastRenderErrorAt }));
  assert.equal(crossing.hits, 1);
  assert.equal(crossing.feedback, true);
  assert.equal(crossing.renderErrorAt, -Infinity);
  await page.screenshot({ path: `${destination}/water-jet-late-hit.png`, animations: 'disabled' });
  const gravity = await preview(publicGame(gravityRoom.game, 'one'), gravityShot, 'gravity-flight.png', 300);
  await page.waitForTimeout(1750);
  const gravityActive = await page.evaluate(() => ({ active: window.qaRenderer.gravityAnimations.length, exploded: window.qaRenderer.shots[0]?.exploded, renderErrorAt: window.qaRenderer.lastRenderErrorAt }));
  assert.ok(gravityActive.active > 0 && gravityActive.exploded, 'the vortex must appear after impact');
  assert.equal(gravityActive.renderErrorAt, -Infinity);
  await page.screenshot({ path: `${destination}/gravity-vortex.png`, animations: 'disabled' });
  await page.goto(url);
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#libraryButton').click();
  await page.locator('[data-library="arsenal"]').click();
  const art = [];
  for (const [type, query] of [['kineticCannon', 'cinético'], ['cryoMortar', 'criogênico'], ['meteorSalvo', 'meteórica']]) {
    await page.locator('#librarySearch').fill(query);
    const card = page.locator('#libraryGrid .library-card').first();
    const image = await card.locator('.atlas-arsenal').evaluate((node) => getComputedStyle(node).backgroundImage);
    assert.match(image, new RegExp(`${type}-v2\\.png`));
    await card.screenshot({ path: `${destination}/${type}-card.png` });
    art.push({ type, image });
  }
  await writeFile(`${destination}/state.json`, JSON.stringify({ water, crossing, gravity, gravityActive, art, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ water, crossing, gravity, gravityActive, art: art.map((entry) => entry.type), errors }));
} finally {
  await browser.close();
}
