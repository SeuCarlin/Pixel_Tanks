import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

const room = { rules: sanitizeRules({ seed: 'drill-visual-qa', powerupCount: 0, enabledEvents: [], classesEnabled: false }), players: [
  { id: 'qa-a', nickname: 'QA A', color: '#caff45', arsenal: [] }, { id: 'qa-b', nickname: 'QA B', color: '#ff6b5a', arsenal: [] },
] };
const game = createGame(room);
game.phase = 'playing'; game.terrain.heights.fill(560); game.terrain.floatingPlatforms = [];
game.objects = []; game.powerups = []; game.mines = [];
for (const [index, player] of game.players.entries()) { player.x = 520 + index * 850; player.y = 560 - WORLD.tankRadius; }
const before = publicGame(game);
const after = structuredClone(before);
for (let x = 760; x <= 1040; x += 1) {
  const distance = Math.abs(x - 900);
  after.terrain.heights[x] += Math.round(165 * Math.max(0, 1 - distance / 140));
}

const destination = 'output/web-game/drill-visual';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(process.env.QA_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ before, after }) => {
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;z-index:9999;width:1280px;height:720px;background:#081321"><canvas id="qaCanvas" width="1280" height="720" style="width:1280px;height:720px"></canvas></div>');
    const { Renderer } = await import('/renderer.js');
    const originalFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    const renderer = new Renderer(document.querySelector('#qaCanvas'));
    window.requestAnimationFrame = originalFrame;
    renderer.setGame(before);
    renderer.cameraMode = 'fixed'; renderer.camera = { x: 260, y: 175, zoom: .85 };
    const shot = { weapon: 'standard', bunkerBuster: true, impact: { x: 900, y: 560 }, radius: 124, path: [{ x: 900, y: 530 }, { x: 900, y: 560 }], damage: [] };
    renderer.spawnExplosion(shot);
    renderer.pendingTerrain = after.terrain.heights;
    renderer.shots = [{ ...shot, exploded: true, started: performance.now() }];
    renderer.flushPendingState();
    window.__qaDrillRenderer = renderer;
    window.__qaDrillBefore = before.terrain.heights;
    window.__qaDrillAfter = after.terrain.heights;
  }, { before, after });
  for (const [name, elapsed] of [['start', 0], ['middle', 2000], ['end', 4000]]) {
    const heights = await page.evaluate((elapsed) => {
      const renderer = window.__qaDrillRenderer;
      const now = performance.now();
      renderer.applyTerrain(window.__qaDrillBefore, false);
      renderer.drillTerrainReveal = { before: window.__qaDrillBefore, target: window.__qaDrillAfter, drills: [{ x: 900, y: 560, started: now - elapsed, duration: 4000 }], lastFrameAt: 0 };
      renderer.drillAnimations = [{ x: 900, y: 560, started: now - elapsed, duration: 4000 }];
      renderer.updateDrillTerrain(now);
      renderer.draw(now);
      return renderer.terrainHeights[900];
    }, elapsed);
    await page.locator('#qaCanvas').screenshot({ path: `${destination}/${name}.png` });
    if (name === 'start' && heights !== 560) errors.push(`start: ${heights}`);
    if (name === 'middle' && !(heights > 560 && heights < 725)) errors.push(`middle: ${heights}`);
    if (name === 'end' && heights !== 725) errors.push(`end: ${heights}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
