import { CLIENT, SERVER } from '/shared/protocol.js';
import { ARSENAL_DEFS, CLASS_DEFS, CLASS_EVOLUTIONS, CLASS_POWERUP_SYNERGY, CLASS_POWERUP_WEIGHT, classEvolutionRounds, CLUSTER_CAPSULE_SPEED, COLLECTIBLE_ITEMS, DESTRUCTION_POINTS, EVENT_DEFS, MEGA_BOMB, MEGA_CANNON_CHARGE, POWERUP_DEFS, SHOT_PATH_RATE, WEAPON_BALANCE } from '/shared/constants.js';
import { CARD_ROLE_LABELS, CARD_SECTIONS, cardActivation, cardCombo, cardDamage, cardRole, classProgressionDescription, searchableCard } from '/shared/card-catalog.js';
import { BIOMES } from '/shared/biomes.js';
import { suggestAim } from '/shared/aim-assist.js';
import { atlasStyle } from '/shared/card-art.js';
import { GameNetwork } from './network.js';
import { Renderer } from './renderer.js';
import { BattleAudio } from './audio.js';

const $ = (q) => document.querySelector(q); const $$ = (q) => [...document.querySelectorAll(q)];
const net = new GameNetwork(); const renderer = new Renderer($('#gameCanvas'));
const audio = new BattleAudio();
renderer.onShotImpact = (shot) => { if (shot.delayedStrike || shot.concealed) return; if (shot.weapon === 'fireworks' && shot.canActivateFireworks && !audio.usingMobileAudio()) audio.fireworksBurst(); if (audio.usingMobileAudio() && !shot.fireworksActivated) { if (shot.soundDetonation) audio.detonation(shot.weapon); else audio.impact(shot); } if (matchMedia('(pointer:coarse)').matches) mobileVibrate(shot.megaMissile ? [45, 25, 100, 35, 130] : [24, 20, 55]); };
renderer.onHunterDive = () => audio.eagleDive();
let room = null; let game = null; let playerId = sessionStorage.getItem('tankPlayerId'); let spectatorMode = Boolean(sessionStorage.getItem('tankSpectatorToken')); let lastTurn = null; let toastTimer;
let aimDirection = 1; let aiming = false; let aimAssistTargetId = null; let aimAssistEstimate = null;
let fireRequestPending = false; let fireRequestTimer;
let selectedWeapon = null; let resultSoundPlayed = false; let resultSequence = 0; let lastArenaEventKey = null;
let trainingStep = 0; let trainingOpen = false; let trainingSeed = null;
const mobileLayoutQuery = matchMedia('(pointer: coarse) and (max-width: 1100px)');
let mobileAimMode = localStorage.getItem('tankMobileAimMode') === 'stick' ? 'stick' : 'drag';
let mobileCameraMode = localStorage.getItem('tankMobileCameraMode') === 'fixed' ? 'fixed' : 'dynamic';
let focusTimer; let pickupTimer; let rouletteTimer; let arenaAlertTimer; let destructionTimer; let clusterImpactTimer; let savedClassSeed = null; let savedArsenalSeed = null; let deferredPickup = null;
let serverClockOffset = 0; const gameNow = () => Date.now() + serverClockOffset;
let hapticFallbackTimer;
const combatEntries = []; let combatSeed = null;
window.render_game_to_text = () => JSON.stringify({
  coordinates: 'world origin top-left; x increases right, y increases down; viewport uses renderer.camera',
  screen: document.querySelector('.screen.active')?.id || 'unknown',
  room: room?.code || null,
  phase: game?.phase || null,
  training: game?.training ? { step: trainingStep + 1, open: trainingOpen } : null,
  turn: game?.turnNumber ?? null,
  round: game?.roundNumber ?? null,
  survival: game?.survival ? { lavaLevel: game.lavaLevel, nextLevel: game.survival.nextLevel, lastRise: game.survival.lastRise } : null,
  hill: game?.hill ? { x: game.hill.x, radius: game.hill.radius, contested: game.hill.contested, teamScores: game.hill.teamScores, lastCaptureTeam: game.hill.lastCaptureTeam } : null,
  currentPlayerId: game?.players?.[game.turnIndex]?.id || null,
  localPlayerId: playerId,
  aim: { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection, assistedTargetId: aimAssistTargetId, estimatedError: aimAssistEstimate },
  audio: { enabled: audio.enabled, ready: audio.isReady(), webState: audio.context?.state || 'none', nativeReady: audio.mobile.ready, nativeError: audio.mobile.lastError, volumes: audio.volumes },
  fire: { enabled: !$('#fireButton').disabled, label: $('#fireButton').textContent.trim(), feedback: $('#fireFeedback').classList.contains('show') },
  arsenal: { selected: selectedWeapon, available: arsenalButtons().map((button) => ({ type: button.dataset.weapon, enabled: !button.disabled })), sliderVisible: $('#arsenalPicker').classList.contains('has-overflow'), viewedIndex: Number($('#arsenalSlider').value) },
  mobile: { aimMode: mobileAimMode, cameraMode: mobileCameraMode, settingsOpen: !$('#mobileSettings').hidden },
  players: (game?.players || []).map((player) => ({ id: player.id, x: player.x, y: player.y, health: player.health, maxHealth: player.maxHealth, alive: player.alive, airborne: player.airborne ? { vx: player.airborne.vx, vy: player.airborne.vy, falling: Boolean(player.airborne.falling), parachute: Boolean(player.airborne.parachute) } : null, lastLanding: player.lastLanding || null, team: player.team, classType: player.classType, teslaDisabledTurns: player.teslaDisabledTurns, inventory: player.id === playerId ? player.inventory : undefined, rewardChoices: player.id === playerId ? player.rewardOffer?.choices : undefined, lastRevive: player.lastRevive, lastSalvage: player.lastSalvage, classEvolutions: player.classEvolutions, pendingClassEvolutions: player.pendingClassEvolutions })),
  objects: (game?.objects || []).filter((object) => object.active !== false && object.x >= renderer.camera.x - 100 && object.x <= renderer.camera.x + 1280 / renderer.camera.zoom + 100).map((object) => ({ id: object.id, type: object.type, x: object.x, y: object.y, durability: object.durability ?? object.towerDurability ?? null })),
  lastRodPulse: game?.lastRodPulse || null,
  lastSaboteurPulses: game?.lastSaboteurPulses || [],
  pickupAttractions: game?.pickupAttractions || [],
  pickups: (game?.powerups || []).filter((item) => item.active && item.revealed && item.x >= renderer.camera.x - 100 && item.x <= renderer.camera.x + 1280 / renderer.camera.zoom + 100).map((item) => ({ id: item.id, type: item.type, x: item.x, y: item.y })),
  shots: renderer.shots.map((shot) => { const index = Math.max(0, Math.min(shot.path?.length - 1 || 0, renderer.shotIndex(shot, performance.now()))); const point = shot.path?.[index]; return { weapon: shot.weapon, index, pathLength: shot.path?.length || 0, x: point?.x, y: point?.y, fuse: Boolean(point?.fuse), exploded: Boolean(shot.exploded) }; }),
  delayedStrikes: game?.delayedStrikes || [],
  movementPreview: renderer.movementPreviewCache && renderer.movementPreviewCache.game === game ? { mode: renderer.movementMode, endpoints: renderer.movementPreviewCache.landings.map((landing) => ({ x: landing.x, y: landing.y, safe: landing.safe, walls: landing.wallBreakPoints?.length || 0, launcherId: landing.launcherId || null })) } : null,
  camera: { ...renderer.camera, userZoom: renderer.userZoom, mode: renderer.cameraMode },
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
const chatHistory = [];
const DESTRUCTION_LABELS = Object.freeze({ terrainChunk: '24 MICROBLOCOS', barrel: 'BARRIL', fuelTank: 'TANQUE DE COMBUSTÍVEL', supplyCache: 'DEPÓSITO', radar: 'RADAR', shockCoil: 'BOBINA', watchtower: 'TORRE', platform: 'PLATAFORMA', concrete: 'CONCRETO', craneCable: 'CABO DO GUINDASTE', building: 'PRÉDIO', crane: 'GUINDASTE', tank: 'TANQUE' });
const destructionLegend = Object.entries(DESTRUCTION_POINTS).map(([type, points]) => `${DESTRUCTION_LABELS[type] || (type === 'lightningRod' ? 'HASTE' : type.toUpperCase())} +${points}`).join(' • ');
const DAMAGE_INFO = Object.freeze({
  extraShot: 'repete o dano da arma', doubleShot: '2× o dano da arma', tripleShot: '3× o dano da arma', bigExplosion: 'mantém o dano da arma', megaMissile: `até ${MEGA_BOMB.damage} HP`, freeze: 'mantém o dano da arma', guidedBullet: 'mantém o dano da arma', heal: 'sem dano', shield: 'sem dano', movementBoost: 'sem dano', rocketDash: 'sem dano', lightningStep: 'sem dano', bridgeKit: 'mantém o dano da arma', teleport: 'mantém o dano da arma', invisibility: 'sem dano', excavator: 'sem dano', armorPiercer: 'mantém o dano da arma', shockwave: 'até 24 HP', bunkerBuster: 'até 58 HP', ammoCrate: 'sem dano', molotov: 'impacto + fogo', repairDrone: 'sem dano', overcharge: 'sem dano', laser: `${WEAPON_BALANCE.laser.damage} HP por alvo`, mirror: 'repete todo o dano', trickster: 'sem dano', flyingHunter: `até ${WEAPON_BALANCE.flyingHunter.damage} HP`,
  heavy: `${WEAPON_BALANCE.heavy.damage}–${Math.round(WEAPON_BALANCE.heavy.damage * WEAPON_BALANCE.heavy.maxMultiplier)} HP`, cluster: `${WEAPON_BALANCE.cluster.damage} HP por fragmento`, fireworks: `${WEAPON_BALANCE.fireworks.damage} HP + 12× até ${WEAPON_BALANCE.fireworks.secondaryDamage} HP`, zeus: 'até 50 HP combinados', gravity: `até ${WEAPON_BALANCE.gravity.damage} HP`, grenade: `até ${WEAPON_BALANCE.grenade.damage} HP`, mineLayer: `${WEAPON_BALANCE.mineLayer.damage} HP por mina`, moleBomb: `até ${WEAPON_BALANCE.moleBomb.damage} HP`, armoredDash: `${WEAPON_BALANCE.armoredDash.damage} HP • ${WEAPON_BALANCE.armoredDash.walls} paredes`, verticalStrike: `até ${WEAPON_BALANCE.verticalStrike.damage} HP`, droneStrike: '24 HP por micromíssil', teslaOrb: '30 + 22 HP por arco', seismicCharge: '44 + 18 HP por onda', megaCannon: `até ${WEAPON_BALANCE.megaCannon.damage} HP • ${MEGA_CANNON_CHARGE} pontos para carregar`, jump: 'sem dano', spider: 'sem dano', standard: 'base 20–30 • centro 50 • cabeça 60–80 (crítico)',
});
function combatDescription(type, info) { const damage = type === 'lightningRod' ? `${WEAPON_BALANCE.lightningRod.zapDamage} HP por turno no raio` : DAMAGE_INFO[type]; return damage ? `${info.description} Dano: ${damage}.` : info.description; }
function syncMenuMusic() { audio.stopMenuMusic(); }
function screen(id) { $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); document.body.classList.toggle('playing', id === 'gameScreen'); syncMenuMusic(); if (id === 'gameScreen') requestAnimationFrame(() => renderer.resizeViewport()); else { document.body.classList.remove('immersive-mobile'); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } }
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2300); }
function syncFullscreenButton() {
  const active = Boolean(document.fullscreenElement) || document.body.classList.contains('immersive-mobile');
  const button = $('#fullscreenButton'); button.textContent = active ? '◱' : '⛶'; button.setAttribute('aria-pressed', String(active)); button.setAttribute('aria-label', active ? 'Sair da tela cheia' : 'Entrar em tela cheia'); button.title = active ? 'Sair da tela cheia' : 'Tela cheia';
  requestAnimationFrame(() => renderer.resizeViewport());
}
async function toggleFullscreen() {
  const target = $('#gameScreen');
  if (document.fullscreenElement) { await document.exitFullscreen?.(); document.body.classList.remove('immersive-mobile'); syncFullscreenButton(); return; }
  if (document.body.classList.contains('immersive-mobile')) { document.body.classList.remove('immersive-mobile'); syncFullscreenButton(); return; }
  if (target.requestFullscreen) {
    try { await target.requestFullscreen({ navigationUI: 'hide' }); await window.screen.orientation?.lock?.('landscape').catch(() => {}); syncFullscreenButton(); return; } catch { /* Fall back to a compact stage when the browser declines fullscreen. */ }
  }
  document.body.classList.add('immersive-mobile'); syncFullscreenButton();
  toast(/iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone ? 'Para ocultar a barra do navegador no iPhone, adicione o jogo à Tela de Início.' : 'Palco ampliado; tela cheia nativa indisponível neste navegador.');
}
$('#fullscreenButton').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', syncFullscreenButton);
window.visualViewport?.addEventListener('resize', () => renderer.resizeViewport());
addEventListener('keydown', (event) => { if (!document.body.classList.contains('playing') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return; if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen(); } else if (event.key === 'Escape' && document.body.classList.contains('immersive-mobile')) { document.body.classList.remove('immersive-mobile'); syncFullscreenButton(); } });
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
  salvageHeal: 'Equipe antes de atirar. Ao concluir o disparo, recupera 25% dos pontos de destruição gerados, limitado a 60 HP. Combina com outros modificadores.',
  extraLife: 'Fica guardada no inventário. Ao ser eliminado, uma carga é consumida automaticamente para renascer em local seguro com 25% da vida máxima.',
};
const SELECTABLE_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'excavator', 'armorPiercer', 'shockwave', 'bunkerBuster', 'rocketDash', 'lightningStep', 'bridgeKit', 'molotov', 'laser', 'mirror', 'trickster', 'salvageHeal']);
const SHOT_COMBO_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'armorPiercer', 'shockwave', 'bunkerBuster', 'bridgeKit', 'molotov', 'laser', 'mirror', 'salvageHeal']);
const definitionChecks = (definitions, name) => Object.entries(definitions).map(([type, info]) => `<label style="--item:${info.color}"><input type="checkbox" name="${name}" value="${type}" checked><i></i><span>${info.name}</span></label>`).join('');
$('#eventRulePicker').innerHTML = definitionChecks(EVENT_DEFS, 'enabledEvents');
const configurablePickups = Object.fromEntries(COLLECTIBLE_ITEMS.map((type) => [type, POWERUP_DEFS[type] || ARSENAL_DEFS[type]]));
$('#powerupRulePicker').innerHTML = definitionChecks(configurablePickups, 'enabledPowerups');
function updateRuleCounts() { $('#eventRuleCount').textContent = `${$$('[name="enabledEvents"]:checked').length}/${Object.keys(EVENT_DEFS).length}`; $('#powerupRuleCount').textContent = `${$$('[name="enabledPowerups"]:checked').length}/${COLLECTIBLE_ITEMS.length}`; }
$('#eventRulePicker').onchange = updateRuleCounts; $('#powerupRulePicker').onchange = updateRuleCounts; updateRuleCounts();
function equippedPowers(player) { return player?.selectedPowerups?.length ? player.selectedPowerups : player?.selectedPowerup ? [player.selectedPowerup] : []; }
function supportsWeaponCombo(powerup, weapon) { if (!powerup || !SHOT_COMBO_POWERUPS.has(powerup) || ARSENAL_DEFS[weapon]?.kind !== 'shot') return false; if (weapon === 'lightningRod' && !['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'armorPiercer', 'bridgeKit', 'molotov', 'mirror'].includes(powerup)) return false; if (weapon === 'flyingHunter' && powerup === 'laser') return false; if (['megaMissile', 'bigExplosion'].includes(powerup) && ['mineLayer', 'gravity'].includes(weapon)) return false; return true; }
function showPickup(type, player) {
  if (!$('#classEvolutionModal').hidden || !$('#rewardModal').hidden) { deferredPickup = { type, player }; return; }
  $('#arenaAlert').classList.remove('show');
  const info = POWERUP_DEFS[type] || ARSENAL_DEFS[type]; if (!info) return;
  const arsenalPickup = Boolean(ARSENAL_DEFS[type]);
  const counts = new Map(); for (const item of player.inventory || []) counts.set(item, (counts.get(item) || 0) + 1);
  const count = arsenalPickup ? player.ammo?.[type] || 1 : type === 'shield' ? player.shieldCharges : type === 'invisibility' ? player.invisibleTurns : type === 'heal' ? 0 : counts.get(type) || 1;
  const contents = type === 'lootbox' ? (player.lastPickup?.contents || []).map((reward) => (POWERUP_DEFS[reward] || ARSENAL_DEFS[reward])?.name).filter(Boolean) : [];
  const selectable = SELECTABLE_POWERUPS.has(type); const artSection = arsenalPickup ? 'arsenal' : 'powerups'; $('#pickupReveal').style.setProperty('--pickup', info.color); $('#pickupArt').className = `pickup-art atlas-art atlas-${artSection} art-${type}`; $('#pickupArt').setAttribute('style', atlasStyle(type, artSection)); $('#pickupEyebrow').textContent = type === 'lootbox' ? 'LOOTBOX RARA • 3 RECOMPENSAS' : arsenalPickup ? 'HABILIDADE COLETADA • DISPONÍVEL NO ARSENAL' : selectable ? 'POWERUP COLETADO • SELECIONE NO INVENTÁRIO' : 'POWERUP COLETADO • EFEITO AUTOMÁTICO'; $('#pickupShort').textContent = info.short; $('#pickupName').textContent = info.name; $('#pickupDescription').textContent = contents.length ? `Você recebeu: ${contents.join(' • ')}.` : combatDescription(type, info); $('#pickupUsage').textContent = arsenalPickup ? 'Uma carga foi adicionada. A habilidade aparece no seletor de armas e pode ser usada nesta partida.' : POWERUP_USAGE[type] || 'O efeito ficará disponível no seu inventário.';
  if (type === 'lightningRod' && player.lastPickup?.category === 'classReward') {
    $('#pickupEyebrow').textContent = 'PODER DE CLASSE • RODADA 2';
    $('#pickupUsage').textContent = 'Exclusiva do Meteorologista. A Haste entrou no arsenal e pode ser combinada com modificadores de tiro.';
  }
  if (type === 'megaCannon') {
    const firstUnlock = player.lastPickup?.category === 'classReward';
    $('#pickupEyebrow').textContent = firstUnlock ? 'PODER DE CLASSE DESBLOQUEADO' : 'MEGA CANHÃO RECARREGADO';
    $('#pickupUsage').textContent = firstUnlock ? `Exclusivo do Atacante. A carta apareceu automaticamente no arsenal: selecione MEGA para disparar. Depois, acumule mais ${MEGA_CANNON_CHARGE} pontos para recarregar.` : 'Uma nova carga está pronta no arsenal. Selecione MEGA para disparar.';
  }
  $('#pickupStack').textContent = ['heal', 'ammoCrate', 'lootbox'].includes(type) ? 'EFEITO APLICADO IMEDIATAMENTE' : type === 'invisibility' ? `${count} TURNOS ACUMULADOS` : `${count} ${count === 1 ? 'CARGA' : 'CARGAS'} ACUMULADAS`;
  $('#pickupReveal').classList.remove('show'); void $('#pickupReveal').offsetWidth; $('#pickupReveal').classList.add('show'); clearTimeout(pickupTimer); pickupTimer = setTimeout(() => $('#pickupReveal').classList.remove('show'), 5200);
}
$('#pickupClose').onclick = () => { clearTimeout(pickupTimer); $('#pickupReveal').classList.remove('show'); };

$$('.tab').forEach((tab) => tab.onclick = () => { $$('.tab,.form').forEach((x) => x.classList.remove('active')); tab.classList.add('active'); $(`#${tab.dataset.tab}Form`).classList.add('active'); });
const modeSelect = $('#createForm [name="gameMode"]'); const syncTeamOptions = () => { $('#teamCountField').hidden = !['teams', 'teamHill'].includes(modeSelect.value); $('#modeHelp').textContent = ({ ffa: 'Elimine os demais tanques ou vença pelo limite de rodadas.', coop: 'Humanos enfrentam bots juntos. A partida acaba quando uma equipe é eliminada.', teams: 'Forme de 2 a 4 equipes. Fogo amigo desativado; vence a última equipe viva.', teamHill: 'Equipes somam pontos ocupando a colina sem rivais. A primeira com 4 pontos vence.', hill: 'Ocupe a zona dourada sozinho ao fim de cada rodada. Quem fizer 4 pontos primeiro vence.', survival: 'A lava sobe a cada rodada. Fuja para terreno ou plataformas altas e seja o último tanque vivo.' })[modeSelect.value]; }; modeSelect.onchange = syncTeamOptions; syncTeamOptions();
const createBots = $('#createForm [name="botCount"]'); const createCapacity = $('#createForm [name="maxPlayers"]');
function syncBotCapacity() { const needed = Number(createBots.value) + 1; if (Number(createCapacity.value) >= needed) return; const capacity = [...createCapacity.options].find((option) => Number(option.value) >= needed); if (capacity) { createCapacity.value = capacity.value; toast(`${createBots.value} bots: sala ampliada para ${capacity.value} tanques.`); } }
createBots.addEventListener('change', syncBotCapacity);
$('#quickPreset').onclick = () => { const form = $('#createForm'); for (const [name, value] of Object.entries({ maxPlayers: '2', botCount: '1', botDifficulty: 'normal', turnSeconds: '15', roundLimit: '10', gameSpeed: '1.5', powerupCount: '12', mapType: 'random', gameMode: 'ffa' })) form.elements[name].value = value; syncTeamOptions(); toast('Partida rápida pronta: 1 bot, 10 rodadas e turnos de 15s.'); };
$('#trainingStart').onclick = () => { const nickname = $('#createForm [name="nickname"]').value.trim() || 'Cadete'; localStorage.setItem('tankNickname', nickname); send(CLIENT.CREATE_ROOM, { nickname, roomName: 'Treino guiado', quickTraining: true }); };
$('#createForm').onsubmit = (e) => { e.preventDefault(); syncBotCapacity(); const form = new FormData(e.target); const v = Object.fromEntries(form); localStorage.setItem('tankNickname', v.nickname.trim()); send(CLIENT.CREATE_ROOM, { nickname: v.nickname, roomName: v.roomName, rules: { ...v, mines: Boolean(v.mines), classesEnabled: Boolean(v.classesEnabled), enabledEvents: form.getAll('enabledEvents'), enabledPowerups: form.getAll('enabledPowerups') } }); };
$('#joinForm').onsubmit = (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); v.code = v.code.trim().toUpperCase(); localStorage.setItem('tankNickname', v.nickname.trim()); send(CLIENT.JOIN_ROOM, v); };
$('#watchButton').onclick = () => { const v = Object.fromEntries(new FormData($('#joinForm'))); if (!v.code) { toast('Informe o código da sala.'); return; } send(CLIENT.WATCH_ROOM, v); };
const savedNickname = localStorage.getItem('tankNickname');
if (savedNickname) { $('#createForm [name="nickname"]').value = savedNickname; $('#joinForm [name="nickname"]').value = savedNickname; }
const invitedCode = new URLSearchParams(location.search).get('room')?.trim().toUpperCase();
if (invitedCode && /^[A-F0-9]{6}$/.test(invitedCode)) {
  document.body.classList.add('invite-entry');
  document.querySelector('.tab[data-tab="join"]').click();
  $('#joinForm [name="code"]').value = invitedCode;
  $('#inviteRoomCode').textContent = invitedCode;
  $('#inviteNotice').hidden = false;
  requestAnimationFrame(() => $('#joinForm [name="nickname"]').focus());
}
function movementPayload(direction) { return { direction, arsenal: selectedWeapon === 'armoredDash' ? 'armoredDash' : selectedWeapon === 'spider' ? 'spider' : null }; }
$('#startButton').onclick = () => send(CLIENT.START_GAME); $('#moveLeft').onclick = () => { mobileVibrate(10); send(CLIENT.MOVE, movementPayload(-1)); }; $('#moveRight').onclick = () => { mobileVibrate(10); send(CLIENT.MOVE, movementPayload(1)); };
function activateJump() { const me = game?.players.find((player) => player.id === playerId); const openingParachute = Boolean(me?.airborne); send(CLIENT.USE_ARSENAL, openingParachute ? { type: 'parachute' } : { type: 'jump', angle: $('#angle').value, power: $('#power').value, direction: aimDirection }); if (!openingParachute) { selectedWeapon = null; renderer.setMovementMode('standard'); $$('.weapon').forEach((button) => button.classList.remove('active')); updateFireButton(); toast('NO AR • escolha o tiro e dispare'); } }
function aimStorageKey() { return playerId ? `tankAim:${playerId}` : null; }
function saveAim() { const key = aimStorageKey(); if (key) localStorage.setItem(key, JSON.stringify({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection })); }
function restoreAim() { const key = aimStorageKey(); let value = null; try { value = key && JSON.parse(localStorage.getItem(key)); } catch {} const me = game?.players.find((player) => player.id === playerId); if (!value) value = { angle: 45, power: 310, direction: me?.facing || 1 }; aimDirection = value.direction === -1 ? -1 : 1; $('#angle').value = Math.max(aimMinimum(), Math.min(85, Number(value.angle) || 45)); $('#power').value = Math.max(100, Math.min(580, Number(value.power) || 310)); $('#angleValue').textContent = `${$('#angle').value}°`; $('#powerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; syncAimPreview(); }
function canLocalFire() { const ownTurn = game?.phase === 'playing' && !spectatorMode && game.players[game.turnIndex]?.id === playerId && game.players[game.turnIndex]?.alive && !game.players[game.turnIndex]?.teslaDisabledTurns; const activating = renderer.hasAwaitingVerticalShot() || renderer.hasAwaitingClusterShot() || renderer.hasAwaitingFireworksShot(); return Boolean(ownTurn && !fireRequestPending && !(game.arenaWarningUntil > gameNow()) && (activating || (selectedWeapon && !game.shotEndsAt && game.actions?.attackAvailable))); }
function updateFireButton() { const button = $('#fireButton'); const ownTurn = game?.phase === 'playing' && !spectatorMode && game.players[game.turnIndex]?.id === playerId; const disabledByTesla = ownTurn && game.players[game.turnIndex]?.teslaDisabledTurns > 0; const ready = canLocalFire(); const split = ownTurn && !disabledByTesla && renderer.hasAwaitingClusterShot(); const fireworks = ownTurn && !disabledByTesla && renderer.hasAwaitingFireworksShot(); const vertical = ownTurn && !disabledByTesla && renderer.hasAwaitingVerticalShot(); const label = disabledByTesla ? 'TESLA • SÓ MOVER' : split ? '<small>✦</small> FRAGMENTAR <span>✦</span>' : fireworks ? '<small>✷</small> DETONAR <span>✷</span>' : vertical ? '<small>↓</small> SOLTAR <span>✦</span>' : ready ? '<small>4</small> ATIRAR <span>✦</span>' : ownTurn && !selectedWeapon && !game?.shotEndsAt ? 'ESCOLHA CARTA' : ownTurn ? 'AGUARDE' : 'OUTRO TURNO'; button.disabled = !ready; button.classList.toggle('split-ready', split || fireworks); button.classList.toggle('fire-ready', ready); button.setAttribute('aria-label', disabledByTesla ? 'Tesla ativo: apenas movimento disponível' : ready ? split ? 'Fragmentar projétil' : fireworks ? 'Detonar fogos no ar' : vertical ? 'Soltar tiro vertical' : 'Atirar' : ownTurn && !selectedWeapon ? 'Escolha uma carta do arsenal para atirar' : ownTurn ? 'Aguarde o fim da animação' : 'Atirar indisponível: fora do seu turno'); if (button.innerHTML !== label) button.innerHTML = label; $('#gameScreen').classList.toggle('activation-ready', split || fireworks || vertical); }
function fireButtonFx() { const button = $('#fireButton'); const burst = $('#fireFeedback'); const rect = button.getBoundingClientRect(); burst.style.left = `${rect.left + rect.width / 2}px`; burst.style.top = `${rect.top + rect.height / 2}px`; burst.classList.remove('show'); void burst.offsetWidth; burst.classList.add('show'); clearTimeout(fireButtonFx.timer); fireButtonFx.timer = setTimeout(() => burst.classList.remove('show'), 720); mobileVibrate([18, 18, 32]); }
function markFireRequested() { fireRequestPending = true; updateFireButton(); clearTimeout(fireRequestTimer); fireRequestTimer = setTimeout(() => { fireRequestPending = false; updateFireButton(); }, 3000); }
function fireSelectedWeapon() { if (!canLocalFire()) { if (game?.players[game.turnIndex]?.id === playerId && !selectedWeapon) toast('Escolha uma carta do arsenal antes de atirar.'); return; } if (renderer.hasAwaitingVerticalShot()) { const token = renderer.activateVerticalShot(); if (token) { audio.unlock(); fireButtonFx(); markFireRequested(); send(CLIENT.ACTIVATE_VERTICAL, { token }); toast('ATIVAÇÃO VERTICAL!'); } return; } if (renderer.hasAwaitingClusterShot()) { const token = renderer.activateClusterShot(); if (token) { audio.unlock(); fireButtonFx(); markFireRequested(); send(CLIENT.ACTIVATE_CLUSTER, { token }); toast('FRAGMENTAÇÃO: 3 MÍSSEIS!'); } return; } if (renderer.hasAwaitingFireworksShot()) { const token = renderer.activateFireworksShot(); if (token) { audio.unlock(); fireButtonFx(); markFireRequested(); send(CLIENT.ACTIVATE_FIREWORKS, { token }); toast('FOGOS DETONADOS NO AR!'); } return; } if (selectedWeapon === 'jump') { activateJump(); return; } if (selectedWeapon === 'spider' || selectedWeapon === 'armoredDash') { toast(selectedWeapon === 'armoredDash' ? 'Use A/D ou as setas para executar a investida.' : 'Use A/D: salte, ganhe 2 movimentos e escale paredes permanentemente.'); return; } audio.unlock(); saveAim(); fireButtonFx(); markFireRequested(); send(CLIENT.FIRE, { angle: $('#angle').value, power: $('#power').value, direction: aimDirection, weapon: selectedWeapon }); }
let firePointerHandledAt = -Infinity;
$('#fireButton').addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); firePointerHandledAt = performance.now(); fireSelectedWeapon(); });
$('#fireButton').onclick = () => { if (performance.now() - firePointerHandledAt < 500) return; fireSelectedWeapon(); }; $('#passButton').onclick = () => send(CLIENT.PASS_TURN);
$('#rematchButton').onclick = () => send(CLIENT.REMATCH); $('#backButton').onclick = () => location.reload();
$('#restartButton').onclick = () => { if (confirm('Reiniciar a partida para todos os jogadores?')) send(CLIENT.REMATCH); };
$('#leaveButton').onclick = () => { const wasSpectator = spectatorMode; send(CLIENT.LEAVE_ROOM); room = null; game = null; playerId = null; spectatorMode = false; document.body.classList.remove('spectating'); sessionStorage.removeItem('tankToken'); sessionStorage.removeItem('tankPlayerId'); sessionStorage.removeItem('tankSpectatorToken'); sessionStorage.removeItem('tankRoomCode'); $('#chatMessages').innerHTML = ''; screen('homeScreen'); toast(wasSpectator ? 'Você saiu da transmissão.' : 'Você saiu da partida. Um bot assumiu seu tanque.'); };
$('#chatForm').onsubmit = (event) => { event.preventDefault(); const input = $('#chatInput'); const text = input.value.trim(); if (text) send(CLIENT.CHAT, { text }); input.value = ''; input.blur(); $('#chatPanel').classList.remove('open'); };
async function copyRoomText(value, field = null) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; } } catch { /* HTTP local pode bloquear a API moderna. */ }
  const input = field || document.createElement('textarea');
  if (!field) { input.value = value; input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'; document.body.append(input); }
  let copied = false;
  try { input.focus(); input.select(); input.setSelectionRange(0, value.length); copied = document.execCommand?.('copy') === true; } catch { /* O link permanece selecionável manualmente. */ }
  if (!field) input.remove();
  return copied;
}
$('#copyCode').onclick = async () => {
  if (!room?.code) return;
  toast(await copyRoomText(room.code) ? `Código ${room.code} copiado! Compartilhe com seus amigos.` : `Não foi possível copiar. Anote o código: ${room.code}`);
};
function inviteUrl() { const url = new URL(location.pathname, location.origin); url.searchParams.set('room', room.code); return url.href; }
async function copyInviteLink() {
  const input = $('#inviteLink');
  if (await copyRoomText(input.value, input)) {
    $('#inviteStatus').textContent = 'Link copiado! Envie para seus amigos.';
    toast('Link da sala copiado!');
    return true;
  }
  $('#inviteStatus').textContent = 'Selecione o link acima para copiar manualmente.'; input.focus(); input.select(); return false;
}
function closeInvite() { $('#inviteModal').hidden = true; document.body.classList.remove('modal-open'); $('#inviteFriends').focus(); }
$('#inviteFriends').onclick = () => {
  if (!room?.code) return;
  $('#inviteLink').value = inviteUrl();
  $('#inviteStatus').textContent = 'Copie ou compartilhe o link da sala.';
  $('#shareInviteLink').hidden = typeof navigator.share !== 'function';
  $('#inviteModal').hidden = false;
  document.body.classList.add('modal-open');
  copyInviteLink();
};
$('#copyInviteLink').onclick = copyInviteLink;
$('#shareInviteLink').onclick = async () => {
  if (!room?.code || !navigator.share) return;
  try { await navigator.share({ title: `TankDots Wars — ${room.name}`, text: `Entre na minha sala ${room.code} do TankDots Wars!`, url: inviteUrl() }); $('#inviteStatus').textContent = 'Convite compartilhado.'; }
  catch (error) { if (error?.name !== 'AbortError') $('#inviteStatus').textContent = 'Não foi possível compartilhar. Use COPIAR LINK.'; }
};
$('#inviteClose').onclick = closeInvite;
$('#inviteModal').onclick = (event) => { if (event.target === $('#inviteModal')) closeInvite(); };
addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#inviteModal').hidden) closeInvite(); });
function laserAimActive() { const me = game?.players.find((player) => player.id === playerId); return equippedPowers(me).includes('laser') && me.inventory?.includes('laser'); }
function aimMinimum() { return laserAimActive() ? -85 : 5; }
function clearAimAssist() { aimAssistTargetId = null; aimAssistEstimate = null; renderer.aimAssistTargetId = null; renderer.aimAssistError = null; $('#aimAssistButton').classList.remove('active', 'approximate'); $('#aimAssistButton').title = 'Sugerir mira para o inimigo mais próximo'; }
function syncStickKnob() { const ring = $('#aimStickRing'); const angle = Number($('#angle').value) * Math.PI / 180; const power = Math.round((Number($('#power').value) - 100) / 4.8); const radius = Math.max(0, ring.clientWidth / 2 - 23) * power / 100; $('#aimStickKnob').style.transform = `translate(${Math.round(aimDirection * Math.cos(angle) * radius)}px,${Math.round(-Math.sin(angle) * radius)}px)`; $('#stickAngleValue').textContent = `${$('#angle').value}°`; $('#stickPowerValue').textContent = `${power}%`; ring.setAttribute('aria-valuenow', String(power)); ring.setAttribute('aria-valuetext', `${$('#angle').value} graus, ${power}% de força, ${aimDirection < 0 ? 'esquerda' : 'direita'}`); }
function updateMobileAimReadout() { $('#mobileAngleValue').textContent = `${$('#angle').value}°`; $('#mobilePowerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; syncStickKnob(); }
function syncAimPreview() { renderer.setAim({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection }); updateMobileAimReadout(); }
function setAimControls(angle, power, direction = aimDirection) { clearAimAssist(); aimDirection = direction < 0 ? -1 : 1; $('#angle').value = Math.max(aimMinimum(), Math.min(85, Math.round(angle))); $('#power').value = Math.max(100, Math.min(580, Math.round(power))); $('#angleValue').textContent = `${$('#angle').value}°`; $('#powerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; syncAimPreview(); $('#aimCoach').classList.remove('visible'); }
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
function applyMobilePreferences() { const mobile = mobileLayoutQuery.matches; document.body.dataset.mobileAim = mobileAimMode; $('#mobileAimStick').hidden = !mobile || mobileAimMode !== 'stick'; $('#mobileSettingsButton').hidden = !mobile; if (!mobile) $('#mobileSettings').hidden = true; renderer.setCameraMode(mobile && mobileCameraMode === 'fixed' ? 'fixed' : 'dynamic'); $$('#mobileSettings [data-mobile-aim]').forEach((button) => { const active = button.dataset.mobileAim === mobileAimMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); $$('#mobileSettings [data-mobile-camera]').forEach((button) => { const active = button.dataset.mobileCamera === mobileCameraMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); updateMobileAimReadout(); }
$('#mobileSettingsButton').onclick = () => { const panel = $('#mobileSettings'); panel.hidden = !panel.hidden; $('#mobileSettingsButton').setAttribute('aria-expanded', String(!panel.hidden)); audio.ui('open'); };
$('#mobileSettings').onclick = (event) => { const aimButton = event.target.closest('button[data-mobile-aim]'); const cameraButton = event.target.closest('button[data-mobile-camera]'); if (aimButton) { mobileAimMode = aimButton.dataset.mobileAim; localStorage.setItem('tankMobileAimMode', mobileAimMode); toast(mobileAimMode === 'stick' ? 'Mira: alavanca ativada' : 'Mira: arraste no cenário'); } else if (cameraButton) { mobileCameraMode = cameraButton.dataset.mobileCamera; localStorage.setItem('tankMobileCameraMode', mobileCameraMode); toast(mobileCameraMode === 'fixed' ? 'Zoom único: câmera manual' : 'Foco dinâmico ativado'); } else return; applyMobilePreferences(); audio.ui('select'); };
mobileLayoutQuery.addEventListener('change', applyMobilePreferences); applyMobilePreferences();
let stickPointerId = null;
function updateStickAim(event) { const ring = $('#aimStickRing'); const rect = ring.getBoundingClientRect(); const dx = event.clientX - rect.left - rect.width / 2; const dy = event.clientY - rect.top - rect.height / 2; const distance = Math.hypot(dx, dy); if (distance < 5) return; const radius = Math.max(12, rect.width / 2 - 16); setAimControls(Math.atan2(-dy, Math.max(5, Math.abs(dx))) * 180 / Math.PI, 100 + Math.min(1, distance / radius) * 480, dx < 0 ? -1 : 1); }
$('#aimStickRing').addEventListener('pointerdown', (event) => { if (mobileAimMode !== 'stick' || mobileAimLocked || game?.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId || game.shotEndsAt) return; event.preventDefault(); event.stopPropagation(); stickPointerId = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); $('#mobileAimStick').classList.add('engaged'); updateStickAim(event); });
$('#aimStickRing').addEventListener('pointermove', (event) => { if (stickPointerId === event.pointerId) { event.preventDefault(); updateStickAim(event); } });
for (const type of ['pointerup', 'pointercancel']) $('#aimStickRing').addEventListener(type, (event) => { if (stickPointerId !== event.pointerId) return; stickPointerId = null; $('#mobileAimStick').classList.remove('engaged'); });
$('#aimStickRing').addEventListener('keydown', (event) => { const changes = { ArrowUp: ['angle', 2], ArrowDown: ['angle', -2], ArrowRight: ['power', 20], ArrowLeft: ['power', -20] }; const change = changes[event.key]; if (!change || mobileAimLocked) return; event.preventDefault(); setAimControls(Number($('#angle').value) + (change[0] === 'angle' ? change[1] : 0), Number($('#power').value) + (change[0] === 'power' ? change[1] : 0)); });
$('#mobileAimStick').addEventListener('click', (event) => { const button = event.target.closest('[data-aim-adjust]'); if (!button || mobileAimLocked || game?.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId) return; const [kind, delta] = button.dataset.aimAdjust.split(':'); setAimControls(Number($('#angle').value) + (kind === 'angle' ? Number(delta) : 0), Number($('#power').value) + (kind === 'power' ? Number(delta) : 0)); audio.ui(); });
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
  const point = aimGesture?.pointerId === event.pointerId ? { x: (event.clientX - aimGesture.rect.left) * renderer.canvas.width / aimGesture.rect.width / aimGesture.camera.zoom + aimGesture.camera.x, y: (event.clientY - aimGesture.rect.top) * renderer.canvas.height / aimGesture.rect.height / aimGesture.camera.zoom + aimGesture.camera.y } : renderer.screenToWorld(event.clientX, event.clientY); const origin = renderer.renderPosition(me); const dx = point.x - origin.x; const dy = origin.y - point.y;
  aimDirection = dx < 0 ? -1 : 1;
  const angle = Math.max(aimMinimum(), Math.min(85, Math.round(Math.atan2(dy, Math.max(5, Math.abs(dx))) * 180 / Math.PI)));
  const power = Math.max(100, Math.min(580, Math.round(Math.hypot(dx, dy))));
  $('#angle').value = angle; $('#power').value = power; $('#angleValue').textContent = `${angle}°`; $('#powerValue').textContent = `${Math.round((power - 100) / 4.8)}%`;
  renderer.setAim({ angle, power, direction: aimDirection }); updateMobileAimReadout(); $('#aimCoach').classList.remove('visible');
  return { angle, power, direction: aimDirection };
}
let aimGesture = null;
const canvas = $('#gameCanvas');
const touchPointers = new Map();
let pinchGesture = null; let pinchConsumed = false; let pendingCanvasTap = null;
const pinchDistance = () => { const [first, second] = [...touchPointers.values()]; return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0; };
const pinchCenter = () => { const [first, second] = [...touchPointers.values()]; return first && second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : null; };
function cancelAimForPinch() {
  if (aimGesture?.initialAim) {
    const { angle, power, direction } = aimGesture.initialAim; aimDirection = direction;
    $('#angle').value = angle; $('#power').value = power; $('#angleValue').textContent = `${angle}°`; $('#powerValue').textContent = `${Math.round((power - 100) / 4.8)}%`;
    renderer.setAim({ angle, power, direction }); updateMobileAimReadout();
  }
  aiming = false; aimGesture = null; renderer.endAimDrag(); pendingCanvasTap = null;
}
function performCanvasTap(kind, event, targetedPower = null) {
  if (kind === 'vertical') { const token = renderer.activateVerticalShot(); if (token) send(CLIENT.ACTIVATE_VERTICAL, { token }); toast('ATIVAÇÃO VERTICAL!'); }
  else if (kind === 'cluster') { const token = renderer.activateClusterShot(); if (token) send(CLIENT.ACTIVATE_CLUSTER, { token }); toast('FRAGMENTAÇÃO: 3 MÍSSEIS!'); }
  else if (kind === 'fireworks') { const token = renderer.activateFireworksShot(); if (token) { send(CLIENT.ACTIVATE_FIREWORKS, { token }); toast('FOGOS DETONADOS NO AR!'); } }
  else if (kind === 'targeted') { const point = renderer.screenToWorld(event.clientX, event.clientY); send(CLIENT.USE_POWERUP, { type: targetedPower, x: point.x, y: point.y }); toast(targetedPower === 'trickster' ? 'Troca Sacana acionada' : targetedPower === 'teleport' ? 'Teleporte acionado' : 'Passo Relâmpago acionado'); }
  else if (kind === 'jump') { if (!mobileAimLocked && mobileAimMode === 'drag') updateAimFromPointer(event); activateJump(); }
}
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') {
    event.preventDefault(); touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.setPointerCapture(event.pointerId);
    if (touchPointers.size >= 2) {
      cancelAimForPinch(); pinchConsumed = true;
      pinchGesture = { distance: Math.max(1, pinchDistance()), zoom: renderer.userZoom, center: pinchCenter() };
      return;
    }
    if (pinchConsumed) return;
  }
  const deferTap = event.pointerType === 'touch';
  const tap = (kind, targetedPower = null) => { event.preventDefault(); if (deferTap) pendingCanvasTap = { pointerId: event.pointerId, kind, targetedPower }; else performCanvasTap(kind, event, targetedPower); };
  if (renderer.hasAwaitingVerticalShot()) { tap('vertical'); return; }
  if (renderer.hasAwaitingClusterShot()) { tap('cluster'); return; }
  if (renderer.hasAwaitingFireworksShot()) { tap('fireworks'); return; }
  if (game?.players[game.turnIndex]?.id !== playerId) return;
  const me = game.players.find((player) => player.id === playerId);
  const targetedPower = [...equippedPowers(me)].reverse().find((type) => ['lightningStep', 'teleport', 'trickster'].includes(type));
  if (targetedPower) { tap('targeted', targetedPower); return; }
  if (me?.airborne && !me.airborne.parachute) { tap('jump'); return; }
  if (selectedWeapon === 'jump' && !me?.airborne) { tap('jump'); return; }
  if (event.pointerType === 'touch' && mobileAimMode === 'stick') return;
  if (mobileAimLocked) { toast('Mira travada • pressione ATIRAR'); return; }
  event.preventDefault(); aiming = true; aimGesture = { pointerId: event.pointerId, rect: canvas.getBoundingClientRect(), camera: { ...renderer.camera }, initialAim: { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection } }; renderer.beginAimDrag(); canvas.setPointerCapture(event.pointerId); updateAimFromPointer(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchGesture && touchPointers.size >= 2) { event.preventDefault(); const center = pinchCenter(); renderer.setUserZoom(pinchGesture.zoom * pinchDistance() / pinchGesture.distance); renderer.panCamera(center.x - pinchGesture.center.x, center.y - pinchGesture.center.y); pinchGesture.center = center; return; }
    if (pinchConsumed) return;
  }
  if (aiming && aimGesture?.pointerId === event.pointerId) updateAimFromPointer(event);
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') {
    touchPointers.delete(event.pointerId);
    if (pinchConsumed) { if (touchPointers.size < 2) pinchGesture = null; if (!touchPointers.size) pinchConsumed = false; return; }
    if (pendingCanvasTap?.pointerId === event.pointerId) { const { kind, targetedPower } = pendingCanvasTap; pendingCanvasTap = null; performCanvasTap(kind, event, targetedPower); return; }
  }
  if (!aiming || aimGesture?.pointerId !== event.pointerId) return;
  updateAimFromPointer(event); aiming = false; aimGesture = null; renderer.endAimDrag(); localStorage.setItem('tankAimLearned', '1'); toast('Mira ajustada • pressione ATIRAR');
});
canvas.addEventListener('pointercancel', (event) => {
  if (event.pointerType === 'touch') { touchPointers.delete(event.pointerId); if (touchPointers.size < 2) pinchGesture = null; if (!touchPointers.size) pinchConsumed = false; }
  if (pendingCanvasTap?.pointerId === event.pointerId) pendingCanvasTap = null;
  if (aimGesture?.pointerId !== event.pointerId) return; aiming = false; aimGesture = null; renderer.endAimDrag();
});
$('#gameCanvas').addEventListener('wheel', (event) => { event.preventDefault(); renderer.adjustZoom(event.deltaY < 0 ? .1 : -.1); }, { passive: false });
$('#zoomOut').onclick = () => renderer.adjustZoom(-.16); $('#zoomIn').onclick = () => renderer.adjustZoom(.16); $('#zoomFit').onclick = () => { renderer.fitWorld(); toast('Mapa completo'); };
$('#locatePlayer').onclick = () => { if (renderer.focusOwnPlayer()) { audio.ui('select'); toast('Seu tanque está no centro da tela.'); } else toast('Seu tanque não está disponível.'); };
$('#inventoryBar').addEventListener('click', (event) => { const button = event.target.closest('[data-powerup]'); if (!button || !game || game.players[game.turnIndex]?.id !== playerId) return; const me = game.players.find((player) => player.id === playerId); if (me?.powerupBlockedTurns > 0) { toast('PANE ELÉTRICA • powerups bloqueados neste turno'); return; } send(CLIENT.SELECT_POWERUP, { type: button.dataset.powerup }); audio.ui('select'); });
let arsenalViewedIndex = 0;
const arsenalButtons = () => [...document.querySelectorAll('#weaponSelector .weapon')];
function refreshArsenalPicker() {
  const picker = $('#arsenalPicker'); const selector = $('#weaponSelector'); const slider = $('#arsenalSlider');
  const buttons = arsenalButtons(); const last = Math.max(0, buttons.length - 1);
  arsenalViewedIndex = Math.min(arsenalViewedIndex, last);
  slider.max = String(last); slider.value = String(arsenalViewedIndex);
  picker.classList.toggle('has-overflow', selector.scrollWidth > selector.clientWidth + 3);
  $('#arsenalPrev').disabled = arsenalViewedIndex <= 0;
  $('#arsenalNext').disabled = arsenalViewedIndex >= last;
}
function showArsenalIndex(index) {
  const selector = $('#weaponSelector'); const buttons = arsenalButtons();
  arsenalViewedIndex = Math.max(0, Math.min(buttons.length - 1, index));
  const button = buttons[arsenalViewedIndex]; if (!button) return;
  const item = button.getBoundingClientRect(); const track = selector.getBoundingClientRect();
  selector.scrollBy({ left: item.left + item.width / 2 - track.left - track.width / 2, behavior: 'smooth' });
  if (!button.disabled) button.click();
  refreshArsenalPicker();
}
$('#weaponSelector').addEventListener('click', (event) => { const button = event.target.closest('.weapon'); if (!button || button.disabled) return; clearAimAssist(); selectedWeapon = selectedWeapon === button.dataset.weapon ? null : button.dataset.weapon; renderer.setMovementMode(selectedWeapon || 'standard'); $$('.weapon').forEach((item) => item.classList.toggle('active', item.dataset.weapon === selectedWeapon)); updateComboPreview(); updateFireButton(); audio.ui(); arsenalViewedIndex = arsenalButtons().indexOf(button); refreshArsenalPicker(); });
$('#arsenalPrev').addEventListener('click', () => showArsenalIndex(arsenalViewedIndex - 1));
$('#arsenalNext').addEventListener('click', () => showArsenalIndex(arsenalViewedIndex + 1));
$('#arsenalSlider').addEventListener('input', (event) => showArsenalIndex(Number(event.target.value)));
let arsenalScrollTimer;
$('#weaponSelector').addEventListener('scroll', () => {
  clearTimeout(arsenalScrollTimer);
  arsenalScrollTimer = setTimeout(() => {
    const track = $('#weaponSelector').getBoundingClientRect(); const center = track.left + track.width / 2;
    const buttons = arsenalButtons(); if (!buttons.length) return;
    arsenalViewedIndex = buttons.reduce((best, button, index) => Math.abs(button.getBoundingClientRect().left + button.offsetWidth / 2 - center) < Math.abs(buttons[best].getBoundingClientRect().left + buttons[best].offsetWidth / 2 - center) ? index : best, 0);
    refreshArsenalPicker();
  }, 80);
});
window.addEventListener('resize', () => requestAnimationFrame(refreshArsenalPicker));
function updateComboPreview() {
  const me = game?.players.find((player) => player.id === playerId); const preview = $('#comboPreview');
  if (!me || !selectedWeapon || game.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId) { preview.hidden = true; return; }
  const powers = equippedPowers(me).filter((type) => selectedWeapon === 'standard' || supportsWeaponCombo(type, selectedWeapon));
  const weaponName = ARSENAL_DEFS[selectedWeapon]?.name || 'TIRO PADRÃO';
  const passive = classPassiveStatus(me);
  preview.hidden = selectedWeapon === 'standard' && powers.length === 0 && !passive;
  preview.innerHTML = `<small>PRÓXIMA AÇÃO</small><strong>${escapeHtml(weaponName)}</strong>${powers.length ? `<span>+ ${powers.map((type) => escapeHtml(POWERUP_DEFS[type]?.name || type)).join(' + ')}</span>` : ''}${passive ? `<em>${escapeHtml(CLASS_DEFS[me.classType]?.name || 'CLASSE')}: ${escapeHtml(passive)}</em>` : ''}`;
}
function classPassiveStatus(player) {
  if (!player?.classType) return '';
  if (player.teslaDisabledTurns > 0) return 'TESLA: passiva desativada neste turno; apenas movimento normal';
  const round = game?.roundNumber || 1; const safe = round - (player.lastDamageRound || 0);
  if (player.classType === 'armored') return `${Math.min(2, safe)}/2 rodadas sem dano • escudo próprio e de aliados a cada 2 rodadas`;
  if (player.classType === 'attacker') return 'tiros perfurantes • bônus de dano por vida máxima';
  if (player.classType === 'bomber') return '+15 dano e +18 alcance explosivo • resistência ativa';
  if (player.classType === 'healer') return '5 HP por turno • aura +8 HP em aliados próximos';
  if (player.classType === 'meteorologist') return `${round < 2 ? 'Haste desbloqueia na rodada 2' : 'Haste recarrega a cada 3 rodadas'} • proteção contra eventos`;
  if (player.classType === 'ninja') return `${Math.min(2, safe)}/2 rodadas até invisibilidade • Arrancada a cada 2 rodadas`;
  if (player.classType === 'saboteur') return `Tesla a cada rodada • pulso de 760 blocos na rodada ${round + (3 - round % 3)}`;
  return 'atrai powerups revelados em 270 blocos • compartilha com aliados • arsenal próprio e aliado recarrega';
}
addEventListener('keydown', (e) => {
  if (!game || game.phase !== 'playing') return;
  if ((e.key === 't' || e.key === 'T') && document.activeElement !== $('#chatInput')) { e.preventDefault(); $('#chatPanel').classList.add('open'); $('#chatInput').focus(); return; }
  if (document.activeElement === $('#chatInput')) { if (e.key === 'Escape') { $('#chatInput').blur(); $('#chatPanel').classList.remove('open'); } return; }
  if (e.key === 'Enter' && (selectedWeapon === 'jump' || game.players.find((player) => player.id === playerId)?.airborne)) { e.preventDefault(); activateJump(); return; }
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) { if (!e.repeat) movementSound(); send(CLIENT.MOVE, movementPayload(-1)); } if (['ArrowRight', 'd', 'D'].includes(e.key)) { if (!e.repeat) movementSound(); send(CLIENT.MOVE, movementPayload(1)); } if (e.code === 'Space') { e.preventDefault(); if (game.players.find((player) => player.id === playerId)?.airborne && !renderer.hasAwaitingVerticalShot() && !renderer.hasAwaitingClusterShot() && !renderer.hasAwaitingFireworksShot()) activateJump(); else fireSelectedWeapon(); }
});

