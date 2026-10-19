export const WORLD = { width: 5600, height: 1080, tankRadius: 9 };
export const SURVIVAL_RULES = Object.freeze({ finalLavaLevel: 405, riseExponent: 1.5 });
export function survivalLavaLevel(round, roundLimit) {
  const progress = clamp((round - 1) / Math.max(1, roundLimit - 1), 0, 1);
  return Math.round((WORLD.height - 24) - ((WORLD.height - 24) - SURVIVAL_RULES.finalLavaLevel) * progress ** SURVIVAL_RULES.riseExponent);
}
export const SHOT_PATH_RATE = 40;

export const DEFAULT_RULES = {
  maxPlayers: 10,
  health: 150,
  turnSeconds: 30,
  gravity: 120,
  powerupCount: 20,
  mines: true,
  mapType: 'random',
  friendlyFire: false,
  allowJoinDuringPreparation: true,
  botDifficulty: 'normal',
  gameSpeed: 1,
  gameMode: 'ffa',
  teamCount: 2,
  roundLimit: 20,
  classesEnabled: true,
  enabledEvents: ['supply', 'quake', 'bombardment', 'lightning', 'collapse', 'tectonic', 'luckyWinds', 'eruption', 'gale'],
  enabledPowerups: null,
};

export const GAME_TIMING = Object.freeze({ classMs: 10000, arsenalMs: 10000, matchStartMs: 10000, rouletteSpinMs: 3200, rewardMs: 18000, arenaWarningMs: 3600, supplyFlyoverMs: 5200 });

export const DESTRUCTION_POINTS = Object.freeze({
  terrainChunk: 1,
  barrel: 35,
  platform: 90,
  concrete: 100,
  craneCable: 75,
  fuelTank: 85,
  supplyCache: 100,
  radar: 110,
  shockCoil: 125,
  healingStation: 115,
  lightningRod: 85,
  sentry: 95,
  watchtower: 135,
  building: 160,
  crane: 190,
  tank: 200,
});
export const MEGA_CANNON_CHARGE = 1000;
export const megaCannonCost = (uses = 0) => MEGA_CANNON_CHARGE + Math.max(0, uses) * 500;
export const NATIVE_MINE_DAMAGE = 70;
export const ATTACKER_ELIMINATION_BONUS = 50;
export const CLUSTER_CAPSULE_SPEED = 0.55;

export const STRUCTURE_MATERIALS = Object.freeze({
  building: { material: 'concreto', mass: 1.15, impactRadius: 30, craterRadius: 0 },
  watchtower: { material: 'aço', mass: .9, impactRadius: 28, craterRadius: 0 },
  radar: { material: 'eletrônico', mass: .7, impactRadius: 24, craterRadius: 0 },
  fuelTank: { material: 'metal', mass: .8, impactRadius: 26, craterRadius: 0 },
  supplyCache: { material: 'metal', mass: .65, impactRadius: 24, craterRadius: 0 },
  shockCoil: { material: 'aço', mass: .85, impactRadius: 26, craterRadius: 0 },
  healingStation: { material: 'metal', mass: .8, impactRadius: 26, craterRadius: 0 },
  lightningRod: { material: 'metal', mass: .65, impactRadius: 20, craterRadius: 0 },
  sentry: { material: 'metal', mass: .8, impactRadius: 22, craterRadius: 0 },
  concrete: { material: 'concreto', mass: 1.4, impactRadius: 36, craterRadius: 16 },
  crane: { material: 'aço', mass: 1.55, impactRadius: 42, craterRadius: 17 },
  barrel: { material: 'metal', mass: .45, impactRadius: 20, craterRadius: 0 },
  launcher: { material: 'metal', mass: .55, impactRadius: 20, craterRadius: 0 },
  switch: { material: 'metal', mass: .35, impactRadius: 16, craterRadius: 0 },
  ramp: { material: 'metal', mass: .8, impactRadius: 25, craterRadius: 0 },
});

