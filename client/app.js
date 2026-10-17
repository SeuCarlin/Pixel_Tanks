import { CLIENT, SERVER } from '/shared/protocol.js';
import { ARSENAL_DEFS, CLASS_DEFS, CLASS_EVOLUTIONS, classEvolutionRounds, CLUSTER_CAPSULE_SPEED, COLLECTIBLE_ITEMS, DESTRUCTION_POINTS, EVENT_DEFS, MEGA_BOMB, MEGA_CANNON_CHARGE, POWERUP_DEFS, SHOT_PATH_RATE, WEAPON_BALANCE } from '/shared/constants.js';
import { CARD_ROLE_LABELS, CARD_SECTIONS, cardActivation, cardCombo, cardDamage, cardRole, classProgressionDescription, searchableCard } from '/shared/card-catalog.js';
import { BIOMES } from '/shared/biomes.js';
import { suggestAim } from '/shared/aim-assist.js';
import { GameNetwork } from './network.js';
import { Renderer } from './renderer.js';
import { BattleAudio } from './audio.js';

const $ = (q) => document.querySelector(q); const $$ = (q) => [...document.querySelectorAll(q)];
const net = new GameNetwork(); const renderer = new Renderer($('#gameCanvas'));
const audio = new BattleAudio();
let room = null; let game = null; let playerId = sessionStorage.getItem('tankPlayerId'); let spectatorMode = Boolean(sessionStorage.getItem('tankSpectatorToken')); let lastTurn = null; let toastTimer;
let aimDirection = 1; let aiming = false; let aimAssistTargetId = null; let aimAssistEstimate = null;
let selectedWeapon = 'standard'; let resultSoundPlayed = false; let resultSequence = 0; let lastArenaEventKey = null;
let focusTimer; let pickupTimer; let rouletteTimer; let arenaAlertTimer; let destructionTimer; let clusterImpactTimer; let savedClassSeed = null; let savedArsenalSeed = null; let deferredPickup = null;
let serverClockOffset = 0; const gameNow = () => Date.now() + serverClockOffset;
let hapticFallbackTimer;
const combatEntries = []; let combatSeed = null;
window.render_game_to_text = () => JSON.stringify({
  coordinates: 'world origin top-left; x increases right, y increases down; viewport uses renderer.camera',
  screen: document.querySelector('.screen.active')?.id || 'unknown',
  room: room?.code || null,
  phase: game?.phase || null,
  turn: game?.turnNumber ?? null,
  round: game?.roundNumber ?? null,
  survival: game?.survival ? { lavaLevel: game.lavaLevel, nextLevel: game.survival.nextLevel, lastRise: game.survival.lastRise } : null,
  hill: game?.hill ? { x: game.hill.x, radius: game.hill.radius, contested: game.hill.contested, teamScores: game.hill.teamScores, lastCaptureTeam: game.hill.lastCaptureTeam } : null,
  currentPlayerId: game?.players?.[game.turnIndex]?.id || null,
  localPlayerId: playerId,
  aim: { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection, assistedTargetId: aimAssistTargetId, estimatedError: aimAssistEstimate },
  audio: { enabled: audio.enabled, ready: audio.isReady(), webState: audio.context?.state || 'none', nativeReady: audio.mobile.ready, nativeError: audio.mobile.lastError, volumes: audio.volumes },
  players: (game?.players || []).map((player) => ({ id: player.id, x: player.x, y: player.y, health: player.health, maxHealth: player.maxHealth, alive: player.alive, team: player.team, classType: player.classType, classEvolutions: player.classEvolutions, pendingClassEvolutions: player.pendingClassEvolutions })),
  objects: (game?.objects || []).filter((object) => object.active !== false && object.x >= renderer.camera.x - 100 && object.x <= renderer.camera.x + 1280 / renderer.camera.zoom + 100).map((object) => ({ id: object.id, type: object.type, x: object.x, y: object.y, durability: object.durability ?? object.towerDurability ?? null })),
  pickups: (game?.powerups || []).filter((item) => item.active && item.revealed && item.x >= renderer.camera.x - 100 && item.x <= renderer.camera.x + 1280 / renderer.camera.zoom + 100).map((item) => ({ id: item.id, type: item.type, x: item.x, y: item.y })),
  delayedStrikes: game?.delayedStrikes || [],
  movementPreview: renderer.movementPreviewCache && renderer.movementPreviewCache.game === game ? { mode: renderer.movementMode, endpoints: renderer.movementPreviewCache.landings.map((landing) => ({ x: landing.x, y: landing.y, safe: landing.safe, walls: landing.wallBreakPoints?.length || 0, launcherId: landing.launcherId || null })) } : null,
  camera: { ...renderer.camera },
});
function addCombatEntry(message, tone = 'neutral') {
  combatEntries.unshift({ message, tone }); combatEntries.length = Math.min(combatEntries.length, 6);
  $('#combatFeedEntries').innerHTML = combatEntries.map((entry) => `<p class="${entry.tone}">${escapeHtml(entry.message)}</p>`).join('');
}
$('#combatFeedToggle').onclick = () => { const panel = $('#combatFeed'); const open = !panel.classList.contains('open'); panel.classList.toggle('open', open); $('#combatFeedToggle').setAttribute('aria-expanded', String(open)); audio.ui(); };
const mobileVibrate = (pattern) => {
  if (!matchMedia('(pointer:coarse)').matches) return false;
  if (typeof navigator.vibrate === 'function' && navigator.vibrate(pattern)) return true;
  const pulses = Array.isArray(pattern) ? pattern.filter((_, index) => index % 2 === 0) : [pattern];
  const strength = Math.max(1, ...pulses.map(Number).filter(Number.isFinite));
  renderer.shake = Math.max(renderer.shake, Math.min(7, 1.5 + strength / 22));
  document.body.classList.remove('haptic-fallback'); void document.body.offsetWidth; document.body.classList.add('haptic-fallback');
  clearTimeout(hapticFallbackTimer); hapticFallbackTimer = setTimeout(() => document.body.classList.remove('haptic-fallback'), 180);
  return false;
};
const ART_ATLASES = Object.freeze({
  powerups: { definitions: POWERUP_DEFS, columns: 7, rows: 4 },
  arsenal: { definitions: ARSENAL_DEFS, columns: 4, rows: 4 },
  classes: { definitions: CLASS_DEFS, columns: 4, rows: 2 },
  events: { definitions: EVENT_DEFS, columns: 3, rows: 3 },
});
function atlasStyle(type, section) {
  const atlas = ART_ATLASES[section]; const index = Object.keys(atlas?.definitions || {}).indexOf(type);
  if (!atlas || index < 0) return '';
  const column = index % atlas.columns; const row = Math.floor(index / atlas.columns);
  const x = atlas.columns > 1 ? column / (atlas.columns - 1) * 100 : 0;
  const y = atlas.rows > 1 ? row / (atlas.rows - 1) * 100 : 0;
  return `--atlas-columns:${atlas.columns};--atlas-rows:${atlas.rows};--atlas-x:${x}%;--atlas-y:${y}%`;
}
const chatHistory = [];
const DESTRUCTION_LABELS = Object.freeze({ terrainChunk: '24 MICROBLOCOS', barrel: 'BARRIL', fuelTank: 'TANQUE DE COMBUSTÍVEL', radar: 'RADAR', watchtower: 'TORRE', platform: 'PLATAFORMA', concrete: 'CONCRETO', craneCable: 'CABO DO GUINDASTE', building: 'PRÉDIO', crane: 'GUINDASTE', tank: 'TANQUE' });
const destructionLegend = Object.entries(DESTRUCTION_POINTS).map(([type, points]) => `${DESTRUCTION_LABELS[type]} +${points}`).join(' • ');
const DAMAGE_INFO = Object.freeze({
  extraShot: 'repete o dano da arma', doubleShot: '2× o dano da arma', tripleShot: '3× o dano da arma', bigExplosion: 'mantém o dano da arma', megaMissile: `até ${MEGA_BOMB.damage} HP`, freeze: 'mantém o dano da arma', guidedBullet: 'mantém o dano da arma', heal: 'sem dano', shield: 'sem dano', movementBoost: 'sem dano', rocketDash: 'sem dano', lightningStep: 'sem dano', bridgeKit: 'mantém o dano da arma', teleport: 'mantém o dano da arma', invisibility: 'sem dano', excavator: 'sem dano', armorPiercer: 'mantém o dano da arma', shockwave: 'até 24 HP', bunkerBuster: 'até 58 HP', ammoCrate: 'sem dano', molotov: 'impacto + fogo', repairDrone: 'sem dano', overcharge: 'sem dano', laser: `${WEAPON_BALANCE.laser.damage} HP por alvo`, mirror: 'repete todo o dano', trickster: 'sem dano', flyingHunter: `até ${WEAPON_BALANCE.flyingHunter.damage} HP`,
  heavy: `${WEAPON_BALANCE.heavy.damage}–${Math.round(WEAPON_BALANCE.heavy.damage * WEAPON_BALANCE.heavy.maxMultiplier)} HP`, cluster: `${WEAPON_BALANCE.cluster.damage} HP por fragmento`, fireworks: `${WEAPON_BALANCE.fireworks.damage} HP + 12× até ${WEAPON_BALANCE.fireworks.secondaryDamage} HP`, zeus: 'até 50 HP combinados', gravity: `até ${WEAPON_BALANCE.gravity.damage} HP`, grenade: `até ${WEAPON_BALANCE.grenade.damage} HP`, mineLayer: `${WEAPON_BALANCE.mineLayer.damage} HP por mina`, moleBomb: `até ${WEAPON_BALANCE.moleBomb.damage} HP`, armoredDash: `${WEAPON_BALANCE.armoredDash.damage} HP • ${WEAPON_BALANCE.armoredDash.walls} paredes`, verticalStrike: `até ${WEAPON_BALANCE.verticalStrike.damage} HP`, droneStrike: '24 HP por micromíssil', teslaOrb: '30 + 22 HP por arco', seismicCharge: '44 + 18 HP por onda', megaCannon: `até ${WEAPON_BALANCE.megaCannon.damage} HP • ${MEGA_CANNON_CHARGE} pontos para carregar`, jump: 'sem dano', spider: 'sem dano', standard: `até ${WEAPON_BALANCE.standard.damage} HP`,
});
function combatDescription(type, info) { const damage = DAMAGE_INFO[type]; return damage ? `${info.description} Dano: ${damage}.` : info.description; }
function syncMenuMusic() { if ($('#homeScreen').classList.contains('active') && audio.isReady()) audio.startMenuMusic(); else audio.stopMenuMusic(); }
function screen(id) { $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); document.body.classList.toggle('playing', id === 'gameScreen'); syncMenuMusic(); if (id === 'gameScreen' && matchMedia('(pointer: coarse) and (orientation: landscape)').matches) window.screen.orientation?.lock?.('landscape').catch(() => {}); }
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2300); }
$('#destructionCard').onclick = () => toast(destructionLegend);
function send(type, payload) { net.send(type, payload); }
const POWERUP_USAGE = {
  lootbox: 'Os três aprimoramentos da caixa foram aplicados ao seu tanque e adicionados ao arsenal ou inventário.',
  extraShot: 'É ativado automaticamente depois que seu próximo projétil concluir a trajetória.',
  doubleShot: 'Seu próximo ataque dispara dois projéteis. Uma carga é consumida por ataque.',
  tripleShot: 'Seu próximo ataque dispara três projéteis. Uma carga é consumida por ataque.',
  bigExplosion: 'A próxima explosão ganha uma cratera maior. O efeito é automático.',
  megaMissile: `Seu próximo disparo vira uma Mega Bomba atômica: ${MEGA_BOMB.radius} blocos de alcance, até ${MEGA_BOMB.damage} HP e explosão em cogumelo.`,
  freeze: 'Seu próximo disparo congela por dois turnos cada inimigo atingido.',
  guidedBullet: 'Seu próximo projétil corrige a rota automaticamente em direção a um adversário visível.',
  heal: 'A cura foi aplicada imediatamente ao seu tanque.',
  shield: 'A próxima vez que você receber dano, uma carga reduz o impacto automaticamente.',
  movementBoost: 'Todos os seus movimentos ficam maiores permanentemente. Os bônus acumulam.',
  rocketDash: 'Equipe e use uma seta de movimento. A arrancada amplia um deslocamento sem atravessar paredes.',
  lightningStep: 'Equipe e toque no cenário até 270 blocos do tanque para escolher o pouso.',
  bridgeKit: 'Equipe e atire. No primeiro impacto nasce uma ponte resistente de microblocos.',
  teleport: 'Ao atirar, você será transportado para uma posição segura próxima ao impacto.',
  invisibility: 'Já está ativo: somente você enxerga sua posição durante seus próximos dois turnos.',
  excavator: 'Use os botões de movimento contra uma parede. Cada avanço escava e consome uma carga.',
  armorPiercer: 'Selecione no inventário. Seu próximo ataque atravessará qualquer escudo.',
  shockwave: 'Selecione no inventário. O próximo impacto arremessará tanques para longe.',
  bunkerBuster: 'Selecione no inventário. O próximo disparo abrirá uma cratera muito mais profunda.',
  ammoCrate: 'Um obus pesado e uma munição cluster já foram adicionados ao seu arsenal.',
  molotov: 'Selecione no inventário e atire. O impacto deixa fogo que causa dano por três turnos.',
  repairDrone: 'O drone já está ativo e recuperará vida ao fim dos seus próximos três turnos.',
  overcharge: 'Todas as cargas do arsenal foram restauradas imediatamente.',
  laser: 'Equipe e arraste a mira abaixo do tanque se quiser atirar para baixo. O feixe atravessa vários inimigos e imobiliza seu tanque no próximo turno.',
  mirror: 'Equipe junto com outros powerups: após o primeiro disparo, o Espelho repete a mesma arma, força, direção e efeitos.',
  trickster: 'Equipe e toque em outro tanque no cenário para trocar instantaneamente de posição com ele.',
  flyingHunter: 'Equipe e atire: o mini caça sobrevoa o mapa, mergulha no inimigo mais próximo e causa até 60 HP.',
};
const SELECTABLE_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'excavator', 'armorPiercer', 'shockwave', 'bunkerBuster', 'rocketDash', 'lightningStep', 'bridgeKit', 'molotov', 'laser', 'mirror', 'trickster', 'flyingHunter']);
const SHOT_COMBO_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'armorPiercer', 'shockwave', 'bunkerBuster', 'bridgeKit', 'molotov', 'laser', 'mirror', 'flyingHunter']);
const definitionChecks = (definitions, name) => Object.entries(definitions).map(([type, info]) => `<label style="--item:${info.color}"><input type="checkbox" name="${name}" value="${type}" checked><i></i><span>${info.name}</span></label>`).join('');
$('#eventRulePicker').innerHTML = definitionChecks(EVENT_DEFS, 'enabledEvents');
const configurablePickups = Object.fromEntries(COLLECTIBLE_ITEMS.map((type) => [type, POWERUP_DEFS[type] || ARSENAL_DEFS[type]]));
$('#powerupRulePicker').innerHTML = definitionChecks(configurablePickups, 'enabledPowerups');
function updateRuleCounts() { $('#eventRuleCount').textContent = `${$$('[name="enabledEvents"]:checked').length}/${Object.keys(EVENT_DEFS).length}`; $('#powerupRuleCount').textContent = `${$$('[name="enabledPowerups"]:checked').length}/${COLLECTIBLE_ITEMS.length}`; }
$('#eventRulePicker').onchange = updateRuleCounts; $('#powerupRulePicker').onchange = updateRuleCounts; updateRuleCounts();
function equippedPowers(player) { return player?.selectedPowerups?.length ? player.selectedPowerups : player?.selectedPowerup ? [player.selectedPowerup] : []; }
function supportsWeaponCombo(powerup, weapon) { if (!powerup || !SHOT_COMBO_POWERUPS.has(powerup) || ARSENAL_DEFS[weapon]?.kind !== 'shot') return false; if (['megaMissile', 'bigExplosion'].includes(powerup) && ['mineLayer', 'gravity'].includes(weapon)) return false; return true; }
function showPickup(type, player) {
  if (!$('#classEvolutionModal').hidden || !$('#rewardModal').hidden) { deferredPickup = { type, player }; return; }
  $('#arenaAlert').classList.remove('show');
  const info = POWERUP_DEFS[type] || ARSENAL_DEFS[type]; if (!info) return;
  const arsenalPickup = Boolean(ARSENAL_DEFS[type]);
  const counts = new Map(); for (const item of player.inventory || []) counts.set(item, (counts.get(item) || 0) + 1);
  const count = arsenalPickup ? player.ammo?.[type] || 1 : type === 'shield' ? player.shieldCharges : type === 'invisibility' ? player.invisibleTurns : type === 'heal' ? 0 : counts.get(type) || 1;
  const contents = type === 'lootbox' ? (player.lastPickup?.contents || []).map((reward) => (POWERUP_DEFS[reward] || ARSENAL_DEFS[reward])?.name).filter(Boolean) : [];
  const selectable = SELECTABLE_POWERUPS.has(type); const artSection = arsenalPickup ? 'arsenal' : 'powerups'; $('#pickupReveal').style.setProperty('--pickup', info.color); $('#pickupArt').className = `pickup-art atlas-art atlas-${artSection}`; $('#pickupArt').setAttribute('style', atlasStyle(type, artSection)); $('#pickupEyebrow').textContent = type === 'lootbox' ? 'LOOTBOX RARA • 3 RECOMPENSAS' : arsenalPickup ? 'HABILIDADE COLETADA • DISPONÍVEL NO ARSENAL' : selectable ? 'POWERUP COLETADO • SELECIONE NO INVENTÁRIO' : 'POWERUP COLETADO • EFEITO AUTOMÁTICO'; $('#pickupShort').textContent = info.short; $('#pickupName').textContent = info.name; $('#pickupDescription').textContent = contents.length ? `Você recebeu: ${contents.join(' • ')}.` : combatDescription(type, info); $('#pickupUsage').textContent = arsenalPickup ? 'Uma carga foi adicionada. A habilidade aparece no seletor de armas e pode ser usada nesta partida.' : POWERUP_USAGE[type] || 'O efeito ficará disponível no seu inventário.';
  if (type === 'megaCannon') {
    const firstUnlock = player.lastPickup?.category === 'classReward';
    $('#pickupEyebrow').textContent = firstUnlock ? 'PODER DE CLASSE DESBLOQUEADO' : 'MEGA CANHÃO RECARREGADO';
    $('#pickupUsage').textContent = firstUnlock ? 'Exclusivo do Atacante. A carta apareceu automaticamente no arsenal: selecione MEGA para disparar. Depois, acumule mais 300 pontos para recarregar.' : 'Uma nova carga está pronta no arsenal. Selecione MEGA para disparar.';
  }
  $('#pickupStack').textContent = ['heal', 'ammoCrate', 'lootbox'].includes(type) ? 'EFEITO APLICADO IMEDIATAMENTE' : type === 'invisibility' ? `${count} TURNOS ACUMULADOS` : `${count} ${count === 1 ? 'CARGA' : 'CARGAS'} ACUMULADAS`;
  $('#pickupReveal').classList.remove('show'); void $('#pickupReveal').offsetWidth; $('#pickupReveal').classList.add('show'); clearTimeout(pickupTimer); pickupTimer = setTimeout(() => $('#pickupReveal').classList.remove('show'), 5200);
}
$('#pickupClose').onclick = () => { clearTimeout(pickupTimer); $('#pickupReveal').classList.remove('show'); };

