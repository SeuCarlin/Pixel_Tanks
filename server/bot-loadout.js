import { CLASS_DEFS, SELECTABLE_ARSENAL_ITEMS } from '../shared/constants.js';

// Each draw has a 40% chance to come from cards that complement the class.
// The other 60% comes from different cards, so the probability stays explicit.
export const BOT_ARSENAL_SYNERGY = Object.freeze({
  armored: ['armoredDash', 'jump', 'splitDamage', 'harpoon'],
  attacker: ['heavy', 'cluster', 'flyingHunter', 'verticalStrike'],
  bomber: ['fireworks', 'gravity', 'seismicCharge', 'superheat'],
  healer: ['vitalRecycling', 'sentry', 'soapBomb', 'splitDamage'],
  meteorologist: ['zeus', 'teslaOrb', 'droneStrike', 'verticalStrike'],
  ninja: ['jump', 'harpoon', 'armoredDash', 'spider'],
  saboteur: ['teslaOrb', 'sentry', 'mineLayer', 'seismicCharge'],
  backpacker: ['jump', 'spider', 'splitDamage', 'vitalRecycling'],
  engineer: ['sentry', 'mineLayer', 'splitDamage', 'droneStrike'],
  incendiary: ['superheat', 'fireworks', 'markerBomb', 'gravity'],
  amphibian: ['jump', 'harpoon', 'soapBomb', 'waterTorpedo'],
  elementalist: ['fireworks', 'gravity', 'soapBomb', 'seismicCharge'],
  specialist: ['sentry', 'droneStrike', 'teslaOrb', 'harpoon'],
});

export function chooseBotClass(excluded = [], random = Math.random) {
  const classes = Object.keys(CLASS_DEFS);
  const available = classes.filter((type) => !excluded.includes(type));
  const pool = available.length ? available : classes;
  return pool[Math.floor(random() * pool.length)];
}

export function chooseBotArsenal(classType, random = Math.random) {
  const favored = (BOT_ARSENAL_SYNERGY[classType] || []).filter((type) => SELECTABLE_ARSENAL_ITEMS.includes(type));
  const chosen = [];
  while (chosen.length < 3) {
    const remaining = SELECTABLE_ARSENAL_ITEMS.filter((type) => !chosen.includes(type));
    const matching = remaining.filter((type) => favored.includes(type));
    const other = remaining.filter((type) => !favored.includes(type));
    const prefer = random() < 0.4;
    const pool = (prefer ? matching : other).length ? (prefer ? matching : other) : remaining;
    chosen.push(pool[Math.floor(random() * pool.length)]);
  }
  return chosen;
}