export const CLASS_BALANCE = Object.freeze({
  attackerMaxHealthDamage: .10,
  bomberRadius: 18, bomberDamage: 15, bomberResistance: 15, bomberBombardmentResistance: 25, bomberDeathRadius: 160, bomberDeathDamage: 80, bomberDeathDurationMs: 2200,
  armoredPulseRadius: 400, armoredPulseReduction: .4,
  healerTurnHeal: 0, healerAllyAura: 25, healerAllyRadius: 400, healerShotHeal: 18,
  meteorologistEventResistance: .65, meteorologistPositiveChance: .4, meteorologistAnchorChance: .5,
  saboteurPulseRadius: 760, saboteurPulseDamage: 20, saboteurPulseDurationMs: 2800, backpackerSoloPickupHeal: 30, backpackerAttractRadius: 270,
  ninjaFatalRadius: 200, ninjaFatalDamage: 100, ninjaFatalDurationMs: 1800,
});
export const CLASS_EVOLUTIONS = Object.freeze({
  fortify: { name: 'FORTIFICAR', short: 'CASCO', color: '#80d8f2', health: 30, damage: 0, description: '+30 de vida máxima e +30 HP imediatamente. Pode ser escolhida duas vezes.' },
  overdrive: { name: 'SOBRECARGA', short: 'DANO', color: '#ff8064', health: 0, damage: 6, description: '+6 de dano em cada acerto direto ou explosivo contra inimigos. Pode ser escolhida duas vezes.' },
});
export function classEvolutionRounds(roundLimit) {
  return [1 + Math.floor(roundLimit / 3), 1 + Math.floor(roundLimit * 2 / 3)];
}
export const HILL_RULES = Object.freeze({ radius: 170, pointsToWin: 4 });

export const WEAPON_BALANCE = Object.freeze({
  standard: { damage: 50, radius: 48, baseMin: 20, baseMax: 30, centerDamage: 50, headMin: 60, headMax: 80 },
  heavy: { damage: 58, radius: 72, maxMultiplier: 1.8, criticalThreshold: 1.55, criticalMultiplier: 1.35 },
  cluster: { damage: 22, radius: 34, projectiles: 3 },
  fireworks: { damage: 26, radius: 44, secondaryDamage: 7, secondaryRadius: 30, secondaryBursts: 12, spread: 156 },
  zeus: { damage: 40, radius: 44, secondaryDamage: 40, delayMs: 2000 },
  gravity: { damage: 80, radius: 410, durationMs: 4000 },
  grenade: { damage: 76, radius: 72 },
  mineLayer: { damage: 40, radius: 38, projectiles: 3 },
  moleBomb: { damage: 64, radius: 70 },
  armoredDash: { damage: 80, walls: 3 },
  verticalStrike: { damage: 52, radius: 56 },
  soapBomb: { damage: 30, radius: 460, floatMs: 5000, lift: 360, maxTargets: 3 },
  markerBomb: { damage: 10, radius: 38, markDamage: 30, markRadius: 66, delayMs: 3000 },
  harpoon: { damage: 30, radius: 0, pullMs: 1100, enemyPullMs: 520, range: 1750 },
  sentry: { damage: 5, projectiles: 5, fireEveryTurns: 2, radius: 0, scanRadius: 300, durability: 3, interceptChance: 0.6 },
  droneStrike: { damage: 24, radius: 42, secondaryDamage: 24, secondaryRadius: 48, missiles: 3 },
  teslaOrb: { damage: 30, radius: 52, chainDamage: 22, chainRadius: 440, chains: 9 },
  seismicCharge: { damage: 44, radius: 82, secondaryDamage: 18, secondaryRadius: 58 },
  megaCannon: { damage: 155, radius: 225, delayMs: 3000, beamWidth: 96 },
  laser: { damage: 72, radius: 0 },
  flyingHunter: { damage: 60, radius: 34 },
  lightningRod: { damage: 0, radius: 12, zapDamage: 10, zapRadius: 360, durability: 3 },
});
export const VECTOR_FLIGHT_RATE = 0.78;
// Number of the owner's turns between a charge being spent and refilled.
export const ARSENAL_COOLDOWN_TURNS = Object.freeze({
  heavy: 2, cluster: 3, fireworks: 3, zeus: 3, gravity: 4, grenade: 3,
  mineLayer: 3, moleBomb: 3, armoredDash: 3, verticalStrike: 2,
  sentry: 4, jump: 2, spider: 4, droneStrike: 3, teslaOrb: 4,
  seismicCharge: 4, lightningRod: 3, flyingHunter: 4,
  soapBomb: 3, markerBomb: 4, harpoon: 3,
  vitalRecycling: 3, superheat: 3, splitDamage: 2,
});

