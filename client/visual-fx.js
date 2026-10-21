// A single pixel-art vocabulary for every flying weapon. Keep silhouettes legible
// at minimum zoom; modifiers tint the projectile without erasing its identity.
const PROFILES = Object.freeze({
  standard: ['shell', '#fff2aa', '#ff8a52', '#6d3c32', 1],
  heavy: ['rocket', '#ffe4a2', '#ff593f', '#802e32', 1.35],
  cluster: ['capsule', '#f4d4ff', '#b267ff', '#60317e', 1.2],
  fireworks: ['star', '#fff5aa', '#ff65c8', '#75419d', 1.18],
  zeus: ['bolt', '#f4ffff', '#61dcff', '#3565a0', 1.15],
  gravity: ['orb', '#f8d9ff', '#a575ff', '#3d2b78', 1.35],
  grenade: ['grenade', '#ddffa2', '#78ad58', '#354a39', 1.2],
  mineLayer: ['mine', '#ffe7a0', '#ff8b4f', '#564054', 1],
  moleBomb: ['drill', '#f4d4a5', '#b87946', '#634c42', 1.2],
  verticalStrike: ['dart', '#f5ffff', '#56e3f1', '#386d91', 1.15],
  droneStrike: ['rocket', '#fff2b9', '#ff8058', '#76567c', 1.12],
  teslaOrb: ['orb', '#ffffff', '#55e8ff', '#28739b', 1.2],
  seismicCharge: ['crystal', '#fff1ab', '#ff604c', '#783d42', 1.3],
  megaCannon: ['beacon', '#ffffff', '#4baaff', '#225d9a', 1.35],
  laser: ['dart', '#ffffff', '#ff5d9b', '#9b3e74', 1.1],
  flyingHunter: ['plane', '#fff5c4', '#72dfff', '#4869a3', 1.5],
  lightningRod: ['rod', '#f2ffff', '#73e4ff', '#48779b', 1.2],
  sentry: ['turret', '#f3ffbe', '#78e4b4', '#477d74', 1.25],
  soapBomb: ['bubbleCanister', '#ffffff', '#73f4e8', '#a875d4', 1.55],
  markerBomb: ['markerCore', '#fff4bc', '#ff7452', '#8b254d', 1.55],
  harpoon: ['harpoonHead', '#f6ffec', '#6af2c9', '#155774', 1.75],
  vitalRecycling: ['orb', '#eaffcd', '#5ee9a2', '#245b65', 1.2],
  superheat: ['grenade', '#fff0ad', '#ff5729', '#8f2930', 1.28],
  waterCannon: ['waterJet', '#e8ffff', '#48d4f2', '#17678e', 1.4],
  waterHunter: ['plane', '#d8ffff', '#4fc8e8', '#174d76', 1.6],
  waterMine: ['mine', '#e7ffff', '#459ec5', '#173d60', 1.7],
  waterTorpedo: ['rocket', '#f3ffff', '#59ead9', '#1c6580', 1.2],
  elementalFire: ['grenade', '#fff0ae', '#ff6c37', '#8e2930', 1.3],
  elementalWater: ['orb', '#edffff', '#45d4ff', '#236b9b', 1.3],
  elementalWind: ['orb', '#eafff3', '#75ecd4', '#347c88', 1.3],
  elementalEarth: ['crystal', '#fff0be', '#c89c5d', '#715442', 1.3],
});

// Ordered to match client/assets/projectile-atlas-v1.png. Keep missing
// weapons on the native-pixel fallback rather than borrowing unrelated art.
const PROJECTILE_SPRITES = Object.freeze({
  standard: 0, heavy: 1, cluster: 2, fireworks: 3,
  zeus: 4, gravity: 5, grenade: 6, mineLayer: 7,
  moleBomb: 8, verticalStrike: 9, flyingHunter: 10, droneStrike: 11,
  teslaOrb: 12, seismicCharge: 13, megaCannon: 14,
});

export function projectileSpriteIndex(shot) {
  if (shot?.megaMissile) return 3;
  if (shot?.laser || shot?.weapon === 'laser') return 0;
  if (shot?.weapon === 'lightningRod') return 1;
  if (shot?.weapon === 'sentry') return 2;
  return PROJECTILE_SPRITES[shot?.weapon || 'standard'] ?? -1;
}

