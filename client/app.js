import { CLIENT, PROTOCOL_VERSION, SERVER } from '/shared/protocol.js';
import { ARSENAL_COOLDOWN_TURNS, ARSENAL_DEFS, CLASS_ARSENAL_SYNERGY, CLASS_BALANCE, CLASS_DEFS, CLASS_EVOLUTIONS, CLASS_POWERUP_SYNERGY, CLASS_POWERUP_WEIGHT, classEvolutionRounds, CLUSTER_CAPSULE_SPEED, COLLECTIBLE_ITEMS, DESTRUCTION_POINTS, ELEMENTAL_BOMBS, EVENT_DEFS, MEGA_BOMB, MEGA_CANNON_CHARGE, megaCannonCost, MIXER_COOLDOWN_ROUNDS, MIXER_WEAPONS, POWERUPS, POWERUP_DEFS, REACTIVE_ARSENAL_ITEMS, SELECTABLE_ARSENAL_ITEMS, SHOT_PATH_RATE, SUPERHEAT, VECTOR_FLIGHT_RATE, WEAPON_BALANCE } from '/shared/constants.js';
import { DRIVE, driveStats, movementDistance } from '/shared/movement.js';
import { swimmableWaterSurface } from '/shared/flood.js';
import { CARD_ROLE_LABELS, CARD_SECTIONS, cardActivation, cardCombo, cardDamage, cardRange, cardRole, classAttributeSummary, classCardStats, conciseCardDescription, searchableCard } from '/shared/card-catalog.js';
import { BIOMES } from '/shared/biomes.js';
import { weatherVisualState } from '/shared/climate.js';
import { suggestAim } from '/shared/aim-assist.js';
import { backpackerRerollAvailable, ninjaFatalPath } from '/shared/class-actions.js';
import { atlasStyle } from '/shared/card-art.js';
import { aimFromDrag, stableMoveDirection } from '/shared/mobile-controls.js';
import { GameNetwork } from './network.js';
import { Renderer } from './renderer.js';
import { BattleAudio } from './audio.js';
import { drawRouletteConstruction } from './roulette-preview.js';
import { startHomeScene } from './home-scene.js';
import { drawLibraryPreview, previewDefinition } from './library-previews.js';

const $ = (q) => document.querySelector(q); const $$ = (q) => [...document.querySelectorAll(q)];
startHomeScene($('#homeScenario'), $('#homeCycleLabel'));
const net = new GameNetwork(); const renderer = new Renderer($('#gameCanvas'));
const audio = new BattleAudio();
renderer.onShotImpact = (shot) => { audio.shotImpact(shot); if (shot.combo?.some((item) => String(item).startsWith('mixer:'))) { audio.ui('combo'); mobileVibrate([16, 18, 32]); } if (matchMedia('(pointer:coarse)').matches && !shot.delayedStrike) mobileVibrate(shot.sharkBite ? [18, 12, 42, 18, 65] : shot.megaMissile ? [45, 25, 100, 35, 130] : [24, 20, 55]); };
renderer.onArenaImpactBeat = (type, impact, index) => { if (type === 'bombardment') { audio.bombardmentStrike(1 + index * .12); mobileVibrate(index % 2 ? [16, 14, 30] : [24, 18, 45]); } };
renderer.onMeteorImpact = () => { audio.meteorImpact(); if (matchMedia('(pointer:coarse)').matches) mobileVibrate([20, 16, 32]); };
renderer.onTankDestroyed = (player) => { audio.destroyed(); if (player.id === playerId) mobileVibrate([45, 30, 70, 35, 100]); };
renderer.onMarkerBounce = () => audio.weaponCue('markerBounce');
renderer.onHunterDive = () => audio.eagleDive();
renderer.onVortexDeflect = (fire) => audio.vortexDeflect(fire);
renderer.onDroneIntercept = () => { audio.droneIntercept(); mobileVibrate([16, 28, 35]); };
renderer.onVortexIgnite = () => audio.vortexIgnite();
renderer.onVortexSpawn = () => audio.vortexSpawn();
renderer.onBomberDetonation = (blast) => { addCombatEntry(`BOMBARDEIRO: DETONAÇÃO • ${blast.damage} HP`, 'hit'); audio.detonation('heavy'); mobileVibrate([35, 20, 65]); };
renderer.onBomberGrenade = (impact) => { addCombatEntry(`BOMBARDEIRO: GRANADA • ${impact.hits?.length || 0} acerto(s)`, 'hit'); audio.detonation('grenade'); mobileVibrate([20, 15, 35]); };
renderer.onAquaticMineArm = () => audio.ui('confirm');
renderer.onAquaticMineDetonate = () => { audio.detonation('waterMine'); mobileVibrate([28, 18, 75]); };
renderer.onPhysicalEffect = (kind, intensity) => audio.environment(kind, intensity);
renderer.onStatusActivated = (kind, id) => { if (id === playerId) { audio.statusActivated(kind); mobileVibrate(kind === 'shield' ? [12, 16, 28] : [8, 22, 8]); } };
renderer.onElementalImpact = (kind) => audio.elementalImpact(kind);
let room = null; let game = null; let playerId = sessionStorage.getItem('tankPlayerId'); let spectatorMode = Boolean(sessionStorage.getItem('tankSpectatorToken')); let lastTurn = null; let toastTimer; let serverCompatible = true;
let aimDirection = 1; let aiming = false; let aimAssistTargetId = null; let aimAssistEstimate = null;
let lastAimSyncAt = -Infinity; let aimSyncTimer = null;
let fireRequestPending = false; let fireRequestTimer;
let lastTrackSoundAt = -Infinity;
let selectedWeapon = 'standard'; let resultSoundPlayed = false; let resultSequence = 0; let lastArenaEventKey = null;
let mixerArmed = false; let mixerPartner = null; let arsenalSelectionOrder = [];
let trainingStep = 0; let trainingOpen = false; let trainingSeed = null;
const mobileLayoutQuery = matchMedia('(pointer: coarse) and (max-width: 1100px)');
let mobileAimMode = localStorage.getItem('tankMobileAimMode') === 'stick' ? 'stick' : 'drag';
let mobilePrecision = localStorage.getItem('tankMobilePrecision') === 'fine' ? 'fine' : 'normal';
let mobileCameraMode = localStorage.getItem('tankMobileCameraMode') === 'fixed' ? 'fixed' : 'dynamic';
let focusTimer; let pickupTimer; let rouletteTimer; let arenaAlertTimer; let destructionTimer; let clusterImpactTimer; let savedClassSeed = null; let savedArsenalSeed = null; let deferredPickup = null; let pendingClassType = null;
let serverClockOffset = 0; const gameNow = () => Date.now() + serverClockOffset;
let hapticFallbackTimer;
let lastHapticAt = -Infinity; let lastHapticStrength = 0;
const combatEntries = []; let combatSeed = null;
window.render_game_to_text = () => JSON.stringify({
  coordinates: 'world origin top-left; x increases right, y increases down; viewport uses renderer.camera',
  screen: document.querySelector('.screen.active')?.id || 'unknown',
  libraryPreview: activePreview && !$('#libraryPreviewModal').hidden ? { section: activePreview.definition.section, type: activePreview.definition.type, source: 'illustration', phase: previewPhase(), playing: previewPlaying } : null,
  room: room?.code || null,
  scenario: room ? { type: game?.terrain?.type || room.mapTypeResolved || room.rules.mapType, width: game?.terrain?.arenaWidth || room.arenaWidth, waterZones: game?.waterZones?.length || 0, cavities: game?.terrain?.cavities?.length || 0 } : null,
  friendlyFire: room?.rules?.friendlyFire ?? null,
  lobbyPlayers: !game && room ? room.players.map((player) => ({ id: player.id, team: player.team, color: player.color, classType: player.classSelected ? player.classType : null, arsenal: player.arsenalSelected ? player.arsenal : [], ready: player.ready })) : undefined,
  phase: game?.phase || null,
  training: game?.training ? { step: trainingStep + 1, open: trainingOpen } : null,
  debug: game?.debugMode ? { open: !$('#debugPanel').hidden, weapon: $('#debugWeapon').value, botPassive: room?.rules?.debugBotPassive } : null,
  turn: game?.turnNumber ?? null,
  round: game?.roundNumber ?? null,
  weather: game ? { kind: game.weather?.kind || 'clear', visual: weatherVisualState(game, gameNow()), sequence: game.weatherSequence?.phase || null, lakes: (game.waterZones || []).map((lake) => ({ x: lake.x, radius: lake.radius, surfaceY: lake.surfaceY, draining: Boolean(lake.drainingAt) })) } : null,
  windVortices: game?.windVortices?.filter((vortex) => gameNow() >= (vortex.appearsAt || 0)).map((vortex) => ({ x: vortex.x, y: vortex.y, width: vortex.width, height: vortex.height, fire: vortex.fire, source: vortex.source || 'elemental', expiresRound: vortex.expiresRound, turnsLeft: vortex.expiresTurn == null ? null : Math.max(0, vortex.expiresTurn - game.turnNumber) })) || [],
  weatherClouds: game?.weatherClouds?.map((cloud) => ({ id: cloud.id, x: cloud.x, y: cloud.y, activated: game.turnNumber > (cloud.activatedTurn ?? 1), wind: game.wind, dispersesAt: cloud.dispersesAt || null })) || [],
  weatherCloudDispersals: game?.lastWeatherCloudDispersals || [],
  gravityWells: game?.gravityWells?.filter((well) => gameNow() >= well.activateAt && gameNow() < well.endsAt).map((well) => ({ x: well.x, y: well.y, radius: well.radius, remainingMs: Math.round(well.endsAt - gameNow()) })) || [],
  waterCannonStreams: game?.waterCannonStreams?.filter((stream) => gameNow() < stream.endsAt).map((stream) => ({ origin: stream.origin, impact: stream.impact, remainingMs: Math.round(stream.endsAt - gameNow()), hitPlayerIds: stream.hitPlayerIds })) || [],
  waterOrbs: (game?.waterOrbs || []).filter((orb) => gameNow() >= orb.appearsAt).map((orb) => ({ x: orb.x, y: orb.y, vy: orb.vy })),
  platformWaterFlows: (game?.platformWaterFlows || []).map((flow) => ({ x: flow.x, y: flow.y, phase: flow.phase, platformId: flow.platformId, supportObjectId: flow.supportObjectId })),
  iceZones: (game?.iceZones || []).map((zone) => ({ x: zone.x, y: zone.y, contactPoints: zone.points?.length || 0 })),
  fallingWood: (game?.objects || []).filter((object) => object.type === 'woodDebris' && object.active).map((object) => ({ x: object.x, y: object.y, vx: object.vx, vy: object.vy, rotation: object.rotation })),
  lastWaterOrbLandings: game?.lastWaterOrbLandings || [],
  lastWaterCannonHits: game?.lastWaterCannonHits || [],
  arenaEvent: game?.events?.at(-1) ? { type: game.events.at(-1).type, warning: game.events.at(-1).warning, seeds: game.events.at(-1).seeds, tornadoes: game.events.at(-1).tornadoes, grownTreeIds: game.events.at(-1).grownTreeIds } : null,
  survival: game?.survival ? { lavaLevel: game.lavaLevel, nextLevel: game.survival.nextLevel, lastRise: game.survival.lastRise } : null,
  hill: game?.hill ? { x: game.hill.x, radius: game.hill.radius, contested: game.hill.contested, teamScores: game.hill.teamScores, lastCaptureTeam: game.hill.lastCaptureTeam } : null,
  currentPlayerId: game?.players?.[game.turnIndex]?.id || null,
  localPlayerId: playerId,
  aim: { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection, assistedTargetId: aimAssistTargetId, estimatedError: aimAssistEstimate, vectorTarget: renderer.hasAwaitingVerticalShot() ? renderer.verticalTargetForActivation() : null },
  tankAim: [...renderer.visualPlayers.values()].map((player) => ({ id: player.id, angle: player.aimAngle ?? 0, direction: player.aimDirection ?? player.facing, renderedRadians: player.renderBarrelAngle ?? null })),
  movement: game ? (() => { const player = game.players.find((entry) => entry.id === playerId); return player ? { swimming: Boolean(player.swimming), swimDepth: player.swimDepth || 0, ceilingAttached: Boolean(player.ceilingClinging || player.surfaceClinging?.side === 'bottom'), ceilingReleaseArmed: Date.now() - (player.lastCeilingDownAt || 0) < 700, joystickDirection: moveStickDirection } : null; })() : null,
  spiderAim: selectedWeapon === 'spider' ? { target: renderer.spiderTarget, preview: renderer.spiderLeapPreview() } : null,
  armoredDashAim: selectedWeapon === 'armoredDash' ? { target: renderer.armoredDashTarget, direction: renderer.armoredDashDirection(), preview: renderer.movementPreviewCache?.landings?.[renderer.armoredDashDirection() < 0 ? 0 : 1] || null } : null,
  blinkAim: renderer.blinkMode ? { type: renderer.blinkMode, target: renderer.blinkTarget, preview: renderer.blinkPreview() } : null,
  fatalAim: selectedWeapon === 'ninjaFatal' ? { target: renderer.ninjaFatalPoint, preview: renderer.ninjaFatalPoint && game ? ninjaFatalPath(game, game.players.find((player) => player.id === playerId), null, renderer.ninjaFatalPoint) : null, activation: (game?.ninjaFatalStage?.activation || 0) + 1 } : null,
  audio: { enabled: audio.enabled, ready: audio.isReady(), webState: audio.context?.state || 'none', nativeReady: audio.mobile.ready, nativeError: audio.mobile.lastError, volumes: audio.volumes },
  fire: { enabled: !$('#fireButton').disabled, label: $('#fireButton').textContent.trim(), feedback: $('#fireFeedback').classList.contains('show') },
  classAction: { label: $('#classActionButton').textContent.trim(), visible: !$('#classActionButton').hidden, action: $('#classActionButton').dataset.action || null, targetId: $('#classActionButton').dataset.targetId || null },
  classInfo: { available: !$('#hudClassButton').hidden, open: !$('#classInfoPanel').hidden, playerId: $('#classInfoPanel').hidden ? null : $('#classInfoPanel').dataset.playerId || null },
  arsenal: { selected: selectedWeapon, mixerArmed, mixerPartner, available: arsenalButtons().map((button) => ({ type: button.dataset.weapon, enabled: !button.disabled })), sliderVisible: $('#arsenalPicker').classList.contains('has-overflow'), viewedIndex: Number($('#arsenalSlider').value) },
  mobile: { aimMode: mobileAimMode, precision: mobilePrecision, cameraMode: mobileCameraMode, settingsOpen: !$('#mobileSettings').hidden },
  players: (game?.players || []).map((player) => ({ id: player.id, x: player.x, y: player.y, health: player.health, maxHealth: player.maxHealth, alive: player.alive, hidden: player.hidden, concealedByTree: (game?.objects || []).some((object) => object.active && object.type === 'treeSmall' && Math.abs(player.x - object.x) <= (object.canopyRadius || 31) && Math.abs(player.y - (object.groundY - 8)) <= object.height + 15), invisibleTurns: player.invisibleTurns, ninjaFirstCloakActivated: player.ninjaFirstCloakActivated, ninjaOtherTurnsWaited: player.ninjaOtherTurnsWaited, fuel: player.fuel, maxFuel: driveStats(player).maxFuel, moveSpeed: driveStats(player).speed, wallClinging: player.wallClinging || null, ceilingClinging: player.ceilingClinging || null, surfaceClinging: player.surfaceClinging || null, airborne: player.airborne ? { vx: player.airborne.vx, vy: player.airborne.vy, falling: Boolean(player.airborne.falling), parachute: Boolean(player.airborne.parachute), steerDirection: player.airborne.steerDirection || 0 } : null, lastLanding: player.lastLanding || null, team: player.team, classType: player.classType, teslaDisabledTurns: player.teslaDisabledTurns, armorFractureTurns: player.armorFractureTurns, inventory: player.id === playerId ? player.inventory : undefined, rewardChoices: player.id === playerId ? player.rewardOffer?.choices : undefined, lastRevive: player.lastRevive, lastSalvage: player.lastSalvage, classEvolutions: player.classEvolutions, pendingClassEvolutions: player.pendingClassEvolutions })),
  tankStates: (game?.players || []).map((player) => ({ id: player.id, state: player.tankState, motion: player.motionState, since: player.tankStateSince })),
  mines: (game?.mines || []).filter((mine) => mine.active).map((mine) => ({ id: mine.id, x: mine.x, y: mine.y, aquatic: Boolean(mine.aquatic), armed: mine.aquatic ? Boolean(mine.armed) : true, vx: mine.vx || 0, vy: mine.vy || 0 })),
  mineDetonations: game?.mineDetonations?.slice(-4) || [],
  objects: (game?.objects || []).filter((object) => object.active !== false && object.x >= renderer.camera.x - 100 && object.x <= renderer.camera.x + 1280 / renderer.camera.zoom + 100).map((object) => ({ id: object.id, type: object.type, treeSize: object.treeSize, x: object.x, y: object.y, durability: object.durability ?? object.towerDurability ?? null, burningUntilRound: object.burningUntilRound, shieldEnergy: object.type === 'shieldGenerator' ? object.shieldEnergy : undefined, lastRestock: object.type === 'ammoTerminal' ? object.lastRestock || null : undefined, disabledUntilRound: object.type === 'sentry' ? object.disabledUntilRound : undefined })),
  treeBranches: (game?.terrain?.floatingPlatforms || []).filter((platform) => platform.active && platform.kind === 'treeBranch' && platform.x + platform.width >= renderer.camera.x - 100 && platform.x <= renderer.camera.x + 1280 / renderer.camera.zoom + 100).map((platform) => ({ id: platform.id, treeId: platform.treeId, row: platform.branchRow, x: platform.x, y: platform.y, width: platform.width, durability: platform.durability, burningUntilRound: platform.burningUntilRound })),
  lastRodPulse: game?.lastRodPulse || null,
  lastClassPulses: game?.lastClassPulses || [], rodForecast: game?.rodForecast || null,
  lastSentryPulse: game?.lastSentryPulse || null,
  lastSpecialistPulse: game?.lastSpecialistPulse || null,
  specialistSelection: renderer.specialistSelection || null,
  lastSaboteurPulses: game?.lastSaboteurPulses || [],
  lastNinjaStrike: game?.lastNinjaStrike || null,
  lastSuperheatPulse: game?.lastSuperheatPulse || null,
  heatZones: (game?.fireZones || []).filter((zone) => zone.source === 'superheat').map((zone) => ({ x: zone.x, y: zone.y, radius: zone.radius, turnsLeft: zone.turnsLeft })),
  ninjaGhosts: (game?.players || []).filter((player) => player.hidden && player.lastNinjaReveal?.reason === 'ghost' && !player.lastNinjaReveal.destroyed && player.lastNinjaReveal.expiresRound >= game.roundNumber).map((player) => ({ id: player.id, x: player.lastNinjaReveal.x, y: player.lastNinjaReveal.y, expiresRound: player.lastNinjaReveal.expiresRound })),
  bomberDetonations: game?.bomberDetonations || [],
  backpackerReroll: game?.players?.find((player) => player.id === playerId)?.lastBackpackerReroll || null,
  pickupAttractions: game?.pickupAttractions || [],
  pickups: (game?.powerups || []).filter((item) => item.active && item.revealed && item.x >= renderer.camera.x - 100 && item.x <= renderer.camera.x + 1280 / renderer.camera.zoom + 100).map((item) => ({ id: item.id, type: item.type, x: item.x, y: item.y })),
  shots: renderer.shots.map((shot) => { const index = Math.max(0, Math.min(shot.path?.length - 1 || 0, renderer.shotIndex(shot, performance.now()))); const point = shot.path?.[index]; return { weapon: shot.weapon, index, pathLength: shot.path?.length || 0, x: point?.x, y: point?.y, fuse: Boolean(point?.fuse), exploded: Boolean(shot.exploded), canActivateVertical: Boolean(shot.canActivateVertical), vectorRedirectsUsed: shot.vectorRedirectsUsed || 0, activationRequested: Boolean(shot.activationRequested), droneIntercept: shot.droneIntercept ? { droneId: shot.droneIntercept.droneId, ownerId: shot.droneIntercept.ownerId } : null }; }),
  muzzleEffects: renderer.muzzleBursts.map(({ x, y, type, started, duration }) => ({ x, y, type, remainingMs: Math.max(0, Math.round(started + duration - performance.now())) })),
  delayedStrikes: game?.delayedStrikes || [],
  soapBubbles: game?.soapBubbles || [], harpoonAnchor: game?.harpoonAnchor || null, harpoonPull: game?.harpoonPull || null,
  movementPreview: renderer.movementPreviewCache && renderer.movementPreviewCache.game === game ? { mode: renderer.movementMode, endpoints: renderer.movementPreviewCache.landings.map((landing) => ({ x: landing.x, y: landing.y, safe: landing.safe, walls: landing.wallBreakPoints?.length || 0, launcherId: landing.launcherId || null })) } : null,
  camera: { ...renderer.camera, userZoom: renderer.userZoom, mode: renderer.cameraMode },
});
function addCombatEntry(message, tone = 'neutral') {
  combatEntries.unshift({ message, tone }); combatEntries.length = Math.min(combatEntries.length, 6);
  $('#combatFeedEntries').innerHTML = combatEntries.map((entry) => `<p class="${entry.tone}">${escapeHtml(entry.message)}</p>`).join('');
}
$('#combatFeedToggle').onclick = () => { const panel = $('#combatFeed'); const open = !panel.classList.contains('open'); panel.classList.toggle('open', open); $('#combatFeedToggle').setAttribute('aria-expanded', String(open)); audio.ui(); };
const mobileVibrate = (pattern, force = false) => {
  if (!matchMedia('(pointer:coarse)').matches && !navigator.maxTouchPoints) return false;
  const pulses = Array.isArray(pattern) ? pattern.filter((_, index) => index % 2 === 0) : [pattern];
  const strength = Math.max(1, ...pulses.map(Number).filter(Number.isFinite));
  const now = performance.now();
  if (!force && now - lastHapticAt < 110 && strength <= lastHapticStrength) return false;
  if (typeof navigator.vibrate === 'function') {
    const nativePattern = (Array.isArray(pattern) ? pattern : [pattern]).map((duration, index) => Math.min(180, Math.max(index % 2 ? 35 : 50, Number(duration) || 0)));
    try {
      if (navigator.vibrate(nativePattern)) { lastHapticAt = now; lastHapticStrength = strength; return true; }
    } catch { /* Unsupported hardware or blocked browser; keep the visual cue below. */ }
  }
  renderer.shake = Math.max(renderer.shake, Math.min(7, 1.5 + strength / 22));
  document.body.classList.remove('haptic-fallback'); void document.body.offsetWidth; document.body.classList.add('haptic-fallback');
  clearTimeout(hapticFallbackTimer); hapticFallbackTimer = setTimeout(() => document.body.classList.remove('haptic-fallback'), 180);
  return false;
};
function hapticSupportMessage() {
  if (typeof navigator.vibrate === 'function') return 'Vibração disponível. Toque em TESTAR; o aparelho pode bloquear o motor nas configurações do sistema.';
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'No iPhone, Chrome e Safari ainda não oferecem vibração física para páginas. O jogo usa impacto visual e sonoro.';
  return 'Este navegador não oferece vibração física para o jogo. O impacto visual e sonoro continua ativo.';
}
const chatHistory = [];
const DESTRUCTION_LABELS = Object.freeze({ terrainChunk: '24 MICROBLOCOS', barrel: 'BARRIL', fuelTank: 'TANQUE DE COMBUSTÍVEL', supplyCache: 'DEPÓSITO', radar: 'RADAR', shockCoil: 'BOBINA', healingStation: 'ESTAÇÃO MÉDICA', ammoTerminal: 'TERMINAL DE MUNIÇÃO', shieldGenerator: 'GERADOR DE ESCUDO', repulsor: 'REPULSOR CINÉTICO', watchtower: 'TORRE', platform: 'PLATAFORMA', concrete: 'CONCRETO', craneCable: 'CABO DO GUINDASTE', building: 'PRÉDIO', crane: 'GUINDASTE', tank: 'TANQUE' });
const destructionLegend = Object.entries(DESTRUCTION_POINTS).map(([type, points]) => `${DESTRUCTION_LABELS[type] || (type === 'lightningRod' ? 'HASTE' : type.toUpperCase())} +${points}`).join(' • ');
const DAMAGE_INFO = Object.freeze({
  extraShot: 'repete o dano da arma', doubleShot: '2× o dano da arma', tripleShot: '3× o dano da arma', bigExplosion: 'mantém o dano da arma', megaMissile: `até ${MEGA_BOMB.damage} HP`, freeze: 'mantém o dano da arma', guidedBullet: 'mantém o dano da arma', heal: 'sem dano', shield: 'sem dano', movementBoost: 'sem dano', rocketDash: 'sem dano', lightningStep: 'sem dano', bridgeKit: 'mantém o dano da arma', teleport: 'mantém o dano da arma', invisibility: 'sem dano', excavator: 'sem dano', armorPiercer: 'mantém o dano da arma', shockwave: 'até 24 HP', bunkerBuster: 'até 58 HP', ammoCrate: 'sem dano', molotov: 'impacto + fogo', repairDrone: 'sem dano', overcharge: 'sem dano', laser: `${WEAPON_BALANCE.laser.damage} HP por alvo`, mirror: 'repete todo o dano', trickster: 'sem dano', flyingHunter: `até ${WEAPON_BALANCE.flyingHunter.damage} HP`,
  heavy: `${WEAPON_BALANCE.heavy.damage}–${Math.round(WEAPON_BALANCE.heavy.damage * WEAPON_BALANCE.heavy.maxMultiplier * WEAPON_BALANCE.heavy.criticalMultiplier)} HP crítico`, cluster: `${WEAPON_BALANCE.cluster.damage} HP por fragmento`, fireworks: `${WEAPON_BALANCE.fireworks.damage} HP + 12× até ${WEAPON_BALANCE.fireworks.secondaryDamage} HP`, zeus: '40 + 40 HP após 2 s', gravity: `até ${WEAPON_BALANCE.gravity.damage} HP`, grenade: `até ${WEAPON_BALANCE.grenade.damage} HP`, mineLayer: `${WEAPON_BALANCE.mineLayer.damage} HP por mina`, moleBomb: `até ${WEAPON_BALANCE.moleBomb.damage} HP`, armoredDash: `${WEAPON_BALANCE.armoredDash.damage} HP • ${WEAPON_BALANCE.armoredDash.walls} paredes`, verticalStrike: `até ${WEAPON_BALANCE.verticalStrike.damage} HP`, soapBomb: '30 HP por bolha • até 3 tanques', markerBomb: '10 HP no 3º quique + 30 HP por marca', harpoon: '30 HP ao puxar inimigo', sentry: '5×5 HP a cada 2 turnos', droneStrike: '24 HP por micromíssil', teslaOrb: '30 + 22 HP por arco', seismicCharge: '44 + 18 HP por onda', megaCannon: `até ${WEAPON_BALANCE.megaCannon.damage} HP`, vitalRecycling: 'cura 25% da destruição', superheat: '25 HP por rodada durante 3 rodadas', splitDamage: 'reflete 50% do dano por 2 rodadas', windPlate: 'sem dano direto', jump: 'sem dano', spider: 'sem dano', standard: 'base 20–30 • centro 50 • cabeça 60–80 (crítico)',
  waterCannon: '40 HP por tanque na linha',
  kineticCannon: '34 HP • empurrão extremo', cryoMortar: '30 HP • congela por 2 turnos', meteorSalvo: '42 HP + 2×24 HP',
});
function combatDescription(type, info) { const damage = type === 'superheat' ? `${SUPERHEAT.damage} HP a cada ${SUPERHEAT.enemyTurns} turnos inimigos` : type === 'lightningRod' ? `${WEAPON_BALANCE.lightningRod.zapDamage} HP por turno no raio` : DAMAGE_INFO[type]; const cooldown = ARSENAL_COOLDOWN_TURNS[type] ? ` Recarga: ${ARSENAL_COOLDOWN_TURNS[type]} turnos seus.` : ''; return `${damage ? `${info.description} Dano: ${damage}.` : info.description}${cooldown}`; }
function syncMenuMusic() { audio.stopMenuMusic(); }
function screen(id) { $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); document.body.classList.toggle('playing', id === 'gameScreen'); syncMenuMusic(); if (id === 'gameScreen') requestAnimationFrame(() => renderer.resizeViewport()); else { closeClassInfo(); document.body.classList.remove('immersive-mobile'); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } }
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
function showClassInfo(id) {
  const player = game?.players.find((entry) => entry.id === id);
  const info = CLASS_DEFS[player?.classType]; if (!info) return;
  const panel = $('#classInfoPanel'); panel.dataset.playerId = id; panel.hidden = false;
  $('#classInfoArt').className = `atlas-art atlas-classes art-${player.classType}`; $('#classInfoArt').setAttribute('style', atlasStyle(player.classType, 'classes'));
  $('#classInfoName').textContent = info.name; $('#classInfoPlayer').textContent = player.nickname;
  $('#classInfoDescription').textContent = info.description;
  $('#classInfoFacts').innerHTML = [...classCardStats(player.classType), classAttributeSummary(player.classType)].map((fact) => `<span>${escapeHtml(fact)}</span>`).join('');
  $('#classInfoStatus').textContent = classPassiveStatus(player) || 'Passiva contínua';
  $('#hudClassButton').setAttribute('aria-expanded', String(id === playerId));
  audio.ui('open');
}
function closeClassInfo() { $('#classInfoPanel').hidden = true; $('#hudClassButton').setAttribute('aria-expanded', 'false'); }
$('#hudClassButton').onclick = () => { if (!$('#classInfoPanel').hidden && $('#classInfoPanel').dataset.playerId === playerId) closeClassInfo(); else showClassInfo(playerId || game?.players[game.turnIndex]?.id); };
$('#classInfoClose').onclick = closeClassInfo;
$('#scoreStrip').onclick = (event) => { const card = event.target.closest('.score-player'); if (card) showClassInfo(card.dataset.playerId); };
$('#scoreStrip').onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { const card = event.target.closest('.score-player'); if (card) { event.preventDefault(); showClassInfo(card.dataset.playerId); } } };
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#classInfoPanel').hidden) closeClassInfo(); });
function send(type, payload) { if (serverCompatible) net.send(type, payload); }
const POWERUP_USAGE = {
  fieldRepair: 'A cura e os reparos foram aplicados imediatamente em você e nas estruturas aliadas próximas.',
  fireFoam: 'Incêndios próximos foram apagados. O aro azul indica proteção até o fim da próxima rodada.',
  lootbox: 'Os três aprimoramentos da caixa foram aplicados ao seu tanque e adicionados ao arsenal ou inventário.',
  extraShot: 'É ativado automaticamente depois que seu próximo projétil concluir a trajetória.',
  doubleShot: 'Seu próximo ataque dispara dois projéteis. Uma carga é consumida por ataque.',
  tripleShot: 'Seu próximo ataque dispara três projéteis. Uma carga é consumida por ataque.',
  bigExplosion: 'A próxima explosão ganha uma cratera maior. O efeito é automático.',
  megaMissile: `Seu próximo disparo vira uma Mega Bomba atômica: ${MEGA_BOMB.radius} blocos de alcance, até ${MEGA_BOMB.damage} HP e explosão em cogumelo.`,
  freeze: 'Seu próximo disparo congela por dois turnos cada inimigo atingido.',
  guidedBullet: 'Seu próximo projétil contorna até 3 plataformas ou estruturas para atingir um adversário visível. O quarto obstáculo o detém.',
  heal: 'A cura foi aplicada imediatamente ao seu tanque.',
  shield: 'A próxima vez que você receber dano, uma carga reduz o impacto automaticamente.',
  movementBoost: 'Aumenta o tanque em +65 de combustível e +8 px/s. Os bônus acumulam e o combustível volta a cada duas rodadas.',
  rocketDash: 'Equipe e use uma seta de movimento. A arrancada amplia um deslocamento sem atravessar paredes.',
  lightningStep: 'Equipe e toque no cenário até 270 blocos do tanque para escolher o pouso.',
  bridgeKit: 'Equipe e atire. No primeiro impacto nasce uma ponte resistente de microblocos.',
  teleport: 'Ao atirar, você será transportado para uma posição segura próxima ao impacto.',
  invisibility: 'Já está ativo: somente você enxerga sua posição durante seus próximos dois turnos.',
  excavator: 'Use os botões de movimento contra uma parede. Cada avanço escava e consome uma carga.',
  armorPiercer: 'Selecione no inventário. Seu próximo ataque atravessa escudos; sem proteção, o alvo perde um movimento no próximo turno.',
  shockwave: 'Selecione no inventário. O próximo impacto arremessará tanques para longe.',
  bunkerBuster: 'Selecione no inventário. O próximo disparo abrirá uma cratera muito mais profunda.',
  ammoCrate: 'Todas as suas armas receberam até 2 cargas e tiveram a recarga zerada.',
  molotov: 'Selecione no inventário e atire. O impacto deixa fogo que causa dano por três turnos.',
  repairDrone: 'O drone já está ativo e recuperará vida ao fim dos seus próximos três turnos.',
  overcharge: 'Todas as cargas do arsenal foram restauradas imediatamente.',
  laser: 'Equipe e arraste a mira abaixo do tanque se quiser atirar para baixo. O feixe atravessa vários inimigos e imobiliza seu tanque no próximo turno.',
  mirror: 'Equipe junto com outros powerups: após o primeiro disparo, o Espelho repete a mesma arma, força, direção e efeitos.',
  trickster: 'Equipe e toque em outro tanque no cenário para trocar instantaneamente de posição com ele.',
  salvageHeal: 'Equipe antes de atirar. Ao concluir o disparo, recupera 25% dos pontos de destruição gerados, sem limite fixo. Combina com outros modificadores.',
  extraLife: 'Fica guardada no inventário. Ao ser eliminado, uma carga é consumida automaticamente para renascer em local seguro com 25% da vida máxima.',
};
const SELECTABLE_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'excavator', 'armorPiercer', 'shockwave', 'bunkerBuster', 'rocketDash', 'lightningStep', 'bridgeKit', 'molotov', 'laser', 'mirror', 'trickster', 'salvageHeal', 'buoy']);
const SHOT_COMBO_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'armorPiercer', 'shockwave', 'bunkerBuster', 'bridgeKit', 'molotov', 'laser', 'mirror', 'salvageHeal']);
const definitionChecks = (definitions, name) => Object.entries(definitions).map(([type, info]) => `<label style="--item:${info.color}"><input type="checkbox" name="${name}" value="${type}" checked><i></i><span>${info.name}</span></label>`).join('');
$('#eventRulePicker').innerHTML = definitionChecks(EVENT_DEFS, 'enabledEvents');
const configurablePickups = Object.fromEntries(COLLECTIBLE_ITEMS.map((type) => [type, POWERUP_DEFS[type] || ARSENAL_DEFS[type]]));
$('#powerupRulePicker').innerHTML = definitionChecks(configurablePickups, 'enabledPowerups');
function updateRuleCounts() { $('#eventRuleCount').textContent = `${$$('[name="enabledEvents"]:checked').length}/${Object.keys(EVENT_DEFS).length}`; $('#powerupRuleCount').textContent = `${$$('[name="enabledPowerups"]:checked').length}/${COLLECTIBLE_ITEMS.length}`; }
$('#eventRulePicker').onchange = updateRuleCounts; $('#powerupRulePicker').onchange = updateRuleCounts; updateRuleCounts();
function equippedPowers(player) { return player?.selectedPowerups?.length ? player.selectedPowerups : player?.selectedPowerup ? [player.selectedPowerup] : []; }
function supportsWeaponCombo(powerup, weapon) { if (!powerup || !SHOT_COMBO_POWERUPS.has(powerup) || ARSENAL_DEFS[weapon]?.kind !== 'shot') return false; if (['harpoon', 'waterCannon'].includes(weapon)) return false; if (['soapBomb', 'markerBomb'].includes(weapon) && !['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'mirror'].includes(powerup)) return false; if (weapon === 'lightningRod' && !['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'armorPiercer', 'bridgeKit', 'molotov', 'mirror'].includes(powerup)) return false; if (weapon === 'flyingHunter' && powerup === 'laser') return false; if (['megaMissile', 'bigExplosion'].includes(powerup) && ['mineLayer', 'gravity'].includes(weapon)) return false; return true; }
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
    $('#pickupEyebrow').textContent = firstUnlock ? 'PODER DE CLASSE DESBLOQUEADO' : 'INTERVENÇÃO DOS CÉUS RECARREGADA';
    $('#pickupUsage').textContent = firstUnlock ? `Exclusiva do Atacante. A carta entrou no arsenal. Após usar, acumule ${megaCannonCost(player.megaCannonUses || 0)} pontos para recarregar.` : 'Uma nova carga está pronta no arsenal. Selecione CÉUS para disparar.';
  }
  $('#pickupStack').textContent = ['heal', 'ammoCrate', 'lootbox'].includes(type) ? 'EFEITO APLICADO IMEDIATAMENTE' : type === 'invisibility' ? `${count} TURNOS ACUMULADOS` : `${count} ${count === 1 ? 'CARGA' : 'CARGAS'} ACUMULADAS`;
  $('#pickupReveal').classList.remove('show'); void $('#pickupReveal').offsetWidth; $('#pickupReveal').classList.add('show'); clearTimeout(pickupTimer); pickupTimer = setTimeout(() => $('#pickupReveal').classList.remove('show'), 5200);
}
$('#pickupClose').onclick = () => { clearTimeout(pickupTimer); $('#pickupReveal').classList.remove('show'); };

