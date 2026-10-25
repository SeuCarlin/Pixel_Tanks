import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientLevels } from '../client/ambient-sound.js';

const trees = [{ type: 'treeLarge', active: true, x: 640, groundY: 570, height: 170 }];
const game = { phase: 'playing', wind: 21, objects: trees, waterZones: [{ x: 690, radius: 160, surfaceY: 520 }], weather: { kind: 'clear' } };
const terrainHeights = Array(2000).fill(560);

test('environment layers grow when zoom approaches their visible source', () => {
  const close = ambientLevels({ game, camera: { x: 0, y: 100, zoom: 1 }, terrainHeights });
  const far = ambientLevels({ game, camera: { x: 0, y: 100, zoom: .32 }, terrainHeights });
  assert.ok(close.wind > .25 && close.leaves > .15 && close.dust > .1 && close.water > .1);
  assert.deepEqual(far, { wind: 0, leaves: 0, dust: 0, water: 0 });
});

test('moving focus away from a tree or lake removes that local layer', () => {
  const nearby = ambientLevels({ game, camera: { x: 0, y: 100, zoom: 1 }, terrainHeights });
  const elsewhere = ambientLevels({ game, camera: { x: 1000, y: 100, zoom: 1 }, terrainHeights });
  assert.equal(elsewhere.leaves, 0);
  assert.equal(elsewhere.water, 0);
  assert.ok(nearby.leaves > elsewhere.leaves && nearby.water > elsewhere.water);
  const rainy = ambientLevels({ game: { ...game, weather: { kind: 'rain' } }, camera: { x: 0, y: 100, zoom: 1 }, terrainHeights });
  assert.ok(rainy.dust < nearby.dust * .25);
});

test('ambient stays silent outside active combat', () => {
  assert.deepEqual(ambientLevels({ game: { ...game, phase: 'roulette' }, camera: { x: 0, y: 100, zoom: 1 }, terrainHeights }), { wind: 0, leaves: 0, dust: 0, water: 0 });
});
