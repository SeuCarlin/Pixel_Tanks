import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestAim, traceAim } from '../shared/aim-assist.js';
import { WORLD } from '../shared/constants.js';
import { simulateShot } from '../server/physics.js';

const terrain = { heights: Array(WORLD.width).fill(800), floatingPlatforms: [] };

test('mobile aim suggestion follows the ordinary server projectile with wind', () => {
  const shooter = { id: 'me', x: 200, y: 791, alive: true };
  const target = { id: 'enemy', x: 650, y: 791, alive: true };
  const suggestion = suggestAim({ terrain, players: [shooter, target], shooterId: shooter.id, origin: shooter, target, gravity: 120, wind: 18 });
  assert.ok(suggestion);
  assert.equal(suggestion.direction, 1);
  assert.ok(suggestion.error <= 14, `estimated miss ${suggestion.error}`);
  const actual = simulateShot({ terrain, players: [shooter, target], ignorePlayerId: shooter.id, x: shooter.x, y: shooter.y, angle: suggestion.angle, power: suggestion.power, gravity: 120, wind: 18, direction: suggestion.direction });
  assert.equal(actual.impact?.playerId, target.id);
});

test('aim suggestion works to the left and respects an intervening platform', () => {
  const shooter = { id: 'me', x: 650, y: 791, alive: true };
  const target = { id: 'enemy', x: 200, y: 791, alive: true };
  const blocked = [{ id: 'bridge', x: 390, y: 680, width: 100, height: 8, active: true }];
  const suggestion = suggestAim({ terrain, players: [shooter, target], shooterId: shooter.id, origin: shooter, target, gravity: 120, wind: -12, platforms: blocked });
  assert.ok(suggestion);
  assert.equal(suggestion.direction, -1);
  const traced = traceAim({ terrain, players: [shooter, target], shooterId: shooter.id, origin: shooter, angle: suggestion.angle, power: suggestion.power, direction: -1, gravity: 120, wind: -12, platforms: blocked });
  assert.deepEqual(traced, suggestion.impact);
  assert.ok(suggestion.error < 75, `estimated miss ${suggestion.error}`);
});

test('hidden targets do not produce a suggested trajectory', () => {
  assert.equal(suggestAim({ terrain, players: [], shooterId: 'me', origin: { x: 100, y: 700 }, target: { id: 'hidden', x: null, y: null }, gravity: 120 }), null);
});