export const MEGA_BOMB = Object.freeze({ damage: 145, radius: 250, clusterDamage: 92, clusterRadius: 165 });

export const POWERUP_DEFS = Object.freeze({
  lootbox: { name: 'LOOTBOX', short: 'LOOT', color: '#ffd45f', description: 'Caixa rara do helicóptero: concede três aprimoramentos diferentes imediatamente.', eventOnly: true },
  extraShot: { name: '+1 TIRO', short: '+1', color: '#f4d35e', description: 'Permite disparar novamente neste turno.' },
  doubleShot: { name: 'BALA DUPLA', short: '×2', color: '#ff9f5a', description: 'Duplica os projéteis da arma escolhida; Fragmentária e Minas passam a lançar seis.' },
  tripleShot: { name: 'BALA TRIPLA', short: '×3', color: '#ff6f61', description: 'Triplica os projéteis da arma escolhida; Fragmentária e Minas passam a lançar nove.' },
  bigExplosion: { name: 'EXPANSOR DE IMPACTO', short: 'RAIO+', color: '#e95978', description: 'Amplia apenas o raio da próxima explosão, mantendo o dano original da arma.' },
  megaMissile: { name: 'MEGA BOMBA', short: 'ÁTOMO', color: '#ff493d', description: 'Transforma o próximo disparo numa bomba atômica de 250 blocos e até 145 de dano; combina com armas do arsenal.' },
  freeze: { name: 'CONGELAMENTO', short: 'ICE', color: '#82e7ff', description: 'O próximo ataque bloqueia o movimento dos inimigos atingidos por dois turnos.' },
  guidedBullet: { name: 'MÍSSIL GPS', short: 'GPS', color: '#68d5ff', description: 'Guia o próximo projétil ao inimigo mais próximo, contornando até 3 plataformas ou estruturas. O quarto obstáculo o detém.' },
  heal: { name: 'VIDA +50', short: 'HP', color: '#5de28b', description: 'Recupera 50 pontos de vida imediatamente.' },
  salvageHeal: { name: 'RECICLAGEM VITAL', short: 'RECICLA', color: '#68e8ba', description: 'O próximo disparo recupera 25% dos pontos de destruição que causar ao cenário e aos tanques, sem limite fixo.' },
  extraLife: { name: 'VIDA EXTRA', short: '1UP', color: '#f4e878', description: 'Ao ser eliminado, consome uma carga e reaparece em um ponto seguro com 25% da vida máxima. Ativa automaticamente.' },
  shield: { name: 'ESCUDO', short: 'DEF', color: '#8da8ff', description: 'Cada carga reduz fortemente um dano recebido.' },
  movementBoost: { name: 'IMPULSO', short: 'MOV', color: '#c69cff', description: 'Cada carga amplia o tanque em +65 de combustível e +8 px/s de velocidade. Recarrega o combustível recebido imediatamente.' },
  rocketDash: { name: 'ARRANCADA FOGUETE', short: 'DASH', color: '#ff8b5e', description: 'Amplia o próximo deslocamento e pode ser acionada no ar depois de um Pulo para ganhar outro impulso.' },
  lightningStep: { name: 'PASSO RELÂMPAGO', short: 'BLINK', color: '#d8f75a', description: 'Teleporta para um ponto seguro escolhido a curta distância.' },
  bridgeKit: { name: 'PONTE MODULAR', short: 'PONTE', color: '#7ee6c4', description: 'O próximo impacto monta uma ponte de microblocos sobre o local.' },
  teleport: { name: 'TELEPORTE', short: 'TP', color: '#42f5d7', description: 'O próximo projétil teleporta seu tanque para o ponto seguro mais próximo do impacto.' },
  invisibility: { name: 'INVISIBILIDADE', short: 'INV', color: '#b6a4ff', description: 'Oculta sua posição dos adversários durante seus próximos dois turnos.' },
  excavator: { name: 'ESCAVADEIRA', short: 'DIG', color: '#e6b35a', description: 'Concede três movimentos capazes de abrir passagem através de paredes.' },
  armorPiercer: { name: 'TIRO AP', short: 'AP', color: '#f2f2f2', description: 'O próximo ataque atravessa escudos; inimigos sem escudo sofrem fratura nas esteiras e perdem 1 movimento no próximo turno.' },
  shockwave: { name: 'ONDA DE CHOQUE', short: 'WAVE', color: '#55d9ff', description: 'O próximo impacto causa pouco dano, mas arremessa tanques com muita força.' },
  bunkerBuster: { name: 'DESTRUIDOR', short: 'DRILL', color: '#ffb347', description: 'O próximo projétil abre uma cratera profunda e larga no cenário.' },
  ammoCrate: { name: 'CAIXA DE MUNIÇÃO', short: 'AMMO', color: '#d8ed72', description: 'Adiciona 2 cargas a cada arma do arsenal, até 4, e zera suas recargas.' },
  molotov: { name: 'MOLOTOV', short: 'FOGO', color: '#ff713d', description: 'O próximo impacto incendeia a área por três turnos.' },
  repairDrone: { name: 'DRONE DE REPARO', short: 'DRONE', color: '#62e69a', description: 'Repara 20 HP ao fim de cada um dos seus próximos quatro turnos: até 80 HP por carga.' },
  overcharge: { name: 'SOBRECARGA', short: 'MAX', color: '#e3f65b', description: 'Recarrega imediatamente todos os poderes do seu arsenal.' },
  laser: { name: 'LASER PERFURANTE', short: 'LASER', color: '#ff3d81', description: 'Mira também para baixo, atravessa inimigos e corta cenário e estruturas. Imobiliza o atirador por um turno.' },
  mirror: { name: 'ESPELHO', short: 'REFLEXO', color: '#8ce8ff', description: 'Repete o disparo completo após um breve atraso, preservando arma, direção, força e todos os outros efeitos equipados.' },
  trickster: { name: 'CARTA SACANA', short: 'TROCA', color: '#d889ff', description: 'Troca instantaneamente a posição do seu tanque com outro tanque escolhido no cenário.' },
});

