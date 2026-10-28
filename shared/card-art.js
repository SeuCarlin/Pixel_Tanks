import { ARSENAL_DEFS, CLASS_DEFS, EVENT_DEFS, POWERUP_DEFS } from './constants.js';

// Cards with their own artwork must not consume a cell in the shared atlas.
export const STANDALONE_CARD_ART = Object.freeze({
  arsenal: Object.freeze(['megaCannon', 'flyingHunter', 'sentry', 'soapBomb', 'markerBomb', 'harpoon', 'vitalRecycling', 'superheat', 'mixer', 'splitDamage', 'ninjaFatal', 'waterCannon', 'waterHunter', 'waterMine', 'waterTorpedo', 'elementalFire', 'elementalWater', 'elementalWind', 'windPlate', 'elementalEarth', 'elementalIce', 'kineticCannon', 'cryoMortar', 'meteorSalvo', 'blink', 'healingDrone', 'plasmaCore', 'corrosionShell', 'rescueFlare']),
  powerups: Object.freeze(['salvageHeal', 'extraLife', 'fieldRepair', 'fireFoam', 'buoy', 'extraFuel', 'ironheart', 'scoutPulse', 'overclockShell']),
  classes: Object.freeze(['armored', 'attacker', 'bomber', 'healer', 'meteorologist', 'ninja', 'saboteur', 'backpacker', 'incendiary', 'amphibian', 'specialist', 'elementalist']),
  events: Object.freeze(['flood', 'flora', 'blizzard']),
});

export const ART_ATLASES = Object.freeze({
  powerups: { types: Object.keys(POWERUP_DEFS).filter((type) => !STANDALONE_CARD_ART.powerups.includes(type)), columns: 7, rows: 4 },
  arsenal: { types: Object.keys(ARSENAL_DEFS).filter((type) => !STANDALONE_CARD_ART.arsenal.includes(type)), columns: 4, rows: 4 },
  classes: { types: Object.keys(CLASS_DEFS).filter((type) => !STANDALONE_CARD_ART.classes.includes(type)), columns: 4, rows: 2 },
  events: { types: Object.keys(EVENT_DEFS).filter((type) => !STANDALONE_CARD_ART.events.includes(type)), columns: 3, rows: 3 },
});

export function atlasCell(type, section) {
  const atlas = ART_ATLASES[section];
  const index = atlas?.types.indexOf(type) ?? -1;
  if (!atlas || index < 0 || index >= atlas.columns * atlas.rows) return null;
  return { column: index % atlas.columns, row: Math.floor(index / atlas.columns) };
}

export function atlasStyle(type, section) {
  if (['ironheart', 'scoutPulse', 'overclockShell'].includes(type) && section === 'powerups') return `--powerup-art:url('/assets/new-cards/${type}.png');`;
  if (section === 'events' && type === 'flora') return "--event-art:url('/assets/flora-event-v1.png');";
  if (section === 'classes' && Object.hasOwn(CLASS_DEFS, type)) return `--class-art:url('/assets/classes-v2/${type}.png');`;
  if (section === 'powerups' && type === 'buoy') return "--powerup-art:url('/assets/buoy-card-v1.png');";
  if (section === 'powerups' && type === 'fieldRepair') return "--powerup-art:url('/assets/field-repair-card-v1.png');";
  if (section === 'powerups' && type === 'fireFoam') return "--powerup-art:url('/assets/fire-foam-card-v1.png');";
  if (section === 'powerups' && type === 'extraFuel') return "--powerup-art:url('/assets/extra-fuel-card-v1.png');";
  const arsenalArt = section === 'arsenal' && Object.hasOwn(ARSENAL_DEFS, type)
    ? `--arsenal-art:url('/assets/arsenal-v4/${type === 'harpoon' ? 'harpoon-simple' : ['elementalFire', 'elementalWater', 'elementalWind', 'elementalEarth', 'elementalIce'].includes(type) ? `${type}-v2` : ['cryoMortar', 'kineticCannon', 'meteorSalvo', 'blink'].includes(type) ? `${type}-v3` : type === 'healingDrone' ? `${type}-v2` : type}.png');`
    : '';
  const atlas = ART_ATLASES[section];
  const cell = atlasCell(type, section);
  if (!cell) return arsenalArt;
  const x = atlas.columns > 1 ? cell.column / (atlas.columns - 1) * 100 : 0;
  const y = atlas.rows > 1 ? cell.row / (atlas.rows - 1) * 100 : 0;
  return `${arsenalArt}--atlas-columns:${atlas.columns};--atlas-rows:${atlas.rows};--atlas-x:${x}%;--atlas-y:${y}%`;
}
