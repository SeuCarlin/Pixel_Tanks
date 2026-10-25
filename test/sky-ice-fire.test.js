import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, growFloraCluster, sanitizeRules, tickRoom, updateFireZonePhysics, updateWaterPhysics } from '../server/game.js';
import { generateTerrain, findSpawns } from '../server/terrain.js';
import { WORLD } from '../shared/constants.js';
import { waterDepthAt } from '../shared/flood.js';
import { advanceTallBodies, advanceWoodDebris, settleScenarioObjects } from '../server/physics.js';

function match(type = 'skylands', count = 2, seed = `qa-${type}-${count}`) {
  const room = { rules: sanitizeRules({ mapType: type, seed, enabledEvents: [], powerupCount: 8 }), players: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, nickname: `P${index}`, color: '#fff', connected: true })) };
  room.game = createGame(room);
  return room.game;
}

test('four sky islands spread ten safe spawns and provide moving launch pads', () => {
  const terrain = generateTerrain('sky-10', 'skylands', 10);
  const islands = terrain.floatingPlatforms.filter((platform) => platform.kind === 'skyIsland');
  const pads = terrain.floatingPlatforms.filter((platform) => platform.kind === 'rescuePad');
  assert.equal(islands.length, 4); assert.equal(pads.length, 8);
  const spawns = findSpawns(terrain, 10);
  assert.equal(new Set(spawns.map((spawn) => spawn.x)).size, 10);
  assert.ok(spawns.every((spawn) => islands.some((island) => island.id === spawn.supportPlatformId && spawn.x >= island.x + 25 && spawn.x <= island.x + island.width - 25)));
  assert.ok(terrain.heights.slice(0, terrain.arenaWidth).every((height) => height > WORLD.height));
  const game = match('skylands', 2);
  assert.ok(game.powerups.every((item) => item.y < WORLD.height && item.supportPlatformId));
  assert.ok(game.mines.every((item) => item.y < WORLD.height && item.supportPlatformId));
});

test('a lower rescue pad bounces a falling tank; missing the arena eliminates it', () => {
  const game = match('skylands'); game.phase = 'playing';
  const pad = game.terrain.floatingPlatforms.find((platform) => platform.kind === 'rescuePad');
  const tank = game.players[0]; const now = Date.now();
  tank.x = pad.x + pad.width / 2; tank.y = pad.y - WORLD.tankRadius - 8; tank.supportPlatformId = null; tank.platformOffset = null;
  tank.airborne = { vx: 0, vy: 280, falling: true, startY: tank.y - 100, minY: tank.y - 100, updatedAt: now - 90 };
  tickRoom({ game, rules: { turnSeconds: 30, gameSpeed: 1, botDifficulty: 'normal' } });
  assert.ok(tank.alive); assert.ok(tank.airborne?.vy < -500); assert.equal(tank.lastLaunch?.kind, 'rescuePad');
  tank.x = Math.max(20, pad.x - 130); tank.y = WORLD.height - 12;
  tank.airborne = { vx: 0, vy: 240, falling: true, startY: 500, minY: 500, updatedAt: Date.now() - 90 };
  tickRoom({ game, rules: { turnSeconds: 30, gameSpeed: 1, botDifficulty: 'normal' } });
  assert.equal(tank.alive, false);
});

test('technological terrain is nearly level with many ramps and flying carriers', () => {
  const terrain = generateTerrain('technology-10', 'technology', 10);
  const heights = terrain.heights.slice(0, terrain.arenaWidth);
  assert.ok(Math.max(...heights) - Math.min(...heights) < 200);
  assert.ok(terrain.platforms.length >= 25);
  assert.ok(terrain.floatingPlatforms.filter((platform) => platform.kind === 'hoverCarrier').length >= 4);
});

test('Tecnopolis replaces trees and conventional construction with interactive equipment', () => {
  for (const count of [2, 6, 10]) {
    const game = match('technology', count, `tech-decor-${count}`);
    assert.ok(game.objects.some((object) => object.type === 'radar'));
    assert.ok(game.objects.some((object) => ['shockCoil', 'shieldGenerator', 'ammoTerminal', 'repulsor'].includes(object.type)));
    assert.ok(game.objects.every((object) => !object.type.startsWith('tree') && object.type !== 'crane' && object.type !== 'watchtower'));
    assert.ok(game.terrain.floatingPlatforms.every((platform) => platform.kind !== 'treeBranch'));
    assert.ok(game.objects.filter((object) => object.type === 'building').every((object) => object.techFacade));
    const seed = { x: game.players[0].x + 140, cluster: 'dense' };
    const grown = growFloraCluster(game, seed);
    assert.ok(grown.every((id) => id.startsWith('flora-tech-')));
    assert.ok(game.objects.every((object) => !object.type.startsWith('tree')));
  }
});

