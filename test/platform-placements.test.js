import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, sanitizeRules, updateMovingPlatforms } from '../server/game.js';
import { impartTankMomentum, settlePlayers, settleScenarioObjects } from '../server/physics.js';

function room() {
  const match = { rules: sanitizeRules({ seed: 'moving-placement-qa', powerupCount: 0, mines: false }), players: [{ id: 'one', nickname: 'One' }, { id: 'two', nickname: 'Two' }] };
  match.game = createGame(match); match.game.phase = 'playing';
  match.game.terrain.heights.fill(900);
  match.game.platformEpoch = 1000;
  match.game.terrain.floatingPlatforms = [{ id: 'lift', x: 300, baseX: 300, y: 520, width: 160, height: 12, active: true, moving: true, amplitude: 50, period: 1000, phase: 0, durability: 100 }];
  return match;
}

test('deployed sentry, lightning rod and mine ride a moving platform and lose support when it breaks', () => {
  const match = room(); const game = match.game; const platform = game.terrain.floatingPlatforms[0];
  game.objects = [
    { id: 'sentry', type: 'sentry', x: 340, y: 498, groundY: 520, width: 34, height: 44, durability: 3, active: true, supportPlatformId: 'lift', platformOffset: 40 },
    { id: 'rod', type: 'lightningRod', x: 390, y: 491, groundY: 520, width: 24, height: 58, durability: 3, active: true, supportPlatformId: 'lift', platformOffset: 90 },
  ];
  game.mines = [{ id: 'mine', x: 370, y: 517, active: true, supportPlatformId: 'lift', platformOffset: 70 }];
  updateMovingPlatforms(game, 1250);
  assert.equal(platform.x, 350);
  assert.deepEqual(game.objects.map((object) => object.x), [390, 440]);
  assert.equal(game.mines[0].x, 420);
  platform.active = false;
  updateMovingPlatforms(game, 1500);
  settleScenarioObjects(game);
  assert.equal(game.mines[0].supportPlatformId, null);
  assert.equal(game.mines[0].y, 897);
  assert.ok(game.objects.every((object) => object.supportPlatformId === null && object.groundY === 900));
});

test('damage impulse adds momentum in air and can push a grounded tank off a platform', () => {
  const game = room().game; const player = game.players[0]; const platform = game.terrain.floatingPlatforms[0];
  player.x = 450; player.y = platform.y - 9; player.supportPlatformId = platform.id; player.platformOffset = 150;
  assert.equal(impartTankMomentum(game, player, 300, 55, true), true);
  assert.equal(player.supportPlatformId, null);
  assert.equal(player.lastImpactMotion.force, 55);
  settlePlayers(game);
  assert.equal(player.airborne?.falling, true);
  const beforeVx = player.airborne.vx;
  impartTankMomentum(game, player, 300, 30);
  assert.ok(player.airborne.vx > beforeVx);
  assert.ok(player.airborne.vy < 0);
});

test('an intact moving platform keeps its tank supported during a temporary terrain overlap', () => {
  const game = room().game; const player = game.players[0]; const platform = game.terrain.floatingPlatforms[0];
  player.x = platform.x + 80; player.y = platform.y - 9; player.supportPlatformId = platform.id; player.platformOffset = 80; player.airborne = null;
  // A raised terrain strip can overlap a deck while the map changes. It must
  // not silently detach the tank while the deck itself remains intact.
  for (let x = platform.x; x < platform.x + platform.width; x += 1) game.terrain.heights[x] = 500;
  updateMovingPlatforms(game, 1250);
  settlePlayers(game);
  assert.equal(player.supportPlatformId, platform.id);
  assert.equal(player.airborne, null);
  assert.equal(player.y, platform.y - 9);
  platform.active = false;
  settlePlayers(game);
  assert.equal(player.supportPlatformId, null);
});
