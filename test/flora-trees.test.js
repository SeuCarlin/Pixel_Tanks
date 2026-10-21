import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScenarioObjects, applyArenaPulse, createGame, nextTurn, sanitizeRules, tickRoom } from '../server/game.js';
import { applyExplosion } from '../server/physics.js';
import { walkPath } from '../shared/movement.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';
import { WORLD } from '../shared/constants.js';
import { waterDepthAt } from '../shared/flood.js';

function match(seed = 'flora-tree-tests', enabledEvents = []) {
  const room = { rules: sanitizeRules({ seed, mapType: 'flat', powerupCount: 0, mines: false, enabledEvents }), players: [
    { id: 'one', nickname: 'One', color: '#fff', connected: true },
    { id: 'two', nickname: 'Two', color: '#f66', connected: true },
  ] };
  room.game = createGame(room); room.game.phase = 'playing';
  return room;
}

test('every generated scenario contains small, medium and giant trees with walkable branch chunks', () => {
  for (const mapType of ['flat', 'hills', 'highlands', 'islands', 'canyon', 'platforms']) {
    const room = match(`three-tree-scales-${mapType}`); room.rules.mapType = mapType; room.game = createGame(room); const game = room.game;
    for (const type of ['treeSmall', 'treeMedium', 'treeLarge']) assert.ok(game.objects.some((object) => object.type === type), `${mapType}:${type}`);
    const giant = game.objects.find((object) => object.type === 'treeLarge');
    const branches = game.terrain.floatingPlatforms.filter((platform) => platform.treeId === giant.id);
    assert.ok(branches.length >= 20, mapType);
    assert.ok(branches.every((branch) => branch.kind === 'treeBranch' && branch.active && branch.durability > 0), mapType);
  }
});

test('small tree conceals without blocking projectiles while medium and giant trunks are solid', () => {
  const objects = [
    { id: 'small', type: 'treeSmall', x: 100, groundY: 500, width: 32, height: 40, active: true },
    { id: 'medium', type: 'treeMedium', x: 200, groundY: 500, width: 62, height: 112, active: true },
    { id: 'large', type: 'treeLarge', x: 320, groundY: 500, width: 82, height: 390, active: true },
  ];
  assert.equal(projectileStructureAt(objects, 100, 480), null);
  assert.equal(projectileStructureAt(objects, 200, 450)?.id, 'medium');
  assert.equal(projectileStructureAt(objects, 320, 230)?.id, 'large');
  assert.equal(projectileStructureAt(objects, 220, 410), null, 'foliage does not intercept a projectile');
  assert.equal(projectileStructureAt(objects, 350, 120), null, 'giant foliage does not intercept a projectile');
});

test('a tank drives continuously across adjacent branch chunks and falls through a blasted hole', () => {
  const game = match('branch-microterrain').game; const giant = game.objects.find((object) => object.type === 'treeLarge');
  const row = game.terrain.floatingPlatforms.filter((platform) => platform.treeId === giant.id && platform.branchRow === 'main').sort((a, b) => a.x - b.x);
  const first = row[0]; const second = row[1];
  const player = { x: first.x + first.width - 2, y: first.y - WORLD.tankRadius, supportPlatformId: first.id };
  const crossed = walkPath(game.terrain, player, 1, 10, game.objects);
  assert.equal(crossed.supportPlatformId, second.id);
  Object.assign(game.players[0], { x: second.x + second.width / 2, y: second.y - WORLD.tankRadius, supportPlatformId: second.id, platformOffset: second.width / 2, airborne: null });
  applyExplosion(game, second.x + second.width / 2, second.y, 52, 0, { verticalBeam: true, beamWidth: 18 });
  assert.equal(second.active, false);
  assert.equal(game.players[0].supportPlatformId, null);
  assert.equal(game.players[0].airborne?.falling, true);
});

test('explosions damage every tree scale and destroying a giant drops all of its branches', () => {
  const game = match('tree-destruction').game;
  for (const tree of game.objects.filter((object) => object.type.startsWith('tree'))) {
    const before = tree.durability;
    activateScenarioObjects(game, tree.x, tree.groundY - tree.height / 2, 12, new Set(), 'one');
    assert.equal(tree.durability, Math.max(0, before - 1));
  }
  const giant = game.objects.find((object) => object.type === 'treeLarge');
  while (giant.active) activateScenarioObjects(game, giant.x, giant.groundY - giant.height / 2, 12, new Set(), 'one');
  assert.ok(game.terrain.floatingPlatforms.filter((platform) => platform.treeId === giant.id).every((branch) => !branch.active));
});

