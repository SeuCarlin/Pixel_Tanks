import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules, updateFireZonePhysics, updateWaterPhysics } from '../server/game.js';

function scene(mapType) {
  const room = { rules: sanitizeRules({ mapType, seed: `visual-${mapType}`, powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'one', nickname: 'UM', color: '#b7ec58', connected: true },
    { id: 'two', nickname: 'DOIS', color: '#ff755c', connected: true },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0;
  if (mapType === 'technology') {
    const game = room.game; const x = game.players[0].x + 110;
    game.waterZones = [{ id: 'qa-ice', x, radius: 100, surfaceY: game.terrain.heights[Math.round(x)] - 28, frozenUntilRound: 3, fluid: true }];
    updateWaterPhysics(game);
    game.fireZones = [{ id: 'qa-fire', x: x + 245, y: game.terrain.heights[Math.round(x + 245)], radius: 90, turnsLeft: 3, source: 'molotov' }];
    updateFireZonePhysics(game);
  }
  return publicGame(room.game, 'one');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const output = 'output/web-game/sky-ice-fire'; await mkdir(output, { recursive: true });
try {
  await page.goto(`${process.env.QA_URL || 'http://localhost:3000'}/health`);
  for (const type of ['skylands', 'technology', 'plains']) {
    const state = scene(type);
    const result = await page.evaluate(async ({ snapshot, type }) => {
      document.body.innerHTML = '<div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas></div>';
      document.body.style.margin = '0';
      const { Renderer } = await import('/renderer.js');
      const renderer = new Renderer(document.querySelector('#scene'));
      renderer.setPlayer('one'); renderer.setGame(snapshot); renderer.setCameraMode('fixed');
      renderer.camera = { x: snapshot.players[0].x - 630, y: type === 'skylands' ? 90 : 300, zoom: type === 'skylands' ? .68 : .9 };
      renderer.clampCamera(); renderer.draw(performance.now());
      window.qaRenderer = renderer;
      return { platforms: snapshot.terrain.floatingPlatforms.filter((platform) => platform.active).length, players: snapshot.players.map((player) => [player.x, player.y]), camera: renderer.camera };
    }, { snapshot: state, type });
    await page.waitForTimeout(120);
    await page.locator('#scene').screenshot({ path: `${output}/${type}.png` });
    assert.equal(result.players.length, 2);
    console.log(type, JSON.stringify(result));
  }
  assert.deepEqual(errors, []);
  console.log('page errors:', errors.length);
} finally { await browser.close(); }
