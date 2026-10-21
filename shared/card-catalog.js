import { ARSENAL_DEFS, CLASS_DEFS, CLASS_EVOLUTIONS, EVENT_DEFS, POWERUP_DEFS, WEAPON_BALANCE, MEGA_BOMB } from './constants.js';

export const CARD_SECTIONS = Object.freeze({ powerups: POWERUP_DEFS, arsenal: ARSENAL_DEFS, classes: CLASS_DEFS, events: EVENT_DEFS });

const ROLES = Object.freeze({
  dano: new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'armorPiercer', 'bunkerBuster', 'molotov', 'laser', 'mirror', 'flyingHunter', 'heavy', 'cluster', 'fireworks', 'zeus', 'grenade', 'mineLayer', 'moleBomb', 'verticalStrike', 'markerBomb', 'droneStrike', 'teslaOrb', 'seismicCharge', 'megaCannon', 'superheat', 'ninjaFatal', 'elementalFire', 'elementalWater', 'elementalEarth', 'attacker', 'bomber', 'incendiary', 'bombardment', 'eruption']),
  movimento: new Set(['movementBoost', 'rocketDash', 'lightningStep', 'bridgeKit', 'teleport', 'excavator', 'trickster', 'armoredDash', 'harpoon', 'jump', 'spider', 'ninja', 'gale']),
  defesa: new Set(['heal', 'salvageHeal', 'vitalRecycling', 'splitDamage', 'extraLife', 'shield', 'invisibility', 'repairDrone', 'fireFoam', 'buoy', 'armored', 'healer', 'luckyWinds']),
  controle: new Set(['freeze', 'guidedBullet', 'shockwave', 'gravity', 'soapBomb', 'lightningRod', 'sentry', 'waterCannon', 'waterHunter', 'waterMine', 'waterTorpedo', 'elementalWind', 'amphibian', 'elementalist', 'meteorologist', 'saboteur', 'quake', 'lightning', 'collapse', 'tectonic', 'flood']),
  suporte: new Set(['lootbox', 'ammoCrate', 'overcharge', 'backpacker', 'supply', 'specialist', 'fieldRepair', 'flora']),
});

export const CARD_ROLE_LABELS = Object.freeze({ dano: 'DANO', movimento: 'MOBILIDADE', defesa: 'DEFESA', controle: 'CONTROLE', suporte: 'SUPORTE' });

export function cardRole(type) { return Object.keys(ROLES).find((role) => ROLES[role].has(type)) || null; }

export function cardActivation(type, section) {
  if (type === 'fieldRepair') return 'AUTOMÁTICO AO COLETAR';
  if (type === 'fireFoam') return 'AUTOMÁTICO AO COLETAR';
  if (section === 'classes') return 'PASSIVA CONTÍNUA';
  if (section === 'events') return 'EVENTO DE ARENA';
  if (type === 'megaCannon') return 'ATACANTE • 1000 PONTOS (+500/USO)';
  if (type === 'waterCannon') return 'EXCLUSIVO DO ANFÍBIO • DISPARAR';
  if (type === 'buoy') return 'ATIVAR NO INVENTÁRIO';
  if (type === 'waterTorpedo') return 'DISPARAR SUBMERSO';
  if (type.startsWith('elemental')) return 'ELEMENTALISTA • 1 POR TURNO';
  if (type === 'ninjaFatal') return 'NINJA • PERTO DE INIMIGO';
  if (type === 'harpoon') return '2 ATIVAÇÕES • 1 MOVIMENTO';
  if (type === 'splitDamage') return 'ATIVAR • DEFESA';
  if (type === 'superheat') return 'PASSIVA • AUTOMÁTICA DESDE O INÍCIO';
  if (section === 'arsenal') return ARSENAL_DEFS[type]?.kind === 'movement' ? 'USAR NO MOVIMENTO' : 'DISPARAR';
  if (type === 'extraLife') return 'AUTOMÁTICO AO SER ELIMINADO';
  if (['heal', 'ammoCrate', 'lootbox', 'overcharge', 'repairDrone', 'movementBoost', 'invisibility', 'shield'].includes(type)) return 'AUTOMÁTICO AO COLETAR';
  if (['rocketDash', 'excavator'].includes(type)) return 'USAR NO MOVIMENTO';
  if (['lightningStep', 'trickster'].includes(type)) return 'TOCAR NO MAPA';
  return 'EQUIPAR E DISPARAR';
}