$$('.tab').forEach((tab) => tab.onclick = () => { $$('.tab,.form').forEach((x) => x.classList.remove('active')); tab.classList.add('active'); $(`#${tab.dataset.tab}Form`).classList.add('active'); });
const modeSelect = $('#createForm [name="gameMode"]'); const syncTeamOptions = () => { const teamMode = ['coop', 'teams', 'teamHill'].includes(modeSelect.value); $('#teamCountField').hidden = !['teams', 'teamHill'].includes(modeSelect.value); $('#friendlyFireField').hidden = !teamMode; const help = ({ ffa: 'Elimine os demais tanques ou vença pelo limite de rodadas.', coop: 'Humanos enfrentam bots juntos. A partida acaba quando uma equipe é eliminada.', teams: 'Forme de 2 a 4 equipes; vence a última equipe viva.', teamHill: 'Equipes somam pontos ocupando a colina sem rivais. A primeira com 4 pontos vence.', hill: 'Ocupe a zona dourada sozinho ao fim de cada rodada. Quem fizer 4 pontos primeiro vence.', survival: 'A lava sobe a cada rodada. Fuja para terreno ou plataformas altas e seja o último tanque vivo.' })[modeSelect.value]; $('#modeHelp').textContent = `${help}${teamMode ? ` Fogo amigo ${$('#createForm [name="friendlyFire"]').checked ? 'ativado: ataques podem ferir aliados.' : 'desativado: aliados não sofrem seus ataques.'}` : ''}`; }; modeSelect.onchange = syncTeamOptions; $('#createForm [name="friendlyFire"]').onchange = syncTeamOptions; syncTeamOptions();
const createBots = $('#createForm [name="botCount"]'); const createCapacity = $('#createForm [name="maxPlayers"]');
function syncBotCapacity() { const needed = Number(createBots.value) + 1; if (Number(createCapacity.value) >= needed) return; const capacity = [...createCapacity.options].find((option) => Number(option.value) >= needed); if (capacity) { createCapacity.value = capacity.value; toast(`${createBots.value} bots: sala ampliada para ${capacity.value} tanques.`); } }
createBots.addEventListener('change', syncBotCapacity);
$('#quickPreset').onclick = () => { const form = $('#createForm'); for (const [name, value] of Object.entries({ maxPlayers: '2', botCount: '1', botDifficulty: 'normal', turnSeconds: '15', roundLimit: '10', gameSpeed: '1.5', powerupCount: '12', mapType: 'random', gameMode: 'ffa' })) form.elements[name].value = value; syncTeamOptions(); toast('Partida rápida pronta: 1 bot, 10 rodadas e turnos de 15s.'); };
$('#trainingStart').onclick = () => { const nickname = $('#createForm [name="nickname"]').value.trim() || 'Cadete'; localStorage.setItem('tankNickname', nickname); send(CLIENT.CREATE_ROOM, { nickname, roomName: 'Treino guiado', quickTraining: true }); };
let testSequence = '';
let testModeRequested = false;
addEventListener('keydown', (event) => {
  if (!$('#homeScreen').classList.contains('active') || event.repeat || event.ctrlKey || event.altKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  const key = event.key.toLowerCase();
  if (!/^[a-z]$/.test(key)) return;
  testSequence = (testSequence + key).slice(-4);
  if (testSequence !== 'test') return;
  testSequence = '';
  if (net.socket?.readyState !== WebSocket.OPEN || !serverCompatible) { toast('Aguarde a conexão com o servidor e digite TEST novamente.'); return; }
  if (testModeRequested) return;
  testModeRequested = true;
  closeTutorial();
  closeAudioPrompt();
  const nickname = $('#createForm [name="nickname"]').value.trim() || localStorage.getItem('tankNickname') || 'Tester';
  audio.unlock();
  send(CLIENT.CREATE_ROOM, { nickname, roomName: 'Laboratório TESTE', debugMode: true });
  toast('MODO TESTE • partida com bot criada');
});
const debugOptions = (definitions, types) => types.map((type) => `<option value="${type}">${escapeHtml(definitions[type]?.name || type)}</option>`).join('');
$('#debugClass').innerHTML = debugOptions(CLASS_DEFS, Object.keys(CLASS_DEFS));
$('#debugElement').innerHTML = `<option value="">ELEMENTO SORTEADO</option>${debugOptions(ARSENAL_DEFS, ELEMENTAL_BOMBS)}`;
$('#debugBotClass').innerHTML = $('#debugClass').innerHTML;
$('#debugWeapon').innerHTML = `<option value="standard">TIRO PADRÃO</option>${debugOptions(ARSENAL_DEFS, SELECTABLE_ARSENAL_ITEMS)}`;
$('#debugPowerup').innerHTML = `<option value="">ESCOLHA UM POWERUP</option>${debugOptions(POWERUP_DEFS, POWERUPS)}`;
$('#debugToggle').onclick = () => { $('#debugPanel').hidden = !$('#debugPanel').hidden; $('#debugToggle').setAttribute('aria-expanded', String(!$('#debugPanel').hidden)); if (!$('#debugPanel').hidden) { const bot = game?.players.find((entry) => entry.isBot); $('#debugMap').value = room?.rules?.mapType || 'flat'; $('#debugBotBehavior').value = room?.rules?.debugBotPassive ? 'passive' : 'active'; $('#debugBotDifficulty').value = room?.rules?.botDifficulty || 'easy'; $('#debugBotClass').value = bot?.classType || 'armored'; $('#debugBotHealth').max = String(bot?.maxHealth || 300); $('#debugBotHealth').value = String(bot?.health || 300); } audio.ui('select'); };
$('#debugClose').onclick = () => { $('#debugPanel').hidden = true; $('#debugToggle').setAttribute('aria-expanded', 'false'); };
$('#debugClass').onchange = () => { send(CLIENT.DEBUG_ACTION, { action: 'class', type: $('#debugClass').value }); selectedWeapon = 'standard'; $('#debugWeapon').value = 'standard'; audio.ui('select'); };
$('#debugElement').onchange = () => { const type = $('#debugElement').value; if (!type) return; send(CLIENT.DEBUG_ACTION, { action: 'element', type }); audio.ui('confirm'); toast(`ELEMENTO DE TESTE • ${ARSENAL_DEFS[type]?.name || type}`); };
$('#debugWeapon').onchange = () => { const type = $('#debugWeapon').value; selectedWeapon = type; mixerArmed = false; mixerPartner = null; if (type !== 'standard') send(CLIENT.DEBUG_ACTION, { action: 'weapon', type }); renderer.setMovementMode(type); audio.ui('select'); toast(`TESTE • ${ARSENAL_DEFS[type]?.name || 'TIRO PADRÃO'}`); };
$('#debugGrantPowerup').onclick = () => { const type = $('#debugPowerup').value; if (!type) return; send(CLIENT.DEBUG_ACTION, { action: 'powerup', type }); audio.ui('confirm'); toast(`POWERUP ADICIONADO • ${POWERUP_DEFS[type]?.name || type}`); };
$('#debugApplyMap').onclick = () => { send(CLIENT.DEBUG_ACTION, { action: 'map', type: $('#debugMap').value }); $('#debugPanel').hidden = true; audio.ui('confirm'); };
$('#debugApplyBot').onclick = () => { send(CLIENT.DEBUG_ACTION, { action: 'bot', behavior: $('#debugBotBehavior').value, difficulty: $('#debugBotDifficulty').value, classType: $('#debugBotClass').value, health: Number($('#debugBotHealth').value) }); audio.ui('confirm'); toast('BOT DE TESTE ATUALIZADO'); };
$('#debugRefill').onclick = () => { send(CLIENT.DEBUG_ACTION, { action: 'refill' }); audio.ui('confirm'); toast('VIDA, COMBUSTÍVEL E MUNIÇÃO RECARREGADOS'); };
$('#debugReset').onclick = () => { send(CLIENT.DEBUG_ACTION, { action: 'reset' }); $('#debugPanel').hidden = true; audio.ui('confirm'); };
$('#createForm').onsubmit = (e) => { e.preventDefault(); syncBotCapacity(); const form = new FormData(e.target); const v = Object.fromEntries(form); localStorage.setItem('tankNickname', v.nickname.trim()); send(CLIENT.CREATE_ROOM, { nickname: v.nickname, roomName: v.roomName, rules: { ...v, mines: Boolean(v.mines), classesEnabled: Boolean(v.classesEnabled), friendlyFire: ['coop', 'teams', 'teamHill'].includes(v.gameMode) && Boolean(v.friendlyFire), enabledEvents: form.getAll('enabledEvents'), enabledPowerups: form.getAll('enabledPowerups') } }); };
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
function movementPayload(direction, vertical = 0) { return { direction, vertical, arsenal: vertical ? null : selectedWeapon === 'armoredDash' ? 'armoredDash' : null }; }
function performArmoredDash(direction = renderer.armoredDashDirection()) {
  const me = game?.players.find((player) => player.id === playerId);
  if (game?.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId || !me?.alive || !me.ammo?.armoredDash || game.actions?.movesLeft <= 0 || game.shotEndsAt) return;
  audio.unlock(); send(CLIENT.MOVE, { direction, arsenal: 'armoredDash' }); mobileVibrate([16, 12, 30]);
}
let heldDrive = null;
function stopDrive() { if (heldDrive) clearInterval(heldDrive.timer); heldDrive = null; }
function driveOnce(direction, vertical = 0) {
  const me = game?.players.find((player) => player.id === playerId);
  if (game?.phase !== 'playing' || !me?.alive || me.motionState === 'floating') { stopDrive(); return; }
  const ownsTurn = game.players[game.turnIndex]?.id === playerId;
  if (ownsTurn && !vertical && selectedWeapon === 'spider' && !me.spiderClimb) { stopDrive(); toast('ARANHA: toque no mapa dentro do alcance para saltar.'); return; }
  const payload = ownsTurn ? movementPayload(direction, vertical) : { direction, vertical };
  if (!payload.arsenal && (me.fuel || 0) <= 0 && !((me.buoyActive || me.classType === 'amphibian' && !me.teslaDisabledTurns) && me.swimming) && !equippedPowers(me).includes('rocketDash') && !equippedPowers(me).includes('excavator') && !(vertical > 0 && (me.ceilingClinging || me.surfaceClinging?.side === 'bottom'))) { stopDrive(); return; }
  send(CLIENT.MOVE, payload);
  if (payload.arsenal || vertical > 0 && (me.ceilingClinging || me.surfaceClinging?.side === 'bottom') || (ownsTurn && !vertical && !me.airborne?.parachute && (equippedPowers(me).includes('rocketDash') || equippedPowers(me).includes('excavator')))) stopDrive();
}
function startDrive(direction, vertical = 0) {
  const me = game?.players.find((player) => player.id === playerId);
  if (game?.phase !== 'playing' || !me?.alive || me.motionState === 'floating') return;
  const ownsTurn = game.players[game.turnIndex]?.id === playerId;
  if (ownsTurn && !vertical && selectedWeapon === 'spider' && !me.spiderClimb) { toast('ARANHA: toque no mapa dentro do alcance para saltar.'); return; }
  const ceilingDown = vertical > 0 && (me.ceilingClinging || me.surfaceClinging?.side === 'bottom');
  if (vertical && !ceilingDown && (me.airborne || swimmableWaterSurface(game.terrain, game.waterZones, me.x) === null)) return;
  const oneShot = Boolean(ceilingDown || ownsTurn && (movementPayload(direction, vertical).arsenal || (!vertical && !me.airborne?.parachute && (equippedPowers(me).includes('rocketDash') || equippedPowers(me).includes('excavator')))));
  if (!oneShot && heldDrive) { heldDrive.direction = direction; heldDrive.vertical = vertical; return; }
  stopDrive();
  if (ceilingDown) toast('ARANHA • pressione para baixo duas vezes para soltar do teto');
  mobileVibrate(10); driveOnce(direction, vertical);
  if (!oneShot && ((me.fuel || 0) > 0 || (me.buoyActive || me.classType === 'amphibian' && !me.teslaDisabledTurns) && me.swimming)) {
    heldDrive = { direction, vertical, timer: null };
    heldDrive.timer = setInterval(() => { if (heldDrive) driveOnce(heldDrive.direction, heldDrive.vertical); }, DRIVE.packetMs);
  }
}
$('#startButton').onclick = () => send(CLIENT.START_GAME);
$('#rerollScenarioButton').onclick = () => send(CLIENT.REROLL_SCENARIO);
for (const [selector, direction] of [['#moveLeft', -1], ['#moveRight', 1]]) {
  const button = $(selector);
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); startDrive(direction); });
  button.addEventListener('pointerup', stopDrive);
  button.addEventListener('pointercancel', stopDrive);
  button.addEventListener('lostpointercapture', stopDrive);
  button.addEventListener('click', (event) => { if (event.detail === 0) driveOnce(direction); });
}
let moveStickPointerId = null; let moveStickDirection = ''; let moveStickCeilingDownUsed = false;
function resetMoveStick() { moveStickPointerId = null; moveStickDirection = ''; moveStickCeilingDownUsed = false; $('#moveStickKnob').style.transform = 'translate(-50%,-50%)'; $('#moveStick').classList.remove('engaged'); $('#moveStick').dataset.direction = ''; stopDrive(); }
function updateMoveStick(event) {
  const rect = $('#moveStickRing').getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2; const dy = event.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(dx, dy); const scale = Math.min(rect.width / 2 - 13, distance) / Math.max(1, distance);
  $('#moveStickKnob').style.transform = `translate(calc(-50% + ${Math.round(dx * scale)}px),calc(-50% + ${Math.round(dy * scale)}px))`;
  const me = game?.players.find((player) => player.id === playerId);
  const verticalAllowed = Boolean(me?.swimming || me?.ceilingClinging || me?.surfaceClinging?.side === 'bottom');
  const direction = stableMoveDirection(dx, dy, moveStickDirection, verticalAllowed);
  $('#moveStick').dataset.direction = direction;
  if (direction === moveStickDirection) return;
  moveStickDirection = direction;
  if (!direction) { stopDrive(); return; }
  if (direction === 'left') startDrive(-1);
  else if (direction === 'right') startDrive(1);
  else {
    if (direction === 'down' && (me?.ceilingClinging || me?.surfaceClinging?.side === 'bottom')) {
      if (moveStickCeilingDownUsed) return;
      moveStickCeilingDownUsed = true;
    }
    startDrive(0, direction === 'up' ? -1 : 1);
  }
}
$('#moveStickRing').addEventListener('pointerdown', (event) => { if (!mobileLayoutQuery.matches) return; event.preventDefault(); moveStickPointerId = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); $('#moveStick').classList.add('engaged'); updateMoveStick(event); });
$('#moveStickRing').addEventListener('pointermove', (event) => { if (moveStickPointerId === event.pointerId) { event.preventDefault(); updateMoveStick(event); } });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#moveStickRing').addEventListener(type, (event) => { if (moveStickPointerId === event.pointerId) resetMoveStick(); });
function canOpenParachute() {
  const me = game?.players.find((player) => player.id === playerId);
  return Boolean(game?.phase === 'playing' && !spectatorMode && game.players[game.turnIndex]?.id === playerId && me?.alive && me.airborne && !me.airborne.parachute);
}
function activateJump(target = null) {
  const me = game?.players.find((player) => player.id === playerId);
  if (!me?.alive || game?.phase !== 'playing' || spectatorMode || game.players[game.turnIndex]?.id !== playerId) return;
  if (me.airborne) {
    if (me.airborne.parachute) return;
    send(CLIENT.USE_ARSENAL, { type: 'parachute' });
    toast('PARAQUEDAS ABERTO • use A/D ou a alavanca para dirigir');
    mobileVibrate([18, 14, 28]);
    return;
  }
  send(CLIENT.USE_ARSENAL, target ? { type: 'jump', x: target.x, y: target.y } : { type: 'jump', angle: $('#angle').value, power: $('#power').value, direction: aimDirection });
  selectedWeapon = 'standard'; renderer.setMovementMode('standard');
  $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === 'standard'));
  updateFireButton(); refreshAimCoach(); toast('NO AR • tiro padrão pronto');
}
function aimStorageKey() { return playerId ? `tankAim:${playerId}` : null; }
function saveAim() { const key = aimStorageKey(); if (key) localStorage.setItem(key, JSON.stringify({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection })); }
function restoreAim() { const key = aimStorageKey(); let value = null; try { value = key && JSON.parse(localStorage.getItem(key)); } catch {} const me = game?.players.find((player) => player.id === playerId); if (!value) value = { angle: 45, power: 310, direction: me?.facing || 1 }; aimDirection = value.direction === -1 ? -1 : 1; $('#angle').value = Math.max(aimMinimum(), Math.min(85, Number(value.angle) || 45)); $('#power').value = Math.max(100, Math.min(580, Number(value.power) || 310)); $('#angleValue').textContent = `${$('#angle').value}°`; $('#powerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; syncAimPreview(); }
function harpoonReady() { return game?.harpoonAnchor?.ownerId === playerId && !game.shotEndsAt && !game.harpoonPull && (game.actions?.movesLeft || 0) > 0; }
function canLocalFire() { const ownTurn = game?.phase === 'playing' && !spectatorMode && game.players[game.turnIndex]?.id === playerId && game.players[game.turnIndex]?.alive && !game.players[game.turnIndex]?.teslaDisabledTurns; const activating = renderer.hasAwaitingVerticalShot() || renderer.hasAwaitingClusterShot() || renderer.hasAwaitingFireworksShot() || harpoonReady(); const dashReady = selectedWeapon === 'armoredDash' && (game?.actions?.movesLeft || 0) > 0 && (game?.players[game.turnIndex]?.ammo?.armoredDash || 0) > 0; return Boolean(ownTurn && !fireRequestPending && !(game.arenaWarningUntil > gameNow()) && (activating || dashReady && !game.shotEndsAt || (selectedWeapon && !['spider', 'ninjaFatal', 'superheat', 'armoredDash'].includes(selectedWeapon) && !game.shotEndsAt && !game.harpoonPull && game.actions?.attackAvailable))); }
function updateFireButton() {
  const button = $('#fireButton');
  const ownTurn = game?.phase === 'playing' && !spectatorMode && game.players[game.turnIndex]?.id === playerId;
  const disabledByTesla = ownTurn && game.players[game.turnIndex]?.teslaDisabledTurns > 0;
  const ready = canLocalFire();
  const split = ownTurn && !disabledByTesla && renderer.hasAwaitingClusterShot();
  const fireworks = ownTurn && !disabledByTesla && renderer.hasAwaitingFireworksShot();
  const vertical = ownTurn && !disabledByTesla && renderer.hasAwaitingVerticalShot();
  const harpoon = ownTurn && !disabledByTesla && harpoonReady();
  const spider = ownTurn && !disabledByTesla && selectedWeapon === 'spider' && !game?.players[game.turnIndex]?.spiderClimb;
  const label = disabledByTesla ? 'TESLA • SÓ MOVER' : harpoon ? '<small>➜</small> PUXAR <span>✦</span>' : split ? '<small>✦</small> FRAGMENTAR <span>✦</span>' : fireworks ? '<small>✷</small> DETONAR <span>✷</span>' : vertical ? `<small>↗</small> VETOR ${(renderer.shots.find((shot) => shot.weapon === 'verticalStrike' && shot.canActivateVertical)?.vectorRedirectsUsed || 0) + 1}/2 <span>✦</span>` : spider || ownTurn && selectedWeapon === 'ninjaFatal' && !game?.shotEndsAt ? 'TOQUE NO MAPA' : ready && selectedWeapon === 'armoredDash' ? '<small>➜</small> INVESTIR <span>✦</span>' : ready && selectedWeapon === 'splitDamage' ? '<small>◇</small> ATIVAR <span>✦</span>' : ready ? '<small>4</small> ATIRAR <span>✦</span>' : ownTurn && !selectedWeapon && !game?.shotEndsAt ? 'ESCOLHA CARTA' : ownTurn ? 'AGUARDE' : 'OUTRO TURNO';
  button.disabled = !ready;
  button.classList.toggle('split-ready', split || fireworks || harpoon);
  button.classList.toggle('fire-ready', ready);
  button.setAttribute('aria-label', disabledByTesla ? 'Tesla ativo: apenas movimento disponível' : harpoon ? 'Puxar cabo do arpão; ou passar o turno para recuperar a munição' : spider ? 'Aranha: toque no cenário para saltar até o ponto indicado' : ready ? split ? 'Fragmentar projétil' : fireworks ? 'Detonar fogos no ar' : vertical ? 'Redirecionar Tiro Vetorial' : selectedWeapon === 'armoredDash' ? 'Investir na direção apontada no mapa' : selectedWeapon === 'splitDamage' ? 'Ativar Dano Dividido por duas rodadas' : 'Atirar' : ownTurn && !selectedWeapon ? 'Escolha uma carta do arsenal para atirar' : ownTurn ? 'Aguarde o fim da animação' : 'Atirar indisponível: fora do seu turno');
  if (button.innerHTML !== label) button.innerHTML = label;
  $('#gameScreen').classList.toggle('activation-ready', split || fireworks || vertical || harpoon);
}
function refreshAimCoach() {
  const me = game?.players.find((player) => player.id === playerId);
  const mine = game?.phase === 'playing' && !spectatorMode && game.players[game.turnIndex]?.id === playerId;
  const powerupsBlocked = (me?.powerupBlockedTurns || 0) > 0 || (me?.teslaDisabledTurns || 0) > 0;
  const targetedPower = [...equippedPowers(me)].reverse().find((type) => ['lightningStep', 'teleport', 'trickster'].includes(type));
  const pullingHarpoon = harpoonReady();
  const choosingBlink = !powerupsBlocked && Boolean(targetedPower || selectedWeapon === 'blink' && (me?.ammo?.blink || 0) > 0);
  const choosingSpider = mine && selectedWeapon === 'spider' && !me?.spiderClimb;
  const choosingDash = mine && selectedWeapon === 'armoredDash' && (me?.ammo?.armoredDash || 0) > 0;
  renderer.setBlinkMode(choosingBlink && !pullingHarpoon && !choosingSpider && !choosingDash && targetedPower !== 'trickster' ? (selectedWeapon === 'blink' ? 'lightningStep' : targetedPower) : null);
  const parachuteAvailable = mine && !pullingHarpoon && Boolean(me?.airborne) && !me.airborne.parachute;
  const steeringParachute = mine && Boolean(me?.airborne?.parachute);
  $('#aimCoach').innerHTML = pullingHarpoon ? '<b>➜</b><span>PUXAR CABO DO ARPÃO<small>Use Espaço, Enter, ATIRAR ou toque na arena</small></span>' : parachuteAvailable ? '<b>▽</b><span>ABRIR PARAQUEDAS<small>Pressione Espaço ou toque na arena</small></span>' : choosingSpider ? `<b>✦</b><span>ARANHA: TOQUE PARA SALTAR<small>Alcance: ${movementDistance({ spiderLeap: true })} blocos • adere no primeiro contato com a superfície</small></span>` : choosingDash ? '<b>➜</b><span>INVESTIDA: MIRE ESQUERDA OU DIREITA<small>Toque no mapa ou use INVESTIR • o destino previsto aparece no solo</small></span>' : steeringParachute ? '<b>↔</b><span>PARAQUEDAS: A/D PARA DIRIGIR<small>Deslocamento leve • consome combustível até o pouso</small></span>' : targetedPower === 'trickster' ? '<b>↔</b><span>TOQUE EM OUTRO TANQUE<small>Vocês trocarão de posição</small></span>' : choosingBlink ? `<b>⚡</b><span>TOQUE OU ARRASTE PARA ESCOLHER POUSO<small>Régua: ${targetedPower === 'teleport' ? 580 : 270} blocos • distância e pouso previstos</small></span>` : '<b>1</b><span>ARRASTE PARA MIRAR<small>Direção, ângulo e força ficam salvos após o tiro</small></span>';
  $('#aimCoach').classList.toggle('visible', pullingHarpoon || parachuteAvailable || choosingSpider || choosingDash || steeringParachute || choosingBlink || (mine && lastTurn !== game?.turnNumber && !localStorage.getItem('tankAimLearned')));
}
function fireButtonFx() { const button = $('#fireButton'); const burst = $('#fireFeedback'); const rect = button.getBoundingClientRect(); burst.style.left = `${rect.left + rect.width / 2}px`; burst.style.top = `${rect.top + rect.height / 2}px`; burst.classList.remove('show'); void burst.offsetWidth; burst.classList.add('show'); clearTimeout(fireButtonFx.timer); fireButtonFx.timer = setTimeout(() => burst.classList.remove('show'), 720); mobileVibrate([18, 18, 32]); }
function markFireRequested() { fireRequestPending = true; updateFireButton(); clearTimeout(fireRequestTimer); fireRequestTimer = setTimeout(() => { fireRequestPending = false; updateFireButton(); }, 3000); }
function activateHarpoonCable() {
  if (!harpoonReady()) return false;
  if (!fireRequestPending) { fireButtonFx(); markFireRequested(); send(CLIENT.ACTIVATE_HARPOON); toast('ARPÃO: PUXANDO • ATAQUE PRESERVADO'); }
  return true;
}
function fireSelectedWeapon() {
  if (activateHarpoonCable()) return;
  if (selectedWeapon === 'spider' && game?.players[game.turnIndex]?.id === playerId && !harpoonReady() && !renderer.hasAwaitingVerticalShot() && !renderer.hasAwaitingClusterShot() && !renderer.hasAwaitingFireworksShot()) {
    toast('ARANHA: toque no cenário dentro do alcance marcado para saltar.'); return;
  }
  if (selectedWeapon === 'ninjaFatal') { toast('CORTE FATAL • toque no cenário na direção desejada.'); return; }
  if (selectedWeapon === 'blink') { toast('BLINK: toque em um local seguro do cenário.'); return; }
  if (selectedWeapon === 'healingDrone') { send(CLIENT.USE_ARSENAL, { type: 'healingDrone' }); toast('DRONE DE CURA ATIVADO: 30 HP por turno'); return; }
  if (!canLocalFire()) { if (game?.players[game.turnIndex]?.id === playerId && !selectedWeapon) toast('Escolha uma carta do arsenal antes de atirar.'); return; }
  if (renderer.hasAwaitingVerticalShot()) { const target = renderer.verticalTargetForActivation(); const token = renderer.activateVerticalShot(); if (token) { audio.unlock(); fireButtonFx(); markFireRequested(); send(CLIENT.ACTIVATE_VERTICAL, { token, target }); toast('TIRO VETORIAL REDIRECIONADO!'); } return; }
  if (renderer.hasAwaitingClusterShot()) { const token = renderer.activateClusterShot(); if (token) { audio.unlock(); fireButtonFx(); markFireRequested(); send(CLIENT.ACTIVATE_CLUSTER, { token }); toast('FRAGMENTAÇÃO: 3 MÍSSEIS!'); } return; }
  if (renderer.hasAwaitingFireworksShot()) { const token = renderer.activateFireworksShot(); if (token) { audio.unlock(); fireButtonFx(); markFireRequested(); send(CLIENT.ACTIVATE_FIREWORKS, { token }); toast('FOGOS DETONADOS NO AR!'); } return; }
  if (selectedWeapon === 'jump') { activateJump(); return; }
  if (selectedWeapon === 'armoredDash') { fireButtonFx(); markFireRequested(); performArmoredDash(); return; }
  if (selectedWeapon === 'splitDamage') { audio.unlock(); fireButtonFx(); markFireRequested(); send(CLIENT.USE_ARSENAL, { type: 'splitDamage' }); toast('DANO DIVIDIDO ATIVADO • 2 RODADAS'); return; }
  audio.unlock(); saveAim(); fireButtonFx(); markFireRequested(); send(CLIENT.FIRE, { angle: $('#angle').value, power: $('#power').value, direction: aimDirection, weapon: selectedWeapon, mixerPartner });
  if (mixerPartner) { mixerPartner = null; mixerArmed = false; updateComboPreview(); }
}
let firePointerHandledAt = -Infinity;
$('#fireButton').addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); firePointerHandledAt = performance.now(); fireSelectedWeapon(); });
$('#fireButton').onclick = () => { if (performance.now() - firePointerHandledAt < 500) return; fireSelectedWeapon(); }; $('#passButton').onclick = () => send(CLIENT.PASS_TURN);
$('#classActionButton').onclick = () => {
  const button = $('#classActionButton'); if (button.hidden || button.disabled) return;
  if (button.dataset.action === 'ninjaFatal') { selectedWeapon = 'ninjaFatal'; renderer.setNinjaFatalTarget(null); $$('.weapon').forEach((item) => item.classList.toggle('active', item.dataset.weapon === selectedWeapon)); updateFireButton(); toast('CORTE FATAL • toque no mapa para mirar o dash'); mobileVibrate(18); }
  else if (button.dataset.action === 'backpackerReroll') { send(CLIENT.REROLL_BACKPACKER); toast('Trocando o arsenal por três cartas aleatórias...'); mobileVibrate(12); }
  button.disabled = true; audio.ui('confirm');
};
$('#rematchButton').onclick = () => send(room?.rules?.debugMode ? CLIENT.DEBUG_ACTION : CLIENT.REMATCH, room?.rules?.debugMode ? { action: 'reset' } : undefined); $('#backButton').onclick = () => location.reload();
$('#restartButton').onclick = () => { if (room?.rules?.debugMode) { send(CLIENT.DEBUG_ACTION, { action: 'reset' }); return; } if (confirm('Reiniciar a partida para todos os jogadores?')) send(CLIENT.REMATCH); };
$('#pauseGameButton').onclick = () => { send(CLIENT.SET_SOLO_CONTROL, { action: 'pause', paused: !game?.paused }); audio.ui('confirm'); };
$('#resumeGameButton').onclick = () => { send(CLIENT.SET_SOLO_CONTROL, { action: 'pause', paused: false }); audio.ui('confirm'); };
$('#botSpeedButton').onclick = () => { const speeds = [1, 2, 4]; const next = speeds[(speeds.indexOf(game?.botSpeed || 1) + 1) % speeds.length]; send(CLIENT.SET_SOLO_CONTROL, { action: 'botSpeed', speed: next }); audio.ui('select'); toast(`TURNOS DOS BOTS ×${next}`); };
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
function inviteUrl(origin = location.origin) { const url = new URL(location.pathname, origin); url.searchParams.set('room', room.code); return url.href; }
async function inviteOrigins() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return [{ origin: location.origin, label: 'Este endereço' }];
  try {
    const response = await fetch('/host-info', { cache: 'no-store' });
    if (!response.ok) throw new Error('Endereço indisponível');
    const info = await response.json();
    const options = [];
    if (info.publicUrl) options.push({ origin: info.publicUrl, label: 'Internet / VPN · endereço configurado' });
    for (const origin of info.lanUrls || []) options.push({ origin, label: `Rede local · ${new URL(origin).hostname}` });
    return options.length ? options : [{ origin: location.origin, label: 'Este PC · apenas localhost' }];
  } catch { return [{ origin: location.origin, label: 'Este PC · apenas localhost' }]; }
}
async function copyInviteLink() {
  const input = $('#inviteLink');
  if (await copyRoomText(input.value, input)) {
    const scope = $('#inviteAddress').selectedOptions[0]?.textContent || '';
    $('#inviteStatus').textContent = scope.startsWith('Rede local') ? 'Link LAN copiado! Envie a jogadores na mesma rede.' : scope.includes('localhost') ? 'Este link só funciona neste PC. Conecte o anfitrião à rede.' : 'Link copiado! Confirme que o endereço está acessível aos amigos.';
    toast('Link da sala copiado!');
    return true;
  }
  $('#inviteStatus').textContent = 'Selecione o link acima para copiar manualmente.'; input.focus(); input.select(); return false;
}
function closeInvite() { $('#inviteModal').hidden = true; document.body.classList.remove('modal-open'); $('#inviteFriends').focus(); }
$('#inviteFriends').onclick = async () => {
  if (!room?.code) return;
  const options = await inviteOrigins();
  const address = $('#inviteAddress');
  address.replaceChildren(...options.map(({ origin, label }) => { const option = document.createElement('option'); option.value = origin; option.textContent = label; return option; }));
  address.hidden = $('#inviteAddressLabel').hidden = options.length < 2;
  $('#inviteLink').value = inviteUrl(options[0].origin);
  $('#inviteStatus').textContent = options[0].origin === location.origin && location.hostname === 'localhost' ? 'Este link só funciona neste PC. Conecte o anfitrião à rede para gerar um link LAN.' : 'Compartilhe com jogadores na mesma rede; pela internet, configure acesso ao PC anfitrião.';
  $('#shareInviteLink').hidden = typeof navigator.share !== 'function';
  $('#inviteModal').hidden = false;
  document.body.classList.add('modal-open');
  copyInviteLink();
};
$('#inviteAddress').onchange = () => { $('#inviteLink').value = inviteUrl($('#inviteAddress').value); $('#inviteStatus').textContent = 'Link atualizado. Copie para enviar aos amigos.'; };
$('#copyInviteLink').onclick = copyInviteLink;
$('#shareInviteLink').onclick = async () => {
  if (!room?.code || !navigator.share) return;
  try { await navigator.share({ title: `TankDots Wars — ${room.name}`, text: `Entre na minha sala ${room.code} do TankDots Wars!`, url: $('#inviteLink').value }); $('#inviteStatus').textContent = 'Convite compartilhado.'; }
  catch (error) { if (error?.name !== 'AbortError') $('#inviteStatus').textContent = 'Não foi possível compartilhar. Use COPIAR LINK.'; }
};
$('#inviteClose').onclick = closeInvite;
$('#inviteModal').onclick = (event) => { if (event.target === $('#inviteModal')) closeInvite(); };
addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#inviteModal').hidden) closeInvite(); });
function laserAimActive() { const me = game?.players.find((player) => player.id === playerId); return equippedPowers(me).includes('laser') && me.inventory?.includes('laser'); }
function aimMinimum() { return selectedWeapon === 'waterCannon' ? -70 : laserAimActive() || selectedWeapon === 'harpoon' ? -85 : 5; }
function clearAimAssist() { aimAssistTargetId = null; aimAssistEstimate = null; renderer.aimAssistTargetId = null; renderer.aimAssistError = null; $('#aimAssistButton').classList.remove('active', 'approximate'); $('#aimAssistButton').title = 'Sugerir mira para o inimigo mais próximo'; }
function syncStickKnob() { const ring = $('#aimStickRing'); const angle = Number($('#angle').value) * Math.PI / 180; const power = Math.round((Number($('#power').value) - 100) / 4.8); const radius = Math.max(0, ring.clientWidth / 2 - 23) * power / 100; $('#aimStickKnob').style.transform = `translate(${Math.round(aimDirection * Math.cos(angle) * radius)}px,${Math.round(-Math.sin(angle) * radius)}px)`; $('#stickAngleValue').textContent = `${$('#angle').value}°`; $('#stickPowerValue').textContent = `${power}%`; ring.setAttribute('aria-valuenow', String(power)); ring.setAttribute('aria-valuetext', `${$('#angle').value} graus, ${power}% de força, ${aimDirection < 0 ? 'esquerda' : 'direita'}`); }
function updateMobileAimReadout() { $('#mobileAngleValue').textContent = `${$('#angle').value}°`; $('#mobilePowerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; $('#mobileAimDirection').textContent = aimDirection < 0 ? '←' : '→'; $('#mobileAimReadout').setAttribute('aria-label', `Mira para ${aimDirection < 0 ? 'esquerda' : 'direita'}; toque para inverter a direção`); syncStickKnob(); }
function broadcastAim(force = false) {
  if (game?.phase !== 'playing' || game.paused || game.shotEndsAt || game.players[game.turnIndex]?.id !== playerId) return;
  const now = performance.now();
  if (!force && now - lastAimSyncAt < 90) { if (!aimSyncTimer) aimSyncTimer = setTimeout(() => { aimSyncTimer = null; broadcastAim(true); }, 90 - (now - lastAimSyncAt)); return; }
  clearTimeout(aimSyncTimer); aimSyncTimer = null; lastAimSyncAt = now;
  send(CLIENT.SET_AIM, { angle: Number($('#angle').value), direction: aimDirection });
}
function syncAimPreview() { renderer.setAim({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection }); updateMobileAimReadout(); broadcastAim(); }
function setAimControls(angle, power, direction = aimDirection) { clearAimAssist(); aimDirection = direction < 0 ? -1 : 1; $('#angle').value = Math.max(aimMinimum(), Math.min(85, Math.round(angle))); $('#power').value = Math.max(100, Math.min(580, Math.round(power))); $('#angleValue').textContent = `${$('#angle').value}°`; $('#powerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; syncAimPreview(); $('#aimCoach').classList.remove('visible'); }
$('#angle').oninput = (e) => { clearAimAssist(); $('#angleValue').textContent = `${e.target.value}°`; syncAimPreview(); }; $('#power').oninput = (e) => { clearAimAssist(); $('#powerValue').textContent = `${Math.round((e.target.value - 100) / 4.8)}%`; syncAimPreview(); };
let mobileAimLocked = false;
function updateAimLockButton() { const button = $('#aimLockButton'); button.classList.toggle('locked', mobileAimLocked); button.setAttribute('aria-pressed', String(mobileAimLocked)); button.setAttribute('aria-label', mobileAimLocked ? 'Destravar mira' : 'Travar mira'); button.title = mobileAimLocked ? 'Mira travada — toque para liberar' : 'Travar ângulo, força e direção'; button.innerHTML = mobileAimLocked ? '◆<span>MIRA<br>TRAVADA</span>' : '◇<span>TRAVAR<br>MIRA</span>'; $('#aimAssistButton').disabled = mobileAimLocked || button.disabled; }
$('#aimLockButton').addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); if ($('#aimLockButton').disabled) return; mobileAimLocked = !mobileAimLocked; updateAimLockButton(); mobileVibrate(mobileAimLocked ? [12, 24, 12] : 8); audio.ui(); });
$('#mobileAimReadout').addEventListener('click', () => { if ($('#mobileAimReadout').disabled || mobileAimLocked) return; setAimControls(Number($('#angle').value), Number($('#power').value), -aimDirection); audio.ui('select'); mobileVibrate(9); });
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
    const proposed = laser ? { direction: dx < 0 ? -1 : 1, angle: Math.round(Math.atan2(dy, Math.max(5, Math.abs(dx))) * 180 / Math.PI), power: Math.max(100, Math.min(580, Math.round((distance - 620) / 1.35))), error: Math.round(Math.max(0, distance - 1450)) } : suggestAim({ terrain: game.terrain, players, objects: game.objects, shooterId: playerId, origin, target: { ...candidate, ...position }, gravity: game.gravity, wind: game.wind, platforms });
    if (proposed && (!fallback || proposed.error < fallback.suggestion.error)) fallback = { target: candidate, suggestion: proposed };
    if (proposed && proposed.error <= 110) { target = candidate; suggestion = proposed; break; }
  }
  if (!suggestion && fallback) ({ target, suggestion } = fallback);
  if (!suggestion) { clearAimAssist(); toast('Sem trajetória válida; ajuste a mira manualmente.'); return; }
  aimDirection = suggestion.direction; $('#angle').value = suggestion.angle; $('#power').value = suggestion.power; $('#angleValue').textContent = `${suggestion.angle}°`; $('#powerValue').textContent = `${Math.round((suggestion.power - 100) / 4.8)}%`;
  aimAssistTargetId = target.id; aimAssistEstimate = suggestion.error; renderer.aimAssistTargetId = target.id; renderer.aimAssistError = suggestion.error; renderer.setAim({ angle: suggestion.angle, power: suggestion.power, direction: aimDirection }); updateMobileAimReadout(); broadcastAim(true);
  $('#aimAssistButton').classList.add('active'); $('#aimAssistButton').classList.toggle('approximate', suggestion.error > 110); $('#aimAssistButton').title = `Alvo: ${target.nickname}. Toque para alternar.`; $('#aimCoach').classList.remove('visible'); audio.ui('confirm'); mobileVibrate(10);
  toast(suggestion.error > 110 ? `Mira aproximada para ${target.nickname}: sem linha livre. Ajuste ou mude de posição.` : `Mira assistida: ${target.nickname} • ${laser ? 'laser' : `desvio estimado ${suggestion.error} px`}. Ajuste antes de disparar.`);
};
updateMobileAimReadout();
updateAimLockButton();
function applyMobilePreferences() {
  const mobile = mobileLayoutQuery.matches;
  document.body.dataset.mobileAim = mobileAimMode;
  document.body.dataset.mobilePrecision = mobilePrecision;
  $('#mobileAimStick').hidden = !mobile || mobileAimMode !== 'stick';
  $('#mobileSettingsButton').hidden = !mobile;
  if (!mobile) $('#mobileSettings').hidden = true;
  renderer.setCameraMode(mobile && mobileCameraMode === 'fixed' ? 'fixed' : 'dynamic');
  for (const [attribute, selected] of [['mobileAim', mobileAimMode], ['mobilePrecision', mobilePrecision], ['mobileCamera', mobileCameraMode]]) {
    $$(`#mobileSettings [data-${attribute.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`).forEach((button) => {
      const active = button.dataset[attribute] === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  updateMobileAimReadout();
}
$('#mobileSettingsButton').onclick = () => { const panel = $('#mobileSettings'); panel.hidden = !panel.hidden; $('#mobileSettingsButton').setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) $('#hapticStatus').textContent = hapticSupportMessage(); audio.ui('open'); };
$('#mobileSettings').onclick = (event) => {
  if (event.target.closest('#hapticTestButton')) { const accepted = mobileVibrate([140, 80, 140], true); $('#hapticStatus').textContent = accepted ? 'Comando enviado. Se não vibrou, confira as configurações de vibração do aparelho.' : hapticSupportMessage(); audio.ui('select'); return; }
  const aimButton = event.target.closest('button[data-mobile-aim]');
  const precisionButton = event.target.closest('button[data-mobile-precision]');
  const cameraButton = event.target.closest('button[data-mobile-camera]');
  if (aimButton) { mobileAimMode = aimButton.dataset.mobileAim; localStorage.setItem('tankMobileAimMode', mobileAimMode); toast(mobileAimMode === 'stick' ? 'Mira: alavanca ativada' : 'Mira: arraste no cenário'); }
  else if (precisionButton) { mobilePrecision = precisionButton.dataset.mobilePrecision; localStorage.setItem('tankMobilePrecision', mobilePrecision); toast(mobilePrecision === 'fine' ? 'Mira precisa ativada' : 'Sensibilidade normal ativada'); }
  else if (cameraButton) { mobileCameraMode = cameraButton.dataset.mobileCamera; localStorage.setItem('tankMobileCameraMode', mobileCameraMode); toast(mobileCameraMode === 'fixed' ? 'Zoom único: câmera manual' : 'Foco dinâmico ativado'); }
  else return;
  applyMobilePreferences(); audio.ui('select');
};
mobileLayoutQuery.addEventListener('change', applyMobilePreferences); applyMobilePreferences();
let stickPointerId = null;
let stickGesture = null;
function updateStickAim(event) { if (!stickGesture) return; const next = aimFromDrag(stickGesture.initialAim, event.clientX - stickGesture.x, event.clientY - stickGesture.y, mobilePrecision === 'fine' ? .42 : 1.05); if (next.changed) setAimControls(next.angle, next.power, next.direction); }
$('#aimStickRing').addEventListener('pointerdown', (event) => { if (mobileAimMode !== 'stick' || mobileAimLocked || game?.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId || game.shotEndsAt) return; event.preventDefault(); event.stopPropagation(); stickPointerId = event.pointerId; stickGesture = { x: event.clientX, y: event.clientY, initialAim: { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection } }; event.currentTarget.setPointerCapture(event.pointerId); $('#mobileAimStick').classList.add('engaged'); });
$('#aimStickRing').addEventListener('pointermove', (event) => { if (stickPointerId === event.pointerId) { event.preventDefault(); updateStickAim(event); } });
for (const type of ['pointerup', 'pointercancel']) $('#aimStickRing').addEventListener(type, (event) => { if (stickPointerId !== event.pointerId) return; if (type === 'pointerup') broadcastAim(true); stickPointerId = null; stickGesture = null; $('#mobileAimStick').classList.remove('engaged'); });
$('#aimStickRing').addEventListener('keydown', (event) => { const changes = { ArrowUp: ['angle', 2], ArrowDown: ['angle', -2], ArrowRight: ['power', 20], ArrowLeft: ['power', -20] }; const change = changes[event.key]; if (!change || mobileAimLocked) return; event.preventDefault(); event.stopPropagation(); setAimControls(Number($('#angle').value) + (change[0] === 'angle' ? change[1] : 0), Number($('#power').value) + (change[0] === 'power' ? change[1] : 0)); });
$('#mobileAimStick').addEventListener('click', (event) => { const button = event.target.closest('[data-aim-adjust]'); if (!button || mobileAimLocked || game?.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId) return; const [kind, delta] = button.dataset.aimAdjust.split(':'); setAimControls(Number($('#angle').value) + (kind === 'angle' ? Number(delta) : 0), Number($('#power').value) + (kind === 'power' ? Number(delta) : 0)); audio.ui(); });
function updateAudioButtons() {
  const ready = audio.isReady();
  $('#soundButton').textContent = audio.enabled ? '♪' : '×';
  $('#soundButton').classList.toggle('muted', !audio.enabled);
  $('#audioTestButton').classList.toggle('active', ready);
  $('#audioTestButton').setAttribute('aria-pressed', String(ready));
  $('#audioTestButton').innerHTML = ready ? '<span aria-hidden="true">♫</span> TESTAR SONS' : '<span aria-hidden="true">♫</span> ATIVAR E TESTAR';
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
  if (ready && await audio.previewBattleSounds()) { syncMenuMusic(); toast('Teste: tiro → explosão → laser.'); }
  else toast(`Não foi possível reproduzir o pacote de sons (${audio.mobile.lastError || audio.context?.state || 'arquivo indisponível'}).`);
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
let hoveredControlKey = null;
function controlHoverKey(control) {
  const data = Object.entries(control.dataset).map(([key, value]) => `${key}:${value}`).sort().join('|');
  const identity = control.id || data || control.getAttribute('aria-label') || control.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
  const group = control.closest('[id]')?.id || control.parentElement?.id || control.parentElement?.className || '';
  return `${group}/${identity}`;
}
document.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' && !event.target.closest('button,.code,[role="button"]')) hoveredControlKey = null;
});
document.addEventListener('pointerover', (event) => {
  if (event.pointerType !== 'mouse') return;
  const control = event.target.closest('button,.code,[role="button"]');
  if (!control || control.disabled || control.contains(event.relatedTarget)) return;
  if ($('#gameScreen').classList.contains('active') && !control.closest('.tutorial-modal,.audio-settings')) return;
  const key = controlHoverKey(control);
  if (key === hoveredControlKey) return;
  hoveredControlKey = key;
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
  if (event.pointerType === 'touch' && aimGesture?.pointerId === event.pointerId) {
    const next = aimFromDrag(aimGesture.initialAim, event.clientX - aimGesture.startX, event.clientY - aimGesture.startY, mobilePrecision === 'fine' ? .32 : .8);
    if (!next.changed) return next;
    aimGesture.dragged = true;
    setAimControls(next.angle, next.power, next.direction);
    return next;
  }
  clearAimAssist();
  const point = aimGesture?.pointerId === event.pointerId ? { x: (event.clientX - aimGesture.rect.left) * renderer.canvas.width / aimGesture.rect.width / aimGesture.camera.zoom + aimGesture.camera.x, y: (event.clientY - aimGesture.rect.top) * renderer.canvas.height / aimGesture.rect.height / aimGesture.camera.zoom + aimGesture.camera.y } : renderer.screenToWorld(event.clientX, event.clientY); const origin = renderer.renderPosition(me); const dx = point.x - origin.x; const dy = origin.y - point.y;
  aimDirection = dx < 0 ? -1 : 1;
  const angle = Math.max(aimMinimum(), Math.min(85, Math.round(Math.atan2(dy, Math.max(5, Math.abs(dx))) * 180 / Math.PI)));
  const power = Math.max(100, Math.min(580, Math.round(Math.hypot(dx, dy))));
  $('#angle').value = angle; $('#power').value = power; $('#angleValue').textContent = `${angle}°`; $('#powerValue').textContent = `${Math.round((power - 100) / 4.8)}%`;
  renderer.setAim({ angle, power, direction: aimDirection }); updateMobileAimReadout(); broadcastAim(); $('#aimCoach').classList.remove('visible');
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
  if (kind === 'arsenalBlink') { const point = renderer.screenToWorld(event.clientX, event.clientY); const preview = renderer.setBlinkTarget(event.clientX, event.clientY); if (!preview?.valid) { toast(preview?.reason || 'Escolha um pouso seguro.'); return; } send(CLIENT.USE_ARSENAL, { type: 'blink', x: point.x, y: point.y }); toast('BLINK ACIONADO'); return; }
  if (kind === 'specialistSelect') {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    const me = game?.players.find((entry) => entry.id === playerId);
    const object = (game?.objects || []).find((entry) => entry.active && ['specialistDrone', 'sentry', 'lightningRod'].includes(entry.type) && Math.hypot(entry.x - point.x, entry.y - point.y) <= Math.max(30, entry.width / 2 + 10) && Math.hypot(entry.x - me.x, entry.y - me.y) <= CLASS_BALANCE.specialistControlRadius);
    if (object) { renderer.specialistSelection = renderer.specialistSelection === object.id ? null : object.id; renderer.specialistTarget = point; audio.ui('select'); toast(renderer.specialistSelection ? 'ESTRUTURA SELECIONADA • toque no destino' : 'Comando cancelado'); }
    return;
  }
  if (kind === 'specialistMove') {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    send(CLIENT.MOVE_DEPLOYABLE, { objectId: renderer.specialistSelection, x: point.x, y: point.y });
    renderer.specialistSelection = null; renderer.specialistTarget = null; audio.ui('select'); mobileVibrate([12, 18, 12]); return;
  }
  if (kind === 'armoredDash') { const direction = renderer.setArmoredDashTarget(event.clientX, event.clientY); if (!canLocalFire()) return; fireButtonFx(); markFireRequested(); performArmoredDash(direction); return; }
  if (kind === 'ninjaFatal') { const point = renderer.screenToWorld(event.clientX, event.clientY); const preview = renderer.setNinjaFatalTarget(event.clientX, event.clientY); if (!preview) { toast('Escolha outro destino para o corte.'); return; } send(CLIENT.NINJA_FATAL, { x: point.x, y: point.y }); mobileVibrate([20, 12, 45]); return; }
  if (kind === 'harpoon') { activateHarpoonCable(); return; }
  if (kind === 'spider') {
    const preview = renderer.setSpiderTarget(event.clientX, event.clientY);
    if (!preview?.valid) { toast(preview?.reason || 'Escolha um ponto dentro do alcance da Aranha.'); return; }
    const { x: targetX, y: targetY } = renderer.spiderTarget;
    send(CLIENT.MOVE, { direction: preview.direction, arsenal: 'spider', targetX, targetY });
    selectedWeapon = 'standard'; renderer.setMovementMode('standard');
    $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === 'standard'));
    updateFireButton(); refreshAimCoach(); mobileVibrate([16, 25, 16]);
    return;
  }
  if (kind === 'vertical') { const target = renderer.screenToWorld(event.clientX, event.clientY); const token = renderer.activateVerticalShot(); if (token) send(CLIENT.ACTIVATE_VERTICAL, { token, target }); toast('TIRO VETORIAL REDIRECIONADO!'); }
  else if (kind === 'cluster') { const token = renderer.activateClusterShot(); if (token) send(CLIENT.ACTIVATE_CLUSTER, { token }); toast('FRAGMENTAÇÃO: 3 MÍSSEIS!'); }
  else if (kind === 'fireworks') { const token = renderer.activateFireworksShot(); if (token) { send(CLIENT.ACTIVATE_FIREWORKS, { token }); toast('FOGOS DETONADOS NO AR!'); } }
  else if (kind === 'targeted') {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    if (targetedPower === 'lightningStep' || targetedPower === 'teleport') {
      const preview = renderer.setBlinkTarget(event.clientX, event.clientY);
      if (!preview?.valid) { toast(preview?.reason || 'Escolha um pouso seguro.'); return; }
    }
    send(CLIENT.USE_POWERUP, { type: targetedPower, x: point.x, y: point.y });
    toast(targetedPower === 'trickster' ? 'Troca Sacana acionada' : targetedPower === 'teleport' ? 'Teleporte acionado' : 'Passo Relâmpago acionado');
  }
  else if (kind === 'parachute') activateJump();
  else if (kind === 'jump') { const preview = renderer.setJumpTarget(event.clientX, event.clientY); if (!preview?.valid) { toast('Escolha um pouso dentro da arena.'); return; } activateJump(renderer.jumpTarget); }
}
let minimapPointerId = null;
canvas.addEventListener('pointerdown', (event) => {
  if (renderer.minimapContains(event.clientX, event.clientY)) { event.preventDefault(); minimapPointerId = event.pointerId; canvas.setPointerCapture(event.pointerId); renderer.panFromMinimap(event.clientX, event.clientY); return; }
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
  if (selectedWeapon === 'blink' && (game?.players.find((player) => player.id === playerId)?.ammo?.blink || 0) > 0) { renderer.setBlinkTarget(event.clientX, event.clientY); tap('arsenalBlink'); return; }
  if (harpoonReady()) { tap('harpoon'); return; }
  if (renderer.hasAwaitingVerticalShot()) { tap('vertical'); return; }
  if (renderer.hasAwaitingClusterShot()) { tap('cluster'); return; }
  if (renderer.hasAwaitingFireworksShot()) { tap('fireworks'); return; }
  if (game?.players[game.turnIndex]?.id !== playerId) return;
  const me = game.players.find((player) => player.id === playerId);
  const specialistControl = me?.classType === 'specialist' && me.teslaDisabledTurns <= 0 && game?.phase === 'playing' && !game.shotEndsAt && !game.harpoonPull;
  if (specialistControl && renderer.specialistSelection) {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    const device = (game.objects || []).find((entry) => entry.active && ['specialistDrone', 'sentry', 'lightningRod'].includes(entry.type) && Math.hypot(entry.x - point.x, entry.y - point.y) <= Math.max(30, entry.width / 2 + 10) && Math.hypot(entry.x - me.x, entry.y - me.y) <= CLASS_BALANCE.specialistControlRadius);
    if (device) { tap('specialistSelect'); return; }
    tap('specialistMove'); return;
  }
  if (selectedWeapon === 'ninjaFatal' && game.actions?.attackAvailable && !game.shotEndsAt) { renderer.setNinjaFatalTarget(event.clientX, event.clientY); tap('ninjaFatal'); return; }
  if (selectedWeapon === 'spider' && !me?.spiderClimb) { renderer.setSpiderTarget(event.clientX, event.clientY); tap('spider'); return; }
  if (selectedWeapon === 'armoredDash' && me?.ammo?.armoredDash && game.actions?.movesLeft > 0) { renderer.setArmoredDashTarget(event.clientX, event.clientY); tap('armoredDash'); return; }
  if (selectedWeapon === 'jump' && !me?.airborne) { renderer.setJumpTarget(event.clientX, event.clientY); tap('jump'); return; }
  const targetedPower = [...equippedPowers(me)].reverse().find((type) => ['lightningStep', 'teleport', 'trickster'].includes(type));
  if (targetedPower) { if (targetedPower !== 'trickster') renderer.setBlinkTarget(event.clientX, event.clientY); tap('targeted', targetedPower); return; }
  if (specialistControl) {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    if ((game.objects || []).some((entry) => entry.active && ['specialistDrone', 'sentry', 'lightningRod'].includes(entry.type) && Math.hypot(entry.x - point.x, entry.y - point.y) <= Math.max(30, entry.width / 2 + 10) && Math.hypot(entry.x - me.x, entry.y - me.y) <= CLASS_BALANCE.specialistControlRadius)) { tap('specialistSelect'); return; }
  }
  if (event.pointerType === 'touch' && canOpenParachute()) { tap('parachute'); return; }
  if (me?.airborne && !me.airborne.parachute && selectedWeapon === 'jump') { tap('jump'); return; }
  if (event.pointerType === 'touch' && mobileAimMode === 'stick') return;
  if (mobileAimLocked) { toast('Mira travada • pressione ATIRAR'); return; }
  event.preventDefault(); aiming = true; aimGesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragged: false, rect: canvas.getBoundingClientRect(), camera: { ...renderer.camera }, initialAim: { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection } }; renderer.beginAimDrag(); canvas.setPointerCapture(event.pointerId); if (event.pointerType !== 'touch') updateAimFromPointer(event);
});
canvas.addEventListener('pointermove', (event) => {
  renderer.setPointer(event.clientX, event.clientY);
  if (renderer.specialistSelection) renderer.specialistTarget = renderer.screenToWorld(event.clientX, event.clientY);
  if (minimapPointerId === event.pointerId) { event.preventDefault(); renderer.panFromMinimap(event.clientX, event.clientY, true); return; }
  if (selectedWeapon === 'ninjaFatal' && game?.players[game.turnIndex]?.id === playerId) renderer.setNinjaFatalTarget(event.clientX, event.clientY);
  if (selectedWeapon === 'armoredDash' && game?.players[game.turnIndex]?.id === playerId) renderer.setArmoredDashTarget(event.clientX, event.clientY);
  if (renderer.hasAwaitingVerticalShot()) renderer.setVerticalTarget(event.clientX, event.clientY);
  if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchGesture && touchPointers.size >= 2) { event.preventDefault(); const center = pinchCenter(); renderer.setUserZoom(pinchGesture.zoom * pinchDistance() / pinchGesture.distance); renderer.panCamera(center.x - pinchGesture.center.x, center.y - pinchGesture.center.y); pinchGesture.center = center; return; }
    if (pinchConsumed) return;
  }
  if (selectedWeapon === 'spider' && game?.players[game.turnIndex]?.id === playerId && !game.players[game.turnIndex]?.spiderClimb) {
    renderer.setSpiderTarget(event.clientX, event.clientY);
    if (pendingCanvasTap?.pointerId === event.pointerId && pendingCanvasTap.kind === 'spider') event.preventDefault();
    return;
  }
  if (selectedWeapon === 'jump' && game?.players[game.turnIndex]?.id === playerId && !game.players[game.turnIndex]?.airborne) {
    renderer.setJumpTarget(event.clientX, event.clientY);
    if (pendingCanvasTap?.pointerId === event.pointerId && pendingCanvasTap.kind === 'jump') event.preventDefault();
    return;
  }
  if (renderer.blinkMode && (game?.players[game.turnIndex]?.id === playerId || selectedWeapon === 'blink')) {
    renderer.setBlinkTarget(event.clientX, event.clientY);
    if (pendingCanvasTap?.pointerId === event.pointerId && pendingCanvasTap.kind === 'targeted') event.preventDefault();
    return;
  }
  if (aiming && aimGesture?.pointerId === event.pointerId) updateAimFromPointer(event);
});
canvas.addEventListener('pointerup', (event) => {
  if (minimapPointerId === event.pointerId) { minimapPointerId = null; return; }
  if (event.pointerType === 'touch') {
    touchPointers.delete(event.pointerId);
    if (pinchConsumed) { if (touchPointers.size < 2) pinchGesture = null; if (!touchPointers.size) pinchConsumed = false; return; }
    if (pendingCanvasTap?.pointerId === event.pointerId) { const { kind, targetedPower } = pendingCanvasTap; pendingCanvasTap = null; performCanvasTap(kind, event, targetedPower); return; }
  }
  if (!aiming || aimGesture?.pointerId !== event.pointerId) return;
  updateAimFromPointer(event); const changed = aimGesture.dragged || event.pointerType !== 'touch'; aiming = false; aimGesture = null; renderer.endAimDrag(); if (changed) { broadcastAim(true); localStorage.setItem('tankAimLearned', '1'); audio.ui('select'); mobileVibrate(6); }
});
canvas.addEventListener('pointercancel', (event) => {
  if (minimapPointerId === event.pointerId) { minimapPointerId = null; return; }
  if (event.pointerType === 'touch') { touchPointers.delete(event.pointerId); if (touchPointers.size < 2) pinchGesture = null; if (!touchPointers.size) pinchConsumed = false; }
  if (pendingCanvasTap?.pointerId === event.pointerId) pendingCanvasTap = null;
  if (aimGesture?.pointerId !== event.pointerId) return; aiming = false; aimGesture = null; renderer.endAimDrag();
});
$('#gameCanvas').addEventListener('wheel', (event) => { event.preventDefault(); renderer.adjustZoom(event.deltaY < 0 ? .1 : -.1); }, { passive: false });
$('#zoomOut').onclick = () => renderer.adjustZoom(-.16); $('#zoomIn').onclick = () => renderer.adjustZoom(.16); $('#zoomFit').onclick = () => { renderer.fitWorld(); toast('Mapa completo'); };
$('#locatePlayer').onclick = () => { if (renderer.focusOwnPlayer()) { audio.ui('select'); toast('Seu tanque está no centro da tela.'); } else toast('Seu tanque não está disponível.'); };
$('#inventoryBar').addEventListener('click', (event) => { const button = event.target.closest('[data-powerup]'); if (!button || !game || game.players[game.turnIndex]?.id !== playerId) return; const me = game.players.find((player) => player.id === playerId); if (me?.powerupBlockedTurns > 0) { toast('PANE ELÉTRICA • powerups bloqueados neste turno'); return; } send(button.dataset.powerup === 'buoy' ? CLIENT.USE_POWERUP : CLIENT.SELECT_POWERUP, { type: button.dataset.powerup }); audio.ui('select'); if (button.dataset.powerup === 'buoy') toast('BOIA ATIVADA • flutuação sem gasto de combustível'); });
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
  if (!button.disabled && button.dataset.weapon !== 'ninjaFatal') button.click();
  refreshArsenalPicker();
}
$('#weaponSelector').addEventListener('click', (event) => {
  const button = event.target.closest('.weapon'); if (!button || button.disabled) return;
  const me = game?.players.find((player) => player.id === playerId);
  if (button.dataset.weapon === 'superheat') { toast(`SUPERAQUECER PASSIVO • ${me?.superheatEnemyTurns || 0}/${SUPERHEAT.enemyTurns} turnos inimigos • raio ${SUPERHEAT.radius}`); audio.ui('select'); return; }
  if (button.dataset.weapon === 'mixer') {
    const cooling = me?.mixerLastUsedRound != null && game.roundNumber - me.mixerLastUsedRound < MIXER_COOLDOWN_ROUNDS;
    if (cooling) { toast(`MISTURADOR • disponível na rodada ${me.mixerLastUsedRound + MIXER_COOLDOWN_ROUNDS}`); audio.ui('cancel'); return; }
    if (!MIXER_WEAPONS.includes(selectedWeapon)) { toast('MISTURADOR • selecione primeiro uma arma de impacto compatível'); audio.ui('cancel'); return; }
    mixerArmed = !mixerArmed; mixerPartner = null;
    toast(mixerArmed ? 'MISTURADOR • agora toque a segunda arma para fundir' : 'MISTURADOR • combinação cancelada');
    audio.ui(mixerArmed ? 'combo' : 'cancel'); mobileVibrate(mixerArmed ? [12, 20, 24] : 10); updateComboPreview(); return;
  }
  if (mixerArmed) {
    const partner = button.dataset.weapon;
    if (!MIXER_WEAPONS.includes(partner) || partner === selectedWeapon || (me?.ammo?.[partner] || 0) < 1) { toast('Escolha outra arma de impacto disponível para a fusão'); audio.ui('cancel'); return; }
    mixerPartner = partner; mixerArmed = false; audio.ui('combo'); mobileVibrate([15, 22, 35]);
    toast(`${ARSENAL_DEFS[selectedWeapon].short} + ${ARSENAL_DEFS[partner].short} • FUSÃO PRONTA`);
    updateComboPreview(); return;
  }
  if (button.dataset.weapon === 'ninjaFatal') { selectedWeapon = 'ninjaFatal'; renderer.setNinjaFatalTarget(null); $$('.weapon').forEach((item) => item.classList.toggle('active', item.dataset.weapon === selectedWeapon)); updateFireButton(); updateComboPreview(); toast('CORTE FATAL • escolha o destino no mapa (2 cortes)'); audio.ui('select'); return; }
  if (button.dataset.weapon === 'spider' && me?.spiderClimb) { toast('ARANHA: escalada ativa. Use A/D; S duas vezes solta do teto.'); return; }
  if (button.dataset.weapon === 'healingDrone') { send(CLIENT.USE_ARSENAL, { type: 'healingDrone' }); toast('DRONE DE CURA LANÇADO: ativo por 3 turnos'); audio.ui('select'); return; }
  if (button.dataset.weapon === 'splitDamage' && game?.players[game.turnIndex]?.id !== playerId) { send(CLIENT.USE_ARSENAL, { type: 'splitDamage' }); toast('DANO DIVIDIDO: reação ativa por 2 rodadas'); audio.ui('select'); return; }
  clearAimAssist(); selectedWeapon = selectedWeapon === button.dataset.weapon ? 'standard' : button.dataset.weapon; mixerPartner = null;
  renderer.setMovementMode(selectedWeapon || 'standard'); $('#angle').min = String(aimMinimum());
  if (Number($('#angle').value) < aimMinimum()) setAimControls(aimMinimum(), Number($('#power').value));
  $$('.weapon').forEach((item) => item.classList.toggle('active', item.dataset.weapon === selectedWeapon));
  updateComboPreview(); updateFireButton(); refreshAimCoach(); audio.ui(); arsenalViewedIndex = arsenalButtons().indexOf(button); refreshArsenalPicker();
});
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
  $('#arsenalWeapons [data-weapon="mixer"]')?.classList.toggle('mixer-active', mixerArmed || Boolean(mixerPartner));
  $$('#arsenalWeapons .weapon').forEach((button) => button.classList.toggle('mixer-partner', button.dataset.weapon === mixerPartner));
  if (!me || !selectedWeapon || game.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId) { preview.hidden = true; return; }
  const powers = equippedPowers(me).filter((type) => selectedWeapon === 'standard' || supportsWeaponCombo(type, selectedWeapon));
  const weaponName = ARSENAL_DEFS[selectedWeapon]?.name || 'TIRO PADRÃO';
  const element = me.classType === 'elementalist' && !me.teslaDisabledTurns && me.elementalImprintTurn !== game.turnNumber ? ARSENAL_DEFS[me.elementalCurrent] : null;
  preview.hidden = selectedWeapon === 'standard' && powers.length === 0 && !mixerArmed && !mixerPartner && !element;
  preview.innerHTML = `<small>${mixerArmed ? 'ESCOLHA A 2ª ARMA' : mixerPartner ? 'FUSÃO PRONTA ✦' : 'PRÓXIMA AÇÃO'}</small><strong>${escapeHtml(weaponName)}${mixerPartner ? ` + ${escapeHtml(ARSENAL_DEFS[mixerPartner]?.name || mixerPartner)}` : ''}</strong>${powers.length ? `<span>+ ${powers.map((type) => escapeHtml(POWERUP_DEFS[type]?.short || type)).join(' + ')}</span>` : ''}${element ? `<span style="color:${element.color}">+ ELEMENTO ${escapeHtml(element.short)}</span>` : ''}`;
}
function classPassiveStatus(player) {
  if (!player?.classType) return '';
  if (player.teslaDisabledTurns > 0) return 'TESLA: passiva desativada neste turno; apenas movimento normal';
  const round = game?.roundNumber || 1; const safe = round - (player.lastDamageRound || 0);
  if (player.classType === 'armored') return `${Math.min(2, safe)}/2 rodadas sem dano • pulso: aliados próximos sofrem 40% menos dano nesta rodada • imune a quedas`;
  if (player.classType === 'attacker') return 'tiros perfurantes • bônus de dano por vida máxima';
  if (player.classType === 'bomber') return `+15 dano e +18 alcance explosivo • ao morrer: ${CLASS_BALANCE.bomberDeathDamage} HP em ${CLASS_BALANCE.bomberDeathRadius} blocos e 2 granadas laterais`;
  if (player.classType === 'healer') return 'pulso de cura: +25 HP para si e aliados próximos a cada rodada';
  if (player.classType === 'meteorologist') return `${round < 2 ? 'Haste desbloqueia na rodada 2' : 'Haste recarrega a cada 3 rodadas'} • proteção contra eventos`;
  if (player.classType === 'incendiary') return 'Todo tiro incendeia o impacto • 3 labaredas por disparo • fogo +10 HP e +1 rodada';
  if (player.classType === 'amphibian') return `flutua, nada e regenera ${CLASS_BALANCE.amphibianWaterRegen} HP/rodada na água • Canhão de Água: 40 HP`;
  if (player.classType === 'elementalist') return `elemento aleatório no próximo tiro a cada turno • atual: ${ARSENAL_DEFS[player.elementalCurrent]?.name || 'aguardando'}`;
  if (player.classType === 'specialist') return `primeiro drone na rodada 2; +1 a cada 2 rodadas (máx. 3) • 25 HP por alvo • 70% de chance de um drone próximo interceptar um projétil dirigido a você, sacrificando-se • toque em drone, Sentinela ou Haste para reposicionar`;
  if (player.classType === 'ninja') {
    const firstCloak = !player.ninjaFirstCloakActivated;
    const elapsed = firstCloak ? player.ninjaOtherTurnsWaited || 0 : Math.max(0, round - Math.max(1, player.lastDamageRound || 0, player.lastNinjaRevealRound || 0));
    const stealth = player.invisibleTurns > 0 ? 'INVISÍVEL' : `${Math.min(2, elapsed)}/2 ${firstCloak ? 'turnos dos outros' : 'rodadas'} até invisibilidade`;
    return `${stealth} • fantasma azul • 2 cortes de ${CLASS_BALANCE.ninjaFatalDamage} HP até ${CLASS_BALANCE.ninjaFatalRadius} blocos • atravessa paredes • imune a quedas`;
  }
  if (player.classType === 'saboteur') return `Tesla a cada rodada • pulso de 760 blocos na rodada ${round + (3 - round % 3)} • revela Ninjas invisíveis`;
  return `atrai powerups em 270 blocos • cada coleta ativa é compartilhada com um aliado uma vez • troca aleatória de arsenal nas rodadas 3, 6, 9…${player.lastBackpackerRerollRound === round ? ' (já usada)' : ''}`;
}
const movementKeys = new Map([['a', [-1, 0]], ['ArrowLeft', [-1, 0]], ['d', [1, 0]], ['ArrowRight', [1, 0]], ['w', [0, -1]], ['ArrowUp', [0, -1]], ['s', [0, 1]], ['ArrowDown', [0, 1]]]);
const heldMovementKeys = new Map();
function resumeHeldMovement() { const last = [...heldMovementKeys.values()].at(-1); if (last) startDrive(...last); else stopDrive(); }
addEventListener('keydown', (e) => {
  if (!game || game.phase !== 'playing') return;
  if ((e.key === 'y' || e.key === 'Y') && document.activeElement !== $('#chatInput')) { e.preventDefault(); $('#chatPanel').classList.add('open'); $('#chatInput').focus(); return; }
  if (document.activeElement === $('#chatInput')) { if (e.key === 'Escape') { $('#chatInput').blur(); $('#chatPanel').classList.remove('open'); } return; }
  if (document.activeElement?.matches('input,textarea,select,[contenteditable="true"]') || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.repeat) return;
  const ownTurn = game.players[game.turnIndex]?.id === playerId && !spectatorMode;
  const airbornePlayer = ownTurn ? game.players.find((player) => player.id === playerId) : null;
  if (ownTurn && airbornePlayer?.airborne && !airbornePlayer.airborne.parachute && (e.key.toLowerCase() === 'w' || e.key === 'ArrowUp')) { e.preventDefault(); activateJump(); return; }
  if (ownTurn && /^[qert]$/i.test(e.key)) { const index = 'qert'.indexOf(e.key.toLowerCase()); const type = game.players[game.turnIndex].arsenal?.[index]; const button = type && [...document.querySelectorAll('#arsenalWeapons [data-weapon]')].find((item) => item.dataset.weapon === type); if (button && !button.disabled) { e.preventDefault(); button.click(); } return; }
  if (ownTurn && /^[0-9]$/.test(e.key)) { const button = document.querySelectorAll('#inventoryBar [data-powerup]')[e.key === '0' ? 9 : Number(e.key) - 1]; if (button && !button.disabled) { e.preventDefault(); button.click(); } return; }
  if (ownTurn && e.key.toLowerCase() === 'c') { const button = document.querySelector('#arsenalWeapons [data-weapon="ninjaFatal"]'); if (button && !button.disabled) { e.preventDefault(); button.click(); } return; }
  if (ownTurn && e.key.toLowerCase() === 'v') { const button = document.querySelector('#weaponSelector [data-weapon="standard"]'); if (button && !button.disabled) { e.preventDefault(); button.click(); } return; }
  if (e.key === 'Enter' && (harpoonReady() || selectedWeapon === 'jump' || game.players.find((player) => player.id === playerId)?.airborne)) { e.preventDefault(); if (harpoonReady()) fireSelectedWeapon(); else activateJump(); return; }
  const move = movementKeys.get(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (move && ownTurn) { e.preventDefault(); if (!heldMovementKeys.has(e.code)) { heldMovementKeys.set(e.code, move); startDrive(...move); } }
  if (e.code === 'Space') { e.preventDefault(); if (canOpenParachute() && !harpoonReady() && !renderer.hasAwaitingVerticalShot() && !renderer.hasAwaitingClusterShot() && !renderer.hasAwaitingFireworksShot()) activateJump(); else fireSelectedWeapon(); }
});
addEventListener('keyup', (e) => { if (heldMovementKeys.delete(e.code)) resumeHeldMovement(); });
addEventListener('blur', () => { heldMovementKeys.clear(); stopDrive(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { heldMovementKeys.clear(); stopDrive(); } });

const tutorialSteps = [
  { icon: '♛', title: 'Seja o último tanque', text: 'Todo o campo é formado por microblocos. Explosões arrancam blocos do terreno, empurram tanques e podem abrir uma queda fatal.', tip: 'Tanques, bots e jogadores seguem exatamente as mesmas regras físicas.' },
  { icon: '▣', title: 'Crie sua sala', text: 'Na tela inicial, abra CRIAR SALA. Escolha codinome, quantidade de jogadores e bots, dificuldade da IA, bioma, vida, duração do turno, rodadas e modo. Você também pode ligar ou desligar classes, eventos e powerups.', tip: 'Toque em CRIAR CAMPO DE BATALHA. Use PARTIDA RÁPIDA para preencher uma configuração simples com um bot.' },
  { icon: '⌘', title: 'Convide amigos online', text: 'Na sala, toque em CONVIDAR AMIGOS para copiar o link ou compartilhá-lo no celular. O link abre ENTRAR com o código preenchido: seu amigo só precisa escolher um codinome. Você ainda pode tocar no CÓDIGO para copiá-lo separadamente.', tip: 'Todos precisam acessar o mesmo servidor. Também é possível entrar como espectador pelo botão ASSISTIR. Uma sala precisa de pelo menos dois tanques, incluindo bots.' },
  { icon: '◇◆', title: 'Escolha um modo', text: 'Cada um por si: cada tanque luta pela própria vitória. Coop: humanos enfrentam bots juntos. VS Equipes: tanques são distribuídos entre dois a quatro times. O anfitrião escolhe o modo antes de criar a sala.', tip: 'No Coop é necessário incluir pelo menos um bot. Fogo Amigo começa desligado, mas pode ser ativado na configuração da sala.' },
  { icon: '♨', title: 'Modos com objetivos', text: 'Rei da Colina: ocupe sozinho a zona dourada para pontuar. Domínio por Equipes: aliados dividem os pontos da colina. Sobrevivência: a lava sobe a cada rodada e elimina quem for alcançado.', tip: 'Na colina, o objetivo é chegar a quatro pontos. No Sobrevivência, olhe a previsão da próxima maré antes de se mover.' },
  { icon: '◆', title: 'Prepare-se no saguão', text: 'Antes da partida, cada jogador escolhe sua classe passiva e depois três cartas do arsenal no saguão. As artes e miniaturas aparecem ao lado do nome. Confirme as escolhas e marque Pronto.', tip: 'Quando todos estiverem prontos, a tela de sorteio aparece com 10 segundos de contagem. No HUD, toque na sua classe ou no placar para consultar as passivas.' },
  { icon: '↻', title: 'Entenda seu turno', text: 'Em cada turno você pode mover e atirar, ou usar dois movimentos. O cronômetro encerra o turno automaticamente quando chega a zero.', tip: 'A moldura verde e a seta mostram qual tanque está ativo.' },
  { icon: '◀ ▶', title: 'Escolha sua posição', text: 'No desktop, A/D movem para os lados e W/S sobem ou descem na água. No celular, arraste a alavanca de movimento. A Aranha solta do teto ao pressionar S ou baixar a alavanca duas vezes.', tip: 'Plataformas com luz azul e a marca MÓVEL se deslocam e carregam o tanque que estiver apoiado nelas.' },
  { icon: '⌁', title: 'Controle a mira', text: 'Toque e arraste diretamente no campo, no celular ou desktop. O lado define a direção, a altura define o ângulo e a distância define a força. A câmera abre o enquadramento quando a trajetória precisa de mais espaço.', tip: 'A mira preserva direção, ângulo e força do seu último tiro. TRAVAR MIRA protege os três valores contra toques acidentais.' },
  { icon: '◎', title: 'Acerte as três partes do tanque', text: 'O tanque tem base (esteiras), centro (blindagem) e cabeça (torre). Um acerto direto do tiro PADRÃO causa 20–30 na base, 50 no centro e 60–80 na cabeça, como crítico.', tip: 'Bônus de classe, escudos e efeitos combinados ainda podem alterar o dano final exibido sobre o alvo.' },
  { icon: '✦', title: 'Combine seu arsenal', text: 'O arsenal começa sem arma ativa em cada turno: toque numa carta, até mesmo PADRÃO, antes de atirar. Você pode equipar vários powerups juntos; Dupla, Tripla, Espelho e outros efeitos combinam.', tip: 'Toque novamente na carta da arma para desmarcá-la. Powerups equipados podem ser removidos tocando na carta do inventário.' },
  { icon: '▧', title: 'Encontre e use poderes', text: 'As três cartas do arsenal são escolhidas antes da partida e aparecem perto do botão ATIRAR. Powerups extras ficam enterrados: tiros e explosões os revelam, e balas, explosões ou tanques podem coletá-los. Os coletados aparecem no inventário do HUD.', tip: 'Toque em uma ou mais cartas do inventário para equipar efeitos no próximo disparo. Abra a BIBLIOTECA na tela inicial para ver todas as cartas, danos e eventos.' },
  { icon: '✹', title: 'Disparos de duas etapas', text: 'A Fragmentária lança uma cápsula violeta. Enquanto ela voa, toque no cenário, aperte ATIRAR ou Espaço novamente para soltá-la em três mísseis. A Carga Sísmica marca o solo vermelho e detona após 2 segundos.', tip: `Exclusiva do Atacante: Intervenção dos céus aparece com ${MEGA_CANNON_CHARGE} pontos de destruição; cada uso aumenta o custo seguinte em 500. Eliminações rendem 250 pontos para a classe.` },
  { icon: '⚡', title: 'Domine os combos de movimento', text: 'Depois do Pulo, selecione a Investida Blindada ou equipe a Arrancada Foguete e use uma seta para ganhar outro impulso no ar.', tip: 'Pulo + Investida + Arrancada gera o impulso máximo e ainda permite atirar durante o voo.' },
  { icon: '⚙', title: 'Pontue destruindo', text: 'Microblocos, barris, plataformas, concreto, prédios, guindastes e tanques concedem pontuações diferentes ao responsável pela destruição.', tip: 'Depósitos dourados soltam dois itens ao quebrar. Bobinas azuis emitem um pulso elétrico que causa dano e bloqueia poderes próximos.' },
  { icon: '⌁', title: 'A arena evolui', text: 'A cada três turnos ocorre um evento. Helicópteros entregam suprimentos, miras anunciam bombardeios, raios bloqueiam powerups e fossos podem entrar em erupção.', tip: 'Observe as marcações no terreno: todo evento mostra onde e quando seu efeito acontecerá.' },
  { icon: '◇◆', title: 'Coop ou VS Equipes', text: 'COOP une humanos contra bots. VS EQUIPES distribui jogadores e bots entre 2, 3 ou 4 times. Cada equipe nasce em sua própria faixa do mapa e compartilha uma cor.', tip: 'Fogo Amigo desligado protege aliados dos seus ataques; ligado permite causar dano neles. A equipe vence quando é a última com tanques vivos.' },
  { icon: '↑', title: 'Evolua sua classe', text: 'Nos marcos de um terço e dois terços da partida, quem usa classe escolhe um bônus permanente: +30 de vida máxima e cura imediata, ou +6 de dano em cada acerto contra inimigos. É possível repetir a escolha.', tip: 'A evolução aparece no centro da arena e pode ser selecionada mesmo fora do seu turno.' },
  { icon: '♨', title: 'Sobreviva à maré de lava', text: 'No modo Sobrevivência, a lava sobe ao começo de cada rodada e destrói qualquer tanque que toque nela. A subida acelera perto do fim.', tip: 'Observe a previsão do próximo nível no HUD e procure plataformas altas antes da rodada virar.' },
  { icon: '◆', title: 'Domine em equipe', text: 'No modo Domínio por Equipes, aliados somam um ponto por rodada quando ocupam a colina sem inimigos. Vence a primeira equipe com quatro pontos ou a última sobrevivente.', tip: 'Dois aliados juntos ainda rendem um ponto; um rival na zona contesta a captura.' },
  { icon: '◎', title: 'Controles mobile', text: 'A alavanca pequena no HUD move o tanque nos quatro sentidos na água. Em ⚙, escolha entre arrastar no cenário ou usar a alavanca separada para mirar. A pinça ajusta o zoom.', tip: 'No ZOOM ÚNICO, deslize dois dedos para percorrer o mapa. Use ⛶ para ampliar o palco; no iPhone, abra pela Tela de Início para ocultar as barras do navegador.' },
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
setTimeout(() => { if (testModeRequested || !$('#homeScreen').classList.contains('active')) return; $('#audioPrompt').hidden = false; $('#audioPromptEnable').focus(); }, 300);

let librarySection = 'powerups'; const libraryCompared = [];
function cardArtwork(type, section, frameClass) { return `<span class="${frameClass}" aria-hidden="true"><i class="atlas-art atlas-${section} art-${type}" style="${atlasStyle(type, section)}"></i></span>`; }
function libraryArt(type, section) { return cardArtwork(type, section, 'library-art'); }
function renderLibraryComparison() {
  const panel = $('#libraryCompare'); panel.hidden = libraryCompared.length === 0;
  panel.innerHTML = libraryCompared.map(({ section, type }) => { const info = CARD_SECTIONS[section][type]; return `<div style="--item:${info.color}"><small>${CARD_ROLE_LABELS[cardRole(type)]} • ${cardActivation(type, section)}</small><strong>${escapeHtml(info.name)}</strong><span>${escapeHtml(conciseCardDescription(type, info, section))}</span></div>`; }).join('');
}
function renderLibrary() {
  const definitions = CARD_SECTIONS[librarySection]; const role = $('#libraryRole').value; const query = $('#librarySearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const entries = Object.entries(definitions).filter(([type, info]) => (role === 'all' || cardRole(type) === role) && (!query || searchableCard(type, info).includes(query)));
  $('#libraryGrid').innerHTML = entries.length ? entries.map(([type, info]) => { const damage = cardDamage(type); const range = cardRange(type); const combo = cardCombo(type); const key = `${librarySection}:${type}`; const selected = libraryCompared.some((entry) => `${entry.section}:${entry.type}` === key); const description = conciseCardDescription(type, info, librarySection); return `<article class="library-card" style="--item:${info.color}">${libraryArt(type, librarySection)}<small>${librarySection === 'classes' ? 'PASSIVA PERMANENTE' : librarySection === 'events' ? 'EVENTO DE ARENA' : librarySection === 'arsenal' ? (info.kind === 'movement' ? 'MOVIMENTO' : info.kind === 'defense' ? 'DEFESA ATIVA' : info.kind === 'pulse' ? 'PULSO DE ÁREA' : 'TIRO ESPECIAL') : 'POWERUP'} • ${CARD_ROLE_LABELS[cardRole(type)]}</small><h3>${escapeHtml(info.name)}</h3><div class="library-metrics"><span>${cardActivation(type, librarySection)}</span>${combo ? `<span>${combo}</span>` : ''}</div><p>${escapeHtml(description)}</p><div class="card-stats"><span class="card-stat-damage"><b>DANO</b>${escapeHtml(damage || '—')}</span><span class="card-stat-range"><b>ALCANCE</b>${escapeHtml(range || '—')}</span></div><button class="library-compare-button${selected ? ' selected' : ''}" type="button" data-compare="${type}" aria-pressed="${selected}">${selected ? '✓ NA COMPARAÇÃO' : '+ COMPARAR'}</button></article>`; }).join('') : '<p class="library-empty">Nenhuma carta encontrada.</p>';
  entries.forEach(([type], index) => $('#libraryGrid').children[index].insertAdjacentHTML('beforeend', `<button class="library-preview-button" type="button" data-preview="${type}" aria-label="Ver animação: ${escapeHtml(definitions[type].name)}">▶ VER AÇÃO</button>`));
  if (librarySection === 'arsenal') entries.forEach(([type], index) => { if (definitions[type].kind === 'passive') $('#libraryGrid').children[index].querySelector('small').textContent = 'PASSIVA • ' + CARD_ROLE_LABELS[cardRole(type)]; });
  if (librarySection === 'classes') entries.forEach(([type], index) => {
    const card = $('#libraryGrid').children[index];
    const [bonus, special] = classCardStats(type);
    card.classList.add('library-class-card');
    card.querySelector('.card-stat-damage').innerHTML = `<b>BÔNUS</b>${escapeHtml(bonus)}`;
    card.querySelector('.card-stat-range').innerHTML = `<b>ESPECIAL</b>${escapeHtml(special)}`;
    card.querySelector('.card-stats').insertAdjacentHTML('afterend', `<div class="class-attribute-line">${escapeHtml(classAttributeSummary(type))}</div>`);
  });
  renderLibraryComparison();
  $$('#libraryTabs button').forEach((button) => button.classList.toggle('active', button.dataset.library === librarySection));
}
function openLibrary() { librarySection = 'powerups'; renderLibrary(); $('#libraryModal').hidden = false; document.body.classList.add('modal-open'); audio.ui(); }
function closeLibrary() { closeLibraryPreview(); $('#libraryModal').hidden = true; document.body.classList.remove('modal-open'); }
$('#libraryButton').onclick = openLibrary; $('#libraryClose').onclick = closeLibrary; $('#libraryTabs').onclick = (event) => { const button = event.target.closest('[data-library]'); if (!button) return; librarySection = button.dataset.library; renderLibrary(); audio.ui(); };
$('#librarySearch').oninput = renderLibrary; $('#libraryRole').onchange = renderLibrary;
$('#libraryGrid').onclick = (event) => { const preview = event.target.closest('[data-preview]'); if (preview) { openLibraryPreview(preview.dataset.preview, preview); return; } const button = event.target.closest('[data-compare]'); if (!button) return; const type = button.dataset.compare; const index = libraryCompared.findIndex((entry) => entry.section === librarySection && entry.type === type); if (index >= 0) libraryCompared.splice(index, 1); else { if (libraryCompared.length === 2) libraryCompared.shift(); libraryCompared.push({ section: librarySection, type }); } renderLibrary(); audio.ui('select'); };
$('#libraryModal').onclick = (event) => { if (event.target === $('#libraryModal')) closeLibrary(); };
addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#libraryPreviewModal').hidden) closeLibraryPreview(); else if (event.key === 'Escape' && !$('#libraryModal').hidden) closeLibrary(); });

let activePreview = null; let previewElapsed = 0; let previewFrameId = 0; let previewLastTime = 0;
let previewPlaying = !matchMedia('(prefers-reduced-motion: reduce)').matches;
function previewPhase() { const progress = previewElapsed % activePreview.definition.duration / activePreview.definition.duration; return activePreview.definition.phases[progress < .28 ? 0 : progress < .68 ? 1 : 2]; }
function updateLibraryPreview(now = performance.now()) {
  if (!activePreview || $('#libraryPreviewModal').hidden) return;
  if (previewPlaying && previewLastTime) previewElapsed += Math.min(500, now - previewLastTime);
  previewLastTime = now;
  const stage = drawLibraryPreview($('#libraryPreviewCanvas'), activePreview.definition, previewElapsed, activePreview.info.color);
  $$('#libraryPreviewSteps span').forEach((step, index) => step.classList.toggle('active', index === stage));
  $('#libraryPreviewPause').textContent = previewPlaying ? 'Ⅱ PAUSAR' : '▶ REPRODUZIR';
  if (previewPlaying) previewFrameId = requestAnimationFrame(updateLibraryPreview);
}
function openLibraryPreview(type, trigger) {
  const info = CARD_SECTIONS[librarySection]?.[type]; const definition = previewDefinition(type, librarySection);
  if (!info || !definition) return;
  activePreview = { info, definition, trigger }; previewElapsed = 0; previewLastTime = 0;
  previewPlaying = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#libraryPreviewTitle').textContent = info.name;
  $('#libraryPreviewDescription').textContent = conciseCardDescription(type, info, librarySection);
  $('#libraryPreviewCanvas').setAttribute('aria-label', `Demonstração de ${info.name}: ${definition.phases.join('; ')}`);
  $('#libraryPreviewSteps').innerHTML = definition.phases.map((phase, index) => `<span${index === 0 ? ' class="active"' : ''}>${index + 1}. ${escapeHtml(phase)}</span>`).join('');
  $('#libraryModal').inert = true; $('#libraryPreviewModal').hidden = false; updateLibraryPreview();
  $('#libraryPreviewClose').focus(); audio.ui('select');
}
function closeLibraryPreview() {
  const trigger = activePreview?.trigger;
  cancelAnimationFrame(previewFrameId); previewFrameId = 0; previewLastTime = 0; activePreview = null;
  $('#libraryPreviewModal').hidden = true; $('#libraryModal').inert = false;
  if (!$('#libraryModal').hidden) (trigger?.isConnected ? trigger : $('#librarySearch')).focus();
}
$('#libraryPreviewClose').onclick = closeLibraryPreview;
$('#libraryPreviewModal').onclick = (event) => { if (event.target === $('#libraryPreviewModal')) closeLibraryPreview(); };
$('#libraryPreviewReplay').onclick = () => { previewElapsed = 0; previewLastTime = 0; previewPlaying = true; cancelAnimationFrame(previewFrameId); updateLibraryPreview(); audio.ui('select'); };
$('#libraryPreviewPause').onclick = () => { previewPlaying = !previewPlaying; cancelAnimationFrame(previewFrameId); previewLastTime = 0; updateLibraryPreview(); audio.ui('select'); };

const trainingSteps = [
  { title: 'BEM-VINDO À ARENA', text: 'Esta é uma partida de treino contra um bot fácil. Você já tem a classe Blindado e três cartas: Obus, Zeus e Pulo. Quando aparecer SEU TURNO, comece.', target: '#turnTimer' },
  { title: 'ENCONTRE SEU TANQUE', text: 'Seu tanque tem o marcador VOCÊ. Use o botão VOCÊ ao lado do zoom para centralizar a câmera. A barrinha acima dele mostra a vida.', target: '#locatePlayer' },
  { title: 'MOVA-SE', text: 'Use WASD no desktop ou a alavanca no celular. Na água, W/S controlam a altura; tanques comuns afundam sem impulso. A Aranha se solta do teto com dois toques para baixo. O combustível recarrega a cada duas rodadas.', target: '.movement' },
  { title: 'MIRE E AJUSTE A FORÇA', text: 'Arraste no cenário para escolher direção, ângulo e força. No computador, use também os controles abaixo. A linha pontilhada prevê a trajetória com o vento; ASSIST sugere uma mira.', target: '#aimAssistButton' },
  { title: 'ESCOLHA O ARSENAL', text: 'Toque numa carta próxima ao botão ATIRAR: Padrão é ilimitado; Obus causa mais dano após voar longe; Zeus chama um raio; Pulo é movimento. As cartas especiais têm munição.', target: '#arsenalPicker' },
  { title: 'ATIRE E OBSERVE', text: 'Toque ATIRAR ou pressione Espaço. Espere a bala concluir o percurso e a explosão terminar. A câmera acompanha a ação no modo dinâmico. Você pode PASSAR a vez.', target: '#fireButton' },
  { title: 'COLETE E COMBINE POWERUPS', text: 'Itens enterrados surgem quando o solo é destruído. Encoste neles, passe com uma bala ou atinja-os com explosões. A carta aparece no centro e fica no HUD; toque em vários modificadores para combiná-los com seu tiro. No teclado: Q/E/R/T escolhem cartas do arsenal, 1–9 equipam powerups, V escolhe o tiro padrão e C seleciona o Corte Fatal do Ninja.', target: '#inventoryBar' },
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
net.on(SERVER.WELCOME, (data) => { if (data.protocolVersion !== PROTOCOL_VERSION) { serverCompatible = false; $('#serverMismatch').hidden = false; $('#connectionText').textContent = 'versões diferentes'; return; } serverCompatible = true; $('#serverMismatch').hidden = true; if (data.playerId) { spectatorMode = false; playerId = data.playerId; renderer.setPlayer(playerId); sessionStorage.setItem('tankPlayerId', data.playerId); sessionStorage.setItem('tankToken', data.token); } else if (data.spectator) { spectatorMode = true; playerId = null; renderer.setPlayer(null); sessionStorage.removeItem('tankPlayerId'); sessionStorage.removeItem('tankToken'); sessionStorage.setItem('tankSpectatorToken', data.token); document.body.classList.add('spectating'); $('#spectatorBadge').hidden = false; } });
net.on(SERVER.ERROR, ({ message }) => { if (testModeRequested && !room) testModeRequested = false; fireRequestPending = false; clearTimeout(fireRequestTimer); updateFireButton(); toast(message); });
net.on(SERVER.CHAT, (message) => { chatHistory.push(message); if (chatHistory.length > 40) chatHistory.shift(); $('#chatMessages').innerHTML = chatHistory.map((entry) => `<div><b style="color:${entry.color}">${escapeHtml(entry.nickname)}</b><span>${escapeHtml(entry.text)}</span></div>`).join(''); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; $('#chatPanel').classList.add('has-message'); setTimeout(() => $('#chatPanel').classList.remove('has-message'), 5000); });
net.on(SERVER.ROOM_STATE, (state) => { if (!serverCompatible) return; room = state; sessionStorage.setItem('tankRoomCode', state.code); renderRoom(); if (state.phase === 'lobby') { game = null; screen('roomScreen'); } });
net.on(SERVER.AIM_UPDATE, (update) => renderer.setRemoteAim(update));
net.on(SERVER.GAME_STATE, (state) => {
  if (state.training && state.seed !== trainingSeed) { trainingSeed = state.seed; trainingStep = 0; trainingOpen = true; }
  if (combatSeed !== state.seed) { combatSeed = state.seed; combatEntries.length = 0; deferredPickup = null; selectedWeapon = 'standard'; lastTurn = null; renderer.setMovementMode('standard'); $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === 'standard')); $('#combatFeedEntries').innerHTML = ''; }
  if (Number.isFinite(state.serverTime)) serverClockOffset = state.serverTime - Date.now();
  const before = game?.players.find((player) => player.id === playerId); const after = state.players.find((player) => player.id === playerId);
  const previousLavaRiseSerial = game?.survival?.lastRise?.serial;
  const shotSoundPending = audio.usingMobileAudio() && renderer.shots.some((shot) => !shot.exploded);
  if (before && after && !shotSoundPending) {
    const newlyEquipped = (after.selectedPowerups || []).find((type) => !(before.selectedPowerups || []).includes(type));
    if (newlyEquipped) audio.power(newlyEquipped);
    if (after.lastBuoy?.serial && after.lastBuoy.serial !== before.lastBuoy?.serial) audio.power('buoy');
    if (after.lastHealingDrone?.serial && after.lastHealingDrone.serial !== before.lastHealingDrone?.serial) audio.power('repairDrone');
  }
  if (game) for (const nextPlayer of state.players) { const previousPlayer = game.players.find((entry) => entry.id === nextPlayer.id); if (!previousPlayer) continue; if (nextPlayer.health < previousPlayer.health && nextPlayer.alive && !shotSoundPending) audio.damage(previousPlayer.health - nextPlayer.health); if (previousPlayer.alive && !nextPlayer.alive) addCombatEntry(`${nextPlayer.nickname} foi eliminado`, 'danger'); if (nextPlayer.health > previousPlayer.health && nextPlayer.regenTurns >= 0 && !shotSoundPending) audio.status('heal'); if ((nextPlayer.frozenTurns || 0) > (previousPlayer.frozenTurns || 0) && !shotSoundPending) audio.status('freeze'); }
  if (before && after && after.alive && after.health < before.health) mobileVibrate([18, 25, 22]);
  if (before && after && after.classType === 'ninja' && after.invisibleTurns > 0 && before.invisibleTurns <= 0) { audio.teleport(); toast('NINJA INVISÍVEL • FANTASMA AZUL NA ÚLTIMA POSIÇÃO'); mobileVibrate([8, 35, 8]); }
  if (before && after?.lastSplitDamage?.serial && after.lastSplitDamage.serial !== before.lastSplitDamage?.serial) { audio.power('shield'); addCombatEntry(`${after.nickname}: DANO DIVIDIDO ATIVO • 2 RODADAS`, 'hit'); mobileVibrate([14, 20, 14]); }
  if (state.lastSuperheatPulse?.serial && state.lastSuperheatPulse.serial !== game?.lastSuperheatPulse?.serial) { audio.power('superheat'); const pulses = state.lastSuperheatPulses?.length || 1; addCombatEntry(`SUPERAQUECER • ${pulses > 1 ? `${pulses} PULSOS DE CALOR` : 'PULSO DE CALOR'}`, 'hit'); mobileVibrate([18, 28, 18, 28, 36]); }
  if (game) for (const nextPlayer of state.players) { const previous = game.players.find((entry) => entry.id === nextPlayer.id); if (nextPlayer.lastNinjaReveal?.destroyedSerial && nextPlayer.lastNinjaReveal.destroyedSerial !== previous?.lastNinjaReveal?.destroyedSerial) { audio.status('electric'); addCombatEntry(`${nextPlayer.nickname}: era apenas um fantasma!`, 'neutral'); } if (nextPlayer.lastSplitReflection?.serial && nextPlayer.lastSplitReflection.serial !== previous?.lastSplitReflection?.serial) { audio.status('electric'); addCombatEntry(`DANO DIVIDIDO • ${nextPlayer.lastSplitReflection.amount} HP refletidos`, 'hit'); } }
  if (before && after && (after.stats?.destruction || 0) > (before.stats?.destruction || 0)) { const gain = (after.stats?.destruction || 0) - (before.stats?.destruction || 0); const type = after.lastDestruction?.type; $('#destructionRecent').textContent = `+${gain} ${DESTRUCTION_LABELS[type] || ''}`; $('#destructionCard').classList.remove('bump'); void $('#destructionCard').offsetWidth; $('#destructionCard').classList.add('bump'); clearTimeout(destructionTimer); destructionTimer = setTimeout(() => { $('#destructionRecent').textContent = ''; $('#destructionCard').classList.remove('bump'); }, 2200); mobileVibrate([8, 24, 12]); }
  if (before && after && after.lastPickup?.serial && after.lastPickup.serial !== before.lastPickup?.serial) { const pickup = { type: after.lastPickup.type, player: structuredClone(after) }; mobileVibrate([10, 35, 15]); renderer.spawnPickupEffect(after, pickup.type); renderer.whenBattleAnimationsComplete(() => { audio.pickup(pickup.type); showPickup(pickup.type, pickup.player); }); }
  if (before && after?.lastLaunch?.serial && after.lastLaunch.serial !== before.lastLaunch?.serial) { if (after.lastLaunch.kind === 'armoredDash') { audio.armoredDash(after.lastLaunch.wallsDestroyed || 0, after.lastLaunch.hitPlayerIds?.length || 0); mobileVibrate([22, 14, 34, 12, 58]); } else audio.launch(after.lastLaunch.kind || 'jump'); }
  if (game) for (const nextPlayer of state.players) { const previous = game.players.find((player) => player.id === nextPlayer.id); if (!previous) continue; if (nextPlayer.lastMove?.serial && nextPlayer.lastMove.serial !== previous.lastMove?.serial) { if (nextPlayer.lastMove.kind === 'excavator') audio.power('excavator'); else if (nextPlayer.lastMove.kind === 'rocketDash') audio.launch('rocketDash'); else if (nextPlayer.lastMove.kind === 'iceSlide') audio.environment('iceSlide'); else if (performance.now() - lastTrackSoundAt > 280) { audio.move('tracks'); lastTrackSoundAt = performance.now(); } } if (nextPlayer.lastJump?.serial && nextPlayer.lastJump.serial !== previous.lastJump?.serial) audio.launch(nextPlayer.lastJump.kind); }
  const newPlatformFlow = (state.platformWaterFlows || []).some((flow) => !(game?.platformWaterFlows || []).some((entry) => entry.id === flow.id)); if (newPlatformFlow) audio.environment('waterFlow', .85);
  if (before && after?.lastAirBoost?.serial && after.lastAirBoost.serial !== before.lastAirBoost?.serial) { audio.launch(after.lastAirBoost.kind); mobileVibrate(after.lastAirBoost.kind === 'doubleDash' ? [22, 18, 38, 18, 60] : [18, 16, 38]); }
  if (before && after?.lastBlink?.serial && after.lastBlink.serial !== before.lastBlink?.serial) { audio.teleport(0); renderer.spawnTeleport(after.lastBlink); }
  const arenaEvent = state.events?.at(-1); const arenaEventKey = arenaEvent ? `${arenaEvent.id}:${arenaEvent.warning ? 'warning' : 'impact'}` : null;
  const newArenaEvent = Boolean(arenaEvent && arenaEventKey !== lastArenaEventKey);
  const previousGame = game;
  if (previousGame?.harpoonPull && !state.harpoonPull) { fireRequestPending = false; clearTimeout(fireRequestTimer); }
  if (state.harpoonPull && !previousGame?.harpoonPull) { renderer.spawnHarpoonPull(state.harpoonPull); audio.weaponCue('harpoonPull'); mobileVibrate([12, 24, 22]); }
  if (state.lastHarpoonHit?.serial && state.lastHarpoonHit.serial !== previousGame?.lastHarpoonHit?.serial) { audio.weaponCue('harpoonHit'); mobileVibrate([25, 16, 38]); }
  if (state.lastSoapPop?.serial && state.lastSoapPop.serial !== previousGame?.lastSoapPop?.serial) { audio.weaponCue('soapPop'); mobileVibrate([12, 12, 20]); }
  if (state.lastRodPulse?.serial && state.lastRodPulse.serial !== previousGame?.lastRodPulse?.serial && previousGame?.seed === state.seed) { audio.status('electric'); mobileVibrate([12, 20, 18]); }
  const previousClassPulseSerial = Math.max(0, ...(previousGame?.lastClassPulses || []).map((pulse) => pulse.serial));
  const newClassPulses = (state.lastClassPulses || []).filter((pulse) => pulse.serial > previousClassPulseSerial);
  if (newClassPulses.length && previousGame?.seed === state.seed) { audio.status(newClassPulses.some((pulse) => pulse.type === 'healer') ? 'heal' : 'shield'); mobileVibrate(14); }
  if (state.lastSentryPulse?.serial && state.lastSentryPulse.serial !== previousGame?.lastSentryPulse?.serial && previousGame?.seed === state.seed) { audio.sentryBurst(); mobileVibrate([10, 25, 10]); }
  if (state.lastSpecialistPulse?.serial && state.lastSpecialistPulse.serial !== previousGame?.lastSpecialistPulse?.serial && previousGame?.seed === state.seed) { audio.sentryBurst(); mobileVibrate([9, 18, 9]); }
  if (state.lastSpecialistMove?.serial && state.lastSpecialistMove.serial !== previousGame?.lastSpecialistMove?.serial && previousGame?.seed === state.seed) audio.ui('select');
  if (state.lastNinjaStrike?.serial && state.lastNinjaStrike.serial !== previousGame?.lastNinjaStrike?.serial && previousGame?.seed === state.seed) { const attacker = state.players.find((player) => player.id === state.lastNinjaStrike.sourceId); addCombatEntry(`${attacker?.nickname || 'Ninja'}: CORTE FATAL • -${state.lastNinjaStrike.damage} HP`, 'hit'); audio.ninjaSlash(); mobileVibrate([18, 18, 52]); }
  const reroll = state.players.find((player) => player.id === playerId)?.lastBackpackerReroll;
  const previousReroll = previousGame?.players.find((player) => player.id === playerId)?.lastBackpackerReroll;
  if (reroll?.serial && reroll.serial !== previousReroll?.serial && previousGame?.seed === state.seed) { selectedWeapon = 'standard'; addCombatEntry(`NOVO ARSENAL: ${reroll.choices.map((type) => ARSENAL_DEFS[type]?.short || type).join(' • ')}`, 'hit'); toast('Novo arsenal sorteado! Tiro padrão pronto.'); }
  const sharedPickup = state.players.find((player) => player.id === playerId)?.lastSharedPickup;
  const previousSharedPickup = previousGame?.players.find((player) => player.id === playerId)?.lastSharedPickup;
  if (sharedPickup?.serial && sharedPickup.serial !== previousSharedPickup?.serial) { const ally = state.players.find((player) => player.id === sharedPickup.toId); addCombatEntry(`${POWERUP_DEFS[sharedPickup.type]?.short || ARSENAL_DEFS[sharedPickup.type]?.short || sharedPickup.type} enviado a ${ally?.nickname || 'aliado'} • uso único`, 'hit'); }
  if ((state.lastSaboteurPulses || []).some((pulse) => pulse.serial > Math.max(0, ...(previousGame?.lastSaboteurPulses || []).map((entry) => entry.serial))) && previousGame?.seed === state.seed) { audio.status('electric'); mobileVibrate([18, 26, 20]); }
  game = state; renderer.setGame(state, { deferWorld: newArenaEvent && !arenaEvent.warning }); renderRewardOffer(); renderClassEvolution();
  if (renderer.specialistSelection && (state.players[state.turnIndex]?.id !== playerId || !state.objects?.some((entry) => entry.id === renderer.specialistSelection && entry.active))) { renderer.specialistSelection = null; renderer.specialistTarget = null; }
  for (const player of state.players) {
    const previous = previousGame?.players.find((entry) => entry.id === player.id); if (!previous) continue;
    if (player.lastRevive?.serial && player.lastRevive.serial !== previous.lastRevive?.serial) { const revival = { ...player.lastRevive, playerId: player.id }; renderer.whenBattleAnimationsComplete(() => { renderer.spawnReviveEffect(revival); audio.teleport(); if (player.id === playerId) mobileVibrate([20, 35, 28, 35, 55]); }); addCombatEntry(`${player.nickname} renasceu com ${player.health} HP`, 'hit'); }
    if (player.lastSalvage?.serial && player.lastSalvage.serial !== previous.lastSalvage?.serial) { renderer.spawnSalvageHeal(player.lastSalvage); audio.status('heal'); addCombatEntry(`${player.nickname} reciclou destruição: +${player.lastSalvage.healed} HP`, 'hit'); }
  }
  if (state.survival?.lastRise?.serial !== previousLavaRiseSerial && state.survival?.lastRise?.from > state.survival?.lastRise?.to) showSurvivalRise(state.survival.lastRise);
  if (arenaEvent && arenaEventKey !== lastArenaEventKey) { lastArenaEventKey = arenaEventKey; renderer.playArenaEvent(arenaEvent, gameNow()); audio.arena(arenaEvent.weatherPrelude && arenaEvent.warning ? 'flood' : arenaEvent.type, arenaEvent.warning); mobileVibrate(arenaEvent.warning ? [12, 80, 12] : arenaEvent.type === 'lightning' ? [18, 18, 18, 18, 55] : [35, 28, 75]); showArenaAlert(arenaEvent); addCombatEntry(`${arenaEvent.warning ? 'Atenção' : 'Impacto'}: ${arenaEvent.weatherPrelude && arenaEvent.warning ? 'CHUVA INTENSA' : EVENT_DEFS[arenaEvent.type]?.name || arenaEvent.type}`, arenaEvent.warning ? 'warning' : 'danger'); }
  const sequence = ++resultSequence;
  if (state.phase === 'finished') { screen('gameScreen'); renderHud(); renderer.whenBattleAnimationsComplete(() => { if (sequence === resultSequence && game?.phase === 'finished') renderResult(); }); }
  else if (state.phase === 'class' || state.phase === 'arsenal') { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; const stage = state.phase; const saved = stage === 'class' ? savedClassSeed : savedArsenalSeed; if (!spectatorMode && saved !== state.seed) { if ($('#arsenalModal').hidden || $('#arsenalModal').dataset.stage !== stage || $('#arsenalModal').dataset.timed !== 'true') openArsenal(true, stage); } else { $('#arsenalModal').hidden = true; renderHud(); } }
  else if (state.phase === 'roulette') { resultSoundPlayed = false; screen('gameScreen'); $('#arsenalModal').hidden = true; renderRoulette(state); }
  else { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; clearInterval(rouletteTimer); renderHud(); }
  renderTrainingCoach();
});

function showArenaAlert(event) {
  if (!$('#rewardModal').hidden || !$('#classEvolutionModal').hidden || $('#pickupReveal').classList.contains('show')) return;
  if (event.weatherPrelude && event.warning) {
    const seconds = Math.max(1, Math.ceil((event.executeAt - gameNow()) / 1000));
    $('#arenaAlertTitle').textContent = `☁ CHUVA INTENSA • ${seconds}s`;
    const chance = game.enabledEvents?.includes('flood') && game.enabledEvents?.includes('lightning') ? '50% Inundação ou 50% Raios.' : 'Uma tempestade se aproxima.';
    $('#arenaAlertDetail').textContent = `Nuvens cobrem a arena. Depois da chuva: ${chance}${game.enabledEvents?.includes('gale') ? ' Vendaval em seguida.' : ''}`;
    const alert = $('#arenaAlert'); alert.classList.remove('impact', 'lucky', 'eruption', 'show'); void alert.offsetWidth; alert.classList.add('show'); clearTimeout(arenaAlertTimer); arenaAlertTimer = setTimeout(() => alert.classList.remove('show'), seconds * 1000);
    return;
  }
  const names = { supply: 'SUPRIMENTOS AÉREOS', quake: 'ABALO DA ARENA', bombardment: 'BOMBARDEIO PROGRESSIVO', lightning: 'TEMPESTADE ELÉTRICA', collapse: 'COLAPSO DO CENÁRIO', tectonic: 'EVENTO TECTÔNICO', luckyWinds: 'VENTOS DE SORTE', gale: 'VENDAVAL', eruption: 'ERUPÇÃO VULCÂNICA', flood: 'INUNDAÇÃO', flora: 'TEMPO DE FLORA', blizzard: 'NEVASCA POLAR' };
  const details = { supply: `Helicóptero em aproximação • ${event.lootboxChance || 0}% de chance de Lootbox.`, quake: 'O solo irá se romper em pontos marcados.', bombardment: 'Miras confirmadas. Cada projétil seguinte terá uma explosão maior.', lightning: 'A descarga causa dano, destrói coberturas, incendeia árvores e bloqueia powerups.', collapse: 'Partes instáveis do terreno serão destruídas.', tectonic: 'O terremoto remodelará o solo e deslocará todos os tanques.', luckyWinds: 'Zonas douradas recuperarão 40 HP dos tanques em seu interior.', gale: `A ventania empurrará os tanques para ${event.windDirection > 0 ? 'a direita' : 'a esquerda'}.${event.tornadoes?.length ? ' Dois tornados se formarão e durarão 4 turnos!' : ''}`, eruption: 'Bolas de fogo sobem dos fossos, colidem com a arena e deixam áreas incendiadas.', flood: 'Nuvens fecham o céu; a chuva abre bacias e enche lagos no terreno.', flora: 'Sementes criarão árvores e galhos caminháveis.', blizzard: 'A frente polar apaga incêndios, congela lagos e reduz a mobilidade.' };
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
  renderer.playShot(result); updateFireButton(); const first = result.results?.[0]; const flight = renderer.shotDuration(result);
  if (result.replaceFireworks) { audio.fireworksBurst(); return; }
  if (result.detonation) return;
  if (result.replaceCluster) { clearTimeout(clusterImpactTimer); clusterImpactTimer = null; audio.clusterSplit(); const impact = Math.min(...(result.results || []).filter((shot) => shot.impact).map((shot) => shot.path.length / SHOT_PATH_RATE / (game?.speed || 1))); if (Number.isFinite(impact)) audio.shoot(impact, 'cluster', result.results.some((shot) => shot.damage?.some((hit) => hit.amount > 0)) ? 1 : 0, { ...first, hasImpact: true }); return; }
  const shotTime = (shot) => shot.waterCannon ? (shot.durationMs || WEAPON_BALANCE.waterCannon.durationMs) / 1000 : Math.max(.08, shot.path.length / SHOT_PATH_RATE / (game?.speed || 1) / (shot.canActivateCluster ? CLUSTER_CAPSULE_SPEED : shot.canActivateVertical ? VECTOR_FLIGHT_RATE : 1) + (shot.mirrorDelay || 0));
  const impacts = (result.results || []).filter((shot) => shot.impact);
  const audibleImpact = impacts.sort((a, b) => shotTime(a) - shotTime(b))[0]; const impactAt = audibleImpact ? shotTime(audibleImpact) : flight;
  const shooter = game?.players.find((player) => player.id === result.shooterId); const hitTotals = new Map(); for (const shot of result.results || []) for (const hit of shot.damage || []) if (hit.amount > 0) hitTotals.set(hit.playerId, (hitTotals.get(hit.playerId) || 0) + hit.amount);
  const summary = [...hitTotals].map(([id, amount]) => `${game?.players.find((player) => player.id === id)?.nickname || 'tanque'} −${amount} HP`).join(' • ');
  addCombatEntry(`${first?.concealed ? 'Disparo oculto' : shooter?.nickname || 'Tanque'}: ${ARSENAL_DEFS[first?.weapon]?.name || 'TIRO PADRÃO'}${summary ? ` • ${summary}` : first?.weapon === 'sentry' ? ' • torre instalada' : ' • sem dano'}`, summary ? 'hit' : 'neutral');
  const hits = result.results?.reduce((sum, shot) => sum + shot.damage.filter((entry) => entry.amount > 0).length, 0) || 0;
  if (first) { if (result.replaceVertical) audio.vertical(impactAt, hits, Boolean(audibleImpact)); else audio.shoot(impactAt, first.weapon || 'standard', hits, { ...first, hasImpact: Boolean(audibleImpact) && !first.delayedStrike && !first.canActivateCluster && !first.canActivateFireworks && first.weapon !== 'waterMine' }); if (first.canActivateCluster && audibleImpact && !audio.usingMobileAudio()) { clearTimeout(clusterImpactTimer); clusterImpactTimer = setTimeout(() => { audio.clusterImpact(); clusterImpactTimer = null; }, impactAt * 1000); } }
  if (first?.incendiaryVolley && !first?.concealed && !result.replaceVertical && !result.replaceCluster && !result.replaceFireworks) audio.flamethrower();
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
    const teamLabel = ['teams', 'teamHill'].includes(room.rules.gameMode) ? `EQUIPE ${String(p.team).split('-').at(-1)} · ` : room.rules.gameMode === 'coop' ? `${p.team === 'bots' ? 'EQUIPE BOT' : 'EQUIPE HUMANA'} · ` : '';
    const classArt = room.rules.classesEnabled && p.classSelected && CLASS_DEFS[p.classType] ? `<i class="atlas-art atlas-classes art-${p.classType}" style="${atlasStyle(p.classType, 'classes')}"></i>` : '<span class="tank-avatar"></span>';
    const arsenalArt = p.arsenalSelected ? (p.arsenal || []).map((type) => `<i class="atlas-art atlas-arsenal art-${type}" style="${atlasStyle(type, 'arsenal')}" title="${escapeHtml(ARSENAL_DEFS[type]?.name || type)}"></i>`).join('') : '';
    return `<div class="player-card ${p.ready ? 'ready' : 'pending'}" style="--color:${p.color}"><span class="lobby-class-art" aria-label="${escapeHtml(className)}">${classArt}</span><div class="player-card-copy"><strong>${escapeHtml(p.nickname)}</strong><small>${escapeHtml(teamLabel + role)} · ${escapeHtml(className)}</small><span class="lobby-arsenal-art">${arsenalArt || `<em>${escapeHtml(arsenalName)}</em>`}</span></div><span class="player-ready">${p.ready ? '✓ PRONTO' : p.connected ? 'PREPARANDO' : 'DESCONECTADO'}</span></div>`;
  }).join('');
  const biome = BIOMES[room.mapTypeResolved] || BIOMES.flat;
  const arenaWidth = room.arenaWidth || 5600;
  $('#scenarioCard').dataset.biome = room.mapTypeResolved || 'flat';
  $('#scenarioCard').style.setProperty('--scenario-sky', biome.sky[1]);
  $('#scenarioCard').style.setProperty('--scenario-soil', biome.soil[0]);
  $('#scenarioName').textContent = biome.name.toUpperCase();
  $('#scenarioDetails').textContent = `${arenaWidth} BLOCOS · ${room.players.length} TANQUES · MAPA #${room.mapSeed}${room.mapTypeResolved === 'archipelago' ? ' · CANAIS DE ÁGUA' : ''}`;
  const labels = { gameMode: 'Modo', teamCount: 'Equipes', friendlyFire: 'Fogo amigo', maxPlayers: 'Jogadores', botCount: 'Bots', botDifficulty: 'Dificuldade IA', health: 'Vida inicial', turnSeconds: 'Tempo de turno', gameSpeed: 'Velocidade', roundLimit: 'Limite de rodadas', mapType: 'Bioma', seed: 'Semente', powerupCount: 'Powerups', classesEnabled: 'Classes', enabledEvents: 'Eventos', enabledPowerups: 'Tipos de powerup', mines: 'Minas', gravity: 'Gravidade' };
  const difficultyNames = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };
  $('#rulesList').innerHTML = Object.entries(labels).filter(([key]) => key === 'teamCount' ? ['teams', 'teamHill'].includes(room.rules.gameMode) : key === 'friendlyFire' ? ['coop', 'teams', 'teamHill'].includes(room.rules.gameMode) : true).map(([key, label]) => `<div><dt>${label}</dt><dd>${key === 'friendlyFire' ? room.rules.friendlyFire ? 'ATIVADO' : 'DESATIVADO' : room.rules[key] === true ? 'ATIVADAS' : room.rules[key] === false ? 'DESATIVADAS' : Array.isArray(room.rules[key]) ? `${room.rules[key].length} HABILITADOS` : key === 'seed' && !room.rules.seed ? 'ALEATÓRIA' : key === 'mapType' ? BIOMES[room.rules.mapType]?.name || 'ALEATÓRIO' : key === 'botDifficulty' ? difficultyNames[room.rules[key]] : key === 'gameMode' ? ({ coop: 'COOP', teams: 'VS EQUIPES', teamHill: 'DOMÍNIO POR EQUIPES', ffa: 'CADA UM POR SI', hill: 'REI DA COLINA', survival: 'SOBREVIVÊNCIA' }[room.rules[key]]) : key === 'teamCount' ? `${room.rules[key]} EQUIPES` : escapeHtml(String(room.rules[key]))}</dd></div>`).join('');
  const me = room.players.find((player) => player.id === playerId); const host = playerId === room.hostId; const readyCount = room.players.filter((player) => player.ready).length;
  $('#rerollScenarioButton').hidden = spectatorMode || !host;
  $('#rerollScenarioButton').disabled = false;
  $('#rerollScenarioButton').innerHTML = `SORTEAR CENÁRIO <b>↻ ${room.scenarioRerolls || 0}</b>`;
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
  if (!classStage && classesEnabled) renderSelectedClassAndSuggestion();
}
function openArsenal(timed = false, stage = room?.rules?.classesEnabled === false ? 'arsenal' : 'class') {
  const roomPlayer = room?.players?.find((entry) => entry.id === playerId);
  const player = timed ? game?.players?.find((entry) => entry.id === playerId) : roomPlayer;
  const selected = new Set(roomPlayer?.arsenalSelected ? roomPlayer.arsenal : []);
  const offered = new Set(player?.arsenalOffer || Object.keys(ARSENAL_DEFS));
  arsenalSelectionOrder = [...selected].filter((type) => offered.has(type));
  const classesEnabled = room?.rules?.classesEnabled !== false;
  if (classesEnabled) { const selectedClass = player?.classType || 'armored'; pendingClassType = selectedClass; $('#classCatalog').innerHTML = Object.entries(CLASS_DEFS).map(([type, info]) => `<button type="button" data-class-type="${type}" aria-pressed="${selectedClass === type}" class="class-card ${selectedClass === type ? 'selected' : ''}" style="--item:${info.color}"><i class="class-art atlas-art atlas-classes" style="${atlasStyle(type, 'classes')}" aria-hidden="true"></i><b>${info.short}</b><strong>${info.name}</strong><span>${escapeHtml(conciseCardDescription(type, info, 'classes'))}</span><em>PASSIVA</em></button>`).join(''); }
  if (classesEnabled) for (const [type, info] of Object.entries(CLASS_DEFS)) {
    const card = $(`#classCatalog [data-class-type="${type}"]`);
    card.title = info.description;
    card.querySelector('em').textContent = classAttributeSummary(type);
  }
  $('#arsenalCatalog').innerHTML = Object.entries(ARSENAL_DEFS).filter(([type]) => offered.has(type)).map(([type, info]) => `<button type="button" class="${selected.has(type) ? 'selected' : ''}" aria-pressed="${selected.has(type)}" data-arsenal="${type}" style="--item:${info.color}" title="${escapeHtml(combatDescription(type, info))}">${cardArtwork(type, 'arsenal', 'arsenal-card-art')}<span class="arsenal-check">✓</span><b>${info.short}</b><strong>${info.name}</strong><span class="arsenal-description">${escapeHtml(conciseCardDescription(type, info, 'arsenal'))}</span><span class="card-stats"><span class="card-stat-damage"><b>DANO</b>${escapeHtml(cardDamage(type) || '—')}</span><span class="card-stat-range"><b>ALCANCE</b>${escapeHtml(cardRange(type) || '—')}</span></span><i>${info.kind === 'movement' ? 'MOVIMENTO' : info.kind === 'defense' ? 'DEFESA ATIVA' : info.kind === 'pulse' ? 'PULSO DE ÁREA' : 'TIRO ESPECIAL'}</i></button>`).join('');
  $('#arsenalCatalog [data-arsenal="mixer"]>i:last-child')?.replaceChildren(document.createTextNode('PASSIVA • OCUPA 1 VAGA'));
  updateArsenalCardDetail($('#arsenalCatalog .selected') || $('#arsenalCatalog [data-arsenal]'));
  updateArsenalSelection();
  showPreparationStage(stage, timed);
  $('#arsenalModal').hidden = false;
  $('#arsenalClose').hidden = timed;
}
$('#arsenalButton').onclick = () => openArsenal(false); $('#arsenalClose').onclick = () => { $('#arsenalModal').hidden = true; };
$('#classNext').onclick = () => { const classType = $('#classCatalog .selected')?.dataset.classType; if (!classType) { toast('Escolha uma classe.'); return; } send(CLIENT.SET_CLASS, { classType }); audio.ui('confirm'); if ($('#arsenalModal').dataset.timed === 'true') { savedClassSeed = game.seed; $('#arsenalModal').hidden = true; toast('Classe confirmada. Arsenal em seguida.'); } else showPreparationStage('arsenal', false); };
$('#arsenalBack').onclick = () => showPreparationStage('class', false);
function updateArsenalSelection() {
  const choices = $$('#arsenalCatalog .selected').map((button) => button.dataset.arsenal);
  $$('#arsenalCatalog [data-arsenal]').forEach((button) => button.setAttribute('aria-pressed', String(button.classList.contains('selected'))));
  const mixNeedsPartner = choices.includes('mixer') && choices.filter((type) => MIXER_WEAPONS.includes(type)).length < 2;
  $('#arsenalLoadout .arsenal-summary span').textContent = mixNeedsPartner
    ? 'MIX ocupa 1 vaga. A fusão exige 2 armas de impacto compatíveis.'
    : choices.length === 3 ? '3 cartas escolhidas. Toque em outra para trocar a última.'
      : 'Escolha três entre todas as cartas disponíveis.';
  $('#arsenalSelectedCount').textContent = `${choices.length} / 3`;
  $('#arsenalSave').disabled = choices.length !== 3;
}
function updateArsenalCardDetail(button) { if (!button) return; const info = ARSENAL_DEFS[button.dataset.arsenal]; $('#arsenalCardDetail').innerHTML = `<strong style="color:${info.color}">${escapeHtml(info.name)}</strong><span>${escapeHtml(combatDescription(button.dataset.arsenal, info))}</span>`; }
function renderSelectedClassAndSuggestion() { const info = CLASS_DEFS[pendingClassType]; if (!info) return; const choices = (CLASS_ARSENAL_SYNERGY[pendingClassType] || []).filter((type) => $(`#arsenalCatalog [data-arsenal="${type}"]`)).slice(0, 3); $('#selectedClassCard').innerHTML = `<i class="class-art atlas-art atlas-classes" style="${atlasStyle(pendingClassType, 'classes')}" aria-hidden="true"></i><span><small>CLASSE ESCOLHIDA</small><strong style="color:${info.color}">${info.name}</strong><em>${escapeHtml(classCardStats(pendingClassType).join(' • '))}</em></span>`; $('#arsenalSuggestion').innerHTML = choices.length === 3 ? `<span><small>SUGESTÃO SINÉRGICA</small><b>${choices.map((type) => ARSENAL_DEFS[type].short).join(' + ')}</b></span><button type="button" data-apply-suggestion="${choices.join(',')}">USAR SUGESTÃO</button>` : ''; }
function chooseArsenalCard(button) {
  updateArsenalCardDetail(button);
  const type = button.dataset.arsenal;
  if (button.classList.contains('selected')) {
    button.classList.remove('selected');
    arsenalSelectionOrder = arsenalSelectionOrder.filter((item) => item !== type);
  } else {
    if ($$('#arsenalCatalog .selected').length >= 3) {
      const replaced = arsenalSelectionOrder.at(-1) || $$('#arsenalCatalog .selected').at(-1)?.dataset.arsenal;
      $(`#arsenalCatalog [data-arsenal="${replaced}"]`)?.classList.remove('selected');
      arsenalSelectionOrder = arsenalSelectionOrder.filter((item) => item !== replaced);
      toast(`${ARSENAL_DEFS[replaced]?.short || replaced} trocado por ${ARSENAL_DEFS[type]?.short || type}`);
    }
    button.classList.add('selected');
    arsenalSelectionOrder.push(type);
  }
  updateArsenalSelection(); audio.ui();
}
function bindReliableCardPicker(container, selector, handler) {
  let press = null; let lastPointerSelection = null;
  container.addEventListener('pointerdown', (event) => {
    const target = event.target.closest(selector);
    press = target && event.isPrimary ? { target, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null;
  });
  container.addEventListener('pointermove', (event) => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 18) press.moved = true;
  });
  container.addEventListener('pointerup', (event) => {
    if (!press || press.id !== event.pointerId) return;
    const current = press; press = null;
    if (current.moved || current.target !== event.target.closest(selector) || Math.hypot(event.clientX - current.x, event.clientY - current.y) > 18) return;
    handler(current.target);
    lastPointerSelection = { target: current.target, at: performance.now() };
  });
  container.addEventListener('pointercancel', () => { press = null; });
  container.addEventListener('click', (event) => {
    const target = event.target.closest(selector);
    if (!target) return;
    // Only suppress the synthetic click for the same pointer tap. A quick
    // second tap or keyboard activation must still select its own card.
    if (event.detail > 0 && lastPointerSelection?.target === target && performance.now() - lastPointerSelection.at < 450) return;
    handler(target);
  });
}
bindReliableCardPicker($('#arsenalCatalog'), '[data-arsenal]', chooseArsenalCard);
bindReliableCardPicker($('#classCatalog'), '[data-class-type]', (button) => { pendingClassType = button.dataset.classType; $$('#classCatalog [data-class-type]').forEach((entry) => { const chosen = entry === button; entry.classList.toggle('selected', chosen); entry.setAttribute('aria-pressed', String(chosen)); }); audio.ui(); });
$('#arsenalSuggestion').onclick = (event) => { const button = event.target.closest('[data-apply-suggestion]'); if (!button) return; const choices = button.dataset.applySuggestion.split(','); arsenalSelectionOrder = [...choices]; $$('#arsenalCatalog [data-arsenal]').forEach((card) => card.classList.toggle('selected', choices.includes(card.dataset.arsenal))); updateArsenalSelection(); updateArsenalCardDetail($(`#arsenalCatalog [data-arsenal="${choices[0]}"]`)); audio.ui('confirm'); };
$('#arsenalSave').onclick = () => { const choices = $$('#arsenalCatalog .selected').map((button) => button.dataset.arsenal); if (choices.length !== 3) { toast('Escolha exatamente 3 poderes.'); return; } if (game?.phase === 'arsenal') savedArsenalSeed = game.seed; send(CLIENT.SET_ARSENAL, { choices }); $('#arsenalModal').hidden = true; };

