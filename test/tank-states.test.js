import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../shared/constants.js';
import { refreshTankStates, tankMotionState, TANK_STATE } from '../shared/tank-states.js';
import { createGame, movePlayer, publicGame, sanitizeRules } from '../server/game.js';
import { impartTankMomentum } from '../server/physics.js';

const now = 10000;
function fixture() {
  const player = { id: 'one', x: 100, y: 500 - WORLD.tankRadius, health: 100, alive: true, spiderClimb: false };
  const game = { players: [player], terrain: { heights: Array(WORLD.width).fill(500), floatingPlatforms: [] }, soapBubbles: [], harpoonPull: null };
  return { game, player };
}

test('tank states distinguish support, driving, air, bubble flight and wall grip', () => {
  const { game, player } = fixture();
  assert.equal(tankMotionState(game, player, now), TANK_STATE.GROUNDED);
  game.terrain.floatingPlatforms.push({ id: 'deck', x: 50, y: 360, width: 100, active: true });
  player.supportPlatformId = 'deck'; player.y = 360 - WORLD.tankRadius;
  assert.equal(tankMotionState(game, player, now), TANK_STATE.GROUNDED);
  player.supportPlatformId = null; player.y = 500 - WORLD.tankRadius;
  player.movingUntil = now + 200;
  assert.equal(tankMotionState(game, player, now), TANK_STATE.MOVING);
  player.airborne = { vy: -50, falling: false };
  assert.equal(tankMotionState(game, player, now), TANK_STATE.AIRBORNE);
  player.airborne.vy = 40;
  assert.equal(tankMotionState(game, player, now), TANK_STATE.FALLING);
  player.airborne.parachute = true;
  assert.equal(tankMotionState(game, player, now), TANK_STATE.GLIDING);
  game.soapBubbles.push({ playerId: player.id, impactAt: now - 1, executeAt: now + 1000 });
  assert.equal(tankMotionState(game, player, now), TANK_STATE.FLOATING);
  game.soapBubbles = []; player.airborne = null; player.spiderClimb = true; player.wallClinging = 1;
  assert.equal(tankMotionState(game, player, now), TANK_STATE.WALL);
  player.wallClinging = null; player.y -= 40;
  assert.equal(tankMotionState(game, player, now), TANK_STATE.FALLING);
  player.alive = false;
  assert.equal(tankMotionState(game, player, now), TANK_STATE.DESTROYED);
});

test('damage reaction does not erase the physical movement state', () => {
  const { game, player } = fixture();
  assert.equal(refreshTankStates(game, now), true);
  assert.equal(refreshTankStates(game, now + 1), false);
  assert.equal(player.tankState, TANK_STATE.GROUNDED);
  player.airborne = { vy: 60, falling: true }; player.health = 70;
  refreshTankStates(game, now + 100);
  assert.equal(player.motionState, TANK_STATE.FALLING);
  assert.equal(player.tankState, TANK_STATE.DAMAGED);
  assert.equal(refreshTankStates(game, now + 700), true);
  assert.equal(player.tankState, TANK_STATE.FALLING);
  assert.equal(player.motionStateSince, now + 100);
});

test('explosion momentum releases a bubbled or wall-clinging tank into gravity', () => {
  const { game, player } = fixture();
  player.y = 340; player.spiderClimb = true; player.wallClinging = 1;
  game.soapBubbles.push({ id: 'bubble', playerId: player.id, impactAt: now - 100, executeAt: now + 4000 });
  assert.equal(tankMotionState(game, player, now), TANK_STATE.FLOATING);
  assert.equal(impartTankMomentum(game, player, 0, 60), true);
  assert.equal(game.soapBubbles.length, 0);
  assert.equal(player.wallClinging, null);
  assert.equal(tankMotionState(game, player, now), TANK_STATE.FALLING);
  assert.equal(game.lastSoapPop.damage, 0);
});

test('network snapshots expose states and floating tanks cannot drive', () => {
  const room = { rules: sanitizeRules({ seed: 'states', classesEnabled: false, powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'one', nickname: 'One', arsenal: ['heavy', 'cluster', 'jump'] },
    { id: 'two', nickname: 'Two', arsenal: ['heavy', 'cluster', 'jump'] },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = [];
  for (const tank of room.game.players) { tank.y = 760 - WORLD.tankRadius; tank.supportPlatformId = null; tank.platformOffset = null; }
  const player = room.game.players[0]; player.x = 100;
  assert.equal(publicGame(room.game, player.id).players[0].tankState, TANK_STATE.GROUNDED);
  movePlayer(room, player.id, 1, null, { continuous: true, bot: true });
  assert.equal(publicGame(room.game, player.id).players[0].motionState, TANK_STATE.MOVING);
  const clock = Date.now();
  room.game.soapBubbles.push({ playerId: player.id, impactAt: clock - 100, executeAt: clock + 1000 });
  assert.equal(publicGame(room.game, player.id).players[0].motionState, TANK_STATE.FLOATING);
  assert.throws(() => movePlayer(room, player.id, 1, null, { continuous: true, bot: true }), /flutuar/i);
});