export function cardDamage(type) {
  if (type === 'ninjaFatal') return '80 HP POR CORTE';
  if (type === 'zeus') return '40 + 40 HP';
  if (type === 'lightningRod') return `${WEAPON_BALANCE.lightningRod.zapDamage} HP POR TURNO NO RAIO`;
  if (type === 'sentry') return `${WEAPON_BALANCE.sentry.projectiles}×${WEAPON_BALANCE.sentry.damage} HP A CADA 2 TURNOS`;
  if (type === 'markerBomb') return '10 HP + 3 × 30 HP';
  if (type === 'soapBomb') return 'ATÉ 3 × 30 HP';
  if (type === 'superheat') return '25 HP / 2 TURNOS INIMIGOS';
  if (type === 'splitDamage') return '50% REFLETIDO';
  if (type === 'vitalRecycling') return 'CURA: 25% DA DESTRUIÇÃO';
  if (type === 'megaMissile') return `ATÉ ${MEGA_BOMB.damage} HP`;
  const balance = WEAPON_BALANCE[type];
  if (balance?.damage > 0) return type === 'heavy' ? `${balance.damage}–${Math.round(balance.damage * balance.maxMultiplier * balance.criticalMultiplier)} HP (CRÍT.)` : type === 'cluster' || type === 'mineLayer' ? `${balance.damage} HP POR PROJÉTIL` : `${balance.damage} HP`;
  return null;
}

export function cardRange(type) {
  if (type === 'fieldRepair') return '360 BLOCOS';
  if (type === 'fireFoam') return '280 BLOCOS / 2 RODADAS';
  if (type === 'waterCannon') return '900 BLOCOS';
  if (type === 'waterHunter') return '650 BLOCOS NA ÁGUA';
  if (type === 'waterMine') return '105 BLOCOS';
  if (type === 'waterTorpedo') return '950 BLOCOS';
  if (type === 'buoy') return 'ENQUANTO VIVO';
  if (type === 'elementalWind') return '200 × 600 / 2 RODADAS';
  if (type === 'elementalWater') return '165 BLOCOS / LAGO';
  if (type === 'elementalEarth') return '135 BLOCOS / SOLO';
  const ranges = { soapBomb: '460 BLOCOS', gravity: '410 BLOCOS', sentry: '300 BLOCOS', harpoon: '1750 BLOCOS', lightningRod: '360 BLOCOS', teslaOrb: '440 BLOCOS', superheat: '480 BLOCOS', splitDamage: '2 RODADAS', vitalRecycling: 'SEM LIMITE FIXO', ninjaFatal: '2 × 340 BLOCOS', bunkerBuster: '128 BLOCOS', shockwave: '82 BLOCOS', bigExplosion: '+55% DE RAIO', ammoCrate: 'TODO O ARSENAL', flood: '3–5 LAGOS' };
  if (ranges[type]) return ranges[type];
  const radius = WEAPON_BALANCE[type]?.radius;
  return radius > 0 ? `${radius} BLOCOS` : null;
}

// Compact facts for class cards. Full rules remain in CLASS_DEFS for tooltips and search.
export function classCardStats(type) {
  if (type === 'incendiary') return ['3 LABAREDAS / DISPARO', 'FOGO +10 HP / +1R'];
  if (type === 'amphibian') return ['+10 HP / ROD. NA ÁGUA', 'JATO 40 HP / 900 PX'];
  if (type === 'elementalist') return ['1 ELEMENTO / TURNO', 'VÓRTICE: 2 RODADAS'];
  if (type === 'specialist') return ['DRONE / 2 ROD. • MÁX. 3', '25 HP / ALVO NO RAIO'];
  return {
    armored: ['+50 HP / -10 DANO', 'PULSO -40% DANO / RODADA'],
    attacker: ['+20 DANO + 10% HP', 'INTERVENÇÃO / 1000 PTS'],
    bomber: ['+15 DANO / +18 RAIO', 'MORTE: 80 HP / 160 BLOCOS'],
    healer: ['PULSO +25 HP / RODADA', '+18 HP EM ALIADOS'],
    meteorologist: ['-35% DANO DE EVENTOS', 'HASTE / RODADA 2'],
    ninja: ['+35 PX/S / +95 COMB.', 'CORTE / 200 BLOCOS'],
    saboteur: ['TESLA / RODADA', 'PULSO / 3 RODADAS'],
    backpacker: ['+100 COMBUSTÍVEL', 'TROCA / 3 RODADAS'],
  }[type] || ['—', '—'];
}