export function projectileSpriteSheet(shot) {
  return shot?.megaMissile || shot?.laser || ['laser', 'lightningRod', 'sentry'].includes(shot?.weapon) ? 'special' : 'main';
}

export function drawProjectileSprite(c, atlas, shot, visual, x, y, angle, size, time) {
  const index = projectileSpriteIndex(shot);
  if (index < 0 || !atlas?.complete || !atlas.naturalWidth || !atlas.naturalHeight) return false;
  const columns = projectileSpriteSheet(shot) === 'special' ? 2 : 4;
  const sourceWidth = atlas.naturalWidth / columns;
  const sourceHeight = atlas.naturalHeight / columns;
  const extent = Math.max(20, size * 3.3 * visual.scale);
  const pulse = 1 + Math.sin(time / 105) * (visual.shape === 'orb' || visual.shape === 'bolt' ? .075 : .025);
  const frame = Math.floor(time / 95) % 4;
  const pixel = Math.max(2, Math.round(extent / 12));
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.rotate(angle);
  c.imageSmoothingEnabled = false;
  c.shadowColor = visual.glow;
  c.shadowBlur = Math.min(13, extent * .25);
  c.drawImage(atlas, index % columns * sourceWidth, Math.floor(index / columns) * sourceHeight,
    sourceWidth, sourceHeight, -extent * pulse / 2, -extent * pulse / 2,
    extent * pulse, extent * pulse);
  c.shadowBlur = 0;
  // Four distinct animation beats are drawn in local sprite space. The atlas
  // owns each silhouette; these pixels supply motion without altering aim or hitboxes.
  const mark = (px, py, width, height, color) => {
    c.fillStyle = color;
    c.fillRect(Math.round(px), Math.round(py), Math.max(pixel, Math.round(width)), Math.max(pixel, Math.round(height)));
  };
  if (['zeus', 'teslaOrb', 'verticalStrike', 'lightningRod', 'laser'].includes(shot?.weapon) || shot?.laser) {
    const arc = extent * .3;
    for (let i = 0; i < 3; i += 1) {
      const theta = (frame + i * 1.4) * Math.PI / 2;
      const px = Math.cos(theta) * arc;
      const py = Math.sin(theta) * arc;
      mark(px, py, pixel * 1.5, pixel, i === frame % 3 ? '#ffffff' : visual.glow);
      mark(px + Math.cos(theta + .8) * pixel * 1.6, py + Math.sin(theta + .8) * pixel * 1.6, pixel, pixel, visual.core);
    }
  } else if (shot?.weapon === 'gravity') {
    for (let i = 0; i < 4; i += 1) {
      const theta = (frame + i) * Math.PI / 2 + frame * .24;
      mark(Math.cos(theta) * extent * .3, Math.sin(theta) * extent * .3, pixel, pixel, i % 2 ? visual.core : visual.glow);
    }
  } else if (shot?.weapon === 'grenade' || shot?.weapon === 'mineLayer') {
    mark(-pixel / 2, -extent * .34, pixel * (frame % 2 ? 2 : 1), pixel * (frame % 2 ? 2 : 1), frame % 2 ? '#fff2a4' : '#ff4d3c');
    if (shot?.weapon === 'grenade') mark(-extent * .13 - frame * pixel, -extent * .43, pixel, pixel, '#ffd776');
  } else if (shot?.weapon === 'sentry') {
    const scanner = (frame - 1.5) * pixel * 1.4;
    mark(extent * .13, scanner, pixel * 1.5, pixel, frame % 2 ? '#d6ffb5' : '#4aff9d');
    mark(-extent * .28 - frame * pixel, pixel, pixel, pixel, '#a1ffd1');
  } else {
    const ember = shot?.megaMissile ? '#ff9a38' : shot?.weapon === 'cluster' ? '#dba8ff' : shot?.weapon === 'megaCannon' ? '#9beaff' : shot?.weapon === 'fireworks' ? ['#ff64ba', '#79e6ff', '#ffe77c', '#b895ff'][frame] : visual.glow;
    const rear = -extent * .4;
    mark(rear - frame * pixel * .75, -pixel / 2, pixel * (2 + (frame % 2)), pixel, ember);
    mark(rear - (3 - frame) * pixel, pixel * (frame % 2 ? 1.2 : -1.6), pixel, pixel, visual.core);
    if (shot?.weapon === 'flyingHunter' || shot?.weapon === 'droneStrike' || shot?.weapon === 'fireworks')
      mark(rear - pixel * (2 + frame), pixel * (frame - 1), pixel, pixel, frame % 2 ? '#fff5af' : ember);
  }
  c.restore();
  return true;
}