$$('.tab').forEach((tab) => tab.onclick = () => { $$('.tab,.form').forEach((x) => x.classList.remove('active')); tab.classList.add('active'); $(`#${tab.dataset.tab}Form`).classList.add('active'); });
const modeSelect = $('#createForm [name="gameMode"]'); const syncTeamOptions = () => { $('#teamCountField').hidden = !['teams', 'teamHill'].includes(modeSelect.value); $('#modeHelp').textContent = ({ ffa: 'Elimine os demais tanques ou vença pelo limite de rodadas.', coop: 'Humanos enfrentam bots juntos. A partida acaba quando uma equipe é eliminada.', teams: 'Forme de 2 a 4 equipes. Fogo amigo desativado; vence a última equipe viva.', teamHill: 'Equipes somam pontos ocupando a colina sem rivais. A primeira com 4 pontos vence.', hill: 'Ocupe a zona dourada sozinho ao fim de cada rodada. Quem fizer 4 pontos primeiro vence.', survival: 'A lava sobe a cada rodada. Fuja para terreno ou plataformas altas e seja o último tanque vivo.' })[modeSelect.value]; }; modeSelect.onchange = syncTeamOptions; syncTeamOptions();
$('#quickPreset').onclick = () => { const form = $('#createForm'); for (const [name, value] of Object.entries({ maxPlayers: '2', botCount: '1', botDifficulty: 'normal', turnSeconds: '15', roundLimit: '10', gameSpeed: '1.5', powerupCount: '12', mapType: 'random', gameMode: 'ffa' })) form.elements[name].value = value; syncTeamOptions(); toast('Partida rápida pronta: 1 bot, 10 rodadas e turnos de 15s.'); };
$('#createForm').onsubmit = (e) => { e.preventDefault(); const form = new FormData(e.target); const v = Object.fromEntries(form); send(CLIENT.CREATE_ROOM, { nickname: v.nickname, roomName: v.roomName, rules: { ...v, mines: Boolean(v.mines), classesEnabled: Boolean(v.classesEnabled), enabledEvents: form.getAll('enabledEvents'), enabledPowerups: form.getAll('enabledPowerups') } }); };
$('#joinForm').onsubmit = (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); send(CLIENT.JOIN_ROOM, v); };
$('#watchButton').onclick = () => { const v = Object.fromEntries(new FormData($('#joinForm'))); if (!v.code) { toast('Informe o código da sala.'); return; } send(CLIENT.WATCH_ROOM, v); };
function movementPayload(direction) { return { direction, arsenal: selectedWeapon === 'armoredDash' ? 'armoredDash' : selectedWeapon === 'spider' ? 'spider' : null }; }
$('#startButton').onclick = () => send(CLIENT.START_GAME); $('#moveLeft').onclick = () => { mobileVibrate(10); send(CLIENT.MOVE, movementPayload(-1)); }; $('#moveRight').onclick = () => { mobileVibrate(10); send(CLIENT.MOVE, movementPayload(1)); };
function activateJump() { const me = game?.players.find((player) => player.id === playerId); const openingParachute = Boolean(me?.airborne); send(CLIENT.USE_ARSENAL, openingParachute ? { type: 'parachute' } : { type: 'jump', angle: $('#angle').value, power: $('#power').value, direction: aimDirection }); if (!openingParachute) { selectedWeapon = 'standard'; renderer.setMovementMode(selectedWeapon); $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === 'standard')); toast('NO AR • escolha o tiro e dispare'); } }
function aimStorageKey() { return playerId ? `tankAim:${playerId}` : null; }
function saveAim() { const key = aimStorageKey(); if (key) localStorage.setItem(key, JSON.stringify({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection })); }
function restoreAim() { const key = aimStorageKey(); let value = null; try { value = key && JSON.parse(localStorage.getItem(key)); } catch {} const me = game?.players.find((player) => player.id === playerId); if (!value) value = { angle: 45, power: 310, direction: me?.facing || 1 }; aimDirection = value.direction === -1 ? -1 : 1; $('#angle').value = Math.max(aimMinimum(), Math.min(85, Number(value.angle) || 45)); $('#power').value = Math.max(100, Math.min(580, Number(value.power) || 310)); $('#angleValue').textContent = `${$('#angle').value}°`; $('#powerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; syncAimPreview(); }
function fireButtonFx() { const button = $('#fireButton'); button.classList.remove('fire-fx'); void button.offsetWidth; button.classList.add('fire-fx'); setTimeout(() => button.classList.remove('fire-fx'), 650); mobileVibrate([18, 18, 32]); }
function fireSelectedWeapon() { if (renderer.hasAwaitingVerticalShot()) { const token = renderer.activateVerticalShot(); if (token) { audio.unlock(); fireButtonFx(); send(CLIENT.ACTIVATE_VERTICAL, { token }); toast('ATIVAÇÃO VERTICAL!'); } return; } if (renderer.hasAwaitingClusterShot()) { const token = renderer.activateClusterShot(); if (token) { audio.unlock(); fireButtonFx(); send(CLIENT.ACTIVATE_CLUSTER, { token }); toast('FRAGMENTAÇÃO: 3 MÍSSEIS!'); } return; } if ($('#fireButton').disabled) return; if (selectedWeapon === 'jump') { activateJump(); return; } if (selectedWeapon === 'spider' || selectedWeapon === 'armoredDash') { toast(selectedWeapon === 'armoredDash' ? 'Use A/D ou as setas para executar a investida.' : 'Use A/D: salte, ganhe 2 movimentos e escale paredes permanentemente.'); return; } audio.unlock(); saveAim(); fireButtonFx(); send(CLIENT.FIRE, { angle: $('#angle').value, power: $('#power').value, direction: aimDirection, weapon: selectedWeapon }); }
let firePointerHandledAt = -Infinity;
$('#fireButton').addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); firePointerHandledAt = performance.now(); fireSelectedWeapon(); });
$('#fireButton').onclick = () => { if (performance.now() - firePointerHandledAt < 500) return; fireSelectedWeapon(); }; $('#passButton').onclick = () => send(CLIENT.PASS_TURN);
$('#rematchButton').onclick = () => send(CLIENT.REMATCH); $('#backButton').onclick = () => location.reload();
$('#restartButton').onclick = () => { if (confirm('Reiniciar a partida para todos os jogadores?')) send(CLIENT.REMATCH); };
$('#leaveButton').onclick = () => { const wasSpectator = spectatorMode; send(CLIENT.LEAVE_ROOM); room = null; game = null; playerId = null; spectatorMode = false; document.body.classList.remove('spectating'); sessionStorage.removeItem('tankToken'); sessionStorage.removeItem('tankPlayerId'); sessionStorage.removeItem('tankSpectatorToken'); sessionStorage.removeItem('tankRoomCode'); $('#chatMessages').innerHTML = ''; screen('homeScreen'); toast(wasSpectator ? 'Você saiu da transmissão.' : 'Você saiu da partida. Um bot assumiu seu tanque.'); };
$('#chatForm').onsubmit = (event) => { event.preventDefault(); const input = $('#chatInput'); const text = input.value.trim(); if (text) send(CLIENT.CHAT, { text }); input.value = ''; input.blur(); $('#chatPanel').classList.remove('open'); };
$('#copyCode').onclick = async () => {
  if (!room?.code) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API indisponível');
    await navigator.clipboard.writeText(room.code);
    toast(`Código ${room.code} copiado! Compartilhe com seus amigos.`);
  } catch { toast(`Não foi possível copiar. Anote o código: ${room.code}`); }
};
function laserAimActive() { const me = game?.players.find((player) => player.id === playerId); return equippedPowers(me).includes('laser') && me.inventory?.includes('laser'); }
function aimMinimum() { return laserAimActive() ? -85 : 5; }
function clearAimAssist() { aimAssistTargetId = null; aimAssistEstimate = null; renderer.aimAssistTargetId = null; renderer.aimAssistError = null; $('#aimAssistButton').classList.remove('active', 'approximate'); $('#aimAssistButton').title = 'Sugerir mira para o inimigo mais próximo'; }
function updateMobileAimReadout() { $('#mobileAngleValue').textContent = `${$('#angle').value}°`; $('#mobilePowerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; }
function syncAimPreview() { renderer.setAim({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection }); updateMobileAimReadout(); }
$('#angle').oninput = (e) => { clearAimAssist(); $('#angleValue').textContent = `${e.target.value}°`; syncAimPreview(); }; $('#power').oninput = (e) => { clearAimAssist(); $('#powerValue').textContent = `${Math.round((e.target.value - 100) / 4.8)}%`; syncAimPreview(); };
let mobileAimLocked = false;
function updateAimLockButton() { const button = $('#aimLockButton'); button.classList.toggle('locked', mobileAimLocked); button.setAttribute('aria-pressed', String(mobileAimLocked)); button.setAttribute('aria-label', mobileAimLocked ? 'Destravar mira' : 'Travar mira'); button.title = mobileAimLocked ? 'Mira travada — toque para liberar' : 'Travar ângulo, força e direção'; button.innerHTML = mobileAimLocked ? '◆<span>MIRA<br>TRAVADA</span>' : '◇<span>TRAVAR<br>MIRA</span>'; $('#aimAssistButton').disabled = mobileAimLocked || button.disabled; }
$('#aimLockButton').addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); if ($('#aimLockButton').disabled) return; mobileAimLocked = !mobileAimLocked; updateAimLockButton(); mobileVibrate(mobileAimLocked ? [12, 24, 12] : 8); audio.ui(); });
$('#aimAssistButton').onclick = () => {
  const shooter = game?.players.find((player) => player.id === playerId);
  if (!shooter || game.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId || game.shotEndsAt || mobileAimLocked) return;
  if (selectedWeapon !== 'standard' && ARSENAL_DEFS[selectedWeapon]?.kind !== 'shot') { toast('Selecione um tiro antes de usar o assistente.'); return; }
  const origin = renderer.renderPosition(renderer.visualPlayers.get(playerId) || shooter);
  const enemies = game.players.filter((player) => player.alive && !player.hidden && player.id !== playerId && Number.isFinite(player.x) && (!['coop', 'teams', 'teamHill'].includes(game.mode) || player.team !== shooter.team)).sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
  if (!enemies.length) { clearAimAssist(); toast('Nenhum inimigo visível para assistir a mira.'); return; }
  const selectedIndex = enemies.findIndex((player) => player.id === aimAssistTargetId);
  const laser = laserAimActive();
  const platforms = laser ? [] : (game.terrain.floatingPlatforms || []).filter((platform) => platform.active).map((platform) => ({ ...platform, x: renderer.platformX(platform) }));
  const players = laser ? [] : game.players.filter((player) => !player.hidden).map((player) => ({ ...player, ...renderer.renderPosition(renderer.visualPlayers.get(player.id) || player) }));
  let target = null; let suggestion = null; let fallback = null;
  for (let offset = 1; offset <= enemies.length; offset += 1) {
    const candidate = enemies[(selectedIndex + offset) % enemies.length]; const position = renderer.renderPosition(renderer.visualPlayers.get(candidate.id) || candidate);
    const dx = position.x - origin.x; const dy = origin.y - position.y; const distance = Math.hypot(dx, dy);
    const proposed = laser ? { direction: dx < 0 ? -1 : 1, angle: Math.round(Math.atan2(dy, Math.max(5, Math.abs(dx))) * 180 / Math.PI), power: Math.max(100, Math.min(580, Math.round((distance - 620) / 1.35))), error: Math.round(Math.max(0, distance - 1450)) } : suggestAim({ terrain: game.terrain, players, shooterId: playerId, origin, target: { ...candidate, ...position }, gravity: game.gravity, wind: game.wind, platforms });
    if (proposed && (!fallback || proposed.error < fallback.suggestion.error)) fallback = { target: candidate, suggestion: proposed };
    if (proposed && proposed.error <= 110) { target = candidate; suggestion = proposed; break; }
  }
  if (!suggestion && fallback) ({ target, suggestion } = fallback);
  if (!suggestion) { clearAimAssist(); toast('Sem trajetória válida; ajuste a mira manualmente.'); return; }
  aimDirection = suggestion.direction; $('#angle').value = suggestion.angle; $('#power').value = suggestion.power; $('#angleValue').textContent = `${suggestion.angle}°`; $('#powerValue').textContent = `${Math.round((suggestion.power - 100) / 4.8)}%`;
  aimAssistTargetId = target.id; aimAssistEstimate = suggestion.error; renderer.aimAssistTargetId = target.id; renderer.aimAssistError = suggestion.error; renderer.setAim({ angle: suggestion.angle, power: suggestion.power, direction: aimDirection }); updateMobileAimReadout();
  $('#aimAssistButton').classList.add('active'); $('#aimAssistButton').classList.toggle('approximate', suggestion.error > 110); $('#aimAssistButton').title = `Alvo: ${target.nickname}. Toque para alternar.`; $('#aimCoach').classList.remove('visible'); audio.ui('confirm'); mobileVibrate(10);
  toast(suggestion.error > 110 ? `Mira aproximada para ${target.nickname}: sem linha livre. Ajuste ou mude de posição.` : `Mira assistida: ${target.nickname} • ${laser ? 'laser' : `desvio estimado ${suggestion.error} px`}. Ajuste antes de disparar.`);
};
updateMobileAimReadout();
updateAimLockButton();
function updateAudioButtons() {
  const ready = audio.isReady();
  $('#soundButton').textContent = audio.enabled ? '♪' : '×';
  $('#soundButton').classList.toggle('muted', !audio.enabled);
  $('#audioTestButton').classList.toggle('active', ready);
  $('#audioTestButton').setAttribute('aria-pressed', String(ready));
  $('#audioTestButton').innerHTML = ready ? `<span aria-hidden="true">♫</span> ${audio.usingMobileAudio() ? 'SOM MOBILE' : 'SOM ON'}` : '<span aria-hidden="true">♫</span> ATIVAR SOM';
}
updateAudioButtons();
$$('[data-audio-volume]').forEach((input) => { input.value = Math.round(audio.volumes[input.dataset.audioVolume] * 100); input.oninput = () => { audio.setVolume(input.dataset.audioVolume, Number(input.value) / 100); if (input.dataset.audioVolume === 'interface') audio.ui('select'); }; });
$('#audioSettingsButton').onclick = () => { $('#audioSettings').hidden = !$('#audioSettings').hidden; audio.ui('open'); };
$('#soundButton').onclick = async () => {
  if (audio.enabled) { audio.ui('cancel'); audio.toggle(); updateAudioButtons(); syncMenuMusic(); toast('Som desativado.'); return; }
  audio.enable(); const ready = await audio.activate(true); updateAudioButtons(); syncMenuMusic(); toast(ready ? 'Som ativado.' : 'Não foi possível ativar o som. Toque novamente.');
};
$('#audioTestButton').onclick = async () => {
  if (!audio.enabled) audio.enable();
  if (audio.volumes.interface === 0 && audio.volumes.effects === 0) { audio.setVolume('interface', .8); audio.setVolume('effects', .8); $$('[data-audio-volume]').forEach((input) => { input.value = Math.round(audio.volumes[input.dataset.audioVolume] * 100); }); }
  const ready = await audio.activate(false);
  updateAudioButtons();
  if (ready && await audio.testOutputVerified()) { syncMenuMusic(); toast(`Teste iniciado em ${audio.usingMobileAudio() ? 'áudio nativo mobile' : 'Web Audio'}. Se não ouvir, confira o volume do aparelho.`); }
  else toast(`Áudio bloqueado (${audio.mobile.lastError || audio.context?.state || 'sem saída'}). Toque novamente.`);
};
function closeAudioPrompt() {
  $('#audioPrompt').hidden = true;
  if (!localStorage.getItem('tankTutorialSeen')) openTutorial();
}
$('#audioPromptEnable').onclick = async () => {
  if (!audio.enabled) audio.enable();
  const ready = await audio.activate(false);
  updateAudioButtons();
  if (ready && await audio.testOutputVerified()) { syncMenuMusic(); closeAudioPrompt(); toast(`Som ativado: ${audio.usingMobileAudio() ? 'modo compatível mobile' : 'Web Audio'}.`); }
  else { $('#audioPromptEnable').textContent = 'TENTAR NOVAMENTE'; toast(`Não foi possível iniciar o áudio (${audio.mobile.lastError || audio.context?.state || 'sem saída'}).`); }
};
$('#audioPromptSkip').onclick = () => { if (audio.enabled) audio.toggle(); updateAudioButtons(); closeAudioPrompt(); };
const resumeAudio = (event) => {
  if (event?.target?.closest?.('#audioTestButton,#audioPrompt')) return;
  audio.activate(true).then((ready) => { updateAudioButtons(); if (ready) syncMenuMusic(); });
};
addEventListener('touchstart', resumeAudio, { capture: true, passive: true });
addEventListener('pointerdown', resumeAudio, { capture: true, passive: true });
addEventListener('keydown', resumeAudio, { capture: true });
addEventListener('pageshow', () => audio.resumeExisting().then(() => { updateAudioButtons(); syncMenuMusic(); }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.resumeExisting().then(() => { updateAudioButtons(); syncMenuMusic(); }); else audio.stopMenuMusic(); });
document.addEventListener('pointerover', (event) => {
  const control = event.target.closest('button,.code,[role="button"]');
  if (!control || control.disabled || control.contains(event.relatedTarget)) return;
  if ($('#gameScreen').classList.contains('active') && !control.closest('.tutorial-modal,.audio-settings')) return;
  audio.hover();
});
document.addEventListener('pointerdown', (event) => {
  const control = event.target.closest('button,.code,[role="button"]');
  if (!control || control.disabled || control.matches('#soundButton,#audioTestButton,#audioPromptEnable,#audioPromptSkip,#fireButton,#moveLeft,#moveRight,#aimLockButton,.weapon,.powerup-chip,[data-arsenal]')) return;
  const kind = control.matches('.primary,#startButton,#arsenalSave,[data-reward]') ? 'confirm' : control.matches('.pickup-close,.tutorial-close,#leaveButton,#backButton,#arsenalClose') ? 'cancel' : control.matches('#tutorialButton,#arsenalButton,.tab') ? 'open' : 'tap';
  audio.ui(kind);
});
document.addEventListener('change', (event) => { if (event.target.matches('select,input[type="checkbox"]')) audio.ui('select'); });
document.addEventListener('input', (event) => { if (!event.target.matches('input[type="range"]')) return; const min = Number(event.target.min) || 0; const max = Number(event.target.max) || 100; audio.slider((Number(event.target.value) - min) / Math.max(1, max - min)); });
document.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.closest('form')) audio.ui('confirm'); });