export const POWERUPS = Object.keys(POWERUP_DEFS).filter((type) => !POWERUP_DEFS[type].eventOnly);
export const CLASS_POWERUP_WEIGHT = 3;
export const CLASS_POWERUP_SYNERGY = Object.freeze({
  armored: Object.freeze(['shield', 'repairDrone', 'extraLife', 'salvageHeal']),
  attacker: Object.freeze(['extraShot', 'tripleShot', 'armorPiercer', 'salvageHeal']),
  bomber: Object.freeze(['bigExplosion', 'megaMissile', 'bunkerBuster', 'salvageHeal']),
  healer: Object.freeze(['heal', 'repairDrone', 'salvageHeal', 'extraLife']),
  meteorologist: Object.freeze(['guidedBullet', 'shield', 'freeze', 'extraLife']),
  ninja: Object.freeze(['lightningStep', 'rocketDash', 'invisibility', 'extraLife']),
  saboteur: Object.freeze(['freeze', 'shockwave', 'laser', 'invisibility']),
  backpacker: Object.freeze(['heal', 'repairDrone', 'ammoCrate', 'overcharge']),
});

export const ARSENAL_DEFS = Object.freeze({
  heavy: { name: 'OBUS PESADO', short: 'OBUS', kind: 'shot', color: '#ff9f5a', description: 'Altura e distância aumentam dano e raio; tiros muito carregados causam dano crítico.' },
  cluster: { name: 'FRAGMENTÁRIA', short: 'FRAG', kind: 'shot', color: '#b267ff', description: 'Lança uma cápsula violeta. Durante o voo, toque ou pressione espaço novamente para dividi-la em três mísseis que caem.' },
  fireworks: { name: 'FOGOS DE ARTIFÍCIO', short: 'FOGOS', kind: 'shot', color: '#ff69c8', description: 'Toque ou pressione espaço durante o voo para detonar. Doze microfoguetes saem em todas as direções, inclusive para o alto, e explodem ao colidir.' },
  zeus: { name: 'IRA DE ZEUS', short: 'ZEUS', kind: 'shot', color: '#9ee8ff', description: 'Impacto de 40 HP marca o ponto; após 2 s, cai outro raio de 40 HP, bloqueável por cobertura superior.' },
  gravity: { name: 'BOMBA DE PROPULSÃO', short: 'VÓRTEX', kind: 'shot', color: '#c69cff', description: 'Buraco negro por 4 s: puxa tanques e estruturas, causa até 80 HP e destrói o solo no centro.' },
  grenade: { name: 'GRANADA RICOCHETE', short: 'GRAN', kind: 'shot', color: '#a8d66d', description: 'Quica três vezes, pisca durante o pavio de três segundos e explode por até 76 HP.' },
  mineLayer: { name: 'LANÇA-MINAS', short: 'MINAS', kind: 'shot', color: '#ffb35c', description: 'Arremessa três minas que explodem quando inimigos se aproximam.' },
  moleBomb: { name: 'TATU-BOMBA', short: 'TATU', kind: 'shot', color: '#d6a46f', description: 'Persegue um inimigo sob a terra por 1,5 segundo e explode ao alcançá-lo, ao terminar o tempo ou ao cair num buraco.' },
  armoredDash: { name: 'INVESTIDA BLINDADA', short: 'DASH', kind: 'movement', color: '#ff8066', description: 'Atropela por 80 de dano, rompe até 3 paredes e ignora minas e danos de estruturas durante o avanço. Combina com Pulo ou Arrancada.' },
  verticalStrike: { name: 'TIRO VETORIAL', short: 'VETOR', kind: 'shot', color: '#63f3ff', description: 'Dispare normalmente; durante o voo, toque no mapa para redirecionar o projétil em linha reta. A prévia mostra o novo percurso.' },
  soapBomb: { name: 'BOMBA DE SABÃO', short: 'BOLHAS', kind: 'shot', color: '#8de8eb', description: 'Ao cair, abre uma área de 460 blocos e prende até 3 tanques em bolhas grandes. Elas os levam para o alto por 5 s, desviando em direções aleatórias; depois estouram por 30 HP e soltam os tanques para cair.' },
  markerBomb: { name: 'BOMBA MARCADORA', short: 'MARCA', kind: 'shot', color: '#ffad59', description: 'Quica 3 vezes no chão ou em paredes, ganhando impulso e marcando cada contato. No terceiro quique causa 10 HP; após 3 s, cada marca detona por 30 HP.' },
  harpoon: { name: 'ARPÃO', short: 'ARPÃO', kind: 'shot', color: '#64dfd2', description: 'Primeira ativação: lança em linha reta, com prévia do alcance de 1750 blocos, até prender em solo, plataforma, estrutura ou inimigo. Segunda: tensiona o cabo e puxa com impulso, gastando 1 movimento e permitindo atirar da nova posição; se prender um inimigo, puxa-o até você e causa 30 HP na colisão. Passe o turno para desistir e recuperar a munição.' },
  sentry: { name: 'SENTINELA', short: 'SENT', kind: 'shot', color: '#6deacc', description: 'Arremesse uma torre destrutível. A cada 2 turnos, dispara 5 projéteis de 5 HP (até 25 HP) contra inimigos no raio de 300 blocos. Cada bala pode perfurar o solo ou danificar estruturas no caminho. Intercepta projéteis inimigos com 60% de chance. Tesla e pulso sabotador a desativam temporariamente.' },
  jump: { name: 'PULO BALÍSTICO', short: 'PULO', kind: 'movement', color: '#42f5d7', description: 'Salta na direção da mira. Durante o voo, combine com Dash/Investida ou pressione Enter para abrir o paraquedas.' },
  spider: { name: 'ARANHA', short: 'ARANHA', kind: 'movement', color: '#d28cff', description: 'Detecta e salta até paredes próximas, escala e adere ao teto de plataformas. Ganha 90 de combustível e 20 px/s de velocidade; a habilidade permanece ativa.' },
  droneStrike: { name: 'ENXAME DRONE', short: 'DRONE', kind: 'shot', color: '#ffcf58', description: 'Marca o impacto e chama três micromísseis: 24 de dano cada, espalhados sobre a área.' },
  teslaOrb: { name: 'ORBE TESLA', short: 'TESLA', kind: 'shot', color: '#64e8ff', description: 'Causa 30 no impacto; arcos de 22 atingem inimigos em 440 blocos. Por um turno, só podem se mover: sem tiros, arsenal, powerups ou passivas.' },
  seismicCharge: { name: 'CARGA SÍSMICA', short: 'SISMO', kind: 'shot', color: '#ff7557', description: 'Marca o solo em vermelho por 2 s; depois detona 44 de dano central e duas ondas laterais de 18.' },
  megaCannon: { name: 'INTERVENÇÃO DOS CÉUS', short: 'CÉUS', kind: 'shot', color: '#63d8ff', description: 'Exclusivo do Atacante. Custa 1000 pontos, mais 500 por uso anterior. Após 3 s, um feixe azul destrói a área marcada.' },
  lightningRod: { name: 'PARA-RAIOS', short: 'HASTE', kind: 'shot', color: '#8ef3ff', description: 'Antena arremessável: atrai eventos destrutivos e aplica 10 HP por turno nos inimigos em um raio visível de 360 blocos. Estrutura destrutível (3 impactos). Exclusiva do Meteorologista.' },
  flyingHunter: { name: 'CAÇA VOADORA', short: 'CAÇA', kind: 'shot', color: '#ff665f', description: 'Mini caça disparado na direção da mira: sobe alto, encontra o inimigo mais próximo e mergulha sobre ele. Até 60 HP em explosão pequena; combina com modificadores de tiro.' },
  vitalRecycling: { name: 'RECICLAGEM VITAL', short: 'RECICLA', kind: 'shot', color: '#68e8ba', description: 'Disparo que converte 25% da destruição causada em cura, sem limite fixo. Combina com modificadores.' },
  superheat: { name: 'SUPERAQUECER', short: 'CALOR', kind: 'shot', color: '#ff713d', description: 'O impacto incendeia uma área média. Tanques sofrem 25 HP por rodada durante 3 rodadas; também queima estruturas e plataformas.' },
  splitDamage: { name: 'DANO DIVIDIDO', short: 'DIVIDIR', kind: 'defense', color: '#69e6ff', description: 'Ativa por 2 rodadas uma blindagem que devolve metade do dano recebido ao atirador. Recarrega em 2 turnos próprios.' },
  ninjaFatal: { name: 'CORTE FATAL', short: 'CORTE', kind: 'ability', color: '#b58cff', description: 'Exclusivo do Ninja: dash reto de até 200 blocos, inclusive no ar. Atravessa e acerta todos os inimigos no trajeto por 100 HP cada, ignorando escudos e armaduras. Eliminar recarrega Blink.' },
});
export const ARSENAL_ITEMS = Object.keys(ARSENAL_DEFS);
export const SELECTABLE_ARSENAL_ITEMS = Object.freeze(ARSENAL_ITEMS.filter((type) => !['megaCannon', 'lightningRod', 'ninjaFatal'].includes(type)));
export const COLLECTIBLE_ITEMS = Object.freeze([...POWERUPS, ...ARSENAL_ITEMS.filter((type) => !['lightningRod', 'megaCannon', 'ninjaFatal'].includes(type))]);
export const DEFAULT_ARSENAL = Object.freeze(['heavy', 'cluster', 'jump']);

