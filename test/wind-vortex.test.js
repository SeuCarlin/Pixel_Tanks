import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../shared/constants.js';
import { deflectProjectile, vortexAt } from '../shared/wind-vortex.js';
import { simulateShot, simulateVectorShot, simulateBouncingGrenade } from '../server/physics.js';

const terrain = { heights: Array(WORLD.width).fill(850), floatingPlatforms: [] };
const vortex = { id: 'wind-a', x: 700, y: 760, width: 200, height: 600, fire: false };
const shot = { terrain, x: 500, y: 500, angle: 0, power: 300, gravity: 120, wind: 0, direction: 1 };

test('vórtice detecta apenas sua coluna e acelera projéteis para cima', () => {
  assert.equal(vortexAt([vortex], 700, 500), vortex);
  assert.equal(vortexAt([vortex], 900, 500), null);
  const lifted = deflectProjectile([vortex], 700, 500, 250, 35, 1 / 60);
  assert.ok(lifted.vy < 35);
  assert.equal(deflectProjectile([vortex], 900, 500, 250, 35, 1 / 60).vy, 35);
});

test('trajetória de tiro comum é elevada pelo vórtice sem travar no ar', () => {
  const normal = simulateShot(shot);
  const diverted = simulateShot({ ...shot, windVortices: [vortex] });
  assert.ok(diverted.path.some((point) => point.vortexLift));
  assert.ok(Math.min(...diverted.path.map((point) => point.y)) < Math.min(...normal.path.map((point) => point.y)) - 100);
  assert.ok(diverted.path.length < 900);
});

test('tiro vetorial e granada também sofrem a corrente ascendente', () => {
  const vector = simulateVectorShot({ terrain, x: 500, y: 500, targetX: 1100, targetY: 500, windVortices: [vortex] });
  assert.ok(vector.path.some((point) => point.vortexLift));
  assert.ok(vector.path.some((point) => point.y < 450));
  const grenade = simulateBouncingGrenade({ ...shot, windVortices: [vortex] });
  assert.ok(grenade.path.some((point) => point.vortexLift));
});
