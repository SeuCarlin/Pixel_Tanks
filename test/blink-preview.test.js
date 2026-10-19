import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../shared/constants.js';
import { blinkLanding } from '../shared/movement.js';
import { createGame, sanitizeRules, usePowerup } from '../server/game.js';

const flat = () => ({ heights: Array(WORLD.width).fill(700) });

test('Blink preview reports horizontal distance and the same safe landing used by the server', () => {
  const player = { id: 'me', x: 400, y: 700 - WORLD.tankRadius, alive: true };
  const terrain = flat();
  assert.deepEqual(blinkLanding(terrain, [player], player, 550), {
    valid: true, distance: 150, maxRange: 270, landing: { x: 550, y: 700 - WORLD.tankRadius },
  });
  assert.equal(blinkLanding(terrain, [player], player, 671).valid, false);
  assert.match(blinkLanding(terrain, [player], player, 671).reason, /270/);
});

test('Blink preview shifts away from occupied and broken terrain and rejects a missing landing', () => {
  const terrain = flat();
  const player = { id: 'me', x: 400, y: 700 - WORLD.tankRadius, alive: true };
  const enemy = { id: 'other', x: 550, y: 700 - WORLD.tankRadius, alive: true };
  const occupied = blinkLanding(terrain, [player, enemy], player, 550);
  assert.equal(occupied.valid, true);
  assert.ok(Math.abs(occupied.landing.x - enemy.x) >= 28);
  for (let x = 450; x <= 650; x += 1) terrain.heights[x] = WORLD.height;
  const unsafe = blinkLanding(terrain, [player, enemy], player, 550);
  assert.equal(unsafe.valid, false);
  assert.match(unsafe.reason, /pouso seguro/);
});

test('the accepted Blink action lands exactly on its shared preview', () => {
  const room = {
    rules: sanitizeRules({ seed: 'blink-preview', powerupCount: 0, enabledEvents: [] }),
    players: [{ id: 'me', nickname: 'Me', classType: 'ninja', arsenal: ['jump'] }, { id: 'other', nickname: 'Other', arsenal: ['jump'] }],
  };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0;
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.powerups = []; room.game.mines = [];
  const [player, enemy] = room.game.players;
  Object.assign(player, { x: 400, y: 700 - WORLD.tankRadius });
  Object.assign(enemy, { x: 900, y: 700 - WORLD.tankRadius });
  player.inventory.push('lightningStep'); player.selectedPowerup = 'lightningStep'; player.selectedPowerups = ['lightningStep'];
  const preview = blinkLanding(room.game.terrain, room.game.players, player, 550);
  usePowerup(room, player.id, { type: 'lightningStep', x: 550 });
  assert.deepEqual({ x: player.x, y: player.y }, preview.landing);
  assert.equal(player.lastBlink.toX, preview.landing.x);
});
