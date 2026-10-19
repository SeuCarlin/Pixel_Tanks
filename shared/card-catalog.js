import { ARSENAL_DEFS, CLASS_DEFS, CLASS_EVOLUTIONS, EVENT_DEFS, POWERUP_DEFS, WEAPON_BALANCE, MEGA_BOMB } from './constants.js';

export const CARD_SECTIONS = Object.freeze({ powerups: POWERUP_DEFS, arsenal: ARSENAL_DEFS, classes: CLASS_DEFS, events: EVENT_DEFS });

const ROLES = Object.freeze({
  dano: new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'armorPiercer', 'bunkerBuster', 'molotov', 'laser', 'mirror', 'flyingHunter', 'heavy', 'cluster', 'fireworks', 'zeus', 'grenade', 'mineLayer', 'moleBomb', 'verticalStrike', 'markerBomb', 'droneStrike', 'teslaOrb', 'seismicCharge', 'megaCannon', 'attacker', 'bomber', 'bombardment', 'eruption']),
  movimento: new Set(['movementBoost', 'rocketDash', 'lightningStep', 'bridgeKit', 'teleport', 'excavator', 'trickster', 'armoredDash', 'harpoon', 'jump', 'spider', 'ninja', 'gale']),
  defesa: new Set(['heal', 'salvageHeal', 'extraLife', 'shield', 'invisibility', 'repairDrone', 'armored', 'healer', 'luckyWinds']),
  controle: new Set(['freeze', 'guidedBullet', 'shockwave', 'gravity', 'soapBomb', 'lightningRod', 'sentry', 'meteorologist', 'saboteur', 'quake', 'lightning', 'collapse', 'tectonic']),
  suporte: new Set(['lootbox', 'ammoCrate', 'overcharge', 'backpacker', 'supply']),
});

export const CARD_ROLE_LABELS = Object.freeze({ dano: 'DANO', movimento: 'MOBILIDADE', defesa: 'DEFESA', controle: 'CONTROLE', suporte: 'SUPORTE' });

export function cardRole(type) { return Object.keys(ROLES).find((role) => ROLES[role].has(type)) || null; }

export function cardActivation(type, section) {
  if (section === 'classes') return 'PASSIVA CONTÍNUA';
  if (section === 'events') return 'EVENTO DE ARENA';
  if (type === 'megaCannon') return 'ATACANTE • 1000 PONTOS (+500/USO)';
  if (type === 'harpoon') return '2 ATIVAÇÕES • 1 MOVIMENTO';
  if (section === 'arsenal') return ARSENAL_DEFS[type]?.kind === 'movement' ? 'USAR NO MOVIMENTO' : 'DISPARAR';
  if (type === 'extraLife') return 'AUTOMÁTICO AO SER ELIMINADO';
  if (['heal', 'ammoCrate', 'lootbox', 'overcharge', 'repairDrone', 'movementBoost', 'invisibility', 'shield'].includes(type)) return 'AUTOMÁTICO AO COLETAR';
  if (['rocketDash', 'excavator'].includes(type)) return 'USAR NO MOVIMENTO';
  if (['lightningStep', 'trickster'].includes(type)) return 'TOCAR NO MAPA';
  return 'EQUIPAR E DISPARAR';
}

export function cardDamage(type) {
  if (type === 'zeus') return '40 + 40 HP';
  if (type === 'lightningRod') return `${WEAPON_BALANCE.lightningRod.zapDamage} HP POR TURNO NO RAIO`;
  if (type === 'sentry') return `${WEAPON_BALANCE.sentry.projectiles}×${WEAPON_BALANCE.sentry.damage} HP A CADA 2 TURNOS`;
  if (type === 'markerBomb') return '10 HP + 3 × 30 HP';
  if (type === 'soapBomb') return 'ATÉ 3 × 30 HP';
  if (type === 'megaMissile') return `ATÉ ${MEGA_BOMB.damage} HP`;
  const balance = WEAPON_BALANCE[type];
  if (balance?.damage > 0) return type === 'heavy' ? `${balance.damage}–${Math.round(balance.damage * balance.maxMultiplier * balance.criticalMultiplier)} HP (CRÍT.)` : type === 'cluster' || type === 'mineLayer' ? `${balance.damage} HP POR PROJÉTIL` : `${balance.damage} HP`;
  return null;
}

export function cardRange(type) {
  const ranges = { soapBomb: '460 BLOCOS', gravity: '410 BLOCOS', sentry: '300 BLOCOS', harpoon: '1750 BLOCOS', lightningRod: '360 BLOCOS', teslaOrb: '440 BLOCOS', bunkerBuster: '128 BLOCOS', shockwave: '82 BLOCOS', bigExplosion: '+55% DE RAIO', ammoCrate: 'TODO O ARSENAL' };
  if (ranges[type]) return ranges[type];
  const radius = WEAPON_BALANCE[type]?.radius;
  return radius > 0 ? `${radius} BLOCOS` : null;
}

