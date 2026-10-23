import crypto from 'node:crypto';
import { ARSENAL_COOLDOWN_TURNS, ARSENAL_DEFS, ARSENAL_ITEMS, ATTACKER_ELIMINATION_BONUS, CLASS_BALANCE, CLASS_DEFS, CLASS_EVOLUTIONS, CLASS_POWERUP_SYNERGY, CLASS_POWERUP_WEIGHT, CLASS_STATS, classEvolutionRounds, CLUSTER_CAPSULE_SPEED, COLLECTIBLE_ITEMS, DEFAULT_ARSENAL, DEFAULT_RULES, DESTRUCTION_POINTS, ELEMENTAL_BOMBS, EVENT_DEFS, GAME_TIMING, HILL_RULES, MAP_STRUCTURE_BALANCE, MEGA_BOMB, megaCannonCost, MIXER_COOLDOWN_ROUNDS, MIXER_WEAPONS, NATIVE_MINE_DAMAGE, POWERUPS, REACTIVE_ARSENAL_ITEMS, SELECTABLE_ARSENAL_ITEMS, SHOT_PATH_RATE, SUPERHEAT, TEAM_COLORS, TREE_BALANCE, VECTOR_FLIGHT_RATE, WEAPON_BALANCE, WORLD, clamp, survivalLavaLevel } from '../shared/constants.js';
import { advanceFlowLake, carveFloodBasin, disturbWaterAt, ensureAirPockets, equalizeConnectedLakes, estimateLakeVolume, lakeHasBreach, LAKE_DRAIN_MS, swimmableWaterSurface, waterDepthAt, waterSurfaceAt } from '../shared/flood.js';
import { seededRandom } from './random.js';
import { carveTerrain, findSpawns, generateTerrain, movingPlatformX, terrainY } from './terrain.js';
import { applyExplosion, impartTankMomentum, interruptTankControl, settlePlayers, settleScenarioObjects, simulateBouncingGrenade, simulateHarpoon, simulateMarkerBomb, simulateShot, simulateVectorShot } from './physics.js';
import { DRIVE, blinkLanding, driveStats, jumpTargetTrajectory, launcherDestination, movementDistance, resolveTankFootprint, safeGroundAt, specialMovePath, spiderLeapTarget, walkPath } from '../shared/movement.js';
import { BIOMES } from '../shared/biomes.js';
import { playableWidth } from '../shared/map-layout.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';
import { backpackerRerollAvailable, ninjaFatalPath, ninjaFatalTarget } from '../shared/class-actions.js';
import { refreshTankStates, tankMotionState, TANK_STATE } from '../shared/tank-states.js';
import { fallDamage } from '../shared/fall-damage.js';

const SELECTABLE_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'excavator', 'armorPiercer', 'shockwave', 'bunkerBuster', 'rocketDash', 'lightningStep', 'bridgeKit', 'molotov', 'laser', 'mirror', 'trickster', 'salvageHeal']);
const BACKPACKER_PASSIVES = new Set(['shield', 'movementBoost', 'invisibility', 'extraLife']);
const ROD_COMBO_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'armorPiercer', 'bridgeKit', 'molotov', 'mirror']);
const TRICK_SHOT_COMBOS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'mirror']);
const SUPPLY_LOOTBOX_CHANCE = 18;
const VERTICAL_MODE = Symbol('verticalMode');
const CLUSTER_MODE = Symbol('clusterMode');
const FIREWORKS_MODE = Symbol('fireworksMode');

export function createGame(room, skipPreparation = false) {
  const seed = room.mapSeed || room.rules.seed || crypto.randomInt(100000, 999999);
  const terrain = generateTerrain(seed, room.mapTypeResolved || room.rules.mapType, room.players.length);
  const spawns = findSpawns(terrain, room.players.length);
  const activeTeamCount = Math.max(2, Math.min(room.rules.teamCount || 2, room.players.length));
  const teamMode = ['teams', 'teamHill'].includes(room.rules.gameMode);
  if (teamMode || room.rules.gameMode === 'coop') {
    // Keep each team inside its own horizontal territory, while varying the
    // exact safe pads within that territory from match to match.
    const teamKeys = teamMode ? Array.from({ length: activeTeamCount }, (_, index) => `team-${index + 1}`) : ['humans', 'bots'];
    const belongsTo = (player, index) => teamMode ? `team-${index % activeTeamCount + 1}` : player.isBot ? 'bots' : 'humans';
    const assigned = Array(spawns.length); let cursor = 0;
    for (const key of teamKeys) {
      const members = room.players.map((player, index) => belongsTo(player, index) === key ? index : -1).filter((index) => index >= 0);
      const territory = spawns.slice(cursor, cursor + members.length); cursor += members.length;
      // Frontline classes take safe pads nearer the opposing territory, while
      // glass-cannon classes start behind them. Shuffle ties, not the roles.
      for (let index = territory.length - 1; index > 0; index -= 1) { const swap = crypto.randomInt(index + 1); [territory[index], territory[swap]] = [territory[swap], territory[index]]; }
      const opposing = spawns.filter((spawn) => !territory.includes(spawn));
      const distanceToEnemy = (spawn) => Math.min(...opposing.map((other) => Math.abs(spawn.x - other.x)));
      territory.sort((a, b) => distanceToEnemy(a) - distanceToEnemy(b));
      members.sort((a, b) => (CLASS_STATS[room.rules.classesEnabled ? room.players[b].classType : null]?.frontline || 0) - (CLASS_STATS[room.rules.classesEnabled ? room.players[a].classType : null]?.frontline || 0));
      members.forEach((playerIndex, index) => { assigned[playerIndex] = territory[index]; });
    }
    spawns.splice(0, spawns.length, ...assigned);
  } else {
    // Free-for-all still varies which player owns each safe pad.
    for (let index = spawns.length - 1; index > 0; index -= 1) { const swap = crypto.randomInt(index + 1); [spawns[index], spawns[swap]] = [spawns[swap], spawns[index]]; }
  }
  const playerClass = (player) => room.rules.classesEnabled && CLASS_DEFS[player.classType] ? player.classType : null;
  const playerArsenal = (player) => { const arsenal = (player.arsenal || DEFAULT_ARSENAL).filter((type) => !['megaCannon', 'lightningRod', 'waterCannon'].includes(type)); if (playerClass(player) === 'saboteur' && !arsenal.includes('teslaOrb')) arsenal.push('teslaOrb'); if (playerClass(player) === 'amphibian') arsenal.push('waterCannon'); if (playerClass(player) === 'elementalist') for (const type of ELEMENTAL_BOMBS) if (!arsenal.includes(type)) arsenal.push(type); return arsenal; };
  const players = room.players.map((p, i) => ({
    id: p.id, nickname: p.nickname, color: ['teams', 'teamHill'].includes(room.rules.gameMode) ? TEAM_COLORS[i % activeTeamCount] : room.rules.gameMode === 'coop' ? TEAM_COLORS[p.isBot ? 1 : 0] : p.color, x: spawns[i].x, y: spawns[i].y,
    health: room.rules.health + (CLASS_STATS[playerClass(p)]?.health || 0), maxHealth: room.rules.health + (CLASS_STATS[playerClass(p)]?.health || 0), alive: true, connected: p.connected, isBot: Boolean(p.isBot), personality: p.isBot ? p.personality || 'aggressive' : null, team: ['teams', 'teamHill'].includes(room.rules.gameMode) ? `team-${i % activeTeamCount + 1}` : p.isBot ? 'bots' : 'humans', classType: playerClass(p),
    facing: spawns[i].x < playableWidth(terrain) / 2 ? 1 : -1, inventory: [], buoyActive: false, extraFuelStacks: 0, elementalCurrent: playerClass(p) === 'elementalist' ? 'elementalFire' : null, fuel: driveStats({ classType: playerClass(p) }).maxFuel, lastDriveAt: 0, selectedPowerup: null, selectedPowerups: [], rewardOffer: null, turnsPlayed: 0, superheatEnemyTurns: 0, hillScore: 0, classEvolutions: [], pendingClassEvolutions: 0, arsenalOffer: [...(p.arsenalOffer || SELECTABLE_ARSENAL_ITEMS)], arsenal: playerArsenal(p), ammo: Object.fromEntries(playerArsenal(p).map((type) => [type, type === 'superheat' || playerClass(p) === 'elementalist' && ELEMENTAL_BOMBS.includes(type) && type !== 'elementalFire' ? 0 : 1])), arsenalLastUsed: {}, lastBackpackerRerollRound: 0, megaCannonCharge: 0, megaCannonUses: 0, shield: false, shieldCharges: 0, armorFractureTurns: 0, frozenTurns: 0, powerupBlockedTurns: 0, teslaDisabledTurns: 0, invisibleTurns: 0, invisibilityFresh: false, ninjaFirstCloakActivated: false, ninjaOtherTurnsWaited: 0, lastNinjaRevealTurn: 0, regenTurns: 0, airborne: null, wallClinging: null, ceilingClinging: null, surfaceClinging: null, spiderMoves: 0, spiderClimb: false, lastPickup: null, lastLaunch: null, lastAirBoost: null, lastSafeX: spawns[i].x, lastSafeY: spawns[i].y, graveRecorded: false, supportPlatformId: spawns[i].supportPlatformId || null, platformOffset: spawns[i].platformOffset ?? null, lastDamageRound: 0, lastClassRound: 0, stats: { damage: 0, shots: 0, destruction: 0, destroyed: {} },
  }));
  for (const player of players) if (player.arsenal.includes('mixer')) player.ammo.mixer = 0;
  const rand = seededRandom(`${seed}-items`);
  const validX = () => {
    if (terrain.type === 'skylands') { const island = terrain.floatingPlatforms.filter((platform) => platform.kind === 'skyIsland')[Math.floor(rand() * 4)]; return island.x + 28 + rand() * (island.width - 56); }
    if (terrain.platforms?.length && rand() < .72) {
      const platform = terrain.platforms[Math.floor(rand() * terrain.platforms.length)];
      return platform.x + 15 + rand() * Math.max(1, platform.width - 30);
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = 70 + rand() * (terrain.arenaWidth - 140);
      if (safeGroundAt(terrain, candidate)) return candidate;
    }
    return terrain.arenaWidth / 2;
  };
  const enabledCollectibles = COLLECTIBLE_ITEMS.filter((type) => room.rules.enabledPowerups.includes(type));
  const powerups = Array.from({ length: enabledCollectibles.length ? room.rules.powerupCount : 0 }, (_, i) => {
    const x = validX(); const support = terrain.type === 'skylands' ? terrain.floatingPlatforms.find((platform) => platform.kind === 'skyIsland' && x >= platform.x && x <= platform.x + platform.width) : null; const surface = support?.y ?? terrainY(terrain, x); const buriedY = support ? surface - 13 : surface + 16 + Math.round(rand() * 22);
    return { id: `p${i}`, type: enabledCollectibles[Math.floor(rand() * enabledCollectibles.length)], x, y: buriedY, buriedY, revealed: Boolean(support), active: Boolean(support), supportPlatformId: support?.id || null };
  });
  const mines = room.rules.mines ? Array.from({ length: Math.max(2, Math.floor(room.players.length * 1.5)) }, (_, i) => {
    const x = validX();
    const support = terrain.type === 'skylands' ? terrain.floatingPlatforms.find((platform) => platform.kind === 'skyIsland' && x >= platform.x && x <= platform.x + platform.width) : null;
    return { id: `m${i}`, x, y: (support?.y ?? terrainY(terrain, x)) - 3, active: true, supportPlatformId: support?.id || null, platformOffset: support ? x - support.x : null };
  }) : [];
  const objects = createScenarioObjects(terrain, spawns, rand);
  const now = Date.now();
  const game = {
    phase: skipPreparation ? 'roulette' : room.rules.classesEnabled ? 'class' : 'arsenal', training: Boolean(room.rules.training), mode: room.rules.gameMode, teamCount: ['teams', 'teamHill'].includes(room.rules.gameMode) ? activeTeamCount : null, friendlyFire: Boolean(room.rules.friendlyFire), enabledEvents: room.rules.enabledEvents, enabledPowerups: room.rules.enabledPowerups, seed, gravity: room.rules.gravity, speed: room.rules.gameSpeed, wind: windForTurn(seed, 1), terrain, players, powerups, mines, platformEpoch: now, classEndsAt: skipPreparation ? null : room.rules.classesEnabled ? now + GAME_TIMING.classMs : null, turnIndex: 0, turnNumber: 1,
    roundNumber: 1, roundLimit: room.rules.roundLimit, roundParticipants: players.map((player) => player.id), roundCompleted: [], hill: ['hill', 'teamHill'].includes(room.rules.gameMode) ? { ...findHillZone(terrain), teamScores: Object.fromEntries([...new Set(players.map((player) => player.team))].map((team) => [team, 0])), lastCaptureTeam: null } : null, lavaLevel: WORLD.height - 24, survival: room.rules.gameMode === 'survival' ? { lastRise: null, nextLevel: survivalLavaLevel(2, room.rules.roundLimit) } : null, eruptionCount: 0,
    arsenalEndsAt: now + (room.rules.classesEnabled ? GAME_TIMING.classMs : 0) + GAME_TIMING.arsenalMs, rouletteStartedAt: null, rouletteSpinEndsAt: null, rouletteEndsAt: null, rouletteSequence: [], rouletteWinnerIndex: null, turnEndsAt: null,
    actions: { movesLeft: 2, attackAvailable: true }, winner: null, winningTeam: null, paused: false, pausedAt: null, botSpeed: 1, events: [], objects, graves: [], fireZones: [], waterZones: terrain.initialWaterZones.map((zone) => ({ ...zone, fluid: true, fluidVolume: estimateLakeVolume(terrain, zone) })), platformWaterFlows: [], iceZones: [], windVortices: [], gravityWells: [], waterCannonStreams: [], lastWaterCannonHits: [], mineDetonations: [], weatherClouds: players.filter((player) => player.classType === 'meteorologist').map((player) => ({ id: `weather-cloud-${player.id}`, ownerId: player.id, x: player.x, y: Math.max(85, player.y - 185), radius: CLASS_BALANCE.meteorologistCloudRadius, activatedTurn: 1, turn: 0, lastStrike: null })), lastWeatherCloudDispersals: [], weather: null, weatherSequence: null, arenaEventSerial: 0, lastArenaEventRound: 0, delayedStrikes: [], soapBubbles: [], soapPops: [], bomberDetonations: [], bomberGrenades: [], bomberGrenadeImpacts: [], bomberVictoryAt: null, harpoonAnchor: null, harpoonPull: null, interactionSerial: 0, pickupSerial: 0, pickupAttractions: [], classPulseSerial: 0, lastClassPulses: [], rodPulseSerial: 0, lastRodPulse: null, sentryPulseSerial: 0, lastSentryPulse: null, specialistPulseSerial: 0, saboteurPulseSerial: 0, lastNinjaStrike: null, lastSuperheatPulse: null, lastSuperheatPulses: [], shotEndsAt: null, pendingShot: null, botActAt: null, arenaEventReadyAt: null, lastBattleAnimationUntil: 0,
  };
  game.pendingWaterCannonBoost = null;
  if (skipPreparation) beginRoulette(game, now);
  return game;
}

function beginRoulette(game, now) {
  const random = seededRandom(`${game.seed}-first-player`); const eligible = game.players.map((_, index) => index); const winnerIndex = eligible[Math.floor(random() * eligible.length)];
  const sequence = Array.from({ length: 18 }, () => eligible[Math.floor(random() * eligible.length)]); sequence.push(winnerIndex);
  game.rouletteWinnerIndex = winnerIndex; game.rouletteSequence = sequence; game.rouletteStartedAt = now; game.rouletteSpinEndsAt = now + GAME_TIMING.rouletteSpinMs; game.rouletteEndsAt = now + GAME_TIMING.matchStartMs; game.phase = 'roulette';
}

export function publicGame(game, viewerId = null) {
  refreshTankStates(game);
  const players = game.players.map((player) => player.alive && player.id !== viewerId && (player.invisibleTurns > 0 || (game.lastNinjaStrike?.sourceId === player.id && game.lastNinjaStrike.concealed && !game.lastNinjaStrike.revealComplete))
    ? { ...player, x: null, y: null, lastSafeX: null, lastSafeY: null, platformOffset: null, supportPlatformId: null, airborne: null, wallClinging: null, ceilingClinging: null, surfaceClinging: null, lastMove: null, lastLaunch: null, lastAirBoost: null, lastLanding: null, lastBlink: null, lastJump: null, lastPickup: null, lastRevive: null, lastSalvage: null, lastDestruction: null, hidden: true }
    : { ...player, hidden: false });
  const nextEventRound = game.roundNumber % 2 === 0 && game.lastArenaEventRound !== game.roundNumber ? game.roundNumber : game.roundNumber + (2 - game.roundNumber % 2);
  const estimatedTurns = Math.max(0, (nextEventRound - game.roundNumber) * Math.max(1, game.roundParticipants?.length || game.players.length));
  const rodForecast = game.phase === 'playing' && (game.objects || []).some((object) => object.type === 'lightningRod' && object.active) && game.enabledEvents?.length
    ? { type: eventTypeForRound(game, nextEventRound, seededRandom(`${game.seed}-arena-round-${nextEventRound}`)), turnsUntil: estimatedTurns, round: nextEventRound }
    : null;
  const ninjaFatalStage = game.ninjaFatalStage?.playerId === viewerId ? game.ninjaFatalStage : game.ninjaFatalStage ? { playerId: game.ninjaFatalStage.playerId, activation: game.ninjaFatalStage.activation } : null;
  return { ...game, players, ninjaFatalStage, rodForecast, terrain: { ...game.terrain, heights: game.terrain.heights }, serverTime: Date.now() };
}

function currentPlayer(game) { return game.players[game.turnIndex]; }
function activeClass(player) { return player?.teslaDisabledTurns > 0 ? null : player?.classType; }
function usesTeams(game) { return ['coop', 'teams', 'teamHill'].includes(game.mode); }
function areAllies(game, first, second) { return Boolean(first && second && first.id !== second.id && usesTeams(game) && first.team === second.team); }
function protectedAlly(game, first, second) { return areAllies(game, first, second) && !game.friendlyFire; }
function directDamage(source, target, amount, explosive = false) { const attackerBonus = activeClass(source) === 'attacker' ? 20 + Math.round((target?.maxHealth || 0) * CLASS_BALANCE.attackerMaxHealthDamage) : 0; const evolutionBonus = source && source.id !== target?.id && !source.teslaDisabledTurns ? (source.classEvolutions || []).filter((type) => type === 'overdrive').length * CLASS_EVOLUTIONS.overdrive.damage : 0; let result = amount + attackerBonus + evolutionBonus - (activeClass(source) === 'armored' ? 10 : 0) + (activeClass(source) === 'bomber' && explosive ? CLASS_BALANCE.bomberDamage : 0); if (activeClass(target) === 'bomber' && explosive) result -= CLASS_BALANCE.bomberResistance; if (target?.armorAuraActive && !target.teslaDisabledTurns) result *= 1 - CLASS_BALANCE.armoredPulseReduction; return Math.max(0, Math.round(result)); }
function reflectDirectDamage(game, target, source, amount) { if (!source?.alive || source.id === target.id || !amount || !(target.splitDamageUntilRound >= game.roundNumber)) return; const reflected = Math.ceil(amount * .5); source.health = Math.max(0, source.health - reflected); source.alive = source.health > 0; source.lastDamageRound = game.roundNumber; source.lastDamageSourceId = target.id; source.lastDamageTurn = game.turnNumber; game.interactionSerial += 1; target.lastSplitReflection = { serial: game.interactionSerial, x: target.x, y: target.y, toX: source.x, toY: source.y, amount: reflected }; }

function revealNinja(game, player, reason) {
  if (player?.classType !== 'ninja') return;
  // Attacking resets the passive stealth timer. A concealed shot exposes only
  // the fixed firing point, never the tank's later coordinates.
  player.lastNinjaRevealRound = game.roundNumber;
  player.lastNinjaRevealTurn = game.turnNumber;
  player.ninjaOtherTurnsWaited = 0;
  if (reason === 'shot') {
    if (player.invisibleTurns <= 0) return;
    game.interactionSerial += 1;
    player.lastNinjaReveal = { serial: game.interactionSerial, x: player.x, y: player.y, reason: 'ghost', expiresRound: game.roundNumber + 2 };
    return;
  }
  if (reason === 'arsenal') return;
  if (player.invisibleTurns <= 0) return;
  player.invisibleTurns = 0; player.invisibilityFresh = false;
  game.interactionSerial += 1;
  player.lastNinjaReveal = { serial: game.interactionSerial, x: player.x, y: player.y, reason };
}

export function ninjaFatal(room, playerId, targetId, targetPoint = null) {
  const game = room.game; const ninja = currentPlayer(game);
  if (game?.phase !== 'playing' || ninja?.id !== playerId) throw new Error('O corte fatal só pode ser usado no seu turno.');
  if (activeClass(ninja) !== 'ninja') throw new Error('O corte fatal é exclusivo do Ninja e não funciona sob Tesla.');
  if (game.openingRestrictionsActive && game.roundNumber === 1) throw new Error('O Corte Fatal libera na segunda rodada.');
  if (game.arenaWarningUntil > Date.now() || game.shotEndsAt || game.harpoonAnchor || game.harpoonPull) throw new Error('Aguarde a ação atual terminar.');
  if (!game.actions.attackAvailable) throw new Error('O ataque deste turno já foi usado.');
  updateMovingPlatforms(game);
  const path = ninjaFatalPath(game, ninja, targetId, targetPoint);
  if (!path) throw new Error('Escolha uma direção de corte com destino livre dentro do alcance.');
  const fromX = ninja.x; const fromY = ninja.y;
  const hits = [];
  for (const target of path.hits) {
    const previousHealth = target.health;
    // Fatal Slash pierces shields, passive armor pulses and class resistance.
    target.health = Math.max(0, target.health - CLASS_BALANCE.ninjaFatalDamage); target.alive = target.health > 0;
    const damage = previousHealth - target.health;
    reflectDirectDamage(game, target, ninja, damage);
    target.lastDamageSourceId = ninja.id; target.lastDamageTurn = game.turnNumber; target.lastDamageRound = game.roundNumber;
    ninja.stats.damage += damage;
    hits.push({ playerId: target.id, x: target.x, y: target.y, damage, eliminated: !target.alive });
  }
  ninja.facing = path.toX >= fromX ? 1 : -1;
  ninja.x = clamp(path.toX, 16, WORLD.width - 16); ninja.y = path.toY; ninja.supportPlatformId = null; ninja.platformOffset = null; ninja.wallClinging = null; ninja.ceilingClinging = null; ninja.surfaceClinging = null;
  const landingY = terrainY(game.terrain, ninja.x) - WORLD.tankRadius;
  if (!ninja.airborne && safeGroundAt(game.terrain, ninja.x) && Math.abs(landingY - ninja.y) < 34) ninja.y = landingY;
  else ninja.airborne = { vx: ninja.facing * 45, vy: Math.max(0, ninja.airborne?.vy || 0), falling: true, startY: ninja.y, minY: ninja.y, updatedAt: Date.now() };
  ninja.lastSafeX = ninja.x; ninja.lastSafeY = ninja.y;
  const concealed = ninja.invisibleTurns > 0;
  // The strike resets the passive stealth timer, but does not expose a Ninja
  // who was already cloaked. Opponents only receive the slash coordinates.
  ninja.lastNinjaRevealRound = game.roundNumber;
  ninja.lastNinjaRevealTurn = game.turnNumber;
  ninja.ninjaOtherTurnsWaited = 0;
  const activation = (game.ninjaFatalStage?.playerId === ninja.id ? game.ninjaFatalStage.activation : 0) + 1;
  game.ninjaFatalStage = activation < 2 ? { playerId: ninja.id, activation, returnX: game.ninjaFatalStage?.returnX ?? fromX, returnY: game.ninjaFatalStage?.returnY ?? fromY } : null;
  game.actions.attackAvailable = false; game.actions.movesLeft = 0;
  const now = Date.now(); game.interactionSerial += 1;
  game.lastNinjaStrike = { serial: game.interactionSerial, sourceId: ninja.id, targetId: path.target?.id || null, activation, fromX, fromY, toX: ninja.x, toY: ninja.y, hitX: path.target?.x ?? ninja.x, hitY: path.target?.y ?? ninja.y, hits, damage: hits.reduce((sum, hit) => sum + hit.damage, 0), startedAt: now, concealed, revealComplete: !concealed };
  const splitEnd = hits.some((hit) => hit.eliminated) ? CLASS_BALANCE.ninjaFatalSplitMs + 2800 : 0;
  game.lastBattleAnimationUntil = now + Math.max(CLASS_BALANCE.ninjaFatalDurationMs, splitEnd);
  game.shotEndsAt = game.lastBattleAnimationUntil; game.pendingShot = { shooterId: ninja.id, weapon: 'ninjaFatal', activation };
  recordEliminations(game);
  return game.lastNinjaStrike;
}

export function rerollBackpackerArsenal(room, playerId) {
  const game = room.game; const player = currentPlayer(game);
  if (player?.id !== playerId || !backpackerRerollAvailable(game, player)) throw new Error('O Mochileiro só pode trocar o arsenal uma vez nas rodadas 3, 6, 9…');
  if (game.shotEndsAt || game.harpoonAnchor || game.harpoonPull || game.arenaWarningUntil > Date.now()) throw new Error('Aguarde a ação atual terminar.');
  const shots = SELECTABLE_ARSENAL_ITEMS.filter((type) => ARSENAL_DEFS[type].kind === 'shot');
  const movement = SELECTABLE_ARSENAL_ITEMS.filter((type) => ARSENAL_DEFS[type].kind === 'movement');
  const choose = (pool, count) => { const remaining = [...pool]; return Array.from({ length: count }, () => remaining.splice(crypto.randomInt(remaining.length), 1)[0]); };
  const previous = [...player.arsenal]; let choices;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    choices = [...choose(shots, 2), ...choose(movement, 1)];
    if (!choices.every((type) => previous.includes(type)) || previous.length !== 3) break;
  }
  if (choices.every((type) => previous.includes(type)) && previous.length === 3) choices[0] = shots.find((type) => !previous.includes(type));
  player.arsenal = choices; player.ammo = Object.fromEntries(choices.map((type) => [type, ['superheat', 'mixer'].includes(type) ? 0 : 1])); player.superheatEnemyTurns = 0; player.mixerLastUsedRound = null; player.arsenalLastUsed = {};
  player.lastBackpackerRerollRound = game.roundNumber;
  game.interactionSerial += 1;
  player.lastBackpackerReroll = { serial: game.interactionSerial, round: game.roundNumber, previous, choices: [...choices] };
  return player.lastBackpackerReroll;
}

export function chooseClassEvolution(room, playerId, type) {
  const game = room.game; const player = game?.players.find((entry) => entry.id === playerId);
  if (game?.phase !== 'playing' || !player?.alive || !player.classType || !player.pendingClassEvolutions) throw new Error('Nenhuma evolução de classe disponível.');
  const evolution = CLASS_EVOLUTIONS[type]; if (!evolution) throw new Error('Evolução de classe inválida.');
  player.classEvolutions.push(type); player.pendingClassEvolutions -= 1;
  player.maxHealth += evolution.health; player.health += evolution.health;
  game.evolutionSerial = (game.evolutionSerial || 0) + 1;
  player.lastClassEvolution = { serial: game.evolutionSerial, type, round: game.roundNumber };
  return player.lastClassEvolution;
}

function offerClassEvolutions(room) {
  const game = room.game;
  if (!classEvolutionRounds(game.roundLimit).includes(game.roundNumber)) return;
  for (const player of game.players) {
    if (!player.alive || !player.classType) continue;
    player.pendingClassEvolutions += 1;
    if (player.isBot) chooseClassEvolution(room, player.id, ['defensive', 'support', 'collector'].includes(player.personality) ? 'fortify' : 'overdrive');
  }
}

function equippedPowerups(player) {
  const equipped = Array.isArray(player.selectedPowerups) ? player.selectedPowerups : [];
  if (!equipped.length && player.selectedPowerup && player.inventory.includes(player.selectedPowerup)) equipped.push(player.selectedPowerup);
  player.selectedPowerups = [...new Set(equipped.filter((type) => player.inventory.includes(type) && SELECTABLE_POWERUPS.has(type)))];
  player.selectedPowerup = player.selectedPowerups.at(-1) || null;
  return player.selectedPowerups;
}

function hasPowerupEquipped(player, type) { return player.powerupBlockedTurns <= 0 && player.teslaDisabledTurns <= 0 && equippedPowerups(player).includes(type); }
function syncEquippedPowerups(player) { equippedPowerups(player); }

function teammates(game, player) { return game.players.filter((entry) => entry.alive && entry.id !== player.id && areAllies(game, entry, player)); }
function addAmmo(player, amount = 1) { for (const type of player.arsenal || []) if (!['megaCannon', 'superheat', 'mixer'].includes(type)) player.ammo[type] = (player.ammo[type] || 0) + amount; }
function grantNinjaCloak(game, player) {
  if (!player.invisibleTurns) {
    game.interactionSerial += 1;
    player.lastNinjaReveal = { serial: game.interactionSerial, x: player.x, y: player.y, reason: 'ghost', expiresRound: game.roundNumber + 2 };
  }
  player.invisibleTurns = Math.max(player.invisibleTurns || 0, 2);
  player.invisibilityFresh = true;
  player.ninjaFirstCloakActivated = true;
}
function applyOpeningNinjaCloak(game, departing) {
  for (const player of game.players) {
    if (!player.alive || player.classType !== 'ninja') continue;
    const damaged = player.lastDamageTurn === game.turnNumber || (player.lastDamageRound || 0) > (player.ninjaObservedDamageRound || 0) || player.health < (player.ninjaObservedHealth ?? player.maxHealth);
    player.ninjaObservedDamageRound = player.lastDamageRound || 0;
    player.ninjaObservedHealth = player.health;
    if (player.ninjaFirstCloakActivated) continue;
    if (damaged) player.ninjaOtherTurnsWaited = 0;
    if (player.id === departing?.id || damaged) continue;
    player.ninjaOtherTurnsWaited = (player.ninjaOtherTurnsWaited || 0) + 1;
    if (player.ninjaOtherTurnsWaited < 2 || player.invisibleTurns > 0 || activeClass(player) !== 'ninja') continue;
    grantNinjaCloak(game, player);
  }
}
function applyTurnClassPassives(game, active) {
  if (activeClass(active) === 'ninja') game.actions.movesLeft = Math.max(game.actions.movesLeft, 3);
}
function repairNearbyDeployables(game, player, radius, points, limit = 1) {
  const candidates = (game.objects || []).filter((object) => {
    if (!object.active || !['sentry', 'lightningRod'].includes(object.type)) return false;
    const owner = game.players.find((entry) => entry.id === object.ownerId);
    const maximum = object.maxDurability ?? WEAPON_BALANCE[object.type]?.durability ?? object.durability;
    return owner && (owner.id === player.id || areAllies(game, owner, player)) && object.durability < maximum && Math.hypot(object.x - player.x, object.y - player.y) <= radius;
  }).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
  return candidates.slice(0, limit).map((object) => {
    const maximum = object.maxDurability ?? WEAPON_BALANCE[object.type].durability;
    const amount = Math.min(points, maximum - object.durability);
    object.durability += amount;
    return { id: object.id, x: object.x, y: object.y, amount };
  });
}
export function spawnSpecialistDrone(game, player) {
  if (!player?.alive || activeClass(player) !== 'specialist') return null;
  const count = (game.objects || []).filter((object) => object.type === 'specialistDrone' && object.ownerId === player.id && object.active).length;
  if (count >= CLASS_BALANCE.specialistMaxDrones) return null;
  const x = clamp(player.x + (count % 2 ? -1 : 1) * (78 + Math.floor(count / 2) * 38), 28, playableWidth(game.terrain) - 28);
  const y = clamp(Math.min(player.y - 86, terrainY(game.terrain, x) - 64), 48, WORLD.height - 70);
  game.interactionSerial += 1;
  const drone = { id: `specialist-drone-${game.interactionSerial}`, type: 'specialistDrone', x, y, groundY: y + 16, width: 48, height: 32, durability: CLASS_BALANCE.specialistDurability, maxDurability: CLASS_BALANCE.specialistDurability, active: true, hovering: true, ownerId: player.id, disabledUntilRound: 0, bornRound: game.roundNumber };
  game.objects.push(drone);
  game.classPulseSerial += 1;
  game.lastClassPulses.push({ serial: game.classPulseSerial, type: 'specialist', x, y, radius: 84, round: game.roundNumber, droneId: drone.id });
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 1150);
  return drone;
}

function applyRoundClassPassives(game) {
  if (game.roundNumber % 3 === 0) game.lastSaboteurPulses = [];
  game.lastClassPulses = [];
  for (const tank of game.players) tank.armorAuraActive = false;
  for (const player of game.players) {
    if (!player.alive || player.lastClassRound >= game.roundNumber) continue; player.lastClassRound = game.roundNumber;
    const roundsSafe = game.roundNumber - (player.lastDamageRound || 0);
    if (activeClass(player) === 'armored') {
      if (roundsSafe >= 2) player.health = Math.min(player.maxHealth, player.health + 40);
      const targets = [player, ...teammates(game, player)].filter((ally) => Math.hypot(ally.x - player.x, ally.y - player.y) <= CLASS_BALANCE.armoredPulseRadius);
      for (const ally of targets) ally.armorAuraActive = true;
      game.classPulseSerial += 1; game.lastClassPulses.push({ serial: game.classPulseSerial, type: 'armored', x: player.x, y: player.y, radius: CLASS_BALANCE.armoredPulseRadius, round: game.roundNumber, targetIds: targets.map((ally) => ally.id) });
    }
    if (activeClass(player) === 'healer') {
      const targets = [player, ...teammates(game, player)].filter((ally) => Math.hypot(ally.x - player.x, ally.y - player.y) <= CLASS_BALANCE.healerAllyRadius);
      const heals = targets.map((ally) => { const amount = Math.min(CLASS_BALANCE.healerAllyAura, ally.maxHealth - ally.health); ally.health += amount; return { playerId: ally.id, amount }; });
      game.classPulseSerial += 1; game.lastClassPulses.push({ serial: game.classPulseSerial, type: 'healer', x: player.x, y: player.y, radius: CLASS_BALANCE.healerAllyRadius, round: game.roundNumber, heals });
    }
    if (activeClass(player) === 'amphibian' && swimmableWaterSurface(game.terrain, game.waterZones, player.x) !== null && (player.swimming || waterDepthAt(game.terrain, game.waterZones, player.x, player.y + WORLD.tankRadius + 8) >= 8)) {
      const amount = Math.min(CLASS_BALANCE.amphibianWaterRegen, player.maxHealth - player.health);
      if (amount > 0) { player.health += amount; game.classPulseSerial += 1; game.lastClassPulses.push({ serial: game.classPulseSerial, type: 'amphibian', x: player.x, y: player.y, radius: 55, round: game.roundNumber, heals: [{ playerId: player.id, amount }] }); }
    }
    if (activeClass(player) === 'specialist' && game.roundNumber % CLASS_BALANCE.specialistSummonEveryRounds === 0) spawnSpecialistDrone(game, player);
    if (player.classType === 'meteorologist' && game.roundNumber >= 2 && !player.arsenal.includes('lightningRod')) {
      player.arsenal.push('lightningRod'); player.ammo.lightningRod = 1;
      game.pickupSerial += 1; player.lastPickup = { serial: game.pickupSerial, type: 'lightningRod', category: 'classReward', contents: null };
    } else if (activeClass(player) === 'meteorologist' && game.roundNumber > 2 && (game.roundNumber - 2) % 3 === 0) player.ammo.lightningRod = Math.min(2, (player.ammo.lightningRod || 0) + 1);
    if (activeClass(player) === 'ninja') { if (game.roundNumber % 2 === 0) player.inventory.push('rocketDash'); if (player.ninjaFirstCloakActivated && player.turnsPlayed >= 2 && roundsSafe >= 2 && game.roundNumber - (player.lastNinjaRevealRound || 0) >= 2) grantNinjaCloak(game, player); }
    if (activeClass(player) === 'saboteur') {
      if (game.roundNumber > 1 && player.arsenal.includes('teslaOrb')) player.ammo.teslaOrb = (player.ammo.teslaOrb || 0) + 1;
      if (game.roundNumber % 3 === 0) {
        const targetIds = []; const hits = [];
        for (const sentry of game.objects || []) if (['sentry', 'specialistDrone'].includes(sentry.type) && sentry.active && sentry.ownerId !== player.id && !areAllies(game, player, game.players.find((entry) => entry.id === sentry.ownerId)) && Math.hypot(sentry.x - player.x, sentry.y - player.y) <= CLASS_BALANCE.saboteurPulseRadius) sentry.disabledUntilRound = Math.max(sentry.disabledUntilRound || 0, game.roundNumber);
        for (const enemy of game.players) if (enemy.alive && enemy.id !== player.id && !areAllies(game, enemy, player) && enemy.classType !== 'saboteur' && Math.hypot(enemy.x - player.x, enemy.y - player.y) <= CLASS_BALANCE.saboteurPulseRadius) {
          const amount = Math.min(enemy.health, CLASS_BALANCE.saboteurPulseDamage);
          enemy.health -= amount; enemy.alive = enemy.health > 0;
          enemy.lastDamageRound = game.roundNumber; enemy.lastDamageTurn = game.turnNumber; enemy.lastDamageSourceId = player.id;
          enemy.frozenTurns = Math.max(enemy.frozenTurns || 0, 1); enemy.powerupBlockedTurns = Math.max(enemy.powerupBlockedTurns || 0, 1);
          player.stats.damage += amount; targetIds.push(enemy.id); hits.push({ playerId: enemy.id, amount });
        }
        game.saboteurPulseSerial += 1;
        game.lastSaboteurPulses.push({ serial: game.saboteurPulseSerial, sourceId: player.id, x: player.x, y: player.y, radius: CLASS_BALANCE.saboteurPulseRadius, targetIds, hits });
        game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + CLASS_BALANCE.saboteurPulseDurationMs);
      }
    }
  if (activeClass(player) === 'backpacker') { addAmmo(player, 1); for (const ally of teammates(game, player)) if (Math.hypot(ally.x - player.x, ally.y - player.y) <= 520) { const weapon = ally.arsenal.find((type) => !['megaCannon', 'superheat', 'mixer'].includes(type)); if (weapon) ally.ammo[weapon] = Math.min(3, (ally.ammo[weapon] || 0) + 1); } }
  }
}

function awardDestruction(game, playerId, type, count = 1) {
  const points = DESTRUCTION_POINTS[type] || 0; const player = playerId && game.players.find((entry) => entry.id === playerId);
  if (!player || points <= 0 || count <= 0) return 0;
  player.stats ||= { damage: 0, shots: 0, destruction: 0, destroyed: {} }; player.stats.destroyed ||= {};
  const total = Math.round((points + (type === 'tank' && activeClass(player) === 'attacker' ? ATTACKER_ELIMINATION_BONUS : 0)) * count); player.stats.destruction = (player.stats.destruction || 0) + total; player.stats.destroyed[type] = (player.stats.destroyed[type] || 0) + count;
  if (activeClass(player) === 'attacker' && !player.ammo?.megaCannon) {
    const cost = megaCannonCost(player.megaCannonUses);
    player.megaCannonCharge = Math.min(cost, (player.megaCannonCharge || 0) + total);
    if (player.megaCannonCharge >= cost) {
      player.arsenal ||= []; const firstUnlock = !player.arsenal.includes('megaCannon'); if (firstUnlock) player.arsenal.push('megaCannon');
      player.ammo ||= {}; player.ammo.megaCannon = 1;
      game.pickupSerial = (game.pickupSerial || 0) + 1;
      player.lastPickup = { serial: game.pickupSerial, type: 'megaCannon', category: firstUnlock ? 'classReward' : 'classRecharge', contents: null };
    }
  }
  game.destructionSerial = (game.destructionSerial || 0) + 1; player.lastDestruction = { serial: game.destructionSerial, type, count, points: total };
  return total;
}

function awardExplosionDestruction(game, playerId, damage) {
  const destroyedBlocks = damage?.destruction?.terrainBlocks || 0; const chunks = Math.floor(destroyedBlocks / 24);
  if (chunks > 0) awardDestruction(game, playerId, 'terrainChunk', chunks);
  for (const ignored of damage?.destruction?.platformIds || []) awardDestruction(game, playerId, 'platform');
}

export function aquaticHunterPath(game, owner, impact) {
  const balance = WEAPON_BALANCE.waterHunter; const surface = swimmableWaterSurface(game.terrain, game.waterZones, impact.x);
  if (surface === null || waterDepthAt(game.terrain, game.waterZones, impact.x, impact.y) < 15) return null;
  const wetAt = (x) => swimmableWaterSurface(game.terrain, game.waterZones, x) !== null;
  let left = impact.x; let right = impact.x;
  while (left > Math.max(8, impact.x - balance.seekRange) && wetAt(left - 8)) left -= 8;
  while (right < Math.min(WORLD.width - 8, impact.x + balance.seekRange) && wetAt(right + 8)) right += 8;
  const nearThisLake = (target) => {
    const targetSurface = swimmableWaterSurface(game.terrain, game.waterZones, target.x); const submerged = targetSurface !== null && waterDepthAt(game.terrain, game.waterZones, target.x, target.y + WORLD.tankRadius) >= 8;
    const nearShore = targetSurface !== null && Math.abs(target.y + WORLD.tankRadius - targetSurface) <= 65 || [target.x - 55, target.x + 55].some((x) => wetAt(x) && Math.abs(target.y + WORLD.tankRadius - (swimmableWaterSurface(game.terrain, game.waterZones, x) ?? target.y)) <= 85);
    return submerged || nearShore;
  };
  const candidates = game.players.filter((target) => target.alive && target.id !== owner.id && !protectedAlly(game, target, owner) && nearThisLake(target));
  const path = []; let x = clamp(impact.x, left + 14, right - 14); let direction = owner.facing || 1; let target = null;
  for (let step = 0; step < balance.patrolSteps; step += 1) {
    const swimSurface = swimmableWaterSurface(game.terrain, game.waterZones, x) ?? surface; const swimY = Math.min(terrainY(game.terrain, x) - 12, swimSurface + 24 + Math.sin(step * .22) * 5);
    target ||= candidates.filter((entry) => Math.hypot(entry.x - x, entry.y - swimY) <= balance.detectionRange).sort((a, b) => Math.hypot(a.x - x, a.y - swimY) - Math.hypot(b.x - x, b.y - swimY))[0] || null;
    if (target) break;
    x += direction * balance.swimSpeed; if (x <= left + 14 || x >= right - 14) { x = clamp(x, left + 14, right - 14); direction *= -1; }
    path.push({ x, y: swimY, underwater: true, sharkSwim: true, sharkPatrol: true, direction });
  }
  let bite = false;
  if (target) {
    const from = path.at(-1) || { x, y: surface + 24 }; const steps = Math.max(18, Math.ceil(Math.hypot(target.x - from.x, target.y - from.y) / balance.swimSpeed));
    for (let step = 1; step <= steps; step += 1) { const fraction = step / steps; const nextX = from.x + (target.x - from.x) * fraction; const nextY = from.y + (target.y - from.y) * fraction + Math.sin(fraction * Math.PI * 2) * 3; path.push({ x: nextX, y: nextY, underwater: swimmableWaterSurface(game.terrain, game.waterZones, nextX) !== null, sharkSwim: true, sharkCharge: fraction > .45, direction: Math.sign(target.x - from.x) || direction }); if (Math.hypot(nextX - target.x, nextY - target.y) <= WORLD.tankRadius + 12) { bite = true; break; } }
  }
  return { path, bite, targetId: target?.id || null, patrolBounds: { left, right } };
}

export function matchScore(player, game) {
  const objective = game?.mode === 'hill' ? (player.hillScore || 0) * 1200 : game?.mode === 'teamHill' ? (game.hill?.teamScores?.[player.team] || 0) * 1200 : 0;
  const survival = player.alive ? 1000 : 0; const health = Math.max(0, player.health || 0) * 3; const damage = player.stats?.damage || 0; const destruction = player.stats?.destruction || 0; const eliminations = (player.stats?.destroyed?.tank || 0) * 500;
  return Math.round(objective + survival + health + damage + destruction + eliminations);
}

function finalizeResult(game, reason) {
  game.endReason = reason; game.finalStandings = [...game.players].map((player) => ({ playerId: player.id, score: matchScore(player, game), alive: player.alive, health: Math.max(0, player.health || 0), damage: player.stats?.damage || 0, destruction: player.stats?.destruction || 0, eliminations: player.stats?.destroyed?.tank || 0 })).sort((a, b) => b.score - a.score || Number(b.alive) - Number(a.alive) || b.health - a.health);
  game.phase = 'finished'; game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = null; game.botActAt = null; game.shotEndsAt = null; game.pendingShot = null; game.paused = false;
}

function finishByRoundLimit(game) {
  const alive = game.players.filter((player) => player.alive); const score = (player) => matchScore(player, game);
  if (usesTeams(game)) {
    const teams = [...new Set(game.players.map((player) => player.team))].map((team) => ({ team, players: alive.filter((player) => player.team === team), score: alive.filter((player) => player.team === team).reduce((sum, player) => sum + score(player), 0) }));
    const hillPoints = (team) => game.mode === 'teamHill' ? game.hill?.teamScores?.[team.team] || 0 : 0;
    teams.sort((a, b) => hillPoints(b) - hillPoints(a) || b.score - a.score); game.winningTeam = hillPoints(teams[0]) === hillPoints(teams[1]) && teams[0].score === teams[1].score ? null : teams[0].team; game.winner = teams[0].players.sort((a, b) => score(b) - score(a))[0]?.id || null;
  } else { alive.sort((a, b) => game.mode === 'hill' ? b.hillScore - a.hillScore || score(b) - score(a) : score(b) - score(a)); const uniqueLead = !alive[1] || (game.mode === 'hill' && alive[0].hillScore !== alive[1].hillScore) || score(alive[0]) !== score(alive[1]); game.winner = alive[0] && uniqueLead ? alive[0].id : null; }
  game.finishedByRounds = true; finalizeResult(game, 'roundLimit');
}

function findHillZone(terrain) {
  const center = WORLD.width / 2;
  for (let offset = 0; offset < WORLD.width / 2 - 90; offset += 20) for (const direction of offset ? [-1, 1] : [1]) {
    const x = Math.round(center + offset * direction);
    if (safeGroundAt(terrain, x)) return { x, y: terrainY(terrain, x), radius: HILL_RULES.radius, pointsToWin: HILL_RULES.pointsToWin, lastCapturePlayerId: null, contested: false };
  }
  const spawn = findSpawns(terrain, 1)[0]; return { x: spawn.x, y: spawn.y + WORLD.tankRadius, radius: HILL_RULES.radius, pointsToWin: HILL_RULES.pointsToWin, lastCapturePlayerId: null, contested: false };
}

function awardHillRound(game) {
  if (!['hill', 'teamHill'].includes(game.mode) || !game.hill) return false;
  if (!safeGroundAt(game.terrain, game.hill.x)) Object.assign(game.hill, findHillZone(game.terrain));
  game.hill.y = terrainY(game.terrain, game.hill.x);
  const occupants = game.players.filter((player) => player.alive && Math.abs(player.x - game.hill.x) <= game.hill.radius && Math.abs(player.y - (game.hill.y - WORLD.tankRadius)) <= 100);
  const occupyingTeams = new Set(occupants.map((player) => player.team));
  game.hill.contested = game.mode === 'teamHill' ? occupyingTeams.size > 1 : occupants.length > 1;
  game.hill.lastCapturePlayerId = occupants.length === 1 ? occupants[0].id : null;
  game.hill.lastCaptureTeam = game.mode === 'teamHill' && occupyingTeams.size === 1 ? occupants[0].team : null;
  if (game.mode === 'teamHill') {
    if (occupyingTeams.size !== 1) return false;
    const team = occupants[0].team; game.hill.teamScores[team] = (game.hill.teamScores[team] || 0) + 1;
    if (game.hill.teamScores[team] < game.hill.pointsToWin) return false;
    game.winningTeam = team; game.winner = occupants[0].id; game.finishedByObjective = true; finalizeResult(game, 'objective'); return true;
  }
  if (occupants.length !== 1) return false;
  const holder = occupants[0]; holder.hillScore = (holder.hillScore || 0) + 1;
  if (holder.hillScore < game.hill.pointsToWin) return false;
  game.winner = holder.id; game.finishedByObjective = true; finalizeResult(game, 'objective');
  return true;
}

function completeRoundTurn(room, player) {
  const game = room.game;
  if (!player || game.roundCompleted.includes(player.id)) return false; game.roundCompleted.push(player.id);
  const remaining = game.roundParticipants.filter((id) => game.players.some((entry) => entry.id === id && entry.alive));
  if (!remaining.every((id) => game.roundCompleted.includes(id))) return false;
  if (awardHillRound(game)) return true;
  if (game.roundNumber >= game.roundLimit) { finishByRoundLimit(game); return true; }
  game.roundNumber += 1;
  if (game.weather && game.weather.kind !== 'clearing' && game.roundNumber > game.weather.untilRound) beginWeatherClearing(game);
  if ((game.roundNumber - 1) % DRIVE.refillRounds === 0) for (const tank of game.players) if (tank.alive) {
    tank.fuel = driveStats(tank).maxFuel;
    tank.lastFuelRefillRound = game.roundNumber;
  }
  if (game.mode === 'survival') {
    const previousLevel = game.lavaLevel;
    game.lavaLevel = Math.min(game.lavaLevel, survivalLavaLevel(game.roundNumber, game.roundLimit));
    game.survival.lastRise = { serial: game.roundNumber, round: game.roundNumber, from: previousLevel, to: game.lavaLevel };
    game.survival.nextLevel = Math.min(game.lavaLevel, survivalLavaLevel(game.roundNumber + 1, game.roundLimit));
    for (const tank of game.players) if (tank.alive && tank.y + WORLD.tankRadius >= game.lavaLevel) { tank.health = 0; tank.alive = false; tank.airborne = null; }
    recordEliminations(game);
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 1100);
    if (evaluateVictory(game)) return true;
  }
  game.roundParticipants = game.players.filter((entry) => entry.alive).map((entry) => entry.id); game.roundCompleted = []; applyRoundClassPassives(game); pulseSpecialistDrones(game); recordEliminations(game); if (evaluateVictory(game)) return true; offerClassEvolutions(room); return false;
}

function beginWeatherClearing(game, now = Date.now()) {
  if (!game.weather || game.weather.kind === 'clearing') return;
  game.weather = { kind: 'clearing', fromKind: game.weather.kind, startedAt: now, endsAt: now + 6500, untilRound: game.roundNumber };
}

function queueArenaPulse(room) {
  const game = room.game; if (!game || game.roundNumber < 2 || game.roundNumber % 2 !== 0 || game.lastArenaEventRound === game.roundNumber || game.pendingArenaEvent || game.arenaEventReadyAt) return;
  const now = Date.now(); const readyAt = Math.max(now + 260, game.lastBattleAnimationUntil || 0); const delay = readyAt - now; game.arenaEventReadyAt = readyAt; game.arenaWarningUntil = readyAt;
  if (game.turnEndsAt) game.turnEndsAt += delay; if (game.botActAt) game.botActAt += delay;
}

function pulseLightningRods(game) {
  const arcs = [];
  for (const rod of game.objects || []) {
    if (rod.type !== 'lightningRod' || !rod.active) continue;
    const owner = game.players.find((player) => player.id === rod.ownerId);
    const originY = rod.groundY - rod.height;
    for (const target of game.players) {
      if (!target.alive || target.id === rod.ownerId || areAllies(game, owner, target) || Math.hypot(target.x - rod.x, target.y - originY) > (rod.zapRadius || WEAPON_BALANCE.lightningRod.zapRadius)) continue;
      const shielded = !rod.armorPiercer && !target.teslaDisabledTurns && (target.shield || target.shieldCharges > 0);
      const amount = shielded ? Math.ceil(WEAPON_BALANCE.lightningRod.zapDamage * .35) : WEAPON_BALANCE.lightningRod.zapDamage;
      if (shielded) { target.shieldCharges = Math.max(0, (target.shieldCharges || 1) - 1); target.shield = target.shieldCharges > 0; }
      target.health = Math.max(0, target.health - amount); target.alive = target.health > 0;
      if (rod.freezeTurns && target.alive && activeClass(target) !== 'saboteur') target.frozenTurns = Math.max(target.frozenTurns || 0, rod.freezeTurns);
      target.lastDamageRound = game.roundNumber; target.lastDamageTurn = game.turnNumber; target.lastDamageSourceId = owner?.id || null;
      if (owner) owner.stats.damage += amount;
      arcs.push({ rodId: rod.id, fromX: rod.x, fromY: originY, toX: target.x, toY: target.y, targetId: target.id, amount });
    }
  }
  if (arcs.length) { game.rodPulseSerial = (game.rodPulseSerial || 0) + 1; game.lastRodPulse = { serial: game.rodPulseSerial, arcs }; game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 1200); recordEliminations(game); }
}

function sentryStructureAt(game, x, y, sourceId) {
  for (const object of game.objects || []) {
    if (object.active === false || object.id === sourceId || object.type === 'ramp') continue;
    if (object.type === 'crane') {
      const top = object.groundY - object.height;
      if (Math.hypot(x - object.ballX, y - object.ballY) <= (object.ballRadius || 28) || pointSegmentDistance(x, y, object.x, object.groundY, object.x, top) <= 7 || (object.cableIntact && pointSegmentDistance(x, y, object.ballX, top, object.ballX, object.ballY) <= 3)) return object;
      continue;
    }
    const width = object.width || (object.type === 'barrel' ? 18 : 24);
    const height = object.height || (object.type === 'barrel' ? 20 : 12);
    const groundY = object.groundY ?? object.y + height / 2;
    if (x >= object.x - width / 2 && x <= object.x + width / 2 && y >= groundY - height && y <= groundY) return object;
  }
  return null;
}

function traceSentryBullet(game, sentry, owner, target, index, scanRadius = WEAPON_BALANCE.sentry.scanRadius, bulletDamage = WEAPON_BALANCE.sentry.damage) {
  const originY = sentry.type === 'specialistDrone' ? sentry.y + 3 : sentry.groundY - sentry.height + 8;
  const aimY = target.y + (index - 2) * 3;
  const angle = Math.atan2(aimY - originY, target.x - sentry.x);
  const startX = sentry.x + Math.cos(angle) * 34; const startY = originY + Math.sin(angle) * 34;
  const distance = scanRadius + 35; const dx = Math.cos(angle) * 3; const dy = Math.sin(angle) * 3;
  let impact = { x: startX + Math.cos(angle) * distance, y: startY + Math.sin(angle) * distance, type: 'miss' };
  for (let step = 0; step * 3 <= distance; step += 1) {
    const x = startX + dx * step; const y = startY + dy * step;
    if (x < 0 || x >= WORLD.width || y < 0 || y > WORLD.height + 30) { impact = { x, y, type: 'miss' }; break; }
    const structure = sentryStructureAt(game, x, y, sentry.id);
    if (structure) { impact = { x, y, type: 'structure', objectId: structure.id }; break; }
    const hit = game.players.find((player) => player.alive && player.id !== owner.id && !areAllies(game, owner, player) && Math.hypot(player.x - x, player.y - y) <= WORLD.tankRadius + 1);
    if (hit) { impact = { x, y, type: 'tank', playerId: hit.id }; break; }
    const platform = game.terrain.floatingPlatforms?.find((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && y >= entry.y && y <= entry.y + entry.height);
    if (platform) { impact = { x, y, type: 'platform', platformId: platform.id }; break; }
    if (y >= terrainY(game.terrain, x)) { impact = { x, y, type: 'terrain' }; break; }
  }
  const bullet = { fromX: startX, fromY: startY, x: impact.x, y: impact.y, type: impact.type, amount: 0, ...(impact.playerId ? { playerId: impact.playerId } : {}), ...(impact.objectId ? { objectId: impact.objectId } : {}) };
  if (impact.type === 'tank') {
    const hit = game.players.find((player) => player.id === impact.playerId);
    const shielded = !hit.teslaDisabledTurns && (hit.shield || hit.shieldCharges > 0);
    const damage = Math.min(hit.health, shielded ? Math.ceil(bulletDamage * .35) : bulletDamage);
    if (shielded) { hit.shieldCharges = Math.max(0, (hit.shieldCharges || 1) - 1); hit.shield = hit.shieldCharges > 0; }
    hit.health -= damage; hit.alive = hit.health > 0; hit.lastDamageRound = game.roundNumber; hit.lastDamageTurn = game.turnNumber; hit.lastDamageSourceId = owner.id; owner.stats.damage += damage; bullet.amount = damage;
  } else if (impact.type === 'terrain') {
    const before = terrainY(game.terrain, impact.x); carveTerrain(game.terrain, impact.x, impact.y, 7); awardDestruction(game, owner.id, 'terrainChunk', Math.floor(Math.max(0, terrainY(game.terrain, impact.x) - before) / 24)); settleScenarioObjects(game); settlePlayers(game);
  } else if (impact.type === 'platform') {
    const platform = game.terrain.floatingPlatforms.find((entry) => entry.id === impact.platformId);
    platform.durability = Math.max(0, platform.durability - 9); if (!platform.durability) { platform.active = false; awardDestruction(game, owner.id, 'platform'); settleScenarioObjects(game); settlePlayers(game); }
  } else if (impact.type === 'structure') {
    bullet.interactions = activateScenarioObjects(game, impact.x, impact.y, 0, new Set(), owner.id);
  }
  return bullet;
}

export function pulseSpecialistDrones(game) {
  const bursts = [];
  const owners = game.players.filter((player) => player.alive && activeClass(player) === 'specialist');
  for (const owner of owners) {
    const drones = (game.objects || []).filter((object) => object.type === 'specialistDrone' && object.active && object.ownerId === owner.id && object.disabledUntilRound < game.roundNumber);
    const enemies = game.players.filter((player) => player.alive && player.id !== owner.id && !areAllies(game, owner, player));
    const priority = enemies.filter((enemy) => drones.some((drone) => Math.hypot(enemy.x - drone.x, enemy.y - drone.y) <= CLASS_BALANCE.specialistScanRadius)).sort((a, b) => Math.hypot(a.x - owner.x, a.y - owner.y) - Math.hypot(b.x - owner.x, b.y - owner.y))[0];
    for (const drone of drones) {
      const targets = enemies.filter((enemy) => enemy.alive && Math.hypot(enemy.x - drone.x, enemy.y - drone.y) <= CLASS_BALANCE.specialistScanRadius).sort((a, b) => a.id === priority?.id ? -1 : b.id === priority?.id ? 1 : Math.hypot(a.x - drone.x, a.y - drone.y) - Math.hypot(b.x - drone.x, b.y - drone.y)).slice(0, 3);
      for (const target of targets) {
        if (!target.alive) continue;
        const bullets = Array.from({ length: 5 }, (_, index) => traceSentryBullet(game, drone, owner, target, index, CLASS_BALANCE.specialistScanRadius, CLASS_BALANCE.specialistDamage / 5));
        bursts.push({ sentryId: drone.id, specialist: true, x: drone.x, y: drone.y + 3, targetId: target.id, targetX: target.x, targetY: target.y, amount: bullets.reduce((sum, bullet) => sum + bullet.amount, 0), bullets });
      }
    }
  }
  if (bursts.length) {
    game.specialistPulseSerial += 1; game.lastSpecialistPulse = { serial: game.specialistPulseSerial, bursts };
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 1750);
    recordEliminations(game);
  }
  return bursts;
}

function pulseSentinels(game) {
  const bursts = [];
  for (const sentry of game.objects || []) {
    if (sentry.type !== 'sentry' || !sentry.active || sentry.disabledUntilRound >= game.roundNumber || game.turnNumber - (sentry.lastFiredTurn ?? game.turnNumber) < WEAPON_BALANCE.sentry.fireEveryTurns) continue;
    const owner = game.players.find((entry) => entry.id === sentry.ownerId);
    if (!owner) continue;
    const muzzleY = sentry.groundY - sentry.height + 8;
    const target = game.players.filter((entry) => entry.alive && entry.id !== owner.id && !areAllies(game, owner, entry) && Math.hypot(entry.x - sentry.x, entry.y - muzzleY) <= WEAPON_BALANCE.sentry.scanRadius).sort((a, b) => Math.hypot(a.x - sentry.x, a.y - muzzleY) - Math.hypot(b.x - sentry.x, b.y - muzzleY))[0];
    if (!target) continue;
    sentry.lastFiredTurn = game.turnNumber;
    const bullets = Array.from({ length: WEAPON_BALANCE.sentry.projectiles }, (_, index) => traceSentryBullet(game, sentry, owner, target, index));
    bursts.push({ sentryId: sentry.id, x: sentry.x, y: muzzleY, targetId: target.id, targetX: target.x, targetY: target.y, amount: bullets.reduce((sum, bullet) => sum + bullet.amount, 0), bullets });
  }
  if (bursts.length) { game.sentryPulseSerial = (game.sentryPulseSerial || 0) + 1; game.lastSentryPulse = { serial: game.sentryPulseSerial, bursts }; game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 1450); recordEliminations(game); }
}

function interceptBySentry(game, shooter, result) {
  if (!result.path?.length) return null;
  const candidates = [];
  for (const sentry of game.objects || []) {
    if (sentry.type !== 'sentry' || !sentry.active || sentry.disabledUntilRound >= game.roundNumber) continue;
    const owner = game.players.find((entry) => entry.id === sentry.ownerId);
    if (!owner || owner.id === shooter.id || areAllies(game, owner, shooter)) continue;
    const centerY = sentry.groundY - sentry.height / 2;
    const index = result.path.findIndex((point, i) => i > 2 && Math.hypot(point.x - sentry.x, point.y - centerY) <= WEAPON_BALANCE.sentry.scanRadius);
    if (index >= 0) candidates.push({ sentry, index });
  }
  for (const { sentry, index } of candidates.sort((a, b) => a.index - b.index)) {
    if (seededRandom(`${game.seed}-${game.turnNumber}-${shooter.id}-${sentry.id}-${result.path[0].x}-${result.path[0].y}`)() >= WEAPON_BALANCE.sentry.interceptChance) continue;
    const point = result.path[index]; result.path = result.path.slice(0, index + 1); result.impact = { x: point.x, y: point.y }; result.interceptedBySentry = sentry.id;
    game.sentryPulseSerial = (game.sentryPulseSerial || 0) + 1;
    const muzzleY = sentry.groundY - sentry.height + 8;
    game.lastSentryPulse = { serial: game.sentryPulseSerial, bursts: [{ sentryId: sentry.id, x: sentry.x, y: muzzleY, targetX: point.x, targetY: point.y, intercept: true, bullets: Array.from({ length: 5 }, (_, bullet) => ({ fromX: sentry.x, fromY: muzzleY, x: point.x + (bullet - 2) * 4, y: point.y + (bullet % 2 ? 3 : -3), type: 'projectile', amount: 0 })) }] };
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 1450);
    return sentry;
  }
  return null;
}

export function interceptBySpecialistDrone(game, shooter, result, weapon = 'standard', shotSequence = '0') {
  if (!result.impact || result.path?.length < 5 || ['harpoon', 'sentry', 'lightningRod', 'mineLayer', 'waterMine'].includes(weapon)) return null;
  if (result.impact.structure || result.impact.platformId) return null;
  const owners = game.players.filter((player) => player.alive && activeClass(player) === 'specialist' && player.id !== shooter.id && !areAllies(game, player, shooter)
    && (!result.impact.playerId || result.impact.playerId === player.id)
    && Math.hypot(player.x - result.impact.x, player.y - result.impact.y) <= WORLD.tankRadius + 30);
  const candidates = [];
  for (const owner of owners) for (const drone of game.objects || []) {
    if (drone.type !== 'specialistDrone' || !drone.active || drone.ownerId !== owner.id || drone.disabledUntilRound >= game.roundNumber) continue;
    if (Math.hypot(drone.x - owner.x, drone.y - owner.y) > CLASS_BALANCE.specialistGuardRadius) continue;
    const obstacles = (game.objects || []).filter((entry) => entry.id !== drone.id);
    for (let index = result.path.length - 1; index >= 3; index -= 1) {
      const point = result.path[index]; const ownerDistance = Math.hypot(point.x - owner.x, point.y - owner.y);
      if (ownerDistance < 75 || ownerDistance > 185 || point.y >= terrainY(game.terrain, point.x) - 4) continue;
      const travel = Math.hypot(point.x - drone.x, point.y - drone.y);
      if (travel > CLASS_BALANCE.specialistInterceptDashRange) continue;
      let blocked = false;
      const steps = Math.ceil(travel / 18);
      for (let step = 1; step <= steps; step += 1) {
        const fraction = step / steps; const x = drone.x + (point.x - drone.x) * fraction; const y = drone.y + (point.y - drone.y) * fraction;
        if (y >= terrainY(game.terrain, x) - 4 || projectileStructureAt(obstacles, x, y)
          || game.terrain.floatingPlatforms?.some((platform) => platform.active && x >= platform.x && x <= platform.x + platform.width && y >= platform.y && y <= platform.y + (platform.height || 8))) { blocked = true; break; }
      }
      if (!blocked) candidates.push({ owner, drone, point, index, travel, ownerDistance });
    }
  }
  candidates.sort((a, b) => Math.abs(a.ownerDistance - 145) - Math.abs(b.ownerDistance - 145) || a.travel - b.travel || a.index - b.index);
  const attempted = new Set();
  const candidate = candidates.find(({ drone }) => {
    if (attempted.has(drone.id)) return false;
    attempted.add(drone.id);
    const roll = seededRandom(`${game.seed}-drone-guard-${game.turnNumber}-${shooter.id}-${drone.id}-${weapon}-${shotSequence}-${result.path[0].x}-${result.path[0].y}`)();
    return roll < CLASS_BALANCE.specialistInterceptChance;
  });
  if (!candidate) return null;
  const { owner, drone, point, index } = candidate;
  const fromX = drone.x; const fromY = drone.y;
  drone.x = point.x; drone.y = point.y; drone.groundY = point.y + drone.height / 2;
  drone.durability = 0; drone.active = false;
  awardDestruction(game, shooter.id, 'specialistDrone');
  result.path = result.path.slice(0, index + 1);
  result.impact = { x: point.x, y: point.y, structure: 'specialistDrone', structureId: drone.id };
  result.collectedPowerupIds = (result.collectedPowerupIds || []).filter((id) => {
    const item = game.powerups?.find((entry) => entry.id === id);
    return item && result.path.some((entry) => Math.hypot(entry.x - item.x, entry.y - item.y) <= 16);
  });
  result.droneIntercept = { droneId: drone.id, ownerId: owner.id, fromX, fromY, toX: point.x, toY: point.y, pathIndex: index };
  return drone;
}

function pulsePassiveSuperheat(game, departing) {
  if (!departing) return;
  game.lastSuperheatPulses = [];
  for (const owner of game.players) {
    if (!owner.alive || !owner.arsenal?.includes('superheat') || owner.id === departing.id || areAllies(game, owner, departing)) continue;
    // A Tesla pane suspends this active passive without consuming its charge.
    if (owner.teslaDisabledTurns > 0) continue;
    owner.superheatEnemyTurns = (owner.superheatEnemyTurns || 0) + 1;
    if (owner.superheatEnemyTurns < SUPERHEAT.enemyTurns) continue;
    owner.superheatEnemyTurns = 0;
    game.interactionSerial += 1;
    const serial = game.interactionSerial;
    game.lastSuperheatPulse = { serial, ownerId: owner.id, x: owner.x, y: owner.y, radius: SUPERHEAT.radius, startedAt: Date.now(), duration: SUPERHEAT.durationMs };
    game.lastSuperheatPulses.push(game.lastSuperheatPulse);
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + SUPERHEAT.durationMs);
    for (const target of game.players) {
      if (!target.alive || target.id === owner.id || areAllies(game, owner, target) || Math.hypot(target.x - owner.x, target.y - owner.y) > SUPERHEAT.radius) continue;
      const before = target.health; const damage = directDamage(owner, target, SUPERHEAT.damage, true);
      target.health = Math.max(0, target.health - damage); target.alive = target.health > 0;
      target.lastDamageRound = game.roundNumber; target.lastDamageSourceId = owner.id; target.lastDamageTurn = game.turnNumber;
      target.lastFireHit = { round: game.roundNumber, damage: before - target.health, x: target.x, y: target.y, zoneId: `heat-${serial}` };
      owner.stats.damage += before - target.health;
      reflectDirectDamage(game, target, owner, before - target.health);
    }
    let structureChanged = false;
    for (const object of game.objects || []) {
      if (!object.active || Math.hypot(object.x - owner.x, (object.groundY ?? object.y) - (object.height || 0) / 2 - owner.y) > SUPERHEAT.radius + (object.height || 0) / 2) continue;
      object.durability = Math.max(0, (object.durability ?? 2) - 1); object.burningUntilRound = game.roundNumber + 1;
      if (!object.durability) { object.active = false; structureChanged = true; awardDestruction(game, owner.id, object.type); }
    }
    for (const platform of game.terrain.floatingPlatforms || []) {
      if (!platform.active || Math.hypot(clamp(owner.x, platform.x, platform.x + platform.width) - owner.x, platform.y - owner.y) > SUPERHEAT.radius) continue;
      platform.durability = Math.max(0, platform.durability - 22); platform.burningUntilRound = game.roundNumber + 1;
      if (!platform.durability) { platform.active = false; structureChanged = true; }
    }
    if (structureChanged) { settleScenarioObjects(game); settlePlayers(game); }
    recordEliminations(game);
  }
}

export function nextTurn(room) {
  const game = room.game;
  if (!game || game.phase === 'finished') return;
  room.pendingVerticalChoice = null;
  room.pendingClusterChoice = null;
  room.pendingFireworksChoice = null;
  game.shotEndsAt = null; game.pendingShot = null;
  const departing = currentPlayer(game);
  if (game.ninjaFatalStage?.playerId === departing?.id) game.ninjaFatalStage = null;
  if (game.harpoonAnchor?.ownerId === departing?.id) { departing.ammo.harpoon = (departing.ammo.harpoon || 0) + 1; delete departing.arsenalLastUsed?.harpoon; game.harpoonAnchor = null; }
  if (departing?.rewardOffer) autoClaimReward(game, departing);
  if (departing?.invisibilityFresh) departing.invisibilityFresh = false;
  else if (departing?.invisibleTurns > 0) departing.invisibleTurns -= 1;
  if (departing?.frozenTurns > 0) departing.frozenTurns -= 1;
  if (departing?.powerupBlockedTurns > 0) departing.powerupBlockedTurns -= 1;
  if (departing?.regenTurns > 0 && departing.alive && !departing.teslaDisabledTurns) { departing.health = Math.min(departing.maxHealth, departing.health + 20); departing.regenTurns -= 1; }
  const healingDrone = departing && (game.objects || []).find((object) => object.active && object.type === 'healingDrone' && object.ownerId === departing.id);
  if (healingDrone) { healingDrone.x = departing.x; healingDrone.y = departing.y - 58; healingDrone.groundY = departing.y - 38; if (!departing.teslaDisabledTurns && healingDrone.disabledUntilRound < game.roundNumber) { const before = departing.health; departing.health = Math.min(departing.maxHealth, departing.health + WEAPON_BALANCE.healingDrone.healPerTurn); game.interactionSerial += 1; healingDrone.lastHeal = { serial: game.interactionSerial, amount: departing.health - before }; } healingDrone.turnsLeft -= 1; if (healingDrone.turnsLeft <= 0) healingDrone.active = false; }
  if (departing?.teslaDisabledTurns > 0) departing.teslaDisabledTurns -= 1;
  if (departing?.armorFractureTurns > 0) departing.armorFractureTurns -= 1;
  // A turn can end mid-fall. Physics continues on server ticks until real contact.
  applyFireZones(game);
  game.iceZones = (game.iceZones || []).filter((zone) => zone.expiresRound >= game.roundNumber);
  pulseLightningRods(game);
  pulsePassiveSuperheat(game, departing);
  if (evaluateVictory(game)) return;
  applyOpeningNinjaCloak(game, departing);
  if (completeRoundTurn(room, departing)) return;
  let attempts = 0;
  do { game.turnIndex = (game.turnIndex + 1) % game.players.length; attempts += 1; }
  while (!currentPlayer(game).alive && attempts <= game.players.length);
  game.turnNumber += 1;
  pulseSentinels(game);
  if (evaluateVictory(game)) return;
  if (!currentPlayer(game)?.alive) {
    const survivor = game.players.findIndex((player) => player.alive);
    if (survivor < 0) { game.phase = 'finished'; game.winner = null; return; }
    game.turnIndex = survivor;
  }
  const active = currentPlayer(game); active.turnsPlayed = (active.turnsPlayed || 0) + 1; rechargeArsenal(active); rollElementalBomb(game, active); offerPowerupChoice(room, active);
  active.driveBlocked = false; active.botDriveDirection = null; active.botDriveDistance = 0;
  game.wind = windForTurn(game.seed, game.turnNumber); advanceMeteorologistClouds(game); recordEliminations(game); if (evaluateVictory(game)) return;
  const excavatorMoves = hasPowerupEquipped(active, 'excavator') ? active.inventory.filter((type) => type === 'excavator').length : 0;
  game.actions = { movesLeft: active.teslaDisabledTurns > 0 ? 2 : active.frozenTurns > 0 ? 0 : excavatorMoves > 0 ? 3 : 2, attackAvailable: active.teslaDisabledTurns <= 0 };
  applyTurnClassPassives(game, active);
  if (active.armorFractureTurns > 0) game.actions.movesLeft = Math.max(0, game.actions.movesLeft - 1);
  collectPowerups(game, active);
  const turnStartedAt = Date.now(); const sentryDelay = Math.max(0, (game.lastBattleAnimationUntil || 0) - turnStartedAt);
  game.turnEndsAt = turnStartedAt + sentryDelay + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
  game.botActAt = turnStartedAt + sentryDelay + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed / (game.botSpeed || 1);
  queueArenaPulse(room);
}

export function moveSpecialistDeployable(room, playerId, input = {}) {
  const game = room.game; const player = game && currentPlayer(game);
  if (game?.phase !== 'playing' || player?.id !== playerId || !player.alive || activeClass(player) !== 'specialist') throw new Error('Somente o Especialista pode reposicionar estruturas em seu turno.');
  if (game.shotEndsAt || game.harpoonPull || game.arenaWarningUntil > Date.now()) throw new Error('Aguarde a animação terminar antes de mover a estrutura.');
  const object = game.objects.find((entry) => entry.id === input.objectId && entry.active && ['specialistDrone', 'sentry', 'lightningRod'].includes(entry.type));
  if (!object) throw new Error('Escolha um drone, Sentinela ou Haste ativo.');
  if (object.lastSpecialistMoveTurn === game.turnNumber) throw new Error('Esta estrutura já foi reposicionada neste turno.');
  const radius = CLASS_BALANCE.specialistControlRadius;
  if (Math.hypot(object.x - player.x, object.y - player.y) > radius) throw new Error('A estrutura está fora do alcance de comando.');
  const x = Number(input.x); const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 24 || x > WORLD.width - 24 || y < 28 || y > WORLD.height - 20 || Math.hypot(x - player.x, y - player.y) > radius) throw new Error('Escolha um destino dentro do alcance de comando.');
  const fromX = object.x; const fromY = object.y;
  if (object.type === 'specialistDrone') {
    const hoverY = Math.min(y, terrainY(game.terrain, x) - object.height / 2 - 14);
    if (hoverY < 32 || projectileStructureAt(game.objects.filter((entry) => entry.id !== object.id), x, hoverY)) throw new Error('O drone precisa de espaço livre para sobrevoar.');
    object.x = x; object.y = hoverY; object.groundY = hoverY + object.height / 2;
  } else {
    const platform = game.terrain.floatingPlatforms?.filter((entry) => entry.active && x >= entry.x + 8 && x <= entry.x + entry.width - 8 && Math.abs(y - entry.y) <= 75).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
    if (!platform && !safeGroundAt(game.terrain, x)) throw new Error('Escolha solo ou plataforma segura para esta estrutura.');
    const groundY = platform?.y ?? terrainY(game.terrain, x);
    const centerY = groundY - object.height / 2;
    if (projectileStructureAt(game.objects.filter((entry) => entry.id !== object.id), x, centerY)) throw new Error('Outra estrutura ocupa o destino.');
    object.x = x; object.y = centerY; object.groundY = groundY; object.supportPlatformId = platform?.id || null; object.platformOffset = platform ? x - platform.x : null;
  }
  object.lastSpecialistMoveTurn = game.turnNumber;
  game.specialistMoveSerial += 1;
  game.lastSpecialistMove = { serial: game.specialistMoveSerial, objectId: object.id, type: object.type, fromX, fromY, toX: object.x, toY: object.y, startedAt: Date.now(), duration: 900 };
  object.lastSpecialistMove = game.lastSpecialistMove;
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 900);
  game.turnEndsAt = Math.max(game.turnEndsAt || 0, game.lastBattleAnimationUntil + 1000);
  return object;
}

export function movePlayer(room, playerId, direction, arsenalType = null, options = {}) {
  const game = room.game;
  if (game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.');
  updateMovingPlatforms(game);
  const player = currentPlayer(game);
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (game.phase !== 'playing' || player?.id !== playerId) throw new Error('Não é seu turno.');
  if (player.frozenTurns > 0 && !player.teslaDisabledTurns) throw new Error(`Tanque congelado por mais ${player.frozenTurns} turno(s).`);
  if (tankMotionState(game, player) === TANK_STATE.FLOATING) throw new Error('Aguarde o tanque terminar de flutuar.');
  const vertical = options.vertical > 0 ? 1 : options.vertical < 0 ? -1 : 0;
  const continuous = Boolean(options.continuous && !arsenalType && (player.airborne?.parachute || (!hasPowerupEquipped(player, 'rocketDash') && !hasPowerupEquipped(player, 'excavator'))));
  if (!continuous && game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  if (player.teslaDisabledTurns > 0 && arsenalType) throw new Error('Tesla ativo: apenas movimento normal disponível.');
  const armoredDash = arsenalType === 'armoredDash';
  if (armoredDash && (!player.arsenal?.includes('armoredDash') || (player.ammo?.armoredDash || 0) <= 0)) throw new Error('Investida indisponível.');
  if (game.harpoonAnchor || game.harpoonPull) throw new Error('Use o cabo do arpão ou passe o turno primeiro.');
  if (vertical && !arsenalType && !player.airborne) {
    const ceilingAttached = player.spiderClimb && (player.ceilingClinging || player.surfaceClinging?.side === 'bottom');
    if (vertical > 0 && ceilingAttached) {
      const now = Date.now();
      if (now - (player.lastCeilingDownAt || 0) > 700) { player.lastCeilingDownAt = now; return { kind: 'spiderReleaseArmed' }; }
      player.lastCeilingDownAt = 0; player.ceilingClinging = null; player.surfaceClinging = null; player.wallClinging = null;
      player.y += 4; player.airborne = { vx: 0, vy: 38, falling: true, startY: player.y, minY: player.y, updatedAt: now };
      game.interactionSerial += 1; player.lastMove = { serial: game.interactionSerial, kind: 'spiderRelease', fromX: player.x, fromY: player.y - 4, toX: player.x, toY: player.y };
      return player.lastMove;
    }
    player.lastCeilingDownAt = 0;
    const surface = swimmableWaterSurface(game.terrain, game.waterZones, player.x);
    const ground = terrainY(game.terrain, player.x); const floating = activeClass(player) === 'amphibian' || player.buoyActive;
    if (!continuous || surface === null || player.y + WORLD.tankRadius < surface - 3 || ground - surface < 25) return null;
    if ((player.fuel || 0) <= 0 && !floating) throw new Error('Sem combustível. Recarrega a cada duas rodadas.');
    const now = Date.now();
    if (!options.bot && now - (player.lastDriveAt || 0) < DRIVE.packetMs - 12) return null;
    player.lastDriveAt = now;
    const speed = floating ? CLASS_BALANCE.amphibianSwimSpeed : driveStats(player).speed * .25;
    const fuelRate = floating ? 0 : 1.6;
    const distance = Math.min(speed * (options.bot ? .38 : DRIVE.packetMs / 1000), fuelRate ? player.fuel / fuelRate : Infinity);
    const upperY = surface + (floating ? -WORLD.tankRadius * .45 : WORLD.tankRadius * .65);
    const lowerY = ground - WORLD.tankRadius;
    const nextY = clamp(player.y + vertical * distance, upperY, lowerY);
    if (Math.abs(nextY - player.y) < .1) return null;
    const fromY = player.y; player.y = nextY; player.swimming = true; player.swimDepth = Math.max(0, nextY - (surface - WORLD.tankRadius * .45));
    player.supportPlatformId = null; player.platformOffset = null; player.fuel = Math.max(0, player.fuel - Math.abs(nextY - fromY) * fuelRate);
    player.movingUntil = now + DRIVE.packetMs * 2; player.lastWaterDriftAt = now;
    if (floating && activeClass(player) === 'amphibian') {
      player.swimRiseDistance = vertical < 0 ? (player.swimRiseDistance || 0) + fromY - nextY : 0;
      if (vertical < 0 && nextY <= upperY + 1 && player.swimRiseDistance >= 24) {
        player.swimming = false; player.swimDepth = 0; player.swimRiseDistance = 0;
        player.airborne = { vx: (player.facing || 1) * 32, vy: -180, falling: false, startY: player.y, minY: player.y, updatedAt: now, fromSwimLeap: true };
        game.interactionSerial += 1;
        player.lastSwimLeap = { serial: game.interactionSerial, x: player.x, y: player.y, surfaceY: surface };
      }
    }
    game.interactionSerial += 1; player.lastMove = { serial: game.interactionSerial, kind: 'swim', fromX: player.x, fromY, toX: player.x, toY: nextY, direction: vertical };
    return player.lastMove;
  }
  player.lastCeilingDownAt = 0;
  let dir = direction < 0 ? -1 : 1;
  const drive = driveStats(player);
  if (continuous) {
    const swimmingFreely = (activeClass(player) === 'amphibian' || player.buoyActive) && (player.swimming || waterDepthAt(game.terrain, game.waterZones, player.x, player.y + WORLD.tankRadius) >= 12);
    if ((player.fuel || 0) <= 0 && !swimmingFreely) throw new Error('Sem combustível. Recarrega a cada duas rodadas.');
    const now = Date.now();
    if (!options.bot && now - (player.lastDriveAt || 0) < DRIVE.packetMs - 12) return null;
    player.lastDriveAt = now;
  }
  const boostStacks = player.teslaDisabledTurns > 0 ? 0 : player.inventory.filter((type) => type === 'movementBoost').length;
  const dashIndex = hasPowerupEquipped(player, 'rocketDash') ? player.inventory.indexOf('rocketDash') : -1;
  if (player.airborne) {
    if (player.airborne.parachute && !arsenalType) {
      if ((player.fuel || 0) <= 0) throw new Error('Sem combustível para dirigir o paraquedas.');
      const fuelCost = Math.min(player.fuel, drive.speed * (options.bot ? .38 : DRIVE.packetMs / 1000) * .65);
      player.fuel = Math.max(0, player.fuel - fuelCost);
      player.facing = dir;
      player.airborne.steerDirection = dir;
      player.airborne.steerUntil = Date.now() + 220;
      return { kind: 'parachuteSteer', direction: dir, fuelCost };
    }
    if (!armoredDash && dashIndex < 0) throw new Error('Equipe Arrancada Foguete ou Investida Blindada para combar no ar.');
    const impulse = (armoredDash ? 310 : 0) + (dashIndex >= 0 ? 210 : 0) + boostStacks * 18;
    if (armoredDash) revealNinja(game, player, 'arsenal');
    player.facing = dir; player.airborne.parachute = false; player.airborne.vx += dir * impulse; player.airborne.vy = Math.min(player.airborne.vy, -72); player.airborne.updatedAt = Date.now(); game.actions.movesLeft -= 1;
    if (armoredDash) spendArsenalCharge(player, 'armoredDash');
    if (dashIndex >= 0) { player.inventory.splice(dashIndex, 1); syncEquippedPowerups(player); }
    game.interactionSerial += 1; player.lastAirBoost = { serial: game.interactionSerial, kind: armoredDash && dashIndex >= 0 ? 'doubleDash' : armoredDash ? 'armoredDash' : 'rocketDash', x: player.x, y: player.y, direction: dir, impulse };
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
    return player.lastAirBoost;
  }
  const spiderLeap = arsenalType === 'spider' && !player.spiderClimb;
  if (spiderLeap && (!player.arsenal?.includes('spider') || (player.ammo?.spider || 0) <= 0)) throw new Error('Aranha indisponível.');
  const spiderTarget = spiderLeap ? spiderLeapTarget(game.terrain, player, Number(options.targetX), Number(options.targetY), game.objects) : null;
  if (spiderTarget && !spiderTarget.valid) throw new Error(spiderTarget.reason);
  dir = spiderTarget?.direction ?? dir;
  const wetDrive = continuous && waterDepthAt(game.terrain, game.waterZones, player.x, player.y + WORLD.tankRadius) >= 12;
  const surfaceSwimming = (activeClass(player) === 'amphibian' || player.buoyActive) && (player.swimming || wetDrive);
  const onIce = game.terrain.floatingPlatforms?.some((platform) => platform.active && platform.kind === 'iceSheet' && platform.id === player.supportPlatformId)
    || (game.iceZones || []).some((zone) => zone.expiresRound >= game.roundNumber && Math.abs(player.x - zone.x) <= zone.radius && Math.abs(player.y + WORLD.tankRadius - zone.y) <= 20);
  const wetSpeed = wetDrive && !surfaceSwimming ? .25 : surfaceSwimming ? CLASS_BALANCE.amphibianSwimSpeed / drive.speed : onIce ? 1.18 : 1;
  const wetFuel = surfaceSwimming ? 0 : wetDrive ? 1.6 : onIce ? .9 : 1;
  const distance = continuous ? Math.min(wetFuel > 0 ? player.fuel / wetFuel : Infinity, drive.speed * wetSpeed * (options.bot ? .38 : DRIVE.packetMs / 1000), options.maxDistance ?? Infinity) : movementDistance({ armoredDash, spiderLeap, rocketDash: dashIndex >= 0, boostStacks }); const excavatorIndex = hasPowerupEquipped(player, 'excavator') ? player.inventory.indexOf('excavator') : -1;
  const startX = player.x; const startY = player.y; const dashContacts = new Set(); const dashMineVisits = new Set();
  const previousDamageImmunity = game.damageImmunePlayerIds; if (armoredDash) { game.damageImmunePlayerIds = new Set(previousDamageImmunity || []); game.damageImmunePlayerIds.add(player.id); }
  const onStep = armoredDash ? (x, feet) => {
    for (const target of game.players) if (target.alive && target.id !== player.id && !protectedAlly(game, target, player) && Math.abs(target.x - x) <= 21 && Math.abs(target.y - (feet - WORLD.tankRadius)) <= 34) dashContacts.add(target.id);
    triggerMines(game, x, feet - WORLD.tankRadius, 22, dashMineVisits, player.id);
  } : null;
  const swimX = clamp(player.x + dir * distance, 12, WORLD.width - 12);
  const swimSurface = continuous && (activeClass(player) === 'amphibian' || player.buoyActive || player.swimming) ? swimmableWaterSurface(game.terrain, game.waterZones, swimX) : null;
  const swimPath = swimSurface !== null && (player.swimming || Math.abs(player.y + WORLD.tankRadius - swimSurface) < 32)
    ? { x: swimX, y: clamp(swimSurface - WORLD.tankRadius * .45 + (player.swimDepth || 0), swimSurface - WORLD.tankRadius * .45, terrainY(game.terrain, swimX) - WORLD.tankRadius), feet: null, supportPlatformId: null, moved: Math.abs(swimX - player.x) > .1, climbing: false, safe: true, swimming: true } : null;
  const path = spiderLeap ? spiderTarget.path : armoredDash || excavatorIndex >= 0 ? specialMovePath(game.terrain, player, dir, distance, { armoredDash, excavator: excavatorIndex >= 0, onStep }) : swimPath || walkPath(game.terrain, player.teslaDisabledTurns > 0 ? { ...player, spiderClimb: false } : player, dir, distance, game.objects);
  if (!path.moved) { game.damageImmunePlayerIds = previousDamageImmunity; if (continuous) return null; throw new Error('Inclinação muito alta.'); }
  if (spiderLeap) { spendArsenalCharge(player, 'spider'); player.spiderClimb = true; player.fuel = Math.min(driveStats(player).maxFuel, player.fuel + 90); player.spiderMoves = 2; game.actions.movesLeft = Math.max(game.actions.movesLeft, 3); }
  if (armoredDash || spiderLeap) revealNinja(game, player, 'arsenal');
  const wallBreakPoints = path.wallBreakPoints || [];
  player.x = path.x; player.facing = dir; player.y = path.y; player.supportPlatformId = path.supportPlatformId; player.ceilingClinging = path.ceilingClinging || null; player.surfaceClinging = path.surfaceClinging || null; player.wallClinging = path.wallClinging ?? (path.climbing && !path.ceilingClinging && !path.surfaceClinging ? dir : null); player.swimming = Boolean(path.swimming); player.swimDepth = path.swimming ? Math.max(0, player.y - (swimSurface - WORLD.tankRadius * .45)) : 0;
  player.iceVelocity = onIce && continuous ? dir * Math.min(155, drive.speed * 1.1) : 0;
  player.lastIceDriftAt = Date.now();
  player.movingUntil = Date.now() + (spiderLeap ? 900 : armoredDash ? 760 : continuous ? DRIVE.packetMs * 2 : 480);
  if (!armoredDash && !spiderLeap) { game.interactionSerial += 1; player.lastMove = { serial: game.interactionSerial, kind: path.climbing ? 'spiderClimb' : excavatorIndex >= 0 ? 'excavator' : dashIndex >= 0 ? 'rocketDash' : onIce ? 'iceSlide' : 'tracks', fromX: startX, fromY: startY, toX: player.x, toY: player.y, direction: dir }; }
  if (path.supportPlatformId) {
    const support = game.terrain.floatingPlatforms.find((platform) => platform.id === path.supportPlatformId);
    player.platformOffset = player.x - support.x;
  } else player.platformOffset = null;
  if (continuous) player.fuel = Math.max(0, player.fuel - wetFuel * Math.max(Math.abs(player.x - startX), path.climbing ? Math.abs(player.y - startY) : 0));
  else game.actions.movesLeft -= 1;
  if (armoredDash) {
    const hitPlayerIds = [];
    for (const targetId of dashContacts) {
      const target = game.players.find((entry) => entry.id === targetId && entry.alive); if (!target) continue;
      const previousHealth = target.health; let damage = directDamage(player, target, WEAPON_BALANCE.armoredDash.damage);
      if (target.shieldCharges > 0) { damage = Math.ceil(damage * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
      target.health = Math.max(0, target.health - damage); target.alive = target.health > 0; target.lastDamageSourceId = player.id; target.lastDamageTurn = game.turnNumber; target.lastDamageRound = game.roundNumber; target.x = clamp(target.x + dir * 96, 12, WORLD.width - 12); target.y = terrainY(game.terrain, target.x) - WORLD.tankRadius; target.supportPlatformId = null; target.platformOffset = null;
      player.stats.damage += previousHealth - target.health; reflectDirectDamage(game, target, player, previousHealth - target.health); hitPlayerIds.push(target.id);
    }
    spendArsenalCharge(player, 'armoredDash'); game.interactionSerial += 1; player.lastLaunch = { serial: game.interactionSerial, kind: 'armoredDash', fromX: startX, fromY: startY, toX: player.x, toY: player.y, wallDestroyed: wallBreakPoints.length > 0, wallsDestroyed: wallBreakPoints.length, wallBreakPoints, damage: WEAPON_BALANCE.armoredDash.damage, hitPlayerIds };
  }
  if (spiderLeap) { game.interactionSerial += 1; player.lastLaunch = { serial: game.interactionSerial, kind: 'spiderLeap', fromX: startX, fromY: startY, toX: player.x, toY: player.y, targetX: spiderTarget.targetX, targetY: spiderTarget.targetY, direction: dir, attachedToWall: Boolean(path.attachedToWall), attachedToSurface: Boolean(path.attachedToSurface), surface: path.surface, arcHeight: path.arcHeight }; }
  if (player.spiderClimb) player.spiderMoves = Math.max(0, game.actions.movesLeft);
  if (excavatorIndex >= 0) { player.inventory.splice(excavatorIndex, 1); syncEquippedPowerups(player); }
  if (dashIndex >= 0) { player.inventory.splice(dashIndex, 1); syncEquippedPowerups(player); }
  if (!armoredDash) pushBarrelsOnMove(game, player, startX, dir);
  collectPowerups(game, player);
  triggerLauncher(game, player, dir);
  triggerMines(game, player.x, player.y, 22, new Set(), player.id);
  if (!path.climbing && !path.swimming) settlePlayers(game);
  if (armoredDash) game.damageImmunePlayerIds = previousDamageImmunity;
  if (player.alive) { player.lastSafeX = player.x; player.lastSafeY = player.y; }
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + (spiderLeap || armoredDash || dashIndex >= 0 || excavatorIndex >= 0 ? 2000 : 420 / room.rules.gameSpeed));
  recordEliminations(game);
  if (!player.alive) { nextTurn(room); return; }
  if (!continuous && game.actions.movesLeft === 0) nextTurn(room);
  return path;
}

function pushBarrelsOnMove(game, player, fromX, direction) {
  const left = Math.min(fromX, player.x) - 20; const right = Math.max(fromX, player.x) + 20;
  for (const barrel of game.objects || []) {
    if (barrel.type !== 'barrel' || !barrel.active || barrel.x < left || barrel.x > right || Math.abs(barrel.groundY - (player.y + WORLD.tankRadius)) > 32) continue;
    const destination = clamp(player.x + direction * 38, 18, WORLD.width - 18);
    if (Math.abs(destination - barrel.x) < 8 || terrainY(game.terrain, destination) < barrel.groundY - 18) continue;
    const fromBarrelX = barrel.x;
    barrel.x = destination; barrel.supportPlatformId = null; barrel.platformOffset = null;
    game.interactionSerial += 1; barrel.lastDisplacement = { serial: game.interactionSerial, fromX: fromBarrelX, toX: destination };
  }
  settleScenarioObjects(game);
}

function collectPowerups(game, player) {
  if (!player?.alive) return;
  const magnet = activeClass(player) === 'backpacker';
  for (const item of player.teslaDisabledTurns > 0 ? [] : game.powerups) {
    const range = magnet ? CLASS_BALANCE.backpackerAttractRadius : WORLD.tankRadius + 22;
    if (!item.active || item.revealed === false || Math.hypot(item.x - player.x, item.y - player.y) > range) continue;
    if (magnet && Math.hypot(item.x - player.x, item.y - player.y) > WORLD.tankRadius + 22) { game.interactionSerial += 1; game.pickupAttractions.push({ serial: game.interactionSerial, fromX: item.x, fromY: item.y, toX: player.x, toY: player.y, type: item.type, playerId: player.id }); game.pickupAttractions = game.pickupAttractions.slice(-12); }
    item.active = false;
    grantPowerup(game, player, item.type, item);
  }
  for (const station of game.objects || []) {
    if (station.type !== 'healingStation' || !station.active || player.health >= player.maxHealth) continue;
    if (Math.hypot(player.x - station.x, player.y - (station.groundY - 25)) > 82) continue;
    station.lastHealedTurnByPlayer ||= {};
    if (game.turnNumber - (station.lastHealedTurnByPlayer[player.id] ?? -Infinity) < 3) continue;
    const amount = Math.min(40, player.maxHealth - player.health);
    player.health += amount; station.lastHealedTurnByPlayer[player.id] = game.turnNumber;
    game.interactionSerial += 1; station.lastHeal = { serial: game.interactionSerial, playerId: player.id, amount };
  }
  for (const terminal of game.objects || []) {
    if (terminal.type !== 'ammoTerminal' || !terminal.active) continue;
    const balance = MAP_STRUCTURE_BALANCE.ammoTerminal;
    if (Math.hypot(player.x - terminal.x, player.y - (terminal.groundY - terminal.height / 2)) > balance.radius) continue;
    terminal.lastUsedTurnByPlayer ||= {};
    if (game.turnNumber - (terminal.lastUsedTurnByPlayer[player.id] ?? -Infinity) < balance.cooldownTurns) continue;
    const weapon = (player.arsenal || []).find((type) => !['megaCannon', 'superheat', 'mixer'].includes(type) && (player.ammo[type] || 0) <= 0);
    const beforeFuel = player.fuel || 0; const maxFuel = driveStats(player).maxFuel;
    const fuel = Math.max(0, Math.min(balance.fuel, maxFuel - beforeFuel));
    if (!weapon && fuel <= 0) continue;
    if (weapon) { player.ammo[weapon] = 1; delete player.arsenalLastUsed?.[weapon]; }
    player.fuel = beforeFuel + fuel; terminal.lastUsedTurnByPlayer[player.id] = game.turnNumber;
    game.interactionSerial += 1; terminal.lastRestock = { serial: game.interactionSerial, playerId: player.id, weapon: weapon || null, fuel };
  }
}

function grantPowerup(game, player, type, item = null, announce = true, shared = false) {
  if (type === 'megaCannon') return;
  const arsenalPickup = ARSENAL_ITEMS.includes(type);
  if (announce) { game.pickupSerial += 1; player.lastPickup = { serial: game.pickupSerial, type, category: arsenalPickup ? 'arsenal' : 'powerup', contents: item?.loot || null }; }
  if (type === 'lootbox') {
    for (const reward of item?.loot || []) grantPowerup(game, player, reward, null, false, shared);
    return;
  }
  const allies = teammates(game, player);
  if (!shared && player.classType === 'backpacker' && !BACKPACKER_PASSIVES.has(type)) { if (allies.length) { const ally = [...allies].sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0]; grantPowerup(game, ally, type, item, false, true); game.interactionSerial += 1; player.lastSharedPickup = { serial: game.interactionSerial, type, toId: ally.id }; } else player.health = Math.min(player.maxHealth, player.health + CLASS_BALANCE.backpackerSoloPickupHeal); return; }
  if (arsenalPickup) { if (!player.arsenal.includes(type)) player.arsenal.push(type); if (!['superheat', 'mixer'].includes(type)) player.ammo[type] = (player.ammo[type] || 0) + 1; }
  else if (type === 'heal') { player.health = Math.min(player.maxHealth, player.health + 50 + (player.classType === 'healer' && !allies.length ? 20 : 0)); if (!shared && player.classType === 'healer') for (const ally of allies) ally.health = Math.min(ally.maxHealth, ally.health + 50); }
  else if (type === 'fieldRepair') { const amount = Math.min(25, player.maxHealth - player.health); player.health += amount; const repairs = repairNearbyDeployables(game, player, CLASS_BALANCE.fieldRepairRadius, 2, 2); game.classPulseSerial += 1; game.lastClassPulses.push({ serial: game.classPulseSerial, type: 'fieldRepair', x: player.x, y: player.y, radius: CLASS_BALANCE.fieldRepairRadius, round: game.roundNumber, heals: [{ playerId: player.id, amount }], repairs }); }
  else if (type === 'fireFoam') {
    const radius = CLASS_BALANCE.fireFoamRadius;
    const before = game.fireZones.length;
    game.fireZones = game.fireZones.filter((zone) => zone.source === 'superheat' || Math.hypot(zone.x - player.x, zone.y - player.y) > radius + zone.radius * .35);
    for (const object of game.objects || []) if (object.active && Math.hypot(object.x - player.x, (object.groundY ?? object.y) - player.y) <= radius) object.burningUntilRound = 0;
    for (const platform of game.terrain.floatingPlatforms || []) if (platform.active && Math.hypot(clamp(player.x, platform.x, platform.x + platform.width) - player.x, platform.y - player.y) <= radius) platform.burningUntilRound = 0;
    player.foamGuardUntilRound = Math.max(player.foamGuardUntilRound || 0, game.roundNumber + CLASS_BALANCE.fireFoamProtectionRounds - 1);
    game.classPulseSerial += 1; game.lastClassPulses.push({ serial: game.classPulseSerial, type: 'fireFoam', x: player.x, y: player.y, radius, round: game.roundNumber, extinguished: before - game.fireZones.length });
  }
  else if (type === 'shield') { player.shieldCharges = (player.shieldCharges || 0) + 1; player.shield = true; }
  else if (type === 'movementBoost') { player.inventory.push(type); player.fuel = Math.min(driveStats(player).maxFuel, (player.fuel || 0) + 65); }
  else if (type === 'extraFuel') { player.extraFuelStacks = (player.extraFuelStacks || 0) + 1; player.fuel = Math.min(driveStats(player).maxFuel, (player.fuel || 0) + 90); }
  else if (type === 'invisibility') { player.invisibleTurns = (player.invisibleTurns || 0) + 2; player.invisibilityFresh = true; }
  else if (type === 'excavator') player.inventory.push('excavator', 'excavator', 'excavator');
  else if (type === 'ammoCrate') { for (const weapon of player.arsenal || []) if (!['megaCannon', 'superheat', 'mixer'].includes(weapon)) { player.ammo[weapon] = Math.min(4, (player.ammo[weapon] || 0) + 2); delete player.arsenalLastUsed?.[weapon]; } }
  else if (type === 'repairDrone') { player.regenTurns = (player.regenTurns || 0) + 4; if (!shared && player.classType === 'healer') for (const ally of allies) ally.regenTurns = (ally.regenTurns || 0) + 4; }
  else if (type === 'overcharge') { for (const power of player.arsenal || []) if (!['megaCannon', 'superheat', 'mixer'].includes(power)) player.ammo[power] = 1; }
  else player.inventory.push(type);
}

export function drawPowerupChoices(pool, classType, random, count = 3) {
  const available = [...new Set(pool)]; const choices = []; const favored = new Set(CLASS_POWERUP_SYNERGY[classType] || []);
  while (choices.length < count && available.length) {
    const totalWeight = available.reduce((sum, type) => sum + (favored.has(type) ? CLASS_POWERUP_WEIGHT : 1), 0);
    let pick = Math.min(.999999, Math.max(0, random())) * totalWeight;
    let index = available.findIndex((type) => { pick -= favored.has(type) ? CLASS_POWERUP_WEIGHT : 1; return pick < 0; });
    if (index < 0) index = available.length - 1;
    choices.push(available.splice(index, 1)[0]);
  }
  return choices;
}

function offerPowerupChoice(room, player) {
  const game = room.game;
  if (!player?.alive || player.turnsPlayed % 3 !== 0) return;
  const random = seededRandom(`${game.seed}-reward-${player.turnsPlayed}-${player.id}`); const pool = game.enabledPowerups.filter((type) => POWERUPS.includes(type)); if (!pool.length) return;
  const choices = drawPowerupChoices(pool, player.classType, random);
  player.rewardOffer = { turn: game.turnNumber, playerTurn: player.turnsPlayed, choices, expiresAt: Date.now() + GAME_TIMING.rewardMs };
  if (player.isBot) autoClaimReward(game, player, random);
}

function spendArsenalCharge(player, type) {
  player.ammo[type] -= 1;
  player.arsenalLastUsed ||= {};
  player.arsenalLastUsed[type] = player.turnsPlayed || 1;
}

function rechargeArsenal(player) {
  for (const type of player.arsenal || []) {
    if (type === 'megaCannon' || type === 'superheat' || type === 'mixer' || ELEMENTAL_BOMBS.includes(type) || (player.ammo[type] || 0) > 0) continue;
    const lastUse = player.arsenalLastUsed?.[type] ?? 0;
    if ((player.turnsPlayed || 0) - lastUse >= (ARSENAL_COOLDOWN_TURNS[type] || 3)) player.ammo[type] = 1;
  }
}

function rollElementalBomb(game, player) {
  if (activeClass(player) !== 'elementalist') return null;
  const choices = ELEMENTAL_BOMBS.filter((type) => type !== player.elementalCurrent);
  const random = seededRandom(`${game.seed}-elemental-${player.id}-${game.turnNumber}`);
  const chosen = choices[Math.floor(random() * choices.length)];
  for (const type of ELEMENTAL_BOMBS) player.ammo[type] = type === chosen ? 1 : 0;
  player.elementalCurrent = chosen;
  game.interactionSerial += 1; player.lastElementalDraw = { serial: game.interactionSerial, type: chosen, turn: game.turnNumber };
  return chosen;
}

function advanceMeteorologistClouds(game) {
  for (const cloud of game.weatherClouds || []) {
    const owner = game.players.find((player) => player.id === cloud.ownerId && player.alive);
    if (!owner) continue;
    const enemies = game.players.filter((player) => player.alive && player.id !== owner.id && !areAllies(game, player, owner));
    const target = enemies.sort((a, b) => Math.abs(a.x - cloud.x) - Math.abs(b.x - cloud.x))[0];
    if (game.turnNumber > (cloud.activatedTurn ?? 1)) {
      const windDirection = Math.sign(game.wind || 0);
      const targetDirection = Math.sign((target?.x ?? owner.x) - cloud.x);
      const direction = windDirection || targetDirection;
      const drift = windDirection
        ? Math.min(CLASS_BALANCE.meteorologistCloudSpeed, Math.abs(game.wind) * 7 + (targetDirection === windDirection ? 32 : 0))
        : Math.min(72, Math.abs((target?.x ?? owner.x) - cloud.x));
      cloud.x = clamp(cloud.x + direction * drift, cloud.radius, playableWidth(game.terrain) - cloud.radius);
    }
    cloud.y = Math.max(72, Math.min(owner.y, target?.y ?? owner.y) - 175); cloud.turn = game.turnNumber; cloud.lastStrike = null;
    game.fireZones = (game.fireZones || []).filter((zone) => Math.abs(zone.x - cloud.x) > cloud.radius + zone.radius * .35);
    const random = seededRandom(`${game.seed}-weather-cloud-${cloud.ownerId}-${game.turnNumber}`);
    if (!target || Math.abs(target.x - cloud.x) > cloud.radius || random() >= CLASS_BALANCE.meteorologistCloudLightningChance) continue;
    const x = clamp(target.x + (random() - .5) * 70, 20, playableWidth(game.terrain) - 20); const y = terrainY(game.terrain, x);
    const damage = applyExplosion(game, x, y, 64, 26, { sourcePlayerId: owner.id, eventType: 'lightning', attackType: 'weatherCloud', pushMultiplier: .35 });
    const interactions = activateScenarioObjects(game, x, y, 92, new Set(), owner.id);
    for (const tree of game.objects || []) if (tree.active && TREE_TYPES.has(tree.type) && Math.abs(tree.x - x) <= 100) igniteTree(game, tree, { x, y, radius: 92, turnsLeft: 2, ownerId: owner.id });
    game.interactionSerial += 1; cloud.lastStrike = { serial: game.interactionSerial, x, y, targetId: target.id, damage, interactions, startedAt: Date.now() }; game.lastWeatherCloudStrike = cloud.lastStrike;
  }
}

function scheduleWeatherCloudDispersals(game, result, speed, mirrorDelay = 0) {
  const path = result.path || [];
  if (!path.length) return;
  const now = Date.now();
  for (const cloud of game.weatherClouds || []) {
    if (cloud.dispersesAt) continue;
    const index = path.findIndex((point) => Math.abs(point.x - cloud.x) <= cloud.radius * .42 && point.y >= cloud.y - cloud.radius * .31 && point.y <= cloud.y + cloud.radius * .14);
    if (index < 0) continue;
    cloud.dispersesAt = now + Math.ceil((index / SHOT_PATH_RATE / speed + mirrorDelay) * 1000);
    result.cloudDispersals ||= [];
    result.cloudDispersals.push({ id: cloud.id, x: cloud.x, y: cloud.y, pathIndex: index });
  }
}

function updateWeatherCloudDispersals(game, now) {
  const dispersed = (game.weatherClouds || []).filter((cloud) => cloud.dispersesAt && now >= cloud.dispersesAt);
  if (!dispersed.length) return false;
  game.weatherClouds = game.weatherClouds.filter((cloud) => !dispersed.includes(cloud));
  for (const cloud of dispersed) {
    game.interactionSerial += 1;
    game.lastWeatherCloudDispersals.push({ serial: game.interactionSerial, id: cloud.id, ownerId: cloud.ownerId, x: cloud.x, y: cloud.y, startedAt: now });
  }
  game.lastWeatherCloudDispersals = game.lastWeatherCloudDispersals.slice(-12);
  return true;
}

function autoClaimReward(game, player, random = seededRandom(`${game.seed}-auto-reward-${player.id}-${player.rewardOffer?.playerTurn}`)) { if (!player.rewardOffer) return; grantPowerup(game, player, player.rewardOffer.choices[Math.floor(random() * player.rewardOffer.choices.length)]); player.rewardOffer = null; }

export function claimReward(room, playerId, type) {
  const player = room.game?.players.find((entry) => entry.id === playerId);
  if (!player?.alive || currentPlayer(room.game)?.id !== playerId || !player.rewardOffer?.choices.includes(type)) throw new Error('Recompensa indisponível.');
  grantPowerup(room.game, player, type); player.rewardOffer = null;
}

function dryTreeGround(terrain, lakes, x, width) {
  if (!Number.isFinite(x) || !safeGroundAt(terrain, x)) return false;
  const halfWidth = Math.ceil(width / 2) + 4;
  for (let offset = -halfWidth; offset <= halfWidth; offset += 8) {
    const column = x + offset;
    if (column < 0 || column >= playableWidth(terrain) || waterDepthAt(terrain, lakes, column, terrainY(terrain, column)) >= 8) return false;
  }
  return waterDepthAt(terrain, lakes, x + halfWidth, terrainY(terrain, x + halfWidth)) < 8;
}

function plantTree(terrain, lakes, objects, size, x, random, id) {
  const balance = TREE_BALANCE[size];
  if (!dryTreeGround(terrain, lakes, x, balance.width * 1.12)) return null;
  const groundY = terrainY(terrain, x);
  const widthScale = .88 + random() * .24; const heightScale = .86 + random() * .28;
  const width = Math.round(balance.width * widthScale); const height = Math.round(balance.height * heightScale);
  const tree = {
    id, type: `tree${size[0].toUpperCase()}${size.slice(1)}`, treeSize: size, x, groundY, y: groundY - height / 2,
    width, height, durability: balance.durability, maxDurability: balance.durability, active: true,
    canopyRadius: size === 'small' ? Math.round(balance.coverRadius * widthScale) : Math.round(width * (size === 'large' ? 2.9 : .72)),
    crownWidth: size === 'large' ? Math.round(balance.crownWidth * widthScale) : undefined,
    foliageSeed: Math.floor(random() * 10000), flammability: size === 'small' ? 3 : size === 'medium' ? 2 : 1.5,
  };
  objects.push(tree);
  if (size !== 'large') return tree;
  const chunkWidth = 46; const mainY = Math.round(groundY - height * .54); const crownWidth = tree.crownWidth;
  const rows = [
    { key: 'main', left: x - crownWidth * .5, width: crownWidth, y: mainY },
    { key: 'upper-left', left: x - crownWidth * .42, width: crownWidth * .34, y: mainY - 105 },
    { key: 'upper-right', left: x + crownWidth * .08, width: crownWidth * .34, y: mainY - 105 },
    { key: 'lower-left', left: x - crownWidth * .43, width: crownWidth * .28, y: mainY + 92 },
    { key: 'lower-right', left: x + crownWidth * .15, width: crownWidth * .28, y: mainY + 92 },
  ];
  tree.branchRows = rows.map((row) => ({ ...row, left: Math.round(row.left), width: Math.round(row.width) }));
  for (const row of tree.branchRows) {
    const chunks = Math.max(2, Math.ceil(row.width / chunkWidth)); const actualWidth = row.width / chunks;
    for (let index = 0; index < chunks; index += 1) {
      const branchX = Math.round(row.left + actualWidth * index); const branchWidth = Math.ceil(actualWidth) + 1;
      terrain.floatingPlatforms.push({
        id: `${id}-branch-${row.key}-${index}`, treeId: id, branchRow: row.key, kind: 'treeBranch',
        baseX: branchX, x: branchX, y: row.y, width: branchWidth, height: 12, moving: false,
        amplitude: 0, period: 0, phase: 0, durability: balance.branchDurability, maxDurability: balance.branchDurability, active: true,
      });
    }
  }
  return tree;
}

export function growFloraCluster(game, seed, clusterIndex = 0) {
  const random = seededRandom(`${game.seed}-flora-growth-${game.turnNumber}-${clusterIndex}-${seed.x}`);
  if (game.terrain.type === 'technology') {
    const grown = [];
    const types = ['radar', 'shockCoil', 'ammoTerminal'];
    for (let index = 0; index < types.length; index += 1) {
      const preferred = seed.x + (index - 1) * 86 + (random() - .5) * 24;
      let x = null;
      for (let step = 0; step < Math.ceil(playableWidth(game.terrain) / 8); step += 1) {
        const direction = step % 2 ? -1 : 1;
        const candidate = Math.round(clamp(preferred + direction * Math.ceil(step / 2) * 16, 45, playableWidth(game.terrain) - 45));
        if (!dryTreeGround(game.terrain, game.waterZones, candidate, 70)) continue;
        if (game.players.some((player) => player.alive && Math.abs(player.x - candidate) < 70 && Math.abs(player.y - terrainY(game.terrain, candidate)) < 100)) continue;
        if (game.objects.some((object) => object.active && Math.abs(object.x - candidate) < (object.width || 40) / 2 + 38 && Math.abs((object.groundY || object.y) - terrainY(game.terrain, candidate)) < 95)) continue;
        x = candidate; break;
      }
      if (x === null) continue;
      const type = types[index]; const groundY = terrainY(game.terrain, x); const height = type === 'shockCoil' ? 76 : type === 'radar' ? 68 : 68;
      const balance = MAP_STRUCTURE_BALANCE.ammoTerminal;
      const object = { id: `flora-tech-${game.turnNumber}-${clusterIndex}-${index}`, type, x, y: groundY - height / 2, groundY, width: type === 'radar' ? 62 : type === 'shockCoil' ? 54 : 68, height, durability: type === 'ammoTerminal' ? balance.durability : 2, active: true };
      if (type === 'ammoTerminal') object.serviceRadius = balance.radius;
      game.objects.push(object); grown.push(object.id);
    }
    return grown;
  }
  const kinds = seed.cluster === 'ancestral' ? ['large', 'small', 'small', 'medium'] : seed.cluster === 'dense' ? ['medium', 'medium', 'small', 'small', 'small'] : ['small', 'small', 'small', 'small', 'medium'];
  const grown = [];
  for (let index = 0; index < kinds.length; index += 1) {
    const size = kinds[index]; const spread = seed.cluster === 'ancestral' ? 245 : seed.cluster === 'dense' ? 180 : 150;
    let x = clamp(Math.round(seed.x + (index - (kinds.length - 1) / 2) * spread / Math.max(1, kinds.length - 1) + (random() - .5) * 38), 45, WORLD.width - 45);
    for (let attempt = 0; attempt < 10 && !dryTreeGround(game.terrain, game.waterZones, x, TREE_BALANCE[size].width * 1.12); attempt += 1) x = clamp(Math.round(seed.x + (random() - .5) * spread * 1.25), 45, playableWidth(game.terrain) - 45);
    const tree = plantTree(game.terrain, game.waterZones, game.objects, size, x, random, `flora-${game.turnNumber}-${clusterIndex}-${index}`);
    if (tree) grown.push(tree.id);
  }
  return grown;
}

const TREE_TYPES = new Set(['treeSmall', 'treeMedium', 'treeLarge']);
function destroyTree(game, object, sourcePlayerId = null) {
  object.active = false;
  if (object.type === 'treeLarge') for (const branch of game.terrain.floatingPlatforms || []) if (branch.treeId === object.id) branch.active = false;
  if (['treeMedium', 'treeLarge'].includes(object.type)) {
    const count = object.type === 'treeLarge' ? 5 : 3; const canopyTop = object.groundY - object.height;
    for (let index = 0; index < count; index += 1) {
      const branch = index >= Math.ceil(count / 2); const direction = index % 2 ? 1 : -1; const width = branch ? Math.max(30, Math.round((object.crownWidth || object.width) * (.27 + index * .025))) : Math.max(18, Math.round(object.width * .5)); const height = branch ? 10 : Math.max(24, Math.round(object.height / (count + 1)));
      const x = clamp(object.x + direction * (branch ? object.width * (.35 + index * .08) : object.width * .12), 18, playableWidth(game.terrain) - 18); const groundY = canopyTop + object.height * (.24 + index / (count + 1) * .5);
      game.objects.push({ id: `${object.id}-debris-${game.interactionSerial}-${index}`, type: 'woodDebris', fragmentKind: branch ? 'branch' : 'trunk', sourceTreeId: object.id, sourcePlayerId, x, y: groundY - height / 2, groundY, width, height, durability: 1, active: true, rotation: direction * (.18 + index * .12), driftDirection: direction });
    }
  }
  if (sourcePlayerId) awardDestruction(game, sourcePlayerId, object.type);
}

function createScenarioObjects(terrain, spawns, random) {
  const arenaWidth = playableWidth(terrain);
  const objects = []; const occupied = [...spawns.map((spawn) => spawn.x)];
  const dryFootprint = (x, width) => {
    for (let column = Math.round(x - width / 2); column <= x + width / 2; column += 8) {
      if (column < 0 || column >= arenaWidth || waterDepthAt(terrain, terrain.initialWaterZones, column, terrainY(terrain, column)) >= 8) return false;
    }
    return true;
  };
  const position = (minimumDistance = 100, footprint = 0) => {
    for (const spacing of [minimumDistance, Math.max(72, minimumDistance * arenaWidth / WORLD.width), 72]) {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const x = Math.round(90 + random() * (arenaWidth - 180));
        if (!safeGroundAt(terrain, x) || footprint && !dryFootprint(x, footprint) || occupied.some((entry) => Math.abs(entry - x) < spacing)) continue;
        occupied.push(x); return x;
      }
    }
    return null;
  };
  const signaturePlatform = terrain.type === 'skylands' ? terrain.floatingPlatforms.find((entry) => entry.kind === 'skyIsland') : null;
  const signatureX = signaturePlatform ? Math.round(signaturePlatform.x + signaturePlatform.width / 2) : position(225, BIOMES[terrain.type]?.signature === 'building' ? 150 : 0);
  if (signatureX !== null) {
    const x = signatureX; const groundY = signaturePlatform?.y ?? terrainY(terrain, x); const type = BIOMES[terrain.type]?.signature;
    if (type === 'building') objects.push({ id: 'biome-signature', type, x, y: groundY - 112, groundY, width: 150, height: 224, durability: 3, active: true });
    if (type === 'concrete') objects.push({ id: 'biome-signature', type, x, y: groundY - 7, groundY, width: 145, active: true });
    if (type === 'fuelTank') objects.push({ id: 'biome-signature', type, x, y: groundY - 22, groundY, width: 34, height: 44, durability: 2, active: true });
    if (type === 'radar') objects.push({ id: 'biome-signature', type, x, y: groundY - 34, groundY, width: 62, height: 68, durability: 2, active: true, supportPlatformId: signaturePlatform?.id || null, platformOffset: signaturePlatform ? x - signaturePlatform.x : null });
    if (type === 'launcher') objects.push({ id: 'biome-signature', type, x, y: groundY - 4, groundY, direction: random() < .5 ? -1 : 1, active: true, cooldownUntilTurn: 0 });
    if (type === 'crane') { const height = 255; const armLength = 205; const direction = random() < .5 ? -1 : 1; objects.push({ id: 'biome-signature', type, x, y: groundY - height / 2, groundY, height, armLength, direction, ballX: x + direction * (armLength - 24), ballY: groundY - 140, ballRadius: 28, towerDurability: 2, cableIntact: true, ballReleased: false, active: true }); }
  }
  for (let index = 0; index < 3; index += 1) { const x = position(150); if (x === null) continue; const groundY = terrainY(terrain, x); objects.push({ id: `cache-${index}`, type: 'supplyCache', x, y: groundY - 22, groundY, width: 54, height: 44, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(160); if (x === null) continue; const groundY = terrainY(terrain, x); objects.push({ id: `coil-${index}`, type: 'shockCoil', x, y: groundY - 38, groundY, width: 54, height: 76, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) {
    const x = position(175); if (x === null) continue; const groundY = terrainY(terrain, x);
    if (index === 1) { const balance = MAP_STRUCTURE_BALANCE.shieldGenerator; objects.push({ id: 'shield-generator-0', type: 'shieldGenerator', x, y: groundY - 43, groundY, width: 72, height: 86, durability: balance.durability, shieldEnergy: balance.energy, shieldRadius: balance.radius, active: true }); }
    else if (index === 2) { const balance = MAP_STRUCTURE_BALANCE.ammoTerminal; objects.push({ id: 'ammo-terminal-0', type: 'ammoTerminal', x, y: groundY - 34, groundY, width: 68, height: 68, durability: balance.durability, serviceRadius: balance.radius, active: true }); }
    else objects.push({ id: `healing-${index}`, type: 'healingStation', x, y: groundY - 36, groundY, width: 70, height: 72, durability: 3, active: true });
  }
  const treePosition = (minimumDistance, treeWidth) => {
    for (const relaxation of [1, .72, .48, .3]) for (let attempt = 0; attempt < 260; attempt += 1) {
      const x = Math.round(55 + random() * (arenaWidth - 110));
      if (!dryTreeGround(terrain, terrain.initialWaterZones, x, treeWidth * 1.12) || spawns.some((spawn) => Math.abs(spawn.x - x) < 58) || occupied.some((entry) => Math.abs(entry - x) < minimumDistance * relaxation) || objects.some((object) => object.active && Math.abs(object.x - x) < (object.width || 32) / 2 + treeWidth / 2 + 8)) continue;
      occupied.push(x); return x;
    }
    const candidates = [];
    for (let x = 55; x < arenaWidth - 55; x += 7) if (dryTreeGround(terrain, terrain.initialWaterZones, x, treeWidth * 1.12) && spawns.every((spawn) => Math.abs(spawn.x - x) >= 58) && objects.every((object) => !object.active || Math.abs(object.x - x) >= (object.width || 32) / 2 + treeWidth / 2 + 8)) candidates.push({ x, clearance: Math.min(...occupied.map((entry) => Math.abs(entry - x))) });
    const best = candidates.sort((a, b) => b.clearance - a.clearance)[0]; if (!best) return null; occupied.push(best.x); return best.x;
  };
  if (terrain.type === 'technology') {
    // Functional equipment replaces vegetation in Tecnopolis, including small arenas.
    const installations = ['radar', 'shockCoil', 'shieldGenerator', 'repulsor', 'ammoTerminal', 'radar', 'shockCoil', 'supplyCache'];
    installations.forEach((type, index) => {
      const width = type === 'shieldGenerator' ? 72 : type === 'repulsor' ? 70 : type === 'ammoTerminal' ? 68 : type === 'radar' ? 62 : 54;
      const height = type === 'shieldGenerator' ? 86 : type === 'repulsor' || type === 'shockCoil' ? 76 : type === 'radar' || type === 'ammoTerminal' ? 68 : 44;
      const x = position(90, width); if (x === null) return;
      const groundY = terrainY(terrain, x); const balance = MAP_STRUCTURE_BALANCE[type];
      const object = { id: `tech-installation-${index}`, type, x, y: groundY - height / 2, groundY, width, height, durability: balance?.durability || 2, active: true };
      if (type === 'shieldGenerator') { object.shieldEnergy = balance.energy; object.shieldRadius = balance.radius; }
      if (type === 'repulsor') object.pulseRadius = balance.radius;
      if (type === 'ammoTerminal') object.serviceRadius = balance.radius;
      objects.push(object);
    });
  } else {
    for (let index = 0; index < 2; index += 1) { const x = treePosition(250, TREE_BALANCE.large.width); if (x !== null) plantTree(terrain, terrain.initialWaterZones, objects, 'large', x, random, `tree-large-${index}`); }
    for (let index = 0; index < 5; index += 1) { const x = treePosition(90, TREE_BALANCE.medium.width); if (x !== null) plantTree(terrain, terrain.initialWaterZones, objects, 'medium', x, random, `tree-medium-${index}`); }
    for (let index = 0; index < 9; index += 1) { const x = treePosition(52, TREE_BALANCE.small.width); if (x !== null) plantTree(terrain, terrain.initialWaterZones, objects, 'small', x, random, `tree-small-${index}`); }
  }
  { const x = position(115); if (x !== null) { const groundY = terrainY(terrain, x); const balance = MAP_STRUCTURE_BALANCE.repulsor; objects.push({ id: 'repulsor-0', type: 'repulsor', x, y: groundY - 38, groundY, width: 70, height: 76, durability: balance.durability, pulseRadius: balance.radius, active: true }); } }
  for (let index = 0; index < 7; index += 1) { const x = position(115); if (x !== null) { const groundY = terrainY(terrain, x); objects.push({ id: `barrel-${index}`, type: 'barrel', x, y: groundY - 8, groundY, active: true }); } }
  for (let index = 0; index < 4; index += 1) { const x = position(150); if (x) { const groundY = terrainY(terrain, x); objects.push({ id: `launcher-${index}`, type: 'launcher', x, y: groundY - 4, groundY, direction: random() < .5 ? -1 : 1, active: true, cooldownUntilTurn: 0 }); } }
  for (let index = 0; index < 3; index += 1) {
    const switchX = position(190); if (!switchX) continue; const direction = random() < .5 ? -1 : 1; const rampX = Math.round(clamp(switchX + direction * (115 + random() * 100), 65, arenaWidth - 235));
    const rampGroundY = terrainY(terrain, rampX); const switchGroundY = terrainY(terrain, switchX); const ramp = { id: `ramp-${index}`, type: 'ramp', x: rampX, y: rampGroundY, groundY: rampGroundY, width: 170, direction, active: false };
    objects.push(ramp, { id: `switch-${index}`, type: 'switch', x: switchX, y: switchGroundY - 5, groundY: switchGroundY, targetId: ramp.id, active: true, pressed: false });
  }
  for (let index = 0; index < 5; index += 1) { const width = 96 + Math.round(random() * 64); const x = position(235, width); if (!x) continue; const groundY = terrainY(terrain, x); const height = 150 + Math.round(random() * 95); objects.push({ id: `building-${index}`, type: 'building', x, y: groundY - height / 2, groundY, width, height, durability: 3, techFacade: terrain.type === 'technology', active: true }); }
  if (terrain.type !== 'technology') for (let index = 0; index < 3; index += 1) { const x = position(210); if (!x) continue; const groundY = terrainY(terrain, x); const direction = random() < .5 ? -1 : 1; const height = 220 + Math.round(random() * 70); const armLength = 170 + Math.round(random() * 50); const ballRadius = 28; const ballY = groundY - Math.round(height * (.42 + random() * .16)); objects.push({ id: `crane-${index}`, type: 'crane', x, y: groundY - height / 2, groundY, height, armLength, direction, ballX: x + direction * (armLength - 24), ballY, ballRadius, towerDurability: 2, cableIntact: true, ballReleased: false, active: true }); }
  for (let index = 0; index < 6; index += 1) { const x = position(105); if (!x) continue; const groundY = terrainY(terrain, x); objects.push({ id: `concrete-${index}`, type: 'concrete', x, y: groundY - 70, groundY, width: 90 + Math.round(random() * 55), active: true }); }
  for (let index = 0; index < 4; index += 1) { const x = position(145); if (!x) continue; const groundY = terrainY(terrain, x); objects.push({ id: `fuel-${index}`, type: 'fuelTank', x, y: groundY - 22, groundY, width: 34, height: 44, durability: 2, active: true }); }
  if (terrain.type !== 'technology') for (let index = 0; index < 3; index += 1) { const x = position(190); if (!x) continue; const groundY = terrainY(terrain, x); const height = 125 + Math.round(random() * 45); objects.push({ id: `watchtower-${index}`, type: 'watchtower', x, y: groundY - height / 2, groundY, width: 72, height, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(155); if (!x) continue; const groundY = terrainY(terrain, x); objects.push({ id: `radar-${index}`, type: 'radar', x, y: groundY - 34, groundY, width: 62, height: 68, durability: 2, active: true }); }
  const elevatedPlatforms = [...(terrain.floatingPlatforms || [])].filter((platform) => platform.active && !platform.moving && platform.width >= 125 && spawns.every((spawn) => spawn.supportPlatformId !== platform.id)).sort((a, b) => Number(Boolean(b.skyDeck)) - Number(Boolean(a.skyDeck)) || random() - .5).slice(0, 6);
  elevatedPlatforms.forEach((platform, index) => {
    const x = Math.round(platform.x + platform.width / 2); if (spawns.some((spawn) => Math.abs(spawn.x - x) < 85 && Math.abs(spawn.y - platform.y) < 95)) return; occupied.push(x); const groundY = platform.y; const support = { supportPlatformId: platform.id, platformOffset: x - platform.x };
    if (index % 3 === 0) { const width = Math.min(platform.width - 24, 86 + Math.round(random() * 34)); const height = 105 + Math.round(random() * 65); objects.push({ id: `sky-building-${index}`, type: 'building', x, y: groundY - height / 2, groundY, width, height, durability: 3, techFacade: terrain.type === 'technology', active: true, ...support }); }
    else if (terrain.type === 'technology') {
      const type = index % 3 === 1 ? 'shockCoil' : 'ammoTerminal'; const height = type === 'shockCoil' ? 76 : 68;
      objects.push({ id: `sky-tech-${index}`, type, x, y: groundY - height / 2, groundY, width: type === 'shockCoil' ? 54 : 68, height, durability: type === 'ammoTerminal' ? MAP_STRUCTURE_BALANCE.ammoTerminal.durability : 2, serviceRadius: type === 'ammoTerminal' ? MAP_STRUCTURE_BALANCE.ammoTerminal.radius : undefined, active: true, ...support });
    }
    else if (index % 3 === 1) objects.push({ id: `sky-barrel-${index}`, type: 'barrel', x, y: groundY - 8, groundY, active: true, ...support });
    else objects.push({ id: `sky-concrete-${index}`, type: 'concrete', x, y: groundY - 7, groundY, width: Math.min(platform.width - 18, 100 + Math.round(random() * 35)), active: true, ...support });
  });
  return objects;
}

function collapseBuilding(game, object, sourcePlayerId = null) {
  const fragments = []; const count = clamp(Math.round(object.width * object.height / 2600), 8, 16); const top = object.groundY - object.height;
  for (let index = 0; index < count; index += 1) {
    const column = (index % 4 + .5) / 4; const row = (Math.floor(index / 4) + .5) / Math.ceil(count / 4); const startX = object.x - object.width / 2 + object.width * column; const startY = top + object.height * Math.min(.9, row); const direction = index % 2 ? 1 : -1; const angle = 8 + index % 4 * 9; const power = 95 + index % 5 * 18;
    const result = simulateShot({ terrain: game.terrain, players: game.players, powerups: [], x: startX, y: startY, angle, power, gravity: game.gravity || 120, wind: (game.wind || 0) * .35, direction });
    if (!result.path.length) continue; const impact = result.impact || result.path.at(-1); const size = 7 + index % 4 * 2; fragments.push({ id: `${object.id}-fragment-${index}`, path: result.path, impact: { x: Math.round(impact.x), y: Math.round(impact.y) }, size });
    if (result.impact) { const damage = applyExplosion(game, impact.x, impact.y, size + 5, 8 + index % 4 * 3, { pushMultiplier: .35, sourcePlayerId }); awardExplosionDestruction(game, sourcePlayerId, damage); }
  }
  return fragments;
}

export function activateScenarioObjects(game, x, y, radius, visited = new Set(), sourcePlayerId = null) {
  const interactions = releaseGraveLoot(game, x, y, radius);
  for (const object of game.objects || []) {
    let cableHit = false; let towerHit = false;
    if (object.type === 'crane') {
      const height = object.height || 220; const armLength = object.armLength || 180; const top = object.groundY - height; const armEndX = object.x + (object.direction || 1) * armLength;
      const cableDistance = object.cableIntact === false ? Infinity : Math.min(pointSegmentDistance(x, y, object.ballX, top, object.ballX, object.ballY - (object.ballRadius || 28)), Math.hypot(object.ballX - x, object.ballY - y));
      const towerDistance = object.active === false ? Infinity : Math.min(pointSegmentDistance(x, y, object.x, object.groundY, object.x, top), pointSegmentDistance(x, y, object.x, top, armEndX, top));
      cableHit = cableDistance <= radius + 28; towerHit = towerDistance <= radius + 12;
      if (!cableHit && !towerHit) continue;
    } else if (['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'lightningRod', 'healingStation', 'sentry', 'specialistDrone', 'healingDrone', 'ammoTerminal', 'shieldGenerator', 'repulsor', 'treeSmall', 'treeMedium', 'treeLarge'].includes(object.type)) { const left = object.x - object.width / 2; const right = object.x + object.width / 2; const top = object.groundY - object.height; if (x + radius < left || x - radius > right || y + radius < top || y - radius > object.groundY) continue; }
    else if (Math.hypot(object.x - x, object.y - y) > radius + 18) continue;
    if (visited.has(object.id)) continue;
    visited.add(object.id);
    if (TREE_TYPES.has(object.type) && object.active) {
      object.durability = Math.max(0, object.durability - 1); object.lastTreeHit = { x, y, round: game.roundNumber };
      interactions.push({ type: 'treeHit', id: object.id, treeSize: object.treeSize, x, y, durability: object.durability });
      if (!object.durability) { destroyTree(game, object, sourcePlayerId); interactions.push({ type: 'treeFall', id: object.id, treeSize: object.treeSize, x: object.x, y: object.groundY, width: object.crownWidth || object.width, height: object.height }); }
    }
    if (object.type === 'barrel' && object.active) {
      object.active = false; const blastY = object.groundY - 5;
      const blastRadius = 100;
      const damage = applyExplosion(game, object.x, blastY, blastRadius, 78, { pushMultiplier: 1.45, sourcePlayerId }); awardExplosionDestruction(game, sourcePlayerId, damage); awardDestruction(game, sourcePlayerId, 'barrel'); interactions.push({ type: 'barrel', id: object.id, x: object.x, y: blastY, radius: blastRadius });
      const incendiary = activeClass(game.players.find((entry) => entry.id === sourcePlayerId)) === 'incendiary';
      game.interactionSerial += 1; game.fireZones.push({ id: `barrel-fire-${game.interactionSerial}`, x: object.x, y: blastY, radius: 88, turnsLeft: 3 + (incendiary ? CLASS_BALANCE.incendiaryFireExtraRounds : 0), ownerId: sourcePlayerId, source: 'barrel', incendiary });
      interactions.push(...activateScenarioObjects(game, object.x, blastY, blastRadius + 18, visited, sourcePlayerId));
    }
    if (object.type === 'switch' && !object.pressed) {
      object.pressed = true; const ramp = game.objects.find((entry) => entry.id === object.targetId);
      if (ramp) { raiseRamp(game.terrain, ramp); interactions.push({ type: 'ramp', id: ramp.id, x: ramp.x, y: ramp.y }); }
      interactions.push({ type: 'switch', id: object.id, x: object.x, y: object.y });
    }
    if (object.type === 'building' && object.active) {
      object.durability -= 1; interactions.push({ type: 'buildingHit', id: object.id, x, y, durability: object.durability });
      if (object.durability <= 0) { object.active = false; const fragments = collapseBuilding(game, object, sourcePlayerId); applyStructureCrush(game, object.x, object.groundY, object.width * .68, 38, sourcePlayerId); awardDestruction(game, sourcePlayerId, 'building'); interactions.push({ type: 'buildingCollapse', id: object.id, x: object.x, y: object.groundY, width: object.width, height: object.height, fragments }); }
    }
    if (object.type === 'fuelTank' && object.active) {
      object.durability -= 1; interactions.push({ type: 'fuelTankHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (object.durability <= 0) { object.active = false; const damage = applyExplosion(game, object.x, object.groundY - 8, 92, 72, { pushMultiplier: 1.45, sourcePlayerId }); awardExplosionDestruction(game, sourcePlayerId, damage); awardDestruction(game, sourcePlayerId, 'fuelTank'); interactions.push({ type: 'fuelTankBlast', id: object.id, x: object.x, y: object.groundY - 8, radius: 92 }); interactions.push(...activateScenarioObjects(game, object.x, object.groundY - 8, 110, visited, sourcePlayerId)); }
    }
    if (object.type === 'supplyCache' && object.active) {
      object.durability -= 1; interactions.push({ type: 'supplyCacheHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (object.durability <= 0) {
        object.active = false; awardDestruction(game, sourcePlayerId, 'supplyCache');
        const pool = (game.enabledPowerups || []).filter((type) => COLLECTIBLE_ITEMS.includes(type)); const random = seededRandom(`${game.seed}-${object.id}-${game.turnNumber}-cache`); const drops = [];
        for (let index = 0; index < Math.min(2, pool.length); index += 1) {
          const px = clamp(object.x + (index ? 37 : -37), 20, WORLD.width - 20); const type = pool[Math.floor(random() * pool.length)]; const pickup = { id: `${object.id}-drop-${index}`, type, x: px, y: terrainY(game.terrain, px) - 12, revealed: true, buried: false, active: true };
          game.powerups.push(pickup); drops.push({ id: pickup.id, type, x: px, y: pickup.y });
        }
        interactions.push({ type: 'supplyCacheOpen', id: object.id, x: object.x, y: object.y, drops });
      }
    }
    if (object.type === 'shockCoil' && object.active) {
      object.durability -= 1; interactions.push({ type: 'shockCoilHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (object.durability <= 0) {
        object.active = false; const pulseY = object.groundY - object.height / 2; const pulseRadius = 180;
        const damage = applyExplosion(game, object.x, pulseY, pulseRadius, 36, { noTerrain: true, attackType: 'shockCoil', sourcePlayerId, pushMultiplier: .35 });
        awardExplosionDestruction(game, sourcePlayerId, damage); awardDestruction(game, sourcePlayerId, 'shockCoil');
        for (const player of game.players) if (player.alive && player.classType !== 'saboteur' && Math.hypot(player.x - object.x, player.y - pulseY) <= pulseRadius) player.powerupBlockedTurns = Math.max(player.powerupBlockedTurns || 0, 1);
        interactions.push({ type: 'shockCoilBurst', id: object.id, x: object.x, y: pulseY, radius: pulseRadius });
        interactions.push(...activateScenarioObjects(game, object.x, pulseY, 95, visited, sourcePlayerId));
      }
    }
    if (object.type === 'healingStation' && object.active) {
      object.durability -= 1;
      interactions.push({ type: 'healingStationHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (object.durability <= 0) { object.active = false; awardDestruction(game, sourcePlayerId, 'healingStation'); interactions.push({ type: 'healingStationBreak', id: object.id, x: object.x, y: object.y }); }
    }
    if (object.type === 'ammoTerminal' && object.active) {
      object.durability = Math.max(0, object.durability - 1);
      interactions.push({ type: 'ammoTerminalHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (!object.durability) {
        object.active = false; awardDestruction(game, sourcePlayerId, 'ammoTerminal');
        game.interactionSerial += 1; const drop = { id: `${object.id}-drop-${game.interactionSerial}`, type: 'ammoCrate', x: object.x, y: terrainY(game.terrain, object.x) - 12, anchorY: terrainY(game.terrain, object.x) - 12, buriedY: terrainY(game.terrain, object.x) - 12, revealed: true, active: true, source: 'ammoTerminal' };
        game.powerups.push(drop); interactions.push({ type: 'ammoTerminalBreak', id: object.id, x: object.x, y: object.y, drop: { id: drop.id, type: drop.type, x: drop.x, y: drop.y } });
      }
    }
    if (object.type === 'shieldGenerator' && object.active) {
      object.durability = Math.max(0, object.durability - 1); object.shieldEnergy = Math.max(0, Math.min(object.shieldEnergy ?? MAP_STRUCTURE_BALANCE.shieldGenerator.energy, object.durability));
      interactions.push({ type: 'shieldGeneratorHit', id: object.id, x: object.x, y: object.y, durability: object.durability, energy: object.shieldEnergy });
      if (!object.durability) {
        object.active = false; const balance = MAP_STRUCTURE_BALANCE.shieldGenerator;
        const damage = applyExplosion(game, object.x, object.groundY - object.height / 2, balance.overloadRadius, balance.overloadDamage, { sourcePlayerId, pushMultiplier: .7 });
        awardExplosionDestruction(game, sourcePlayerId, damage); awardDestruction(game, sourcePlayerId, 'shieldGenerator');
        interactions.push({ type: 'shieldGeneratorBurst', id: object.id, x: object.x, y: object.groundY - object.height / 2, radius: balance.overloadRadius });
      }
    }
    if (object.type === 'repulsor' && object.active) {
      const balance = MAP_STRUCTURE_BALANCE.repulsor; const pulseY = object.groundY - object.height / 2; const targetIds = [];
      object.durability = Math.max(0, object.durability - 1);
      for (const player of game.players || []) {
        const distance = Math.hypot(player.x - object.x, player.y - pulseY);
        if (!player.alive || distance > balance.radius) continue;
        const force = Math.round(balance.force * (1 - distance / (balance.radius * 1.8)));
        if (impartTankMomentum(game, player, object.x, force, true)) targetIds.push(player.id);
      }
      interactions.push({ type: 'repulsorPulse', id: object.id, x: object.x, y: pulseY, radius: balance.radius, targetIds, durability: object.durability });
      if (!object.durability) {
        object.active = false; const damage = applyExplosion(game, object.x, pulseY, balance.overloadRadius, balance.overloadDamage, { sourcePlayerId, pushMultiplier: 1.8 });
        awardExplosionDestruction(game, sourcePlayerId, damage); awardDestruction(game, sourcePlayerId, 'repulsor');
        interactions.push({ type: 'repulsorBurst', id: object.id, x: object.x, y: pulseY, radius: balance.overloadRadius });
      }
      settlePlayers(game);
    }
    if (object.type === 'lightningRod' && object.active) {
      object.durability = Math.max(0, object.durability - 1);
      interactions.push({ type: 'lightningRodHit', id: object.id, x: object.x, y: object.groundY - object.height / 2, durability: object.durability });
      if (object.durability === 0) { object.active = false; if (sourcePlayerId !== object.ownerId) awardDestruction(game, sourcePlayerId, 'lightningRod'); interactions.push({ type: 'lightningRodBreak', id: object.id, x: object.x, y: object.groundY - object.height / 2 }); }
    }
    if (object.type === 'sentry' && object.active) {
      object.durability = Math.max(0, object.durability - 1);
      interactions.push({ type: 'sentryHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (!object.durability) { object.active = false; awardDestruction(game, sourcePlayerId, 'sentry'); interactions.push({ type: 'sentryBreak', id: object.id, x: object.x, y: object.y }); }
    }
    if (object.type === 'specialistDrone' && object.active) {
      object.durability = Math.max(0, object.durability - 1);
      interactions.push({ type: 'specialistDroneHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (!object.durability) { object.active = false; awardDestruction(game, sourcePlayerId, 'specialistDrone'); interactions.push({ type: 'specialistDroneBreak', id: object.id, x: object.x, y: object.y }); }
    }
    if (object.type === 'healingDrone' && object.active) { object.durability = Math.max(0, object.durability - 1); interactions.push({ type: 'healingDroneHit', id: object.id, x: object.x, y: object.y, durability: object.durability }); if (!object.durability) { object.active = false; interactions.push({ type: 'healingDroneBreak', id: object.id, x: object.x, y: object.y }); } }
    if (object.type === 'watchtower' && object.active) {
      object.durability -= 1; interactions.push({ type: 'watchtowerHit', id: object.id, x, y, durability: object.durability });
      if (object.durability <= 0) { object.active = false; const fragments = collapseBuilding(game, object, sourcePlayerId); applyStructureCrush(game, object.x, object.groundY, object.width * .75, 46, sourcePlayerId); awardDestruction(game, sourcePlayerId, 'watchtower'); interactions.push({ type: 'watchtowerCollapse', id: object.id, x: object.x, y: object.groundY, width: object.width, height: object.height, fragments }); }
    }
    if (object.type === 'radar' && object.active) {
      object.durability -= 1; interactions.push({ type: 'radarHit', id: object.id, x: object.x, y: object.y, durability: object.durability });
      if (object.durability <= 0) { object.active = false; for (const player of game.players) if (player.alive && Math.hypot(player.x - object.x, player.y - object.y) < 190) player.powerupBlockedTurns = Math.max(player.powerupBlockedTurns || 0, 1); awardDestruction(game, sourcePlayerId, 'radar'); interactions.push({ type: 'radarPulse', id: object.id, x: object.x, y: object.y, radius: 190 }); }
    }
    if (object.type === 'crane') {
      if (cableHit && object.cableIntact !== false) { awardDestruction(game, sourcePlayerId, 'craneCable'); dropCraneBall(game, object, interactions, 'cable', sourcePlayerId); }
      else if (towerHit && object.active !== false) {
        object.towerDurability = Math.max(0, (object.towerDurability ?? 2) - 1); interactions.push({ type: 'craneHit', id: object.id, x: object.x, y: object.y });
        if (object.towerDurability === 0) { object.active = false; awardDestruction(game, sourcePlayerId, 'crane'); interactions.push({ type: 'craneCollapse', id: object.id, x: object.x, y: object.groundY, width: object.armLength || 180 }); if (object.cableIntact !== false) dropCraneBall(game, object, interactions, 'collapse', sourcePlayerId); }
      }
    }
    if (object.type === 'concrete' && object.active) {
      object.active = false; object.y = object.groundY - 7; applyStructureCrush(game, object.x, object.groundY, object.width * .65, 70, sourcePlayerId); awardDestruction(game, sourcePlayerId, 'concrete'); interactions.push({ type: 'concreteFall', id: object.id, x: object.x, y: object.groundY, width: object.width });
    }
  }
  return interactions;
}

function activateLaserStructures(game, result, sourcePlayerId = null) {
  const interactions = []; const visited = new Set();
  for (const object of game.objects || []) {
    if (!['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'lightningRod', 'healingStation', 'sentry', 'specialistDrone', 'ammoTerminal', 'shieldGenerator', 'repulsor', 'treeMedium', 'treeLarge'].includes(object.type) || !object.active) continue; const point = result.path.find((entry) => projectileStructureAt([object], entry.x, entry.y)); if (point) interactions.push(...activateScenarioObjects(game, point.x, point.y, 8, visited, sourcePlayerId));
  }
  return interactions;
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay; const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * progress), py - (ay + dy * progress));
}

export function clipProjectileAtCrane(game, result) {
  if (!result?.path?.length) return null;
  const hitIndex = result.path.findIndex((point, index) => index > 1 && projectileStructureAt(game.objects, point.x, point.y));
  if (hitIndex < 0) return null;
  const point = result.path[hitIndex]; const solid = projectileStructureAt(game.objects, point.x, point.y); result.path = result.path.slice(0, hitIndex + 1); result.impact = { x: point.x, y: point.y, structure: solid?.type || 'crane', structureId: solid?.id };
  result.collectedPowerupIds = (result.collectedPowerupIds || []).filter((id) => { const item = game.powerups?.find((entry) => entry.id === id); return item && result.path.some((entry) => Math.hypot(entry.x - item.x, entry.y - item.y) <= 16); });
  return result.impact;
}

function dropCraneBall(game, object, interactions, cause, sourcePlayerId = null) {
  const fromY = object.ballY; const impactY = terrainY(game.terrain, object.ballX) - 2; const dropHeight = Math.max(24, impactY - fromY); const impactRadius = clamp(Math.round(34 + dropHeight * .24), 42, 88); const impactDamage = clamp(Math.round(46 + dropHeight * .58), 60, 145);
  object.cableIntact = false; object.ballReleased = true;
  const damage = applyExplosion(game, object.ballX, impactY, impactRadius, impactDamage, { pushMultiplier: 1.18, sourcePlayerId }); awardExplosionDestruction(game, sourcePlayerId, damage);
  object.ballY = terrainY(game.terrain, object.ballX) - Math.max(8, (object.ballRadius || 28) * .45);
  interactions.push({ type: 'wreckingBall', id: object.id, x: object.ballX, y: impactY, fromY, toY: object.ballY, dropHeight, radius: impactRadius, damage: impactDamage, cause });
}

function applyStructureCrush(game, x, y, range, baseDamage, sourcePlayerId = null) {
  for (const player of game.players) {
    if (!player.alive || game.damageImmunePlayerIds?.has?.(player.id) || Math.abs(player.x - x) > range || Math.abs(player.y - y) > 115) continue; let amount = Math.max(18, Math.round(baseDamage * (1 - Math.abs(player.x - x) / (range * 1.25))));
    if (player.shieldCharges > 0) { amount = Math.ceil(amount * .35); player.shieldCharges -= 1; player.shield = player.shieldCharges > 0; }
    player.health = Math.max(0, player.health - amount); player.alive = player.health > 0; if (amount > 0) player.lastDamageRound = game.roundNumber; if (amount > 0 && sourcePlayerId && player.id !== sourcePlayerId) { player.lastDamageSourceId = sourcePlayerId; player.lastDamageTurn = game.turnNumber; } if (player.alive) impartTankMomentum(game, player, x, Math.round(amount * .45), true);
  }
  settlePlayers(game);
}

function releaseGraveLoot(game, x, y, radius) {
  const interactions = [];
  for (const grave of game.graves || []) {
    if (grave.active === false || Math.hypot(grave.x - x, grave.y - y) > radius + 18) continue;
    grave.active = false;
    const loot = grave.loot || [];
    loot.forEach((type, index) => {
      const dropX = clamp(grave.x + (index - (loot.length - 1) / 2) * 24, 18, WORLD.width - 18);
      const dropY = terrainY(game.terrain, dropX) - 12;
      game.interactionSerial += 1;
      game.powerups.push({ id: `grave-drop-${game.interactionSerial}`, type, x: dropX, y: dropY, anchorY: dropY, buriedY: dropY, revealed: true, active: true, source: 'grave' });
    });
    grave.loot = [];
    interactions.push({ type: 'graveLoot', id: grave.id, x: grave.x, y: grave.y, count: loot.length });
  }
  return interactions;
}

function raiseRamp(terrain, ramp) {
  if (ramp.active) return; ramp.active = true; const start = Math.round(ramp.x); const base = terrainY(terrain, start + ramp.width / 2);
  for (let offset = 0; offset <= ramp.width; offset += 1) {
    const progress = offset / ramp.width; const rise = ramp.direction > 0 ? progress : 1 - progress; const px = Math.round(clamp(start + offset, 0, WORLD.width - 1));
    terrain.heights[px] = Math.min(terrain.heights[px], Math.round(base - rise * 92));
  }
  ramp.y = base;
}

function triggerLauncher(game, player, movementDirection) {
  const landing = launcherDestination(game.terrain, game.objects, player, movementDirection, game.turnNumber);
  if (!landing) return;
  const fromX = player.x; const fromY = player.y;
  game.interactionSerial += 1; player.x = landing.x; player.y = landing.y; player.supportPlatformId = null; player.platformOffset = null; player.lastLaunch = { serial: game.interactionSerial, fromX, fromY, toX: landing.x, toY: landing.y, direction: landing.direction };
  landing.launcher.cooldownUntilTurn = game.turnNumber + 2;
}

function extraLifeLanding(game, player) {
  const others = game.players.filter((entry) => entry.alive && entry.id !== player.id);
  const options = [];
  const add = (x, y, supportPlatformId = null, platformOffset = null) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || y < WORLD.tankRadius + 10 || y + WORLD.tankRadius >= (game.lavaLevel ?? WORLD.height + 1)) return;
    if (others.some((entry) => Math.abs(entry.x - x) < 65 && Math.abs(entry.y - y) < 60)) return;
    if ((game.mines || []).some((mine) => mine.active && Math.abs(mine.x - x) < 45 && Math.abs(mine.y - y) < 45)) return;
    if ((game.fireZones || []).some((zone) => zone.turnsLeft > 0 && (!zone.ignitesAt || zone.ignitesAt <= Date.now()) && Math.hypot(zone.x - x, zone.y - y) < zone.radius + 20)) return;
    if ((game.objects || []).some((object) => object.active !== false && Math.abs(object.x - x) < (object.width || 24) / 2 + 26 && Math.abs((object.y ?? y) - y) < 55)) return;
    if (supportPlatformId && [-WORLD.tankRadius, 0, WORLD.tankRadius].some((dx) => terrainY(game.terrain, x + dx) < y + WORLD.tankRadius + 3)) return;
    const nearestTank = others.length ? Math.min(...others.map((entry) => Math.hypot(entry.x - x, entry.y - y))) : WORLD.width;
    options.push({ x, y, supportPlatformId, platformOffset, score: Math.min(900, nearestTank) + Math.abs(x - player.x) * .12 });
  };
  for (let x = 52; x < WORLD.width - 52; x += 16) if (safeGroundAt(game.terrain, x)) add(x, terrainY(game.terrain, x) - WORLD.tankRadius);
  for (const platform of game.terrain.floatingPlatforms || []) {
    if (platform.active === false || platform.width < 58) continue;
    for (let x = platform.x + 30; x <= platform.x + platform.width - 30; x += 22) {
      if (terrainY(game.terrain, x) <= platform.y + 3) continue;
      add(x, platform.y - WORLD.tankRadius, platform.id, x - platform.x);
    }
  }
  return options.sort((a, b) => b.score - a.score)[0] || null;
}

export function reviveWithExtraLife(game, player) {
  if (player.alive || !player.inventory?.includes('extraLife')) return false;
  const landing = extraLifeLanding(game, player); if (!landing) return false;
  const fromX = player.x; const fromY = player.y;
  removeInventory(player, 'extraLife'); syncEquippedPowerups(player);
  player.alive = true; player.health = Math.max(1, Math.ceil(player.maxHealth * .25));
  player.x = landing.x; player.y = landing.y; player.supportPlatformId = landing.supportPlatformId; player.platformOffset = landing.platformOffset;
  player.airborne = null; player.lastSafeX = landing.x; player.lastSafeY = landing.y; player.lastDamageSourceId = null;
  game.interactionSerial = (game.interactionSerial || 0) + 1;
  player.lastRevive = { serial: game.interactionSerial, fromX, fromY, toX: landing.x, toY: landing.y, health: player.health, durationMs: 3000 };
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 3000);
  if (game.pendingShot && game.shotEndsAt) game.shotEndsAt = Math.max(game.shotEndsAt, game.lastBattleAnimationUntil);
  return true;
}

export function recordEliminations(game) {
  // A detonation may eliminate a player visited earlier in the array. Keep
  // scanning until the entire chain has been recorded exactly once.
  let player;
  while ((player = game.players.find((entry) => !entry.alive && !entry.graveRecorded))) {
    if (reviveWithExtraLife(game, player)) continue;
    player.graveRecorded = true; if (player.lastDamageSourceId && player.lastDamageSourceId !== player.id) awardDestruction(game, player.lastDamageSourceId, 'tank');
    if (activeClass(player) === 'bomber') {
      const blastX = player.x; const blastY = player.y; const radius = CLASS_BALANCE.bomberDeathRadius;
      const damage = applyExplosion(game, blastX, blastY, radius, CLASS_BALANCE.bomberDeathDamage, { sourcePlayerId: player.id, attackType: 'bomberDeath', deathBlast: true, pushMultiplier: 1.3 });
      awardExplosionDestruction(game, player.id, damage);
      const interactions = activateScenarioObjects(game, blastX, blastY, radius, new Set(), player.id);
      game.interactionSerial += 1;
      game.bomberDetonations ||= [];
      const launchedAt = Date.now() + 250;
      const grenades = [-1, 1].map((direction) => {
        const flight = simulateShot({ terrain: game.terrain, objects: game.objects, players: [], windVortices: game.windVortices, x: blastX, y: blastY - 12, angle: 62, power: 295, gravity: game.gravity, wind: game.wind, direction });
        const impact = flight.impact || flight.path.at(-1) || { x: blastX + direction * 120, y: blastY };
        const grenade = { id: `bomber-${game.interactionSerial}-${direction}`, ownerId: player.id, direction, path: flight.path, impact: { x: impact.x, y: impact.y }, launchedAt, impactAt: launchedAt + 1450 };
        game.bomberGrenades.push(grenade);
        return grenade;
      });
      game.bomberDetonations.push({ serial: game.interactionSerial, playerId: player.id, x: blastX, y: blastY, radius, damage: CLASS_BALANCE.bomberDeathDamage, hits: damage.filter((hit) => hit.amount > 0), interactions, grenades });
      game.bomberDetonations = game.bomberDetonations.slice(-12);
      game.bomberVictoryAt = Math.max(game.bomberVictoryAt || 0, launchedAt + 1450 + 850);
      game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + CLASS_BALANCE.bomberDeathDurationMs);
      if (game.shotEndsAt) game.shotEndsAt = Math.max(game.shotEndsAt, game.lastBattleAnimationUntil);
    }
    const currentX = clamp(player.x, 12, WORLD.width - 12); const currentGround = terrainY(game.terrain, currentX); const x = currentGround <= WORLD.height ? currentX : clamp(player.lastSafeX ?? currentX, 12, WORLD.width - 12); const ground = terrainY(game.terrain, x); const y = ground <= WORLD.height ? ground - 7 : clamp(player.lastSafeY ?? player.y, 20, WORLD.height - 15);
    const loot = [...player.inventory];
    for (let index = 0; index < (player.shieldCharges || 0); index += 1) loot.push('shield');
    if (player.invisibleTurns > 0) loot.push('invisibility');
    player.inventory = []; player.selectedPowerup = null; player.selectedPowerups = []; player.shieldCharges = 0; player.shield = false;
    game.graves.push({ id: `grave-${player.id}`, playerId: player.id, nickname: player.nickname, color: player.color, x, y, active: true, loot });
  }
  if (game.phase === 'playing') evaluateVictory(game);
}

function evaluateVictory(game) {
  if (!game || game.phase !== 'playing') return game?.phase === 'finished';
  if (game.bomberGrenades?.length || Date.now() < (game.bomberVictoryAt || 0)) return false;
  if (game.pendingShot?.weapon === 'ninjaFatal' && game.shotEndsAt && Date.now() < game.shotEndsAt) return false;
  const alive = game.players.filter((player) => player.alive);
  const humans = game.players.filter((player) => player.team === 'humans' || !player.isBot);
  const aliveHumans = alive.filter((player) => player.team === 'humans' || !player.isBot);
  const aliveBots = alive.filter((player) => player.team === 'bots' || player.isBot);
  let finished = alive.length <= 1;
  if (game.mode === 'coop') finished ||= aliveHumans.length === 0 || aliveBots.length === 0;
  else if (['teams', 'teamHill'].includes(game.mode)) finished ||= new Set(alive.map((player) => player.team)).size <= 1;
  else if (humans.length === 1 && game.players.some((player) => player.isBot)) finished ||= aliveHumans.length === 0;
  if (!finished) return false;
  game.winningTeam = game.mode === 'coop' ? (aliveHumans.length ? 'humans' : aliveBots.length ? 'bots' : null) : ['teams', 'teamHill'].includes(game.mode) ? alive[0]?.team || null : null;
  game.winner = usesTeams(game) ? alive.find((player) => player.team === game.winningTeam)?.id || null : alive[0]?.id || null;
  finalizeResult(game, alive.length === 0 ? 'mutualDestruction' : game.mode === 'survival' ? 'lastSurvivor' : usesTeams(game) ? 'teamElimination' : 'lastTank');
  return true;
}

function shiftPausedTimeline(value, delay, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return; seen.add(value);
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && entry > 1_000_000_000_000 && /(?:At|EndsAt|StartedAt|Until)$/.test(key) && key !== 'pausedAt') value[key] += delay;
    else if (entry && typeof entry === 'object') shiftPausedTimeline(entry, delay, seen);
  }
}

export function setSoloControl(room, playerId, input = {}) {
  const game = room.game; const humans = game?.players.filter((player) => !player.isBot) || [];
  if (!game || game.phase !== 'playing' || humans.length !== 1 || humans[0].id !== playerId || !game.players.some((player) => player.isBot)) throw new Error('Controles de pausa disponíveis apenas em partidas solo contra bots.');
  if (input.action === 'pause') {
    const paused = Boolean(input.paused);
    if (paused && !game.paused) { game.paused = true; game.pausedAt = Date.now(); }
    else if (!paused && game.paused) { const delay = Math.max(0, Date.now() - (game.pausedAt || Date.now())); shiftPausedTimeline(game, delay); game.paused = false; game.pausedAt = null; }
  } else if (input.action === 'botSpeed') {
    const speed = [1, 2, 4].includes(Number(input.speed)) ? Number(input.speed) : 1; const previous = game.botSpeed || 1; game.botSpeed = speed;
    if (currentPlayer(game)?.isBot && game.botActAt) game.botActAt = Date.now() + Math.max(80, (game.botActAt - Date.now()) * previous / speed);
  } else throw new Error('Controle solo inválido.');
  return { paused: Boolean(game.paused), botSpeed: game.botSpeed || 1 };
}

export function selectPowerup(room, playerId, type) {
  const game = room.game; const player = currentPlayer(game);
  if (player?.teslaDisabledTurns > 0) throw new Error('Tesla ativo: apenas movimento disponível neste turno.');
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Escolha powerups somente no seu turno.');
  if (game.openingRestrictionsActive && game.roundNumber === 1 && type && !['rocketDash', 'lightningStep', 'excavator'].includes(type)) throw new Error('Modificadores de tiro só ficam disponíveis na segunda rodada.');
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (player.classType === 'backpacker' && type) throw new Error('Mochileiros compartilham powerups e não podem equipá-los.');
  if (player.powerupBlockedTurns > 0 && type) throw new Error('Circuitos em pane: powerups bloqueados neste turno.');
  if (type === null || type === '') { player.selectedPowerup = null; player.selectedPowerups = []; game.actions.movesLeft = Math.min(game.actions.movesLeft, 2); return; }
  if (!SELECTABLE_POWERUPS.has(type) || !player.inventory.includes(type)) throw new Error('Powerup indisponível.');
  const equipped = equippedPowerups(player); const index = equipped.indexOf(type);
  if (index >= 0) equipped.splice(index, 1); else equipped.push(type);
  player.selectedPowerups = equipped; player.selectedPowerup = equipped.at(-1) || null;
  if (equipped.includes('excavator')) game.actions.movesLeft = Math.max(game.actions.movesLeft, Math.min(3, player.inventory.filter((item) => item === 'excavator').length));
  else game.actions.movesLeft = Math.min(game.actions.movesLeft, 2);
}

export function usePowerup(room, playerId, input = {}) {
  const game = room.game; const player = currentPlayer(game);
  if (player?.teslaDisabledTurns > 0) throw new Error('Tesla ativo: apenas movimento disponível neste turno.');
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Use powerups somente no seu turno.');
  if (game.openingRestrictionsActive && game.roundNumber === 1 && !['lightningStep', 'teleport'].includes(input.type)) throw new Error('Na primeira rodada, apenas movimento e tiro padrão estão liberados.');
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (player.powerupBlockedTurns > 0) throw new Error('Circuitos em pane: powerups bloqueados neste turno.');
  if (input.type === 'buoy') {
    if (!player.inventory.includes('buoy')) throw new Error('Boia indisponível.');
    removeInventory(player, 'buoy'); player.buoyActive = true;
    game.interactionSerial += 1; player.lastBuoy = { serial: game.interactionSerial, x: player.x, y: player.y };
    updateWaterPhysics(game);
    return player.lastBuoy;
  }
  if (input.type === 'trickster') {
    if (!hasPowerupEquipped(player, 'trickster') || !player.inventory.includes('trickster')) throw new Error('Equipe a Carta Sacana primeiro.');
    if (game.actions.movesLeft <= 0) throw new Error('A troca exige um movimento disponível.');
    const desiredX = Number(input.x); const target = game.players.find((entry) => entry.id === input.targetPlayerId && entry.id !== player.id && entry.alive)
      || game.players.filter((entry) => entry.id !== player.id && entry.alive && Number.isFinite(desiredX) && Math.abs(entry.x - desiredX) <= 100).sort((a, b) => Math.abs(a.x - desiredX) - Math.abs(b.x - desiredX))[0];
    if (!target) throw new Error('Escolha outro tanque para realizar a troca.');
    const from = { x: player.x, y: player.y, airborne: player.airborne, supportPlatformId: player.supportPlatformId, platformOffset: player.platformOffset }; const targetFrom = { x: target.x, y: target.y, airborne: target.airborne, supportPlatformId: target.supportPlatformId, platformOffset: target.platformOffset };
    Object.assign(player, targetFrom); Object.assign(target, from); player.lastSafeX = player.x; player.lastSafeY = player.y; target.lastSafeX = target.x; target.lastSafeY = target.y;
    game.interactionSerial += 1; player.lastBlink = { serial: game.interactionSerial, playerId: player.id, fromX: from.x, fromY: from.y, toX: player.x, toY: player.y, kind: 'trickster' };
    game.interactionSerial += 1; target.lastBlink = { serial: game.interactionSerial, playerId: target.id, fromX: targetFrom.x, fromY: targetFrom.y, toX: target.x, toY: target.y, kind: 'trickster' };
    removeInventory(player, 'trickster'); syncEquippedPowerups(player); game.actions.movesLeft -= 1; collectPowerups(game, player); collectPowerups(game, target); triggerMines(game, player.x, player.y, 22, new Set(), player.id); recordEliminations(game); game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
    if (!player.alive || (game.actions.movesLeft === 0 && !game.actions.attackAvailable)) nextTurn(room);
    return { type: 'trickster', playerId: player.id, targetPlayerId: target.id, from, targetFrom };
  }
  const movementType = ['lightningStep', 'teleport'].includes(input.type) ? input.type : null;
  if (!movementType || !hasPowerupEquipped(player, movementType) || !player.inventory.includes(movementType)) throw new Error('Equipe um teleporte primeiro.');
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  const maxRange = movementType === 'teleport' ? 580 : 270;
  const preview = blinkLanding(game.terrain, game.players, player, Number(input.x), maxRange, game.objects, Number(input.y));
  if (!preview.valid) throw new Error(preview.reason);
  const { landing } = preview;
  const fromX = player.x; const fromY = player.y;
  player.x = landing.x; player.y = landing.y; player.airborne = landing.supportObjectId ? { vx: 0, vy: 0, falling: true, startY: landing.y, minY: landing.y, updatedAt: Date.now(), fromBlink: true } : null; player.wallClinging = null; player.ceilingClinging = null; player.surfaceClinging = null; player.supportPlatformId = null; player.platformOffset = null; if (!landing.supportObjectId) { player.lastSafeX = landing.x; player.lastSafeY = landing.y; }
  game.interactionSerial += 1; player.lastBlink = { serial: game.interactionSerial, playerId: player.id, fromX, fromY, toX: landing.x, toY: landing.y };
  removeInventory(player, movementType); syncEquippedPowerups(player);
  game.actions.movesLeft -= 1; collectPowerups(game, player); triggerMines(game, player.x, player.y, 22, new Set(), player.id); recordEliminations(game); game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
  if (!player.alive || (game.actions.movesLeft === 0 && !game.actions.attackAvailable)) nextTurn(room);
  return player.lastBlink;
}

export function useArsenal(room, playerId, input = {}) {
  const game = room.game; const reactive = REACTIVE_ARSENAL_ITEMS.includes(input.type); const player = reactive ? game.players.find((entry) => entry.id === playerId) : currentPlayer(game);
  if (player?.teslaDisabledTurns > 0) throw new Error('Tesla ativo: apenas movimento disponível neste turno.');
  if (game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.');
  if (game?.phase !== 'playing' || !player || (!reactive && player.id !== playerId)) throw new Error('Use o arsenal somente no seu turno.');
  if (reactive && (!player.alive || !player.arsenal?.includes(input.type) || (player.ammo?.[input.type] || 0) <= 0)) throw new Error('Poder indisponÃ­vel ou aguardando recarga.');
  if (input.type === 'blink') {
    const preview = blinkLanding(game.terrain, game.players, player, Number(input.x), WEAPON_BALANCE.blink.range, game.objects, Number(input.y)); if (!preview.valid) throw new Error(preview.reason);
    const fromX = player.x; const fromY = player.y; const { landing } = preview; player.x = landing.x; player.y = landing.y; player.airborne = null; player.supportPlatformId = landing.supportPlatformId || null; player.platformOffset = landing.platformOffset ?? null; player.lastSafeX = landing.x; player.lastSafeY = landing.y; spendArsenalCharge(player, 'blink'); game.interactionSerial += 1; player.lastBlink = { serial: game.interactionSerial, playerId: player.id, fromX, fromY, toX: landing.x, toY: landing.y, kind: 'arsenal' }; collectPowerups(game, player); return player.lastBlink;
  }
  if (input.type === 'healingDrone') {
    if ((game.objects || []).some((object) => object.active && object.type === 'healingDrone' && object.ownerId === player.id)) throw new Error('Seu Drone de Cura jÃ¡ estÃ¡ ativo.');
    spendArsenalCharge(player, 'healingDrone'); game.interactionSerial += 1; const balance = WEAPON_BALANCE.healingDrone; const drone = { id: `healing-drone-${game.interactionSerial}`, type: 'healingDrone', ownerId: player.id, x: player.x, y: player.y - 58, groundY: player.y - 38, width: 44, height: 28, durability: balance.durability, maxDurability: balance.durability, turnsLeft: balance.turns, active: true, hovering: true, disabledUntilRound: 0 }; game.objects.push(drone); player.lastHealingDrone = { serial: game.interactionSerial, droneId: drone.id, x: drone.x, y: drone.y }; return player.lastHealingDrone;
  }
  if (game.openingRestrictionsActive && game.roundNumber === 1 && !reactive && input.type !== 'jump' && input.type !== 'parachute') throw new Error('Na primeira rodada, apenas movimento e tiro padrão estão liberados.');
  if (input.type === 'splitDamage') {
    if (!player.arsenal?.includes('splitDamage') || (player.ammo?.splitDamage || 0) <= 0) throw new Error('Dano Dividido indisponível.');
    const ownsTurn = currentPlayer(game)?.id === player.id;
    if (ownsTurn && (!game.actions.attackAvailable || game.shotEndsAt)) throw new Error('Aguarde sua próxima ação.');
    spendArsenalCharge(player, 'splitDamage'); player.splitDamageUntilRound = game.roundNumber + 1;
    game.interactionSerial += 1; player.lastSplitDamage = { serial: game.interactionSerial, x: player.x, y: player.y, untilRound: player.splitDamageUntilRound };
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
    if (ownsTurn) { game.actions.attackAvailable = false; nextTurn(room); }
    return player.lastSplitDamage;
  }
  if (input.type === 'superheat') throw new Error('Superaquecer é passivo e ativa sozinho após 2 turnos inimigos.');
  if (input.type === 'mixer') throw new Error('Misturador é passivo: escolha duas armas no arsenal.');
  if (input.type === 'parachute') { if (!player.airborne) throw new Error('O tanque não está no ar.'); revealNinja(game, player, 'arsenal'); player.airborne.parachute = true; player.airborne.vx = 0; player.airborne.vy = Math.max(0, Math.min(player.airborne.vy, 28)); game.interactionSerial += 1; player.lastJump = { serial: game.interactionSerial, kind: 'parachute' }; game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000); return player.airborne; }
  if (input.type !== 'jump' || !player.arsenal?.includes('jump') || (player.ammo?.jump || 0) <= 0) throw new Error('Pulo indisponível.');
  if (game.actions.movesLeft <= 0 || ![TANK_STATE.GROUNDED, TANK_STATE.MOVING, TANK_STATE.WALL].includes(tankMotionState(game, player))) throw new Error('O pulo exige apoio no chão, numa plataforma ou numa parede.');
  const aimed = Number.isFinite(Number(input.x)) ? jumpTargetTrajectory(game.terrain, player, Number(input.x), Number(input.y), game.gravity) : null;
  if (aimed && !aimed.valid) throw new Error('Escolha uma trajetória com pouso dentro da arena.');
  const angleDegrees = aimed?.angle ?? clamp(Number(input.angle) || 45, 10, 80); const angle = angleDegrees * Math.PI / 180; const power = aimed?.power ?? clamp(Number(input.power) || 260, 120, 480); const direction = aimed?.direction ?? (Number(input.direction) === -1 ? -1 : 1);
  revealNinja(game, player, 'arsenal');
  player.facing = direction; spendArsenalCharge(player, 'jump'); game.actions.movesLeft -= 1; player.supportPlatformId = null; player.platformOffset = null; player.wallClinging = null; player.ceilingClinging = null; player.surfaceClinging = null;
  player.airborne = { vx: Math.cos(angle) * power * direction * .72, vy: -Math.sin(angle) * power * .72, parachute: false, startY: player.y, updatedAt: Date.now() }; player.y -= 5;
  game.interactionSerial += 1; player.lastJump = { serial: game.interactionSerial, kind: 'jump', targetX: aimed?.impact?.x, targetY: aimed?.impact?.y };
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
  return player.airborne;
}

function triggerMines(game, x, y, range, visited = new Set(), triggeringPlayerId = null) {
  for (const mine of game.mines) {
    if (!mine.active || mine.aquatic && !mine.armed || visited.has(mine.id) || (triggeringPlayerId && mine.ownerId === triggeringPlayerId) || Math.hypot(mine.x - x, mine.y - y) > range + (mine.aquatic ? 23 : 0)) continue;
    visited.add(mine.id); mine.active = false;
    const mineDamage = mine.aquatic ? WEAPON_BALANCE.waterMine.damage : mine.ownerId ? WEAPON_BALANCE.mineLayer.damage : NATIVE_MINE_DAMAGE;
    const mineRadius = mine.aquatic ? WEAPON_BALANCE.waterMine.radius : WEAPON_BALANCE.mineLayer.radius;
    const damage = applyExplosion(game, mine.x, mine.y, mineRadius, mineDamage, { sourcePlayerId: mine.ownerId }); awardExplosionDestruction(game, mine.ownerId, damage);
    if (mine.aquatic) { game.interactionSerial += 1; (game.mineDetonations ||= []).push({ serial: game.interactionSerial, x: mine.x, y: mine.y, radius: mineRadius }); game.mineDetonations = game.mineDetonations.slice(-12); disturbWaterAt(game.terrain, game.waterZones, mine.x, mine.y, { radius: mineRadius * 1.4, strength: 24, kind: 'explosion' }); }
    activateScenarioObjects(game, mine.x, mine.y, mineRadius, new Set(), mine.ownerId);
    triggerMines(game, mine.x, mine.y, 85, visited, triggeringPlayerId);
  }
}

function hitWithInactiveAquaticMine(game, mine, target) {
  if (!target?.alive || target.id === mine.ownerId || mine.hitPlayerIds?.includes(target.id)) return 0;
  const owner = game.players.find((entry) => entry.id === mine.ownerId);
  if (owner && protectedAlly(game, target, owner)) return 0;
  const amount = directDamage(owner, target, 40);
  target.health = Math.max(0, target.health - amount); target.alive = target.health > 0;
  target.lastDamageRound = game.roundNumber; target.lastDamageSourceId = mine.ownerId; target.lastDamageTurn = game.turnNumber;
  if (owner) owner.stats.damage += amount;
  (mine.hitPlayerIds ||= []).push(target.id); mine.vx = -(mine.vx || 0) * .45; mine.vy = -85;
  recordEliminations(game);
  return amount;
}

function simulateMoleBomb(game, player, spreadOffset = 0) {
  const target = game.players.filter((entry) => entry.alive && entry.id !== player.id && entry.invisibleTurns <= 0 && !areAllies(game, entry, player)).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
  const steps = Math.round(SHOT_PATH_RATE * 1.5); const maxTravel = 760; const desiredX = (target ? player.x + clamp(target.x - player.x, -maxTravel, maxTravel) : player.x + player.facing * maxTravel) + spreadOffset * 10; const destinationX = clamp(desiredX, 20, WORLD.width - 20); const path = []; let impact = null;
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps; const x = player.x + (destinationX - player.x) * progress; const ground = terrainY(game.terrain, x);
    if (ground > WORLD.height) { impact = { x: Math.round(x), y: WORLD.height - 8, fellIntoHole: true }; path.push({ x: Math.round(x), y: WORLD.height - 8, underground: true, falling: true }); break; }
    const y = ground + 10 + Math.sin(progress * Math.PI * 6) * 3; path.push({ x: Math.round(x), y: Math.round(y), underground: true });
    if (target && Math.abs(x - target.x) <= 12) { impact = { x: target.x, y: target.y, playerId: target.id }; break; }
  }
  impact ||= { x: path.at(-1)?.x ?? destinationX, y: path.at(-1)?.y ?? terrainY(game.terrain, destinationX), timedOut: true };
  return { path, collectedPowerupIds: [], burrow: true, impact };
}

function simulateHuntingPlane(game, player, angle, power) {
  const radians = angle * Math.PI / 180; const direction = player.facing; const dt = 1 / 60;
  let x = player.x + Math.cos(radians) * 20 * direction; let y = player.y - Math.sin(radians) * 20;
  let vx = direction * (145 + power * .16); let vy = -390;
  const path = []; const collectedPowerupIds = []; let target = null; let huntStartIndex = 0;
  for (let step = 0; step < 360; step += 1) {
    if (step === 78) {
      target = game.players.filter((entry) => entry.alive && entry.id !== player.id && entry.invisibleTurns <= 0 && !areAllies(game, entry, player)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0] || null;
      huntStartIndex = path.length;
    }
    if (step >= 78 && target?.alive) {
      const dx = target.x - x; const dy = target.y - y; const distance = Math.max(1, Math.hypot(dx, dy)); const speed = Math.min(570, 330 + (step - 78) * 2.1);
      vx += (dx / distance * speed - vx) * .085; vy += (dy / distance * speed - vy) * .085;
    } else if (step >= 78) { vy += (game.gravity || 120) * dt; }
    else { vx += (game.wind || 0) * dt * .12; vy = y < 75 ? 0 : -390; }
    const previousY = y; x += vx * dt; y = Math.max(28, y + vy * dt);
    if (step % 3 === 0) path.push({ x: Math.round(x), y: Math.round(y), flyingHunter: true, diving: step >= 78 });
    if (x < 0 || x >= WORLD.width || y > WORLD.height + 30) return { path, collectedPowerupIds, flyingHunter: true, huntStartIndex, impact: null };
    const hit = game.players.find((entry) => entry.alive && entry.id !== player.id && !areAllies(game, entry, player) && Math.hypot(entry.x - x, entry.y - y) <= WORLD.tankRadius + 7);
    if (hit) return { path, collectedPowerupIds, flyingHunter: true, huntStartIndex, huntedPlayerId: target?.id || null, impact: { x, y, playerId: hit.id } };
    const item = game.powerups.find((entry) => entry.active && entry.revealed !== false && !collectedPowerupIds.includes(entry.id) && Math.hypot(entry.x - x, entry.y - y) <= 16); if (item) collectedPowerupIds.push(item.id);
    const platform = game.terrain.floatingPlatforms?.find((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && Math.min(previousY, y) <= entry.y + entry.height && Math.max(previousY, y) >= entry.y);
    if (platform) return { path, collectedPowerupIds, flyingHunter: true, huntStartIndex, huntedPlayerId: target?.id || null, impact: { x, y: platform.y, platformId: platform.id } };
    if (y >= terrainY(game.terrain, x)) return { path, collectedPowerupIds, flyingHunter: true, huntStartIndex, huntedPlayerId: target?.id || null, impact: { x, y } };
  }
  return { path, collectedPowerupIds, flyingHunter: true, huntStartIndex, huntedPlayerId: target?.id || null, impact: path.at(-1) || null };
}

function simulateFireworkBurst(game, origin, burst, ownerId) {
  const angle = (burst / WEAPON_BALANCE.fireworks.secondaryBursts * Math.PI * 2) + Math.PI / 12;
  const speed = 255 + burst % 3 * 22; const dt = 1 / 60;
  let x = origin.x + Math.cos(angle) * 18; let y = origin.y - 16 + Math.sin(angle) * 18;
  let vx = Math.cos(angle) * speed; let vy = Math.sin(angle) * speed;
  const path = [{ x: Math.round(x), y: Math.round(y) }]; let impact = null;
  for (let step = 0; step < 150; step += 1) {
    const previousY = y; x += vx * dt; y += vy * dt; vx += (game.wind || 0) * dt * .25; vy += game.gravity * dt;
    if (step % 3 === 0) path.push({ x: Math.round(x), y: Math.round(y) });
    if (x < 4 || x >= WORLD.width - 4 || y < 8 || y >= WORLD.height) { impact = { x: clamp(x, 5, WORLD.width - 5), y: clamp(y, 8, WORLD.height - 5) }; break; }
    const player = game.players.find((entry) => entry.alive && entry.id !== ownerId && Math.hypot(entry.x - x, entry.y - y) < WORLD.tankRadius + 3);
    if (player) { impact = { x, y }; break; }
    const platform = game.terrain.floatingPlatforms?.find((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && Math.min(previousY, y) <= entry.y + entry.height && Math.max(previousY, y) >= entry.y);
    if (platform || y >= terrainY(game.terrain, x)) { impact = { x, y }; break; }
  }
  return { path, impact: impact || { x, y } };
}

function simulateLaser(game, player, angle, power) {
  const radians = angle * Math.PI / 180; const direction = player.facing; const distance = Math.min(1450, 620 + power * 1.35); const path = []; const hitPlayerIds = []; const collectedPowerupIds = [];
  for (let step = 0; step <= distance; step += 12) { const x = player.x + Math.cos(radians) * step * direction; const y = player.y - Math.sin(radians) * step; if (x < 2 || x >= WORLD.width - 2 || y < 2 || y > WORLD.height) break; path.push({ x: Math.round(x), y: Math.round(y), laser: true }); for (const target of game.players) if (target.alive && target.id !== player.id && !hitPlayerIds.includes(target.id) && Math.hypot(target.x - x, target.y - y) <= 18) hitPlayerIds.push(target.id); for (const item of game.powerups) if (item.active && item.revealed !== false && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - x, item.y - y) <= 16) collectedPowerupIds.push(item.id); }
  const impact = path.at(-1) || { x: player.x, y: player.y }; return { path, collectedPowerupIds, hitPlayerIds, laser: true, impact: { x: impact.x, y: impact.y } };
}

function simulateWaterCannon(game, player, angle) {
  const radians = clamp(angle, -70, 70) * Math.PI / 180;
  const origin = { x: player.x + player.facing * 17, y: player.y - 7 };
  const path = [origin]; const hitPlayerIds = []; let impactKind = 'air';
  for (let distance = 16; distance <= CLASS_BALANCE.waterCannonRange; distance += 16) {
    const x = origin.x + Math.cos(radians) * distance * player.facing;
    const y = origin.y - Math.sin(radians) * distance;
    if (x < 6 || x > WORLD.width - 6 || y < 8 || y > WORLD.height - 8) break;
    const point = { x: Math.round(x), y: Math.round(y) }; path.push(point);
    for (const target of game.players) if (target.alive && target.id !== player.id && !hitPlayerIds.includes(target.id) && Math.hypot(target.x - x, target.y - y) <= 24) hitPlayerIds.push(target.id);
    const platform = game.terrain.floatingPlatforms?.some((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && y >= entry.y && y <= entry.y + (entry.height || 8));
    if (y >= terrainY(game.terrain, x)) { impactKind = 'ground'; break; }
    if (platform) { impactKind = 'platform'; break; }
    if (projectileStructureAt(game.objects, x, y)) { impactKind = 'structure'; break; }
  }
  const impact = path.at(-1);
  const recoilBoost = angle <= -20 && ['ground', 'platform'].includes(impactKind) && Math.abs(impact.x - player.x) <= CLASS_BALANCE.waterCannonRecoilRange;
  return { path, hitPlayerIds, impact, impactKind, recoilBoost, waterCannon: true };
}

function applyWaterCannonHit(game, player, target, angle, now) {
  if (!target?.alive || protectedAlly(game, target, player)) return null;
  let amount = directDamage(player, target, WEAPON_BALANCE.waterCannon.damage);
  if (target.shieldCharges > 0) { amount = Math.ceil(amount * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
  target.health = Math.max(0, target.health - amount); target.alive = target.health > 0;
  target.lastDamageRound = game.roundNumber; target.lastDamageTurn = game.turnNumber; target.lastDamageSourceId = player.id;
  player.stats.damage += amount;
  reflectDirectDamage(game, target, player, amount);
  if (target.alive) {
    interruptTankControl(game, target); target.swimming = false; target.supportPlatformId = null; target.platformOffset = null;
    const radians = clamp(angle, -70, 70) * Math.PI / 180;
    target.airborne = { vx: player.facing * CLASS_BALANCE.waterCannonPush * Math.max(.3, Math.cos(radians)), vy: -Math.max(70, Math.sin(radians) * CLASS_BALANCE.waterCannonPush * 1.45), falling: false, startY: target.y, minY: target.y, updatedAt: now, fromWaterCannon: true };
  }
  return { playerId: target.id, amount, knockback: CLASS_BALANCE.waterCannonPush };
}

function applyWaterCannonDamage(game, player, result, angle = 0) {
  const now = Date.now();
  return result.hitPlayerIds.map((id) => applyWaterCannonHit(game, player, game.players.find((entry) => entry.id === id), angle, now)).filter(Boolean);
}

export function updateWaterCannonStreams(game, now = Date.now()) {
  let changed = false;
  game.waterCannonStreams ||= [];
  for (const stream of game.waterCannonStreams) {
    if (now < stream.startedAt || now >= stream.endsAt) continue;
    const dt = Math.min(.12, Math.max(0, (now - stream.lastTickAt) / 1000));
    if (dt < .004) continue;
    stream.lastTickAt = now;
    const radians = stream.angle * Math.PI / 180;
    const ax = stream.origin.x; const ay = stream.origin.y;
    const bx = stream.impact.x; const by = stream.impact.y;
    const beamLength = Math.hypot(bx - ax, by - ay);
    const owner = game.players.find((entry) => entry.id === stream.ownerId);
    for (const target of game.players) {
      if (!target.alive || target.id === stream.ownerId || protectedAlly(game, target, owner)) continue;
      const alreadyHit = stream.hitPlayerIds.includes(target.id);
      const along = (target.x - stream.origin.x) * stream.direction * Math.cos(radians) - (target.y - stream.origin.y) * Math.sin(radians);
      const sideways = Math.abs((target.x - stream.origin.x) * Math.sin(radians) + (target.y - stream.origin.y) * stream.direction * Math.cos(radians));
      if (along < -24 || along > beamLength + 24 || sideways > (alreadyHit ? 115 : 24)) continue;
      if (!alreadyHit) {
        const hit = applyWaterCannonHit(game, owner, target, stream.angle, now);
        stream.hitPlayerIds.push(target.id);
        if (hit) {
          game.interactionSerial += 1;
          game.lastWaterCannonHits ||= [];
          game.lastWaterCannonHits.push({ serial: game.interactionSerial, ...hit, x: target.x, y: target.y, ownerId: stream.ownerId });
          game.lastWaterCannonHits = game.lastWaterCannonHits.slice(-8);
          recordEliminations(game);
          changed = true;
        }
      }
      if (!target.alive) continue;
      if (!target.airborne) {
        interruptTankControl(game, target); target.supportPlatformId = null; target.platformOffset = null; target.swimming = false;
        target.airborne = { vx: 0, vy: -75, falling: false, startY: target.y, minY: target.y, updatedAt: now, fromWaterCannon: true };
      }
      const flight = target.airborne;
      flight.vx = clamp(flight.vx + stream.direction * Math.cos(radians) * WEAPON_BALANCE.waterCannon.pushAcceleration * dt, -620, 620);
      flight.vy = clamp(flight.vy - Math.max(120, Math.sin(radians) * WEAPON_BALANCE.waterCannon.pushAcceleration) * dt, -590, 400);
      flight.falling = false;
      changed = true;
    }
    if (now - (stream.lastSplashAt || stream.startedAt) >= 250) {
      stream.lastSplashAt = now;
      for (const fraction of [.25, .6, 1]) {
        disturbWaterAt(game.terrain, game.waterZones, ax + (bx - ax) * fraction, ay + (by - ay) * fraction, { radius: 48, strength: 5, kind: 'impact' }, now);
      }
      const wet = (x, y, radius = 0) => pointSegmentDistance(x, y, ax, ay, bx, by) <= radius + 34;
      const fires = game.fireZones || [];
      game.fireZones = fires.filter((zone) => zone.source === 'superheat' || !wet(zone.x, zone.y, Math.min(55, zone.radius * .35)));
      for (const object of game.objects || []) if (object.active && object.burningUntilRound && wet(object.x, (object.groundY ?? object.y) - (object.height || 0) * .5, Math.min(45, (object.width || 20) * .5))) object.burningUntilRound = 0;
      for (const platform of game.terrain.floatingPlatforms || []) if (platform.active && platform.burningUntilRound && wet(clamp(ax, platform.x, platform.x + platform.width), platform.y, 22)) platform.burningUntilRound = 0;
      changed = true;
    }
  }
  const count = game.waterCannonStreams.length;
  game.waterCannonStreams = game.waterCannonStreams.filter((stream) => now < stream.endsAt);
  return changed || count !== game.waterCannonStreams.length;
}

export function simulateWaterTorpedoes(game, player) {
  if (waterDepthAt(game.terrain, game.waterZones, player.x, player.y) < 8) throw new Error('Torpedos exigem que o tanque esteja submerso.');
  const target = game.players.filter((entry) => entry.alive && entry.id !== player.id && !protectedAlly(game, entry, player) && waterDepthAt(game.terrain, game.waterZones, entry.x, entry.y) >= 8 && Math.hypot(entry.x - player.x, entry.y - player.y) <= WEAPON_BALANCE.waterTorpedo.range)
    .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
  if (!target) throw new Error('Nenhum inimigo submerso no alcance dos torpedos.');
  const results = [];
  for (let missile = 0; missile < WEAPON_BALANCE.waterTorpedo.projectiles; missile += 1) {
    const origin = { x: player.x + player.facing * 19, y: player.y + (missile - 1) * 3 };
    const path = [origin]; let hit = false;
    for (let step = 1; step <= 145; step += 1) {
      const progress = Math.min(1, step * 9 / Math.max(1, Math.hypot(target.x - origin.x, target.y - origin.y)));
      const x = origin.x + (target.x - origin.x) * progress;
      const y = Math.min(terrainY(game.terrain, x) - 8, origin.y + (target.y - origin.y) * progress + Math.sin(progress * Math.PI) * (missile - 1) * 5);
      if (x < 8 || x > WORLD.width - 8 || waterDepthAt(game.terrain, game.waterZones, x, y) < 5 || y >= terrainY(game.terrain, x) - 3 || projectileStructureAt(game.objects, x, y)) break;
      const platform = game.terrain.floatingPlatforms?.some((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && y >= entry.y && y <= entry.y + (entry.height || 8));
      if (platform) break;
      path.push({ x: Math.round(x), y: Math.round(y), underwater: true });
      if (Math.hypot(x - target.x, y - target.y) <= WORLD.tankRadius + 9) { hit = true; break; }
    }
    const impact = path.at(-1);
    results.push({ path, impact, weapon: 'waterTorpedo', torpedoIndex: missile, targetId: target.id, hit, underwater: true });
  }
  return results;
}

function applyLaserDamage(game, result, sourcePlayer) {
  const beforeTerrain = result.path.reduce((sum, point, index) => index % 3 === 1 ? sum + terrainY(game.terrain, point.x) : sum, 0);
  // The terrain is a heightfield: adjacent cuts must overlap or a side-hit
  // leaves intact columns that look like the beam passed through solid rock.
  for (let index = 2; index < result.path.length; index += 1) carveTerrain(game.terrain, result.path[index].x, result.path[index].y, 21);
  const destroyedPlatforms = []; for (const platform of game.terrain.floatingPlatforms || []) if (platform.active && result.path.some((point) => point.x >= platform.x && point.x <= platform.x + platform.width && Math.abs(point.y - platform.y) < 16)) { platform.durability = Math.max(0, platform.durability - 95); if (!platform.durability) { platform.active = false; destroyedPlatforms.push(platform.id); } }
  const damage = []; for (const id of result.hitPlayerIds || []) { const target = game.players.find((entry) => entry.id === id && entry.alive); if (!target || protectedAlly(game, target, sourcePlayer)) continue; let amount = directDamage(sourcePlayer, target, WEAPON_BALANCE.laser.damage); if (sourcePlayer.classType !== 'attacker' && target.shieldCharges > 0) { amount = Math.ceil(amount * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; } target.health = Math.max(0, target.health - amount); target.lastDamageSourceId = sourcePlayer.id; target.lastDamageTurn = game.turnNumber; target.lastDamageRound = game.roundNumber; if (!target.health) target.alive = false; damage.push({ playerId: target.id, amount, knockback: 0 }); }
  for (const hit of damage) reflectDirectDamage(game, game.players.find((entry) => entry.id === hit.playerId), sourcePlayer, hit.amount);
  const afterTerrain = result.path.reduce((sum, point, index) => index % 3 === 1 ? sum + terrainY(game.terrain, point.x) : sum, 0); damage.destruction = { terrainBlocks: Math.max(0, Math.floor((afterTerrain - beforeTerrain) / 5)), platformIds: destroyedPlatforms };
  settleScenarioObjects(game); settlePlayers(game); return damage;
}

function shiftGravityObject(game, object, shift) {
  const fromX = object.x;
  const margin = Math.max(12, (object.width || 24) / 2, object.type === 'treeLarge' ? (object.crownWidth || 0) / 2 : 0);
  object.x = clamp(fromX + shift, margin, playableWidth(game.terrain) - margin);
  const delta = object.x - fromX;
  if (Math.abs(delta) < .01) return 0;
  if (object.type === 'crane') object.ballX += delta;
  if (object.type === 'treeLarge') {
    for (const row of object.branchRows || []) row.left += delta;
    for (const branch of game.terrain.floatingPlatforms || []) if (branch.treeId === object.id) { branch.x += delta; branch.baseX += delta; }
  }
  object.supportPlatformId = null; object.platformOffset = null;
  return delta;
}

function applyGravityWell(game, x, y, sourcePlayerId = null, activateAt = Date.now()) {
  const radius = WEAPON_BALANCE.gravity.radius; const damage = [];
  game.lastWaterDrain = null;
  drainConnectedWater(game, x, y, radius);
  const source = game.players.find((player) => player.id === sourcePlayerId);
  const craterRadius = 94; const left = Math.max(0, Math.floor(x - craterRadius)); const right = Math.min(WORLD.width - 1, Math.ceil(x + craterRadius));
  const beforeTerrain = game.terrain.heights.slice(left, right + 1);
  carveTerrain(game.terrain, x, y, craterRadius);
  for (const object of game.objects || []) {
    if (object.active === false || !Number.isFinite(object.x)) continue;
    const distance = Math.hypot(object.x - x, (object.y ?? object.groundY) - y); if (distance >= radius || distance < 5) continue;
    const mass = ['building', 'crane', 'concrete'].includes(object.type) ? .28 : object.type === 'barrel' ? .85 : .55;
    const fromX = object.x; const shift = clamp((x - object.x) * .27 * mass, -85, 85);
    if (shiftGravityObject(game, object, shift)) { game.interactionSerial += 1; object.lastDisplacement = { serial: game.interactionSerial, fromX, toX: object.x, kind: 'gravity' }; }
  }
  for (const target of game.players) {
    if (!target.alive || protectedAlly(game, target, source)) continue; const distance = Math.hypot(target.x - x, target.y - y); if (distance > radius) continue;
    interruptTankControl(game, target);
    let amount = directDamage(source, target, Math.max(1, Math.round(WEAPON_BALANCE.gravity.damage * (1 - distance / radius) ** 1.35)), true);
    if (source?.classType !== 'attacker' && target.shieldCharges > 0) { amount = Math.ceil(amount * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
    target.health = Math.max(0, target.health - amount); target.alive = target.health > 0; if (amount > 0) target.lastDamageRound = game.roundNumber; if (amount > 0 && sourcePlayerId && target.id !== sourcePlayerId) { target.lastDamageSourceId = sourcePlayerId; target.lastDamageTurn = game.turnNumber; } target.x = clamp(target.x + (x - target.x) * .08, 4, WORLD.width - 4); target.supportPlatformId = null; target.platformOffset = null; if (target.airborne) { target.airborne.vx += clamp((x - target.x) * .2, -55, 55); target.airborne.vy -= 45; target.airborne.updatedAt = Date.now(); } damage.push({ playerId: target.id, amount, knockback: -Math.round((radius - distance) * .68) });
  }
  game.interactionSerial += 1;
  game.gravityWells ||= [];
  game.gravityWells.push({ id: `gravity-${game.interactionSerial}`, x, y, ownerId: sourcePlayerId, radius, activateAt, endsAt: activateAt + WEAPON_BALANCE.gravity.durationMs, lastTickAt: activateAt });
  settleScenarioObjects(game); settlePlayers(game);
  damage.destruction = { terrainBlocks: Math.floor(beforeTerrain.reduce((sum, height, index) => sum + Math.max(0, game.terrain.heights[left + index] - height), 0) / 5), platformIds: [] };
  return damage;
}

export function updateGravityWells(game, now = Date.now()) {
  let changed = false;
  game.gravityWells ||= [];
  for (const well of game.gravityWells) {
    if (now < well.activateAt || now >= well.endsAt) continue;
    const dt = Math.min(.12, Math.max(0, (now - well.lastTickAt) / 1000));
    if (dt < .004) continue;
    well.lastTickAt = now;
    const source = game.players.find((player) => player.id === well.ownerId);
    for (const target of game.players) {
      if (!target.alive || protectedAlly(game, target, source)) continue;
      const dx = well.x - target.x; const dy = well.y - target.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= well.radius || distance < 10) continue;
      const strength = Math.max(.3, 1 - distance / well.radius);
      if (!target.airborne) {
        interruptTankControl(game, target); target.supportPlatformId = null; target.platformOffset = null; target.swimming = false;
        target.airborne = { vx: 0, vy: -160, falling: false, startY: target.y, minY: target.y, updatedAt: now, fromGravityWell: well.id };
      }
      const flight = target.airborne;
      flight.fromGravityWell = well.id;
      flight.vx = clamp(flight.vx + dx / distance * WEAPON_BALANCE.gravity.pullAcceleration * strength * dt, -510, 510);
      flight.vy = clamp(flight.vy + (dy / distance * WEAPON_BALANCE.gravity.pullAcceleration * strength - WEAPON_BALANCE.gravity.liftAcceleration * strength) * dt, -480, 360);
      flight.falling = false;
      changed = true;
    }
    for (const object of game.objects || []) {
      if (!object.active || !Number.isFinite(object.x) || object.type === 'crane') continue;
      const dx = well.x - object.x; const dy = well.y - (object.y ?? object.groundY);
      const distance = Math.hypot(dx, dy);
      if (distance >= well.radius || distance < 12) continue;
      const mass = ['building', 'concrete', 'watchtower'].includes(object.type) ? .16 : .6;
      const shift = clamp(dx / distance * (1 - distance / well.radius) * mass * 145 * dt, -14, 14);
      if (Math.abs(shiftGravityObject(game, object, shift)) > .1) { well.objectDirty = true; changed = true; }
    }
    if (well.objectDirty && now - (well.lastObjectSettleAt || well.activateAt) >= 100) {
      settleScenarioObjects(game);
      well.objectDirty = false; well.lastObjectSettleAt = now;
      changed = true;
    }
  }
  for (const well of game.gravityWells) if (now >= well.endsAt && well.objectDirty) { settleScenarioObjects(game); well.objectDirty = false; changed = true; }
  const count = game.gravityWells.length;
  game.gravityWells = game.gravityWells.filter((well) => now < well.endsAt);
  return changed || count !== game.gravityWells.length;
}

export function drainConnectedWater(game, x, y, radius = WEAPON_BALANCE.gravity.radius, now = Date.now()) {
  const lakes = game.waterZones || []; const connected = new Set();
  for (const lake of lakes) if (!lake.drainingAt && Math.abs(lake.x - x) <= lake.radius + radius && Math.abs(lake.surfaceY - y) <= radius + 100) connected.add(lake);
  let expanded;
  do {
    expanded = false;
    for (const lake of lakes) {
      if (lake.drainingAt || connected.has(lake)) continue;
      if ([...connected].some((other) => Math.abs(other.x - lake.x) <= other.radius + lake.radius - 10 && Math.abs(other.surfaceY - lake.surfaceY) <= 80)) { connected.add(lake); expanded = true; }
    }
  } while (expanded);
  for (const lake of connected) lake.drainingAt = now;
  if (connected.size) {
    game.interactionSerial += 1;
    game.lastWaterDrain = { serial: game.interactionSerial, x, y, lakeIds: [...connected].map((lake) => lake.id), durationMs: LAKE_DRAIN_MS };
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, now + LAKE_DRAIN_MS);
  }
  return connected.size;
}

export function standardDirectDamage(game, impact) {
  const balance = WEAPON_BALANCE.standard;
  if (impact.hitZone === 'center') return balance.centerDamage;
  const seed = (Math.round(impact.x * 13 + impact.y * 17) + (game.turnNumber || 1) * 37) >>> 0;
  if (impact.hitZone === 'head') return balance.headMin + seed % (balance.headMax - balance.headMin + 1);
  return balance.baseMin + seed % (balance.baseMax - balance.baseMin + 1);
}

function fireIncendiaryVolley(game, player, angle, firingPosition) {
  if (activeClass(player) !== 'incendiary') return null;
  const origin = { x: firingPosition.x + firingPosition.facing * 18, y: firingPosition.y - 4 };
  const rays = []; const hits = [];
  for (const spread of [-9, 0, 9]) {
    const radians = (angle + spread) * Math.PI / 180;
    const vx = Math.cos(radians) * firingPosition.facing; const vy = -Math.sin(radians);
    const path = [origin];
    for (let distance = 10; distance <= CLASS_BALANCE.incendiaryFlameRange; distance += 10) {
      const x = origin.x + vx * distance; const y = origin.y + vy * distance;
      if (x < 5 || x >= playableWidth(game.terrain) - 5 || y < 5 || y >= WORLD.height) break;
      path.push({ x, y });
      const target = game.players.find((other) => other.alive && other.id !== player.id && !protectedAlly(game, other, player) && Math.hypot(other.x - x, other.y - y) <= WORLD.tankRadius + 5);
      if (target) {
        let damage = directDamage(player, target, CLASS_BALANCE.incendiaryFlameDamage);
        if (target.shieldCharges > 0) { damage = Math.ceil(damage * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
        damage = Math.min(target.health, damage); target.health -= damage; target.alive = target.health > 0;
        target.lastDamageSourceId = player.id; target.lastDamageTurn = game.turnNumber; target.lastDamageRound = game.roundNumber;
        player.stats.damage += damage; reflectDirectDamage(game, target, player, damage);
        hits.push({ playerId: target.id, x, y, amount: damage }); break;
      }
      if (y >= terrainY(game.terrain, x) || game.terrain.floatingPlatforms?.some((surface) => surface.active && x >= surface.x && x <= surface.x + surface.width && Math.abs(y - surface.y) <= 5) || projectileStructureAt(game.objects, x, y)) break;
    }
    rays.push(path);
  }
  return { origin, rays, hits, durationMs: 650 };
}

export function fire(room, playerId, input) {
  const game = room.game;
  if (game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.');
  updateMovingPlatforms(game);
  const player = currentPlayer(game);
  if (player?.teslaDisabledTurns > 0) throw new Error('Tesla ativo: apenas movimento disponível neste turno.');
  if (game.shotEndsAt) throw new Error('Já existe um projétil em voo.');
  if (game.phase !== 'playing' || player?.id !== playerId) throw new Error('Não é seu turno.');
  if (!game.actions.attackAvailable) throw new Error('Ataque indisponível.');
  if (game.harpoonAnchor || game.harpoonPull) throw new Error('Ative o cabo do arpão ou passe o turno antes de atirar.');
  const requestedAngle = Number.isFinite(Number(input.angle)) ? Number(input.angle) : 45;
  const submerged = waterDepthAt(game.terrain, game.waterZones, player.x, player.y) >= 8;
  const power = clamp(Number(input.power) || 260, 100, 580) * (submerged && activeClass(player) !== 'amphibian' ? .42 : 1);
  if (Number(input.direction) === -1 || Number(input.direction) === 1) player.facing = Number(input.direction);
  const weapon = ['standard', ...ARSENAL_ITEMS.filter((type) => !['jump', 'spider', 'armoredDash'].includes(type))].includes(input.weapon) ? input.weapon : 'standard';
  if (game.openingRestrictionsActive && game.roundNumber === 1 && (weapon !== 'standard' || equippedPowerups(player).some((type) => !['rocketDash', 'lightningStep', 'excavator'].includes(type)))) throw new Error('Rodada 1: apenas tiro padrão e habilidades de movimento.');
  if (weapon === 'superheat') throw new Error('Superaquecer é passivo e não dispara projétil.');
  if (weapon === 'mixer') throw new Error('Misturador é passivo e não dispara projétil.');
  if (weapon === 'splitDamage') throw new Error('Dano Dividido deve ser ativado sem disparo.');
  if (weapon === 'lightningRod' && activeClass(player) !== 'meteorologist') throw new Error('A Haste é exclusiva do Meteorologista.');
  if (weapon === 'waterCannon' && activeClass(player) !== 'amphibian') throw new Error('O Canhão de Água é exclusivo do Anfíbio.');
  if (ELEMENTAL_BOMBS.includes(weapon) && activeClass(player) === 'elementalist' && player.elementalCurrent !== weapon) throw new Error('Somente a bomba elemental sorteada neste turno pode ser disparada pelo Elementalista.');
  if (weapon !== 'standard' && (!player.arsenal?.includes(weapon) || (player.ammo?.[weapon] || 0) <= 0)) throw new Error('Poder indisponível ou aguardando recarga.');
  const mixerPartner = input.mixerPartner || null;
  if (mixerPartner) {
    if (!player.arsenal?.includes('mixer')) throw new Error('Misturador não está no arsenal.');
    if (!MIXER_WEAPONS.includes(weapon) || !MIXER_WEAPONS.includes(mixerPartner) || weapon === mixerPartner) throw new Error('Misturador: selecione duas armas de impacto diferentes.');
    if (!player.arsenal.includes(mixerPartner) || (player.ammo[mixerPartner] || 0) <= 0) throw new Error('Segunda arma indisponível.');
    if (player.mixerLastUsedRound != null && game.roundNumber - player.mixerLastUsedRound < MIXER_COOLDOWN_ROUNDS) throw new Error('Misturador recarregando por 2 rodadas.');
  }
  if (weapon === 'waterTorpedo') {
    const results = simulateWaterTorpedoes(game, player);
    spendArsenalCharge(player, weapon); revealNinja(game, player, 'shot');
    const target = game.players.find((entry) => entry.id === results[0].targetId);
    for (const result of results) {
      if (result.impact) disturbWaterAt(game.terrain, game.waterZones, result.impact.x, result.impact.y, { radius: 46, strength: 12, kind: 'impact' });
      const damage = [];
      if (result.hit && target?.alive) {
        let amount = directDamage(player, target, WEAPON_BALANCE.waterTorpedo.damage);
        if (target.shieldCharges > 0) { amount = Math.ceil(amount * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
        amount = Math.min(amount, target.health); target.health -= amount; target.alive = target.health > 0;
        target.lastDamageSourceId = player.id; target.lastDamageTurn = game.turnNumber; target.lastDamageRound = game.roundNumber;
        player.stats.damage += amount; reflectDirectDamage(game, target, player, amount);
        damage.push({ playerId: target.id, amount, knockback: 0 });
      }
      result.damage = damage; result.radius = WEAPON_BALANCE.waterTorpedo.radius; result.noExplosion = !result.hit; result.interactions = [];
    }
    player.stats.shots += results.length;
    const now = Date.now(); const longest = Math.max(...results.map((entry) => entry.path.length));
    game.shotEndsAt = now + Math.max(2200, longest / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed + 1000);
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, game.shotEndsAt);
    game.pendingShot = { shooterId: player.id, weapon, extraShot: false, salvageHeal: false, destructionBefore: player.stats.destruction };
    game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = game.shotEndsAt;
    recordEliminations(game);
    return results;
  }
  if (weapon !== 'harpoon') revealNinja(game, player, 'shot');
  const reviveSerials = new Map(game.players.map((entry) => [entry.id, entry.lastRevive?.serial]));
  if (weapon === 'waterCannon') {
    spendArsenalCharge(player, weapon);
    const result = simulateWaterCannon(game, player, requestedAngle);
    const damage = applyWaterCannonDamage(game, player, result, requestedAngle);
    player.stats.shots += 1; recordEliminations(game);
    const now = Date.now(); const duration = WEAPON_BALANCE.waterCannon.durationMs;
    game.interactionSerial += 1;
    game.waterCannonStreams ||= [];
    game.waterCannonStreams.push({ id: `water-jet-${game.interactionSerial}`, ownerId: player.id, origin: result.path[0], impact: result.impact, hitPlayerIds: result.hitPlayerIds, angle: clamp(requestedAngle, -70, 70), direction: player.facing, range: CLASS_BALANCE.waterCannonRange, startedAt: now, endsAt: now + duration, lastTickAt: now });
    if (result.recoilBoost && player.alive) game.pendingWaterCannonBoost = { playerId: player.id, impact: result.impact, activateAt: now + result.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed };
    disturbWaterAt(game.terrain, game.waterZones, result.impact.x, result.impact.y, { radius: 72, strength: 22, kind: 'impact' }, now);
    game.shotEndsAt = now + duration; game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, game.shotEndsAt);
    game.pendingShot = { shooterId: player.id, weapon, extraShot: false, salvageHeal: false, destructionBefore: player.stats.destruction };
    game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = game.shotEndsAt;
    return [{ ...result, weapon, damage, noExplosion: true, radius: 0, impactDamage: 0, interactions: [], waterCannon: true, durationMs: duration }];
  }
  if (weapon === 'verticalStrike' && !input[VERTICAL_MODE]) {
    const initialGame = structuredClone(game); const normalRoom = { rules: room.rules, game: structuredClone(game) };
    const normalResults = fire(normalRoom, playerId, { ...input, [VERTICAL_MODE]: 'normal' });
    const token = `${game.turnNumber}-${playerId}-${Date.now()}`;
    const startedAt = Date.now(); const path = normalResults[0]?.path || [];
    const flightMs = path.length / (SHOT_PATH_RATE * VECTOR_FLIGHT_RATE) * 1000 / room.rules.gameSpeed;
    normalRoom.game.shotEndsAt = Math.max(normalRoom.game.shotEndsAt, startedAt + flightMs + 1800);
    normalRoom.game.lastBattleAnimationUntil = normalRoom.game.shotEndsAt;
    normalRoom.game.turnEndsAt = normalRoom.game.shotEndsAt;
    room.game = normalRoom.game; room.pendingVerticalChoice = { token, shooterId: playerId, startedAt, expiresAt: startedAt + flightMs, initialGame, input, path };
    return normalResults.map((result) => ({ ...result, verticalToken: token, canActivateVertical: true, activationIndex: Math.max(1, result.path.length - 1) }));
  }
  if (weapon === 'cluster' && !input[CLUSTER_MODE]) {
    const initialGame = structuredClone(game); const normalRoom = { rules: room.rules, game: structuredClone(game) };
    const normalResults = fire(normalRoom, playerId, { ...input, [CLUSTER_MODE]: 'normal' });
    const token = `${game.turnNumber}-${playerId}-cluster-${Date.now()}`;
    const flightMs = Math.ceil(Math.max(...normalResults.map((result) => result.path.length + (result.mirrorDelay || 0) * SHOT_PATH_RATE), 12) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed / CLUSTER_CAPSULE_SPEED);
    normalRoom.game.shotEndsAt = Date.now() + flightMs;
    normalRoom.game.lastBattleAnimationUntil = normalRoom.game.shotEndsAt + Math.max(2000, Math.ceil(1750 / room.rules.gameSpeed));
    normalRoom.game.turnEndsAt = normalRoom.game.shotEndsAt;
    room.game = normalRoom.game;
    room.pendingClusterChoice = { token, shooterId: playerId, initialGame, input, startedAt: Date.now(), expiresAt: normalRoom.game.shotEndsAt, path: normalResults[0]?.path || [] };
    return normalResults.map((result) => ({ ...result, clusterToken: token, canActivateCluster: true }));
  }
  if (weapon === 'fireworks' && !input[FIREWORKS_MODE]) {
    const initialGame = structuredClone(game); const normalRoom = { rules: room.rules, game: structuredClone(game) };
    const normalResults = fire(normalRoom, playerId, { ...input, [FIREWORKS_MODE]: 'normal' });
    const token = `${game.turnNumber}-${playerId}-fireworks-${Date.now()}`;
    const startedAt = Date.now(); const flightMs = Math.ceil((normalResults[0]?.path.length || 1) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
    room.game = normalRoom.game;
    room.pendingFireworksChoice = { token, shooterId: playerId, initialGame, input, startedAt, expiresAt: startedAt + flightMs, path: normalResults[0]?.path || [] };
    return normalResults.map((result) => ({ ...result, fireworksToken: token, canActivateFireworks: true }));
  }
  if (weapon !== 'standard') spendArsenalCharge(player, weapon);
  if (mixerPartner) { spendArsenalCharge(player, mixerPartner); player.mixerLastUsedRound = game.roundNumber; }
  if (weapon === 'megaCannon') { player.megaCannonCharge = 0; player.megaCannonUses = (player.megaCannonUses || 0) + 1; }
  if (game.roundNumber > 1 && player.isBot && !equippedPowerups(player).length && player.powerupBlockedTurns <= 0) { const botPowers = player.inventory.filter((type) => SELECTABLE_POWERUPS.has(type) && !['excavator', 'rocketDash', 'lightningStep', 'trickster'].includes(type)).slice(0, 3); player.selectedPowerups = botPowers; player.selectedPowerup = botPowers.at(-1) || null; }
  const selectedPowers = player.powerupBlockedTurns > 0 ? [] : equippedPowerups(player);
  const lightningRod = weapon === 'lightningRod';
  const equipped = (type) => selectedPowers.includes(type) && player.inventory.includes(type) && (!lightningRod || ROD_COMBO_POWERUPS.has(type)) && (weapon !== 'flyingHunter' || type !== 'laser') && (weapon !== 'harpoon') && (!['soapBomb', 'markerBomb'].includes(weapon) || TRICK_SHOT_COMBOS.has(type));
  const salvageHeal = equipped('salvageHeal') || weapon === 'vitalRecycling'; const destructionBefore = player.stats?.destruction || 0;
  const megaIndex = equipped('megaMissile') ? player.inventory.indexOf('megaMissile') : -1;
  const freezeIndex = equipped('freeze') ? player.inventory.indexOf('freeze') : -1;
  const tripleIndex = equipped('tripleShot') ? player.inventory.indexOf('tripleShot') : -1;
  const doubleIndex = equipped('doubleShot') ? player.inventory.indexOf('doubleShot') : -1;
  const bigExplosionIndex = equipped('bigExplosion') ? player.inventory.indexOf('bigExplosion') : -1;
  const mirrorIndex = equipped('mirror') ? player.inventory.indexOf('mirror') : -1;
  const armorPiercer = activeClass(player) === 'attacker' || equipped('armorPiercer'); const shockwave = equipped('shockwave'); const bunkerBuster = equipped('bunkerBuster'); const bridgeKit = equipped('bridgeKit'); const molotov = equipped('molotov'); const laser = equipped('laser');
  const angle = clamp(requestedAngle, laser || weapon === 'harpoon' || typeof input[CLUSTER_MODE] === 'object' ? -85 : 5, 85);
  const firingPosition = { x: player.x, y: player.y, facing: player.facing };
  const megaCompatible = !['mineLayer', 'gravity'].includes(weapon) && !laser;
  const megaMissile = megaIndex >= 0 && megaCompatible;
  const bigExplosion = bigExplosionIndex >= 0 && !['mineLayer', 'gravity'].includes(weapon) && !laser;
  const shotModifiers = [doubleIndex >= 0 && 'doubleShot', tripleIndex >= 0 && 'tripleShot'].filter(Boolean);
  const powerupShots = Math.min(6, (doubleIndex >= 0 ? 2 : 1) * (tripleIndex >= 0 ? 3 : 1));
  const baseShots = weapon === 'cluster' ? (typeof input[CLUSTER_MODE] === 'object' ? 3 : 1) * powerupShots : weapon === 'mineLayer' ? WEAPON_BALANCE[weapon].projectiles * powerupShots : powerupShots;
  const spreadWidth = weapon === 'mineLayer' ? 24 + Math.max(0, baseShots - 3) * 3 : weapon === 'cluster' ? 16 + Math.max(0, baseShots - 3) * 2 : baseShots > 1 ? 6 + Math.max(0, baseShots - 2) * 2 : 0;
  const spread = baseShots === 1 ? [0] : Array.from({ length: baseShots }, (_, index) => -spreadWidth / 2 + spreadWidth * index / (baseShots - 1));
  const mirror = mirrorIndex >= 0; const shotPlans = [...spread.map((offset) => ({ offset, mirrorCopy: false })), ...(mirror ? spread.map((offset) => ({ offset, mirrorCopy: true })) : [])];
  const hunter = weapon === 'flyingHunter'; const weaponBalance = WEAPON_BALANCE[weapon] || WEAPON_BALANCE.standard;
  const baseRadius = megaMissile ? (weapon === 'cluster' ? MEGA_BOMB.clusterRadius : MEGA_BOMB.radius) : weaponBalance.radius;
  let radius = baseRadius; if (bigExplosionIndex >= 0 && !['mineLayer', 'gravity'].includes(weapon) && !laser) radius = Math.round(radius * 1.55); if (bunkerBuster) radius = Math.max(radius, 92); if (shockwave) radius = Math.max(radius, 82);
  const baseDamage = megaMissile ? (weapon === 'cluster' ? MEGA_BOMB.clusterDamage : MEGA_BOMB.damage) : weaponBalance.damage;
  const guidedIndex = equipped('guidedBullet') ? player.inventory.indexOf('guidedBullet') : -1;
  const teleportIndex = equipped('teleport') ? player.inventory.indexOf('teleport') : -1;
  const guidedTarget = guidedIndex >= 0
    ? game.players.filter((p) => p.alive && p.id !== player.id && p.invisibleTurns <= 0 && !areAllies(game, p, player)).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0]
    : null;
  const results = []; let teleported = false; let bridgeBuilt = false; const shotOrigin = typeof input[CLUSTER_MODE] === 'object' ? input[CLUSTER_MODE] : { x: player.x, y: player.y };
  player.stats.shots += shotPlans.length; const trajectoryCache = new Map();
  for (const { offset, mirrorCopy } of shotPlans) {
    let result = mirrorCopy ? structuredClone(trajectoryCache.get(offset)) : null;
    result ||= weapon === 'fireworks' && typeof input[FIREWORKS_MODE] === 'object'
      ? { path: [{ x: input[FIREWORKS_MODE].x, y: input[FIREWORKS_MODE].y }], collectedPowerupIds: input[FIREWORKS_MODE].collectedPowerupIds || [], impact: { x: input[FIREWORKS_MODE].x, y: input[FIREWORKS_MODE].y } }
      : weapon === 'cluster' && typeof input[CLUSTER_MODE] === 'object'
      ? simulateShot({ terrain: game.terrain, players: game.players, powerups: game.powerups, windVortices: game.windVortices, ignorePlayerId: player.id, x: shotOrigin.x, y: shotOrigin.y, angle: Math.abs(offset) < 1 ? -84 : -52, power: Math.abs(offset) < 1 ? 210 : 225, gravity: room.rules.gravity, wind: game.wind * .4, direction: offset < 0 ? -1 : 1 })
      : laser ? simulateLaser(game, player, angle + offset, power) : hunter ? simulateHuntingPlane(game, player, angle + offset, power) : weapon === 'harpoon'
      ? simulateHarpoon({ terrain: game.terrain, objects: game.objects, players: game.players.filter((target) => !areAllies(game, target, player)), ignorePlayerId: player.id, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, direction: player.facing })
      : weapon === 'markerBomb' ? simulateMarkerBomb({ terrain: game.terrain, powerups: game.powerups, windVortices: game.windVortices, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing }) : weapon === 'grenade'
      ? simulateBouncingGrenade({ terrain: game.terrain, powerups: game.powerups, windVortices: game.windVortices, guidedTarget, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing })
      : weapon === 'moleBomb' ? simulateMoleBomb(game, player, offset) : weapon === 'verticalStrike' && typeof input[VERTICAL_MODE] === 'object' ? simulateVectorShot({ terrain: game.terrain, players: game.players, powerups: game.powerups, windVortices: game.windVortices, ignorePlayerId: player.id, x: input[VERTICAL_MODE].x, y: input[VERTICAL_MODE].y, targetX: input[VERTICAL_MODE].targetX, targetY: input[VERTICAL_MODE].targetY }) : simulateShot({ terrain: game.terrain, objects: game.objects, players: game.players, powerups: game.powerups, windVortices: game.windVortices, ignorePlayerId: player.id, guidedTarget, tankZones: weapon === 'standard' && !hunter, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing });
    if (!laser && !['moleBomb', 'harpoon'].includes(weapon)) clipProjectileAtCrane(game, result);
    if (weapon === 'waterHunter' && result.impact) { const hunter = aquaticHunterPath(game, player, result.impact); if (hunter?.path.length) { result.path.push({ x: result.impact.x, y: result.impact.y, underwater: true, sharkSwim: true }, ...hunter.path); result.impact = result.path.at(-1); result.sharkSwim = true; result.sharkPatrol = true; result.sharkBite = hunter.bite; result.sharkTargetId = hunter.targetId; result.sharkPatrolBounds = hunter.patrolBounds; } }
    const interceptingSentry = !laser ? interceptBySentry(game, player, result) : null;
    if (!laser && !interceptingSentry) interceptBySpecialistDrone(game, player, result, weapon, `${offset}-${mirrorCopy}`);
    const projectileRate = weapon === 'cluster' && !input[CLUSTER_MODE] ? CLUSTER_CAPSULE_SPEED : weapon === 'verticalStrike' && !input[VERTICAL_MODE] ? VECTOR_FLIGHT_RATE : 1;
    scheduleWeatherCloudDispersals(game, result, room.rules.gameSpeed * projectileRate, mirrorCopy ? .18 : 0);
    if (!mirrorCopy) trajectoryCache.set(offset, structuredClone(result));
    for (const id of result.collectedPowerupIds || []) { const item = game.powerups.find((entry) => entry.id === id && entry.active); if (item) { item.active = false; grantPowerup(game, player, item.type, item); } }
    if (weapon === 'harpoon') {
      const flightMs = Math.ceil(result.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
      game.harpoonAnchor = result.impact ? { ownerId: player.id, x: result.impact.x, y: result.impact.y, playerId: result.impact.playerId || null, platformId: result.impact.platformId || null, objectId: result.impact.objectId || null, readyAt: Date.now() + flightMs } : null;
      results.push({ ...result, weapon, damage: [], radius: 0, noExplosion: true, harpoonAnchor: true, mirrorDelay: mirrorCopy ? .18 : 0, interactions: [] });
      continue;
    }
    if (weapon === 'soapBomb') {
      const impactAt = Date.now() + Math.ceil(result.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
      const damage = result.impact && megaMissile ? applyExplosion(game, result.impact.x, result.impact.y, radius, baseDamage, { sourcePlayerId: player.id, attackType: weapon }) : [];
      if (damage.length) awardExplosionDestruction(game, player.id, damage);
      const targets = result.impact ? game.players.filter((target) => target.alive && !areAllies(game, target, player) && Math.hypot(target.x - result.impact.x, target.y - result.impact.y) <= radius).sort((a, b) => Math.hypot(a.x - result.impact.x, a.y - result.impact.y) - Math.hypot(b.x - result.impact.x, b.y - result.impact.y)).slice(0, WEAPON_BALANCE.soapBomb.maxTargets) : [];
      for (const target of targets) { game.interactionSerial += 1; game.soapBubbles.push({ id: `bubble-${game.interactionSerial}`, ownerId: player.id, playerId: target.id, startX: target.x, startY: target.y, x: target.x, y: target.y, originX: result.impact.x, originY: result.impact.y, radius, driftX: (Math.random() < .5 ? -1 : 1) * (8 + Math.random() * 14), impactAt, executeAt: impactAt + WEAPON_BALANCE.soapBomb.floatMs, updatedAt: impactAt, phase: game.interactionSerial * 1.7 }); }
      results.push({ ...result, weapon, damage, radius: megaMissile ? radius : 0, megaMissile, noExplosion: !megaMissile, soapTargets: targets.map((target) => target.id), interactions: megaMissile && result.impact ? activateScenarioObjects(game, result.impact.x, result.impact.y, radius, new Set(), player.id) : [] });
      continue;
    }
    if (weapon === 'markerBomb' && result.impact) {
      const impactAt = Date.now() + Math.ceil(result.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
      for (const mark of result.bounces || []) { game.interactionSerial += 1; game.delayedStrikes.push({ id: `mark-${game.interactionSerial}`, weapon, ownerId: player.id, x: mark.x, y: mark.y, impactAt: Date.now() + Math.ceil((mark.pathIndex + 1) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed), executeAt: impactAt + WEAPON_BALANCE.markerBomb.delayMs, radius: Math.round(WEAPON_BALANCE.markerBomb.markRadius * (bigExplosion ? 1.55 : 1)) }); }
      const impactRadius = megaMissile ? radius : bigExplosion ? Math.round(WEAPON_BALANCE.markerBomb.radius * 1.55) : WEAPON_BALANCE.markerBomb.radius;
      const damage = applyExplosion(game, result.impact.x, result.impact.y, impactRadius, megaMissile ? baseDamage : WEAPON_BALANCE.markerBomb.damage, { sourcePlayerId: player.id, attackType: weapon }); awardExplosionDestruction(game, player.id, damage);
      results.push({ ...result, weapon, damage, radius: impactRadius, megaMissile, interactions: activateScenarioObjects(game, result.impact.x, result.impact.y, impactRadius, new Set(), player.id) });
      continue;
    }
    if (result.impact && ['seismicCharge', 'megaCannon'].includes(weapon)) {
      const delayMs = weapon === 'megaCannon' ? WEAPON_BALANCE.megaCannon.delayMs : 2000;
      const impactAt = Date.now() + Math.ceil((result.path.length + (mirrorCopy ? .18 * SHOT_PATH_RATE : 0)) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
      game.interactionSerial += 1;
      game.delayedStrikes ||= [];
      game.delayedStrikes.push({ id: `strike-${game.interactionSerial}`, weapon, ownerId: player.id, x: result.impact.x, y: result.impact.y, impactAt, executeAt: impactAt + delayMs, radius: weapon === 'megaCannon' ? WEAPON_BALANCE.megaCannon.radius : WEAPON_BALANCE.seismicCharge.radius });
      results.push({ ...result, damage: [], radius: 0, weapon, delayedStrike: true, noExplosion: true, mirror, mirrorCopy, mirrorDelay: mirrorCopy ? .18 : 0, interactions: [], frozenPlayerIds: [] });
      continue;
    }
    if (result.impact && ['droneStrike', 'elementalEarth'].includes(weapon)) {
      const impactAt = Date.now() + Math.ceil((result.path.length + (mirrorCopy ? .18 * SHOT_PATH_RATE : 0)) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
      if (weapon === 'droneStrike') {
        const balance = WEAPON_BALANCE.droneStrike;
        const targets = game.players.filter((target) => target.alive && target.id !== player.id && target.invisibleTurns <= 0 && !areAllies(game, player, target) && Math.hypot(target.x - result.impact.x, target.y - result.impact.y) <= balance.scanRadius).sort((a, b) => Math.hypot(a.x - result.impact.x, a.y - result.impact.y) - Math.hypot(b.x - result.impact.x, b.y - result.impact.y));
        for (let missile = 0; missile < balance.missiles; missile += 1) {
          game.interactionSerial += 1;
          const fallbackX = clamp(result.impact.x + (missile - 1) * 82, 8, playableWidth(game.terrain) - 8);
          game.delayedStrikes.push({ id: `drone-${game.interactionSerial}`, weapon, ownerId: player.id, x: targets[missile % targets.length]?.x ?? fallbackX, y: result.impact.y, beaconX: result.impact.x, targetId: targets[missile % targets.length]?.id || null, missile, impactAt, executeAt: impactAt + balance.delayMs + missile * balance.intervalMs, radius: balance.secondaryRadius });
        }
      } else {
        game.interactionSerial += 1;
        game.delayedStrikes.push({ id: `earth-${game.interactionSerial}`, weapon, ownerId: player.id, x: result.impact.x, y: result.impact.y, mode: requestedAngle >= 45 ? 'ridge' : 'crater', impactAt, executeAt: impactAt + WEAPON_BALANCE.elementalEarth.delayMs, radius: WEAPON_BALANCE.elementalEarth.deformRadius });
      }
      results.push({ ...result, damage: [], radius: 0, weapon, delayedStrike: true, noExplosion: true, mirrorCopy, mirrorDelay: mirrorCopy ? .18 : 0, interactions: [] });
      continue;
    }
    if (result.impact) {
      const heavyHeight = weapon === 'heavy' ? Math.max(0, shotOrigin.y - Math.min(shotOrigin.y, ...result.path.map((point) => point.y))) : 0; const heavyDistance = weapon === 'heavy' ? Math.abs(result.impact.x - shotOrigin.x) : 0; const rawHeavyMultiplier = weapon === 'heavy' ? 1 + clamp(heavyHeight / 720, 0, 1) * .48 + clamp(heavyDistance / 1800, 0, 1) * .32 : 1; const heavyCritical = weapon === 'heavy' && rawHeavyMultiplier >= WEAPON_BALANCE.heavy.criticalThreshold; const damageMultiplier = weapon === 'heavy' ? Math.min(megaMissile ? 1.45 : WEAPON_BALANCE.heavy.maxMultiplier, rawHeavyMultiplier) * (heavyCritical ? WEAPON_BALANCE.heavy.criticalMultiplier : 1) : 1;
      const impactRadius = weapon === 'sentry' && interceptingSentry ? 30 : weapon === 'heavy' ? Math.round(radius * (1 + (damageMultiplier - 1) * .28)) : bunkerBuster ? Math.max(radius, 124) : radius;
      const impactDamage = Math.round((weapon === 'waterHunter' && !result.sharkBite ? WEAPON_BALANCE.waterHunter.landDamage : baseDamage) * damageMultiplier);
      const before = new Map(game.players.map((p) => [p.id, p.health])); const shieldBefore = new Map(game.players.map((p) => [p.id, Boolean(p.shield || p.shieldCharges > 0)]));
      const directHit = weapon === 'standard' && !megaMissile && result.impact.hitZone ? { playerId: result.impact.playerId, zone: result.impact.hitZone, damage: standardDirectDamage(game, result.impact) } : weapon === 'zeus' && result.impact.playerId ? { playerId: result.impact.playerId, damage: WEAPON_BALANCE.zeus.damage } : null;
      const deployMine = weapon === 'mineLayer' || weapon === 'waterMine'; const deploySentry = weapon === 'sentry'; const gravityWell = weapon === 'gravity'; const windBomb = weapon === 'elementalWind' || weapon === 'windPlate'; const laserStructureInteractions = laser ? activateLaserStructures(game, result, player.id) : []; const damage = (lightningRod && !megaMissile) || (deploySentry && !interceptingSentry) || windBomb ? [] : laser ? applyLaserDamage(game, result, player) : deployMine ? [] : gravityWell ? applyGravityWell(game, result.impact.x, result.impact.y, player.id, Date.now() + result.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed) : applyExplosion(game, result.impact.x, result.impact.y, impactRadius, impactDamage, { ignoreShield: armorPiercer, pushMultiplier: shockwave ? 2.8 : weapon === 'zeus' ? .08 : 1, sourcePlayerId: player.id, attackType: weapon, directHit });
      awardExplosionDestruction(game, player.id, damage);
      if (bunkerBuster && !laser) {
        const deepY = result.impact.y + 48;
        const before = game.terrain.heights.slice(Math.max(0, Math.floor(result.impact.x - 130)), Math.min(WORLD.width, Math.ceil(result.impact.x + 131)));
        carveTerrain(game.terrain, result.impact.x, deepY, 128);
        const left = Math.max(0, Math.floor(result.impact.x - 130));
        const removed = before.reduce((total, height, index) => total + Math.max(0, game.terrain.heights[left + index] - height), 0);
        damage.destruction ||= { terrainBlocks: 0, platformIds: [] };
        damage.destruction.terrainBlocks += Math.floor(removed / 5);
        awardDestruction(game, player.id, 'terrainChunk', Math.floor(removed / 120));
        settleScenarioObjects(game); settlePlayers(game);
        game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 4000);
      }
      const interactions = laser ? [{ type: 'laser', x: result.impact.x, y: result.impact.y }, ...laserStructureInteractions] : deployMine || deploySentry || gravityWell || windBomb || (lightningRod && !megaMissile) ? [] : activateScenarioObjects(game, result.impact.x, result.impact.y, impactRadius, new Set(), player.id);
      if (weapon === 'elementalFire') { game.interactionSerial += 1; const fireY = result.impact.platformId ? game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId)?.y ?? result.impact.y : terrainY(game.terrain, result.impact.x); game.fireZones.push({ id: `elemental-fire-${game.interactionSerial}`, x: result.impact.x, y: fireY, radius: WEAPON_BALANCE.elementalFire.fireRadius, turnsLeft: 3, ownerId: player.id, source: 'elementalFire', platformId: result.impact.platformId || null, bornRound: game.roundNumber }); interactions.push({ type: 'molotov', x: result.impact.x, y: fireY, radius: WEAPON_BALANCE.elementalFire.fireRadius }); }
      if (weapon === 'elementalWater') {
        const wetPlatform = result.impact.platformId && game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active);
        if (wetPlatform) { game.interactionSerial += 1; const direction = result.impact.x < wetPlatform.x + wetPlatform.width / 2 ? -1 : 1; game.platformWaterFlows ||= []; game.platformWaterFlows.push({ id: `platform-flow-${game.interactionSerial}`, platformId: wetPlatform.id, x: result.impact.x, y: wetPlatform.y - 3, direction, width: Math.min(170, wetPlatform.width), startedAt: Date.now(), updatedAt: Date.now(), endsAt: Date.now() + 5200 }); }
        const lake = carveFloodBasin(game.terrain, result.impact.x, WEAPON_BALANCE.elementalWater.floodRadius, 74);
        const impactAt = Date.now() + Math.ceil((result.path.length + (mirrorCopy ? .18 * SHOT_PATH_RATE : 0)) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
        game.interactionSerial += 1; lake.id = `elemental-lake-${game.interactionSerial}`;
        lake.fillStartedAt = impactAt; lake.fillDurationMs = 1900; lake.fillFromY = lake.surfaceY + 77;
        lake.fluid = true; lake.fluidVolume = estimateLakeVolume(game.terrain, lake);
        game.waterZones.push(lake); equalizeConnectedLakes(game.terrain, game.waterZones);
        for (const target of game.players) {
          if (!target.alive || Math.abs(target.x - result.impact.x) > lake.radius + 22 || Math.abs(target.y - result.impact.y) > 140) continue;
          const direction = Math.sign(target.x - result.impact.x) || (target.facing || 1);
          target.supportPlatformId = null; target.platformOffset = null; target.swimming = false;
          target.airborne = { vx: direction * (95 + (1 - Math.min(1, Math.abs(target.x - result.impact.x) / lake.radius)) * 115), vy: -125, falling: false, startY: target.y, minY: target.y, updatedAt: impactAt, fromWaterSurge: true };
        }
        settleScenarioObjects(game); settlePlayers(game);
        game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, impactAt + lake.fillDurationMs);
        interactions.push({ type: 'elementalFlood', x: lake.x, y: result.impact.y, radius: lake.radius });
      }
      if (windBomb) { game.interactionSerial += 1; const appearsAt = Date.now() + Math.ceil((result.path.length + (mirrorCopy ? .18 * SHOT_PATH_RATE : 0)) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed); const vortex = { id: `${weapon}-vortex-${game.interactionSerial}`, source: weapon, ownerId: player.id, x: result.impact.x, y: result.impact.y, width: WEAPON_BALANCE[weapon].width, height: WEAPON_BALANCE[weapon].height, startRound: game.roundNumber, expiresRound: game.roundNumber + 1, appearsAt, updatedAt: appearsAt, fire: false, hitRounds: {} }; game.windVortices.push(vortex); interactions.push({ type: weapon === 'windPlate' ? 'windPlate' : 'elementalVortex', x: vortex.x, y: vortex.y, width: vortex.width, height: vortex.height }); }
      if (weapon === 'elementalIce') {
        const radius = WEAPON_BALANCE.elementalIce.freezeRadius; const expiresRound = game.roundNumber + WEAPON_BALANCE.elementalIce.iceDurationRounds;
        game.fireZones = game.fireZones.filter((zone) => Math.abs(zone.x - result.impact.x) > radius + zone.radius * .4);
        for (const lake of game.waterZones || []) if (Math.abs(lake.x - result.impact.x) <= lake.radius + radius) lake.frozenUntilRound = Math.max(lake.frozenUntilRound || 0, expiresRound);
        for (const target of game.players) if (target.alive && target.id !== player.id && !areAllies(game, player, target) && Math.hypot(target.x - result.impact.x, target.y - result.impact.y) <= radius) target.frozenTurns = Math.max(target.frozenTurns || 0, 2);
        game.interactionSerial += 1; game.iceZones.push({ id: `ice-${game.interactionSerial}`, x: result.impact.x, y: terrainY(game.terrain, result.impact.x), radius, expiresRound, ownerId: player.id });
        interactions.push({ type: 'elementalIce', x: result.impact.x, y: result.impact.y, radius, expiresRound });
      }
      if (interceptingSentry) interactions.push({ type: 'sentryIntercept', x: result.impact.x, y: result.impact.y, sentryId: interceptingSentry.id });
      if (deploySentry && !interceptingSentry) { const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active); const groundY = platform?.y ?? terrainY(game.terrain, result.impact.x); game.interactionSerial += 1; const durability = WEAPON_BALANCE.sentry.durability; const sentry = { id: `sentry-${game.interactionSerial}`, type: 'sentry', x: result.impact.x, y: groundY - 22, groundY, width: 34, height: 44, durability, maxDurability: durability, active: true, ownerId: player.id, supportPlatformId: platform?.id || null, platformOffset: platform ? result.impact.x - platform.x : null, disabledUntilRound: 0, lastFiredTurn: game.turnNumber }; game.objects.push(sentry); interactions.push({ type: 'sentryDeploy', id: sentry.id, x: sentry.x, y: sentry.y, radius: WEAPON_BALANCE.sentry.scanRadius }); }
      if (lightningRod) { const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active); const groundY = platform?.y ?? terrainY(game.terrain, result.impact.x); game.interactionSerial += 1; const zapRadius = Math.round(WEAPON_BALANCE.lightningRod.zapRadius * (bigExplosion ? 1.35 : 1)); const durability = WEAPON_BALANCE.lightningRod.durability; const rod = { id: `rod-${game.interactionSerial}`, type: 'lightningRod', x: result.impact.x, y: groundY - 29, groundY, width: 24, height: 58, durability, maxDurability: durability, zapRadius, armorPiercer, freezeTurns: freezeIndex >= 0 ? 1 : 0, active: true, ownerId: player.id, supportPlatformId: platform?.id || null, platformOffset: platform ? result.impact.x - platform.x : null }; game.objects.push(rod); interactions.push({ type: 'lightningRod', id: rod.id, x: rod.x, y: rod.y, radius: zapRadius }); }
      if (deployMine) {
        const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active);
        const aquatic = weapon === 'waterMine'; const now = Date.now();
        const waterSurface = aquatic ? swimmableWaterSurface(game.terrain, game.waterZones, result.impact.x, now) : null;
        const wetImpact = waterSurface !== null && result.impact.y >= waterSurface - 20;
        const last = result.path.at(-1); const previous = result.path.at(-3) || result.path.at(-2) || last;
        game.interactionSerial += 1;
        const mine = { id: `thrown-mine-${game.interactionSerial}`, x: result.impact.x, y: aquatic ? wetImpact ? waterSurface + 8 : result.impact.y - 19 : (platform?.y ?? terrainY(game.terrain, result.impact.x)) - 3,
          active: true, aquatic, armed: !aquatic || wetImpact, ownerId: player.id, supportPlatformId: wetImpact ? null : platform?.id || null,
          platformOffset: wetImpact || !platform ? null : result.impact.x - platform.x,
          vx: aquatic && !wetImpact ? clamp(((last?.x || result.impact.x) - (previous?.x || result.impact.x)) * 18, -175, 175) : 0,
          vy: aquatic && !wetImpact ? -110 : 0, lastPhysicsAt: now, armedAt: wetImpact ? now : null };
        game.mines.push(mine);
        if (aquatic && !wetImpact && result.impact.playerId) {
          const target = game.players.find((entry) => entry.id === result.impact.playerId && entry.alive);
          const amount = hitWithInactiveAquaticMine(game, mine, target);
          if (amount) damage.push({ playerId: target.id, amount, knockback: 0 });
        }
        interactions.push({ type: 'mineDeploy', id: mine.id, x: mine.x, y: mine.y, aquatic, armed: mine.armed, radius: aquatic ? WEAPON_BALANCE.waterMine.radius : WEAPON_BALANCE.mineLayer.radius });
      }
      if (molotov) { game.interactionSerial += 1; const radius = 120; const surfaceY = result.impact.platformId ? game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId)?.y : terrainY(game.terrain, result.impact.x); const fireY = Math.min(surfaceY ?? result.impact.y, result.impact.y + 28); const incendiary = activeClass(player) === 'incendiary'; game.fireZones.push({ id: `fire-${game.interactionSerial}`, x: result.impact.x, y: fireY, radius, turnsLeft: 3 + (incendiary ? CLASS_BALANCE.incendiaryFireExtraRounds : 0), ownerId: player.id, source: 'molotov', platformId: result.impact.platformId || null, bornRound: game.roundNumber, incendiary }); interactions.push({ type: 'molotov', x: result.impact.x, y: fireY, radius }); }
      if (activeClass(player) === 'incendiary' && !molotov) {
        game.interactionSerial += 1;
        const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active);
        const fireY = Math.min(platform?.y ?? terrainY(game.terrain, result.impact.x), result.impact.y + 25);
        const ignitesAt = Date.now() + Math.ceil((result.path.length + (mirrorCopy ? .18 * SHOT_PATH_RATE : 0)) / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
        game.fireZones.push({ id: `incendiary-shot-${game.interactionSerial}`, x: result.impact.x, y: fireY, radius: 92, turnsLeft: 3 + CLASS_BALANCE.incendiaryFireExtraRounds, ownerId: player.id, source: 'incendiaryShot', platformId: platform?.id || null, bornRound: game.roundNumber, ignitesAt, incendiary: true });
        interactions.push({ type: 'incendiaryShot', x: result.impact.x, y: fireY, radius: 92 });
      }
      if (weapon === 'fireworks') for (let burst = 0; burst < WEAPON_BALANCE.fireworks.secondaryBursts; burst += 1) { const micro = simulateFireworkBurst(game, result.impact, burst, player.id); const bx = micro.impact.x; const by = micro.impact.y; const burstDamage = applyExplosion(game, bx, by, WEAPON_BALANCE.fireworks.secondaryRadius, WEAPON_BALANCE.fireworks.secondaryDamage, { pushMultiplier: .35, sourcePlayerId: player.id }); awardExplosionDestruction(game, player.id, burstDamage); interactions.push({ type: 'firework', x: bx, y: by, originX: result.impact.x, originY: result.impact.y, path: micro.path, burst, delay: burst * .025, colorIndex: burst % 4, radius: WEAPON_BALANCE.fireworks.secondaryRadius }); interactions.push(...activateScenarioObjects(game, bx, by, WEAPON_BALANCE.fireworks.secondaryRadius, new Set(), player.id)); }
      if (weapon === 'zeus') {
        const impactAt = Date.now() + Math.ceil(result.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
        game.interactionSerial += 1;
        game.delayedStrikes.push({ id: `zeus-${game.interactionSerial}`, weapon, ownerId: player.id, x: result.impact.x, y: result.impact.y, targetId: result.impact.playerId || null, impactAt, executeAt: impactAt + WEAPON_BALANCE.zeus.delayMs, radius: WEAPON_BALANCE.zeus.radius });
        interactions.push({ type: 'zeusMark', x: result.impact.x, y: result.impact.y });
      }
      if (weapon === 'teslaOrb') {
        for (const drone of game.objects || []) if (drone.type === 'healingDrone' && drone.active && drone.ownerId !== player.id) { const owner = game.players.find((entry) => entry.id === drone.ownerId); if (!areAllies(game, player, owner) && Math.hypot(drone.x - result.impact.x, drone.y - result.impact.y) <= WEAPON_BALANCE.teslaOrb.chainRadius) { drone.disabledUntilRound = Math.max(drone.disabledUntilRound || 0, game.roundNumber + 1); interactions.push({ type: 'healingDroneDisabled', id: drone.id, x: drone.x, y: drone.y }); } }
        for (const sentry of game.objects || []) if (['sentry', 'specialistDrone'].includes(sentry.type) && sentry.active && sentry.ownerId !== player.id && !areAllies(game, player, game.players.find((entry) => entry.id === sentry.ownerId)) && Math.hypot(sentry.x - result.impact.x, sentry.y - result.impact.y) <= WEAPON_BALANCE.teslaOrb.chainRadius) { sentry.disabledUntilRound = Math.max(sentry.disabledUntilRound || 0, game.roundNumber + 1); interactions.push({ type: 'sentryDisabled', id: sentry.id, x: sentry.x, y: sentry.y }); }
        const chained = game.players.filter((target) => target.alive && target.id !== player.id && activeClass(target) !== 'saboteur' && !areAllies(game, target, player) && Math.hypot(target.x - result.impact.x, target.y - result.impact.y) <= WEAPON_BALANCE.teslaOrb.chainRadius).sort((a, b) => Math.hypot(a.x - result.impact.x, a.y - result.impact.y) - Math.hypot(b.x - result.impact.x, b.y - result.impact.y)).slice(0, WEAPON_BALANCE.teslaOrb.chains);
        interactions.push({ type: 'teslaField', x: result.impact.x, y: result.impact.y, radius: WEAPON_BALANCE.teslaOrb.chainRadius });
        let from = result.impact; for (const target of chained) { const arcDamage = applyExplosion(game, target.x, target.y, 24, WEAPON_BALANCE.teslaOrb.chainDamage, { noTerrain: true, pushMultiplier: .25, sourcePlayerId: player.id, attackType: 'teslaOrb' }); awardExplosionDestruction(game, player.id, arcDamage); target.powerupBlockedTurns = Math.max(target.powerupBlockedTurns || 0, 1); target.teslaDisabledTurns = Math.max(target.teslaDisabledTurns || 0, 1); target.invisibleTurns = 0; interactions.push({ type: 'teslaChain', x: target.x, y: target.y, fromX: from.x, fromY: from.y, playerId: target.id }); from = target; }
      }
      if (weapon === 'seismicCharge') for (const direction of [-1, 1]) { const bx = clamp(result.impact.x + direction * 92, 5, WORLD.width - 5); const by = terrainY(game.terrain, bx); const waveDamage = applyExplosion(game, bx, by, WEAPON_BALANCE.seismicCharge.secondaryRadius, WEAPON_BALANCE.seismicCharge.secondaryDamage, { pushMultiplier: 1.5, sourcePlayerId: player.id }); awardExplosionDestruction(game, player.id, waveDamage); interactions.push({ type: 'seismicWave', x: bx, y: by, direction }); interactions.push(...activateScenarioObjects(game, bx, by, WEAPON_BALANCE.seismicCharge.secondaryRadius, new Set(), player.id)); }
      if (weapon === 'kineticCannon') {
        const launched = [];
        for (const hit of damage) {
          const target = game.players.find((entry) => entry.id === hit.playerId && entry.alive);
          if (!target || target.id === player.id || hit.amount <= 0) continue;
          const falloff = clamp(1 - Math.hypot(target.x - result.impact.x, target.y - result.impact.y) / (impactRadius * 1.5), .35, 1);
          interruptTankControl(game, target); target.supportPlatformId = null; target.platformOffset = null; target.swimming = false;
          target.airborne = { vx: player.facing * WEAPON_BALANCE.kineticCannon.impulse * falloff, vy: -WEAPON_BALANCE.kineticCannon.lift * falloff, falling: false, startY: target.y, minY: target.y, updatedAt: Date.now(), fromKineticCannon: true };
          launched.push(target.id);
        }
        interactions.push({ type: 'kineticBurst', x: result.impact.x, y: result.impact.y, radius: WEAPON_BALANCE.kineticCannon.radius, direction: player.facing, launched });
      }
      if (weapon === 'cryoMortar') {
        const balance = WEAPON_BALANCE.cryoMortar;
        for (const target of game.players) if (target.alive && target.id !== player.id && !areAllies(game, player, target) && Math.hypot(target.x - result.impact.x, target.y - result.impact.y) <= balance.freezeRadius) { target.frozenTurns = Math.max(target.frozenTurns || 0, 2); target.armorFractureTurns = Math.max(target.armorFractureTurns || 0, 1); }
        interactions.push({ type: 'cryoBurst', x: result.impact.x, y: result.impact.y, radius: balance.freezeRadius });
      }
      if (weapon === 'meteorSalvo') for (const direction of [-1, 1]) { const balance = WEAPON_BALANCE.meteorSalvo; const bx = clamp(result.impact.x + direction * balance.spread, 5, WORLD.width - 5); const by = terrainY(game.terrain, bx); const meteorDamage = applyExplosion(game, bx, by, balance.secondaryRadius, balance.secondaryDamage, { pushMultiplier: 1.25, sourcePlayerId: player.id, attackType: weapon }); awardExplosionDestruction(game, player.id, meteorDamage); interactions.push({ type: 'meteorImpact', x: bx, y: by, fromY: Math.max(20, by - 420), direction, radius: balance.secondaryRadius }); interactions.push(...activateScenarioObjects(game, bx, by, balance.secondaryRadius, new Set(), player.id)); }
      if (weapon === 'gravity') {
        interactions.push({ type: 'gravity', x: result.impact.x, y: result.impact.y, radius: WEAPON_BALANCE.gravity.radius, duration: WEAPON_BALANCE.gravity.durationMs });
        if (game.lastWaterDrain?.lakeIds?.length) interactions.push({ type: 'waterDrain', x: result.impact.x, y: result.impact.y, lakeIds: game.lastWaterDrain.lakeIds });
      }
      if (mixerPartner) {
        const x = result.impact.x; const y = result.impact.y;
        const secondary = WEAPON_BALANCE[mixerPartner];
        const mixRadius = Math.max(28, Math.round(secondary.radius * .65));
        const mixDamage = Math.round(secondary.damage * .55);
        const extra = applyExplosion(game, x, y, mixRadius, mixDamage, { sourcePlayerId: player.id, attackType: mixerPartner, noTerrain: ['zeus', 'teslaOrb', 'cryoMortar', 'elementalIce'].includes(mixerPartner) });
        awardExplosionDestruction(game, player.id, extra);
        interactions.push(...activateScenarioObjects(game, x, y, mixRadius, new Set(), player.id));
        if (mixerPartner === 'elementalFire') {
          game.interactionSerial += 1;
          game.fireZones.push({ id: `mixer-fire-${game.interactionSerial}`, x, y: terrainY(game.terrain, x), radius: 90, turnsLeft: 3, ownerId: player.id, source: 'mixer', bornRound: game.roundNumber });
        }
        if (['cryoMortar', 'elementalIce'].includes(mixerPartner)) for (const target of game.players) if (target.alive && target.id !== player.id && !areAllies(game, player, target) && Math.hypot(target.x - x, target.y - y) <= Math.max(85, mixRadius)) target.frozenTurns = Math.max(target.frozenTurns || 0, 1);
        if (mixerPartner === 'teslaOrb' || mixerPartner === 'zeus') for (const target of game.players) if (target.alive && target.id !== player.id && !areAllies(game, player, target) && Math.hypot(target.x - x, target.y - y) <= Math.max(95, mixRadius)) target.powerupBlockedTurns = Math.max(target.powerupBlockedTurns || 0, 1);
        if (mixerPartner === 'kineticCannon') for (const target of game.players) if (target.alive && target.id !== player.id && !areAllies(game, player, target) && Math.hypot(target.x - x, target.y - y) <= 105) { interruptTankControl(game, target); target.supportPlatformId = null; target.airborne = { vx: player.facing * 210, vy: -135, falling: false, startY: target.y, minY: target.y, updatedAt: Date.now(), fromKineticCannon: true }; }
        if (mixerPartner === 'meteorSalvo') for (const direction of [-1, 1]) { const bx = clamp(x + direction * 74, 5, playableWidth(game.terrain) - 5); const by = terrainY(game.terrain, bx); const burst = applyExplosion(game, bx, by, 38, 12, { sourcePlayerId: player.id, attackType: mixerPartner }); awardExplosionDestruction(game, player.id, burst); interactions.push({ type: 'meteorImpact', x: bx, y: by, fromY: Math.max(20, by - 230), direction, radius: 38 }); }
        interactions.push({ type: 'mixerFusion', x, y, radius: mixRadius, partner: mixerPartner });
      }
      // Report the full health loss from chained weapon effects (fireworks,
      // Zeus, etc.) so the client shows one trustworthy damage number.
      for (const target of game.players) {
        const amount = Math.max(0, (before.get(target.id) ?? target.health) - target.health);
        if (amount <= 0) continue;
        const hit = damage.find((entry) => entry.playerId === target.id);
        if (hit) hit.amount = amount;
        else damage.push({ playerId: target.id, amount, knockback: 0 });
      }
      if (activeClass(player) === 'healer') for (const ally of teammates(game, player)) if (Math.hypot(ally.x - result.impact.x, ally.y - result.impact.y) <= Math.max(48, impactRadius * 1.45)) ally.health = Math.min(ally.maxHealth, ally.health + CLASS_BALANCE.healerShotHeal);
      for (const item of game.powerups) if (item.active && item.revealed && Math.hypot(item.x - result.impact.x, item.y - result.impact.y) <= impactRadius) { item.active = false; grantPowerup(game, player, item.type, item); interactions.push({ type: 'powerupBurst', id: item.id, powerupType: item.type, x: item.x, y: item.y }); }
      if (bridgeKit && !bridgeBuilt) { interactions.push(buildBridge(game, result.impact)); bridgeBuilt = true; }
      const frozenPlayerIds = [];
      const fracturedPlayerIds = [];
      if (armorPiercer) for (const hit of damage) { const target = game.players.find((entry) => entry.id === hit.playerId); if (target?.alive && target.id !== player.id && hit.amount > 0 && !shieldBefore.get(target.id)) { target.armorFractureTurns = Math.max(target.armorFractureTurns || 0, 1); fracturedPlayerIds.push(target.id); } }
      if (freezeIndex >= 0) for (const hit of damage) {
        const target = game.players.find((entry) => entry.id === hit.playerId);
        if (target?.alive && target.id !== player.id && target.classType !== 'saboteur' && hit.amount > 0) { target.frozenTurns = Math.max(target.frozenTurns || 0, 2); frozenPlayerIds.push(target.id); }
      }
      for (const hit of damage) if (hit.playerId !== player.id) player.stats.damage += before.get(hit.playerId) - game.players.find((p) => p.id === hit.playerId).health;
      if (!gravityWell) triggerMines(game, result.impact.x, result.impact.y, radius + 25);
      let teleport = null;
      if (!teleported && teleportIndex >= 0 && player.alive) {
        const landing = findTeleportLanding(game, result.impact);
        if (landing) {
          teleport = { playerId: player.id, fromX: player.x, fromY: player.y, toX: landing.x, toY: landing.y };
          player.x = landing.x; player.y = landing.y; player.supportPlatformId = landing.supportPlatformId; player.platformOffset = landing.platformOffset; teleported = true;
        }
      }
      const comboModifiers = [mixerPartner && `mixer:${mixerPartner}`, megaMissile && 'megaMissile', bigExplosion && 'bigExplosion', ...shotModifiers, freezeIndex >= 0 && 'freeze', guidedIndex >= 0 && 'guidedBullet', teleported && 'teleport', armorPiercer && 'armorPiercer', shockwave && 'shockwave', bunkerBuster && 'bunkerBuster', bridgeKit && 'bridgeKit', molotov && 'molotov', laser && 'laser', mirror && 'mirror', equipped('extraShot') && 'extraShot'].filter(Boolean);
      results.push({ ...result, damage, radius: impactRadius, impactDamage, damageMultiplier, heavyCritical, weapon, teleport, megaMissile, bigExplosion, mirror, mirrorCopy, mirrorDelay: mirrorCopy ? .18 : 0, flyingHunter: hunter, combo: comboModifiers.length ? [...comboModifiers, weapon] : null, laser, freeze: freezeIndex >= 0, armorPiercer, shockwave, bunkerBuster, bridgeKit, noExplosion: windBomb || deployMine || (deploySentry && !interceptingSentry) || laser || gravityWell || (lightningRod && !megaMissile), interactions, frozenPlayerIds, fracturedPlayerIds });
    } else results.push({ ...result, damage: [], radius, weapon, megaMissile, mirror, mirrorCopy, mirrorDelay: mirrorCopy ? .18 : 0, flyingHunter: hunter, combo: [...shotModifiers, ...(mirror ? ['mirror'] : []), weapon], freeze: freezeIndex >= 0, armorPiercer, shockwave, bunkerBuster, interactions: [], frozenPlayerIds: [] });
  }
  for (const modifier of shotModifiers) removeInventory(player, modifier);
  if (megaMissile) removeInventory(player, 'megaMissile');
  if (bigExplosion) removeInventory(player, 'bigExplosion');
  if (freezeIndex >= 0) removeInventory(player, 'freeze');
  if (guidedIndex >= 0) player.inventory.splice(player.inventory.indexOf('guidedBullet'), 1);
  if (teleported) player.inventory.splice(player.inventory.indexOf('teleport'), 1);
  for (const modifier of ['armorPiercer', 'shockwave', 'bunkerBuster']) if (equipped(modifier)) removeInventory(player, modifier);
  if (bridgeBuilt) removeInventory(player, 'bridgeKit');
  if (molotov) removeInventory(player, 'molotov');
  if (mirror) removeInventory(player, 'mirror');
  if (salvageHeal) removeInventory(player, 'salvageHeal');
  // nextTurn decrements the departing player's counter immediately; two
  // charges therefore immobilize the shooter's next playable turn.
  if (laser) { removeInventory(player, 'laser'); if (player.classType !== 'saboteur') player.frozenTurns = Math.max(player.frozenTurns || 0, 2); }
  const extra = equipped('extraShot') ? player.inventory.indexOf('extraShot') : -1;
  const extraShot = extra >= 0 && player.alive && game.players.filter((p) => p.alive).length > 1;
  if (extra >= 0) player.inventory.splice(extra, 1);
  syncEquippedPowerups(player);
  const incendiaryVolley = fireIncendiaryVolley(game, player, angle, firingPosition);
  if (incendiaryVolley && results[0]) results[0].incendiaryVolley = incendiaryVolley;
  recordEliminations(game);
  const fragmentPaths = results.flatMap((result) => result.interactions || []).flatMap((interaction) => interaction.fragments || []).map((fragment) => fragment.path.length); const longestPath = Math.max(...results.map((result) => result.path.length + (result.mirrorDelay || 0) * SHOT_PATH_RATE), ...fragmentPaths, 12);
  const flightEndsAt = Date.now() + Math.ceil(longestPath / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
  game.shotEndsAt = flightEndsAt;
  if (game.delayedStrikes?.length) game.shotEndsAt = Math.max(game.shotEndsAt, ...game.delayedStrikes.map((strike) => strike.executeAt + 2100));
  if (game.soapBubbles?.length) game.shotEndsAt = Math.max(game.shotEndsAt, ...game.soapBubbles.map((bubble) => bubble.executeAt + 1800));
  const zeusAftermath = results.some((result) => result.interactions?.some((interaction) => interaction.type === 'zeusMark'));
  if (zeusAftermath) game.shotEndsAt = Math.max(game.shotEndsAt, flightEndsAt + 2000);
  const remainingAnimationMs = zeusAftermath ? Math.max(2000, megaMissile ? 1000 : 0) : Math.max(2000, Math.ceil((bunkerBuster ? 4000 : megaMissile ? 2900 : weapon === 'fireworks' ? 3000 : weapon === 'meteorSalvo' ? 3500 : weapon === 'gravity' ? WEAPON_BALANCE.gravity.durationMs + 250 : 1750) / room.rules.gameSpeed));
  game.lastBattleAnimationUntil = Math.max(game.shotEndsAt, flightEndsAt + remainingAnimationMs);
  game.shotEndsAt = game.lastBattleAnimationUntil;
  if (game.players.some((entry) => entry.lastRevive?.serial && entry.lastRevive.serial !== reviveSerials.get(entry.id))) {
    game.shotEndsAt = Math.max(game.lastBattleAnimationUntil, game.shotEndsAt + 2800) + 3000;
    game.lastBattleAnimationUntil = game.shotEndsAt;
  }
  game.pendingShot = { shooterId: player.id, weapon, extraShot, salvageHeal, destructionBefore };
  game.actions = { movesLeft: weapon === 'harpoon' ? game.actions.movesLeft : 0, attackAvailable: false };
  game.turnEndsAt = game.shotEndsAt;
  return results;
}

export function activateVerticalShot(room, playerId, token, target) {
  const choice = room.pendingVerticalChoice;
  if (!choice || choice.shooterId !== playerId || choice.token !== token || Date.now() >= choice.expiresAt) throw new Error('A janela do Tiro Vetorial terminou.');
  const index = Math.min(choice.path.length - 2, Math.max(0, Math.floor((Date.now() - choice.startedAt) / 1000 * SHOT_PATH_RATE * VECTOR_FLIGHT_RATE * room.rules.gameSpeed)));
  const point = choice.path[index]; if (!point || point.underground) throw new Error('O projétil já atingiu o solo.');
  const targetX = clamp(Number(target?.x), 0, WORLD.width); const targetY = clamp(Number(target?.y), 0, WORLD.height);
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || Math.hypot(targetX - point.x, targetY - point.y) < 12) throw new Error('Escolha um ponto válido no mapa.');
  room.game = choice.initialGame; room.pendingVerticalChoice = null;
  const results = fire(room, playerId, { ...choice.input, [VERTICAL_MODE]: { x: point.x, y: point.y, targetX, targetY } });
  return results.map((result) => ({ ...result, verticalActivated: true, canActivateVertical: false, activationIndex: 0 }));
}

export function activateClusterShot(room, playerId, token) {
  const choice = room.pendingClusterChoice;
  if (!choice || choice.shooterId !== playerId || choice.token !== token) throw new Error('A janela de fragmentação terminou.');
  const elapsed = Math.max(0, Date.now() - choice.startedAt);
  const index = Math.min(choice.path.length - 1, Math.floor(elapsed / 1000 * SHOT_PATH_RATE * room.rules.gameSpeed * CLUSTER_CAPSULE_SPEED));
  if (index < 1 || index >= choice.path.length - 1) throw new Error('Fragmentação disponível apenas durante o voo.');
  const point = choice.path[index];
  if (!point || point.underground) throw new Error('O projétil já atingiu o solo.');
  room.game = choice.initialGame;
  room.pendingClusterChoice = null;
  const results = fire(room, playerId, { ...choice.input, [CLUSTER_MODE]: { x: point.x, y: point.y } });
  return results.map((result) => ({ ...result, splitFrom: { x: point.x, y: point.y }, clusterActivated: true }));
}

export function activateFireworksShot(room, playerId, token) {
  const choice = room.pendingFireworksChoice;
  if (!choice || choice.shooterId !== playerId || choice.token !== token || Date.now() >= choice.expiresAt) throw new Error('A janela dos fogos terminou.');
  const elapsed = Date.now() - choice.startedAt;
  const index = Math.min(choice.path.length - 2, Math.floor(elapsed / 1000 * SHOT_PATH_RATE * room.rules.gameSpeed));
  if (index < 1) throw new Error('Aguarde o projétil sair do tanque.');
  const point = choice.path[index]; if (!point || point.underground) throw new Error('O projétil já atingiu o solo.');
  const traversed = choice.path.slice(0, index + 1); const collectedPowerupIds = choice.initialGame.powerups.filter((item) => item.active && item.revealed !== false && traversed.some((step) => Math.hypot(step.x - item.x, step.y - item.y) <= 16)).map((item) => item.id);
  room.game = choice.initialGame; room.pendingFireworksChoice = null;
  const results = fire(room, playerId, { ...choice.input, [FIREWORKS_MODE]: { x: point.x, y: point.y, collectedPowerupIds } });
  return results.map((result) => ({ ...result, fireworksActivated: true }));
}

function buildBridge(game, impact) {
  const width = 220; const x = Math.round(clamp(impact.x - width / 2, 14, WORLD.width - width - 14));
  const y = Math.round(clamp(impact.y - 8, 150, WORLD.height - 32));
  game.interactionSerial += 1;
  const platform = { id: `bridge-${game.interactionSerial}`, kind: 'bridge', x, baseX: x, y, width, height: 9, moving: false, amplitude: 0, period: 1, phase: 0, durability: 155, active: true };
  game.terrain.floatingPlatforms ||= []; game.terrain.floatingPlatforms.push(platform);
  return { type: 'bridge', id: platform.id, x: x + width / 2, y, width };
}

function removeInventory(player, type) {
  const index = player.inventory.indexOf(type);
  if (index >= 0) player.inventory.splice(index, 1);
}

export function findTeleportLanding(game, impact) {
  const hoveredDrone = impact.objectId && game.objects.find((entry) => entry.id === impact.objectId && entry.type === 'specialistDrone' && entry.active && entry.hovering);
  if (impact.objectId?.startsWith('specialist-drone-') && !hoveredDrone) return null;
  if (hoveredDrone) {
    const x = hoveredDrone.x; const y = hoveredDrone.y - hoveredDrone.height / 2 - WORLD.tankRadius - 3;
    if (!game.players.some((player) => player.alive && Math.hypot(player.x - x, player.y - y) < 28)) return { x, y, supportPlatformId: null, platformOffset: null, supportObjectId: hoveredDrone.id };
  }
  const platform = impact.platformId && game.terrain.floatingPlatforms?.find((entry) => entry.id === impact.platformId && entry.active);
  if (platform) {
    const x = clamp(impact.x, platform.x + 14, platform.x + platform.width - 14);
    if (!game.players.some((player) => player.alive && Math.abs(player.x - x) < 24 && Math.abs(player.y - (platform.y - WORLD.tankRadius)) < 24)) return { x, y: platform.y - WORLD.tankRadius, supportPlatformId: platform.id, platformOffset: x - platform.x };
  }
  for (let distance = 0; distance <= 220; distance += 5) for (const direction of distance ? [1, -1] : [1]) {
    const x = Math.round(clamp(impact.x + distance * direction, 45, WORLD.width - 45));
    if (!safeGroundAt(game.terrain, x)) continue;
    const y = terrainY(game.terrain, x) - WORLD.tankRadius;
    if (game.players.some((player) => player.alive && Math.abs(player.x - x) < 26 && Math.abs(player.y - y) < 26)) continue;
    return { x, y, supportPlatformId: null, platformOffset: null };
  }
  return null;
}

export function windForTurn(seed, turnNumber) {
  const random = seededRandom(`${seed}-wind-${turnNumber}`);
  const value = Math.round((random() * 2 - 1) * 28);
  return Math.abs(value) < 4 ? 0 : value;
}

function recordLanding(game, player, flight, now = Date.now()) {
  const distance = Math.max(0, Math.round(player.y - (flight?.minY ?? flight?.startY ?? player.y)));
  const waterDepth = waterDepthAt(game.terrain, game.waterZones, player.x, player.y + WORLD.tankRadius, now);
  const damage = waterDepth >= 1 ? 0 : fallDamage(distance, activeClass(player), Boolean(flight?.parachute));
  game.interactionSerial = (game.interactionSerial || 0) + 1;
  player.lastLanding = { serial: game.interactionSerial, x: player.x, y: player.y, speed: Math.max(0, Math.round(flight?.vy || 0)), distance, parachute: Boolean(flight?.parachute), damage, water: waterDepth >= 1 };
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, now + 500);
  if (damage > 0) {
    player.health = Math.max(0, player.health - damage);
    player.alive = player.health > 0;
    player.lastDamageRound = game.roundNumber;
    if (!player.alive) { recordEliminations(game); return false; }
  }
  player.lastSafeX = player.x; player.lastSafeY = player.y;
  collectPowerups(game, player);
  return true;
}

function landPlayer(game, player) {
  player.x = clamp(player.x, 12, WORLD.width - 12);
  const settled = resolveTankFootprint(game.terrain, player.x);
  const ground = settled.ground;
  if (ground > WORLD.height) {
    player.alive = false; player.health = 0; player.airborne = null; player.supportPlatformId = null; player.platformOffset = null;
    recordEliminations(game); return;
  }
  const landing = player.airborne; player.x = settled.x; player.y = ground - WORLD.tankRadius; player.airborne = null;
  if (recordLanding(game, player, landing)) triggerMines(game, player.x, player.y, 22, new Set(), player.id);
}

function updateAirborne(game, now) {
  let changed = false; let playerFell = false;
  for (const player of game.players) {
    if (!player.alive || !player.airborne || game.harpoonPull?.playerId === player.id || game.soapBubbles?.some((bubble) => bubble.playerId === player.id && now >= bubble.impactAt)) continue;
    const flight = player.airborne; const dt = Math.min(.35, Math.max(0, (now - flight.updatedAt) / 1000)); if (dt < .004) continue; flight.updatedAt = now;
    const travel = Math.max(Math.abs(flight.vx * dt), Math.abs((flight.vy + game.gravity * dt) * dt));
    const steps = Math.min(64, Math.max(1, Math.ceil(travel / 7), Math.ceil(dt / .025))); const substep = dt / steps;
    for (let step = 0; step < steps && player.alive && player.airborne; step += 1) {
      if (flight.parachute) {
        const steering = flight.steerUntil > now && player.fuel > 0 ? flight.steerDirection || 0 : 0;
        const targetVx = steering * Math.min(78, driveStats(player).speed * .62);
        flight.vx += (targetVx - flight.vx) * (1 - Math.exp(-(steering ? 7 : 4) * substep));
        flight.vy = Math.min(52, flight.vy + 45 * substep);
      }
      else { flight.vy += game.gravity * substep; if (flight.falling) flight.vx *= Math.exp(-.55 * substep); }
      const previousY = player.y; const previousFeet = previousY + WORLD.tankRadius;
      const nextX = clamp(player.x + flight.vx * substep, 12, WORLD.width - 12);
      const nextY = player.y + flight.vy * substep;
      const direction = Math.sign(nextX - player.x);
      const leadingX = nextX + direction * (WORLD.tankRadius + 2);
      const frontGround = terrainY(game.terrain, leadingX);
      const wallAhead = direction !== 0 && frontGround < nextY + WORLD.tankRadius - 2 && frontGround < previousFeet - 8;
      player.x = wallAhead ? player.x : nextX; if (wallAhead) flight.vx = 0;
      player.y = nextY;
      flight.minY = Math.min(flight.minY ?? flight.startY ?? previousY, player.y);
      const swimSurface = (activeClass(player) === 'amphibian' || player.buoyActive) ? swimmableWaterSurface(game.terrain, game.waterZones, player.x, now) : null;
      if (swimSurface !== null && flight.vy >= 0 && previousFeet <= swimSurface + WORLD.tankRadius * .55 && player.y + WORLD.tankRadius >= swimSurface) {
        player.y = swimSurface - WORLD.tankRadius * .45; player.airborne = null; player.swimming = true;
        player.supportPlatformId = null; player.platformOffset = null; recordLanding(game, player, flight, now); break;
      }
      const landingPlatform = flight.vy >= 0 ? game.terrain.floatingPlatforms?.filter((platform) => platform.active && player.x >= platform.x + WORLD.tankRadius && player.x <= platform.x + platform.width - WORLD.tankRadius && previousFeet <= platform.y && player.y + WORLD.tankRadius >= platform.y).sort((a, b) => a.y - b.y)[0] : null;
      if (landingPlatform) {
        if (landingPlatform.kind === 'rescuePad') {
          const island = game.terrain.floatingPlatforms.find((platform) => platform.id === landingPlatform.islandId && platform.active);
          const aimX = island ? island.x + island.width / 2 : landingPlatform.x + landingPlatform.width / 2;
          player.y = landingPlatform.y - WORLD.tankRadius;
          flight.vy = -Math.max(680, Math.sqrt(Math.max(0, 2 * game.gravity * (landingPlatform.y - (island?.y ?? 350) + 60))));
          flight.vx = clamp((aimX - player.x) * .7, -240, 240);
          flight.falling = false; flight.minY = player.y; flight.startY = player.y;
          game.interactionSerial += 1;
          player.lastLaunch = { serial: game.interactionSerial, x: player.x, y: player.y, kind: 'rescuePad', at: now };
          break;
        }
        player.y = landingPlatform.y - WORLD.tankRadius; player.supportPlatformId = landingPlatform.id; player.platformOffset = player.x - landingPlatform.x; player.airborne = null;
        recordLanding(game, player, flight, now); break;
      }
      const terrainBelow = terrainY(game.terrain, player.x);
      if (terrainBelow > WORLD.height && player.y + WORLD.tankRadius >= WORLD.height) {
        player.alive = false; player.health = 0; player.airborne = null; player.supportPlatformId = null; player.platformOffset = null; playerFell = true; break;
      }
      if (flight.vy >= 0 && player.y + WORLD.tankRadius >= terrainBelow) landPlayer(game, player);
    }
    changed = true;
  }
  if (playerFell) recordEliminations(game);
  return changed;
}

function bubbleClearAt(game, x, y) {
  if (x < 18 || x > WORLD.width - 18 || y < 30) return false;
  if ([-12, 0, 12].some((offset) => terrainY(game.terrain, x + offset) <= y + 8)) return false;
  if (game.terrain.floatingPlatforms?.some((platform) => platform.active && x + 12 >= platform.x && x - 12 <= platform.x + platform.width && y + 8 >= platform.y && y - 8 <= platform.y + platform.height)) return false;
  return ![-14, 0, 14].some((offset) => projectileStructureAt(game.objects, x + offset, y));
}

function updateSoapBubbles(game, now) {
  let changed = false;
  for (const bubble of game.soapBubbles || []) {
    if (now < bubble.impactAt) continue;
    const target = game.players.find((player) => player.id === bubble.playerId);
    if (!target?.alive) { bubble.done = true; changed = true; continue; }
    const progress = clamp((now - bubble.impactAt) / (bubble.executeAt - bubble.impactAt), 0, 1);
    if (progress < 1) {
      target.airborne = null; target.wallClinging = null; target.ceilingClinging = null; target.surfaceClinging = null; target.supportPlatformId = null; target.platformOffset = null;
      const previousUpdate = bubble.updatedAt > now ? bubble.impactAt : bubble.updatedAt || bubble.impactAt;
      let remaining = Math.min(5, Math.max(.016, (now - previousUpdate) / 1000)); bubble.updatedAt = now;
      const lift = 1 - (1 - progress) ** 1.3;
      const desiredY = Math.max(45, bubble.startY - WEAPON_BALANCE.soapBomb.lift * lift);
      const windDrift = clamp(game.wind || 0, -30, 30) * 5.5;
      const preferredX = clamp(bubble.startX + (bubble.driftX + windDrift) * progress + Math.sin(progress * 7 + bubble.phase) * 5, 18, WORLD.width - 18);
      while (remaining > 0) {
        const dt = Math.min(.05, remaining); remaining -= dt;
        const nextY = Math.max(desiredY, bubble.y - 110 * dt);
        const candidates = [preferredX, bubble.x, ...Array.from({ length: 80 }, (_, index) => bubble.x + (index % 2 ? -1 : 1) * (Math.floor(index / 2) + 1) * 8)];
        const safeX = candidates.find((x) => bubbleClearAt(game, x, nextY) && bubbleClearAt(game, x, bubble.y));
        if (safeX != null) {
          const moveX = clamp(safeX - bubble.x, -85 * dt, 85 * dt); const stepX = bubble.x + moveX;
          if (bubbleClearAt(game, stepX, nextY)) { bubble.x = stepX; bubble.y = nextY; }
          else if (bubbleClearAt(game, bubble.x, nextY)) bubble.y = nextY;
          else if (bubbleClearAt(game, stepX, bubble.y)) bubble.x = stepX;
        }
      }
      target.x = bubble.x; target.y = bubble.y; changed = true;
    } else {
      const owner = game.players.find((player) => player.id === bubble.ownerId);
      let damage = directDamage(owner, target, WEAPON_BALANCE.soapBomb.damage);
      if (target.shieldCharges > 0) { damage = Math.ceil(damage * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
      target.health = Math.max(0, target.health - damage); target.alive = target.health > 0; target.lastDamageSourceId = owner?.id; target.lastDamageTurn = game.turnNumber; target.lastDamageRound = game.roundNumber;
      if (owner && owner.id !== target.id) owner.stats.damage += damage;
      if (target.alive) target.airborne = { vx: (bubble.driftX + clamp(game.wind || 0, -30, 30) * 5.5) * .18, vy: 0, falling: true, startY: target.y, updatedAt: now, fromSoapBubble: true };
      bubble.done = true; game.interactionSerial += 1; game.lastSoapPop = { serial: game.interactionSerial, x: target.x, y: target.y, playerId: target.id, damage }; game.soapPops.push(game.lastSoapPop); game.soapPops = game.soapPops.slice(-12); changed = true;
    }
  }
  if (changed) { game.soapBubbles = game.soapBubbles.filter((bubble) => !bubble.done); recordEliminations(game); }
  return changed;
}

export function activateHarpoon(room, playerId) {
  const game = room.game; const owner = currentPlayer(game); const anchor = game.harpoonAnchor;
  if (game.phase !== 'playing' || owner?.id !== playerId || !anchor || anchor.ownerId !== playerId || game.shotEndsAt || game.harpoonPull) throw new Error('Aguarde o arpão prender antes de puxar.');
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos para puxar o arpão. Passe o turno para recuperar a munição.');
  const target = anchor.playerId && game.players.find((player) => player.id === anchor.playerId && player.alive);
  const moving = target || owner;
  const side = target?.x < owner.x ? -1 : 1;
  const destination = target ? { x: clamp(owner.x + side * (WORLD.tankRadius * 2 + 4), 12, WORLD.width - 12), y: owner.y, supportPlatformId: null, platformOffset: null } : findTeleportLanding(game, anchor);
  if (!destination) throw new Error('Nenhum pouso seguro no alcance do arpão. Passe o turno para recuperar a munição.');
  interruptTankControl(game, moving);
  game.actions.movesLeft -= 1;
  const startedAt = Date.now();
  if (target) moving.airborne = { vx: 0, vy: -80, falling: false, startY: moving.y, minY: moving.y, updatedAt: startedAt, fromHarpoon: true };
  game.harpoonPull = { ownerId: owner.id, playerId: moving.id, targetPlayerId: target?.id || null, fromX: moving.x, fromY: moving.y, toX: destination.x, toY: destination.y, supportPlatformId: destination.supportPlatformId, platformOffset: destination.platformOffset, supportObjectId: destination.supportObjectId || null, startedAt, endsAt: startedAt + (target ? WEAPON_BALANCE.harpoon.enemyPullMs : WEAPON_BALANCE.harpoon.pullMs), anchorX: anchor.x, anchorY: anchor.y };
  game.harpoonAnchor = null;
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, game.harpoonPull.endsAt + 650);
  game.turnEndsAt = Math.max(game.turnEndsAt || 0, game.harpoonPull.endsAt + 5000);
  return game.harpoonPull;
}

function updateHarpoonPull(game, now) {
  const pull = game.harpoonPull; if (!pull) return false;
  const moving = game.players.find((player) => player.id === pull.playerId && player.alive);
  if (!moving) { game.harpoonPull = null; return true; }
  const progress = clamp((now - pull.startedAt) / (pull.endsAt - pull.startedAt), 0, 1);
  const tension = pull.targetPlayerId ? .04 : .16; const travel = clamp((progress - tension) / (1 - tension), 0, 1);
  const eased = pull.targetPlayerId ? travel ** 1.35 : 1 - (1 - travel) ** 3;
  moving.wallClinging = null; moving.ceilingClinging = null; moving.surfaceClinging = null; moving.supportPlatformId = null; moving.platformOffset = null;
  if (!pull.targetPlayerId) moving.airborne = null;
  moving.x = pull.fromX + (pull.toX - pull.fromX) * eased;
  moving.y = pull.fromY + (pull.toY - pull.fromY) * eased - Math.sin(Math.PI * travel) * Math.min(130, 36 + Math.abs(pull.toX - pull.fromX) * .12);
  if (pull.targetPlayerId && moving.airborne) {
    moving.airborne.vx = (pull.toX - pull.fromX) / Math.max(.1, (pull.endsAt - pull.startedAt) / 1000);
    moving.airborne.vy = -Math.cos(Math.PI * travel) * 220;
    moving.airborne.updatedAt = now;
    moving.airborne.minY = Math.min(moving.airborne.minY, moving.y);
  }
  if (progress >= 1) {
    const owner = game.players.find((player) => player.id === pull.ownerId && player.alive);
    const side = pull.fromX < (owner?.x ?? pull.toX) ? -1 : 1;
    moving.x = owner && pull.targetPlayerId ? clamp(owner.x + side * (WORLD.tankRadius * 2 + 4), 12, WORLD.width - 12) : pull.toX;
    moving.y = owner && pull.targetPlayerId ? owner.y : pull.toY;
    if (!pull.targetPlayerId) { moving.supportPlatformId = pull.supportPlatformId; moving.platformOffset = pull.platformOffset; if (pull.supportObjectId) moving.airborne = { vx: 0, vy: 0, falling: true, startY: moving.y, minY: moving.y, updatedAt: now, fromHarpoon: true }; else { moving.lastSafeX = moving.x; moving.lastSafeY = moving.y; } }
    if (pull.targetPlayerId) {
      if (owner && Math.hypot(moving.x - owner.x, moving.y - owner.y) <= WORLD.tankRadius * 2 + 6) {
        const before = moving.health; let amount = directDamage(owner, moving, WEAPON_BALANCE.harpoon.damage);
        if (moving.shieldCharges > 0) { amount = Math.ceil(amount * .35); moving.shieldCharges -= 1; moving.shield = moving.shieldCharges > 0; }
        moving.health = Math.max(0, moving.health - amount); moving.alive = moving.health > 0; moving.lastDamageSourceId = owner.id; moving.lastDamageTurn = game.turnNumber; moving.lastDamageRound = game.roundNumber;
        owner.stats.damage += before - moving.health;
        game.interactionSerial += 1; game.lastHarpoonHit = { serial: game.interactionSerial, x: moving.x, y: moving.y, playerId: moving.id, amount };
        moving.airborne = moving.alive ? { vx: side * 65, vy: -55, falling: true, startY: moving.y, minY: moving.y, updatedAt: now, fromHarpoon: true } : null;
        recordEliminations(game);
      } else {
        moving.airborne = moving.alive ? { vx: side * 65, vy: -55, falling: true, startY: moving.y, minY: moving.y, updatedAt: now, fromHarpoon: true } : null;
      }
    }
    game.harpoonPull = null;
  }
  return true;
}

export function updateWaterPhysics(game, now = Date.now()) {
  let changed = false;
  const platforms = game.terrain.floatingPlatforms ||= [];
  game.platformWaterFlows = (game.platformWaterFlows || []).filter((flow) => now < flow.endsAt && platforms.some((entry) => entry.id === flow.platformId && entry.active));
  for (const flow of game.platformWaterFlows) {
    const platform = platforms.find((entry) => entry.id === flow.platformId && entry.active); if (!platform) continue;
    const dt = Math.min(.12, Math.max(0, (now - (flow.updatedAt || now)) / 1000)); flow.updatedAt = now; flow.x += flow.direction * 58 * dt; flow.y = platform.y - 3;
    const edge = flow.direction < 0 ? platform.x : platform.x + platform.width; if ((flow.direction < 0 && flow.x <= edge) || (flow.direction > 0 && flow.x >= edge)) { flow.x = edge; flow.cascading = true; }
    for (const player of game.players || []) if (player.alive && !player.airborne && player.supportPlatformId === platform.id && Math.abs(player.x - flow.x) <= flow.width / 2) {
      const push = flow.direction * 46 * dt; const desiredX = player.x + push; const minX = platform.x + WORLD.tankRadius; const maxX = platform.x + platform.width - WORLD.tankRadius;
      if (desiredX < minX || desiredX > maxX) { player.x = clamp(desiredX, platform.x - WORLD.tankRadius, platform.x + platform.width + WORLD.tankRadius); player.supportPlatformId = null; player.platformOffset = null; player.airborne = { vx: flow.direction * 68, vy: 18, falling: true, startY: player.y, minY: player.y, updatedAt: now, fromWaterFlow: true }; }
      else { player.x = desiredX; player.platformOffset = player.x - platform.x; }
      player.lastWaterDriftAt = now; changed = true;
    }
    changed ||= dt > 0;
  }
  for (const lake of game.waterZones || []) {
    const frozen = (lake.frozenUntilRound || 0) >= game.roundNumber;
    const sheetId = `ice-lake-${lake.id}`;
    const sheet = platforms.find((entry) => entry.id === sheetId);
    if (sheet && !sheet.active && frozen) lake.iceBrokenUntilRound = lake.frozenUntilRound;
    const centerY = waterSurfaceAt(lake, now, lake.x);
    const canFreeze = frozen && (lake.iceBrokenUntilRound || 0) < game.roundNumber && Number.isFinite(centerY) && waterDepthAt(game.terrain, [lake], lake.x, centerY + 9, now) >= 7;
    if (canFreeze) {
      const x = Math.max(0, lake.x - lake.radius + 12); const width = Math.min(playableWidth(game.terrain), lake.x + lake.radius - 12) - x;
      if (sheet) { sheet.x = x; sheet.baseX = x; sheet.y = centerY; sheet.width = width; }
      else { platforms.push({ id: sheetId, kind: 'iceSheet', lakeId: lake.id, x, baseX: x, y: centerY, width, height: 9, moving: false, durability: 125, maxDurability: 125, active: true }); changed = true; }
    } else if (sheet?.active) { sheet.active = false; if (frozen) lake.iceBrokenUntilRound = lake.frozenUntilRound; changed = true; }
    if (lake.fluid) { const flowChanged = frozen ? false : advanceFlowLake(game.terrain, lake, now); changed ||= flowChanged; if (!frozen) changed = ensureAirPockets(game.terrain, lake, now) || changed; continue; }
    if (!lake.drainingAt && lakeHasBreach(game.terrain, lake)) {
      lake.drainingAt = now;
      game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, now + LAKE_DRAIN_MS);
      changed = true;
    }
    changed = ensureAirPockets(game.terrain, lake, now) || changed;
  }
  const before = game.waterZones?.length || 0;
  game.waterZones = (game.waterZones || []).filter((lake) => !lake.drainingAt || now - lake.drainingAt < LAKE_DRAIN_MS);
  changed ||= game.waterZones.length !== before;
  for (const player of game.players || []) {
    const supported = player.supportPlatformId && game.terrain.floatingPlatforms?.some((platform) => platform.id === player.supportPlatformId && platform.active);
    if (!supported && player.supportPlatformId) { player.supportPlatformId = null; player.platformOffset = null; if (player.alive && !player.airborne) player.airborne = { vx: player.iceVelocity || 0, vy: 0, falling: true, startY: player.y, minY: player.y, updatedAt: now }; player.iceVelocity = 0; changed = true; }
    const onIce = supported && game.terrain.floatingPlatforms?.some((platform) => platform.active && platform.kind === 'iceSheet' && platform.id === player.supportPlatformId)
      || (game.iceZones || []).some((zone) => zone.expiresRound >= game.roundNumber && Math.abs(player.x - zone.x) <= zone.radius && Math.abs(player.y + WORLD.tankRadius - zone.y) <= 20);
    if (player.alive && !player.airborne && onIce && Math.abs(player.iceVelocity || 0) > 3 && now - (player.lastDriveAt || 0) > DRIVE.packetMs * 1.5) {
      const dt = Math.min(.12, Math.max(0, (now - (player.lastIceDriftAt || now)) / 1000));
      player.lastIceDriftAt = now;
      if (dt > .004) {
        const path = walkPath(game.terrain, player, Math.sign(player.iceVelocity), Math.abs(player.iceVelocity) * dt, game.objects);
        if (path.safe && path.moved) {
          player.x = path.x; player.y = path.y; player.supportPlatformId = path.supportPlatformId; const support = path.supportPlatformId ? game.terrain.floatingPlatforms?.find((entry) => entry.id === path.supportPlatformId && entry.active) : null; player.platformOffset = support ? player.x - support.x : null;
          player.movingUntil = now + 180; changed = true;
        } else player.iceVelocity = 0;
        player.iceVelocity *= Math.exp(-2.7 * dt);
      }
    } else if (!onIce) player.iceVelocity = 0;
    if (!player.alive || player.airborne || supported) continue;
    const pocket = (game.waterZones || []).flatMap((lake) => lake.airPockets || []).find((entry) => Math.abs(player.x - entry.x) <= entry.radius && waterDepthAt(game.terrain, game.waterZones, player.x, player.y + WORLD.tankRadius, now) >= 15);
    if (pocket && now >= (player.airPocketCooldownUntil || 0)) {
      const surface = swimmableWaterSurface(game.terrain, game.waterZones, player.x, now);
      if (surface !== null) {
        const dt = Math.min(.2, Math.max(0, (now - (player.lastWaterDriftAt || now)) / 1000));
        player.lastWaterDriftAt = now;
        const surfaceY = surface - WORLD.tankRadius * .45;
        player.y = Math.max(surfaceY, player.y - dt * 100);
        player.swimming = true; player.swimDepth = Math.max(0, player.y - surfaceY); changed = true;
        if (player.y <= surfaceY + 1) {
          player.swimming = false; player.swimDepth = 0; player.airPocketCooldownUntil = now + 3600;
          const lake = game.waterZones.find((entry) => entry.airPockets?.some((air) => air.id === pocket.id));
          const outward = player.x < (lake?.x ?? player.x) ? -1 : 1;
          player.airborne = { vx: outward * 140, vy: -185, falling: false, startY: player.y, minY: player.y, updatedAt: now, fromAirPocket: true };
          game.interactionSerial = (game.interactionSerial || 0) + 1;
          player.lastAirPocketBurst = { serial: game.interactionSerial, x: player.x, y: player.y, pocketId: pocket.id };
        }
        continue;
      }
    }
    if (!(activeClass(player) === 'amphibian' || player.buoyActive)) {
      if (!player.swimming) continue;
      const surface = swimmableWaterSurface(game.terrain, game.waterZones, player.x, now);
      if (surface === null) { player.swimming = false; player.swimDepth = 0; player.airborne = { vx: 0, vy: 0, falling: true, startY: player.y, updatedAt: now }; changed = true; continue; }
      const bottom = terrainY(game.terrain, player.x) - WORLD.tankRadius;
      const dt = Math.min(.2, Math.max(0, (now - (player.lastWaterDriftAt || now)) / 1000));
      player.lastWaterDriftAt = now;
      const nextY = Math.min(bottom, player.y + dt * 38);
      if (nextY > player.y + .1) { player.y = nextY; player.swimDepth = Math.max(0, nextY - (surface - WORLD.tankRadius * .45)); changed = true; }
      if (player.y >= bottom - .1) { player.swimming = false; player.swimDepth = 0; changed = true; }
      continue;
    }
    const surface = swimmableWaterSurface(game.terrain, game.waterZones, player.x, now);
    if (surface !== null && player.y + WORLD.tankRadius >= surface - 3) {
      const y = Math.min(terrainY(game.terrain, player.x) - WORLD.tankRadius, surface - WORLD.tankRadius * .45 + (player.swimDepth || 0));
      if (Math.abs(player.y - y) > .1 || !player.swimming) { player.y = y; player.swimDepth = Math.max(0, y - (surface - WORLD.tankRadius * .45)); player.swimming = true; changed = true; }
    } else if (player.swimming) {
      player.swimming = false; player.swimDepth = 0;
      player.airborne = { vx: 0, vy: 0, falling: true, startY: player.y, updatedAt: now };
      changed = true;
    }
  }
  for (const mine of game.mines || []) {
    if (!mine.active) continue;
    if (mine.aquatic) {
      const dt = Math.min(.08, Math.max(0, (now - (mine.lastPhysicsAt || now)) / 1000)); mine.lastPhysicsAt = now;
      const surface = swimmableWaterSurface(game.terrain, game.waterZones, mine.x, now);
      if (!mine.armed) {
        if (surface !== null && mine.y + 15 >= surface) {
          mine.armed = true; mine.armedAt = now; mine.y = surface + 8; mine.vy = 0; mine.vx *= .28; mine.supportPlatformId = null; mine.platformOffset = null; changed = true;
        } else if (dt) {
          const oldX = mine.x; const oldY = mine.y;
          mine.vy = Math.min(440, (mine.vy || 0) + game.gravity * dt);
          const nextX = clamp(mine.x + (mine.vx || 0) * dt, 20, playableWidth(game.terrain) - 20);
          const wall = terrainY(game.terrain, nextX + Math.sign(mine.vx || 0) * 17) < mine.y + 10
            || Boolean(projectileStructureAt(game.objects, nextX + Math.sign(mine.vx || 0) * 17, mine.y));
          mine.x = wall ? mine.x : nextX; if (wall) mine.vx *= -.48;
          const platform = game.terrain.floatingPlatforms?.find((entry) => entry.active && mine.x >= entry.x - 13 && mine.x <= entry.x + entry.width + 13 && mine.y + 15 <= entry.y + 8 && mine.y + 15 + mine.vy * dt >= entry.y);
          const floor = Math.min(terrainY(game.terrain, mine.x), platform?.y ?? Infinity) - 17;
          mine.y = Math.min(floor, mine.y + mine.vy * dt);
          if (mine.y >= floor - .1 && mine.vy > 0) { mine.vy = Math.abs(mine.vy) > 24 ? -mine.vy * .42 : 0; mine.vx *= .89; }
          if (Math.abs(mine.vx) < 2) mine.vx = 0;
          if (mine.y > WORLD.height + 25) { mine.active = false; changed = true; continue; }
          const contact = game.players.find((player) => player.alive && Math.hypot(player.x - mine.x, player.y - mine.y) <= WORLD.tankRadius + 20);
          if (contact && hitWithInactiveAquaticMine(game, mine, contact)) changed = true;
          changed ||= Math.abs(oldX - mine.x) > .1 || Math.abs(oldY - mine.y) > .1;
        }
        continue;
      }
      if (surface === null) { mine.armed = false; mine.vy = 0; changed = true; continue; }
      const oldX = mine.x; const oldY = mine.y;
      const leftSurface = swimmableWaterSurface(game.terrain, game.waterZones, mine.x - 24, now) ?? surface;
      const rightSurface = swimmableWaterSurface(game.terrain, game.waterZones, mine.x + 24, now) ?? surface;
      const current = clamp((rightSurface - leftSurface) * 2.5, -65, 65);
      mine.vx = clamp((mine.vx || 0) + current * dt, -135, 135);
      const travel = ((mine.vx || 0) + (game.wind || 0) * .22) * dt;
      const steps = Math.max(1, Math.ceil(Math.abs(travel) / 6));
      for (let step = 0; step < steps && mine.active; step += 1) {
        const nextX = clamp(mine.x + travel / steps, 20, playableWidth(game.terrain) - 20);
        const nextSurface = swimmableWaterSurface(game.terrain, game.waterZones, nextX, now);
        if (nextSurface === null) { mine.armed = false; mine.vy = 0; break; }
        mine.x = nextX; mine.y = nextSurface + 8;
        if (now - (mine.armedAt || 0) < 350) continue;
        const wall = [-20, 20].some((offset) => terrainY(game.terrain, mine.x + offset) <= mine.y + 12);
        const structure = [-17, 0, 17].some((offset) => projectileStructureAt(game.objects, mine.x + offset, mine.y));
        const contact = game.players.find((player) => player.alive && Math.hypot(player.x - mine.x, player.y - mine.y) <= WORLD.tankRadius + 21);
        if (wall || structure || contact) { triggerMines(game, mine.x, mine.y, 1); changed = true; }
      }
      mine.vx *= Math.exp(-1.3 * dt);
      changed ||= Math.abs(oldX - mine.x) > .1 || Math.abs(oldY - mine.y) > .1;
      continue;
    }
    if (waterDepthAt(game.terrain, game.waterZones, mine.x, mine.y + 3, now) < 8) continue;
    mine.active = false; mine.waterlogged = true; changed = true;
  }
  for (const object of game.objects || []) {
    if (!object.active || !Number.isFinite(object.groundY)) continue;
    const submerged = waterDepthAt(game.terrain, game.waterZones, object.x, object.groundY, now) >= 15;
    if (object.type === 'woodDebris') {
      const surface = swimmableWaterSurface(game.terrain, game.waterZones, object.x, now);
      const dt = Math.min(.12, Math.max(0, (now - (object.lastPhysicsAt || now)) / 1000)); object.lastPhysicsAt = now;
      if (surface !== null && object.groundY >= surface - 8) { const oldX = object.x; object.floating = true; object.groundY = surface + 3; object.y = object.groundY - object.height / 2; object.x = clamp(object.x + ((game.wind || 0) * .12 + (object.driftDirection || 1) * 5) * dt, 12, playableWidth(game.terrain) - 12); object.rotation += (object.driftDirection || 1) * dt * .08; changed ||= Math.abs(oldX - object.x) > .05; }
      else if (object.floating) { object.floating = false; changed = true; }
    }
    if (submerged && !object.waterlogged) { object.waterlogged = true; changed = true; }
    else if (!submerged && object.waterlogged) { object.waterlogged = false; changed = true; }
    if (submerged && object.burningUntilRound) { object.burningUntilRound = 0; changed = true; }
    if (submerged && ['sentry', 'shockCoil', 'specialistDrone'].includes(object.type)) object.disabledUntilRound = Math.max(object.disabledUntilRound || 0, game.roundNumber);
  }
  for (const platform of game.terrain.floatingPlatforms || []) {
    if (!platform.active) continue;
    const submerged = waterDepthAt(game.terrain, game.waterZones, platform.x + platform.width / 2, platform.y + 4, now) >= 10;
    if (submerged && platform.burningUntilRound) { platform.burningUntilRound = 0; changed = true; }
    if (submerged !== Boolean(platform.waterlogged)) { platform.waterlogged = submerged; changed = true; }
  }
  const fires = game.fireZones || [];
  game.fireZones = fires.filter((zone) => zone.source === 'superheat' || waterDepthAt(game.terrain, game.waterZones, zone.x, zone.y + 12, now) < 10);
  changed ||= game.fireZones.length !== fires.length;
  return changed;
}

export function updateWindVortices(game, now = Date.now()) {
  let changed = false; let expired = false;
  const remaining = [];
  for (const vortex of game.windVortices || []) {
    if (vortex.expiresTurn != null ? game.turnNumber >= vortex.expiresTurn : game.roundNumber > vortex.expiresRound) { expired = true; changed = true; continue; }
    if (now < (vortex.appearsAt || 0)) { remaining.push(vortex); continue; }
    const dt = Math.min(.12, Math.max(0, (now - vortex.updatedAt) / 1000)); vortex.updatedAt = now;
    const previousX = vortex.x;
    const drift = vortex.source === 'windPlate' ? 0 : vortex.source === 'gale' ? (vortex.driftDirection || 1) * 18 : clamp(game.wind || 0, -30, 30) * 3;
    vortex.x = clamp(vortex.x + drift * dt, vortex.width / 2, playableWidth(game.terrain) - vortex.width / 2);
    changed ||= Math.abs(vortex.x - previousX) > .05;
    if (vortex.source !== 'windPlate' && !vortex.fire && (game.fireZones || []).some((zone) => zone.turnsLeft > 0 && Math.abs(zone.x - vortex.x) <= zone.radius + vortex.width / 2 && zone.y >= vortex.y - vortex.height && zone.y <= vortex.y + 70)) { vortex.fire = true; vortex.ignitedAt = now; changed = true; }
    const owner = game.players.find((player) => player.id === vortex.ownerId);
    for (const tank of game.players) {
      if (!tank.alive || tank.id === owner?.id || areAllies(game, tank, owner) || Math.abs(tank.x - vortex.x) > vortex.width / 2 + WORLD.tankRadius || tank.y < vortex.y - vortex.height || tank.y > vortex.y + 45) continue;
      if (!tank.airborne) { interruptTankControl(game, tank); tank.supportPlatformId = null; tank.platformOffset = null; tank.airborne = { vx: 0, vy: -210, falling: false, startY: tank.y, minY: tank.y, updatedAt: now, fromElementalWind: true }; }
      tank.airborne.vx += clamp(game.wind || 0, -30, 30) * dt * 2;
      tank.airborne.vy = Math.min(tank.airborne.vy, -190);
      if (vortex.fire && vortex.hitRounds[tank.id] !== game.roundNumber) {
        let amount = directDamage(owner, tank, WEAPON_BALANCE.elementalWind.fireDamage, true);
        if (tank.shieldCharges > 0) { amount = Math.ceil(amount * .35); tank.shieldCharges -= 1; tank.shield = tank.shieldCharges > 0; }
        amount = Math.min(amount, tank.health); tank.health -= amount; tank.alive = tank.health > 0;
        tank.lastDamageSourceId = owner?.id || null; tank.lastDamageTurn = game.turnNumber; tank.lastDamageRound = game.roundNumber;
        if (owner && owner.id !== tank.id) owner.stats.damage += amount;
        tank.lastFireHit = { round: game.roundNumber, damage: amount, x: tank.x, y: tank.y, zoneId: vortex.id };
        vortex.hitRounds[tank.id] = game.roundNumber;
      }
      changed = true;
    }
    for (const object of game.objects || []) {
      if (object.active === false || !Number.isFinite(object.groundY) || Math.abs(object.x - vortex.x) > vortex.width / 2 + (object.width || 24) / 2 || object.groundY < vortex.y - vortex.height || object.groundY > vortex.y + 65) continue;
      const lift = (['building', 'crane', 'concrete'].includes(object.type) ? 35 : 125) * dt;
      object.groundY -= lift; object.y -= lift; if (object.type === 'crane') object.ballY -= lift;
      object.supportPlatformId = null; object.platformOffset = null; object.vortexLifted = true;
      object.x = clamp(object.x + clamp(game.wind || 0, -30, 30) * dt * .9, 12, WORLD.width - 12);
      changed = true;
    }
    for (const item of game.powerups || []) {
      if (!item.active || !item.revealed || Math.abs(item.x - vortex.x) > vortex.width / 2 || item.y < vortex.y - vortex.height || item.y > vortex.y + 40) continue;
      item.y = Math.max(vortex.y - vortex.height + 12, item.y - 180 * dt); item.x = clamp(item.x + clamp(game.wind || 0, -30, 30) * dt * 1.2, 10, WORLD.width - 10); item.vortexLifted = true; changed = true;
    }
    remaining.push(vortex);
  }
  game.windVortices = remaining;
  if (expired) {
    settleScenarioObjects(game);
    for (const item of game.powerups || []) if (item.vortexLifted) { item.y = terrainY(game.terrain, item.x) - 12; item.anchorY = item.y; item.vortexLifted = false; }
  }
  if (changed) recordEliminations(game);
  return changed;
}

export function updateFireZonePhysics(game, now = Date.now()) {
  let moved = false;
  for (const zone of game.fireZones || []) {
    if (zone.source === 'superheat') continue;
    if (zone.sourceObjectId) {
      const sourceObject = game.objects?.find((object) => object.id === zone.sourceObjectId && object.active);
      if (sourceObject) { zone.x = sourceObject.x; zone.y = sourceObject.groundY - sourceObject.height * .48; zone.physicsAt = now; zone.vy = 0; zone.falling = false; continue; }
      zone.sourceObjectId = null; zone.falling = true; zone.vy = Math.max(70, zone.vy || 0);
    }
    if (zone.flames?.length && (Math.abs(zone.x - zone.fireVisualX) > Math.max(60, zone.radius * .5) || Math.abs(zone.y - zone.fireVisualY) > 80)) zone.flames = null;
    if (!zone.flames?.length) {
      const step = Math.max(10, Math.ceil(zone.radius * 2 / 22));
      zone.flames = [];
      for (let offset = -zone.radius; offset <= zone.radius; offset += step) {
        const x = Math.round(clamp(zone.x + offset, 8, playableWidth(game.terrain) - 8));
        const platform = game.terrain.floatingPlatforms?.filter((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && Math.abs(entry.y - zone.y) <= 28).sort((a, b) => Math.abs(a.y - zone.y) - Math.abs(b.y - zone.y))[0];
        const ground = terrainY(game.terrain, x);
        const onGround = !platform && Math.abs(ground - zone.y) <= 105;
        zone.flames.push({ x, y: platform?.y ?? (onGround ? ground : zone.y), support: platform ? 'platform' : onGround ? 'terrain' : null, supportId: platform?.id || null, platformOffset: platform ? x - platform.x : null, vy: 0, falling: !platform && !onGround, physicsAt: now, releaseAt: !platform && !onGround ? Math.max(now + 350, game.lastBattleAnimationUntil || now) : 0 });
      }
      if (!zone.flames.length) zone.flames.push({ x: zone.x, y: zone.y, support: null, supportId: null, vy: 0, falling: true, physicsAt: now, releaseAt: now });
    }
    for (const flame of zone.flames) {
      const previous = flame.physicsAt || now;
      const dt = Math.min(.12, Math.max(0, (now - previous) / 1000)); flame.physicsAt = now;
      if (!flame.falling) {
        const platform = flame.support === 'platform' && game.terrain.floatingPlatforms?.find((entry) => entry.id === flame.supportId && entry.active);
        if (platform) { const nextX = platform.x + flame.platformOffset; moved ||= Math.abs(flame.x - nextX) > .1; flame.x = nextX; flame.y = platform.y; continue; }
        if (flame.support === 'terrain' && Math.abs(terrainY(game.terrain, flame.x) - flame.y) <= 7) continue;
        flame.falling = true; flame.support = null; flame.supportId = null; flame.vy = 0;
        flame.releaseAt = Math.max(now + 350, game.lastBattleAnimationUntil || now);
        moved = true;
      }
      if (now < flame.releaseAt) continue;
      flame.vy = Math.min(760, (flame.vy || 0) + 620 * dt);
      const nextY = flame.y + flame.vy * dt;
      const candidates = [{ y: terrainY(game.terrain, flame.x), support: 'terrain', id: null }];
      for (const platform of game.terrain.floatingPlatforms || []) if (platform.active && flame.x >= platform.x && flame.x <= platform.x + platform.width) candidates.push({ y: platform.y, support: 'platform', id: platform.id, offset: flame.x - platform.x });
      const landing = candidates.filter((entry) => entry.y >= flame.y - 4 && entry.y <= nextY + 2).sort((a, b) => a.y - b.y)[0];
      if (landing) { flame.y = landing.y; flame.falling = false; flame.vy = 0; flame.support = landing.support; flame.supportId = landing.id; flame.platformOffset = landing.offset ?? null; }
      else flame.y = nextY;
      if (flame.y >= game.lavaLevel) flame.extinguished = true;
      moved = true;
    }
    zone.flames = zone.flames.filter((flame) => !flame.extinguished);
    if (zone.platformId && !zone.flames.some((flame) => flame.supportId === zone.platformId)) { zone.platformId = null; zone.platformOffset = null; }
    if (!zone.flames.length) { zone.turnsLeft = 0; continue; }
    const center = zone.flames[Math.floor(zone.flames.length / 2)];
    zone.x = center.x; zone.y = center.y; zone.fireVisualX = zone.x; zone.fireVisualY = zone.y; zone.falling = zone.flames.some((flame) => flame.falling);
  }
  game.fireZones = (game.fireZones || []).filter((zone) => zone.turnsLeft > 0);
  return moved;
}

function igniteTree(game, object, zone) {
  if ((game.fireZones || []).some((entry) => entry.turnsLeft > 0 && entry.sourceObjectId === object.id)) return;
  const balance = TREE_BALANCE[object.treeSize] || TREE_BALANCE.medium;
  game.interactionSerial += 1;
  game.fireZones.push({
    id: `tree-fire-${game.interactionSerial}`, x: object.x, y: object.groundY - object.height * .48,
    radius: balance.spreadRadius, turnsLeft: object.treeSize === 'small' ? 3 : 4, ownerId: zone.ownerId || null,
    source: 'tree', sourceObjectId: object.id, lastAppliedRound: game.roundNumber,
  });
}

function fireTouches(zone, x, y, horizontal = 18, vertical = 76) {
  return zone.flames?.length
    ? zone.flames.some((flame) => Math.abs(flame.x - x) <= horizontal && Math.abs(flame.y - y) <= vertical)
    : Math.abs(zone.x - x) <= zone.radius + horizontal && Math.abs(zone.y - y) <= vertical;
}

function applyFireZones(game) {
  if (!(game.fireZones || []).length) return;
  const now = Date.now();
  updateFireZonePhysics(game, now);
  let structureChanged = false;
  for (const zone of [...(game.fireZones || [])]) {
    if (zone.ignitesAt && now < zone.ignitesAt) continue;
    if (zone.lastAppliedRound === game.roundNumber) continue;
    const iceBefore = game.iceZones?.length || 0;
    game.iceZones = (game.iceZones || []).filter((ice) => Math.abs(ice.x - zone.x) > ice.radius + zone.radius * .55);
    if ((game.iceZones?.length || 0) !== iceBefore) zone.meltedIceRound = game.roundNumber;
    for (const lake of game.waterZones || []) if ((lake.frozenUntilRound || 0) >= game.roundNumber && Math.abs(lake.x - zone.x) <= lake.radius + zone.radius) {
      lake.frozenUntilRound = game.roundNumber - 1;
      lake.thawedAt = now;
      zone.meltedIceRound = game.roundNumber;
    }
    const owner = game.players.find((player) => player.id === zone.ownerId);
    for (const target of game.players) if (target.alive && (zone.source !== 'superheat' || target.id !== owner?.id) && !(owner?.id === target.id && activeClass(owner) === 'incendiary') && !(target.foamGuardUntilRound >= game.roundNumber) && (!owner || target.id === owner.id || !protectedAlly(game, target, owner)) && (zone.source === 'superheat' ? Math.hypot(target.x - zone.x, target.y - zone.y) <= zone.radius : fireTouches(zone, target.x, target.y))) { const damage = directDamage(owner, target, 25 + (zone.incendiary && activeClass(owner) === 'incendiary' ? CLASS_BALANCE.incendiaryFireBonus : 0), true); target.health = Math.max(0, target.health - damage); target.alive = target.health > 0; target.lastDamageRound = game.roundNumber; target.lastFireHit = { round: game.roundNumber, damage, x: target.x, y: target.y, zoneId: zone.id }; if (owner && target.id !== owner.id) { target.lastDamageSourceId = owner.id; target.lastDamageTurn = game.turnNumber; reflectDirectDamage(game, target, owner, damage); owner.stats.damage += damage; } }
    for (const object of game.objects || []) if (object.active && (zone.source === 'superheat' ? Math.hypot(object.x - zone.x, (object.groundY ?? object.y) - (object.height || 0) / 2 - zone.y) <= zone.radius + (object.height || 0) / 2 : fireTouches(zone, object.x, object.groundY ?? object.y, (object.width || 24) / 2 + 18, Math.max(95, object.height || 0)))) {
      const isTree = TREE_TYPES.has(object.type); const amount = isTree ? (TREE_BALANCE[object.treeSize]?.fireDamage || 2) : 1;
      object.durability = Math.max(0, (object.durability ?? 2) - amount); object.burningUntilRound = game.roundNumber + zone.turnsLeft;
      if (isTree) igniteTree(game, object, zone);
      if (!object.durability) { if (isTree) destroyTree(game, object, owner?.id || null); else { object.active = false; if (owner) awardDestruction(game, owner.id, object.type); } structureChanged = true; }
    }
    for (const surface of game.terrain.floatingPlatforms || []) if (surface.active && (zone.source === 'superheat' ? Math.hypot(clamp(zone.x, surface.x, surface.x + surface.width) - zone.x, surface.y - zone.y) <= zone.radius : zone.flames?.length ? zone.flames.some((flame) => flame.x >= surface.x - 18 && flame.x <= surface.x + surface.width + 18 && Math.abs(flame.y - surface.y) < 90) : surface.x <= zone.x + zone.radius && surface.x + surface.width >= zone.x - zone.radius && Math.abs(surface.y - zone.y) < 90)) {
      surface.durability = Math.max(0, surface.durability - (surface.kind === 'treeBranch' ? 44 : 22)); surface.burningUntilRound = game.roundNumber + zone.turnsLeft;
      if (surface.kind === 'treeBranch') { const tree = game.objects?.find((object) => object.id === surface.treeId && object.active); if (tree) igniteTree(game, tree, zone); }
      if (!surface.durability) { surface.active = false; structureChanged = true; }
    }
    zone.lastAppliedRound = game.roundNumber;
    zone.turnsLeft -= 1;
  }
  game.fireZones = (game.fireZones || []).filter((zone) => zone.turnsLeft > 0); if (structureChanged) { settleScenarioObjects(game); settlePlayers(game); } recordEliminations(game);
}

export function tickRoom(room) {
  const game = room.game;
  if (!game) return null;
  const now = Date.now();
  if (game.lastNinjaStrike?.concealed && !game.lastNinjaStrike.revealComplete && now >= game.lastNinjaStrike.startedAt + CLASS_BALANCE.ninjaFatalDurationMs) {
    game.lastNinjaStrike.revealComplete = true;
    return { changed: true };
  }
  if (game.phase === 'class') {
    if (now < game.classEndsAt) return null;
    game.phase = 'arsenal'; game.arsenalEndsAt = now + GAME_TIMING.arsenalMs; return { changed: true };
  }
  if (game.phase === 'arsenal') {
    if (now < game.arsenalEndsAt) return null;
    beginRoulette(game, now); return { changed: true };
  }
  if (game.phase === 'roulette') {
    if (now < game.rouletteEndsAt) return null;
    game.turnIndex = game.rouletteWinnerIndex ?? game.turnIndex; game.phase = 'playing'; game.openingRestrictionsActive = true; game.roundNumber = 1; game.roundParticipants = game.players.filter((player) => player.alive).map((player) => player.id); game.roundCompleted = []; applyRoundClassPassives(game); const starter = currentPlayer(game); starter.turnsPlayed = 1; rollElementalBomb(game, starter); game.actions = { movesLeft: starter.classType === 'ninja' ? 3 : 2, attackAvailable: true }; applyTurnClassPassives(game, starter); collectPowerups(game, starter); game.turnEndsAt = now + room.rules.turnSeconds * 1000 / room.rules.gameSpeed; game.botActAt = now + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed; return { changed: true };
  }
  if (game.phase !== 'playing') return null;
  if (game.paused) return null;
  let waterBoostChanged = false;
  if (game.pendingWaterCannonBoost && now >= game.pendingWaterCannonBoost.activateAt) {
    const boost = game.pendingWaterCannonBoost; game.pendingWaterCannonBoost = null;
    const player = game.players.find((entry) => entry.id === boost.playerId && entry.alive);
    if (player) {
      interruptTankControl(game, player); player.swimming = false; player.supportPlatformId = null; player.platformOffset = null;
      player.airborne = { vx: -player.facing * 42, vy: -CLASS_BALANCE.waterCannonRecoilLift, falling: false, startY: player.y, minY: player.y, updatedAt: now, fromWaterCannonRecoil: true };
      waterBoostChanged = true;
    }
  }
  const weatherChanged = game.weather?.kind === 'clearing' && now >= game.weather.endsAt;
  if (weatherChanged) game.weather = null;
  const waterChanged = updateWaterPhysics(game, now);
  const vortexChanged = updateWindVortices(game, now);
  const fireMoved = updateFireZonePhysics(game, now);
  const cloudChanged = updateWeatherCloudDispersals(game, now);
  const dueBomberGrenades = (game.bomberGrenades || []).filter((grenade) => now >= grenade.impactAt);
  if (dueBomberGrenades.length) {
    game.bomberGrenades = game.bomberGrenades.filter((grenade) => now < grenade.impactAt);
    for (const grenade of dueBomberGrenades) {
      const { x, y } = grenade.impact;
      const hits = applyExplosion(game, x, y, CLASS_BALANCE.bomberDeathGrenadeRadius, CLASS_BALANCE.bomberDeathGrenadeDamage, { sourcePlayerId: grenade.ownerId, attackType: 'bomberDeathGrenade', pushMultiplier: 1.15 });
      awardExplosionDestruction(game, grenade.ownerId, hits);
      const effectiveRadius = CLASS_BALANCE.bomberDeathGrenadeRadius + CLASS_BALANCE.bomberRadius;
      const interactions = activateScenarioObjects(game, x, y, effectiveRadius, new Set(), grenade.ownerId);
      game.interactionSerial += 1;
      game.bomberGrenadeImpacts.push({ serial: game.interactionSerial, id: grenade.id, ownerId: grenade.ownerId, x, y, radius: effectiveRadius, hits: hits.filter((hit) => hit.amount > 0), interactions });
      game.bomberGrenadeImpacts = game.bomberGrenadeImpacts.slice(-16);
    }
    settleScenarioObjects(game); settlePlayers(game); updateWaterPhysics(game, now); recordEliminations(game);
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, now + 850);
    game.bomberVictoryAt = Math.max(game.bomberVictoryAt || 0, now + 850);
    if (game.shotEndsAt) game.shotEndsAt = Math.max(game.shotEndsAt, game.lastBattleAnimationUntil);
    evaluateVictory(game);
    return { changed: true };
  }
  if (game.bomberVictoryAt && now >= game.bomberVictoryAt) {
    game.bomberVictoryAt = null;
    if (evaluateVictory(game)) return { changed: true };
  }
  const lavaVictims = game.players.filter((player) => player.alive && Number.isFinite(player.y) && player.y + WORLD.tankRadius >= game.lavaLevel);
  if (lavaVictims.length) { for (const player of lavaVictims) { player.health = 0; player.alive = false; player.airborne = null; } recordEliminations(game); evaluateVictory(game); return { changed: true }; }
  if (game.bomberGrenades?.length) return waterChanged || vortexChanged || fireMoved || weatherChanged || cloudChanged ? { changed: true } : null;
  if (game.pendingArenaEvent) {
    if (now < game.pendingArenaEvent.executeAt) return waterChanged || vortexChanged || weatherChanged || cloudChanged ? { changed: true } : null;
    resolveArenaEvent(game); for (const player of game.players) if (activeClass(player) === 'backpacker') collectPowerups(game, player); return { changed: true };
  }
  let rewardsChanged = false;
  for (const player of game.players) if (player.rewardOffer && now >= player.rewardOffer.expiresAt) { autoClaimReward(game, player); rewardsChanged = true; }
  if (rewardsChanged) return { changed: true };
  const gravityChanged = updateGravityWells(game, now);
  const waterJetChanged = updateWaterCannonStreams(game, now);
  const bubbleChanged = updateSoapBubbles(game, now);
  const harpoonChanged = updateHarpoonPull(game, now);
  const airborneChanged = updateAirborne(game, now);
  if (game.phase !== 'playing') return { changed: true };
  if (airborneChanged && !currentPlayer(game)?.alive) { nextTurn(room); return { changed: true }; }
  updateMovingPlatforms(game);
  if (room.pendingClusterChoice?.shooterId && game.shotEndsAt) {
    const choice = room.pendingClusterChoice;
    if (now >= choice.expiresAt) { room.pendingClusterChoice = null; game.shotEndsAt = Math.max(game.shotEndsAt, game.lastBattleAnimationUntil || 0); }
    const shooter = game.players.find((player) => player.id === choice.shooterId);
    const flightMs = choice.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed / CLUSTER_CAPSULE_SPEED;
    if (shooter?.isBot && now - choice.startedAt >= flightMs * .45 && now - choice.startedAt < flightMs * .9) {
      const results = activateClusterShot(room, choice.shooterId, choice.token);
      return { changed: true, shot: { shooterId: shooter.id, results, replaceCluster: true } };
    }
  }
  const dueStrikes = (game.delayedStrikes || []).filter((strike) => now >= strike.executeAt);
  if (dueStrikes.length) {
    game.delayedStrikes = game.delayedStrikes.filter((strike) => now < strike.executeAt);
    const results = dueStrikes.map((strike) => resolveDelayedStrike(game, strike));
    recordEliminations(game);
    return { changed: true, shot: { shooterId: dueStrikes[0].ownerId, results, detonation: true } };
  }
  if (game.shotEndsAt) {
    if (game.pendingShot?.weapon === 'waterCannon' && game.players.some((entry) => entry.alive && entry.airborne?.fromWaterCannonRecoil)) {
      game.shotEndsAt = Math.max(game.shotEndsAt, now + 220);
      game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, game.shotEndsAt);
    }
    if (game.pendingShot?.weapon === 'soapBomb' && game.players.some((entry) => entry.alive && entry.airborne?.fromSoapBubble)) {
      game.shotEndsAt = Math.max(game.shotEndsAt, now + 220);
      game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, game.shotEndsAt);
    }
    if (Date.now() < game.shotEndsAt) return waterBoostChanged || gravityChanged || waterJetChanged || airborneChanged || bubbleChanged || harpoonChanged || fireMoved || waterChanged || vortexChanged || weatherChanged || cloudChanged ? { changed: true } : null;
    finishPendingShot(room); for (const player of game.players) if (activeClass(player) === 'backpacker') collectPowerups(game, player); return { changed: true };
  }
  // Continuous effects must not starve the turn clock, bot actions or arena events.
  const worldChanged = gravityChanged || waterJetChanged || airborneChanged || bubbleChanged || harpoonChanged || fireMoved || waterChanged || vortexChanged || weatherChanged || cloudChanged;
  if (game.harpoonPull) return worldChanged ? { changed: true } : null;
  if (game.arenaEventReadyAt) { if (now < game.arenaEventReadyAt) return worldChanged ? { changed: true } : null; game.arenaEventReadyAt = null; const event = applyArenaPulse(room); if (!event) game.arenaWarningUntil = null; return { changed: true }; }
  if (Date.now() >= game.turnEndsAt) { nextTurn(room); return { changed: true }; }
  const bot = currentPlayer(game);
  if (bot?.isBot && (bot.frozenTurns > 0 || (!game.actions.attackAvailable && ((bot.fuel || 0) <= 0 || ![-1, 1].some((direction) => { const path = walkPath(game.terrain, bot.teslaDisabledTurns > 0 ? { ...bot, spiderClimb: false } : bot, direction, Math.min(38, bot.fuel || 0)); return path.safe && path.moved; }))))) { nextTurn(room); return { changed: true }; }
  if (!bot?.isBot || Date.now() < game.botActAt) return worldChanged ? { changed: true } : null;
  if (backpackerRerollAvailable(game, bot)) { rerollBackpackerArsenal(room, bot.id); return { changed: true }; }
  if (!(game.openingRestrictionsActive && game.roundNumber === 1) && game.actions.attackAvailable && ninjaFatalTarget(game, bot)) { ninjaFatal(room, bot.id, ninjaFatalTarget(game, bot).id); return { changed: true }; }
  if (game.ninjaFatalStage?.playerId === bot.id && game.actions.attackAvailable) { ninjaFatal(room, bot.id, null, { x: game.ninjaFatalStage.returnX, y: game.ninjaFatalStage.returnY }); return { changed: true }; }
  if (game.harpoonAnchor?.ownerId === bot.id) { try { activateHarpoon(room, bot.id); } catch { nextTurn(room); } return { changed: true }; }
  const targets = game.players.filter((player) => player.alive && player.id !== bot.id && player.invisibleTurns <= 0 && !areAllies(game, player, bot));
  if (!targets.length) {
    if (['hill', 'teamHill'].includes(game.mode) && game.hill && (bot.fuel || 0) > 0 && Math.abs(bot.x - game.hill.x) > game.hill.radius * .7) {
      const direction = game.hill.x < bot.x ? -1 : 1;
      if (safeGroundAt(game.terrain, bot.x + direction * 38)) { try { movePlayer(room, bot.id, direction, null, { continuous: true, bot: true }); game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / (game.botSpeed || 1); return { changed: true }; } catch {} }
    }
    nextTurn(room); return { changed: true };
  }
  const target = chooseBotTarget(game, bot, targets);
  const difficulty = room.rules.botDifficulty;
  const random = seededRandom(`${game.seed}-bot-${game.turnNumber}-${bot.id}-${game.actions.movesLeft}`);
  const hillApproach = ['hill', 'teamHill'].includes(game.mode) && game.hill && Math.abs(game.hill.x - bot.x) > game.hill.radius * .7;
  let direction = (hillApproach ? game.hill.x : target.x) < bot.x ? -1 : 1;
  let shouldMove = hillApproach || (difficulty === 'easy' ? random() > .68 : Math.abs(target.x - bot.x) > 180);
  if (bot.teslaDisabledTurns > 0) { if ((bot.fuel || 0) > 0 && safeGroundAt(game.terrain, bot.x + direction * 38)) { try { movePlayer(room, bot.id, direction, null, { continuous: true, bot: true }); game.botActAt = Date.now() + botDelay(difficulty) / (game.botSpeed || 1); return { changed: true }; } catch {} } nextTurn(room); return { changed: true }; }
  if (difficulty === 'hard' || bot.personality === 'collector') {
    const item = game.powerups.filter((entry) => entry.active).sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];
    if (item && Math.abs(item.x - bot.x) < 320 && safeGroundAt(game.terrain, bot.x + (item.x < bot.x ? -38 : 38))) { direction = item.x < bot.x ? -1 : 1; shouldMove = true; }
  }
  if (bot.personality === 'defensive' && Math.abs(target.x - bot.x) < 130 && safeGroundAt(game.terrain, bot.x - direction * 38)) { direction *= -1; shouldMove = true; }
  // Commit to one travel direction for this turn. Re-evaluating the nearest
  // target after every tiny drive packet used to send bots back and forth.
  if (bot.botDriveDirection) direction = bot.botDriveDirection;
  else if (shouldMove) bot.botDriveDirection = direction;
  shouldMove = shouldMove && (bot.botDriveDistance || 0) < 155 && (hillApproach || Math.abs(target.x - bot.x) > 125);
  if (game.roundNumber > 1 && game.actions.attackAvailable && bot.health < bot.maxHealth * .55 && bot.arsenal?.includes('splitDamage') && (bot.ammo?.splitDamage || 0) > 0 && !(bot.splitDamageUntilRound >= game.roundNumber)) { useArsenal(room, bot.id, { type: 'splitDamage' }); return { changed: true }; }
  if ((bot.fuel || 0) > 0 && !bot.driveBlocked && shouldMove && safeGroundAt(game.terrain, bot.x + direction * 38)) {
    const beforeX = bot.x;
    try { if (!movePlayer(room, bot.id, direction, null, { continuous: true, bot: true, maxDistance: 155 - (bot.botDriveDistance || 0) })) bot.driveBlocked = true; else bot.botDriveDistance = (bot.botDriveDistance || 0) + Math.abs(bot.x - beforeX); } catch { bot.driveBlocked = true; }
    game.botActAt = Date.now() + Math.round(botDelay(difficulty) * .58 / (game.botSpeed || 1));
    return { changed: true };
  }
  const useLaser = !(game.openingRestrictionsActive && game.roundNumber === 1) && bot.inventory?.includes('laser') && bot.powerupBlockedTurns <= 0 && Math.abs(target.x - bot.x) <= 1350;
  if (useLaser) { bot.selectedPowerups = [...new Set([...(bot.selectedPowerups || []), 'laser'])]; bot.selectedPowerup = 'laser'; }
  const aim = useLaser ? { direction: target.x < bot.x ? -1 : 1, angle: clamp(Math.atan2(bot.y - target.y, Math.abs(target.x - bot.x)) * 180 / Math.PI, -85, 85), power: 580 } : chooseBotShot(room, bot, target, difficulty);
  bot.facing = aim.direction;
  const weapon = chooseBotWeapon(game, bot, target, difficulty, random);
  const mixerPartner = bot.arsenal?.includes('mixer') && MIXER_WEAPONS.includes(weapon) && (bot.mixerLastUsedRound == null || game.roundNumber - bot.mixerLastUsedRound >= MIXER_COOLDOWN_ROUNDS)
    ? bot.arsenal.find((type) => type !== weapon && MIXER_WEAPONS.includes(type) && (bot.ammo?.[type] || 0) > 0) : null;
  const results = fire(room, bot.id, { angle: aim.angle, power: aim.power, direction: aim.direction, weapon, mixerPartner });
  return { changed: true, shot: { shooterId: bot.id, results } };
}

function resolveDelayedStrike(game, strike) {
  if (strike.weapon === 'droneStrike') {
    const target = game.players.find((entry) => entry.id === strike.targetId && entry.alive && Math.abs(entry.x - strike.beaconX) <= WEAPON_BALANCE.droneStrike.scanRadius);
    const x = clamp(target?.x ?? strike.x, 8, playableWidth(game.terrain) - 8);
    const destinationY = Math.min(target?.y ?? terrainY(game.terrain, x), terrainY(game.terrain, x));
    let y = destinationY;
    for (let probe = 25; probe < destinationY; probe += 6) {
      const platform = game.terrain.floatingPlatforms?.some((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && probe >= entry.y && probe <= entry.y + entry.height);
      if (platform || projectileStructureAt(game.objects, x, probe)) { y = probe; break; }
    }
    const damage = applyExplosion(game, x, y, strike.radius, WEAPON_BALANCE.droneStrike.secondaryDamage, { sourcePlayerId: strike.ownerId, attackType: 'droneStrike', pushMultiplier: .7 });
    awardExplosionDestruction(game, strike.ownerId, damage);
    const interactions = [{ type: 'droneMissile', x, y, fromY: 25, missile: strike.missile }, ...activateScenarioObjects(game, x, y, strike.radius, new Set(), strike.ownerId)];
    const owner = game.players.find((entry) => entry.id === strike.ownerId); if (owner) owner.stats.damage += damage.filter((entry) => entry.playerId !== owner.id).reduce((total, entry) => total + entry.amount, 0);
    return { path: [{ x, y }], impact: { x, y }, weapon: 'droneStrike', radius: strike.radius, damage, interactions, detonation: true };
  }
  if (strike.weapon === 'elementalEarth') {
    const x = strike.x; const y = strike.y; const balance = WEAPON_BALANCE.elementalEarth;
    const owner = game.players.find((entry) => entry.id === strike.ownerId);
    const groundedTargets = game.players.filter((target) => target.alive && !target.airborne && !target.supportPlatformId && Math.abs(target.y + WORLD.tankRadius - terrainY(game.terrain, target.x)) <= 28 && Math.abs(target.x - x) < balance.deformRadius);
    const damage = applyExplosion(game, x, y, balance.radius, balance.damage, { sourcePlayerId: strike.ownerId, attackType: 'elementalEarth', noTerrain: true, pushMultiplier: .55 });
    const limit = playableWidth(game.terrain) - 1; let displaced = 0;
    for (let column = Math.max(0, Math.floor(x - balance.deformRadius)); column <= Math.min(limit, Math.ceil(x + balance.deformRadius)); column += 1) {
      const distance = Math.abs(column - x) / balance.deformRadius;
      const shape = Math.cos(distance * Math.PI / 2) ** 2;
      const previous = game.terrain.heights[column];
      game.terrain.heights[column] = clamp(previous + (strike.mode === 'ridge' ? -balance.rise : balance.dig) * shape, 70, WORLD.height + 20);
      displaced += Math.abs(game.terrain.heights[column] - previous);
    }
    const crushedIds = [];
    for (const target of groundedTargets) {
      if (!target.alive || owner && target.id !== owner.id && protectedAlly(game, target, owner)) continue;
      const shape = Math.cos(Math.abs(target.x - x) / balance.deformRadius * Math.PI / 2) ** 2;
      if (shape < .2) continue;
      const amount = directDamage(owner, target, Math.round(balance.crushDamage * shape));
      if (!amount) continue;
      target.health = Math.max(0, target.health - amount); target.alive = target.health > 0;
      target.lastDamageRound = game.roundNumber; target.lastDamageTurn = game.turnNumber; target.lastDamageSourceId = strike.ownerId;
      target.armorFractureTurns = Math.max(target.armorFractureTurns || 0, 1);
      reflectDirectDamage(game, target, owner, amount);
      const existing = damage.find((hit) => hit.playerId === target.id);
      if (existing) { existing.amount += amount; existing.earthCrush = true; }
      else damage.push({ playerId: target.id, amount, knockback: 0, earthCrush: true });
      crushedIds.push(target.id);
    }
    if (strike.mode === 'ridge') for (const player of game.players) {
      if (!player.alive || player.supportPlatformId || Math.abs(player.x - x) > balance.deformRadius + WORLD.tankRadius) continue;
      const top = terrainY(game.terrain, player.x) - WORLD.tankRadius;
      if (player.y <= top + 4) continue;
      player.y = top - 3; player.airborne = { vx: Math.sign(player.x - x || 1) * 45, vy: -115, falling: false, startY: player.y, minY: player.y, updatedAt: Date.now(), fromEarthRidge: true };
    }
    settleScenarioObjects(game); settlePlayers(game); updateWaterPhysics(game);
    awardExplosionDestruction(game, strike.ownerId, damage);
    awardDestruction(game, strike.ownerId, 'terrainChunk', Math.floor(displaced / 180));
    const interactions = [{ type: 'elementalEarth', x, y, radius: balance.deformRadius, mode: strike.mode, crushedIds }, ...activateScenarioObjects(game, x, y, balance.radius, new Set(), strike.ownerId)];
    if (owner) owner.stats.damage += damage.filter((entry) => entry.playerId !== owner.id).reduce((total, entry) => total + entry.amount, 0);
    return { path: [{ x, y }], impact: { x, y }, weapon: 'elementalEarth', radius: balance.radius, damage, interactions, detonation: true };
  }
  if (strike.weapon === 'zeus') {
    let obstruction = null;
    for (let y = 20; y < strike.y - 18; y += 5) {
      const structure = projectileStructureAt(game.objects, strike.x, y);
      const platform = game.terrain.floatingPlatforms?.find((entry) => entry.active && strike.x >= entry.x && strike.x <= entry.x + entry.width && y >= entry.y && y <= entry.y + entry.height);
      if (structure || platform) { obstruction = { y, structure, platform }; break; }
    }
    const x = strike.x; const y = obstruction?.y ?? strike.y;
    if (obstruction) {
      const interactions = activateScenarioObjects(game, x, y, 22, new Set(), strike.ownerId);
      if (obstruction.platform) { obstruction.platform.durability = Math.max(0, obstruction.platform.durability - 75); if (!obstruction.platform.durability) obstruction.platform.active = false; }
      return { path: [{ x, y }], impact: { x, y }, weapon: 'zeus', radius: 28, damage: [], interactions: [{ type: 'zeusBlocked', x, y }, ...interactions], detonation: true, blocked: true };
    }
    const target = game.players.find((entry) => entry.id === strike.targetId && entry.alive && Math.hypot(entry.x - x, entry.y - y) <= 22);
    const damage = applyExplosion(game, x, y, WEAPON_BALANCE.zeus.radius, WEAPON_BALANCE.zeus.secondaryDamage, { sourcePlayerId: strike.ownerId, noTerrain: true, pushMultiplier: .25, attackType: 'zeus', directHit: target ? { playerId: target.id, damage: WEAPON_BALANCE.zeus.secondaryDamage } : null });
    awardExplosionDestruction(game, strike.ownerId, damage);
    const owner = game.players.find((entry) => entry.id === strike.ownerId); if (owner) owner.stats.damage += damage.filter((entry) => entry.playerId !== owner.id).reduce((sum, entry) => sum + entry.amount, 0);
    return { path: [{ x, y }], impact: { x, y }, weapon: 'zeus', radius: WEAPON_BALANCE.zeus.radius, damage, interactions: [{ type: 'zeusBolt', x, y }], detonation: true };
  }
  const before = new Map(game.players.map((player) => [player.id, player.health]));
  const blasts = strike.weapon === 'seismicCharge'
    ? [{ x: strike.x, y: strike.y, radius: WEAPON_BALANCE.seismicCharge.radius, damage: WEAPON_BALANCE.seismicCharge.damage }, ...[-1, 1].map((direction) => { const x = clamp(strike.x + direction * 92, 5, WORLD.width - 5); return { x, y: terrainY(game.terrain, x), radius: WEAPON_BALANCE.seismicCharge.secondaryRadius, damage: WEAPON_BALANCE.seismicCharge.secondaryDamage, direction }; })]
    : strike.weapon === 'markerBomb' ? [{ x: strike.x, y: strike.y, radius: strike.radius, damage: WEAPON_BALANCE.markerBomb.markDamage }]
    : [{ x: strike.x, y: strike.y, radius: WEAPON_BALANCE.megaCannon.radius, damage: WEAPON_BALANCE.megaCannon.damage }, { x: strike.x, y: strike.y - 135, radius: 125, damage: 75 }];
  const interactions = [];
  for (const blast of blasts) {
    const verticalBeam = strike.weapon === 'megaCannon' && blast === blasts[0];
    const damage = applyExplosion(game, blast.x, blast.y, blast.radius, blast.damage, { sourcePlayerId: strike.ownerId, pushMultiplier: verticalBeam ? 2.4 : 1.5, attackType: strike.weapon, verticalBeam, beamWidth: WEAPON_BALANCE.megaCannon.beamWidth });
    awardExplosionDestruction(game, strike.ownerId, damage);
    const structurePasses = verticalBeam ? 3 : 1;
    for (let pass = 0; pass < structurePasses; pass += 1) {
      const visited = new Set();
      if (verticalBeam) for (let beamY = 80; beamY <= WORLD.height + 80; beamY += 175) interactions.push(...activateScenarioObjects(game, blast.x, beamY, blast.radius, visited, strike.ownerId));
      else interactions.push(...activateScenarioObjects(game, blast.x, blast.y, blast.radius, visited, strike.ownerId));
    }
    if (strike.weapon === 'seismicCharge') interactions.push({ type: 'seismicWave', x: blast.x, y: blast.y, direction: blast.direction || 0 });
  }
  const owner = game.players.find((player) => player.id === strike.ownerId);
  const damage = game.players.flatMap((player) => { const amount = Math.max(0, (before.get(player.id) ?? player.health) - player.health); if (amount && owner && player.id !== owner.id) owner.stats.damage += amount; return amount ? [{ playerId: player.id, amount, knockback: 0 }] : []; });
  return { path: [{ x: strike.x, y: strike.y }], impact: { x: strike.x, y: strike.y }, weapon: strike.weapon, radius: strike.radius, damage, interactions, detonation: true, noExplosion: false };
}

export function finishPendingShot(room) {
  const game = room.game; const pending = game.pendingShot;
  room.pendingVerticalChoice = null;
  room.pendingClusterChoice = null;
  room.pendingFireworksChoice = null;
  game.shotEndsAt = null; game.pendingShot = null;
  const shooter = game.players.find((player) => player.id === pending?.shooterId);
  if (pending?.weapon === 'ninjaFatal' && pending.activation === 1 && shooter?.alive && game.players.some((player) => player.alive && player.id !== shooter.id && (!usesTeams(game) || player.team !== shooter.team))) {
    game.actions.attackAvailable = true;
    game.turnEndsAt = Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
    game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed / (game.botSpeed || 1);
    return;
  }
  if (pending?.weapon === 'ninjaFatal') game.ninjaFatalStage = null;
  if (pending?.weapon === 'harpoon') {
    if (!game.harpoonAnchor) { if (shooter) { shooter.ammo.harpoon = (shooter.ammo.harpoon || 0) + 1; delete shooter.arsenalLastUsed?.harpoon; } nextTurn(room); return; }
    game.actions.attackAvailable = true;
    game.turnEndsAt = Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
    game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed / (game.botSpeed || 1);
    return;
  }
  if (pending?.salvageHeal && shooter?.alive) {
    const destruction = Math.max(0, (shooter.stats?.destruction || 0) - pending.destructionBefore);
    const healed = Math.min(Math.round(destruction * .25), shooter.maxHealth - shooter.health);
    if (healed > 0) {
      shooter.health += healed; game.interactionSerial = (game.interactionSerial || 0) + 1;
      shooter.lastSalvage = { serial: game.interactionSerial, healed, destruction, x: shooter.x, y: shooter.y };
    }
  }
  if (game.players.filter((player) => player.alive).length <= 1 || !pending?.extraShot || !shooter?.alive) { nextTurn(room); return; }
  game.actions = { movesLeft: 0, attackAvailable: true };
  game.turnEndsAt = Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
  game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed / (game.botSpeed || 1);
}

export function updateMovingPlatforms(game, now = Date.now()) {
  if (!game?.terrain?.floatingPlatforms) return;
  for (const platform of game.terrain.floatingPlatforms) {
    const previousX = platform.x; platform.x = movingPlatformX(platform, game.platformEpoch, now); const deltaX = platform.x - previousX;
    if (!platform.active) continue;
    for (const player of game.players) {
      if (!player.alive || player.supportPlatformId !== platform.id) continue;
      player.x = clamp(platform.x + player.platformOffset, 4, WORLD.width - 4);
      player.y = platform.y - WORLD.tankRadius;
    }
    for (const object of game.objects || []) {
      if (object.supportPlatformId !== platform.id || object.active === false) continue;
      object.x = platform.x + (object.platformOffset ?? object.x - previousX);
      object.platformOffset = object.x - platform.x;
      if (Number.isFinite(object.ballX)) object.ballX += deltaX;
    }
    for (const mine of game.mines || []) {
      if (!mine.active || mine.supportPlatformId !== platform.id) continue;
      mine.x = platform.x + (mine.platformOffset ?? mine.x - previousX);
      mine.y = platform.y - (mine.aquatic ? 17 : 3);
    }
  }
  for (const mine of game.mines || []) {
    if (!mine.active || !mine.supportPlatformId) continue;
    if (game.terrain.floatingPlatforms.some((platform) => platform.id === mine.supportPlatformId && platform.active)) continue;
    mine.supportPlatformId = null; mine.platformOffset = null;
    if (mine.aquatic) { mine.vy = Math.max(80, mine.vy || 0); mine.lastPhysicsAt = now; continue; }
    const ground = terrainY(game.terrain, mine.x);
    if (ground > WORLD.height) mine.active = false;
    else mine.y = ground - 3;
  }
}

function arenaGroundX(game, random, minimumPlayerDistance = 90) {
  const arenaWidth = playableWidth(game.terrain);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = Math.round(70 + random() * (arenaWidth - 140));
    if (!safeGroundAt(game.terrain, x)) continue;
    if (game.players.some((player) => player.alive && Math.abs(player.x - x) < minimumPlayerDistance)) continue;
    return x;
  }
  return findSpawns(game.terrain, 1)[0].x;
}

function arenaImpactX(game, random, playerChance = .55, scatter = 90, minimumPlayerDistance = 0) {
  const alive = game.players.filter((player) => player.alive && Number.isFinite(player.x));
  if (alive.length && random() < playerChance) {
    const target = alive[Math.floor(random() * alive.length)];
    const x = Math.round(clamp(target.x + (random() - .5) * scatter * 2, 35, playableWidth(game.terrain) - 35));
    if (terrainY(game.terrain, x) <= WORLD.height) return x;
  }
  return arenaGroundX(game, random, minimumPlayerDistance);
}

function lavaRivers(terrain) {
  const rivers = []; let start = null;
  const arenaWidth = playableWidth(terrain);
  for (let x = 24; x < arenaWidth - 24; x += 1) {
    const open = terrainY(terrain, x) >= WORLD.height - 8;
    if (open && start === null) start = x;
    if ((!open || x === arenaWidth - 25) && start !== null) {
      const right = open ? x : x - 1; const width = right - start + 1;
      if (width >= 32) rivers.push({ left: start, right, width, x: Math.round((start + right) / 2) });
      start = null;
    }
  }
  return rivers.sort((a, b) => b.width - a.width).slice(0, 4);
}

function eruptionFireballs(game, rivers, random) {
  const fireballs = []; const desired = Math.min(8, 4 + rivers.length);
  for (let attempt = 0; attempt < 90 && fireballs.length < desired; attempt += 1) {
    const index = fireballs.length; const river = rivers[(index + attempt) % rivers.length]; const direction = random() < .5 ? -1 : 1; const angle = 52 + random() * 31; const power = 330 + random() * 190;
    const result = simulateShot({ terrain: game.terrain, players: game.players, powerups: [], x: river.x + (random() - .5) * Math.min(70, river.width * .4), y: river.surfaceY + 4, angle, power, gravity: game.gravity, wind: game.wind, direction });
    const apex = result.path.length ? Math.min(...result.path.map((point) => point.y)) : river.surfaceY;
    if (!result.impact || result.path.length < 10 || apex > river.surfaceY - 75) continue;
    const delay = .05 + index * .075; fireballs.push({ x: Math.round(result.impact.x), y: Math.round(result.impact.y), originX: Math.round(result.path[0]?.x ?? river.x), originY: Math.round(result.path[0]?.y ?? river.surfaceY), path: result.path, platformId: result.impact.platformId || null, hitPlayerId: result.impact.playerId || null, radius: 44 + index % 3 * 6, kind: 'eruption', damage: 30 + index % 3 * 4, delay, flightDuration: .3 + Math.min(.08, result.path.length / 900) });
  }
  return fireballs;
}

function randomLootboxContents(random, count = 3, available = COLLECTIBLE_ITEMS) {
  const pool = [...available]; const rewards = [];
  while (rewards.length < count && pool.length) rewards.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return rewards;
}

const EVENT_WEIGHTS = Object.freeze({ supply: 14, bombardment: 12, lightning: 9, tectonic: 8, luckyWinds: 10, collapse: 8, eruption: 6, gale: 8, flood: 9, flora: 9, blizzard: 9, quake: 7 });
const WEATHER_EVENTS = new Set(['lightning', 'gale', 'flood', 'blizzard']);
const POSITIVE_EVENTS = new Set(['supply', 'luckyWinds', 'flora']);
const GALE_TORNADO_CHANCE = .35;

function galeTornadoSites(game, random) {
  const width = playableWidth(game.terrain);
  const findSupport = (preferredX) => {
    for (let distance = 0; distance < width / 2; distance += 12) for (const sign of distance ? [-1, 1] : [1]) {
      const x = Math.round(clamp(preferredX + distance * sign, 75, width - 75));
      const platform = (game.terrain.floatingPlatforms || []).filter((entry) => entry.active && entry.width >= 90 && x >= entry.x + 20 && x <= entry.x + entry.width - 20).sort((a, b) => a.y - b.y)[0];
      if (platform) return { x, y: platform.y };
      if (safeGroundAt(game.terrain, x) && terrainY(game.terrain, x) < game.lavaLevel - 12) return { x, y: terrainY(game.terrain, x) };
    }
    return { x: Math.round(preferredX), y: WORLD.height - 100 };
  };
  return [0, 1].map((index) => {
    const preferredX = width * ((index ? .69 : .31) + (random() - .5) * .12);
    return { ...findSupport(preferredX), width: 210, height: 550 };
  });
}

function eventTypeForRound(game, roundNumber, random) {
  const allowedEvents = game.enabledEvents || [];
  if (!allowedEvents.length) return null;
  const previous = [...(game.events || [])].reverse().find((event) => !event.warning)?.type || game.events?.at(-1)?.type;
  const biomeEvent = BIOMES[game.terrain.type]?.event;
  const meteorologist = game.players.some((player) => player.alive && activeClass(player) === 'meteorologist');
  let entries = allowedEvents.filter((type) => type !== previous || allowedEvents.length === 1).map((type) => {
    let weight = EVENT_WEIGHTS[type] || 8;
    if (type === biomeEvent) weight *= 1.45;
    if (WEATHER_EVENTS.has(previous) && WEATHER_EVENTS.has(type)) weight *= .45;
    if (meteorologist) weight *= POSITIVE_EVENTS.has(type) ? 1 + CLASS_BALANCE.meteorologistPositiveChance : 1 - CLASS_BALANCE.meteorologistPositiveChance * .35;
    if (type === 'eruption' && !lavaRivers(game.terrain).length) weight = 0;
    return { type, weight };
  }).filter((entry) => entry.weight > 0);
  if (!entries.length) entries = allowedEvents.map((type) => ({ type, weight: 1 }));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0); let roll = random() * total;
  for (const entry of entries) { roll -= entry.weight; if (roll <= 0) return entry.type; }
  return entries.at(-1).type;
}

export function applyArenaPulse(room, options = {}) {
  const game = room.game;
  if (!game || game.phase !== 'playing') return null;
  if (!game.enabledEvents?.length) return null;
  if (options.forcedType && !game.enabledEvents.includes(options.forcedType)) return null;
  const random = seededRandom(`${game.seed}-arena-round-${game.roundNumber}${options.forcedType ? `-${options.forcedType}` : ''}`);
  const roundProgress = clamp((game.roundNumber - 1) / Math.max(1, game.roundLimit - 1), 0, 1); const intensity = 1 + roundProgress * 1.45;
  const drops = []; const impacts = []; const seeds = []; const allowedEvents = game.enabledEvents; let rivers = [];
  const eventType = options.forcedType || eventTypeForRound(game, game.roundNumber, random);
  if (eventType === 'eruption') rivers = lavaRivers(game.terrain);
  const weatherPlayers = game.players.filter((player) => player.alive && activeClass(player) === 'meteorologist');
  const positiveAnchor = weatherPlayers.length ? weatherPlayers[Math.floor(random() * weatherPlayers.length)] : null;

  if (eventType === 'supply') {
    const pool = COLLECTIBLE_ITEMS.filter((type) => game.enabledPowerups.includes(type)); const dropCount = pool.length ? (game.players.length >= 5 ? 5 : 4) + Math.floor(roundProgress * 3) : 0; const hasLootbox = dropCount > 0 && random() * 100 < SUPPLY_LOOTBOX_CHANCE + Math.round(roundProgress * 17); const lootboxIndex = hasLootbox ? Math.floor(random() * dropCount) : -1;
    for (let index = 0; index < dropCount; index += 1) {
      const x = positiveAnchor && random() < CLASS_BALANCE.meteorologistAnchorChance ? clamp(positiveAnchor.x + (random() - .5) * 520, 55, playableWidth(game.terrain) - 55) : arenaGroundX(game, random, 55); const type = index === lootboxIndex ? 'lootbox' : pool[Math.floor(random() * pool.length)];
      drops.push({ id: `airdrop-${game.seed}-${game.turnNumber}-${index}`, type, x, y: terrainY(game.terrain, x) - 12, buried: false, loot: type === 'lootbox' ? randomLootboxContents(random, 3, pool) : null, releaseProgress: .24 + index * (.52 / Math.max(1, dropCount - 1)) });
    }
  } else if (eventType === 'eruption') {
    const lavaRise = Math.round(42 + roundProgress * 58); const targetLavaLevel = Math.max(500, game.lavaLevel - lavaRise);
    rivers = rivers.map((river, index) => ({ ...river, surfaceY: targetLavaLevel, previousSurfaceY: game.lavaLevel, delay: index * .08 }));
    impacts.push(...eruptionFireballs(game, rivers, random));
  } else if (eventType === 'gale') {
    impacts.push({ x: playableWidth(game.terrain) / 2, y: WORLD.height / 2, radius: playableWidth(game.terrain) / 2, kind: 'gale', damage: 0 });
  } else if (eventType === 'flood') {
    for (let index = 0; index < 3 + Math.floor(roundProgress * 2); index += 1) {
      const x = arenaGroundX(game, random, 260);
      impacts.push({ x, y: terrainY(game.terrain, x), radius: 155 + Math.round(random() * 45), kind: 'flood', damage: 0, delay: index * .12 });
    }
  } else if (eventType === 'flora') {
    const count = 4 + Math.floor(roundProgress * 3);
    for (let index = 0; index < count; index += 1) {
      let x = arenaGroundX(game, random, 210);
      for (let attempt = 0; attempt < 30 && !dryTreeGround(game.terrain, game.waterZones, x, TREE_BALANCE.medium.width * 1.12); attempt += 1) x = arenaGroundX(game, random, 55);
      if (!dryTreeGround(game.terrain, game.waterZones, x, TREE_BALANCE.medium.width * 1.12)) continue;
      const clusters = ['grove', 'dense', 'ancestral']; const cluster = index === count - 1 ? 'ancestral' : clusters[(index + Math.floor(random() * clusters.length)) % clusters.length];
      seeds.push({ id: `seed-${game.turnNumber}-${index}`, x, y: terrainY(game.terrain, x), cluster, radius: cluster === 'ancestral' ? 280 : cluster === 'dense' ? 205 : 170, releaseProgress: .16 + index * (.68 / Math.max(1, count - 1)) });
    }
  } else if (eventType === 'blizzard') {
    const count = 4 + Math.floor(roundProgress * 3);
    for (let index = 0; index < count; index += 1) { const x = arenaGroundX(game, random, 150); impacts.push({ x, y: terrainY(game.terrain, x), radius: 165 + Math.round(random() * 65), kind: 'blizzard', damage: 0, delay: index * .07 }); }
  } else {
    const baseCount = eventType === 'bombardment' ? 6 : eventType === 'lightning' ? 4 : eventType === 'tectonic' ? 3 : eventType === 'luckyWinds' ? 3 : eventType === 'quake' ? 2 : 7; const count = baseCount + Math.floor(roundProgress * (eventType === 'bombardment' || eventType === 'collapse' ? 5 : 3));
    for (let index = 0; index < count; index += 1) {
      const destructive = ['lightning', 'bombardment', 'collapse', 'quake', 'tectonic'].includes(eventType); const rods = destructive ? (game.objects || []).filter((entry) => entry.type === 'lightningRod' && entry.active) : []; const rod = rods.length ? rods[Math.floor(random() * rods.length)] : null; const x = rod ? clamp(rod.x + (random() - .5) * 100, 55, playableWidth(game.terrain) - 55) : eventType === 'luckyWinds' && positiveAnchor && random() < CLASS_BALANCE.meteorologistAnchorChance ? clamp(positiveAnchor.x + (random() - .5) * 380, 120, playableWidth(game.terrain) - 120) : eventType === 'lightning' ? arenaImpactX(game, random, .82, 58) : eventType === 'bombardment' ? arenaImpactX(game, random, .48, 130) : eventType === 'luckyWinds' ? arenaImpactX(game, random, .85, 120) : arenaGroundX(game, random, eventType === 'tectonic' ? 250 : 110);
      const surfacePlatform = ['lightning', 'bombardment', 'collapse'].includes(eventType) ? (game.terrain.floatingPlatforms || []).filter((platform) => platform.active && x >= platform.x && x <= platform.x + platform.width).sort((a, b) => a.y - b.y)[0] : null;
      const y = surfacePlatform?.y ?? terrainY(game.terrain, x);
      const radius = Math.round((eventType === 'bombardment' ? 32 + index * 9 : eventType === 'lightning' ? 74 : eventType === 'tectonic' ? 185 + Math.round(random() * 70) : eventType === 'luckyWinds' ? 270 + Math.round(random() * 80) : eventType === 'collapse' ? 44 : 22 + Math.round(random() * 9)) * (eventType === 'luckyWinds' ? 1 : 1 + roundProgress * .42));
      impacts.push({ x, y, platformId: surfacePlatform?.id || null, radius, kind: eventType, damage: Math.round((eventType === 'bombardment' ? 24 + index * 7 : eventType === 'lightning' ? 24 : 8) * intensity), heal: eventType === 'luckyWinds' ? 40 : 0, delay: eventType === 'bombardment' ? index * .075 : index * .04, tectonicMode: eventType === 'tectonic' ? ['mountain', 'rise', 'sink'][index % 3] : null, magnitude: eventType === 'tectonic' ? Math.round((90 + random() * 75) * intensity) : null });
    }
  }
  const labels = { supply: `SUPRIMENTOS AÉREOS • ${drops.length} CARGAS`, quake: 'ABALO DA ARENA!', bombardment: 'BOMBARDEIO PROGRESSIVO!', lightning: 'TEMPESTADE ELÉTRICA!', collapse: 'COLAPSO DO CENÁRIO!', tectonic: 'EVENTO TECTÔNICO!', luckyWinds: 'VENTOS DE SORTE!', gale: 'VENDAVAL!', eruption: 'ERUPÇÃO VULCÂNICA!', flood: 'INUNDAÇÃO!', flora: `TEMPO DE FLORA! ${seeds.length} NÚCLEOS`, blizzard: 'NEVASCA POLAR!' };
  const tornadoes = eventType === 'gale' && random() < GALE_TORNADO_CHANCE ? galeTornadoSites(game, random) : [];
  const startedAt = Date.now(); const warningMs = eventType === 'supply' ? GAME_TIMING.supplyFlyoverMs : GAME_TIMING.arenaWarningMs;
  game.arenaEventSerial = (game.arenaEventSerial || 0) + 1;
  const weatherPrelude = ['flood', 'lightning'].includes(eventType);
  const event = { id: `arena-${game.seed}-${game.turnNumber}-${game.arenaEventSerial}`, turn: game.turnNumber, round: game.roundNumber, intensity, type: eventType, drops, impacts, seeds, tornadoes, windDirection: eventType === 'gale' ? (random() < .5 ? -1 : 1) : undefined, windForce: eventType === 'gale' ? Math.round(110 + roundProgress * 170) : undefined, actionDuration: eventType === 'gale' ? 3000 : undefined, lavaRivers: eventType === 'eruption' ? rivers : undefined, label: weatherPrelude ? `CHUVA INTENSA • ${EVENT_DEFS[eventType].name}` : `${labels[eventType]} • NÍVEL ${Math.ceil(intensity)}`, weatherPrelude, weatherChainStage: null, warning: true, warningStartedAt: startedAt, executeAt: startedAt + warningMs, lootboxChance: eventType === 'supply' ? SUPPLY_LOOTBOX_CHANCE + Math.round(roundProgress * 17) : undefined, helicopter: eventType === 'supply' ? { direction: random() < .5 ? 1 : -1, altitude: 115 } : undefined };
  game.arenaWarningUntil = event.executeAt; game.pendingArenaEvent = { eventId: event.id, executeAt: event.executeAt };
  if (weatherPrelude) game.weather = { kind: 'rain', startedAt, untilRound: game.roundNumber + 3 };
  if (eventType === 'blizzard') game.weather = { kind: 'snow', startedAt, untilRound: game.roundNumber + 3 };
  if (options.forcedType === 'gale') game.weather = { kind: 'wind', startedAt, untilRound: game.roundNumber, priorRain: game.weather?.kind === 'rain' ? 1 : 0 };
  game.lastArenaEventRound = game.roundNumber; game.events.push(event); if (game.events.length > 8) game.events.shift(); return event;
}

function resolveArenaEvent(game) {
  const pending = game.pendingArenaEvent; const event = game.events.find((entry) => entry.id === pending?.eventId); if (!event) { game.pendingArenaEvent = null; game.arenaWarningUntil = null; return; }
  if (event.type === 'supply') for (const drop of event.drops || []) { const platform = (game.terrain.floatingPlatforms || []).filter((entry) => entry.active && drop.x >= entry.x && drop.x <= entry.x + entry.width).sort((a, b) => a.y - b.y)[0]; const structure = (game.objects || []).filter((entry) => entry.active && entry.width && Math.abs(entry.x - drop.x) <= entry.width / 2).map((entry) => entry.groundY - entry.height).filter(Number.isFinite).sort((a, b) => a - b)[0]; const landingY = Math.min(terrainY(game.terrain, drop.x), platform?.y ?? Infinity, structure ?? Infinity) - 12; game.powerups.push({ ...drop, y: landingY, anchorY: landingY, buriedY: landingY, supportPlatformId: platform?.y - 12 === landingY ? platform.id : null, revealed: true, active: true, source: 'helicopter' }); }
  if (event.type === 'eruption') {
    game.eruptionCount = (game.eruptionCount || 0) + 1; game.lavaLevel = Math.min(game.lavaLevel, ...(event.lavaRivers || []).map((river) => river.surfaceY));
    if (game.survival) game.survival.nextLevel = Math.min(game.lavaLevel, survivalLavaLevel(game.roundNumber + 1, game.roundLimit));
    const burned = game.players.filter((player) => player.alive && player.y + WORLD.tankRadius >= game.lavaLevel);
    for (const player of burned) { player.health = 0; player.alive = false; player.airborne = null; }
    event.lavaHitPlayerIds = burned.map((player) => player.id);
  }
  if (event.type === 'flora') event.grownTreeIds = (event.seeds || []).flatMap((seed, index) => growFloraCluster(game, seed, index));
  if (event.type === 'blizzard') {
    game.fireZones = [];
    for (const lake of game.waterZones || []) lake.frozenUntilRound = Math.max(lake.frozenUntilRound || 0, game.roundNumber + 3);
    for (const impact of event.impacts || []) game.iceZones.push({ id: `blizzard-ice-${event.id}-${Math.round(impact.x)}`, x: impact.x, y: impact.y, radius: impact.radius, expiresRound: game.roundNumber + 3, ownerId: null });
    for (const player of game.players) if (player.alive && (event.impacts || []).some((impact) => Math.abs(player.x - impact.x) <= impact.radius)) player.frozenTurns = Math.max(player.frozenTurns || 0, 1);
  }
  event.interactions = [];
  for (const impact of event.impacts || []) {
    if (event.type === 'flood') {
      const basin = carveFloodBasin(game.terrain, impact.x, impact.radius, Math.round(60 + (event.intensity - 1) * 22));
      game.waterZones.push({ ...basin, id: `lake-${event.id}-${game.waterZones.length}`, fluid: true, fluidVolume: estimateLakeVolume(game.terrain, basin) });
      game.fireZones = game.fireZones.filter((zone) => Math.abs(zone.x - basin.x) > basin.radius + zone.radius);
    } else if (event.type === 'tectonic') applyTectonicShift(game.terrain, impact);
    else if (event.type === 'blizzard') { /* Gelo e lentidão foram aplicados antes da animação dos impactos. */ }
    else if (event.type === 'quake') applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage, { eventType: event.type });
    else if (event.type === 'lightning') {
      const nearby = game.players.filter((player) => player.alive && player.classType !== 'saboteur' && Math.hypot(player.x - impact.x, player.y - impact.y) <= impact.radius * 1.55);
      for (const player of nearby) player.powerupBlockedTurns = Math.max(player.powerupBlockedTurns || 0, 1);
      event.blockedPlayerIds ||= []; event.blockedPlayerIds.push(...nearby.map((player) => player.id));
      applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage, { eventType: event.type });
      for (const tree of game.objects || []) if (tree.active && TREE_TYPES.has(tree.type) && Math.abs(tree.x - impact.x) <= impact.radius * 1.25) igniteTree(game, tree, { x: impact.x, y: impact.y, radius: impact.radius, turnsLeft: 2, ownerId: null });
    } else if (!['luckyWinds', 'gale', 'flora', 'blizzard'].includes(event.type)) {
      applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage, { eventType: event.type });
      if (event.type === 'eruption') { game.interactionSerial += 1; const impactDuration = 3100; game.fireZones.push({ id: `eruption-fire-${game.interactionSerial}`, x: impact.x, y: impact.y, radius: 82, turnsLeft: 3, ownerId: null, source: 'eruption', platformId: impact.platformId || null, ignitesAt: Date.now() + Math.round(((impact.delay || 0) + (impact.flightDuration || .32)) * impactDuration) }); }
    }
    if (!['supply', 'luckyWinds', 'gale', 'flood', 'flora', 'blizzard'].includes(event.type)) {
      const visited = new Set();
      event.interactions.push(...activateScenarioObjects(game, impact.x, impact.y, Math.max(impact.radius, event.type === 'tectonic' ? 120 : 0), visited, null));
      if (event.type === 'tectonic') for (const platform of game.terrain.floatingPlatforms || []) {
        if (!platform.active || impact.x + impact.radius < platform.x || impact.x - impact.radius > platform.x + platform.width) continue;
        platform.durability = Math.max(0, platform.durability - Math.max(35, Math.round(impact.magnitude * .45)));
        if (!platform.durability) platform.active = false;
        event.interactions.push({ type: 'platformQuake', id: platform.id, x: platform.x + platform.width / 2, y: platform.y, destroyed: !platform.active });
        event.interactions.push(...activateScenarioObjects(game, platform.x + platform.width / 2, platform.y, Math.min(70, platform.width / 2), visited, null));
      }
    }
  }
  if (event.type === 'flood') equalizeConnectedLakes(game.terrain, game.waterZones);
  if (event.type === 'luckyWinds') {
    const healed = game.players.filter((player) => player.alive && (event.impacts || []).some((zone) => Math.hypot(player.x - zone.x, player.y - zone.y) <= zone.radius));
    for (const player of healed) player.health = Math.min(player.maxHealth, player.health + 40);
    event.healedPlayerIds = healed.map((player) => player.id);
  }
  if (event.type === 'tectonic') {
    const random = seededRandom(`${event.id}-tank-shift`); event.tectonicMoves = [];
    for (const player of game.players) {
      if (!player.alive) { event.tectonicMoves.push({ playerId: player.id, fromX: player.x, toX: player.x }); continue; } const fromX = player.x; const shift = (random() < .5 ? -1 : 1) * (16 + Math.round(random() * 22));
      player.x = clamp(player.x + shift, 4, WORLD.width - 4); player.supportPlatformId = null; player.platformOffset = null; event.tectonicMoves.push({ playerId: player.id, fromX, toX: player.x });
    }
  }
  if (event.type === 'gale') {
    event.galeMoves = []; const shift = event.windDirection * event.windForce;
    for (const player of game.players) {
      if (!player.alive) continue; const fromX = player.x;
      if (player.airborne) player.airborne.vx += shift * 1.8;
      else { const steps = Math.ceil(Math.abs(shift) / 4); for (let step = 0; step < steps; step += 1) { const nextX = clamp(player.x + Math.sign(shift) * Math.min(4, Math.abs(shift) - step * 4), 4, WORLD.width - 4); const currentGround = terrainY(game.terrain, player.x); const nextGround = terrainY(game.terrain, nextX); if (nextGround < currentGround - 24) break; player.x = nextX; player.supportPlatformId = null; player.platformOffset = null; } }
      event.galeMoves.push({ playerId: player.id, fromX, toX: player.x });
    }
    const formedAt = Date.now() + 2500;
    event.tornadoIds = (event.tornadoes || []).map((site, index) => {
      const id = `${event.id}-tornado-${index + 1}`;
      game.windVortices.push({ id, source: 'gale', ownerId: null, x: site.x, y: site.y, width: site.width, height: site.height, driftDirection: event.windDirection, appearsAt: formedAt, updatedAt: formedAt, startTurn: game.turnNumber, expiresTurn: game.turnNumber + 4, fire: false, hitRounds: {} });
      return id;
    });
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 3000);
  }
  settleScenarioObjects(game); settlePlayers(game); updateWaterPhysics(game); recordEliminations(game); const pausedFor = Math.max(0, Date.now() - (event.warningStartedAt || Date.now())) + (event.type === 'gale' ? 3000 : 0); if (game.turnEndsAt) game.turnEndsAt += pausedFor; if (game.botActAt) game.botActAt += pausedFor; event.id += '-impact'; event.warning = false; event.label = `${event.weatherPrelude ? EVENT_DEFS[event.type].name : event.label} • ${event.type === 'supply' ? 'CARGA ENTREGUE' : event.type === 'luckyWinds' ? 'CURA APLICADA' : event.type === 'flora' ? 'FLORESTA GERMINADA' : 'IMPACTO'}`; game.pendingArenaEvent = null; game.arenaWarningUntil = null;
  evaluateVictory(game);
  game.weatherSequence = null;
  if (event.type === 'gale') beginWeatherClearing(game, Date.now() + 3000);
}

function applyTectonicShift(terrain, impact) {
  const radius = Math.max(60, impact.radius); const magnitude = impact.magnitude || 80;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const x = Math.round(clamp(impact.x + offset, 0, WORLD.width - 1)); const falloff = (1 + Math.cos(Math.PI * offset / radius)) / 2;
    const ridge = impact.tectonicMode === 'mountain' ? (1 - Math.abs(offset) / radius) * magnitude : falloff * magnitude;
    const delta = impact.tectonicMode === 'sink' ? ridge : -ridge; terrain.heights[x] = Math.round(clamp(terrain.heights[x] + delta, 105, WORLD.height + 80));
  }
}

function botDelay(difficulty) { return difficulty === 'easy' ? 2100 : difficulty === 'hard' ? 650 : 1250; }

export function chooseBotTarget(game, bot, targets) {
  const allies = (game.players || []).filter((player) => player.alive && player.id !== bot.id && areAllies(game, bot, player));
  const structures = (game.objects || []).filter((object) => object.active !== false && ['building', 'crane', 'fuelTank', 'barrel'].includes(object.type));
  const score = (target) => {
    const distance = Math.abs(target.x - bot.x);
    if (bot.personality === 'aggressive') return distance * .55 + target.health * 1.4;
    if (bot.personality === 'support' && allies.length) return Math.min(...allies.map((ally) => Math.abs(target.x - ally.x))) + distance * .2;
    if (bot.personality === 'demolisher' && structures.length) return Math.min(...structures.map((object) => Math.abs(target.x - object.x))) + distance * .35;
    if (bot.personality === 'collector') return distance * .75 + (target.shieldCharges || 0) * 35;
    return distance;
  };
  return [...targets].sort((first, second) => score(first) - score(second))[0];
}

export function chooseBotShot(room, bot, target, difficulty = 'normal') {
  const direction = target.x < bot.x ? -1 : 1; const distance = Math.abs(target.x - bot.x); const heightDelta = bot.y - target.y;
  const random = seededRandom(`${room.game.seed}-aim-${room.game.turnNumber}-${bot.id}`);
  if (difficulty !== 'hard') {
    const baseAngle = clamp(45 + heightDelta / 22, 24, 72); const sine = Math.max(.2, Math.sin(baseAngle * Math.PI / 90)); const basePower = Math.sqrt(distance * room.rules.gravity / sine);
    const angleError = difficulty === 'easy' ? (random() - .5) * 24 : (random() - .5) * 8;
    const powerError = difficulty === 'easy' ? (random() - .5) * 130 : (random() - .5) * 38;
    return { direction, angle: clamp(baseAngle + angleError, 10, 82), power: clamp(basePower + powerError, 120, 580) };
  }
  let best = { direction, angle: 45, power: clamp(Math.sqrt(distance * room.rules.gravity), 160, 580), score: Infinity };
  for (let angle = 22; angle <= 78; angle += 7) for (let power = 170; power <= 580; power += 35) {
    const result = simulateShot({ terrain: room.game.terrain, players: room.game.players, powerups: room.game.powerups, windVortices: room.game.windVortices, ignorePlayerId: bot.id, x: bot.x, y: bot.y, angle, power, gravity: room.rules.gravity, wind: room.game.wind, direction });
    const score = result.impact?.playerId === target.id ? -1000 : result.impact ? Math.hypot(result.impact.x - target.x, result.impact.y - target.y) : 5000;
    if (score < best.score) best = { direction, angle, power, score };
  }
  return best;
}

function chooseBotWeapon(game, bot, target, difficulty, random) {
  if (game.roundNumber === 1) return 'standard';
  if (difficulty === 'easy') return 'standard';
  const distance = Math.abs(target.x - bot.x);
  const ready = (type) => bot.arsenal?.includes(type) && (bot.ammo?.[type] || 0) > 0;
  if (ready('vitalRecycling') && bot.health < bot.maxHealth * .45) return 'vitalRecycling';
  if (ready('lightningRod') && !(game.objects || []).some((object) => object.active && object.type === 'lightningRod' && object.ownerId === bot.id) && random() > .58) return 'lightningRod';
  if (ready('flyingHunter') && distance > 500 && random() > .55) return 'flyingHunter';
  if (bot.personality === 'demolisher' && ready('heavy')) return 'heavy';
  if (bot.personality === 'support' && ready('zeus') && distance < 850) return 'zeus';
  if (difficulty === 'hard' && ready('heavy') && (target.health > 55 || distance > 900)) return 'heavy';
  const grouped = game.players.filter((player) => player.alive && player.id !== bot.id && Math.abs(player.x - target.x) < 150).length > 1;
  if (difficulty === 'hard' && grouped && ready('cluster')) return 'cluster';
  const special = ['zeus', 'gravity', 'fireworks'].find(ready);
  if (difficulty === 'hard' && special && random() > .45) return special;
  if (difficulty === 'normal' && random() > .82 && ready('heavy')) return 'heavy';
  return 'standard';
}

export function sanitizeRules(rules = {}) {
  const enabledEvents = [...new Set(Array.isArray(rules.enabledEvents) ? rules.enabledEvents : DEFAULT_RULES.enabledEvents)].filter((type) => EVENT_DEFS[type]);
  const enabledPowerups = [...new Set(Array.isArray(rules.enabledPowerups) ? rules.enabledPowerups : COLLECTIBLE_ITEMS)].filter((type) => COLLECTIBLE_ITEMS.includes(type));
  return {
    ...DEFAULT_RULES,
    maxPlayers: clamp(Number(rules.maxPlayers) || 10, 2, 10),
    health: clamp(Number(rules.health) || DEFAULT_RULES.health, 50, 300),
    turnSeconds: clamp(Number(rules.turnSeconds) || 30, 10, 90),
    gravity: clamp(Number(rules.gravity) || 120, 50, 250),
    powerupCount: clamp(Number.isFinite(Number(rules.powerupCount)) ? Number(rules.powerupCount) : DEFAULT_RULES.powerupCount, 0, 20),
    botCount: clamp(Number(rules.botCount) || 0, 0, 9),
    botDifficulty: ['easy', 'normal', 'hard'].includes(rules.botDifficulty) ? rules.botDifficulty : 'normal',
    gameMode: ['ffa', 'coop', 'teams', 'hill', 'teamHill', 'survival'].includes(rules.gameMode) ? rules.gameMode : 'ffa',
    friendlyFire: rules.friendlyFire === true || rules.friendlyFire === 'on' || rules.friendlyFire === 'true',
    teamCount: clamp(Math.round(Number(rules.teamCount) || DEFAULT_RULES.teamCount), 2, 4),
    gameSpeed: [0.75, 1, 1.5, 2].includes(Number(rules.gameSpeed)) ? Number(rules.gameSpeed) : 1,
    roundLimit: [10, 20, 30, 40, 50].includes(Number(rules.roundLimit)) ? Number(rules.roundLimit) : DEFAULT_RULES.roundLimit,
    classesEnabled: rules.classesEnabled !== false,
    enabledEvents,
    enabledPowerups,
    mines: rules.mines !== false,
    mapType: ['random', 'flat', 'hills', 'highlands', 'islands', 'canyon', 'platforms', 'archipelago', 'technology', 'skylands', 'plains'].includes(rules.mapType) ? rules.mapType : 'random',
    seed: rules.seed ? String(rules.seed).slice(0, 30) : '',
  };
}