function renderRewardOffer() {
  const active = game?.players[game?.turnIndex]; const offer = active?.id === playerId ? active.rewardOffer : null; const modal = $('#rewardModal');
  modal.hidden = !offer; if (!offer) { delete modal.dataset.offerKey; return; }
  const offerKey = `${active.id}:${offer.id || offer.expiresAt || game.turnNumber}:${offer.choices.join(',')}`;
  if (modal.dataset.offerKey === offerKey) return;
  modal.dataset.offerKey = offerKey;
  if ($('#pickupReveal').classList.contains('show')) { const me = game?.players.find((player) => player.id === playerId); if (me?.lastPickup?.type) deferredPickup = { type: me.lastPickup.type, player: me }; $('#pickupReveal').classList.remove('show'); clearTimeout(pickupTimer); }
  $('#arenaAlert').classList.remove('show');
  const synergy = new Set(CLASS_POWERUP_SYNERGY[active.classType] || []);
  $('#rewardModal .reward-box>small').textContent = active.classType ? `RECOMPENSA • ${CLASS_DEFS[active.classType]?.name || 'CLASSE'} • SINERGIA ${CLASS_POWERUP_WEIGHT}× MAIS PROVÁVEL` : 'RECOMPENSA DE 3 TURNOS';
  $('#rewardChoices').innerHTML = offer.choices.map((type) => { const info = POWERUP_DEFS[type]; const favored = synergy.has(type); return `<button data-reward="${type}" class="powerup-${type}${favored ? ' class-favored' : ''}" style="--item:${info.color}">${cardArtwork(type, 'powerups', 'card-art')}<span class="card-rarity">${favored ? '★ SINERGIA DE CLASSE' : 'POWERUP'}</span><b>${info.short}</b><strong>${info.name}</strong><span>${escapeHtml(conciseCardDescription(type, info, 'powerups'))}</span><span class="card-stats"><span class="card-stat-damage"><b>DANO</b>${escapeHtml(cardDamage(type) || '—')}</span><span class="card-stat-range"><b>ALCANCE</b>${escapeHtml(cardRange(type) || '—')}</span></span><em>ESCOLHER</em></button>`; }).join('');
  $$('#rewardChoices [data-reward]').forEach((button) => button.onclick = () => { if ($$('#rewardChoices [data-reward]:disabled').length) return; $$('#rewardChoices [data-reward]').forEach((entry) => entry.disabled = true); send(CLIENT.CLAIM_REWARD, { type: button.dataset.reward }); });
}