export function projectileVisual(shot, diving = shot?.diving) {
  const [shape, core, glow, shadow, scale] = PROFILES[shot?.weapon] || PROFILES.standard;
  if (shot?.megaMissile) return { shape: 'atom', core: '#fff8c6', glow: '#ff7652', shadow: '#a53f46', scale: 1.8 };
  if (shot?.armorPiercer) return { shape: 'dart', core: '#ffffff', glow: '#f6df88', shadow: '#8597a6', scale: 1.36 };
  if (shot?.freeze) return { shape, core: '#f0ffff', glow: '#75ddff', shadow: '#448cb4', scale };
  if (shot?.teleport) return { shape, core: '#f5ffff', glow: '#46f5cc', shadow: '#825bd4', scale };
  if (shot?.flyingHunter && diving) return { shape, core: '#fff4ba', glow: '#ff514e', shadow: '#933842', scale };
  return { shape, core, glow, shadow, scale };
}

export function projectileTrailLength(shot) {
  if (shot?.laser) return 0;
  if (shot?.megaMissile || shot?.weapon === 'heavy') return 26;
  if (shot?.weapon === 'fireworks' || shot?.weapon === 'flyingHunter') return 23;
  return 16;
}

const MODIFIER_COLORS = Object.freeze({
  armorPiercer: '#f5f6ff', guidedBullet: '#67e8ff', shockwave: '#5ddfff',
  bunkerBuster: '#ffb65f', molotov: '#ff7444', bridgeKit: '#83f0c5',
  bigExplosion: '#ff6586', mirror: '#b3dcff', salvageHeal: '#74f0a9',
  freeze: '#9befff', teleport: '#51f2cf', tripleShot: '#ff746a',
  doubleShot: '#ffab65', megaMissile: '#ff5848',
});

export function drawProjectileModifiers(c, shot, x, y, size, time) {
  const active = [...new Set(shot?.combo || [])].filter((name) => MODIFIER_COLORS[name]);
  if (!active.length) return;
  c.save();
  // Three orbiting micro-blocks stay readable without hiding the projectile.
  for (let index = 0; index < Math.min(3, active.length); index += 1) {
    const phase = time / 240 + index * Math.PI * 2 / Math.min(3, active.length);
    const orbit = size * (2.6 + .15 * Math.sin(time / 150 + index));
    const px = Math.round(x + Math.cos(phase) * orbit);
    const py = Math.round(y + Math.sin(phase) * orbit);
    c.fillStyle = '#10202e'; c.fillRect(px - 3, py - 3, 6, 6);
    c.fillStyle = MODIFIER_COLORS[active[index]]; c.fillRect(px - 2, py - 2, 4, 4);
  }
  c.restore();
}

