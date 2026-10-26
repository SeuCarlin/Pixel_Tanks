// Combat records and medal art share one vocabulary on the server and client.
export const MEDAL_DEFS = Object.freeze([
  { id: 'reaction', name: 'Reflexo', unit: 's', better: 'low', thresholds: [5, 2.5, 1], color: '#ffe072', glyph: ['..###..','.##.##.','##...##','##.#.##','##...##','.##.##.','..###..'] },
  { id: 'movement', name: 'Marcha', unit: 'blocos', thresholds: [200, 700, 1600], color: '#c9ea65', glyph: ['..##...', '..##.##', '.####.#', '.##...#', '###...#', '#####..', '.####..'] },
  { id: 'jumps', name: 'Salto', unit: 'saltos', thresholds: [2, 5, 10], color: '#ffba67', glyph: ['...#...', '..###..', '.##.##.', '##.#.##', '...#...', '..###..', '.##.##.'] },
  { id: 'flights', name: 'Voo', unit: 's', thresholds: [3, 10, 25], color: '#90dcff', glyph: ['#.....#','##...##','.##.##.','..###..','...#...','..###..','...#...'] },
  { id: 'glides', name: 'Planagem', unit: 's', thresholds: [2, 7, 16], color: '#81ece5', glyph: ['.#####.','##...##','#######','...#...','...#...','..###..','..###..'] },
  { id: 'teleports', name: 'Dobra', unit: 'saltos', thresholds: [1, 3, 6], color: '#bf8aff', glyph: ['.##.##.','##...##','#..#..#','...#...','#..#..#','##...##','.##.##.'] },
  { id: 'territory', name: 'Explorador', unit: 'setores', thresholds: [5, 12, 25], color: '#e6cf8a', glyph: ['#######','#.#.#.#','##.#.##','#.###.#','##.#.##','#.#.#.#','#######'] },
  { id: 'damage', name: 'Impacto', unit: 'HP', thresholds: [100, 300, 650], color: '#ff7058', glyph: ['...#...','..###..','#######','.#####.','#######','..###..','...#...'] },
  { id: 'destruction', name: 'Demolidor', unit: 'pts', thresholds: [250, 750, 1600], color: '#ff9a56', glyph: ['#.....#','.##.##.','..###..','#######','..###..','.##.##.','#.....#'] },
  { id: 'kills', name: 'Caçador', unit: 'abates', thresholds: [1, 2, 4], color: '#ff6262', glyph: ['.#####.','##...##','##.#.##','##...##','.#####.','..#.#..','..#.#..'] },
  { id: 'damageTaken', name: 'Resistência', unit: 'HP', thresholds: [100, 250, 500], color: '#8caaff', glyph: ['.#####.','##...##','#.#.#.#','#.#.#.#','#.#.#.#','.##.##.','..###..'] },
  { id: 'healed', name: 'Recuperação', unit: 'HP', thresholds: [40, 120, 260], color: '#64e69a', glyph: ['..###..','..###..','#######','#######','#######','..###..','..###..'] },
  { id: 'healingDone', name: 'Socorrista', unit: 'HP', thresholds: [25, 75, 160], color: '#90f2b8', glyph: ['#.....#','.##.##.','..###..','#######','.#####.','..###..','...#...'] },
  { id: 'arsenalUses', name: 'Arsenal', unit: 'usos', thresholds: [2, 5, 10], color: '#ffb85b', glyph: ['...#...', '..###..', '#######', '.#####.', '..###..', '..###..', '..###..'] },
  { id: 'powerupUses', name: 'Alquimia', unit: 'usos', thresholds: [2, 5, 9], color: '#db8eff', glyph: ['..###..','.##.##.','##.#.##','##...##','.#####.','..###..','...#...'] },
  { id: 'gameplaySeconds', name: 'Veterano', unit: 'min', thresholds: [5, 15, 30], color: '#f0d27c', glyph: ['.#####.','##...##','#..#..#','#..###','#.....#','##...##','.#####.'] },
]);

export const MEDAL_TIERS = ['bronze', 'prata', 'ouro'];
export const medalDefinition = (id) => MEDAL_DEFS.find((entry) => entry.id === id);
export function medalValue(metrics, id) {
  if (id === 'reaction') return metrics.reactionCount ? metrics.reactionMs / metrics.reactionCount / 1000 : null;
  if (id === 'flights') return (metrics.flightMs || 0) / 1000;
  if (id === 'glides') return (metrics.glideMs || 0) / 1000;
  if (id === 'gameplaySeconds') return (metrics.playMs || 0) / 60000;
  if (id === 'territory') return metrics.territoryCells || 0;
  return metrics[id] || 0;
}
export function matchMedals(metrics) {
  return MEDAL_DEFS.flatMap((definition) => {
    const value = medalValue(metrics, definition.id);
    if (value === null || value === 0) return [];
    const tier = definition.thresholds.reduce((best, threshold, index) => definition.better === 'low' ? value <= threshold ? index : best : value >= threshold ? index : best, -1);
    return tier < 0 ? [] : [{ id: definition.id, tier: MEDAL_TIERS[tier], value: Math.round(value * 10) / 10 }];
  });
}
export function matchSpotlights(entries) {
  return MEDAL_DEFS.flatMap((definition) => {
    const ranked = entries.map((entry) => ({ playerId: entry.playerId, value: medalValue(entry.metrics, definition.id) }))
      .filter((entry) => entry.value !== null && entry.value > 0)
      .sort((a, b) => definition.better === 'low' ? a.value - b.value : b.value - a.value);
    return ranked.length ? [{ id: definition.id, playerId: ranked[0].playerId, value: Math.round(ranked[0].value * 10) / 10 }] : [];
  });
}
export function medalArtSvg(id, tier = 'bronze') {
  const definition = medalDefinition(id);
  if (!definition) return '';
  const metal = ({ bronze: '#b87542', prata: '#cbdce8', ouro: '#ffe377' })[tier] || '#b87542';
  const pixels = definition.glyph.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === '.' ? [] : [`<rect x="${11 + x * 7}" y="${10 + y * 7}" width="7" height="7" fill="${pixel === '+' ? '#ffffff' : definition.color}"/>`])).join('');
  return `<svg class="medal-art" viewBox="0 0 72 72" role="img" aria-label="Medalha ${definition.name}" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h68v68H2z" fill="#07131f" stroke="${metal}" stroke-width="4"/><path d="M7 7h58v58H7z" fill="#10243a" stroke="#274b62" stroke-width="2"/><path d="M6 6h8v4H6zm52 0h8v4h-8zM6 62h8v4H6zm52 0h8v4h-8z" fill="${metal}"/>${pixels}</svg>`;
}