function renderClassEvolution() {
  const me = game?.players.find((player) => player.id === playerId); const pending = me?.alive && me.pendingClassEvolutions > 0 && game.phase === 'playing';
  const modal = $('#classEvolutionModal'); modal.hidden = !pending;
  if (pending && $('#pickupReveal').classList.contains('show')) { if (me.lastPickup?.type) deferredPickup = { type: me.lastPickup.type, player: me }; $('#pickupReveal').classList.remove('show'); clearTimeout(pickupTimer); }
  if (!pending) { delete modal.dataset.evolutionKey; if (deferredPickup && game?.phase === 'playing' && $('#rewardModal').hidden) { const pickup = deferredPickup; deferredPickup = null; showPickup(pickup.type, pickup.player); } return; }
  const evolutionKey = `${me.id}:${game.roundNumber}:${me.pendingClassEvolutions}`;
  if (modal.dataset.evolutionKey === evolutionKey) return;
  modal.dataset.evolutionKey = evolutionKey;
  $('#arenaAlert').classList.remove('show');
  const milestones = classEvolutionRounds(game.roundLimit);
  $('#classEvolutionMilestone').textContent = `${CLASS_DEFS[me.classType]?.name || 'CLASSE'} • MARCO ${milestones.filter((round) => round <= game.roundNumber).length}/2 • RODADA ${game.roundNumber}`;
  $('#classEvolutionPending').textContent = me.pendingClassEvolutions > 1 ? `${me.pendingClassEvolutions} ESCOLHAS DISPONÍVEIS` : 'ESCOLHA PERMANENTE • VÁLIDA ATÉ O FIM DA PARTIDA';
  $('#classEvolutionChoices').innerHTML = Object.entries(CLASS_EVOLUTIONS).map(([type, info]) => `<button type="button" data-evolution="${type}" style="--evolution:${info.color}"><i aria-hidden="true">${type === 'fortify' ? '▦' : '✦'}</i><b>${info.name}</b><strong>${type === 'fortify' ? `+${info.health} HP` : `+${info.damage} DANO`}</strong><span>${escapeHtml(info.description)}</span><em>SELECIONAR</em></button>`).join('');
}
$('#classEvolutionChoices').onclick = (event) => { const button = event.target.closest('[data-evolution]'); if (!button) return; audio.ui(); send(CLIENT.CHOOSE_CLASS_EVOLUTION, { type: button.dataset.evolution }); $$('#classEvolutionChoices button').forEach((entry) => entry.disabled = true); };