const tutorialSteps = [
  { icon: '♛', title: 'Seja o último tanque', text: 'Todo o campo é formado por microblocos. Explosões arrancam blocos do terreno, empurram tanques e podem abrir uma queda fatal.', tip: 'Tanques, bots e jogadores seguem exatamente as mesmas regras físicas.' },
  { icon: '▣', title: 'Crie sua sala', text: 'Na tela inicial, abra CRIAR SALA. Escolha codinome, quantidade de jogadores e bots, dificuldade da IA, bioma, vida, duração do turno, rodadas e modo. Você também pode ligar ou desligar classes, eventos e powerups.', tip: 'Toque em CRIAR CAMPO DE BATALHA. Use PARTIDA RÁPIDA para preencher uma configuração simples com um bot.' },
  { icon: '⌘', title: 'Convide amigos online', text: 'Na sala, toque em CONVIDAR AMIGOS para copiar o link ou compartilhá-lo no celular. O link abre ENTRAR com o código preenchido: seu amigo só precisa escolher um codinome. Você ainda pode tocar no CÓDIGO para copiá-lo separadamente.', tip: 'Todos precisam acessar o mesmo servidor. Também é possível entrar como espectador pelo botão ASSISTIR. Uma sala precisa de pelo menos dois tanques, incluindo bots.' },
  { icon: '◇◆', title: 'Escolha um modo', text: 'Cada um por si: cada tanque luta pela própria vitória. Coop: humanos enfrentam bots juntos. VS Equipes: tanques são distribuídos entre dois a quatro times. O anfitrião escolhe o modo antes de criar a sala.', tip: 'No Coop é necessário incluir pelo menos um bot. Em modos de equipe, aliados não recebem dano dos companheiros.' },
  { icon: '♨', title: 'Modos com objetivos', text: 'Rei da Colina: ocupe sozinho a zona dourada para pontuar. Domínio por Equipes: aliados dividem os pontos da colina. Sobrevivência: a lava sobe a cada rodada e elimina quem for alcançado.', tip: 'Na colina, o objetivo é chegar a quatro pontos. No Sobrevivência, olhe a previsão da próxima maré antes de se mover.' },
  { icon: '◆', title: 'Prepare-se no saguão', text: 'Antes da partida, cada jogador escolhe sua classe passiva e depois três cartas do arsenal no saguão. Confirme as duas escolhas e marque Pronto. Os bots ficam prontos automaticamente.', tip: 'Quando todos estiverem prontos, a tela de sorteio aparece imediatamente com 10 segundos de contagem antes do primeiro turno. Salas sem classes pulam essa escolha.' },
  { icon: '↻', title: 'Entenda seu turno', text: 'Em cada turno você pode mover e atirar, ou usar dois movimentos. O cronômetro encerra o turno automaticamente quando chega a zero.', tip: 'A moldura verde e a seta mostram qual tanque está ativo.' },
  { icon: '◀ ▶', title: 'Escolha sua posição', text: 'Use A/D, as setas do teclado ou os botões na tela. O tanque acompanha subidas e descidas suaves, mas para diante de paredes muito íngremes.', tip: 'Plataformas com luz azul e a marca MÓVEL se deslocam e carregam o tanque que estiver apoiado nelas.' },
  { icon: '⌁', title: 'Controle a mira', text: 'Toque e arraste diretamente no campo, no celular ou desktop. O lado define a direção, a altura define o ângulo e a distância define a força. A câmera abre o enquadramento quando a trajetória precisa de mais espaço.', tip: 'A mira preserva direção, ângulo e força do seu último tiro. TRAVAR MIRA protege os três valores contra toques acidentais.' },
  { icon: '◎', title: 'Acerte as três partes do tanque', text: 'O tanque tem base (esteiras), centro (blindagem) e cabeça (torre). Um acerto direto do tiro PADRÃO causa 20–30 na base, 50 no centro e 60–80 na cabeça, como crítico.', tip: 'Bônus de classe, escudos e efeitos combinados ainda podem alterar o dano final exibido sobre o alvo.' },
  { icon: '✦', title: 'Combine seu arsenal', text: 'O arsenal começa sem arma ativa em cada turno: toque numa carta, até mesmo PADRÃO, antes de atirar. Você pode equipar vários powerups juntos; Dupla, Tripla, Espelho e outros efeitos combinam.', tip: 'Toque novamente na carta da arma para desmarcá-la. Powerups equipados podem ser removidos tocando na carta do inventário.' },
  { icon: '▧', title: 'Encontre e use poderes', text: 'As três cartas do arsenal são escolhidas antes da partida e aparecem perto do botão ATIRAR. Powerups extras ficam enterrados: tiros e explosões os revelam, e balas, explosões ou tanques podem coletá-los. Os coletados aparecem no inventário do HUD.', tip: 'Toque em uma ou mais cartas do inventário para equipar efeitos no próximo disparo. Abra a BIBLIOTECA na tela inicial para ver todas as cartas, danos e eventos.' },
  { icon: '✹', title: 'Disparos de duas etapas', text: 'A Fragmentária lança uma cápsula violeta. Enquanto ela voa, toque no cenário, aperte ATIRAR ou Espaço novamente para soltá-la em três mísseis. A Carga Sísmica marca o solo vermelho e detona após 2 segundos.', tip: `Exclusivo do Atacante: o Mega Canhão aparece automaticamente ao acumular ${MEGA_CANNON_CHARGE} pontos de destruição. Cada eliminação rende 250 pontos para a classe.` },
  { icon: '⚡', title: 'Domine os combos de movimento', text: 'Depois do Pulo, selecione a Investida Blindada ou equipe a Arrancada Foguete e use uma seta para ganhar outro impulso no ar.', tip: 'Pulo + Investida + Arrancada gera o impulso máximo e ainda permite atirar durante o voo.' },
  { icon: '⚙', title: 'Pontue destruindo', text: 'Microblocos, barris, plataformas, concreto, prédios, guindastes e tanques concedem pontuações diferentes ao responsável pela destruição.', tip: 'Depósitos dourados soltam dois itens ao quebrar. Bobinas azuis emitem um pulso elétrico que causa dano e bloqueia poderes próximos.' },
  { icon: '⌁', title: 'A arena evolui', text: 'A cada três turnos ocorre um evento. Helicópteros entregam suprimentos, miras anunciam bombardeios, raios bloqueiam powerups e fossos podem entrar em erupção.', tip: 'Observe as marcações no terreno: todo evento mostra onde e quando seu efeito acontecerá.' },
  { icon: '◇◆', title: 'Coop ou VS Equipes', text: 'COOP une os humanos contra os bots. VS EQUIPES distribui jogadores e bots automaticamente entre 2, 3 ou 4 times balanceados.', tip: 'Aliados não recebem seus danos. A equipe vence quando é a última com pelo menos um tanque vivo.' },
  { icon: '↑', title: 'Evolua sua classe', text: 'Nos marcos de um terço e dois terços da partida, quem usa classe escolhe um bônus permanente: +30 de vida máxima e cura imediata, ou +6 de dano em cada acerto contra inimigos. É possível repetir a escolha.', tip: 'A evolução aparece no centro da arena e pode ser selecionada mesmo fora do seu turno.' },
  { icon: '♨', title: 'Sobreviva à maré de lava', text: 'No modo Sobrevivência, a lava sobe ao começo de cada rodada e destrói qualquer tanque que toque nela. A subida acelera perto do fim.', tip: 'Observe a previsão do próximo nível no HUD e procure plataformas altas antes da rodada virar.' },
  { icon: '◆', title: 'Domine em equipe', text: 'No modo Domínio por Equipes, aliados somam um ponto por rodada quando ocupam a colina sem inimigos. Vence a primeira equipe com quatro pontos ou a última sobrevivente.', tip: 'Dois aliados juntos ainda rendem um ponto; um rival na zona contesta a captura.' },
  { icon: '◎', title: 'Controles mobile', text: 'Em ⚙, escolha entre arrastar um dedo no cenário ou usar a alavanca para mirar. A pinça de dois dedos ajusta o zoom. FOCO DINÂMICO acompanha tiros e eventos; ZOOM ÚNICO mantém o enquadramento manual.', tip: 'No ZOOM ÚNICO, deslize dois dedos para percorrer o mapa. Use ⛶ para ampliar o palco; no iPhone, abra pela Tela de Início para ocultar as barras do navegador.' },
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

const trainingSteps = [
  { title: 'BEM-VINDO À ARENA', text: 'Esta é uma partida de treino contra um bot fácil. Você já tem a classe Blindado e três cartas: Obus, Zeus e Pulo. Quando aparecer SEU TURNO, comece.', target: '#turnTimer' },
  { title: 'ENCONTRE SEU TANQUE', text: 'Seu tanque tem o marcador VOCÊ. Use o botão VOCÊ ao lado do zoom para centralizar a câmera. A barrinha acima dele mostra a vida.', target: '#locatePlayer' },
  { title: 'MOVA-SE', text: 'Use A/D, as setas ou os botões ◀ ▶. Cada turno tem movimentos limitados. Inclinações podem ser escaladas, mas buracos e lava eliminam o tanque.', target: '.movement' },
  { title: 'MIRE E AJUSTE A FORÇA', text: 'Arraste no cenário para escolher direção, ângulo e força. No computador, use também os controles abaixo. A linha pontilhada prevê a trajetória com o vento; ASSIST sugere uma mira.', target: '#aimAssistButton' },
  { title: 'ESCOLHA O ARSENAL', text: 'Toque numa carta próxima ao botão ATIRAR: Padrão é ilimitado; Obus causa mais dano após voar longe; Zeus chama um raio; Pulo é movimento. As cartas especiais têm munição.', target: '#arsenalPicker' },
  { title: 'ATIRE E OBSERVE', text: 'Toque ATIRAR ou pressione Espaço. Espere a bala concluir o percurso e a explosão terminar. A câmera acompanha a ação no modo dinâmico. Você pode PASSAR a vez.', target: '#fireButton' },
  { title: 'COLETE E COMBINE POWERUPS', text: 'Itens enterrados surgem quando o solo é destruído. Encoste neles, passe com uma bala ou atinja-os com explosões. A carta aparece no centro e fica no HUD; toque em vários modificadores para combiná-los com seu tiro.', target: '#inventoryBar' },
  { title: 'EVENTOS, CURA E VITÓRIA', text: 'Ao avançar as rodadas, eventos atingem terreno, estruturas e tanques. Estações verdes curam 40 HP ao entrar na área; barris vermelhos explodem e incendeiam. Destrua o bot ou vença por pontuação até o limite de rodadas.', target: '#roundNumber' },
];
function renderTrainingCoach() {
  const enabled = Boolean(game?.training && game.phase === 'playing');
  $$('.training-highlight').forEach((element) => element.classList.remove('training-highlight'));
  $('#trainingHelp').hidden = !enabled;
  $('#trainingCoach').hidden = !enabled || !trainingOpen;
  if (!enabled || !trainingOpen) return;
  const step = trainingSteps[trainingStep];
  $(step.target)?.classList.add('training-highlight');
  $('#trainingProgress').textContent = `TREINO ${trainingStep + 1}/${trainingSteps.length}`;
  $('#trainingTitle').textContent = step.title; $('#trainingText').textContent = step.text;
  $('#trainingPrev').disabled = trainingStep === 0;
  $('#trainingNext').textContent = trainingStep === trainingSteps.length - 1 ? 'CONCLUIR ✓' : 'PRÓXIMO →';
}
$('#trainingHelp').onclick = () => { trainingOpen = !trainingOpen; renderTrainingCoach(); };
$('#trainingClose').onclick = () => { trainingOpen = false; renderTrainingCoach(); };
$('#trainingPrev').onclick = () => { trainingStep = Math.max(0, trainingStep - 1); renderTrainingCoach(); };
$('#trainingNext').onclick = () => { if (trainingStep === trainingSteps.length - 1) trainingOpen = false; else trainingStep += 1; renderTrainingCoach(); };
net.on('status', ({ online }) => { $('.status').classList.toggle('online', online); $('#connectionText').textContent = online ? 'servidor online' : 'reconectando'; if (online && room && sessionStorage.getItem('tankToken')) send(CLIENT.JOIN_ROOM, { code: room.code, token: sessionStorage.getItem('tankToken') }); else if (online && room && sessionStorage.getItem('tankSpectatorToken')) send(CLIENT.WATCH_ROOM, { code: room.code, token: sessionStorage.getItem('tankSpectatorToken') }); });
net.on(SERVER.WELCOME, (data) => { if (data.playerId) { spectatorMode = false; playerId = data.playerId; renderer.setPlayer(playerId); sessionStorage.setItem('tankPlayerId', data.playerId); sessionStorage.setItem('tankToken', data.token); } else if (data.spectator) { spectatorMode = true; playerId = null; renderer.setPlayer(null); sessionStorage.removeItem('tankPlayerId'); sessionStorage.removeItem('tankToken'); sessionStorage.setItem('tankSpectatorToken', data.token); document.body.classList.add('spectating'); $('#spectatorBadge').hidden = false; } });
net.on(SERVER.ERROR, ({ message }) => { fireRequestPending = false; clearTimeout(fireRequestTimer); updateFireButton(); toast(message); });
net.on(SERVER.CHAT, (message) => { chatHistory.push(message); if (chatHistory.length > 40) chatHistory.shift(); $('#chatMessages').innerHTML = chatHistory.map((entry) => `<div><b style="color:${entry.color}">${escapeHtml(entry.nickname)}</b><span>${escapeHtml(entry.text)}</span></div>`).join(''); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; $('#chatPanel').classList.add('has-message'); setTimeout(() => $('#chatPanel').classList.remove('has-message'), 5000); });
net.on(SERVER.ROOM_STATE, (state) => { room = state; sessionStorage.setItem('tankRoomCode', state.code); renderRoom(); if (state.phase === 'lobby') { game = null; screen('roomScreen'); } });
net.on(SERVER.GAME_STATE, (state) => {
  if (state.training && state.seed !== trainingSeed) { trainingSeed = state.seed; trainingStep = 0; trainingOpen = true; }
  if (combatSeed !== state.seed) { combatSeed = state.seed; combatEntries.length = 0; deferredPickup = null; selectedWeapon = null; lastTurn = null; renderer.setMovementMode('standard'); $$('.weapon').forEach((button) => button.classList.remove('active')); $('#combatFeedEntries').innerHTML = ''; }
  if (Number.isFinite(state.serverTime)) serverClockOffset = state.serverTime - Date.now();
  const before = game?.players.find((player) => player.id === playerId); const after = state.players.find((player) => player.id === playerId);
  const previousLavaRiseSerial = game?.survival?.lastRise?.serial;
  const shotSoundPending = audio.usingMobileAudio() && renderer.shots.some((shot) => !shot.exploded);
  if (game) for (const nextPlayer of state.players) { const previousPlayer = game.players.find((entry) => entry.id === nextPlayer.id); if (!previousPlayer) continue; if (nextPlayer.health < previousPlayer.health && nextPlayer.alive && !shotSoundPending) audio.damage(previousPlayer.health - nextPlayer.health); if (previousPlayer.alive && !nextPlayer.alive) { if (!shotSoundPending) audio.destroyed(); addCombatEntry(`${nextPlayer.nickname} foi eliminado`, 'danger'); } if (nextPlayer.health > previousPlayer.health && nextPlayer.regenTurns >= 0 && !shotSoundPending) audio.status('heal'); if ((nextPlayer.frozenTurns || 0) > (previousPlayer.frozenTurns || 0) && !shotSoundPending) audio.status('freeze'); }
  if (before && after && after.health < before.health) mobileVibrate(after.alive ? [18, 25, 22] : [45, 30, 70, 35, 100]);
  if (before && after && (after.stats?.destruction || 0) > (before.stats?.destruction || 0)) { const gain = (after.stats?.destruction || 0) - (before.stats?.destruction || 0); const type = after.lastDestruction?.type; $('#destructionRecent').textContent = `+${gain} ${DESTRUCTION_LABELS[type] || ''}`; $('#destructionCard').classList.remove('bump'); void $('#destructionCard').offsetWidth; $('#destructionCard').classList.add('bump'); clearTimeout(destructionTimer); destructionTimer = setTimeout(() => { $('#destructionRecent').textContent = ''; $('#destructionCard').classList.remove('bump'); }, 2200); mobileVibrate([8, 24, 12]); }
  if (before && after && after.lastPickup?.serial && after.lastPickup.serial !== before.lastPickup?.serial) { const pickup = { type: after.lastPickup.type, player: structuredClone(after) }; mobileVibrate([10, 35, 15]); renderer.spawnPickupEffect(after, pickup.type); renderer.whenBattleAnimationsComplete(() => { audio.pickup(pickup.type); showPickup(pickup.type, pickup.player); }); }
  if (before && after?.lastLaunch?.serial && after.lastLaunch.serial !== before.lastLaunch?.serial) { if (after.lastLaunch.kind === 'armoredDash') { audio.armoredDash(after.lastLaunch.wallsDestroyed || 0, after.lastLaunch.hitPlayerIds?.length || 0); mobileVibrate([22, 14, 34, 12, 58]); } else audio.launch(after.lastLaunch.kind || 'jump'); }
  if (game) for (const nextPlayer of state.players) { const previous = game.players.find((player) => player.id === nextPlayer.id); if (!previous) continue; if (nextPlayer.lastMove?.serial && nextPlayer.lastMove.serial !== previous.lastMove?.serial) { if (nextPlayer.lastMove.kind === 'excavator') audio.power('excavator'); else if (nextPlayer.lastMove.kind === 'rocketDash') audio.launch('rocketDash'); else audio.move('tracks'); } if (nextPlayer.lastJump?.serial && nextPlayer.lastJump.serial !== previous.lastJump?.serial) audio.launch(nextPlayer.lastJump.kind); }
  if (before && after?.lastAirBoost?.serial && after.lastAirBoost.serial !== before.lastAirBoost?.serial) { audio.launch(after.lastAirBoost.kind); mobileVibrate(after.lastAirBoost.kind === 'doubleDash' ? [22, 18, 38, 18, 60] : [18, 16, 38]); }
  if (before && after?.lastBlink?.serial && after.lastBlink.serial !== before.lastBlink?.serial) { audio.teleport(0); renderer.spawnTeleport(after.lastBlink); }
  const arenaEvent = state.events?.at(-1); const arenaEventKey = arenaEvent ? `${arenaEvent.id}:${arenaEvent.warning ? 'warning' : 'impact'}` : null;
  const newArenaEvent = Boolean(arenaEvent && arenaEventKey !== lastArenaEventKey);
  const previousGame = game;
  if (state.lastRodPulse?.serial && state.lastRodPulse.serial !== previousGame?.lastRodPulse?.serial && previousGame?.seed === state.seed) { audio.status('electric'); mobileVibrate([12, 20, 18]); }
  if ((state.lastSaboteurPulses || []).some((pulse) => pulse.serial > Math.max(0, ...(previousGame?.lastSaboteurPulses || []).map((entry) => entry.serial))) && previousGame?.seed === state.seed) { audio.status('electric'); mobileVibrate([18, 26, 20]); }
  game = state; renderer.setGame(state, { deferWorld: newArenaEvent && !arenaEvent.warning }); renderRewardOffer(); renderClassEvolution();
  for (const player of state.players) {
    const previous = previousGame?.players.find((entry) => entry.id === player.id); if (!previous) continue;
    if (player.lastRevive?.serial && player.lastRevive.serial !== previous.lastRevive?.serial) { const revival = { ...player.lastRevive, playerId: player.id }; renderer.whenBattleAnimationsComplete(() => { renderer.spawnReviveEffect(revival); audio.teleport(); if (player.id === playerId) mobileVibrate([20, 35, 28, 35, 55]); }); addCombatEntry(`${player.nickname} renasceu com ${player.health} HP`, 'hit'); }
    if (player.lastSalvage?.serial && player.lastSalvage.serial !== previous.lastSalvage?.serial) { renderer.spawnSalvageHeal(player.lastSalvage); audio.status('heal'); addCombatEntry(`${player.nickname} reciclou destruição: +${player.lastSalvage.healed} HP`, 'hit'); }
  }
  if (state.survival?.lastRise?.serial !== previousLavaRiseSerial && state.survival?.lastRise?.from > state.survival?.lastRise?.to) showSurvivalRise(state.survival.lastRise);
  if (arenaEvent && arenaEventKey !== lastArenaEventKey) { lastArenaEventKey = arenaEventKey; renderer.playArenaEvent(arenaEvent, gameNow()); audio.arena(arenaEvent.type, arenaEvent.warning); mobileVibrate(arenaEvent.warning ? [12, 80, 12] : arenaEvent.type === 'lightning' ? [18, 18, 18, 18, 55] : [35, 28, 75]); showArenaAlert(arenaEvent); addCombatEntry(`${arenaEvent.warning ? 'Atenção' : 'Impacto'}: ${EVENT_DEFS[arenaEvent.type]?.name || arenaEvent.type}`, arenaEvent.warning ? 'warning' : 'danger'); }
  const sequence = ++resultSequence;
  if (state.phase === 'finished') { screen('gameScreen'); renderHud(); renderer.whenBattleAnimationsComplete(() => { if (sequence === resultSequence && game?.phase === 'finished') renderResult(); }); }
  else if (state.phase === 'class' || state.phase === 'arsenal') { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; const stage = state.phase; const saved = stage === 'class' ? savedClassSeed : savedArsenalSeed; if (!spectatorMode && saved !== state.seed) { if ($('#arsenalModal').hidden || $('#arsenalModal').dataset.stage !== stage || $('#arsenalModal').dataset.timed !== 'true') openArsenal(true, stage); } else { $('#arsenalModal').hidden = true; renderHud(); } }
  else if (state.phase === 'roulette') { resultSoundPlayed = false; screen('gameScreen'); $('#arsenalModal').hidden = true; renderRoulette(state); }
  else { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; clearInterval(rouletteTimer); renderHud(); }
  renderTrainingCoach();
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
  fireRequestPending = false; clearTimeout(fireRequestTimer); updateFireButton();
  renderer.playShot(result); const first = result.results?.[0]; const flight = renderer.shotDuration(result);
  if (result.replaceFireworks) { audio.fireworksBurst(); return; }
  if (result.detonation) { if (!audio.usingMobileAudio()) audio.detonation(first?.weapon); return; }
  if (result.replaceCluster) { clearTimeout(clusterImpactTimer); clusterImpactTimer = null; audio.clusterSplit(); const impact = Math.min(...(result.results || []).filter((shot) => shot.impact).map((shot) => shot.path.length / SHOT_PATH_RATE / (game?.speed || 1))); if (Number.isFinite(impact)) audio.shoot(impact, 'cluster', result.results.some((shot) => shot.damage?.some((hit) => hit.amount > 0)) ? 1 : 0, { ...first, hasImpact: true }); return; }
  const shotTime = (shot) => Math.max(.08, (shot.path.length - (result.replaceVertical ? shot.activationIndex || 0 : 0)) / SHOT_PATH_RATE / (game?.speed || 1) / (shot.canActivateCluster ? CLUSTER_CAPSULE_SPEED : 1) + (shot.mirrorDelay || 0));
  const impacts = (result.results || []).filter((shot) => shot.impact);
  const audibleImpact = impacts.sort((a, b) => shotTime(a) - shotTime(b))[0]; const impactAt = audibleImpact ? shotTime(audibleImpact) : flight;
  const shooter = game?.players.find((player) => player.id === result.shooterId); const hitTotals = new Map(); for (const shot of result.results || []) for (const hit of shot.damage || []) if (hit.amount > 0) hitTotals.set(hit.playerId, (hitTotals.get(hit.playerId) || 0) + hit.amount);
  const summary = [...hitTotals].map(([id, amount]) => `${game?.players.find((player) => player.id === id)?.nickname || 'tanque'} −${amount} HP`).join(' • ');
  addCombatEntry(`${first?.concealed ? 'Disparo oculto' : shooter?.nickname || 'Tanque'}: ${ARSENAL_DEFS[first?.weapon]?.name || 'TIRO PADRÃO'}${summary ? ` • ${summary}` : ' • sem dano'}`, summary ? 'hit' : 'neutral');
  const hits = result.results?.reduce((sum, shot) => sum + shot.damage.filter((entry) => entry.amount > 0).length, 0) || 0;
  if (!first?.concealed) { if (result.replaceVertical) audio.vertical(impactAt, hits, Boolean(audibleImpact)); else audio.shoot(impactAt, first?.weapon || 'standard', hits, { ...first, hasImpact: Boolean(audibleImpact) && !first?.delayedStrike && !first?.canActivateCluster && !first?.canActivateFireworks }); if (first?.canActivateCluster && audibleImpact && !audio.usingMobileAudio()) { clearTimeout(clusterImpactTimer); clusterImpactTimer = setTimeout(() => { audio.clusterImpact(); clusterImpactTimer = null; }, impactAt * 1000); } }
  if (!audio.usingMobileAudio()) { const teleportedShot = result.results?.find((shot) => shot.teleport); if (teleportedShot && !teleportedShot.concealed) audio.teleport(shotTime(teleportedShot));
    const scenarioShot = result.results?.find((shot) => shot.interactions?.length && !shot.concealed); if (scenarioShot) { const interaction = scenarioShot.interactions.find((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y)); const nearest = interaction && scenarioShot.path.reduce((best, point, index) => { const distance = Math.hypot(point.x - interaction.x, point.y - interaction.y); return distance < best.distance ? { distance, index } : best; }, { distance: Infinity, index: 0 }); audio.scenario(nearest ? Math.max(0, nearest.index / SHOT_PATH_RATE / (game?.speed || 1) + (scenarioShot.mirrorDelay || 0)) : shotTime(scenarioShot)); } }
  clearTimeout(focusTimer); $('#gameScreen').classList.add('focus'); focusTimer = setTimeout(() => $('#gameScreen').classList.remove('focus'), (flight + .85) * 1000);
});

function renderRoom() {
  $('#roomName').textContent = room.name; $('#roomCode').textContent = room.code; $('#playerCount').textContent = `${room.players.length} / ${room.rules.maxPlayers}`;
  $('#lobbyIntro').textContent = `Escolha ${room.rules.classesEnabled ? 'sua classe e ' : ''}três cartas de arsenal. Quando todos estiverem prontos, o sorteio começa com 10 segundos de contagem.`;
  $('#roster').innerHTML = room.players.map((p) => {
    const className = room.rules.classesEnabled ? p.classSelected ? CLASS_DEFS[p.classType]?.name || 'CLASSE' : 'CLASSE PENDENTE' : 'SEM CLASSE';
    const arsenalName = p.arsenalSelected ? (p.arsenal || []).map((type) => ARSENAL_DEFS[type]?.short || type).join(' · ') : 'ARSENAL PENDENTE';
    const role = p.isBot ? `BOT · ${({ aggressive: 'AGRESSIVO', collector: 'COLETOR', defensive: 'DEFENSIVO', demolisher: 'DEMOLIDOR', support: 'SUPORTE' })[p.personality] || 'IA'}` : p.id === room.hostId ? 'ANFITRIÃO' : 'JOGADOR';
    return `<div class="player-card ${p.ready ? 'ready' : 'pending'}" style="--color:${p.color}"><span class="tank-avatar"></span><div class="player-card-copy"><strong>${escapeHtml(p.nickname)}</strong><small>${role} · ${className}</small><em>${escapeHtml(arsenalName)}</em></div><span class="player-ready">${p.ready ? '✓ PRONTO' : p.connected ? 'PREPARANDO' : 'DESCONECTADO'}</span></div>`;
  }).join('');
  const labels = { gameMode: 'Modo', teamCount: 'Equipes', maxPlayers: 'Jogadores', botCount: 'Bots', botDifficulty: 'Dificuldade IA', health: 'Vida inicial', turnSeconds: 'Tempo de turno', gameSpeed: 'Velocidade', roundLimit: 'Limite de rodadas', mapType: 'Bioma', seed: 'Semente', powerupCount: 'Powerups', classesEnabled: 'Classes', enabledEvents: 'Eventos', enabledPowerups: 'Tipos de powerup', mines: 'Minas', gravity: 'Gravidade' };
  const difficultyNames = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };
  $('#rulesList').innerHTML = Object.entries(labels).filter(([key]) => key !== 'teamCount' || ['teams', 'teamHill'].includes(room.rules.gameMode)).map(([key, label]) => `<div><dt>${label}</dt><dd>${room.rules[key] === true ? 'ATIVADAS' : room.rules[key] === false ? 'DESATIVADAS' : Array.isArray(room.rules[key]) ? `${room.rules[key].length} HABILITADOS` : key === 'seed' && !room.rules.seed ? 'ALEATÓRIA' : key === 'mapType' ? BIOMES[room.rules.mapType]?.name || 'ALEATÓRIO' : key === 'botDifficulty' ? difficultyNames[room.rules[key]] : key === 'gameMode' ? ({ coop: 'COOP', teams: 'VS EQUIPES', teamHill: 'DOMÍNIO POR EQUIPES', ffa: 'CADA UM POR SI', hill: 'REI DA COLINA', survival: 'SOBREVIVÊNCIA' }[room.rules[key]]) : key === 'teamCount' ? `${room.rules[key]} EQUIPES` : escapeHtml(String(room.rules[key]))}</dd></div>`).join('');
  const me = room.players.find((player) => player.id === playerId); const host = playerId === room.hostId; const readyCount = room.players.filter((player) => player.ready).length;
  $('#lobbyReadyCount').textContent = `${readyCount} / ${room.players.length} PRONTOS`;
  $('#lobbyClass').textContent = room.rules.classesEnabled ? me?.classSelected ? CLASS_DEFS[me.classType]?.name || 'CLASSE' : 'ESCOLHA SUA CLASSE' : 'CLASSES DESATIVADAS';
  $('#lobbyArsenal').textContent = me?.arsenalSelected ? me.arsenal.map((type) => ARSENAL_DEFS[type]?.short || type).join(' · ') : 'ESCOLHA 3 CARTAS';
  $('#arsenalButton').hidden = spectatorMode; $('#arsenalButton').innerHTML = `${me?.arsenalSelected && (!room.rules.classesEnabled || me.classSelected) ? 'ALTERAR' : 'ESCOLHER'} ${room.rules.classesEnabled ? 'CLASSE E ' : ''}ARSENAL <b>→</b>`;
  $('#startButton').hidden = spectatorMode; $('#startButton').disabled = room.players.length < 2 || (!me?.ready && (!me?.arsenalSelected || room.rules.classesEnabled && !me?.classSelected));
  $('#startButton').innerHTML = me?.ready ? 'CANCELAR PRONTO <b>↶</b>' : 'MARCAR PRONTO <b>✓</b>';
  $('#waitingMessage').hidden = false; $('#waitingMessage').textContent = spectatorMode ? `◉ ASSISTINDO · ${room.spectatorCount || 1} ESPECTADOR(ES)` : me?.ready ? `AGUARDANDO OS DEMAIS · ${readyCount}/${room.players.length} PRONTOS` : !me?.arsenalSelected || room.rules.classesEnabled && !me?.classSelected ? 'Escolha e confirme classe e arsenal para marcar Pronto.' : room.players.length < 2 ? 'Aguardando outro jogador ou bot.' : 'Tudo preparado. Marque Pronto para iniciar.';
  $('#restartButton').hidden = !host || room.phase === 'lobby'; $('#spectatorBadge').hidden = !spectatorMode;
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
  const roomPlayer = room?.players?.find((entry) => entry.id === playerId);
  const player = timed ? game?.players?.find((entry) => entry.id === playerId) : roomPlayer;
  const selected = new Set(roomPlayer?.arsenalSelected ? roomPlayer.arsenal : []);
  const offered = new Set(player?.arsenalOffer || Object.keys(ARSENAL_DEFS));
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
  const synergy = new Set(CLASS_POWERUP_SYNERGY[active.classType] || []);
  $('#rewardModal .reward-box>small').textContent = active.classType ? `RECOMPENSA • ${CLASS_DEFS[active.classType]?.name || 'CLASSE'} • SINERGIA ${CLASS_POWERUP_WEIGHT}× MAIS PROVÁVEL` : 'RECOMPENSA DE 3 TURNOS';
  $('#rewardChoices').innerHTML = offer.choices.map((type) => { const info = POWERUP_DEFS[type]; const favored = synergy.has(type); return `<button data-reward="${type}" class="powerup-${type}${favored ? ' class-favored' : ''}" style="--item:${info.color}">${cardArtwork(type, 'powerups', 'card-art')}<span class="card-rarity">${favored ? '★ SINERGIA DE CLASSE' : 'POWERUP'}</span><b>${info.short}</b><strong>${info.name}</strong><span>${escapeHtml(combatDescription(type, info))}</span><em>ESCOLHER</em></button>`; }).join('');
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
  updateFireButton();
  $('#rouletteTrack').innerHTML = state.players.map((player, index) => `<div data-player-index="${index}" style="--player:${player.color}"><b>${escapeHtml(player.nickname)}</b></div>`).join('');
  const update = () => { const now = gameNow(); const spinEndsAt = state.rouletteSpinEndsAt || state.rouletteEndsAt; const spinning = now < spinEndsAt; const progress = Math.min(1, (now - state.rouletteStartedAt) / Math.max(1, spinEndsAt - state.rouletteStartedAt)); const sequenceIndex = Math.min(state.rouletteSequence.length - 1, Math.floor(progress * state.rouletteSequence.length)); const winnerIndex = state.rouletteWinnerIndex ?? state.turnIndex; const activeIndex = spinning ? state.rouletteSequence[sequenceIndex] : winnerIndex; $$('#rouletteTrack>div').forEach((item) => item.classList.toggle('active', Number(item.dataset.playerIndex) === activeIndex)); const winner = state.players[winnerIndex]; const countdown = Math.max(0, Math.ceil((state.rouletteEndsAt - now) / 1000)); $('#rouletteResult').textContent = spinning ? 'SORTEANDO...' : `${winner.nickname} COMEÇA`; $('#matchStartCountdown').textContent = countdown; };
  update(); rouletteTimer = setInterval(update, 80);
}