test('flat field keeps a truly level floor while retaining platforms and structures', () => {
  const game = match('plains', 6);
  assert.ok(game.terrain.heights.slice(0, game.terrain.arenaWidth).every((height) => height === 780));
  assert.ok(game.terrain.floatingPlatforms.filter((platform) => platform.active).length >= 10);
  assert.ok(game.objects.some((object) => object.type === 'building'));
  assert.ok(game.objects.some((object) => object.type === 'crane'));
});

test('lake ice becomes a breakable physical platform and does not instantly respawn', () => {
  const game = match('flat'); game.terrain.heights.fill(850);
  game.waterZones = [{ id: 'frozen-test', x: 500, radius: 120, surfaceY: 760, frozenUntilRound: 4, fluid: true }];
  updateWaterPhysics(game, 1000);
  const ice = game.terrain.floatingPlatforms.find((platform) => platform.kind === 'iceSheet');
  assert.ok(ice?.active); assert.equal(ice.y, 760);
  const slider = game.players[0]; slider.x = 500; slider.y = ice.y - 9; slider.supportPlatformId = ice.id; slider.platformOffset = slider.x - ice.x; slider.iceVelocity = 120; slider.lastDriveAt = 900; slider.lastIceDriftAt = 1000;
  updateWaterPhysics(game, 1100);
  assert.ok(slider.x > 500, 'ice carries the tank briefly after movement ends');
  ice.active = false; updateWaterPhysics(game, 1100);
  assert.equal(ice.active, false); assert.equal(game.waterZones[0].iceBrokenUntilRound, 4);
});

test('frozen lakes form separate ice sheets only above wet terrain columns', () => {
  const game = match('flat');
  game.terrain.heights.fill(420);
  for (let x = 380; x < 440; x += 1) game.terrain.heights[x] = 540;
  for (let x = 550; x < 615; x += 1) game.terrain.heights[x] = 550;
  game.terrain.floatingPlatforms = [];
  game.players = [];
  game.waterZones = [{ id: 'two-pockets', x: 500, radius: 155, surfaceY: 475, frozenUntilRound: game.roundNumber + 2, fluid: true }];
  updateWaterPhysics(game, 1000);
  const sheets = game.terrain.floatingPlatforms.filter((platform) => platform.kind === 'iceSheet' && platform.active);
  assert.equal(sheets.length, 2);
  assert.ok(sheets.every((sheet) => sheet.width < 90));
  assert.ok(sheets.every((sheet) => sheet.x + sheet.width <= 450 || sheet.x >= 540), 'dry space between pools stays open');
  game.terrain.heights.fill(420, 380, 440);
  updateWaterPhysics(game, 1300);
  const surviving = game.terrain.floatingPlatforms.filter((platform) => platform.kind === 'iceSheet' && platform.active);
  assert.equal(surviving.length, 1, 'ice without supporting water disappears');
  surviving[0].active = false;
  updateWaterPhysics(game, 1600);
  assert.equal(game.terrain.floatingPlatforms.filter((platform) => platform.kind === 'iceSheet' && platform.active).length, 0, 'a destroyed patch does not regenerate during this freeze');
});

test('broken trunks fall over time, rotate and bounce instead of snapping to the ground', () => {
  const game = match('flat'); game.terrain.heights.fill(780); game.terrain.floatingPlatforms = []; game.players = [];
  const log = { id: 'falling-log', type: 'woodDebris', fragmentKind: 'trunk', active: true, x: 500, y: 480, groundY: 500, width: 38, height: 40, vx: 80, vy: -55, angularVelocity: 3, rotation: 0, physicsAt: 1000, bounceCount: 0 };
  game.objects = [log];
  settleScenarioObjects(game);
  assert.equal(log.groundY, 500, 'the generic structure solver leaves flying wood alone');
  advanceWoodDebris(game, 1100);
  assert.ok(log.x > 500 && log.groundY < 780 && log.rotation > 0);
  for (let now = 1200; now <= 3000; now += 100) advanceWoodDebris(game, now);
  assert.ok(log.bounceCount >= 1, 'the log lands and bounces');
  assert.ok(log.lastWoodImpact?.speed > 105, 'the collision is recorded for feedback');
  assert.ok(log.groundY <= 780);
});

test('a large tree falls with its branch platform after losing its supporting ground', () => {
  const game = match('flat'); game.terrain.heights.fill(760); game.players = [];
  const tree = { id: 'falling-tree', type: 'treeLarge', treeSize: 'large', x: 500, y: 470, groundY: 560, width: 56, height: 180, durability: 4, active: true, branchRows: [{ y: 440, left: 460, width: 90 }] };
  const branch = { id: 'falling-tree-branch', treeId: tree.id, kind: 'treeBranch', x: 460, y: 440, width: 90, height: 10, active: true };
  game.objects = [tree]; game.terrain.floatingPlatforms = [branch];
  settleScenarioObjects(game);
  assert.equal(tree.groundY, 560, 'the trunk must not snap to the lower terrain');
  tree.fallingBody.physicsAt = 1000;
  advanceTallBodies(game, 1100);
  assert.ok(tree.groundY > 560 && tree.groundY < 760);
  assert.equal(Math.round(branch.y - 440), Math.round(tree.groundY - 560));
  for (let now = 1200; now <= 2400 && tree.fallingBody; now += 100) advanceTallBodies(game, now);
  assert.equal(tree.groundY, 760);
  assert.equal(branch.y, 640);
  assert.equal(tree.lastFall.physical, true);
});