export const CLASS_DEFS = Object.freeze({
  armored: { name: 'BLINDADO', short: 'BLD', color: '#8ea2b5', description: '+50 de vida e corpo maior; -10 de dano causado. Regenera 40 HP após duas rodadas ileso. A cada rodada, pulsa proteção em aliados próximos: -40% do dano recebido nessa rodada. Imune a dano de queda.' },
  attacker: { name: 'ATACANTE', short: 'ATK', color: '#ff655b', description: '+20 de dano e +10% da vida máxima do alvo em cada instância. Tiros ignoram escudos. Eliminações rendem 250 pontos (200 + 50 bônus); com 1000 pontos de destruição, desbloqueia a Intervenção dos céus automaticamente. Cada uso aumenta o custo em 500. Sofre 10% mais dano de queda.' },
  bomber: { name: 'BOMBARDEIRO', short: 'BOMB', color: '#ff9c4a', description: 'Explosões ganham +15 de dano e +18 de alcance. Ao morrer, detona uma área de 160 blocos e causa 80 HP aos inimigos nela. Reduz em 15 o dano explosivo recebido e em 25 o bombardeio. Sofre 15% menos dano de queda.' },
  healer: { name: 'CURANDEIRO', short: 'MED', color: '#65e69a', description: 'A cada rodada, emite um pulso que cura 25 HP em si e aliados próximos. Seus disparos curam aliados em 18 HP e compartilha efeitos de cura.' },
  meteorologist: { name: 'METEOROLOGISTA', short: 'MET', color: '#59d9ee', description: 'Desbloqueia a Haste Para-raios exclusiva na segunda rodada e recarrega uma carga a cada três rodadas. Favorece eventos positivos perto da equipe e reduz dano de eventos em 35%.' },
  ninja: { name: 'NINJA', short: 'NIN', color: '#b58cff', description: 'Move-se rápido, ganha Blink a cada duas rodadas e deixa um fantasma azul quando invisível. Corte Fatal exclusivo atravessa até 200 blocos, acerta vários inimigos em linha por 100 HP sem escudo e recarrega Blink ao eliminar. Imune a queda.' },
  saboteur: { name: 'SABOTADOR', short: 'SAB', color: '#d5ef59', description: 'Imune a imobilização e Tesla. Ganha uma carga de Tesla por rodada e, a cada três, emite pulso de 760 blocos: 20 HP, pane dos powerups e movimento bloqueado.' },
  backpacker: { name: 'MOCHILEIRO', short: 'MOCH', color: '#e0bc72', description: 'Atrai powerups em 270 blocos. Guarda passivos; cada ativo coletado vai a um único aliado para usar uma vez, ou cura 30 HP quando joga sozinho. Recarrega o arsenal e pode trocá-lo a cada três rodadas.' },
});

