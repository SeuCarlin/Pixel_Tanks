// Lightweight, code-drawn battle demonstrations. Only the opened preview animates.
const GROUPS = {
  loot: 'lootbox ammoCrate overcharge mixer supply backpacker',
  multi: 'extraShot doubleShot tripleShot cluster fireworks droneStrike mineLayer waterTorpedo meteorSalvo',
  blast: 'bigExplosion megaMissile heavy grenade markerBomb kineticCannon bombardment plasmaCore',
  control: 'freeze guidedBullet armorPiercer shockwave bunkerBuster verticalStrike cryoMortar',
  heal: 'heal salvageHeal repairDrone fieldRepair vitalRecycling healingDrone healer luckyWinds rescueFlare ironheart',
  shield: 'extraLife shield invisibility splitDamage fireFoam armored',
  move: 'movementBoost extraFuel rocketDash lightningStep blink bridgeKit teleport excavator mirror trickster armoredDash jump spider harpoon ninjaFatal ninja',
  fire: 'molotov superheat incendiary eruption corrosionShell',
  scout: 'scoutPulse',
  overclock: 'overclockShell',
  beam: 'laser zeus teslaOrb megaCannon lightningRod lightning saboteur meteorologist',
  vortex: 'gravity windPlate gale',
  water: 'waterCannon waterHunter waterMine flood amphibian',
  bubble: 'soapBomb',
  earth: 'moleBomb seismicCharge quake collapse tectonic',
  deploy: 'sentry flyingHunter specialist',
  frost: 'blizzard',
  flora: 'flora',
  attacker: 'attacker',
  bomber: 'bomber',
  elementalist: 'elementalist',
};

export const PREVIEW_SCENES = Object.freeze(Object.fromEntries(
  Object.entries(GROUPS).flatMap(([scene, types]) => types.split(' ').map((type) => [type, scene])),
));

const PHASES = {
  loot: ['SUPRIMENTO CHEGA', 'CARGAS COLETADAS', 'ARSENAL RECARREGADO'],
  multi: ['DISPARO INICIAL', 'MULTIPLICA PROJÉTEIS', 'IMPACTOS MÚLTIPLOS'],
  blast: ['TRAJETÓRIA', 'IMPACTO', 'ÁREA DE DESTRUIÇÃO'],
  control: ['MIRA', 'ACERTO', 'CONTROLE DO ALVO'],
  heal: ['EFEITO ATIVADO', 'PONTOS DE CURA', 'VIDA RESTAURADA'],
  shield: ['DEFESA ATIVADA', 'ATAQUE RECEBIDO', 'DANO BLOQUEADO'],
  move: ['ESCOLHA O DESTINO', 'MOVIMENTO', 'NOVA POSIÇÃO'],
  fire: ['DISPARO', 'FOGO SE ESPALHA', 'DANO CONTÍNUO'],
  beam: ['ALVO MARCADO', 'DESCARGA', 'RAIO NO IMPACTO'],
  vortex: ['IMPACTO', 'CAMPO DE VENTO', 'ALVOS DESLOCADOS'],
  water: ['CONTATO COM A ÁGUA', 'CORRENTEZA', 'ALVO AFETADO'],
  bubble: ['BOLHAS SURGEM', 'TANQUE LEVITA', 'BOLHAS ESTOURAM'],
  earth: ['SOLO MARCADO', 'TERRA SE MOVE', 'CENÁRIO MODIFICADO'],
  deploy: ['ARREMESSO', 'ESTRUTURA ATIVA', 'ALVO DETECTADO'],
  frost: ['FRENTE FRIA', 'GELO SE FORMA', 'MOVIMENTO BLOQUEADO'],
  flora: ['SEMENTES CAEM', 'BROTO CRESCE', 'ÁRVORE CRIA APOIO'],
  attacker: ['TIRO PERFURANTE', 'ESCUDO IGNORADO', 'DANO EXTRA'],
  bomber: ['EXPLOSÃO AMPLIADA', 'MORTE DO TANQUE', 'GRANADAS LATERAIS'],
  elementalist: ['ELEMENTO SORTEADO', 'BOMBA ELEMENTAL', 'EFEITO NO CENÁRIO'],
  scout: ['PULSO EMITIDO', 'ITENS NO ALCANCE', 'POWERUPS REVELADOS'],
  overclock: ['CARGA COLETADA', 'PROJETIL REFORCADO', '+20 HP NO ACERTO'],
};

