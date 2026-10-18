import test from 'node:test';
import assert from 'node:assert/strict';
import { ARSENAL_DEFS } from '../shared/constants.js';
import { drawProjectileSprite, projectileSpriteIndex, projectileSpriteSheet, projectileTrailLength, projectileVisual } from '../client/visual-fx.js';

test('projectile atlases keep each arsenal shot mapped and animate their microblock accents', () => {
  const weapons = ['standard', 'heavy', 'cluster', 'fireworks', 'zeus', 'gravity', 'grenade', 'mineLayer', 'moleBomb', 'verticalStrike', 'flyingHunter', 'droneStrike', 'teslaOrb', 'seismicCharge', 'megaCannon'];
  assert.deepEqual(weapons.map((weapon) => projectileSpriteIndex({ weapon })), weapons.map((_, index) => index));
  assert.equal(projectileSpriteSheet({ weapon: 'heavy', megaMissile: true }), 'special');
  assert.equal(projectileSpriteSheet({ weapon: 'standard' }), 'main');
  const calls = [];
  const c = { save() {}, restore() {}, translate() {}, rotate() {}, drawImage(...args) { calls.push(['image', ...args]); }, fillRect(...args) { calls.push(['pixel', ...args]); } };
  const atlas = { complete: true, naturalWidth: 1245, naturalHeight: 1263 };
  assert.equal(drawProjectileSprite(c, atlas, { weapon: 'standard' }, projectileVisual({ weapon: 'standard' }), 10, 20, 0, 5, 100), true);
  assert.ok(calls.some(([kind]) => kind === 'image'));
  assert.ok(calls.some(([kind]) => kind === 'pixel'));
  const firstFrame = calls.filter(([kind]) => kind === 'pixel');
  calls.length = 0;
  drawProjectileSprite(c, atlas, { weapon: 'standard' }, projectileVisual({ weapon: 'standard' }), 10, 20, 0, 5, 195);
  assert.notDeepEqual(calls.filter(([kind]) => kind === 'pixel'), firstFrame);
});

test('every arsenal projectile has a distinct identity while modifiers preserve its silhouette', () => {
  const standard = projectileVisual({ weapon: 'standard' });
  for (const [weapon, definition] of Object.entries(ARSENAL_DEFS)) {
    if (definition.kind !== 'shot') continue;
    const visual = projectileVisual({ weapon });
    assert.ok(visual.shape && visual.core && visual.glow && visual.shadow, weapon);
    assert.notDeepEqual(visual, standard, weapon);
  }
  const base = projectileVisual({ weapon: 'cluster' });
  assert.equal(projectileVisual({ weapon: 'cluster', freeze: true }).shape, base.shape);
  assert.notEqual(projectileVisual({ weapon: 'cluster', freeze: true }).glow, base.glow);
  assert.equal(projectileTrailLength({ weapon: 'laser', laser: true }), 0);
});
