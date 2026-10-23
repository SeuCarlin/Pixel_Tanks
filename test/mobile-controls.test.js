import test from 'node:test';
import assert from 'node:assert/strict';
import { aimFromDrag, stableMoveDirection } from '../shared/mobile-controls.js';

test('touch aim ignores taps and tiny accidental motion', () => {
  const initial = { angle: 45, power: 300, direction: 1 };
  assert.deepEqual(aimFromDrag(initial, 0, 0), { ...initial, changed: false });
  assert.deepEqual(aimFromDrag(initial, 8, 3), { ...initial, changed: false });
});

test('touch aim adjusts the saved vector gradually and can cross to the other direction', () => {
  const initial = { angle: 45, power: 300, direction: 1 };
  const small = aimFromDrag(initial, 35, -25);
  const larger = aimFromDrag(initial, 90, -65);
  assert.equal(small.changed, true);
  assert.ok(Math.abs(small.angle - initial.angle) < 12);
  assert.ok(larger.power > small.power);
  assert.equal(aimFromDrag(initial, -500, 0).direction, -1);
});

test('movement stick has a dead zone and retains its axis near diagonals', () => {
  assert.equal(stableMoveDirection(7, 4, '', true), '');
  assert.equal(stableMoveDirection(28, 22, 'right', true), 'right');
  assert.equal(stableMoveDirection(25, -30, 'up', true), 'up');
  assert.equal(stableMoveDirection(10, -32, '', true), 'up');
  assert.equal(stableMoveDirection(5, -35, '', false), '');
});