test('fire consumes trees faster, spreads from their canopy and rapidly weakens wooden branches', () => {
  const room = match('tree-fire-spread'); const game = room.game; game.terrain.heights.fill(760); game.terrain.floatingPlatforms = [];
  game.objects = [
    { id: 'small-fire', type: 'treeSmall', treeSize: 'small', x: 400, y: 741, groundY: 760, width: 32, height: 38, durability: 1, maxDurability: 1, active: true },
    { id: 'medium-fire', type: 'treeMedium', treeSize: 'medium', x: 465, y: 704, groundY: 760, width: 62, height: 112, durability: 2, maxDurability: 2, active: true },
    { id: 'large-fire', type: 'treeLarge', treeSize: 'large', x: 600, y: 565, groundY: 760, width: 82, height: 390, durability: 5, maxDurability: 5, active: true },
  ];
  game.terrain.floatingPlatforms.push({ id: 'burning-branch', treeId: 'large-fire', kind: 'treeBranch', x: 520, baseX: 520, y: 560, width: 160, height: 12, durability: 64, maxDurability: 64, active: true });
  game.fireZones = [{ id: 'test-fire', x: 420, y: 760, radius: 125, turnsLeft: 3, ownerId: 'one', source: 'molotov' }];
  nextTurn(room);
  assert.equal(game.objects[0].active, false);
  assert.equal(game.objects[1].active, false);
  assert.equal(game.objects[2].durability, 5);
  assert.ok(game.fireZones.some((zone) => zone.source === 'tree'));
  game.fireZones[0].x = 600; game.fireZones[0].y = 560; game.fireZones[0].lastAppliedRound = 0;
  nextTurn(room);
  assert.equal(game.terrain.floatingPlatforms[0].durability, 20);
});

test('Tempo de Flora warns with seed clusters and grows new sets without carving terrain', () => {
  const room = match('flora-event-only', ['flora']); const game = room.game; game.turnNumber = 3;
  const beforeTrees = game.objects.filter((object) => object.type.startsWith('tree')).length; const beforeTerrain = [...game.terrain.heights];
  const event = applyArenaPulse(room);
  assert.equal(event.type, 'flora'); assert.ok(event.seeds.length >= 4); assert.ok(event.seeds.some((seed) => seed.cluster === 'ancestral'));
  game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(room);
  assert.equal(event.warning, false); assert.ok(event.grownTreeIds.length >= 10);
  assert.ok(game.objects.filter((object) => object.type.startsWith('tree')).length > beforeTrees);
  assert.deepEqual(game.terrain.heights, beforeTerrain);
});

test('island trees and Flora growth never spawn on submerged lake columns', () => {
  for (const seed of ['dry-trees-a', 'dry-trees-b', 'dry-trees-c']) {
    const room = match(seed, ['flora']);
    room.rules.mapType = 'islands';
    room.game = createGame(room);
    const game = room.game;
    game.phase = 'playing';
    const isDry = (tree) => {
      const halfWidth = Math.ceil(tree.width / 2) + 4;
      for (let x = Math.round(tree.x - halfWidth); x <= tree.x + halfWidth; x += 5) {
        assert.equal(waterDepthAt(game.terrain, game.waterZones, x, game.terrain.heights[x]), 0, `${seed}: ${tree.id} at ${x}`);
      }
    };
    for (const tree of game.objects.filter((object) => object.type.startsWith('tree'))) isDry(tree);
    game.turnNumber = 3;
    const event = applyArenaPulse(room);
    assert.equal(event.type, 'flora');
    for (const entry of event.seeds) assert.equal(waterDepthAt(game.terrain, game.waterZones, entry.x, game.terrain.heights[entry.x]), 0);
    game.pendingArenaEvent.executeAt = Date.now() - 1;
    tickRoom(room);
    for (const tree of game.objects.filter((object) => object.type.startsWith('tree'))) isDry(tree);
  }
});
