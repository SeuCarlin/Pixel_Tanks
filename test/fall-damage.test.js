import assert from 'node:assert/strict';
import test from 'node:test';
import { FALL_CLASS_MULTIPLIER, fallDamage } from '../shared/fall-damage.js';

test('dano de queda cresce com altura e respeita a proteção de cada classe', () => {
  assert.equal(fallDamage(100, 'attacker'), 0);
  assert.ok(fallDamage(300, 'attacker') < fallDamage(600, 'attacker'));
  assert.ok(fallDamage(400, 'ninja') < fallDamage(400, 'armored'));
  assert.ok(fallDamage(400, 'armored') < fallDamage(400, 'backpacker'));
  assert.equal(fallDamage(600, 'backpacker', true), 0);
  assert.equal(Object.keys(FALL_CLASS_MULTIPLIER).length, 8);
});
