import test from 'node:test';
import assert from 'node:assert/strict';
import { shotLaunchMuzzle, shotLaunchStyle } from '../client/shot-launch.js';

test('weapon families and shot modifiers have distinct launch signatures', () => {
  const weapons = ['standard', 'heavy', 'zeus', 'gravity', 'soapBomb', 'harpoon', 'fireworks', 'cluster', 'flyingHunter', 'sentry'];
  const signatures = weapons.map((weapon) => shotLaunchStyle({ weapon }));
  assert.equal(new Set(signatures.map((style) => style.type)).size, weapons.length);
  assert.equal(new Set(signatures.map((style) => style.sound)).size, weapons.length);
  assert.equal(shotLaunchStyle({ weapon: 'heavy', freeze: true }).type, 'frost');
  assert.equal(shotLaunchStyle({ weapon: 'zeus', armorPiercer: true }).type, 'pierce');
  assert.equal(shotLaunchStyle({ weapon: 'standard', combo: ['molotov'] }).type, 'fire');
  assert.equal(shotLaunchStyle({ weapon: 'standard', megaMissile: true }).type, 'atomic');
  assert.equal(shotLaunchStyle({ weapon: 'vitalRecycling' }).type, 'support');
  assert.equal(shotLaunchStyle({ weapon: 'standard', bridgeKit: true }).type, 'support');
  assert.equal(shotLaunchStyle({ weapon: 'standard', shockwave: true }).type, 'gravity');
  assert.equal(shotLaunchStyle({ weapon: 'standard', combo: ['guidedBullet'] }).type, 'drone');
});

test('muzzle flash follows the actual initial projectile direction', () => {
  const muzzle = shotLaunchMuzzle({ path: [{ x: 100, y: 80 }, { x: 94, y: 72 }] }, { facing: 1 });
  assert.equal(muzzle.x, 100);
  assert.equal(muzzle.y, 80);
  assert.ok(muzzle.dx < 0);
  assert.ok(muzzle.dy < 0);
  const fallback = shotLaunchMuzzle({}, { renderX: 200, renderY: 90, facing: -1 });
  assert.ok(fallback.x < 200);
  assert.equal(fallback.dx, -1);
});
