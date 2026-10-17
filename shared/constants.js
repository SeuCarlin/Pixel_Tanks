export const WORLD = { width: 5600, height: 1080, tankRadius: 9 };
export const SHOT_PATH_RATE = 40;

export const DEFAULT_RULES = {
  maxPlayers: 10,
  health: 150,
  turnSeconds: 30,
  gravity: 120,
  powerupCount: 20,
  mines: true,
  mapType: 'random',
  friendlyFire: true,
  allowJoinDuringPreparation: true,
  botDifficulty: 'normal',
  gameSpeed: 1,
  gameMode: 'ffa',
  roundLimit: 20,
};

export const GAME_TIMING = Object.freeze({ arsenalMs: 10000, matchStartMs: 10000, rouletteSpinMs: 3200, rewardMs: 18000, arenaWarningMs: 3600, supplyFlyoverMs: 5200 });

export const DESTRUCTION_POINTS = Object.freeze({
  terrainChunk: 1,
  barrel: 35,
  platform: 90,
  concrete: 100,
  craneCable: 75,
  fuelTank: 85,
  radar: 110,
  watchtower: 135,
  building: 160,
  crane: 190,
  tank: 300,
});

export const WEAPON_BALANCE = Object.freeze({
  standard: { damage: 42, radius: 48 },
  heavy: { damage: 58, radius: 72, maxMultiplier: 1.8 },
  cluster: { damage: 22, radius: 34, projectiles: 3 },
  fireworks: { damage: 26, radius: 44, secondaryDamage: 7, secondaryRadius: 30, secondaryBursts: 12, spread: 156 },
  zeus: { damage: 32, radius: 52, secondaryDamage: 18 },
  gravity: { damage: 12, radius: 230, durationMs: 2000 },
  grenade: { damage: 54, radius: 62 },
  mineLayer: { damage: 40, radius: 38, projectiles: 3 },
  moleBomb: { damage: 64, radius: 70 },
  armoredDash: { damage: 80, walls: 3 },
  verticalStrike: { damage: 52, radius: 56 },
  droneStrike: { damage: 24, radius: 42, secondaryDamage: 24, secondaryRadius: 48, missiles: 3 },
  teslaOrb: { damage: 30, radius: 52, chainDamage: 22, chainRadius: 250, chains: 3 },
  seismicCharge: { damage: 44, radius: 82, secondaryDamage: 18, secondaryRadius: 58 },
  laser: { damage: 72, radius: 0 },
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
  guidedBullet: { name: 'BALA GUIADA', short: 'GPS', color: '#68d5ff', description: 'Corrige suavemente a trajetória da arma escolhida, inclusive Granada e Ataque Vertical.' },
  heal: { name: 'VIDA +50', short: 'HP', color: '#5de28b', description: 'Recupera 50 pontos de vida imediatamente.' },
  shield: { name: 'ESCUDO', short: 'DEF', color: '#8da8ff', description: 'Cada carga reduz fortemente um dano recebido.' },
  movementBoost: { name: 'IMPULSO', short: 'MOV', color: '#c69cff', description: 'Aumenta permanentemente cada movimento.' },
  rocketDash: { name: 'ARRANCADA FOGUETE', short: 'DASH', color: '#ff8b5e', description: 'Amplia o próximo deslocamento e pode ser acionada no ar depois de um Pulo para ganhar outro impulso.' },
  lightningStep: { name: 'PASSO RELÂMPAGO', short: 'BLINK', color: '#d8f75a', description: 'Teleporta para um ponto seguro escolhido a curta distância.' },
  bridgeKit: { name: 'PONTE MODULAR', short: 'PONTE', color: '#7ee6c4', description: 'O próximo impacto monta uma ponte de microblocos sobre o local.' },
  teleport: { name: 'TELEPORTE', short: 'TP', color: '#42f5d7', description: 'O próximo projétil teleporta seu tanque para o ponto seguro mais próximo do impacto.' },
  invisibility: { name: 'INVISIBILIDADE', short: 'INV', color: '#b6a4ff', description: 'Oculta sua posição dos adversários durante seus próximos dois turnos.' },
  excavator: { name: 'ESCAVADEIRA', short: 'DIG', color: '#e6b35a', description: 'Concede três movimentos capazes de abrir passagem através de paredes.' },
  armorPiercer: { name: 'PERFURANTE', short: 'AP', color: '#f2f2f2', description: 'O próximo ataque ignora completamente os escudos inimigos.' },
  shockwave: { name: 'ONDA DE CHOQUE', short: 'WAVE', color: '#55d9ff', description: 'O próximo impacto causa pouco dano, mas arremessa tanques com muita força.' },
  bunkerBuster: { name: 'DESTRUIDOR', short: 'DRILL', color: '#ffb347', description: 'O próximo projétil abre uma cratera profunda e larga no cenário.' },
  ammoCrate: { name: 'CAIXA DE MUNIÇÃO', short: 'AMMO', color: '#d8ed72', description: 'Adiciona imediatamente um obus pesado e uma munição cluster.' },
  molotov: { name: 'MOLOTOV', short: 'FOGO', color: '#ff713d', description: 'O próximo impacto incendeia a área por três turnos.' },
  repairDrone: { name: 'DRONE DE REPARO', short: 'DRONE', color: '#62e69a', description: 'Repara 12 de vida ao fim dos seus próximos três turnos.' },
  overcharge: { name: 'SOBRECARGA', short: 'MAX', color: '#e3f65b', description: 'Recarrega imediatamente todos os poderes do seu arsenal.' },
  laser: { name: 'LASER PERFURANTE', short: 'LASER', color: '#ff3d81', description: 'Mira também para baixo, atravessa inimigos e corta cenário e estruturas. Imobiliza o atirador por um turno.' },
});