const SPECIAL_PHASES = {
  lootbox: ['HELICÓPTERO', 'CAIXA ENTREGUE', 'TRÊS APRIMORAMENTOS'],
  heavy: ['DISTÂNCIA + ALTURA', 'OBUS FICA VERMELHO', 'DANO CRÍTICO'],
  markerBomb: ['PRIMEIRO QUIQUE', 'TRÊS MARCAS', 'DETONE AS MARCAS'],
  fireworks: ['DISPARE OU DETONE', '12 MICROFOGUETES', 'SOLO FRAGMENTADO'],
  zeus: ['MARCA: 40 HP', 'AGUARDE 2 SEGUNDOS', 'RAIO: +40 HP'],
  gravity: ['BOMBA FIXADA', 'PUXÃO POR 4 SEGUNDOS', 'TANQUES + ESTRUTURAS'],
  mixer: ['ARMA PRINCIPAL', 'ESCOLHA A SEGUNDA', 'IMPACTO COMBINADO'],
  soapBomb: ['BOLHAS SE FORMAM', 'LEVITAÇÃO POR 5 S', 'ESTOURO E QUEDA'],
  harpoon: ['ARPÃO EM LINHA RETA', 'SEGUNDA ATIVAÇÃO', 'PUXÃO ATÉ A ÂNCORA'],
  blink: ['ESCOLHA UM PONTO SEGURO', 'TELEPORTE IMEDIATO', 'PODE REAGIR A ATAQUES'],
  extraFuel: ['COLETE O COMBUSTÍVEL', '+90 DE RESERVA', 'MOVIMENTO MAIS RÁPIDO'],
  healingDrone: ['INVOQUE O DRONE', 'ACOMPANHA O TANQUE', 'CURA 30 HP POR TURNO'],
  waterCannon: ['JATO POR 2 SEGUNDOS', 'EMPURRA NA RETA', 'ATÉ 40 HP'],
  waterMine: ['INATIVA NA TERRA', 'ARMA AO TOCAR ÁGUA', 'EXPLODE NO CONTATO'],
  waterHunter: ['BOMBA NA ÁGUA', 'CAÇA O INIMIGO', 'MORDIDA E EXPLOSÃO'],
  waterTorpedo: ['ÁGUA OU AR', 'TRÊS TRAJETÓRIAS', '3 × 40 HP'],
  elementalWind: ['BOMBA EXPLODE', 'VÓRTICE POR 2 RODADAS', 'ERGUE TUDO NA ÁREA'],
  windPlate: ['PLACA ARREMESSADA', 'MINI TORNADO FIXO', 'DESVIA TIROS'],
  megaCannon: ['MARCADOR NO SOLO', 'AGUARDE 3 SEGUNDOS', 'FEIXE ATRAVESSA TUDO'],
  sentry: ['TORRE ARREMESSADA', 'DETECTA INIMIGOS', '5 TIROS DE METRALHADORA'],
  splitDamage: ['DEFESA POR 2 RODADAS', 'RECEBE UM TIRO', 'REFLETE METADE DO DANO'],
  ninjaFatal: ['MIRE O PRIMEIRO CORTE', 'DASH ATRAVESSA O ALVO', 'SEGUNDO CORTE DIRECIONAL'],
  supply: ['HELICÓPTERO PASSA', 'PACOTES CAEM', 'POWERUPS NO MAPA'],
  bombardment: ['MIRAS NO SOLO', 'MÍSSEIS VERTICAIS', 'EXPLOSÕES EM SEQUÊNCIA'],
  lightning: ['NUVENS ESCURECEM', 'RAIOS MARCAM A ÁREA', 'PANE NOS TANQUES'],
  gale: ['VENTO AUMENTA', 'TANQUES SÃO EMPURRADOS', 'TORNADOS PODEM SURGIR'],
  flood: ['CHUVA INTENSA', 'ÁGUA SE ACUMULA', 'LAGOS SE FORMAM'],
  flora: ['SEMENTES NO CÉU', 'BOSQUE CRESCE', 'NOVOS APOIOS'],
  plasmaCore: ['1: LANÇAR NÚCLEO', '2: PARAR E FIXAR', 'LASER POR 4 RODADAS'],
  corrosionShell: ['CAPSULA NO SOLO', 'ACIDO SE ESPALHA', '12 HP POR RODADA'],
  rescueFlare: ['SINALIZADOR LANCADO', 'PULSO DE RESGATE', '+45 HP EM ALIADOS'],
  ironheart: ['NUCLEO COLETADO', 'VIDA MAXIMA AUMENTA', '+20 HP IMEDIATOS'],
  scoutPulse: ['RADAR ATIVADO', 'BUSCA EM 360 BLOCOS', 'POWERUPS REVELADOS'],
  overclockShell: ['CARGA COLETADA', 'PROXIMO TIRO TURBINADO', '+20 HP DE DANO'],
};