function renderRoulette(state) {
  $('#rouletteBiomeName').textContent = `${BIOMES[state.terrain.type]?.name?.toUpperCase() || 'ARENA'} · SORTEANDO O PRIMEIRO TURNO`;
  clearInterval(rouletteTimer); const modal = $('#rouletteModal'); modal.hidden = false;
  updateFireButton();
  $('#rouletteTrack').style.setProperty('--track-cols', Math.min(5, state.players.length));
  $('#rouletteTrack').innerHTML = state.players.map((player, index) => `<div data-player-index="${index}" style="--player:${player.color}"><b>${escapeHtml(player.nickname)}</b></div>`).join('');
  const update = () => { const now = gameNow(); const spinEndsAt = state.rouletteSpinEndsAt || state.rouletteEndsAt; const spinning = now < spinEndsAt; const progress = Math.min(1, (now - state.rouletteStartedAt) / Math.max(1, spinEndsAt - state.rouletteStartedAt)); const sequenceIndex = Math.min(state.rouletteSequence.length - 1, Math.floor(progress * state.rouletteSequence.length)); const winnerIndex = state.rouletteWinnerIndex ?? state.turnIndex; const activeIndex = spinning ? state.rouletteSequence[sequenceIndex] : winnerIndex; $$('#rouletteTrack>div').forEach((item) => item.classList.toggle('active', Number(item.dataset.playerIndex) === activeIndex)); const winner = state.players[winnerIndex]; const countdown = Math.max(0, Math.ceil((state.rouletteEndsAt - now) / 1000)); $('#rouletteResult').textContent = spinning ? 'SORTEANDO...' : `${winner.nickname} COMEÇA`; $('#matchStartCountdown').textContent = countdown; };
  const updateWithConstruction = () => {
    update();
    const progress = Math.min(1, Math.max(0, (gameNow() - state.rouletteStartedAt) / Math.max(1, state.rouletteEndsAt - state.rouletteStartedAt)));
    const activeIndex = Number($('#rouletteTrack>div.active')?.dataset.playerIndex ?? state.rouletteWinnerIndex ?? state.turnIndex);
    drawRouletteConstruction($('#rouletteConstruction'), state, progress, activeIndex);
  };
  updateWithConstruction(); rouletteTimer = setInterval(updateWithConstruction, 80);
}

