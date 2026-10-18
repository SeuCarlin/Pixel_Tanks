import test from 'node:test';
import assert from 'node:assert/strict';
import { ARSENAL_DEFS } from '../shared/constants.js';
import { drawAtomicCloudFrame, drawCollectibleHalo, drawProjectileModifiers, drawProjectilePixelArt, drawProjectileSprite, drawSpriteStripFrame, drawTankMotionSprite, movementPose, projectileSpriteIndex, projectileSpriteSheet, projectileTrailLength, projectileVisual } from '../client/visual-fx.js';

test('animated VFX strips advance frames and keep jump and dash in separate rows', () => {
  const calls = [];
  const c = { globalAlpha: 1, save() {}, restore() {}, scale() {}, drawImage(...args) { calls.push(args); } };
  const atlas = { complete: true, naturalWidth: 1600, naturalHeight: 800 };
  assert.equal(drawSpriteStripFrame(c, atlas, 6, 4, 2, 0, 0, 64, 64), true);
  assert.deepEqual(calls[0].slice(1, 5), [800, 400, 400, 400]);
  assert.equal(drawSpriteStripFrame(c, atlas, 8, 4, 2, 0, 0, 64, 64), false);
  calls.length = 0;
  assert.equal(drawTankMotionSprite(c, atlas, 'jump', 1, 110), true);
  assert.equal(drawTankMotionSprite(c, atlas, 'dash', -1, 110), true);
  assert.equal(calls[0][1], 400);
  assert.equal(calls[0][2], 0);
  assert.equal(calls[1][1], 400);
  assert.equal(calls[1][2], 400);
  assert.equal(drawTankMotionSprite(c, atlas, 'idle', 1, 110), false);
  calls.length = 0;
  const atomic = { complete: true, naturalWidth: 2073, naturalHeight: 759 };
  assert.equal(drawAtomicCloudFrame(c, atomic, 2, 0, 0, 200, 250), true);
  assert.deepEqual(calls[0].slice(1, 5), [960, 0, 540, 759]);
  assert.equal(drawAtomicCloudFrame(c, atomic, 4, 0, 0, 200, 250), false);
});

test('generated projectile atlas maps unique sprites and retains a native fallback', () => {
  const weapons = ['standard', 'heavy', 'cluster', 'fireworks', 'zeus', 'gravity', 'grenade', 'mineLayer', 'moleBomb', 'verticalStrike', 'flyingHunter', 'droneStrike', 'teslaOrb', 'seismicCharge', 'megaCannon'];
  assert.deepEqual(weapons.map((weapon) => projectileSpriteIndex({ weapon })), weapons.map((_, index) => index));
  assert.equal(projectileSpriteIndex({ weapon: 'heavy', megaMissile: true }), 3);
  assert.equal(projectileSpriteIndex({ weapon: 'laser' }), 0);
  assert.equal(projectileSpriteIndex({ weapon: 'lightningRod' }), 1);
  assert.equal(projectileSpriteIndex({ weapon: 'sentry' }), 2);
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
  assert.equal(drawProjectileSprite(c, { ...atlas, complete: false }, { weapon: 'standard' }, projectileVisual({ weapon: 'standard' }), 10, 20, 0, 5, 100), false);
  for (const weapon of ['zeus', 'gravity', 'grenade', 'sentry']) {
    const spriteAtlas = weapon === 'sentry' ? { ...atlas, naturalWidth: 1327, naturalHeight: 1185 } : atlas;
    calls.length = 0;
    drawProjectileSprite(c, spriteAtlas, { weapon }, projectileVisual({ weapon }), 10, 20, 0, 5, 100);
    const frameOne = calls.filter(([kind]) => kind === 'pixel');
    calls.length = 0;
    drawProjectileSprite(c, spriteAtlas, { weapon }, projectileVisual({ weapon }), 10, 20, 0, 5, 195);
    assert.notDeepEqual(calls.filter(([kind]) => kind === 'pixel'), frameOne, `${weapon} must animate`);
  }
});

test('every arsenal projectile has a visual identity distinct from the default shell', () => {
  const standard = projectileVisual({ weapon: 'standard' });
  for (const [weapon, definition] of Object.entries(ARSENAL_DEFS)) {
    if (definition.kind !== 'shot') continue;
    const visual = projectileVisual({ weapon });
    assert.ok(visual.shape && visual.core && visual.glow && visual.shadow, weapon);
    assert.notDeepEqual(visual, standard, weapon);
  }
});

test('modifiers preserve weapon shape but signal their own palette', () => {
  const base = projectileVisual({ weapon: 'cluster' });
  assert.equal(projectileVisual({ weapon: 'cluster', freeze: true }).shape, base.shape);
  assert.notEqual(projectileVisual({ weapon: 'cluster', freeze: true }).glow, base.glow);
  assert.equal(projectileVisual({ weapon: 'heavy', megaMissile: true }).shape, 'atom');
  assert.equal(projectileVisual({ weapon: 'flyingHunter', flyingHunter: true, diving: true }).glow, '#ff514e');
  assert.equal(projectileTrailLength({ weapon: 'laser', laser: true }), 0);
});

test('launch poses start and land exactly; pixel effects render through the canvas API', () => {
  for (const kind of ['armoredDash', 'spiderLeap', 'jump']) {
    const animation = { kind, fromX: 10, fromY: 40, toX: 210, toY: 65 };
    assert.deepEqual({ x: movementPose(animation, 0).x, y: movementPose(animation, 0).y }, { x: 10, y: 40 });
    assert.deepEqual({ x: movementPose(animation, 1).x, y: movementPose(animation, 1).y }, { x: 210, y: 65 });
    assert.ok(movementPose(animation, .5).y < 40);
  }
  const calls = [];
  const c = new Proxy({}, { get(target, key) { if (key === 'save' || key === 'restore' || key === 'translate' || key === 'rotate' || key === 'fillRect') return (...args) => calls.push([key, ...args]); return target[key]; }, set(target, key, value) { target[key] = value; return true; } });
  for (const weapon of ['standard', ...Object.keys(ARSENAL_DEFS).filter((key) => ARSENAL_DEFS[key].kind === 'shot')]) {
    drawProjectilePixelArt(c, projectileVisual({ weapon }), 100, 80, .4, 7, 450);
  }
  drawProjectileModifiers(c, { combo: ['freeze', 'armorPiercer', 'guidedBullet'] }, 100, 80, 7, 450);
  drawCollectibleHalo(c, 100, 80, '#75dfff', 450);
  assert.ok(calls.filter(([method]) => method === 'fillRect').length > 65);
});