function updateAimFromPointer(event) {
  const me = game?.players.find((player) => player.id === playerId); if (!me || game.players[game.turnIndex]?.id !== playerId) return;
  if (mobileAimLocked) return { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection };
  clearAimAssist();
  const point = aimGesture?.pointerId === event.pointerId ? { x: (event.clientX - aimGesture.rect.left) * 1280 / aimGesture.rect.width / aimGesture.camera.zoom + aimGesture.camera.x, y: (event.clientY - aimGesture.rect.top) * 720 / aimGesture.rect.height / aimGesture.camera.zoom + aimGesture.camera.y } : renderer.screenToWorld(event.clientX, event.clientY); const origin = renderer.renderPosition(me); const dx = point.x - origin.x; const dy = origin.y - point.y;
  aimDirection = dx < 0 ? -1 : 1;
  const angle = Math.max(aimMinimum(), Math.min(85, Math.round(Math.atan2(dy, Math.max(5, Math.abs(dx))) * 180 / Math.PI)));
  const power = Math.max(100, Math.min(580, Math.round(Math.hypot(dx, dy))));
  $('#angle').value = angle; $('#power').value = power; $('#angleValue').textContent = `${angle}°`; $('#powerValue').textContent = `${Math.round((power - 100) / 4.8)}%`;
  renderer.setAim({ angle, power, direction: aimDirection }); updateMobileAimReadout(); $('#aimCoach').classList.remove('visible');
  return { angle, power, direction: aimDirection };
}
let aimGesture = null;
$('#gameCanvas').addEventListener('pointerdown', (event) => {
  if (renderer.hasAwaitingVerticalShot()) { event.preventDefault(); const token = renderer.activateVerticalShot(); if (token) send(CLIENT.ACTIVATE_VERTICAL, { token }); toast('ATIVAÇÃO VERTICAL!'); return; }
  if (renderer.hasAwaitingClusterShot()) { event.preventDefault(); const token = renderer.activateClusterShot(); if (token) send(CLIENT.ACTIVATE_CLUSTER, { token }); toast('FRAGMENTAÇÃO: 3 MÍSSEIS!'); return; }
  if (game?.players[game.turnIndex]?.id !== playerId) return;
  const me = game.players.find((player) => player.id === playerId);
  const targetedPower = [...equippedPowers(me)].reverse().find((type) => ['lightningStep', 'teleport', 'trickster'].includes(type));
  if (targetedPower) {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    send(CLIENT.USE_POWERUP, { type: targetedPower, x: point.x, y: point.y });
    toast(targetedPower === 'trickster' ? 'Troca Sacana acionada' : targetedPower === 'teleport' ? 'Teleporte acionado' : 'Passo Relâmpago acionado'); return;
  }
  if (me?.airborne && !me.airborne.parachute) { event.preventDefault(); activateJump(); return; }
  if (selectedWeapon === 'jump' && !me?.airborne) { if (!mobileAimLocked) updateAimFromPointer(event); activateJump(); return; }
  if (mobileAimLocked) { toast('Mira travada • pressione ATIRAR'); return; }
  event.preventDefault(); aiming = true; aimGesture = { pointerId: event.pointerId, rect: $('#gameCanvas').getBoundingClientRect(), camera: { ...renderer.camera } }; renderer.beginAimDrag(); $('#gameCanvas').setPointerCapture(event.pointerId); updateAimFromPointer(event);
});
$('#gameCanvas').addEventListener('pointermove', (event) => { if (aiming && aimGesture?.pointerId === event.pointerId) updateAimFromPointer(event); });
$('#gameCanvas').addEventListener('pointerup', (event) => { if (!aiming || aimGesture?.pointerId !== event.pointerId) return; updateAimFromPointer(event); aiming = false; aimGesture = null; renderer.endAimDrag(); localStorage.setItem('tankAimLearned', '1'); toast('Mira ajustada • pressione ATIRAR'); });
$('#gameCanvas').addEventListener('pointercancel', (event) => { if (aimGesture?.pointerId !== event.pointerId) return; aiming = false; aimGesture = null; renderer.endAimDrag(); });
$('#gameCanvas').addEventListener('wheel', (event) => { event.preventDefault(); renderer.adjustZoom(event.deltaY < 0 ? .1 : -.1); }, { passive: false });
$('#zoomOut').onclick = () => renderer.adjustZoom(-.16); $('#zoomIn').onclick = () => renderer.adjustZoom(.16); $('#zoomFit').onclick = () => { renderer.fitWorld(); toast('Mapa completo'); };
$('#inventoryBar').addEventListener('click', (event) => { const button = event.target.closest('[data-powerup]'); if (!button || !game || game.players[game.turnIndex]?.id !== playerId) return; const me = game.players.find((player) => player.id === playerId); if (me?.powerupBlockedTurns > 0) { toast('PANE ELÉTRICA • powerups bloqueados neste turno'); return; } send(CLIENT.SELECT_POWERUP, { type: button.dataset.powerup }); audio.ui('select'); });
$('#weaponSelector').addEventListener('click', (event) => { const button = event.target.closest('.weapon'); if (!button || button.disabled) return; clearAimAssist(); selectedWeapon = button.dataset.weapon; renderer.setMovementMode(selectedWeapon); $$('.weapon').forEach((item) => item.classList.toggle('active', item.dataset.weapon === selectedWeapon)); updateComboPreview(); audio.ui(); });
function updateComboPreview() {
  const me = game?.players.find((player) => player.id === playerId); const preview = $('#comboPreview');
  if (!me || game.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId) { preview.hidden = true; return; }
  const powers = equippedPowers(me).filter((type) => selectedWeapon === 'standard' || supportsWeaponCombo(type, selectedWeapon));
  const weaponName = ARSENAL_DEFS[selectedWeapon]?.name || 'TIRO PADRÃO';
  const passive = classPassiveStatus(me);
  preview.hidden = selectedWeapon === 'standard' && powers.length === 0 && !passive;
  preview.innerHTML = `<small>PRÓXIMA AÇÃO</small><strong>${escapeHtml(weaponName)}</strong>${powers.length ? `<span>+ ${powers.map((type) => escapeHtml(POWERUP_DEFS[type]?.name || type)).join(' + ')}</span>` : ''}${passive ? `<em>${escapeHtml(CLASS_DEFS[me.classType]?.name || 'CLASSE')}: ${escapeHtml(passive)}</em>` : ''}`;
}
function classPassiveStatus(player) {
  if (!player?.classType) return '';
  const round = game?.roundNumber || 1; const safe = round - (player.lastDamageRound || 0);
  if (player.classType === 'armored') return `${Math.min(2, safe)}/2 rodadas sem dano • escudo na rodada ${round % 2 ? round + 1 : round + 2}`;
  if (player.classType === 'attacker') return 'tiros perfurantes • bônus de dano por vida máxima';
  if (player.classType === 'bomber') return 'explosões ampliadas • resistência ativa';
  if (player.classType === 'healer') return 'cura 5 HP por turno global';
  if (player.classType === 'meteorologist') return 'para-raios e proteção contra eventos';
  if (player.classType === 'ninja') return `${Math.min(2, safe)}/2 rodadas até invisibilidade`;
  if (player.classType === 'saboteur') return `Tesla na rodada ${round % 2 ? round + 1 : round + 2} • onda na rodada ${round + (3 - round % 3)}`;
  return 'compartilha powerups • arsenal +1 por rodada';
}
addEventListener('keydown', (e) => {
  if (!game || game.phase !== 'playing') return;
  if ((e.key === 't' || e.key === 'T') && document.activeElement !== $('#chatInput')) { e.preventDefault(); $('#chatPanel').classList.add('open'); $('#chatInput').focus(); return; }
  if (document.activeElement === $('#chatInput')) { if (e.key === 'Escape') { $('#chatInput').blur(); $('#chatPanel').classList.remove('open'); } return; }
  if (e.key === 'Enter' && (selectedWeapon === 'jump' || game.players.find((player) => player.id === playerId)?.airborne)) { e.preventDefault(); activateJump(); return; }
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) { if (!e.repeat) movementSound(); send(CLIENT.MOVE, movementPayload(-1)); } if (['ArrowRight', 'd', 'D'].includes(e.key)) { if (!e.repeat) movementSound(); send(CLIENT.MOVE, movementPayload(1)); } if (e.code === 'Space') { e.preventDefault(); if (renderer.hasAwaitingVerticalShot()) { const token = renderer.activateVerticalShot(); if (token) send(CLIENT.ACTIVATE_VERTICAL, { token }); toast('ATIVAÇÃO VERTICAL!'); } else if (renderer.hasAwaitingClusterShot()) { const token = renderer.activateClusterShot(); if (token) send(CLIENT.ACTIVATE_CLUSTER, { token }); toast('FRAGMENTAÇÃO: 3 MÍSSEIS!'); } else if (game.players.find((player) => player.id === playerId)?.airborne) activateJump(); else $('#fireButton').click(); }
});