test('wood integrates the full 300 ms room tick instead of moving in short jumps', () => {
  const game = match('flat'); game.terrain.heights.fill(900); game.terrain.floatingPlatforms = []; game.players = [];
  const log = { id: 'smooth-log', type: 'woodDebris', fragmentKind: 'trunk', active: true, x: 500, y: 480, groundY: 500, width: 38, height: 40, vx: 100, vy: 0, angularVelocity: 2, rotation: 0, physicsAt: 1000, bounceCount: 0 };
  game.objects = [log];
  advanceWoodDebris(game, 1300);
  assert.ok(log.x >= 528, `the log traveled ${log.x - 500} blocks in 300 ms`);
  assert.ok(log.groundY > 500 && log.rotation > .5);
});

test('a landed trunk keeps rolling across successive room snapshots', () => {
  const game = match('flat'); game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.players = [];
  const log = { id: 'rolling-log', type: 'woodDebris', fragmentKind: 'trunk', active: true, x: 500, y: 680, groundY: 700, width: 38, height: 40, vx: 100, vy: 0, angularVelocity: 0, rotation: 0, physicsAt: 1000, bounceCount: 0 };
  game.objects = [log];
  advanceWoodDebris(game, 1300);
  assert.ok(log.x > 520 && log.vx > 45, 'the first contact does not stop horizontal motion');
  const firstX = log.x;
  advanceWoodDebris(game, 1600);
  assert.ok(log.x > firstX + 10 && log.rotation > 0, 'wood rolls and rotates on the next snapshot');
});

test('wood comes to rest and cannot ring against the same floor indefinitely', () => {
  const game = match('flat'); game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.players = [];
  const log = { id: 'quiet-log', type: 'woodDebris', fragmentKind: 'trunk', active: true, x: 500, y: 450, groundY: 470, width: 38, height: 40, vx: 60, vy: 0, angularVelocity: 2, rotation: 0, physicsAt: 1000, bounceCount: 0 };
  game.objects = [log];
  for (let now = 1100; now <= 9000; now += 100) advanceWoodDebris(game, now);
  assert.equal(log.groundY, 700);
  assert.equal(log.vx, 0);
  assert.equal(log.vy, 0);
  assert.equal(log.angularVelocity, 0);
  assert.ok(log.woodImpactSounds <= 2);
  const impactSerial = log.lastWoodImpact?.serial;
  for (let now = 9100; now <= 18000; now += 100) advanceWoodDebris(game, now);
  assert.equal(log.lastWoodImpact?.serial, impactSerial, 'a resting trunk stays silent');
  assert.equal(log.bounceCount <= 3, true);
});

test('flames stay on their own supports until destruction finishes, then fall independently', () => {
  const game = match('flat'); game.terrain.heights.fill(800); game.terrain.floatingPlatforms = [
    { id: 'left', x: 450, baseX: 450, y: 590, width: 55, height: 12, active: true, durability: 100 },
    { id: 'right', x: 505, baseX: 505, y: 590, width: 55, height: 12, active: true, durability: 100 },
  ];
  game.fireZones = [{ id: 'split', x: 505, y: 590, radius: 52, turnsLeft: 3, source: 'molotov' }];
  updateFireZonePhysics(game, 1000);
  const left = game.fireZones[0].flames.find((flame) => flame.supportId === 'left');
  const right = game.fireZones[0].flames.find((flame) => flame.supportId === 'right');
  assert.ok(left && right);
  game.lastBattleAnimationUntil = 1450; game.terrain.floatingPlatforms[0].active = false;
  updateFireZonePhysics(game, 1100);
  assert.equal(left.y, 590); assert.equal(right.y, 590);
  updateFireZonePhysics(game, 1400);
  assert.equal(left.y, 590); assert.equal(right.y, 590);
  for (let now = 1530; now <= 2630; now += 100) updateFireZonePhysics(game, now);
  assert.ok(left.y > 590); assert.equal(right.y, 590);
});

test('archipelago buildings never overlap submerged lake columns', () => {
  for (let seed = 0; seed < 12; seed += 1) {
    const game = match('archipelago', 2, `lake-buildings-${seed}`);
    const buildings = game.objects.filter((object) => object.type === 'building' && object.active && !object.supportPlatformId);
    for (const building of buildings) for (let x = building.x - building.width / 2; x <= building.x + building.width / 2; x += 8) {
      assert.ok(waterDepthAt(game.terrain, game.waterZones, x, game.terrain.heights[Math.round(x)]) < 8, `${building.id} occupies a lake`);
    }
  }
});