export function conciseCardDescription(type, info, section) {
  if (type === 'fieldRepair') return 'Cura 25 HP e repara até 2 pontos em até duas Sentinelas ou Hastes aliadas próximas.';
  if (type === 'incendiary') return 'Cada tiro lança 3 labaredas. Molotov a cada 3 rodadas; fogo +10 HP, +1 rodada e não o fere.';
  if (type === 'amphibian') return 'Flutua, nada e recupera 10 HP por rodada na água. Jato reto: 40 HP e empurrão.';
  if (type === 'waterCannon') return 'Jato reto exclusivo do Anfíbio: acerta vários tanques, causa 40 HP e os empurra.';
  if (type === 'buoy') return 'Ative no inventário: flutua e move-se sem combustível dentro da água.';
  if (type === 'waterHunter') return 'Na terra explode. Na água persegue um tanque submerso, morde e detona.';
  if (type === 'waterMine') return 'Mina grande que boia e explode ao contato com um tanque.';
  if (type === 'waterTorpedo') return 'Submerso: três torpedos rápidos perseguem o mesmo inimigo.';
  if (type === 'elementalist') return 'Uma bomba aleatória por turno: fogo, água, vento ou terra.';
  if (type === 'specialist') return 'Drone a cada 2 rodadas, até 3 ativos: 25 HP por alvo. Reposiciona invocações.';
  if (type === 'elementalFire') return 'Explode e incendeia a área por três rodadas.';
  if (type === 'elementalWater') return 'Explode por 30 HP e abre um lago no impacto.';
  if (type === 'elementalWind') return 'Por 2 rodadas, ergue tanques, objetos e tiros. Ao cruzar fogo, queima por 30 HP.';
  if (type === 'elementalEarth') return 'Remodela o solo em montanha ou cratera.';
  if (type === 'fireFoam') return 'Apaga incêndios próximos e protege contra fogo nesta e na próxima rodada.';
  const descriptions = {
    armored: 'Corpo maior; pulso protege aliados em 40% por rodada. Imune a queda.',
    attacker: 'Perfura escudos e causa dano extra. Eliminações aceleram a Intervenção.',
    bomber: 'Explosões maiores. Ao morrer, detona 160 blocos e causa 80 HP.',
    healer: 'Pulso cura 25 HP por rodada em aliados próximos. Tiros aliados também curam.',
    meteorologist: 'Recebe a Haste na rodada 2. Atrai eventos bons e resiste aos perigosos.',
    ninja: 'Veloz e imune a queda. O Corte Fatal atravessa inimigos em dois dashes e ignora escudos.',
    saboteur: 'Recebe Tesla a cada rodada e resiste a travas. Seu pulso causa dano e pane.',
    backpacker: 'Atrai powerups; cada ativo vai para apenas um aliado. Troca o arsenal.',
    ninjaFatal: 'Dois dashes direcionais de 340 blocos, inclusive no ar: 80 HP por corte, sem escudos.',
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
    armoredDash: 'Mire no mapa para escolher a direção. A prévia mostra o destino e as paredes rompidas.',
    flyingHunter: 'Sobe alto, escolhe o inimigo mais próximo e mergulha nele.',
    lightningRod: 'Antena destrutível: atrai eventos e atinge inimigos próximos a cada turno.',
    spider: 'Salta até uma parede próxima, escala e adere ao teto. Ganha velocidade e combustível.',
    vitalRecycling: 'Converte 25% da destruição do disparo em cura, sem limite fixo.',
    superheat: 'Passiva desde o início: emite calor a cada 2 turnos inimigos, ferindo inimigos e estruturas.',
    splitDamage: 'Por 2 rodadas, devolve metade do dano recebido ao atirador.',
    jump: 'Salta na direção da mira. Combina com Dash; no ar, pode abrir paraquedas.',
    armorPiercer: 'Atravessa escudos; sem escudo, fratura as esteiras por 1 turno.',
    shockwave: 'O impacto arremessa tanques com força.',
    flood: 'Após a chuva, abre lagos que apagam fogo, reduzem tração e amortecem quedas. 50% se Raios estiver habilitado.',
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