const tutorialSteps = [
  { icon: '♛', title: 'Seja o último tanque', text: 'Todo o campo é formado por microblocos. Explosões arrancam blocos do terreno, empurram tanques e podem abrir uma queda fatal.', tip: 'Tanques, bots e jogadores seguem exatamente as mesmas regras físicas.' },
  { icon: '▣', title: 'Crie sua sala', text: 'Na tela inicial, abra CRIAR SALA. Escolha codinome, quantidade de jogadores e bots, dificuldade da IA, bioma, vida, duração do turno, rodadas e modo. Você também pode ligar ou desligar classes, eventos e powerups.', tip: 'Toque em CRIAR CAMPO DE BATALHA. Use PARTIDA RÁPIDA para preencher uma configuração simples com um bot.' },
  { icon: '⌘', title: 'Convide amigos online', text: 'Na sala, toque no CÓDIGO para copiá-lo e envie o código junto com o endereço do jogo. Seus amigos abrem o mesmo site, escolhem ENTRAR, digitam codinome e código. O anfitrião inicia quando todos estiverem prontos.', tip: 'Todos precisam usar o mesmo servidor. É possível entrar como espectador pelo botão ASSISTIR. Uma sala precisa de pelo menos dois tanques, incluindo bots.' },
  { icon: '◇◆', title: 'Escolha um modo', text: 'Cada um por si: cada tanque luta pela própria vitória. Coop: humanos enfrentam bots juntos. VS Equipes: tanques são distribuídos entre dois a quatro times. O anfitrião escolhe o modo antes de criar a sala.', tip: 'No Coop é necessário incluir pelo menos um bot. Em modos de equipe, aliados não recebem dano dos companheiros.' },
  { icon: '♨', title: 'Modos com objetivos', text: 'Rei da Colina: ocupe sozinho a zona dourada para pontuar. Domínio por Equipes: aliados dividem os pontos da colina. Sobrevivência: a lava sobe a cada rodada e elimina quem for alcançado.', tip: 'Na colina, o objetivo é chegar a quatro pontos. No Sobrevivência, olhe a previsão da próxima maré antes de se mover.' },
  { icon: '◆', title: 'Classe antes do arsenal', text: 'Ao começar uma partida com classes, você tem 10 segundos para escolher sua passiva. Depois aparecem mais 10 segundos exclusivos para escolher as três cartas do arsenal.', tip: 'A classe de cada tanque aparece sobre seu indicador de posição e no placar. Salas sem classes pulam a primeira etapa.' },
  { icon: '↻', title: 'Entenda seu turno', text: 'Em cada turno você pode mover e atirar, ou usar dois movimentos. O cronômetro encerra o turno automaticamente quando chega a zero.', tip: 'A moldura verde e a seta mostram qual tanque está ativo.' },
  { icon: '◀ ▶', title: 'Escolha sua posição', text: 'Use A/D, as setas do teclado ou os botões na tela. O tanque acompanha subidas e descidas suaves, mas para diante de paredes muito íngremes.', tip: 'Plataformas com luz azul e a marca MÓVEL se deslocam e carregam o tanque que estiver apoiado nelas.' },
  { icon: '⌁', title: 'Controle a mira', text: 'Toque e arraste diretamente no campo, no celular ou desktop. O lado define a direção, a altura define o ângulo e a distância define a força. A câmera abre o enquadramento quando a trajetória precisa de mais espaço.', tip: 'A mira preserva direção, ângulo e força do seu último tiro. TRAVAR MIRA protege os três valores contra toques acidentais.' },
  { icon: '✦', title: 'Combine seu arsenal', text: 'Você pode equipar vários powerups no mesmo turno. Dupla e Tripla multiplicam projéteis; Espelho repete a rajada inteira; Mega, Zeus, Fogos, gelo, choque, fogo e outros efeitos funcionam juntos.', tip: 'Toque novamente numa carta equipada para removê-la do combo antes de atirar.' },
  { icon: '▧', title: 'Encontre e use poderes', text: 'As três cartas do arsenal são escolhidas antes da partida e aparecem perto do botão ATIRAR. Powerups extras ficam enterrados: tiros e explosões os revelam, e balas, explosões ou tanques podem coletá-los. Os coletados aparecem no inventário do HUD.', tip: 'Toque em uma ou mais cartas do inventário para equipar efeitos no próximo disparo. Abra a BIBLIOTECA na tela inicial para ver todas as cartas, danos e eventos.' },
  { icon: '✹', title: 'Disparos de duas etapas', text: 'A Fragmentária lança uma cápsula violeta. Enquanto ela voa, toque no cenário, aperte ATIRAR ou Espaço novamente para soltá-la em três mísseis. A Carga Sísmica marca o solo vermelho e detona após 2 segundos.', tip: `Exclusivo do Atacante: o Mega Canhão aparece automaticamente ao acumular ${MEGA_CANNON_CHARGE} pontos de destruição. Cada eliminação rende 250 pontos para a classe.` },
  { icon: '⚡', title: 'Domine os combos de movimento', text: 'Depois do Pulo, selecione a Investida Blindada ou equipe a Arrancada Foguete e use uma seta para ganhar outro impulso no ar.', tip: 'Pulo + Investida + Arrancada gera o impulso máximo e ainda permite atirar durante o voo.' },
  { icon: '⚙', title: 'Pontue destruindo', text: 'Microblocos, barris, plataformas, concreto, prédios, guindastes e tanques concedem pontuações diferentes ao responsável pela destruição.', tip: 'O contador DESTRUIÇÃO mostra sua pontuação e pisca sempre que um novo objeto é destruído.' },
  { icon: '⌁', title: 'A arena evolui', text: 'A cada três turnos ocorre um evento. Helicópteros entregam suprimentos, miras anunciam bombardeios, raios bloqueiam powerups e fossos podem entrar em erupção.', tip: 'Observe as marcações no terreno: todo evento mostra onde e quando seu efeito acontecerá.' },
  { icon: '◇◆', title: 'Coop ou VS Equipes', text: 'COOP une os humanos contra os bots. VS EQUIPES distribui jogadores e bots automaticamente entre 2, 3 ou 4 times balanceados.', tip: 'Aliados não recebem seus danos. A equipe vence quando é a última com pelo menos um tanque vivo.' },
  { icon: '↑', title: 'Evolua sua classe', text: 'Nos marcos de um terço e dois terços da partida, quem usa classe escolhe um bônus permanente: +30 de vida máxima e cura imediata, ou +6 de dano em cada acerto contra inimigos. É possível repetir a escolha.', tip: 'A evolução aparece no centro da arena e pode ser selecionada mesmo fora do seu turno.' },
  { icon: '♨', title: 'Sobreviva à maré de lava', text: 'No modo Sobrevivência, a lava sobe ao começo de cada rodada e destrói qualquer tanque que toque nela. A subida acelera perto do fim.', tip: 'Observe a previsão do próximo nível no HUD e procure plataformas altas antes da rodada virar.' },
  { icon: '◆', title: 'Domine em equipe', text: 'No modo Domínio por Equipes, aliados somam um ponto por rodada quando ocupam a colina sem inimigos. Vence a primeira equipe com quatro pontos ou a última sobrevivente.', tip: 'Dois aliados juntos ainda rendem um ponto; um rival na zona contesta a captura.' },
  { icon: '◎', title: 'Assistência de mira no celular', text: 'Toque em ASSIST para calcular um ângulo e uma força sugeridos até o inimigo mais próximo. Toque outra vez para alternar o alvo. A prévia já considera vento e obstáculos.', tip: 'É uma sugestão para o projétil básico: tanques móveis e poderes especiais podem mudar o impacto. Arraste no campo para corrigir antes de atirar.' },
  { icon: '✓', title: 'Fim de partida e revanche', text: 'A partida termina quando restar um tanque ou equipe, ou quando acabar o limite de rodadas. A tela final mostra o resultado e permite uma revanche. O anfitrião também pode reiniciar a partida para todos.', tip: 'Uma rodada termina depois que todos os tanques vivos jogam. A partida espera tiros, explosões e eventos terminarem antes de avançar.' },
];
let tutorialStep = 0;
function renderTutorial() {
  const step = tutorialSteps[tutorialStep];
  $('#tutorialNumber').textContent = String(tutorialStep + 1).padStart(2, '0'); $('#tutorialIcon').textContent = step.icon; $('#tutorialTitle').textContent = step.title; $('#tutorialText').textContent = step.text; $('#tutorialTip').textContent = `DICA: ${step.tip}`;
  $('#tutorialDots').innerHTML = tutorialSteps.map((_, i) => `<button aria-label="Etapa ${i + 1}" class="${i === tutorialStep ? 'active' : ''}" data-step="${i}"></button>`).join('');
  $$('#tutorialDots button').forEach((button) => button.onclick = () => { tutorialStep = Number(button.dataset.step); renderTutorial(); });
  $('#tutorialPrev').disabled = tutorialStep === 0; $('#tutorialNext').textContent = tutorialStep === tutorialSteps.length - 1 ? 'COMEÇAR ✓' : 'PRÓXIMO →';
}
function openTutorial() { tutorialStep = 0; renderTutorial(); $('#tutorialModal').hidden = false; document.body.classList.add('modal-open'); }
function closeTutorial() { $('#tutorialModal').hidden = true; document.body.classList.remove('modal-open'); localStorage.setItem('tankTutorialSeen', '1'); }
$('#tutorialButton').onclick = openTutorial; $('#tutorialClose').onclick = closeTutorial; $('#tutorialPrev').onclick = () => { tutorialStep = Math.max(0, tutorialStep - 1); renderTutorial(); };
$('#tutorialNext').onclick = () => { if (tutorialStep === tutorialSteps.length - 1) closeTutorial(); else { tutorialStep += 1; renderTutorial(); } };
$('#tutorialModal').onclick = (event) => { if (event.target === $('#tutorialModal')) closeTutorial(); };
addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#tutorialModal').hidden) closeTutorial(); });
setTimeout(() => { $('#audioPrompt').hidden = false; $('#audioPromptEnable').focus(); }, 300);

