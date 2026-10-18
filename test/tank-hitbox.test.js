import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, applyExplosion } from '../server/physics.js';
import { createGame, fire, sanitizeRules, standardDirectDamage } from '../server/game.js';
import { tankHitZone } from '../shared/tank-hitbox.js';
import { WEAPON_BALANCE, WORLD } from '../shared/constants.js';

test('the standard projectile detects the visible head, center and track separately', () => {
  const terrain = { heights: Array(WORLD.width).fill(WORLD.height + 50), floatingPlatforms: [] };
  const target = { id: 'target', x: 200, y: 200, alive: true };
  const yByZone = { head: 181, center: 195, base: 207 };
  for (const [zone, y] of Object.entries(yByZone)) {
    assert.equal(tankHitZone(target, target.x, y), zone);
    const shot = simulateShot({ terrain, players: [target], tankZones: true, x: 100, y, angle: 0, power: 300, gravity: 0, direction: 1 });
    assert.equal(shot.impact?.playerId, target.id);
    assert.equal(shot.impact.hitZone, zone);
  }
  assert.equal(tankHitZone(target, 250, 200), null);
  assert.equal(tankHitZone(target, 223, 207), null);
  assert.equal(tankHitZone({ ...target, classType: 'armored' }, 223, 207), 'base');
});

test('standard direct-hit damage uses the selected section, then normal defenses', () => {
  const room = { rules: sanitizeRules({ seed: 'hit-zones', powerupCount: 0, mines: false }), players: [{ id: 'a', nickname: 'A', color: '#fff', connected: true }, { id: 'b', nickname: 'B', color: '#f00', connected: true }] };
  const game = createGame(room);
  game.objects = []; game.terrain.floatingPlatforms = []; game.terrain.heights.fill(700);
  const [source, target] = game.players; source.x = 100; source.y = 400; target.x = 200; target.y = 400;
  for (const zone of ['base', 'center', 'head']) {
    target.health = target.maxHealth; target.alive = true;
    const impact = { x: 200, y: 400, playerId: target.id, hitZone: zone };
    const value = standardDirectDamage(game, impact);
    const bounds = zone === 'head' ? [60, 80] : zone === 'center' ? [50, 50] : [20, 30];
    assert.ok(value >= bounds[0] && value <= bounds[1]);
    const damage = applyExplosion(game, 200, 400, WEAPON_BALANCE.standard.radius, WEAPON_BALANCE.standard.damage, { sourcePlayerId: source.id, attackType: 'standard', noTerrain: true, directHit: { playerId: target.id, zone, damage: value } });
    const hit = damage.find((entry) => entry.playerId === target.id);
    assert.equal(hit.amount, value);
    assert.equal(hit.hitZone, zone);
    assert.equal(hit.critical, zone === 'head');
  }
  target.health = target.maxHealth; target.shieldCharges = 1; target.shield = true;
  const shielded = applyExplosion(game, 200, 400, 48, 50, { sourcePlayerId: source.id, noTerrain: true, directHit: { playerId: target.id, zone: 'head', damage: 80 } });
  assert.equal(shielded.find((entry) => entry.playerId === target.id).amount, 28);
});

test('a live standard shot reports a head critical and keeps its impact animation before turn change', () => {
  const room = { rules: sanitizeRules({ seed: 'critical-shot', powerupCount: 0, mines: false }), players: [{ id: 'a', nickname: 'A', color: '#fff', connected: true }, { id: 'b', nickname: 'B', color: '#f00', connected: true }] };
  room.game = createGame(room);
  const game = room.game; game.phase = 'playing'; game.objects = []; game.powerups = []; game.terrain.floatingPlatforms = []; game.terrain.heights.fill(WORLD.height + 50); game.wind = 0;
  const [shooter, target] = game.players; shooter.x = 100; shooter.y = 387; target.x = 200; target.y = 400;
  const [shot] = fire(room, shooter.id, { weapon: 'standard', angle: 5, power: 300, direction: 1 });
  assert.equal(shot.impact?.playerId, target.id);
  assert.equal(shot.impact.hitZone, 'head');
  assert.equal(shot.damage.find((entry) => entry.playerId === target.id)?.critical, true);
  assert.ok(game.shotEndsAt >= game.lastBattleAnimationUntil);
  assert.ok(game.shotEndsAt - Date.now() >= 2000);
});
