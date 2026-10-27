// A single launch signature drives the muzzle particles and the native/mobile cue.
const STYLES = Object.freeze({
  kinetic: { glow: '#ffe6a4', spark: '#ff9b52', smoke: '#666d70', sparks: 18, smokePuffs: 7, radius: 19, sound: 'shot' },
  heavy: { glow: '#fff1ac', spark: '#ff673b', smoke: '#474c52', sparks: 34, smokePuffs: 15, radius: 31, sound: 'heavy' },
  atomic: { glow: '#fff8cd', spark: '#ff4f3f', smoke: '#443b43', sparks: 48, smokePuffs: 21, radius: 42, sound: 'shot-mega' },
  electric: { glow: '#ebffff', spark: '#57d9ff', smoke: '#405d73', sparks: 32, smokePuffs: 5, radius: 28, sound: 'electric' },
  laser: { glow: '#fff4fd', spark: '#ff60c7', smoke: '#72446c', sparks: 31, smokePuffs: 4, radius: 29, sound: 'shot-laser' },
  fire: { glow: '#fff3a5', spark: '#ff7039', smoke: '#6c4439', sparks: 30, smokePuffs: 13, radius: 27, sound: 'shot-flame' },
  frost: { glow: '#ffffff', spark: '#7be9ff', smoke: '#a1d6e2', sparks: 29, smokePuffs: 12, radius: 26, sound: 'shot-cryo' },
  pierce: { glow: '#f7ffff', spark: '#c6e5ff', smoke: '#617583', sparks: 25, smokePuffs: 5, radius: 24, sound: 'shot-ap' },
  gravity: { glow: '#f4d8ff', spark: '#b56aff', smoke: '#695073', sparks: 38, smokePuffs: 11, radius: 33, sound: 'shot-gravity' },
  wind: { glow: '#eafff8', spark: '#83ebd8', smoke: '#86aca9', sparks: 34, smokePuffs: 6, radius: 30, sound: 'vortex-deflect' },
  bubbles: { glow: '#ffffff', spark: '#7de7e6', smoke: '#b7dff3', sparks: 18, smokePuffs: 14, radius: 25, sound: 'shot-soap' },
  harpoon: { glow: '#fff8df', spark: '#d5e7ed', smoke: '#646b72', sparks: 20, smokePuffs: 7, radius: 20, sound: 'shot-harpoon' },
  fireworks: { glow: '#fff6cd', spark: '#ff69cc', smoke: '#765c7b', sparks: 42, smokePuffs: 8, radius: 32, sound: 'shot-fireworks' },
  cluster: { glow: '#f5e8ff', spark: '#c18bff', smoke: '#5c5274', sparks: 32, smokePuffs: 10, radius: 27, sound: 'shot-cluster' },
  drone: { glow: '#e5fff8', spark: '#72e9c2', smoke: '#596772', sparks: 24, smokePuffs: 9, radius: 24, sound: 'shot-drone' },
  seismic: { glow: '#fff1c0', spark: '#ef7961', smoke: '#70605c', sparks: 31, smokePuffs: 13, radius: 29, sound: 'shot-seismic' },
  hunter: { glow: '#fff1d4', spark: '#ff7754', smoke: '#58616b', sparks: 29, smokePuffs: 14, radius: 29, sound: 'shot-hunter' },
  deploy: { glow: '#ddfff4', spark: '#78e7be', smoke: '#708881', sparks: 17, smokePuffs: 6, radius: 19, sound: 'shot-deploy' },
  support: { glow: '#f1fff6', spark: '#65e9a5', smoke: '#79a68e', sparks: 22, smokePuffs: 9, radius: 23, sound: 'pickup' },
});

