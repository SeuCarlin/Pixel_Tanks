import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScenarioObjects, createGame, fire, nextTurn, sanitizeRules, tickRoom } from '../server/game.js';
import { MEGA_CANNON_CHARGE, WORLD } from '../shared/constants.js';

function match(arsenal = ['seismicCharge', 'megaCannon', 'cluster'], classType = null) {
  const room = { rules: sanitizeRules({ seed: 'new-weapons-stable', powerupCount: 0, mines: false, classesEnabled: Boolean(classType) }), players: [{ id: 'one', nickname: 'One', arsenal, classType }, { id: 'two', nickname: 'Two', arsenal: ['heavy'] }] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
  room.game.players[0].x = 100; room.game.players[0].y = 751; room.game.players[1].x = WORLD.width - 100; room.game.players[1].y = 751;
  return room;
}

test('attacker no longer receives arsenal ammunition each turn', () => {
  const room = match(['heavy', 'cluster'], 'attacker'); const player = room.game.players[0];
  player.ammo.heavy = 0; player.ammo.cluster = 0;
  nextTurn(room); nextTurn(room);
  assert.equal(player.ammo.heavy, 0); assert.equal(player.ammo.cluster, 0);
});

test('seismic charge only destroys the marked ground after its two-second warning', () => {
  const room = match(); const before = [...room.game.terrain.heights];
  const [capsule] = fire(room, 'one', { angle: 30, power: 180, direction: 1, weapon: 'seismicCharge' });
  assert.equal(capsule.delayedStrike, true);
  assert.deepEqual(room.game.terrain.heights, before);
  assert.equal(room.game.delayedStrikes[0].executeAt - room.game.delayedStrikes[0].impactAt, 2000);
  room.game.delayedStrikes[0].executeAt = Date.now() - 1;
  const event = tickRoom(room);
  assert.equal(event.shot.detonation, true);
  assert.ok(event.shot.results[0].interactions.some((effect) => effect.type === 'seismicWave'));
  assert.notDeepEqual(room.game.terrain.heights, before);
});

test('mega cannon charges from destruction, then marks without an early crater', () => {
  const room = match(); const player = room.game.players[0];
  assert.equal(player.ammo.megaCannon, 0);
  for (let index = 0; index < 2; index += 1) {
    const x = 400 + index * 240;
    room.game.objects.push({ id: `charge-building-${index}`, type: 'building', x, groundY: 760, width: 100, height: 100, durability: 1, active: true });
    activateScenarioObjects(room.game, x, 700, 100, new Set(), player.id);
  }
  assert.ok(player.stats.destruction >= MEGA_CANNON_CHARGE);
  assert.equal(player.ammo.megaCannon, 1);
  const before = [...room.game.terrain.heights];
  const [marker] = fire(room, player.id, { angle: 30, power: 180, direction: 1, weapon: 'megaCannon' });
  assert.equal(marker.delayedStrike, true);
  assert.deepEqual(room.game.terrain.heights, before);
  assert.equal(player.ammo.megaCannon, 0);
  assert.equal(player.megaCannonCharge, 0);
  assert.equal(room.game.delayedStrikes[0].executeAt - room.game.delayedStrikes[0].impactAt, 3000);
  room.game.objects.push({ id: 'beam-target', type: 'building', x: marker.impact.x, groundY: 760, width: 90, height: 120, durability: 3, active: true });
  room.game.delayedStrikes[0].executeAt = Date.now() - 1;
  const event = tickRoom(room);
  assert.equal(event.shot.results[0].weapon, 'megaCannon');
  assert.equal(room.game.objects.find((object) => object.id === 'beam-target').active, false);
  assert.notDeepEqual(room.game.terrain.heights, before);
});