export const POWERUPS = Object.keys(POWERUP_DEFS).filter((type) => !POWERUP_DEFS[type].eventOnly);

export const ARSENAL_DEFS = Object.freeze({
  heavy: { name: 'OBUS PESADO', short: 'OBUS', kind: 'shot', color: '#ff9f5a', description: 'Causa de 58 a 104 de dano: altura e distância aumentam o multiplicador e o raio da explosão.' },
  cluster: { name: 'FRAGMENTÁRIA', short: 'FRAG', kind: 'shot', color: '#f4d35e', description: 'Dispara três projéteis espalhados.' },
  fireworks: { name: 'FOGOS DE ARTIFÍCIO', short: 'FOGOS', kind: 'shot', color: '#ff69c8', description: 'O impacto abre um leque de doze rastros coloridos que atingem o solo próximo, criando microcrateras em sequência.' },
  zeus: { name: 'IRA DE ZEUS', short: 'ZEUS', kind: 'shot', color: '#9ee8ff', description: 'Um raio atinge o impacto e empurra inimigos próximos.' },
  gravity: { name: 'BOMBA DE PROPULSÃO', short: 'VÓRTEX', kind: 'shot', color: '#c69cff', description: 'Fixa por 2 segundos um buraco negro em 230 blocos e puxa todos os tanques, inclusive o atirador, sem destruir o cenário.' },
  grenade: { name: 'GRANADA RICOCHETE', short: 'GRAN', kind: 'shot', color: '#a8d66d', description: 'Quica três vezes e explode após um pavio de três segundos.' },
  mineLayer: { name: 'LANÇA-MINAS', short: 'MINAS', kind: 'shot', color: '#ffb35c', description: 'Arremessa três minas que explodem quando inimigos se aproximam.' },
  moleBomb: { name: 'TATU-BOMBA', short: 'TATU', kind: 'shot', color: '#d6a46f', description: 'Persegue um inimigo sob a terra por 1,5 segundo e explode ao alcançá-lo, ao terminar o tempo ou ao cair num buraco.' },
  armoredDash: { name: 'INVESTIDA BLINDADA', short: 'DASH', kind: 'movement', color: '#ff8066', description: 'Atropela por 80 de dano, rompe até 3 paredes e ignora minas e danos de estruturas durante o avanço. Combina com Pulo ou Arrancada.' },
  verticalStrike: { name: 'ATIVAÇÃO VERTICAL', short: 'VERT', kind: 'shot', color: '#63f3ff', description: 'Segue a trajetória normal; durante a subida, toque ou pressione para desviá-lo e fazê-lo cair verticalmente.' },
  jump: { name: 'PULO BALÍSTICO', short: 'PULO', kind: 'movement', color: '#42f5d7', description: 'Salta na direção da mira. Durante o voo, combine com Dash/Investida ou pressione Enter para abrir o paraquedas.' },
  spider: { name: 'ARANHA', short: 'ARANHA', kind: 'movement', color: '#d28cff', description: 'Salta até uma parede, libera dois movimentos extras no turno e torna a escalada de paredes permanente.' },
  droneStrike: { name: 'ENXAME DRONE', short: 'DRONE', kind: 'shot', color: '#ffcf58', description: 'Marca o impacto e chama três micromísseis: 24 de dano cada, espalhados sobre a área.' },
  teslaOrb: { name: 'ORBE TESLA', short: 'TESLA', kind: 'shot', color: '#64e8ff', description: 'Causa 30 de dano no impacto e encadeia 22 de dano em até três alvos, bloqueando powerups por um turno.' },
  seismicCharge: { name: 'CARGA SÍSMICA', short: 'SISMO', kind: 'shot', color: '#ff7557', description: 'Detona por baixo do impacto: 44 de dano central e duas ondas laterais de 18 que rasgam o solo.' },
});
export const ARSENAL_ITEMS = Object.keys(ARSENAL_DEFS);
export const COLLECTIBLE_ITEMS = Object.freeze([...POWERUPS, ...ARSENAL_ITEMS]);
export const DEFAULT_ARSENAL = Object.freeze(['heavy', 'cluster', 'jump']);

export const PLAYER_COLORS = [
  '#57e389', '#ff7b72', '#6cb6ff', '#f7c843', '#c297ff',
  '#ff9bce', '#5de4c7', '#ff9d4d', '#a8d66d', '#8da1ff',
];

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