export function shotLaunchStyle(shot = {}) {
  const weapon = shot.weapon || 'standard';
  if (shot.megaMissile || weapon === 'megaCannon') return { type: 'atomic', ...STYLES.atomic };
  if (shot.laser) return { type: 'laser', ...STYLES.laser };
  if (shot.freeze) return { type: 'frost', ...STYLES.frost };
  if (shot.armorPiercer) return { type: 'pierce', ...STYLES.pierce };
  if (shot.combo?.includes('molotov')) return { type: 'fire', ...STYLES.fire };
  if (shot.shockwave) return { type: 'gravity', ...STYLES.gravity };
  if (shot.bunkerBuster) return { type: 'seismic', ...STYLES.seismic };
  if (shot.bridgeKit) return { type: 'support', ...STYLES.support };
  if (weapon === 'vitalRecycling') return { type: 'support', ...STYLES.support, sound: 'shot-vital' };
  if (shot.combo?.includes('guidedBullet')) return { type: 'drone', ...STYLES.drone };
  if (shot.bigExplosion) return { type: 'heavy', ...STYLES.heavy };
  if (shot.elementalType) {
    const element = ({ elementalFire: 'fire', elementalWater: 'frost', elementalWind: 'wind', elementalEarth: 'seismic', elementalIce: 'frost' })[shot.elementalType];
    if (element) return { type: element, ...STYLES[element], sound: ({ elementalWater: 'shot-elemental-water', elementalEarth: 'shot-elemental-earth' })[shot.elementalType] || STYLES[element].sound };
  }
  const type = ({ heavy: 'heavy', zeus: 'electric', teslaOrb: 'electric', lightningRod: 'electric', verticalStrike: 'electric', gravity: 'gravity', elementalWind: 'wind', elementalFire: 'fire', elementalWater: 'frost', elementalEarth: 'seismic', soapBomb: 'bubbles', harpoon: 'harpoon', fireworks: 'fireworks', cluster: 'cluster', droneStrike: 'drone', flyingHunter: 'hunter', seismicCharge: 'seismic', moleBomb: 'seismic', bunkerBuster: 'seismic', sentry: 'deploy', mineLayer: 'deploy', waterMine: 'deploy', grenade: 'kinetic', markerBomb: 'seismic', vitalRecycling: 'support' })[weapon] || 'kinetic';
  const signature = ({ zeus: 'shot-zeus', teslaOrb: 'shot-tesla', lightningRod: 'shot-lightning-rod', mineLayer: 'shot-mine', waterMine: 'shot-water-mine', elementalWater: 'shot-elemental-water', elementalEarth: 'shot-elemental-earth' })[weapon];
  return { type, ...STYLES[type], sound: signature || STYLES[type].sound };
}

export function shotLaunchMuzzle(shot = {}, shooter = {}) {
  const points = shot.path || [];
  const start = points.find((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  const next = start && points.find((point) => point !== start && Math.hypot(point.x - start.x, point.y - start.y) > 2);
  const fallbackX = shooter.facing < 0 ? -1 : 1;
  const distance = next ? Math.hypot(next.x - start.x, next.y - start.y) : 0;
  const dx = distance > 0 ? (next.x - start.x) / distance : fallbackX;
  const dy = distance > 0 ? (next.y - start.y) / distance : 0;
  return { x: start?.x ?? (shooter.renderX ?? shooter.x ?? 0) + dx * 18, y: start?.y ?? (shooter.renderY ?? shooter.y ?? 0) - 12, dx, dy };
}

export function shotLaunchRecoil(type) {
  return ({ kinetic: 5, heavy: 9, atomic: 12, electric: 5, laser: 4, fire: 6, frost: 5, pierce: 7, gravity: 8, wind: 6, bubbles: 4, harpoon: 6, fireworks: 7, cluster: 7, drone: 5, seismic: 8, hunter: 7, deploy: 4, support: 3 })[type] || 5;
}

export function recoilDistance(recoil, time) {
  if (!recoil) return 0;
  const progress = (time - recoil.started) / recoil.duration;
  if (progress < 0 || progress >= 1) return 0;
  return recoil.distance * Math.min(1, progress / .12) * Math.pow(1 - progress, 1.5);
}
