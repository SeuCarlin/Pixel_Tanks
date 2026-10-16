export const WORLD = { width: 5600, height: 940, tankRadius: 9 };
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
};

export const GAME_TIMING = Object.freeze({ arsenalMs: 25000, rouletteSpinMs: 3200, rouletteRevealMs: 2000, rewardMs: 18000, arenaWarningMs: 3000 });

export const POWERUP_DEFS = Object.freeze({
  extraShot: { name: '+1 TIRO', short: '+1', color: '#f4d35e', description: 'Permite disparar novamente neste turno.' },
  doubleShot: { name: 'BALA DUPLA', short: '×2', color: '#ff9f5a', description: 'O próximo ataque lança dois projéteis.' },
  tripleShot: { name: 'BALA TRIPLA', short: '×3', color: '#ff6f61', description: 'O próximo ataque lança três projéteis.' },
  bigExplosion: { name: 'MEGA EXPLOSÃO', short: 'BOOM', color: '#e95978', description: 'Aumenta o raio da próxima explosão.' },
  megaMissile: { name: 'MEGA MÍSSIL', short: 'MEGA', color: '#ff493d', description: 'Transforma o próximo ataque em um míssil de dano e cratera extremos.' },
  freeze: { name: 'CONGELAMENTO', short: 'ICE', color: '#82e7ff', description: 'O próximo ataque bloqueia o movimento dos inimigos atingidos por dois turnos.' },
  guidedBullet: { name: 'BALA GUIADA', short: 'GPS', color: '#68d5ff', description: 'Corrige suavemente a próxima trajetória.' },
  heal: { name: 'VIDA +50', short: 'HP', color: '#5de28b', description: 'Recupera 50 pontos de vida imediatamente.' },
  shield: { name: 'ESCUDO', short: 'DEF', color: '#8da8ff', description: 'Cada carga reduz fortemente um dano recebido.' },
  movementBoost: { name: 'IMPULSO', short: 'MOV', color: '#c69cff', description: 'Aumenta permanentemente cada movimento.' },
  rocketDash: { name: 'ARRANCADA FOGUETE', short: 'DASH', color: '#ff8b5e', description: 'Amplia muito o próximo deslocamento horizontal sem atravessar paredes.' },
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
  laser: { name: 'LASER PERFURANTE', short: 'LASER', color: '#ff3d81', description: 'Dispara em linha reta, atravessa inimigos e destrói o cenário. Imobiliza o atirador por um turno.' },
});

export const POWERUPS = Object.keys(POWERUP_DEFS);

export const ARSENAL_DEFS = Object.freeze({
  heavy: { name: 'OBUS PESADO', short: 'OBUS', kind: 'shot', color: '#ff9f5a', description: 'Explosão maior e mais dano.' },
  cluster: { name: 'FRAGMENTÁRIA', short: 'FRAG', kind: 'shot', color: '#f4d35e', description: 'Dispara três projéteis espalhados.' },
  fireworks: { name: 'FOGOS DE ARTIFÍCIO', short: 'FOGOS', kind: 'shot', color: '#ff69c8', description: 'Cria mais três explosões ao redor do impacto.' },
  zeus: { name: 'IRA DE ZEUS', short: 'ZEUS', kind: 'shot', color: '#9ee8ff', description: 'Um raio atinge o impacto e empurra inimigos próximos.' },
  gravity: { name: 'BALA DE PROPULSÃO', short: 'PULSO', kind: 'shot', color: '#c69cff', description: 'Puxa inimigos próximos para o impacto.' },
  grenade: { name: 'GRANADA RICOCHETE', short: 'GRAN', kind: 'shot', color: '#a8d66d', description: 'Quica três vezes e explode após um pavio de três segundos.' },
  mineLayer: { name: 'LANÇA-MINAS', short: 'MINAS', kind: 'shot', color: '#ffb35c', description: 'Arremessa três minas que explodem quando inimigos se aproximam.' },
  moleBomb: { name: 'TATU-BOMBA', short: 'TATU', kind: 'shot', color: '#d6a46f', description: 'Escava pelo solo durante três segundos em direção a um inimigo.' },
  armoredDash: { name: 'INVESTIDA BLINDADA', short: 'DASH', kind: 'movement', color: '#ff8066', description: 'Avança com força, rompe uma parede e causa dano, empurrando inimigos no caminho.' },
  verticalStrike: { name: 'ATIVAÇÃO VERTICAL', short: 'VERT', kind: 'shot', color: '#63f3ff', description: 'Durante o voo, toque ou pressione para fazer o projétil cair verticalmente.' },
  jump: { name: 'PULO BALÍSTICO', short: 'PULO', kind: 'movement', color: '#42f5d7', description: 'Salta na direção da mira. Pressione Enter novamente para abrir o paraquedas.' },
  spider: { name: 'ARANHA', short: 'ARANHA', kind: 'movement', color: '#d28cff', description: 'Permite escalar paredes durante três movimentos.' },
});
export const ARSENAL_ITEMS = Object.keys(ARSENAL_DEFS);
export const COLLECTIBLE_ITEMS = Object.freeze([...POWERUPS, ...ARSENAL_ITEMS]);
export const DEFAULT_ARSENAL = Object.freeze(['heavy', 'cluster', 'jump']);

export const PLAYER_COLORS = [
  '#57e389', '#ff7b72', '#6cb6ff', '#f7c843', '#c297ff',
  '#ff9bce', '#5de4c7', '#ff9d4d', '#a8d66d', '#8da1ff',
];

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