// Compact facts for class cards. Full rules remain in CLASS_DEFS for tooltips and search.
export function classCardStats(type) {
  return {
    armored: ['+50 HP / -10 DANO', 'ESCUDO / 2 RODADAS'],
    attacker: ['+20 DANO + 10% HP', 'INTERVENÇÃO / 1000 PTS'],
    bomber: ['+15 DANO / +18 RAIO', 'MORTE: 80 HP / 160 BLOCOS'],
    healer: ['+5 HP / TURNO', '+18 HP EM ALIADOS'],
    meteorologist: ['-35% DANO DE EVENTOS', 'HASTE / RODADA 2'],
    ninja: ['+24 PX/S / +70 COMB.', 'CORTE / 100 HP'],
    saboteur: ['TESLA / RODADA', 'PULSO / 3 RODADAS'],
    backpacker: ['+100 COMBUSTÍVEL', 'TROCA / 3 RODADAS'],
  }[type] || ['—', '—'];
}

export function conciseCardDescription(type, info, section) {
  const descriptions = {
    armored: 'Corpo maior e escudo para aliados. Regenera e amortece quedas.',
    attacker: 'Perfura escudos e causa dano extra. Eliminações aceleram a Intervenção.',
    bomber: 'Explosões maiores. Ao morrer, detona 160 blocos e causa 80 HP.',
    healer: 'Cura a cada turno e protege aliados próximos. Tiros em aliados restauram vida.',
    meteorologist: 'Recebe a Haste na rodada 2. Atrai eventos bons e resiste aos perigosos.',
    ninja: 'Corre, escala e usa Blink. Some quando ileso, corta de perto e amortece quedas.',
    saboteur: 'Recebe Tesla a cada rodada e resiste a travas. Seu pulso causa dano e pane.',
    backpacker: 'Atrai powerups, compartilha ativos e troca o arsenal. Sofre mais nas quedas.',
    ammoCrate: '+2 cargas em cada arma (até 4) e recargas zeradas.',
    zeus: 'O impacto marca o alvo. Após 2 s, um raio cai no mesmo ponto; coberturas o bloqueiam.',
    gravity: 'Puxa tanques e estruturas por 4 s; abre uma cratera no centro.',
    soapBomb: 'Até 3 tanques flutuam por 5 s; bolhas evitam obstáculos e estouram.',
    bunkerBuster: 'O projétil perfura e escava uma cratera larga e profunda por 4 s.',
    heavy: 'Altura e distância carregam o dano; no limite, acerta criticamente.',
    megaCannon: 'Marca o impacto; após 3 s, um feixe atravessa o cenário. Custo +500 por uso.',
    sentry: 'Torre destrutível: 5 tiros a cada 2 turnos; intercepta projéteis.',
    harpoon: '1º disparo prende o cabo; 2ª ativação puxa você ou o alvo. Ainda pode atirar.',
    cluster: 'Toque durante o voo para dividir a cápsula em 3 mísseis.',
    fireworks: 'Toque durante o voo para soltar 12 microfoguetes em todas as direções.',
    markerBomb: 'Quica 3 vezes e marca o solo; as 3 marcas detonam após 3 s.',
    armoredDash: 'Atropela, rompe até 3 paredes e ignora minas durante o avanço.',
    flyingHunter: 'Sobe alto, escolhe o inimigo mais próximo e mergulha nele.',
    lightningRod: 'Antena destrutível: atrai eventos e atinge inimigos próximos a cada turno.',
    spider: 'Salta até a primeira parede. Segure a direção para escalar; a habilidade é permanente.',
    jump: 'Salta na direção da mira. Combina com Dash; no ar, pode abrir paraquedas.',
    armorPiercer: 'Atravessa escudos; sem escudo, fratura as esteiras por 1 turno.',
    shockwave: 'O impacto arremessa tanques com força.',
    bigExplosion: 'Amplia o raio da próxima explosão sem alterar o dano.',
  };
  if (descriptions[type]) return descriptions[type];
  if (section === 'classes') return info.description.slice(0, 190);
  const summary = info.description.replace(/\s*Dano:\s*[^.]+\.?/gi, '').replace(/\s+/g, ' ').trim();
  if (summary.length <= 150) return summary;
  return `${summary.slice(0, summary.lastIndexOf(' ', 145))}…`;
}

export function cardCombo(type) {
  if (['megaMissile', 'bigExplosion', 'freeze', 'guidedBullet', 'armorPiercer', 'shockwave', 'bunkerBuster', 'molotov', 'mirror', 'doubleShot', 'tripleShot', 'salvageHeal'].includes(type)) return 'COMBINA COM TIROS';
  if (['jump', 'rocketDash', 'armoredDash'].includes(type)) return 'COMBINA COM MOVIMENTO';
  return null;
}

export function classProgressionDescription(info) { return `${info.description} Nos marcos de 1/3 e 2/3 da partida, escolha: ${Object.values(CLASS_EVOLUTIONS).map((evolution) => `${evolution.name}: ${evolution.description}`).join(' ou ')}`; }
export function searchableCard(type, info) { return `${type} ${info.name} ${info.short || ''} ${CLASS_DEFS[type] === info ? classProgressionDescription(info) : info.description} ${cardRole(type)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