export function previewDefinition(type, section) {
  const scene = PREVIEW_SCENES[type];
  if (!scene) return null;
  return { type, section, scene, phases: SPECIAL_PHASES[type] || PHASES[scene], duration: 5200 };
}

function box(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function line(c, x1, y1, x2, y2, color, width = 2) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function ring(c, x, y, r, color, width = 2) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); }
function tank(c, x, y, color, facing = 1, health = 1, ghost = false) {
  c.save(); if (ghost) c.globalAlpha = .36;
  box(c, x - 14, y - 9, 28, 11, '#07101b'); box(c, x - 12, y - 11, 24, 9, color);
  box(c, x - 9, y - 16, 17, 6, color); box(c, x + facing * 5, y - 16, facing * 15, 3, color);
  for (const px of [-10, -3, 4, 11]) box(c, x + px - 2, y - 1, 4, 2, '#a5bdc9');
  box(c, x - 13, y - 22, 26, 3, '#132232'); box(c, x - 13, y - 22, 26 * health, 3, health < .8 ? '#ff7660' : '#71efa3');
  c.restore();
}
function spark(c, x, y, color, size = 10) { line(c, x - size, y, x + size, y, color); line(c, x, y - size, x, y + size, color); box(c, x - 3, y - 3, 6, 6, '#fff6d0'); }
function explosion(c, x, y, radius, color, progress) {
  const r = Math.max(2, radius * (Math.sin(Math.PI * progress) * .8 + .2));
  c.globalAlpha = Math.max(.1, 1 - progress * .8); ring(c, x, y, r, color, 4); ring(c, x, y, r * .55, '#fff2c2', 3);
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; box(c, x + Math.cos(a) * r - 2, y + Math.sin(a) * r - 2, 4, 4, i % 3 ? color : '#fff2c2'); }
  c.globalAlpha = 1;
}