function renderHud() {
  document.body.classList.toggle('debug-mode', Boolean(game.debugMode));
  $('#debugToggle').hidden = !game.debugMode;
  if (!game.debugMode) $('#debugPanel').hidden = true;
  else { const me = game.players.find((entry) => entry.id === playerId); if (me) { $('#debugClass').value = me.classType || 'armored'; $('#debugElementRow').hidden = me.classType !== 'elementalist'; $('#debugElement').value = me.elementalCurrent || ''; const available = ['standard', ...(me.arsenal || [])]; if (available.some((type) => ![...$('#debugWeapon').options].some((option) => option.value === type)) || [...$('#debugWeapon').options].some((option) => !available.includes(option.value))) $('#debugWeapon').innerHTML = `<option value="standard">TIRO PADRÃO</option>${debugOptions(ARSENAL_DEFS, me.arsenal || [])}`; $('#debugWeapon').value = available.includes(selectedWeapon) ? selectedWeapon : 'standard'; } }
  const cursorOwnTurn = game.phase === 'playing' && game.players[game.turnIndex]?.id === playerId && game.players[game.turnIndex]?.alive && !spectatorMode; document.body.classList.toggle('player-turn', cursorOwnTurn); document.body.classList.toggle('cursor-move', ['blink', 'jump', 'spider', 'armoredDash'].includes(selectedWeapon)); document.body.classList.toggle('cursor-attack', cursorOwnTurn && !['blink', 'jump', 'spider', 'armoredDash'].includes(selectedWeapon));
  const soloBots = !spectatorMode && game.players.filter((player) => !player.isBot).length === 1 && game.players.some((player) => player.isBot); $('#soloControls').hidden = !soloBots; $('#pauseGameButton').textContent = game.paused ? '▶' : 'Ⅱ'; $('#pauseGameButton').title = game.paused ? 'Continuar partida' : 'Pausar partida'; $('#botSpeedButton').textContent = `BOT ×${game.botSpeed || 1}`; $('#pauseOverlay').hidden = !game.paused; document.body.classList.toggle('game-paused', Boolean(game.paused));
  const ownTurn = game.phase === 'playing' && game.players[game.turnIndex]?.id === playerId && game.players[game.turnIndex]?.alive && !spectatorMode; $('.turn-card').classList.toggle('my-turn', ownTurn); $('#turnLabel').textContent = ownTurn ? '● SEU TURNO' : 'TURNO ATUAL'; $('#ownTurnNotice').hidden = !ownTurn; $('#locatePlayer').disabled = !game.players.some((entry) => entry.id === playerId && entry.alive);
  const active = game.players[game.turnIndex]; const mine = game.phase === 'playing' && !game.paused && !game.shotEndsAt && !(game.arenaWarningUntil > gameNow()) && active?.id === playerId; $('#aimLockButton').disabled = !mine; $('#aimAssistButton').disabled = !mine || mobileAimLocked; $('#mobileAimReadout').disabled = !mine || mobileAimLocked;
  $('#turnTimer').hidden = game.phase !== 'playing';
  const newOwnTurn = mine && lastTurn !== game.turnNumber; if (newOwnTurn) { selectedWeapon = 'standard'; clearAimAssist(); restoreAim(); } else if (mine) updateMobileAimReadout();
  $('#turnPlayer').textContent = active?.nickname || '—';
  const classOwner = game.players.find((entry) => entry.id === playerId) || active; const classInfo = CLASS_DEFS[classOwner?.classType];
  $('#hudClassButton').hidden = !classInfo; if (classInfo) { $('#hudClassName').textContent = classInfo.name; $('#hudClassButton').title = `${classInfo.name} • toque para consultar a passiva`; $('#hudClassButton').setAttribute('aria-label', `Consultar classe ${classInfo.name}`); $('#hudClassArt').className = `atlas-art atlas-classes art-${classOwner.classType}`; $('#hudClassArt').setAttribute('style', atlasStyle(classOwner.classType, 'classes')); }
  if (!$('#classInfoPanel').hidden && $('#classInfoPanel').dataset.playerId) { const viewed = game.players.find((entry) => entry.id === $('#classInfoPanel').dataset.playerId); if (viewed) $('#classInfoStatus').textContent = classPassiveStatus(viewed) || 'Passiva contínua'; else closeClassInfo(); }
  const drive = active ? driveStats(active) : { speed: DRIVE.speed, maxFuel: DRIVE.fuel };
  const fuel = Math.max(0, Math.round(active?.fuel || 0));
  $('#movesLeft').textContent = active?.frozenTurns > 0 ? `CONGELADO • ${active.frozenTurns}T` : `${fuel} / ${drive.maxFuel}`;
  $('#driveSpeed').textContent = `${drive.speed} px/s`;
  $('#fuelFill').style.width = `${Math.min(100, fuel / drive.maxFuel * 100)}%`;
  $('#driveRefill').textContent = `RECARGA EM ${DRIVE.refillRounds - ((game.roundNumber - 1) % DRIVE.refillRounds)} ROD.`;
  const wind = game.wind || 0; $('#windValue').textContent = wind === 0 ? 'CALMO' : `${Math.abs(wind)} ${wind > 0 ? '→' : '←'}`; $('#windArrow').textContent = wind === 0 ? '•' : wind > 0 ? '»' : '«'; $('#windArrow').className = wind === 0 ? '' : wind > 0 ? 'right' : 'left';
  const roundsToEvent = game.roundNumber % 2 === 0 && game.lastArenaEventRound !== game.roundNumber ? 0 : 2 - (game.roundNumber % 2); const arenaLevel = Math.ceil(1 + ((game.roundNumber || 1) - 1) / Math.max(1, (game.roundLimit || 20) - 1) * 1.45); const eventCountdown = roundsToEvent === 0 ? 'AGORA' : `${roundsToEvent} ${roundsToEvent === 1 ? 'RODADA' : 'RODADAS'}`; $('#arenaEvent').textContent = ['hill', 'teamHill'].includes(game.mode) ? `${BIOMES[game.terrain.type]?.name || 'ARENA'} • COLINA ${game.hill?.pointsToWin || 4} PTS • EVENTO ${eventCountdown}` : game.mode === 'survival' ? `MARÉ DE LAVA • PRÓXIMO NÍVEL ${game.survival?.nextLevel ?? '—'} • EVENTO ${eventCountdown}` : `${BIOMES[game.terrain.type]?.name || 'ARENA'} • NÍVEL ${arenaLevel} • EVENTO ${eventCountdown}`;
  if (game.debugMode) $('#arenaEvent').textContent = 'MODO TESTE • SEM EVENTOS AUTOMÁTICOS';
  $('#roundNumber').textContent = game.roundNumber || 1; $('#roundLimit').textContent = game.debugMode ? '∞' : game.roundLimit || room?.rules?.roundLimit || 20;
  $('#survivalForecast').hidden = game.mode !== 'survival'; if (game.mode === 'survival') $('#survivalNextLevel').textContent = `${game.survival?.nextLevel ?? '—'} ↓`;
  $('#hillStatus').hidden = !['hill', 'teamHill'].includes(game.mode); if (game.mode === 'hill') { const leader = [...game.players].sort((a, b) => (b.hillScore || 0) - (a.hillScore || 0))[0]; $('#hillValue').textContent = `${leader?.hillScore || 0}/${game.hill?.pointsToWin || 4}${game.hill?.contested ? ' ⚔' : ''}`; } else if (game.mode === 'teamHill') { const scores = Object.entries(game.hill?.teamScores || {}).sort((a, b) => b[1] - a[1]); $('#hillValue').textContent = `E${String(scores[0]?.[0] || '').split('-').at(-1)} ${scores[0]?.[1] || 0}/${game.hill?.pointsToWin || 4}${game.hill?.contested ? ' ⚔' : ''}`; }
  $('#scoreStrip').innerHTML = game.players.map((p) => `<div class="score-player ${p.alive ? '' : 'dead'}${p.id === playerId ? ' is-self' : ''}${game.players[game.turnIndex]?.id === p.id ? ' is-turn' : ''}" role="button" tabindex="0" data-player-id="${p.id}" data-team="${p.team || (p.isBot ? 'bots' : 'humans')}" style="--c:${p.color}" title="Consultar ${escapeHtml(CLASS_DEFS[p.classType]?.name || 'classe')} • ${escapeHtml(classPassiveStatus(p))}"><span><b>${game.mode === 'coop' ? (p.isBot ? '◆ ' : '◇ ') : ['teams', 'teamHill'].includes(game.mode) ? `[E${String(p.team).split('-').at(-1)}] ` : ''}${escapeHtml(p.nickname)}</b><i>${p.alive ? `${p.health} HP` : 'FORA'}</i></span><small>${p.classType ? `${CLASS_DEFS[p.classType]?.short}${p.classEvolutions?.length ? ` ↑${p.classEvolutions.length}` : ''} • ` : ''}${game.mode === 'hill' ? `◈ ${p.hillScore || 0}/${game.hill?.pointsToWin || 4} • ` : game.mode === 'teamHill' ? `◈ ${game.hill?.teamScores?.[p.team] || 0}/${game.hill?.pointsToWin || 4} • ` : ''}◆ ${p.stats?.destruction || 0}</small><div class="healthbar"><i style="width:${Math.max(0, Math.min(100, p.health / (p.maxHealth || 1) * 100))}%"></i></div></div>`).join('');
  ['#moveLeft', '#moveRight'].forEach((id) => $(id).disabled = !mine || (active?.fuel || 0) <= 0 && !((active?.buoyActive || active?.classType === 'amphibian' && !active?.teslaDisabledTurns) && active?.swimming) && selectedWeapon !== 'armoredDash' && !equippedPowers(active).includes('rocketDash')); updateFireButton(); $('#passButton').disabled = !mine;
  const me = game.players.find((player) => player.id === playerId);
  if (!mine || !me?.arsenal?.includes('mixer') || !MIXER_WEAPONS.includes(selectedWeapon) || mixerPartner && (me.ammo?.[mixerPartner] || 0) <= 0) { mixerArmed = false; mixerPartner = null; }
  const standardElement = me?.classType === 'elementalist' && game.players[game.turnIndex]?.id === me.id && me?.elementalCurrent && me?.elementalImprintTurn !== game.turnNumber && !me?.teslaDisabledTurns ? me.elementalCurrent : null;
  const standardElementArt = $('#standardElementArt');
  const standardWeapon = document.querySelector('.weapon[data-weapon="standard"]');
  standardElementArt.hidden = !standardElement;
  standardWeapon.classList.toggle('element-charged', Boolean(standardElement));
  if (standardElement) { standardElementArt.className = `standard-element-art atlas-art atlas-arsenal art-${standardElement}`; standardElementArt.setAttribute('style', atlasStyle(standardElement, 'arsenal')); standardWeapon.title = `Tiro padrão + ${ARSENAL_DEFS[standardElement]?.name || standardElement}`; }
  else standardWeapon.title = 'Tiro padrão: base 20–30, centro 50, cabeça 60–80 (crítico)';
  const classButton = $('#classActionButton'); const canUseClassAction = mine && !spectatorMode && !game.harpoonAnchor && !game.harpoonPull && me?.alive && me.teslaDisabledTurns <= 0;
  const fatalTarget = canUseClassAction && game.actions.attackAvailable && !(game.openingRestrictionsActive && game.roundNumber === 1) && me?.classType === 'ninja' && !game.shotEndsAt && (game.ninjaFatalStage?.activation || 0) < 2 ? true : false;
  const canRerollArsenal = canUseClassAction && backpackerRerollAvailable(game, me);
  classButton.hidden = !fatalTarget && !canRerollArsenal; classButton.disabled = !fatalTarget && !canRerollArsenal;
  classButton.dataset.action = fatalTarget ? 'ninjaFatal' : canRerollArsenal ? 'backpackerReroll' : '';
  classButton.dataset.targetId = '';
  classButton.innerHTML = fatalTarget ? `◆ CORTE FATAL <small>${game.ninjaFatalStage?.activation ? '2º' : '1º'} DASH • ${CLASS_BALANCE.ninjaFatalDamage} DANO • TOQUE NO MAPA</small>` : canRerollArsenal ? '▣ TROCAR ARSENAL <small>3 CARTAS ALEATÓRIAS • 1× NESTA RODADA</small>' : '';
  const destructionOwner = me || active; $('#destructionScore').textContent = destructionOwner?.stats?.destruction || 0; $('#destructionCard').title = `${destructionLegend}${destructionOwner?.classType === 'attacker' ? ` • ATACANTE: +50 por eliminação; Intervenção dos céus ${destructionOwner?.ammo?.megaCannon ? 'PRONTA' : `${destructionOwner?.megaCannonCharge || 0}/${megaCannonCost(destructionOwner?.megaCannonUses)}`}` : ''}`;
  const angleInput = $('#angle'); angleInput.min = String(aimMinimum()); if (aimMinimum() >= 5 && Number(angleInput.value) < 5) { angleInput.value = 5; $('#angleValue').textContent = '5°'; renderer.setAim({ angle: 5 }); } updateMobileAimReadout();
  $('#arsenalWeapons').innerHTML = (me?.arsenal || []).map((type) => { const info = ARSENAL_DEFS[type]; const count = type === 'superheat' ? `${me?.superheatEnemyTurns || 0}/2` : type === 'spider' && me?.spiderClimb ? '∞' : type === 'megaCannon' && !me?.ammo?.megaCannon ? `${me?.megaCannonCharge || 0}/${megaCannonCost(me?.megaCannonUses)}` : me?.ammo?.[type] || 0; const comboReady = type !== 'superheat' && (equippedPowers(me).some((power) => supportsWeaponCombo(power, type)) || (me?.airborne && type === 'armoredDash')); const cooling = type !== 'superheat' && !me?.ammo?.[type] && me?.arsenalLastUsed?.[type] != null && ARSENAL_COOLDOWN_TURNS[type]; const available = type === 'superheat' || (me?.ammo?.[type] || 0) > 0 || (type === 'spider' && me?.spiderClimb); return `<button class="weapon ${selectedWeapon === type ? 'active' : ''}${type === 'superheat' ? ' passive' : ''}${comboReady ? ' combo-ready' : ''}${cooling ? ' cooling' : available ? ' available' : ''}" data-weapon="${type}" title="${escapeHtml(combatDescription(type, info))}${comboReady ? ' COMBO DISPONÍVEL.' : ''}" style="--arsenal:${info.color};--arsenal-phase:${(performance.now() / 1000).toFixed(2)}"><i class="hud-arsenal-art atlas-art atlas-arsenal art-${type}" style="${atlasStyle(type, 'arsenal')}"></i><small>${info.short}</small><b>${count}</b></button>`; }).join('');
  const mixerButton = $('#arsenalWeapons [data-weapon="mixer"]');
  if (mixerButton) {
    const rounds = me?.mixerLastUsedRound == null ? 0 : Math.max(0, MIXER_COOLDOWN_ROUNDS - (game.roundNumber - me.mixerLastUsedRound));
    mixerButton.classList.add('passive', rounds ? 'cooling' : 'available');
    mixerButton.classList.toggle('mixer-active', mixerArmed || Boolean(mixerPartner));
    mixerButton.querySelector('b').textContent = rounds ? `${rounds}R` : mixerArmed ? '?' : mixerPartner ? '✓' : '✦';
    mixerButton.title += rounds ? ` Pronta em ${rounds} rodada(s).` : ' Selecione a arma principal, toque aqui, depois escolha a segunda arma.';
  }
  $('#arsenalWeapons [data-weapon="' + mixerPartner + '"]')?.classList.add('mixer-partner');
  if (me?.classType === 'ninja') $('#arsenalWeapons').insertAdjacentHTML('beforeend', `<button class="weapon ninja-fatal-weapon${fatalTarget ? ' available' : ''}" data-weapon="ninjaFatal" title="${escapeHtml(combatDescription('ninjaFatal', ARSENAL_DEFS.ninjaFatal))}" style="--arsenal:${ARSENAL_DEFS.ninjaFatal.color}"><i class="hud-arsenal-art atlas-art atlas-arsenal art-ninjaFatal" style="${atlasStyle('ninjaFatal', 'arsenal')}"></i><small>CORTE</small><b>${fatalTarget ? '!' : '—'}</b></button>`);
  const inventory = new Map(); for (const type of me?.inventory || []) inventory.set(type, (inventory.get(type) || 0) + 1);
  if (me?.shieldCharges > 0) inventory.set('shield', me.shieldCharges); if (me?.invisibleTurns > 0) inventory.set('invisibility', me.invisibleTurns);
  const powerupsBlocked = me?.powerupBlockedTurns > 0 || me?.teslaDisabledTurns > 0; const equipped = equippedPowers(me); $('.powerup-hud').classList.toggle('blocked', powerupsBlocked); $('.powerup-help b').textContent = powerupsBlocked ? 'PANE ELÉTRICA' : 'POWERUPS'; $('.powerup-help span').textContent = me?.teslaDisabledTurns > 0 ? 'SOMENTE MOVIMENTO ATÉ O PRÓXIMO TURNO' : powerupsBlocked ? 'BLOQUEADOS ATÉ O FIM DESTE TURNO' : 'TOQUE PARA COMBINAR • VÁRIOS PODEM FICAR ATIVOS';
  $('#inventoryBar').innerHTML = inventory.size ? [...inventory].map(([type, count]) => { const info = POWERUP_DEFS[type]; if (!info) return ''; const selectable = SELECTABLE_POWERUPS.has(type) && (me?.inventory || []).includes(type); const tag = selectable ? 'button' : 'span'; const selected = equipped.includes(type) ? ' selected' : ''; const attribute = selectable ? ` data-powerup="${type}"${powerupsBlocked ? ' disabled' : ''}` : ''; return `<${tag} class="powerup-chip${selected}"${attribute} style="--item:${info.color}" title="${escapeHtml(combatDescription(type, info))}"><span class="inventory-art atlas-art atlas-powerups art-${type}" style="${atlasStyle(type, 'powerups')}"></span><b>${info.short}</b><span>${info.name}</span><em>×${count}</em>${selected ? '<i>EQUIPADO</i>' : ''}</${tag}>`; }).join('') : '<i>nenhum item ativo</i>';
  [...document.querySelectorAll('#arsenalWeapons .weapon:not([data-weapon="ninjaFatal"])')].slice(0, 4).forEach((button, index) => button.insertAdjacentHTML('beforeend', `<kbd class="shortcut-key">${'QERT'[index]}</kbd>`));
  document.querySelector('#arsenalWeapons [data-weapon="ninjaFatal"]')?.insertAdjacentHTML('beforeend', '<kbd class="shortcut-key">C</kbd>');
  [...document.querySelectorAll('#inventoryBar [data-powerup]')].slice(0, 10).forEach((button, index) => button.insertAdjacentHTML('beforeend', `<kbd class="shortcut-key">${index === 9 ? '0' : index + 1}</kbd>`));
  $$('.weapon').forEach((button) => { const type = button.dataset.weapon; const movement = ARSENAL_DEFS[type]?.kind === 'movement'; const passive = type === 'superheat'; const reactive = REACTIVE_ARSENAL_ITEMS.includes(type); const count = type === 'standard' || (type === 'spider' && me?.spiderClimb) ? Infinity : me?.ammo?.[type] || 0; const openingLocked = game.openingRestrictionsActive && game.roundNumber === 1 && type !== 'standard' && !movement && !passive && !reactive; const lacksAction = !reactive && (movement ? game.actions.movesLeft <= 0 : !game.actions.attackAvailable); button.disabled = passive ? !me : (!mine && !reactive) || !me?.alive || me?.teslaDisabledTurns > 0 || openingLocked || lacksAction || count <= 0; button.title += openingLocked ? ' Libera na rodada 2.' : reactive ? ' Pode ser ativada em qualquer turno.' : ''; });
  if (mixerButton) mixerButton.disabled = !mine || !me?.alive || me.teslaDisabledTurns > 0 || game.openingRestrictionsActive && game.roundNumber === 1 || me.mixerLastUsedRound != null && game.roundNumber - me.mixerLastUsedRound < MIXER_COOLDOWN_ROUNDS;
  const ninjaCard = $('#arsenalWeapons [data-weapon="ninjaFatal"]'); if (ninjaCard) ninjaCard.disabled = !fatalTarget;
  if (me?.teslaDisabledTurns > 0) selectedWeapon = 'standard';
  if (me?.spiderClimb && selectedWeapon === 'spider') selectedWeapon = 'standard';
  if (selectedWeapon && selectedWeapon !== 'standard' && selectedWeapon !== 'ninjaFatal' && (!me?.arsenal?.includes(selectedWeapon) || ((me?.ammo?.[selectedWeapon] || 0) <= 0 && !(selectedWeapon === 'spider' && me?.spiderClimb) && !(selectedWeapon === 'jump' && me?.airborne)))) selectedWeapon = 'standard';
  if (selectedWeapon === 'ninjaFatal' && !fatalTarget && !game.shotEndsAt) { selectedWeapon = 'standard'; renderer.setNinjaFatalTarget(null); }
  $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === selectedWeapon)); updateFireButton();
  requestAnimationFrame(refreshArsenalPicker);
  for (const button of $$('.weapon')) {
    const type = button.dataset.weapon;
    if (type === 'harpoon' && harpoonReady()) { button.disabled = false; button.classList.add('active'); button.querySelector('b').textContent = 'CABO'; }
    else if (!(me?.ammo?.[type] > 0) && ARSENAL_COOLDOWN_TURNS[type] && me?.arsenalLastUsed?.[type] != null) button.querySelector('b').textContent = `${Math.max(1, ARSENAL_COOLDOWN_TURNS[type] - (me.turnsPlayed || 0) + me.arsenalLastUsed[type])}T`;
  }
  renderer.setMovementMode(selectedWeapon || 'standard');
  updateComboPreview();
  refreshAimCoach();
  if (newOwnTurn) { $('#turnBanner').classList.remove('show'); void $('#turnBanner').offsetWidth; $('#turnBanner').classList.add('show'); renderer.setAim({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection, visible: true }); audio.turn(); mobileVibrate(16); }
  lastTurn = game.turnNumber;
}

