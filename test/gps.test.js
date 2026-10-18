import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../shared/constants.js';
import { simulateShot } from '../server/physics.js';
import { createGame, fire, sanitizeRules } from '../server/game.js';

function scenario(count) {
  const terrain = { heights: Array(WORLD.width).fill(900), floatingPlatforms: [] };
  const target = { id: 'target', x: 1050, y: 891, alive: true };
  const objects = Array.from({ length: count }, (_, index) => ({
    id: `wall-${index + 1}`, type: 'building', x: 270 + index * 180,
    width: 60, height: 390, groundY: 900, active: true,
  }));
  return { terrain, objects, players: [target], ignorePlayerId: 'shooter', guidedTarget: target, x: 100, y: 740, angle: 45, power: 320, gravity: 120 };
}

test('GPS routes around three solid structures and reaches its target', () => {
  const input = scenario(3);
  const result = simulateShot(input);
  assert.equal(result.impact?.playerId, 'target');
  assert.equal(result.gpsDetours, 3);
  assert.ok(result.path.some((point) => point.y < 500), 'the missile should visibly climb over the buildings');
  for (const point of result.path.slice(0, -2)) {
    assert.ok(point.y < input.terrain.heights[Math.round(point.x)], 'the GPS path must stay above intact ground');
    assert.ok(input.objects.every((wall) => point.x < wall.x - wall.width / 2 || point.x > wall.x + wall.width / 2 || point.y < wall.groundY - wall.height || point.y > wall.groundY), 'the GPS path must not cut through structures');
  }
});

test('GPS stops at the fourth structure instead of ignoring every obstacle', () => {
  const result = simulateShot(scenario(4));
  assert.equal(result.impact?.structureId, 'wall-4');
  assert.equal(result.gpsDetours, 3);
  assert.notEqual(result.impact?.playerId, 'target');
});

test('GPS can pass around a platform and a structure in the same shot', () => {
  const input = scenario(1);
  input.terrain.floatingPlatforms.push({ id: 'deck', active: true, x: 600, y: 800, width: 180, height: 16 });
  const result = simulateShot(input);
  assert.equal(result.impact?.playerId, 'target');
  assert.equal(result.gpsDetours, 2);
  assert.ok(result.path.length > 20);
});

test('equipped GPS uses the obstacle route in a live turn and consumes its card', () => {
  const room = { rules: sanitizeRules({ seed: 'gps-live-three-walls', powerupCount: 0 }), players: [{ id: 'shooter', nickname: 'Shooter' }, { id: 'target', nickname: 'Target' }] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0;
  const [shooter, target] = room.game.players;
  shooter.x = 100; shooter.y = 740; shooter.facing = 1;
  target.x = 1050; target.y = 891;
  room.game.terrain.heights.fill(900); room.game.terrain.floatingPlatforms = [];
  room.game.objects = scenario(3).objects;
  shooter.inventory.push('guidedBullet'); shooter.selectedPowerup = 'guidedBullet';
  const [shot] = fire(room, shooter.id, { angle: 45, power: 320, direction: 1, weapon: 'standard' });
  assert.equal(shot.impact?.playerId, target.id);
  assert.equal(shot.gpsDetours, 3);
  assert.ok(!shooter.inventory.includes('guidedBullet'));
});
