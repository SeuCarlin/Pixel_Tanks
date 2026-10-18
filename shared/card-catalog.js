import { ARSENAL_DEFS, CLASS_DEFS, CLASS_EVOLUTIONS, EVENT_DEFS, POWERUP_DEFS, WEAPON_BALANCE, MEGA_BOMB } from './constants.js';

export const CARD_SECTIONS = Object.freeze({ powerups: POWERUP_DEFS, arsenal: ARSENAL_DEFS, classes: CLASS_DEFS, events: EVENT_DEFS });

const ROLES = Object.freeze({
  dano: new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'armorPiercer', 'bunkerBuster', 'molotov', 'laser', 'mirror', 'flyingHunter', 'heavy', 'cluster', 'fireworks', 'zeus', 'grenade', 'mineLayer', 'moleBomb', 'verticalStrike', 'droneStrike', 'teslaOrb', 'seismicCharge', 'megaCannon', 'attacker', 'bomber', 'bombardment', 'eruption']),
  movimento: new Set(['movementBoost', 'rocketDash', 'lightningStep', 'bridgeKit', 'teleport', 'excavator', 'trickster', 'armoredDash', 'jump', 'spider', 'ninja', 'gale']),
  defesa: new Set(['heal', 'salvageHeal', 'extraLife', 'shield', 'invisibility', 'repairDrone', 'armored', 'healer', 'luckyWinds']),
  controle: new Set(['freeze', 'guidedBullet', 'shockwave', 'gravity', 'lightningRod', 'sentry', 'meteorologist', 'saboteur', 'quake', 'lightning', 'collapse', 'tectonic']),
  suporte: new Set(['lootbox', 'ammoCrate', 'overcharge', 'backpacker', 'supply']),
});

export const CARD_ROLE_LABELS = Object.freeze({ dano: 'DANO', movimento: 'MOBILIDADE', defesa: 'DEFESA', controle: 'CONTROLE', suporte: 'SUPORTE' });

export function cardRole(type) { return Object.keys(ROLES).find((role) => ROLES[role].has(type)) || null; }

export function cardActivation(type, section) {
  if (section === 'classes') return 'PASSIVA CONTÍNUA';
  if (section === 'events') return 'EVENTO DE ARENA';
  if (type === 'megaCannon') return 'ATACANTE • 1000 PONTOS';
  if (section === 'arsenal') return ARSENAL_DEFS[type]?.kind === 'movement' ? 'USAR NO MOVIMENTO' : 'DISPARAR';
  if (type === 'extraLife') return 'AUTOMÁTICO AO SER ELIMINADO';
  if (['heal', 'ammoCrate', 'lootbox', 'overcharge', 'repairDrone', 'movementBoost', 'invisibility', 'shield'].includes(type)) return 'AUTOMÁTICO AO COLETAR';
  if (['rocketDash', 'excavator'].includes(type)) return 'USAR NO MOVIMENTO';
  if (['lightningStep', 'trickster'].includes(type)) return 'TOCAR NO MAPA';
  return 'EQUIPAR E DISPARAR';
}

export function cardDamage(type) {
  if (type === 'lightningRod') return `${WEAPON_BALANCE.lightningRod.zapDamage} HP POR TURNO NO RAIO`;
  if (type === 'sentry') return `${WEAPON_BALANCE.sentry.projectiles}×${WEAPON_BALANCE.sentry.damage} HP A CADA 2 TURNOS`;
  if (type === 'megaMissile') return `ATÉ ${MEGA_BOMB.damage} HP`;
  const balance = WEAPON_BALANCE[type];
  if (balance?.damage > 0) return type === 'heavy' ? `${balance.damage}–${Math.round(balance.damage * balance.maxMultiplier)} HP` : type === 'cluster' || type === 'mineLayer' ? `${balance.damage} HP POR PROJÉTIL` : `${balance.damage} HP`;
  return null;
}

export function cardCombo(type) {
  if (['megaMissile', 'bigExplosion', 'freeze', 'guidedBullet', 'armorPiercer', 'shockwave', 'bunkerBuster', 'molotov', 'mirror', 'doubleShot', 'tripleShot', 'salvageHeal'].includes(type)) return 'COMBINA COM TIROS';
  if (['jump', 'rocketDash', 'armoredDash'].includes(type)) return 'COMBINA COM MOVIMENTO';
  return null;
}

export function classProgressionDescription(info) { return `${info.description} Nos marcos de 1/3 e 2/3 da partida, escolha: ${Object.values(CLASS_EVOLUTIONS).map((evolution) => `${evolution.name}: ${evolution.description}`).join(' ou ')}`; }
export function searchableCard(type, info) { return `${type} ${info.name} ${info.short || ''} ${CLASS_DEFS[type] === info ? classProgressionDescription(info) : info.description} ${cardRole(type)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
