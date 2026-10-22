import { ARSENAL_DEFS, CLASS_DEFS, EVENT_DEFS, POWERUP_DEFS } from './constants.js';

// Cards with their own artwork must not consume a cell in the shared atlas.
export const STANDALONE_CARD_ART = Object.freeze({
  arsenal: Object.freeze(['megaCannon', 'flyingHunter', 'sentry', 'soapBomb', 'markerBomb', 'harpoon', 'vitalRecycling', 'superheat', 'splitDamage', 'ninjaFatal', 'waterCannon', 'waterHunter', 'waterMine', 'waterTorpedo', 'elementalFire', 'elementalWater', 'elementalWind', 'windPlate', 'elementalEarth', 'elementalIce', 'kineticCannon', 'cryoMortar', 'meteorSalvo', 'blink', 'healingDrone']),
  powerups: Object.freeze(['salvageHeal', 'extraLife', 'fieldRepair', 'fireFoam', 'buoy']),
  classes: Object.freeze(['incendiary', 'amphibian', 'specialist', 'elementalist']),
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
  if (section === 'events' && type === 'flora') return "--event-art:url('/assets/flora-event-v1.png');";
  if (section === 'classes' && type === 'incendiary') return "--class-art:url('/assets/incendiary-class-v1.png');";
  if (section === 'classes' && type === 'amphibian') return "--class-art:url('/assets/amphibian-class-v1.png');";
  if (section === 'classes' && type === 'specialist') return "--class-art:url('/assets/specialist-class-v1.png');";
  if (section === 'classes' && type === 'elementalist') return "--class-art:url('/assets/elementalist-class-v1.png');";
  if (section === 'powerups' && type === 'buoy') return "--powerup-art:url('/assets/buoy-card-v1.png');";
  if (section === 'powerups' && type === 'fieldRepair') return "--powerup-art:url('/assets/field-repair-card-v1.png');";
  if (section === 'powerups' && type === 'fireFoam') return "--powerup-art:url('/assets/fire-foam-card-v1.png');";
  const arsenalArt = section === 'arsenal' && Object.hasOwn(ARSENAL_DEFS, type)
    ? `--arsenal-art:url('/assets/arsenal-v4/${type === 'harpoon' ? 'harpoon-simple' : ['cryoMortar', 'kineticCannon', 'meteorSalvo', 'blink', 'healingDrone'].includes(type) ? `${type}-v2` : type}.png');`
    : '';
  const atlas = ART_ATLASES[section];
  const cell = atlasCell(type, section);
  if (!cell) return arsenalArt;
  const x = atlas.columns > 1 ? cell.column / (atlas.columns - 1) * 100 : 0;
  const y = atlas.rows > 1 ? cell.row / (atlas.rows - 1) * 100 : 0;
  return `${arsenalArt}--atlas-columns:${atlas.columns};--atlas-rows:${atlas.rows};--atlas-x:${x}%;--atlas-y:${y}%`;
}
