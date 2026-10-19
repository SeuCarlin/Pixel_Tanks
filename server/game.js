import crypto from 'node:crypto';
import { ARSENAL_COOLDOWN_TURNS, ARSENAL_DEFS, ARSENAL_ITEMS, ATTACKER_ELIMINATION_BONUS, CLASS_BALANCE, CLASS_DEFS, CLASS_EVOLUTIONS, CLASS_POWERUP_SYNERGY, CLASS_POWERUP_WEIGHT, classEvolutionRounds, CLUSTER_CAPSULE_SPEED, COLLECTIBLE_ITEMS, DEFAULT_ARSENAL, DEFAULT_RULES, DESTRUCTION_POINTS, EVENT_DEFS, GAME_TIMING, HILL_RULES, MEGA_BOMB, megaCannonCost, NATIVE_MINE_DAMAGE, POWERUPS, SELECTABLE_ARSENAL_ITEMS, SHOT_PATH_RATE, TEAM_COLORS, VECTOR_FLIGHT_RATE, WEAPON_BALANCE, WORLD, clamp, survivalLavaLevel } from '../shared/constants.js';
import { seededRandom } from './random.js';
import { carveTerrain, findSpawns, generateTerrain, movingPlatformX, terrainY } from './terrain.js';
import { applyExplosion, impartTankMomentum, interruptTankControl, settlePlayers, settleScenarioObjects, simulateBouncingGrenade, simulateHarpoon, simulateMarkerBomb, simulateShot, simulateVectorShot } from './physics.js';
import { DRIVE, blinkLanding, driveStats, launcherDestination, movementDistance, resolveTankFootprint, safeGroundAt, specialMovePath, spiderLeapTarget, walkPath } from '../shared/movement.js';
import { BIOMES } from '../shared/biomes.js';
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
  const seed = room.rules.seed || crypto.randomInt(100000, 999999);
  const terrain = generateTerrain(seed, room.rules.mapType);
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
      for (let index = territory.length - 1; index > 0; index -= 1) { const swap = crypto.randomInt(index + 1); [territory[index], territory[swap]] = [territory[swap], territory[index]]; }
      members.forEach((playerIndex, index) => { assigned[playerIndex] = territory[index]; });
    }
    spawns.splice(0, spawns.length, ...assigned);
  } else {
    // Free-for-all still varies which player owns each safe pad.
    for (let index = spawns.length - 1; index > 0; index -= 1) { const swap = crypto.randomInt(index + 1); [spawns[index], spawns[swap]] = [spawns[swap], spawns[index]]; }
  }
  const playerClass = (player) => room.rules.classesEnabled && CLASS_DEFS[player.classType] ? player.classType : null;
  const playerArsenal = (player) => { const arsenal = (player.arsenal || DEFAULT_ARSENAL).filter((type) => !['megaCannon', 'lightningRod'].includes(type)); if (playerClass(player) === 'saboteur' && !arsenal.includes('teslaOrb')) arsenal.push('teslaOrb'); return arsenal; };
  const players = room.players.map((p, i) => ({
    id: p.id, nickname: p.nickname, color: ['teams', 'teamHill'].includes(room.rules.gameMode) ? TEAM_COLORS[i % activeTeamCount] : room.rules.gameMode === 'coop' ? TEAM_COLORS[p.isBot ? 1 : 0] : p.color, x: spawns[i].x, y: spawns[i].y,
    health: room.rules.health + (playerClass(p) === 'armored' ? 50 : 0), maxHealth: room.rules.health + (playerClass(p) === 'armored' ? 50 : 0), alive: true, connected: p.connected, isBot: Boolean(p.isBot), personality: p.isBot ? p.personality || 'aggressive' : null, team: ['teams', 'teamHill'].includes(room.rules.gameMode) ? `team-${i % activeTeamCount + 1}` : p.isBot ? 'bots' : 'humans', classType: playerClass(p),
    facing: spawns[i].x < WORLD.width / 2 ? 1 : -1, inventory: [], fuel: driveStats({ classType: playerClass(p) }).maxFuel, lastDriveAt: 0, selectedPowerup: null, selectedPowerups: [], rewardOffer: null, turnsPlayed: 0, hillScore: 0, classEvolutions: [], pendingClassEvolutions: 0, arsenalOffer: [...(p.arsenalOffer || SELECTABLE_ARSENAL_ITEMS)], arsenal: playerArsenal(p), ammo: Object.fromEntries(playerArsenal(p).map((type) => [type, 1])), arsenalLastUsed: {}, lastBackpackerRerollRound: 0, megaCannonCharge: 0, megaCannonUses: 0, shield: false, shieldCharges: 0, armorFractureTurns: 0, frozenTurns: 0, powerupBlockedTurns: 0, teslaDisabledTurns: 0, invisibleTurns: 0, invisibilityFresh: false, regenTurns: 0, airborne: null, spiderMoves: 0, spiderClimb: false, lastPickup: null, lastLaunch: null, lastAirBoost: null, lastSafeX: spawns[i].x, lastSafeY: spawns[i].y, graveRecorded: false, supportPlatformId: spawns[i].supportPlatformId || null, platformOffset: spawns[i].platformOffset ?? null, lastDamageRound: 0, lastClassRound: 0, stats: { damage: 0, shots: 0, destruction: 0, destroyed: {} },
  }));
  const rand = seededRandom(`${seed}-items`);
  const validX = () => {
    if (terrain.platforms?.length && rand() < .72) {
      const platform = terrain.platforms[Math.floor(rand() * terrain.platforms.length)];
      return platform.x + 15 + rand() * Math.max(1, platform.width - 30);
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = 70 + rand() * (WORLD.width - 140);
      if (safeGroundAt(terrain, candidate)) return candidate;
    }
    return WORLD.width / 2;
  };
  const enabledCollectibles = COLLECTIBLE_ITEMS.filter((type) => room.rules.enabledPowerups.includes(type));
  const powerups = Array.from({ length: enabledCollectibles.length ? room.rules.powerupCount : 0 }, (_, i) => {
    const x = validX(); const surface = terrainY(terrain, x); const buriedY = surface + 16 + Math.round(rand() * 22);
    return { id: `p${i}`, type: enabledCollectibles[Math.floor(rand() * enabledCollectibles.length)], x, y: buriedY, buriedY, revealed: false, active: false };
  });
  const mines = room.rules.mines ? Array.from({ length: Math.max(2, Math.floor(room.players.length * 1.5)) }, (_, i) => {
    const x = validX();
    return { id: `m${i}`, x, y: terrainY(terrain, x) - 3, active: true };
  }) : [];
  const objects = createScenarioObjects(terrain, spawns, rand);
  const now = Date.now();
  const game = {
    phase: skipPreparation ? 'roulette' : room.rules.classesEnabled ? 'class' : 'arsenal', training: Boolean(room.rules.training), mode: room.rules.gameMode, teamCount: ['teams', 'teamHill'].includes(room.rules.gameMode) ? activeTeamCount : null, friendlyFire: Boolean(room.rules.friendlyFire), enabledEvents: room.rules.enabledEvents, enabledPowerups: room.rules.enabledPowerups, seed, gravity: room.rules.gravity, speed: room.rules.gameSpeed, wind: windForTurn(seed, 1), terrain, players, powerups, mines, platformEpoch: now, classEndsAt: skipPreparation ? null : room.rules.classesEnabled ? now + GAME_TIMING.classMs : null, turnIndex: 0, turnNumber: 1,
    roundNumber: 1, roundLimit: room.rules.roundLimit, roundParticipants: players.map((player) => player.id), roundCompleted: [], hill: ['hill', 'teamHill'].includes(room.rules.gameMode) ? { ...findHillZone(terrain), teamScores: Object.fromEntries([...new Set(players.map((player) => player.team))].map((team) => [team, 0])), lastCaptureTeam: null } : null, lavaLevel: WORLD.height - 24, survival: room.rules.gameMode === 'survival' ? { lastRise: null, nextLevel: survivalLavaLevel(2, room.rules.roundLimit) } : null, eruptionCount: 0,
    arsenalEndsAt: now + (room.rules.classesEnabled ? GAME_TIMING.classMs : 0) + GAME_TIMING.arsenalMs, rouletteStartedAt: null, rouletteSpinEndsAt: null, rouletteEndsAt: null, rouletteSequence: [], rouletteWinnerIndex: null, turnEndsAt: null,
    actions: { movesLeft: 2, attackAvailable: true }, winner: null, winningTeam: null, events: [], objects, graves: [], fireZones: [], delayedStrikes: [], soapBubbles: [], soapPops: [], bomberDetonations: [], harpoonAnchor: null, harpoonPull: null, interactionSerial: 0, pickupSerial: 0, pickupAttractions: [], classPulseSerial: 0, lastClassPulses: [], rodPulseSerial: 0, lastRodPulse: null, sentryPulseSerial: 0, lastSentryPulse: null, saboteurPulseSerial: 0, lastSaboteurPulses: [], lastNinjaStrike: null, lastSuperheatPulse: null, shotEndsAt: null, pendingShot: null, botActAt: null, arenaEventReadyAt: null, lastBattleAnimationUntil: 0,
  };
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
    ? { ...player, x: null, y: null, lastSafeX: null, lastSafeY: null, platformOffset: null, supportPlatformId: null, airborne: null, wallClinging: null, lastMove: null, lastLaunch: null, lastAirBoost: null, lastLanding: null, lastBlink: null, lastJump: null, lastPickup: null, lastRevive: null, lastSalvage: null, lastDestruction: null, hidden: true }
    : { ...player, hidden: false });
  const resolvedCurrentEvent = game.turnNumber % 3 === 0 && game.events?.some((event) => event.turn === game.turnNumber && !event.warning);
  const nextEventTurn = resolvedCurrentEvent ? game.turnNumber + 3 : Math.ceil(game.turnNumber / 3) * 3;
  const rodForecast = game.phase === 'playing' && (game.objects || []).some((object) => object.type === 'lightningRod' && object.active) && game.enabledEvents?.length
    ? { type: eventTypeForTurn(game, nextEventTurn, seededRandom(`${game.seed}-arena-${nextEventTurn}`)), turnsUntil: nextEventTurn - game.turnNumber, turn: nextEventTurn }
    : null;
  return { ...game, players, rodForecast, terrain: { ...game.terrain, heights: game.terrain.heights }, serverTime: Date.now() };
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

export function ninjaFatal(room, playerId, targetId) {
  const game = room.game; const ninja = currentPlayer(game);
  if (game?.phase !== 'playing' || ninja?.id !== playerId) throw new Error('O corte fatal só pode ser usado no seu turno.');
  if (activeClass(ninja) !== 'ninja') throw new Error('O corte fatal é exclusivo do Ninja e não funciona sob Tesla.');
  if (game.openingRestrictionsActive && game.roundNumber === 1) throw new Error('O Corte Fatal libera na segunda rodada.');
  if (game.arenaWarningUntil > Date.now() || game.shotEndsAt || game.harpoonAnchor || game.harpoonPull) throw new Error('Aguarde a ação atual terminar.');
  if (!game.actions.attackAvailable) throw new Error('O ataque deste turno já foi usado.');
  updateMovingPlatforms(game);
  const path = ninjaFatalPath(game, ninja, targetId);
  if (!path) throw new Error('Aproxime-se de um inimigo sem paredes entre vocês para usar o corte fatal.');
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
  ninja.x = clamp(path.toX, 16, WORLD.width - 16); ninja.y = path.toY; ninja.supportPlatformId = null; ninja.platformOffset = null; ninja.wallClinging = null;
  const landingY = terrainY(game.terrain, ninja.x) - WORLD.tankRadius;
  if (!ninja.airborne && safeGroundAt(game.terrain, ninja.x) && Math.abs(landingY - ninja.y) < 34) ninja.y = landingY;
  else ninja.airborne = { vx: ninja.facing * 45, vy: Math.max(0, ninja.airborne?.vy || 0), falling: true, startY: ninja.y, minY: ninja.y, updatedAt: Date.now() };
  ninja.lastSafeX = ninja.x; ninja.lastSafeY = ninja.y;
  if (hits.some((hit) => hit.eliminated)) { if (!ninja.inventory.includes('lightningStep')) ninja.inventory.push('lightningStep'); game.interactionSerial += 1; ninja.lastBlinkRecharge = { serial: game.interactionSerial, x: ninja.x, y: ninja.y }; }
  const concealed = ninja.invisibleTurns > 0;
  // The strike resets the passive stealth timer, but does not expose a Ninja
  // who was already cloaked. Opponents only receive the slash coordinates.
  ninja.lastNinjaRevealRound = game.roundNumber;
  game.actions.attackAvailable = false; game.actions.movesLeft = 0;
  const now = Date.now(); game.interactionSerial += 1;
  game.lastNinjaStrike = { serial: game.interactionSerial, sourceId: ninja.id, targetId: path.target.id, fromX, fromY, toX: ninja.x, toY: ninja.y, hitX: path.target.x, hitY: path.target.y, hits, damage: hits.reduce((sum, hit) => sum + hit.damage, 0), startedAt: now, concealed, revealComplete: !concealed };
  game.lastBattleAnimationUntil = now + CLASS_BALANCE.ninjaFatalDurationMs;
  game.shotEndsAt = game.lastBattleAnimationUntil; game.pendingShot = { shooterId: ninja.id, weapon: 'ninjaFatal' };
  recordEliminations(game);
  return game.lastNinjaStrike;
}