let librarySection = 'powerups'; const libraryCompared = [];
function cardArtwork(type, section, frameClass) { return `<span class="${frameClass}" aria-hidden="true"><i class="atlas-art atlas-${section} art-${type}" style="${atlasStyle(type, section)}"></i></span>`; }
function libraryArt(type, section) { return cardArtwork(type, section, 'library-art'); }
function renderLibraryComparison() {
  const panel = $('#libraryCompare'); panel.hidden = libraryCompared.length === 0;
  panel.innerHTML = libraryCompared.map(({ section, type }) => { const info = CARD_SECTIONS[section][type]; return `<div style="--item:${info.color}"><small>${CARD_ROLE_LABELS[cardRole(type)]} • ${cardActivation(type, section)}</small><strong>${escapeHtml(info.name)}</strong><span>${escapeHtml(section === 'classes' ? classProgressionDescription(info) : combatDescription(type, info))}</span></div>`; }).join('');
}
function renderLibrary() {
  const definitions = CARD_SECTIONS[librarySection]; const role = $('#libraryRole').value; const query = $('#librarySearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const entries = Object.entries(definitions).filter(([type, info]) => (role === 'all' || cardRole(type) === role) && (!query || searchableCard(type, info).includes(query)));
  $('#libraryGrid').innerHTML = entries.length ? entries.map(([type, info]) => { const damage = cardDamage(type); const combo = cardCombo(type); const key = `${librarySection}:${type}`; const selected = libraryCompared.some((entry) => `${entry.section}:${entry.type}` === key); const description = librarySection === 'classes' ? classProgressionDescription(info) : librarySection === 'powerups' || librarySection === 'arsenal' ? combatDescription(type, info) : info.description; return `<article class="library-card" style="--item:${info.color}">${libraryArt(type, librarySection)}<small>${librarySection === 'classes' ? 'PASSIVA PERMANENTE' : librarySection === 'events' ? 'EVENTO DE ARENA' : librarySection === 'arsenal' ? (info.kind === 'movement' ? 'MOVIMENTO' : 'TIRO ESPECIAL') : 'POWERUP'} • ${CARD_ROLE_LABELS[cardRole(type)]}</small><h3>${escapeHtml(info.name)}</h3><div class="library-metrics"><span>${cardActivation(type, librarySection)}</span>${damage ? `<span>${damage}</span>` : ''}${combo ? `<span>${combo}</span>` : ''}</div><p>${escapeHtml(description)}</p><button class="library-compare-button${selected ? ' selected' : ''}" type="button" data-compare="${type}" aria-pressed="${selected}">${selected ? '✓ NA COMPARAÇÃO' : '+ COMPARAR'}</button></article>`; }).join('') : '<p class="library-empty">Nenhuma carta encontrada.</p>';
  renderLibraryComparison();
  $$('#libraryTabs button').forEach((button) => button.classList.toggle('active', button.dataset.library === librarySection));
}
function openLibrary() { librarySection = 'powerups'; renderLibrary(); $('#libraryModal').hidden = false; document.body.classList.add('modal-open'); audio.ui(); }
function closeLibrary() { $('#libraryModal').hidden = true; document.body.classList.remove('modal-open'); }
$('#libraryButton').onclick = openLibrary; $('#libraryClose').onclick = closeLibrary; $('#libraryTabs').onclick = (event) => { const button = event.target.closest('[data-library]'); if (!button) return; librarySection = button.dataset.library; renderLibrary(); audio.ui(); };
$('#librarySearch').oninput = renderLibrary; $('#libraryRole').onchange = renderLibrary;
$('#libraryGrid').onclick = (event) => { const button = event.target.closest('[data-compare]'); if (!button) return; const type = button.dataset.compare; const index = libraryCompared.findIndex((entry) => entry.section === librarySection && entry.type === type); if (index >= 0) libraryCompared.splice(index, 1); else { if (libraryCompared.length === 2) libraryCompared.shift(); libraryCompared.push({ section: librarySection, type }); } renderLibrary(); audio.ui('select'); };
$('#libraryModal').onclick = (event) => { if (event.target === $('#libraryModal')) closeLibrary(); };
addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#libraryModal').hidden) closeLibrary(); });

net.on('status', ({ online }) => { $('.status').classList.toggle('online', online); $('#connectionText').textContent = online ? 'servidor online' : 'reconectando'; if (online && room && sessionStorage.getItem('tankToken')) send(CLIENT.JOIN_ROOM, { code: room.code, token: sessionStorage.getItem('tankToken') }); else if (online && room && sessionStorage.getItem('tankSpectatorToken')) send(CLIENT.WATCH_ROOM, { code: room.code, token: sessionStorage.getItem('tankSpectatorToken') }); });
net.on(SERVER.WELCOME, (data) => { if (data.playerId) { spectatorMode = false; playerId = data.playerId; renderer.setPlayer(playerId); sessionStorage.setItem('tankPlayerId', data.playerId); sessionStorage.setItem('tankToken', data.token); } else if (data.spectator) { spectatorMode = true; playerId = null; renderer.setPlayer(null); sessionStorage.removeItem('tankPlayerId'); sessionStorage.removeItem('tankToken'); sessionStorage.setItem('tankSpectatorToken', data.token); document.body.classList.add('spectating'); $('#spectatorBadge').hidden = false; } });
net.on(SERVER.ERROR, ({ message }) => toast(message));
net.on(SERVER.CHAT, (message) => { chatHistory.push(message); if (chatHistory.length > 40) chatHistory.shift(); $('#chatMessages').innerHTML = chatHistory.map((entry) => `<div><b style="color:${entry.color}">${escapeHtml(entry.nickname)}</b><span>${escapeHtml(entry.text)}</span></div>`).join(''); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; $('#chatPanel').classList.add('has-message'); setTimeout(() => $('#chatPanel').classList.remove('has-message'), 5000); });
net.on(SERVER.ROOM_STATE, (state) => { room = state; sessionStorage.setItem('tankRoomCode', state.code); renderRoom(); if (state.phase === 'lobby') screen('roomScreen'); });
net.on(SERVER.GAME_STATE, (state) => {
  if (combatSeed !== state.seed) { combatSeed = state.seed; combatEntries.length = 0; deferredPickup = null; $('#combatFeedEntries').innerHTML = ''; }
  if (Number.isFinite(state.serverTime)) serverClockOffset = state.serverTime - Date.now();
  const before = game?.players.find((player) => player.id === playerId); const after = state.players.find((player) => player.id === playerId);
  const previousLavaRiseSerial = game?.survival?.lastRise?.serial;
  if (game) for (const nextPlayer of state.players) { const previousPlayer = game.players.find((entry) => entry.id === nextPlayer.id); if (!previousPlayer) continue; if (nextPlayer.health < previousPlayer.health && nextPlayer.alive) audio.damage(previousPlayer.health - nextPlayer.health); if (previousPlayer.alive && !nextPlayer.alive) { audio.destroyed(); addCombatEntry(`${nextPlayer.nickname} foi eliminado`, 'danger'); } if (nextPlayer.health > previousPlayer.health && nextPlayer.regenTurns >= 0) audio.status('heal'); if ((nextPlayer.frozenTurns || 0) > (previousPlayer.frozenTurns || 0)) audio.status('freeze'); }
  if (before && after && after.health < before.health) mobileVibrate(after.alive ? [18, 25, 22] : [45, 30, 70, 35, 100]);
  if (before && after && (after.stats?.destruction || 0) > (before.stats?.destruction || 0)) { const gain = (after.stats?.destruction || 0) - (before.stats?.destruction || 0); const type = after.lastDestruction?.type; $('#destructionRecent').textContent = `+${gain} ${DESTRUCTION_LABELS[type] || ''}`; $('#destructionCard').classList.remove('bump'); void $('#destructionCard').offsetWidth; $('#destructionCard').classList.add('bump'); clearTimeout(destructionTimer); destructionTimer = setTimeout(() => { $('#destructionRecent').textContent = ''; $('#destructionCard').classList.remove('bump'); }, 2200); mobileVibrate([8, 24, 12]); }
  if (before && after && after.lastPickup?.serial && after.lastPickup.serial !== before.lastPickup?.serial) { const pickup = { type: after.lastPickup.type, player: structuredClone(after) }; mobileVibrate([10, 35, 15]); renderer.spawnPickupEffect(after, pickup.type); renderer.whenBattleAnimationsComplete(() => { audio.pickup(pickup.type); showPickup(pickup.type, pickup.player); }); }
  if (before && after?.lastLaunch?.serial && after.lastLaunch.serial !== before.lastLaunch?.serial) { if (after.lastLaunch.kind === 'armoredDash') { audio.armoredDash(after.lastLaunch.wallsDestroyed || 0, after.lastLaunch.hitPlayerIds?.length || 0); mobileVibrate([22, 14, 34, 12, 58]); } else audio.launch(after.lastLaunch.kind || 'jump'); }
  if (game) for (const nextPlayer of state.players) { const previous = game.players.find((player) => player.id === nextPlayer.id); if (!previous) continue; if (nextPlayer.lastMove?.serial && nextPlayer.lastMove.serial !== previous.lastMove?.serial) { if (nextPlayer.lastMove.kind === 'excavator') audio.power('excavator'); else if (nextPlayer.lastMove.kind === 'rocketDash') audio.launch('rocketDash'); else audio.move('tracks'); } if (nextPlayer.lastJump?.serial && nextPlayer.lastJump.serial !== previous.lastJump?.serial) audio.launch(nextPlayer.lastJump.kind); }
  if (before && after?.lastAirBoost?.serial && after.lastAirBoost.serial !== before.lastAirBoost?.serial) { audio.launch(after.lastAirBoost.kind); mobileVibrate(after.lastAirBoost.kind === 'doubleDash' ? [22, 18, 38, 18, 60] : [18, 16, 38]); }
  if (before && after?.lastBlink?.serial && after.lastBlink.serial !== before.lastBlink?.serial) { audio.teleport(0); renderer.spawnTeleport(after.lastBlink); }
  const arenaEvent = state.events?.at(-1); const arenaEventKey = arenaEvent ? `${arenaEvent.id}:${arenaEvent.warning ? 'warning' : 'impact'}` : null;
  const newArenaEvent = Boolean(arenaEvent && arenaEventKey !== lastArenaEventKey);
  game = state; renderer.setGame(state, { deferWorld: newArenaEvent && !arenaEvent.warning }); renderRewardOffer(); renderClassEvolution();
  if (state.survival?.lastRise?.serial !== previousLavaRiseSerial && state.survival?.lastRise?.from > state.survival?.lastRise?.to) showSurvivalRise(state.survival.lastRise);
  if (arenaEvent && arenaEventKey !== lastArenaEventKey) { lastArenaEventKey = arenaEventKey; renderer.playArenaEvent(arenaEvent, gameNow()); audio.arena(arenaEvent.type, arenaEvent.warning); mobileVibrate(arenaEvent.warning ? [12, 80, 12] : arenaEvent.type === 'lightning' ? [18, 18, 18, 18, 55] : [35, 28, 75]); showArenaAlert(arenaEvent); addCombatEntry(`${arenaEvent.warning ? 'Atenção' : 'Impacto'}: ${EVENT_DEFS[arenaEvent.type]?.name || arenaEvent.type}`, arenaEvent.warning ? 'warning' : 'danger'); }
  const sequence = ++resultSequence;
  if (state.phase === 'finished') { screen('gameScreen'); renderHud(); renderer.whenBattleAnimationsComplete(() => { if (sequence === resultSequence && game?.phase === 'finished') renderResult(); }); }
  else if (state.phase === 'class' || state.phase === 'arsenal') { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; const stage = state.phase; const saved = stage === 'class' ? savedClassSeed : savedArsenalSeed; if (!spectatorMode && saved !== state.seed) { if ($('#arsenalModal').hidden || $('#arsenalModal').dataset.stage !== stage || $('#arsenalModal').dataset.timed !== 'true') openArsenal(true, stage); } else { $('#arsenalModal').hidden = true; renderHud(); } }
  else if (state.phase === 'roulette') { resultSoundPlayed = false; screen('gameScreen'); $('#arsenalModal').hidden = true; renderRoulette(state); }
  else { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; clearInterval(rouletteTimer); renderHud(); }
});

function showArenaAlert(event) {
  if (!$('#rewardModal').hidden || !$('#classEvolutionModal').hidden || $('#pickupReveal').classList.contains('show')) return;
  const names = { supply: 'SUPRIMENTOS AÉREOS', quake: 'ABALO DA ARENA', bombardment: 'BOMBARDEIO PROGRESSIVO', lightning: 'TEMPESTADE ELÉTRICA', collapse: 'COLAPSO DO CENÁRIO', tectonic: 'EVENTO TECTÔNICO', luckyWinds: 'VENTOS DE SORTE', gale: 'VENDAVAL', eruption: 'ERUPÇÃO VULCÂNICA' };
  const details = { supply: `Helicóptero em aproximação • ${event.lootboxChance || 0}% de chance de Lootbox.`, quake: 'O solo irá se romper em pontos marcados.', bombardment: 'Miras confirmadas. Cada projétil seguinte terá uma explosão maior.', lightning: 'A descarga causa dano e bloqueia powerups por um turno.', collapse: 'Partes instáveis do terreno serão destruídas.', tectonic: 'O terremoto remodelará o solo e deslocará todos os tanques.', luckyWinds: 'Zonas douradas recuperarão 40 HP dos tanques em seu interior.', gale: `A ventania empurrará todos os tanques para ${event.windDirection > 0 ? 'a direita' : 'a esquerda'}.`, eruption: 'Bolas de fogo sobem dos fossos, colidem com a arena e deixam áreas incendiadas.' };
  const warningSeconds = event.executeAt ? Math.max(1, Math.ceil((event.executeAt - gameNow()) / 1000)) : 3; const prefix = event.type === 'supply' && event.warning ? `◆ CHEGADA EM ${warningSeconds}s • ` : event.type === 'luckyWinds' && event.warning ? `✦ AURA EM ${warningSeconds}s • ` : event.type === 'eruption' && event.warning ? `♨ ERUPÇÃO EM ${warningSeconds}s • ` : event.warning ? `⚠ IMPACTO EM ${warningSeconds}s • ` : '◆ EFEITO • '; const targetCount = event.warning && event.impacts?.length ? ` ${event.impacts.length} áreas marcadas.` : event.warning && event.drops?.length ? ` ${event.drops.length} cargas previstas.` : ''; $('#arenaAlertTitle').textContent = `${prefix}${names[event.type] || 'EVENTO'}`; $('#arenaAlertDetail').textContent = `${details[event.type] || event.label}${targetCount}`; const alert = $('#arenaAlert'); alert.classList.toggle('impact', !event.warning); alert.classList.toggle('lucky', event.type === 'luckyWinds'); alert.classList.toggle('eruption', event.type === 'eruption'); alert.classList.remove('show'); void alert.offsetWidth; alert.classList.add('show'); clearTimeout(arenaAlertTimer); arenaAlertTimer = setTimeout(() => alert.classList.remove('show'), event.warning ? warningSeconds * 1000 : 2800);
}
function showSurvivalRise(rise) {
  audio.arena('eruption', false); mobileVibrate([26, 20, 40]); addCombatEntry(`Maré de lava: nível ${rise.to}`, 'danger');
  if (!$('#rewardModal').hidden || !$('#classEvolutionModal').hidden || $('#pickupReveal').classList.contains('show')) return;
  $('#arenaAlertTitle').textContent = `♨ MARÉ DE LAVA • RODADA ${rise.round}`;
  $('#arenaAlertDetail').textContent = `A lava subiu ${rise.from - rise.to} blocos. Próxima maré prevista: ${game.survival?.nextLevel ?? '—'}.`;
  const alert = $('#arenaAlert'); alert.classList.add('eruption', 'impact'); alert.classList.remove('lucky', 'show'); void alert.offsetWidth; alert.classList.add('show');
  clearTimeout(arenaAlertTimer); arenaAlertTimer = setTimeout(() => alert.classList.remove('show'), 2600);
}
net.on(SERVER.SHOT_RESULT, (result) => {
  renderer.playShot(result); const first = result.results?.[0]; const flight = renderer.shotDuration(result);
  if (result.detonation) { audio.detonation(first?.weapon); return; }
  if (result.replaceCluster) { clearTimeout(clusterImpactTimer); clusterImpactTimer = null; audio.clusterSplit(); const impact = Math.min(...(result.results || []).filter((shot) => shot.impact).map((shot) => shot.path.length / SHOT_PATH_RATE / (game?.speed || 1))); if (Number.isFinite(impact)) audio.shoot(impact, 'cluster', result.results.some((shot) => shot.damage?.some((hit) => hit.amount > 0)) ? 1 : 0, { ...first, hasImpact: true }); return; }
  const shotTime = (shot) => Math.max(.08, (shot.path.length - (result.replaceVertical ? shot.activationIndex || 0 : 0)) / SHOT_PATH_RATE / (game?.speed || 1) / (shot.canActivateCluster ? CLUSTER_CAPSULE_SPEED : 1) + (shot.mirrorDelay || 0));
  const impacts = (result.results || []).filter((shot) => shot.impact);
  const audibleImpact = impacts.sort((a, b) => shotTime(a) - shotTime(b))[0]; const impactAt = audibleImpact ? shotTime(audibleImpact) : flight;
  const shooter = game?.players.find((player) => player.id === result.shooterId); const hitTotals = new Map(); for (const shot of result.results || []) for (const hit of shot.damage || []) if (hit.amount > 0) hitTotals.set(hit.playerId, (hitTotals.get(hit.playerId) || 0) + hit.amount);
  const summary = [...hitTotals].map(([id, amount]) => `${game?.players.find((player) => player.id === id)?.nickname || 'tanque'} −${amount} HP`).join(' • ');
  addCombatEntry(`${first?.concealed ? 'Disparo oculto' : shooter?.nickname || 'Tanque'}: ${ARSENAL_DEFS[first?.weapon]?.name || 'TIRO PADRÃO'}${summary ? ` • ${summary}` : ' • sem dano'}`, summary ? 'hit' : 'neutral');
  const hits = result.results?.reduce((sum, shot) => sum + shot.damage.filter((entry) => entry.amount > 0).length, 0) || 0;
  if (!first?.concealed) { if (result.replaceVertical) audio.vertical(impactAt, hits, Boolean(audibleImpact)); else audio.shoot(impactAt, first?.weapon || 'standard', hits, { ...first, hasImpact: Boolean(audibleImpact) && !first?.delayedStrike && !first?.canActivateCluster }); if (first?.canActivateCluster && audibleImpact) { clearTimeout(clusterImpactTimer); clusterImpactTimer = setTimeout(() => { audio.clusterImpact(); clusterImpactTimer = null; }, impactAt * 1000); } }
  const teleportedShot = result.results?.find((shot) => shot.teleport); if (teleportedShot && !teleportedShot.concealed) audio.teleport(shotTime(teleportedShot));
  const scenarioShot = result.results?.find((shot) => shot.interactions?.length && !shot.concealed); if (scenarioShot) { const interaction = scenarioShot.interactions.find((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y)); const nearest = interaction && scenarioShot.path.reduce((best, point, index) => { const distance = Math.hypot(point.x - interaction.x, point.y - interaction.y); return distance < best.distance ? { distance, index } : best; }, { distance: Infinity, index: 0 }); audio.scenario(nearest ? Math.max(0, nearest.index / SHOT_PATH_RATE / (game?.speed || 1) + (scenarioShot.mirrorDelay || 0)) : shotTime(scenarioShot)); }
  if (audibleImpact) setTimeout(() => mobileVibrate(first?.megaMissile ? [45, 25, 100, 35, 130] : [24, 20, 55]), Math.max(0, impactAt * 1000 - 80));
  clearTimeout(focusTimer); $('#gameScreen').classList.add('focus'); focusTimer = setTimeout(() => $('#gameScreen').classList.remove('focus'), (flight + .85) * 1000);
});

function renderRoom() {
  $('#roomName').textContent = room.name; $('#roomCode').textContent = room.code; $('#playerCount').textContent = `${room.players.length} / ${room.rules.maxPlayers}`;
  $('#roster').innerHTML = room.players.map((p) => `<div class="player-card ${p.isBot ? 'bot' : ''}" style="--color:${p.color}"><span class="tank-avatar"></span><div><strong>${escapeHtml(p.nickname)}</strong><small>${p.id === room.hostId ? '★ ANFITRIÃO' : p.isBot ? `◆ BOT • ${({ aggressive: 'AGRESSIVO', collector: 'COLETOR', defensive: 'DEFENSIVO', demolisher: 'DEMOLIDOR', support: 'SUPORTE' })[p.personality] || 'IA'}` : p.connected ? 'PRONTO' : 'DESCONECTADO'}${room.rules.classesEnabled && p.classType ? ` • ${CLASS_DEFS[p.classType]?.name || ''}` : ''}</small></div></div>`).join('');
  const labels = { gameMode: 'Modo', teamCount: 'Equipes', maxPlayers: 'Jogadores', botCount: 'Bots', botDifficulty: 'Dificuldade IA', health: 'Vida inicial', turnSeconds: 'Tempo de turno', gameSpeed: 'Velocidade', roundLimit: 'Limite de rodadas', mapType: 'Bioma', seed: 'Semente', powerupCount: 'Powerups', classesEnabled: 'Classes', enabledEvents: 'Eventos', enabledPowerups: 'Tipos de powerup', mines: 'Minas', gravity: 'Gravidade' };
  const difficultyNames = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };
  $('#rulesList').innerHTML = Object.entries(labels).filter(([key]) => key !== 'teamCount' || ['teams', 'teamHill'].includes(room.rules.gameMode)).map(([key, label]) => `<div><dt>${label}</dt><dd>${room.rules[key] === true ? 'ATIVADAS' : room.rules[key] === false ? 'DESATIVADAS' : Array.isArray(room.rules[key]) ? `${room.rules[key].length} HABILITADOS` : key === 'seed' && !room.rules.seed ? 'ALEATÓRIA' : key === 'mapType' ? BIOMES[room.rules.mapType]?.name || 'ALEATÓRIO' : key === 'botDifficulty' ? difficultyNames[room.rules[key]] : key === 'gameMode' ? ({ coop: 'COOP', teams: 'VS EQUIPES', teamHill: 'DOMÍNIO POR EQUIPES', ffa: 'CADA UM POR SI', hill: 'REI DA COLINA', survival: 'SOBREVIVÊNCIA' }[room.rules[key]]) : key === 'teamCount' ? `${room.rules[key]} EQUIPES` : escapeHtml(String(room.rules[key]))}</dd></div>`).join('');
  const host = playerId === room.hostId; $('#startButton').hidden = !host; $('#restartButton').hidden = !host || room.phase === 'lobby'; $('#waitingMessage').hidden = host; $('#waitingMessage').textContent = spectatorMode ? `◉ ASSISTINDO • ${room.spectatorCount || 1} ESPECTADOR(ES)` : 'Aguardando o anfitrião...'; $('#startButton').disabled = room.players.length < 2;
  const me = room.players.find((player) => player.id === playerId); $('#arsenalButton').hidden = spectatorMode; $('#arsenalButton').textContent = `${room.rules.classesEnabled ? `CLASSE ${CLASS_DEFS[me?.classType]?.short || '—'} → ` : ''}ARSENAL: ${(me?.arsenal || []).map((type) => ARSENAL_DEFS[type]?.short).join(' • ')}`; $('#spectatorBadge').hidden = !spectatorMode;
}