function renderResult() {
  const me = game.players.find((player) => player.id === playerId); const coopVictory = game.mode === 'coop' && game.winningTeam === 'humans'; const teamVictory = ['teams', 'teamHill'].includes(game.mode) && me?.team === game.winningTeam; const personalVictory = game.winner === playerId || coopVictory || teamVictory;
  if (!resultSoundPlayed) { audio.victory(personalVictory); resultSoundPlayed = true; }
  screen('resultScreen'); const winner = game.players.find((p) => p.id === game.winner); const teamNumber = String(game.winningTeam || '').split('-').at(-1); $('#winnerName').textContent = game.mode === 'coop' ? (coopVictory ? 'MISSÃO CUMPRIDA!' : 'EQUIPE ELIMINADA') : game.mode === 'teamHill' && game.finishedByObjective ? `EQUIPE ${teamNumber} DOMINOU!` : game.mode === 'teams' || game.mode === 'teamHill' ? (game.winningTeam ? `EQUIPE ${teamNumber} VENCEU!` : 'EMPATE') : game.mode === 'survival' && game.winner === playerId ? 'VOCÊ SOBREVIVEU!' : game.mode === 'hill' && game.finishedByObjective ? (winner?.id === playerId ? 'COLINA CONQUISTADA!' : `${winner?.nickname || 'TANQUE'} DOMINOU A COLINA`) : winner?.id === playerId ? 'VITÓRIA!' : winner ? `${winner.nickname} VENCEU` : 'EMPATE';
  $('#winnerSubtitle').textContent = `${game.finishedByObjective ? `Objetivo concluído: ${game.hill?.pointsToWin || 4} pontos de controle da colina.` : game.finishedByRounds ? `Limite de ${game.roundLimit} rodadas atingido. Resultado definido por ${['hill', 'teamHill'].includes(game.mode) ? 'controle da colina, ' : ''}vida, dano e destruição.` : game.mode === 'coop' ? (coopVictory ? 'Os comandantes humanos derrotaram todos os bots.' : 'Os bots dominaram a arena.') : ['teams', 'teamHill'].includes(game.mode) ? (teamVictory ? 'Sua equipe foi a última com tanques em combate.' : 'A última equipe sobrevivente dominou a arena.') : game.mode === 'survival' ? (winner ? 'Resistiu à lava ascendente e foi o último tanque de pé.' : 'A maré de lava eliminou todos os tanques.') : winner ? 'Foi o último tanque de pé.' : 'Nenhum tanque sobreviveu.'} Semente do mapa: ${game.seed}.`;
  const standings = game.finalStandings || game.players.map((p) => ({ playerId: p.id, score: 0 })); const ranked = standings.map((standing) => ({ ...game.players.find((p) => p.id === standing.playerId), finalScore: standing.score, eliminations: standing.eliminations || 0 })); const top = ranked[0];
  const reasonLabels = { roundLimit: 'LIMITE DE RODADAS', objective: 'OBJETIVO CONCLUÍDO', lastTank: 'ÚLTIMO TANQUE', lastSurvivor: 'ÚLTIMO SOBREVIVENTE', teamElimination: 'EQUIPE SOBREVIVENTE', mutualDestruction: 'DESTRUIÇÃO MÚTUA' };
  $('#resultSummary').innerHTML = `<span><small>DECISÃO</small><b>${reasonLabels[game.endReason] || 'FIM DE COMBATE'}</b></span><span><small>MVP</small><b>${escapeHtml(top?.nickname || '—')}</b></span><span><small>RODADAS</small><b>${game.roundNumber || 1}/${game.roundLimit}</b></span>`;
  $('#ranking').innerHTML = `<div class="rank-head"><span>POS.</span><span>COMANDANTE</span><span>PLACAR</span><span>COMBATE</span></div>${ranked.map((p, i) => `<div class="rank-row${p.id === game.winner ? ' winner' : ''}" style="--rank-color:${p.color}"><b>#${i + 1}</b><span><i style="background:${p.color}"></i>${escapeHtml(p.nickname)}<small>${p.alive ? `${p.health} HP` : 'ELIMINADO'}</small></span><strong>${p.finalScore}</strong><span>${p.eliminations || 0} KOs • ${p.stats?.damage || 0} DANO • ${p.stats?.destruction || 0} DEST.</span></div>`).join('')}`;
  $('#rematchButton').hidden = playerId !== room.hostId;
}