export function rerollBackpackerArsenal(room, playerId) {
  const game = room.game; const player = currentPlayer(game);
  if (player?.id !== playerId || !backpackerRerollAvailable(game, player)) throw new Error('O Mochileiro só pode trocar o arsenal uma vez nas rodadas 3, 6, 9…');
  if (game.shotEndsAt || game.harpoonAnchor || game.harpoonPull || game.arenaWarningUntil > Date.now()) throw new Error('Aguarde a ação atual terminar.');
  const shots = SELECTABLE_ARSENAL_ITEMS.filter((type) => ARSENAL_DEFS[type].kind !== 'movement');
  const movement = SELECTABLE_ARSENAL_ITEMS.filter((type) => ARSENAL_DEFS[type].kind === 'movement');
  const choose = (pool, count) => { const remaining = [...pool]; return Array.from({ length: count }, () => remaining.splice(crypto.randomInt(remaining.length), 1)[0]); };
  const previous = [...player.arsenal]; let choices;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    choices = [...choose(shots, 2), ...choose(movement, 1)];
    if (!choices.every((type) => previous.includes(type)) || previous.length !== 3) break;
  }
  if (choices.every((type) => previous.includes(type)) && previous.length === 3) choices[0] = shots.find((type) => !previous.includes(type));
  player.arsenal = choices; player.ammo = Object.fromEntries(choices.map((type) => [type, 1])); player.arsenalLastUsed = {};
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
function addAmmo(player, amount = 1) { for (const type of player.arsenal || []) if (type !== 'megaCannon') player.ammo[type] = (player.ammo[type] || 0) + amount; }
function applyTurnClassPassives(game, active) {
  if (activeClass(active) === 'ninja') game.actions.movesLeft = Math.max(game.actions.movesLeft, 3);
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
    if (player.classType === 'meteorologist' && game.roundNumber >= 2 && !player.arsenal.includes('lightningRod')) {
      player.arsenal.push('lightningRod'); player.ammo.lightningRod = 1;
      game.pickupSerial += 1; player.lastPickup = { serial: game.pickupSerial, type: 'lightningRod', category: 'classReward', contents: null };
    } else if (activeClass(player) === 'meteorologist' && game.roundNumber > 2 && (game.roundNumber - 2) % 3 === 0) player.ammo.lightningRod = Math.min(2, (player.ammo.lightningRod || 0) + 1);
    if (activeClass(player) === 'ninja') { if (game.roundNumber % 2 === 0 && !player.inventory.includes('lightningStep')) player.inventory.push('lightningStep'); if (game.roundNumber % 2 === 0) player.inventory.push('rocketDash'); if (player.turnsPlayed >= 2 && roundsSafe >= 2 && game.roundNumber - (player.lastNinjaRevealRound || 0) >= 2) { if (!player.invisibleTurns) { game.interactionSerial += 1; player.lastNinjaReveal = { serial: game.interactionSerial, x: player.x, y: player.y, reason: 'ghost', expiresRound: game.roundNumber + 2 }; } player.invisibleTurns = Math.max(player.invisibleTurns || 0, 2); player.invisibilityFresh = true; } }
    if (activeClass(player) === 'saboteur') {
      if (game.roundNumber > 1 && player.arsenal.includes('teslaOrb')) player.ammo.teslaOrb = (player.ammo.teslaOrb || 0) + 1;
      if (game.roundNumber % 3 === 0) {
        const targetIds = []; const hits = [];
        for (const sentry of game.objects || []) if (sentry.type === 'sentry' && sentry.active && sentry.ownerId !== player.id && !areAllies(game, player, game.players.find((entry) => entry.id === sentry.ownerId)) && Math.hypot(sentry.x - player.x, sentry.y - player.y) <= CLASS_BALANCE.saboteurPulseRadius) sentry.disabledUntilRound = Math.max(sentry.disabledUntilRound || 0, game.roundNumber);
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
  if (activeClass(player) === 'backpacker') { addAmmo(player, 1); for (const ally of teammates(game, player)) if (Math.hypot(ally.x - player.x, ally.y - player.y) <= 520) { const weapon = ally.arsenal.find((type) => type !== 'megaCannon'); if (weapon) ally.ammo[weapon] = Math.min(3, (ally.ammo[weapon] || 0) + 1); } }
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

function finishByRoundLimit(game) {
  const alive = game.players.filter((player) => player.alive); const score = (player) => player.health + player.stats.damage * .12 + (player.stats?.destruction || 0) * .08;
  if (usesTeams(game)) {
    const teams = [...new Set(game.players.map((player) => player.team))].map((team) => ({ team, players: alive.filter((player) => player.team === team), score: alive.filter((player) => player.team === team).reduce((sum, player) => sum + score(player), 0) }));
    const hillPoints = (team) => game.mode === 'teamHill' ? game.hill?.teamScores?.[team.team] || 0 : 0;
    teams.sort((a, b) => hillPoints(b) - hillPoints(a) || b.score - a.score); game.winningTeam = hillPoints(teams[0]) === hillPoints(teams[1]) && teams[0].score === teams[1].score ? null : teams[0].team; game.winner = teams[0].players.sort((a, b) => score(b) - score(a))[0]?.id || null;
  } else { alive.sort((a, b) => game.mode === 'hill' ? b.hillScore - a.hillScore || score(b) - score(a) : score(b) - score(a)); const uniqueLead = !alive[1] || (game.mode === 'hill' && alive[0].hillScore !== alive[1].hillScore) || score(alive[0]) !== score(alive[1]); game.winner = alive[0] && uniqueLead ? alive[0].id : null; }
  game.phase = 'finished'; game.finishedByRounds = true; game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = null; game.botActAt = null; game.shotEndsAt = null; game.pendingShot = null;
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
    game.winningTeam = team; game.winner = occupants[0].id; game.phase = 'finished'; game.finishedByObjective = true; game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = null; game.botActAt = null; game.shotEndsAt = null; game.pendingShot = null; return true;
  }
  if (occupants.length !== 1) return false;
  const holder = occupants[0]; holder.hillScore = (holder.hillScore || 0) + 1;
  if (holder.hillScore < game.hill.pointsToWin) return false;
  game.winner = holder.id; game.phase = 'finished'; game.finishedByObjective = true; game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = null; game.botActAt = null; game.shotEndsAt = null; game.pendingShot = null;
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
  game.roundParticipants = game.players.filter((entry) => entry.alive).map((entry) => entry.id); game.roundCompleted = []; applyRoundClassPassives(game); recordEliminations(game); if (evaluateVictory(game)) return true; offerClassEvolutions(room); return false;
}

function queueArenaPulse(room) {
  const game = room.game; if (!game || game.turnNumber % 3 !== 0 || game.pendingArenaEvent || game.arenaEventReadyAt) return;
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

function traceSentryBullet(game, sentry, owner, target, index) {
  const originY = sentry.groundY - sentry.height + 8;
  const aimY = target.y + (index - 2) * 3;
  const angle = Math.atan2(aimY - originY, target.x - sentry.x);
  const startX = sentry.x + Math.cos(angle) * 34; const startY = originY + Math.sin(angle) * 34;
  const distance = WEAPON_BALANCE.sentry.scanRadius + 35; const dx = Math.cos(angle) * 3; const dy = Math.sin(angle) * 3;
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
    const damage = Math.min(hit.health, shielded ? Math.ceil(WEAPON_BALANCE.sentry.damage * .35) : WEAPON_BALANCE.sentry.damage);
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

export function nextTurn(room) {
  const game = room.game;
  if (!game || game.phase === 'finished') return;
  room.pendingVerticalChoice = null;
  room.pendingClusterChoice = null;
  room.pendingFireworksChoice = null;
  game.shotEndsAt = null; game.pendingShot = null;
  const departing = currentPlayer(game);
  if (game.harpoonAnchor?.ownerId === departing?.id) { departing.ammo.harpoon = (departing.ammo.harpoon || 0) + 1; delete departing.arsenalLastUsed?.harpoon; game.harpoonAnchor = null; }
  if (departing?.rewardOffer) autoClaimReward(game, departing);
  if (departing?.invisibilityFresh) departing.invisibilityFresh = false;
  else if (departing?.invisibleTurns > 0) departing.invisibleTurns -= 1;
  if (departing?.frozenTurns > 0) departing.frozenTurns -= 1;
  if (departing?.powerupBlockedTurns > 0) departing.powerupBlockedTurns -= 1;
  if (departing?.regenTurns > 0 && departing.alive && !departing.teslaDisabledTurns) { departing.health = Math.min(departing.maxHealth, departing.health + 20); departing.regenTurns -= 1; }
  if (departing?.teslaDisabledTurns > 0) departing.teslaDisabledTurns -= 1;
  if (departing?.armorFractureTurns > 0) departing.armorFractureTurns -= 1;
  // A turn can end mid-fall. Physics continues on server ticks until real contact.
  applyFireZones(game);
  pulseLightningRods(game);
  if (evaluateVictory(game)) return;
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
  const active = currentPlayer(game); active.turnsPlayed = (active.turnsPlayed || 0) + 1; rechargeArsenal(active); offerPowerupChoice(room, active);
  active.driveBlocked = false; active.botDriveDirection = null; active.botDriveDistance = 0;
  game.wind = windForTurn(game.seed, game.turnNumber);
  const excavatorMoves = hasPowerupEquipped(active, 'excavator') ? active.inventory.filter((type) => type === 'excavator').length : 0;
  game.actions = { movesLeft: active.teslaDisabledTurns > 0 ? 2 : active.frozenTurns > 0 ? 0 : excavatorMoves > 0 ? 3 : 2, attackAvailable: active.teslaDisabledTurns <= 0 };
  applyTurnClassPassives(game, active);
  if (active.armorFractureTurns > 0) game.actions.movesLeft = Math.max(0, game.actions.movesLeft - 1);
  collectPowerups(game, active);
  const turnStartedAt = Date.now(); const sentryDelay = Math.max(0, (game.lastBattleAnimationUntil || 0) - turnStartedAt);
  game.turnEndsAt = turnStartedAt + sentryDelay + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
  game.botActAt = turnStartedAt + sentryDelay + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed;
  queueArenaPulse(room);
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
  const continuous = Boolean(options.continuous && !arsenalType && (player.airborne?.parachute || (!hasPowerupEquipped(player, 'rocketDash') && !hasPowerupEquipped(player, 'excavator'))));
  if (!continuous && game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  if (player.teslaDisabledTurns > 0 && arsenalType) throw new Error('Tesla ativo: apenas movimento normal disponível.');
  const armoredDash = arsenalType === 'armoredDash';
  if (armoredDash && (!player.arsenal?.includes('armoredDash') || (player.ammo?.armoredDash || 0) <= 0)) throw new Error('Investida indisponível.');
  if (game.harpoonAnchor || game.harpoonPull) throw new Error('Use o cabo do arpão ou passe o turno primeiro.');
  let dir = direction < 0 ? -1 : 1;
  const drive = driveStats(player);
  if (continuous) {
    if ((player.fuel || 0) <= 0) throw new Error('Sem combustível. Recarrega a cada duas rodadas.');
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
  const spiderTarget = spiderLeap ? spiderLeapTarget(game.terrain, player, Number(options.targetX), Number(options.targetY)) : null;
  if (spiderTarget && !spiderTarget.valid) throw new Error(spiderTarget.reason);
  dir = spiderTarget?.direction ?? dir;
  const distance = continuous ? Math.min(player.fuel, drive.speed * (options.bot ? .38 : DRIVE.packetMs / 1000), options.maxDistance ?? Infinity) : movementDistance({ armoredDash, spiderLeap, rocketDash: dashIndex >= 0, boostStacks }); const excavatorIndex = hasPowerupEquipped(player, 'excavator') ? player.inventory.indexOf('excavator') : -1;
  const startX = player.x; const startY = player.y; const dashContacts = new Set(); const dashMineVisits = new Set();
  const previousDamageImmunity = game.damageImmunePlayerIds; if (armoredDash) { game.damageImmunePlayerIds = new Set(previousDamageImmunity || []); game.damageImmunePlayerIds.add(player.id); }
  const onStep = armoredDash ? (x, feet) => {
    for (const target of game.players) if (target.alive && target.id !== player.id && !protectedAlly(game, target, player) && Math.abs(target.x - x) <= 21 && Math.abs(target.y - (feet - WORLD.tankRadius)) <= 34) dashContacts.add(target.id);
    triggerMines(game, x, feet - WORLD.tankRadius, 22, dashMineVisits, player.id);
  } : null;
  const path = spiderLeap ? spiderTarget.path : armoredDash || excavatorIndex >= 0 ? specialMovePath(game.terrain, player, dir, distance, { armoredDash, excavator: excavatorIndex >= 0, onStep }) : walkPath(game.terrain, player.teslaDisabledTurns > 0 ? { ...player, spiderClimb: false } : player, dir, distance);
  if (!path.moved) { game.damageImmunePlayerIds = previousDamageImmunity; if (continuous) return null; throw new Error('Inclinação muito alta.'); }
  if (spiderLeap) { spendArsenalCharge(player, 'spider'); player.spiderClimb = true; player.fuel = Math.min(driveStats(player).maxFuel, player.fuel + 90); player.spiderMoves = 2; game.actions.movesLeft = Math.max(game.actions.movesLeft, 3); }
  if (armoredDash || spiderLeap) revealNinja(game, player, 'arsenal');
  const wallBreakPoints = path.wallBreakPoints || [];
  player.x = path.x; player.facing = dir; player.y = path.y; player.supportPlatformId = path.supportPlatformId; player.ceilingClinging = path.ceilingClinging || null; player.wallClinging = path.climbing && !path.ceilingClinging ? dir : null;
  player.movingUntil = Date.now() + (spiderLeap ? 900 : armoredDash ? 760 : continuous ? DRIVE.packetMs * 2 : 480);
  if (!armoredDash && !spiderLeap) { game.interactionSerial += 1; player.lastMove = { serial: game.interactionSerial, kind: path.climbing ? 'spiderClimb' : excavatorIndex >= 0 ? 'excavator' : dashIndex >= 0 ? 'rocketDash' : 'tracks', fromX: startX, fromY: startY, toX: player.x, toY: player.y, direction: dir }; }
  if (path.supportPlatformId) {
    const support = game.terrain.floatingPlatforms.find((platform) => platform.id === path.supportPlatformId);
    player.platformOffset = player.x - support.x;
  } else player.platformOffset = null;
  if (continuous) player.fuel = Math.max(0, player.fuel - Math.max(Math.abs(player.x - startX), path.climbing ? Math.abs(player.y - startY) : 0));
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
  if (spiderLeap) { game.interactionSerial += 1; player.lastLaunch = { serial: game.interactionSerial, kind: 'spiderLeap', fromX: startX, fromY: startY, toX: player.x, toY: player.y, targetX: spiderTarget.targetX, targetY: spiderTarget.targetY, direction: dir, attachedToWall: Boolean(path.attachedToWall) }; }
  if (player.spiderClimb) player.spiderMoves = Math.max(0, game.actions.movesLeft);
  if (excavatorIndex >= 0) { player.inventory.splice(excavatorIndex, 1); syncEquippedPowerups(player); }
  if (dashIndex >= 0) { player.inventory.splice(dashIndex, 1); syncEquippedPowerups(player); }
  if (!armoredDash) pushBarrelsOnMove(game, player, startX, dir);
  collectPowerups(game, player);
  triggerLauncher(game, player, dir);
  triggerMines(game, player.x, player.y, 22, new Set(), player.id);
  if (!path.climbing) settlePlayers(game);
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
  if (arsenalPickup) { if (!player.arsenal.includes(type)) player.arsenal.push(type); player.ammo[type] = (player.ammo[type] || 0) + 1; }
  else if (type === 'heal') { player.health = Math.min(player.maxHealth, player.health + 50 + (player.classType === 'healer' && !allies.length ? 20 : 0)); if (!shared && player.classType === 'healer') for (const ally of allies) ally.health = Math.min(ally.maxHealth, ally.health + 50); }
  else if (type === 'shield') { player.shieldCharges = (player.shieldCharges || 0) + 1; player.shield = true; }
  else if (type === 'movementBoost') { player.inventory.push(type); player.fuel = Math.min(driveStats(player).maxFuel, (player.fuel || 0) + 65); }
  else if (type === 'invisibility') { player.invisibleTurns = (player.invisibleTurns || 0) + 2; player.invisibilityFresh = true; }
  else if (type === 'excavator') player.inventory.push('excavator', 'excavator', 'excavator');
  else if (type === 'ammoCrate') { for (const weapon of player.arsenal || []) if (weapon !== 'megaCannon') { player.ammo[weapon] = Math.min(4, (player.ammo[weapon] || 0) + 2); delete player.arsenalLastUsed?.[weapon]; } }
  else if (type === 'repairDrone') { player.regenTurns = (player.regenTurns || 0) + 4; if (!shared && player.classType === 'healer') for (const ally of allies) ally.regenTurns = (ally.regenTurns || 0) + 4; }
  else if (type === 'overcharge') { for (const power of player.arsenal || []) if (power !== 'megaCannon') player.ammo[power] = 1; }
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
    if (type === 'megaCannon' || (player.ammo[type] || 0) > 0) continue;
    const lastUse = player.arsenalLastUsed?.[type] ?? 0;
    if ((player.turnsPlayed || 0) - lastUse >= (ARSENAL_COOLDOWN_TURNS[type] || 3)) player.ammo[type] = 1;
  }
}

function autoClaimReward(game, player, random = seededRandom(`${game.seed}-auto-reward-${player.id}-${player.rewardOffer?.playerTurn}`)) { if (!player.rewardOffer) return; grantPowerup(game, player, player.rewardOffer.choices[Math.floor(random() * player.rewardOffer.choices.length)]); player.rewardOffer = null; }

export function claimReward(room, playerId, type) {
  const player = room.game?.players.find((entry) => entry.id === playerId);
  if (!player?.alive || currentPlayer(room.game)?.id !== playerId || !player.rewardOffer?.choices.includes(type)) throw new Error('Recompensa indisponível.');
  grantPowerup(room.game, player, type); player.rewardOffer = null;
}

function createScenarioObjects(terrain, spawns, random) {
  const objects = []; const occupied = [...spawns.map((spawn) => spawn.x)];
  const position = (minimumDistance = 100) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = Math.round(90 + random() * (WORLD.width - 180));
      if (!safeGroundAt(terrain, x) || occupied.some((entry) => Math.abs(entry - x) < minimumDistance)) continue;
      occupied.push(x); return x;
    }
    return null;
  };
  const signatureX = position(225);
  if (signatureX !== null) {
    const x = signatureX; const groundY = terrainY(terrain, x); const type = BIOMES[terrain.type]?.signature;
    if (type === 'building') objects.push({ id: 'biome-signature', type, x, y: groundY - 112, groundY, width: 150, height: 224, durability: 3, active: true });
    if (type === 'concrete') objects.push({ id: 'biome-signature', type, x, y: groundY - 7, groundY, width: 145, active: true });
    if (type === 'fuelTank') objects.push({ id: 'biome-signature', type, x, y: groundY - 22, groundY, width: 34, height: 44, durability: 2, active: true });
    if (type === 'radar') objects.push({ id: 'biome-signature', type, x, y: groundY - 34, groundY, width: 62, height: 68, durability: 2, active: true });
    if (type === 'launcher') objects.push({ id: 'biome-signature', type, x, y: groundY - 4, groundY, direction: random() < .5 ? -1 : 1, active: true, cooldownUntilTurn: 0 });
    if (type === 'crane') { const height = 255; const armLength = 205; const direction = random() < .5 ? -1 : 1; objects.push({ id: 'biome-signature', type, x, y: groundY - height / 2, groundY, height, armLength, direction, ballX: x + direction * (armLength - 24), ballY: groundY - 140, ballRadius: 28, towerDurability: 2, cableIntact: true, ballReleased: false, active: true }); }
  }
  for (let index = 0; index < 3; index += 1) { const x = position(150); if (x === null) continue; const groundY = terrainY(terrain, x); objects.push({ id: `cache-${index}`, type: 'supplyCache', x, y: groundY - 22, groundY, width: 54, height: 44, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(160); if (x === null) continue; const groundY = terrainY(terrain, x); objects.push({ id: `coil-${index}`, type: 'shockCoil', x, y: groundY - 38, groundY, width: 54, height: 76, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(175); if (x === null) continue; const groundY = terrainY(terrain, x); objects.push({ id: `healing-${index}`, type: 'healingStation', x, y: groundY - 36, groundY, width: 70, height: 72, durability: 3, active: true }); }
  for (let index = 0; index < 8; index += 1) { const x = position(115); if (x) { const groundY = terrainY(terrain, x); objects.push({ id: `barrel-${index}`, type: 'barrel', x, y: groundY - 8, groundY, active: true }); } }
  for (let index = 0; index < 4; index += 1) { const x = position(150); if (x) { const groundY = terrainY(terrain, x); objects.push({ id: `launcher-${index}`, type: 'launcher', x, y: groundY - 4, groundY, direction: random() < .5 ? -1 : 1, active: true, cooldownUntilTurn: 0 }); } }
  for (let index = 0; index < 3; index += 1) {
    const switchX = position(190); if (!switchX) continue; const direction = random() < .5 ? -1 : 1; const rampX = Math.round(clamp(switchX + direction * (115 + random() * 100), 65, WORLD.width - 235));
    const rampGroundY = terrainY(terrain, rampX); const switchGroundY = terrainY(terrain, switchX); const ramp = { id: `ramp-${index}`, type: 'ramp', x: rampX, y: rampGroundY, groundY: rampGroundY, width: 170, direction, active: false };
    objects.push(ramp, { id: `switch-${index}`, type: 'switch', x: switchX, y: switchGroundY - 5, groundY: switchGroundY, targetId: ramp.id, active: true, pressed: false });
  }
  for (let index = 0; index < 5; index += 1) { const x = position(235); if (!x) continue; const groundY = terrainY(terrain, x); const height = 150 + Math.round(random() * 95); objects.push({ id: `building-${index}`, type: 'building', x, y: groundY - height / 2, groundY, width: 96 + Math.round(random() * 64), height, durability: 3, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(210); if (!x) continue; const groundY = terrainY(terrain, x); const direction = random() < .5 ? -1 : 1; const height = 220 + Math.round(random() * 70); const armLength = 170 + Math.round(random() * 50); const ballRadius = 28; const ballY = groundY - Math.round(height * (.42 + random() * .16)); objects.push({ id: `crane-${index}`, type: 'crane', x, y: groundY - height / 2, groundY, height, armLength, direction, ballX: x + direction * (armLength - 24), ballY, ballRadius, towerDurability: 2, cableIntact: true, ballReleased: false, active: true }); }
  for (let index = 0; index < 6; index += 1) { const x = position(105); if (!x) continue; const groundY = terrainY(terrain, x); objects.push({ id: `concrete-${index}`, type: 'concrete', x, y: groundY - 70, groundY, width: 90 + Math.round(random() * 55), active: true }); }
  for (let index = 0; index < 4; index += 1) { const x = position(145); if (!x) continue; const groundY = terrainY(terrain, x); objects.push({ id: `fuel-${index}`, type: 'fuelTank', x, y: groundY - 22, groundY, width: 34, height: 44, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(190); if (!x) continue; const groundY = terrainY(terrain, x); const height = 125 + Math.round(random() * 45); objects.push({ id: `watchtower-${index}`, type: 'watchtower', x, y: groundY - height / 2, groundY, width: 72, height, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(155); if (!x) continue; const groundY = terrainY(terrain, x); objects.push({ id: `radar-${index}`, type: 'radar', x, y: groundY - 34, groundY, width: 62, height: 68, durability: 2, active: true }); }
  const elevatedPlatforms = [...(terrain.floatingPlatforms || [])].filter((platform) => platform.active && !platform.moving && platform.width >= 125 && spawns.every((spawn) => spawn.supportPlatformId !== platform.id)).sort((a, b) => Number(b.skyDeck) - Number(a.skyDeck) || random() - .5).slice(0, 6);
  elevatedPlatforms.forEach((platform, index) => {
    const x = Math.round(platform.x + platform.width / 2); if (spawns.some((spawn) => Math.abs(spawn.x - x) < 85 && Math.abs(spawn.y - platform.y) < 95)) return; occupied.push(x); const groundY = platform.y; const support = { supportPlatformId: platform.id, platformOffset: x - platform.x };
    if (index % 3 === 0) { const width = Math.min(platform.width - 24, 86 + Math.round(random() * 34)); const height = 105 + Math.round(random() * 65); objects.push({ id: `sky-building-${index}`, type: 'building', x, y: groundY - height / 2, groundY, width, height, durability: 3, active: true, ...support }); }
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
    } else if (['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'lightningRod', 'healingStation', 'sentry'].includes(object.type)) { const left = object.x - object.width / 2; const right = object.x + object.width / 2; const top = object.groundY - object.height; if (x + radius < left || x - radius > right || y + radius < top || y - radius > object.groundY) continue; }
    else if (Math.hypot(object.x - x, object.y - y) > radius + 18) continue;
    if (visited.has(object.id)) continue;
    visited.add(object.id);
    if (object.type === 'barrel' && object.active) {
      object.active = false; const blastY = object.groundY - 5;
      const blastRadius = 100;
      const damage = applyExplosion(game, object.x, blastY, blastRadius, 78, { pushMultiplier: 1.45, sourcePlayerId }); awardExplosionDestruction(game, sourcePlayerId, damage); awardDestruction(game, sourcePlayerId, 'barrel'); interactions.push({ type: 'barrel', id: object.id, x: object.x, y: blastY, radius: blastRadius });
      game.interactionSerial += 1; game.fireZones.push({ id: `barrel-fire-${game.interactionSerial}`, x: object.x, y: blastY, radius: 88, turnsLeft: 3, ownerId: sourcePlayerId, source: 'barrel' });
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
    if (!['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'lightningRod', 'healingStation', 'sentry'].includes(object.type) || !object.active) continue; const left = object.x - object.width / 2; const right = object.x + object.width / 2; const top = object.groundY - object.height; const point = result.path.find((entry) => entry.x >= left && entry.x <= right && entry.y >= top && entry.y <= object.groundY); if (point) interactions.push(...activateScenarioObjects(game, point.x, point.y, 8, visited, sourcePlayerId));
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
      game.bomberDetonations.push({ serial: game.interactionSerial, playerId: player.id, x: blastX, y: blastY, radius, damage: CLASS_BALANCE.bomberDeathDamage, hits: damage.filter((hit) => hit.amount > 0), interactions });
      game.bomberDetonations = game.bomberDetonations.slice(-12);
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
  const alive = game.players.filter((player) => player.alive);
  const humans = game.players.filter((player) => player.team === 'humans' || !player.isBot);
  const aliveHumans = alive.filter((player) => player.team === 'humans' || !player.isBot);
  const aliveBots = alive.filter((player) => player.team === 'bots' || player.isBot);
  let finished = alive.length <= 1;
  if (game.mode === 'coop') finished ||= aliveHumans.length === 0 || aliveBots.length === 0;
  else if (['teams', 'teamHill'].includes(game.mode)) finished ||= new Set(alive.map((player) => player.team)).size <= 1;
  else if (humans.length === 1 && game.players.some((player) => player.isBot)) finished ||= aliveHumans.length === 0;
  if (!finished) return false;
  game.phase = 'finished'; game.winningTeam = game.mode === 'coop' ? (aliveHumans.length ? 'humans' : aliveBots.length ? 'bots' : null) : ['teams', 'teamHill'].includes(game.mode) ? alive[0]?.team || null : null;
  game.winner = usesTeams(game) ? alive.find((player) => player.team === game.winningTeam)?.id || null : alive[0]?.id || null;
  game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = null; game.botActAt = null; game.shotEndsAt = null; game.pendingShot = null;
  return true;
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
  if (input.type === 'trickster') {
    if (!hasPowerupEquipped(player, 'trickster') || !player.inventory.includes('trickster')) throw new Error('Equipe a Carta Sacana primeiro.');
    const onGround = (tank) => [TANK_STATE.GROUNDED, TANK_STATE.MOVING].includes(tankMotionState(game, tank));
    if (game.actions.movesLeft <= 0 || !onGround(player)) throw new Error('A troca exige um movimento disponível e o tanque no solo.');
    const desiredX = Number(input.x); const target = game.players.find((entry) => entry.id === input.targetPlayerId && entry.id !== player.id && onGround(entry))
      || game.players.filter((entry) => entry.id !== player.id && onGround(entry) && Number.isFinite(desiredX) && Math.abs(entry.x - desiredX) <= 100).sort((a, b) => Math.abs(a.x - desiredX) - Math.abs(b.x - desiredX))[0];
    if (!target) throw new Error('Escolha outro tanque no solo para realizar a troca.');
    const from = { x: player.x, y: player.y, supportPlatformId: player.supportPlatformId, platformOffset: player.platformOffset }; const targetFrom = { x: target.x, y: target.y, supportPlatformId: target.supportPlatformId, platformOffset: target.platformOffset };
    Object.assign(player, targetFrom); Object.assign(target, from); player.lastSafeX = player.x; player.lastSafeY = player.y; target.lastSafeX = target.x; target.lastSafeY = target.y;
    game.interactionSerial += 1; player.lastBlink = { serial: game.interactionSerial, playerId: player.id, fromX: from.x, fromY: from.y, toX: player.x, toY: player.y, kind: 'trickster' };
    game.interactionSerial += 1; target.lastBlink = { serial: game.interactionSerial, playerId: target.id, fromX: targetFrom.x, fromY: targetFrom.y, toX: target.x, toY: target.y, kind: 'trickster' };
    removeInventory(player, 'trickster'); syncEquippedPowerups(player); game.actions.movesLeft -= 1; collectPowerups(game, player); collectPowerups(game, target); triggerMines(game, player.x, player.y, 22, new Set(), player.id); recordEliminations(game); game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
    if (!player.alive || game.actions.movesLeft === 0) nextTurn(room);
    return { type: 'trickster', playerId: player.id, targetPlayerId: target.id, from, targetFrom };
  }
  const movementType = ['lightningStep', 'teleport'].includes(input.type) ? input.type : null;
  if (!movementType || !hasPowerupEquipped(player, movementType) || !player.inventory.includes(movementType)) throw new Error('Equipe um teleporte primeiro.');
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  const maxRange = movementType === 'teleport' ? 580 : 270;
  const preview = blinkLanding(game.terrain, game.players, player, Number(input.x), maxRange);
  if (!preview.valid) throw new Error(preview.reason);
  const { landing } = preview;
  const fromX = player.x; const fromY = player.y;
  player.x = landing.x; player.y = landing.y; player.supportPlatformId = null; player.platformOffset = null; player.lastSafeX = landing.x; player.lastSafeY = landing.y;
  game.interactionSerial += 1; player.lastBlink = { serial: game.interactionSerial, playerId: player.id, fromX, fromY, toX: landing.x, toY: landing.y };
  removeInventory(player, movementType); syncEquippedPowerups(player);
  game.actions.movesLeft -= 1; collectPowerups(game, player); triggerMines(game, player.x, player.y, 22, new Set(), player.id); recordEliminations(game); game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
  if (!player.alive || game.actions.movesLeft === 0) nextTurn(room);
  return player.lastBlink;
}

export function useArsenal(room, playerId, input = {}) {
  const game = room.game; const player = currentPlayer(game);
  if (player?.teslaDisabledTurns > 0) throw new Error('Tesla ativo: apenas movimento disponível neste turno.');
  if (game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.');
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Use o arsenal somente no seu turno.');
  if (game.openingRestrictionsActive && game.roundNumber === 1 && input.type !== 'jump' && input.type !== 'parachute') throw new Error('Na primeira rodada, apenas movimento e tiro padrão estão liberados.');
  if (input.type === 'splitDamage') {
    if (!player.arsenal?.includes('splitDamage') || (player.ammo?.splitDamage || 0) <= 0) throw new Error('Dano Dividido indisponível.');
    if (!game.actions.attackAvailable || game.shotEndsAt) throw new Error('Aguarde sua próxima ação.');
    spendArsenalCharge(player, 'splitDamage'); player.splitDamageUntilRound = game.roundNumber + 1;
    game.interactionSerial += 1; player.lastSplitDamage = { serial: game.interactionSerial, x: player.x, y: player.y, untilRound: player.splitDamageUntilRound };
    game.actions.attackAvailable = false; game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
    nextTurn(room); return player.lastSplitDamage;
  }
  if (input.type === 'superheat') {
    if (!player.arsenal?.includes('superheat') || (player.ammo?.superheat || 0) <= 0) throw new Error('Superaquecer indisponível.');
    if (!game.actions.attackAvailable || game.shotEndsAt || game.harpoonAnchor) throw new Error('Aguarde sua próxima ação.');
    const radius = 330;
    spendArsenalCharge(player, 'superheat'); revealNinja(game, player, 'arsenal');
    game.interactionSerial += 1;
    game.lastSuperheatPulse = { serial: game.interactionSerial, ownerId: player.id, x: player.x, y: player.y, radius, startedAt: Date.now(), duration: 2000 };
    game.fireZones.push({ id: `heat-${game.interactionSerial}`, x: player.x, y: player.y, radius, turnsLeft: 3, ownerId: player.id, source: 'superheat', bornRound: game.roundNumber });
    game.actions.attackAvailable = false;
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
    nextTurn(room);
    return game.lastSuperheatPulse;
  }
  if (input.type === 'parachute') { if (!player.airborne) throw new Error('O tanque não está no ar.'); revealNinja(game, player, 'arsenal'); player.airborne.parachute = true; player.airborne.vx = 0; player.airborne.vy = Math.max(0, Math.min(player.airborne.vy, 28)); game.interactionSerial += 1; player.lastJump = { serial: game.interactionSerial, kind: 'parachute' }; game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000); return player.airborne; }
  if (input.type !== 'jump' || !player.arsenal?.includes('jump') || (player.ammo?.jump || 0) <= 0) throw new Error('Pulo indisponível.');
  if (game.actions.movesLeft <= 0 || ![TANK_STATE.GROUNDED, TANK_STATE.MOVING, TANK_STATE.WALL].includes(tankMotionState(game, player))) throw new Error('O pulo exige apoio no chão, numa plataforma ou numa parede.');
  const angle = clamp(Number(input.angle) || 45, 10, 80) * Math.PI / 180; const power = clamp(Number(input.power) || 260, 120, 480); const direction = Number(input.direction) === -1 ? -1 : 1;
  revealNinja(game, player, 'arsenal');
  player.facing = direction; spendArsenalCharge(player, 'jump'); game.actions.movesLeft -= 1; player.supportPlatformId = null; player.platformOffset = null; player.wallClinging = null;
  player.airborne = { vx: Math.cos(angle) * power * direction * .72, vy: -Math.sin(angle) * power * .72, parachute: false, startY: player.y, updatedAt: Date.now() }; player.y -= 5;
  game.interactionSerial += 1; player.lastJump = { serial: game.interactionSerial, kind: 'jump' };
  game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 2000);
  return player.airborne;
}

function triggerMines(game, x, y, range, visited = new Set(), triggeringPlayerId = null) {
  for (const mine of game.mines) {
    if (!mine.active || visited.has(mine.id) || (triggeringPlayerId && mine.ownerId === triggeringPlayerId) || Math.hypot(mine.x - x, mine.y - y) > range) continue;
    visited.add(mine.id); mine.active = false;
    const mineDamage = mine.ownerId ? WEAPON_BALANCE.mineLayer.damage : NATIVE_MINE_DAMAGE;
    const damage = applyExplosion(game, mine.x, mine.y, WEAPON_BALANCE.mineLayer.radius, mineDamage, { sourcePlayerId: mine.ownerId }); awardExplosionDestruction(game, mine.ownerId, damage);
    activateScenarioObjects(game, mine.x, mine.y, WEAPON_BALANCE.mineLayer.radius, new Set(), mine.ownerId);
    triggerMines(game, mine.x, mine.y, 85, visited, triggeringPlayerId);
  }
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

function applyGravityWell(game, x, y, sourcePlayerId = null) {
  const radius = WEAPON_BALANCE.gravity.radius; const damage = [];
  const source = game.players.find((player) => player.id === sourcePlayerId);
  const craterRadius = 94; const left = Math.max(0, Math.floor(x - craterRadius)); const right = Math.min(WORLD.width - 1, Math.ceil(x + craterRadius));
  const beforeTerrain = game.terrain.heights.slice(left, right + 1);
  carveTerrain(game.terrain, x, y, craterRadius);
  for (const object of game.objects || []) {
    if (object.active === false || !Number.isFinite(object.x)) continue;
    const distance = Math.hypot(object.x - x, (object.y ?? object.groundY) - y); if (distance >= radius || distance < 5) continue;
    const mass = ['building', 'crane', 'concrete'].includes(object.type) ? .28 : object.type === 'barrel' ? .85 : .55;
    const fromX = object.x; const shift = clamp((x - object.x) * .27 * mass, -85, 85);
    object.x = clamp(object.x + shift, 12, WORLD.width - 12);
    if (object.type === 'crane') object.ballX += object.x - fromX;
    object.supportPlatformId = null; object.platformOffset = null;
    game.interactionSerial += 1; object.lastDisplacement = { serial: game.interactionSerial, fromX, toX: object.x, kind: 'gravity' };
  }
  for (const target of game.players) {
    if (!target.alive || protectedAlly(game, target, source)) continue; const distance = Math.hypot(target.x - x, target.y - y); if (distance > radius) continue;
    interruptTankControl(game, target);
    let amount = directDamage(source, target, Math.max(1, Math.round(WEAPON_BALANCE.gravity.damage * (1 - distance / radius) ** 1.35)), true);
    if (source?.classType !== 'attacker' && target.shieldCharges > 0) { amount = Math.ceil(amount * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
    target.health = Math.max(0, target.health - amount); target.alive = target.health > 0; if (amount > 0) target.lastDamageRound = game.roundNumber; if (amount > 0 && sourcePlayerId && target.id !== sourcePlayerId) { target.lastDamageSourceId = sourcePlayerId; target.lastDamageTurn = game.turnNumber; } target.x = clamp(target.x + (x - target.x) * .68, 4, WORLD.width - 4); target.supportPlatformId = null; target.platformOffset = null; if (target.airborne) { target.airborne.vx += clamp((x - target.x) * .8, -155, 155); target.airborne.vy += clamp((y - target.y) * .45, -90, 90); target.airborne.updatedAt = Date.now(); } damage.push({ playerId: target.id, amount, knockback: -Math.round((radius - distance) * .68) });
  }
  settleScenarioObjects(game); settlePlayers(game);
  damage.destruction = { terrainBlocks: Math.floor(beforeTerrain.reduce((sum, height, index) => sum + Math.max(0, game.terrain.heights[left + index] - height), 0) / 5), platformIds: [] };
  return damage;
}

export function standardDirectDamage(game, impact) {
  const balance = WEAPON_BALANCE.standard;
  if (impact.hitZone === 'center') return balance.centerDamage;
  const seed = (Math.round(impact.x * 13 + impact.y * 17) + (game.turnNumber || 1) * 37) >>> 0;
  if (impact.hitZone === 'head') return balance.headMin + seed % (balance.headMax - balance.headMin + 1);
  return balance.baseMin + seed % (balance.baseMax - balance.baseMin + 1);
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
  const power = clamp(Number(input.power) || 260, 100, 580);
  if (Number(input.direction) === -1 || Number(input.direction) === 1) player.facing = Number(input.direction);
  const weapon = ['standard', ...ARSENAL_ITEMS.filter((type) => !['jump', 'spider', 'armoredDash'].includes(type))].includes(input.weapon) ? input.weapon : 'standard';
  if (game.openingRestrictionsActive && game.roundNumber === 1 && (weapon !== 'standard' || equippedPowerups(player).some((type) => !['rocketDash', 'lightningStep', 'excavator'].includes(type)))) throw new Error('Rodada 1: apenas tiro padrão e habilidades de movimento.');
  if (weapon === 'splitDamage' || weapon === 'superheat') throw new Error(`${weapon === 'superheat' ? 'Superaquecer' : 'Dano Dividido'} deve ser ativado sem disparo.`);
  if (weapon === 'lightningRod' && activeClass(player) !== 'meteorologist') throw new Error('A Haste é exclusiva do Meteorologista.');
  if (weapon !== 'standard' && (!player.arsenal?.includes(weapon) || (player.ammo?.[weapon] || 0) <= 0)) throw new Error('Poder indisponível ou aguardando recarga.');
  if (weapon !== 'harpoon') revealNinja(game, player, 'shot');
  const reviveSerials = new Map(game.players.map((entry) => [entry.id, entry.lastRevive?.serial]));
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
      ? simulateShot({ terrain: game.terrain, players: game.players, powerups: game.powerups, ignorePlayerId: player.id, x: shotOrigin.x, y: shotOrigin.y, angle: Math.abs(offset) < 1 ? -84 : -52, power: Math.abs(offset) < 1 ? 210 : 225, gravity: room.rules.gravity, wind: game.wind * .4, direction: offset < 0 ? -1 : 1 })
      : laser ? simulateLaser(game, player, angle + offset, power) : hunter ? simulateHuntingPlane(game, player, angle + offset, power) : weapon === 'harpoon'
      ? simulateHarpoon({ terrain: game.terrain, objects: game.objects, players: game.players.filter((target) => !areAllies(game, target, player)), ignorePlayerId: player.id, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, direction: player.facing })
      : weapon === 'markerBomb' ? simulateMarkerBomb({ terrain: game.terrain, powerups: game.powerups, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing }) : weapon === 'grenade'
      ? simulateBouncingGrenade({ terrain: game.terrain, powerups: game.powerups, guidedTarget, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing })
      : weapon === 'moleBomb' ? simulateMoleBomb(game, player, offset) : weapon === 'verticalStrike' && typeof input[VERTICAL_MODE] === 'object' ? simulateVectorShot({ terrain: game.terrain, players: game.players, powerups: game.powerups, ignorePlayerId: player.id, x: input[VERTICAL_MODE].x, y: input[VERTICAL_MODE].y, targetX: input[VERTICAL_MODE].targetX, targetY: input[VERTICAL_MODE].targetY }) : simulateShot({ terrain: game.terrain, objects: game.objects, players: game.players, powerups: game.powerups, ignorePlayerId: player.id, guidedTarget, tankZones: weapon === 'standard' && !hunter, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing });
    if (!laser && !['moleBomb', 'harpoon'].includes(weapon)) clipProjectileAtCrane(game, result);
    const interceptingSentry = !laser ? interceptBySentry(game, player, result) : null;
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
    if (result.impact) {
      const heavyHeight = weapon === 'heavy' ? Math.max(0, shotOrigin.y - Math.min(shotOrigin.y, ...result.path.map((point) => point.y))) : 0; const heavyDistance = weapon === 'heavy' ? Math.abs(result.impact.x - shotOrigin.x) : 0; const rawHeavyMultiplier = weapon === 'heavy' ? 1 + clamp(heavyHeight / 720, 0, 1) * .48 + clamp(heavyDistance / 1800, 0, 1) * .32 : 1; const heavyCritical = weapon === 'heavy' && rawHeavyMultiplier >= WEAPON_BALANCE.heavy.criticalThreshold; const damageMultiplier = weapon === 'heavy' ? Math.min(megaMissile ? 1.45 : WEAPON_BALANCE.heavy.maxMultiplier, rawHeavyMultiplier) * (heavyCritical ? WEAPON_BALANCE.heavy.criticalMultiplier : 1) : 1;
      const impactRadius = weapon === 'sentry' && interceptingSentry ? 30 : weapon === 'heavy' ? Math.round(radius * (1 + (damageMultiplier - 1) * .28)) : bunkerBuster ? Math.max(radius, 124) : radius;
      const impactDamage = Math.round(baseDamage * damageMultiplier);
      const before = new Map(game.players.map((p) => [p.id, p.health])); const shieldBefore = new Map(game.players.map((p) => [p.id, Boolean(p.shield || p.shieldCharges > 0)]));
      const directHit = weapon === 'standard' && !megaMissile && result.impact.hitZone ? { playerId: result.impact.playerId, zone: result.impact.hitZone, damage: standardDirectDamage(game, result.impact) } : weapon === 'zeus' && result.impact.playerId ? { playerId: result.impact.playerId, damage: WEAPON_BALANCE.zeus.damage } : null;
      const deployMine = weapon === 'mineLayer'; const deploySentry = weapon === 'sentry'; const gravityWell = weapon === 'gravity'; const laserStructureInteractions = laser ? activateLaserStructures(game, result, player.id) : []; const damage = (lightningRod && !megaMissile) || (deploySentry && !interceptingSentry) ? [] : laser ? applyLaserDamage(game, result, player) : deployMine ? [] : gravityWell ? applyGravityWell(game, result.impact.x, result.impact.y, player.id) : applyExplosion(game, result.impact.x, result.impact.y, impactRadius, impactDamage, { ignoreShield: armorPiercer, pushMultiplier: shockwave ? 2.8 : weapon === 'zeus' ? .08 : 1, sourcePlayerId: player.id, attackType: weapon, directHit });
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
      const interactions = laser ? [{ type: 'laser', x: result.impact.x, y: result.impact.y }, ...laserStructureInteractions] : deployMine || deploySentry || gravityWell || (lightningRod && !megaMissile) ? [] : activateScenarioObjects(game, result.impact.x, result.impact.y, impactRadius, new Set(), player.id);
      if (interceptingSentry) interactions.push({ type: 'sentryIntercept', x: result.impact.x, y: result.impact.y, sentryId: interceptingSentry.id });
      if (deploySentry && !interceptingSentry) { const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active); const groundY = platform?.y ?? terrainY(game.terrain, result.impact.x); game.interactionSerial += 1; const sentry = { id: `sentry-${game.interactionSerial}`, type: 'sentry', x: result.impact.x, y: groundY - 22, groundY, width: 34, height: 44, durability: WEAPON_BALANCE.sentry.durability, active: true, ownerId: player.id, supportPlatformId: platform?.id || null, platformOffset: platform ? result.impact.x - platform.x : null, disabledUntilRound: 0, lastFiredTurn: game.turnNumber }; game.objects.push(sentry); interactions.push({ type: 'sentryDeploy', id: sentry.id, x: sentry.x, y: sentry.y, radius: WEAPON_BALANCE.sentry.scanRadius }); }
      if (lightningRod) { const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active); const groundY = platform?.y ?? terrainY(game.terrain, result.impact.x); game.interactionSerial += 1; const zapRadius = Math.round(WEAPON_BALANCE.lightningRod.zapRadius * (bigExplosion ? 1.35 : 1)); const rod = { id: `rod-${game.interactionSerial}`, type: 'lightningRod', x: result.impact.x, y: groundY - 29, groundY, width: 24, height: 58, durability: WEAPON_BALANCE.lightningRod.durability, zapRadius, armorPiercer, freezeTurns: freezeIndex >= 0 ? 1 : 0, active: true, ownerId: player.id, supportPlatformId: platform?.id || null, platformOffset: platform ? result.impact.x - platform.x : null }; game.objects.push(rod); interactions.push({ type: 'lightningRod', id: rod.id, x: rod.x, y: rod.y, radius: zapRadius }); }
      if (deployMine) { const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId && entry.active); game.interactionSerial += 1; const mine = { id: `thrown-mine-${game.interactionSerial}`, x: result.impact.x, y: (platform?.y ?? terrainY(game.terrain, result.impact.x)) - 3, active: true, ownerId: player.id, supportPlatformId: platform?.id || null, platformOffset: platform ? result.impact.x - platform.x : null }; game.mines.push(mine); interactions.push({ type: 'mineDeploy', id: mine.id, x: mine.x, y: mine.y }); }
      if (molotov) { game.interactionSerial += 1; const radius = 120; const surfaceY = result.impact.platformId ? game.terrain.floatingPlatforms?.find((entry) => entry.id === result.impact.platformId)?.y : terrainY(game.terrain, result.impact.x); const fireY = Math.min(surfaceY ?? result.impact.y, result.impact.y + 28); game.fireZones.push({ id: `fire-${game.interactionSerial}`, x: result.impact.x, y: fireY, radius, turnsLeft: 3, ownerId: player.id, source: 'molotov', platformId: result.impact.platformId || null, bornRound: game.roundNumber }); interactions.push({ type: 'molotov', x: result.impact.x, y: fireY, radius }); }
      if (weapon === 'fireworks') for (let burst = 0; burst < WEAPON_BALANCE.fireworks.secondaryBursts; burst += 1) { const micro = simulateFireworkBurst(game, result.impact, burst, player.id); const bx = micro.impact.x; const by = micro.impact.y; const burstDamage = applyExplosion(game, bx, by, WEAPON_BALANCE.fireworks.secondaryRadius, WEAPON_BALANCE.fireworks.secondaryDamage, { pushMultiplier: .35, sourcePlayerId: player.id }); awardExplosionDestruction(game, player.id, burstDamage); interactions.push({ type: 'firework', x: bx, y: by, originX: result.impact.x, originY: result.impact.y, path: micro.path, burst, delay: burst * .025, colorIndex: burst % 4, radius: WEAPON_BALANCE.fireworks.secondaryRadius }); interactions.push(...activateScenarioObjects(game, bx, by, WEAPON_BALANCE.fireworks.secondaryRadius, new Set(), player.id)); }
      if (weapon === 'zeus') {
        const impactAt = Date.now() + Math.ceil(result.path.length / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
        game.interactionSerial += 1;
        game.delayedStrikes.push({ id: `zeus-${game.interactionSerial}`, weapon, ownerId: player.id, x: result.impact.x, y: result.impact.y, targetId: result.impact.playerId || null, impactAt, executeAt: impactAt + WEAPON_BALANCE.zeus.delayMs, radius: WEAPON_BALANCE.zeus.radius });
        interactions.push({ type: 'zeusMark', x: result.impact.x, y: result.impact.y });
      }
      if (weapon === 'droneStrike') for (let missile = 0; missile < WEAPON_BALANCE.droneStrike.missiles; missile += 1) { const bx = clamp(result.impact.x + (missile - 1) * 72, 5, WORLD.width - 5); const by = terrainY(game.terrain, bx); const strikeDamage = applyExplosion(game, bx, by, WEAPON_BALANCE.droneStrike.secondaryRadius, WEAPON_BALANCE.droneStrike.secondaryDamage, { sourcePlayerId: player.id }); awardExplosionDestruction(game, player.id, strikeDamage); interactions.push({ type: 'droneMissile', x: bx, y: by, fromY: Math.max(25, by - 360), delay: missile * .14 }); interactions.push(...activateScenarioObjects(game, bx, by, WEAPON_BALANCE.droneStrike.secondaryRadius, new Set(), player.id)); }
      if (weapon === 'teslaOrb') {
        for (const sentry of game.objects || []) if (sentry.type === 'sentry' && sentry.active && sentry.ownerId !== player.id && !areAllies(game, player, game.players.find((entry) => entry.id === sentry.ownerId)) && Math.hypot(sentry.x - result.impact.x, sentry.y - result.impact.y) <= WEAPON_BALANCE.teslaOrb.chainRadius) { sentry.disabledUntilRound = Math.max(sentry.disabledUntilRound || 0, game.roundNumber + 1); interactions.push({ type: 'sentryDisabled', id: sentry.id, x: sentry.x, y: sentry.y }); }
        const chained = game.players.filter((target) => target.alive && target.id !== player.id && activeClass(target) !== 'saboteur' && !areAllies(game, target, player) && Math.hypot(target.x - result.impact.x, target.y - result.impact.y) <= WEAPON_BALANCE.teslaOrb.chainRadius).sort((a, b) => Math.hypot(a.x - result.impact.x, a.y - result.impact.y) - Math.hypot(b.x - result.impact.x, b.y - result.impact.y)).slice(0, WEAPON_BALANCE.teslaOrb.chains);
        interactions.push({ type: 'teslaField', x: result.impact.x, y: result.impact.y, radius: WEAPON_BALANCE.teslaOrb.chainRadius });
        let from = result.impact; for (const target of chained) { const arcDamage = applyExplosion(game, target.x, target.y, 24, WEAPON_BALANCE.teslaOrb.chainDamage, { noTerrain: true, pushMultiplier: .25, sourcePlayerId: player.id, attackType: 'teslaOrb' }); awardExplosionDestruction(game, player.id, arcDamage); target.powerupBlockedTurns = Math.max(target.powerupBlockedTurns || 0, 1); target.teslaDisabledTurns = Math.max(target.teslaDisabledTurns || 0, 1); target.invisibleTurns = 0; interactions.push({ type: 'teslaChain', x: target.x, y: target.y, fromX: from.x, fromY: from.y, playerId: target.id }); from = target; }
      }
      if (weapon === 'seismicCharge') for (const direction of [-1, 1]) { const bx = clamp(result.impact.x + direction * 92, 5, WORLD.width - 5); const by = terrainY(game.terrain, bx); const waveDamage = applyExplosion(game, bx, by, WEAPON_BALANCE.seismicCharge.secondaryRadius, WEAPON_BALANCE.seismicCharge.secondaryDamage, { pushMultiplier: 1.5, sourcePlayerId: player.id }); awardExplosionDestruction(game, player.id, waveDamage); interactions.push({ type: 'seismicWave', x: bx, y: by, direction }); interactions.push(...activateScenarioObjects(game, bx, by, WEAPON_BALANCE.seismicCharge.secondaryRadius, new Set(), player.id)); }
      if (weapon === 'gravity') {
        interactions.push({ type: 'gravity', x: result.impact.x, y: result.impact.y, radius: WEAPON_BALANCE.gravity.radius, duration: WEAPON_BALANCE.gravity.durationMs });
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
      const comboModifiers = [megaMissile && 'megaMissile', bigExplosion && 'bigExplosion', ...shotModifiers, freezeIndex >= 0 && 'freeze', guidedIndex >= 0 && 'guidedBullet', teleported && 'teleport', armorPiercer && 'armorPiercer', shockwave && 'shockwave', bunkerBuster && 'bunkerBuster', bridgeKit && 'bridgeKit', molotov && 'molotov', laser && 'laser', mirror && 'mirror', equipped('extraShot') && 'extraShot'].filter(Boolean);
      results.push({ ...result, damage, radius: impactRadius, impactDamage, damageMultiplier, heavyCritical, weapon, teleport, megaMissile, bigExplosion, mirror, mirrorCopy, mirrorDelay: mirrorCopy ? .18 : 0, flyingHunter: hunter, combo: comboModifiers.length ? [...comboModifiers, weapon] : null, laser, freeze: freezeIndex >= 0, armorPiercer, shockwave, bunkerBuster, bridgeKit, noExplosion: deployMine || (deploySentry && !interceptingSentry) || laser || gravityWell || (lightningRod && !megaMissile), interactions, frozenPlayerIds, fracturedPlayerIds });
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
  recordEliminations(game);
  const fragmentPaths = results.flatMap((result) => result.interactions || []).flatMap((interaction) => interaction.fragments || []).map((fragment) => fragment.path.length); const longestPath = Math.max(...results.map((result) => result.path.length + (result.mirrorDelay || 0) * SHOT_PATH_RATE), ...fragmentPaths, 12);
  const flightEndsAt = Date.now() + Math.ceil(longestPath / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
  game.shotEndsAt = flightEndsAt;
  if (game.delayedStrikes?.length) game.shotEndsAt = Math.max(game.shotEndsAt, ...game.delayedStrikes.map((strike) => strike.executeAt + 2100));
  if (game.soapBubbles?.length) game.shotEndsAt = Math.max(game.shotEndsAt, ...game.soapBubbles.map((bubble) => bubble.executeAt + 1800));
  const zeusAftermath = results.some((result) => result.interactions?.some((interaction) => interaction.type === 'zeusMark'));
  if (zeusAftermath) game.shotEndsAt = Math.max(game.shotEndsAt, flightEndsAt + 2000);
  const remainingAnimationMs = zeusAftermath ? Math.max(2000, megaMissile ? 1000 : 0) : Math.max(2000, Math.ceil((bunkerBuster ? 4000 : megaMissile ? 2900 : weapon === 'fireworks' ? 3000 : weapon === 'gravity' ? WEAPON_BALANCE.gravity.durationMs + 250 : 1750) / room.rules.gameSpeed));
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
  const damage = fallDamage(distance, activeClass(player), Boolean(flight?.parachute));
  game.interactionSerial = (game.interactionSerial || 0) + 1;
  player.lastLanding = { serial: game.interactionSerial, x: player.x, y: player.y, speed: Math.max(0, Math.round(flight?.vy || 0)), distance, parachute: Boolean(flight?.parachute), damage };
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
      const landingPlatform = flight.vy >= 0 ? game.terrain.floatingPlatforms?.filter((platform) => platform.active && player.x >= platform.x + WORLD.tankRadius && player.x <= platform.x + platform.width - WORLD.tankRadius && previousFeet <= platform.y && player.y + WORLD.tankRadius >= platform.y).sort((a, b) => a.y - b.y)[0] : null;
      if (landingPlatform) {
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
      target.airborne = null; target.wallClinging = null; target.supportPlatformId = null; target.platformOffset = null;
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
  game.harpoonPull = { ownerId: owner.id, playerId: moving.id, targetPlayerId: target?.id || null, fromX: moving.x, fromY: moving.y, toX: destination.x, toY: destination.y, supportPlatformId: destination.supportPlatformId, platformOffset: destination.platformOffset, startedAt, endsAt: startedAt + (target ? WEAPON_BALANCE.harpoon.enemyPullMs : WEAPON_BALANCE.harpoon.pullMs), anchorX: anchor.x, anchorY: anchor.y };
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
  moving.wallClinging = null; moving.supportPlatformId = null; moving.platformOffset = null;
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
    if (!pull.targetPlayerId) { moving.supportPlatformId = pull.supportPlatformId; moving.platformOffset = pull.platformOffset; moving.lastSafeX = moving.x; moving.lastSafeY = moving.y; }
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

export function updateFireZonePhysics(game, now = Date.now()) {
  let moved = false;
  for (const zone of game.fireZones || []) {
    if (zone.source === 'superheat') continue;
    if (zone.platformId) {
      const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === zone.platformId && entry.active);
      if (platform) { zone.platformOffset ??= zone.x - platform.x; const x = platform.x + zone.platformOffset; if (x !== zone.x || zone.y !== platform.y) moved = true; zone.x = x; zone.y = platform.y; zone.physicsAt = now; zone.vy = 0; continue; }
      zone.platformId = null; zone.platformOffset = null; zone.falling = true; zone.vy = 70;
    }
    const previous = zone.physicsAt || now; const dt = Math.min(.12, Math.max(0, (now - previous) / 1000)); zone.physicsAt = now;
    const surfaces = [terrainY(game.terrain, zone.x)];
    for (const platform of game.terrain.floatingPlatforms || []) if (platform.active && zone.x >= platform.x && zone.x <= platform.x + platform.width) surfaces.push(platform.y);
    for (const object of game.objects || []) if (object.active && object.width && Math.abs(object.x - zone.x) <= object.width / 2) surfaces.push(object.groundY - object.height);
    const support = Math.min(...surfaces.filter((y) => Number.isFinite(y) && y >= zone.y - 6));
    if (Number.isFinite(support) && Math.abs(support - zone.y) <= 6 && !zone.falling) { zone.y = support; continue; }
    zone.falling = true; zone.vy = Math.min(750, (zone.vy || 0) + 550 * dt);
    const nextY = zone.y + zone.vy * dt;
    if (Number.isFinite(support) && nextY >= support) { zone.y = support; zone.vy = 0; zone.falling = false; }
    else zone.y = nextY;
    if (zone.y >= game.lavaLevel) zone.turnsLeft = 0;
    moved ||= Math.abs(nextY - zone.y) > .1 || zone.falling;
  }
  game.fireZones = (game.fireZones || []).filter((zone) => zone.turnsLeft > 0);
  return moved;
}

function applyFireZones(game) {
  if (!(game.fireZones || []).length) return;
  const now = Date.now();
  updateFireZonePhysics(game, now);
  let structureChanged = false;
  for (const zone of game.fireZones || []) {
    if (zone.ignitesAt && now < zone.ignitesAt) continue;
    if (zone.lastAppliedRound === game.roundNumber) continue;
    const owner = game.players.find((player) => player.id === zone.ownerId);
    for (const target of game.players) if (target.alive && (zone.source !== 'superheat' || target.id !== owner?.id) && (!owner || target.id === owner.id || !protectedAlly(game, target, owner)) && (zone.source === 'superheat' ? Math.hypot(target.x - zone.x, target.y - zone.y) <= zone.radius : Math.abs(target.x - zone.x) <= zone.radius && Math.abs(target.y - zone.y) <= 76)) { const damage = directDamage(owner, target, 25, true); target.health = Math.max(0, target.health - damage); target.alive = target.health > 0; target.lastDamageRound = game.roundNumber; target.lastFireHit = { round: game.roundNumber, damage, x: target.x, y: target.y, zoneId: zone.id }; if (owner && target.id !== owner.id) { target.lastDamageSourceId = owner.id; target.lastDamageTurn = game.turnNumber; reflectDirectDamage(game, target, owner, damage); } }
    for (const object of game.objects || []) if (object.active && (zone.source === 'superheat' ? Math.hypot(object.x - zone.x, (object.groundY ?? object.y) - (object.height || 0) / 2 - zone.y) <= zone.radius + (object.height || 0) / 2 : Math.abs(object.x - zone.x) <= zone.radius && Math.abs((object.groundY ?? object.y) - zone.y) <= Math.max(95, object.height || 0))) { object.durability = Math.max(0, (object.durability ?? 2) - 1); object.burningUntilRound = game.roundNumber + zone.turnsLeft; if (!object.durability) { object.active = false; structureChanged = true; if (owner) awardDestruction(game, owner.id, object.type); } }
    for (const surface of game.terrain.floatingPlatforms || []) if (surface.active && (zone.source === 'superheat' ? Math.hypot(clamp(zone.x, surface.x, surface.x + surface.width) - zone.x, surface.y - zone.y) <= zone.radius : surface.x <= zone.x + zone.radius && surface.x + surface.width >= zone.x - zone.radius && Math.abs(surface.y - zone.y) < 90)) { surface.durability = Math.max(0, surface.durability - 22); surface.burningUntilRound = game.roundNumber + zone.turnsLeft; if (!surface.durability) { surface.active = false; structureChanged = true; } }
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
    game.turnIndex = game.rouletteWinnerIndex ?? game.turnIndex; game.phase = 'playing'; game.openingRestrictionsActive = true; game.roundNumber = 1; game.roundParticipants = game.players.filter((player) => player.alive).map((player) => player.id); game.roundCompleted = []; applyRoundClassPassives(game); const starter = currentPlayer(game); starter.turnsPlayed = 1; game.actions = { movesLeft: starter.classType === 'ninja' ? 3 : 2, attackAvailable: true }; applyTurnClassPassives(game, starter); collectPowerups(game, starter); game.turnEndsAt = now + room.rules.turnSeconds * 1000 / room.rules.gameSpeed; game.botActAt = now + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed; return { changed: true };
  }
  if (game.phase !== 'playing') return null;
  const fireMoved = updateFireZonePhysics(game, now);
  const lavaVictims = game.players.filter((player) => player.alive && Number.isFinite(player.y) && player.y + WORLD.tankRadius >= game.lavaLevel);
  if (lavaVictims.length) { for (const player of lavaVictims) { player.health = 0; player.alive = false; player.airborne = null; } recordEliminations(game); evaluateVictory(game); return { changed: true }; }
  if (game.pendingArenaEvent) {
    if (now < game.pendingArenaEvent.executeAt) return null;
    resolveArenaEvent(game); for (const player of game.players) if (activeClass(player) === 'backpacker') collectPowerups(game, player); return { changed: true };
  }
  let rewardsChanged = false;
  for (const player of game.players) if (player.rewardOffer && now >= player.rewardOffer.expiresAt) { autoClaimReward(game, player); rewardsChanged = true; }
  if (rewardsChanged) return { changed: true };
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
    if (game.pendingShot?.weapon === 'soapBomb' && game.players.some((entry) => entry.alive && entry.airborne?.fromSoapBubble)) {
      game.shotEndsAt = Math.max(game.shotEndsAt, now + 220);
      game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, game.shotEndsAt);
    }
    if (Date.now() < game.shotEndsAt) return airborneChanged || bubbleChanged || harpoonChanged || fireMoved ? { changed: true } : null;
    finishPendingShot(room); for (const player of game.players) if (activeClass(player) === 'backpacker') collectPowerups(game, player); return { changed: true };
  }
  if (airborneChanged || bubbleChanged || harpoonChanged) return { changed: true };
  if (game.harpoonPull) return null;
  if (game.arenaEventReadyAt) { if (now < game.arenaEventReadyAt) return null; game.arenaEventReadyAt = null; const event = applyArenaPulse(room); if (!event) game.arenaWarningUntil = null; return { changed: true }; }
  if (Date.now() >= game.turnEndsAt) { nextTurn(room); return { changed: true }; }
  const bot = currentPlayer(game);
  if (bot?.isBot && (bot.frozenTurns > 0 || (!game.actions.attackAvailable && ((bot.fuel || 0) <= 0 || ![-1, 1].some((direction) => { const path = walkPath(game.terrain, bot.teslaDisabledTurns > 0 ? { ...bot, spiderClimb: false } : bot, direction, Math.min(38, bot.fuel || 0)); return path.safe && path.moved; }))))) { nextTurn(room); return { changed: true }; }
  if (!bot?.isBot || Date.now() < game.botActAt) return fireMoved ? { changed: true } : null;
  if (backpackerRerollAvailable(game, bot)) { rerollBackpackerArsenal(room, bot.id); return { changed: true }; }
  if (!(game.openingRestrictionsActive && game.roundNumber === 1) && game.actions.attackAvailable && ninjaFatalTarget(game, bot)) { ninjaFatal(room, bot.id, ninjaFatalTarget(game, bot).id); return { changed: true }; }
  if (game.harpoonAnchor?.ownerId === bot.id) { try { activateHarpoon(room, bot.id); } catch { nextTurn(room); } return { changed: true }; }
  const targets = game.players.filter((player) => player.alive && player.id !== bot.id && player.invisibleTurns <= 0 && !areAllies(game, player, bot));
  if (!targets.length) {
    if (['hill', 'teamHill'].includes(game.mode) && game.hill && (bot.fuel || 0) > 0 && Math.abs(bot.x - game.hill.x) > game.hill.radius * .7) {
      const direction = game.hill.x < bot.x ? -1 : 1;
      if (safeGroundAt(game.terrain, bot.x + direction * 38)) { try { movePlayer(room, bot.id, direction, null, { continuous: true, bot: true }); game.botActAt = Date.now() + botDelay(room.rules.botDifficulty); return { changed: true }; } catch {} }
    }
    nextTurn(room); return { changed: true };
  }
  const target = chooseBotTarget(game, bot, targets);
  const difficulty = room.rules.botDifficulty;
  const random = seededRandom(`${game.seed}-bot-${game.turnNumber}-${bot.id}-${game.actions.movesLeft}`);
  const hillApproach = ['hill', 'teamHill'].includes(game.mode) && game.hill && Math.abs(game.hill.x - bot.x) > game.hill.radius * .7;
  let direction = (hillApproach ? game.hill.x : target.x) < bot.x ? -1 : 1;
  let shouldMove = hillApproach || (difficulty === 'easy' ? random() > .68 : Math.abs(target.x - bot.x) > 180);
  if (bot.teslaDisabledTurns > 0) { if ((bot.fuel || 0) > 0 && safeGroundAt(game.terrain, bot.x + direction * 38)) { try { movePlayer(room, bot.id, direction, null, { continuous: true, bot: true }); game.botActAt = Date.now() + botDelay(difficulty); return { changed: true }; } catch {} } nextTurn(room); return { changed: true }; }
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
    game.botActAt = Date.now() + Math.round(botDelay(difficulty) * .58);
    return { changed: true };
  }
  const useLaser = !(game.openingRestrictionsActive && game.roundNumber === 1) && bot.inventory?.includes('laser') && bot.powerupBlockedTurns <= 0 && Math.abs(target.x - bot.x) <= 1350;
  if (useLaser) { bot.selectedPowerups = [...new Set([...(bot.selectedPowerups || []), 'laser'])]; bot.selectedPowerup = 'laser'; }
  const aim = useLaser ? { direction: target.x < bot.x ? -1 : 1, angle: clamp(Math.atan2(bot.y - target.y, Math.abs(target.x - bot.x)) * 180 / Math.PI, -85, 85), power: 580 } : chooseBotShot(room, bot, target, difficulty);
  bot.facing = aim.direction;
  const weapon = chooseBotWeapon(game, bot, target, difficulty, random);
  if (weapon === 'superheat') { useArsenal(room, bot.id, { type: 'superheat' }); return { changed: true }; }
  const results = fire(room, bot.id, { angle: aim.angle, power: aim.power, direction: aim.direction, weapon });
  return { changed: true, shot: { shooterId: bot.id, results } };
}

function resolveDelayedStrike(game, strike) {
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
  if (pending?.weapon === 'harpoon') {
    if (!game.harpoonAnchor) { if (shooter) { shooter.ammo.harpoon = (shooter.ammo.harpoon || 0) + 1; delete shooter.arsenalLastUsed?.harpoon; } nextTurn(room); return; }
    game.actions.attackAvailable = true;
    game.turnEndsAt = Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
    game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed;
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
  game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed;
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
      mine.y = platform.y - 3;
    }
  }
  for (const mine of game.mines || []) {
    if (!mine.active || !mine.supportPlatformId) continue;
    if (game.terrain.floatingPlatforms.some((platform) => platform.id === mine.supportPlatformId && platform.active)) continue;
    mine.supportPlatformId = null; mine.platformOffset = null;
    const ground = terrainY(game.terrain, mine.x);
    if (ground > WORLD.height) mine.active = false;
    else mine.y = ground - 3;
  }
}

function arenaGroundX(game, random, minimumPlayerDistance = 90) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = Math.round(70 + random() * (WORLD.width - 140));
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
    const x = Math.round(clamp(target.x + (random() - .5) * scatter * 2, 35, WORLD.width - 35));
    if (terrainY(game.terrain, x) <= WORLD.height) return x;
  }
  return arenaGroundX(game, random, minimumPlayerDistance);
}

function lavaRivers(terrain) {
  const rivers = []; let start = null;
  for (let x = 24; x < WORLD.width - 24; x += 1) {
    const open = terrainY(terrain, x) >= WORLD.height - 8;
    if (open && start === null) start = x;
    if ((!open || x === WORLD.width - 25) && start !== null) {
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

function eventTypeForTurn(game, turnNumber, random) {
  const allowedEvents = game.enabledEvents || [];
  if (!allowedEvents.length) return null;
  let type = allowedEvents.includes('supply') ? 'supply' : allowedEvents[0];
  if (turnNumber >= 9) {
    const longEvents = ['bombardment', 'lightning', 'supply', 'tectonic', 'luckyWinds', 'collapse', 'eruption', 'gale'].filter((entry) => allowedEvents.includes(entry));
    type = longEvents.length ? longEvents[Math.floor((turnNumber - 9) / 3) % longEvents.length] : allowedEvents[0];
    const biomeEvent = BIOMES[game.terrain.type]?.event;
    if (turnNumber % 12 === 0 && allowedEvents.includes(biomeEvent)) type = biomeEvent;
    if (type === 'eruption' && !lavaRivers(game.terrain).length) type = allowedEvents.includes('bombardment') ? 'bombardment' : allowedEvents[0];
  } else if (turnNumber % 6 === 0 && allowedEvents.includes('quake')) type = 'quake';
  if (game.players.some((player) => player.alive && activeClass(player) === 'meteorologist') && !['supply', 'luckyWinds'].includes(type) && random() < CLASS_BALANCE.meteorologistPositiveChance) type = allowedEvents.includes('luckyWinds') ? 'luckyWinds' : allowedEvents.includes('supply') ? 'supply' : type;
  return type;
}

export function applyArenaPulse(room) {
  const game = room.game;
  if (!game || game.phase !== 'playing' || game.turnNumber % 3 !== 0) return null;
  if (!game.enabledEvents?.length) return null;
  const random = seededRandom(`${game.seed}-arena-${game.turnNumber}`);
  const roundProgress = clamp((game.roundNumber - 1) / Math.max(1, game.roundLimit - 1), 0, 1); const intensity = 1 + roundProgress * 1.45;
  const drops = []; const impacts = []; const allowedEvents = game.enabledEvents; let rivers = [];
  const eventType = eventTypeForTurn(game, game.turnNumber, random);
  if (eventType === 'eruption') rivers = lavaRivers(game.terrain);
  const weatherPlayers = game.players.filter((player) => player.alive && activeClass(player) === 'meteorologist');
  const positiveAnchor = weatherPlayers.length ? weatherPlayers[Math.floor(random() * weatherPlayers.length)] : null;

  if (eventType === 'supply') {
    const pool = COLLECTIBLE_ITEMS.filter((type) => game.enabledPowerups.includes(type)); const dropCount = pool.length ? (game.players.length >= 5 ? 5 : 4) + Math.floor(roundProgress * 3) : 0; const hasLootbox = dropCount > 0 && random() * 100 < SUPPLY_LOOTBOX_CHANCE + Math.round(roundProgress * 17); const lootboxIndex = hasLootbox ? Math.floor(random() * dropCount) : -1;
    for (let index = 0; index < dropCount; index += 1) {
      const x = positiveAnchor && random() < CLASS_BALANCE.meteorologistAnchorChance ? clamp(positiveAnchor.x + (random() - .5) * 520, 55, WORLD.width - 55) : arenaGroundX(game, random, 55); const type = index === lootboxIndex ? 'lootbox' : pool[Math.floor(random() * pool.length)];
      drops.push({ id: `airdrop-${game.seed}-${game.turnNumber}-${index}`, type, x, y: terrainY(game.terrain, x) - 12, buried: false, loot: type === 'lootbox' ? randomLootboxContents(random, 3, pool) : null, releaseProgress: .24 + index * (.52 / Math.max(1, dropCount - 1)) });
    }
  } else if (eventType === 'eruption') {
    const lavaRise = Math.round(42 + roundProgress * 58); const targetLavaLevel = Math.max(500, game.lavaLevel - lavaRise);
    rivers = rivers.map((river, index) => ({ ...river, surfaceY: targetLavaLevel, previousSurfaceY: game.lavaLevel, delay: index * .08 }));
    impacts.push(...eruptionFireballs(game, rivers, random));
  } else if (eventType === 'gale') {
    impacts.push({ x: WORLD.width / 2, y: WORLD.height / 2, radius: WORLD.width / 2, kind: 'gale', damage: 0 });
  } else {
    const baseCount = eventType === 'bombardment' ? 6 : eventType === 'lightning' ? 4 : eventType === 'tectonic' ? 3 : eventType === 'luckyWinds' ? 3 : eventType === 'quake' ? 2 : 7; const count = baseCount + Math.floor(roundProgress * (eventType === 'bombardment' || eventType === 'collapse' ? 5 : 3));
    for (let index = 0; index < count; index += 1) {
      const destructive = ['lightning', 'bombardment', 'collapse', 'quake', 'tectonic'].includes(eventType); const rods = destructive ? (game.objects || []).filter((entry) => entry.type === 'lightningRod' && entry.active) : []; const rod = rods.length ? rods[Math.floor(random() * rods.length)] : null; const x = rod ? clamp(rod.x + (random() - .5) * 100, 55, WORLD.width - 55) : eventType === 'luckyWinds' && positiveAnchor && random() < CLASS_BALANCE.meteorologistAnchorChance ? clamp(positiveAnchor.x + (random() - .5) * 380, 120, WORLD.width - 120) : eventType === 'lightning' ? arenaImpactX(game, random, .82, 58) : eventType === 'bombardment' ? arenaImpactX(game, random, .48, 130) : eventType === 'luckyWinds' ? arenaImpactX(game, random, .85, 120) : arenaGroundX(game, random, eventType === 'tectonic' ? 250 : 110);
      const surfacePlatform = ['lightning', 'bombardment', 'collapse'].includes(eventType) ? (game.terrain.floatingPlatforms || []).filter((platform) => platform.active && x >= platform.x && x <= platform.x + platform.width).sort((a, b) => a.y - b.y)[0] : null;
      const y = surfacePlatform?.y ?? terrainY(game.terrain, x);
      const radius = Math.round((eventType === 'bombardment' ? 32 + index * 9 : eventType === 'lightning' ? 74 : eventType === 'tectonic' ? 185 + Math.round(random() * 70) : eventType === 'luckyWinds' ? 270 + Math.round(random() * 80) : eventType === 'collapse' ? 44 : 22 + Math.round(random() * 9)) * (eventType === 'luckyWinds' ? 1 : 1 + roundProgress * .42));
      impacts.push({ x, y, platformId: surfacePlatform?.id || null, radius, kind: eventType, damage: Math.round((eventType === 'bombardment' ? 24 + index * 7 : eventType === 'lightning' ? 24 : 8) * intensity), heal: eventType === 'luckyWinds' ? 40 : 0, delay: eventType === 'bombardment' ? index * .075 : index * .04, tectonicMode: eventType === 'tectonic' ? ['mountain', 'rise', 'sink'][index % 3] : null, magnitude: eventType === 'tectonic' ? Math.round((90 + random() * 75) * intensity) : null });
    }
  }
  const labels = { supply: `SUPRIMENTOS AÉREOS • ${drops.length} CARGAS`, quake: 'ABALO DA ARENA!', bombardment: 'BOMBARDEIO PROGRESSIVO!', lightning: 'TEMPESTADE ELÉTRICA!', collapse: 'COLAPSO DO CENÁRIO!', tectonic: 'EVENTO TECTÔNICO!', luckyWinds: 'VENTOS DE SORTE!', gale: 'VENDAVAL!', eruption: 'ERUPÇÃO VULCÂNICA!' };
  const startedAt = Date.now(); const warningMs = eventType === 'supply' ? GAME_TIMING.supplyFlyoverMs : GAME_TIMING.arenaWarningMs;
  const event = { id: `arena-${game.seed}-${game.turnNumber}`, turn: game.turnNumber, round: game.roundNumber, intensity, type: eventType, drops, impacts, windDirection: eventType === 'gale' ? (random() < .5 ? -1 : 1) : undefined, windForce: eventType === 'gale' ? Math.round(110 + roundProgress * 170) : undefined, actionDuration: eventType === 'gale' ? 3000 : undefined, lavaRivers: eventType === 'eruption' ? rivers : undefined, label: `${labels[eventType]} • NÍVEL ${Math.ceil(intensity)}`, warning: true, warningStartedAt: startedAt, executeAt: startedAt + warningMs, lootboxChance: eventType === 'supply' ? SUPPLY_LOOTBOX_CHANCE + Math.round(roundProgress * 17) : undefined, helicopter: eventType === 'supply' ? { direction: random() < .5 ? 1 : -1, altitude: 115 } : undefined };
  game.arenaWarningUntil = event.executeAt; game.pendingArenaEvent = { eventId: event.id, executeAt: event.executeAt };
  game.events.push(event); if (game.events.length > 8) game.events.shift(); return event;
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
  event.interactions = [];
  for (const impact of event.impacts || []) {
    if (event.type === 'tectonic') applyTectonicShift(game.terrain, impact);
    else if (event.type === 'quake') applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage, { eventType: event.type });
    else if (event.type === 'lightning') {
      const nearby = game.players.filter((player) => player.alive && player.classType !== 'saboteur' && Math.hypot(player.x - impact.x, player.y - impact.y) <= impact.radius * 1.55);
      for (const player of nearby) player.powerupBlockedTurns = Math.max(player.powerupBlockedTurns || 0, 1);
      event.blockedPlayerIds ||= []; event.blockedPlayerIds.push(...nearby.map((player) => player.id));
      applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage, { eventType: event.type });
    } else if (!['luckyWinds', 'gale'].includes(event.type)) {
      applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage, { eventType: event.type });
      if (event.type === 'eruption') { game.interactionSerial += 1; const impactDuration = 3100; game.fireZones.push({ id: `eruption-fire-${game.interactionSerial}`, x: impact.x, y: impact.y, radius: 82, turnsLeft: 3, ownerId: null, source: 'eruption', platformId: impact.platformId || null, ignitesAt: Date.now() + Math.round(((impact.delay || 0) + (impact.flightDuration || .32)) * impactDuration) }); }
    }
    if (!['supply', 'luckyWinds', 'gale'].includes(event.type)) {
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
  if (event.type === 'luckyWinds') {
    const healed = game.players.filter((player) => player.alive && (event.impacts || []).some((zone) => Math.hypot(player.x - zone.x, player.y - zone.y) <= zone.radius));
    for (const player of healed) player.health = Math.min(player.maxHealth, player.health + 40);
    event.healedPlayerIds = healed.map((player) => player.id);
  }
  if (event.type === 'tectonic') {
    const random = seededRandom(`${event.id}-tank-shift`); event.tectonicMoves = [];
    for (const player of game.players) {
      if (!player.alive || player.airborne) continue; const fromX = player.x; const shift = (random() < .5 ? -1 : 1) * (16 + Math.round(random() * 22));
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
    game.lastBattleAnimationUntil = Math.max(game.lastBattleAnimationUntil || 0, Date.now() + 3000);
  }
  settleScenarioObjects(game); settlePlayers(game); recordEliminations(game); const pausedFor = Math.max(0, Date.now() - (event.warningStartedAt || Date.now())) + (event.type === 'gale' ? 3000 : 0); if (game.turnEndsAt) game.turnEndsAt += pausedFor; if (game.botActAt) game.botActAt += pausedFor; event.id += '-impact'; event.warning = false; event.label = `${event.label} • ${event.type === 'supply' ? 'CARGA ENTREGUE' : event.type === 'luckyWinds' ? 'CURA APLICADA' : 'IMPACTO'}`; game.pendingArenaEvent = null; game.arenaWarningUntil = null; evaluateVictory(game);
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
    const result = simulateShot({ terrain: room.game.terrain, players: room.game.players, powerups: room.game.powerups, ignorePlayerId: bot.id, x: bot.x, y: bot.y, angle, power, gravity: room.rules.gravity, wind: room.game.wind, direction });
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
  if (ready('superheat') && Math.hypot(target.x - bot.x, target.y - bot.y) <= 330 && random() > .55) return 'superheat';
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
    mapType: ['random', 'flat', 'hills', 'highlands', 'islands', 'canyon', 'platforms'].includes(rules.mapType) ? rules.mapType : 'random',
    seed: rules.seed ? String(rules.seed).slice(0, 30) : '',
  };
}