function showPreparationStage(stage, timed) {
  const classesEnabled = room?.rules?.classesEnabled !== false; const classStage = stage === 'class' && classesEnabled;
  $('#arsenalModal').dataset.stage = classStage ? 'class' : 'arsenal'; $('#arsenalModal').dataset.timed = String(timed);
  $('#classConfig').hidden = !classStage; $('#arsenalLoadout').hidden = classStage;
  $('#arsenalStep').textContent = classStage ? 'ETAPA 1/2 • CLASSE' : classesEnabled ? 'ETAPA 2/2 • ARSENAL' : 'ARSENAL';
  $('#arsenalTitle').firstChild.textContent = classStage ? 'ESCOLHA SUA CLASSE ' : 'MONTE SEU ARSENAL ';
  $('#arsenalBack').hidden = timed || !classesEnabled;
  $('#arsenalCountdown').textContent = timed ? Math.max(0, Math.ceil(((classStage ? game.classEndsAt : game.arsenalEndsAt) - gameNow()) / 1000)) : '';
}
function openArsenal(timed = false, stage = room?.rules?.classesEnabled === false ? 'arsenal' : 'class') {
  const player = (timed ? game?.players : room?.players)?.find((entry) => entry.id === playerId); const selected = new Set(player?.arsenal || []); const offered = new Set(player?.arsenalOffer || Object.keys(ARSENAL_DEFS));
  const classesEnabled = room?.rules?.classesEnabled !== false;
  if (classesEnabled) { const selectedClass = player?.classType || 'armored'; $('#classCatalog').innerHTML = Object.entries(CLASS_DEFS).map(([type, info]) => `<button data-class-type="${type}" class="class-card ${selectedClass === type ? 'selected' : ''}" style="--item:${info.color}"><i class="class-art atlas-art atlas-classes" style="${atlasStyle(type, 'classes')}" aria-hidden="true"></i><b>${info.short}</b><strong>${info.name}</strong><span>${escapeHtml(info.description)}</span><em>PASSIVA</em></button>`).join(''); }
  $('#arsenalCatalog').innerHTML = Object.entries(ARSENAL_DEFS).filter(([type]) => offered.has(type)).map(([type, info]) => `<button class="${selected.has(type) ? 'selected' : ''}" data-arsenal="${type}" style="--item:${info.color}" title="${escapeHtml(combatDescription(type, info))}">${cardArtwork(type, 'arsenal', 'arsenal-card-art')}<span class="arsenal-check">✓</span><b>${info.short}</b><strong>${info.name}</strong><span class="arsenal-description">${escapeHtml(combatDescription(type, info))}</span><i>${info.kind === 'movement' ? 'MOVIMENTO' : 'TIRO ESPECIAL'}</i></button>`).join('');
  updateArsenalCardDetail($('#arsenalCatalog .selected') || $('#arsenalCatalog [data-arsenal]'));
  updateArsenalSelection();
  showPreparationStage(stage, timed);
  $('#arsenalModal').hidden = false;
  $('#arsenalClose').hidden = timed;
}
$('#arsenalButton').onclick = () => openArsenal(false); $('#arsenalClose').onclick = () => { $('#arsenalModal').hidden = true; };
$('#classNext').onclick = () => { const classType = $('#classCatalog .selected')?.dataset.classType; if (!classType) { toast('Escolha uma classe.'); return; } send(CLIENT.SET_CLASS, { classType }); audio.ui('confirm'); if ($('#arsenalModal').dataset.timed === 'true') { savedClassSeed = game.seed; $('#arsenalModal').hidden = true; toast('Classe confirmada. Arsenal em seguida.'); } else showPreparationStage('arsenal', false); };
$('#arsenalBack').onclick = () => showPreparationStage('class', false);
function updateArsenalSelection() { const count = $$('#arsenalCatalog .selected').length; $('#arsenalSelectedCount').textContent = `${count} / 3`; $('#arsenalSave').disabled = count !== 3; }
function updateArsenalCardDetail(button) { if (!button) return; const info = ARSENAL_DEFS[button.dataset.arsenal]; $('#arsenalCardDetail').innerHTML = `<strong style="color:${info.color}">${escapeHtml(info.name)}</strong><span>${escapeHtml(combatDescription(button.dataset.arsenal, info))}</span>`; }
$('#arsenalCatalog').onclick = (event) => { const button = event.target.closest('[data-arsenal]'); if (!button) return; updateArsenalCardDetail(button); if (!button.classList.contains('selected') && $$('#arsenalCatalog .selected').length >= 3) { toast('Remova um poder antes de escolher outro.'); return; } button.classList.toggle('selected'); updateArsenalSelection(); audio.ui(); };
$('#classCatalog').onclick = (event) => { const button = event.target.closest('[data-class-type]'); if (!button) return; $$('#classCatalog .selected').forEach((entry) => entry.classList.remove('selected')); button.classList.add('selected'); audio.ui(); };
$('#arsenalSave').onclick = () => { const choices = $$('#arsenalCatalog .selected').map((button) => button.dataset.arsenal); if (choices.length !== 3) { toast('Escolha exatamente 3 poderes.'); return; } if (game?.phase === 'arsenal') savedArsenalSeed = game.seed; send(CLIENT.SET_ARSENAL, { choices }); $('#arsenalModal').hidden = true; };