export const EVENT_DEFS = Object.freeze({
  supply: { name: 'SUPRIMENTOS AÉREOS', color: '#ffd45f', description: 'Helicóptero entrega powerups e pode soltar uma Lootbox.' },
  quake: { name: 'ABALO DA ARENA', color: '#c9ad73', description: 'Rompe pontos marcados do terreno.' },
  bombardment: { name: 'BOMBARDEIO', color: '#ff6547', description: 'Projéteis verticais atingem áreas marcadas com explosões progressivas e mais destrutivas (24 a 59 HP antes da escalada de rodadas).' },
  lightning: { name: 'TEMPESTADE ELÉTRICA', color: '#75eaff', description: 'Raios causam dano e bloqueiam powerups.' },
  collapse: { name: 'COLAPSO', color: '#a4a997', description: 'Destrói partes instáveis do cenário e estruturas.' },
  tectonic: { name: 'TECTÔNICO', color: '#c9ef62', description: 'Remodela o solo e desloca tanques.' },
  luckyWinds: { name: 'VENTOS DE SORTE', color: '#ffe06a', description: 'Grandes zonas douradas recuperam vida.' },
  eruption: { name: 'ERUPÇÃO', color: '#ff5f36', description: 'Eleva lava e lança bolas de fogo incendiárias.' },
  gale: { name: 'VENDAVAL', color: '#a9e7e8', description: 'Uma ventania de três segundos empurra tanques em uma direção.' },
});

export const PLAYER_COLORS = [
  '#57e389', '#ff7b72', '#6cb6ff', '#f7c843', '#c297ff',
  '#ff9bce', '#5de4c7', '#ff9d4d', '#a8d66d', '#8da1ff',
];

export const TEAM_COLORS = ['#51d3f5', '#ff7849', '#c297ff', '#f7c843'];

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
