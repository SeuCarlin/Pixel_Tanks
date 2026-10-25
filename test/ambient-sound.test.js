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
  assert.ok(Object.values(far).every((level) => level === 0));
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
  assert.ok(Object.values(ambientLevels({ game: { ...game, phase: 'roulette' }, camera: { x: 0, y: 100, zoom: 1 }, terrainHeights })).every((level) => level === 0));
});

test('quiet breeze yields to wind; rain and snow take over in their climates', () => {
  const view = { camera: { x: 0, y: 100, zoom: 1 }, terrainHeights, now: 5000 };
  const calm = ambientLevels({ ...view, game: { ...game, wind: 0 } });
  const gale = ambientLevels({ ...view, game: { ...game, wind: 30 } });
  const dry = ambientLevels({ ...view, game });
  assert.ok(calm.breeze > calm.wind && gale.wind > gale.breeze);
  const rainy = ambientLevels({ ...view, game: { ...game, weather: { kind: 'rain', startedAt: 0 } } });
  const snowy = ambientLevels({ ...view, game: { ...game, weather: { kind: 'snow', startedAt: 0 } } });
  assert.ok(rainy.rain > .3 && rainy.dust < calm.dust);
  assert.ok(snowy.snow > .3 && snowy.dust < dry.dust);
});

test('fire, ice and flowing water follow visible sources without sounding before ignition', () => {
  const view = { camera: { x: 0, y: 100, zoom: 1 }, terrainHeights, now: 5000 };
  const sources = { ...game, roundNumber: 2,
    fireZones: [{ x: 640, y: 530, radius: 80, turnsLeft: 3, ignitesAt: 4000 }],
    iceZones: [{ x: 680, y: 500, radius: 90, expiresRound: 4 }],
    waterZones: [{ ...game.waterZones[0], flowCascades: [{ x: 680, fromY: 490, toY: 640 }] }],
  };
  const near = ambientLevels({ ...view, game: sources });
  assert.ok(near.fire > .3 && near.ice > .2 && near.waterfall > .2);
  const future = ambientLevels({ ...view, game: { ...sources, fireZones: [{ ...sources.fireZones[0], ignitesAt: 6000 }] } });
  assert.equal(future.fire, 0);
  const away = ambientLevels({ ...view, game: sources, camera: { x: 1200, y: 100, zoom: 1 } });
  assert.equal(away.fire, 0);
  assert.equal(away.ice, 0);
  assert.equal(away.waterfall, 0);
});

test('fire crackle follows falling flame points instead of their old platform', () => {
  const view = { camera: { x: 0, y: 100, zoom: 1 }, terrainHeights, now: 5000 };
  const zone = { x: 1300, y: 200, radius: 70, turnsLeft: 2, flames: [{ x: 640, y: 520, extinguished: false }] };
  const near = ambientLevels({ ...view, game: { ...game, fireZones: [zone] } });
  const fallenAway = ambientLevels({ ...view, game: { ...game, fireZones: [{ ...zone, flames: [{ x: 1450, y: 760, extinguished: false }] }] } });
  assert.ok(near.fire > .2);
  assert.equal(fallenAway.fire, 0);
});