function renderHud() {
  const ownTurn = game.phase === 'playing' && game.players[game.turnIndex]?.id === playerId && game.players[game.turnIndex]?.alive && !spectatorMode; $('.turn-card').classList.toggle('my-turn', ownTurn); $('#turnLabel').textContent = ownTurn ? '● SEU TURNO' : 'TURNO ATUAL'; $('#ownTurnNotice').hidden = !ownTurn; $('#locatePlayer').disabled = !game.players.some((entry) => entry.id === playerId && entry.alive);
  const active = game.players[game.turnIndex]; const mine = game.phase === 'playing' && !game.shotEndsAt && !(game.arenaWarningUntil > gameNow()) && active?.id === playerId; $('#aimLockButton').disabled = !mine; $('#aimAssistButton').disabled = !mine || mobileAimLocked;
  $('#turnTimer').hidden = game.phase !== 'playing';
  const newOwnTurn = mine && lastTurn !== game.turnNumber; if (newOwnTurn) { selectedWeapon = null; clearAimAssist(); restoreAim(); } else if (mine) updateMobileAimReadout();
  $('#turnPlayer').textContent = active?.nickname || '—'; $('#movesLeft').textContent = game.shotEndsAt ? 'PROJÉTIL EM VOO' : active?.teslaDisabledTurns > 0 ? `TESLA • SÓ MOVIMENTO (${game.actions.movesLeft})` : active?.frozenTurns > 0 ? `CONGELADO • ${active.frozenTurns}T` : active?.powerupBlockedTurns > 0 ? `PANE ELÉTRICA • SEM POWERUPS` : `${game.actions.movesLeft} ${game.actions.movesLeft === 1 ? 'AÇÃO' : 'AÇÕES'}`;
  const wind = game.wind || 0; $('#windValue').textContent = wind === 0 ? 'CALMO' : `${Math.abs(wind)} ${wind > 0 ? '→' : '←'}`; $('#windArrow').textContent = wind === 0 ? '•' : wind > 0 ? '»' : '«'; $('#windArrow').className = wind === 0 ? '' : wind > 0 ? 'right' : 'left';
  const turnsToEvent = 3 - (game.turnNumber % 3); const arenaLevel = Math.ceil(1 + ((game.roundNumber || 1) - 1) / Math.max(1, (game.roundLimit || 20) - 1) * 1.45); $('#arenaEvent').textContent = ['hill', 'teamHill'].includes(game.mode) ? `${BIOMES[game.terrain.type]?.name || 'ARENA'} • COLINA ${game.hill?.pointsToWin || 4} PTS • EVENTO EM ${turnsToEvent}` : game.mode === 'survival' ? `MARÉ DE LAVA • PRÓXIMO NÍVEL ${game.survival?.nextLevel ?? '—'} • EVENTO EM ${turnsToEvent}` : `${BIOMES[game.terrain.type]?.name || 'ARENA'} • NÍVEL ${arenaLevel} • EVENTO EM ${turnsToEvent} ${turnsToEvent === 1 ? 'TURNO' : 'TURNOS'}`;
  $('#roundNumber').textContent = game.roundNumber || 1; $('#roundLimit').textContent = game.roundLimit || room?.rules?.roundLimit || 20;
  $('#survivalForecast').hidden = game.mode !== 'survival'; if (game.mode === 'survival') $('#survivalNextLevel').textContent = `${game.survival?.nextLevel ?? '—'} ↓`;
  $('#hillStatus').hidden = !['hill', 'teamHill'].includes(game.mode); if (game.mode === 'hill') { const leader = [...game.players].sort((a, b) => (b.hillScore || 0) - (a.hillScore || 0))[0]; $('#hillValue').textContent = `${leader?.hillScore || 0}/${game.hill?.pointsToWin || 4}${game.hill?.contested ? ' ⚔' : ''}`; } else if (game.mode === 'teamHill') { const scores = Object.entries(game.hill?.teamScores || {}).sort((a, b) => b[1] - a[1]); $('#hillValue').textContent = `E${String(scores[0]?.[0] || '').split('-').at(-1)} ${scores[0]?.[1] || 0}/${game.hill?.pointsToWin || 4}${game.hill?.contested ? ' ⚔' : ''}`; }
  $('#scoreStrip').innerHTML = game.players.map((p) => `<div class="score-player ${p.alive ? '' : 'dead'}" data-team="${p.team || (p.isBot ? 'bots' : 'humans')}" style="--c:${p.color}" title="${escapeHtml(classPassiveStatus(p))}${p.classEvolutions?.length ? ` • ${p.classEvolutions.map((type) => CLASS_EVOLUTIONS[type]?.name || type).join(' + ')}` : ''}"><span><b>${game.mode === 'coop' ? (p.isBot ? '◆ ' : '◇ ') : ['teams', 'teamHill'].includes(game.mode) ? `[E${String(p.team).split('-').at(-1)}] ` : ''}${escapeHtml(p.nickname)}</b><i>${p.alive ? `${p.health} HP` : 'FORA'}</i></span><small>${p.classType ? `${CLASS_DEFS[p.classType]?.short}${p.classEvolutions?.length ? ` ↑${p.classEvolutions.length}` : ''} • ` : ''}${game.mode === 'hill' ? `◈ ${p.hillScore || 0}/${game.hill?.pointsToWin || 4} • ` : game.mode === 'teamHill' ? `◈ ${game.hill?.teamScores?.[p.team] || 0}/${game.hill?.pointsToWin || 4} • ` : ''}◆ ${p.stats?.destruction || 0}</small><div class="healthbar"><i style="width:${p.health / p.maxHealth * 100}%"></i></div></div>`).join('');
  ['#moveLeft', '#moveRight'].forEach((id) => $(id).disabled = !mine || game.actions.movesLeft <= 0); updateFireButton(); $('#passButton').disabled = !mine;
  const me = game.players.find((player) => player.id === playerId);
  const destructionOwner = me || active; $('#destructionScore').textContent = destructionOwner?.stats?.destruction || 0; $('#destructionCard').title = `${destructionLegend}${destructionOwner?.classType === 'attacker' ? ` • ATACANTE: +50 por eliminação; Mega Canhão ${destructionOwner?.ammo?.megaCannon ? 'PRONTO' : `${destructionOwner?.megaCannonCharge || 0}/${MEGA_CANNON_CHARGE}`}` : ''}`;
  const angleInput = $('#angle'); angleInput.min = laserAimActive() ? '-85' : '5'; if (!laserAimActive() && Number(angleInput.value) < 5) { angleInput.value = 5; $('#angleValue').textContent = '5°'; renderer.setAim({ angle: 5 }); } updateMobileAimReadout();
  $('#arsenalWeapons').innerHTML = (me?.arsenal || []).map((type) => { const info = ARSENAL_DEFS[type]; const count = type === 'spider' && me?.spiderClimb ? '∞' : type === 'megaCannon' && !me?.ammo?.megaCannon ? `${me?.megaCannonCharge || 0}/${MEGA_CANNON_CHARGE}` : me?.ammo?.[type] || 0; const comboReady = equippedPowers(me).some((power) => supportsWeaponCombo(power, type)) || (me?.airborne && type === 'armoredDash'); return `<button class="weapon ${selectedWeapon === type ? 'active' : ''}${comboReady ? ' combo-ready' : ''}" data-weapon="${type}" title="${escapeHtml(combatDescription(type, info))}${comboReady ? ' COMBO DISPONÍVEL.' : ''}" style="--arsenal:${info.color}"><i class="hud-arsenal-art atlas-art atlas-arsenal art-${type}" style="${atlasStyle(type, 'arsenal')}"></i><small>${info.short}</small><b>${count}</b></button>`; }).join('');
  const inventory = new Map(); for (const type of me?.inventory || []) inventory.set(type, (inventory.get(type) || 0) + 1);
  if (me?.shieldCharges > 0) inventory.set('shield', me.shieldCharges); if (me?.invisibleTurns > 0) inventory.set('invisibility', me.invisibleTurns);
  const powerupsBlocked = me?.powerupBlockedTurns > 0 || me?.teslaDisabledTurns > 0; const equipped = equippedPowers(me); $('.powerup-hud').classList.toggle('blocked', powerupsBlocked); $('.powerup-help b').textContent = powerupsBlocked ? 'PANE ELÉTRICA' : 'POWERUPS'; $('.powerup-help span').textContent = me?.teslaDisabledTurns > 0 ? 'SOMENTE MOVIMENTO ATÉ O PRÓXIMO TURNO' : powerupsBlocked ? 'BLOQUEADOS ATÉ O FIM DESTE TURNO' : 'TOQUE PARA COMBINAR • VÁRIOS PODEM FICAR ATIVOS';
  $('#inventoryBar').innerHTML = inventory.size ? [...inventory].map(([type, count]) => { const info = POWERUP_DEFS[type]; if (!info) return ''; const selectable = SELECTABLE_POWERUPS.has(type) && (me?.inventory || []).includes(type); const tag = selectable ? 'button' : 'span'; const selected = equipped.includes(type) ? ' selected' : ''; const attribute = selectable ? ` data-powerup="${type}"${powerupsBlocked ? ' disabled' : ''}` : ''; return `<${tag} class="powerup-chip${selected}"${attribute} style="--item:${info.color}" title="${escapeHtml(combatDescription(type, info))}"><span class="inventory-art atlas-art atlas-powerups art-${type}" style="${atlasStyle(type, 'powerups')}"></span><b>${info.short}</b><span>${info.name}</span><em>×${count}</em>${selected ? '<i>EQUIPADO</i>' : ''}</${tag}>`; }).join('') : '<i>nenhum item ativo</i>';
  $$('.weapon').forEach((button) => { const movement = ARSENAL_DEFS[button.dataset.weapon]?.kind === 'movement'; const count = button.dataset.weapon === 'standard' || (button.dataset.weapon === 'spider' && me?.spiderClimb) ? Infinity : me?.ammo?.[button.dataset.weapon] || 0; button.disabled = !mine || me?.teslaDisabledTurns > 0 || (movement ? game.actions.movesLeft <= 0 : !game.actions.attackAvailable) || count <= 0; });
  if (me?.teslaDisabledTurns > 0) selectedWeapon = null;
  if (selectedWeapon && selectedWeapon !== 'standard' && (!me?.arsenal?.includes(selectedWeapon) || ((me?.ammo?.[selectedWeapon] || 0) <= 0 && !(selectedWeapon === 'spider' && me?.spiderClimb) && !(selectedWeapon === 'jump' && me?.airborne)))) selectedWeapon = null;
  $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === selectedWeapon)); updateFireButton();
  requestAnimationFrame(refreshArsenalPicker);
  renderer.setMovementMode(selectedWeapon || 'standard');
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
  if (game.phase === 'playing') { const seconds = Math.max(0, Math.ceil((game.turnEndsAt - gameNow()) / 1000)); $('#turnTimer').textContent = seconds; $('#turnTimer').classList.toggle('urgent', seconds <= 5); const offer = game.players.find((player) => player.id === playerId)?.rewardOffer; if (offer) $('#rewardCountdown').textContent = Math.max(0, Math.ceil((offer.expiresAt - gameNow()) / 1000)); updateFireButton(); }
  if (game.phase === 'class' || game.phase === 'arsenal') $('#arsenalCountdown').textContent = Math.max(0, Math.ceil(((game.phase === 'class' ? game.classEndsAt : game.arsenalEndsAt) - gameNow()) / 1000));
}, 200);
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
net.connect();
