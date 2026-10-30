import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATTACKER_SPRITE, attackerSpriteFrame } from '../client/attacker-sprite.js';

test('Atacante usa os quadros separados de parado, movimento e disparo', () => {
  assert.equal(attackerSpriteFrame({ time: 0 }), 0);
  assert.equal(attackerSpriteFrame({ time: 901 }), 1);
  assert.equal(attackerSpriteFrame({ time: 315, moving: true }), 3);
  assert.deepEqual([0, 84, 168, 252, 336].map((elapsed) => attackerSpriteFrame({ time: 1000 + elapsed, shotStarted: 1000 })), [5, 6, 7, 8, 9]);
  assert.equal(attackerSpriteFrame({ time: 1420, shotStarted: 1000, moving: true }), Math.floor(1420 / 105) % 5);
});

test('faixa PNG do Atacante tem exatamente dez quadros completos', () => {
  const png = readFileSync(new URL('../client/assets/tanks/attacker-idle-move-fire-v1.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), ATTACKER_SPRITE.frameWidth * ATTACKER_SPRITE.frames);
  assert.equal(png.readUInt32BE(20), ATTACKER_SPRITE.frameHeight);
});