export function drawLibraryPreview(canvas, definition, elapsedMs, color = '#82e7ff') {
  const c = canvas.getContext('2d'); if (!c) return 0;
  c.imageSmoothingEnabled = false; c.setTransform(canvas.width / 320, 0, 0, canvas.height / 180, 0, 0);
  const t = ((elapsedMs % definition.duration) + definition.duration) % definition.duration / definition.duration;
  const stage = t < .28 ? 0 : t < .68 ? 1 : 2;
  const impact = Math.max(0, Math.min(1, (t - .39) / .45));
  const scene = definition.scene; const type = definition.type; const arenaEvent = definition.section === 'events';
  box(c, 0, 0, 320, 180, '#071727'); box(c, 0, 95, 320, 46, '#102b40');
  for (let i = 0; i < 15; i++) box(c, (i * 43) % 320, (i * 29) % 82, 2, 2, i % 3 ? '#225369' : '#5a9cb3');
  for (let x = 0; x < 320; x += 8) {
    const broken = scene === 'earth' && t > .55 && x > 210 && x < 278;
    const y = broken ? 154 + Math.sin(x / 9) * 9 : 139 + (x > 172 && x < 202 ? 8 : 0);
    box(c, x, y, 7, 41, '#293e54'); box(c, x, y, 7, 3, broken ? '#db8865' : '#668f9b');
  }
  if (['water', 'bubble'].includes(scene)) { box(c, 181, 136, 139, 44, '#184d70'); for (let i = 0; i < 16; i++) box(c, 184 + i * 9, 135 + Math.sin(t * 18 + i) * 2, 6, 2, '#6adbec'); }
  const blinkMove = ['blink', 'lightningStep'].includes(type);
  const moveX = scene === 'move' ? blinkMove ? t < .38 ? 56 : 166 : 56 + (t < .28 ? 0 : Math.min(1, (t - .28) / .38) * (type === 'ninjaFatal' ? 200 : 110)) : 56;
  const lifted = ['vortex', 'bubble', 'water'].includes(scene) && t > .46 ? Math.sin(Math.min(1, (t - .46) / .35) * Math.PI / 2) * (scene === 'bubble' ? 48 : 30) : 0;
  if (type === 'invisibility' && t > .28) tank(c, 56, 138, '#73d9ec', 1, 1, true);
  else tank(c, moveX, scene === 'move' && ['jump', 'rocketDash', 'armoredDash', 'ninjaFatal'].includes(type) ? 138 - Math.sin(Math.max(0, (t - .28) / .58) * Math.PI) * 35 : 138, '#b7ec58');
  tank(c, scene === 'vortex' && t > .48 ? 250 - impact * 50 : 251, 138 - lifted, '#ff755c', -1, t > .69 && !['shield', 'heal', 'loot'].includes(scene) ? .54 : 1);
  box(c, 7, 7, 306, 18, '#091321'); box(c, 7, 24, 306 * t, 2, color);
  c.fillStyle = color; c.font = 'bold 8px monospace'; c.fillText(definition.phases[stage], 15, 19);

  if (type === 'plasmaCore') {
    const q = Math.min(1, t / .45);
    const x = 77 + q * 95, y = t < .45 ? 119 - Math.abs(Math.sin(q * Math.PI * 2)) * 46 : 124;
    if (t > .45) { line(c, x, y, 278, 98, '#a775ff', 6); line(c, x, y, 278, 98, '#f8edff', 1); }
    for (const point of [{x,y}, ...(t > .45 ? [{x:278,y:98}] : [])]) { ring(c, point.x, point.y, 11 + Math.sin(t * 30) * 2, '#b383ff', 2); ring(c, point.x, point.y, 6, '#e5caff', 3); spark(c, point.x, point.y, '#fff4ff', 4); }
    return stage;
  }
  if (!arenaEvent && ['blast', 'multi', 'control', 'fire', 'earth', 'frost', 'bubble', 'vortex', 'deploy', 'water', 'beam'].includes(scene) && t < .48) {
    const q = Math.min(1, t / .48); const px = 77 + q * 165; const py = 119 - Math.sin(q * Math.PI) * (type === 'flyingHunter' ? 95 : 47);
    for (let j = 1; j < 5; j++) box(c, px - j * 7, py + j * 2, 4, 2, j % 2 ? color : '#ffdfaa');
    box(c, px - 4, py - 3, 8, 6, type === 'heavy' ? t > .3 ? '#ff4945' : '#ffb34b' : color);
  }
  if (scene === 'multi' && t > .38) {
    const count = type === 'fireworks' ? 12 : type === 'tripleShot' ? 3 : type === 'waterTorpedo' ? 3 : type === 'cluster' ? 3 : 5;
    for (let i = 0; i < count; i++) { const angle = type === 'fireworks' ? i / count * Math.PI * 2 : -Math.PI / 2 + (i - (count - 1) / 2) * .35; const d = Math.min(1, (t - .38) / .5) * (type === 'fireworks' ? 38 : 27); box(c, 238 + Math.cos(angle) * d, 127 + Math.sin(angle) * d, 4, 4, i % 2 ? color : '#fff2b9'); }
  }
  if (scene === 'blast' && t > .42 && !arenaEvent) explosion(c, 246, 130, type === 'megaMissile' ? 66 : type === 'bigExplosion' ? 51 : 37, color, impact);
  if (scene === 'earth' && t > .42) { for (let i = 0; i < 12; i++) box(c, 211 + i * 6, 140 - Math.sin((i + t * 10) * .9) * 19 * (1 - impact), 4, 4, '#d8a06a'); if (type === 'elementalEarth' && t > .6) box(c, 245, 100, 15, 39, '#857d65'); }
  if (scene === 'control' && t > .44) { ring(c, 250, 122, 20 + 9 * Math.sin(t * 18), color, 3); if (['freeze', 'cryoMortar'].includes(type)) box(c, 234, 107, 32, 25, '#88e9ff77'); if (type === 'bunkerBuster') box(c, 233, 134, 25, 29, '#061421'); }
  if (scene === 'heal' && t > .28) { for (let i = 0; i < 6; i++) { const y = 117 - ((t * 60 + i * 12) % 48); box(c, 40 + i * 6, y, 4, 10, '#72f0a4'); box(c, 37 + i * 6, y + 3, 10, 4, '#72f0a4'); } box(c, 43, 116, 25 * Math.min(1, t * 2), 4, '#74f4a3'); if (type === 'healingDrone') { const y = 79 + Math.sin(t * 16) * 3; box(c, 45, y, 26, 9, '#3e9e91'); box(c, 55, y + 2, 6, 5, '#d7fff1'); line(c, 39, y - 3, 51, y - 3, '#b6fff2'); line(c, 65, y - 3, 77, y - 3, '#b6fff2'); } }
  if (scene === 'shield' && t > .28) { ring(c, 56, 118, 23 + 3 * Math.sin(t * 14), color, 3); if (t > .55) { spark(c, 79, 107, '#ffffff', 10); line(c, 234, 114, 79, 107, '#ffb477', 2); } }
  if (scene === 'move') { ring(c, 174, 129, 14, '#76eaff', 2); if (['harpoon', 'bridgeKit', 'spider'].includes(type)) line(c, moveX, 115, 183, 117, color, 2); if (blinkMove && t > .28) { ring(c, t < .38 ? 56 : 166, 120, 20 + Math.sin(t * 22) * 4, '#dbf978', 3); for (let i = 0; i < 5; i++) box(c, 66 + i * 18, 104 + i % 2 * 8, 4, 4, '#b8f76d'); } if (type === 'extraFuel') { box(c, 75, 118, 13, 18, '#dbab41'); box(c, 78, 114, 7, 5, '#fbe88b'); box(c, 8, 39, 85, 5, '#20384a'); box(c, 8, 39, 85 * Math.min(1, t * 2), 5, '#f6c64f'); } if (type === 'ninjaFatal' && t > .3) { line(c, moveX - 14, 111, moveX + 23, 93, '#d6a7ff', 4); spark(c, moveX + 10, 104, '#f0d9ff', 8); } }
  if (scene === 'fire' && t > .42) for (let i = 0; i < 12; i++) { const x = 196 + i * 8; const h = 7 + (i % 3) * 5 + Math.sin(t * 23 + i) * 5; box(c, x, 139 - h, 6, h, i % 2 ? '#ff6a38' : '#ffd568'); box(c, x + 1, 136 - h, 3, 5, '#fff0ae'); }
  if (scene === 'beam' && t > (['zeus', 'megaCannon', 'lightning'].includes(type) ? .66 : .38)) { const fromSky = !['laser', 'teslaOrb'].includes(type); const x = type === 'megaCannon' ? 242 : 251; const core = type === 'megaCannon' ? 17 : type === 'lightning' ? 2 : 6; const glow = type === 'megaCannon' ? 27 : type === 'lightning' ? 5 : 12; line(c, fromSky ? x : 76, fromSky ? 26 : 117, x, 129, color, glow); line(c, fromSky ? x : 76, fromSky ? 26 : 117, x, 129, '#d8faff', core); spark(c, x, 129, '#f3ffff', 14); }
  if (['zeus', 'megaCannon'].includes(type) && t > .42 && t < .66) { ring(c, 251, 132, 13 + Math.sin(t * 18) * 3, '#f7e6a5', 2); spark(c, 251, 128, color, 4); }
  if (scene === 'vortex' && t > .42) { for (let i = 0; i < 5; i++) { const r = 9 + i * 8 + (t * 25 % 8); ring(c, 242, 118 - (type === 'windPlate' || type === 'elementalWind' || type === 'gale' ? 30 : 0), r, i % 2 ? '#7de2e6' : color, 2); } }
  if (scene === 'water' && t > .36) { for (let i = 0; i < 16; i++) box(c, 84 + i * 10, 116 - Math.sin(t * 17 + i) * 8, 8, 3, i % 3 ? '#5fd3f0' : '#d4ffff'); if (type === 'waterMine') ring(c, 245, 130, 14, '#7ceaff', 4); if (type === 'buoy') ring(c, 58, 125, 15, '#e7fcff', 5); }
  if (scene === 'bubble' && t > .36) { ring(c, 250, 115 - lifted, 27, '#a9f3fb', 3); ring(c, 246, 110 - lifted, 32, '#71d1f2', 1); for (let i = 0; i < 7; i++) box(c, 218 + i * 8, 103 - lifted + Math.sin(i + t * 18) * 7, 3, 3, '#dffcff'); }
  if (scene === 'deploy' && t > .4) { box(c, 154, 110, 29, 24, '#274357'); box(c, 160, 100, 16, 14, color); box(c, 172, 105, 14, 3, '#d8faff'); if (t > .63) for (let i = 0; i < 5; i++) box(c, 188 + i * 12, 107 + i * 2, 4, 3, '#ffe1a7'); }
  if (scene === 'frost' && t > .35) { box(c, 221, 131, 64, 8, '#a5edff'); for (let i = 0; i < 11; i++) { const x = 210 + i * 8; line(c, x, 135, x + 6, 127 - i % 3 * 7, '#bdf8ff', 2); } }
  if (scene === 'flora' && t > .3) { const h = Math.min(64, (t - .3) * 120); box(c, 200, 139 - h, 8, h, '#805b3c'); for (let i = 0; i < 7; i++) box(c, 174 + i * 9, 139 - h - 14 + Math.sin(i * 4) * 9, 11, 12, '#88d67b'); }
  if (scene === 'loot') {
    if (['supply', 'lootbox'].includes(type) && t < .68) { const hx = 25 + t * 440; box(c, hx, 48, 45, 12, '#47657b'); box(c, hx + 8, 43, 22, 8, '#7eabb9'); box(c, hx + 40, 51, 17, 4, '#80c6d5'); box(c, hx + 16, 38, 3, 7, '#d8eaf1'); line(c, hx + 2, 38, hx + 37, 38, '#b4d8e4', 2); box(c, hx + 11, 60, 24, 3, '#b4d8e4'); }
    if (t > .25) { const drop = Math.min(1, (t - .25) / .35); const y = 65 + drop * 65; if (['supply', 'lootbox'].includes(type) && drop < 1) { ring(c, 165, y - 11, 13, '#e0edf3', 2); line(c, 152, y - 11, 153, y, '#d3e5e9'); line(c, 178, y - 11, 177, y, '#d3e5e9'); } box(c, 153, y, 24, 18, '#b58a3c'); box(c, 158, y + 5, 14, 7, '#ffe07b'); if (t > .7) for (let i = 0; i < 3; i++) spark(c, 137 + i * 25, 106 - i % 2 * 19, '#fff4aa', 6); }
  }
  if (scene === 'attacker' && t > .38) line(c, 76, 114, 267, 114, '#ff7862', 4);
  if (scene === 'bomber' && t > .38) { explosion(c, 250, 128, 44, '#ffa05d', impact); for (const d of [-1, 1]) box(c, 249 + d * (t - .38) * 90, 119 - Math.sin(t * 8) * 15, 5, 5, '#ffe590'); }
  if (scene === 'elementalist' && t > .38) { for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 + t; spark(c, 242 + Math.cos(a) * 24, 111 + Math.sin(a) * 20, ['#ff8652', '#69dfff', '#80e5c9', '#d2a46a', '#d9faff'][i], 4); } }
  if (arenaEvent) {
    if (type === 'bombardment') { for (const x of [118, 202, 273]) { ring(c, x, 138, 9 + 3 * Math.sin(t * 18), '#ff6d4d', 2); if (t > .42) { const y = 27 + Math.min(1, (t - .42) * 3.1) * 107; box(c, x - 3, y, 6, 13, '#ffad6c'); for (let i = 1; i < 5; i++) box(c, x - 2, y - i * 8, 3, 4, '#ffa65e'); } if (t > .7) explosion(c, x, 135, 21, '#ff6c40', (t - .7) / .3); } }
    if (type === 'lightning' || type === 'blizzard' || type === 'flood') { for (let i = 0; i < 6; i++) { const x = i * 59 - 10 + Math.sin(t * 5 + i) * 5; box(c, x, 37 + i % 2 * 8, 61, 12, '#344d63'); box(c, x + 13, 27 + i % 2 * 8, 34, 11, '#4c6275'); } }
    if (type === 'flood' || type === 'blizzard') { for (let i = 0; i < 33; i++) { const x = (i * 37 + t * 85) % 320; const y = (i * 31 + t * 180) % 118 + 14; box(c, x, y, type === 'flood' ? 2 : 4, type === 'flood' ? 10 : 4, '#a5e8f5'); } if (t > .5 && type === 'flood') box(c, 171, 138 - (t - .5) * 42, 149, 43, '#2387b088'); }
    if (type === 'gale') { for (let i = 0; i < 25; i++) { const x = (i * 39 + t * 250) % 320; const y = 61 + i % 6 * 14; line(c, x, y, x + 20, y - 3, i % 3 ? '#7db5c5' : '#b4dbe4'); } }
    if (type === 'eruption') { box(c, 185, 144 - Math.max(0, (t - .37) * 65), 63, 40, '#e04d2c'); for (let i = 0; i < 7; i++) { const flight = Math.max(0, (t - .4) * 100); box(c, 215 + (i - 3) * flight * .33, 124 - Math.sin(Math.min(1, flight / 60) * Math.PI) * (31 + i * 5), 5, 5, '#ffae54'); } }
    if (type === 'luckyWinds') for (const x of [66, 246]) { ring(c, x, 121, 24 + Math.sin(t * 13) * 3, '#ffdb67', 3); spark(c, x, 90, '#fff3a9', 6); }
    if (type === 'quake' || type === 'tectonic' || type === 'collapse') for (const x of [124, 204, 263]) { ring(c, x, 139, 10 + Math.sin(t * 12) * 3, '#ff7060', 2); if (t > .49) line(c, x, 138, x + 12, 169, '#d5a06d', 3); }
  }
  return stage;
}