export function drawProjectilePixelArt(c, visual, x, y, angle, size, time) {
  const u = Math.max(1.5, size / 5) * visual.scale;
  const block = (px, py, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(px * u), Math.round(py * u), Math.ceil(w * u), Math.ceil(h * u)); };
  c.save(); c.translate(Math.round(x), Math.round(y)); c.rotate(angle);
  c.shadowColor = visual.glow; c.shadowBlur = Math.min(19, 7 + u * 3);
  switch (visual.shape) {
    case 'rocket': case 'dart':
      block(-5, -1, 8, 3, visual.shadow); block(-2, -2, 5, 5, visual.glow); block(2, -1, 3, 3, visual.core);
      block(-5, -3, 2, 2, visual.glow); block(-5, 2, 2, 2, visual.glow); break;
    case 'capsule':
      block(-4, -2, 7, 5, visual.shadow); block(-2, -2, 4, 5, visual.glow); block(3, -1, 2, 3, visual.core);
      block(-2, -4, 2, 2, visual.glow); block(-2, 3, 2, 2, visual.glow); break;
    case 'star':
      block(-1, -5, 2, 10, visual.glow); block(-5, -1, 10, 2, visual.glow);
      block(-3, -3, 2, 2, visual.shadow); block(2, -3, 2, 2, visual.shadow);
      block(-3, 2, 2, 2, visual.shadow); block(2, 2, 2, 2, visual.shadow); block(-1, -1, 2, 2, visual.core); break;
    case 'bolt':
      block(-2, -5, 4, 4, visual.glow); block(-1, -1, 5, 2, visual.core); block(-3, 1, 4, 4, visual.glow);
      block(-5, -1, 2, 2, visual.core); break;
    case 'orb': case 'atom':
      block(-4, -3, 8, 6, visual.shadow); block(-3, -4, 6, 8, visual.glow); block(-2, -2, 4, 4, visual.core);
      if (visual.shape === 'atom') { block(-6, -1, 2, 2, visual.glow); block(4, -1, 2, 2, visual.glow); block(-1, -6, 2, 2, visual.core); } break;
    case 'grenade': case 'mine':
      block(-4, -3, 8, 7, visual.shadow); block(-3, -2, 6, 5, visual.glow); block(-2, -2, 3, 2, visual.core);
      block(-1, -5, 2, 2, visual.core); break;
    case 'drill':
      block(-5, -3, 6, 6, visual.shadow); block(-4, -2, 5, 4, visual.glow); block(1, -2, 2, 4, visual.core); block(3, -1, 2, 2, visual.glow); break;
    case 'crystal':
      block(-2, -5, 4, 3, visual.glow); block(-4, -2, 8, 5, visual.shadow); block(-2, -2, 4, 5, visual.glow); block(-1, -1, 2, 3, visual.core); block(-2, 3, 4, 2, visual.glow); break;
    case 'plane':
      block(-6, -1, 12, 3, visual.shadow); block(-3, -5, 5, 11, visual.glow); block(2, -1, 5, 3, visual.core);
      block(-6, -3, 3, 2, visual.core); block(-6, 2, 3, 2, visual.core); break;
    case 'bubbleCanister':
      block(-5, -3, 8, 6, visual.shadow); block(-3, -3, 5, 6, visual.glow); block(-2, -2, 3, 3, visual.core);
      block(3, -2, 2, 4, '#fff8ff'); block(-7, -7, 3, 3, '#cffff9'); block(-8, 4, 2, 2, '#f2b9ff'); block(1, -8, 2, 2, '#a4eaff'); break;
    case 'markerCore':
      block(-5, -4, 10, 8, visual.shadow); block(-4, -3, 8, 6, visual.glow); block(-2, -2, 4, 4, visual.core);
      block(-1, -6, 2, 3, '#ffe5a4'); block(-7, -1, 2, 2, '#ff4c61'); block(5, -1, 2, 2, '#ff4c61'); block(-1, 5, 2, 2, '#ff4c61'); break;
    case 'harpoonHead':
      block(-6, -1, 9, 3, visual.shadow); block(-5, 0, 9, 1, visual.glow); block(2, -3, 5, 6, visual.core);
      block(4, -5, 2, 3, visual.glow); block(4, 2, 2, 3, visual.glow); block(-7, -4, 2, 3, '#eafff4'); block(-7, 2, 2, 3, '#eafff4'); break;
    case 'rod': case 'beacon': case 'turret':
      block(-2, -5, 4, 10, visual.shadow); block(-1, -5, 2, 8, visual.glow); block(-3, -2, 6, 2, visual.core);
      block(-3, 4, 6, 2, visual.glow); break;
    default:
      block(-4, -2, 8, 5, visual.shadow); block(-2, -2, 5, 5, visual.glow); block(2, -1, 3, 3, visual.core);
  }
  c.shadowBlur = 0;
  if (visual.shape === 'orb' || visual.shape === 'atom' || visual.shape === 'bolt' || visual.shape === 'bubbleCanister' || visual.shape === 'markerCore') {
    const pulse = (time / 130) % (Math.PI * 2); c.globalAlpha = .48;
    for (let i = 0; i < 4; i += 1) block(Math.cos(pulse + i * Math.PI / 2) * 7, Math.sin(pulse + i * Math.PI / 2) * 7, 2, 2, visual.core);
  }
  c.restore();
}
