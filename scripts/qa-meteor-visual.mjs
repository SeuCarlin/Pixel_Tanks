import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, fire, publicGame, sanitizeRules } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

const room = { rules: sanitizeRules({ seed: 'meteor-visual-qa', powerupCount: 0, enabledEvents: [], classesEnabled: false }), players: [
  { id: 'shooter', nickname: 'Meteoro', color: '#b7ec58', arsenal: ['meteorSalvo'] },
  { id: 'target', nickname: 'Alvo', color: '#ff755c', arsenal: ['meteorSalvo'] },
] };
room.game = createGame(room);
room.game.phase = 'playing';
room.game.terrain.heights.fill(760);
room.game.terrain.floatingPlatforms = [];
room.game.objects = []; room.game.mines = []; room.game.powerups = [];
room.game.players[0].x = 180;
room.game.players[1].x = 1080;
for (const player of room.game.players) { player.y = 760 - WORLD.tankRadius; player.turnsPlayed = 1; player.classType = null; }
const before = structuredClone(publicGame(room.game, 'shooter'));
const results = fire(room, 'shooter', { weapon: 'meteorSalvo', angle: 38, power: 285, direction: 1 });
const after = publicGame(room.game, 'shooter');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const output = 'output/web-game/meteor-visual';
await mkdir(output, { recursive: true });
try {
  await page.goto(`${process.env.QA_URL || 'http://localhost:3000'}/health`);
  const initial = await page.evaluate(async ({ before, after, results }) => {
    document.body.innerHTML = '<canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas>';
    document.body.style.margin = '0';
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    window.qaRenderer = renderer;
    window.qaMeteorSounds = 0;
    renderer.onMeteorImpact = () => { window.qaMeteorSounds += 1; };
    renderer.setPlayer('shooter');
    renderer.setGame(before);
    renderer.playShot({ shooterId: 'shooter', results });
    renderer.setGame(after);
    const shot = renderer.shots[0];
    shot.started = performance.now() - renderer.shotDuration({ results }) * 1000 - 50;
    renderer.draw(performance.now());
    return { queued: renderer.meteorAnimations.length, pendingWorld: Boolean(renderer.pendingPlayers) };
  }, { before, after, results });
  assert.equal(initial.queued, 2);
  assert.equal(initial.pendingWorld, true);
  await page.waitForTimeout(470);
  await page.locator('#scene').screenshot({ path: `${output}/falling.png` });
  const falling = await page.evaluate(() => ({ active: window.qaRenderer.meteorAnimations.filter((meteor) => !meteor.impacted).length, pendingWorld: Boolean(window.qaRenderer.pendingPlayers) }));
  assert.ok(falling.active > 0, 'secondary meteors should visibly fall before exploding');
  assert.equal(falling.pendingWorld, true, 'world reveal waits for both meteors');
  await page.waitForTimeout(1150);
  await page.locator('#scene').screenshot({ path: `${output}/impact.png` });
  const impact = await page.evaluate(() => ({ active: window.qaRenderer.meteorAnimations.filter((meteor) => !meteor.impacted).length, pendingWorld: Boolean(window.qaRenderer.pendingPlayers), echoes: window.qaRenderer.impactEchoes.filter((echo) => echo.kind === 'meteorSalvo').length, soundCues: window.qaMeteorSounds }));
  assert.equal(impact.active, 0);
  assert.equal(impact.pendingWorld, false);
  assert.ok(impact.echoes >= 2);
  assert.equal(impact.soundCues, 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ initial, falling, impact, errors }));
} finally {
  await browser.close();
}
