// Only captured footage is listed here. Other cards retain their illustrated preview.
export const GAMEPLAY_PREVIEW_TYPES = Object.freeze({
  powerups: Object.freeze(new Set([
    'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze',
    'guidedBullet', 'bridgeKit', 'teleport', 'armorPiercer', 'shockwave',
    'bunkerBuster', 'molotov', 'laser', 'mirror',
  ])),
  arsenal: Object.freeze(new Set([
    'heavy', 'cluster', 'fireworks', 'zeus', 'gravity', 'grenade', 'mineLayer',
    'moleBomb', 'verticalStrike', 'soapBomb', 'markerBomb', 'harpoon', 'sentry',
    'droneStrike', 'teslaOrb', 'seismicCharge', 'megaCannon', 'lightningRod',
    'flyingHunter', 'vitalRecycling', 'waterCannon', 'waterHunter', 'waterMine',
    'waterTorpedo', 'elementalFire', 'elementalWater', 'elementalWind', 'windPlate',
    'elementalEarth', 'elementalIce', 'kineticCannon', 'cryoMortar', 'meteorSalvo',
  ])),
  events: Object.freeze(new Set([
    'supply', 'quake', 'bombardment', 'lightning', 'collapse', 'tectonic',
    'luckyWinds', 'eruption', 'gale', 'flood', 'flora', 'blizzard',
  ])),
});

export function gameplayPreviewUrl(type, section) {
  const prefix = section === 'powerups' ? 'powerup-' : section === 'events' ? 'event-' : '';
  return GAMEPLAY_PREVIEW_TYPES[section]?.has(type) ? `/assets/gameplay-previews/${prefix}${type}.mp4` : null;
}