function renderRewardOffer() {
  const active = game?.players[game?.turnIndex]; const offer = active?.id === playerId ? active.rewardOffer : null; const modal = $('#rewardModal');
  modal.hidden = !offer; if (!offer) return;
  if ($('#pickupReveal').classList.contains('show')) { const me = game?.players.find((player) => player.id === playerId); if (me?.lastPickup?.type) deferredPickup = { type: me.lastPickup.type, player: me }; $('#pickupReveal').classList.remove('show'); clearTimeout(pickupTimer); }
  $('#arenaAlert').classList.remove('show');
  $('#rewardChoices').innerHTML = offer.choices.map((type) => { const info = POWERUP_DEFS[type]; return `<button data-reward="${type}" class="powerup-${type}" style="--item:${info.color}">${cardArtwork(type, 'powerups', 'card-art')}<span class="card-rarity">POWERUP</span><b>${info.short}</b><strong>${info.name}</strong><span>${escapeHtml(combatDescription(type, info))}</span><em>ESCOLHER</em></button>`; }).join('');
  $$('#rewardChoices [data-reward]').forEach((button) => button.onclick = () => send(CLIENT.CLAIM_REWARD, { type: button.dataset.reward }));
}

function renderClassEvolution() {
  const me = game?.players.find((player) => player.id === playerId); const pending = me?.alive && me.pendingClassEvolutions > 0 && game.phase === 'playing';
  const modal = $('#classEvolutionModal'); modal.hidden = !pending;
  if (pending && $('#pickupReveal').classList.contains('show')) { if (me.lastPickup?.type) deferredPickup = { type: me.lastPickup.type, player: me }; $('#pickupReveal').classList.remove('show'); clearTimeout(pickupTimer); }
  if (!pending) { if (deferredPickup && game?.phase === 'playing' && $('#rewardModal').hidden) { const pickup = deferredPickup; deferredPickup = null; showPickup(pickup.type, pickup.player); } return; }
  $('#arenaAlert').classList.remove('show');
  const milestones = classEvolutionRounds(game.roundLimit);
  $('#classEvolutionMilestone').textContent = `${CLASS_DEFS[me.classType]?.name || 'CLASSE'} • MARCO ${milestones.filter((round) => round <= game.roundNumber).length}/2 • RODADA ${game.roundNumber}`;
  $('#classEvolutionPending').textContent = me.pendingClassEvolutions > 1 ? `${me.pendingClassEvolutions} ESCOLHAS DISPONÍVEIS` : 'ESCOLHA PERMANENTE • VÁLIDA ATÉ O FIM DA PARTIDA';
  $('#classEvolutionChoices').innerHTML = Object.entries(CLASS_EVOLUTIONS).map(([type, info]) => `<button type="button" data-evolution="${type}" style="--evolution:${info.color}"><i aria-hidden="true">${type === 'fortify' ? '▦' : '✦'}</i><b>${info.name}</b><strong>${type === 'fortify' ? `+${info.health} HP` : `+${info.damage} DANO`}</strong><span>${escapeHtml(info.description)}</span><em>SELECIONAR</em></button>`).join('');
}
$('#classEvolutionChoices').onclick = (event) => { const button = event.target.closest('[data-evolution]'); if (!button) return; audio.ui(); send(CLIENT.CHOOSE_CLASS_EVOLUTION, { type: button.dataset.evolution }); $$('#classEvolutionChoices button').forEach((entry) => entry.disabled = true); };

function renderRoulette(state) {
  clearInterval(rouletteTimer); const modal = $('#rouletteModal'); modal.hidden = false;
  $('#rouletteTrack').innerHTML = state.players.map((player, index) => `<div data-player-index="${index}" style="--player:${player.color}"><b>${escapeHtml(player.nickname)}</b></div>`).join('');
  const update = () => { const now = gameNow(); const spinEndsAt = state.rouletteSpinEndsAt || state.rouletteEndsAt; const spinning = now < spinEndsAt; const progress = Math.min(1, (now - state.rouletteStartedAt) / Math.max(1, spinEndsAt - state.rouletteStartedAt)); const sequenceIndex = Math.min(state.rouletteSequence.length - 1, Math.floor(progress * state.rouletteSequence.length)); const winnerIndex = state.rouletteWinnerIndex ?? state.turnIndex; const activeIndex = spinning ? state.rouletteSequence[sequenceIndex] : winnerIndex; $$('#rouletteTrack>div').forEach((item) => item.classList.toggle('active', Number(item.dataset.playerIndex) === activeIndex)); const winner = state.players[winnerIndex]; const countdown = Math.max(0, Math.ceil((state.rouletteEndsAt - now) / 1000)); $('#rouletteResult').textContent = spinning ? 'SORTEANDO...' : `${winner.nickname} COMEÇA`; $('#matchStartCountdown').textContent = countdown; };
  update(); rouletteTimer = setInterval(update, 80);
}

