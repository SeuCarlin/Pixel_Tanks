import { ARSENAL_DEFS, CLASS_DEFS, EVENT_DEFS, POWERUP_DEFS } from './constants.js';

// Cards with their own artwork must not consume a cell in the shared atlas.
export const STANDALONE_CARD_ART = Object.freeze({
  arsenal: Object.freeze(['megaCannon', 'flyingHunter', 'sentry', 'soapBomb', 'markerBomb', 'harpoon']),
  powerups: Object.freeze(['salvageHeal', 'extraLife']),
});

export const ART_ATLASES = Object.freeze({
  powerups: { types: Object.keys(POWERUP_DEFS).filter((type) => !STANDALONE_CARD_ART.powerups.includes(type)), columns: 7, rows: 4 },
  arsenal: { types: Object.keys(ARSENAL_DEFS).filter((type) => !STANDALONE_CARD_ART.arsenal.includes(type)), columns: 4, rows: 4 },
  classes: { types: Object.keys(CLASS_DEFS), columns: 4, rows: 2 },
  events: { types: Object.keys(EVENT_DEFS), columns: 3, rows: 3 },
});

export function atlasCell(type, section) {
  const atlas = ART_ATLASES[section];
  const index = atlas?.types.indexOf(type) ?? -1;
  if (!atlas || index < 0 || index >= atlas.columns * atlas.rows) return null;
  return { column: index % atlas.columns, row: Math.floor(index / atlas.columns) };
}

export function atlasStyle(type, section) {
  const arsenalArt = section === 'arsenal' && Object.hasOwn(ARSENAL_DEFS, type)
    ? `--arsenal-art:url('/assets/arsenal-v4/${type === 'harpoon' ? 'harpoon-simple' : type}.png');`
    : '';
  const atlas = ART_ATLASES[section];
  const cell = atlasCell(type, section);
  if (!cell) return arsenalArt;
  const x = atlas.columns > 1 ? cell.column / (atlas.columns - 1) * 100 : 0;
  const y = atlas.rows > 1 ? cell.row / (atlas.rows - 1) * 100 : 0;
  return `${arsenalArt}--atlas-columns:${atlas.columns};--atlas-rows:${atlas.rows};--atlas-x:${x}%;--atlas-y:${y}%`;
}
