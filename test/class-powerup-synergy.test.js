import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, drawPowerupChoices, finishPendingShot, fire, recordEliminations, sanitizeRules, selectPowerup } from '../server/game.js';
import { CLASS_POWERUP_SYNERGY, CLASS_POWERUP_WEIGHT, COLLECTIBLE_ITEMS, POWERUP_DEFS, WORLD } from '../shared/constants.js';
import { seededRandom } from '../server/random.js';
import { safeGroundAt } from '../shared/movement.js';

function match() {
  const room = { rules: sanitizeRules({ seed: 'class-powerup-synergy', powerupCount: 0, mines: false, classesEnabled: true }), players: [{ id: 'one', nickname: 'One', classType: 'healer', arsenal: ['heavy', 'cluster', 'jump'] }, { id: 'two', nickname: 'Two', classType: 'bomber', arsenal: ['heavy', 'cluster', 'jump'] }] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
  room.game.players[0].x = 100; room.game.players[0].y = 751;
  room.game.players[1].x = WORLD.width - 100; room.game.players[1].y = 751;
  return room;
}

test('class affinity triples each recommended card weight without hiding other enabled cards', () => {
  assert.equal(CLASS_POWERUP_WEIGHT, 3);
  for (const types of Object.values(CLASS_POWERUP_SYNERGY)) for (const type of types) assert.ok(POWERUP_DEFS[type], type);
  const pool = ['heal', 'salvageHeal', 'extraLife', 'shield', 'freeze', 'rocketDash'];
  let favored = 0; let neutral = 0;
  for (let index = 0; index < 1000; index += 1) {
    const choice = drawPowerupChoices(pool, 'healer', seededRandom(`affinity-${index}`), 1)[0];
    const ordinary = drawPowerupChoices(pool, null, seededRandom(`affinity-${index}`), 1)[0];
    favored += Number(CLASS_POWERUP_SYNERGY.healer.includes(choice));
    neutral += Number(CLASS_POWERUP_SYNERGY.healer.includes(ordinary));
  }
  assert.ok(favored > neutral + 150, `weighted=${favored}, neutral=${neutral}`);
  const limited = drawPowerupChoices(['freeze', 'shield', 'salvageHeal'], 'healer', seededRandom('limited'), 3);
  assert.equal(new Set(limited).size, 3);
  assert.ok(limited.every((type) => ['freeze', 'shield', 'salvageHeal'].includes(type)));
});

test('recycling heals 25% of destruction from the next shot without a fixed cap', () => {
  const room = match(); const player = room.game.players[0];
  player.classType = 'bomber';
  assert.ok(COLLECTIBLE_ITEMS.includes('salvageHeal'));
  player.health = 35; player.inventory.push('salvageHeal');
  selectPowerup(room, player.id, 'salvageHeal');
  fire(room, player.id, { weapon: 'standard', angle: 30, power: 180, direction: 1 });
  assert.ok(!player.inventory.includes('salvageHeal'));
  assert.equal(room.game.pendingShot.salvageHeal, true);
  const beforeHeal = player.health; const scoreBefore = room.game.pendingShot.destructionBefore;
  player.stats.destruction = scoreBefore + 300;
  finishPendingShot(room);
  assert.equal(player.health, beforeHeal + 75);
  assert.equal(player.lastSalvage.healed, 75);
  assert.equal(player.lastSalvage.destruction, 300);
  const secondRoom = match(); const second = secondRoom.game.players[0];
  second.classType = 'bomber'; second.health = 50; second.inventory.push('salvageHeal');
  selectPowerup(secondRoom, second.id, 'salvageHeal');
  fire(secondRoom, second.id, { weapon: 'standard', angle: 30, power: 180, direction: 1 });
  const score = secondRoom.game.pendingShot.destructionBefore;
  second.stats.destruction = score + 100;
  finishPendingShot(secondRoom);
  assert.equal(second.lastSalvage.healed, 25);
  assert.equal(second.health, 75);
});

test('extra life prevents a grave and match end, consumes one charge, and chooses safe terrain', () => {
  const room = match(); const game = room.game; const player = game.players[0];
  assert.ok(COLLECTIBLE_ITEMS.includes('extraLife'));
  player.inventory.push('extraLife'); player.alive = false; player.health = 0; player.lastDamageSourceId = 'two';
  game.mines = [{ id: 'dangerous-respawn', x: 920, y: 757, active: true }];
  game.fireZones = [{ id: 'burning-respawn', x: 1420, y: 750, radius: 125, turnsLeft: 2 }];
  recordEliminations(game);
  assert.equal(player.alive, true);
  assert.equal(player.health, Math.ceil(player.maxHealth * .25));
  assert.ok(safeGroundAt(game.terrain, player.x));
  assert.ok(Math.abs(player.x - game.mines[0].x) >= 45);
  assert.ok(Math.hypot(player.x - game.fireZones[0].x, player.y - game.fireZones[0].y) >= game.fireZones[0].radius + 20);
  assert.ok(!player.inventory.includes('extraLife'));
  assert.equal(game.graves.length, 0);
  assert.equal(game.phase, 'playing');
  assert.equal(game.players[1].stats?.destruction || 0, 0);
  assert.ok(player.lastRevive?.serial);
  assert.equal(player.lastRevive.durationMs, 3000);
  player.alive = false; player.health = 0;
  recordEliminations(game);
  assert.equal(game.graves.length, 1);
  assert.equal(game.phase, 'finished');
});
