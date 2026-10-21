import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/flora-trees';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(process.env.QA_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { GameNetwork } = await import('/network.js');
    const { Renderer } = await import('/renderer.js');
    const originalSetGame = Renderer.prototype.setGame;
    Renderer.prototype.setGame = function (...args) { window.__qaRenderer = this; return originalSetGame.apply(this, args); };
    const originalEmit = GameNetwork.prototype.emit;
    GameNetwork.prototype.emit = function (type, detail) {
      window.__qaNetwork = this;
      if (type === 'GAME_STATE') {
        if (window.__qaFrozen && !window.__qaInjecting) return;
        window.__qaLatestState = structuredClone(detail);
      }
      return originalEmit.call(this, type, detail);
    };
  });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 25000 });
  if (await page.locator('#trainingClose').isVisible()) await page.locator('#trainingClose').click();

  await page.evaluate(() => {
    window.__qaFrozen = true;
    const state = structuredClone(window.__qaLatestState); const local = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    state.turnIndex = state.players.indexOf(local); state.roundNumber = 4; state.openingRestrictionsActive = false; state.actions = { movesLeft: 2, attackAvailable: true };
    state.terrain.heights.fill(780); state.mines = []; state.powerups = []; state.fireZones = [];
    const branchRows = [
      { key: 'main', left: 720, width: 540, y: 565 },
      { key: 'upper-left', left: 755, width: 185, y: 455 },
      { key: 'upper-right', left: 1040, width: 185, y: 455 },
      { key: 'lower-left', left: 735, width: 155, y: 655 },
      { key: 'lower-right', left: 1090, width: 155, y: 655 },
    ];
    state.terrain.floatingPlatforms = branchRows.flatMap((row) => { const count = Math.ceil(row.width / 45); return Array.from({ length: count }, (_, index) => {
      const width = Math.ceil(row.width / count) + 1; return { id: `qa-large-branch-${row.key}-${index}`, treeId: 'qa-large', branchRow: row.key, kind: 'treeBranch', x: Math.round(row.left + index * row.width / count), baseX: Math.round(row.left + index * row.width / count), y: row.y, width, height: 12, moving: false, durability: index === 4 && row.key === 'main' ? 19 : 64, maxDurability: 64, active: !(index === 7 && row.key === 'main') };
    }); });
    state.objects = [
      { id: 'qa-small', type: 'treeSmall', treeSize: 'small', x: 390, y: 760, groundY: 780, width: 34, height: 40, durability: 1, maxDurability: 1, canopyRadius: 34, foliageSeed: 1221, active: true },
      { id: 'qa-medium', type: 'treeMedium', treeSize: 'medium', x: 590, y: 721, groundY: 780, width: 64, height: 118, durability: 2, maxDurability: 2, canopyRadius: 46, foliageSeed: 404, active: true },
      { id: 'qa-large', type: 'treeLarge', treeSize: 'large', x: 990, y: 580, groundY: 780, width: 86, height: 400, durability: 4, maxDurability: 5, canopyRadius: 250, crownWidth: 540, branchRows, foliageSeed: 8820, active: true },
    ];
    state.players.forEach((player, index) => { player.airborne = null; player.supportPlatformId = null; player.platformOffset = null; player.x = index ? 845 : 390; player.y = index ? 556 : 771; });
    if (state.players[1]) { state.players[1].supportPlatformId = 'qa-large-branch-main-2'; state.players[1].platformOffset = 20; }
    window.__qaState = state; window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    const renderer = window.__qaRenderer; renderer.setCameraMode('fixed'); renderer.camera.zoom = 1.05; renderer.camera.x = 210; renderer.camera.y = 260; renderer.clampCamera(); renderer.fixedCameraInitialized = true;
  });
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${output}/tree-scales-and-branches.png` });
  const treeState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  if (!treeState.players.some((player) => player.concealedByTree)) errors.push('small-tree concealment missing from text state');
  if (treeState.treeBranches.length < 20) errors.push(`only ${treeState.treeBranches.length} tree branches exposed`);
  for (const type of ['treeSmall', 'treeMedium', 'treeLarge']) if (!treeState.objects.some((object) => object.type === type)) errors.push(`${type} missing from rendered state`);

  await page.evaluate(() => {
    const state = structuredClone(window.__qaState); state.fireZones = [{ id: 'qa-tree-fire', x: 590, y: 720, radius: 112, turnsLeft: 3, source: 'tree', sourceObjectId: 'qa-medium' }];
    state.objects.find((object) => object.id === 'qa-medium').burningUntilRound = 7;
    state.objects.find((object) => object.id === 'qa-large').burningUntilRound = 7;
    state.terrain.floatingPlatforms.filter((branch) => branch.treeId === 'qa-large' && branch.branchRow === 'lower-right').forEach((branch) => { branch.burningUntilRound = 7; branch.durability = 20; });
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${output}/tree-fire-and-damage.png` });

  await page.evaluate(() => {
    const event = { id: 'qa-flora', type: 'flora', warning: true, label: 'TEMPO DE FLORA', executeAt: Date.now() + 3000, seeds: [
      { id: 'seed-a', x: 470, y: 780, radius: 170, cluster: 'grove' },
      { id: 'seed-b', x: 920, y: 780, radius: 280, cluster: 'ancestral' },
      { id: 'seed-c', x: 1280, y: 780, radius: 205, cluster: 'dense' },
    ], impacts: [], drops: [] };
    window.__qaRenderer.playArenaEvent(event, Date.now());
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/flora-seed-warning.png` });
  const finalText = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await writeFile(`${output}/results.json`, JSON.stringify({ players: finalText.players, objects: finalText.objects, treeBranches: finalText.treeBranches, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
