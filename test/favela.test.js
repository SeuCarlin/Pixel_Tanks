import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES } from '../shared/biomes.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';
import { TERRAIN_STYLES } from '../server/terrain.js';
import { activateScenarioObjects, createGame, sanitizeRules } from '../server/game.js';

function createFavela(seed = 'favela-test') {
  const room = { rules: sanitizeRules({ seed, mapType: 'favela', powerupCount: 0 }), players: [{ id: 'a', nickname: 'A', connected: true }, { id: 'b', nickname: 'B', bot: true, connected: true }] };
  return createGame(room);
}

test('Favela is selectable and places destructible shacks among the hills', () => {
  assert.ok(TERRAIN_STYLES.includes('favela'));
  assert.equal(BIOMES.favela.name, 'Favela');
  for (const seed of ['favela-a', 'favela-b', 'favela-c']) {
    const game = createFavela(seed);
    const heights = game.terrain.heights.slice(0, game.terrain.arenaWidth);
    assert.ok(Math.max(...heights) - Math.min(...heights) > 140);
    const shacks = game.objects.filter((object) => object.type === 'shack' && object.active);
    assert.ok(shacks.length >= 5, `${seed}: expected a neighborhood of shacks`);
    assert.ok(shacks.some((object) => object.flag), `${seed}: expected a flag`);
    for (const shack of shacks) {
      assert.ok(game.players.every((tank) => Math.abs(tank.x - shack.x) >= 60 || Math.abs(tank.y - shack.y) >= 70));
      assert.equal(projectileStructureAt([shack], shack.x, shack.y)?.id, shack.id);
    }
  }
});

test('A shack takes two hits and collapses into damaging debris', () => {
  const game = createFavela();
  game.terrain.heights.fill(760); game.terrain.floatingPlatforms = [];
  const shack = { id: 'test-shack', type: 'shack', x: 300, y: 720, groundY: 760, width: 90, height: 80, durability: 2, active: true };
  game.objects = [shack];
  game.players.forEach((tank, index) => { tank.x = index ? 800 : 100; tank.y = 751; });
  const first = activateScenarioObjects(game, 300, 710, 6, new Set(), game.players[0].id);
  assert.equal(shack.durability, 1); assert.ok(first.some((entry) => entry.type === 'shackHit'));
  const second = activateScenarioObjects(game, 300, 710, 6, new Set(), game.players[0].id);
  assert.equal(shack.active, false);
  assert.ok(second.some((entry) => entry.type === 'shackCollapse' && entry.fragments.length > 0));
  assert.equal(projectileStructureAt([shack], shack.x, shack.y), null);
});