setInterval(() => {
  audio.updateAmbient(game && $('#gameScreen').classList.contains('active') ? { game, camera: renderer.camera, viewportWidth: renderer.canvas.width, viewportHeight: renderer.canvas.height, terrainHeights: renderer.terrainHeights, objects: renderer.visualObjects, now: gameNow() } : null);
  if (!game) return;
  if (game.phase === 'playing') { const seconds = game.paused ? 'Ⅱ' : Math.max(0, Math.ceil((game.turnEndsAt - gameNow()) / 1000)); $('#turnTimer').textContent = seconds; $('#turnTimer').classList.toggle('urgent', !game.paused && seconds <= 5); const offer = game.players.find((player) => player.id === playerId)?.rewardOffer; if (offer && !game.paused) $('#rewardCountdown').textContent = Math.max(0, Math.ceil((offer.expiresAt - gameNow()) / 1000)); updateFireButton(); }
  if (game.debugMode && game.phase === 'playing' && game.players[game.turnIndex]?.id === playerId) { $('#turnTimer').textContent = '∞'; $('#turnTimer').classList.remove('urgent'); }
  if (game.phase === 'class' || game.phase === 'arsenal') $('#arsenalCountdown').textContent = Math.max(0, Math.ceil(((game.phase === 'class' ? game.classEndsAt : game.arsenalEndsAt) - gameNow()) / 1000));
}, 200);
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
net.connect();