function renderHud() {
  const active = game.players[game.turnIndex]; const mine = game.phase === 'playing' && !game.shotEndsAt && !(game.arenaWarningUntil > gameNow()) && active?.id === playerId; $('#aimLockButton').disabled = !mine; $('#aimAssistButton').disabled = !mine || mobileAimLocked;
  $('#turnTimer').hidden = game.phase !== 'playing';
  const newOwnTurn = mine && lastTurn !== game.turnNumber; if (newOwnTurn) { clearAimAssist(); restoreAim(); } else if (mine) updateMobileAimReadout();
  $('#turnPlayer').textContent = active?.nickname || '—'; $('#movesLeft').textContent = game.shotEndsAt ? 'PROJÉTIL EM VOO' : active?.frozenTurns > 0 ? `CONGELADO • ${active.frozenTurns}T` : active?.powerupBlockedTurns > 0 ? `PANE ELÉTRICA • SEM POWERUPS` : `${game.actions.movesLeft} ${game.actions.movesLeft === 1 ? 'AÇÃO' : 'AÇÕES'}`;
  const wind = game.wind || 0; $('#windValue').textContent = wind === 0 ? 'CALMO' : `${Math.abs(wind)} ${wind > 0 ? '→' : '←'}`; $('#windArrow').textContent = wind === 0 ? '•' : wind > 0 ? '»' : '«'; $('#windArrow').className = wind === 0 ? '' : wind > 0 ? 'right' : 'left';
  const turnsToEvent = 3 - (game.turnNumber % 3); const arenaLevel = Math.ceil(1 + ((game.roundNumber || 1) - 1) / Math.max(1, (game.roundLimit || 20) - 1) * 1.45); $('#arenaEvent').textContent = ['hill', 'teamHill'].includes(game.mode) ? `${BIOMES[game.terrain.type]?.name || 'ARENA'} • COLINA ${game.hill?.pointsToWin || 4} PTS • EVENTO EM ${turnsToEvent}` : game.mode === 'survival' ? `MARÉ DE LAVA • PRÓXIMO NÍVEL ${game.survival?.nextLevel ?? '—'} • EVENTO EM ${turnsToEvent}` : `${BIOMES[game.terrain.type]?.name || 'ARENA'} • NÍVEL ${arenaLevel} • EVENTO EM ${turnsToEvent} ${turnsToEvent === 1 ? 'TURNO' : 'TURNOS'}`;
  $('#roundNumber').textContent = game.roundNumber || 1; $('#roundLimit').textContent = game.roundLimit || room?.rules?.roundLimit || 20;
  $('#survivalForecast').hidden = game.mode !== 'survival'; if (game.mode === 'survival') $('#survivalNextLevel').textContent = `${game.survival?.nextLevel ?? '—'} ↓`;
  $('#hillStatus').hidden = !['hill', 'teamHill'].includes(game.mode); if (game.mode === 'hill') { const leader = [...game.players].sort((a, b) => (b.hillScore || 0) - (a.hillScore || 0))[0]; $('#hillValue').textContent = `${leader?.hillScore || 0}/${game.hill?.pointsToWin || 4}${game.hill?.contested ? ' ⚔' : ''}`; } else if (game.mode === 'teamHill') { const scores = Object.entries(game.hill?.teamScores || {}).sort((a, b) => b[1] - a[1]); $('#hillValue').textContent = `E${String(scores[0]?.[0] || '').split('-').at(-1)} ${scores[0]?.[1] || 0}/${game.hill?.pointsToWin || 4}${game.hill?.contested ? ' ⚔' : ''}`; }
  $('#scoreStrip').innerHTML = game.players.map((p) => `<div class="score-player ${p.alive ? '' : 'dead'}" data-team="${p.team || (p.isBot ? 'bots' : 'humans')}" style="--c:${p.color}" title="${escapeHtml(classPassiveStatus(p))}${p.classEvolutions?.length ? ` • ${p.classEvolutions.map((type) => CLASS_EVOLUTIONS[type]?.name || type).join(' + ')}` : ''}"><span><b>${game.mode === 'coop' ? (p.isBot ? '◆ ' : '◇ ') : ['teams', 'teamHill'].includes(game.mode) ? `[E${String(p.team).split('-').at(-1)}] ` : ''}${escapeHtml(p.nickname)}</b><i>${p.alive ? `${p.health} HP` : 'FORA'}</i></span><small>${p.classType ? `${CLASS_DEFS[p.classType]?.short}${p.classEvolutions?.length ? ` ↑${p.classEvolutions.length}` : ''} • ` : ''}${game.mode === 'hill' ? `◈ ${p.hillScore || 0}/${game.hill?.pointsToWin || 4} • ` : game.mode === 'teamHill' ? `◈ ${game.hill?.teamScores?.[p.team] || 0}/${game.hill?.pointsToWin || 4} • ` : ''}◆ ${p.stats?.destruction || 0}</small><div class="healthbar"><i style="width:${p.health / p.maxHealth * 100}%"></i></div></div>`).join('');
  ['#moveLeft', '#moveRight'].forEach((id) => $(id).disabled = !mine || game.actions.movesLeft <= 0); $('#fireButton').disabled = !mine || (!game.actions.attackAvailable && !renderer.hasAwaitingClusterShot() && !renderer.hasAwaitingVerticalShot()); $('#passButton').disabled = !mine;
  const me = game.players.find((player) => player.id === playerId);
  const destructionOwner = me || active; $('#destructionScore').textContent = destructionOwner?.stats?.destruction || 0; $('#destructionCard').title = `${destructionLegend}${destructionOwner?.classType === 'attacker' ? ` • ATACANTE: +50 por eliminação; Mega Canhão ${destructionOwner?.ammo?.megaCannon ? 'PRONTO' : `${destructionOwner?.megaCannonCharge || 0}/${MEGA_CANNON_CHARGE}`}` : ''}`;
  const angleInput = $('#angle'); angleInput.min = laserAimActive() ? '-85' : '5'; if (!laserAimActive() && Number(angleInput.value) < 5) { angleInput.value = 5; $('#angleValue').textContent = '5°'; renderer.setAim({ angle: 5 }); } updateMobileAimReadout();
  $('#arsenalWeapons').innerHTML = (me?.arsenal || []).map((type) => { const info = ARSENAL_DEFS[type]; const count = type === 'spider' && me?.spiderClimb ? '∞' : type === 'megaCannon' && !me?.ammo?.megaCannon ? `${me?.megaCannonCharge || 0}/${MEGA_CANNON_CHARGE}` : me?.ammo?.[type] || 0; const comboReady = equippedPowers(me).some((power) => supportsWeaponCombo(power, type)) || (me?.airborne && type === 'armoredDash'); return `<button class="weapon ${selectedWeapon === type ? 'active' : ''}${comboReady ? ' combo-ready' : ''}" data-weapon="${type}" title="${escapeHtml(combatDescription(type, info))}${comboReady ? ' COMBO DISPONÍVEL.' : ''}" style="--arsenal:${info.color}"><i class="hud-arsenal-art atlas-art atlas-arsenal art-${type}" style="${atlasStyle(type, 'arsenal')}"></i><small>${info.short}</small><b>${count}</b></button>`; }).join('');
  const inventory = new Map(); for (const type of me?.inventory || []) inventory.set(type, (inventory.get(type) || 0) + 1);
  if (me?.shieldCharges > 0) inventory.set('shield', me.shieldCharges); if (me?.invisibleTurns > 0) inventory.set('invisibility', me.invisibleTurns);
  const powerupsBlocked = me?.powerupBlockedTurns > 0; const equipped = equippedPowers(me); $('.powerup-hud').classList.toggle('blocked', powerupsBlocked); $('.powerup-help b').textContent = powerupsBlocked ? 'PANE ELÉTRICA' : 'POWERUPS'; $('.powerup-help span').textContent = powerupsBlocked ? 'BLOQUEADOS ATÉ O FIM DESTE TURNO' : 'TOQUE PARA COMBINAR • VÁRIOS PODEM FICAR ATIVOS';
  $('#inventoryBar').innerHTML = inventory.size ? [...inventory].map(([type, count]) => { const info = POWERUP_DEFS[type]; if (!info) return ''; const selectable = SELECTABLE_POWERUPS.has(type) && (me?.inventory || []).includes(type); const tag = selectable ? 'button' : 'span'; const selected = equipped.includes(type) ? ' selected' : ''; const attribute = selectable ? ` data-powerup="${type}"${powerupsBlocked ? ' disabled' : ''}` : ''; return `<${tag} class="powerup-chip${selected}"${attribute} style="--item:${info.color}" title="${escapeHtml(combatDescription(type, info))}"><span class="inventory-art atlas-art atlas-powerups" style="${atlasStyle(type, 'powerups')}"></span><b>${info.short}</b><span>${info.name}</span><em>×${count}</em>${selected ? '<i>EQUIPADO</i>' : ''}</${tag}>`; }).join('') : '<i>nenhum item ativo</i>';
  $$('.weapon').forEach((button) => { const movement = ARSENAL_DEFS[button.dataset.weapon]?.kind === 'movement'; const count = button.dataset.weapon === 'standard' || (button.dataset.weapon === 'spider' && me?.spiderClimb) ? Infinity : me?.ammo?.[button.dataset.weapon] || 0; button.disabled = !mine || (movement ? game.actions.movesLeft <= 0 : !game.actions.attackAvailable) || count <= 0; });
  if (selectedWeapon !== 'standard' && (!me?.arsenal?.includes(selectedWeapon) || ((me?.ammo?.[selectedWeapon] || 0) <= 0 && !(selectedWeapon === 'spider' && me?.spiderClimb) && !(selectedWeapon === 'jump' && me?.airborne)))) { selectedWeapon = 'standard'; $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === 'standard')); }
  renderer.setMovementMode(selectedWeapon);
  updateComboPreview();
  const targetedPower = [...equipped].reverse().find((type) => ['lightningStep', 'teleport', 'trickster'].includes(type)); const choosingBlink = mine && !powerupsBlocked && Boolean(targetedPower);
  $('#aimCoach').innerHTML = targetedPower === 'trickster' ? '<b>↔</b><span>TOQUE EM OUTRO TANQUE<small>Vocês trocarão de posição</small></span>' : choosingBlink ? `<b>⚡</b><span>TOQUE NUM POUSO PRÓXIMO<small>Alcance máximo: ${targetedPower === 'teleport' ? 580 : 270} blocos</small></span>` : '<b>1</b><span>ARRASTE PARA MIRAR<small>Direção, ângulo e força ficam salvos após o tiro</small></span>';
  $('#aimCoach').classList.toggle('visible', choosingBlink || (mine && lastTurn !== game.turnNumber && !localStorage.getItem('tankAimLearned')));
  if (newOwnTurn) { $('#turnBanner').classList.remove('show'); void $('#turnBanner').offsetWidth; $('#turnBanner').classList.add('show'); renderer.setAim({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection, visible: true }); audio.turn(); mobileVibrate(16); }
  lastTurn = game.turnNumber;
}

function renderResult() {
  const me = game.players.find((player) => player.id === playerId); const coopVictory = game.mode === 'coop' && game.winningTeam === 'humans'; const teamVictory = ['teams', 'teamHill'].includes(game.mode) && me?.team === game.winningTeam; const personalVictory = game.winner === playerId || coopVictory || teamVictory;
  if (!resultSoundPlayed) { audio.victory(personalVictory); resultSoundPlayed = true; }
  screen('resultScreen'); const winner = game.players.find((p) => p.id === game.winner); const teamNumber = String(game.winningTeam || '').split('-').at(-1); $('#winnerName').textContent = game.mode === 'coop' ? (coopVictory ? 'MISSÃO CUMPRIDA!' : 'EQUIPE ELIMINADA') : game.mode === 'teamHill' && game.finishedByObjective ? `EQUIPE ${teamNumber} DOMINOU!` : game.mode === 'teams' || game.mode === 'teamHill' ? (game.winningTeam ? `EQUIPE ${teamNumber} VENCEU!` : 'EMPATE') : game.mode === 'survival' && game.winner === playerId ? 'VOCÊ SOBREVIVEU!' : game.mode === 'hill' && game.finishedByObjective ? (winner?.id === playerId ? 'COLINA CONQUISTADA!' : `${winner?.nickname || 'TANQUE'} DOMINOU A COLINA`) : winner?.id === playerId ? 'VITÓRIA!' : winner ? `${winner.nickname} VENCEU` : 'EMPATE';
  $('#winnerSubtitle').textContent = `${game.finishedByObjective ? `Objetivo concluído: ${game.hill?.pointsToWin || 4} pontos de controle da colina.` : game.finishedByRounds ? `Limite de ${game.roundLimit} rodadas atingido. Resultado definido por ${['hill', 'teamHill'].includes(game.mode) ? 'controle da colina, ' : ''}vida, dano e destruição.` : game.mode === 'coop' ? (coopVictory ? 'Os comandantes humanos derrotaram todos os bots.' : 'Os bots dominaram a arena.') : ['teams', 'teamHill'].includes(game.mode) ? (teamVictory ? 'Sua equipe foi a última com tanques em combate.' : 'A última equipe sobrevivente dominou a arena.') : game.mode === 'survival' ? (winner ? 'Resistiu à lava ascendente e foi o último tanque de pé.' : 'A maré de lava eliminou todos os tanques.') : winner ? 'Foi o último tanque de pé.' : 'Nenhum tanque sobreviveu.'} Semente do mapa: ${game.seed}.`;
  const ranked = [...game.players].sort((a, b) => game.mode === 'hill' ? (b.hillScore || 0) - (a.hillScore || 0) || Number(b.alive) - Number(a.alive) || b.health - a.health : game.mode === 'teamHill' ? (game.hill?.teamScores?.[b.team] || 0) - (game.hill?.teamScores?.[a.team] || 0) || Number(b.alive) - Number(a.alive) || b.health - a.health : Number(b.alive) - Number(a.alive) || b.health - a.health || (b.stats?.destruction || 0) - (a.stats?.destruction || 0) || b.stats.damage - a.stats.damage);
  $('#ranking').innerHTML = ranked.map((p, i) => `<div class="rank-row"><b>#${i + 1}</b><span>${escapeHtml(p.nickname)}</span><span>${game.mode === 'hill' ? `◈ ${p.hillScore || 0} CONTROLE • ` : game.mode === 'teamHill' ? `◈ E${String(p.team).split('-').at(-1)} ${game.hill?.teamScores?.[p.team] || 0} CONTROLE • ` : ''}◆ ${p.stats?.destruction || 0} DESTRUIÇÃO • ${p.stats.damage} DANO • ${p.stats.shots} TIROS</span></div>`).join('');
  $('#rematchButton').hidden = playerId !== room.hostId;
}

setInterval(() => {
  if (!game) return;
  if (game.phase === 'playing') { const seconds = Math.max(0, Math.ceil((game.turnEndsAt - gameNow()) / 1000)); $('#turnTimer').textContent = seconds; $('#turnTimer').classList.toggle('urgent', seconds <= 5); const offer = game.players.find((player) => player.id === playerId)?.rewardOffer; if (offer) $('#rewardCountdown').textContent = Math.max(0, Math.ceil((offer.expiresAt - gameNow()) / 1000)); const ownTurn = game.players[game.turnIndex]?.id === playerId; const splitReady = ownTurn && renderer.hasAwaitingClusterShot(); const verticalReady = ownTurn && renderer.hasAwaitingVerticalShot(); const activationReady = splitReady || verticalReady; $('#fireButton').disabled = !activationReady && !game.actions.attackAvailable; $('#fireButton').classList.toggle('split-ready', splitReady); $('#gameScreen').classList.toggle('activation-ready', activationReady); $('#fireButton').innerHTML = splitReady ? '<small>✦</small> FRAGMENTAR <span>✦</span>' : verticalReady ? '<small>↓</small> SOLTAR <span>✦</span>' : '<small>4</small> ATIRAR <span>✦</span>'; }
  if (game.phase === 'class' || game.phase === 'arsenal') $('#arsenalCountdown').textContent = Math.max(0, Math.ceil(((game.phase === 'class' ? game.classEndsAt : game.arsenalEndsAt) - gameNow()) / 1000));
}, 200);
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
net.connect();
