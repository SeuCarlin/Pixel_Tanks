import { ARSENAL_DEFS, CLASS_BALANCE, CLASS_DEFS, CLUSTER_CAPSULE_SPEED, EVENT_DEFS, MAP_STRUCTURE_BALANCE, WORLD, clamp, POWERUP_DEFS, SHOT_PATH_RATE, VECTOR_FLIGHT_RATE, WEAPON_BALANCE } from '/shared/constants.js';
import { driveStats } from '/shared/movement.js';
import { blinkLanding, jumpTargetTrajectory, launcherDestination, movementDistance, specialMovePath, spiderLeapTarget, walkPath } from '/shared/movement.js';
import { BIOMES } from '/shared/biomes.js';
import { selectCameraPlayer, turnCameraZoom } from './camera.js';
import { drawProjectileModifiers, drawProjectilePixelArt, drawProjectileSprite, projectileSpriteSheet, projectileTrailLength, projectileVisual } from './visual-fx.js';
import { projectileStructureAt } from '/shared/projectile-obstacles.js';
import { tankMotionState, TANK_STATE } from '/shared/tank-states.js';
import { ninjaFatalPath } from '/shared/class-actions.js';
import { changedTerrainColumns, interpolateDrillTerrain } from './drill-terrain.js';
import { shotLaunchMuzzle, shotLaunchStyle } from './shot-launch.js';
import { airPocketCurrents, visibleWaterColumns, waterDepthAt, waterSurfaceAt } from '/shared/flood.js';
import { weatherVisualState } from '/shared/climate.js';
import { deflectProjectile } from '/shared/wind-vortex.js';
import { playableWidth } from '/shared/map-layout.js';
import { barrelRadians, easeBarrelAngle } from '/shared/tank-barrel.js';

const VIEW = { width: 1280, height: 720 };
const BLOCK = 5;
const TANK_BLOCK = 3;
const MAX_PARTICLES = 1350;
const MAX_AIM_RANGE = 580;
const MIN_ZOOM = VIEW.width / WORLD.width;
const SOIL = ['#65755a', '#526452', '#43564d', '#35484a', '#293b46', '#20303d'];
const FIRE = ['#fff2a6', '#ffd35a', '#ff9147', '#ef5b3f', '#b73538'];
const ELEMENT_VISUALS = Object.freeze({
  elementalFire: { color: '#ff8248', label: 'FOGO' }, elementalWater: { color: '#70dcff', label: 'ÁGUA' },
  elementalWind: { color: '#9cefb7', label: 'VENTO' }, elementalEarth: { color: '#d9b27b', label: 'TERRA' },
  elementalIce: { color: '#b0eaff', label: 'GELO' },
});
const IMPACT_SIGNATURES = Object.freeze({
  zeus: 'electric', teslaOrb: 'electric', lightningRod: 'electric', verticalStrike: 'electric',
  freeze: 'frost', gravity: 'gravity', fireworks: 'fireworks', seismicCharge: 'seismic',
  megaCannon: 'electric', markerBomb: 'seismic', armorPiercer: 'piercing', shockwave: 'shock', bigExplosion: 'expander', waterCannon: 'water', waterMine: 'water',
});
const collectibleInfo = (type) => POWERUP_DEFS[type] || ARSENAL_DEFS[type] || POWERUP_DEFS.heal;

function colorForBlock(x, y, surface, biome = 'flat') {
  const palette = BIOMES[biome]?.soil || SOIL;
  const depth = clamp(Math.floor((y - surface) / 38), 0, palette.length - 1);
  const variation = ((x * 13 + y * 7) % 17) < 3 ? 1 : 0;
  return palette[clamp(depth + variation, 0, palette.length - 1)];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.projectileAtlas = new Image(); this.projectileAtlas.src = '/assets/projectile-atlas-v1.png';
    this.specialProjectileAtlas = new Image(); this.specialProjectileAtlas.src = '/assets/special-projectile-atlas-v1.png';
    this.game = null; this.playerId = null; this.terrainHeights = null; this.pendingTerrain = null; this.drillTerrainReveal = null; this.pendingPlayers = null; this.visualPowerups = []; this.pendingPowerups = null; this.visualPlatforms = []; this.pendingPlatforms = null; this.visualObjects = []; this.visualGraves = []; this.pendingObjects = null; this.pendingGraves = null;
    this.terrainCanvas = document.createElement('canvas'); this.terrainCanvas.width = WORLD.width; this.terrainCanvas.height = WORLD.height + 100;
    this.aim = { angle: 45, power: 275, direction: 1, visible: false }; this.aimPreviewImpact = null; this.aimDragCamera = null; this.aimAssistTargetId = null; this.aimAssistError = null; this.verticalTarget = null; this.spiderTarget = null; this.jumpTarget = null; this.armoredDashTarget = null; this.ninjaFatalPoint = null; this.blinkTarget = null; this.blinkMode = null; this.specialistSelection = null; this.specialistTarget = null; this.movementMode = 'standard'; this.movementPreviewCache = null;
    this.camera = { x: 0, y: 40, zoom: 1.12 }; this.userZoom = 1.12; this.cameraMode = 'dynamic'; this.fixedCameraInitialized = false; this.manualMapUntil = 0; this.turnFocus = null; this.eventCamera = null; this.eventReturnCamera = null; this.actionCamera = null; this.actionFocusPoints = []; this.actionReturnCamera = null; this.cameraReturn = null; this.serverClockOffset = 0; this.lastRenderErrorAt = -Infinity; this.visualPlayers = new Map(); this.shots = []; this.muzzleBursts = []; this.onShotImpact = null; this.onMeteorImpact = null; this.onTankDestroyed = null; this.onHunterDive = null; this.onBomberDetonation = null; this.pendingBomberDetonations = []; this.particles = []; this.floaters = []; this.leafShed = new Map(); this.lastWindLeafAt = 0; this.structureAnimations = []; this.drillAnimations = []; this.rodArcs = []; this.classPulses = []; this.heatPulses = []; this.saboteurPulses = []; this.sentryBursts = []; this.ninjaSlashes = []; this.pickupMagnets = []; this.lastMagnetSerial = 0; this.fireworkAnimations = []; this.meteorAnimations = []; this.zeusAnimations = []; this.gravityAnimations = []; this.impactEchoes = []; this.megaBeam = null; this.mushroomClouds = []; this.skullClouds = []; this.pendingPlatformDebris = []; this.pendingPowerupReveals = []; this.completionHandlers = []; this.tankAnimationEndsAt = 0; this.explosionAnimationEndsAt = 0; this.lavaAnimation = null; this.arenaVisual = null; this.impactFlash = null; this.shake = 0; this.lastTime = performance.now();
    this.tornadoSpawned = new Set(); this.weatherCloudVisuals = new Map(); this.iceShatters = []; this.onPhysicalEffect = null;
    this.viewportObserver = new ResizeObserver(() => this.resizeViewport()); this.viewportObserver.observe(canvas.parentElement);
    requestAnimationFrame(() => this.resizeViewport());
    requestAnimationFrame((time) => this.loop(time));
  }

  resizeViewport() {
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    if (bounds.width < 20 || bounds.height < 20) return;
    const height = Math.round(VIEW.width * bounds.height / bounds.width);
    if (height === VIEW.height && this.canvas.height === height) return;
    const oldHeight = VIEW.height; VIEW.height = height; this.canvas.width = VIEW.width; this.canvas.height = height; this.ctx.imageSmoothingEnabled = false;
    if (this.cameraMode === 'fixed') { this.camera.y += (oldHeight - height) / (2 * this.camera.zoom); this.clampCamera(); }
  }

  setPlayer(id) { this.playerId = id; }
  setMovementMode(mode) { if (this.movementMode !== mode) { this.movementMode = mode; this.movementPreviewCache = null; if (mode !== 'spider') this.spiderTarget = null; if (mode !== 'jump') this.jumpTarget = null; if (mode !== 'armoredDash') this.armoredDashTarget = null; } }
  setArmoredDashTarget(clientX, clientY) { this.armoredDashTarget = this.screenToWorld(clientX, clientY); return this.armoredDashDirection(); }
  armoredDashDirection() { const player = this.game?.players.find((entry) => entry.id === this.playerId); return player && this.armoredDashTarget ? (this.armoredDashTarget.x < player.x ? -1 : 1) : this.aim.direction; }
  setSpiderTarget(clientX, clientY) { this.spiderTarget = this.screenToWorld(clientX, clientY); return this.spiderLeapPreview(this.spiderTarget); }
  setJumpTarget(clientX, clientY) { this.jumpTarget = this.screenToWorld(clientX, clientY); return this.jumpPreview(); }
  jumpPreview(target = this.jumpTarget) { const player = this.game?.players.find((entry) => entry.id === this.playerId); return player && target ? jumpTargetTrajectory(this.game.terrain, player, target.x, target.y, this.game.gravity) : null; }
  setNinjaFatalTarget(clientX, clientY) { this.ninjaFatalPoint = clientX == null ? null : this.screenToWorld(clientX, clientY); const player = this.game?.players.find((entry) => entry.id === this.playerId); return this.ninjaFatalPoint && player ? ninjaFatalPath(this.game, player, null, this.ninjaFatalPoint) : null; }
  setBlinkMode(mode) { if (this.blinkMode !== mode) { this.blinkMode = mode; this.blinkTarget = null; } }
  setBlinkTarget(clientX, clientY) { this.blinkTarget = this.screenToWorld(clientX, clientY); return this.blinkPreview(); }
  blinkPreview(target = this.blinkTarget) {
    const player = this.game?.players.find((entry) => entry.id === this.playerId);
    if (!player || !target || !this.blinkMode) return null;
    return blinkLanding(this.game.terrain, this.game.players, player, target.x, this.blinkMode === 'teleport' ? 580 : 270, this.game.objects, target.y);
  }
  spiderLeapPreview(target = this.spiderTarget) {
    const player = this.game?.players.find((entry) => entry.id === this.playerId);
    if (!player || !target) return null;
    const support = player.supportPlatformId && this.game.terrain.floatingPlatforms?.find((platform) => platform.id === player.supportPlatformId && platform.active);
    const actor = support ? { ...player, x: this.platformX(support) + player.platformOffset, y: support.y - WORLD.tankRadius } : player;
    const terrain = { ...this.game.terrain, floatingPlatforms: this.game.terrain.floatingPlatforms.map((platform) => ({ ...platform, x: this.platformX(platform) })) };
    return spiderLeapTarget(terrain, actor, target.x, target.y, this.game.objects);
  }
  setAim(aim) { this.aim = { ...this.aim, ...aim, visible: true }; }
  setRemoteAim({ playerId, angle, direction }) { const player = this.visualPlayers.get(playerId); if (!player || !Number.isFinite(angle)) return; player.aimAngle = angle; player.aimDirection = direction < 0 ? -1 : 1; const statePlayer = this.game?.players.find((entry) => entry.id === playerId); if (statePlayer) { statePlayer.aimAngle = player.aimAngle; statePlayer.aimDirection = player.aimDirection; } }
  beginAimDrag() { this.aimDragCamera = { until: Infinity }; }
  endAimDrag() { if (this.aimDragCamera) this.aimDragCamera.until = performance.now() + 1700; }
  shotDuration(event) { return Math.max(...(event?.results || []).map((shot) => shot.waterCannon ? (shot.durationMs || WEAPON_BALANCE.waterCannon.durationMs) / 1000 : Math.max(1, shot.path.length - (event?.replaceVertical ? shot.activationIndex || 0 : 0)) / (SHOT_PATH_RATE * (this.game?.speed || 1) * (shot.canActivateCluster ? CLUSTER_CAPSULE_SPEED : shot.canActivateVertical ? VECTOR_FLIGHT_RATE : 1)) + (shot.mirrorDelay || 0)), .3); }
  hasAwaitingVerticalShot() { return this.shots.some((shot) => shot.weapon === 'verticalStrike' && shot.canActivateVertical && !shot.activationRequested && this.shotIndex(shot, performance.now()) < shot.activationIndex); }
  verticalTargetForActivation() { const shot = this.shots.find((entry) => entry.weapon === 'verticalStrike' && entry.canActivateVertical && !entry.activationRequested); const point = shot?.path[Math.max(0, this.shotIndex(shot, performance.now()))]; return this.verticalTarget || (point ? { x: clamp(point.x + this.aim.direction * 320, 0, WORLD.width), y: clamp(point.y + 150, 0, WORLD.height) } : null); }
  setVerticalTarget(clientX, clientY) { this.verticalTarget = this.screenToWorld(clientX, clientY); }
  activateVerticalShot() { const shot = this.shots.find((entry) => entry.weapon === 'verticalStrike' && entry.canActivateVertical && !entry.activationRequested && this.shotIndex(entry, performance.now()) < entry.activationIndex); if (!shot) return null; shot.activationRequested = true; return shot.verticalToken; }
  hasAwaitingClusterShot() { return this.shots.some((shot) => shot.weapon === 'cluster' && shot.canActivateCluster && !shot.activationRequested && this.shotIndex(shot, performance.now()) > 0 && this.shotIndex(shot, performance.now()) < shot.path.length - 1); }
  activateClusterShot() { const shot = this.shots.find((entry) => entry.weapon === 'cluster' && entry.canActivateCluster && !entry.activationRequested && this.shotIndex(entry, performance.now()) > 0 && this.shotIndex(entry, performance.now()) < entry.path.length - 1); if (!shot) return null; shot.activationRequested = true; return shot.clusterToken; }
  hasAwaitingFireworksShot() { return this.shots.some((shot) => shot.weapon === 'fireworks' && shot.canActivateFireworks && !shot.activationRequested && this.shotIndex(shot, performance.now()) > 0 && this.shotIndex(shot, performance.now()) < shot.path.length - 1); }
  activateFireworksShot() { const shot = this.shots.find((entry) => entry.weapon === 'fireworks' && entry.canActivateFireworks && !entry.activationRequested && this.shotIndex(entry, performance.now()) > 0 && this.shotIndex(entry, performance.now()) < entry.path.length - 1); if (!shot) return null; shot.activationRequested = true; return shot.fireworksToken; }
  focusOwnPlayer() { const player = this.visualPlayers.get(this.playerId); if (!player || !player.alive || player.hidden) return false; const position = this.renderPosition(player); this.manualMapUntil = 0; this.eventCamera = null; this.actionCamera = null; this.cameraReturn = null; this.actionReturnCamera = null; this.camera.zoom = this.userZoom; this.camera.x = position.x - VIEW.width / (2 * this.camera.zoom); this.camera.y = this.cameraYFor(position.y, this.camera.zoom, .64); this.clampCamera(); if (this.cameraMode !== 'fixed') this.turnFocus = { playerId: this.playerId, acquired: performance.now() }; return true; }
  whenBattleAnimationsComplete(callback) { this.completionHandlers.push(callback); this.flushCompletionHandlers(); }
  battleAnimationsComplete() { return !this.shots.some((shot) => !shot.exploded) && !this.meteorAnimations.some((meteor) => !meteor.impacted) && !this.pendingBomberDetonations.length && !this.heatPulses.some((pulse) => performance.now() - pulse.started < pulse.duration) && !this.sentryBursts.some((burst) => performance.now() - burst.started < burst.duration) && !this.ninjaSlashes.some((slash) => performance.now() - slash.started < slash.duration) && !(this.game?.delayedStrikes?.length) && !this.pendingPlayers && !this.particles.some((particle) => particle.kind === 'tank') && ![...this.visualPlayers.values()].some((player) => player.launchAnimation?.kind === 'armoredDash' && performance.now() < player.launchAnimation.started + player.launchAnimation.duration) && !this.visualObjects.some((object) => object.fallAnimation || object.impactAnimation || object.slideAnimation) && (!this.arenaVisual || performance.now() >= this.arenaVisual.started + this.arenaVisual.duration) && performance.now() >= Math.max(this.tankAnimationEndsAt, this.explosionAnimationEndsAt, this.lavaAnimation?.started + this.lavaAnimation?.duration || 0); }
  flushCompletionHandlers() { if (!this.completionHandlers.length || !this.battleAnimationsComplete()) return; for (const callback of this.completionHandlers.splice(0)) queueMicrotask(callback); }
  arenaWidth() { return playableWidth(this.game?.terrain); }
  setPointer(clientX, clientY, active = true) { const rect = this.canvas.getBoundingClientRect(); this.weatherPointer = active ? { x: (clientX - rect.left) * this.canvas.width / Math.max(1, rect.width), y: (clientY - rect.top) * this.canvas.height / Math.max(1, rect.height), at: performance.now() } : null; }
  minZoom() { return Math.max(MIN_ZOOM, VIEW.width / this.arenaWidth()); }
  clampCamera() { this.camera.zoom = Math.max(this.camera.zoom, this.minZoom()); const viewW = VIEW.width / this.camera.zoom; const viewH = VIEW.height / this.camera.zoom; const bottom = Math.min(WORLD.height, this.displayLavaLevel() + 24); this.camera.x = viewW >= this.arenaWidth() ? 0 : clamp(this.camera.x, 0, this.arenaWidth() - viewW); this.camera.y = viewH >= bottom ? bottom - viewH : clamp(this.camera.y, 0, bottom - viewH); }
  setCameraMode(mode) { if (mode === this.cameraMode) return; this.cameraMode = mode === 'fixed' ? 'fixed' : 'dynamic'; this.fixedCameraInitialized = false; this.manualMapUntil = 0; this.eventCamera = null; this.eventReturnCamera = null; this.actionCamera = null; this.actionReturnCamera = null; this.cameraReturn = null; this.turnFocus = null; this.aimDragCamera = null; }
  setUserZoom(zoom) { const centerX = this.camera.x + VIEW.width / (2 * this.camera.zoom); const centerY = this.camera.y + VIEW.height / (2 * this.camera.zoom); this.userZoom = clamp(zoom, this.minZoom(), 1.65); this.camera.zoom = this.userZoom; this.camera.x = centerX - VIEW.width / (2 * this.camera.zoom); this.camera.y = centerY - VIEW.height / (2 * this.camera.zoom); this.clampCamera(); }
  adjustZoom(delta) { this.setUserZoom(this.camera.zoom + delta); }
  fitWorld() { this.setUserZoom(this.minZoom()); }
  panCamera(deltaX, deltaY) { if (this.cameraMode !== 'fixed') return; const rect = this.canvas.getBoundingClientRect(); this.camera.x -= deltaX * VIEW.width / Math.max(1, rect.width) / this.camera.zoom; this.camera.y -= deltaY * VIEW.height / Math.max(1, rect.height) / this.camera.zoom; this.clampCamera(); }
  screenToWorld(clientX, clientY) { const rect = this.canvas.getBoundingClientRect(); return { x: (clientX - rect.left) * VIEW.width / rect.width / this.camera.zoom + this.camera.x, y: (clientY - rect.top) * VIEW.height / rect.height / this.camera.zoom + this.camera.y }; }
  minimapBounds() { return { left: VIEW.width - 192, top: 16, width: 176, height: 42 }; }
  minimapContains(clientX, clientY) { if (!this.game) return false; const rect = this.canvas.getBoundingClientRect(); const x = (clientX - rect.left) * VIEW.width / rect.width; const y = (clientY - rect.top) * VIEW.height / rect.height; const map = this.minimapBounds(); return x >= map.left - 8 && x <= map.left + map.width + 8 && y >= map.top - 8 && y <= map.top + map.height + 8; }
  panFromMinimap(clientX, clientY, dragging = false) { if (!dragging && !this.minimapContains(clientX, clientY)) return false; const rect = this.canvas.getBoundingClientRect(); const x = (clientX - rect.left) * VIEW.width / rect.width; const y = (clientY - rect.top) * VIEW.height / rect.height; const map = this.minimapBounds(); this.camera.x = clamp((x - map.left) / map.width, 0, 1) * this.arenaWidth() - VIEW.width / (2 * this.camera.zoom); this.camera.y = clamp((y - map.top) / map.height, 0, 1) * WORLD.height - VIEW.height / (2 * this.camera.zoom); this.clampCamera(); this.manualMapUntil = performance.now() + 8000; this.turnFocus = null; this.cameraReturn = null; return true; }

  setGame(next, options = {}) {
    if (Number.isFinite(next.serverTime)) this.serverClockOffset = next.serverTime - Date.now();
    if (next.seed !== this.game?.seed) { this.lastMagnetSerial = next.pickupAttractions?.at(-1)?.serial || 0; this.rodArcs = []; this.classPulses = []; this.heatPulses = []; this.saboteurPulses = []; this.pickupMagnets = []; this.pendingBomberDetonations = []; this.meteorAnimations = []; this.deathCamera = null; this.tornadoSpawned.clear(); this.weatherCloudVisuals.clear(); this.iceShatters = []; }
    else {
      const previousCloudSerial = Math.max(0, ...(this.game?.lastWeatherCloudDispersals || []).map((effect) => effect.serial));
      for (const effect of next.lastWeatherCloudDispersals || []) if (effect.serial > previousCloudSerial) {
        this.weatherCloudVisuals.delete(effect.id);
        this.floaters.push({ x: effect.x, y: effect.y - 55, text: 'NUVEM DISSIPADA', age: 0, life: 1.5, color: '#9cefff' });
        for (let pixel = 0; pixel < 42; pixel += 1) {
          const angle = Math.PI * 2 * pixel / 42;
          this.addParticle({ kind: 'spark', x: effect.x + (Math.random() - .5) * 90, y: effect.y + (Math.random() - .5) * 28, vx: Math.cos(angle) * (25 + pixel % 5 * 12) + (next.wind || 0) * 2, vy: Math.sin(angle) * (20 + pixel % 4 * 9) - 20, size: 2 + pixel % 4, color: pixel % 3 ? '#91dced' : '#e5faff', gravity: -4, life: .6 + pixel % 5 * .1, bounce: 0, drag: .96 });
        }
      }
      if (next.lastNinjaStrike?.serial && next.lastNinjaStrike.serial !== this.game?.lastNinjaStrike?.serial) this.spawnNinjaSlash(next.lastNinjaStrike);
      for (const vortex of next.windVortices || []) {
        const before = this.game?.windVortices?.find((entry) => entry.id === vortex.id);
        if (!vortex.fire || !before || before.fire) continue;
        this.onVortexIgnite?.(); this.shake = Math.max(this.shake, 7);
        for (let spark = 0; spark < 90; spark += 1) this.addParticle({ kind: 'spark', x: vortex.x + (Math.random() - .5) * vortex.width, y: vortex.y - Math.random() * vortex.height, vx: (Math.random() - .5) * 110, vy: -95 - Math.random() * 160, size: 2 + spark % 4, color: spark % 3 ? '#ff8846' : '#fff1ae', gravity: -15, life: .7 + Math.random() * .8, bounce: 0, drag: .97 });
        this.floaters.push({ x: vortex.x, y: vortex.y - vortex.height * .65, text: 'VÓRTICE DE FOGO!', age: 0, life: 2, color: '#ff9b53' });
      }
      for (const vortex of next.windVortices || []) {
        const before = this.game?.windVortices?.find((entry) => entry.id === vortex.id);
        if (vortex.fire && before && !before.fire) { this.onVortexIgnite?.(); this.shake = Math.max(this.shake, 7); for (let spark = 0; spark < 90; spark += 1) this.addParticle({ kind: 'spark', x: vortex.x + (Math.random() - .5) * vortex.width, y: vortex.y - Math.random() * vortex.height, vx: (Math.random() - .5) * 110, vy: -95 - Math.random() * 160, size: 2 + spark % 4, color: spark % 3 ? '#ff8846' : '#fff1ae', gravity: -15, life: .7 + Math.random() * .8, bounce: 0, drag: .97 }); this.floaters.push({ x: vortex.x, y: vortex.y - vortex.height * .65, text: 'VÓRTICE DE FOGO!', age: 0, life: 2, color: '#ff9b53' }); }
      }
      const previousBomberSerial = Math.max(0, ...(this.game?.bomberDetonations || []).map((blast) => blast.serial));
      for (const blast of next.bomberDetonations || []) if (blast.serial > previousBomberSerial) {
        if (this.shots.some((shot) => !shot.exploded)) this.pendingBomberDetonations.push(blast);
        else this.spawnBomberDetonation(blast);
      }
      const previousGrenadeSerial = Math.max(0, ...(this.game?.bomberGrenadeImpacts || []).map((impact) => impact.serial));
      for (const impact of next.bomberGrenadeImpacts || []) if (impact.serial > previousGrenadeSerial) this.spawnBomberGrenadeImpact(impact);
      const previousMineSerial = Math.max(0, ...(this.game?.mineDetonations || []).map((blast) => blast.serial));
      for (const blast of next.mineDetonations || []) if (blast.serial > previousMineSerial) this.spawnAquaticMineBlast(blast);
      for (const mine of next.mines || []) {
        const before = this.game?.mines?.find((entry) => entry.id === mine.id);
        if (mine.aquatic && mine.armed && before && !before.armed) this.spawnAquaticMineArming(mine);
      }
      if (next.lastRodPulse?.serial && next.lastRodPulse.serial !== this.game?.lastRodPulse?.serial) { for (const arc of next.lastRodPulse.arcs || []) this.rodArcs.push({ ...arc, started: performance.now(), duration: 1200 }); this.shake = Math.max(this.shake, 5); }
      const previousClassSerial = Math.max(0, ...(this.game?.lastClassPulses || []).map((pulse) => pulse.serial));
      for (const pulse of next.lastClassPulses || []) if (pulse.serial > previousClassSerial) { this.classPulses.push({ ...pulse, started: performance.now(), duration: 1450 }); for (const heal of pulse.heals || []) if (heal.amount > 0) { const target = next.players.find((player) => player.id === heal.playerId); if (target && Number.isFinite(target.x)) this.floaters.push({ x: target.x, y: target.y - 42, text: `+${heal.amount} HP`, age: 0, life: 1.7, color: '#78ffc3' }); } for (const repair of pulse.repairs || []) if (repair.amount > 0) this.floaters.push({ x: repair.x, y: repair.y - 36, text: `+${repair.amount} CASCO`, age: 0, life: 1.7, color: '#61e3d5' }); if (pulse.type === 'fireFoam') { this.floaters.push({ x: pulse.x, y: pulse.y - 48, text: `ESPUMA • ${pulse.extinguished} FOGOS`, age: 0, life: 2, color: '#93ecff' }); for (let index = 0; index < 48; index += 1) { const angle = index * Math.PI * 2 / 48; this.addParticle({ kind: 'spark', x: pulse.x, y: pulse.y, vx: Math.cos(angle) * (70 + index % 4 * 35), vy: Math.sin(angle) * (70 + index % 4 * 35) - 35, size: 3 + index % 3, color: index % 3 ? '#a8f2ff' : '#ffffff', gravity: -12, life: .65 + index % 5 * .1, bounce: 0, drag: .95 }); } } }
      const newHeatPulses = next.lastSuperheatPulses?.length ? next.lastSuperheatPulses : next.lastSuperheatPulse ? [next.lastSuperheatPulse] : [];
      for (const pulse of newHeatPulses) if (pulse.serial > (this.game?.lastSuperheatPulse?.serial || 0)) { this.heatPulses.push({ ...pulse, started: performance.now() }); this.shake = Math.max(this.shake, 4); }
      const previousWaterHitSerial = Math.max(0, ...(this.game?.lastWaterCannonHits || []).map((hit) => hit.serial));
      const previousOrbSerial = Math.max(0, ...(this.game?.lastWaterOrbLandings || []).map((landing) => landing.serial));
      for (const landing of next.lastWaterOrbLandings || []) if (landing.serial > previousOrbSerial) {
        this.spawnWaterSplash(landing.x, landing.y);
        this.spawnImpactEcho(landing.x, landing.y, 'elementalWater', landing.radius, 1600);
        for (let index = 0; index < 95; index += 1) {
          const side = index % 2 ? -1 : 1;
          this.addParticle({ kind: 'water', x: landing.x + (Math.random() - .5) * 20, y: landing.y - Math.random() * 12, vx: side * (55 + Math.random() * 190), vy: -20 - Math.random() * 115, size: 2 + index % 4, color: index % 4 ? '#4fc6f0' : '#e8ffff', gravity: 260, life: .75 + Math.random() * .75, bounce: .14, drag: .985 });
        }
        this.floaters.push({ x: landing.x, y: landing.y - 58, text: 'ÁGUA ESPALHANDO', age: 0, life: 1.7, color: '#9eeeff' });
      }
      for (const hit of next.lastWaterCannonHits || []) if (hit.serial > previousWaterHitSerial) {
        this.floaters.push({ x: hit.x, y: hit.y - 34, text: `-${hit.amount} HP • JATO`, age: 0, life: 1.6, color: '#8cecff' });
        for (let splash = 0; splash < 28; splash += 1) this.addParticle({ kind: 'water', x: hit.x + (Math.random() - .5) * 18, y: hit.y + (Math.random() - .5) * 20, vx: (Math.random() - .5) * 135, vy: -25 - Math.random() * 105, size: 2 + splash % 3, color: splash % 4 ? '#75dffa' : '#efffff', gravity: 95, life: .4 + Math.random() * .45, bounce: .05, drag: .96 });
      }
      for (const player of next.players) {
        const previous = this.game?.players?.find((entry) => entry.id === player.id);
        if (player.lastFireHit?.damage > 0 && (player.lastFireHit.round !== previous?.lastFireHit?.round || player.lastFireHit.zoneId !== previous?.lastFireHit?.zoneId) && Number.isFinite(player.x)) {
          this.floaters.push({ x: player.x, y: player.y - 43, text: `-${player.lastFireHit.damage} HP • FOGO`, age: 0, life: 1.9, color: '#ff9b4e' });
          for (let index = 0; index < 28; index += 1) this.addParticle({ x: player.x + (Math.random() - .5) * 22, y: player.y + 8, vx: (Math.random() - .5) * 85, vy: -45 - Math.random() * 85, size: 2 + index % 3, color: index % 3 ? '#ff7041' : '#ffde72', gravity: -12, life: .55 + Math.random() * .55, bounce: 0, drag: .94 });
          for (let index = 0; index < 16; index += 1) this.addParticle({ kind: 'smoke', x: player.x + (Math.random() - .5) * 22, y: player.y - 10, vx: (Math.random() - .5) * 30, vy: -26 - Math.random() * 42, size: 5 + index % 4, color: index % 3 ? '#503d3b' : '#934634', gravity: -8, life: .8 + Math.random() * .8, drag: .97 });
        }
      }
      const previousPulseSerial = Math.max(0, ...(this.game?.lastSaboteurPulses || []).map((pulse) => pulse.serial));
      for (const pulse of next.lastSaboteurPulses || []) if (pulse.serial > previousPulseSerial) {
        const started = performance.now(); this.saboteurPulses.push({ ...pulse, started, duration: CLASS_BALANCE.saboteurPulseDurationMs }); this.shake = Math.max(this.shake, 7);
        for (const hit of pulse.hits || []) { const target = next.players.find((player) => player.id === hit.playerId); if (target && Number.isFinite(target.x)) this.floaters.push({ x: target.x, y: target.y - 38, text: `-${hit.amount} HP • PANE`, age: 0, life: 2.2, color: '#d8ff76' }); }
        if (this.cameraMode !== 'fixed') {
          this.eventReturnCamera ||= { ...this.camera };
          const zoom = clamp(Math.min(this.userZoom, VIEW.width / (pulse.radius * 2 + 140)), MIN_ZOOM, 1);
          this.eventCamera = { x: pulse.x, y: pulse.y, zoom, until: started + CLASS_BALANCE.saboteurPulseDurationMs };
          this.camera.zoom = zoom;
          this.camera.x = pulse.x - VIEW.width / (2 * zoom);
          this.camera.y = this.cameraYFor(pulse.y, zoom, .62);
          this.clampCamera();
        }
      }
      for (const attraction of next.pickupAttractions || []) if (attraction.serial > this.lastMagnetSerial) this.pickupMagnets.push({ ...attraction, started: performance.now(), duration: 950 });
      this.lastMagnetSerial = Math.max(this.lastMagnetSerial, next.pickupAttractions?.at(-1)?.serial || 0);
    }
    if (this.game && next.seed === this.game.seed && next.lavaLevel !== this.game.lavaLevel) {
      const started = performance.now(); this.lavaAnimation = { from: this.displayLavaLevel(started), to: next.lavaLevel, started, duration: 1100 };
      this.shake = Math.max(this.shake, next.mode === 'survival' ? 9 : 5);
      for (let i = 0; i < 42; i += 1) this.addParticle({ x: this.camera.x + Math.random() * VIEW.width / this.camera.zoom, y: next.lavaLevel + (Math.random() - .5) * 12, vx: (Math.random() - .5) * 50, vy: -35 - Math.random() * 95, size: 2 + i % 4, color: FIRE[i % FIRE.length], gravity: 55, life: .6 + Math.random() * .5, bounce: 0, drag: .97 });
    }
    const newSentryPulse = Boolean(this.game?.seed === next.seed && next.lastSentryPulse?.serial && next.lastSentryPulse.serial !== this.game?.lastSentryPulse?.serial);
    if (newSentryPulse) { this.sentryReturnCamera ||= { ...this.camera }; for (const burst of next.lastSentryPulse.bursts) this.sentryBursts.push({ ...burst, started: performance.now(), duration: 1450, shownHits: new Set() }); }
    const newSpecialistPulse = Boolean(this.game?.seed === next.seed && next.lastSpecialistPulse?.serial && next.lastSpecialistPulse.serial !== this.game?.lastSpecialistPulse?.serial);
    if (newSpecialistPulse) { this.sentryReturnCamera ||= { ...this.camera }; for (const burst of next.lastSpecialistPulse.bursts) this.sentryBursts.push({ ...burst, started: performance.now(), duration: 1750, shownHits: new Set() }); }
    if (this.game?.seed !== next.seed) { this.fixedCameraInitialized = false; this.muzzleBursts.length = 0; }
    const previousSoapSerial = this.game?.soapPops?.at(-1)?.serial || 0;
    for (const pop of next.soapPops || []) if (pop.serial > previousSoapSerial) this.spawnSoapPop(pop);
    if (next.lastHarpoonHit?.serial && next.lastHarpoonHit.serial !== this.game?.lastHarpoonHit?.serial) this.spawnHarpoonHit(next.lastHarpoonHit);
    const previousActiveId = this.game?.players?.[this.game.turnIndex]?.id; const nextActiveId = next.players[next.turnIndex]?.id;
    const turnChanged = next.phase === 'playing' && (this.game?.phase !== 'playing' || this.game.turnNumber !== next.turnNumber || previousActiveId !== nextActiveId);
    if (this.game) {
      const previous = new Map((this.game.terrain.floatingPlatforms || []).map((platform) => [platform.id, platform]));
      for (const platform of next.terrain.floatingPlatforms || []) if (previous.get(platform.id)?.active && !platform.active) {
        if (this.shots.some((shot) => !shot.exploded)) this.pendingPlatformDebris.push(previous.get(platform.id));
        else this.spawnPlatformDebris(previous.get(platform.id));
      }
      for (const platform of next.terrain.floatingPlatforms || []) { const before = previous.get(platform.id); if (platform.kind === 'iceSheet' && platform.active && before?.active && platform.durability < before.durability) this.spawnIceCracks(platform); }
      const previousItems = new Map((this.game.powerups || []).map((item) => [item.id, item]));
      for (const item of next.powerups || []) if (!previousItems.get(item.id)?.revealed && item.revealed) {
        if (this.shots.some((shot) => !shot.exploded)) this.pendingPowerupReveals.push(item);
        else this.spawnPowerupReveal(item);
      }
    }
    const incoming = next.terrain.heights; const biomeChanged = this.terrainBiome !== next.terrain.type; this.terrainBiome = next.terrain.type; const deferWorld = this.shots.some((shot) => !shot.exploded) || Boolean(this.drillTerrainReveal) || newSentryPulse || newSpecialistPulse || this.sentryBursts.some((burst) => performance.now() - burst.started < burst.duration) || Boolean(options.deferWorld);
    if (!this.terrainHeights) { this.terrainHeights = [...incoming]; this.buildTerrain(); }
    else if (this.drillTerrainReveal) this.drillTerrainReveal.target = [...incoming];
    else if (biomeChanged || this.terrainChanged(incoming)) {
      if (deferWorld) this.pendingTerrain = [...incoming];
      else this.applyTerrain(incoming, true);
    }
    const deferMotion = deferWorld;
    if (deferMotion) { this.pendingPlayers = next.players.map((player) => ({ ...player })); this.pendingPowerups = (next.powerups || []).map((item) => ({ ...item })); this.pendingPlatforms = (next.terrain.floatingPlatforms || []).map((platform) => ({ ...platform })); this.pendingObjects = (next.objects || []).map((object) => ({ ...object })); this.pendingGraves = (next.graves || []).map((grave) => ({ ...grave })); const movingWood = this.syncObjects((next.objects || []).filter((object) => object.type === 'woodDebris')); this.visualObjects = [...this.visualObjects.filter((object) => object.type !== 'woodDebris'), ...movingWood]; }
    else { this.visualPowerups = (next.powerups || []).map((item) => ({ ...item })); this.visualPlatforms = (next.terrain.floatingPlatforms || []).map((platform) => ({ ...platform })); this.visualObjects = this.syncObjects(next.objects || []); this.visualGraves = (next.graves || []).map((grave) => ({ ...grave })); }
    if (newSpecialistPulse && !this.shots.some((shot) => !shot.exploded)) this.visualObjects = this.syncObjects(next.objects || []);
    this.syncPlayers(next.players, deferMotion, next);
    this.game = next; this.userZoom = Math.max(this.userZoom, this.minZoom()); this.clampCamera(); if (turnChanged) { this.aimDragCamera = null; this.turnFocus = { playerId: nextActiveId, started: performance.now(), acquired: null }; }
  }

  syncObjects(objects) {
    const previous = new Map(this.visualObjects.map((object) => [object.id, object]));
    const started = performance.now();
    return objects.map((object) => {
      const before = previous.get(object.id); const copy = { ...object };
      if (object.type === 'woodDebris') {
        copy.waitForShot = before?.waitForShot ?? this.shots.some((shot) => !shot.exploded);
        copy.visualWoodX = before?.visualWoodX ?? object.spawnX ?? object.x;
        copy.visualWoodY = before?.visualWoodY ?? object.spawnY ?? object.y;
        copy.visualWoodRotation = before?.visualWoodRotation ?? before?.rotation ?? object.rotation;
        if (object.lastWoodImpact?.serial && object.lastWoodImpact.serial !== before?.lastWoodImpact?.serial) {
          const hit = object.lastWoodImpact; this.onPhysicalEffect?.('treeBreak', clamp(hit.speed / 360, .4, 1));
          for (let i = 0; i < 12; i += 1) this.addParticle({ x: hit.x + (Math.random() - .5) * object.width, y: hit.y - 4, vx: (Math.random() - .5) * 140, vy: -30 - Math.random() * 90, size: 2 + i % 4, color: i % 3 ? '#a5784b' : '#dac08b', gravity: 240, life: .5 + Math.random() * .6, bounce: .3, drag: .96 });
        }
      }
      if (object.lastFall?.serial && object.lastFall.serial !== before?.lastFall?.serial) {
        copy.fallAnimation = { started, distance: object.lastFall.distance, duration: clamp(360 + object.lastFall.distance * 2.2, 420, 1100) };
        this.onPhysicalEffect?.(object.type === 'woodDebris' ? 'treeBreak' : 'structureFall', clamp(object.lastFall.distance / 150, .35, 1.35));
      } else if (before?.fallAnimation) copy.fallAnimation = before.fallAnimation;
      if (object.lastImpact?.serial && object.lastImpact.serial !== before?.lastImpact?.serial) {
        const source = objects.find((entry) => entry.id === object.lastImpact.fromId);
        const sourceFall = source?.lastFall;
        copy.impactAnimation = { started, delay: sourceFall ? clamp(360 + sourceFall.distance * 2.2, 420, 1100) * .78 : 0 };
      } else if (before?.impactAnimation) copy.impactAnimation = before.impactAnimation;
      if (object.lastDisplacement?.serial && object.lastDisplacement.serial !== before?.lastDisplacement?.serial) copy.slideAnimation = { started, fromX: object.lastDisplacement.fromX, duration: 350 };
      else if (before?.slideAnimation) copy.slideAnimation = before.slideAnimation;
      if (object.lastSpecialistMove?.serial && object.lastSpecialistMove.serial !== before?.lastSpecialistMove?.serial) copy.specialistMoveAnimation = { ...object.lastSpecialistMove, started, duration: 900 };
      else if (before?.specialistMoveAnimation) copy.specialistMoveAnimation = before.specialistMoveAnimation;
      if (before?.nextBurningLeafAt) copy.nextBurningLeafAt = before.nextBurningLeafAt;
      if (object.lastHeal?.serial && object.lastHeal.serial !== before?.lastHeal?.serial) { this.spawnHealPulse(object.x, object.groundY - 28, object.lastHeal.amount); this.floaters.push({ x: object.x, y: object.groundY - 55, text: `${object.type === 'healingDrone' ? 'DRONE' : 'ESTAÇÃO'} +${object.lastHeal.amount} HP`, age: 0, life: 1.8, color: '#80ffbc' }); }
      if (object.lastShieldPulse?.serial && object.lastShieldPulse.serial !== before?.lastShieldPulse?.serial) { const pulse = object.lastShieldPulse; this.spawnImpactEcho(pulse.x, pulse.y, 'shield', pulse.radius); this.floaters.push({ x: pulse.x, y: pulse.y - 62, text: `DOMO PROTEGEU ${pulse.targetIds.length} • ${pulse.energy}/3`, age: 0, life: 2, color: '#78dfff' }); }
      if (object.lastRestock?.serial && object.lastRestock.serial !== before?.lastRestock?.serial) { const restock = object.lastRestock; this.spawnImpactEcho(object.x, object.groundY - object.height / 2, 'boost', 52); this.floaters.push({ x: object.x, y: object.groundY - object.height - 18, text: `${restock.weapon ? 'MUNIÇÃO +1' : 'COMBUSTÍVEL'}${restock.fuel ? ` • +${restock.fuel}` : ''}`, age: 0, life: 2, color: '#ffd86a' }); }
      if (before && object.type?.startsWith('tree') && (object.durability < before.durability || before.active && !object.active)) { const destroyed = before.active && !object.active; this.spawnTreeDamage(object, destroyed); if (destroyed) this.onPhysicalEffect?.('treeBreak', object.treeSize === 'large' ? 1.35 : .8); }
      return copy;
    });
  }

  spawnStructureImpact(object, fracture = false) {
    const palette = object.lastFall?.material === 'concreto' || object.lastImpact?.material === 'concreto' ? ['#d5cbb4', '#8f9997', '#53636b'] : object.lastFall?.material === 'aço' || object.lastImpact?.material === 'aço' ? ['#e3e9e9', '#94a6af', '#ffcc71'] : object.lastFall?.material === 'eletrônico' || object.lastImpact?.material === 'eletrônico' ? ['#9af5ff', '#4ab8d5', '#d5e7ed'] : ['#e7b67a', '#9b765a', '#596875'];
    const count = fracture ? 42 : clamp(Math.round((object.lastFall?.distance || 90) * .24), 28, 95);
    this.shake = Math.max(this.shake, fracture ? 7 : clamp((object.lastFall?.distance || 90) * .08, 7, 22));
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 ? -1 : 1;
      this.addParticle({ x: object.x + (Math.random() - .5) * (object.width || 55), y: object.groundY - Math.random() * (fracture ? Math.min(70, object.height || 50) : 14), vx: side * (18 + Math.random() * (fracture ? 170 : 120)), vy: -28 - Math.random() * (fracture ? 155 : 105), size: 2 + i % 5, color: palette[i % palette.length], gravity: 200, life: .5 + Math.random() * .85, bounce: .2, drag: .97 });
    }
  }

  spawnTreeDamage(object, destroyed = false) {
    this.spawnTreeLeaves(object, { count: destroyed ? 110 : 42, force: destroyed ? 240 : 135, lift: destroyed ? 175 : 105 });
    const palette = ['#79563a', '#c49a70']; const count = destroyed ? 32 : 12;
    for (let index = 0; index < count; index += 1) this.addParticle({ x: object.x + (Math.random() - .5) * object.width, y: object.groundY - object.height * (.25 + Math.random() * .55), vx: (Math.random() - .5) * 130, vy: -25 - Math.random() * 100, size: 3 + index % 4, color: palette[index % palette.length], gravity: 180, life: .65 + Math.random() * .8, bounce: .18, drag: .97 });
  }

  treeLeafPalette(object) {
    if (object.burningUntilRound >= this.game.roundNumber) return ['#f0a13b', '#bf672f', '#77422d'];
    if (this.game?.terrain?.type === 'hills') return ['#f7ffff', '#cdeafa', '#8faebb'];
    return ['#b3db70', '#76ad55', '#477b49', '#315c3d'];
  }

  spawnTreeLeaves(object, { count = 18, force = 80, lift = 55, originX = object.x, originY = object.groundY - object.height * .55 } = {}) {
    if (!object?.active && count < 50) return;
    const palette = this.treeLeafPalette(object); const canopyWidth = object.crownWidth || object.width * (object.treeSize === 'medium' ? 1.45 : 1.8); const canopyY = object.groundY - object.height * .58; const wind = clamp(this.game?.wind || 0, -30, 30);
    for (let index = 0; index < count; index += 1) { const dx = (Math.random() - .5) * canopyWidth; const dy = (Math.random() - .5) * object.height * .34; const radial = Math.sign(object.x + dx - originX) || (Math.random() < .5 ? -1 : 1); this.addParticle({ kind: 'leaf', x: object.x + dx, y: canopyY + dy, vx: radial * force * (.28 + Math.random() * .72) + wind * 3.2, vy: -lift * (.3 + Math.random() * .75) + clamp((canopyY + dy - originY) * .08, -45, 45), size: 3 + index % 4, width: 4 + index % 3 * 2, height: 2 + index % 2 * 2, color: palette[index % palette.length], gravity: 34 + Math.random() * 24, life: 1.5 + Math.random() * 2.2, bounce: .08, drag: .986, flutter: .8 + Math.random() * 1.8, phase: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * 8 }); }
    const current = this.leafShed.get(object.id) || { amount: 0, until: 0 }; this.leafShed.set(object.id, { amount: Math.min(.68, current.amount + count / 180), until: performance.now() + 5200 });
  }

  updateObjectEffects(time) {
    for (const object of this.visualObjects) {
      if (object.fallAnimation && !object.fallAnimation.impactSpawned && time >= object.fallAnimation.started + object.fallAnimation.duration * .78) { object.fallAnimation.impactSpawned = true; this.spawnStructureImpact(object); }
      if (object.fallAnimation && time >= object.fallAnimation.started + object.fallAnimation.duration) object.fallAnimation = null;
      if (object.impactAnimation && time >= object.impactAnimation.started + object.impactAnimation.delay) { object.impactAnimation = null; this.spawnStructureImpact(object, true); }
      if (object.slideAnimation && time >= object.slideAnimation.started + object.slideAnimation.duration) object.slideAnimation = null;
      if (object.active && object.type?.startsWith('tree') && object.burningUntilRound >= this.game.roundNumber && time >= (object.nextBurningLeafAt || 0)) { object.nextBurningLeafAt = time + 130 + Math.random() * 170; this.spawnTreeLeaves(object, { count: 2, force: 38, lift: 95 }); this.addParticle({ kind: 'smoke', x: object.x + (Math.random() - .5) * (object.crownWidth || object.width), y: object.groundY - object.height * .65, vx: (this.game.wind || 0) * 1.4, vy: -24 - Math.random() * 30, size: 6 + Math.random() * 6, color: '#4c403b', gravity: -7, life: 1 + Math.random(), bounce: 0, drag: .98 }); }
    }
    const wind = Math.abs(this.game?.wind || 0);
    if (wind >= 8 && time - this.lastWindLeafAt > Math.max(85, 310 - wind * 7)) {
      this.lastWindLeafAt = time;
      const candidates = this.visualObjects.filter((object) => object.active && object.type?.startsWith('tree') && this.effectVisible(object.x, object.groundY - object.height / 2, object.crownWidth || object.width));
      const object = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
      if (object) this.spawnTreeLeaves(object, { count: wind >= 22 ? 4 : 2, force: 20 + wind * 4, lift: 18 + wind * 1.4 });
    }
    for (const [id, shed] of this.leafShed) if (time >= shed.until) this.leafShed.delete(id);
  }

  terrainChanged(incoming) { for (let x = 0; x < incoming.length; x += 8) if (incoming[x] !== this.terrainHeights[x]) return true; return false; }

  syncPlayers(players, deferMotion = false, state = this.game) {
    const serverNow = state?.serverTime ?? this.worldNow();
    const liftedIds = new Set((state?.soapBubbles || []).filter((bubble) => serverNow >= bubble.impactAt && serverNow < bubble.executeAt).map((bubble) => bubble.playerId));
    for (const player of players) {
      let visual = this.visualPlayers.get(player.id);
      if (!visual) { const x = Number.isFinite(player.x) ? player.x : 0; const y = Number.isFinite(player.y) ? player.y : 0; visual = { ...player, x, y, renderX: x, renderY: y, targetX: x, targetY: y }; this.visualPlayers.set(player.id, visual); continue; }
      if (player.hidden) { if (player.lastNinjaReveal?.destroyedSerial && player.lastNinjaReveal.destroyedSerial !== visual.lastNinjaReveal?.destroyedSerial) { const ghost = player.lastNinjaReveal; this.spawnImpactEcho(ghost.x, ghost.y, 'invisibility', 52); this.floaters.push({ x: ghost.x, y: ghost.y - 48, text: 'ERA UM FANTASMA!', age: 0, life: 1.8, color: '#69cfff' }); } const position = { x: visual.x, y: visual.y, renderX: visual.renderX, renderY: visual.renderY, targetX: visual.targetX, targetY: visual.targetY }; Object.assign(visual, player, position, { hidden: true, moving: false }); continue; }
      const launched = !deferMotion && player.lastLaunch?.serial && player.lastLaunch.serial !== visual.lastLaunch?.serial; const airBoosted = !deferMotion && player.lastAirBoost?.serial && player.lastAirBoost.serial !== visual.lastAirBoost?.serial; const blinked = !deferMotion && player.lastBlink?.serial && player.lastBlink.serial !== visual.lastBlink?.serial; const poweredMove = !deferMotion && player.lastMove?.serial && player.lastMove.serial !== visual.lastMove?.serial && player.lastMove.kind !== 'tracks';
      const wasHidden = visual.hidden; const previousAirborne = visual.airborne; const previousHealth = visual.health; const previousFireHit = visual.lastFireHit; const previousShieldCharges = visual.shieldCharges || 0; const previousFrozenTurns = visual.frozenTurns || 0; const previousFractureTurns = visual.armorFractureTurns || 0; const previousInvisibleTurns = visual.invisibleTurns || 0; const previousNinjaRevealSerial = visual.lastNinjaReveal?.serial; const previousGhostDestroyedSerial = visual.lastNinjaReveal?.destroyedSerial; const previousSplitSerial = visual.lastSplitReflection?.serial; const jumped = !deferMotion && player.airborne && !previousAirborne; const openedParachute = !deferMotion && player.airborne?.parachute && !previousAirborne?.parachute; const landed = !deferMotion && !player.airborne && previousAirborne && !liftedIds.has(player.id); const newLanding = !deferMotion && player.lastLanding?.serial && player.lastLanding.serial !== visual.lastLanding?.serial;
      const previousAirPocketSerial = visual.lastAirPocketBurst?.serial;
      const previousSwimLeapSerial = visual.lastSwimLeap?.serial;
      if (!deferMotion && !liftedIds.has(player.id) && state?.harpoonPull?.playerId !== player.id && Math.abs(visual.targetX - player.x) > 2) this.spawnDust(visual.renderX, visual.renderY + 10, player.x > visual.targetX ? -1 : 1);
      const deferredCombat = deferMotion ? { health: visual.health, alive: visual.alive, shieldCharges: visual.shieldCharges, invisibleTurns: visual.invisibleTurns, lastLanding: visual.lastLanding, lastFireHit: visual.lastFireHit } : null;
      Object.assign(visual, player);
      if (deferredCombat) Object.assign(visual, deferredCombat);
      if (player.lastFireHit?.damage > 0 && (player.lastFireHit.round !== previousFireHit?.round || player.lastFireHit.zoneId !== previousFireHit?.zoneId)) visual.burningHitUntil = performance.now() + 1500;
      // Terrain and damage wait for the matching impact, but existing flight,
      // knockback and driving continue at every server physics update.
      if (!deferMotion || player.airborne || previousAirborne || state?.harpoonPull?.playerId === player.id || player.movingUntil > serverNow) { visual.targetX = player.x; visual.targetY = player.y; }
      if (wasHidden) { visual.renderX = player.x; visual.renderY = player.y; visual.targetX = player.x; visual.targetY = player.y; }
      const fatalDash = state?.lastNinjaStrike?.sourceId === player.id && state.lastNinjaStrike.serial !== this.game?.lastNinjaStrike?.serial;
      if (fatalDash && !deferMotion) { visual.renderX = state.lastNinjaStrike.fromX; visual.renderY = state.lastNinjaStrike.fromY; visual.launchAnimation = { ...state.lastNinjaStrike, kind: 'ninjaFatal', started: performance.now(), duration: CLASS_BALANCE.ninjaFatalDurationMs * .58 }; }
      if (blinked) this.spawnTeleport(player.lastBlink);
      if (poweredMove && player.lastMove.kind === 'spiderClimb') visual.climbingUntil = performance.now() + 180;
      if (poweredMove && player.lastMove.kind === 'rocketDash') { visual.renderX = player.lastMove.fromX; visual.renderY = player.lastMove.fromY; visual.launchAnimation = { ...player.lastMove, started: performance.now(), duration: 720 }; }
      if (poweredMove && !['spiderClimb', 'rocketDash'].includes(player.lastMove.kind)) this.spawnImpactEcho(player.x, player.y, player.lastMove.kind, 44);
      if (poweredMove && player.lastMove.kind === 'excavator') { this.drillAnimations.push({ kind: 'excavator', x: player.lastMove.fromX, y: player.lastMove.fromY, toX: player.lastMove.toX, toY: player.lastMove.toY, direction: player.lastMove.direction, started: performance.now(), duration: 1150 }); this.shake = Math.max(this.shake, 3); }
      if (launched) { visual.renderX = player.lastLaunch.fromX; visual.renderY = player.lastLaunch.fromY; visual.launchAnimation = { ...player.lastLaunch, started: performance.now(), duration: player.lastLaunch.kind === 'armoredDash' ? 760 : player.lastLaunch.kind === 'spiderLeap' ? 900 : 950 }; if (player.lastLaunch.kind === 'armoredDash') this.spawnArmoredDashImpact(player.lastLaunch); if (player.lastLaunch.kind === 'spiderLeap') this.spawnSpiderLeap(player.lastLaunch); }
      if (airBoosted) { this.spawnAirBoost(player.lastAirBoost); this.spawnImpactEcho(player.lastAirBoost.x, player.lastAirBoost.y, 'boost', 42); }
      if (!deferMotion && player.lastAirPocketBurst?.serial && player.lastAirPocketBurst.serial !== previousAirPocketSerial) this.spawnAirPocketBurst(player.lastAirPocketBurst);
      if (!deferMotion && player.lastSwimLeap?.serial && player.lastSwimLeap.serial !== previousSwimLeapSerial) this.spawnAmphibianLeap(player.lastSwimLeap);
      if (jumped && !player.airborne.falling && !player.airborne.fromHarpoon) { visual.jumpStartedAt = performance.now(); if (player.airborne.fromWaterCannonRecoil) this.spawnWaterRecoilEffect(visual.renderX, visual.renderY); else if (!player.airborne.fromSwimLeap) { this.spawnJumpEffect(visual.renderX, visual.renderY, player.facing); this.spawnImpactEcho(visual.renderX, visual.renderY, 'jump', 42); } } if (openedParachute) { visual.parachuteOpenedAt = performance.now(); this.spawnParachuteEffect(visual.renderX, visual.renderY); this.onPhysicalEffect?.('parachute', .7); } if (newLanding || landed) { const landing = player.lastLanding; const distance = landing?.distance ?? (previousAirborne?.falling ? player.y - previousAirborne.startY : 0); visual.renderX = player.x; visual.renderY = player.y; visual.launchAnimation = null; if (landing?.water) this.spawnWaterSplash(player.x, player.y + WORLD.tankRadius); else this.spawnLandingEffect(player.x, player.y, landing?.parachute ?? previousAirborne?.parachute, distance, landing?.speed || 0); const impactStrength = clamp(Math.max(distance / 180, (landing?.speed || 0) / 260), .3, 1.4); this.onPhysicalEffect?.(landing?.water ? 'waterLanding' : landing?.parachute ? 'softLanding' : impactStrength > .72 ? 'hardLanding' : 'softLanding', impactStrength); visual.landingAnimation = { started: performance.now(), duration: 440, strength: landing?.water ? .18 : clamp((landing?.speed || 140) / 650, .25, 1) }; }
      if (newLanding && player.lastLanding?.damage > 0) this.floaters.push({ x: player.x, y: player.y - 42, text: `QUEDA -${player.lastLanding.damage} HP`, age: 0, life: 1.7, color: '#ff986b' });
      if (!deferMotion && player.health < previousHealth) { visual.hitFlashUntil = performance.now() + 650; this.spawnDamageImpact(player.x, player.y, previousHealth - player.health, player.color, player.id); if (player.shieldCharges < previousShieldCharges) this.spawnShieldImpact(player.x, player.y); }
      if (!deferMotion && player.health > previousHealth) this.spawnHealPulse(player.x, player.y, player.health - previousHealth);
      if (!deferMotion && player.shieldCharges > previousShieldCharges) { visual.shieldAppearUntil = performance.now() + 920; this.spawnStatusActivation(player.x, player.y, 'shield', player.id); }
      if (!deferMotion && player.invisibleTurns > previousInvisibleTurns) { visual.cloakAppearUntil = performance.now() + 1000; this.spawnStatusActivation(player.x, player.y, 'invisibility', player.id); }
      if (!deferMotion && player.lastSplitReflection?.serial && player.lastSplitReflection.serial !== previousSplitSerial) { const reflection = player.lastSplitReflection; this.spawnImpactEcho(reflection.x, reflection.y, 'shield', 52); this.floaters.push({ x: reflection.x, y: reflection.y - 52, text: `REFLETIDO -${reflection.amount}`, age: 0, life: 1.8, color: '#70eaff' }); for (let step = 0; step < 24; step += 1) { const t = step / 23; this.addParticle({ kind: 'spark', x: reflection.x + (reflection.toX - reflection.x) * t, y: reflection.y + (reflection.toY - reflection.y) * t, vx: (Math.random() - .5) * 35, vy: -20 - Math.random() * 45, size: 2 + step % 3, color: step % 3 ? '#80eaff' : '#efffff', gravity: 0, life: .4 + t * .4, drag: .97 }); } }
      if (!deferMotion && player.lastNinjaReveal?.destroyedSerial && player.lastNinjaReveal.destroyedSerial !== previousGhostDestroyedSerial) { this.spawnImpactEcho(player.lastNinjaReveal.x, player.lastNinjaReveal.y, 'invisibility', 52); this.floaters.push({ x: player.lastNinjaReveal.x, y: player.lastNinjaReveal.y - 48, text: 'ERA UM FANTASMA!', age: 0, life: 1.8, color: '#69cfff' }); }
      if (!deferMotion && player.lastNinjaReveal?.reason !== 'ghost' && player.lastNinjaReveal?.serial && player.lastNinjaReveal.serial !== previousNinjaRevealSerial) { this.spawnImpactEcho(player.x, player.y, 'invisibility', 44); this.floaters.push({ x: player.x, y: player.y - 44, text: 'NINJA REVELADO', age: 0, life: 1.4, color: '#ddafff' }); }
      if (!deferMotion && player.frozenTurns > previousFrozenTurns) this.spawnFreezeBurst(player.x, player.y);
      if (!deferMotion && player.armorFractureTurns > previousFractureTurns) { this.spawnImpactEcho(player.x, player.y + 9, 'critical', 30); this.floaters.push({ x: player.x, y: player.y - 42, text: 'ESTEIRAS DANIFICADAS', age: 0, life: 1.6, color: '#ffe2a1' }); }
      if (!player.alive && visual.visualAlive !== false && !visual.splitDeath && !deferMotion) {
        const fatalHit = state?.lastNinjaStrike?.hits?.find((hit) => hit.playerId === player.id && hit.eliminated);
        if (fatalHit) { visual.renderX = fatalHit.x; visual.renderY = fatalHit.y; visual.splitDeath = { started: performance.now(), duration: CLASS_BALANCE.ninjaFatalSplitMs, x: fatalHit.x, y: fatalHit.y }; this.deathCamera = { x: fatalHit.x, y: fatalHit.y, until: performance.now() + CLASS_BALANCE.ninjaFatalSplitMs + 2800 }; this.tankAnimationEndsAt = Math.max(this.tankAnimationEndsAt, this.deathCamera.until); }
        else { visual.visualAlive = false; this.skullClouds.push({ x: visual.renderX, y: visual.renderY, started: performance.now(), duration: 2800 }); this.spawnTankFragments(visual); this.onTankDestroyed?.(visual); }
      }
      else if (player.alive) visual.visualAlive = true;
    }
  }

  playShot(event) {
    this.flameVolleys ||= [];
    if (!event?.replaceVertical && !event?.replaceCluster && !event?.replaceFireworks && !event?.detonation) {
      const volley = event?.results?.find((result) => result.incendiaryVolley)?.incendiaryVolley;
      if (volley) {
        this.flameVolleys.push({ ...volley, started: performance.now() });
        for (const hit of volley.hits) if (hit.amount > 0) this.floaters.push({ x: hit.x, y: hit.y - 28, text: `-${hit.amount} HP • CHAMA`, age: 0, life: 1.2, color: '#ffad58' });
      }
    }
    const now = performance.now(); if (!event?.replaceVertical && !event?.replaceCluster && !event?.replaceFireworks && !event?.detonation) { this.actionReturnCamera = { ...this.camera }; this.actionCamera = null; this.actionFocusPoints = []; this.cameraReturn = null; this.verticalTarget = null; } this.shots = (event?.results || []).map((result) => { const offset = event?.replaceVertical ? (result.activationIndex || 0) / (SHOT_PATH_RATE * (this.game?.speed || 1)) * 1000 : 0; return { ...result, started: now - offset + (result.mirrorDelay || 0) * 1000, exploded: false, soundDetonation: Boolean(event?.detonation), activationRequested: Boolean(event?.verticalActivated), seenBounces: new Set(), trailAt: 0 }; }); this.aim.visible = false;
    if (event?.replaceVertical) for (const result of event.results || []) { const point = result.path?.[0]; if (!point) continue; this.spawnImpactEcho(point.x, point.y, 'verticalStrike', 34, 900); for (let spark = 0; spark < 42; spark += 1) { const angle = spark / 42 * Math.PI * 2; this.addParticle({ kind: 'spark', x: point.x, y: point.y, vx: Math.cos(angle) * (80 + Math.random() * 130), vy: Math.sin(angle) * (80 + Math.random() * 130), size: 2 + spark % 3, color: spark % 3 ? '#8cecff' : '#ffffff', gravity: 0, life: .3 + Math.random() * .4, bounce: 0, drag: .92 }); } }
    const shooter = this.visualPlayers.get(event.shooterId); if (!event?.replaceVertical && !event?.replaceCluster && !event?.replaceFireworks && !event?.detonation && shooter && !shooter.hidden && !event.results?.some((result) => result.concealed)) { this.spawnMuzzle(shooter, event.results?.find((result) => !result.mirrorCopy && result.path?.length) || event.results?.[0]); if (shooter.airborne) { shooter.airRecoilUntil = now + 260; this.spawnAirShotRecoil(shooter); } }
  }

  playArenaEvent(event, serverNow = Date.now() + this.serverClockOffset) {
    if (event.warning) {
      const duration = Math.max(900, (event.executeAt || serverNow + 2000) - serverNow);
      this.arenaVisual = { event, started: performance.now(), duration };
      if (!event.weatherPrelude) {
        this.focusArenaEvent(event, duration + 350);
        if (event.type !== 'gale') for (const impact of event.impacts || []) { for (let ring = 0; ring < 48; ring += 1) { const angle = ring / 48 * Math.PI * 2; this.addParticle({ x: impact.x + Math.cos(angle) * (impact.radius + 10), y: impact.y - 3 + Math.sin(angle) * Math.min(12, impact.radius * .12), vx: 0, vy: -8, size: ring % 3 ? 2 : 4, color: event.type === 'lightning' ? '#80edff' : event.type === 'bombardment' || event.type === 'eruption' ? '#ff6b45' : event.type === 'tectonic' ? '#d7ff68' : '#ffd65c', gravity: 0, life: 1.75, bounce: 0, drag: 1 }); } this.floaters.push({ x: impact.x, y: impact.y - 35, text: event.type === 'tectonic' ? ({ mountain: 'MONTANHA ↑', rise: 'ELEVAÇÃO ↑', sink: 'AFUNDAMENTO ↓' }[impact.tectonicMode] || 'PLACA TECTÔNICA') : event.type === 'eruption' ? 'QUEDA DE MAGMA' : 'ÁREA DE IMPACTO', age: 0, life: 1.75, color: event.type === 'tectonic' ? '#d7ff68' : event.type === 'eruption' ? '#ff6a38' : '#ffcf68' }); }
      }
      for (const seed of event.seeds || []) { this.floaters.push({ x: seed.x, y: seed.y - 42, text: seed.cluster === 'ancestral' ? 'SEMENTE ANCESTRAL' : seed.cluster === 'dense' ? 'MATA DENSA' : 'NOVO BOSQUE', age: 0, life: 2.1, color: '#8eea72' }); for (let mote = 0; mote < 26; mote += 1) this.addParticle({ x: seed.x + (Math.random() - .5) * seed.radius, y: seed.y - 90 - Math.random() * 190, vx: (Math.random() - .5) * 22, vy: 22 + Math.random() * 45, size: 2 + mote % 3, color: mote % 3 ? '#b7ec58' : '#fff3a0', gravity: 18, life: 1.3 + Math.random(), bounce: .1, drag: .985 }); }
      return;
    }
    const impactDuration = event.type === 'gale' ? 3000 : event.type === 'eruption' ? 3100 : event.type === 'flood' ? 2400 : event.type === 'bombardment' ? 1900 : event.type === 'lightning' ? 1650 : 1300; this.arenaVisual = { event, started: performance.now(), duration: impactDuration, impact: true }; this.focusArenaEvent(event, impactDuration + 450);
    if (event.type === 'gale') { for (const move of event.galeMoves || []) { const player = this.visualPlayers.get(move.playerId); if (player) player.galeAnimation = { ...move, direction: event.windDirection || 1, started: performance.now(), duration: 3000 }; } for (const tree of this.visualObjects.filter((object) => object.active && object.type?.startsWith('tree'))) this.spawnTreeLeaves(tree, { count: tree.treeSize === 'large' ? 34 : 18, force: 150 + Math.abs(event.windForce || 110) * .45, lift: 105 }); }
    this.shake = Math.max(this.shake, event.type === 'tectonic' ? 34 : event.type === 'eruption' ? 31 : event.type === 'bombardment' ? 25 : event.type === 'lightning' ? 21 : ['supply', 'luckyWinds', 'flood'].includes(event.type) ? 5 : 16);
    this.impactFlash = { started: performance.now(), duration: event.type === 'lightning' ? 520 : event.type === 'eruption' ? 460 : event.type === 'luckyWinds' ? 680 : 300, color: event.type === 'lightning' || event.type === 'flood' ? '#b9f4ff' : event.type === 'bombardment' || event.type === 'eruption' ? '#ff7a3d' : event.type === 'luckyWinds' || event.type === 'supply' ? '#ffd45f' : '#d7ff68' };
    for (const impact of event.impacts || []) for (let i = 0; i < (event.type === 'tectonic' ? 110 : event.type === 'eruption' ? 48 : 64); i += 1) this.addParticle({ x: event.type === 'eruption' ? impact.originX + (Math.random() - .5) * 20 : impact.x + (Math.random() - .5) * impact.radius, y: event.type === 'eruption' ? impact.originY - Math.random() * 15 : impact.y - Math.random() * 18, vx: (Math.random() - .5) * (event.type === 'tectonic' ? 90 : event.type === 'eruption' ? 105 : 175), vy: event.type === 'flood' ? -90 - Math.random() * 150 : -55 - Math.random() * (event.type === 'eruption' ? 235 : 165), size: 3 + i % 4, color: event.type === 'flood' ? (i % 2 ? '#8ae1ff' : '#d7f8ff') : event.type === 'lightning' ? (i % 2 ? '#9ee8ff' : '#ffffff') : event.type === 'bombardment' || event.type === 'eruption' ? FIRE[i % FIRE.length] : event.type === 'tectonic' ? (i % 2 ? '#7f965d' : '#c8db7a') : i % 3 ? '#65755a' : '#a9bc68', gravity: 220, life: 1.1 + Math.random(), bounce: .3, drag: .982 });
    for (const drop of event.drops || []) {
      const info = collectibleInfo(drop.type);
      for (let i = 0; i < (drop.type === 'lootbox' ? 72 : 38); i += 1) this.addParticle({ x: drop.x + (Math.random() - .5) * 28, y: drop.y - 15 - Math.random() * 70, vx: (Math.random() - .5) * (drop.type === 'lootbox' ? 110 : 48), vy: -20 - Math.random() * 90, size: 2 + i % 4, color: i % 4 ? info.color : '#fff8cf', gravity: 55, life: .8 + Math.random() * 1.1, bounce: .15, drag: .975 });
      this.floaters.push({ x: drop.x, y: drop.y - 28, text: drop.type === 'lootbox' ? 'LOOTBOX RARA!' : 'SUPRIMENTO ENTREGUE', age: 0, life: 1.8, color: info.color });
    }
    if (event.type === 'flora') for (const seed of event.seeds || []) { const tech = this.game?.terrain?.type === 'technology'; for (let leaf = 0; leaf < 70; leaf += 1) { const angle = leaf / 70 * Math.PI * 2; this.addParticle({ x: seed.x + (Math.random() - .5) * seed.radius * .55, y: seed.y - Math.random() * 40, vx: Math.cos(angle) * (35 + Math.random() * 90), vy: -55 - Math.random() * 155, size: 2 + leaf % 4, color: tech ? leaf % 3 ? '#55c6e8' : '#d8faff' : leaf % 3 ? '#76b958' : '#d9ee7a', gravity: 110, life: .7 + Math.random() * 1.1, bounce: .12, drag: .975 }); } this.floaters.push({ x: seed.x, y: seed.y - 72, text: tech ? 'INSTALACOES ATIVADAS' : 'FLORESTA GERMINADA', age: 0, life: 2, color: tech ? '#7ce5f4' : '#9bea72' }); }
    if (event.type === 'lightning') for (const id of new Set(event.blockedPlayerIds || [])) { const player = this.visualPlayers.get(id); if (player) this.spawnElectricLock(player.renderX, player.renderY); }
    for (const interaction of event.interactions || []) { const color = interaction.type.includes('radar') || interaction.type.includes('shockCoil') ? '#64e8ff' : interaction.type.includes('fuel') || interaction.type === 'barrel' ? '#ff7147' : '#d6b070'; for (let i = 0; i < 42; i += 1) this.addParticle({ x: interaction.x, y: interaction.y, vx: (Math.random() - .5) * 150, vy: -35 - Math.random() * 125, size: 2 + i % 5, color, gravity: 190, life: .55 + Math.random() * .7, bounce: .22, drag: .97 }); }
    for (const interaction of event.interactions || []) for (const fragment of interaction.fragments || []) { const duration = Math.max(420, fragment.path.length / SHOT_PATH_RATE * 1000); this.structureAnimations.push({ type: 'buildingFragment', id: fragment.id, path: fragment.path, size: fragment.size, started: performance.now(), duration }); this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, performance.now() + duration); }
    if (event.type === 'luckyWinds') for (const id of event.healedPlayerIds || []) { const player = this.visualPlayers.get(id); if (player) for (let i = 0; i < 55; i += 1) { const angle = i / 55 * Math.PI * 2; this.addParticle({ x: player.renderX + Math.cos(angle) * 44, y: player.renderY + Math.sin(angle) * 25, vx: -Math.cos(angle) * 30, vy: -55 - Math.random() * 60, size: 2 + i % 4, color: i % 3 ? '#ffd45f' : '#fff8c2', gravity: -8, life: .75 + Math.random() * .55, bounce: 0, drag: .97 }); } }
  }

  focusArenaEvent(event, duration) { const points = [...(event.impacts || []), ...(event.drops || []), ...(event.seeds || []), ...(event.tornadoes || []).map((site) => ({ x: site.x, y: site.y - site.height / 2 })), ...(event.lavaRivers || []).map((river) => ({ x: river.x, y: river.surfaceY }))]; if (!points.length) return; if (!this.eventReturnCamera) this.eventReturnCamera = { ...this.camera }; this.cameraReturn = null; const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x)); if (event.type === 'supply') { const zoom = clamp(VIEW.width / Math.max(1280, maxX - minX + 680), MIN_ZOOM, .68); this.eventCamera = { x: (minX + maxX) / 2, y: 130, zoom, until: performance.now() + duration }; return; } const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y)); const zoom = clamp(Math.min(VIEW.width / Math.max(920, maxX - minX + 620), VIEW.height / Math.max(600, maxY - minY + 420)), MIN_ZOOM, .7); this.eventCamera = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom, until: performance.now() + duration }; }

  focusShotAftermath(shot) {
    if (shot.bunkerBuster && shot.impact) { this.actionCamera = { x: shot.impact.x, y: shot.impact.y + 36, zoom: clamp(this.userZoom, MIN_ZOOM, 1.1), until: performance.now() + 4150 }; return; }
    const important = new Set(['buildingCollapse', 'watchtowerCollapse', 'treeFall', 'wreckingBall', 'craneCollapse', 'fuelTankBlast', 'radarPulse', 'supplyCacheOpen', 'shockCoilBurst', 'ammoTerminalBreak', 'shieldGeneratorBurst', 'repulsorPulse', 'repulsorBurst', 'droneMissile', 'teslaChain', 'seismicWave', 'meteorImpact']);
    const points = [shot.impact, ...(shot.interactions || []).filter((point) => important.has(point.type) && Number.isFinite(point.x) && Number.isFinite(point.y))].filter(Boolean);
    if (shot.weapon === 'meteorSalvo') for (const meteor of shot.interactions || []) if (meteor.type === 'meteorImpact') points.push({ x: meteor.x, y: meteor.fromY });
    for (const hit of shot.damage || []) { const player = this.visualPlayers.get(hit.playerId); if (player && hit.amount > 0) points.push(this.renderPosition(player)); }
    if (shot.teleport) points.push({ x: shot.teleport.toX, y: shot.teleport.toY });
    this.actionFocusPoints.push(...points.map((point) => ({ x: clamp(point.x, 0, WORLD.width), y: clamp(point.y, 0, WORLD.height) })));
    const focusPoints = this.actionFocusPoints;
    const minX = Math.min(...focusPoints.map((point) => point.x)); const maxX = Math.max(...focusPoints.map((point) => point.x)); const minY = Math.min(...focusPoints.map((point) => point.y)); const maxY = Math.max(...focusPoints.map((point) => point.y));
    const maxZoom = shot.megaMissile || shot.weapon === 'gravity' ? .7 : 1.05; const zoom = clamp(Math.min(VIEW.width / Math.max(620, maxX - minX + 460), VIEW.height / Math.max(440, maxY - minY + 330)), MIN_ZOOM, maxZoom);
    const delayedUntil = shot.delayedStrike ? performance.now() + Math.max(0, ...((this.game?.delayedStrikes || []).filter((strike) => strike.weapon === shot.weapon && Math.abs(strike.x - shot.impact.x) < 5).map((strike) => strike.executeAt - this.worldNow() + (strike.weapon === 'megaCannon' ? 1850 : 1250)))) : 0;
    this.actionCamera = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom, until: Math.max(performance.now() + 900, this.tankAnimationEndsAt, this.explosionAnimationEndsAt, delayedUntil) + 180 };
  }

  moveCameraTo(point, zoom, dt, anchor = .67) { const ease = 1 - Math.pow(.001, dt); this.camera.zoom += (Math.max(zoom, this.minZoom()) - this.camera.zoom) * ease; const viewW = VIEW.width / this.camera.zoom; const targetX = viewW >= this.arenaWidth() ? 0 : clamp(point.x - viewW / 2, 0, this.arenaWidth() - viewW); const targetY = this.cameraYFor(point.y, this.camera.zoom, anchor); this.camera.x += (targetX - this.camera.x) * ease; this.camera.y += (targetY - this.camera.y) * ease; }

  cameraYFor(focusY, zoom = this.camera.zoom, anchor = .67) { const viewH = VIEW.height / zoom; const bottomLimit = Math.min(WORLD.height, this.displayLavaLevel() + 24); if (viewH >= bottomLimit) return bottomLimit - viewH; return clamp(focusY - viewH * anchor, 0, bottomLimit - viewH); }

  displayLavaLevel(time = performance.now()) { if (!this.lavaAnimation) return this.game?.lavaLevel ?? WORLD.height - 24; const progress = clamp((time - this.lavaAnimation.started) / this.lavaAnimation.duration, 0, 1); return this.lavaAnimation.from + (this.lavaAnimation.to - this.lavaAnimation.from) * (1 - Math.pow(1 - progress, 3)); }

  loop(time) {
    requestAnimationFrame((next) => this.loop(next));
    try {
      const frameTime = Number.isFinite(time) ? time : performance.now(); const dt = Math.min(.05, Math.max(0, (frameTime - this.lastTime) / 1000)); this.lastTime = frameTime; this.frameDt = dt;
      this.updatePlayers(dt); this.updateObjectEffects(frameTime); this.updateCamera(dt, frameTime); this.clampCamera(); this.updateParticles(dt); this.draw(frameTime); this.flushCompletionHandlers();
    } catch (error) {
      const now = performance.now(); if (now - this.lastRenderErrorAt > 3000) { this.lastRenderErrorAt = now; console.error('Falha recuperável no quadro de animação:', error); }
    }
  }

  updatePlayers(dt) {
    const ease = 1 - Math.pow(.02, dt);
    for (const p of this.visualPlayers.values()) {
      if (p.hidden) continue;
      if (p.splitDeath) {
        p.renderX = p.splitDeath.x; p.renderY = p.splitDeath.y;
        if (Math.random() < .65) this.addParticle({ kind: 'spark', x: p.renderX + (Math.random() - .5) * 26, y: p.renderY + (Math.random() - .5) * 23, vx: (Math.random() - .5) * 75, vy: -45 - Math.random() * 70, size: 2 + Math.random() * 2, color: Math.random() < .45 ? '#fff8fc' : '#bd75ff', gravity: 18, life: .35 + Math.random() * .45, bounce: 0, drag: .95 });
        if (performance.now() - p.splitDeath.started >= p.splitDeath.duration) { p.splitDeath = null; p.visualAlive = false; this.skullClouds.push({ x: p.renderX, y: p.renderY, started: performance.now(), duration: 2800 }); this.spawnTankFragments(p); this.onTankDestroyed?.(p); }
        continue;
      }
      if (p.reviveAnimation) {
        const revival = p.reviveAnimation; const progress = clamp((performance.now() - revival.started) / revival.duration, 0, 1);
        const descent = clamp((progress - .16) / .75, 0, 1); const eased = descent * descent * (3 - 2 * descent);
        p.renderX = revival.toX; p.renderY = revival.fromY + (revival.toY - revival.fromY) * eased - Math.sin(progress * Math.PI * 6) * (1 - descent) * 3;
        p.moving = false;
        for (let index = 0; index < 3; index += 1) this.addParticle({ kind: 'spark', x: p.renderX + (Math.random() - .5) * 39, y: p.renderY + (Math.random() - .5) * 26, vx: (Math.random() - .5) * 42, vy: -35 - Math.random() * 80, size: 2 + index % 2, color: index ? '#59efa8' : '#e8fff0', gravity: -12, life: .45 + Math.random() * .5, bounce: 0, drag: .96 });
        if (progress >= 1) { p.renderX = revival.toX; p.renderY = revival.toY; p.reviveAnimation = null; this.spawnLandingEffect(p.renderX, p.renderY, false); }
        continue;
      }
      if (p.galeAnimation) { const gust = p.galeAnimation; const progress = clamp((performance.now() - gust.started) / gust.duration, 0, 1); const eased = .5 - Math.cos(progress * Math.PI) / 2; p.renderX = gust.fromX + (gust.toX - gust.fromX) * eased; p.renderY = this.terrainHeights[Math.round(clamp(p.renderX, 0, WORLD.width - 1))] - WORLD.tankRadius; p.moving = true; if (Math.random() < .55) this.addParticle({ x: p.renderX - gust.direction * 14, y: p.renderY + 8, vx: -gust.direction * (45 + Math.random() * 80), vy: -10 - Math.random() * 40, size: 2 + Math.random() * 4, color: Math.random() < .5 ? '#a58b62' : '#647b54', gravity: 45, life: .45 + Math.random() * .35, bounce: .15, drag: .96 }); if (progress >= 1) p.galeAnimation = null; continue; }
      if (p.launchAnimation) { const launch = p.launchAnimation; const progress = clamp((performance.now() - launch.started) / launch.duration, 0, 1); const dash = ['armoredDash', 'rocketDash', 'ninjaFatal'].includes(launch.kind); const travel = dash ? progress < .12 ? progress * 2.1 : .252 + (progress - .12) / .88 * .748 : .5 - Math.cos(progress * Math.PI) / 2; p.renderX = launch.fromX + (launch.toX - launch.fromX) * travel; const arc = dash ? launch.kind === 'ninjaFatal' ? 0 : 2 : launch.kind === 'spiderLeap' ? launch.arcHeight || 95 : 145; p.renderY = launch.fromY + (launch.toY - launch.fromY) * travel - Math.sin(progress * Math.PI) * arc; p.moving = true; if (dash) { this.shake = Math.max(this.shake, launch.kind === 'armoredDash' ? 2.5 : 1.3); for (let trail = 0; trail < 4; trail += 1) if (Math.random() < .85) { const smoke = trail === 0; this.addParticle({ kind: smoke ? 'smoke' : 'spark', x: p.renderX - p.facing * (15 + trail * 7), y: p.renderY + 5 + (Math.random() - .5) * 10, vx: -p.facing * (100 + Math.random() * 210), vy: (Math.random() - .5) * 75, size: smoke ? 7 + Math.random() * 6 : 2 + Math.random() * 4, color: launch.kind === 'ninjaFatal' ? smoke ? '#4b365f' : trail % 2 ? '#bc75ff' : '#fff4ff' : smoke ? '#59606a' : trail % 2 ? '#ff8066' : '#fff2a0', gravity: smoke ? -3 : 80, life: smoke ? .55 + Math.random() * .35 : .26 + Math.random() * .24, bounce: 0, drag: .93 }); } } if (progress >= 1) p.launchAnimation = null; continue; }
      const dx = p.targetX - p.renderX; const dy = p.targetY - p.renderY; p.moving = Math.abs(dx) > .8 || Math.abs(dy) > .8;
      p.renderX += dx * ease;
      const controlledFlight = this.game?.harpoonPull?.playerId === p.id || this.game?.soapBubbles?.some((bubble) => bubble.playerId === p.id && this.worldNow() >= bubble.impactAt && this.worldNow() < bubble.executeAt);
      const motion = tankMotionState(this.game, p, this.worldNow());
      const followsGround = p.moving && [TANK_STATE.GROUNDED, TANK_STATE.MOVING].includes(motion) && !p.supportPlatformId && (p.climbingUntil || 0) <= performance.now() && !controlledFlight && this.terrainHeights?.length;
      const animatedY = followsGround ? this.terrainHeights[Math.round(clamp(p.renderX, 0, WORLD.width - 1))] - WORLD.tankRadius : p.targetY;
      p.renderY += (animatedY - p.renderY) * ease; p.dustTimer = (p.dustTimer || 0) - dt;
      if (this.game?.harpoonPull?.playerId === p.id && p.dustTimer <= 0) { const direction = Math.sign(this.game.harpoonPull.toX - this.game.harpoonPull.fromX) || p.facing; for (let spark = 0; spark < 9; spark += 1) this.addParticle({ kind: spark % 4 ? 'spark' : 'smoke', x: p.renderX - direction * (14 + spark * 3), y: p.renderY + (Math.random() - .5) * 18, vx: -direction * (65 + Math.random() * 100), vy: (Math.random() - .5) * 70, size: spark % 4 ? 2 + spark % 3 : 6, color: spark % 4 ? spark % 2 ? '#70ffdb' : '#e9fff5' : '#41696d', gravity: 15, life: .25 + Math.random() * .35, bounce: 0, drag: .93 }); p.dustTimer = .045; }
      else if ((p.airborne?.falling || p.airborne?.vy > 65) && p.dustTimer <= 0) {
        for (let trail = 0; trail < 4; trail += 1) this.addParticle({ kind: 'spark', x: p.renderX + (Math.random() - .5) * 18, y: p.renderY - 12 - trail * 5, vx: (Math.random() - .5) * 26, vy: -35 - Math.random() * 35, size: 2 + trail % 2, color: trail % 2 ? '#d7e5e2' : '#6bbdd5', gravity: 12, life: .4, bounce: 0, drag: .96 });
        p.dustTimer = .09;
      } else if (p.airborne && p.dustTimer <= 0) { const parachute = p.airborne.parachute; for (let trail = 0; trail < (parachute ? 2 : 5); trail += 1) this.addParticle({ kind: parachute ? 'spark' : trail % 2 ? 'smoke' : 'spark', x: p.renderX - (p.airborne.vx ? Math.sign(p.airborne.vx) : p.facing) * (12 + trail * 3), y: p.renderY + 7 + (Math.random() - .5) * 5, vx: -p.airborne.vx * .12 + (Math.random() - .5) * 30, vy: parachute ? 8 + Math.random() * 18 : 22 + Math.random() * 65, size: parachute ? 2 : 3 + Math.random() * 4, color: parachute ? '#dff8ff' : trail % 2 ? '#5c6870' : '#42f5d7', gravity: parachute ? 20 : 55, life: parachute ? .5 : .65 + Math.random() * .4, bounce: 0, drag: .96 }); p.dustTimer = parachute ? .12 : .04; }
      else if (motion === TANK_STATE.WALL && p.moving && p.dustTimer <= 0) { for (let leg = 0; leg < 3; leg += 1) this.addParticle({ kind: 'spark', x: p.renderX + p.wallClinging * 11, y: p.renderY + leg * 7 - 7, vx: -p.wallClinging * (8 + Math.random() * 18), vy: 20 + Math.random() * 25, size: 1.5 + leg % 2, color: leg % 2 ? '#d28cff' : '#f0dfff', gravity: 20, life: .28, bounce: 0, drag: .95 }); p.dustTimer = .09; }
      else if (p.moving && motion === TANK_STATE.MOVING && !controlledFlight && p.dustTimer <= 0) { this.spawnTrackDust(p.renderX, p.renderY + 10, Math.sign(dx) || p.facing); p.dustTimer = .075; }
    }
  }

  updateCamera(dt, time) {
    if (!this.game) return;
    if (this.deathCamera && time < this.deathCamera.until) { this.moveCameraTo(this.deathCamera, clamp(this.userZoom, .85, 1.25), dt, .62); return; }
    if (this.deathCamera) this.deathCamera = null;
    const sentryActions = this.sentryBursts.filter((burst) => time - burst.started < burst.duration);
    if (sentryActions.length) {
      const points = sentryActions.flatMap((burst) => [{ x: burst.x, y: burst.y }, ...(burst.bullets || []).map((bullet, index) => { const flight = clamp((time - burst.started - index * 140) / 340, 0, 1); return { x: bullet.fromX + (bullet.x - bullet.fromX) * flight, y: bullet.fromY + (bullet.y - bullet.fromY) * flight }; })]);
      const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x)); const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y));
      const zoom = clamp(Math.min(this.userZoom, VIEW.width / Math.max(300, maxX - minX + 180), VIEW.height / Math.max(220, maxY - minY + 160)), MIN_ZOOM, this.userZoom);
      this.moveCameraTo({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, zoom, dt, .6); return;
    }
    if (this.sentryReturnCamera) { this.cameraReturn = { from: { ...this.camera }, to: this.sentryReturnCamera, started: time, duration: 720, sentry: true }; this.sentryReturnCamera = null; }
    if (this.cameraReturn?.sentry) { const progress = clamp((time - this.cameraReturn.started) / this.cameraReturn.duration, 0, 1); const eased = 1 - Math.pow(1 - progress, 3); for (const key of ['x', 'y', 'zoom']) this.camera[key] = this.cameraReturn.from[key] + (this.cameraReturn.to[key] - this.cameraReturn.from[key]) * eased; if (progress >= 1) this.cameraReturn = null; return; }
    if (this.cameraMode === 'fixed') {
      if (!this.fixedCameraInitialized) { const focus = this.visualPlayers.get(this.playerId) || selectCameraPlayer(this.visualPlayers, this.game.players[this.game.turnIndex]?.id, this.playerId); if (focus) { const point = this.renderPosition(focus); this.camera.zoom = this.userZoom; this.camera.x = point.x - VIEW.width / (2 * this.userZoom); this.camera.y = this.cameraYFor(point.y, this.userZoom, .64); this.clampCamera(); this.fixedCameraInitialized = true; } }
      return;
    }
    if (time < this.manualMapUntil && this.battleAnimationsComplete() && !this.eventCamera && !this.actionCamera) return;
    const activePulse = this.saboteurPulses.find((pulse) => time - pulse.started < pulse.duration);
    if (activePulse) { this.moveCameraTo(activePulse, clamp(Math.min(this.userZoom, VIEW.width / (activePulse.radius * 2 + 140)), MIN_ZOOM, 1), dt, .62); return; }
    const activeHeat = this.heatPulses.find((pulse) => time - pulse.started < pulse.duration);
    if (activeHeat) { this.moveCameraTo(activeHeat, clamp(Math.min(this.userZoom, VIEW.width / (activeHeat.radius * 2 + 160)), MIN_ZOOM, 1), dt, .62); return; }
    const activeDash = [...this.visualPlayers.values()].find((player) => player.launchAnimation?.kind === 'armoredDash' && time - player.launchAnimation.started < player.launchAnimation.duration);
    if (activeDash) { this.moveCameraTo(this.renderPosition(activeDash), clamp(this.userZoom, MIN_ZOOM, 1.2), dt, .62); return; }
    if (this.game.harpoonPull) { const pull = this.game.harpoonPull; const moving = this.visualPlayers.get(pull.playerId); this.moveCameraTo(moving ? this.renderPosition(moving) : { x: pull.toX, y: pull.toY }, clamp(this.userZoom, MIN_ZOOM, 1.1), dt, .62); return; }
    if (this.game.soapBubbles?.length) { const bubbles = this.game.soapBubbles.filter((bubble) => this.worldNow() >= bubble.impactAt); if (bubbles.length) { const x = bubbles.reduce((sum, bubble) => sum + bubble.x, 0) / bubbles.length; const y = bubbles.reduce((sum, bubble) => sum + bubble.y, 0) / bubbles.length; this.moveCameraTo({ x, y }, clamp(Math.min(this.userZoom, VIEW.width / (WEAPON_BALANCE.soapBomb.radius * 2 + 100)), MIN_ZOOM, 1), dt, .62); return; } }
    if (this.eventCamera && time < this.eventCamera.until) { const ease = 1 - Math.pow(.0004, dt); this.camera.zoom += (this.eventCamera.zoom - this.camera.zoom) * ease; const viewW = VIEW.width / this.camera.zoom; const targetX = viewW >= WORLD.width ? (WORLD.width - viewW) / 2 : clamp(this.eventCamera.x - viewW / 2, 0, WORLD.width - viewW); const targetY = this.cameraYFor(this.eventCamera.y, this.camera.zoom, .62); this.camera.x += (targetX - this.camera.x) * ease; this.camera.y += (targetY - this.camera.y) * ease; return; }
    if (this.eventCamera) { this.eventCamera = null; if (this.eventReturnCamera) { this.cameraReturn = { from: { ...this.camera }, to: this.eventReturnCamera, started: time, duration: 720 }; this.eventReturnCamera = null; } }
    const shot = this.shots.find((entry) => this.shotIndex(entry, time) < entry.path.length);
    if (shot) { const point = shot.path[Math.max(0, this.shotIndex(shot, time))]; const zoom = shot.megaMissile || shot.weapon === 'gravity' ? .7 : shot.weapon === 'heavy' ? .86 : .96; if (point) this.moveCameraTo(point, clamp(zoom, MIN_ZOOM, 1.05), dt, .62); return; }
    const waterRecoilPlayer = [...this.visualPlayers.values()].find((player) => player.airborne?.fromWaterCannonRecoil);
    if (waterRecoilPlayer) { this.moveCameraTo(this.renderPosition(waterRecoilPlayer), clamp(this.userZoom, MIN_ZOOM, 1.12), dt, .62); return; }
    if (this.aimDragCamera && time < this.aimDragCamera.until && this.game.phase === 'playing') {
      const player = this.visualPlayers.get(this.playerId);
      if (player?.alive && this.game.players[this.game.turnIndex]?.id === this.playerId) {
        const origin = this.renderPosition(player); const impact = this.aimPreviewImpact || origin;
        const zoom = clamp(Math.min(this.userZoom, 1080 / (Math.abs(impact.x - origin.x) + 180), 570 / (Math.abs(impact.y - origin.y) + 120)), MIN_ZOOM, this.userZoom);
        this.moveCameraTo({ x: (origin.x + impact.x) / 2, y: (origin.y + impact.y) / 2 }, zoom, dt, .58); return;
      }
    }
    if (this.aimDragCamera && time >= this.aimDragCamera.until) this.aimDragCamera = null;
    if (this.turnFocus && this.battleAnimationsComplete()) { const player = this.visualPlayers.get(this.turnFocus.playerId); if (player && !player.hidden) { this.turnFocus.acquired ??= time; this.actionCamera = null; this.actionReturnCamera = null; this.cameraReturn = null; this.moveCameraTo(this.renderPosition(player), turnCameraZoom(this.userZoom, MIN_ZOOM), dt, .64); if (time - this.turnFocus.acquired >= 1450) this.turnFocus = null; return; } this.turnFocus = null; }
    if (this.actionCamera) {
      if (!this.battleAnimationsComplete() || time < this.actionCamera.until) { this.moveCameraTo(this.actionCamera, this.actionCamera.zoom, dt, .62); return; }
      this.actionCamera = null; if (this.actionReturnCamera) { this.cameraReturn = { from: { ...this.camera }, to: this.actionReturnCamera, started: time, duration: 720 }; this.actionReturnCamera = null; }
    }
    if (this.cameraReturn) { const progress = clamp((time - this.cameraReturn.started) / this.cameraReturn.duration, 0, 1); const eased = 1 - Math.pow(1 - progress, 3); for (const key of ['x', 'y','zoom']) this.camera[key] = this.cameraReturn.from[key] + (this.cameraReturn.to[key] - this.cameraReturn.from[key]) * eased; if (progress >= 1) this.cameraReturn = null; return; }
    const focus = selectCameraPlayer(this.visualPlayers, this.game.players[this.game.turnIndex]?.id, this.playerId); if (!focus) return;
    this.moveCameraTo(this.renderPosition(focus), this.userZoom, dt, .64);
  }

  draw(time) {
    const c = this.ctx; c.imageSmoothingEnabled = false; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, VIEW.width, VIEW.height); this.drawSky(c, time); if (!this.game) return; this.drawMegaSky(c, time);
    c.save(); c.translate((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake); c.scale(this.camera.zoom, this.camera.zoom); c.translate(-this.camera.x, -this.camera.y);
    this.drawBlockMountains(c, time); c.drawImage(this.terrainCanvas, 0, 0); this.drawWorldLava(c, time); this.drawWaterZones(c, time); this.drawWaterOrbs(c, time); this.drawIceZones(c, time); this.drawWindVortices(c, time); this.drawFloatingPlatforms(c, time); this.drawIceShatters(c, time);
    for (const item of this.visualPowerups.filter((entry) => !entry.revealed)) this.drawBuriedSignal(c, item, time);
    const deferredItems = new Set(this.pendingPowerupReveals.map((item) => item.id));
    for (const item of this.visualPowerups.filter((entry) => entry.active && !deferredItems.has(entry.id))) {
      this.drawPowerup(c, item, time);
    }
    for (const mine of this.game.mines.filter((entry) => entry.active)) {
      const platform = mine.supportPlatformId && this.visualPlatforms.find((entry) => entry.id === mine.supportPlatformId && entry.active);
      this.drawMine(c, platform && Number.isFinite(mine.platformOffset) ? { ...mine, x: this.platformX(platform) + mine.platformOffset, y: platform.y - 3 } : mine, time);
    }
    for (const object of this.visualObjects) {
      const platform = object.supportPlatformId && this.visualPlatforms.find((entry) => entry.id === object.supportPlatformId && entry.active);
      c.save();
      if (platform && Number.isFinite(object.platformOffset)) c.translate(this.platformX(platform) + object.platformOffset - object.x, 0);
      this.drawScenarioObject(c, object, time);
      c.restore();
    }
    this.drawStructureWaterFlows(c, time);
    this.drawHillZone(c, time); this.drawDelayedStrikes(c, time); this.drawMegaBeam(c, time);
    this.drawFireworkAnimations(c, time); this.drawStructureAnimations(c, time); this.drawSaboteurPulses(c, time); this.drawSentryBursts(c, time); this.drawTeslaAndMagnetEffects(c, time); this.drawZeusAnimations(c, time); this.drawGravityAnimations(c, time);
    for (const grave of this.visualGraves) this.drawGrave(c, grave);
    for (const zone of this.game.fireZones || []) this.drawFireZone(c, zone, time);
    this.drawHeatPulses(c, time); this.drawWeatherClouds(c, time);
    this.drawClassPulses(c, time);
    this.drawSpecialistControl(c, time);
    for (const player of this.game.players) this.drawTank(c, this.visualPlayers.get(player.id), this.game.players[this.game.turnIndex]?.id === player.id, time);
    for (const object of this.visualObjects) if (object.active && object.type === 'treeSmall') this.drawTreeCover(c, object, time);
    this.drawNinjaGhosts(c, time);
    this.drawSoapBubbles(c, time); this.drawHarpoonCable(c, time); this.drawNinjaSlashes(c, time);
    this.drawMovementPreview(c, time); this.drawBlinkPreview(c, time); this.drawNinjaFatalPreview(c, time);
    this.drawArenaVisual(c, time);
    this.drawAim(c); this.drawShots(c, time); this.drawMeteorAnimations(c, time); this.drawBomberGrenades(c, time); this.drawFlamethrower(c, time); this.drawMuzzleBursts(c, time); this.drawImpactEchoes(c, time); this.drawDrills(c, time); this.drawMushroomClouds(c, time); this.drawSkullClouds(c, time); this.drawParticles(c); c.restore(); this.drawRain(c, time); this.drawSnow(c, time); this.drawImpactFlash(c, time); this.drawEnemyIndicators(c, time); this.drawMinimap(c);
  }

  drawFlamethrower(c, time) {
    this.flameVolleys = (this.flameVolleys || []).filter((volley) => time - volley.started < volley.durationMs);
    for (const volley of this.flameVolleys) {
      const progress = Math.min(1, (time - volley.started) / volley.durationMs);
      c.save(); c.globalCompositeOperation = 'screen';
      for (let ray = 0; ray < volley.rays.length; ray += 1) {
        const path = volley.rays[ray]; const visible = Math.max(1, Math.floor(path.length * Math.min(1, progress * 1.7)));
        for (let index = 1; index < visible; index += 1) {
          const point = path[index]; const fade = (1 - progress) * (1 - index / Math.max(path.length, 1) * .4);
          c.globalAlpha = .3 + fade * .7; c.fillStyle = index % 3 ? '#ff7946' : '#ffe388';
          const size = Math.max(3, 9 - index * .15); c.fillRect(point.x - size / 2, point.y - size / 2 + Math.sin(time / 43 + index * 2 + ray) * 3, size, size);
          if (index % 3 === 0) { c.fillStyle = '#fff4b0'; c.fillRect(point.x, point.y - size, 2, 2); }
        }
      }
      c.restore();
    }
  }

  drawSky(c, time) {
    const cycle = ((this.game?.turnNumber || 1) - 1) % 16 / 16; const daylight = (Math.cos(cycle * Math.PI * 2) + 1) / 2; const mix = (night, day) => { const n = Number.parseInt(night.slice(1), 16); const d = Number.parseInt(day.slice(1), 16); const channel = (shift) => Math.round(((n >> shift) & 255) * (1 - daylight) + ((d >> shift) & 255) * daylight); return `rgb(${channel(16)},${channel(8)},${channel(0)})`; };
    if (this.game?.terrain?.type === 'technology') this.drawTechnologySky(c, time, daylight);
    else {
    const biomeSky = BIOMES[this.game?.terrain?.type]?.sky || ['#050916', '#4f91bd'];
    c.fillStyle = mix(...biomeSky); c.fillRect(0, 0, VIEW.width, VIEW.height);
    for (let i = 0; i < 46; i += 1) { const x = (i * 193 + 31) % VIEW.width; const y = (i * 67 + 18) % 285; c.globalAlpha = (1 - daylight) * (.55 + Math.sin(time / 900 + i) * .15); c.fillStyle = '#dbe9ff'; c.fillRect(x, y, 2, 2); } c.globalAlpha = 1;
    const celestialX = 120 + cycle * (VIEW.width - 240); const celestialY = 185 - Math.sin(cycle * Math.PI) * 105; c.fillStyle = daylight > .5 ? '#ffe69b' : '#d9e7ff'; c.globalAlpha = .35 + Math.abs(daylight - .5); for (let size = daylight > .5 ? 42 : 31; size >= 10; size -= 8) { c.globalAlpha *= .82; c.fillRect(Math.round(celestialX - size / 2), Math.round(celestialY - size / 2), size, size); } c.globalAlpha = 1;
    for (let layer = 0; layer < 3; layer += 1) { const speed = 4 + layer * 3; const span = 310 - layer * 45; const offset = ((time / 1000 * speed + this.camera.x * (.012 + layer * .009)) % span + span) % span; c.globalAlpha = (.08 + layer * .035) * (.45 + daylight * .55); c.fillStyle = mix('#53627e', '#eef4eb'); for (let index = -1; index < 7; index += 1) { const x = index * span - offset; const y = 95 + layer * 58 + (index % 3) * 9; c.fillRect(x, y, 96, 10); c.fillRect(x + 18, y - 9, 52, 9); c.fillRect(x + 40, y - 16, 31, 7); } } c.globalAlpha = 1;
    }
    const climate = weatherVisualState(this.game, this.worldNow());
    if (climate.cloud > .01) {
      c.fillStyle = `rgba(5,14,28,${climate.cloud.toFixed(3)})`; c.fillRect(0, 0, VIEW.width, VIEW.height);
      c.save(); c.globalAlpha = clamp(climate.cloud * 1.8, 0, 1);
      for (let index = 0; index < 15; index += 1) {
        const speed = .008 + index % 3 * .003 + climate.wind * (.08 + index % 3 * .018) + Math.abs(this.game?.wind || 0) * .00025;
        const x = Math.round(((index * 113 - time * speed) % (VIEW.width + 240) + VIEW.width + 240) % (VIEW.width + 240) - 120);
        const y = 24 + index % 4 * 30; c.fillStyle = index % 3 ? '#33495c' : '#45586a'; c.fillRect(x, y, 118, 16); c.fillRect(x + 16, y - 11, 83, 12); c.fillRect(x + 38, y - 21, 44, 11); c.fillStyle = '#22394c'; c.fillRect(x + 6, y + 15, 111, 5);
      }
      c.restore();
    }
  }

  drawTechnologySky(c, time, daylight) {
    const gradient = c.createLinearGradient(0, 0, 0, VIEW.height);
    gradient.addColorStop(0, daylight > .45 ? '#0b2440' : '#071426');
    gradient.addColorStop(.7, daylight > .45 ? '#163856' : '#0e263d');
    gradient.addColorStop(1, daylight > .45 ? '#244b61' : '#173548');
    c.fillStyle = gradient; c.fillRect(0, 0, VIEW.width, VIEW.height);
    c.save(); c.globalAlpha = .13;
    c.strokeStyle = '#65c9eb'; c.lineWidth = 1;
    for (let x = 0; x < VIEW.width; x += 64) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, VIEW.height); c.stroke(); }
    for (let y = 36; y < VIEW.height; y += 52) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(VIEW.width, y + .5); c.stroke(); }
    c.restore();
    const nodeX = Math.round(VIEW.width * .72); const nodeY = 115;
    c.save(); c.globalAlpha = .35 + .11 * Math.sin(time / 650); c.strokeStyle = '#73e3f4'; c.lineWidth = 3;
    c.strokeRect(nodeX - 29, nodeY - 29, 58, 58); c.strokeRect(nodeX - 39, nodeY - 39, 78, 78);
    c.fillStyle = '#b5f5fd'; c.fillRect(nodeX - 8, nodeY - 8, 16, 16); c.restore();
    for (let index = 0; index < 36; index += 1) {
      const x = (index * 127 + 47) % VIEW.width; const y = (index * 73 + 21) % 340;
      c.fillStyle = index % 4 ? '#408da7' : '#93e9ef'; c.globalAlpha = .25 + .17 * Math.sin(time / 700 + index);
      c.fillRect(x, y, index % 5 ? 2 : 4, 2);
    }
    c.globalAlpha = 1;
  }

  drawRain(c, time) {
    const strength = weatherVisualState(this.game, this.worldNow()).rain;
    if (strength <= .01) return;
    const count = Math.round(215 * strength); const drift = (this.game.wind || 0) * .35;
    c.save(); c.globalAlpha = .12 + strength * .41;
    for (let index = 0; index < count; index += 1) {
      let x = ((index * 163 + time * (.13 + index % 4 * .027) + drift * time / 48) % (VIEW.width + 70) + VIEW.width + 70) % (VIEW.width + 70) - 35;
      const y = (index * 109 + time * (.35 + index % 5 * .055)) % (VIEW.height + 40) - 20;
      const pointer = this.weatherPointer; if (pointer && time - pointer.at < 500) { const distance = Math.hypot(x - pointer.x, y - pointer.y); if (distance < 82) x += (x === pointer.x ? (index % 2 ? 1 : -1) : Math.sign(x - pointer.x)) * (82 - distance) * .75; }
      c.fillStyle = index % 5 ? '#86cde6' : '#d5f4ff'; c.fillRect(Math.round(x), Math.round(y), 2, 8 + index % 4 * 3);
    }
    c.restore();
  }

  drawSnow(c, time) {
    const strength = weatherVisualState(this.game, this.worldNow()).snow || 0; if (strength <= .01) return;
    c.save(); c.globalAlpha = .35 + strength * .55;
    for (let index = 0; index < Math.round(190 * strength); index += 1) { const speed = .035 + index % 5 * .009; let x = ((index * 137 + time * speed * 9 + Math.sin(time / 420 + index) * 34) % (VIEW.width + 80)) - 40; let y = (index * 83 + time * speed * 5) % (VIEW.height + 50) - 25; const pointer = this.weatherPointer; if (pointer && time - pointer.at < 650) { const distance = Math.hypot(x - pointer.x, y - pointer.y); if (distance < 95) { x += Math.sign(x - pointer.x || 1) * (95 - distance) * .62; y -= (95 - distance) * .18; } } const size = 2 + index % 4; c.fillStyle = index % 6 ? '#dff7ff' : '#ffffff'; c.fillRect(Math.round(x), Math.round(y), size * 2, size); }
    c.restore();
  }

  drawIceZones(c, time) {
    for (const zone of this.game.iceZones || []) {
      if (zone.expiresRound < this.game.roundNumber) continue;
      if (zone.points) {
        const reveal = zone.formedAt ? clamp((this.worldNow() - zone.formedAt) / 670, 0, 1) : 1;
        c.save();
        for (let index = 0; index < zone.points.length; index += 1) {
          const point = zone.points[index];
          if (Math.hypot(point.x - zone.x, point.y - zone.y) > zone.radius * Math.max(.08, reveal)) continue;
          const shimmer = .76 + Math.sin(time / 220 + point.x * .13) * .18;
          c.globalAlpha = shimmer;
          c.fillStyle = index % 4 ? '#5ba8cf' : '#83d9ed'; c.fillRect(point.x - 4, point.y - 6, 8, 8);
          c.fillStyle = index % 5 ? '#d5f8ff' : '#ffffff'; c.fillRect(point.x - 4, point.y - 8, 8, 2);
          if (index % 4 === 0) { c.fillStyle = '#ecffff'; c.fillRect(point.x - 1, point.y - 12 - Math.sin(time / 190 + index) * 2, 2, 5); }
          if (index % 7 === 0 && point.support) {
            const rise = (time / 35 + index * 17) % 26;
            c.globalAlpha = .2 + (1 - rise / 26) * .33;
            c.fillStyle = '#efffff'; c.fillRect(point.x + Math.sin(time / 350 + index) * 8, point.y - 12 - rise, 9 + index % 3 * 3, 4);
          }
        }
        c.restore();
        continue;
      }
      c.save(); c.globalAlpha = .86; c.fillStyle = '#66b9dc'; c.fillRect(zone.x - zone.radius, zone.y - 5, zone.radius * 2, 12); c.fillStyle = '#d9fbff'; c.fillRect(zone.x - zone.radius, zone.y - 7, zone.radius * 2, 3);
      for (let offset = -zone.radius; offset < zone.radius; offset += 13) { const x = zone.x + offset; const height = 4 + Math.abs(Math.sin(offset * .17)) * 13; c.fillStyle = offset % 3 ? '#a9e6f7' : '#ecffff'; c.fillRect(x, zone.y - 7 - height, 4, height); c.fillStyle = '#477ca0'; c.fillRect(x + 5, zone.y + 2, 5, 3); }
      c.strokeStyle = '#f0ffff'; c.lineWidth = 2; for (let crack = -3; crack <= 3; crack += 1) { const x = zone.x + crack * zone.radius / 4; c.beginPath(); c.moveTo(x, zone.y - 7); c.lineTo(x + 11, zone.y + 1); c.lineTo(x - 4, zone.y + 7); c.stroke(); }
      c.restore();
    }
  }

  drawWeatherClouds(c, time) {
    for (const cloud of this.game.weatherClouds || []) {
      const owner = this.game.players.find((player) => player.id === cloud.ownerId);
      if (!owner?.alive) continue;
      const old = this.weatherCloudVisuals.get(cloud.id);
      if (!old || old.toX !== cloud.x || old.toY !== cloud.y) {
        const progress = old ? clamp((time - old.startedAt) / 950, 0, 1) : 1;
        this.weatherCloudVisuals.set(cloud.id, { fromX: old ? old.fromX + (old.toX - old.fromX) * progress : cloud.x, fromY: old ? old.fromY + (old.toY - old.fromY) * progress : cloud.y, toX: cloud.x, toY: cloud.y, startedAt: time });
      }
      const visual = this.weatherCloudVisuals.get(cloud.id);
      const progress = clamp((time - visual.startedAt) / 950, 0, 1);
      const x = visual.fromX + (visual.toX - visual.fromX) * progress;
      const y = visual.fromY + (visual.toY - visual.fromY) * progress;
      const bob = Math.sin(time / 310 + cloud.x) * 5;
      const cloudScale = cloud.radius / 150;
      c.save(); c.translate(x, y + bob); c.scale(cloudScale, cloudScale); c.globalAlpha = .92;
      c.fillStyle = '#293f55'; c.fillRect(-62, -15, 124, 26); c.fillRect(-40, -33, 74, 23); c.fillRect(-13, -45, 45, 17);
      c.fillStyle = '#17293c'; c.fillRect(-54, 10, 110, 8);
      c.globalAlpha = .5;
      for (let rain = 0; rain < 18; rain += 1) { const rx = -55 + rain * 6.2; const drop = (time / 7 + rain * 19) % 125; c.fillStyle = rain % 4 ? '#79cbe8' : '#d8f7ff'; c.fillRect(rx, 20 + drop, 2, 10); }
      c.globalAlpha = .85; c.strokeStyle = owner.color || '#59d9ee'; c.lineWidth = 2 / cloudScale; c.setLineDash([8 / cloudScale, 7 / cloudScale]); c.beginPath(); c.arc(0, 14 / cloudScale, cloud.radius / cloudScale, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      if (this.game.turnNumber > (cloud.activatedTurn ?? 1) && Math.abs(this.game.wind || 0) > 0) {
        const direction = Math.sign(this.game.wind); const drift = (time / 35) % 52;
        c.globalAlpha = .75; c.fillStyle = '#a9efff';
        for (let mark = 0; mark < 3; mark += 1) c.fillRect(-80 - direction * (drift + mark * 22), -8 + mark * 6, 12, 2);
      }
      const strike = cloud.lastStrike;
      if (strike && this.worldNow() - strike.startedAt < 1250) { c.globalAlpha = 1; c.strokeStyle = '#efffff'; c.shadowColor = '#72eaff'; c.shadowBlur = 20 / cloudScale; c.lineWidth = 7 / cloudScale; const strikeX = (strike.x - x) / cloudScale; c.beginPath(); c.moveTo(strikeX, 8); const height = (strike.y - y - bob) / cloudScale; for (let step = 1; step < 7; step += 1) c.lineTo(strikeX + (step % 2 ? 13 : -11) / cloudScale, height * step / 7); c.lineTo(strikeX, height); c.stroke(); }
      c.restore();
    }
  }

  drawStructureWaterFlows(c, time) {
    for (const flow of this.game?.platformWaterFlows || []) {
      if (!flow.supportObjectId) continue;
      const object = this.visualObjects.find((entry) => entry.id === flow.supportObjectId && entry.active !== false);
      if (!object) continue;
      const left = object.x - (object.width || 28) / 2;
      const top = object.groundY - (object.height || 30);
      const start = clamp(flow.x - flow.width / 2, left, left + (object.width || 28));
      const end = clamp(flow.x + flow.width / 2, left, left + (object.width || 28));
      c.fillStyle = '#3dc5edc8'; c.fillRect(start, top - 5, Math.max(2, end - start), 6);
      c.fillStyle = '#d6fbff'; for (let ripple = start; ripple < end; ripple += 13) c.fillRect(ripple, top - 8 + Math.sin(time / 105 + ripple * .1) * 2, 5, 2);
      if (flow.cascading) for (let drop = 0; drop < 7; drop += 1) c.fillRect(flow.x + Math.sin(time / 90 + drop) * 4, top + drop * 13 + time / 45 % 13, 4, 8);
    }
  }

  drawWaterOrbs(c, time) {
    const now = this.worldNow();
    for (const orb of this.game?.waterOrbs || []) {
      if (now < orb.appearsAt) continue;
      const speed = clamp(Math.abs(orb.vy || 0) / 520, 0, 1);
      const stretchX = 1 - speed * .17;
      const stretchY = 1 + speed * .22;
      const outline = (extra = 0) => {
        c.beginPath();
        for (let vertex = 0; vertex <= 16; vertex += 1) {
          const angle = vertex / 16 * Math.PI * 2;
          const wobble = Math.sin(angle * 3 + time / 160 + orb.id.length) * 2.5 + Math.sin(angle * 5 - time / 230) * 1.6;
          const radius = orb.radius + extra + wobble;
          const px = orb.x + Math.cos(angle) * radius * stretchX;
          const py = orb.y + Math.sin(angle) * radius * stretchY;
          if (!vertex) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath();
      };
      c.save();
      c.globalAlpha = .24; c.fillStyle = '#76ddff'; outline(10); c.fill();
      c.globalAlpha = 1; c.fillStyle = '#164c83'; outline(0); c.fill();
      c.fillStyle = '#43b9e9'; outline(-4); c.fill();
      c.fillStyle = '#b6f5ff'; c.fillRect(orb.x - 14, orb.y - 16, 11, 5); c.fillRect(orb.x - 16, orb.y - 9, 5, 9);
      for (let index = 0; index < 12; index += 1) { const angle = index * 2.4 + time / 290; const distance = orb.radius + 5 + index % 3 * 6; c.fillStyle = index % 3 ? '#65cdeb' : '#e5ffff'; c.fillRect(Math.round(orb.x + Math.cos(angle) * distance), Math.round(orb.y + Math.sin(angle) * distance + (orb.vy < 0 ? 6 : -6)), 3 + index % 2, 3 + index % 2); }
      c.restore();
    }
  }

  drawWaterZones(c, time) {
    if (!this.game?.waterZones?.length) return;
    const visibleLeft = Math.max(0, Math.floor(this.camera.x) - 8);
    const visibleRight = Math.min(WORLD.width - 1, Math.ceil(this.camera.x + VIEW.width / this.camera.zoom) + 8);
    const { firstX, step, surfaces } = visibleWaterColumns(this.game?.waterZones, visibleLeft, visibleRight, this.worldNow());
    c.save();
    for (let index = 0; index < surfaces.length; index += 1) {
      const baseSurface = surfaces[index];
      if (!Number.isFinite(baseSurface)) continue;
      const x = firstX + index * step;
      const surface = baseSurface + Math.sin(time / 320 + x * .03) * 2;
      const ground = this.terrainHeights?.[x] ?? surface;
      if (ground <= surface + 2 || ground >= WORLD.height - 6) continue;
      const bottom = Math.min(ground, WORLD.height - 8);
      c.fillStyle = '#174c73c9'; c.fillRect(x, surface + 5, step, bottom - surface - 5);
      c.fillStyle = '#2b84addc'; c.fillRect(x, surface + 2, step, 5);
      c.fillStyle = (Math.floor(x / 10 + time / 180) % 4) === 0 ? '#b8f2ff' : '#66c5e9'; c.fillRect(x, surface, step, 2);
      if (x % 30 === 0) { c.fillStyle = '#a7e9ff77'; c.fillRect(x + 3, surface + 13 + Math.sin(time / 250 + x) * 4, 8, 2); }
    }
    for (const lake of this.game.waterZones || []) for (const pocket of lake.airPockets || []) {
      if (pocket.x + pocket.radius < visibleLeft || pocket.x - pocket.radius > visibleRight) continue;
      const surface = waterSurfaceAt(lake, this.worldNow(), pocket.x);
      const floor = this.terrainHeights?.[pocket.x] ?? surface;
      if (!Number.isFinite(surface) || floor - surface < 22) continue;
      const height = floor - surface;
      c.save(); c.globalAlpha = .22 + Math.sin(time / 320 + pocket.x) * .06;
      c.fillStyle = '#a8f5ff'; c.fillRect(pocket.x - pocket.radius, surface + 4, pocket.radius * 2, height - 4);
      c.globalAlpha = .8;
      for (let bubble = 0; bubble < 17; bubble += 1) {
        const travel = ((time * (.025 + bubble % 4 * .006) + bubble * 23) % height + height) % height;
        const bx = pocket.x + Math.sin(bubble * 2.4 + time / 360) * pocket.radius * .72;
        const by = floor - travel;
        const size = 3 + bubble % 5;
        c.strokeStyle = bubble % 4 ? '#8beaff' : '#efffff'; c.lineWidth = 2;
        c.strokeRect(Math.round(bx), Math.round(by), size, size);
      }
      c.fillStyle = '#e9ffff'; c.font = 'bold 11px monospace'; c.textAlign = 'center';
      c.fillText('↑ AR', pocket.x, surface - 12);
      c.restore();
    }
    const waterNow = this.worldNow();
    for (const lake of this.game.waterZones || []) for (const impact of lake.surfaceImpacts || []) {
      const progress = (waterNow - impact.startedAt) / impact.durationMs;
      if (progress < 0 || progress >= 1 || impact.x + impact.radius < visibleLeft || impact.x - impact.radius > visibleRight) continue;
      const spread = (12 + impact.radius * 1.25) * progress;
      const alpha = (1 - progress) * (impact.kind === 'explosion' ? .9 : .7);
      c.save(); c.globalAlpha = alpha;
      for (let ring = 0; ring < 3; ring += 1) {
        const width = Math.max(5, spread - ring * 13);
        const crestY = impact.y - Math.sin(progress * Math.PI) * (8 - ring * 2);
        c.strokeStyle = ring === 0 ? '#edffff' : ring === 1 ? '#84e7ff' : '#2c9bcb';
        c.lineWidth = Math.max(2, 4 - ring); c.beginPath();
        c.moveTo(impact.x - width, crestY + ring * 3);
        c.quadraticCurveTo(impact.x, crestY - 7 + ring * 2, impact.x + width, crestY + ring * 3);
        c.stroke();
      }
      const droplets = impact.kind === 'explosion' ? 20 : 9;
      for (let drop = 0; drop < droplets; drop += 1) {
        const side = drop % 2 ? -1 : 1; const phase = drop * 2.399;
        const dx = side * (8 + (drop / droplets) * spread * .85);
        const dy = -Math.sin(progress * Math.PI) * (15 + (drop % 6) * 6) + Math.sin(phase + time / 200) * 3;
        c.fillStyle = drop % 3 ? '#8fe8ff' : '#efffff'; c.fillRect(Math.round(impact.x + dx), Math.round(impact.y + dy), 2 + drop % 3, 2 + drop % 3);
      }
      if (impact.kind === 'explosion') for (let bubble = 0; bubble < 12; bubble += 1) {
        const bx = impact.x + Math.sin(bubble * 2.7 + time / 280) * (10 + bubble * 3);
        const by = impact.y + 8 + ((bubble * 17 - progress * 95) % 80 + 80) % 80;
        if (by < (this.terrainHeights?.[Math.round(clamp(bx, 0, WORLD.width - 1))] ?? by + 1)) {
          c.strokeStyle = bubble % 3 ? '#a7efff' : '#ffffff'; c.lineWidth = 1.5; c.strokeRect(Math.round(bx), Math.round(by), 3 + bubble % 4, 3 + bubble % 4);
        }
      }
      c.restore();
    }
    for (const lake of this.game.waterZones || []) {
      if (!lake.fillStartedAt || lake.drainingAt) continue;
      const progress = clamp((this.worldNow() - lake.fillStartedAt) / lake.fillDurationMs, 0, 1);
      if (progress <= 0 || progress >= 1) continue;
      const spread = lake.radius * Math.sqrt(progress); const surface = waterSurfaceAt(lake, this.worldNow());
      for (let index = 0; index < 34; index += 1) {
        const x = lake.x + Math.sin(index * 17.7) * spread;
        const dropY = surface - 5 - ((time / 10 + index * 19) % 31);
        c.globalAlpha = .35 + index % 3 * .2; c.fillStyle = index % 4 ? '#67d5f5' : '#e4fcff';
        c.fillRect(Math.round(x), Math.round(dropY), 3 + index % 3, 3 + index % 2);
      }
      c.globalAlpha = 1;
    }
    for (const lake of this.game.waterZones || []) for (const cascade of lake.flowCascades || []) {
      if (cascade.x < visibleLeft || cascade.x > visibleRight) continue;
      const fall = Math.max(8, cascade.toY - cascade.fromY);
      for (let index = 0; index < 12; index += 1) {
        const phase = ((time * (.09 + index % 3 * .02) + index * 19) % fall) / fall;
        const x = cascade.x + Math.sin(time / 210 + index * 2.6) * (2 + phase * 4);
        const y = cascade.fromY + phase * fall;
        c.globalAlpha = .35 + (index % 4) * .12; c.fillStyle = index % 3 ? '#64d6f6' : '#e6ffff';
        c.fillRect(Math.round(x), Math.round(y), 2 + index % 3, 4 + index % 3);
      }
      c.globalAlpha = 1;
    }
    c.restore();
  }

  drawWindVortices(c, time) {
    for (const vortex of this.game?.windVortices || []) {
      if (this.worldNow() < (vortex.appearsAt || 0)) continue;
      if (!this.effectVisible(vortex.x, vortex.y - vortex.height / 2, Math.max(vortex.width, vortex.height) / 2)) continue;
      if (vortex.source === 'gale') {
        if (!this.tornadoSpawned.has(vortex.id)) { this.tornadoSpawned.add(vortex.id); if (time - (this.lastTornadoAudioAt || 0) > 450) { this.onVortexSpawn?.(); this.lastTornadoAudioAt = time; } }
        this.drawGaleTornado(c, vortex, time);
        continue;
      }
      const top = vortex.y - vortex.height; const color = vortex.fire ? '#ff8d52' : '#9beadd';
      const detailStep = this.camera.zoom < .75 || this.game.windVortices.length > 4 ? 2 : 1;
      c.save(); c.globalAlpha = .7;
      for (let layer = 0; layer < 54; layer += detailStep) {
        const y = top + layer * vortex.height / 54;
        const sway = Math.sin(layer * .43 + time / 390) * 16;
        const halfWidth = vortex.width * (.25 + .13 * Math.sin(layer * .27 + time / 650) ** 2);
        c.fillStyle = vortex.fire ? layer % 4 ? '#ab513027' : '#f3783b35' : layer % 4 ? '#75e1d51e' : '#b4fff138';
        c.fillRect(vortex.x + sway - halfWidth, y, halfWidth * 2, vortex.height / 54 * detailStep + 1);
      }
      for (let i = 0; i < 92; i += detailStep) {
        const fraction = i / 92; const rise = (fraction * vortex.height + time * (.09 + i % 4 * .014)) % vortex.height;
        const helix = Math.sin(fraction * 23 + time / 310) * (24 + rise / vortex.height * 60);
        const x = vortex.x + helix; const y = vortex.y - rise; const size = 2 + i % 4;
        c.fillStyle = vortex.fire ? i % 4 ? '#ff9654' : '#fff0a3' : i % 4 ? color : '#eafff4';
        c.fillRect(x - size / 2, y - size / 2, size, size);
      }
      for (let ring = 0; ring < 6; ring += detailStep) {
        const y = vortex.y - ring * 95 - ((time / 5) % 95);
        if (y < top) continue;
        c.strokeStyle = vortex.fire ? '#ffaf64a8' : '#9df3e2a8'; c.lineWidth = 2 + ring % 2;
        c.beginPath(); c.ellipse(vortex.x, y, vortex.width * (.2 + (vortex.y - y) / vortex.height * .23), 10, 0, 0, Math.PI * 1.65); c.stroke();
      }
      for (let debris = 0; debris < 34; debris += detailStep) {
        const rise = (debris * 83 + time * (debris % 3 + 2) * .07) % vortex.height;
        const spin = Math.sin(time / 330 + debris * 2.4 + rise / 38);
        const radius = 13 + rise / vortex.height * 86;
        const x = vortex.x + spin * radius; const y = vortex.y - rise;
        c.fillStyle = vortex.fire ? debris % 3 ? '#ffb063' : '#fff0b4' : debris % 3 ? '#b8f8e8' : '#e8fff7';
        c.fillRect(x, y, 3 + debris % 4, 2 + debris % 3);
      }
      c.strokeStyle = vortex.fire ? '#ff884bb8' : '#9dfce7aa'; c.lineWidth = 4;
      c.beginPath(); c.ellipse(vortex.x, vortex.y - 4, vortex.width * .42 + 24 + Math.sin(time / 110) * 5, 13, 0, 0, Math.PI * 2); c.stroke();
      if (vortex.source === 'windPlate') {
        c.fillStyle = '#152c3c'; c.fillRect(vortex.x - 25, vortex.y - 7, 50, 11);
        c.fillStyle = '#b4cfd1'; c.fillRect(vortex.x - 22, vortex.y - 7, 44, 4);
        c.fillStyle = '#73f8e5'; c.fillRect(vortex.x - 7, vortex.y - 13, 14, 7);
        c.fillStyle = '#e9c879'; c.fillRect(vortex.x - 20, vortex.y - 3, 5, 3); c.fillRect(vortex.x + 15, vortex.y - 3, 5, 3);
      }
      if (this.worldDetailVisible(vortex.x, vortex.y)) { c.globalAlpha = 1; c.fillStyle = color; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(vortex.source === 'windPlate' ? `PLACA TORNADO • ${Math.max(0, vortex.expiresRound - this.game.roundNumber + 1)} RODADAS` : vortex.fire ? 'VÓRTICE DE FOGO • 30 HP' : 'VÓRTICE DE VENTO', vortex.x, top - 15); } c.restore();
    }
  }

  drawGaleTornado(c, vortex, time, growth = 1, warning = false) {
    const height = vortex.height * growth; const top = vortex.y - height; const fire = Boolean(vortex.fire);
    c.save(); c.globalAlpha = warning ? .58 : .93;
    const detail = this.camera.zoom < .55 ? 2 : 1;
    for (let layer = 0; layer < 48 * growth; layer += detail) {
      const fraction = layer / 48; const y = vortex.y - fraction * vortex.height;
      const radius = vortex.width * (.09 + fraction * .36);
      const sway = Math.sin(time / 230 + layer * .46) * (7 + fraction * 20);
      c.fillStyle = fire ? layer % 4 ? '#a43f2770' : '#ff9b3c80' : layer % 4 ? '#4e748878' : '#accbd477';
      c.fillRect(vortex.x + sway - radius, y, radius * 2, vortex.height / 48 * detail + 2);
      if (layer % 4 === 0) { c.fillStyle = fire ? '#ffd184' : '#e7f7eb'; c.fillRect(vortex.x + sway + radius * .67, y - 2, 9, 4); }
    }
    for (let mote = 0; mote < 75 * growth; mote += detail) {
      const rise = (mote * 71 + time * (.11 + mote % 4 * .017)) % Math.max(1, height);
      const fraction = rise / Math.max(1, vortex.height);
      const radius = vortex.width * (.12 + fraction * .34);
      const angle = time / 165 + mote * 2.39 + rise / 47;
      c.fillStyle = fire ? mote % 3 ? '#ffad55' : '#fff2bd' : mote % 4 ? '#cce6dc' : '#9b805f';
      c.fillRect(vortex.x + Math.cos(angle) * radius, vortex.y - rise, 3 + mote % 4, 3 + mote % 3);
    }
    c.strokeStyle = fire ? '#ffa95cc9' : '#d7f8edbd'; c.lineWidth = 3;
    for (let ring = 0; ring < 4 * growth; ring += 1) { const rise = (ring * 118 + time / 4) % Math.max(1, height); const fraction = rise / Math.max(1, vortex.height); c.beginPath(); c.ellipse(vortex.x, vortex.y - rise, vortex.width * (.1 + fraction * .33), 9, 0, 0, Math.PI * 1.7); c.stroke(); }
    c.fillStyle = fire ? '#ff9e58' : '#8eaea5'; for (let dust = 0; dust < 22; dust += 1) { const offset = Math.sin(time / 170 + dust * 2.8) * (14 + dust * 4); c.fillRect(vortex.x + offset, vortex.y - 9 - dust % 4 * 5, 7 + dust % 3 * 3, 3 + dust % 2 * 3); }
    if (!warning && this.worldDetailVisible(vortex.x, vortex.y)) { c.fillStyle = fire ? '#ffb36e' : '#e8fff6'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(`TORNADO • ${Math.max(0, (vortex.expiresTurn || this.game.turnNumber) - this.game.turnNumber)} TURNOS`, vortex.x, top - 18); }
    c.restore();
  }

  drawMegaSky(c, time) {
    const arming = (this.game?.delayedStrikes || []).some((strike) => strike.weapon === 'megaCannon' && this.worldNow() >= strike.impactAt);
    const beam = this.megaBeam && time - this.megaBeam.started < this.megaBeam.duration;
    if (!arming && !beam) return;
    c.save(); c.fillStyle = beam ? '#051023bb' : '#08142599'; c.fillRect(0, 0, VIEW.width, VIEW.height);
    for (let i = 0; i < 24; i += 1) { const x = (i * 173 + Math.floor(time / 40) * (i % 2 ? 1 : -1)) % (VIEW.width + 150) - 75; const y = 18 + i % 5 * 24; c.fillStyle = i % 3 ? '#152c42aa' : '#24395199'; c.fillRect(x, y, 95 + i % 4 * 24, 13); }
    c.restore();
  }

  drawDelayedStrikes(c, time) {
    for (const strike of this.game?.delayedStrikes || []) {
      const now = this.worldNow(); if (now < strike.impactAt) continue;
      const delay = strike.weapon === 'megaCannon' || strike.weapon === 'markerBomb' ? 3000 : strike.weapon === 'elementalEarth' ? 850 : strike.weapon === 'droneStrike' ? 700 + (strike.missile || 0) * 420 : 2000; const progress = clamp(1 - (strike.executeAt - now) / delay, 0, 1);
      c.save(); c.globalAlpha = .7 + Math.sin(time / 85) * .2;
      if (strike.weapon === 'droneStrike') {
        const droneY = Math.max(35, strike.y - 260); const descent = Math.max(0, (progress - .38) / .62);
        c.strokeStyle = '#ffd66f'; c.lineWidth = 2; c.setLineDash([5, 8]); c.beginPath(); c.moveTo(strike.x, droneY + 9); c.lineTo(strike.x, strike.y); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#1a2637'; c.fillRect(strike.x - 17, droneY - 6, 34, 13); c.fillStyle = '#7ce7ef'; c.fillRect(strike.x - 5, droneY - 4, 10, 6); c.fillStyle = '#f5dc8c'; c.fillRect(strike.x - 24, droneY - 9, 12, 3); c.fillRect(strike.x + 12, droneY - 9, 12, 3);
        const missileY = droneY + 13 + (strike.y - droneY - 13) * descent; c.fillStyle = '#fff2b2'; c.fillRect(strike.x - 3, missileY, 6, 14); c.fillStyle = '#ff704b'; c.fillRect(strike.x - 2, missileY - 8, 4, 8);
        c.strokeStyle = '#ffb65e'; c.beginPath(); c.arc(strike.x, strike.y, 20 + Math.sin(time / 85) * 5, 0, Math.PI * 2); c.stroke();
      } else if (strike.weapon === 'elementalEarth') {
        const ridge = strike.mode === 'ridge'; const width = strike.radius || 145; const preview = 13 + progress * 26;
        c.fillStyle = ridge ? '#dcb66a55' : '#8b523d66'; c.fillRect(strike.x - width, strike.y - 5, width * 2, 10);
        for (let block = -width; block < width; block += 15) { const height = (1 - Math.abs(block) / width) * preview; c.fillStyle = (Math.floor(block / 15) + Math.floor(time / 120)) % 2 ? '#e9c784' : '#946348'; c.fillRect(strike.x + block, strike.y + (ridge ? -height : 4), 10, 4); }
        c.fillStyle = '#ffe7a8'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(ridge ? 'ELEVAR SOLO' : 'ABRIR CRATERA', strike.x, strike.y - 48);
      } else if (strike.weapon === 'markerBomb') {
        const pulse = 12 + progress * 15 + Math.sin(time / 95) * 3;
        c.fillStyle = '#ff6c4744'; c.fillRect(strike.x - 21, strike.y - 5, 42, 9);
        c.strokeStyle = '#ffad5b'; c.lineWidth = 3 / Math.max(.4, this.camera.zoom); c.beginPath(); c.arc(strike.x, strike.y, pulse, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#fff1b7'; c.fillRect(strike.x - 5, strike.y - 4, 10, 6);
        c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(`${Math.max(0, (strike.executeAt - now) / 1000).toFixed(1)}s`, strike.x, strike.y - pulse - 7);
      } else if (strike.weapon === 'seismicCharge') {
        for (const [index, offset] of [-92, 0, 92].entries()) { const x = clamp(strike.x + offset, 6, WORLD.width - 6); const y = this.terrainHeights[Math.round(x)] - 3; const radius = index === 1 ? 82 : 58; c.fillStyle = '#ff334933'; c.fillRect(x - radius, y - 6, radius * 2, 12); c.strokeStyle = '#ff344a'; c.lineWidth = 3 / Math.max(.4, this.camera.zoom); c.strokeRect(x - radius, y - 6, radius * 2, 12); for (let block = -radius; block < radius; block += 15) { c.fillStyle = (block / 15 + Math.floor(time / 100)) % 2 ? '#ff3355' : '#ffd2c1'; c.fillRect(x + block, y - 9 - Math.sin(block / 18 + time / 90) * 2, 8, 4); } }
        c.fillStyle = '#fff1ec'; c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.fillText(`SISMO ${Math.max(0, (strike.executeAt - now) / 1000).toFixed(1)}s`, strike.x, strike.y - 42);
      } else if (strike.weapon === 'zeus') {
        const radius = 24 + progress * 22;
        c.strokeStyle = '#9ceaff'; c.lineWidth = 4 / Math.max(.4, this.camera.zoom); c.beginPath(); c.arc(strike.x, strike.y, radius, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#e9ffff'; c.fillRect(strike.x - 3, strike.y - 17, 6, 34); c.fillRect(strike.x - 17, strike.y - 3, 34, 6);
        c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(`RAIO ${Math.max(0, (strike.executeAt - now) / 1000).toFixed(1)}s`, strike.x, strike.y - radius - 12);
      } else {
        const width = 75 + progress * 30; c.fillStyle = '#153a6688'; c.fillRect(strike.x - width / 2, strike.y - 9, width, 13); c.strokeStyle = '#69dcff'; c.lineWidth = 3 / Math.max(.4, this.camera.zoom); c.strokeRect(strike.x - width / 2, strike.y - 9, width, 13); c.beginPath(); c.arc(strike.x, strike.y - 3, 26 + progress * 22, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#f2fdff'; c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.fillText(`INTERVENÇÃO DOS CÉUS ${Math.max(0, (strike.executeAt - now) / 1000).toFixed(1)}s`, strike.x, strike.y - 55);
      }
      c.restore();
    }
  }

  drawSoapBubbles(c, time) {
    for (const bubble of this.game?.soapBubbles || []) {
      if (this.worldNow() < bubble.impactAt) continue;
      const position = this.visualPlayers.get(bubble.playerId); const x = position?.renderX ?? bubble.x; const y = position?.renderY ?? bubble.y;
      const seconds = Math.max(0, (bubble.executeAt - this.worldNow()) / 1000); const radius = 46 + Math.sin(time / 180 + bubble.phase) * 3;
      c.save(); c.globalAlpha = .24; c.fillStyle = '#78e4ff'; c.beginPath(); c.arc(x, y, radius - 3, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .94; c.shadowColor = '#a1faff'; c.shadowBlur = 25; c.strokeStyle = '#bbfff5'; c.lineWidth = 5 / Math.max(.45, this.camera.zoom); c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0; c.strokeStyle = '#ffc2fb'; c.lineWidth = 3; c.beginPath(); c.arc(x - radius * .25, y - radius * .25, radius * .52, 3.55, 5.2); c.stroke();
      for (let i = 0; i < 22; i += 1) { const angle = i * Math.PI * 2 / 22 + time / 1200 * (i % 2 ? 1 : -1); const orbit = radius + 5 + i % 3 * 3; c.fillStyle = i % 3 ? '#d4fff8' : '#ffcefa'; c.fillRect(Math.round(x + Math.cos(angle) * orbit), Math.round(y + Math.sin(angle) * orbit), i % 4 ? 3 : 5, i % 4 ? 3 : 5); }
      for (let i = 0; i < 8; i += 1) { const px = x + Math.sin(time / 370 + i * 2 + bubble.phase) * (31 + i * 4); const py = y + 45 - (time / (9 + i)) % 120; c.fillStyle = i % 2 ? '#b9ffff' : '#f2bdff'; c.fillRect(Math.round(px), Math.round(py), 3 + i % 2, 3 + i % 2); }
      const wind = this.game?.wind || 0;
      if (Math.abs(wind) >= 4) for (let i = 0; i < 5; i += 1) { const direction = Math.sign(wind); const drift = (time / 18 + i * 22) % 90; c.globalAlpha = .35 + Math.min(1, Math.abs(wind) / 28) * .35; c.fillStyle = '#dcfff5'; c.fillRect(Math.round(x - direction * (radius + 34 - drift)), Math.round(y - radius * .6 + i * 12), 4 + Math.round(Math.abs(wind) / 7), 2); }
      c.globalAlpha = 1;
      c.fillStyle = '#06202bdf'; c.fillRect(x - 23, y - radius - 23, 46, 15); c.strokeStyle = '#92f2e9'; c.lineWidth = 1; c.strokeRect(x - 23, y - radius - 23, 46, 15); c.fillStyle = '#edfffd'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(`${seconds.toFixed(1)}s`, x, y - radius - 12);
      c.restore();
    }
  }

  drawDrills(c, time) {
    this.updateDrillTerrain(time);
    this.drillAnimations = this.drillAnimations.filter((effect) => time - effect.started < effect.duration);
    for (const effect of this.drillAnimations) {
      const progress = clamp((time - effect.started) / effect.duration, 0, 1);
      if (effect.kind === 'excavator') {
        const eased = 1 - (1 - progress) ** 3; const x = effect.x + (effect.toX - effect.x) * eased; const y = effect.y + (effect.toY - effect.y) * eased; const direction = effect.direction || 1;
        c.save(); c.translate(x + direction * 22, y + 4); c.rotate(time / 42 * direction); c.shadowColor = '#ffbd63'; c.shadowBlur = 14; for (let tooth = 0; tooth < 8; tooth += 1) { c.rotate(Math.PI / 4); c.fillStyle = tooth % 2 ? '#ffd67d' : '#d9e3dc'; c.fillRect(8, -3, 12, 6); } c.fillStyle = '#44545c'; c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill(); c.restore();
        if (time - (effect.lastParticleAt || 0) > 38) { effect.lastParticleAt = time; for (let rock = 0; rock < 9; rock += 1) this.addParticle({ x: x + direction * 18 + (Math.random() - .5) * 22, y: y + (Math.random() - .5) * 22, vx: -direction * (35 + Math.random() * 150), vy: -45 - Math.random() * 135, size: 3 + rock % 4, color: rock % 3 ? '#9a7351' : '#f1d38b', gravity: 250, life: .45 + Math.random() * .65, bounce: .3, drag: .96 }); }
        c.save(); c.globalAlpha = .55 * (1 - progress); c.strokeStyle = '#ffc468'; c.lineWidth = 4; c.setLineDash([8, 5]); c.beginPath(); c.moveTo(effect.x, effect.y + 14); c.lineTo(x, y + 14); c.stroke(); c.restore(); continue;
      }
      const depth = 170 * progress; const spin = time / 85;
      c.save(); c.translate(effect.x, effect.y + depth); c.rotate(Math.sin(spin) * .08);
      c.shadowColor = '#ffbf68'; c.shadowBlur = 16; c.fillStyle = '#324652'; c.fillRect(-14, -28, 28, 31);
      c.fillStyle = '#f5b85c'; c.fillRect(-10, -24, 20, 9); c.fillStyle = '#d7e0de'; c.fillRect(-7, 2, 14, 16);
      for (let tooth = 0; tooth < 4; tooth += 1) { c.fillStyle = tooth % 2 ? '#ffd17d' : '#fff2b6'; c.fillRect(-11 + tooth * 5 + Math.sin(spin) * 2, 13 + tooth % 2 * 4, 5, 8); }
      c.restore();
      if (time - (effect.lastParticleAt || 0) > 65) { effect.lastParticleAt = time; for (let rock = 0; rock < 5; rock += 1) this.addParticle({ x: effect.x + (Math.random() - .5) * 35, y: effect.y + depth, vx: (Math.random() - .5) * 230, vy: -95 - Math.random() * 150, size: 3 + rock % 3 * 2, color: rock % 2 ? '#b68c61' : '#eee0b2', gravity: 280, life: .45 + Math.random() * .4, bounce: .25, drag: .96 }); }
      c.save(); c.globalAlpha = (1 - progress) * .75; c.strokeStyle = '#ffa94f'; c.lineWidth = 4; c.beginPath(); c.ellipse(effect.x, effect.y + depth, 30 + progress * 95, 12 + progress * 30, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    }
  }

  updateDrillTerrain(time) {
    const reveal = this.drillTerrainReveal;
    if (!reveal || time - reveal.lastFrameAt < 65) return;
    reveal.lastFrameAt = time;
    const complete = reveal.drills.every((drill) => time >= drill.started + drill.duration);
    this.applyTerrain(complete ? reveal.target : interpolateDrillTerrain(reveal.before, reveal.target, reveal.drills, time), false, true);
    if (complete) { this.drillTerrainReveal = null; this.flushPendingState(); }
  }

  drawHarpoonCable(c, time) {
    const anchor = this.game?.harpoonAnchor; const pull = this.game?.harpoonPull;
    if (!pull && (!anchor || this.worldNow() < anchor.readyAt)) return;
    const owner = this.visualPlayers.get((pull || anchor).ownerId); if (!owner) return;
    const target = pull?.targetPlayerId ? this.visualPlayers.get(pull.targetPlayerId) : null;
    const from = target ? this.renderPosition(target) : this.renderPosition(owner);
    const to = pull?.targetPlayerId ? this.renderPosition(owner) : pull ? { x: pull.anchorX, y: pull.anchorY } : { x: anchor.x, y: anchor.y };
    c.save(); c.strokeStyle = '#0c2630'; c.lineWidth = 6 / Math.max(.4, this.camera.zoom); c.beginPath(); c.moveTo(from.x, from.y - 6); c.lineTo(to.x, to.y); c.stroke();
    c.strokeStyle = '#8cf1d5'; c.lineWidth = 2.5 / Math.max(.4, this.camera.zoom); c.setLineDash([10, 5]); c.lineDashOffset = -time / 40; c.stroke(); c.setLineDash([]);
    if (pull) { const progress = clamp((this.worldNow() - pull.startedAt) / (pull.endsAt - pull.startedAt), 0, 1); c.shadowColor = '#6effd5'; c.shadowBlur = 16; c.strokeStyle = '#d4ffeb'; c.lineWidth = (3 + Math.sin(progress * Math.PI) * 2) / Math.max(.4, this.camera.zoom); c.globalAlpha = .48 + Math.sin(time / 55) * .18; c.beginPath(); c.moveTo(from.x, from.y - 6); c.lineTo(to.x, to.y); c.stroke(); c.shadowBlur = 0; c.globalAlpha = 1; for (let i = 0; i < 7; i += 1) { const along = (i / 7 + time / 700) % 1; const cx = from.x + (to.x - from.x) * along; const cy = from.y + (to.y - from.y) * along; c.fillStyle = i % 2 ? '#edfff5' : '#72ffdb'; c.fillRect(cx - 3, cy - 3, 6, 6); } }
    c.fillStyle = '#e9fff3'; c.fillRect(to.x - 4, to.y - 4, 8, 8);
    if (anchor && anchor.ownerId === this.playerId) { const labelX = (from.x + to.x) / 2; const labelY = (from.y + to.y) / 2 - 24; c.fillStyle = '#091d26d9'; c.fillRect(labelX - 116, labelY - 15, 232, 23); c.strokeStyle = '#69d7bc'; c.lineWidth = 1; c.strokeRect(labelX - 116, labelY - 15, 232, 23); c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillStyle = '#d6fff4'; c.fillText('PUXAR OU PASSAR (+1 MUNIÇÃO)', labelX, labelY); }
    c.restore();
  }

  spawnSoapPop(pop) {
    this.floaters.push({ x: pop.x, y: pop.y - 42, text: `BOLHA -${pop.damage} HP`, age: 0, life: 1.5, color: '#a8fbf1' });
    for (let i = 0; i < 78; i += 1) { const angle = i * Math.PI * 2 / 78; this.addParticle({ kind: 'spark', x: pop.x + Math.cos(angle) * 27, y: pop.y + Math.sin(angle) * 27, vx: Math.cos(angle) * (55 + Math.random() * 135), vy: Math.sin(angle) * (55 + Math.random() * 135), size: 2 + i % 3, color: i % 3 ? '#a7ffff' : '#ffc5f7', gravity: 50, life: .45 + Math.random() * .55, bounce: 0, drag: .96 }); }
    this.shake = Math.max(this.shake, 5);
  }

  spawnHarpoonHit(hit) {
    this.floaters.push({ x: hit.x, y: hit.y - 46, text: `ARPÃO -${hit.amount} HP`, age: 0, life: 1.7, color: '#98f5d6' });
    for (let i = 0; i < 52; i += 1) this.addParticle({ kind: 'spark', x: hit.x, y: hit.y, vx: (Math.random() - .5) * 220, vy: -35 - Math.random() * 150, size: 2 + i % 4, color: i % 2 ? '#f7f6c7' : '#63dcc6', gravity: 180, life: .4 + Math.random() * .5, bounce: .2, drag: .95 });
    this.shake = Math.max(this.shake, 9);
  }

  drawMegaBeam(c, time) {
    if (!this.megaBeam) return; const elapsed = time - this.megaBeam.started; if (elapsed >= this.megaBeam.duration) { this.megaBeam = null; return; }
    const { x, y } = this.megaBeam; const intensity = Math.sin(Math.PI * clamp(elapsed / this.megaBeam.duration, 0, 1)); const top = this.camera.y - 100; const bottom = WORLD.height + 80; const radius = WEAPON_BALANCE.megaCannon.radius; const width = radius * (.58 + intensity * .42);
    c.save(); c.globalAlpha = .18 + intensity * .43; c.fillStyle = '#1976f4'; c.fillRect(x - width, top, width * 2, bottom - top); c.globalAlpha = .35 + intensity * .48; c.fillStyle = '#42caff'; c.fillRect(x - width * .61, top, width * 1.22, bottom - top); c.globalAlpha = .72 + intensity * .25; c.fillStyle = '#eaffff'; c.fillRect(x - WEAPON_BALANCE.megaCannon.beamWidth * .48, top, WEAPON_BALANCE.megaCannon.beamWidth * .96, bottom - top);
    for (let row = 0; row < 36; row += 1) { const beamY = top + row * (bottom - top) / 36; const flicker = Math.sin(row * 7.3 + time / 53) * 15; c.globalAlpha = .25 + intensity * .52; c.fillStyle = row % 3 ? '#89e9ff' : '#ffffff'; c.fillRect(x - width + flicker, beamY, 7 + row % 4 * 4, 15); c.fillRect(x + width - flicker - 12, beamY + 8, 7 + row % 3 * 5, 16); }
    c.globalAlpha = .65 * intensity; c.strokeStyle = '#d7ffff'; c.lineWidth = 5; c.beginPath(); c.ellipse(x, y, radius * (1.1 + elapsed / 900), 22 + elapsed / 28, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    this.shake = Math.max(this.shake, intensity * 29);
  }

  drawMushroomClouds(c, time) {
    this.mushroomClouds = this.mushroomClouds.filter((cloud) => time - cloud.started < cloud.duration);
    for (const cloud of this.mushroomClouds) {
      const progress = clamp((time - cloud.started) / cloud.duration, 0, 1);
      const growth = 1 - Math.pow(1 - clamp((progress - .035) / .54, 0, 1), 3);
      const fade = Math.min(1, progress * 13) * clamp((1 - progress) / .23, 0, 1);
      const height = Math.min(225, Math.max(95, cloud.y - 32)) * growth;
      const capY = cloud.y - height; const halfWidth = 18 + Math.min(185, cloud.radius * .8) * growth;
      const capHeight = 16 + 74 * growth; const heat = clamp((.7 - progress) / .55, 0, 1);
      c.save(); c.globalAlpha = fade;
      const shock = clamp(progress / .45, 0, 1); c.globalAlpha = fade * (1 - shock) * .8;
      for (let dot = 0; dot < 88; dot += 1) { const angle = dot / 88 * Math.PI * 2; const distance = (24 + cloud.radius * 2.2 * shock) * (1 + Math.sin(dot * 1.7) * .02); c.fillStyle = dot % 4 ? '#ffbb5a' : '#fff3bb'; c.fillRect(Math.round(cloud.x + Math.cos(angle) * distance), Math.round(cloud.y + Math.sin(angle) * distance * .16), dot % 3 ? 6 : 10, 4); }
      c.globalAlpha = fade;
      if (progress < .22) { const core = 14 + cloud.radius * progress * 1.6; for (let row = -core; row <= core; row += 8) { const width = Math.sqrt(Math.max(0, core * core - row * row)); c.fillStyle = Math.abs(row) < core * .55 ? '#fff1b0' : '#ff873e'; c.fillRect(Math.round(cloud.x - width), Math.round(cloud.y + row), Math.ceil(width * 2), 8); } }
      for (let h = 0; h < height; h += 9) {
        const upper = h / Math.max(1, height); const width = 29 + growth * (upper > .7 ? 27 : 18) + Math.sin(h / 27) * 4;
        c.fillStyle = heat > .43 && h < height * .68 ? '#a84d3d' : '#493c41'; c.fillRect(Math.round(cloud.x - width / 2), Math.round(cloud.y - h), Math.ceil(width), 10);
        c.fillStyle = heat > .25 ? '#ffc16b' : '#9a6855'; c.fillRect(Math.round(cloud.x - width / 2 + 7), Math.round(cloud.y - h), 7, 9);
        if (upper > .35 && h % 27 < 9) { c.fillStyle = '#d8814f'; c.fillRect(Math.round(cloud.x + width / 2 - 8), Math.round(cloud.y - h), 6, 8); }
      }
      const lobes = [
        [-.64, .08, .43, .65], [.64, .08, .43, .65],
        [-.38, -.4, .43, .68], [.38, -.4, .43, .68],
        [0, -.12, .63, .76], [0, -.74, .38, .46],
      ];
      for (const [offsetX, offsetY, scaleX, scaleY] of lobes) {
        const centerX = cloud.x + offsetX * halfWidth; const centerY = capY + offsetY * capHeight;
        const rx = halfWidth * scaleX; const ry = capHeight * scaleY;
        for (let yy = -ry; yy <= ry; yy += 9) for (let xx = -rx; xx <= rx; xx += 9) {
          const distance = xx * xx / (rx * rx) + yy * yy / (ry * ry); if (distance > 1) continue;
          const highlight = distance < .58 && yy < ry * .25 && xx < rx * .55;
          const pattern = Math.abs(Math.floor(xx / 9) * 11 + Math.floor(yy / 9) * 7) % 7;
          c.fillStyle = highlight ? heat > .35 ? ['#ffc579', '#ffb16b', '#ffd18a'][pattern % 3] : ['#a97863', '#b27c67', '#906858'][pattern % 3] : yy > ry * .44 ? heat > .3 ? '#a85241' : '#3b353d' : heat > .35 ? pattern < 2 ? '#e38454' : '#c96b49' : pattern < 2 ? '#785254' : '#604649';
          c.fillRect(Math.round(centerX + xx), Math.round(centerY + yy), 9, 9);
        }
      }
      for (const side of [-1, 1]) for (let curl = 0; curl < 5; curl += 1) { c.fillStyle = heat > .2 ? '#ffca7b' : '#9b6655'; c.fillRect(Math.round(cloud.x + side * halfWidth * (.61 + curl * .08)), Math.round(capY + capHeight * (.46 - curl * .15)), 9, 5); }
      for (let spark = 0; spark < 22; spark += 1) { const dx = Math.sin(spark * 7.1) * (30 + halfWidth * (spark % 5) / 5); const dy = (spark * 47 + time * .08) % 180; c.fillStyle = spark % 3 ? '#ffb15d' : '#fff1b1'; c.fillRect(Math.round(cloud.x + dx), Math.round(cloud.y - dy), spark % 4 ? 3 : 5, 3); }
      c.restore();
    }
  }

  spawnStrikeMarker(shot) { if (!shot.impact) return; const labels = { megaCannon: 'ALVO FIXADO • 3s', zeus: 'MARCADO • RAIO EM 2s', droneStrike: 'ENXAME A CAMINHO', elementalEarth: 'TERRA EM TRANSFORMAÇÃO' }; this.floaters.push({ x: shot.impact.x, y: shot.impact.y - 35, text: labels[shot.weapon] || 'SOLO MARCADO • 2s', age: 0, life: 1.8, color: shot.weapon === 'droneStrike' ? '#ffd46f' : shot.weapon === 'elementalEarth' ? '#dcb66a' : shot.weapon === 'zeus' ? '#9ee8ff' : shot.weapon === 'megaCannon' ? '#73dcff' : '#ff5368' }); }

  spawnMegaCannonImpact(shot) {
    const { x, y } = shot.impact; const now = performance.now(); this.megaBeam = { x, y, started: now, duration: 1800 }; this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, now + 2350); this.impactFlash = { started: now, duration: 620, color: '#f5ffff', intensity: .82 }; this.shake = Math.max(this.shake, 58);
    for (let i = 0; i < 500; i += 1) { const angle = i / 500 * Math.PI * 2; const speed = 80 + Math.random() * 420; const particleY = i % 3 ? y : y + Math.random() * Math.max(0, WORLD.height - y); this.addParticle({ x: x + (Math.random() - .5) * 80, y: particleY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 75, size: 3 + i % 7, color: i % 4 ? '#71dfff' : '#ffffff', gravity: 60, life: .5 + Math.random() * 1.4, bounce: .1, drag: .94 }); }
    this.floaters.push({ x, y: y - 110, text: 'INTERVENÇÃO DOS CÉUS!', age: 0, life: 2, color: '#e9ffff' });
  }

  drawBlockMountains(c, time) {
    if (this.terrainBiome === 'skylands') return;
    if (this.terrainBiome === 'technology') { this.drawTechnologyBackdrop(c, time); return; }
    const start = Math.floor((this.camera.x - 180) / 12) * 12; const end = this.camera.x + VIEW.width / this.camera.zoom + 180; const cycle = ((this.game?.turnNumber || 1) - 1) % 16 / 16; const day = (Math.cos(cycle * Math.PI * 2) + 1) / 2;
    for (let x = start; x < end; x += 12) { const far = 330 + Math.sin((x + this.camera.x * .52) / 230) * 82 + Math.sin(x / 71) * 22; c.fillStyle = day > .45 ? '#42617a' : '#111d34'; c.fillRect(x, Math.round(far / 8) * 8, 12, WORLD.height - far); const mid = 402 + Math.sin((x + this.camera.x * .31) / 165) * 59 + Math.sin(x / 43) * 12; c.fillStyle = day > .45 ? '#344f65' : '#18253a'; c.fillRect(x, Math.round(mid / 7) * 7, 12, WORLD.height - mid); const near = 470 + Math.sin((x + this.camera.x * .16) / 118) * 48; c.fillStyle = day > .45 ? '#293f4c' : '#1e2b3b'; c.fillRect(x, Math.round(near / 8) * 8, 12, WORLD.height - near); if (((x / 12) % 19 + 19) % 19 === 0) { c.fillStyle = day > .45 ? '#ffe39a55' : '#8deaff66'; c.fillRect(x + 3, Math.round(near / 8) * 8 + 18, 3, 3); } }
  }

  drawTechnologyBackdrop(c, time) {
    const left = this.camera.x - 200; const right = this.camera.x + VIEW.width / this.camera.zoom + 200;
    c.save();
    for (let layer = 0; layer < 2; layer += 1) {
      const span = layer ? 120 : 170; const first = Math.floor(left / span) - 1; const last = Math.ceil(right / span) + 1;
      const horizon = layer ? 560 : 445; const tint = layer ? '#172f44' : '#10273d';
      for (let index = first; index <= last; index += 1) {
        const x = index * span + (layer ? 15 : 0); const height = (layer ? 95 : 75) + ((index * 37 + layer * 53) % 5 + 5) % 5 * (layer ? 25 : 21);
        const top = horizon - height; const width = span - (layer ? 16 : 24);
        c.fillStyle = tint; c.fillRect(x, top, width, WORLD.height - top);
        c.fillStyle = layer ? '#315775' : '#25465f'; c.fillRect(x + 5, top + 6, width - 10, 5);
        c.fillStyle = layer ? '#24526c' : '#1c4057'; c.fillRect(x + width - 14, top + 13, 6, WORLD.height - top);
        if (index % 4 === 0) { c.fillStyle = '#426b80'; c.fillRect(x + width / 2 - 2, top - 34, 4, 34); c.fillStyle = '#59bdce'; c.fillRect(x + width / 2 - 5, top - 39, 10, 5); }
        for (let row = top + 24; row < horizon + 90; row += 22) for (let col = x + 14; col < x + width - 15; col += 19) {
          const lit = (Math.floor(col / 19) + Math.floor(row / 22) + index) % 4 !== 0;
          c.fillStyle = lit ? layer ? '#3b7e91' : '#386f84' : '#213f54'; c.globalAlpha = lit ? .55 + .12 * Math.sin(time / 1400 + index) : .4;
          c.fillRect(col, row, 7, 8);
        }
        c.globalAlpha = 1;
      }
    }
    c.strokeStyle = '#2b6b82'; c.lineWidth = 3; c.beginPath(); c.moveTo(left, 417); c.lineTo(right, 417); c.stroke();
    for (let x = Math.floor(left / 64) * 64; x < right; x += 64) { c.fillStyle = '#4a9fb1'; c.fillRect(x, 414, 10, 4); }
    c.restore();
  }

  drawWorldLava(c, time) {
    if (this.terrainBiome === 'skylands') return;
    const level = this.displayLavaLevel(time); const bottom = Math.min(WORLD.height + 50, this.camera.y + VIEW.height / this.camera.zoom + 8);
    if (level >= bottom) return;
    const tile = this.camera.zoom < .45 ? BLOCK * 2 : BLOCK; const left = Math.max(0, Math.floor(this.camera.x / (tile * 2)) * tile * 2); const right = Math.min(WORLD.width, Math.ceil((this.camera.x + VIEW.width / this.camera.zoom) / (tile * 2)) * tile * 2); const start = Math.max(0, Math.floor(Math.max(level, this.camera.y) / tile) * tile); c.save();
    const glow = 14 + Math.sin(time / 170) * 5; c.shadowColor = '#ff4a24'; c.shadowBlur = glow; c.fillStyle = '#a92e28'; c.fillRect(left, level, right - left, bottom - level); c.shadowBlur = 0;
    for (let y = start; y < bottom; y += tile) for (let x = left; x < right; x += tile * 2) { const wave = Math.round(Math.sin(x / 37 + time / 260 + y / 21) * 2); c.fillStyle = y < level + tile * 2 ? ((x / 10 + Math.floor(time / 110)) % 3 < 1 ? '#fff07a' : '#ff7b2f') : ((x + y) / 10) % 4 < 1 ? '#f04b27' : '#8f2829'; c.fillRect(x, y + wave, tile * 2 - .5, tile - .5); }
    c.restore();
  }

  buildTerrain() {
    const c = this.terrainCanvas.getContext('2d'); c.clearRect(0, 0, this.terrainCanvas.width, this.terrainCanvas.height);
    const biome = BIOMES[this.terrainBiome];
    for (let x = 0; x < WORLD.width; x += BLOCK) { const surface = Math.floor(this.terrainHeights[x] / BLOCK) * BLOCK; if (surface > WORLD.height) continue; for (let y = surface; y < WORLD.height + 60; y += BLOCK) { c.fillStyle = y === surface ? biome?.surface || '#a9bc68' : colorForBlock(x, y, surface, this.terrainBiome); c.fillRect(x, y, BLOCK - .5, BLOCK - .5); } }
  }

  patchTerrain(previous) {
    const c = this.terrainCanvas.getContext('2d'); const biome = BIOMES[this.terrainBiome];
    for (const x of changedTerrainColumns(previous, this.terrainHeights, BLOCK)) {
      const oldSurface = Math.floor(previous[x] / BLOCK) * BLOCK;
      const surface = Math.floor(this.terrainHeights[x] / BLOCK) * BLOCK;
      c.clearRect(x, Math.max(0, Math.min(oldSurface, surface)), BLOCK, this.terrainCanvas.height);
      if (surface > WORLD.height) continue;
      for (let y = surface; y < WORLD.height + 60; y += BLOCK) {
        c.fillStyle = y === surface ? biome?.surface || '#a9bc68' : colorForBlock(x, y, surface, this.terrainBiome);
        c.fillRect(x, y, BLOCK - .5, BLOCK - .5);
      }
    }
  }

  applyTerrain(next, emitDebris, incremental = false) {
    const previous = this.terrainHeights;
    if (emitDebris) this.spawnTerrainDebris(previous, next);
    this.terrainHeights = [...next]; this.pendingTerrain = null;
    if (incremental) this.patchTerrain(previous);
    else this.buildTerrain();
  }

  worldNow() { return Date.now() + this.serverClockOffset; }
  platformX(platform, time = this.worldNow()) { return !platform.moving ? platform.baseX : platform.baseX + Math.sin(((time - this.game.platformEpoch) / platform.period) * Math.PI * 2 + platform.phase) * platform.amplitude; }

  renderPosition(player, time = this.worldNow()) {
    if (player?.reviveAnimation) return { x: player.renderX, y: player.renderY };
    const platform = player?.supportPlatformId && this.game?.terrain.floatingPlatforms?.find((entry) => entry.id === player.supportPlatformId && entry.active);
    return platform ? { x: this.platformX(platform, time) + player.platformOffset, y: platform.y - WORLD.tankRadius } : { x: player?.renderX ?? player?.x ?? 0, y: player?.renderY ?? player?.y ?? 0 };
  }

  drawFloatingPlatforms(c, time) {
    for (const platform of this.visualPlatforms) {
      if (!platform.active) continue; const x = Math.round(this.platformX(platform, this.worldNow()) / BLOCK) * BLOCK;
      if (platform.kind === 'skyIsland') {
        c.fillStyle = '#a8d98f'; c.fillRect(x, platform.y - 7, platform.width, 9);
        for (let bx = 0; bx < platform.width; bx += BLOCK) for (let by = 0; by < platform.height; by += BLOCK) { const edge = bx < 12 || bx > platform.width - 16 || by > platform.height - 14; c.fillStyle = by < 8 ? '#759f7b' : edge ? '#294e50' : ((bx / BLOCK + by / BLOCK) % 3 ? '#3d6861' : '#315b59'); c.fillRect(x + bx, platform.y + by, BLOCK - .5, BLOCK - .5); }
        c.fillStyle = '#80ddea'; for (let lamp = 18; lamp < platform.width - 10; lamp += 46) c.fillRect(x + lamp, platform.y + 12, 6, 4);
        c.fillStyle = '#243d4c'; c.fillRect(x + platform.width * .22, platform.y + platform.height, platform.width * .56, 11);
        c.fillStyle = '#61b8c9'; c.fillRect(x + platform.width * .34, platform.y + platform.height + 12, platform.width * .32, 5);
        continue;
      }
      if (platform.kind === 'rescuePad') {
        const glow = .7 + Math.sin(time / 150 + x) * .25; c.save(); c.shadowColor = '#72ecff'; c.shadowBlur = 15 * glow;
        c.fillStyle = '#123d5d'; c.fillRect(x, platform.y, platform.width, 15); c.fillStyle = '#70e8ff'; c.fillRect(x + 4, platform.y - 4, platform.width - 8, 5);
        c.fillStyle = '#d5ffff'; for (let bx = 17; bx < platform.width - 10; bx += 28) { c.beginPath(); c.moveTo(x + bx, platform.y + 10); c.lineTo(x + bx + 8, platform.y + 2); c.lineTo(x + bx + 16, platform.y + 10); c.fill(); }
        c.fillStyle = '#54bce2'; c.fillRect(x + 18, platform.y + 16, platform.width - 36, 8); c.restore(); continue;
      }
      if (platform.kind === 'hoverCarrier') {
        c.fillStyle = '#172a40'; c.fillRect(x, platform.y, platform.width, 17); c.fillStyle = '#6bddea'; c.fillRect(x + 8, platform.y - 4, platform.width - 16, 5);
        c.fillStyle = '#446b80'; c.fillRect(x + 14, platform.y + 17, platform.width - 28, 8);
        const glow = .55 + Math.sin(time / 110) * .3; c.globalAlpha = glow; c.fillStyle = '#67dfff'; c.fillRect(x + 22, platform.y + 26, 23, 10); c.fillRect(x + platform.width - 45, platform.y + 26, 23, 10); c.globalAlpha = 1; continue;
      }
      if (platform.kind === 'iceSheet') {
        c.save();
        const growth = platform.formedAt ? clamp((this.worldNow() - platform.formedAt) / 780, 0, 1) : 1;
        const wear = 1 - clamp((platform.durability ?? platform.maxDurability ?? 100) / (platform.maxDurability || 100), 0, 1);
        for (let tile = 0; tile < platform.width; tile += 8) {
          const distance = Math.abs(tile + 4 - platform.width / 2) / Math.max(4, platform.width / 2);
          if (distance > growth) continue;
          const seed = Math.floor((x + tile) / 8); const top = platform.y - 4 + (seed * 17 % 3 - 1) * 2; const thickness = 7 + seed * 7 % 4; const width = Math.min(8, platform.width - tile);
          c.fillStyle = seed % 4 ? '#80c8df' : '#acdff0'; c.fillRect(x + tile, top, width, thickness);
          c.fillStyle = seed % 3 ? '#defaff' : '#f8ffff'; c.fillRect(x + tile, top, width, 2);
          c.fillStyle = '#427d9d'; c.fillRect(x + tile + 2, top + thickness - 2, Math.max(2, width - 4), 2);
          if (seed % 5 === 0) { c.fillStyle = '#b1e7f3'; c.fillRect(x + tile + 3, top + thickness, 2, 3 + seed % 5); }
          if (wear > .15 && seed % (wear > .45 ? 3 : 6) === 0) { c.strokeStyle = '#275b7b'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + tile + 2, top + 2); c.lineTo(x + tile + 5, top + 5); c.lineTo(x + tile + 3, top + thickness); c.stroke(); }
        }
        if (growth < 1) { const edge = platform.width * (.5 + growth * .5); c.fillStyle = '#f5ffff'; c.fillRect(x + edge - 2, platform.y - 9, 4, 4); c.fillRect(x + platform.width - edge - 2, platform.y - 8, 3, 3); }
        c.restore(); continue;
      }
      if (platform.kind === 'treeBranch') {
        const health = clamp((platform.durability ?? platform.maxDurability ?? 74) / (platform.maxDurability || 74), 0, 1); const burning = platform.burningUntilRound >= this.game.roundNumber;
        c.fillStyle = burning ? '#713b2c' : health < .4 ? '#644331' : '#765237'; c.fillRect(x, platform.y, platform.width, platform.height);
        c.fillStyle = burning ? '#e27b35' : '#a4be62'; c.fillRect(x, platform.y - 3, platform.width, 4);
        c.fillStyle = '#433022'; for (let mark = 8; mark < platform.width; mark += 15) c.fillRect(x + mark, platform.y + 4 + (mark % 3), 7, 3);
        if (health < 1) { c.fillStyle = health < .35 ? '#ef5b3f' : '#d69b50'; c.fillRect(x, platform.y + platform.height + 2, platform.width * health, 2); c.strokeStyle = '#241b17'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + platform.width * .48, platform.y); c.lineTo(x + platform.width * .57, platform.y + platform.height); c.stroke(); }
        if (burning) for (let flame = 7; flame < platform.width; flame += 18) { c.fillStyle = flame % 3 ? '#ff8b38' : '#ffe06a'; c.fillRect(x + flame, platform.y - 8 - Math.sin(time / 90 + flame) * 3, 5, 8); }
        continue;
      }
      if (platform.skyDeck) {
        c.fillStyle = '#21394b'; c.fillRect(x + 15, platform.y + platform.height, platform.width - 30, 9);
        c.strokeStyle = '#5f8190'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + 18, platform.y + 24); c.lineTo(x + platform.width / 2, platform.y + 64); c.lineTo(x + platform.width - 18, platform.y + 24); c.moveTo(x + 18, platform.y + 62); c.lineTo(x + platform.width / 2, platform.y + 24); c.lineTo(x + platform.width - 18, platform.y + 62); c.stroke();
        c.fillStyle = '#85d9e0'; for (let marker = 18; marker < platform.width - 10; marker += 32) c.fillRect(x + marker, platform.y + 19, 6, 3);
      }
      for (let bx = 0; bx < platform.width; bx += BLOCK) for (let by = 0; by < platform.height; by += BLOCK) {
        c.fillStyle = by === 0 ? '#b7cc76' : ((bx / BLOCK + by / BLOCK) % 3 ? '#526452' : '#758260'); c.fillRect(x + bx, platform.y + by, BLOCK - .5, BLOCK - .5);
      }
      if (platform.moving) {
        const pulse = .55 + Math.sin(time / 180) * .25; c.globalAlpha = pulse; c.fillStyle = '#71dce8';
        for (let bx = 10; bx < platform.width - 5; bx += 18) c.fillRect(x + bx, platform.y + platform.height + 3, 5, 3);
        c.globalAlpha = 1; if (this.worldDetailVisible(x + platform.width / 2, platform.y)) { c.fillStyle = '#d7faff'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('MÓVEL', x + platform.width / 2, platform.y + 23); }
      }
      if (platform.kind === 'bridge') { c.fillStyle = '#7ee6c4'; for (let bx = 5; bx < platform.width; bx += 20) c.fillRect(x + bx, platform.y - 3, 10, 2); if (this.worldDetailVisible(x + platform.width / 2, platform.y)) { c.fillStyle = '#dffff5'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('PONTE', x + platform.width / 2, platform.y - 7); } }
      const durability = clamp((platform.durability ?? 100) / (platform.kind === 'bridge' ? 155 : 100), 0, 1); if (durability < 1) { c.fillStyle = '#111923'; c.fillRect(x, platform.y + platform.height + 6, platform.width, 3); c.fillStyle = durability < .35 ? '#ff6757' : '#ffcf68'; c.fillRect(x, platform.y + platform.height + 6, platform.width * durability, 3); c.strokeStyle = '#151c25'; c.lineWidth = 2; for (let crack = 1; crack < 4; crack += 1) { const cx = x + platform.width * crack / 4; c.beginPath(); c.moveTo(cx, platform.y); c.lineTo(cx + (crack % 2 ? 7 : -7), platform.y + platform.height); c.stroke(); } }
      for (const flow of this.game.platformWaterFlows || []) if (flow.platformId === platform.id) { const head = flow.x + (x - platform.x); c.save(); c.globalAlpha = .62; c.fillStyle = '#4fcbea'; c.fillRect(Math.max(x, head - flow.width / 2), platform.y - 5, Math.min(flow.width, platform.x + platform.width - Math.max(platform.x, flow.x - flow.width / 2)), 6); c.fillStyle = '#c8f8ff'; for (let ripple = -flow.width / 2; ripple < flow.width / 2; ripple += 18) c.fillRect(clamp(head + ripple, x, x + platform.width - 5), platform.y - 7 + Math.sin(time / 80 + ripple) * 2, 6, 2); if (flow.cascading) for (let drop = 0; drop < 6; drop += 1) c.fillRect(head - 3 + Math.sin(time / 90 + drop) * 4, platform.y + drop * 12 + time / 45 % 12, 5, 9); c.restore(); }
    }
  }

  spawnPlatformDebris(platform) {
    if (platform.kind === 'iceSheet') { this.spawnIceShatter(platform); return; }
    const x = this.platformX(platform); for (let bx = 0; bx < platform.width; bx += BLOCK * 2) for (let by = 0; by < platform.height; by += BLOCK) this.addParticle({ x: x + bx, y: platform.y + by, vx: (Math.random() - .5) * 150, vy: -35 - Math.random() * 125, size: BLOCK, color: platform.kind === 'iceSheet' ? by ? '#83bdd7' : '#e7ffff' : by ? '#526452' : '#b7cc76', gravity: 230, life: 2.5, bounce: platform.kind === 'iceSheet' ? .48 : .3, drag: .985 });
  }

  spawnIceCracks(platform) {
    const x = this.platformX(platform) + platform.width * (.28 + Math.random() * .44);
    for (let i = 0; i < 12; i += 1) this.addParticle({ x: x + (Math.random() - .5) * 35, y: platform.y - 4, vx: (Math.random() - .5) * 85, vy: -45 - Math.random() * 70, size: 2 + i % 3, color: i % 3 ? '#a5eaff' : '#ffffff', gravity: 180, life: .5 + Math.random() * .5, bounce: .2, drag: .97 });
  }

  spawnIceShatter(platform) {
    const x = this.platformX(platform); const started = performance.now();
    const count = Math.min(32, Math.max(8, Math.ceil(platform.width / 15)));
    const chunks = Array.from({ length: count }, (_, i) => ({ x: x + (i + .5) * platform.width / count, vx: (Math.random() - .5) * 120, vy: -70 - Math.random() * 150, size: 7 + i % 4 * 3, spin: (Math.random() - .5) * 7, phase: Math.random() * .7 }));
    this.iceShatters.push({ x, y: platform.y, width: platform.width, started, duration: 1450, chunks });
    this.iceShatters = this.iceShatters.slice(-12);
    for (let i = 0; i < Math.min(65, Math.ceil(platform.width / 5)); i += 1) this.addParticle({ x: x + Math.random() * platform.width, y: platform.y + Math.random() * 8, vx: (Math.random() - .5) * 130, vy: -30 - Math.random() * 130, size: 2 + i % 4, color: i % 4 ? '#c7f5ff' : '#ffffff', gravity: 120, life: .7 + Math.random() * .8, bounce: .35, drag: .98 });
    this.onPhysicalEffect?.('iceBreak', .9);
  }

  drawIceShatters(c, time) {
    this.iceShatters = this.iceShatters.filter((effect) => time - effect.started < effect.duration);
    for (const effect of this.iceShatters) {
      const t = (time - effect.started) / 1000;
      c.save(); c.globalAlpha = Math.max(0, 1 - t / 1.45);
      c.strokeStyle = '#e8ffff'; c.lineWidth = 2;
      if (t < .22) for (let i = 0; i < 7; i += 1) { const sx = effect.x + effect.width * (i + .5) / 7; c.beginPath(); c.moveTo(sx, effect.y - 5); c.lineTo(sx + (i % 2 ? 7 : -8), effect.y + 9); c.stroke(); }
      for (const chunk of effect.chunks) { const cy = effect.y + chunk.vy * t + 250 * t * t; const cx = chunk.x + chunk.vx * t; c.save(); c.translate(cx, cy); c.rotate(chunk.spin * t + chunk.phase); c.fillStyle = '#6faecb'; c.fillRect(-chunk.size / 2, -chunk.size / 3, chunk.size, chunk.size * .65); c.fillStyle = '#e5ffff'; c.fillRect(-chunk.size / 2, -chunk.size / 3, chunk.size, 3); c.restore(); }
      c.restore();
    }
  }

  spawnTerrainDebris(before, after) {
    const changed = []; for (let x = 0; x < WORLD.width; x += BLOCK) if (after[x] - before[x] >= BLOCK) changed.push(x); if (!changed.length) return;
    const center = changed.reduce((sum, x) => sum + x, 0) / changed.length; let emitted = 0;
    for (const x of changed) { const oldY = Math.floor(before[x] / BLOCK) * BLOCK; const newY = Math.floor(after[x] / BLOCK) * BLOCK; for (let y = oldY; y < newY && emitted < 260; y += BLOCK * 2) { const outward = Math.sign(x - center) || (Math.random() < .5 ? -1 : 1); this.addParticle({ x, y, vx: outward * (25 + Math.random() * 95), vy: -55 - Math.random() * 150, size: BLOCK, color: colorForBlock(x, y, oldY, this.terrainBiome), gravity: 230, life: 2.4 + Math.random() * 1.5, bounce: .32, drag: .985 }); emitted += 1; } }
  }

  drawHillZone(c, time) {
    const hill = this.game?.hill; if (!['hill', 'teamHill'].includes(this.game?.mode) || !hill) return;
    const y = this.terrainHeights?.[Math.round(clamp(hill.x, 0, WORLD.width - 1))] ?? hill.y;
    const holder = this.game.players.find((player) => player.id === hill.lastCapturePlayerId);
    const teamHolder = hill.lastCaptureTeam && this.game.players.find((player) => player.team === hill.lastCaptureTeam);
    const color = hill.contested ? '#ff8361' : this.game.mode === 'teamHill' ? teamHolder?.color || '#e6d76a' : holder?.color || '#e6d76a';
    c.save(); c.globalAlpha = .28 + Math.sin(time / 300) * .06; c.fillStyle = color; c.beginPath(); c.ellipse(hill.x, y - 12, hill.radius, 28, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = .82; c.strokeStyle = color; c.lineWidth = 3; c.setLineDash([10, 8]); c.beginPath(); c.ellipse(hill.x, y - 12, hill.radius, 28, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    const scale = 1 / Math.max(.35, this.camera.zoom); c.translate(hill.x, y - 74 * scale); c.scale(scale, scale); c.fillStyle = '#07121ee8'; c.fillRect(-64, -12, 128, 25); c.strokeStyle = color; c.lineWidth = 1.5; c.strokeRect(-64, -12, 128, 25); c.fillStyle = color; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(hill.contested ? 'COLINA CONTESTADA' : this.game.mode === 'teamHill' && hill.lastCaptureTeam ? `EQUIPE ${hill.lastCaptureTeam.split('-').at(-1)} ${hill.teamScores?.[hill.lastCaptureTeam] || 0}/${hill.pointsToWin}` : holder ? `${holder.nickname.slice(0, 12)} ${holder.hillScore}/${hill.pointsToWin}` : 'CAPTURE A COLINA', 0, 1); c.restore();
  }

  drawMovementPreview(c, time) {
    const player = this.game?.players.find((entry) => entry.id === this.playerId);
    if (!player?.alive || this.game.phase !== 'playing' || this.game.players[this.game.turnIndex]?.id !== player.id || (this.game.actions?.movesLeft <= 0 && (player.fuel || 0) <= 0)) return;
    if (player.airborne) {
      if (this.movementMode === 'armoredDash' && (player.ammo?.armoredDash || 0) > 0 && this.game.actions?.movesLeft > 0) {
        const dir = this.armoredDashDirection(); const scale = 1 / Math.max(.32, this.camera.zoom);
        c.save(); c.strokeStyle = '#ff9b67'; c.fillStyle = '#fff0b4'; c.lineWidth = 3 * scale; c.setLineDash([9 * scale, 5 * scale]); c.beginPath(); c.moveTo(player.x, player.y); c.lineTo(player.x + dir * 310, player.y - 72); c.stroke(); c.setLineDash([]); c.font = `bold ${11 * scale}px monospace`; c.textAlign = 'center'; c.fillText('IMPULSO AÉREO', player.x + dir * 155, player.y - 51 * scale); c.restore();
      }
      return;
    }
    if (this.movementMode === 'jump' && (player.ammo?.jump || 0) > 0 && this.game.actions?.movesLeft > 0) { this.drawJumpPreview(c, player, time); return; }
    const equipped = player.selectedPowerups || [player.selectedPowerup];
    const canUsePower = player.powerupBlockedTurns <= 0;
    const rocketDash = canUsePower && equipped.includes('rocketDash') && player.inventory?.includes('rocketDash');
    const excavator = canUsePower && equipped.includes('excavator') && player.inventory?.includes('excavator');
    const armoredDash = this.movementMode === 'armoredDash' && (player.ammo?.armoredDash || 0) > 0;
    const spiderLeap = this.movementMode === 'spider' && !player.spiderClimb && (player.ammo?.spider || 0) > 0;
    if (armoredDash && this.game.actions?.movesLeft <= 0) return;
    if (spiderLeap) { this.drawSpiderLeapPreview(c, player, time); return; }
    const boost = player.inventory?.filter((type) => type === 'movementBoost').length || 0;
    const distance = armoredDash || rocketDash || excavator ? movementDistance({ armoredDash, rocketDash, boostStacks: boost }) : Math.min(player.fuel || 0, Math.max(55, driveStats(player).speed * 1.2));
    const scale = 1 / Math.max(.32, this.camera.zoom);
    const platforms = (this.game.terrain.floatingPlatforms || []).map((platform) => ({ ...platform, x: this.platformX(platform) }));
    const support = platforms.find((platform) => platform.id === player.supportPlatformId && platform.active);
    const actor = support ? { ...player, x: support.x + player.platformOffset, y: support.y - WORLD.tankRadius } : player;
    const key = `${this.game.turnNumber}:${actor.x}:${actor.y}:${this.movementMode}:${distance}:${rocketDash}:${excavator}:${player.spiderClimb}:${Math.floor(time / 250)}`;
    if (this.movementPreviewCache?.key !== key || this.movementPreviewCache?.game !== this.game) {
      const terrain = { ...this.game.terrain, floatingPlatforms: platforms };
      const landings = [-1, 1].map((dir) => {
        const previewTerrain = armoredDash || excavator ? { ...terrain, heights: [...terrain.heights] } : terrain;
        const candidate = armoredDash || excavator ? specialMovePath(previewTerrain, actor, dir, distance, { armoredDash, excavator }) : walkPath(previewTerrain, actor, dir, distance, this.game.objects);
        const launch = candidate.moved && candidate.safe ? launcherDestination(previewTerrain, this.game.objects, candidate, dir, this.game.turnNumber) : null;
        return launch ? { ...candidate, walkX: candidate.x, walkY: candidate.y, x: launch.x, y: launch.y, launcherId: launch.launcher.id } : candidate;
      });
      this.movementPreviewCache = { key, game: this.game, landings };
    }
    for (const dir of armoredDash ? [this.armoredDashDirection()] : [-1, 1]) {
      const landing = this.movementPreviewCache.landings[dir < 0 ? 0 : 1];
      const usable = landing.moved && landing.safe;
      const color = usable ? armoredDash ? '#ffae70' : '#b7ec58' : '#ff6757';
      const x = landing.moved ? landing.x : actor.x + dir * 28 * scale;
      const y = landing.moved ? landing.y - 29 * scale : actor.y - 26 * scale;
      c.save(); c.globalAlpha = .72 + Math.sin(time / 260 + dir) * .1; c.strokeStyle = color; c.lineWidth = (armoredDash || rocketDash ? 3 : 1.5) * scale; c.setLineDash(armoredDash || rocketDash ? [] : [4 * scale, 5 * scale]); c.beginPath(); c.moveTo(actor.x, actor.y + 8); if (landing.launcherId) c.lineTo(landing.walkX, landing.walkY); c.lineTo(x, y + 12 * scale); c.stroke(); c.setLineDash([]);
      if (armoredDash) { c.strokeStyle = '#ffe2a7'; c.lineWidth = 2 * scale; c.beginPath(); c.arc(x, landing.y, 15 * scale, 0, Math.PI * 2); c.moveTo(x - 23 * scale, landing.y); c.lineTo(x + 23 * scale, landing.y); c.stroke(); for (const wall of landing.wallBreakPoints || []) { c.fillStyle = '#ff674c'; c.fillRect(wall.x - 8 * scale, wall.y - 8 * scale, 16 * scale, 16 * scale); } }
      c.fillStyle = '#07121ddd'; c.fillRect(x - 30 * scale, y - 12 * scale, 60 * scale, 22 * scale); c.strokeRect(x - 30 * scale, y - 12 * scale, 60 * scale, 22 * scale);
      const label = !usable ? landing.safe ? 'PAREDE' : 'QUEDA' : landing.launcherId ? 'LANÇADOR' : armoredDash ? landing.wallBreakPoints?.length ? `DASH ×${landing.wallBreakPoints.length}` : 'DASH' : excavator ? 'ESCAVA' : rocketDash ? 'ARRANCA' : player.spiderClimb && landing.blockedByWall ? 'ESCALA' : 'OK';
      c.fillStyle = color; c.font = `bold ${10 * scale}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, x, y); c.restore();
    }
    if (armoredDash && this.armoredDashTarget) {
      const target = this.armoredDashTarget;
      c.save(); c.strokeStyle = '#ffb06e'; c.globalAlpha = .85; c.lineWidth = 2 * scale;
      c.beginPath(); c.arc(target.x, target.y, 12 * scale, 0, Math.PI * 2);
      c.moveTo(target.x - 18 * scale, target.y); c.lineTo(target.x - 7 * scale, target.y);
      c.moveTo(target.x + 7 * scale, target.y); c.lineTo(target.x + 18 * scale, target.y); c.stroke(); c.restore();
    }
  }

  drawJumpPreview(c, player, time) {
    const target = this.jumpTarget; const preview = this.jumpPreview(target); const scale = 1 / Math.max(.32, this.camera.zoom); const color = !target || preview?.valid ? '#55f4d5' : '#ff736a';
    c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 3 * scale; c.globalAlpha = .88; c.setLineDash([8 * scale, 5 * scale]);
    if (preview?.path?.length) { c.beginPath(); c.moveTo(preview.path[0].x, preview.path[0].y); for (const point of preview.path.slice(1)) c.lineTo(point.x, point.y); c.stroke(); }
    c.setLineDash([]);
    if (target) { c.beginPath(); c.arc(target.x, target.y, 14 * scale, 0, Math.PI * 2); c.moveTo(target.x - 21 * scale, target.y); c.lineTo(target.x + 21 * scale, target.y); c.moveTo(target.x, target.y - 21 * scale); c.lineTo(target.x, target.y + 21 * scale); c.stroke(); }
    if (preview?.impact) { const pulse = (18 + Math.sin(time / 150) * 3) * scale; c.globalAlpha = .3; c.beginPath(); c.arc(preview.impact.x, preview.impact.y + WORLD.tankRadius, pulse, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; c.font = `bold ${10 * scale}px monospace`; c.textAlign = 'center'; c.fillText(preview.valid ? 'POUSO PREVISTO' : 'FORA DA ARENA', preview.impact.x, preview.impact.y - 25 * scale); }
    else { c.font = `bold ${11 * scale}px monospace`; c.textAlign = 'center'; c.fillText('PUXO BALÍSTICO • ESCOLHA O POUSO', player.x, player.y - 52 * scale); }
    c.restore();
  }

  drawSpiderLeapPreview(c, player, time) {
    if (this.game.actions?.movesLeft <= 0) return;
    const range = movementDistance({ spiderLeap: true }); const scale = 1 / Math.max(.32, this.camera.zoom);
    const origin = this.renderPosition(this.visualPlayers.get(player.id) || player);
    const target = this.spiderTarget; const preview = this.spiderLeapPreview(target);
    const valid = Boolean(preview?.valid); const color = !target || valid ? '#d99cff' : '#ff736a';
    c.save(); c.globalAlpha = .5 + Math.sin(time / 230) * .12; c.strokeStyle = color; c.lineWidth = 2 * scale; c.setLineDash([7 * scale, 6 * scale]); c.beginPath(); c.arc(origin.x, origin.y, range, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    if (target) {
      const landing = preview?.path; const endX = landing?.x ?? target.x; const endY = landing?.y ?? target.y;
      c.globalAlpha = .88; c.strokeStyle = color; c.lineWidth = 3 * scale; c.setLineDash([7 * scale, 4 * scale]); c.beginPath(); c.moveTo(origin.x, origin.y); c.quadraticCurveTo((origin.x + endX) / 2, (origin.y + endY) / 2 - (landing?.arcHeight || 95) * 1.8, endX, endY); c.stroke(); c.setLineDash([]);
      c.strokeStyle = valid ? '#f2ddff' : '#ff736a'; c.lineWidth = 2 * scale; c.beginPath(); c.arc(target.x, target.y, 13 * scale, 0, Math.PI * 2); c.moveTo(target.x - 19 * scale, target.y); c.lineTo(target.x + 19 * scale, target.y); c.moveTo(target.x, target.y - 19 * scale); c.lineTo(target.x, target.y + 19 * scale); c.stroke();
      if (landing) { c.fillStyle = valid ? '#d99cff' : '#ff736a'; c.globalAlpha = .35; c.beginPath(); c.arc(endX, endY, 22 * scale, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
      const label = valid ? landing.surface?.endsWith('-bottom') ? 'TETO • ADERIR' : landing.surface?.startsWith('structure-') ? 'ESTRUTURA • ADERIR' : landing.attachedToWall ? 'PAREDE • ESCALAR' : landing.surface === 'ground' ? 'SOLO • POUSAR' : 'PLATAFORMA • ADERIR' : 'SEM CONTATO';
      const labelX = landing?.x ?? target.x; const labelY = (landing?.y ?? target.y) - 31 * scale;
      c.fillStyle = '#07121de8'; c.fillRect(labelX - 67 * scale, labelY - 11 * scale, 134 * scale, 22 * scale); c.strokeStyle = color; c.strokeRect(labelX - 67 * scale, labelY - 11 * scale, 134 * scale, 22 * scale); c.fillStyle = color; c.font = `bold ${10 * scale}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, labelX, labelY);
    } else { c.globalAlpha = 1; c.fillStyle = color; c.font = `bold ${11 * scale}px monospace`; c.textAlign = 'center'; c.fillText(`ARANHA • ${range} BLOCOS`, origin.x, origin.y - range - 12 * scale); }
    c.restore();
  }

  drawBlinkPreview(c, time) {
    const player = this.game?.players.find((entry) => entry.id === this.playerId);
    if (!this.blinkMode || !player?.alive || this.game.phase !== 'playing' || this.game.players[this.game.turnIndex]?.id !== player.id || this.game.actions?.movesLeft <= 0) return;
    const range = this.blinkMode === 'teleport' ? 580 : 270;
    const scale = 1 / Math.max(.32, this.camera.zoom);
    const origin = this.renderPosition(this.visualPlayers.get(player.id) || player);
    const guideY = origin.y - 67 * scale;
    const target = this.blinkTarget;
    const preview = this.blinkPreview(target);
    const color = !target || preview?.valid ? '#d8f75a' : '#ff716c';
    c.save();
    c.globalAlpha = .68 + Math.sin(time / 240) * .1;
    c.strokeStyle = '#d8f75a'; c.lineWidth = 2 * scale; c.setLineDash([6 * scale, 5 * scale]);
    c.beginPath(); c.moveTo(Math.max(0, origin.x - range), guideY); c.lineTo(Math.min(WORLD.width, origin.x + range), guideY); c.stroke(); c.setLineDash([]);
    for (const edge of [Math.max(0, origin.x - range), Math.min(WORLD.width, origin.x + range)]) {
      c.beginPath(); c.moveTo(edge, guideY - 12 * scale); c.lineTo(edge, guideY + 12 * scale); c.stroke();
    }
    c.fillStyle = '#07121de8'; c.fillRect(origin.x - 56 * scale, guideY - 26 * scale, 112 * scale, 19 * scale);
    c.fillStyle = '#d8f75a'; c.font = `bold ${10 * scale}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`BLINK  ${range} BLOCOS`, origin.x, guideY - 16 * scale);
    if (target) {
      const landing = preview?.landing;
      const end = landing || target;
      c.globalAlpha = .85; c.strokeStyle = color; c.lineWidth = 2.5 * scale; c.setLineDash([7 * scale, 5 * scale]);
      c.beginPath(); c.moveTo(origin.x, origin.y - 18 * scale); c.lineTo(end.x, end.y - 18 * scale); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(target.x, target.y, 11 * scale, 0, Math.PI * 2); c.moveTo(target.x - 16 * scale, target.y); c.lineTo(target.x + 16 * scale, target.y); c.moveTo(target.x, target.y - 16 * scale); c.lineTo(target.x, target.y + 16 * scale); c.stroke();
      if (landing) {
        c.globalAlpha = .35 + Math.sin(time / 180) * .12; c.fillStyle = '#d8f75a'; c.fillRect(landing.x - 19, landing.y - 12, 38, 17); c.fillRect(landing.x - 10, landing.y - 23, 20, 12);
        c.globalAlpha = 1; c.strokeStyle = '#f2ffb3'; c.strokeRect(landing.x - 22, landing.y - 28, 44, 35);
      }
      const distance = Number.isFinite(preview?.distance) ? Math.round(preview.distance) : '—';
      const label = preview?.valid ? `${distance}/${range} BLOCOS  •  POUSO` : `${distance}/${range}  •  ${preview?.distance > range ? 'FORA DO ALCANCE' : 'SEM POUSO'}`;
      const labelX = clamp(end.x, 96 * scale, WORLD.width - 96 * scale);
      const labelY = end.y - 45 * scale;
      c.fillStyle = '#07121eef'; c.fillRect(labelX - 91 * scale, labelY - 11 * scale, 182 * scale, 22 * scale);
      c.strokeStyle = color; c.strokeRect(labelX - 91 * scale, labelY - 11 * scale, 182 * scale, 22 * scale);
      c.fillStyle = color; c.font = `bold ${9 * scale}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, labelX, labelY);
    }
    c.restore();
  }

  drawSplitTank(c, p, time) {
    const split = p.splitDeath; const progress = clamp((time - split.started) / split.duration, 0, 1);
    const separation = 2 + progress * 25; const drop = progress * progress * 18;
    c.save(); c.translate(split.x, split.y); c.globalAlpha = 1 - Math.max(0, progress - .88) * 3;
    for (const block of this.tankBlueprint(p.facing, p.classType === 'armored')) {
      const side = block.x < 0 ? -1 : 1; const x = block.x * TANK_BLOCK + side * separation;
      const y = block.y * TANK_BLOCK + drop + (side < 0 ? -progress * 8 : progress * 8);
      c.fillStyle = block.tone === 0 ? '#101722' : block.tone >= 7 ? '#b6c7c4' : p.color;
      c.fillRect(Math.round(x), Math.round(y), TANK_BLOCK, TANK_BLOCK);
    }
    c.strokeStyle = '#fff4ff'; c.lineWidth = 2 + Math.sin(time / 80) * .8; c.beginPath(); c.moveTo(-11, -28); c.lineTo(11, 26); c.stroke();
    c.strokeStyle = '#ae62ff'; c.lineWidth = 5; c.globalAlpha = .35 + Math.sin(time / 110) * .15; c.beginPath(); c.moveTo(-14, -31); c.lineTo(14, 29); c.stroke(); c.restore();
  }

  drawTank(c, p, active, time) {
    if (p?.splitDeath) { this.drawSplitTank(c, p, time); return; }
    const motion = tankMotionState(this.game, p, this.worldNow());
    const walking = motion === TANK_STATE.MOVING && Boolean(p?.moving);
    const climbing = motion === TANK_STATE.WALL && Boolean(p?.moving);
    if (!p || p.hidden || p.visualAlive === false) return; const position = this.renderPosition(p); if (p.reviveAnimation) this.drawReviveAura(c, p, position, time); const x = Math.round(position.x / TANK_BLOCK) * TANK_BLOCK; const y = Math.round(position.y / TANK_BLOCK) * TANK_BLOCK; const onPlatform = Boolean(p.supportPlatformId); const leftY = this.terrainHeights?.[Math.round(clamp(position.x - 9, 0, WORLD.width - 1))] || position.y; const rightY = this.terrainHeights?.[Math.round(clamp(position.x + 9, 0, WORLD.width - 1))] || position.y; const flightTilt = p.airborne?.parachute ? Math.sin(time / 260) * .065 : p.airborne ? clamp(Math.atan2(p.airborne.vy || 0, Math.max(80, Math.abs(p.airborne.vx || 0))) * .4 * p.facing, -.52, .52) : null; const slope = flightTilt ?? (onPlatform ? 0 : clamp(Math.atan2(rightY - leftY, 18), -.3, .3)); const bob = p.airborne?.parachute ? Math.sin(time / 180) * 2 : p.moving && !p.airborne ? Math.sin(time / 48) * 1.2 : 0; const recoil = Math.max(0, ((p.airRecoilUntil || 0) - time) / 260) * 7; const launchProgress = clamp((time - (p.jumpStartedAt || 0)) / 260, 0, 1); const launchStretch = p.airborne && launchProgress < 1 ? Math.sin(launchProgress * Math.PI) : 0; const nearbyTank = [...this.visualPlayers.values()].some((other) => other.id !== p.id && other.visualAlive !== false && Math.hypot((other.renderX ?? other.x) - position.x, (other.renderY ?? other.y) - position.y) < 90); const coarsePointer = this.coarsePointer ??= matchMedia('(pointer: coarse)').matches; const maxTankScale = nearbyTank ? .95 : coarsePointer ? 1.14 : 1.38; const classScale = p.classType === 'armored' ? 1.22 : 1; const visibilityScale = clamp(.48 / this.camera.zoom, .84, maxTankScale) * classScale; let bodyRotation = slope; c.save(); c.translate(x - p.facing * recoil, y + bob - 3); c.rotate(slope); c.scale(visibilityScale * (1 - launchStretch * .12), visibilityScale * (1 + launchStretch * .18)); if (p.invisibleTurns > 0) c.globalAlpha = .48 + Math.sin(time / 150) * .12;
    if (p.ceilingClinging || p.surfaceClinging?.side === 'bottom') { c.rotate(Math.PI); bodyRotation += Math.PI; }
    else if (p.surfaceClinging?.side === 'left') { c.rotate(Math.PI / 2); bodyRotation += Math.PI / 2; }
    else if (p.surfaceClinging?.side === 'right') { c.rotate(-Math.PI / 2); bodyRotation -= Math.PI / 2; }
    if (p.classType === 'elementalist') this.drawElementalAura(c, p, time);
    if (p.splitDamageUntilRound >= this.game.roundNumber) { c.save(); c.globalAlpha = .45 + Math.sin(time / 135) * .16; c.strokeStyle = '#69e6ff'; c.lineWidth = 3; c.setLineDash([5, 4]); c.beginPath(); c.arc(0, 0, 28 + Math.sin(time / 240) * 3, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore(); }
    if (p.armorAuraActive && !p.teslaDisabledTurns) { c.save(); c.globalAlpha = .24 + Math.sin(time / 230) * .07; c.strokeStyle = '#90ddff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 31, 0, Math.PI * 2); c.stroke(); c.restore(); }
    if (p.foamGuardUntilRound >= this.game.roundNumber) { c.save(); c.globalAlpha = .5 + Math.sin(time / 175) * .13; c.strokeStyle = '#86eaff'; c.shadowColor = '#7cecff'; c.shadowBlur = 10; c.lineWidth = 3; c.setLineDash([6, 3]); c.beginPath(); c.arc(0, 0, 32, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); for (let dot = 0; dot < 5; dot += 1) { const angle = dot * Math.PI * 2 / 5 + time / 900; c.fillStyle = '#d9fbff'; c.fillRect(Math.cos(angle) * 34 - 2, Math.sin(angle) * 30 - 2, 4, 4); } c.restore(); }
    if (p.classType === 'incendiary' && !p.teslaDisabledTurns) { c.save(); c.globalAlpha = .34 + Math.sin(time / 210) * .1; c.fillStyle = '#ff9655'; for (let ember = 0; ember < 5; ember += 1) { const phase = (time / 21 + ember * 13) % 38; c.fillRect(Math.cos(ember * 2.4) * (18 + ember * 2), -phase, 2 + ember % 2, 2 + ember % 2); } c.restore(); }
    if (p.arsenal?.includes('superheat') && !p.teslaDisabledTurns) { c.save(); const charged = p.superheatEnemyTurns > 0; c.globalAlpha = (charged ? .36 : .2) + Math.sin(time / 260) * .06; c.strokeStyle = charged ? '#ffb15e' : '#ff713d'; c.lineWidth = charged ? 2 : 1.5; c.beginPath(); c.arc(0, -2, 32 + Math.sin(time / 300) * 2, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#ffba73'; for (let ember = 0; ember < 4; ember += 1) { const angle = ember * Math.PI / 2 + time / 1150; c.fillRect(Math.cos(angle) * 32 - 2, Math.sin(angle) * 22 - 6, 3, 3); } c.restore(); }
    const spiderLeapProgress = p.launchAnimation?.kind === 'spiderLeap' ? clamp((time - p.launchAnimation.started) / p.launchAnimation.duration, 0, 1) : 1;
    if ((p.wallClinging || (p.climbingUntil || 0) > time) && spiderLeapProgress > .72) {
      c.rotate(-slope);
      c.rotate(-(p.wallClinging || p.facing) * Math.PI / 2);
      bodyRotation -= slope + (p.wallClinging || p.facing) * Math.PI / 2;
      c.translate(0, -2 + (climbing ? Math.sin(time / 55) * 1.5 : 0));
    }
    if (motion === TANK_STATE.GLIDING) c.translate(Math.sin(time / 290) * 2, Math.sin(time / 220) * 1.5);
    if (motion === TANK_STATE.FLOATING) { c.translate(Math.sin(time / 320) * 1.5, Math.sin(time / 175) * 2); c.globalAlpha *= .9; }
    if (motion === TANK_STATE.SWIMMING) { c.translate(0, Math.sin(time / 210) * 2); c.save(); c.strokeStyle = '#c9faff'; c.lineWidth = 2; c.globalAlpha = .75; for (let wave = -1; wave <= 1; wave += 1) { c.beginPath(); c.arc(wave * 15, 5, 8 + Math.sin(time / 180 + wave) * 2, .1, Math.PI - .1); c.stroke(); } c.restore(); }
    if (motion === TANK_STATE.FALLING) { const fallTurn = clamp((p.airborne?.vx || 0) / 720, -.22, .22); c.rotate(fallTurn); bodyRotation += fallTurn; }
    const pull = this.game?.harpoonPull?.playerId === p.id ? this.game.harpoonPull : null;
    if (pull) { const progress = clamp((this.worldNow() - pull.startedAt) / (pull.endsAt - pull.startedAt), 0, 1); const direction = Math.sign(pull.toX - pull.fromX) || p.facing; const pullTurn = direction * Math.sin(progress * Math.PI) * .16; c.rotate(pullTurn); bodyRotation += pullTurn; c.translate(-direction * Math.sin(progress * Math.PI) * 4, 0); c.fillStyle = progress < .16 ? '#fff7ba' : '#73ffe0'; for (let i = 0; i < 7; i += 1) c.fillRect(-direction * (22 + i * 5), -3 + i % 3 * 3, 5 + i % 2 * 3, 3); }
    if (p.landingAnimation) { const progress = clamp((time - p.landingAnimation.started) / p.landingAnimation.duration, 0, 1); const spring = Math.sin(progress * Math.PI * 2.5) * (1 - progress) * p.landingAnimation.strength; c.scale(1 + spring * .16, 1 - spring * .24); if (progress >= 1) p.landingAnimation = null; }
    if (active) { c.fillStyle = '#b7ec58'; const pulse = Math.floor(time / 250) % 2; for (let i = -2; i <= 2; i += 1) c.fillRect(i * TANK_BLOCK, -29 - Math.abs(i) * TANK_BLOCK + pulse, TANK_BLOCK - .5, TANK_BLOCK - .5); }
    if (p.regenTurns > 0) this.drawStatusDrone(c, time, 'heal', p.regenTurns, -1);
    if (p.frozenTurns > 0) this.drawStatusDrone(c, time, 'freeze', p.frozenTurns, p.regenTurns > 0 ? 1 : 0);
    if (p.airborne) {
      c.globalAlpha = .85; c.fillStyle = p.airborne.parachute ? '#eef8ff' : '#42f5d7';
      if (p.airborne.parachute) {
        const drift = clamp((p.airborne.vx || 0) / 78, -1, 1);
        const canopyPulse = Math.sin(time / 140) * 2;
        c.save(); c.translate(-drift * 5, 0);
        for (let px = -22; px <= 22; px += 4) { const canopyY = -55 - Math.round(Math.sqrt(Math.max(0, 484 - px * px)) * .42) + canopyPulse; c.fillStyle = Math.abs(px / 4) % 2 ? '#eef8ff' : '#72e8ff'; c.fillRect(px, canopyY, 4, 5); }
        c.strokeStyle = '#d8f4ff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-21, -54 + canopyPulse); c.lineTo(-8 + drift * 5, -19); c.moveTo(0, -64 + canopyPulse); c.lineTo(drift * 5, -21); c.moveTo(21, -54 + canopyPulse); c.lineTo(8 + drift * 5, -19); c.stroke(); c.restore();
        if (Math.abs(drift) > .12) {
          c.globalAlpha = .35 + Math.sin(time / 100) * .12;
          c.fillStyle = '#b5f4ff';
          for (let i = 0; i < 4; i += 1) c.fillRect(-Math.sign(drift) * (27 + i * 8) + (time / 24 % 8), -62 + i * 9, 9 - i, 2);
          c.globalAlpha = .85;
        }
      }
      else if (motion === TANK_STATE.FALLING) for (let trail = 0; trail < 6; trail += 1) { c.fillStyle = trail % 2 ? '#9ab5c3' : '#d7e5e2'; c.fillRect(-13 + trail * 5, -31 - trail % 2 * 5, 2, 7 + trail % 3 * 3); }
      else if (!p.airborne.fromHarpoon) for (let trail = 0; trail < 7; trail += 1) { const flicker = (trail + Math.floor(time / 45)) % 3; c.fillStyle = flicker ? '#42f5d7' : '#eaff9a'; c.fillRect(-p.facing * (18 + trail * 5), 4 + trail % 2 * 3, Math.max(2, 5 - trail * .4), Math.max(2, 5 - trail * .35)); }
      c.globalAlpha = 1;
    }
    if (p.shieldCharges > 0) { c.save(); const appear = clamp(1 - ((p.shieldAppearUntil || 0) - time) / 920, 0, 1); const radius = 25 + (1 - appear) * 13 + Math.sin(time / 190) * 2; c.globalAlpha = .42 + Math.sin(time / 120) * .1; c.fillStyle = '#6bd9ff'; c.beginPath(); c.arc(0, -4, radius, 0, Math.PI * 2); c.fill(); c.globalAlpha = .85; c.strokeStyle = '#d8fcff'; c.shadowColor = '#79e8ff'; c.shadowBlur = 14; c.lineWidth = 3; c.stroke(); c.restore(); }
    if ((p.cloakAppearUntil || 0) > time) { c.save(); const progress = 1 - (p.cloakAppearUntil - time) / 1000; c.globalAlpha = (1 - progress) * .7; c.strokeStyle = '#a6b8ff'; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(0, -5, 25 + progress * 30, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore(); }
    if (p.spiderClimb) { c.lineWidth = 2; for (const side of [-1, 1]) for (let leg = 0; leg < 3; leg += 1) { const stride = climbing || walking ? Math.sin(time / 83 + leg * 2.1 + (side < 0 ? Math.PI : 0)) * 5 : Math.sin(time / 420 + leg) * .7; const lift = Math.max(0, stride) * .7; c.strokeStyle = leg === 1 ? '#f0d6ff' : '#d28cff'; c.beginPath(); c.moveTo(side * (7 + leg * 3), 5); c.lineTo(side * (16 + leg * 5), 9 - leg * 7 - lift); c.lineTo(side * (21 + leg * 5) + stride, 14 - leg * 8 - lift); c.stroke(); c.fillStyle = '#fff0ff'; c.fillRect(side * (21 + leg * 5) + stride - 1, 13 - leg * 8 - lift, 2, 2); } }
    c.globalAlpha = .24; c.fillStyle = '#000000'; c.fillRect(-22, 12, 44, 5); c.globalAlpha = 1;
    const armored = p.classType === 'armored';
    const tones = ['#09111b', p.color, this.shade(p.color, -.34), this.shade(p.color, .34), '#d8eaf0', '#253443', this.shade(p.color, .65), '#b6c7c4', '#526878'];
    for (const block of this.tankBlueprint(p.facing, armored)) { c.fillStyle = tones[block.tone]; c.fillRect(block.x * TANK_BLOCK, block.y * TANK_BLOCK, TANK_BLOCK - .35, TANK_BLOCK - .35); }
    // The dark track, armored center and raised turret stay separate even at low zoom.
    const tread = p.moving ? Math.floor(time / 75) % 4 : 0;
    for (let wheel = -5; wheel <= 5; wheel += 2) { c.fillStyle = '#91a2aa'; c.fillRect(wheel * TANK_BLOCK, 3 * TANK_BLOCK, TANK_BLOCK - .4, TANK_BLOCK - .4); c.fillStyle = '#263540'; c.fillRect(wheel * TANK_BLOCK + 1, 3 * TANK_BLOCK + 1, 1, 1); }
    c.fillStyle = '#5a6a72'; for (let track = -6; track <= 6; track += 2) c.fillRect((track + tread % 2) * TANK_BLOCK, 4 * TANK_BLOCK, TANK_BLOCK - .4, 2);
    c.fillStyle = this.shade(p.color, .47); c.fillRect(-10, -5, 13, 2); c.fillStyle = '#0a1720'; c.fillRect(-7, -19, 15, 2);
    c.fillStyle = '#e7fbff'; c.fillRect(p.facing * 3, -17, 4, 3); c.fillStyle = '#08131d'; c.fillRect(p.facing * 4, -16, 2, 2);
    this.drawClassTankDetails(c, p, time, motion);
    const playerAiming = active && p.id === this.playerId && this.game.phase === 'playing' && !this.game.shotEndsAt;
    const aimAngle = playerAiming ? this.aim.angle : p.aimAngle ?? 0;
    const aimDirection = playerAiming ? this.aim.direction : p.aimDirection ?? p.facing;
    const targetBarrelAngle = barrelRadians(aimAngle, aimDirection);
    p.renderBarrelAngle = easeBarrelAngle(p.renderBarrelAngle, targetBarrelAngle, Math.max(0, time - (p.lastBarrelFrame || time - 16)));
    p.lastBarrelFrame = time;
    this.drawTankBarrel(c, p, p.renderBarrelAngle - bodyRotation, time);
    if (p.buoyActive) { const bob = Math.sin(time / 230 + p.x * .03) * 2; c.save(); c.strokeStyle = '#ff9e4a'; c.lineWidth = 5; c.beginPath(); c.ellipse(0, 5 + bob, 23, 8, 0, 0, Math.PI * 2); c.stroke(); c.strokeStyle = '#fff4cf'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 5 + bob, 23, 8, 0, Math.PI * .25, Math.PI * .65); c.stroke(); c.restore(); }
    if (armored) { c.fillStyle = '#e8d89a'; c.fillRect(-3, -25, 6, 3); c.fillStyle = '#0e1a23'; c.fillRect(-13, -9, 26, 3); c.fillStyle = '#d9e5df'; c.fillRect(-11, -8, 22, 2); c.fillStyle = '#ffcf76'; c.fillRect(p.facing * 18 - 2, -2, 4, 4); }
    if (p.moving && Math.floor(time / 90) % 3 === 0) { c.globalAlpha = .55; c.fillStyle = '#a9b8a8'; c.fillRect(-p.facing * 21, 4, 3, 3); c.fillRect(-p.facing * 25, 1, 2, 2); c.globalAlpha = 1; }
    if (p.launchAnimation?.kind === 'armoredDash') { const pulse = .72 + Math.sin(time / 42) * .18; c.globalAlpha = pulse; c.fillStyle = '#fff1a3'; c.fillRect(p.facing * 20 - (p.facing < 0 ? 6 : 0), -12, 6, 25); c.fillStyle = '#ff8066'; c.fillRect(p.facing * 25 - (p.facing < 0 ? 5 : 0), -8, 5, 17); c.strokeStyle = '#ffb06f'; c.lineWidth = 2; c.beginPath(); c.arc(0, -2, 28 + Math.sin(time / 55) * 2, -Math.PI * .62, Math.PI * .62); c.stroke(); c.globalAlpha = 1; }
    if ((p.hitFlashUntil || 0) > performance.now()) { const hitProgress = ((p.hitFlashUntil || 0) - performance.now()) / 430; c.globalAlpha = .3 + hitProgress * .45; c.fillStyle = hitProgress > .55 ? '#ffffff' : '#ff5b4d'; c.fillRect(-19, -15, 38, 29); c.globalAlpha = 1; c.translate((Math.random() - .5) * 3 * hitProgress, (Math.random() - .5) * 3 * hitProgress); }
    if ((p.burningHitUntil || 0) > time) { const heat = clamp((p.burningHitUntil - time) / 1500, 0, 1); c.save(); c.globalAlpha = .22 + heat * .4; c.fillStyle = '#e63327'; c.fillRect(-22, -25, 44, 32); c.strokeStyle = '#ff6843'; c.lineWidth = 3; c.strokeRect(-24, -27, 48, 37); for (let ember = 0; ember < 7; ember += 1) { const rise = (time / 19 + ember * 13) % 43; c.fillStyle = ember % 3 ? '#ff6437' : '#ffd46a'; c.fillRect(-19 + ember * 6, 4 - rise, 3, 3); } c.restore(); }
    if (p.moving) { c.fillStyle = '#b3c0b7'; for (let i = -4; i <= 4; i += 4) c.fillRect((i + tread % 2) * TANK_BLOCK, 4 * TANK_BLOCK, TANK_BLOCK - .4, 1.5); }
    if (p.frozenTurns > 0) { c.save(); c.globalAlpha = .52 + Math.sin(time / 180) * .08; c.fillStyle = '#8eeaff'; c.fillRect(-20, -23, 40, 29); c.fillStyle = '#eaffff'; for (const [ix, iy] of [[-16,5],[-12,-12],[12,-15],[17,2],[3,-23]]) c.fillRect(ix,iy,4,4); c.strokeStyle = '#f1ffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-19,-15); c.lineTo(-7,-8); c.lineTo(-11,4); c.moveTo(17,-20); c.lineTo(4,-9); c.lineTo(12,5); c.stroke(); c.restore(); }
    if (p.powerupBlockedTurns > 0) { c.globalAlpha = .72 + Math.sin(time / 65) * .22; c.strokeStyle = '#8ff3ff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-18,-17); c.lineTo(-9,-24); c.lineTo(-3,-16); c.lineTo(5,-27); c.lineTo(11,-18); c.lineTo(19,-23); c.stroke(); c.fillStyle = '#eaffff'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('POWER OFF', 0, -32); c.globalAlpha = 1; }
    c.globalAlpha = 1;
    c.restore();
  }

  drawTankBarrel(c, p, relativeAngle, time) {
    const armored = p.classType === 'armored';
    const length = p.classType === 'attacker' ? 36 : armored ? 34 : 30;
    const height = armored ? 10 : 8;
    const bob = Math.sin(time / 300) * (p.moving ? .7 : .25);
    c.save(); c.translate(1, -17 + bob); c.rotate(relativeAngle);
    c.fillStyle = '#08111b'; c.fillRect(0, -height / 2 - 1, length + 4, height + 2);
    c.fillStyle = p.classType === 'incendiary' ? '#9f4a2c' : p.classType === 'amphibian' ? '#388aa3' : this.shade(p.color, -.3);
    c.fillRect(4, -height / 2, length - 6, height);
    c.fillStyle = p.classType === 'incendiary' ? '#ffd28a' : p.classType === 'amphibian' ? '#b4f6ff' : '#c2d0d4';
    c.fillRect(5, -height / 2 + 1, length - 8, 2);
    c.fillStyle = '#24323d'; c.fillRect(2, -height / 2 - 2, 7, height + 4);
    c.fillStyle = p.classType === 'attacker' ? '#ff695e' : p.classType === 'incendiary' ? '#ff9c4f' : '#8d9fa9';
    c.fillRect(length - 3, -height / 2 - 2, 6, height + 4);
    c.fillStyle = '#09141d'; c.fillRect(length + 1, -2, 4, 4);
    c.fillStyle = p.classType === 'attacker' ? '#ffb49c' : '#e5f5ef'; c.fillRect(0, -3, 4, 6);
    c.restore();
  }

  drawReviveAura(c, player, position, time) {
    const revival = player.reviveAnimation; const progress = clamp((time - revival.started) / revival.duration, 0, 1);
    const pulse = 1 + Math.sin(time / 95) * .08; const fade = Math.min(1, (1 - progress) * 5);
    c.save(); c.globalAlpha = fade * (.18 + Math.sin(time / 150) * .04); c.fillStyle = '#ffe36e'; c.fillRect(position.x - 28, position.y - 24, 56, 44);
    c.globalAlpha = fade * .8;
    for (let ring = 0; ring < 2; ring += 1) for (let dot = 0; dot < 28; dot += 1) {
      const angle = dot / 28 * Math.PI * 2 + time / (ring ? -640 : 860);
      const radius = (ring ? 33 : 24) * pulse; c.fillStyle = ring ? '#ffd45d' : '#fff3a0';
      c.fillRect(Math.round(position.x + Math.cos(angle) * radius * .9), Math.round(position.y - 4 + Math.sin(angle) * radius * .75), ring ? 3 : 4, ring ? 3 : 4);
    }
    c.globalAlpha = fade * .7; c.fillStyle = '#ffe36e';
    for (let dot = -5; dot <= 5; dot += 1) c.fillRect(revival.toX + dot * 6, revival.toY + 10 + Math.sin(dot + time / 120) * 2, 4, 2);
    c.restore();
  }

  drawEnemyIndicators(c, time) {
    const pulse = 1 + Math.sin(time / 180) * .12;
    for (const player of this.game.players) {
      if (!player.alive || player.hidden) continue; const visual = this.visualPlayers.get(player.id); if (!visual) continue; const position = this.renderPosition(visual); const rawX = (position.x - this.camera.x) * this.camera.zoom; const rawY = (position.y - this.camera.y) * this.camera.zoom; const x = clamp(rawX, 44, VIEW.width - 44); const y = clamp(rawY - Math.max(18, 27 * this.camera.zoom), 32, VIEW.height - 22); const offscreen = rawX !== x || rawY < 18 || rawY > VIEW.height - 10; const own = player.id === this.playerId;
      c.save(); c.globalAlpha = own ? .92 : .84; c.translate(x, y); c.fillStyle = '#07101dcc'; c.fillRect(-28, -14, 56, 15); c.strokeStyle = player.color; c.lineWidth = own || this.game.players[this.game.turnIndex]?.id === player.id ? 1.5 : 1; c.strokeRect(-28, -14, 56, 15); c.fillStyle = player.color; c.beginPath(); c.moveTo(0, 8 * pulse); c.lineTo(-5 * pulse, 1); c.lineTo(5 * pulse, 1); c.closePath(); c.fill(); c.fillStyle = '#eef4ff'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText(own ? 'VOCÊ' : player.nickname.slice(0, 10), 0, -5); c.fillStyle = '#111925'; c.fillRect(-24, -2, 48, 3); c.fillStyle = player.health < player.maxHealth * .3 ? '#ff524f' : player.color; c.fillRect(-24, -2, 48 * player.health / player.maxHealth, 3); if (player.classType && CLASS_DEFS[player.classType]) { const info = CLASS_DEFS[player.classType]; const labelWidth = Math.max(52, info.name.length * 5 + 10); c.fillStyle = '#08111df2'; c.fillRect(-labelWidth / 2, -29, labelWidth, 13); c.fillStyle = info.color; c.fillRect(-labelWidth / 2, -29, 3, 13); c.font = 'bold 8px monospace'; c.fillStyle = '#f2f7ff'; c.fillText(info.name, 1, -20); } if (offscreen) { c.globalAlpha = .85; c.fillStyle = player.color; c.fillRect(-2, 10, 4, 4); } c.restore();
    }
  }

  drawNinjaGhosts(c, time) {
    for (const player of this.game.players) {
      const ghost = player.hidden && player.lastNinjaReveal?.reason === 'ghost' ? player.lastNinjaReveal : null;
      if (!ghost || ghost.destroyed || this.game.roundNumber > ghost.expiresRound) continue;
      const fade = this.game.roundNumber === ghost.expiresRound ? .62 : 1;
      const pulse = .38 + Math.sin(time / 190) * .1;
      c.save(); c.translate(Math.round(ghost.x), Math.round(ghost.y)); c.globalAlpha = pulse * fade;
      c.fillStyle = '#13537f'; c.fillRect(-22, -2, 44, 10); c.fillRect(-17, -8, 34, 8);
      c.fillStyle = '#83dcff'; c.fillRect(-19, 7, 38, 3); c.fillRect(-13, -13, 24, 5); c.fillRect(-3, -19, 17, 4);
      c.strokeStyle = '#7ce7ff'; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(0, -4, 28 + Math.sin(time / 210) * 2, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.globalAlpha = fade * .82; c.fillStyle = '#bceeff'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('ÚLTIMA POSIÇÃO', 0, -39); c.restore();
    }
  }

  drawPlayerLocator(c, time) {
    const player = this.visualPlayers.get(this.playerId); if (!player || player.hidden || player.visualAlive === false) return;
    const position = this.renderPosition(player); const rawX = (position.x - this.camera.x) * this.camera.zoom; const rawY = (position.y - this.camera.y) * this.camera.zoom;
    const x = clamp(rawX, 40, VIEW.width - 40); const tankTop = clamp(rawY - 25 * this.camera.zoom, 32, VIEW.height - 26); const y = tankTop - 19; const pulse = .82 + Math.sin(time / 160) * .18;
    c.save(); c.globalAlpha = pulse; c.fillStyle = '#071018ee'; c.fillRect(x - 38, y - 12, 76, 18); c.strokeStyle = player.invisibleTurns > 0 ? '#69d9ff' : '#b7ec58'; c.lineWidth = 2; c.strokeRect(x - 38, y - 12, 76, 18); c.fillStyle = player.invisibleTurns > 0 ? '#69d9ff' : '#b7ec58'; c.beginPath(); c.moveTo(x, y + 14); c.lineTo(x - 7, y + 5); c.lineTo(x + 7, y + 5); c.closePath(); c.fill(); c.fillStyle = '#eaffad'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(player.invisibleTurns > 0 ? 'INVISÍVEL' : 'VOCÊ', x, y - 3); c.restore();
  }

  drawArenaVisual(c, time) {
    const visual = this.arenaVisual; if (!visual) return; const elapsed = time - visual.started; if (visual.impact && elapsed > visual.duration) { this.arenaVisual = null; this.floodTerrainBefore = null; this.flushPendingState(); return; } const progress = clamp(elapsed / visual.duration, 0, 1); const event = visual.event;
    if (event.weatherPrelude && !visual.impact) return;
    if (event.type === 'lightning') this.drawStormSky(c, time, progress, visual.impact);
    if (event.type === 'eruption') { this.drawEruption(c, time, progress, event, visual.impact); return; }
    if (event.type === 'flood') { this.drawFlood(c, time, progress, event, visual.impact); return; }
    if (event.type === 'gale') { this.drawGale(c, time, progress, event, visual.impact); return; }
    if (event.type === 'flora') {
      const scale = 1 / Math.max(.32, this.camera.zoom); const countdown = Math.max(0, (visual.duration - elapsed) / 1000).toFixed(1);
      for (const [index, seed] of (event.seeds || []).entries()) {
        c.save(); const pulse = .88 + Math.sin(time / 155 + index) * .1; c.globalAlpha = visual.impact ? Math.max(.15, 1 - progress) : .45 + pulse * .25;
        c.strokeStyle = visual.impact ? '#d8ef78' : '#8fe873'; c.lineWidth = 3 * scale; c.setLineDash([10 * scale, 8 * scale]); c.lineDashOffset = -time / 32; c.beginPath(); c.ellipse(seed.x, seed.y - 3, seed.radius * pulse, seed.radius * .13 * pulse, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        const rain = visual.impact ? 18 : 34; for (let mote = 0; mote < rain; mote += 1) { const drift = ((time * (.035 + mote % 4 * .008) + mote * 79 + index * 31) % 330); const x = seed.x - seed.radius + (mote * 47 % Math.max(40, seed.radius * 2)); const y = seed.y - 315 + drift; if (y > seed.y) continue; c.fillStyle = mote % 3 ? '#b7ec58' : '#fff1a1'; c.fillRect(x, y, 3 * scale, 5 * scale); }
        if (visual.impact) { const sprout = Math.sin(Math.min(1, progress * 1.7) * Math.PI / 2); c.fillStyle = '#4d8a48'; for (let shoot = -3; shoot <= 3; shoot += 1) { const height = (25 + (shoot + 3) % 3 * 12) * sprout; c.fillRect(seed.x + shoot * 18 - 2, seed.y - height, 4, height); c.fillStyle = shoot % 2 ? '#8ac95c' : '#b7df67'; c.fillRect(seed.x + shoot * 18 - 9, seed.y - height, 18, 7); c.fillStyle = '#4d8a48'; } }
        else { c.translate(seed.x, seed.y - 44 * scale); c.scale(scale, scale); c.fillStyle = '#071018dd'; c.fillRect(-62, -12, 124, 24); c.strokeStyle = '#8fe873'; c.lineWidth = 1; c.strokeRect(-62, -12, 124, 24); c.fillStyle = '#eaffbf'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${seed.cluster === 'ancestral' ? 'ANCESTRAL' : seed.cluster === 'dense' ? 'MATA DENSA' : 'BOSQUE'} • ${countdown}s`, 0, 1); }
        c.restore();
      }
      return;
    }
    if (visual.impact) { this.drawArenaImpact(c, time, progress, event); return; }
    if (event.type === 'supply') { this.drawSupplyFlyover(c, time, progress, event); return; }
    if (event.type === 'luckyWinds') {
      for (const [index, zone] of (event.impacts || []).entries()) {
        const pulse = .92 + Math.sin(time / 210 + index * 1.7) * .08; const gradient = c.createRadialGradient(zone.x, zone.y, 8, zone.x, zone.y, zone.radius * pulse);
        gradient.addColorStop(0, '#fff6a244'); gradient.addColorStop(.55, '#ffd45f28'); gradient.addColorStop(1, '#ffb52b00'); c.fillStyle = gradient; c.beginPath(); c.arc(zone.x, zone.y, zone.radius * pulse, 0, Math.PI * 2); c.fill();
        c.save(); c.strokeStyle = '#ffe985'; c.lineWidth = 3 / Math.max(.35, this.camera.zoom); c.globalAlpha = .55 + Math.sin(time / 150 + index) * .2; c.setLineDash([18,12]); c.lineDashOffset = -time / 35; c.beginPath(); c.arc(zone.x, zone.y, zone.radius * (.88 + progress * .1), 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.fillStyle = '#fff4b0'; for (let dot = 0; dot < 18; dot += 1) { const angle = dot / 18 * Math.PI * 2 + time / 1100; const radius = zone.radius * (.28 + (dot % 4) * .16); c.fillRect(zone.x + Math.cos(angle) * radius, zone.y - 18 + Math.sin(angle) * radius * .22, 4, 4); } c.restore();
      }
      return;
    }
    if (event.type === 'tectonic') this.shake = Math.max(this.shake, 3 + progress * 15);
    for (const [index, impact] of (event.impacts || []).entries()) {
      const markerScale = 1 / Math.max(.32, this.camera.zoom); const warningPulse = .72 + Math.sin(time / 70 + index) * .18;
      c.save(); c.globalAlpha = Math.max(.18, 1 - progress * .55); c.strokeStyle = event.type === 'lightning' ? '#9eecff' : event.type === 'tectonic' ? '#d7ff68' : '#ffcf68'; c.lineWidth = 2.5 * markerScale; c.setLineDash([9 * markerScale, 7 * markerScale]); c.beginPath(); c.arc(impact.x, impact.y, Math.max(18, impact.radius) * (1.18 + (1 - progress) * .22), 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.translate(impact.x, impact.y - Math.max(34, impact.radius * .35)); c.scale(markerScale, markerScale); c.globalAlpha = warningPulse; c.fillStyle = '#070b12dd'; c.fillRect(-28, -10, 56, 20); c.strokeStyle = event.type === 'lightning' ? '#9eecff' : '#ffcf68'; c.lineWidth = 1; c.strokeRect(-28, -10, 56, 20); c.fillStyle = '#ffffff'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${Math.max(0, (visual.duration - (time - visual.started)) / 1000).toFixed(1)}s`, 0, 1); c.restore();
      if (event.type === 'bombardment') {
        const local = clamp((progress - (impact.delay || 0)) / Math.max(.2, 1 - (impact.delay || 0)), 0, 1); const flight = clamp(local / .86, 0, 1); const startY = this.camera.y - 110; const y = startY + (impact.y - startY) * flight * flight; c.save(); c.globalAlpha = .55 + Math.sin(time / 75 + index) * .25; c.strokeStyle = '#ff4f3d'; c.lineWidth = 3 / Math.max(.35, this.camera.zoom); c.beginPath(); c.arc(impact.x, impact.y, impact.radius * (1.42 - flight * .34), 0, Math.PI * 2); c.moveTo(impact.x - impact.radius * 1.25, impact.y); c.lineTo(impact.x + impact.radius * 1.25, impact.y); c.moveTo(impact.x, impact.y - impact.radius * .72); c.lineTo(impact.x, impact.y + impact.radius * .72); c.stroke(); if (local < .94) { c.globalAlpha = .7 + flight * .3; c.translate(impact.x, y); c.fillStyle = '#e9edf1'; c.fillRect(-6, -17, 12, 34); c.fillStyle = index > 3 ? '#ffce54' : '#ff603d'; c.fillRect(-6, -27, 12, 11); for (let trail = 0; trail < 13; trail += 1) { c.globalAlpha = 1 - trail / 14; c.fillStyle = trail % 2 ? '#ff6a35' : '#ffe66d'; c.fillRect(-5, -34 - trail * 9, 10, 8); } } else { const blast = clamp((local - .94) / .06, 0, 1); c.globalAlpha = 1 - blast * .35; c.fillStyle = index > 3 ? '#fff2a6' : '#ff8b3d'; c.beginPath(); c.arc(impact.x, impact.y, impact.radius * blast, 0, Math.PI * 2); c.fill(); } c.restore();
      } else if (event.type === 'lightning') {
        const pulsePhase = (progress * 2.4 + index * .21) % 1; const flash = pulsePhase < .12 ? 1 - pulsePhase / .12 : 0; if (flash > 0) this.drawLightningFlash(c, time, impact, index, flash);
      } else if (event.type === 'tectonic') {
        c.save(); c.strokeStyle = progress > .5 ? '#e0ff83' : '#8da54f'; c.lineWidth = 4 / Math.max(.35, this.camera.zoom); c.beginPath(); c.moveTo(impact.x - impact.radius, impact.y); for (let step = -impact.radius; step <= impact.radius; step += 18) c.lineTo(impact.x + step, impact.y + Math.sin(step * .16 + time / 75) * (4 + progress * 18)); c.stroke(); c.globalAlpha = .16 + progress * .28; c.fillStyle = impact.tectonicMode === 'sink' ? '#121923' : '#d7ff68'; c.fillRect(impact.x - impact.radius, impact.y - 8 - progress * 12, impact.radius * 2, 16 + progress * 24); c.restore(); if (Math.random() < .22) this.addParticle({ x: impact.x + (Math.random() - .5) * impact.radius * 2, y: impact.y - 5, vx: (Math.random() - .5) * 45, vy: -25 - Math.random() * 70, size: 3 + Math.random() * 4, color: '#8f9d69', gravity: 130, life: .7, bounce: .2, drag: .97 });
      } else if (event.type === 'collapse' || event.type === 'quake') {
        c.save(); c.strokeStyle = '#ffd465'; c.lineWidth = 2 / Math.max(.35, this.camera.zoom); for (let crack = -2; crack <= 2; crack += 1) { c.beginPath(); c.moveTo(impact.x, impact.y); c.lineTo(impact.x + crack * impact.radius * .42, impact.y + 18 + progress * 35); c.stroke(); } c.restore();
      }
    }
  }

  drawGale(c, time, progress, event, impact) {
    const direction = event.windDirection || 1; const scale = 1 / Math.max(.32, this.camera.zoom); const fade = impact ? Math.max(0, 1 - progress) : .45 + Math.sin(time / 120) * .12;
    c.save(); c.globalAlpha = fade; c.strokeStyle = impact ? '#e8fbff' : '#91d9e8'; c.lineWidth = 2.5 * scale; c.lineCap = 'square';
    for (let line = 0; line < 34; line += 1) { const width = 80 + (line % 6) * 45; const travel = ((time * (.18 + line % 4 * .03) + line * 173) % (WORLD.width + 400)); const x = direction > 0 ? travel - 200 : WORLD.width + 200 - travel; const y = 100 + (line * 83) % 760; c.beginPath(); c.moveTo(x, y + Math.sin(time / 90 + line) * 8); c.lineTo(x + width * direction, y); c.stroke(); c.fillStyle = line % 3 ? '#b7ec58' : '#dffaff'; c.fillRect(x + width * direction, y - 3, 7 * direction, 6); }
    for (let particle = 0; particle < 54; particle += 1) { const travel = ((time * (.24 + particle % 5 * .025) + particle * 241) % (WORLD.width + 500)); const x = direction > 0 ? travel - 250 : WORLD.width + 250 - travel; const y = 155 + (particle * 97) % 760 + Math.sin(time / 75 + particle) * 20; c.save(); c.translate(x, y); c.rotate(direction * time / 240 + particle); c.globalAlpha = fade * (.45 + particle % 4 * .12); c.fillStyle = particle % 4 === 0 ? '#9b7448' : particle % 3 === 0 ? '#d8bd79' : '#799955'; c.fillRect(-5 * scale, -2 * scale, 10 * scale, 4 * scale); c.restore(); }
    c.restore();
    for (const site of event.tornadoes || []) {
      c.save(); c.strokeStyle = '#b7f4e6'; c.lineWidth = 3 * scale; c.setLineDash([12 * scale, 8 * scale]); c.lineDashOffset = -time / 35;
      c.beginPath(); c.ellipse(site.x, site.y, site.width * .42, 18, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      if (impact) this.drawGaleTornado(c, site, time, clamp((progress - .1) / .75, 0, 1), true);
    }
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#071018d9'; c.fillRect(VIEW.width / 2 - 154, 82, 308, 45);
    c.strokeStyle = '#91d9e8'; c.lineWidth = 2; c.strokeRect(VIEW.width / 2 - 154, 82, 308, 45);
    c.fillStyle = '#e8fbff'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${direction > 0 ? '>>>' : '<<<'} VENDAVAL${event.tornadoes?.length ? ' + 2 TORNADOS' : ''} ${direction > 0 ? '>>>' : '<<<'}`, VIEW.width / 2, 105);
    c.restore();
    if (impact) this.shake = Math.max(this.shake, 5 + progress * 7);
  }

  drawFlood(c, time, progress, event, impact) {
    if (impact && this.pendingTerrain && this.terrainHeights && time - (this.floodTerrainFrameAt || 0) > 80) {
      this.floodTerrainFrameAt = time;
      this.floodTerrainBefore ||= [...this.terrainHeights];
      const target = this.pendingTerrain; const staged = [...this.floodTerrainBefore];
      for (const zone of event.impacts || []) {
        const local = clamp((progress - (zone.delay || 0)) / .72, 0, 1);
        const left = Math.max(0, Math.round(zone.x - zone.radius)); const right = Math.min(staged.length - 1, Math.round(zone.x + zone.radius));
        for (let x = left; x <= right; x += 1) staged[x] = Math.round(this.floodTerrainBefore[x] + (target[x] - this.floodTerrainBefore[x]) * local);
      }
      this.applyTerrain(staged, false, true); this.pendingTerrain = target;
    }
    for (const [index, zone] of (event.impacts || []).entries()) {
      const local = clamp((progress - (zone.delay || 0)) / .68, 0, 1);
      c.save(); c.globalAlpha = impact ? 1 - progress * .32 : .38 + Math.sin(time / 160 + index) * .12;
      c.strokeStyle = impact ? '#a6f1ff' : '#69c9f2'; c.lineWidth = 3 / Math.max(.4, this.camera.zoom);
      c.setLineDash([12, 7]); c.lineDashOffset = -time / 42; c.beginPath(); c.ellipse(zone.x, zone.y, zone.radius, 16 + local * 11, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      if (impact) {
        const level = zone.y + 4 + (1 - local) * 48;
        c.fillStyle = '#2c92bf8c'; c.fillRect(zone.x - zone.radius, level, zone.radius * 2, Math.max(3, zone.y + 54 - level));
        c.fillStyle = '#b3efff'; for (let block = -zone.radius; block < zone.radius; block += 24) c.fillRect(zone.x + block, level + Math.sin(time / 110 + block) * 3, 10, 3);
      }
      c.restore();
    }
  }

  drawEruption(c, time, progress, event, impact) {
    const rise = impact ? Math.min(1, progress * 3.2) : .3 + Math.sin(time / 210) * .025; const fade = impact ? Math.max(.18, 1 - Math.max(0, progress - .72) / .28) : .65 + Math.sin(time / 130) * .18; const scale = 1 / Math.max(.32, this.camera.zoom);
    for (const [index, river] of (event.lavaRivers || []).entries()) {
      const surface = WORLD.height + 45 + (river.surfaceY - WORLD.height - 45) * rise; const wave = Math.sin(time / 115 + index * 2.1) * 5;
      c.save(); c.globalAlpha = fade; const glow = c.createLinearGradient(0, surface - 42, 0, WORLD.height + 30); glow.addColorStop(0, '#fff08a'); glow.addColorStop(.12, '#ff9b35'); glow.addColorStop(.5, '#ef3e22'); glow.addColorStop(1, '#6b1015'); c.fillStyle = glow; c.shadowColor = '#ff4b22'; c.shadowBlur = 28 * scale; c.fillRect(river.left, surface + wave, river.width, WORLD.height + 70 - surface); c.shadowBlur = 0;
      c.fillStyle = '#fff3a5'; for (let x = river.left + 5; x < river.right; x += 16) { const crest = surface + wave + Math.sin(time / 82 + x * .07) * 4; c.fillRect(x, crest, Math.min(10, river.right - x), 4); }
      c.strokeStyle = '#ff6a35'; c.lineWidth = 3 * scale; c.setLineDash([11 * scale, 8 * scale]); c.lineDashOffset = -time / 28; c.beginPath(); c.moveTo(river.left, surface + wave); c.lineTo(river.right, surface - wave * .45); c.stroke(); c.setLineDash([]); c.restore();
      if (!impact) { c.save(); c.globalAlpha = .42 + Math.sin(time / 95 + index) * .18; c.fillStyle = '#ff552f'; c.fillRect(river.left, WORLD.height - 18, river.width, 18); c.fillStyle = '#fff09a'; c.font = `bold ${Math.round(9 * scale)}px monospace`; c.textAlign = 'center'; c.fillText('LAVA SUBINDO', river.x, Math.min(WORLD.height - 28, river.surfaceY - 14)); c.restore(); }
    }
    if (!impact) return;
    for (const [index, fireball] of (event.impacts || []).entries()) {
      const delay = fireball.delay || 0; const local = clamp((progress - delay) / (fireball.flightDuration || .34), 0, 1); if (local <= 0) continue; const path = fireball.path?.length ? fireball.path : [{ x: fireball.originX, y: fireball.originY }, { x: fireball.x, y: fireball.y }]; const pointAt = (portion) => path[Math.min(path.length - 1, Math.floor(clamp(portion, 0, 1) * (path.length - 1)))]; const current = pointAt(local); const x = current.x; const y = current.y; const radius = (8 + index % 3 * 2) * scale;
      c.save(); c.globalAlpha = local < .94 ? 1 : Math.max(0, (1 - local) * 16); c.shadowColor = '#ff421f'; c.shadowBlur = 24 * scale; for (let trail = 7; trail > 0; trail -= 1) { const back = pointAt(local - trail * .025); const tx = back.x; const ty = back.y; c.globalAlpha = (8 - trail) / 12; c.fillStyle = trail % 2 ? '#ff4b22' : '#ffb13d'; c.beginPath(); c.arc(tx, ty, radius * (1 - trail * .07), 0, Math.PI * 2); c.fill(); }
      c.globalAlpha = local < .94 ? 1 : Math.max(0, (1 - local) * 16); c.fillStyle = '#fff4a3'; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#ff5a25'; c.lineWidth = 4 * scale; c.stroke();
      if (local > .86) { const blast = clamp((local - .86) / .14, 0, 1); c.globalAlpha = 1 - blast; c.fillStyle = '#ff7436'; c.beginPath(); c.arc(fireball.x, fireball.y, fireball.radius * (1.65 * blast), 0, Math.PI * 2); c.fill(); c.strokeStyle = '#fff09a'; c.lineWidth = 3 * scale; c.stroke(); }
      c.restore();
    }
    if (progress < .68 && Math.random() < .45) { const rivers = event.lavaRivers || []; const river = rivers[Math.floor(Math.random() * rivers.length)]; if (river) this.addParticle({ x: river.left + Math.random() * river.width, y: river.surfaceY, vx: (Math.random() - .5) * 95, vy: -80 - Math.random() * 180, size: 3 + Math.random() * 6, color: Math.random() < .5 ? '#ff5a28' : '#ffe071', gravity: 180, life: .7 + Math.random() * .7, bounce: 0, drag: .98 }); }
  }

  drawArenaImpact(c, time, progress, event) {
    const fade = Math.max(0, 1 - progress); const scale = 1 / Math.max(.32, this.camera.zoom);
    for (const [index, impact] of (event.impacts || []).entries()) {
      const local = clamp(progress * 1.45 - (impact.delay || 0), 0, 1); if (local <= 0) continue;
      c.save();
      if (event.type === 'lightning') { const phase = (progress * 2.2 + index * .21) % 1; const flash = phase < .28 ? Math.sin(phase / .28 * Math.PI) * Math.max(.22, fade) : 0; if (flash > .02) this.drawLightningFlash(c, time, impact, index, flash); }
      else if (event.type === 'bombardment') { const blast = Math.sin(Math.min(1, local) * Math.PI); c.globalAlpha = fade * .85; c.fillStyle = index > 3 ? '#fff0a0' : '#ff743d'; c.shadowColor = '#ff4f2f'; c.shadowBlur = 24 * scale; c.beginPath(); c.arc(impact.x, impact.y, impact.radius * (1.15 + blast * .9), 0, Math.PI * 2); c.fill(); c.fillStyle = '#2d2f35'; c.globalAlpha = fade * .5; c.beginPath(); c.arc(impact.x, impact.y - impact.radius * (1.1 + local * 2.2), impact.radius * (.35 + local * .35), 0, Math.PI * 2); c.fill(); }
      else { c.globalAlpha = fade * .65; c.strokeStyle = event.type === 'luckyWinds' ? '#ffe985' : '#d7ff68'; c.lineWidth = 5 * scale; c.beginPath(); c.arc(impact.x, impact.y, impact.radius * (.75 + local * .55), 0, Math.PI * 2); c.stroke(); }
      c.restore();
    }
  }

  drawSupplyFlyover(c, time, progress, event) {
    const inverseZoom = 1 / Math.max(.35, this.camera.zoom); const craftScale = .68 * inverseZoom; const viewWidth = VIEW.width / this.camera.zoom; const direction = event.helicopter?.direction || 1; const margin = 105 * inverseZoom; const startX = this.camera.x - margin; const endX = this.camera.x + viewWidth + margin; const eased = progress * progress * (3 - 2 * progress); const x = direction > 0 ? startX + (endX - startX) * eased : endX - (endX - startX) * eased; const y = this.camera.y + (90 + Math.sin(time / 115) * 4) * inverseZoom; const tilt = Math.sin(progress * Math.PI * 2) * .035;
    c.save(); c.translate(x, y); c.rotate(tilt * direction); c.scale(-direction * craftScale, craftScale); c.globalAlpha = .18; c.fillStyle = '#000'; c.fillRect(-33,17,74,4); c.globalAlpha = 1; c.fillStyle = '#0a121c'; c.fillRect(-34,-8,63,18); c.fillRect(-21,-17,31,9); c.fillStyle = '#3d5867'; c.fillRect(-29,-5,52,12); c.fillStyle = '#78d7e0'; c.fillRect(-17,-14,22,8); c.fillStyle = '#dffcff'; c.fillRect(-14,-13,8,6); c.fillStyle = '#18303d'; c.fillRect(25,-3,36,7); c.fillRect(53,-12,7,19); c.fillStyle = '#b7ec58'; c.fillRect(17,-1,8,5); c.fillStyle = '#ff6b4a'; c.fillRect(-33,-3,4,5); c.fillStyle = '#81909b'; c.fillRect(-23,11,4,8); c.fillRect(17,11,4,8); c.fillRect(-23,17,44,3); c.fillStyle = '#eefcff'; c.fillRect(-4,-22,5,7); c.save(); c.translate(-2,-21); c.rotate(time / 29); c.globalAlpha = .88; c.fillRect(-46,-1,92,3); c.fillRect(-1,-7,3,14); c.restore(); c.save(); c.translate(61,-5); c.rotate(-time / 25); c.fillRect(-9,-1,18,3); c.fillRect(-1,-9,3,18); c.restore(); c.restore();
    for (const drop of event.drops || []) {
      if (progress < drop.releaseProgress) continue; const fall = clamp((progress - drop.releaseProgress) / Math.max(.1, .96 - drop.releaseProgress), 0, 1); const startY = this.camera.y + 128 * inverseZoom; const dropY = startY + (drop.y - startY) * (fall * fall); const sway = Math.sin(time / 170 + drop.x) * 10 * inverseZoom * (1 - fall); const size = (drop.type === 'lootbox' ? 13 : 10) * inverseZoom;
      c.save(); c.strokeStyle = '#dffaff'; c.lineWidth = 1.5 * inverseZoom; c.beginPath(); c.moveTo(drop.x + sway - 20 * inverseZoom, dropY - 23 * inverseZoom); c.quadraticCurveTo(drop.x + sway, dropY - 41 * inverseZoom, drop.x + sway + 20 * inverseZoom, dropY - 23 * inverseZoom); c.moveTo(drop.x + sway - 20 * inverseZoom, dropY - 23 * inverseZoom); c.lineTo(drop.x + sway - size * .45, dropY - size); c.moveTo(drop.x + sway + 20 * inverseZoom, dropY - 23 * inverseZoom); c.lineTo(drop.x + sway + size * .45, dropY - size); c.stroke(); c.fillStyle = drop.type === 'lootbox' ? '#ffd45f' : collectibleInfo(drop.type).color; c.fillRect(drop.x + sway - size / 2, dropY - size, size, size); c.fillStyle = '#071018'; c.fillRect(drop.x + sway - size * .12, dropY - size, size * .24, size); if (drop.type === 'lootbox') { c.fillStyle = '#fff5b2'; c.fillRect(drop.x + sway - size * .32, dropY - size * .7, size * .64, size * .18); } c.restore();
    }
  }

  drawStormSky(c, time, progress, impact) {
    const inverseZoom = 1 / Math.max(.35, this.camera.zoom); const viewWidth = VIEW.width * inverseZoom; const viewHeight = VIEW.height * inverseZoom; const intensity = impact ? .42 * Math.max(.35, 1 - progress * .72) : .18 + progress * .27; c.save(); c.fillStyle = `rgba(3,7,17,${intensity})`; c.fillRect(this.camera.x - 8 * inverseZoom, this.camera.y - 8 * inverseZoom, viewWidth + 16 * inverseZoom, viewHeight + 16 * inverseZoom); for (let layer = 0; layer < 3; layer += 1) { const cloudY = this.camera.y + (36 + layer * 31) * inverseZoom; const span = (150 + layer * 34) * inverseZoom; const drift = ((time * (.012 + layer * .003)) % span + span) % span; c.globalAlpha = .52 - layer * .09; c.fillStyle = layer === 0 ? '#111827' : layer === 1 ? '#1a2330' : '#26313d'; for (let cloud = -2; cloud < 10; cloud += 1) { const cloudX = this.camera.x + cloud * span - drift; c.fillRect(cloudX, cloudY, 104 * inverseZoom, 15 * inverseZoom); c.fillRect(cloudX + 18 * inverseZoom, cloudY - 13 * inverseZoom, 58 * inverseZoom, 14 * inverseZoom); c.fillRect(cloudX + 42 * inverseZoom, cloudY - 23 * inverseZoom, 30 * inverseZoom, 11 * inverseZoom); } } if (impact) { const flashPhase = (progress * 5.2) % 1; if (flashPhase < .065) { c.globalAlpha = (1 - flashPhase / .065) * .2; c.fillStyle = '#dffcff'; c.fillRect(this.camera.x, this.camera.y, viewWidth, viewHeight); } } c.restore();
  }

  drawLightningFlash(c, time, impact, index, alpha) {
    const scale = 1 / Math.max(.35, this.camera.zoom); const skyY = this.camera.y + 72 * scale; const flicker = Math.floor(time / 36); c.save(); c.globalAlpha = alpha; c.strokeStyle = '#dffcff'; c.shadowColor = '#65ddff'; c.shadowBlur = 8 * scale; c.lineWidth = 1.35 * scale; c.beginPath(); c.moveTo(impact.x + Math.sin(index * 5 + flicker) * 16, skyY); for (let part = 1; part <= 15; part += 1) { const portion = part / 15; const jitter = part === 15 ? 0 : Math.sin(part * 12.7 + index * 3 + flicker) * 10; c.lineTo(impact.x + jitter, skyY + (impact.y - skyY) * portion); } c.stroke(); c.shadowBlur = 0; c.globalAlpha = alpha * .7; c.strokeStyle = '#ffffff'; c.lineWidth = .45 * scale; c.stroke(); c.globalAlpha = alpha * .48; c.fillStyle = '#bff7ff'; c.beginPath(); c.arc(impact.x, impact.y, impact.radius * (.35 + alpha * .32), 0, Math.PI * 2); c.fill(); c.restore();
  }

  drawElementalAura(c, p, time) {
    const type = p.elementalCurrent; const info = ELEMENT_VISUALS[type];
    if (!info || this.game.players[this.game.turnIndex]?.id !== p.id || p.elementalImprintTurn === this.game.turnNumber || p.teslaDisabledTurns) return;
    const pulse = .78 + Math.sin(time / 170) * .22;
    c.save();
    const glow = c.createRadialGradient(0, -8, 4, 0, -8, 50);
    glow.addColorStop(0, `${info.color}cc`); glow.addColorStop(.4, `${info.color}72`); glow.addColorStop(1, `${info.color}00`);
    c.globalAlpha = .62 * pulse; c.fillStyle = glow; c.fillRect(-55, -60, 110, 105);
    c.globalAlpha = .8; c.strokeStyle = info.color; c.lineWidth = 3;
    c.beginPath(); c.ellipse(0, 0, 32 + Math.sin(time / 230) * 2, 20, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
    for (let i = 0; i < 16; i += 1) {
      const phase = (time / (type === 'elementalWind' ? 210 : 390) + i * 2.4) % (Math.PI * 2);
      let px = Math.cos(phase) * (23 + i % 4 * 5); let py = -12 + Math.sin(phase) * (15 + i % 3 * 4);
      if (type === 'elementalFire') { py = 9 - ((time / 30 + i * 11) % 47); px += Math.sin(time / 170 + i) * 3; }
      else if (type === 'elementalWater') { py = 7 - ((time / 43 + i * 9) % 38); px += Math.sin(time / 190 + i * 2) * 5; }
      else if (type === 'elementalWind') { px = -32 + ((time / 21 + i * 13) % 65); py = -25 + i % 6 * 8 + Math.sin(time / 135 + i) * 3; }
      else if (type === 'elementalEarth') { py = -34 + ((time / 48 + i * 10) % 46); px = Math.cos(i * 2.4) * (24 + i % 3 * 4); }
      else if (type === 'elementalIce') { py = -29 + Math.sin(time / 350 + i * 2) * 12; px = Math.cos(time / 490 + i * 2.6) * (25 + i % 3 * 3); }
      const size = type === 'elementalEarth' ? 4 + i % 3 : type === 'elementalIce' ? 3 + i % 3 : 2 + i % 3;
      c.fillStyle = i % 4 === 0 ? '#ffffff' : info.color; c.fillRect(Math.round(px), Math.round(py), size, size);
      if (type === 'elementalWater' && i % 4 === 0) { c.strokeStyle = '#e5ffff'; c.lineWidth = 1; c.strokeRect(Math.round(px) - 2, Math.round(py) - 2, size + 4, size + 4); }
      if (type === 'elementalIce' && i % 3 === 0) { c.fillStyle = '#ffffff'; c.fillRect(Math.round(px) + 2, Math.round(py) - 3, 2, size + 6); }
    }
    c.restore();
  }

  drawClassTankDetails(c, p, time, motion) {
    const moving = motion === TANK_STATE.MOVING || motion === TANK_STATE.SWIMMING;
    const beat = Math.sin(time / (moving ? 85 : 270));
    const pixel = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
    c.save(); c.scale(p.facing || 1, 1);
    switch (p.classType) {
      case 'attacker':
        pixel(-15, -23, 8, 4, '#501c24'); pixel(-13, -27, 4, 5, '#ff5057');
        pixel(-4, -27, 8, 3, '#ff5969');
        pixel(-17, -9, 4, 13, '#8c273b'); pixel(-16, -13, 7, 4, '#ff5756');
        if (Math.floor(time / 180) % 2) pixel(-13, -29, 3, 3, '#fff0bb');
        break;
      case 'bomber':
        for (const [x, y] of [[-19, -26], [-12, -31]]) {
          pixel(x, y, 12, 6, '#46201a'); pixel(x + 2, y + 1, 8, 3, '#ff7a31');
          pixel(x + 9, y, 4, 6, '#ffc15a');
        }
        pixel(-17, -8, 8, 10, '#a74b26'); pixel(10, -8, 8, 10, '#a74b26');
        pixel(-6, -26, 10, 3, '#ffd05e');
        pixel(-21 - beat * 2, -13, 5, 3, moving ? '#ffb44e' : '#c97839');
        break;
      case 'healer':
        pixel(-20, -16, 8, 15, '#264f42'); pixel(-19, -14, 6, 11, '#76efa6');
        pixel(-17, -11, 2, 5, '#e7ffe9'); pixel(-18, -9, 4, 2, '#e7ffe9');
        pixel(-3, -30, 6, 8, '#a6ffd2'); pixel(-6, -27, 12, 3, '#a6ffd2');
        pixel(12, -8, 7, 6, '#43ad80'); pixel(13, -7, 5, 3, '#d6fff0');
        if (Math.floor(time / 260) % 2) pixel(2, -34, 3, 3, '#d9ffbd');
        break;
      case 'meteorologist':
        pixel(-3, -32, 3, 10, '#9ff6ff'); pixel(-10, -34, 16, 3, '#5ed7ef');
        pixel(-8, -39, 12, 4, '#17475a'); pixel(-5, -39, 6, 3, '#b9fbff');
        pixel(-19, -11, 6, 9, '#27788e'); pixel(12, -11, 6, 9, '#27788e');
        pixel(-2, -43 + beat * 2, 3, 3, '#d5ffff');
        break;
      case 'ninja':
        pixel(-19, -14, 5, 12, '#482069'); pixel(-22, -20, 7, 7, '#a76cff');
        pixel(-10, -26, 5, 6, '#7040a4'); pixel(-3, -28, 5, 5, '#b890ff');
        pixel(5, -25, 8, 3, '#7a4cc0'); pixel(18, -18, 9, 2, '#c494ff');
        pixel(-14 - (moving ? beat * 2 : 0), 5, 8, 2, '#956bce');
        if (Math.floor(time / 210) % 2) pixel(-23, -17, 4, 2, '#8e6bff');
        break;
      case 'saboteur':
        pixel(-18, -16, 7, 16, '#255339'); pixel(-17, -14, 5, 5, '#d9fc66');
        pixel(-16, -5, 5, 4, '#76f78a'); pixel(-3, -30, 6, 7, '#a8f359');
        pixel(13, -20, 5, 11, '#346b45'); pixel(13, -19, 5, 3, '#e5ff89');
        if (Math.floor(time / 180) % 2) pixel(16, -25, 3, 3, '#f1ffab');
        break;
      case 'backpacker':
        pixel(-24, -17, 11, 22, '#5b381b'); pixel(-23, -15, 9, 16, '#c4843b');
        pixel(-21, -21, 6, 5, '#e8b65e'); pixel(-21, -7, 6, 3, '#ffe4a0');
        pixel(-25, -1, 13, 4, '#3b2a1e'); pixel(-4, -27, 6, 4, '#e9b961');
        pixel(-20, -24 + beat, 4, 2, '#fff2ba');
        break;
      case 'incendiary':
        pixel(-20, -14, 7, 13, '#753725'); pixel(-19, -12, 5, 7, '#ff9044');
        pixel(-6, -28, 12, 4, '#4a2722'); pixel(-3, -28, 6, 2, '#ffb453');
        pixel(-2, -32 - beat * 2, 4, 3, '#ffe27a');
        break;
      case 'amphibian':
        for (const side of [-1, 1]) { pixel(side < 0 ? -25 : 17, -3, 8, 9, '#145c77'); pixel(side < 0 ? -24 : 18, 0, 6, 4, '#78ebfa'); }
        pixel(-8, -28, 16, 4, '#8af5ff'); pixel(-2, -33, 4, 6, '#287b9c');
        pixel(-17, 7 + beat * 2, 9, 3, '#59cfe3'); pixel(9, 7 - beat * 2, 9, 3, '#59cfe3');
        if (p.swimming) {
          const kick = Math.sin(time / 105);
          c.save(); c.globalAlpha = .2 + Math.sin(time / 170) * .05; c.fillStyle = '#52dff5'; c.beginPath(); c.ellipse(-4, 2, 35, 17, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = .82; c.strokeStyle = '#bdfaff'; c.lineWidth = 1.5; for (let wake = 0; wake < 3; wake += 1) { const trail = (time / 22 + wake * 14) % 42; c.beginPath(); c.moveTo(-p.facing * (20 + trail), -1 + wake * 4); c.quadraticCurveTo(-p.facing * (27 + trail), 3 + wake * 3, -p.facing * (35 + trail), -1 + wake * 4); c.stroke(); } c.restore();
          pixel(-26, 7 + kick * 3, 8, 3, '#79e7f5'); pixel(18, 7 - kick * 3, 8, 3, '#79e7f5');
          pixel(-29, 3 + kick * 4, 7, 4, '#2ca5c4'); pixel(22, 3 - kick * 4, 7, 4, '#2ca5c4');
          pixel(-20, -31, 5, 3, '#e4ffff'); pixel(14, -31, 5, 3, '#e4ffff');
          for (let bubble = 0; bubble < 6; bubble += 1) {
            const rise = (time / (17 + bubble * 3) + bubble * 13) % 38;
            const bx = 27 + bubble * 5 + Math.sin(time / 130 + bubble) * 3;
            pixel(bx, 5 - rise, bubble % 3 === 1 ? 4 : 3, bubble % 3 === 1 ? 4 : 3, bubble % 2 ? '#d9ffff' : '#69d9f2');
          }
          c.save(); c.globalAlpha = .5; c.strokeStyle = '#68def2'; c.lineWidth = 1; const sonar = 27 + time / 18 % 24; c.beginPath(); c.arc(p.facing * 23, -7, sonar, -.72, .72); c.stroke(); c.restore();
        }
        break;
      case 'elementalist': {
        const element = ELEMENT_VISUALS[p.elementalCurrent];
        const color = element?.color || '#8be8d0';
        const charged = Boolean(element) && this.game?.players[this.game.turnIndex]?.id === p.id && p.elementalImprintTurn !== this.game.turnNumber && !p.teslaDisabledTurns;
        if (charged) { c.save(); c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 8; c.fillText(element.label, 0, -43); c.restore(); }
        c.save(); c.globalAlpha = charged ? .34 + Math.sin(time / 150) * .12 : .14; c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); c.arc(0, -7, 26 + Math.sin(time / 180) * 2, 0, Math.PI * 2); c.stroke(); c.restore();
        pixel(-17, -12, 5, 8, '#3f7681'); pixel(12, -12, 5, 8, '#3f7681');
        break;
      }
      case 'specialist':
        pixel(-18, -18, 7, 13, '#254c71'); pixel(-17, -15, 5, 6, '#70d4ff');
        pixel(-2, -35, 3, 12, '#9be5ff'); pixel(-9, -35, 18, 3, '#448fba');
        pixel(-5, -39 + beat, 10, 3, '#c0f4ff'); pixel(13, -8, 6, 6, '#4899c0');
        break;
      case 'armored':
        pixel(-21, -13, 8, 16, '#728181'); pixel(-20, -11, 6, 10, '#d2d6a1');
        pixel(14, -13, 8, 16, '#728181'); pixel(15, -11, 6, 10, '#d2d6a1');
        pixel(-7, -29, 14, 4, '#f1dda1');
        pixel(17, -9, 3, 3, Math.floor(time / 230) % 2 ? '#fff6c9' : '#c68e4f');
        break;
      default: break;
    }
    c.restore();
  }

  tankBlueprint(facing, armored = false) {
    const list = [];
    // Base: continuous rubber track and moving bogies.
    for (let y = 2; y <= 4; y += 1) for (let x = -6; x <= 6; x += 1) list.push({ x, y, tone: y === 3 && x % 2 === 0 ? 5 : 0 });
    // Center: broad, colored armor with a dark seam against the tracks.
    for (let y = -2; y <= 1; y += 1) for (let x = -5; x <= 5; x += 1) list.push({ x, y, tone: y === 1 ? 2 : Math.abs(x) === 5 ? 2 : y === -2 ? 3 : 1 });
    // Head: smaller elevated turret, outlined independently of the hull.
    for (let y = -7; y <= -3; y += 1) for (let x = -3; x <= 3; x += 1) {
      if (y === -7 && Math.abs(x) === 3) continue;
      list.push({ x, y, tone: y === -7 ? 3 : y === -3 || Math.abs(x) === 3 ? 0 : y === -5 && x === facing ? 4 : 6 });
    }
    if (armored) {
      for (let y = 2; y <= 4; y += 1) for (const x of [-7, 7]) list.push({ x, y, tone: y === 3 ? 7 : 0 });
      for (let y = -2; y <= 1; y += 1) for (const x of [-6, 6]) list.push({ x, y, tone: y === -2 ? 7 : 8 });
      for (let x = -5; x <= 5; x += 1) list.push({ x, y: 0, tone: x % 2 ? 8 : 7 });
      for (let x = -4; x <= 4; x += 1) list.push({ x, y: -8, tone: Math.abs(x) === 4 ? 0 : 7 });
      for (let y = -6; y <= -4; y += 1) for (const x of [-4, 4]) list.push({ x, y, tone: 8 });
    }
    return list;
  }

  drawStatusDrone(c, time, type, turns, slot = 0) { const color = type === 'heal' ? '#62e69a' : '#82e7ff'; const orbit = time / 420 + slot * Math.PI; const x = Math.sin(orbit) * (slot ? 23 : 15); const y = -43 + Math.cos(orbit * .7) * 4 - Math.abs(slot) * 4; const rotorWidth = 5 + Math.abs(Math.sin(time / 28)) * 8; c.save(); c.translate(x, y); c.rotate(Math.sin(time / 260 + slot) * .09); c.globalAlpha = .22; c.fillStyle = color; c.beginPath(); c.arc(0, 0, 17 + Math.sin(time / 110) * 2, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; c.fillStyle = '#182532'; c.fillRect(-8, -4, 16, 9); c.fillStyle = color; c.fillRect(-4, -2, 8, 5); c.fillRect(-16, -7, 7, 2); c.fillRect(9, -7, 7, 2); c.fillStyle = '#eafff7'; c.fillRect(-14 - rotorWidth / 2, -10, rotorWidth, 2); c.fillRect(14 - rotorWidth / 2, -10, rotorWidth, 2); c.strokeStyle = color; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 5); c.lineTo(-4, 16); c.lineTo(0, 13); c.lineTo(4, 16); c.closePath(); c.stroke(); c.fillStyle = '#071018dd'; c.fillRect(-8, -15, 16, 7); c.fillStyle = color; c.font = 'bold 6px monospace'; c.textAlign = 'center'; c.fillText(type === 'heal' ? `+${turns}` : `❄${turns}`, 0, -9); c.restore(); }

  spawnTankFragments(p) { this.tankAnimationEndsAt = Math.max(this.tankAnimationEndsAt, performance.now() + 2800); this.shake = Math.max(this.shake, 34); this.impactFlash = { started: performance.now(), duration: 360, color: '#ff714d' }; for (const block of this.tankBlueprint(p.facing, p.classType === 'armored')) this.addParticle({ kind: 'tank', x: p.renderX + block.x * TANK_BLOCK, y: p.renderY + block.y * TANK_BLOCK, vx: block.x * 32 + (Math.random() - .5) * 190, vy: -120 - Math.random() * 245, size: TANK_BLOCK + Math.random() * 2, color: block.tone === 0 ? '#101722' : block.tone >= 7 ? '#b6c7c4' : p.color, gravity: 220, life: 2.4, bounce: .42, drag: .99 }); for (let i = 0; i < 150; i += 1) { const angle = i / 150 * Math.PI * 2; const smoke = i % 5 === 0; this.addParticle({ kind: smoke ? 'smoke' : 'tank', x: p.renderX + (Math.random() - .5) * 12, y: p.renderY + (Math.random() - .5) * 10, vx: Math.cos(angle) * (smoke ? 35 + Math.random() * 85 : 90 + Math.random() * 260), vy: Math.sin(angle) * (smoke ? 45 : 90 + Math.random() * 230) - (smoke ? 90 : 55), size: smoke ? 8 + Math.random() * 11 : 3 + i % 6, color: smoke ? (i % 2 ? '#30343b' : '#54575b') : i % 4 ? FIRE[i % FIRE.length] : '#fff0b0', gravity: smoke ? -8 : 165, life: smoke ? 1.8 + Math.random() * 1.2 : .65 + Math.random() * 1.25, bounce: smoke ? 0 : .18, drag: smoke ? .985 : .973 }); } for (let ring = 0; ring < 44; ring += 1) { const angle = ring / 44 * Math.PI * 2; this.addParticle({ kind: 'spark', x: p.renderX, y: p.renderY, vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 260, size: 4, color: ring % 2 ? '#ffffff' : '#ffb34e', gravity: 0, life: .3, bounce: 0, drag: .88 }); } this.floaters.push({ x: p.renderX, y: p.renderY - 45, text: 'TANQUE DESTRUÍDO!', age: 0, life: 2.1, color: '#ff715c' }); }
  spawnBomberDetonation(blast) {
    if (this.cameraMode !== 'fixed') {
      this.actionReturnCamera ||= { ...this.camera };
      this.actionCamera = { x: blast.x, y: blast.y, zoom: Math.min(this.userZoom, .95), until: performance.now() + CLASS_BALANCE.bomberDeathDurationMs + 180 };
    }
    this.spawnExplosion({ impact: { x: blast.x, y: blast.y }, radius: blast.radius, weapon: 'heavy' });
    this.spawnImpactEcho(blast.x, blast.y, 'bigExplosion', blast.radius, CLASS_BALANCE.bomberDeathDurationMs);
    this.impactFlash = { started: performance.now(), duration: 460, color: '#ffad60' };
    this.shake = Math.max(this.shake, 35);
    this.floaters.push({ x: blast.x, y: blast.y - 70, text: 'BOMBARDEIRO • DETONAÇÃO', age: 0, life: 2, color: '#ffd387' });
    for (const hit of blast.hits || []) {
      const target = this.visualPlayers.get(hit.playerId);
      if (target) this.floaters.push({ x: target.renderX, y: target.renderY - 38, text: `-${hit.amount} HP`, age: 0, life: 1.8, color: '#ffad60' });
    }
    this.onBomberDetonation?.(blast);
  }
  spawnBomberGrenadeImpact(impact) {
    this.spawnExplosion({ impact: { x: impact.x, y: impact.y }, radius: impact.radius, weapon: 'grenade' });
    this.spawnImpactEcho(impact.x, impact.y, 'bigExplosion', impact.radius, 750);
    this.shake = Math.max(this.shake, 15);
    this.floaters.push({ x: impact.x, y: impact.y - 36, text: 'GRANADA DO BOMBARDEIRO', age: 0, life: 1.4, color: '#ffb35b' });
    for (const hit of impact.hits || []) {
      const target = this.visualPlayers.get(hit.playerId);
      if (target) this.floaters.push({ x: target.renderX, y: target.renderY - 38, text: `-${hit.amount} HP`, age: 0, life: 1.4, color: '#ffbd69' });
    }
    this.onBomberGrenade?.(impact);
  }
  drawBomberGrenades(c, time) {
    const now = this.worldNow();
    for (const grenade of this.game?.bomberGrenades || []) {
      if (now < grenade.launchedAt || now >= grenade.impactAt || !grenade.path?.length) continue;
      const progress = clamp((now - grenade.launchedAt) / (grenade.impactAt - grenade.launchedAt), 0, 1);
      const index = Math.min(grenade.path.length - 1, Math.floor(progress * (grenade.path.length - 1)));
      const point = grenade.path[index];
      for (let trail = 1; trail <= 7; trail += 1) {
        const back = grenade.path[Math.max(0, index - trail * 2)];
        c.globalAlpha = (1 - trail / 8) * .88; c.fillStyle = trail % 2 ? '#ff9244' : '#ffe49b';
        c.fillRect(back.x - 2, back.y - 2, Math.max(2, 6 - trail * .4), Math.max(2, 6 - trail * .4));
      }
      c.globalAlpha = 1;
      c.save(); c.translate(point.x, point.y); c.rotate(time / 90 * grenade.direction);
      c.globalAlpha = .22 + Math.sin(time / 80) * .07; c.fillStyle = '#ff9b47'; c.fillRect(-11, -8, 22, 16);
      c.globalAlpha = 1;
      c.fillStyle = '#241921'; c.fillRect(-6, -4, 12, 8);
      c.fillStyle = '#ff8a3b'; c.fillRect(-5, -3, 10, 6);
      c.fillStyle = '#ffe394'; c.fillRect(3, -2, 3, 4);
      c.fillStyle = '#ffd8a4'; c.fillRect(-2, -6, 4, 2); c.restore();
    }
    c.globalAlpha = 1;
  }
  spawnStatusActivation(x, y, kind, playerId) {
    const shield = kind === 'shield'; const color = shield ? '#80dfff' : '#a6a5ff';
    this.spawnImpactEcho(x, y, kind, shield ? 58 : 48, 1150);
    for (let i = 0; i < 48; i += 1) {
      const angle = i * Math.PI * 2 / 48;
      this.addParticle({ kind: 'spark', x: x + Math.cos(angle) * 24, y: y + Math.sin(angle) * 22, vx: Math.cos(angle) * (shield ? 90 : 55), vy: Math.sin(angle) * (shield ? 90 : 55) - (shield ? 5 : 40), size: 2 + i % 3, color: i % 5 ? color : '#ffffff', gravity: shield ? 0 : -10, life: .45 + i % 5 * .09, bounce: 0, drag: .96 });
    }
    if (playerId === this.playerId) { this.floaters.push({ x, y: y - (shield ? 57 : 78), text: shield ? 'ESCUDO ATIVO' : 'VOCÊ ESTÁ INVISÍVEL', age: 0, life: 2, color }); this.impactFlash = { started: performance.now(), duration: shield ? 320 : 420, color, intensity: shield ? .18 : .11 }; }
    this.onStatusActivated?.(kind, playerId);
  }
  spawnElementalImprint(shot) {
    const { x, y } = shot.impact;
    const element = ELEMENT_VISUALS[shot.elementalType]; if (!element) return;
    if (shot.elementalType === 'elementalWater') this.spawnElementalWaterImpact(shot);
    else if (shot.elementalType === 'elementalWind') this.spawnElementalWindLaunch(shot);
    else {
      this.spawnImpactEcho(x, y, shot.elementalType, Math.max(62, WEAPON_BALANCE[shot.elementalType]?.radius || 62), 1500);
      for (let i = 0; i < 62; i += 1) {
        const angle = i * Math.PI * 2 / 62; const speed = 75 + i % 6 * 28;
        this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (shot.elementalType === 'elementalFire' ? 65 : 18), size: 2 + i % 4, color: i % 5 ? element.color : '#ffffff', gravity: shot.elementalType === 'elementalEarth' ? 210 : shot.elementalType === 'elementalIce' ? 35 : -12, life: .45 + i % 5 * .13, bounce: shot.elementalType === 'elementalEarth' ? .22 : 0, drag: .96 });
      }
    }
    if (shot.elementalType === 'elementalIce') this.spawnIceBreathImpact(x, y, WEAPON_BALANCE.elementalIce.freezeRadius);
    this.floaters.push({ x, y: y - 62, text: `ELEMENTO ${element.label}`, age: 0, life: 1.7, color: element.color });
    if (shot.elementalType !== 'elementalWind') this.onElementalImpact?.(shot.elementalType);
  }
  spawnIceBreathImpact(x, y, radius) {
    this.impactFlash = { started: performance.now(), duration: 260, color: '#e5fbff', intensity: .22 };
    for (let index = 0; index < 100; index += 1) {
      const angle = index * 2.399;
      const distance = Math.sqrt(index / 100) * radius * .8;
      this.addParticle({ kind: index % 3 ? 'smoke' : 'spark', x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance * .34, vx: Math.cos(angle) * (25 + index % 7 * 9), vy: -25 - index % 9 * 7, size: index % 3 ? 7 + index % 5 * 3 : 2 + index % 3, color: index % 5 ? '#e8fbff' : '#91daf2', gravity: -10, life: 1 + index % 6 * .13, bounce: 0, drag: .97 });
    }
    this.floaters.push({ x, y: y - 74, text: 'AR GELADO', age: 0, life: 1.25, color: '#dffaff' });
  }
  spawnDamageImpact(x, y, amount, color, playerId = null) {
    this.shake = Math.max(this.shake, Math.min(23, 6 + amount * .18));
    this.spawnImpactEcho(x, y, 'critical', Math.min(92, 28 + amount * .45), 900);
    for (let i = 0; i < 68; i += 1) {
      const angle = i * Math.PI * 2 / 68 + (Math.random() - .5) * .15;
      this.addParticle({ kind: i % 4 ? 'spark' : 'smoke', x: x + (Math.random() - .5) * 16, y: y + (Math.random() - .5) * 12, vx: Math.cos(angle) * (55 + Math.random() * 205), vy: Math.sin(angle) * (45 + Math.random() * 165) - 35, size: i % 4 ? 2 + i % 4 : 5 + Math.random() * 6, color: i % 4 ? (i % 3 ? '#fff6d2' : color) : '#37434a', gravity: i % 4 ? 135 : -8, life: .4 + Math.random() * .7, bounce: .15, drag: .96 });
    }
    this.floaters.push({ x, y: y - 38, text: `-${Math.ceil(amount)} HP`, age: 0, life: 1.5, color: '#ff6b58' });
    if (playerId === this.playerId) this.impactFlash = { started: performance.now(), duration: 520, color: '#ff4855', intensity: Math.min(.34, .15 + amount / 360) };
  }
  spawnHealPulse(x, y, amount) { this.spawnImpactEcho(x, y, 'heal', 38); for (let i = 0; i < 48; i += 1) { const angle = i / 48 * Math.PI * 2; this.addParticle({ kind: 'spark', x: x + Math.cos(angle) * 28, y: y + Math.sin(angle) * 18, vx: -Math.cos(angle) * 35, vy: -45 - Math.random() * 55, size: 2 + i % 3, color: i % 3 ? '#62e69a' : '#eafff3', gravity: -12, life: .65 + Math.random() * .45, bounce: 0, drag: .97 }); } this.floaters.push({ x, y: y - 34, text: `+${Math.ceil(amount)} HP`, age: 0, life: 1.15, color: '#62e69a' }); }
  spawnFreezeBurst(x, y) { this.spawnImpactEcho(x, y, 'freeze', 38); for (let i = 0; i < 70; i += 1) { const angle = i / 70 * Math.PI * 2; this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * (45 + Math.random() * 150), vy: Math.sin(angle) * (45 + Math.random() * 150), size: 2 + i % 5, color: i % 2 ? '#82e7ff' : '#ffffff', gravity: 35, life: .55 + Math.random() * .7, bounce: .15, drag: .96 }); } this.floaters.push({ x, y: y - 36, text: 'CONGELADO!', age: 0, life: 1.3, color: '#82e7ff' }); }
  spawnElectricLock(x, y) { for (let i = 0; i < 90; i += 1) { const angle = i / 90 * Math.PI * 2; const speed = 55 + Math.random() * 190; this.addParticle({ kind: 'spark', x: x + (Math.random() - .5) * 24, y: y + (Math.random() - .5) * 18, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 2 + i % 4, color: i % 3 ? '#73eaff' : '#ffffff', gravity: 15, life: .35 + Math.random() * .75, bounce: 0, drag: .93 }); } this.floaters.push({ x, y: y - 42, text: 'POWERUPS BLOQUEADOS!', age: 0, life: 1.7, color: '#8ff3ff' }); }
  spawnMineDeploy(shot) {
    const { x, y } = shot.impact; const sentry = shot.weapon === 'sentry'; const aquatic = shot.weapon === 'waterMine'; const armed = shot.interactions?.find((entry) => entry.type === 'mineDeploy')?.armed;
    const color = aquatic ? armed ? '#69e4ff' : '#ffd17a' : sentry ? '#6deacc' : '#ffb35c';
    for (let i = 0; i < (sentry ? 55 : 28); i += 1) { const angle = i / (sentry ? 55 : 28) * Math.PI * 2; this.addParticle({ x, y, vx: Math.cos(angle) * (25 + Math.random() * (sentry ? 130 : 70)), vy: Math.sin(angle) * 35 - Math.random() * 55, size: 2 + i % 3, color: i % 2 ? color : '#d7fff0', gravity: 90, life: .45 + Math.random() * .55, bounce: .1, drag: .96 }); }
    this.floaters.push({ x, y: y - 20, text: aquatic ? armed ? 'MINA AQUÁTICA ATIVA' : 'MINA INATIVA • PROCURE ÁGUA' : sentry ? 'SENTINELA ARMADA' : 'MINA ARMADA', age: 0, life: 1.4, color });
  }
  spawnLaserImpact(shot) { const { x, y } = shot.impact; this.shake = Math.max(this.shake, 16); for (let i = 0; i < 110; i += 1) { const angle = Math.random() * Math.PI * 2; this.addParticle({ x, y, vx: Math.cos(angle) * (90 + Math.random() * 260), vy: Math.sin(angle) * (90 + Math.random() * 260), size: 2 + i % 5, color: i % 3 ? '#ff3d81' : '#ffffff', gravity: 40, life: .35 + Math.random() * .65, bounce: 0, drag: .94 }); } this.floaters.push({ x, y: y - 24, text: 'LASER PERFURANTE!', age: 0, life: 1.5, color: '#ff3d81' }); this.flushPendingState(); }
  spawnGrenadeBounce(x, y, marker = false) { this.shake = Math.max(this.shake, marker ? 5 : 3); for (let i = 0; i < 22; i += 1) { const angle = Math.random() * Math.PI; this.addParticle({ x, y, vx: Math.cos(angle) * (35 + Math.random() * 90), vy: -Math.sin(angle) * (35 + Math.random() * 90), size: 2 + i % 3, color: marker ? i % 2 ? '#ff9a50' : '#fff0b2' : i % 2 ? '#ddff87' : '#fff2a6', gravity: 140, life: .28 + Math.random() * .3, bounce: .15, drag: .95 }); } if (marker) this.floaters.push({ x, y: y - 30, text: 'MARCA ARMADA', age: 0, life: 1, color: '#ffae6b' }); }

  spawnSoapLaunch(shot) {
    const { x, y } = shot.impact; const radius = WEAPON_BALANCE.soapBomb.radius; this.floaters.push({ x, y: y - 50, text: `BOLHAS • ${shot.soapTargets?.length || 0} TANQUES • 5s`, age: 0, life: 2.1, color: '#b7f9f4' });
    this.spawnImpactEcho(x, y, 'soapBomb', radius, 1700);
    for (let i = 0; i < 180; i += 1) { const angle = i * Math.PI * 2 / 180; const speed = radius * (.65 + Math.random() * .6); this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 35, size: 2 + i % 5, color: i % 3 ? '#9df4ec' : '#f5bbef', gravity: -28, life: .65 + Math.random() * .75, bounce: 0, drag: .96 }); }
    this.impactFlash = { started: performance.now(), duration: 280, color: '#bcfff5', intensity: .12 };
  }

  spawnHarpoonAnchor(shot) {
    const { x, y } = shot.impact; this.floaters.push({ x, y: y - 35, text: 'ARPÃO PRESO • 2ª ATIVAÇÃO', age: 0, life: 1.6, color: '#a3ffe2' });
    for (let i = 0; i < 40; i += 1) this.addParticle({ kind: 'spark', x, y, vx: (Math.random() - .5) * 140, vy: -35 - Math.random() * 95, size: 2 + i % 3, color: i % 2 ? '#a6f5df' : '#e7f6c6', gravity: 140, life: .25 + Math.random() * .4, bounce: .2, drag: .95 });
  }
  spawnHarpoonPull(pull) {
    this.floaters.push({ x: pull.fromX, y: pull.fromY - 50, text: 'CABO TENSIONADO • IMPULSO!', age: 0, life: 1.25, color: '#9dffe0' });
    this.shake = Math.max(this.shake, pull.targetPlayerId ? 16 : 10);
    for (let i = 0; i < 110; i += 1) { const progress = i / 109; const x = pull.fromX + (pull.toX - pull.fromX) * progress; const y = pull.fromY + (pull.toY - pull.fromY) * progress - Math.sin(Math.PI * progress) * 45; this.addParticle({ kind: i % 8 ? 'spark' : 'smoke', x, y, vx: (Math.random() - .5) * 95, vy: -30 - Math.random() * 90, size: i % 8 ? 2 + i % 3 : 6 + i % 4, color: i % 8 ? i % 3 ? '#78ffd9' : '#ecfff6' : '#395b5c', gravity: i % 8 ? 35 : -8, life: .3 + progress * .8, bounce: 0, drag: .94 }); }
  }
  spawnNinjaSlash(strike) {
    const started = performance.now(); const duration = CLASS_BALANCE.ninjaFatalDurationMs;
    this.ninjaSlashes.push({ ...strike, started, duration });
    this.tankAnimationEndsAt = Math.max(this.tankAnimationEndsAt, started + duration);
    this.shake = Math.max(this.shake, 13);
    for (const hit of strike.hits || [{ x: strike.hitX, y: strike.hitY, damage: strike.damage }]) {
      this.floaters.push({ x: hit.x, y: hit.y - 48, text: `-${hit.damage} HP • CORTE`, age: 0, life: 2, color: '#f5d7ff' });
      for (let spark = 0; spark < 36; spark += 1) { const angle = spark / 36 * Math.PI * 2; this.addParticle({ kind: 'spark', x: hit.x, y: hit.y, vx: Math.cos(angle) * (65 + Math.random() * 130), vy: Math.sin(angle) * (65 + Math.random() * 130), size: 2 + spark % 3, color: spark % 3 ? '#b58cff' : '#ffffff', gravity: 15, life: .4 + Math.random() * .55, bounce: 0, drag: .94 }); }
    }
    for (let i = 0; i < 64; i += 1) {
      const progress = i / 63; const x = strike.fromX + (strike.toX - strike.fromX) * progress; const y = strike.fromY + (strike.toY - strike.fromY) * progress - Math.sin(progress * Math.PI) * 18;
      this.addParticle({ kind: 'spark', x, y, vx: (Math.random() - .5) * 130, vy: -35 - Math.random() * 100, size: 2 + i % 4, color: i % 3 ? '#d5b1ff' : '#ffffff', gravity: 50, life: .35 + Math.random() * .55, bounce: 0, drag: .95 });
    }
    if (this.cameraMode !== 'fixed') {
      this.actionReturnCamera ||= { ...this.camera };
      const centerX = (strike.fromX + strike.toX) / 2; const centerY = (strike.fromY + strike.toY) / 2;
      this.actionCamera = { x: centerX, y: centerY, zoom: Math.min(this.userZoom, 1.15), until: started + duration + 180 };
    }
  }
  spawnDust(x, y, direction) { for (let i = 0; i < 12; i += 1) this.addParticle({ x: x - direction * 10, y, vx: -direction * (15 + Math.random() * 35), vy: -10 - Math.random() * 35, size: 2 + i % 3, color: '#87907b', gravity: 70, life: .5 + Math.random() * .35, bounce: 0, drag: .96 }); }
  spawnTrackDust(x, y, direction) { for (let i = 0; i < 6; i += 1) this.addParticle({ kind: i % 3 ? 'dust' : 'smoke', x: x - direction * (8 + Math.random() * 12), y, vx: -direction * (10 + Math.random() * 35), vy: -10 - Math.random() * 34, size: 2 + i % 4, color: i % 3 ? '#727c70' : '#454d4c', gravity: 52, life: .4 + Math.random() * .45, bounce: 0, drag: .95 }); }
  spawnMuzzle(shooter, shot = {}) {
    const style = shotLaunchStyle(shot);
    const { x, y, dx, dy } = shotLaunchMuzzle(shot, shooter);
    const visualScale = clamp(.75 / this.camera.zoom, 1, 2.5);
    const smokeBase = { heavy: 12, atomic: 20, hunter: 14, fire: 12, seismic: 10, bubbles: 9 }[style.type] || 7;
    this.muzzleBursts.push({ x, y, dx, dy, ...style, radius: style.radius * visualScale, started: performance.now(), duration: style.type === 'atomic' ? 440 : style.type === 'heavy' ? 400 : 340 });
    for (let i = 0; i < style.smokePuffs; i += 1) {
      const spread = (Math.random() - .5) * 80;
      this.addParticle({ kind: 'smoke', x: x - dx * Math.random() * smokeBase, y: y - dy * Math.random() * smokeBase, vx: dx * (18 + Math.random() * 58) - dy * spread, vy: dy * (18 + Math.random() * 58) + dx * spread - 28, size: (6 + Math.random() * (style.type === 'atomic' ? 17 : 11)) * visualScale, color: style.smoke, gravity: -7, life: .72 + Math.random() * .8, bounce: 0, drag: .96 });
    }
    for (let i = 0; i < style.sparks; i += 1) {
      const spread = (Math.random() - .5) * (style.type === 'electric' || style.type === 'fireworks' ? 300 : 205);
      this.addParticle({ kind: 'spark', x, y, vx: dx * (68 + Math.random() * 215) - dy * spread, vy: dy * (68 + Math.random() * 215) + dx * spread, size: (2 + i % (style.type === 'atomic' ? 6 : 4)) * visualScale, color: i % 5 === 0 ? style.glow : style.spark, gravity: style.type === 'gravity' || style.type === 'electric' ? 0 : 75, life: .23 + Math.random() * .4, bounce: 0, drag: .93 });
    }
    if (style.type === 'bubbles') for (let i = 0; i < 9; i += 1) this.addParticle({ kind: 'smoke', x: x + (Math.random() - .5) * 18, y, vx: dx * (10 + Math.random() * 55), vy: -35 - Math.random() * 70, size: 4 + Math.random() * 5, color: i % 2 ? '#dffff7' : '#efbfff', gravity: -5, life: .8 + Math.random() * .7, bounce: 0, drag: .98 });
    this.shake = Math.max(this.shake, style.type === 'atomic' ? 12 : style.type === 'heavy' ? 7 : 2);
  }
  drawMuzzleBursts(c, time) {
    this.muzzleBursts = this.muzzleBursts.filter((burst) => time - burst.started < burst.duration);
    for (const burst of this.muzzleBursts) {
      const progress = Math.max(0, (time - burst.started) / burst.duration);
      const scale = 1 - progress * .7;
      c.save(); c.translate(burst.x, burst.y); c.rotate(Math.atan2(burst.dy, burst.dx)); c.globalAlpha = (1 - progress) * .95;
      c.fillStyle = burst.spark; c.fillRect(0, -burst.radius * .22 * scale, burst.radius * 1.35 * scale, burst.radius * .44 * scale);
      c.fillRect(-burst.radius * .45 * scale, -burst.radius * .5 * scale, burst.radius * .7 * scale, burst.radius * scale);
      c.fillStyle = burst.glow; c.fillRect(-burst.radius * .2 * scale, -burst.radius * .17 * scale, burst.radius * 1.1 * scale, burst.radius * .34 * scale);
      for (let ray = 0; ray < 8; ray += 1) { const angle = ray * Math.PI / 4; const distance = burst.radius * (1 + progress * .35); c.fillStyle = ray % 2 ? burst.spark : burst.glow; c.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance, 3 + (ray % 3), 3 + (ray % 3)); }
      c.restore();
    }
  }
  spawnAirShotRecoil(p) { for (let i = 0; i < 24; i += 1) this.addParticle({ x: p.renderX - p.facing * 12, y: p.renderY + 5, vx: -p.facing * (25 + Math.random() * 75), vy: (Math.random() - .5) * 65, size: 2 + i % 3, color: i % 2 ? '#dff8ff' : '#8da8ff', gravity: 18, life: .25 + Math.random() * .35, bounce: 0, drag: .93 }); }
  spawnJumpEffect(x, y, direction) { this.shake = Math.max(this.shake, 8); for (let i = 0; i < 76; i += 1) this.addParticle({ kind: i % 4 ? 'spark' : 'smoke', x: x - direction * (8 + Math.random() * 10), y: y + 8, vx: -direction * (30 + Math.random() * 135) + (Math.random() - .5) * 55, vy: 25 + Math.random() * 125, size: i % 4 ? 2 + i % 5 : 7 + Math.random() * 8, color: i % 4 ? (i % 2 ? '#42f5d7' : '#eaff9a') : '#536261', gravity: i % 4 ? 95 : 20, life: .45 + Math.random() * .75, bounce: .18, drag: .955 }); this.floaters.push({ x, y: y - 25, text: 'SALTO!', age: 0, life: .75, color: '#42f5d7' }); }
  spawnParachuteEffect(x, y) { this.spawnImpactEcho(x, y - 25, 'parachute', 40); for (let i = 0; i < 48; i += 1) { const angle = i / 48 * Math.PI; this.addParticle({ x: x + Math.cos(angle) * 28, y: y - 42 - Math.sin(angle) * 15, vx: Math.cos(angle) * 35, vy: -15 - Math.random() * 25, size: 2 + i % 3, color: i % 2 ? '#eef8ff' : '#72e8ff', gravity: 25, life: .45 + Math.random() * .45, bounce: 0, drag: .96 }); } }
  spawnWaterSplash(x, y) {
    for (let index = 0; index < 44; index += 1) {
      const side = index % 2 ? -1 : 1;
      this.addParticle({ x: x + side * Math.random() * 12, y, vx: side * (22 + Math.random() * 105), vy: -25 - Math.random() * 95, size: 2 + index % 3, color: index % 3 ? '#65c9ee' : '#d7f8ff', gravity: 170, life: .45 + Math.random() * .45, bounce: .1, drag: .96 });
    }
    this.spawnImpactEcho(x, y, 'waterCannon', 45, 900);
  }
  spawnLandingEffect(x, y, parachute, fallDistance = 0, impactSpeed = 0) { const hardFall = !parachute && (fallDistance > 160 || impactSpeed > 210); this.shake = Math.max(this.shake, parachute ? 2 : hardFall ? Math.min(18, 5 + Math.max(fallDistance / 45, impactSpeed / 70)) : 7); const count = parachute ? 18 : hardFall ? 72 : 42; for (let i = 0; i < count; i += 1) { const side = i % 2 ? -1 : 1; this.addParticle({ x: x + side * Math.random() * 12, y: y + 8, vx: side * (20 + Math.random() * (parachute ? 45 : hardFall ? 155 : 115)), vy: -8 - Math.random() * (parachute ? 24 : hardFall ? 105 : 65), size: 2 + i % 4, color: i % 3 ? '#899582' : '#c5d1aa', gravity: 95, life: .35 + Math.random() * .55, bounce: .12, drag: .95 }); } if (hardFall) this.spawnImpactEcho(x, y + 8, 'landing', clamp(28 + impactSpeed * .12, 34, 90), 2000); this.floaters.push({ x, y: y - 24, text: parachute ? 'POUSO SUAVE' : hardFall ? 'QUEDA!' : 'ATERRISSAGEM!', age: 0, life: .8, color: parachute ? '#dff8ff' : '#b7ec58' }); }
  spawnArmoredDashImpact(dash) {
    const direction = Math.sign(dash.toX - dash.fromX) || 1; const walls = dash.wallBreakPoints || []; const impacts = [...walls, { x: dash.toX, y: dash.toY }];
    this.spawnImpactEcho(dash.toX, dash.toY, 'armoredDash', 65);
    this.shake = Math.max(this.shake, dash.hitPlayerIds?.length ? 26 : walls.length ? 20 : 10); this.impactFlash = { started: performance.now(), duration: 260, color: '#ff9b62' };
    for (let trail = 0; trail < 34; trail += 1) { const progress = trail / 33; this.addParticle({ kind: trail % 5 === 0 ? 'smoke' : 'spark', x: dash.fromX + (dash.toX - dash.fromX) * progress, y: dash.fromY + (dash.toY - dash.fromY) * progress + 6, vx: -direction * (35 + Math.random() * 95), vy: -20 - Math.random() * 65, size: trail % 5 === 0 ? 8 + Math.random() * 7 : 2 + trail % 4, color: trail % 5 === 0 ? '#4e555a' : trail % 2 ? '#ff7657' : '#fff1a3', gravity: trail % 5 === 0 ? -4 : 105, life: .5 + Math.random() * .55, bounce: .08, drag: .95 }); }
    for (const [impactIndex, impact] of impacts.entries()) for (let i = 0; i < (impactIndex < walls.length ? 52 : 88); i += 1) { const angle = (i / 52) * Math.PI * 2; const force = 75 + Math.random() * (impactIndex < walls.length ? 180 : 265); this.addParticle({ kind: i % 8 === 0 ? 'smoke' : 'spark', x: impact.x + (Math.random() - .5) * 18, y: impact.y + (Math.random() - .5) * 14, vx: Math.cos(angle) * force + direction * 75, vy: Math.sin(angle) * force - 45, size: i % 8 === 0 ? 8 + Math.random() * 8 : 2 + i % 6, color: i % 8 === 0 ? '#55585b' : i % 3 ? '#ff8066' : impactIndex < walls.length ? '#b5a783' : '#fff0a0', gravity: i % 8 === 0 ? -5 : 205, life: .45 + Math.random() * .85, bounce: .24, drag: .96 }); }
    for (const targetId of dash.hitPlayerIds || []) { const target = this.visualPlayers.get(targetId); if (target) this.floaters.push({ x: target.x, y: target.y - 38, text: `-${dash.damage || 80} HP`, age: 0, life: 1.6, color: '#fff0a0' }); }
    const label = dash.hitPlayerIds?.length ? `ATROPELAMENTO • ${dash.damage || 80} DANO` : walls.length ? `${walls.length}/${WEAPON_BALANCE.armoredDash?.walls || 3} PAREDES ROMPIDAS` : 'INVESTIDA BLINDADA!'; this.floaters.push({ x: dash.toX, y: dash.toY - 34, text: label, age: 0, life: 1.65, color: '#ff9b74' });
  }
  spawnAirBoost(boost) { const color = boost.kind === 'doubleDash' ? '#fff06a' : boost.kind === 'armoredDash' ? '#ff8066' : '#42f5d7'; this.shake = Math.max(this.shake, boost.kind === 'doubleDash' ? 12 : 7); for (let i = 0; i < 90; i += 1) this.addParticle({ x: boost.x - boost.direction * (10 + Math.random() * 34), y: boost.y + (Math.random() - .5) * 18, vx: -boost.direction * (70 + Math.random() * 230), vy: (Math.random() - .5) * 120, size: 2 + i % 5, color: i % 4 ? color : '#ffffff', gravity: 35, life: .35 + Math.random() * .7, bounce: 0, drag: .94 }); this.floaters.push({ x: boost.x, y: boost.y - 38, text: boost.kind === 'doubleDash' ? 'COMBO AÉREO ×3!' : 'COMBO AÉREO ×2!', age: 0, life: 1.6, color }); }
  spawnWaterCannonImpact(shot) { const { x, y } = shot.impact; this.shake = Math.max(this.shake, shot.recoilBoost ? 12 : 7); for (let i = 0; i < 96; i += 1) { const angle = Math.random() * Math.PI * 2; this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * (35 + Math.random() * 180), vy: Math.sin(angle) * (35 + Math.random() * 180) - 45, size: 2 + i % 4, color: i % 3 ? '#67deff' : '#edffff', gravity: 160, life: .4 + Math.random() * .75, bounce: .2, drag: .97 }); } this.floaters.push({ x, y: y - 36, text: shot.recoilBoost ? 'IMPULSO HIDRÁULICO!' : `JATO • ${shot.damage?.length || 0} ALVOS`, age: 0, life: 1.65, color: '#9aefff' }); }
  spawnWaterRecoilEffect(x, y) { this.shake = Math.max(this.shake, 10); for (let index = 0; index < 85; index += 1) this.addParticle({ kind: 'water', x: x + (Math.random() - .5) * 25, y: y + 12, vx: (Math.random() - .5) * 180, vy: 35 + Math.random() * 170, size: 2 + index % 5, color: index % 4 ? '#68d9f5' : '#efffff', gravity: 130, life: .45 + Math.random() * .55, bounce: .1, drag: .97 }); this.spawnImpactEcho(x, y + 14, 'waterCannon', 64); }
  spawnAirPocketBurst(burst) { this.shake = Math.max(this.shake, 5); for (let index = 0; index < 66; index += 1) this.addParticle({ kind: 'water', x: burst.x + (Math.random() - .5) * 36, y: burst.y + 10, vx: (Math.random() - .5) * 125, vy: -65 - Math.random() * 175, size: 2 + index % 5, color: index % 3 ? '#9bedff' : '#ffffff', gravity: 125, life: .55 + Math.random() * .7, bounce: .05, drag: .975 }); this.floaters.push({ x: burst.x, y: burst.y - 40, text: 'BOLSÃO DE AR ↑', age: 0, life: 1.4, color: '#bffaff' }); }
  spawnAmphibianLeap(leap) {
    this.spawnWaterSplash(leap.x, leap.surfaceY);
    this.spawnImpactEcho(leap.x, leap.surfaceY, 'waterCannon', 54, 900);
    for (let index = 0; index < 42; index += 1) this.addParticle({ kind: 'water', x: leap.x + (Math.random() - .5) * 30, y: leap.surfaceY, vx: (Math.random() - .5) * 160, vy: -75 - Math.random() * 175, size: 2 + index % 4, color: index % 3 ? '#75e5fa' : '#f4ffff', gravity: 170, life: .4 + Math.random() * .5, bounce: .08, drag: .97 });
    this.floaters.push({ x: leap.x, y: leap.surfaceY - 50, text: 'SALTO ANFÍBIO', age: 0, life: 1.25, color: '#a5f7ff' });
  }
  spawnAquaticMineArming(mine) {
    this.spawnImpactEcho(mine.x, mine.y, 'waterCannon', 44, 900);
    for (let index = 0; index < 34; index += 1) this.addParticle({ kind: 'water', x: mine.x + (Math.random() - .5) * 32, y: mine.y, vx: (Math.random() - .5) * 90, vy: -30 - Math.random() * 120, size: 2 + index % 4, color: index % 3 ? '#76e5ff' : '#ffffff', gravity: 120, life: .4 + Math.random() * .45, bounce: .05, drag: .97 });
    this.floaters.push({ x: mine.x, y: mine.y - 39, text: 'MINA ATIVA', age: 0, life: 1.25, color: '#ff8375' }); this.onAquaticMineArm?.();
  }
  spawnAquaticMineBlast(blast) {
    this.spawnExplosion({ impact: blast, radius: blast.radius, weapon: 'waterMine' });
    this.spawnWaterSplash(blast.x, blast.y);
    this.spawnImpactEcho(blast.x, blast.y, 'waterCannon', blast.radius, 1500);
    this.shake = Math.max(this.shake, 16); this.onAquaticMineDetonate?.();
  }
  spawnElementalWaterImpact(shot) {
    const { x, y } = shot.impact;
    this.shake = Math.max(this.shake, 7);
    for (let index = 0; index < 45; index += 1) this.addParticle({ kind: 'water', x: x + (Math.random() - .5) * 18, y: y - Math.random() * 14, vx: (Math.random() - .5) * 105, vy: -85 - Math.random() * 105, size: 2 + index % 4, color: index % 4 ? '#48b8e5' : '#d6f8ff', gravity: 140, life: .65 + Math.random() * .45, bounce: .1, drag: .985 });
    this.floaters.push({ x, y: y - 55, text: 'ESFERA D’ÁGUA', age: 0, life: 1.5, color: '#a4efff' });
  }
  spawnSpiderLeap(leap) { this.spawnImpactEcho(leap.toX, leap.toY, 'spider', 46); this.shake = Math.max(this.shake, 5); const arc = leap.arcHeight || 95; for (let i = 0; i < 58; i += 1) { const progress = i / 57; this.addParticle({ x: leap.fromX + (leap.toX - leap.fromX) * progress, y: leap.fromY + (leap.toY - leap.fromY) * progress - Math.sin(progress * Math.PI) * arc, vx: (Math.random() - .5) * 22, vy: -15 - Math.random() * 35, size: 2 + i % 3, color: i % 3 ? '#d28cff' : '#f2ddff', gravity: 20, life: .45 + progress * .35, bounce: 0, drag: .95 }); } this.floaters.push({ x: leap.toX, y: leap.toY - 35, text: leap.surface?.endsWith('-bottom') ? 'ADERÊNCIA INVERTIDA' : 'ESCALADA PERMANENTE', age: 0, life: 1.7, color: '#d28cff' }); }
  spawnGravityWell(shot) {
    const { x, y } = shot.impact; const radius = shot.radius || WEAPON_BALANCE.gravity.radius; const started = performance.now();
    this.gravityAnimations.push({ x, y, radius, started, duration: WEAPON_BALANCE.gravity.durationMs }); this.shake = Math.max(this.shake, 22);
    this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, started + WEAPON_BALANCE.gravity.durationMs + 100);
    for (let i = 0; i < 360; i += 1) { const angle = Math.random() * Math.PI * 2; const distance = radius * (.25 + Math.random() * .75); this.addParticle({ x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance * .7, vx: -Math.cos(angle) * (115 + Math.random() * 190), vy: -Math.sin(angle) * (75 + Math.random() * 140), size: 2 + i % 5, color: i % 4 ? '#a56cff' : '#f5e4ff', gravity: 0, life: 1.25 + Math.random() * .75, bounce: 0, drag: .975 }); }
    if (shot.interactions?.some((entry) => entry.type === 'waterDrain')) { for (let i = 0; i < 180; i += 1) { const angle = Math.random() * Math.PI * 2; const distance = radius * (.4 + Math.random() * .75); this.addParticle({ kind: 'spark', x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance * .42, vx: -Math.cos(angle) * (100 + Math.random() * 210), vy: -Math.sin(angle) * (80 + Math.random() * 130), size: 2 + i % 4, color: i % 3 ? '#55cfee' : '#ebffff', gravity: 0, life: .7 + Math.random() * .9, bounce: 0, drag: .96 }); } this.floaters.push({ x, y: y - 72, text: 'ÁGUA SUGADA!', age: 0, life: 1.8, color: '#78e5ff' }); }
    this.floaters.push({ x, y: y - 42, text: 'VÓRTEX • 410 BLOCOS • 4 SEGUNDOS', age: 0, life: 2.2, color: '#d6baff' }); this.flushPendingState();
  }
  spawnElementalWindLaunch(shot) { const { x, y } = shot.impact; this.onVortexSpawn?.(); this.spawnImpactEcho(x, y, 'elementalWind', WEAPON_BALANCE.elementalWind.width); for (let i = 0; i < 110; i += 1) { const angle = i * Math.PI * 2 / 110; this.addParticle({ kind: 'spark', x: x + Math.cos(angle) * 25, y: y - Math.random() * 28, vx: Math.cos(angle) * (45 + i % 5 * 25), vy: -90 - Math.random() * 150, size: 2 + i % 4, color: i % 3 ? '#98f0df' : '#ffffff', gravity: -12, life: .6 + Math.random() * .8, bounce: 0, drag: .96 }); } this.floaters.push({ x, y: y - 70, text: 'VÓRTICE • 2 RODADAS', age: 0, life: 1.8, color: '#9beadd' }); }
  spawnWindPlateLaunch(shot) {
    const { x, y } = shot.impact; this.onVortexSpawn?.(); this.spawnImpactEcho(x, y, 'windPlate', WEAPON_BALANCE.windPlate.width);
    for (let i = 0; i < 72; i += 1) { const phase = i * Math.PI * 2 / 72; this.addParticle({ kind: 'spark', x: x + Math.cos(phase) * 10, y: y - 4, vx: Math.cos(phase) * (22 + i % 5 * 11), vy: -55 - i % 7 * 15, size: 2 + i % 3, color: i % 4 ? '#8ee9e5' : '#f4ffff', gravity: -20, life: .65 + i % 5 * .11, bounce: 0, drag: .97 }); }
    this.floaters.push({ x, y: y - 42, text: 'PLACA TORNADO • 2 RODADAS', age: 0, life: 1.9, color: '#97f4ef' });
  }

  spawnVortexDeflection(point) {
    const color = point.vortexFire ? '#ff934b' : '#8bf3dd';
    this.floaters.push({ x: point.x, y: point.y - 27, text: 'TIRO DESVIADO ↑', age: 0, life: 1.15, color });
    this.shake = Math.max(this.shake, 3);
    for (let index = 0; index < 32; index += 1) {
      const phase = index * Math.PI * 2 / 32;
      this.addParticle({ kind: 'spark', x: point.x + Math.cos(phase) * 8, y: point.y + Math.sin(phase) * 8, vx: Math.cos(phase) * (50 + index % 3 * 24), vy: -90 - index % 5 * 28, size: 2 + index % 3, color: index % 4 ? color : '#ffffff', gravity: -20, life: .45 + index % 4 * .1, bounce: 0, drag: .95 });
    }
  }
  spawnShieldImpact(x, y) { for (let i = 0; i < 64; i += 1) { const angle = i / 64 * Math.PI * 2; this.addParticle({ x: x + Math.cos(angle) * 24, y: y - 4 + Math.sin(angle) * 24, vx: Math.cos(angle) * 95, vy: Math.sin(angle) * 95, size: 2 + i % 3, color: i % 2 ? '#8da8ff' : '#e8edff', gravity: 0, life: .4 + Math.random() * .35, bounce: 0, drag: .94 }); } this.floaters.push({ x, y: y - 35, text: 'ESCUDO ABSORVEU!', age: 0, life: 1.1, color: '#aebfff' }); }

  drawImpactFlash(c, time) { if (!this.impactFlash) return; const progress = (time - this.impactFlash.started) / this.impactFlash.duration; if (progress >= 1) { this.impactFlash = null; return; } c.save(); c.globalAlpha = Math.sin(progress * Math.PI) * (this.impactFlash.intensity || .2); c.fillStyle = this.impactFlash.color; c.fillRect(0, 0, VIEW.width, VIEW.height); c.restore(); }

  drawAim(c) {
    if (!this.aim.visible || !this.game) return; const player = this.visualPlayers.get(this.playerId); if (!player?.alive || this.game.players[this.game.turnIndex]?.id !== player.id) return;
    const origin = this.renderPosition(player); const rad = this.aim.angle * Math.PI / 180; const scale = 1 / Math.max(.23, this.camera.zoom);
    if (this.movementMode === 'harpoon' && !this.game.harpoonAnchor) { this.drawHarpoonAim(c, origin, rad, scale); return; }
    if (this.movementMode === 'waterCannon') {
      const cannonAngle = clamp(this.aim.angle, -70, 70); const cannonRad = cannonAngle * Math.PI / 180;
      const start = { x: origin.x + this.aim.direction * 17, y: origin.y - 7 }; let end = start; let impactKind = 'air';
      for (let distance = 16; distance <= CLASS_BALANCE.waterCannonRange; distance += 16) {
        const x = start.x + Math.cos(cannonRad) * distance * this.aim.direction; const y = start.y - Math.sin(cannonRad) * distance;
        if (x < 6 || x > WORLD.width - 6 || y < 8 || y > WORLD.height - 8) break;
        end = { x, y };
        const platform = this.game.terrain.floatingPlatforms?.some((entry) => { const px = this.platformX(entry); return entry.active && x >= px && x <= px + entry.width && y >= entry.y && y <= entry.y + (entry.height || 8); });
        if (y >= this.terrainHeights[Math.round(x)]) { impactKind = 'ground'; break; }
        if (platform) { impactKind = 'platform'; break; }
        if (projectileStructureAt(this.game.objects, x, y)) { impactKind = 'structure'; break; }
      }
      const recoilBoost = cannonAngle <= -20 && ['ground', 'platform'].includes(impactKind) && Math.abs(end.x - origin.x) <= CLASS_BALANCE.waterCannonRecoilRange;
      c.save(); c.strokeStyle = '#71eaff'; c.lineWidth = 5 * scale; c.setLineDash([14 * scale, 8 * scale]); c.lineDashOffset = -performance.now() / 26; c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(end.x, end.y); c.stroke(); c.setLineDash([]); c.strokeStyle = '#dffbff'; c.lineWidth = 2 * scale; c.beginPath(); c.arc(end.x, end.y, 12 * scale, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#c7faff'; c.font = `bold ${9 * scale}px monospace`; c.textAlign = 'center'; c.fillText(recoilBoost ? 'IMPULSO ↑' : 'JATO 40 HP', end.x, end.y - 22 * scale); c.restore(); this.aimPreviewImpact = end; return;
    }
    const assistedTarget = this.aimAssistTargetId && this.visualPlayers.get(this.aimAssistTargetId);
    if (assistedTarget?.alive && !assistedTarget.hidden) { const point = this.renderPosition(assistedTarget); const uncertain = this.aimAssistError > 110; c.save(); c.strokeStyle = uncertain ? '#ffb55c' : '#7cecff'; c.lineWidth = 1.5 * scale; c.setLineDash([5 * scale, 5 * scale]); c.beginPath(); c.arc(point.x, point.y, 28 * scale, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.fillStyle = uncertain ? '#ffe0aa' : '#e4fbff'; c.font = `bold ${8 * scale}px monospace`; c.textAlign = 'center'; c.fillText(uncertain ? 'MIRA APROX.' : 'ASSIST', point.x, point.y - 37 * scale); c.restore(); }
    if ((player.selectedPowerups || [player.selectedPowerup]).includes('laser') && player.inventory?.includes('laser')) {
      const distance = Math.min(1450, 620 + this.aim.power * 1.35); let endX = origin.x; let endY = origin.y;
      for (let step = 15; step <= distance; step += 12) { const nextX = origin.x + Math.cos(rad) * step * this.aim.direction; const nextY = origin.y - Math.sin(rad) * step; if (nextX < 2 || nextX >= WORLD.width - 2 || nextY < 2 || nextY > WORLD.height) break; endX = nextX; endY = nextY; }
      c.save(); c.lineCap = 'round'; c.shadowColor = '#ff3d81'; c.shadowBlur = 16 * scale; c.strokeStyle = '#170610dd'; c.lineWidth = 12 * scale; c.beginPath(); c.moveTo(origin.x, origin.y); c.lineTo(endX, endY); c.stroke(); c.strokeStyle = '#ff3d81'; c.lineWidth = 6 * scale; c.stroke(); c.shadowBlur = 0; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5 * scale; c.setLineDash([18 * scale, 8 * scale]); c.lineDashOffset = -performance.now() / 24; c.stroke(); c.setLineDash([]);
      for (const target of this.game.players) { if (!target.alive || target.id === player.id || target.hidden) continue; const visual = this.visualPlayers.get(target.id); if (!visual) continue; const position = this.renderPosition(visual); const dx = endX - origin.x; const dy = endY - origin.y; const along = clamp(((position.x - origin.x) * dx + (position.y - origin.y) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1); const nearX = origin.x + dx * along; const nearY = origin.y + dy * along; if (Math.hypot(position.x - nearX, position.y - nearY) > 22) continue; c.strokeStyle = '#ffffff'; c.lineWidth = 2 * scale; c.beginPath(); c.arc(position.x, position.y, 18 * scale, 0, Math.PI * 2); c.stroke(); }
      const marker = 10 * scale; c.fillStyle = '#ff3d81'; c.beginPath(); c.moveTo(endX, endY - marker); c.lineTo(endX + marker, endY); c.lineTo(endX, endY + marker); c.lineTo(endX - marker, endY); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(endX - 2 * scale, endY - 2 * scale, 4 * scale, 4 * scale); c.restore(); this.aimPreviewImpact = { x: endX, y: endY }; return;
    }
    const underwater = waterDepthAt(this.game.terrain, this.game.waterZones, player.x, player.y, this.worldNow()) > 8;
    const effectivePower = this.aim.power * (underwater && player.classType !== 'amphibian' ? .42 : 1);
    let x = origin.x + Math.cos(rad) * 18 * this.aim.direction; let y = origin.y - Math.sin(rad) * 18; let vx = Math.cos(rad) * effectivePower * this.aim.direction; let vy = -Math.sin(rad) * effectivePower; const dt = 1 / 60;
    const points = [];
    c.save(); c.globalAlpha = .3; c.strokeStyle = '#b7ec58'; c.lineWidth = Math.max(1, scale * .8); c.setLineDash([8 * scale, 7 * scale]); c.beginPath(); c.arc(origin.x, origin.y, MAX_AIM_RANGE, Math.PI, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore();
    let blockedStructure = null;
    const currents = [...(this.game.windVortices || []), ...airPocketCurrents(this.game.terrain, this.game.waterZones, this.worldNow())];
    for (let step = 0; step < 900; step += 1) { const previousY = y; x += vx * dt; y += vy * dt; vx += (this.game.wind || 0) * dt; vy += (this.game.gravity || 120) * dt; const deflection = deflectProjectile(currents, x, y, vx, vy, dt, this.worldNow()); vx = deflection.vx; vy = deflection.vy; if (step % 6 === 0) points.push({ x, y, alpha: Math.max(.28, 1 - step / 900), vortexLift: Boolean(deflection.vortex), vortexFire: Boolean(deflection.vortex?.fire), airPocket: deflection.vortex?.kind === 'airPocket' }); const hitsPlatform = this.game.terrain.floatingPlatforms?.some((platform) => { const px = this.platformX(platform); return platform.active && x >= px && x <= px + platform.width && Math.min(previousY, y) <= platform.y + platform.height && Math.max(previousY, y) >= platform.y; }); blockedStructure = projectileStructureAt(this.game.objects, x, y); if (x < 0 || x >= WORLD.width || y > WORLD.height || hitsPlatform || blockedStructure || y >= this.terrainHeights[Math.round(clamp(x, 0, WORLD.width - 1))]) { points.push({ x, y }); break; } }
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#07110ccc'; c.lineWidth = 5 * scale; c.beginPath(); points.forEach((point, index) => index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.stroke(); c.strokeStyle = '#dfff91'; c.lineWidth = 1.7 * scale; c.setLineDash([2 * scale, 8 * scale]); c.stroke(); c.setLineDash([]); for (const point of points) if (point.vortexLift) { c.fillStyle = point.vortexFire ? '#ffa34f' : point.airPocket ? '#79dfff' : '#6fffe2'; c.fillRect(point.x - 2 * scale, point.y - 2 * scale, 4 * scale, 4 * scale); }
    const impact = points.at(-1); this.aimPreviewImpact = impact ? { x: impact.x, y: impact.y } : null; if (impact) { const size = 8 * scale; c.globalAlpha = .9; c.strokeStyle = blockedStructure ? '#ff755c' : '#ffdc6b'; c.lineWidth = 1.5 * scale; c.beginPath(); c.arc(impact.x, impact.y, size, 0, Math.PI * 2); c.moveTo(impact.x - size * 1.5, impact.y); c.lineTo(impact.x + size * 1.5, impact.y); c.moveTo(impact.x, impact.y - size * 1.5); c.lineTo(impact.x, impact.y + size * 1.5); c.stroke(); if (blockedStructure) { c.fillStyle = '#fff3de'; c.font = `bold ${9 * scale}px monospace`; c.textAlign = 'center'; c.fillText('ESTRUTURA', impact.x, impact.y - 16 * scale); } }
    c.restore();
  }

  drawHarpoonAim(c, origin, rad, scale) {
    const dx = Math.cos(rad) * this.aim.direction; const dy = -Math.sin(rad); const range = WEAPON_BALANCE.harpoon.range;
    let end = { x: origin.x, y: origin.y, distance: 0 }; let obstacle = null;
    for (let distance = 18; distance <= range; distance += 6) {
      const x = origin.x + dx * distance; const y = origin.y + dy * distance;
      if (x < 3 || x >= WORLD.width - 3 || y < 3 || y > WORLD.height + 20) break;
      end = { x, y, distance };
      obstacle = projectileStructureAt(this.game.objects, x, y);
      const platform = this.game.terrain.floatingPlatforms?.find((entry) => { const px = this.platformX(entry); return entry.active && x >= px && x <= px + entry.width && y >= entry.y && y <= entry.y + entry.height; });
      const tank = this.game.players.find((entry) => entry.alive && entry.id !== this.playerId && Math.hypot(entry.x - x, entry.y - y) <= WORLD.tankRadius + 5);
      if (tank || obstacle || platform || y >= this.terrainHeights[Math.round(x)]) { obstacle ||= tank || platform || { type: 'terrain' }; break; }
    }
    this.aimPreviewImpact = { x: end.x, y: end.y };
    c.save(); c.lineCap = 'round'; c.strokeStyle = '#102b2e'; c.lineWidth = 7 * scale; c.beginPath(); c.moveTo(origin.x, origin.y); c.lineTo(end.x, end.y); c.stroke();
    c.strokeStyle = obstacle ? '#98ffe0' : '#ffc96d'; c.lineWidth = 2.5 * scale; c.setLineDash([12 * scale, 7 * scale]); c.lineDashOffset = -performance.now() / 32; c.stroke(); c.setLineDash([]);
    for (let distance = 150; distance < end.distance; distance += 150) { const px = origin.x + dx * distance; const py = origin.y + dy * distance; c.fillStyle = '#ecfff5'; c.fillRect(px - 2 * scale, py - 2 * scale, 4 * scale, 4 * scale); }
    c.strokeStyle = obstacle ? '#e6fff5' : '#ffc96d'; c.lineWidth = 2 * scale; c.beginPath(); c.arc(end.x, end.y, 11 * scale, 0, Math.PI * 2); c.moveTo(end.x - 16 * scale, end.y); c.lineTo(end.x + 16 * scale, end.y); c.moveTo(end.x, end.y - 16 * scale); c.lineTo(end.x, end.y + 16 * scale); c.stroke();
    c.fillStyle = '#eafff5'; c.font = `bold ${10 * scale}px monospace`; c.textAlign = 'center'; c.fillText(`ARPÃO ${Math.round(end.distance)}/${range}`, end.x, end.y - 23 * scale); c.restore();
  }

  shotIndex(shot, time) { if (shot.waterCannon) { const elapsed = time - shot.started; const duration = shot.durationMs || WEAPON_BALANCE.waterCannon.durationMs; return elapsed >= duration ? shot.path.length : Math.min(shot.path.length - 1, Math.floor(Math.max(0, elapsed) / Math.min(500, duration * .3) * Math.max(1, shot.path.length - 1))); } return Math.floor((time - shot.started) / 1000 * SHOT_PATH_RATE * (this.game?.speed || 1) * (shot.canActivateCluster ? CLUSTER_CAPSULE_SPEED : shot.canActivateVertical ? VECTOR_FLIGHT_RATE : 1)); }
  drawAquaticHunter(c, shot, point, index, time) {
    const previous = shot.path[Math.max(0, index - 2)] || point; const heading = Math.atan2(point.y - previous.y, point.x - previous.x); const nearBite = shot.sharkBite && index >= shot.path.length - 22; const bitePhase = nearBite ? clamp((index - (shot.path.length - 22)) / 21, 0, 1) : 0; const anticipation = bitePhase < .38 ? bitePhase / .38 : 1; const snap = bitePhase < .72 ? 0 : clamp((bitePhase - .72) / .18, 0, 1); const jaw = nearBite ? .12 + anticipation * .82 - snap * .76 : .1 + Math.sin(time / 130) * .035; const scale = Math.min(2.3, 1 / Math.max(.55, this.camera.zoom));
    c.save(); c.translate(point.x, point.y); c.rotate(heading); c.scale(scale * (1 + snap * .16), scale * (1 - snap * .08));
    const tailSwing = Math.sin(time / (point.sharkCharge ? 48 : 72) + index * .3) * (point.sharkCharge ? 8 : 5);
    c.fillStyle = '#102b45'; c.beginPath(); c.moveTo(-21, 0); c.lineTo(-38, -13 + tailSwing); c.lineTo(-32, 0); c.lineTo(-38, 13 + tailSwing); c.closePath(); c.fill();
    c.fillStyle = '#286f98'; c.beginPath(); c.moveTo(-24, -6); c.quadraticCurveTo(-5, -17, 20, -9); c.lineTo(30, -2); c.lineTo(25, 5); c.quadraticCurveTo(-3, 15, -24, 7); c.closePath(); c.fill();
    c.fillStyle = '#91ddea'; c.beginPath(); c.moveTo(-19, 1); c.quadraticCurveTo(3, 12, 25, 4); c.lineTo(30, 0); c.lineTo(19, 9); c.quadraticCurveTo(-5, 16, -19, 7); c.closePath(); c.fill();
    c.fillStyle = '#123f5b'; c.beginPath(); c.moveTo(-9, -11); c.lineTo(-1, -25); c.lineTo(8, -10); c.closePath(); c.fill(); c.beginPath(); c.moveTo(-5, 8); c.lineTo(-14, 19); c.lineTo(10, 9); c.closePath(); c.fill();
    c.fillStyle = '#f7ffff'; c.fillRect(14, -9, 5, 4); c.fillStyle = nearBite ? '#ff554e' : '#07131d'; c.fillRect(16, -8, 3, 3);
    c.strokeStyle = '#123247'; c.lineWidth = 1.5; for (let gill = 0; gill < 3; gill += 1) { c.beginPath(); c.moveTo(7 - gill * 3, -5); c.lineTo(8 - gill * 3, 3); c.stroke(); }
    c.save(); c.translate(23, 0); c.fillStyle = '#7d2832'; c.beginPath(); c.ellipse(5, 0, 10, 5 + jaw * 7, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#071c2b'; c.lineWidth = 2;
    for (const side of [-1, 1]) { c.save(); c.rotate(side * jaw); c.fillStyle = side < 0 ? '#d9edf0' : '#bcd6dc'; c.beginPath(); c.moveTo(-5, side * 1); c.lineTo(14, side * 8); c.lineTo(10, 0); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#ffffff'; for (let tooth = 0; tooth < 5; tooth += 1) { const tx = -1 + tooth * 3; c.beginPath(); c.moveTo(tx, side * 2); c.lineTo(tx + 1.5, -side * 3); c.lineTo(tx + 3, side * 2); c.fill(); } c.restore(); } c.restore();
    if (nearBite && snap > 0) { c.globalAlpha = (1 - snap) * .8; c.strokeStyle = '#eaffff'; c.lineWidth = 3; c.beginPath(); c.arc(31, 0, 14 + snap * 18, -.9, .9); c.stroke(); }
    if (point.sharkCharge) { c.strokeStyle = '#b9f8ff'; c.globalAlpha = .55; c.lineWidth = 2; for (let wake = 0; wake < 3; wake += 1) { c.beginPath(); c.moveTo(-24 - wake * 9, -5 - wake * 2); c.lineTo(-34 - wake * 13, 0); c.lineTo(-24 - wake * 9, 5 + wake * 2); c.stroke(); } }
    c.restore();
    for (let bubble = 0; bubble < (point.sharkCharge ? 7 : 4); bubble += 1) { const drift = (time / 55 + bubble * 13) % 28; c.fillStyle = bubble % 2 ? '#b7f8ff' : '#5bcbe8'; c.globalAlpha = .45 + bubble % 3 * .15; const bubbleSize = 2 + bubble % 3; c.fillRect(point.x - Math.cos(heading) * (22 + drift) - bubbleSize / 2, point.y - Math.sin(heading) * (22 + drift) - bubble * 3 % 11, bubbleSize, bubbleSize); } c.globalAlpha = 1;
  }
  drawProjectileAura(c, shot, point, previous, time, size, palette) {
    const electric = ['zeus', 'teslaOrb', 'lightningRod'].includes(shot.weapon);
    const guided = shot.combo?.includes('guidedBullet');
    const frost = shot.freeze || ['elementalIce', 'cryoMortar'].includes(shot.weapon);
    const violet = ['gravity', 'cluster'].includes(shot.weapon);
    const hot = shot.megaMissile || ['heavy', 'seismicCharge', 'fireworks', 'droneStrike', 'flyingHunter'].includes(shot.weapon);
    const phase = time / (electric ? 92 : 180);
    const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
    const radius = size * (electric ? 2.5 : guided ? 2.4 : hot ? 2.1 : 1.7);
    c.save(); c.translate(point.x, point.y);
    c.save(); c.rotate(angle); c.lineCap = 'round';
    const trailColor = electric ? '#8ff4ff' : frost ? '#9befff' : violet ? '#b986ff' : hot ? '#ff8c52' : palette[1];
    for (let trail = 0; trail < (hot || electric ? 5 : 3); trail += 1) { const length = radius * (1.8 + trail * .72); c.globalAlpha = Math.max(.06, .38 - trail * .065); c.strokeStyle = trail ? trailColor : '#ffffff'; c.lineWidth = Math.max(1, size * (.48 - trail * .055)); c.beginPath(); c.moveTo(-size * .4, Math.sin(time / 75 + trail) * size * .28); c.lineTo(-length, Math.cos(time / 95 + trail * 1.8) * size * .42); c.stroke(); }
    if (hot) for (let puff = 0; puff < 4; puff += 1) { c.globalAlpha = .14 - puff * .022; c.fillStyle = puff % 2 ? '#79808a' : '#4a4c55'; const smokeSize = size * (.7 + puff * .28); c.beginPath(); c.arc(-radius * (1.4 + puff * .75), Math.sin(time / 120 + puff) * size, smokeSize, 0, Math.PI * 2); c.fill(); }
    c.restore();
    c.globalAlpha = point.underground ? .35 : .8;
    c.strokeStyle = palette[1]; c.lineWidth = Math.max(1.2, 1.8 / Math.max(.5, this.camera.zoom));
    c.beginPath(); c.arc(0, 0, radius * (.85 + Math.sin(phase) * .08), phase, phase + Math.PI * (electric ? 1.4 : .95)); c.stroke();
    for (let index = 0; index < (electric ? 8 : 5); index += 1) {
      const spin = phase * (electric ? 1.15 : .48) + index * Math.PI * 2 / (electric ? 8 : 5);
      const orbit = radius * (1 + .18 * Math.sin(phase * 1.6 + index));
      const pixel = index % 3 === 0 ? 4 : 2.5;
      c.fillStyle = electric ? index % 2 ? '#7eeaff' : '#fff' : frost ? index % 2 ? '#dcfbff' : '#6cdfff' : violet ? index % 2 ? '#e8b3ff' : '#8b5aeb' : shot.weapon === 'fireworks' ? ['#ff54ca', '#51eaff', '#ffe56c', '#a4ff6d', '#fff'][index % 5] : hot ? index % 2 ? '#ffd269' : '#ff6947' : index % 2 ? palette[0] : palette[1];
      c.fillRect(Math.round(Math.cos(spin) * orbit - pixel / 2), Math.round(Math.sin(spin) * orbit - pixel / 2), pixel, pixel);
    }
    if (guided) { c.save(); c.rotate(angle); c.globalAlpha = .8; c.fillStyle = '#66ecff'; for (let jet = 0; jet < 3; jet += 1) c.fillRect(-radius * 1.7 - jet * 6 - (time / 45 % 6), (jet - 1) * 4, 5, 2); c.strokeStyle = '#b7f9ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, radius * 1.3, -Math.PI * .28, Math.PI * .28); c.stroke(); c.restore(); }
    if (electric) {
      c.shadowColor = '#70deff'; c.shadowBlur = 11;
      for (let branch = 0; branch < 4; branch += 1) {
        const direction = phase * 2 + branch * Math.PI / 2;
        const reach = radius * (1.65 + .25 * Math.sin(phase * 2 + branch));
        c.strokeStyle = branch % 2 ? '#77dcff' : '#edffff'; c.lineWidth = branch % 2 ? 1.7 : 2.4;
        c.beginPath(); c.moveTo(Math.cos(direction) * size * .55, Math.sin(direction) * size * .55);
        c.lineTo(Math.cos(direction + .35) * radius * .9, Math.sin(direction + .35) * radius * .9);
        c.lineTo(Math.cos(direction - .15) * reach, Math.sin(direction - .15) * reach); c.stroke();
      }
      c.shadowBlur = 0;
      c.globalAlpha = .8 + Math.sin(phase * 3) * .2; c.fillStyle = '#fff'; c.fillRect(-size * .28, -size * .28, size * .56, size * .56);
    } else if (!shot.laser && !point.underground) {
      c.rotate(angle); c.globalAlpha = .35 + .15 * Math.sin(phase * 2);
      c.fillStyle = hot ? '#ff6b45' : frost ? '#9ff1ff' : violet ? '#b57cff' : palette[1];
      c.fillRect(-radius * 2.2, -size * .34, radius * 1.2, size * .68);
      c.fillStyle = '#fff7cf'; c.fillRect(-radius * 1.4, -size * .17, radius * .75, size * .34);
    }
    c.restore();
  }
  drawVerticalPreview(c, point, time) {
    const target = this.verticalTargetForActivation(); if (!target) return;
    const dx = target.x - point.x; const dy = target.y - point.y; const length = Math.hypot(dx, dy); if (length < 12) return;
    const stepX = dx / length * 14; const stepY = dy / length * 14; let x = point.x; let y = point.y;
    c.save(); c.strokeStyle = '#94f9ff'; c.fillStyle = '#e7ffff'; c.lineWidth = 2 / Math.max(.4, this.camera.zoom); c.setLineDash([8, 8]); c.lineDashOffset = -time / 35; c.beginPath(); c.moveTo(x, y);
    for (let index = 0; index < 360; index += 1) { x += stepX; y += stepY; if (x < 0 || x >= WORLD.width || y < 0 || y >= WORLD.height) break; const platform = this.visualPlatforms.find((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && Math.abs(y - entry.y) < 9); if (platform || y >= (this.terrainHeights?.[Math.round(x)] ?? WORLD.height)) break; }
    c.lineTo(x, y); c.stroke(); c.setLineDash([]); c.globalAlpha = .65 + Math.sin(time / 120) * .25; c.fillRect(x - 6, y - 2, 12, 4); c.fillRect(x - 2, y - 6, 4, 12); c.restore();
  }

  drawSkullClouds(c, time) {
    const shape = ['0001111111000', '0011111111100', '0111111111110', '1111111111111', '1100011100011', '1100011100011', '1111111111111', '0111110111110', '0011100011100', '0011111111100', '0001101011000', '0001101011000'];
    this.skullClouds = this.skullClouds.filter((cloud) => time - cloud.started < cloud.duration);
    for (const cloud of this.skullClouds) { const progress = clamp((time - cloud.started) / cloud.duration, 0, 1); const reveal = clamp((progress - .12) / .24, 0, 1); if (!reveal) continue; const fade = 1 - clamp((progress - .7) / .3, 0, 1); const block = 6 + progress * 5; const lift = progress * 125; c.save(); c.globalAlpha = reveal * fade * .8; for (let row = 0; row < shape.length; row += 1) for (let col = 0; col < shape[row].length; col += 1) if (shape[row][col] === '1') { const wobble = Math.sin(time / 200 + row * .8 + col * .3) * progress * 3; c.fillStyle = (row + col) % 4 ? '#a8b5b9' : '#e4e9df'; c.fillRect(Math.round(cloud.x + (col - 6.5) * block + wobble), Math.round(cloud.y - 20 - lift + row * block), Math.ceil(block * .94), Math.ceil(block * .94)); } c.restore(); }
  }

  drawNinjaSlashes(c, time) {
    this.ninjaSlashes = this.ninjaSlashes.filter((slash) => time - slash.started < slash.duration);
    for (const slash of this.ninjaSlashes) {
      const progress = clamp((time - slash.started) / slash.duration, 0, 1);
      const dash = clamp((progress - .1) / .28, 0, 1);
      const impact = clamp((progress - .33) / .16, 0, 1);
      const fade = 1 - clamp((progress - .7) / .3, 0, 1);
      const dx = slash.toX - slash.fromX; const dy = slash.toY - slash.fromY;
      c.save();
      if (progress < .26) {
        const charge = 1 - Math.abs(Math.sin(time / 70)) * .2;
        c.globalAlpha = (1 - progress / .3) * charge;
        c.fillStyle = '#f5eaff'; c.fillRect(slash.fromX - 3, slash.fromY - 13, 6, 6);
        c.fillStyle = '#ba77ff';
        for (let i = 0; i < 5; i += 1) c.fillRect(slash.fromX - 16 + i * 7, slash.fromY - 20 - (i % 2) * 5, 3, 3);
      }
      if (dash > 0) {
        const headX = slash.fromX + dx * dash; const headY = slash.fromY + dy * dash - Math.sin(dash * Math.PI) * 15;
        for (let layer = 0; layer < 3; layer += 1) {
          const tail = clamp(dash - (.16 + layer * .075), 0, 1);
          c.globalAlpha = fade * (.5 - layer * .12);
          c.strokeStyle = ['#593b82', '#a36ddd', '#eee1ff'][layer]; c.lineWidth = [14, 7, 2][layer];
          c.beginPath(); c.moveTo(slash.fromX + dx * tail, slash.fromY + dy * tail - Math.sin(tail * Math.PI) * 15); c.lineTo(headX, headY); c.stroke();
        }
        c.globalAlpha = fade; c.fillStyle = '#ffffff'; c.fillRect(Math.round(headX - 4), Math.round(headY - 5), 8, 8);
        for (let i = 0; i < 12; i += 1) {
          const tail = clamp(dash - i * .035, 0, 1);
          c.fillStyle = i % 3 ? '#d5a4ff' : '#ffffff'; c.fillRect(Math.round(slash.fromX + dx * tail - 2), Math.round(slash.fromY + dy * tail - Math.sin(tail * Math.PI) * 15 - 2), 3, 3);
        }
      }
      if (impact > 0) {
        const bloom = Math.sin(Math.min(1, impact) * Math.PI * .5) * fade;
        const size = 12 + impact * 45;
        c.translate(slash.toX, slash.toY); c.globalAlpha = bloom;
        c.strokeStyle = '#884bbd'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, size * .73, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#f5d8ff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, size, 0, Math.PI * 2); c.stroke();
        for (const [index, angle] of [-Math.PI / 4, Math.PI / 4].entries()) {
          c.save(); c.rotate(angle); c.strokeStyle = index ? '#c680ff' : '#ffffff'; c.lineWidth = 8 - index * 2;
          c.beginPath(); c.moveTo(-size * .87, 0); c.lineTo(size * .87, 0); c.stroke();
          c.strokeStyle = '#fff7ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-size, -5); c.lineTo(size, -5); c.stroke(); c.restore();
        }
        c.fillStyle = '#f8e5ff';
        for (let i = 0; i < 18; i += 1) { const angle = i * Math.PI * 2 / 18; const radius = size * (.7 + (i % 3) * .3); c.fillRect(Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius), i % 4 ? 3 : 5, i % 4 ? 3 : 5); }
      }
      c.restore();
    }
  }

  drawSentryBursts(c, time) {
    this.sentryBursts = this.sentryBursts.filter((burst) => time - burst.started < burst.duration);
    for (const burst of this.sentryBursts) {
      const elapsed = time - burst.started;
      const object = this.visualObjects.find((entry) => entry.id === burst.sentryId && entry.active);
      const platform = object?.supportPlatformId && this.visualPlatforms.find((entry) => entry.id === object.supportPlatformId && entry.active);
      const originX = platform && Number.isFinite(object.platformOffset) ? this.platformX(platform) + object.platformOffset : object?.x ?? burst.x;
      const originY = object ? object.type === 'specialistDrone' ? object.y + 3 : object.groundY - object.height + 8 : burst.y;
      c.save();
      for (const [index, bullet] of (burst.bullets || []).entries()) {
        const age = elapsed - index * 140; if (age < 0) continue;
        const travel = clamp(age / 340, 0, 1); const angle = Math.atan2(bullet.y - bullet.fromY, bullet.x - bullet.fromX);
        const muzzleX = originX + (bullet.fromX - burst.x); const muzzleY = originY + (bullet.fromY - burst.y);
        const x = muzzleX + (bullet.x - bullet.fromX) * travel; const y = muzzleY + (bullet.y - bullet.fromY) * travel;
        if (age < 340) {
          c.save(); c.translate(x, y); c.rotate(angle); c.fillStyle = '#fff8d5'; c.fillRect(-4, -1, 6, 2); c.fillStyle = burst.specialist ? '#81d6ff' : '#7bffda'; c.fillRect(-8, -1, 4, 2); c.globalAlpha = .38; c.fillStyle = burst.specialist ? '#337cef' : '#49c6ab'; c.fillRect(-18, -1, 9, 2); c.restore();
          c.globalAlpha = .26 * (1 - travel); c.strokeStyle = burst.specialist ? '#7ac7ff' : '#7ceecf'; c.lineWidth = 1; c.beginPath(); c.moveTo(muzzleX, muzzleY); c.lineTo(x, y); c.stroke(); c.globalAlpha = 1;
        } else {
          const fade = clamp(1 - (age - 340) / 300, 0, 1); c.globalAlpha = fade; c.fillStyle = bullet.type === 'tank' ? '#fff0ae' : bullet.type === 'terrain' ? '#cda777' : '#83f5d9';
          for (let spark = 0; spark < 9; spark += 1) { const direction = spark * Math.PI * 2 / 9 + index; const spread = 3 + (1 - fade) * (bullet.type === 'structure' ? 23 : 14); c.fillRect(Math.round(bullet.x + Math.cos(direction) * spread), Math.round(bullet.y + Math.sin(direction) * spread), spark % 3 ? 2 : 3, spark % 3 ? 2 : 3); }
          if (!burst.shownHits.has(index)) { burst.shownHits.add(index); if (bullet.amount) this.floaters.push({ x: bullet.x, y: bullet.y - 12, text: `-${bullet.amount}`, age: 0, life: 1.1, color: '#fff0ae' }); for (let fragment = 0; fragment < 9; fragment += 1) this.addParticle({ kind: 'spark', x: bullet.x, y: bullet.y, vx: (Math.random() - .5) * 95, vy: -25 - Math.random() * 85, size: fragment % 3 ? 2 : 3, color: fragment % 2 ? '#fff2b1' : bullet.type === 'terrain' ? '#b18b65' : '#6deacc', gravity: 120, life: .3 + Math.random() * .25, bounce: .1, drag: .95 }); if (bullet.type === 'structure' || bullet.type === 'platform') this.shake = Math.max(this.shake, 4); }
        }
        if (age < 95) { c.save(); c.translate(muzzleX, muzzleY); c.rotate(angle); c.globalAlpha = 1 - age / 95; c.fillStyle = '#fff5ca'; c.fillRect(0, -3, 10, 6); c.fillStyle = '#ffaf62'; c.fillRect(10, -2, 7, 4); c.restore(); c.globalAlpha = 1 - age / 95; c.fillStyle = '#f6ce83'; c.fillRect(Math.round(originX - 8 - index * 2), Math.round(originY + 5 + age * .14), 3, 2); c.globalAlpha = 1; }
      }
      c.restore();
    }
    if (!this.sentryBursts.length) this.flushPendingState();
  }

  drawShots(c, time) {
    for (const shot of this.shots) {
      const index = this.shotIndex(shot, time);
      if (index < 0) continue;
      if (shot.droneIntercept && !shot.exploded) this.drawDroneGuard(c, shot, index, time);
      if (index < shot.path.length) {
        const p = shot.path[Math.max(0, index)]; if (!p) continue; const visibilityScale = Math.min(2.8, 1 / Math.max(.36, this.camera.zoom)); const baseSize = shot.megaMissile ? 12 : shot.weapon === 'heavy' ? 7 : 5; const size = baseSize * visibilityScale; const heavyPeak = shot.weapon === 'heavy' ? Math.min(...shot.path.slice(0, Math.max(1, index + 1)).map((point) => point.y)) : p.y; const heavyCharge = shot.weapon === 'heavy' ? clamp(Math.max(0, shot.path[0].y - heavyPeak) / 720 * .6 + Math.abs(p.x - shot.path[0].x) / 1800 * .4, 0, 1) : 0; const heavyHot = shot.weapon === 'heavy' && heavyCharge > .15; const palette = heavyHot ? [heavyCharge > .72 ? '#fff3d2' : '#ffb05c', heavyCharge > .72 ? '#ff2828' : '#e95b3d'] : shot.weapon === 'megaCannon' ? ['#f0ffff', '#319ef8'] : shot.weapon === 'cluster' ? ['#f9d5ff', '#b267ff'] : shot.weapon === 'droneStrike' ? ['#fff2a6', '#ff7557'] : shot.weapon === 'teslaOrb' ? ['#ffffff', '#64e8ff'] : shot.weapon === 'seismicCharge' ? ['#ffd178', '#ff5f45'] : shot.laser ? ['#ffffff', '#ff3d81'] : shot.weapon === 'verticalStrike' ? ['#e9feff', '#42ddec'] : shot.weapon === 'moleBomb' ? ['#ffe2a8', '#8b552f'] : shot.weapon === 'mineLayer' ? ['#ffd078', '#ff714d'] : shot.weapon === 'grenade' ? ['#ddff87', '#6f9b44'] : shot.teleport ? ['#42f5d7', '#b06cff'] : shot.freeze ? ['#dffcff', '#55cfff'] : shot.weapon === 'zeus' ? ['#ffffff', '#58ddff'] : shot.weapon === 'gravity' ? ['#e9b4ff', '#7b48e8'] : shot.weapon === 'fireworks' ? ['#fff08a', '#ff4fbd'] : shot.megaMissile ? ['#fff0a0', '#ff493d'] : ['#fff4a8', '#ff8a52'];
        if (p.vortexLift && !shot.vortexDeflected) { shot.vortexDeflected = true; this.spawnVortexDeflection(p); this.onVortexDeflect?.(p.vortexFire); }
        if (shot.waterCannon) {
          const start = shot.path[0]; const dx = p.x - start.x; const dy = p.y - start.y; const length = Math.max(1, Math.hypot(dx, dy)); const nx = -dy / length; const ny = dx / length;
          const elapsed = time - shot.started; const pulse = .88 + Math.sin(elapsed / 65) * .12;
          c.save(); c.lineCap = 'round'; c.shadowColor = '#67deff'; c.shadowBlur = 18; c.strokeStyle = '#11678f'; c.lineWidth = 20 * pulse; c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(p.x, p.y); c.stroke();
          c.shadowBlur = 0; c.strokeStyle = '#4cc9ef'; c.lineWidth = 12 * pulse; c.stroke(); c.strokeStyle = '#e7ffff'; c.lineWidth = 4; c.stroke();
          for (let stream = 0; stream < Math.min(42, Math.ceil(length / 19)); stream += 1) {
            const along = ((stream * 24 + elapsed * .8) % length) / length; const spread = Math.sin(elapsed / 75 + stream * 2.1) * (7 + stream % 3 * 3); const x = start.x + dx * along + nx * spread; const y = start.y + dy * along + ny * spread;
            c.fillStyle = stream % 4 ? '#8cecff' : '#ffffff'; c.fillRect(x - 2, y - 2, 3 + stream % 3, 3 + stream % 3);
          }
          c.fillStyle = '#ddfbff'; for (let drop = 0; drop < 12; drop += 1) { const phase = elapsed / 85 + drop * 2; c.fillRect(p.x + Math.cos(phase) * (8 + drop % 4 * 5), p.y + Math.sin(phase) * (8 + drop % 4 * 5), 3 + drop % 3, 3 + drop % 3); }
          c.restore(); continue;
        }
        if (shot.weapon === 'waterHunter' && p.sharkSwim) { this.drawAquaticHunter(c, shot, p, index, time); continue; }
        const visualPalette = projectileVisual(shot, p.diving);
        if (shot.weapon === 'heavy' && heavyHot) { visualPalette.core = heavyCharge > .7 ? '#ffffff' : '#ffe1a5'; visualPalette.glow = heavyCharge > .7 ? '#ff2728' : heavyCharge > .4 ? '#ff5533' : '#ff9e50'; visualPalette.shadow = '#8c202d'; }
        palette[0] = visualPalette.core; palette[1] = visualPalette.glow;
        if (shot.flyingHunter && p.diving && !shot.diveSoundPlayed) { shot.diveSoundPlayed = true; this.onHunterDive?.(); this.floaters.push({ x: p.x, y: p.y - 32, text: 'CAÇA EM MERGULHO!', age: 0, life: 1.2, color: '#ff7266' }); }
        const fuseStart = shot.weapon === 'grenade' && p.fuse ? (shot.fuseStartIndex ??= shot.path.findIndex((point) => point.fuse)) : -1;
        const fuseProgress = fuseStart >= 0 ? clamp((index - fuseStart) / Math.max(1, shot.path.length - fuseStart), 0, 1) : 0;
        const fuseBlink = fuseStart >= 0 && Math.floor(time / Math.max(42, 180 - fuseProgress * 138)) % 2 === 0;
        c.save(); c.globalAlpha = p.underground ? .65 : .22; c.fillStyle = palette[1]; c.beginPath(); c.arc(p.x, p.y, size * 1.55, 0, Math.PI * 2); c.fill(); c.globalAlpha = fuseStart >= 0 && !fuseBlink ? .4 : 1; c.fillStyle = fuseBlink ? '#fff0a0' : palette[0];
        const previousPoint = shot.path[Math.max(0, index - 2)] || p;
        const heading = Math.atan2(p.y - previousPoint.y, p.x - previousPoint.x);
        const atlas = projectileSpriteSheet(shot) === 'special' ? this.specialProjectileAtlas : this.projectileAtlas;
        if (shot.armorPiercer || !drawProjectileSprite(c, atlas, shot, visualPalette, p.x, p.y, heading, size, time))
          drawProjectilePixelArt(c, visualPalette, p.x, p.y, heading, size, time);
        drawProjectileModifiers(c, shot, p.x, p.y, size, time);
        if (shot.elementalType) { const color = ELEMENT_VISUALS[shot.elementalType]?.color || '#ffffff'; c.save(); c.shadowColor = color; c.shadowBlur = 11; c.strokeStyle = color; c.lineWidth = 2 / Math.max(.5, this.camera.zoom); c.beginPath(); c.arc(p.x, p.y, size * 2.1 + Math.sin(time / 90) * 2, 0, Math.PI * 2); c.stroke(); c.fillStyle = color; for (let orbit = 0; orbit < 5; orbit += 1) { const phase = time / 160 + orbit * Math.PI * 2 / 5; c.fillRect(p.x + Math.cos(phase) * size * 3 - 2, p.y + Math.sin(phase) * size * 3 - 2, 4, 4); } c.restore(); }
        if (shot.armorPiercer) { c.save(); c.translate(p.x, p.y); c.rotate(heading); c.strokeStyle = '#fff7cf'; c.lineWidth = 2; c.beginPath(); c.moveTo(-size * 4, 0); c.lineTo(size * 2, 0); c.stroke(); c.fillStyle = '#ffe69b'; for (let spark = 0; spark < 4; spark += 1) c.fillRect(-size * (2 + spark) + Math.sin(time / 80 + spark) * 3, (spark - 1.5) * 5, 3, 3); c.restore(); }
        this.drawProjectileAura(c, shot, p, shot.path[Math.max(0, index - 2)] || p, time, size, palette);
        if (['soapBomb', 'markerBomb', 'harpoon'].includes(shot.weapon)) {
          const u = 1 / Math.max(.45, this.camera.zoom); c.save(); c.globalAlpha = .95;
          if (shot.weapon === 'soapBomb') { for (let orbit = 0; orbit < 4; orbit += 1) { const phase = time / 220 + orbit * Math.PI / 2; const radius = (15 + orbit % 2 * 6) * u; c.fillStyle = orbit % 2 ? '#ffc6f5' : '#c5fff6'; c.fillRect(p.x + Math.cos(phase) * radius - 3 * u, p.y + Math.sin(phase) * radius - 3 * u, 6 * u, 6 * u); } c.strokeStyle = '#a9fff3'; c.lineWidth = 2 * u; c.beginPath(); c.arc(p.x, p.y, 18 * u, 0, Math.PI * 2); c.stroke(); }
          else if (shot.weapon === 'markerBomb') { const pulse = Math.sin(time / 100) * 3 * u; c.strokeStyle = '#ff5d71'; c.lineWidth = 3 * u; c.strokeRect(p.x - 16 * u - pulse, p.y - 16 * u - pulse, 32 * u + pulse * 2, 32 * u + pulse * 2); for (let corner = 0; corner < 4; corner += 1) { const angle = Math.PI / 2 * corner + time / 400; c.fillStyle = '#fff0bb'; c.fillRect(p.x + Math.cos(angle) * 25 * u - 2 * u, p.y + Math.sin(angle) * 25 * u - 2 * u, 4 * u, 4 * u); } }
          else { const start = shot.path[0]; if (start) { c.strokeStyle = '#72ffe0'; c.lineWidth = 2 * u; c.setLineDash([9 * u, 5 * u]); c.lineDashOffset = -time / 35; c.beginPath(); c.moveTo(start.x, start.y); c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]); } c.strokeStyle = '#effff4'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(p.x - Math.cos(heading) * 11 * u, p.y - Math.sin(heading) * 11 * u); c.lineTo(p.x + Math.cos(heading) * 15 * u, p.y + Math.sin(heading) * 15 * u); c.stroke(); }
          c.restore();
        }
        if (fuseStart >= 0) { c.globalAlpha = fuseBlink ? .9 : .3; c.strokeStyle = fuseBlink ? '#ff593c' : '#e8cf6d'; c.shadowColor = '#ff4738'; c.shadowBlur = fuseBlink ? 16 : 0; c.lineWidth = (2 + fuseProgress * 2) / Math.max(.45, this.camera.zoom); c.beginPath(); c.arc(p.x, p.y, size * (1.5 + fuseProgress * 1.3), 0, Math.PI * 2); c.stroke(); c.shadowBlur = 0; }
        if (shot.laser && shot.path[0]) { c.globalAlpha = .85; c.strokeStyle = '#ff3d81'; c.shadowColor = '#ff3d81'; c.shadowBlur = 18; c.lineWidth = 7 / Math.max(.4, this.camera.zoom); c.beginPath(); c.moveTo(shot.path[0].x, shot.path[0].y); c.lineTo(p.x, p.y); c.stroke(); c.shadowBlur = 0; c.strokeStyle = '#ffffff'; c.lineWidth /= 3; c.stroke(); }
        if (heavyHot) { c.globalAlpha = .35 + heavyCharge * .5 * (.55 + Math.sin(time / Math.max(42, 120 - heavyCharge * 70)) * .45); c.strokeStyle = visualPalette.glow; c.lineWidth = (2 + heavyCharge * 5) / Math.max(.4, this.camera.zoom); c.beginPath(); c.arc(p.x, p.y, size * (1.2 + heavyCharge), 0, Math.PI * 2); c.stroke(); c.globalAlpha = .8; c.fillStyle = visualPalette.glow; for (let ember = 0; ember < 5; ember += 1) { const phase = time / 65 + ember * 2.3; c.fillRect(p.x + Math.cos(phase) * (size + ember * 3) - 2, p.y + Math.sin(phase) * (size + ember * 3) - 2, 4, 4); } }
        if (shot.weapon === 'verticalStrike' && shot.canActivateVertical && !shot.activationRequested && index < shot.activationIndex) { this.drawVerticalPreview(c, p, time); c.save(); const labelScale = 1 / Math.max(.35, this.camera.zoom); c.translate(p.x, p.y - 28 * labelScale); c.scale(labelScale, labelScale); c.fillStyle = '#07121ddd'; c.fillRect(-86, -12, 172, 24); c.strokeStyle = '#63f3ff'; c.lineWidth = 1; c.strokeRect(-86, -12, 172, 24); c.fillStyle = '#e9feff'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('TOQUE PARA REDIRECIONAR', 0, 3); c.restore(); }
        if (shot.weapon === 'cluster' && shot.canActivateCluster && !shot.activationRequested && index > 0 && index < shot.path.length - 1) { c.save(); const labelScale = 1 / Math.max(.35, this.camera.zoom); c.translate(p.x, p.y - 28 * labelScale); c.scale(labelScale, labelScale); c.fillStyle = '#1c0c2bdf'; c.fillRect(-80, -12, 160, 24); c.strokeStyle = '#c58aff'; c.lineWidth = 1; c.strokeRect(-80, -12, 160, 24); c.fillStyle = '#f8dfff'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('TOQUE PARA FRAGMENTAR', 0, 3); c.restore(); }
        if (shot.weapon === 'fireworks' && shot.canActivateFireworks && !shot.activationRequested && index > 0 && index < shot.path.length - 1) { c.save(); const labelScale = 1 / Math.max(.35, this.camera.zoom); c.translate(p.x, p.y - 28 * labelScale); c.scale(labelScale, labelScale); c.fillStyle = '#260e23df'; c.fillRect(-75, -12, 150, 24); c.strokeStyle = '#ff69c8'; c.lineWidth = 1; c.strokeRect(-75, -12, 150, 24); c.fillStyle = '#fff0fa'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('TOQUE PARA DETONAR', 0, 3); c.restore(); }
        const tail = projectileTrailLength(shot);
        for (let i = Math.max(0, index - tail); i < index; i += 2) { const trail = shot.path[i]; const strength = (i - index + tail) / Math.max(1, tail); c.globalAlpha = Math.max(.06, strength * .82); c.fillStyle = i % 4 ? visualPalette.glow : visualPalette.core; const trailSize = Math.max(2, size * strength * visualPalette.scale); c.fillRect(Math.round(trail.x - trailSize / 2), Math.round(trail.y - trailSize / 2), Math.ceil(trailSize), Math.ceil(trailSize)); } c.restore();
        for (const [bounceIndex, bounce] of (shot.bounces || []).entries()) if (!shot.seenBounces.has(bounceIndex) && Math.hypot(bounce.x - p.x, bounce.y - p.y) < 18) { shot.seenBounces.add(bounceIndex); this.spawnGrenadeBounce(bounce.x, bounce.y, shot.weapon === 'markerBomb'); if (shot.weapon === 'markerBomb') this.onMarkerBounce?.(); }
        if (shot.weapon === 'grenade' && p.fuse && time - shot.trailAt > Math.max(55, 150 - fuseProgress * 85)) { shot.trailAt = time; this.addParticle({ kind: 'spark', x: p.x, y: p.y - size, vx: (Math.random() - .5) * 30, vy: -25 - Math.random() * 35, size: 2 + Math.random() * 2, color: fuseBlink ? '#fff2a0' : '#ff864d', gravity: 30, life: .2 + Math.random() * .2, bounce: 0, drag: .96 }); }
        if (!p.underground && !shot.laser && !(shot.weapon === 'grenade' && p.fuse) && time - shot.trailAt > (shot.megaMissile ? 24 : 38)) { shot.trailAt = time; const previous = shot.path[Math.max(0, index - 2)] || p; const dx = p.x - previous.x; const dy = p.y - previous.y; const smokeColor = shot.freeze ? '#bcefff' : shot.weapon === 'fireworks' ? '#ff77cb' : shot.weapon === 'zeus' || shot.weapon === 'verticalStrike' ? '#8cecff' : '#596068'; for (let trail = 0; trail < (shot.megaMissile ? 6 : 3); trail += 1) this.addParticle({ kind: trail % 3 ? 'spark' : 'smoke', x: p.x - dx * (trail + 1) * .45 + (Math.random() - .5) * 4, y: p.y - dy * (trail + 1) * .45 + (Math.random() - .5) * 4, vx: -dx * 2 + (Math.random() - .5) * 22, vy: -dy * 2 - 8 - Math.random() * 18, size: trail % 3 ? 2 + Math.random() * 2 : (shot.megaMissile ? 9 : 5) + Math.random() * 6, color: trail % 3 ? palette[trail % 2] : smokeColor, gravity: trail % 3 ? 25 : -5, life: trail % 3 ? .35 : .7 + Math.random() * .55, bounce: 0, drag: .965 }); }
        if (p.underground && time - shot.trailAt > 55) { shot.trailAt = time; this.addParticle({ x: p.x + (Math.random() - .5) * 14, y: p.y - 8, vx: (Math.random() - .5) * 35, vy: -35 - Math.random() * 55, size: 3 + Math.random() * 3, color: Math.random() > .5 ? '#8b623f' : '#c29a68', gravity: 120, life: .45, bounce: .1, drag: .96 }); }
      } else if (!shot.exploded) { shot.exploded = true; if (shot.impact) { if (shot.droneIntercept) this.spawnDroneGuardImpact(shot.droneIntercept); shot.waterCannon ? this.spawnWaterCannonImpact(shot) : shot.weapon === 'elementalWater' ? this.spawnElementalWaterImpact(shot) : shot.delayedStrike ? this.spawnStrikeMarker(shot) : shot.weapon === 'megaCannon' && shot.detonation ? this.spawnMegaCannonImpact(shot) : shot.weapon === 'soapBomb' && !shot.megaMissile ? this.spawnSoapLaunch(shot) : shot.weapon === 'harpoon' ? this.spawnHarpoonAnchor(shot) : shot.laser ? this.spawnLaserImpact(shot) : shot.weapon === 'gravity' ? this.spawnGravityWell(shot) : shot.weapon === 'elementalWind' ? this.spawnElementalWindLaunch(shot) : shot.weapon === 'windPlate' ? this.spawnWindPlateLaunch(shot) : shot.noExplosion ? this.spawnMineDeploy(shot) : this.spawnExplosion(shot); if (shot.elementalBurst) this.spawnElementalImprint(shot); this.spawnImpactEcho(shot.impact.x, shot.impact.y, shot.freeze ? 'freeze' : shot.weapon, shot.radius || 48, shot.delayedStrike ? 3000 : shot.megaMissile ? 3300 : 2100); this.onShotImpact?.(shot); if (shot.weapon !== 'meteorSalvo' || !(shot.interactions || []).some((interaction) => interaction.type === 'meteorImpact')) this.spawnDamageNumbers(shot); this.focusShotAftermath(shot); } else if (shot.path?.length) { const last = shot.path.at(-1); this.spawnImpactEcho(last.x, last.y, 'miss', 26, 2000); } }
    }
    if (this.shots.length && this.shots.every((shot) => shot.exploded)) {
      this.flushPendingState();
      for (const blast of this.pendingBomberDetonations.splice(0)) this.spawnBomberDetonation(blast);
      if (!this.actionCamera && this.actionReturnCamera) { this.cameraReturn = { from: { ...this.camera }, to: this.actionReturnCamera, started: time, duration: 720 }; this.actionReturnCamera = null; }
    }
    this.shots = this.shots.filter((shot) => !shot.exploded || time - shot.started < 2600);
  }

  drawDroneGuard(c, shot, index, time) {
    const guard = shot.droneIntercept;
    const start = Math.max(0, shot.path.length - 42);
    const progress = clamp((index - start) / Math.max(1, shot.path.length - 1 - start), 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const x = guard.fromX + (guard.toX - guard.fromX) * eased;
    const y = guard.fromY + (guard.toY - guard.fromY) * eased;
    c.save();
    if (progress > 0) {
      c.strokeStyle = '#5bdcff'; c.lineWidth = 4; c.globalAlpha = .65;
      c.setLineDash([12, 8]); c.lineDashOffset = -time / 20;
      c.beginPath(); c.moveTo(guard.fromX, guard.fromY); c.lineTo(x, y); c.stroke(); c.setLineDash([]);
      c.globalAlpha = .8;
      for (let i = 0; i < 5; i += 1) { const trail = Math.max(0, eased - i * .045); const px = guard.fromX + (guard.toX - guard.fromX) * trail; const py = guard.fromY + (guard.toY - guard.fromY) * trail; c.fillStyle = i % 2 ? '#a8edff' : '#4ab8f4'; c.fillRect(px - 3, py + 8 + i * 2, 6, 4); }
    }
    c.translate(x, y + Math.sin(time / 42) * 2);
    c.fillStyle = '#102434'; c.fillRect(-23, -11, 46, 23);
    c.fillStyle = '#73bde8'; c.fillRect(-19, -8, 38, 16);
    c.fillStyle = '#d6f8ff'; c.fillRect(-13, -6, 26, 5);
    c.fillStyle = '#55efff'; c.fillRect(-5, -3, 10, 8);
    c.fillStyle = '#1b415c'; c.fillRect(-31, -16, 12, 8); c.fillRect(19, -16, 12, 8);
    c.fillStyle = '#e8ffff';
    for (const rotorX of [-25, 25]) { const span = 12 + Math.sin(time / 30 + rotorX) * 4; c.fillRect(rotorX - span, -19, span * 2, 3); }
    c.fillStyle = '#e6f8ff'; c.fillRect(17, -1, 20, 5);
    c.restore();
  }

  spawnDroneGuardImpact(guard) {
    this.spawnImpactEcho(guard.toX, guard.toY, 'droneGuard', 62, 850);
    this.floaters.push({ x: guard.toX, y: guard.toY - 42, text: 'DRONE INTERCEPTOU!', age: 0, life: 1.5, color: '#90eaff' });
    for (let i = 0; i < 38; i += 1) { const angle = i / 38 * Math.PI * 2; const speed = 55 + Math.random() * 175; this.addParticle({ kind: i % 4 ? 'spark' : 'smoke', x: guard.toX, y: guard.toY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 2 + i % 4, color: i % 3 ? '#65d8ff' : '#edffff', gravity: 40, life: .35 + Math.random() * .45, bounce: 0, drag: .95 }); }
    this.onDroneIntercept?.(guard);
  }

  flushPendingState() {
    if (this.shots.some((shot) => !shot.exploded) || this.meteorAnimations.some((meteor) => !meteor.impacted) || this.sentryBursts.some((burst) => performance.now() - burst.started < burst.duration) || this.drillTerrainReveal) return;
    const activeDrills = this.drillAnimations.filter((drill) => performance.now() < drill.started + drill.duration);
    if (this.pendingTerrain && activeDrills.length && this.shots.some((shot) => shot.bunkerBuster)) {
      this.drillTerrainReveal = { before: [...this.terrainHeights], target: this.pendingTerrain, drills: activeDrills.map(({ x, y, started, duration }) => ({ x, y, started, duration })), lastFrameAt: 0 };
      this.pendingTerrain = null;
      return;
    }
    if (this.pendingTerrain) this.applyTerrain(this.pendingTerrain, true);
    if (this.pendingPlayers) { this.syncPlayers(this.pendingPlayers, false); this.pendingPlayers = null; }
    if (this.pendingPowerups) { this.visualPowerups = this.pendingPowerups; this.pendingPowerups = null; }
    if (this.pendingPlatforms) { this.visualPlatforms = this.pendingPlatforms; this.pendingPlatforms = null; }
    if (this.pendingObjects) { this.visualObjects = this.syncObjects(this.pendingObjects); this.pendingObjects = null; }
    if (this.pendingGraves) { this.visualGraves = this.pendingGraves; this.pendingGraves = null; }
    for (const platform of this.pendingPlatformDebris.splice(0)) this.spawnPlatformDebris(platform);
    for (const item of this.pendingPowerupReveals.splice(0)) this.spawnPowerupReveal(item);
  }

  spawnDamageNumbers(shot) { for (const hit of shot.damage || []) { const target = this.visualPlayers.get(hit.playerId); if (!target || hit.amount <= 0) continue; const zone = hit.hitZone; const color = hit.earthCrush ? '#ffd18a' : hit.structureShieldId ? '#82e6ff' : zone === 'head' ? '#fff0a0' : zone === 'center' ? '#ffac70' : zone === 'base' ? '#ff745f' : hit.amount >= 80 ? '#fff19a' : hit.amount >= 45 ? '#ff9b68' : '#ff6f66'; const label = hit.earthCrush ? `SOLO • -${hit.amount} / ARMADURA` : hit.structureShieldId ? `DOMO • -${hit.amount}` : zone === 'head' ? `CRÍTICO! -${hit.amount}` : zone === 'center' ? `CENTRO -${hit.amount}` : zone === 'base' ? `BASE -${hit.amount}` : `-${hit.amount} DANO`; this.floaters.push({ x: target.renderX, y: target.renderY - (zone === 'head' ? 48 : 32), text: label, age: 0, life: hit.earthCrush ? 1.9 : hit.structureShieldId ? 1.8 : zone === 'head' ? 2 : 1.45, color }); if (zone === 'head') { this.shake = Math.max(this.shake, 18); this.spawnImpactEcho(target.renderX, target.renderY - 18, 'critical', 34, 2000); } } }

  spawnImpactEcho(x, y, kind = 'standard', radius = 48, duration = 2100) {
    if (kind === 'waterMine') return; // Arming and detonation have their own timed effects.
    const colors = { zeus: '#a5efff', teslaOrb: '#73eaff', verticalStrike: '#8cecff', gravity: '#c591ff', seismicCharge: '#ff7867', fireworks: '#ff70c8', cluster: '#ba85ff', grenade: '#b7ec58', laser: '#ff70a9', mineLayer: '#ffb35c', waterCannon: '#73eaff', waterMine: '#78dffa', jump: '#42f5d7', parachute: '#dff8ff', armoredDash: '#ff8a5c', spider: '#d28cff', boost: '#fff06a', rocketDash: '#ff8a5c', excavator: '#cfa872', invisibility: '#b6abff', shield: '#8da8ff', heal: '#62e69a', freeze: '#82e7ff', critical: '#ffe378', teleport: '#42f5d7' };
    const started = performance.now(); this.impactEchoes.push({ x, y, kind, signature: IMPACT_SIGNATURES[kind] || 'kinetic', radius: clamp(radius, 24, 180), started, duration: Math.max(2000, duration), color: colors[kind] || '#ffb462' });
    this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, started + Math.max(2000, duration));
  }

  drawImpactEchoes(c, time) {
    this.impactEchoes = this.impactEchoes.filter((effect) => time < effect.started + effect.duration);
    for (const effect of this.impactEchoes) {
      const progress = clamp((time - effect.started) / effect.duration, 0, 1); const fade = Math.pow(1 - progress, .7); const electrical = effect.signature === 'electric';
      c.save(); c.globalAlpha = fade * (electrical ? .88 : .65); c.fillStyle = effect.color;
      // A short block flash keeps the impact centre readable at map zoom.
      if (progress < .23) {
        const flash = (1 - progress / .23) * (effect.signature === 'gravity' ? .55 : .85);
        const width = effect.radius * (.18 + progress * .42);
        c.globalAlpha = flash; c.fillStyle = effect.signature === 'gravity' ? '#e9caff' : effect.signature === 'water' ? '#e0ffff' : '#fff7dd';
        c.fillRect(Math.round(effect.x - width / 2), Math.round(effect.y - width / 2), Math.ceil(width), Math.ceil(width));
        c.fillStyle = effect.color; c.fillRect(Math.round(effect.x - width * .65), Math.round(effect.y - width * .15), Math.ceil(width * 1.3), Math.ceil(width * .3));
        c.fillRect(Math.round(effect.x - width * .15), Math.round(effect.y - width * .65), Math.ceil(width * .3), Math.ceil(width * 1.3));
      }
      c.globalAlpha = fade * (electrical ? .88 : .65); c.fillStyle = effect.color;
      for (let ring = 0; ring < 3; ring += 1) {
        const radius = effect.radius * (.22 + progress * .78) * (1 - ring * .18); const count = 18 + ring * 8;
        for (let dot = 0; dot < count; dot += 1) {
          const angle = dot / count * Math.PI * 2 + time / (electrical ? 170 : 480) * (ring % 2 ? -1 : 1);
          const jitter = electrical ? Math.sin(dot * 9.7 + time / 28) * 5 : 0;
          const size = Math.max(2, 4 - ring + (dot % 5 === 0 ? 1 : 0));
          c.fillRect(Math.round(effect.x + Math.cos(angle) * (radius + jitter)), Math.round(effect.y + Math.sin(angle) * (radius * .72 + jitter)), size, size);
        }
      }
      if (electrical) { c.globalAlpha = fade * .24; c.fillRect(effect.x - 3, effect.y - effect.radius * (.8 + progress * .5), 6, effect.radius * (1.6 + progress)); }
      if (electrical) {
        c.globalAlpha = fade * .76;
        for (let branch = 0; branch < 7; branch += 1) {
          const angle = branch * Math.PI * 2 / 7 - .3;
          for (let segment = 1; segment <= 5; segment += 1) {
            const reach = effect.radius * (.13 + progress * .5) * segment / 5;
            const jitter = Math.sin(branch * 13 + segment * 7 + Math.floor(time / 70)) * 4;
            c.fillStyle = segment % 2 ? '#dffcff' : effect.color;
            c.fillRect(Math.round(effect.x + Math.cos(angle) * reach + jitter), Math.round(effect.y + Math.sin(angle) * reach - jitter), 4, 4);
          }
        }
      } else if (progress < .4) {
        c.globalAlpha = fade * (1 - progress / .4) * .85;
        for (let spark = 0; spark < 12; spark += 1) {
          const angle = spark * Math.PI / 6;
          const reach = effect.radius * (.12 + progress * 1.1) * (spark % 3 === 0 ? 1.15 : .8);
          c.fillStyle = spark % 3 ? effect.color : '#fff2c1';
          c.fillRect(Math.round(effect.x + Math.cos(angle) * reach), Math.round(effect.y + Math.sin(angle) * reach * .75), spark % 3 ? 4 : 6, 4);
        }
      }
      const reach = effect.radius * (.14 + progress * .9);
      if (effect.signature === 'frost') {
        c.globalAlpha = fade * .85;
        for (let shard = 0; shard < 8; shard += 1) {
          const angle = shard * Math.PI / 4; const x = effect.x + Math.cos(angle) * reach; const y = effect.y + Math.sin(angle) * reach * .78;
          c.fillStyle = shard % 2 ? '#d9faff' : '#66d9f2'; c.fillRect(Math.round(x - 3), Math.round(y - 9), 6, 18);
          c.fillStyle = '#f3ffff'; c.fillRect(Math.round(x - 7), Math.round(y - 2), 14, 4);
        }
      } else if (effect.signature === 'gravity') {
        c.globalAlpha = fade * .72; c.strokeStyle = '#d9aaff'; c.lineWidth = 3;
        for (let box = 0; box < 3; box += 1) { const size = reach * (1.4 - box * .3); c.strokeRect(Math.round(effect.x - size / 2), Math.round(effect.y - size / 2), Math.round(size), Math.round(size)); }
        c.fillStyle = '#f3dcff'; for (let mote = 0; mote < 12; mote += 1) { const angle = mote * Math.PI / 6 + time / 430; const distance = effect.radius * (1 - progress * .76); c.fillRect(Math.round(effect.x + Math.cos(angle) * distance), Math.round(effect.y + Math.sin(angle) * distance * .7), 3, 3); }
      } else if (effect.signature === 'shock' || effect.signature === 'expander') {
        c.save(); c.globalAlpha = fade * .9; c.strokeStyle = effect.signature === 'shock' ? '#a2f6ff' : '#ff7aab'; c.lineWidth = effect.signature === 'shock' ? 8 : 5; c.shadowColor = c.strokeStyle; c.shadowBlur = 20; for (let ring = 0; ring < (effect.signature === 'shock' ? 2 : 3); ring += 1) { const size = reach * (1.15 - ring * .24); c.beginPath(); c.ellipse(effect.x, effect.y, size, size * (effect.signature === 'shock' ? .42 : .82), 0, 0, Math.PI * 2); c.stroke(); } c.restore();
      } else if (effect.signature === 'piercing') {
        c.save(); c.globalAlpha = fade; c.strokeStyle = '#fff8d8'; c.lineWidth = 5; c.shadowColor = '#f2d982'; c.shadowBlur = 16; c.beginPath(); c.moveTo(effect.x - reach, effect.y + reach * .25); c.lineTo(effect.x + reach, effect.y - reach * .25); c.stroke(); c.lineWidth = 2; c.beginPath(); c.moveTo(effect.x - reach * .65, effect.y - reach * .55); c.lineTo(effect.x + reach * .55, effect.y + reach * .65); c.stroke(); c.restore();
      } else if (effect.signature === 'fireworks') {
        const palette = ['#ff6dbd', '#67e9ff', '#ffe66b', '#a2fa7a']; c.globalAlpha = fade * .9;
        for (let ray = 0; ray < 16; ray += 1) { const angle = ray * Math.PI / 8; const distance = reach * (ray % 2 ? 1 : .72); c.fillStyle = palette[ray % palette.length]; c.fillRect(Math.round(effect.x + Math.cos(angle) * distance), Math.round(effect.y + Math.sin(angle) * distance), ray % 4 ? 4 : 6, ray % 4 ? 4 : 6); }
      } else if (effect.signature === 'seismic') {
        c.globalAlpha = fade * .8; c.fillStyle = '#ff6d56';
        for (const side of [-1, 1]) for (let crack = 0; crack < 5; crack += 1) { const x = effect.x + side * reach * (crack + 1) / 5; const y = effect.y + (crack % 2 ? 5 : -2); c.fillRect(Math.round(x), Math.round(y), Math.max(5, reach / 7), 3 + crack % 2 * 2); }
      } else if (!electrical) {
        c.globalAlpha = fade * .58; c.fillStyle = effect.color;
        for (let debris = 0; debris < 10; debris += 1) { const angle = debris * Math.PI / 5; const distance = reach * (debris % 2 ? .88 : 1.16); const size = debris % 3 ? 3 : 6; c.fillRect(Math.round(effect.x + Math.cos(angle) * distance), Math.round(effect.y + Math.sin(angle) * distance * .7), size, size); }
      }
      c.restore();
    }
  }

  spawnExplosion(shot) {
    this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, performance.now() + (shot.megaMissile ? 3300 : 2100));
    const { x, y } = shot.impact; const radius = shot.radius || 48; const count = shot.megaMissile ? 430 : shot.secondaryMeteor ? 145 : shot.weapon === 'heavy' ? 135 : 85; this.shake = Math.max(this.shake, shot.megaMissile ? 48 : shot.secondaryMeteor ? 19 : shot.weapon === 'heavy' ? 18 : 10); if (shot.megaMissile) this.impactFlash = { started: performance.now(), duration: 680, color: '#ffb347' }; if (shot.secondaryMeteor) this.impactFlash = { started: performance.now(), duration: 220, color: '#ffd48c', intensity: .2 };
    for (const tree of this.visualObjects.filter((object) => object.active && object.type?.startsWith('tree'))) { const canopyY = tree.groundY - tree.height * .62; const distance = Math.hypot(tree.x - x, canopyY - y); const reach = radius + (tree.crownWidth || tree.width * 1.5) * .58; if (distance > reach) continue; const strength = clamp(1 - distance / Math.max(1, reach), .12, 1); this.spawnTreeLeaves(tree, { count: Math.round((shot.megaMissile ? 105 : 20 + radius * .16) * strength), force: (110 + radius * 1.25) * strength, lift: (70 + radius * .55) * strength, originX: x, originY: y }); }
    if (shot.heavyCritical) { this.floaters.push({ x, y: y - 76, text: 'OBUS CRÍTICO ×1.35', age: 0, life: 1.8, color: '#ffed9d' }); this.spawnImpactEcho(x, y, 'critical', Math.max(96, radius)); this.shake = Math.max(this.shake, 25); }
    if (shot.bunkerBuster) { this.drillAnimations.push({ x, y, started: performance.now(), duration: 4000 }); this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, performance.now() + 4000); this.floaters.push({ x, y: y - 64, text: 'DESTRUIDOR • ESCAVANDO', age: 0, life: 2.2, color: '#ffcd79' }); }
    if (shot.armorPiercer) { this.spawnImpactEcho(x, y, 'armorPiercer', Math.max(36, radius * .75)); for (let i = 0; i < 54; i += 1) { const angle = (i / 54) * Math.PI * 2; this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * (120 + i % 4 * 30), vy: Math.sin(angle) * (120 + i % 4 * 30), size: i % 3 ? 2 : 4, color: i % 4 ? '#fff4c1' : '#8ea5ad', gravity: 35, life: .38 + i % 5 * .08, bounce: .08, drag: .94 }); } this.floaters.push({ x, y: y - 53, text: 'PERFURAÇÃO AP', age: 0, life: 1.8, color: '#fff4bf' }); }
    if (shot.shockwave) { this.spawnImpactEcho(x, y, 'shockwave', Math.max(radius, 116)); for (let i = 0; i < 110; i += 1) { const angle = i / 110 * Math.PI * 2; this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * (260 + i % 4 * 45), vy: Math.sin(angle) * (260 + i % 4 * 45), size: 2 + i % 3, color: i % 3 ? '#90f4ff' : '#ffffff', gravity: 0, life: .42 + i % 4 * .06, bounce: 0, drag: .97 }); } }
    if (shot.bigExplosion) { this.spawnImpactEcho(x, y, 'bigExplosion', Math.max(radius, 135)); this.floaters.push({ x, y: y - 62, text: 'ÁREA EXPANDIDA', age: 0, life: 1.6, color: '#ff7096' }); }
    const icyImpact = shot.freeze || ['elementalIce', 'cryoMortar'].includes(shot.weapon);
    const impactColors = icyImpact ? ['#eaffff', '#95eaff', '#55bbdc'] : ['zeus', 'teslaOrb', 'verticalStrike', 'waterHunter', 'waterTorpedo', 'elementalWater'].includes(shot.weapon) ? ['#f2ffff', '#8beaff', '#3c9be0'] : shot.weapon === 'elementalEarth' ? ['#fff0bb', '#c99858', '#7c5a43'] : shot.weapon === 'kineticCannon' ? ['#fff3b9', '#ffca69', '#7289a1'] : shot.weapon === 'droneStrike' ? ['#fff2c1', '#ffbb59', '#e46a42'] : shot.weapon === 'meteorSalvo' ? ['#fff2b4', '#ff9e4f', '#c54236', '#60414a'] : shot.weapon === 'markerBomb' ? ['#fff2bb', '#ffad5f', '#e55448'] : shot.weapon === 'cluster' ? ['#ffe9ff', '#d18aff', '#7650b8'] : shot.weapon === 'fireworks' ? ['#fff3a8', '#ff7cda', '#7beaff'] : shot.weapon === 'gravity' ? ['#edd8ff', '#b185ed', '#62459e'] : FIRE;
    if (shot.weapon === 'waterHunter' && shot.sharkBite) { this.floaters.push({ x, y: y - 58, text: 'MORDIDA DO TUBARÃO!', age: 0, life: 2, color: '#d9fbff' }); this.spawnImpactEcho(x, y, 'waterHunter', 82, 1500); for (let tooth = 0; tooth < 28; tooth += 1) { const side = tooth % 2 ? -1 : 1; const angle = (tooth / 28 - .5) * 1.7; this.addParticle({ kind: 'spark', x: x + Math.cos(angle) * 24, y: y + side * (8 + Math.abs(angle) * 9), vx: Math.cos(angle) * (80 + tooth % 4 * 25), vy: side * (45 + tooth % 5 * 18), size: tooth % 3 ? 3 : 5, color: tooth % 4 ? '#eaffff' : '#63d7ee', gravity: 45, life: .35 + tooth % 5 * .07, bounce: 0, drag: .92 }); } }
    for (let i = 0; i < count; i += 1) { const angle = Math.random() * Math.PI * 2; const speed = 45 + Math.random() * (shot.weapon === 'heavy' ? 230 : 165); this.addParticle({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 35, size: 2 + i % 4, color: impactColors[i % impactColors.length], gravity: shot.freeze ? 105 : 145, life: .35 + Math.random() * .75, bounce: .18, drag: .98 }); }
    const flashColor = impactColors[0]; for (let ring = 0; ring < 32; ring += 1) { const angle = ring / 32 * Math.PI * 2; this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * radius * (ring % 4 ? 3.5 : 4.5), vy: Math.sin(angle) * radius * (ring % 4 ? 3.5 : 4.5), size: ring % 4 ? 3 : 5, color: ring % 3 ? flashColor : '#ffffff', gravity: 0, life: .22 + ring % 4 * .035, bounce: 0, drag: .86 }); }
    for (let debris = 0; debris < 24; debris += 1) { const spread = (debris / 23 - .5) * radius * 2; this.addParticle({ kind: 'spark', x: x + spread * .22, y: y - 3, vx: spread * 2.1, vy: -45 - Math.random() * 130, size: 3 + debris % 4, color: debris % 3 ? '#a08061' : '#e1bd8a', gravity: 210, life: .48 + Math.random() * .48, bounce: .2, drag: .965 }); }
    if (shot.weapon === 'markerBomb') { this.floaters.push({ x, y: y - 55, text: shot.detonation ? 'MARCA DETONADA • 30 HP' : '3 MARCAS • DETONAÇÃO EM 3s', age: 0, life: 1.8, color: '#ffb66b' }); for (let i = 0; i < 48; i += 1) { const angle = i * Math.PI * 2 / 48; this.addParticle({ kind: 'spark', x, y, vx: Math.cos(angle) * (90 + i % 3 * 35), vy: Math.sin(angle) * (90 + i % 3 * 35), size: 2 + i % 4, color: i % 3 ? '#ffae59' : '#fff3bd', gravity: 35, life: .45 + i % 5 * .07, bounce: 0, drag: .94 }); } }
    if (shot.megaMissile) {
      this.mushroomClouds.push({ x, y, radius, started: performance.now(), duration: 3250 });
      for (let ring = 0; ring < 125; ring += 1) { const angle = ring / 125 * Math.PI * 2; this.addParticle({ x, y, vx: Math.cos(angle) * radius * (2.2 + Math.random() * 1.2), vy: Math.sin(angle) * radius * .65 - 35, size: 4 + ring % 5, color: ring % 3 ? '#ff8e4a' : '#fff5bd', gravity: 70, life: .5 + Math.random() * .55, bounce: 0, drag: .94 }); }
      for (let ember = 0; ember < 115; ember += 1) this.addParticle({ kind: 'spark', x: x + (Math.random() - .5) * 80, y: y - Math.random() * 16, vx: (Math.random() - .5) * 105, vy: -110 - Math.random() * 235, size: 2 + ember % 5, color: ember % 4 ? '#ffae5d' : '#fff3a8', gravity: 45, life: .6 + Math.random() * 1.05, bounce: 0, drag: .975 });
      for (let smoke = 0; smoke < 72; smoke += 1) this.addParticle({ kind: 'smoke', x: x + (Math.random() - .5) * 75, y: y - Math.random() * 10, vx: (Math.random() - .5) * 42, vy: -55 - Math.random() * 115, size: 8 + Math.random() * 12, color: smoke % 4 ? '#5b4546' : '#bd7350', gravity: -6, life: .8 + Math.random() * 1.15, bounce: 0, drag: .98 });
      this.floaters.push({ x, y: y - 225, text: 'IMPACTO ATÔMICO', age: 0, life: 2.5, color: '#fff2a6' });
    }
    if (shot.weapon === 'grenade') for (let i = 0; i < 56; i += 1) { const angle = Math.random() * Math.PI * 2; this.addParticle({ x, y, vx: Math.cos(angle) * (80 + Math.random() * 190), vy: Math.sin(angle) * (80 + Math.random() * 190), size: 2 + i % 4, color: i % 2 ? '#ddff87' : '#6f9b44', gravity: 110, life: .45 + Math.random() * .5, bounce: .1, drag: .96 }); }
    if (shot.weapon === 'moleBomb') for (let i = 0; i < 95; i += 1) { const angle = Math.random() * Math.PI; this.addParticle({ x, y, vx: Math.cos(angle) * (45 + Math.random() * 180), vy: -Math.sin(angle) * (70 + Math.random() * 190), size: 3 + i % 5, color: i % 3 ? '#8b623f' : '#c29a68', gravity: 190, life: .65 + Math.random() * .8, bounce: .25, drag: .975 }); }
    if (icyImpact) for (let i = 0; i < 105; i += 1) { const angle = Math.random() * Math.PI * 2; this.addParticle({ x, y, vx: Math.cos(angle) * (40 + Math.random() * 190), vy: Math.sin(angle) * (40 + Math.random() * 190), size: 2 + i % 5, color: i % 3 ? '#82e7ff' : '#e8fdff', gravity: 85, life: .6 + Math.random() * .8, bounce: .28, drag: .97 }); }
    if (icyImpact && !shot.elementalBurst) this.spawnIceBreathImpact(x, y, shot.weapon === 'elementalIce' ? WEAPON_BALANCE.elementalIce.freezeRadius : radius);
    if (shot.shockwave) for (let i = 0; i < 54; i += 1) { const angle = i / 54 * Math.PI * 2; this.addParticle({ x, y, vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280, size: 3, color: '#55d9ff', gravity: 0, life: .34, bounce: 0, drag: .9 }); }
    if (shot.powerupCollision) { const info = collectibleInfo(shot.powerupCollision); for (let i = 0; i < 75; i += 1) { const angle = Math.random() * Math.PI * 2; this.addParticle({ x, y, vx: Math.cos(angle) * (70 + Math.random() * 210), vy: Math.sin(angle) * (70 + Math.random() * 210), size: 2 + i % 4, color: i % 3 ? info.color : '#ffffff', gravity: 90, life: .45 + Math.random() * .65, bounce: .1, drag: .96 }); } }
    const fireworkEffects = (shot.interactions || []).filter((interaction) => interaction.type === 'firework');
    for (const interaction of fireworkEffects) { const duration = Math.max(320, (interaction.path?.length || 30) / SHOT_PATH_RATE * 1000 / (this.game?.speed || 1)); const started = performance.now() + (interaction.delay || 0) * 1000; this.fireworkAnimations.push({ id: `firework-${interaction.burst}`, fromX: interaction.originX, fromY: interaction.originY, x: interaction.x, toY: interaction.y, path: interaction.path, colorIndex: interaction.colorIndex || 0, started, duration }); this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, started + duration + 220); }
    if (fireworkEffects.length) { this.floaters.push({ x, y: y - 38, text: '12× MICROFOGOS!', age: 0, life: 1.7, color: '#ff69c8' }); shot.interactions = (shot.interactions || []).filter((interaction) => interaction.type !== 'firework'); }
    for (const interaction of shot.interactions || []) if (['kineticBurst', 'cryoBurst'].includes(interaction.type)) { const color = interaction.type === 'kineticBurst' ? '#ffd166' : '#8cecff'; const text = interaction.type === 'kineticBurst' ? 'IMPACTO CINÉTICO!' : 'ÁREA CONGELADA!'; for (let i = 0; i < 78; i += 1) { const angle = i / 78 * Math.PI * 2; this.addParticle({ kind: 'spark', x: interaction.x, y: interaction.y, vx: Math.cos(angle) * (80 + Math.random() * 220), vy: Math.sin(angle) * (55 + Math.random() * 180) - 35, size: 2 + i % 5, color: i % 4 ? color : '#ffffff', gravity: interaction.type === 'cryoBurst' ? 45 : 175, life: .5 + Math.random() * .7, bounce: .15, drag: .955 }); } this.floaters.push({ x: interaction.x, y: interaction.y - 52, text, age: 0, life: 1.8, color }); }
    for (const interaction of shot.interactions || []) if (interaction.type === 'elementalEarth') {
      const ridge = interaction.mode === 'ridge'; const reach = interaction.radius || 145;
      for (let block = 0; block < 120; block += 1) { const offset = (Math.random() - .5) * reach * 2; const shape = Math.max(.15, 1 - Math.abs(offset) / reach); this.addParticle({ x: interaction.x + offset, y: interaction.y, vx: (Math.random() - .5) * 85, vy: (ridge ? -1 : 1) * (50 + Math.random() * 150) * shape, size: 3 + block % 6, color: block % 4 ? '#bc9164' : '#f4d397', gravity: ridge ? 185 : 90, life: .5 + Math.random() * .85, bounce: .25, drag: .96 }); }
      this.spawnImpactEcho(interaction.x, interaction.y, 'earth', reach, 1600); this.shake = Math.max(this.shake, 19);
      this.floaters.push({ x: interaction.x, y: interaction.y - 72, text: ridge ? 'ELEVAÇÃO • IMPACTO DO SOLO' : 'CRATERA • IMPACTO DO SOLO', age: 0, life: 2, color: '#f3ce8e' });
      for (const id of interaction.crushedIds || []) { const target = this.visualPlayers.get(id); if (target) this.spawnImpactEcho(target.renderX, target.renderY + 12, 'earth', 30, 1200); }
    }
    for (const interaction of shot.interactions || []) if (interaction.type === 'kineticBurst') {
      const direction = interaction.direction || 1;
      for (let line = 0; line < 5; line += 1) for (let pulse = 0; pulse < 17; pulse += 1) this.addParticle({ kind: 'spark', x: interaction.x + direction * line * 6, y: interaction.y - 30 + pulse * 4, vx: direction * (240 + line * 70 + Math.random() * 60), vy: (pulse - 8) * 12, size: 2 + line % 3, color: line % 2 ? '#ffe4a0' : '#8da9bf', gravity: 35, life: .35 + line * .12, bounce: 0, drag: .97 });
      this.spawnImpactEcho(interaction.x, interaction.y, 'kinetic', interaction.radius || 76, 1350);
    }
    const meteors = (shot.interactions || []).filter((interaction) => interaction.type === 'meteorImpact');
    for (const [index, meteor] of meteors.entries()) {
      const started = performance.now() + index * 180;
      this.meteorAnimations.push({ x: meteor.x, y: meteor.y, fromY: meteor.fromY, direction: meteor.direction, radius: meteor.radius, started, duration: 1050, impacted: false, damage: index === meteors.length - 1 ? shot.damage : null });
      this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, started + 1050 + 2100);
    }
    for (const interaction of shot.interactions || []) {
      const labels = { mixerFusion: 'FUSÃO!', barrel: 'BARRIL!', switch: 'BOTÃO ATIVADO', ramp: 'RAMPA LIBERADA', bridge: 'PONTE CONSTRUÍDA', graveLoot: `SAQUE: ${interaction.count} POWERUPS`, powerupBurst: 'POWERUP COLETADO', firework: '12× MICROFOGOS!', zeus: 'IRA DE ZEUS!', gravity: 'PULSO GRAVITACIONAL!', molotov: 'ÁREA EM CHAMAS!', treeHit: 'ÁRVORE DANIFICADA', treeFall: 'ÁRVORE DERRUBADA!', supplyCacheHit: 'DEPÓSITO DANIFICADO', supplyCacheOpen: '2 POWERUPS LIBERADOS!', shockCoilHit: 'BOBINA DANIFICADA', shockCoilBurst: 'PULSO ELÉTRICO!', ammoTerminalHit: 'TERMINAL DANIFICADO', ammoTerminalBreak: 'CAIXA DE MUNIÇÃO!', shieldGeneratorHit: 'GERADOR DANIFICADO', shieldGeneratorBurst: 'DOMO EM SOBRECARGA!', repulsorPulse: 'ONDA REPULSORA!', repulsorBurst: 'REPULSOR EM SOBRECARGA!' };
      const colors = { mixerFusion: '#e18cff', barrel: '#ff6b3d', switch: '#b7ec58', ramp: '#68d5ff', bridge: '#7ee6c4', graveLoot: '#f4d35e', powerupBurst: '#ff9f5a', firework: '#ff69c8', zeus: '#9ee8ff', gravity: '#c69cff', molotov: '#ff713d', treeHit: '#9acb63', treeFall: '#d7a665', supplyCacheHit: '#ffd276', supplyCacheOpen: '#ffe28c', shockCoilHit: '#86e9ff', shockCoilBurst: '#64e8ff', ammoTerminalHit: '#ffd86a', ammoTerminalBreak: '#fff0a0', shieldGeneratorHit: '#84dcff', shieldGeneratorBurst: '#78bfff', repulsorPulse: '#d29bff', repulsorBurst: '#ff82df' };
      if (interaction.type === 'mixerFusion') { this.spawnImpactEcho(interaction.x, interaction.y, 'teslaOrb', Math.max(85, interaction.radius), 1800); for (let spark = 0; spark < 72; spark += 1) { const angle = spark * Math.PI * 2 / 72; this.addParticle({ kind: 'spark', x: interaction.x, y: interaction.y, vx: Math.cos(angle) * (95 + spark % 5 * 24), vy: Math.sin(angle) * (95 + spark % 5 * 24), size: 2 + spark % 4, color: spark % 3 ? '#e18cff' : '#78e7ff', gravity: 25, life: .45 + spark % 5 * .08, bounce: 0, drag: .95 }); } }
      if (interaction.type === 'firework') for (let i = 0; i < 18; i += 1) { const a = Math.random() * Math.PI * 2; const palette = ['#ff69c8','#68d5ff','#ffd75e','#8dff79']; this.addParticle({ x: interaction.x, y: interaction.y, vx: Math.cos(a) * (45 + Math.random() * 120), vy: Math.sin(a) * (45 + Math.random() * 120), size: 2 + i % 3, color: palette[(interaction.colorIndex + i) % palette.length], gravity: 95, life: .55, bounce: 0, drag: .96 }); }
      if (interaction.type === 'zeusBolt' || interaction.type === 'zeusBlocked') {
        const started = performance.now();
        this.zeusAnimations.push({ x: interaction.x, y: interaction.y, started, duration: 2000 });
        this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, started + 2000);
        this.shake = Math.max(this.shake, 20);
        for (let spark = 0; spark < 110; spark += 1) { const angle = Math.random() * Math.PI * 2; this.addParticle({ kind: 'spark', x: interaction.x, y: interaction.y, vx: Math.cos(angle) * (50 + Math.random() * 180), vy: Math.sin(angle) * (50 + Math.random() * 150), size: 2 + spark % 4, color: spark % 3 ? '#a5efff' : '#ffffff', gravity: 35, life: .5 + Math.random() * 1.15, bounce: 0, drag: .96 }); }
      }
      if (interaction.type === 'gravity') for (let i = 0; i < 72; i += 1) { const a = i / 72 * Math.PI * 2; this.addParticle({ x: interaction.x + Math.cos(a) * 115, y: interaction.y + Math.sin(a) * 70, vx: -Math.cos(a) * 180, vy: -Math.sin(a) * 110, size: 2 + i % 3, color: i % 2 ? '#c69cff' : '#6d48d7', gravity: 0, life: .65, bounce: 0, drag: .97 }); }
      if (['repulsorPulse', 'repulsorBurst', 'shieldGeneratorBurst'].includes(interaction.type)) { const color = interaction.type === 'shieldGeneratorBurst' ? '#78dfff' : interaction.type === 'repulsorBurst' ? '#ff82df' : '#c89aff'; const count = interaction.type.endsWith('Burst') ? 96 : 64; this.spawnImpactEcho(interaction.x, interaction.y, interaction.type === 'shieldGeneratorBurst' ? 'shield' : 'gravity', interaction.radius); for (let i = 0; i < count; i += 1) { const angle = i / count * Math.PI * 2; const speed = (interaction.radius || 120) * (1.1 + Math.random() * .8); this.addParticle({ kind: 'spark', x: interaction.x, y: interaction.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 2 + i % 4, color: i % 4 ? color : '#ffffff', gravity: 0, life: .45 + Math.random() * .5, bounce: 0, drag: .94 }); } this.shake = Math.max(this.shake, interaction.type.endsWith('Burst') ? 14 : 7); }
      if (!['meteorImpact', 'droneMissile', 'elementalEarth', 'kineticBurst', 'cryoBurst'].includes(interaction.type) && (interaction.type !== 'firework' || interaction.burst === 0)) this.floaters.push({ x: interaction.x, y: interaction.y - 24, text: interaction.type === 'supplyCacheOpen' && !interaction.drops?.length ? 'DEPÓSITO VAZIO' : labels[interaction.type] || interaction.type.toUpperCase(), age: 0, life: interaction.type === 'graveLoot' ? 2 : 1.5, color: colors[interaction.type] || '#68d5ff' });
    }
    for (const interaction of shot.interactions || []) if (interaction.type === 'molotov') for (let i = 0; i < 84; i += 1) { const spread = (Math.random() - .5) * 150; this.addParticle({ x: interaction.x + spread * .18, y: interaction.y - Math.random() * 12, vx: spread, vy: -45 - Math.random() * 145, size: 2 + i % 5, color: FIRE[i % FIRE.length], gravity: 185, life: .55 + Math.random() * .8, bounce: .12, drag: .975 }); }
    for (const interaction of shot.interactions || []) if (['droneMissile','teslaChain','seismicWave','fuelTankBlast','radarPulse'].includes(interaction.type)) { const color = interaction.type === 'teslaChain' || interaction.type === 'radarPulse' ? '#64e8ff' : interaction.type === 'droneMissile' ? '#ffcf58' : '#ff7557'; const count = interaction.type === 'radarPulse' ? 90 : 58; for (let i = 0; i < count; i += 1) { const angle = i / count * Math.PI * 2; this.addParticle({ x: interaction.x, y: interaction.y, vx: Math.cos(angle) * (45 + Math.random() * 155), vy: Math.sin(angle) * (35 + Math.random() * 120) - 40, size: 2 + i % 4, color: i % 4 ? color : '#fff5cf', gravity: interaction.type === 'teslaChain' || interaction.type === 'radarPulse' ? 0 : 170, life: .45 + Math.random() * .7, bounce: .2, drag: .965 }); } }
    for (const interaction of shot.interactions || []) if (interaction.type === 'droneMissile') this.floaters.push({ x: interaction.x, y: interaction.y - 48, text: `ENXAME • MÍSSIL ${(interaction.missile || 0) + 1}/3`, age: 0, life: 1.6, color: '#ffda7c' });
    for (const interaction of shot.interactions || []) if (interaction.type === 'shockCoilBurst' || interaction.type === 'supplyCacheOpen') {
      const electric = interaction.type === 'shockCoilBurst'; const count = electric ? 120 : 76; const radius = interaction.radius || 115;
      for (let i = 0; i < count; i += 1) { const angle = i / count * Math.PI * 2; const speed = electric ? radius * (1.2 + Math.random()) : 70 + Math.random() * 160; this.addParticle({ x: interaction.x, y: interaction.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (electric ? 0 : 80), size: 2 + i % 5, color: electric ? i % 3 ? '#64e8ff' : '#f5ffff' : i % 3 ? '#ffd276' : '#fff4ba', gravity: electric ? 0 : 180, life: electric ? .55 : .9, bounce: .15, drag: .96 }); }
      if (electric) { this.impactFlash = { started: performance.now(), duration: 330, color: '#c8faff', intensity: .22 }; this.shake = Math.max(this.shake, 13); }
      else for (const drop of interaction.drops || []) this.floaters.push({ x: drop.x, y: drop.y - 22, text: collectibleInfo(drop.type).name, age: 0, life: 2, color: collectibleInfo(drop.type).color });
    }
    // The missile descends in drawDelayedStrikes before damage; do not replay its flight after detonation.
    for (const interaction of shot.interactions || []) if (interaction.type === 'teslaChain') { this.structureAnimations.push({ type: 'teslaArc', id: `tesla-${interaction.playerId}`, fromX: interaction.fromX, fromY: interaction.fromY, x: interaction.x, toY: interaction.y, started: performance.now(), duration: 2000 }); this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, performance.now() + 2000); }
    for (const interaction of shot.interactions || []) if (interaction.type === 'teslaField') { const started = performance.now(); this.teslaFields ||= []; this.teslaFields.push({ x: interaction.x, y: interaction.y, radius: interaction.radius, started, duration: 2000 }); this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, started + 2000); }
    for (const interaction of shot.interactions || []) if (['lightningRod', 'lightningRodHit', 'lightningRodBreak'].includes(interaction.type)) { const destroyed = interaction.type === 'lightningRodBreak'; for (let index = 0; index < (destroyed ? 84 : 48); index += 1) { const angle = index / (destroyed ? 84 : 48) * Math.PI * 2; const speed = (destroyed ? 95 : 65) + Math.random() * 125; this.addParticle({ x: interaction.x, y: interaction.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 55, size: 2 + index % 4, color: index % 4 ? '#79eaff' : '#f2ffff', gravity: destroyed ? 155 : 45, life: .5 + Math.random() * .7, bounce: .18, drag: .965 }); } this.floaters.push({ x: interaction.x, y: interaction.y - 44, text: destroyed ? 'HASTE DESTRUÍDA' : interaction.type === 'lightningRod' ? 'HASTE INSTALADA' : `HASTE ${interaction.durability}/3`, age: 0, life: 1.6, color: '#9beeff' }); }
    for (const interaction of shot.interactions || []) if (['buildingHit','buildingCollapse','wreckingBall','concreteFall'].includes(interaction.type)) { const destructive = interaction.type !== 'buildingHit'; const color = interaction.type === 'wreckingBall' ? '#b5c0cc' : interaction.type === 'concreteFall' ? '#9ca6a8' : '#d08a55'; for (let i = 0; i < (destructive ? 125 : 38); i += 1) this.addParticle({ x: interaction.x + (Math.random() - .5) * (interaction.width || 45), y: interaction.y - Math.random() * 25, vx: (Math.random() - .5) * (destructive ? 190 : 75), vy: -25 - Math.random() * (destructive ? 180 : 80), size: 3 + i % 6, color: i % 4 ? color : '#e8edf0', gravity: 210, life: .55 + Math.random() * 1.1, bounce: .28, drag: .975 }); if (interaction.type === 'buildingCollapse') for (const fragment of interaction.fragments || []) { const duration = Math.max(420, fragment.path.length / SHOT_PATH_RATE * 1000); this.structureAnimations.push({ type: 'buildingFragment', id: fragment.id, path: fragment.path, size: fragment.size, started: performance.now(), duration }); this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, performance.now() + duration); } const labels = { buildingHit: `PRÉDIO DANIFICADO • ${interaction.durability ?? 0} RESISTÊNCIA`, buildingCollapse: 'PRÉDIO DESABOU!', wreckingBall: 'BOLA DE DEMOLIÇÃO!', concreteFall: 'CONCRETO EM QUEDA!' }; this.floaters.push({ x: interaction.x, y: interaction.y - 34, text: labels[interaction.type], age: 0, life: 1.7, color }); if (destructive) this.shake = Math.max(this.shake, 22); }
    for (const interaction of shot.interactions || []) if (['watchtowerHit','watchtowerCollapse'].includes(interaction.type)) { const collapsed = interaction.type === 'watchtowerCollapse'; for (let i = 0; i < (collapsed ? 115 : 34); i += 1) this.addParticle({ x: interaction.x + (Math.random() - .5) * (interaction.width || 50), y: interaction.y - Math.random() * 28, vx: (Math.random() - .5) * (collapsed ? 185 : 65), vy: -30 - Math.random() * (collapsed ? 175 : 70), size: 3 + i % 5, color: i % 3 ? '#b6c0c6' : '#d6b16a', gravity: 210, life: .55 + Math.random(), bounce: .25, drag: .975 }); for (const fragment of interaction.fragments || []) { const duration = Math.max(420, fragment.path.length / SHOT_PATH_RATE * 1000); this.structureAnimations.push({ type: 'buildingFragment', id: fragment.id, path: fragment.path, size: fragment.size, started: performance.now(), duration }); this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, performance.now() + duration); } this.floaters.push({ x: interaction.x, y: interaction.y - 34, text: collapsed ? 'TORRE DESABOU!' : `TORRE DANIFICADA • ${interaction.durability ?? 0}`, age: 0, life: 1.7, color: '#d6b16a' }); }
    for (const interaction of shot.interactions || []) if (['treeHit', 'treeFall'].includes(interaction.type)) { const fallen = interaction.type === 'treeFall'; for (let i = 0; i < (fallen ? 105 : 34); i += 1) this.addParticle({ x: interaction.x + (Math.random() - .5) * Math.min(260, interaction.width || 55), y: interaction.y - Math.random() * Math.min(190, interaction.height || 70), vx: (Math.random() - .5) * (fallen ? 150 : 70), vy: -25 - Math.random() * (fallen ? 135 : 65), size: 2 + i % 5, color: i % 4 === 0 ? '#8b603d' : i % 2 ? '#75a653' : '#a9d56a', gravity: 125, life: .55 + Math.random(), bounce: .18, drag: .975 }); if (fallen) this.shake = Math.max(this.shake, interaction.treeSize === 'large' ? 20 : 8); }
    for (const interaction of shot.interactions || []) {
      if (interaction.type === 'craneHit' || interaction.type === 'craneCollapse') {
        const collapsed = interaction.type === 'craneCollapse';
        for (let i = 0; i < (collapsed ? 130 : 42); i += 1) this.addParticle({ x: interaction.x + (Math.random() - .5) * (interaction.width || 55), y: interaction.y - Math.random() * 34, vx: (Math.random() - .5) * (collapsed ? 210 : 85), vy: -35 - Math.random() * (collapsed ? 190 : 85), size: 3 + i % 6, color: i % 3 ? '#d3b85c' : '#e8edf0', gravity: 220, life: .6 + Math.random(), bounce: .3, drag: .975 });
        this.floaters.push({ x: interaction.x, y: interaction.y - 38, text: collapsed ? 'GUINDASTE DERRUBADO!' : 'GUINDASTE DANIFICADO', age: 0, life: 1.7, color: '#e3ba48' });
      }
      if (interaction.type === 'wreckingBall') {
        const duration = Math.min(850, 340 + (interaction.dropHeight || 80) * 2.2);
        this.structureAnimations.push({ type: 'wreckingBall', id: interaction.id, x: interaction.x, fromY: interaction.fromY, toY: interaction.toY, radius: 28, started: performance.now(), duration });
        this.explosionAnimationEndsAt = Math.max(this.explosionAnimationEndsAt, performance.now() + duration);
        this.floaters.push({ x: interaction.x, y: interaction.y - 62, text: `QUEDA ${interaction.dropHeight || 0} • ${interaction.damage || 0} DANO`, age: 0, life: 1.8, color: '#fff0a0' });
      }
    }
    if (shot.teleport) this.spawnTeleport(shot.teleport);
  }

  spawnTeleport(teleport) {
    this.spawnImpactEcho(teleport.fromX, teleport.fromY, 'teleport', 38);
    this.spawnImpactEcho(teleport.toX, teleport.toY, 'teleport', 38);
    const colors = ['#42f5d7', '#b06cff', '#e9fff9'];
    for (const endpoint of [{ x: teleport.fromX, y: teleport.fromY }, { x: teleport.toX, y: teleport.toY }]) for (let i = 0; i < 108; i += 1) { const angle = i / 108 * Math.PI * 2; const ring = 10 + i % 3 * 10; const speed = 55 + Math.random() * 145; this.addParticle({ x: endpoint.x + Math.cos(angle) * ring, y: endpoint.y + Math.sin(angle) * ring, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 24, size: 2 + i % 4, color: colors[i % colors.length], gravity: 25, life: .55 + Math.random() * .8, bounce: 0, drag: .955 }); }
    const dx = teleport.toX - teleport.fromX; const dy = teleport.toY - teleport.fromY; for (let step = 0; step <= 30; step += 1) { const progress = step / 30; this.addParticle({ x: teleport.fromX + dx * progress, y: teleport.fromY + dy * progress, vx: (Math.random() - .5) * 25, vy: -15 - Math.random() * 35, size: 3 + step % 3, color: colors[step % colors.length], gravity: 10, life: .35 + progress * .35, bounce: 0, drag: .95 }); }
    const player = this.visualPlayers.get(teleport.playerId); if (player) { player.renderX = teleport.toX; player.renderY = teleport.toY; player.targetX = teleport.toX; player.targetY = teleport.toY; }
    this.shake = Math.max(this.shake, 8);
  }

  spawnReviveEffect(revive) {
    const now = performance.now(); const duration = revive.durationMs || 3000;
    const player = this.visualPlayers.get(revive.playerId);
    if (player) {
      const fromY = Math.max(24, revive.toY - 135);
      player.renderX = revive.toX; player.renderY = fromY; player.targetX = revive.toX; player.targetY = revive.toY;
      player.reviveAnimation = { started: now, duration, fromY, toX: revive.toX, toY: revive.toY };
    }
    this.tankAnimationEndsAt = Math.max(this.tankAnimationEndsAt, now + duration);
    if (this.cameraMode !== 'fixed') this.actionCamera = { x: revive.toX, y: revive.toY - 65, zoom: clamp(this.userZoom, MIN_ZOOM, 1.1), until: now + duration + 350 };
    for (let i = 0; i < 96; i += 1) { const angle = i / 96 * Math.PI * 2; const radius = 18 + i % 4 * 8; this.addParticle({ kind: 'spark', x: revive.toX + Math.cos(angle) * radius, y: revive.toY - 110 + Math.sin(angle) * radius, vx: Math.cos(angle) * (45 + Math.random() * 75), vy: Math.sin(angle) * (45 + Math.random() * 75) - 35, size: 2 + i % 3, color: i % 3 ? '#f4e878' : '#a6ffd0', gravity: 10, life: .65 + Math.random() * .6, bounce: 0, drag: .95 }); }
    this.floaters.push({ x: revive.toX, y: revive.toY - 155, text: `VIDA EXTRA • ${revive.health} HP`, age: 0, life: 2.5, color: '#fff0a0' });
    this.impactFlash = { started: now, duration: 260, color: '#fff0a0', intensity: .16 };
  }

  spawnSalvageHeal(salvage) {
    for (let i = 0; i < 56; i += 1) { const angle = i / 56 * Math.PI * 2; this.addParticle({ kind: 'spark', x: salvage.x + Math.cos(angle) * (12 + i % 4 * 5), y: salvage.y + Math.sin(angle) * (12 + i % 4 * 5), vx: -Math.cos(angle) * (25 + Math.random() * 70), vy: -Math.sin(angle) * (25 + Math.random() * 70) - 45, size: 2 + i % 3, color: i % 4 ? '#68e8ba' : '#effff4', gravity: -10, life: .45 + Math.random() * .55, bounce: 0, drag: .94 }); }
    this.floaters.push({ x: salvage.x, y: salvage.y - 40, text: `+${salvage.healed} HP • RECICLAGEM`, age: 0, life: 1.75, color: '#8bffd0' });
  }

  spawnPickupEffect(player, type) {
    const info = collectibleInfo(type); const x = player.x; const y = player.y;
    for (let index = 0; index < 72; index += 1) { const angle = index / 72 * Math.PI * 2; const radius = 24 + index % 4 * 6; this.addParticle({ kind: 'spark', x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius, vx: -Math.cos(angle) * (40 + Math.random() * 65), vy: -Math.sin(angle) * (40 + Math.random() * 65) - 24, size: 2 + index % 3, color: index % 4 ? info.color : '#ffffff', gravity: 18, life: .55 + Math.random() * .45, bounce: 0, drag: .95 }); }
    this.floaters.push({ x, y: y - 38, text: `${info.short} +1`, age: 0, life: 1.45, color: info.color });
  }

  addParticle(p) { if (this.particles.length >= MAX_PARTICLES) this.particles.splice(0, 1); this.particles.push({ age: 0, settled: false, ...p }); }
  updateParticles(dt) {
    this.shake = Math.max(0, this.shake - dt * 38);
    const supports = this.visualPlatforms.filter((platform) => platform.active).map((platform) => ({ x: this.platformX(platform), right: this.platformX(platform) + platform.width, y: platform.y }));
    for (const p of this.particles) {
      p.age += dt; if (p.settled) continue;
      const previousBottom = p.y + p.size;
      if (p.kind === 'leaf') { const wind = clamp(this.game?.wind || 0, -30, 30); const flutter = Math.sin(p.age * (7 + p.flutter * 2) + p.phase); const wet = ['rain', 'snow'].includes(this.game?.weather?.kind); p.vx += (wind * (wet ? 3.8 : 5.2) - p.vx) * Math.min(1, dt * (wet ? 1.15 : .85)); p.vx += flutter * p.flutter * (wet ? 9 : 15) * dt; p.vy += flutter * (wet ? 12 : 23) * dt; p.rotation = (p.rotation || 0) + p.spin * dt; if (wet) p.vy += 18 * dt; for (const vortex of this.game?.windVortices || []) if (p.x >= vortex.x - vortex.width / 2 && p.x <= vortex.x + vortex.width / 2 && p.y >= vortex.y - vortex.height && p.y <= vortex.y + 45) { p.vy -= 260 * dt; p.vx += Math.sign(vortex.x - p.x || 1) * 75 * dt; p.spin += 2.4 * dt; } }
      p.vx *= p.drag; p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'smoke' || p.vy <= 0) continue;
      const ix = Math.round(clamp(p.x, 0, WORLD.width - 1));
      let support = this.terrainHeights?.[ix] ?? WORLD.height + 100;
      for (const platform of supports) if (p.x >= platform.x && p.x <= platform.right && previousBottom <= platform.y + 2 && p.y + p.size >= platform.y) support = Math.min(support, platform.y);
      if (p.kind === 'leaf') for (const lake of this.game?.waterZones || []) { const surface = waterSurfaceAt(lake, this.worldNow(), p.x); if (Number.isFinite(surface) && previousBottom <= surface + 2 && p.y + p.size >= surface) { support = Math.min(support, surface); p.bounce = 0; p.vx *= .35; p.waterLanded = true; } }
      if (p.y + p.size >= support) { p.y = support - p.size; p.vy = -p.vy * p.bounce; p.vx *= .62; if (Math.abs(p.vy) < 18) p.settled = true; }
    }
    for (const f of this.floaters) { f.age += dt; f.y -= dt * 22; } this.particles = this.particles.filter((p) => p.age < p.life); this.floaters = this.floaters.filter((f) => f.age < f.life);
  }
  drawParticles(c) { for (const p of this.particles) { const progress = p.age / p.life; c.globalAlpha = Math.max(0, 1 - progress) * (p.kind === 'smoke' ? .62 : 1); c.fillStyle = p.color; c.save(); c.translate(Math.round(p.x), Math.round(p.y)); if (p.kind === 'smoke') { const radius = p.size * (.55 + progress * .9); c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill(); } else if (p.kind === 'leaf') { c.rotate((p.rotation || 0) + Math.sin(p.age * 9 + p.phase) * .55); const fold = Math.max(1, Math.abs(Math.cos(p.age * 8 + p.phase)) * (p.height || 3)); c.fillRect(-(p.width || p.size) / 2, -fold / 2, p.width || p.size, fold); c.fillStyle = '#d9e98a88'; c.fillRect(0, -fold / 2, 1, fold); } else { c.rotate((p.x + p.age * 80) % (Math.PI / 2)); c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); } c.restore(); } for (const f of this.floaters) { c.globalAlpha = 1 - f.age / f.life; c.font = 'bold 16px monospace'; c.textAlign = 'center'; c.fillStyle = f.color || '#ff765f'; c.fillText(f.text, f.x, f.y); } c.globalAlpha = 1; }

  drawPowerup(c, item, time) { const info = collectibleInfo(item.type); const y = item.y + Math.round(Math.sin(time / 260 + item.x) * 2); if (item.type === 'lootbox') { const pulse = .72 + Math.sin(time / 120) * .22; c.globalAlpha = pulse * .22; c.fillStyle = info.color; c.beginPath(); c.arc(item.x, y, 31 + Math.sin(time / 170) * 4, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; c.fillStyle = '#8b6419'; c.fillRect(item.x - 16, y - 14, 32, 27); c.fillStyle = info.color; c.fillRect(item.x - 14, y - 12, 28, 9); c.fillRect(item.x - 3, y - 12, 6, 25); c.fillStyle = '#fff2a3'; c.fillRect(item.x - 9, y - 9, 18, 4); c.fillStyle = '#070c13dd'; c.fillRect(item.x - 31, y - 29, 62, 10); c.fillStyle = info.color; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('LOOTBOX • 3 ITENS', item.x, y - 21); return; } const s = 3; for (let gy = -2; gy <= 2; gy += 1) for (let gx = -2; gx <= 2; gx += 1) { const edge = Math.abs(gx) === 2 || Math.abs(gy) === 2; const mark = gx === 0 || gy === 0; c.fillStyle = edge ? this.shade(info.color, -.3) : mark ? '#f3f6ef' : info.color; c.fillRect(item.x + gx * s, y + gy * s, s - .4, s - .4); } c.fillStyle = '#070c13cc'; c.fillRect(item.x - 24, y - 27, 48, 10); c.fillStyle = info.color; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText(info.short, item.x, y - 19); const active = this.visualPlayers.get(this.game.players[this.game.turnIndex]?.id); if (active && Math.abs(active.renderX - item.x) < 150) { c.fillStyle = '#e8eef5'; c.font = 'bold 8px monospace'; c.fillText(`${info.name} • COLETE`, item.x, y - 34); } }
  drawBuriedSignal(c, item, time) { const surface = this.terrainHeights[Math.round(clamp(item.x, 0, WORLD.width - 1))]; const pulse = Math.floor(time / 220 + item.x) % 3; c.fillStyle = pulse === 0 ? '#8ce8e0' : '#405c63'; c.fillRect(item.x - 4, surface - 2, 3, 2); c.fillRect(item.x + 2, surface - 1, 2, 2); const active = this.visualPlayers.get(this.game.players[this.game.turnIndex]?.id); if (active && Math.abs(active.renderX - item.x) < 135) { c.fillStyle = '#a7c5c8'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('SINAL ENTERRADO', item.x, surface - 10); } }
  spawnPowerupReveal(item) { const info = collectibleInfo(item.type); for (let i = 0; i < 64; i += 1) { const angle = Math.random() * Math.PI * 2; this.addParticle({ x: item.x, y: item.y, vx: Math.cos(angle) * (25 + Math.random() * 125), vy: -35 - Math.random() * 145, size: 2 + i % 4, color: i % 3 ? info.color : '#f5ffe7', gravity: 90, life: .7 + Math.random() * .9, bounce: .15, drag: .97 }); } this.floaters.push({ x: item.x, y: item.y - 25, text: `${info.short} DESBLOQUEADO`, age: 0, life: 1.6, color: info.color }); }
  drawMine(c, mine, time = performance.now()) {
    if (mine.aquatic) {
      const armed = Boolean(mine.armed); const bob = armed ? Math.sin(time / 260 + mine.x * .03) * 2 : 0;
      c.save(); c.translate(mine.x, mine.y + bob);
      if (!armed && (Math.abs(mine.vx || 0) > 3 || Math.abs(mine.vy || 0) > 3)) c.rotate(Math.sin(time / 180 + mine.x * .03) * .15);
      if (armed) {
        const pulse = .55 + Math.sin(time / 125) * .3;
        c.globalAlpha = pulse; c.strokeStyle = '#ff6559'; c.lineWidth = 2;
        for (let ring = 0; ring < 2; ring += 1) { c.beginPath(); c.ellipse(0, 3, 27 + ring * 9 + pulse * 5, 11 + ring * 4 + pulse * 3, 0, 0, Math.PI * 2); c.stroke(); }
        c.globalAlpha = 1; c.fillStyle = '#95edff'; c.fillRect(-24, 11, 48, 3); c.fillStyle = '#d7ffff'; c.fillRect(-20, 14, 13, 2); c.fillRect(9, 14, 12, 2);
      }
      c.fillStyle = '#071b2c'; c.fillRect(-20, -16, 40, 32);
      c.fillStyle = armed ? '#236c87' : '#59646a'; c.fillRect(-17, -13, 34, 26);
      c.fillStyle = armed ? '#2da5bf' : '#879196'; c.fillRect(-13, -10, 26, 18);
      c.fillStyle = armed ? '#122b43' : '#3e4a50'; c.fillRect(-9, -7, 18, 12);
      for (const [x, y] of [[-22,-3],[19,-3],[0,-19],[0,15]]) { c.fillStyle = armed ? '#b4f7ff' : '#d8dbcc'; c.fillRect(x, y, 5, 6); }
      c.fillStyle = armed ? Math.floor(time / 135) % 2 ? '#ff443e' : '#fff2ad' : '#ffd06a'; c.fillRect(-4, -4, 8, 8);
      if (!armed) { c.fillStyle = '#232e33'; c.fillRect(-9, -16, 18, 4); c.fillStyle = '#ffdb7a'; c.fillRect(-3, -15, 6, 3); c.fillStyle = '#f6e8b2'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('INATIVA', 0, -25); }
      else { c.fillStyle = '#ff715f'; c.fillRect(-13, -9, 4, 3); c.fillRect(9, -9, 4, 3); c.fillStyle = '#ffb994'; c.font = 'bold 7px monospace'; c.textAlign = 'center'; c.fillText('ATIVA', 0, -27); for (let bubble = 0; bubble < 5; bubble += 1) { c.fillStyle = bubble % 2 ? '#d9ffff' : '#85ddec'; c.fillRect(-17 + bubble * 9, -21 - (time / (18 + bubble * 3) % 13), 3, 3); } }
      c.restore(); return;
    }
    const s = 3; const pattern = [[-2,0],[-1,-1],[-1,0],[0,-2],[0,-1],[0,0],[1,-1],[1,0],[2,0]];
    for (const [x,y] of pattern) { c.fillStyle = y === -2 ? '#ff7655' : '#161d28'; c.fillRect(mine.x + x * s, mine.y + y * s, s - .3, s - .3); }
  }
  effectVisible(x, y, radius) {
    const margin = Math.max(0, radius) + 24 / this.camera.zoom;
    return x + margin >= this.camera.x && x - margin <= this.camera.x + VIEW.width / this.camera.zoom
      && y + margin >= this.camera.y && y - margin <= this.camera.y + VIEW.height / this.camera.zoom;
  }
  drawClassPulses(c, time) {
    this.classPulses = this.classPulses.filter((pulse) => time - pulse.started < pulse.duration);
    for (const pulse of this.classPulses) {
      if (!this.effectVisible(pulse.x, pulse.y, pulse.radius)) continue;
      const progress = clamp((time - pulse.started) / pulse.duration, 0, 1);
      const radius = pulse.radius * (1 - (1 - progress) ** 2);
      const color = pulse.type === 'armored' ? '#8edfff' : pulse.type === 'specialist' ? '#72c9ff' : pulse.type === 'amphibian' ? '#67deff' : pulse.type === 'fireFoam' ? '#93ecff' : pulse.type === 'fieldRepair' ? '#61e3d5' : '#6cffb2';
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - progress) * .7; c.strokeStyle = color; c.lineWidth = 5; c.beginPath(); c.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2; c.globalAlpha *= .55; c.beginPath(); c.arc(pulse.x, pulse.y, Math.max(5, radius - 22), 0, Math.PI * 2); c.stroke();
      for (let index = 0; index < 24; index += 1) { const angle = index / 24 * Math.PI * 2 + time / 700; const r = radius * (.65 + (index % 4) * .1); c.fillStyle = index % 3 ? color : '#ffffff'; c.fillRect(pulse.x + Math.cos(angle) * r, pulse.y + Math.sin(angle) * r, 4, 4); }
      c.restore();
    }
  }
  drawSpecialistControl(c, time) {
    const player = this.game?.players.find((entry) => entry.id === this.playerId);
    if (!this.specialistSelection || player?.classType !== 'specialist' || this.game.players[this.game.turnIndex]?.id !== player.id) return;
    const object = this.visualObjects.find((entry) => entry.id === this.specialistSelection && entry.active);
    if (!object) return;
    const target = this.specialistTarget || { x: object.x, y: object.y };
    const inRange = Math.hypot(target.x - player.x, target.y - player.y) <= CLASS_BALANCE.specialistControlRadius;
    const color = inRange ? '#82dbff' : '#ff755d'; const alpha = .5 + Math.sin(time / 160) * .12;
    c.save(); c.strokeStyle = color; c.globalAlpha = alpha; c.lineWidth = 2; c.setLineDash([9, 8]); c.beginPath(); c.arc(player.x, player.y, CLASS_BALANCE.specialistControlRadius, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.arc(object.x, object.y, 34, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(object.x, object.y); c.lineTo(target.x, target.y); c.stroke(); c.setLineDash([]);
    c.globalAlpha = .28; c.fillStyle = color; c.fillRect(target.x - 22, target.y - 14, 44, 28); c.globalAlpha = 1; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillStyle = color; c.fillText(inRange ? 'TOQUE PARA MOVER' : 'FORA DO ALCANCE', target.x, target.y - 30); c.restore();
  }
  drawNinjaFatalPreview(c, time) {
    const ninja = this.game?.players.find((player) => player.id === this.playerId);
    if (ninja?.classType !== 'ninja' || !ninja.alive || this.game.phase !== 'playing' || this.game.players[this.game.turnIndex]?.id !== ninja.id || !this.game.actions?.attackAvailable || ninja.teslaDisabledTurns > 0 || this.game.openingRestrictionsActive && this.game.roundNumber === 1) return;
    const path = this.ninjaFatalPoint ? ninjaFatalPath(this.game, ninja, null, this.ninjaFatalPoint) : ninjaFatalPath(this.game, ninja);
    const scale = 1 / Math.max(.4, this.camera.zoom);
    c.save(); c.globalAlpha = .5 + Math.sin(time / 180) * .12; c.strokeStyle = '#c19aff'; c.lineWidth = 2 * scale; c.setLineDash([8 * scale, 7 * scale]); c.beginPath(); c.arc(ninja.x, ninja.y, CLASS_BALANCE.ninjaFatalRadius, 0, Math.PI * 2); c.stroke();
    if (path) { c.globalAlpha = .9; c.lineWidth = 4 * scale; c.beginPath(); c.moveTo(ninja.x, ninja.y); c.lineTo(path.toX, path.toY); c.stroke(); c.setLineDash([]); for (const target of path.hits) { c.beginPath(); c.arc(target.x, target.y, 25 * scale, 0, Math.PI * 2); c.stroke(); } c.fillStyle = '#f7e9ff'; c.font = `bold ${10 * scale}px monospace`; c.textAlign = 'center'; c.fillText(`CORTE ${this.game.ninjaFatalStage?.activation ? '2/2' : '1/2'} • ${Math.round(path.length)} B • ${path.hits.length} ALVO${path.hits.length === 1 ? '' : 'S'}`, (ninja.x + path.toX) / 2, (ninja.y + path.toY) / 2 - 18 * scale); }
    c.restore();
  }
  drawFireZone(c, zone, time) {
    if (zone.ignitesAt && this.worldNow() < zone.ignitesAt) return;
    if (zone.source === 'superheat') {
      c.save();
      c.globalAlpha = .09 + Math.sin(time / 210) * .025;
      c.fillStyle = '#ff682b'; c.beginPath(); c.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .46 + Math.sin(time / 160) * .13; c.strokeStyle = '#ff793e'; c.lineWidth = 3;
      c.setLineDash([13, 9]); c.beginPath(); c.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      for (let index = 0; index < 36; index += 1) {
        const angle = index / 36 * Math.PI * 2 + time / 1900;
        const distance = zone.radius * (.25 + (index % 5) * .16);
        c.globalAlpha = .28 + (index % 3) * .1; c.fillStyle = index % 3 ? '#ff9445' : '#ffe69a';
        c.fillRect(zone.x + Math.cos(angle) * distance, zone.y + Math.sin(angle) * distance - (time / 17 + index * 13) % 24, 3 + index % 2, 3 + index % 2);
      }
      c.globalAlpha = 1; c.fillStyle = '#ffd08c'; c.font = 'bold 12px monospace'; c.textAlign = 'center';
      if (this.worldDetailVisible(zone.x, zone.y)) c.fillText(`CALOR • 25 HP/ROD • ${zone.turnsLeft}`, zone.x, zone.y - zone.radius - 14);
      c.restore(); return;
    }
    c.save(); const flicker = Math.floor(time / 95);
    if (zone.flames?.length) { c.globalAlpha = .19 + Math.sin(time / 180) * .04; c.fillStyle = '#e63224'; for (const flame of zone.flames) { c.beginPath(); c.ellipse(flame.x, flame.y - 5, 12, 7, 0, 0, Math.PI * 2); c.fill(); } }
    else { c.globalAlpha = .22 + Math.sin(time / 180) * .05; c.fillStyle = '#e63224'; c.beginPath(); c.ellipse(zone.x, zone.y - 13, zone.radius, 30 + Math.sin(time / 220) * 4, 0, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    const flames = zone.flames?.length ? zone.flames : Array.from({ length: Math.floor(zone.radius * 2 / 8) + 1 }, (_, index) => ({ x: zone.x - zone.radius + index * 8 }));
    for (const flame of flames) {
      const offset = flame.x - zone.x;
      const worldX = Math.round(clamp(flame.x, 0, WORLD.width - 1)); const platform = flame.y == null && zone.platformId ? this.game.terrain.floatingPlatforms?.find((entry) => entry.id === zone.platformId && entry.active && worldX >= this.platformX(entry) && worldX <= this.platformX(entry) + entry.width) : null; const ground = flame.y ?? (zone.falling ? zone.y : platform?.y ?? Math.min(this.terrainHeights[worldX], zone.y + 8)); const edge = Math.max(.15, 1 - Math.abs(offset) / Math.max(1, zone.radius));
      c.fillStyle = offset % 16 ? '#39120e' : '#5b2116'; c.fillRect(worldX - 5, ground - 3, 11, 4);
      if ((Math.abs(offset / 8) + flicker) % 3 === 0) continue;
      const height = 5 + edge * 14 + Math.abs(Math.sin(time / 115 + offset * .19)) * 9;
      const lean = Math.sin(time / 130 + offset * .21) * 5 + (this.game.wind || 0) * .045; const gradient = c.createLinearGradient(worldX, ground, worldX + lean, ground - height); gradient.addColorStop(0, '#b92d20cc'); gradient.addColorStop(.45, (Math.round(offset / 8) + flicker) % 2 ? '#ff5b2ddd' : '#ff9a32dd'); gradient.addColorStop(1, '#ffeaa8aa'); c.fillStyle = gradient; c.beginPath(); c.moveTo(worldX - 5, ground); c.quadraticCurveTo(worldX - 7 + lean * .25, ground - height * .45, worldX + lean, ground - height); c.quadraticCurveTo(worldX + 7 + lean * .25, ground - height * .42, worldX + 5, ground); c.closePath(); c.fill();
      if ((flicker + offset) % 4 === 0) { c.globalAlpha = .65; c.fillStyle = '#ffb13b'; c.fillRect(worldX + (offset % 5), ground - height - 7, 3, 3); c.globalAlpha = 1; }
      if ((Math.round(offset / 8) + flicker) % 5 === 0) { const rise = (time / 18 + offset * 7) % 42; c.globalAlpha = .28; c.fillStyle = '#4f3b3b'; c.fillRect(worldX - 5 + Math.sin(time / 400 + offset) * 6, ground - height - rise, 8 + edge * 4, 7 + edge * 3); c.globalAlpha = 1; }
    }
    for (const flame of (zone.flames || []).filter((entry) => entry.falling).slice(0, 18)) for (let ember = 0; ember < 3; ember += 1) { const trail = (time / 8 + ember * 17 + flame.x) % 55; c.fillStyle = ember % 2 ? '#ff9640' : '#fff1a7'; c.fillRect(flame.x + Math.sin(time / 180 + ember) * 4, flame.y - 8 - trail, 3 + ember % 2, 3); }
    const owner = this.game.players.find((player) => player.id === zone.ownerId); const damage = 25 + (zone.incendiary && owner?.classType === 'incendiary' && !owner.teslaDisabledTurns ? CLASS_BALANCE.incendiaryFireBonus : 0);
    if (this.worldDetailVisible(zone.x, zone.y)) { c.fillStyle = zone.incendiary ? '#fff2a7' : '#ffd690'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(`INCÊNDIO • ${damage} HP/ROD • ${zone.turnsLeft}`, zone.x, zone.y - 39); } c.restore();
  }
  drawHeatPulses(c, time) {
    this.heatPulses = this.heatPulses.filter((pulse) => time - pulse.started < pulse.duration);
    for (const pulse of this.heatPulses) {
      if (!this.effectVisible(pulse.x, pulse.y, pulse.radius)) continue;
      const progress = clamp((time - pulse.started) / pulse.duration, 0, 1);
      const radius = pulse.radius * (1 - (1 - progress) ** 2);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - progress) * .8;
      c.strokeStyle = '#ff733d'; c.lineWidth = 13 * (1 - progress) + 3;
      c.beginPath(); c.arc(pulse.x, pulse.y, radius, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#ffe29b'; c.lineWidth = 2; c.beginPath(); c.arc(pulse.x, pulse.y, Math.max(5, radius - 15), 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0;
      for (let index = 0; index < 60; index += 1) {
        const angle = index / 60 * Math.PI * 2 + Math.sin(index * 7) * .045;
        const distance = radius * (.75 + (index % 5) * .055);
        c.fillStyle = index % 4 ? '#ff8e43' : '#fff0af';
        c.fillRect(pulse.x + Math.cos(angle) * distance, pulse.y + Math.sin(angle) * distance, 3 + index % 3, 3 + index % 3);
      }
      c.restore();
    }
  }
  drawSaboteurPulses(c, time) {
    this.saboteurPulses = this.saboteurPulses.filter((pulse) => time - pulse.started < pulse.duration);
    for (const pulse of this.saboteurPulses) {
      if (!this.effectVisible(pulse.x, pulse.y, pulse.radius)) continue;
      const progress = clamp((time - pulse.started) / pulse.duration, 0, 1);
      const expansion = 1 - (1 - Math.min(1, progress * 1.45)) ** 3;
      const radius = pulse.radius * expansion;
      const fade = Math.min(1, progress * 8) * (1 - progress) ** .55;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = fade;
      c.strokeStyle = '#ccff64';
      for (let ring = 0; ring < 3; ring += 1) {
        c.globalAlpha = fade * (1 - ring * .25); c.lineWidth = (ring ? 2 : 5) / Math.max(.45, this.camera.zoom);
        c.beginPath(); c.arc(pulse.x, pulse.y, Math.max(3, radius - ring * 28), 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = fade * .9; c.strokeStyle = '#edff9c';
      for (let ring = 0; ring < 3; ring += 1) {
        const coreRadius = (34 + ring * 34 + 8 * Math.sin(time / 95 - ring)) / Math.max(.6, this.camera.zoom);
        c.lineWidth = (ring === 0 ? 5 : 2.5) / Math.max(.55, this.camera.zoom);
        const start = time / (ring % 2 ? -420 : 420) + ring * 2;
        c.beginPath(); c.arc(pulse.x, pulse.y, coreRadius, start, start + Math.PI * (ring === 0 ? 1.7 : 1.3)); c.stroke();
      }
      c.globalAlpha = fade * .75; c.fillStyle = '#d7ff75';
      for (let index = 0; index < 32; index += 1) {
        const angle = index / 32 * Math.PI * 2 + time / 480;
        const orbit = 95 / Math.max(.6, this.camera.zoom) + (index % 3) * 10;
        c.fillRect(pulse.x + Math.cos(angle) * orbit, pulse.y + Math.sin(angle) * orbit, 4, 4);
      }
      c.globalAlpha = fade; c.textAlign = 'center'; c.font = `bold ${Math.round(11 / Math.max(.6, this.camera.zoom))}px monospace`;
      c.fillText('PULSO MAGNÉTICO', pulse.x, pulse.y - 124 / Math.max(.6, this.camera.zoom));
      c.shadowBlur = 0; c.globalAlpha = fade;
      for (let index = 0; index < 72; index += 1) {
        const angle = index / 72 * Math.PI * 2 + progress * .18;
        const distance = radius - (index % 3) * 12;
        const size = (index % 6 === 0 ? 7 : 3) / Math.max(.55, this.camera.zoom);
        c.fillStyle = index % 4 ? '#beff54' : '#f4ffc0';
        c.fillRect(Math.round(pulse.x + Math.cos(angle) * distance), Math.round(pulse.y + Math.sin(angle) * distance), size, size);
      }
      for (const targetId of pulse.targetIds || []) {
        const target = this.visualPlayers.get(targetId); if (!target || target.hidden) continue;
        const distance = Math.hypot(target.renderX - pulse.x, target.renderY - pulse.y);
        if (radius + 45 < distance) continue;
        const beamFade = Math.min(1, (radius + 45 - distance) / 85) * fade;
        c.globalAlpha = beamFade; c.strokeStyle = '#f0ff8e'; c.lineWidth = 2 / Math.max(.5, this.camera.zoom);
        c.beginPath(); c.moveTo(pulse.x, pulse.y);
        for (let step = 1; step < 8; step += 1) { const fraction = step / 8; const jitter = (step % 2 ? 1 : -1) * (8 + 5 * Math.sin(time / 48 + step)); c.lineTo(pulse.x + (target.renderX - pulse.x) * fraction + jitter, pulse.y + (target.renderY - pulse.y) * fraction - jitter); }
        c.lineTo(target.renderX, target.renderY); c.stroke();
        c.fillStyle = '#dbff6e'; c.fillRect(target.renderX - 13, target.renderY - 22, 26, 4); c.fillRect(target.renderX - 2, target.renderY - 34, 4, 27);
      }
      c.globalAlpha = fade; c.strokeStyle = '#f0ffb3'; c.lineWidth = 3 / Math.max(.5, this.camera.zoom);
      for (let side = 0; side < 4; side += 1) {
        const angle = side * Math.PI / 2 + progress * .3;
        const inner = Math.min(30, radius * .3); const outer = inner + 24;
        c.beginPath(); c.moveTo(pulse.x + Math.cos(angle) * inner, pulse.y + Math.sin(angle) * inner); c.lineTo(pulse.x + Math.cos(angle) * outer, pulse.y + Math.sin(angle) * outer); c.stroke();
      }
      c.restore();
    }
  }

  drawTeslaAndMagnetEffects(c, time) {
    this.teslaFields = (this.teslaFields || []).filter((field) => time - field.started < field.duration);
    for (const field of this.teslaFields) { const progress = clamp((time - field.started) / field.duration, 0, 1); const pulse = .5 + .5 * Math.sin(time / 80); c.save(); c.globalAlpha = (1 - progress) * (.24 + .18 * pulse); c.strokeStyle = '#7feaff'; c.lineWidth = 5; c.shadowColor = '#76e9ff'; c.shadowBlur = 18; c.setLineDash([16, 13]); c.beginPath(); c.arc(field.x, field.y, field.radius * Math.min(1, progress * 3), 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.globalAlpha = (1 - progress) * .38; c.fillStyle = '#74e6ff'; for (let index = 0; index < 28; index += 1) { const angle = index / 28 * Math.PI * 2 + time / 600; const radius = field.radius * (.3 + (index % 5) / 7); c.fillRect(field.x + Math.cos(angle) * radius, field.y + Math.sin(angle) * radius, 4, 4); } c.restore(); }
    this.rodArcs = this.rodArcs.filter((arc) => time - arc.started < arc.duration);
    for (const arc of this.rodArcs) { const progress = (time - arc.started) / arc.duration; const intensity = Math.max(.12, (1 - progress) * (.55 + .45 * Math.sin(time / 35) ** 2)); c.save(); c.globalAlpha = intensity; c.strokeStyle = '#c6faff'; c.shadowColor = '#65e9ff'; c.shadowBlur = 17; c.lineWidth = 2 + intensity * 3; c.beginPath(); c.moveTo(arc.fromX, arc.fromY); for (let step = 1; step < 8; step += 1) { const f = step / 8; c.lineTo(arc.fromX + (arc.toX - arc.fromX) * f + (step % 2 ? 10 : -10) * Math.sin(time / 45 + step), arc.fromY + (arc.toY - arc.fromY) * f); } c.lineTo(arc.toX, arc.toY); c.stroke(); c.restore(); if (progress < .28) { c.fillStyle = '#dffcff'; c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.fillText(`-${arc.amount}`, arc.toX, arc.toY - 31 - progress * 50); } }
    this.pickupMagnets = this.pickupMagnets.filter((effect) => time - effect.started < effect.duration);
    for (const effect of this.pickupMagnets) { const progress = clamp((time - effect.started) / effect.duration, 0, 1); const eased = 1 - (1 - progress) ** 3; c.save(); c.globalAlpha = 1 - progress * .55; c.strokeStyle = '#e0bc72'; c.lineWidth = 2; c.setLineDash([4, 9]); c.beginPath(); c.moveTo(effect.fromX, effect.fromY); c.quadraticCurveTo((effect.fromX + effect.toX) / 2, Math.min(effect.fromY, effect.toY) - 65, effect.toX, effect.toY); c.stroke(); c.setLineDash([]); for (let index = 0; index < 7; index += 1) { const f = clamp(eased - index * .045, 0, 1); const x = effect.fromX + (effect.toX - effect.fromX) * f; const y = effect.fromY + (effect.toY - effect.fromY) * f - Math.sin(f * Math.PI) * 65; c.fillStyle = index % 2 ? '#fff5c5' : '#e0bc72'; c.fillRect(x - 2, y - 2, 4, 4); } c.restore(); }
  }
  drawTree(c, object, time, coverOnly = false) {
    if (!object.active) return;
    const swayStrength = object.treeSize === 'large' ? .012 : object.treeSize === 'medium' ? .026 : .045;
    const windLean = clamp((this.game?.wind || 0) / 30, -1, 1) * swayStrength;
    const sway = Math.sin(time / (object.treeSize === 'large' ? 930 : 660) + (object.foliageSeed || 0) * .03) * swayStrength * .5;
    c.save(); c.translate(object.x, object.groundY); c.rotate(windLean + sway); c.translate(-object.x, -object.groundY);
    const size = object.treeSize || object.type.replace('tree', '').toLowerCase(); const top = object.groundY - object.height; const seed = object.foliageSeed || 1;
    const burning = object.burningUntilRound >= this.game.roundNumber; const healthRatio = (object.durability ?? 1) / Math.max(1, object.maxDurability ?? object.durability ?? 1); const damaged = healthRatio < .999; const snowy = this.game?.terrain?.type === 'hills'; const wind = clamp(this.game?.wind || 0, -30, 30); const shed = this.leafShed.get(object.id); const shedAmount = shed ? shed.amount * clamp((shed.until - time) / 1800, 0, 1) : 0;
    const canopyY = size === 'large' ? top + object.height * .23 : size === 'medium' ? top + object.height * .27 : top + object.height * .38;
    const canopyW = size === 'large' ? object.crownWidth || 520 : size === 'medium' ? object.width * 1.45 : (object.canopyRadius || 30) * 2;
    const canopyH = size === 'large' ? object.height * .42 : size === 'medium' ? object.height * .42 : object.height * .72;
    if (!coverOnly) {
      c.save();
      if (size === 'large') {
        c.fillStyle = damaged ? '#684631' : '#765039'; c.fillRect(object.x - object.width / 2, top + 26, object.width, object.height - 26);
        c.fillStyle = '#4b3528'; c.fillRect(object.x - object.width * .18, top + 42, object.width * .2, object.height - 45);
        if (damaged) { c.strokeStyle = '#2e241f'; c.lineWidth = 4; c.beginPath(); c.moveTo(object.x + 5, top + object.height * .32); c.lineTo(object.x - 12, top + object.height * .43); c.lineTo(object.x + 9, top + object.height * .55); c.stroke(); }
        c.fillStyle = '#946746'; for (let knot = 0; knot < 9; knot += 1) c.fillRect(object.x - object.width * .38 + (knot % 3) * object.width * .28, top + 62 + knot * 31, 8 + knot % 2 * 5, 6);
        for (const [branchIndex, row] of (object.branchRows || []).entries()) { const gust = Math.sin(time / 780 + seed + branchIndex) * (2 + Math.abs(wind) * .035); const bend = wind * (row.key === 'main' ? .08 : .16); const sway = (gust + bend) * (damaged ? 1.7 : 1); c.strokeStyle = damaged ? '#64432f' : '#80583b'; c.lineWidth = row.key === 'main' ? 22 : 15; c.beginPath(); c.moveTo(object.x, row.y + 7); c.quadraticCurveTo((object.x + row.left + row.width / 2) / 2 + bend * .45, row.y + sway * 1.8, row.left + (row.key.includes('left') ? 0 : row.width) + sway, row.y + 6 + Math.abs(gust) * .35); c.stroke(); }
        c.fillStyle = '#4b3024'; c.fillRect(object.x - object.width * .7, object.groundY - 16, object.width * 1.4, 16);
      } else {
        const trunkWidth = size === 'medium' ? Math.max(13, object.width * .3) : Math.max(7, object.width * .22);
        c.fillStyle = damaged ? '#6b4935' : '#825b3c'; c.fillRect(object.x - trunkWidth / 2, canopyY, trunkWidth, object.groundY - canopyY);
        c.fillStyle = '#523829'; c.fillRect(object.x - trunkWidth * .08, canopyY + 7, trunkWidth * .22, object.groundY - canopyY - 8);
        if (damaged) { c.fillStyle = '#3a2724'; c.fillRect(object.x + trunkWidth * .14, canopyY + object.height * .39, Math.max(3, trunkWidth * .18), object.height * .17); }
        if (size === 'medium') for (const side of [-1, 1]) { c.strokeStyle = '#765039'; c.lineWidth = 8; c.beginPath(); c.moveTo(object.x, canopyY + 28); c.lineTo(object.x + side * object.width * .43, canopyY + 4); c.stroke(); }
      }
      c.restore();
    }
    c.save(); c.globalAlpha = coverOnly ? .86 : 1;
    const leafDark = burning ? '#70402d' : snowy ? damaged ? '#8b9aa6' : '#a9c9dc' : damaged ? '#557044' : size === 'large' ? '#3f7047' : '#4f7c48'; const leaf = burning ? '#a95b31' : snowy ? damaged ? '#c2d6df' : '#e0f3fb' : damaged ? '#749257' : '#70a957'; const leafLight = burning ? '#e18a39' : snowy ? '#ffffff' : '#9acb63';
    const clusters = size === 'large' ? 24 : size === 'medium' ? 9 : 7;
    for (let index = 0; index < clusters; index += 1) {
      const clusterRoll = ((seed + index * 17) % 100) / 100; if (damaged && clusterRoll > Math.max(.35, healthRatio) || shedAmount > 0 && clusterRoll < shedAmount) continue;
      const angle = ((seed * .017 + index * 2.399) % (Math.PI * 2)); const band = .25 + ((seed + index * 17) % 70) / 100;
      const gust = Math.sin(time / (690 + index * 9) + seed * .01 + index) * (2 + Math.abs(wind) * .055); const bend = wind * (.16 + band * .2); const sway = (gust + bend) * (damaged ? 1.8 : 1); const px = object.x + Math.cos(angle) * canopyW * band * .58 + sway; const py = canopyY + Math.sin(angle) * canopyH * band * .48 + Math.abs(gust) * .12 + Math.abs(bend) * .04;
      const width = canopyW * (size === 'large' ? .13 : size === 'medium' ? .22 : .28) * (.82 + index % 3 * .13); const height = canopyH * (size === 'large' ? .28 : .34);
      c.fillStyle = index % 3 === 0 ? leafLight : index % 2 ? leaf : leafDark; c.fillRect(Math.round(px - width / 2), Math.round(py - height / 2), Math.round(width), Math.round(height));
      c.fillStyle = leafDark; c.fillRect(Math.round(px - width * .37), Math.round(py + height * .22), Math.round(width * .75), Math.max(3, Math.round(height * .18)));
      if (snowy && !burning) { c.fillStyle = '#f7ffff'; c.fillRect(Math.round(px - width * .4), Math.round(py - height * .53), Math.round(width * .8), 4); }
    }
    if (burning && !coverOnly) for (let flame = 0; flame < (size === 'large' ? 14 : 6); flame += 1) { const fx = object.x - canopyW * .42 + canopyW * (flame + .5) / (size === 'large' ? 14 : 6); const fy = canopyY - canopyH * .33 + Math.sin(time / 95 + flame) * 7; c.fillStyle = flame % 3 ? '#ff8b38' : '#ffe06a'; c.fillRect(fx - 4, fy - 12, 8, 15); }
    c.restore();
    c.restore();
  }

  drawTreeCover(c, object, time) {
    const radius = object.canopyRadius || 31; const concealed = [...this.visualPlayers.values()].some((player) => player.visualAlive !== false && !player.hidden && Math.abs((player.renderX ?? player.x) - object.x) <= radius && Math.abs((player.renderY ?? player.y) - (object.groundY - 8)) <= object.height + 15);
    if (concealed) this.drawTree(c, object, time, true);
  }

  worldDetailVisible(x, y) {
    const focus = this.visualPlayers.get(this.playerId) || this.visualPlayers.get(this.game?.players?.[this.game.turnIndex]?.id);
    if (!focus) return this.camera.zoom >= 1.15;
    const point = this.renderPosition(focus);
    return Math.hypot(point.x - x, point.y - y) <= 260 && this.camera.zoom >= .72;
  }

  drawScenarioObject(c, object, time) {
    if (object.type === 'specialistDrone' && this.shots.some((shot) => shot.droneIntercept?.droneId === object.id && time >= shot.started && !shot.exploded)) return;
    const falling = object.type !== 'woodDebris' && object.fallAnimation && time - object.fallAnimation.started < object.fallAnimation.duration;
    const sliding = object.slideAnimation && time - object.slideAnimation.started < object.slideAnimation.duration;
    const specialistMoving = object.specialistMoveAnimation && time - object.specialistMoveAnimation.started < object.specialistMoveAnimation.duration;
    if (falling || sliding || specialistMoving) { c.save(); if (falling) { const progress = clamp((time - object.fallAnimation.started) / object.fallAnimation.duration, 0, 1); const descent = clamp(progress / .78, 0, 1); const rebound = progress > .78 ? Math.sin((progress - .78) / .22 * Math.PI) * Math.min(13, object.fallAnimation.distance * .035) : 0; c.translate(0, -object.fallAnimation.distance * (1 - descent * descent) - rebound); if (object.type === 'woodDebris') { c.translate(object.x, object.y); c.rotate((object.rotation || 0) * Math.sin(progress * Math.PI) + progress * (object.driftDirection || 1) * 1.4); c.translate(-object.x, -object.y); } } if (sliding) { const progress = clamp((time - object.slideAnimation.started) / object.slideAnimation.duration, 0, 1); c.translate((object.slideAnimation.fromX - object.x) * (1 - (1 - progress) ** 3), 0); } if (specialistMoving) { const motion = object.specialistMoveAnimation; const progress = clamp((time - motion.started) / motion.duration, 0, 1); const eased = 1 - (1 - progress) ** 3; c.translate((motion.fromX - object.x) * (1 - eased), (motion.fromY - object.y) * (1 - eased) - Math.sin(progress * Math.PI) * 30); c.globalAlpha = .74 + .26 * progress; } }
    if (object.type === 'woodDebris') { if (object.waitForShot && this.shots.some((shot) => !shot.exploded)) return; object.waitForShot = false; const wobble = object.floating ? Math.sin(time / 310 + object.x) * .08 : 0; const age = object.floating ? 0 : clamp((this.worldNow() - (object.physicsAt || this.worldNow())) / 1000, 0, .25); const targetX = object.x + (object.vx || 0) * age; const floor = this.terrainHeights?.[Math.round(clamp(targetX, 0, WORLD.width - 1))] ?? WORLD.height; const targetY = Math.min(floor - object.height / 2, object.y + (object.vy || 0) * age + 215 * age * age); const ease = 1 - Math.exp(-Math.max(.001, this.frameDt || .016) * 10); object.visualWoodX += (targetX - object.visualWoodX) * ease; object.visualWoodY += (targetY - object.visualWoodY) * ease; object.visualWoodRotation += ((object.rotation || 0) + (object.angularVelocity || 0) * age - object.visualWoodRotation) * ease; c.save(); c.translate(object.visualWoodX, object.visualWoodY); c.rotate(object.visualWoodRotation + wobble); c.fillStyle = object.fragmentKind === 'branch' ? '#765237' : '#68462f'; c.fillRect(-object.width / 2, -object.height / 2, object.width, object.height); c.fillStyle = '#a5794c'; c.fillRect(-object.width / 2 + 3, -object.height / 2 + 2, Math.max(4, object.width - 7), Math.min(4, object.height - 2)); if (object.fragmentKind === 'branch') { c.fillStyle = '#739c50'; for (let leaf = -object.width / 2; leaf < object.width / 2; leaf += 13) c.fillRect(leaf, -object.height / 2 - 5 + Math.sin(leaf) * 2, 9, 6); } c.restore(); if (sliding || specialistMoving) c.restore(); return; }
    if (object.type.startsWith('tree')) { this.drawTree(c, object, time); if (falling || sliding || specialistMoving) c.restore(); return; }
    if (object.type === 'crane') { this.drawCrane(c, object, time); if (falling || sliding || specialistMoving) c.restore(); return; }
    if (object.type === 'specialistDrone' && object.active) {
      const bob = Math.sin(time / 250 + object.x * .03) * 3; const disabled = object.disabledUntilRound >= this.game.roundNumber; const pulse = .5 + .5 * Math.sin(time / 210);
      c.save(); c.translate(object.x, object.y + bob); c.globalAlpha = disabled ? .04 : .025 + pulse * .02; c.fillStyle = '#71cfff'; c.beginPath(); c.arc(0, 0, CLASS_BALANCE.specialistScanRadius, 0, Math.PI * 2); c.fill(); c.globalAlpha = disabled ? .08 : .18; c.strokeStyle = '#72c9ff'; c.lineWidth = 2; c.setLineDash([9, 16]); c.stroke(); c.restore();
      c.save(); c.translate(object.x, object.y + bob); c.fillStyle = '#152535'; c.fillRect(-23, -11, 46, 23); c.fillStyle = object.durability < object.maxDurability ? '#bd6959' : '#537fa6'; c.fillRect(-19, -8, 38, 16); c.fillStyle = '#a4dcf7'; c.fillRect(-13, -6, 26, 5); c.fillStyle = disabled ? '#f06866' : '#62edff'; c.fillRect(-5, -3, 10, 8); c.fillStyle = '#1c354b'; c.fillRect(-31, -16, 12, 8); c.fillRect(19, -16, 12, 8); c.fillStyle = '#bceeff'; for (let blade = 0; blade < 2; blade += 1) { const rotorX = blade ? 25 : -25; const span = 12 + Math.sin(time / 32 + blade) * 5; c.fillRect(rotorX - span, -18, span * 2, 3); c.fillRect(rotorX - 2, -21, 4, 5); } c.fillStyle = '#d5e8f5'; c.fillRect(17, -1, 20, 5); c.fillStyle = '#273e56'; c.fillRect(-15, 10, 30, 5); if (this.worldDetailVisible(object.x, object.y)) { c.fillStyle = disabled ? '#ff8774' : '#a5e9ff'; c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillText(disabled ? 'PANE' : `DRONE ${object.durability}/${object.maxDurability}`, 0, -28); } c.restore();
    }
    if (object.type === 'healingDrone' && object.active) { const owner = this.visualPlayers.get(object.ownerId); const x = owner?.renderX ?? object.x; const y = (owner?.renderY ?? object.y + 58) - 58 + Math.sin(time / 220 + object.x) * 4; const disabled = object.disabledUntilRound >= this.game.roundNumber || owner?.teslaDisabledTurns > 0; c.save(); c.translate(x, y); c.shadowColor = disabled ? '#ff7168' : '#62e69a'; c.shadowBlur = 14; c.fillStyle = '#10251f'; c.fillRect(-22, -9, 44, 18); c.fillStyle = disabled ? '#9b514b' : '#3c9d70'; c.fillRect(-17, -6, 34, 12); c.fillStyle = disabled ? '#ff8a78' : '#caffdf'; c.fillRect(-3, -12, 6, 24); c.fillRect(-10, -3, 20, 6); c.fillStyle = '#d9f8ff'; const rotor = 12 + Math.sin(time / 28) * 6; c.fillRect(-30 - rotor, -15, rotor * 2, 3); c.fillRect(30 - rotor, -15, rotor * 2, 3); c.fillStyle = disabled ? '#ff8a78' : '#7dffb2'; c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillText(disabled ? 'PANE' : `CURA ${object.turnsLeft}T`, 0, -23); c.restore(); }
    if (object.type === 'sentry' && object.active) {
      const top = object.groundY - object.height; const disabled = object.disabledUntilRound >= this.game.roundNumber; const pulse = .5 + .5 * Math.sin(time / 240);
      c.save(); c.globalAlpha = disabled ? .15 : .12 + pulse * .1; c.strokeStyle = disabled ? '#ff7868' : '#6deacc'; c.lineWidth = 2; c.setLineDash([8, 15]); c.beginPath(); c.arc(object.x, top + 12, WEAPON_BALANCE.sentry.scanRadius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore();
      const burst = this.sentryBursts.find((entry) => entry.sentryId === object.id && time - entry.started < entry.duration);
      const burstAge = burst ? time - burst.started : Infinity;
      const firing = burstAge < 900; const direction = disabled ? 0 : burst ? Math.atan2(burst.targetY - (top + 8), burst.targetX - object.x) : Math.sin(time / 650 + object.x) * .24;
      const recoil = firing ? Math.max(0, 1 - (burstAge % 140) / 95) * 4 : 0;
      c.fillStyle = '#101c25'; c.fillRect(object.x - 22, object.groundY - 10, 44, 10);
      c.fillStyle = '#49616a'; c.fillRect(object.x - 18, object.groundY - 8, 36, 5);
      c.fillStyle = '#8babb0'; for (let tread = -15; tread <= 15; tread += 10) c.fillRect(object.x + tread, object.groundY - 4, 5, 3);
      c.fillStyle = '#15252e'; c.fillRect(object.x - 13, top + 15, 26, 20);
      c.fillStyle = object.durability <= 1 ? '#b76d51' : '#63818a'; c.fillRect(object.x - 10, top + 17, 20, 15);
      c.fillStyle = '#a6bfc0'; c.fillRect(object.x - 6, top + 19, 5, 5); c.fillRect(object.x + 3, top + 26, 5, 4);
      c.save(); c.translate(object.x, top + 8); c.rotate(direction);
      c.fillStyle = '#0b1720'; c.fillRect(-17, -9, 34, 18); c.fillRect(11 - recoil, -5, 22, 10);
      c.fillStyle = disabled ? '#7a4b4a' : object.durability <= 1 ? '#a57754' : '#8ba7ad'; c.fillRect(-13, -6, 26, 12); c.fillRect(14 - recoil, -3, 18, 6);
      c.fillStyle = '#d4e6dc'; c.fillRect(28 - recoil, -2, 5, 4);
      c.fillStyle = disabled ? '#ff7868' : firing ? '#fff1ad' : '#78f4d7'; c.fillRect(-5, -3, 9, 6);
      c.restore();
      c.fillStyle = disabled ? '#ff7868' : '#7ceecf'; c.fillRect(object.x - 3, top - 8, 6, 7);
      c.fillStyle = '#263b45'; c.fillRect(object.x - 20, object.groundY - 4, 40, 4);
      if (this.worldDetailVisible(object.x, top)) { c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillStyle = disabled ? '#ff958c' : '#caffeb'; c.fillText(disabled ? 'PANE' : `SENT ${object.durability}/3`, object.x, top - 16); }
    }
    if (object.type === 'lightningRod' && object.active) {
      const top = object.groundY - object.height; const radius = object.zapRadius || WEAPON_BALANCE.lightningRod.zapRadius; const pulse = .5 + .5 * Math.sin(time / 210); const forecast = this.game?.rodForecast; const signal = EVENT_DEFS[forecast?.type]?.color || '#72eaff';
      c.save(); c.globalAlpha = .35 + pulse * .25; c.strokeStyle = signal; c.shadowColor = signal; c.shadowBlur = 14 + pulse * 12; c.lineWidth = 4; c.setLineDash([12, 13]); c.beginPath(); c.arc(object.x, top, radius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.globalAlpha = .5 + pulse * .35; c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(object.x, top, 46 + pulse * 16, 0, Math.PI * 2); c.stroke(); c.restore();
      c.fillStyle = '#192b3c'; c.fillRect(object.x - 15, object.groundY - 10, 30, 10); c.fillStyle = '#739caa'; c.fillRect(object.x - 12, object.groundY - 13, 24, 5);
      c.fillStyle = object.durability === 1 ? '#ff9d68' : '#a5eaff'; c.fillRect(object.x - 4, top + 8, 8, object.height - 20); c.fillRect(object.x - 13, top + 21, 26, 5); c.fillRect(object.x - 10, top + 36, 20, 5);
      c.fillStyle = '#f0ffff'; c.fillRect(object.x - 7, top, 14, 8); c.fillRect(object.x - 3, top - 14, 6, 14);
      c.globalAlpha = .7 + pulse * .3; c.fillStyle = signal; c.fillRect(object.x - 4, top - 20, 8, 6); c.fillRect(object.x - 18, top + 18, 5, 5); c.fillRect(object.x + 13, top + 33, 5, 5); c.globalAlpha = 1;
      for (let spark = 0; spark < 8; spark += 1) { const angle = spark * Math.PI / 4 + time / 520; c.fillStyle = spark % 3 ? signal : '#ffffff'; c.fillRect(object.x + Math.cos(angle) * (17 + pulse * 17), top + Math.sin(angle) * (17 + pulse * 17), 3, 3); }
      if (this.worldDetailVisible(object.x, top)) { c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillStyle = signal; c.fillText(forecast ? `${EVENT_DEFS[forecast.type]?.name || 'EVENTO'} • ${forecast.turnsUntil}T` : `HASTE ${object.durability}/3`, object.x, top - 35); }
    }
    if (object.type === 'shieldGenerator' && object.active) {
      const top = object.groundY - object.height; const centerY = object.groundY - object.height / 2; const energy = object.shieldEnergy || 0; const radius = object.shieldRadius || MAP_STRUCTURE_BALANCE.shieldGenerator.radius; const pulse = .5 + .5 * Math.sin(time / 230);
      if (energy > 0) { c.save(); c.globalAlpha = .1 + pulse * .08; c.fillStyle = '#5dcfff'; c.beginPath(); c.arc(object.x, centerY, radius, Math.PI, Math.PI * 2); c.lineTo(object.x + radius, object.groundY); c.lineTo(object.x - radius, object.groundY); c.fill(); c.globalAlpha = .35 + pulse * .2; c.strokeStyle = '#91e8ff'; c.shadowColor = '#5dd8ff'; c.shadowBlur = 13; c.lineWidth = 3; c.setLineDash([12, 10]); c.beginPath(); c.arc(object.x, centerY, radius, Math.PI, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore(); }
      c.fillStyle = '#172d3b'; c.fillRect(object.x - 30, object.groundY - 15, 60, 15); c.fillStyle = '#507688'; c.fillRect(object.x - 25, object.groundY - 12, 50, 8); c.fillStyle = object.durability <= 1 ? '#b45f62' : '#4f9fc1'; c.fillRect(object.x - 15, top + 20, 30, object.height - 32); c.fillStyle = energy ? '#b9f5ff' : '#5d6972'; c.fillRect(object.x - 10, top + 9, 20, 18); c.fillRect(object.x - 4, top - 5, 8, 16); c.strokeStyle = energy ? '#77ddff' : '#6f5961'; c.lineWidth = 4; c.beginPath(); c.arc(object.x, top + 18, 23 + pulse * 3, 0, Math.PI * 2); c.stroke(); c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillStyle = energy ? '#c8f7ff' : '#ff9389'; c.fillText(energy ? `DOMO ${energy}/3` : 'DOMO VAZIO', object.x, top - 16);
    }
    if (object.type === 'repulsor' && object.active) {
      const top = object.groundY - object.height; const centerY = top + 25; const pulse = .5 + .5 * Math.sin(time / 150); const radius = object.pulseRadius || MAP_STRUCTURE_BALANCE.repulsor.radius;
      c.save(); c.globalAlpha = .16 + pulse * .14; c.strokeStyle = '#d5a1ff'; c.lineWidth = 2; c.setLineDash([5, 13]); for (let ring = 1; ring <= 2; ring += 1) { c.beginPath(); c.arc(object.x, centerY, radius * (.16 + ring * .11) + pulse * 8, 0, Math.PI * 2); c.stroke(); } c.setLineDash([]); c.restore();
      c.fillStyle = '#261d39'; c.fillRect(object.x - 29, object.groundY - 14, 58, 14); c.fillStyle = '#6a4d83'; c.fillRect(object.x - 24, object.groundY - 10, 48, 6); c.fillStyle = object.durability <= 1 ? '#b96278' : '#8059a8'; c.fillRect(object.x - 12, top + 24, 24, object.height - 35); c.strokeStyle = '#d5a1ff'; c.lineWidth = 6; c.beginPath(); c.arc(object.x, centerY, 20 + pulse * 3, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#fff0ff'; c.fillRect(object.x - 5, centerY - 5, 10, 10); for (const side of [-1, 1]) { c.fillStyle = '#a875cf'; c.fillRect(object.x + side * 18 - 5, centerY - 8, 10, 16); } c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillStyle = '#edceff'; c.fillText(`REPULSOR ${object.durability}/3`, object.x, top - 9);
    }
    if (object.type === 'ammoTerminal' && object.active) {
      const top = object.groundY - object.height; const pulse = .5 + .5 * Math.sin(time / 200); const radius = object.serviceRadius || MAP_STRUCTURE_BALANCE.ammoTerminal.radius;
      c.save(); c.globalAlpha = .17 + pulse * .1; c.strokeStyle = '#ffd867'; c.lineWidth = 2; c.setLineDash([8, 11]); c.beginPath(); c.arc(object.x, object.groundY - object.height / 2, radius, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore();
      c.fillStyle = '#352d1d'; c.fillRect(object.x - 31, object.groundY - 13, 62, 13); c.fillStyle = '#71613d'; c.fillRect(object.x - 26, object.groundY - 9, 52, 6); c.fillStyle = object.durability <= 1 ? '#a95f4b' : '#b48b37'; c.fillRect(object.x - 25, top + 10, 50, object.height - 22); c.fillStyle = '#1a2730'; c.fillRect(object.x - 18, top + 17, 36, 27); c.fillStyle = '#ffe084'; c.fillRect(object.x - 13, top + 22, 26, 5); c.fillRect(object.x - 4, top + 17, 8, 16); c.fillStyle = '#d1b45a'; for (let slot = -17; slot <= 17; slot += 17) c.fillRect(object.x + slot - 4, top + 50, 8, 8); c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillStyle = '#ffe9a7'; c.fillText('MUNIÇÃO + FUEL', object.x, top - 7);
    }
    if (object.type === 'barrel' && object.active) { const pulse = .45 + .25 * Math.sin(time / 240 + object.x); c.save(); c.globalAlpha = pulse * .35; c.strokeStyle = '#ff744c'; c.lineWidth = 2; c.setLineDash([7, 12]); c.beginPath(); c.arc(object.x, object.y, 100, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore(); c.fillStyle = '#2b3138'; c.fillRect(object.x - 9, object.y - 12, 18, 19); c.fillStyle = '#ff6748'; c.fillRect(object.x - 8, object.y - 9, 16, 4); c.fillRect(object.x - 8, object.y, 16, 3); c.fillStyle = '#ffd56b'; c.fillRect(object.x - 2, object.y - 6, 4, 4); c.fillStyle = '#fff1bf'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText('!', object.x, object.y - 19); }
    if (object.type === 'healingStation' && object.active) { const top = object.groundY - object.height; const pulse = .55 + .3 * Math.sin(time / 210); c.save(); c.globalAlpha = .2 + pulse * .18; c.strokeStyle = '#73ffb2'; c.lineWidth = 3; c.setLineDash([9, 12]); c.beginPath(); c.arc(object.x, object.groundY - 25, 82, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.restore(); c.fillStyle = '#173a36'; c.fillRect(object.x - 27, top + 12, 54, object.height - 12); c.fillStyle = object.durability < 2 ? '#f6bd67' : '#63eaa8'; c.fillRect(object.x - 24, top + 15, 48, 34); c.fillStyle = '#dbfff0'; c.fillRect(object.x - 4, top + 19, 8, 27); c.fillRect(object.x - 13, top + 28, 26, 8); c.fillStyle = '#3f7164'; c.fillRect(object.x - 32, object.groundY - 8, 64, 8); c.fillStyle = '#baffd8'; c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.fillText('+40 HP', object.x, top + 8); }
    if (object.type === 'launcher') { const ready = object.cooldownUntilTurn <= this.game.turnNumber; c.fillStyle = ready ? '#55d9ff' : '#40505d'; c.fillRect(object.x - 18, object.y, 36, 4); for (let step = -10; step <= 10; step += 10) { const direction = object.direction; c.fillRect(object.x + step - direction * 2, object.y - 6 - Math.abs(step) / 5, 5, 5); } if (ready) { c.globalAlpha = .5 + Math.sin(time / 150) * .25; c.fillStyle = '#dffcff'; c.fillRect(object.x - 3, object.y - 14, 6, 4); c.globalAlpha = 1; } }
    if (object.type === 'switch') { c.fillStyle = object.pressed ? '#b7ec58' : '#ff7655'; c.fillRect(object.x - 8, object.y - 5, 16, 5); c.fillRect(object.x - 4, object.y - 10, 8, 5); c.fillStyle = '#07101a'; c.font = 'bold 6px monospace'; c.textAlign = 'center'; c.fillText(object.pressed ? 'ON' : 'HIT', object.x, object.y - 13); }
    if (object.type === 'ramp' && !object.active) { c.strokeStyle = '#68d5ff55'; c.setLineDash([5,5]); c.beginPath(); c.moveTo(object.x, object.y); c.lineTo(object.x + object.width, object.y - (object.direction > 0 ? 92 : 0)); c.stroke(); c.setLineDash([]); }
    if (object.type === 'building' && object.active && object.techFacade) this.drawTechnologyBuilding(c, object, time);
    if (object.type === 'building' && object.active && !object.techFacade) { const left = object.x - object.width / 2; const top = object.groundY - object.height; const damage = 3 - object.durability; c.fillStyle = '#17242e'; c.fillRect(left - 3, top - 5, object.width + 6, object.height + 5); c.fillStyle = '#334b59'; c.fillRect(left + 5, top + 6, object.width - 10, object.height - 6); c.fillStyle = '#263945'; for (let floor = top + 11; floor < object.groundY - 9; floor += 20) { c.fillRect(left + 5, floor + 12, object.width - 10, 3); for (let column = left + 12; column < left + object.width - 8; column += 18) { const lit = (Math.floor(floor / 18) + Math.floor(column / 18)) % 5 === 0; c.fillStyle = lit ? '#f5ca72' : '#64a6ba'; c.fillRect(column, floor, 9, 10); c.fillStyle = lit ? '#fff0ad' : '#9bd0db'; c.fillRect(column + 1, floor + 1, 3, 7); } } c.fillStyle = '#81919b'; c.fillRect(left - 5, top - 8, object.width + 10, 8); c.fillStyle = '#18232d'; c.fillRect(object.x - 12, object.groundY - 31, 24, 31); c.fillStyle = '#556875'; c.fillRect(object.x - 9, object.groundY - 27, 7, 11); if (damage > 0) { c.strokeStyle = damage > 1 ? '#ff684c' : '#c99770'; c.lineWidth = 2 + damage; c.beginPath(); c.moveTo(object.x - 7, top); c.lineTo(object.x + 9, top + 25); c.lineTo(object.x - 12, top + 51); c.lineTo(object.x + 14, top + 76); c.stroke(); c.globalAlpha = .28; c.fillStyle = '#151a20'; c.beginPath(); c.arc(object.x + 8, top - 12 - (time / 32 % 38), 8 + damage * 3, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; } }
    if (object.type === 'fuelTank' && object.active) { const top = object.groundY - object.height; c.fillStyle = '#25303a'; c.fillRect(object.x - 18, top + 5, 36, object.height - 5); c.fillStyle = object.durability < 2 ? '#a94839' : '#e45f43'; c.fillRect(object.x - 15, top + 9, 30, 11); c.fillRect(object.x - 15, top + 27, 30, 9); c.fillStyle = '#ffd36b'; c.fillRect(object.x - 4, top + 17, 8, 8); c.fillStyle = '#84929c'; c.fillRect(object.x - 10, top, 20, 5); }
    if (object.type === 'supplyCache' && object.active) { const top = object.groundY - object.height; c.fillStyle = '#152632'; c.fillRect(object.x - 29, top + 7, 58, object.height - 3); c.fillStyle = object.durability < 2 ? '#b9853e' : '#e4b659'; c.fillRect(object.x - 25, top + 10, 50, object.height - 13); c.fillStyle = '#33424a'; c.fillRect(object.x - 29, top + 4, 58, 8); c.fillRect(object.x - 23, object.groundY - 9, 46, 5); c.fillStyle = '#f8f1c3'; c.fillRect(object.x - 4, top + 17, 8, 20); c.fillRect(object.x - 11, top + 23, 22, 8); c.fillStyle = '#304354'; c.fillRect(object.x - 22, top + 16, 5, 22); c.fillRect(object.x + 17, top + 16, 5, 22); }
    if (object.type === 'shockCoil' && object.active) { const top = object.groundY - object.height; const glow = object.durability < 2 ? '#ffad6e' : '#69e9ff'; c.fillStyle = '#283744'; c.fillRect(object.x - 20, object.groundY - 13, 40, 13); c.fillRect(object.x - 8, top + 18, 16, object.height - 27); c.fillStyle = '#687b89'; c.fillRect(object.x - 19, top + 12, 38, 8); c.fillRect(object.x - 17, top + 39, 34, 7); c.fillStyle = glow; c.fillRect(object.x - 14, top + 4, 28, 10); c.fillRect(object.x - 4, top - 8, 8, 14); c.globalAlpha = .55 + Math.sin(time / 125) * .32; c.fillStyle = glow; c.fillRect(object.x - 27, top + 20, 6, 6); c.fillRect(object.x + 21, top + 31, 6, 6); c.fillRect(object.x - 21, top - 3, 5, 5); c.globalAlpha = 1; }
    if (object.type === 'watchtower' && object.active) { const top = object.groundY - object.height; c.strokeStyle = object.durability < 2 ? '#9b6745' : '#b6c0c6'; c.lineWidth = 6; c.beginPath(); c.moveTo(object.x - 22, object.groundY); c.lineTo(object.x - 12, top + 30); c.moveTo(object.x + 22, object.groundY); c.lineTo(object.x + 12, top + 30); c.stroke(); c.fillStyle = '#32424e'; c.fillRect(object.x - 36, top, 72, 35); c.fillStyle = '#83d4dc'; c.fillRect(object.x - 25, top + 9, 18, 12); c.fillRect(object.x + 7, top + 9, 18, 12); c.fillStyle = '#d6b16a'; for (let rung = top + 45; rung < object.groundY; rung += 20) c.fillRect(object.x - 20, rung, 40, 4); }
    if (object.type === 'radar' && object.active) { const top = object.groundY - object.height; c.fillStyle = '#667784'; c.fillRect(object.x - 5, top + 32, 10, 36); c.fillRect(object.x - 20, object.groundY - 7, 40, 7); c.strokeStyle = object.durability < 2 ? '#ff7557' : '#64e8ff'; c.lineWidth = 7; c.beginPath(); c.arc(object.x, top + 25, 25, Math.PI * .1, Math.PI * .9); c.stroke(); c.fillStyle = '#e9feff'; c.fillRect(object.x - 4, top + 21, 8, 8); c.globalAlpha = .4 + Math.sin(time / 160) * .25; c.fillStyle = '#64e8ff'; c.fillRect(object.x - 2, top - 3, 4, 18); c.globalAlpha = 1; }
    if (object.type === 'crane') { const height = object.height || 220; const armLength = object.armLength || 180; const top = object.groundY - height; const radius = object.ballRadius || 28; c.strokeStyle = object.active ? '#e3ba48' : '#59616a'; c.lineWidth = 11; c.beginPath(); c.moveTo(object.x, object.groundY); c.lineTo(object.x, top); c.lineTo(object.x + object.direction * armLength, top); c.stroke(); c.strokeStyle = object.active ? '#8d7228' : '#454c53'; c.lineWidth = 3; for (let rung = object.groundY - 18; rung > top + 12; rung -= 22) { c.beginPath(); c.moveTo(object.x - 12, rung); c.lineTo(object.x + 12, rung - 16); c.stroke(); } c.strokeStyle = object.active ? '#e3ba48' : '#59616a'; c.lineWidth = 5; c.beginPath(); c.moveTo(object.x, top + 20); c.lineTo(object.x + object.direction * (armLength - 32), object.groundY - 70); c.moveTo(object.x - 24, object.groundY); c.lineTo(object.x + 24, object.groundY); c.stroke(); const ballY = object.active ? object.ballY + Math.sin(time / 450) * 9 : object.ballY; c.strokeStyle = '#929da8'; c.lineWidth = 4; c.beginPath(); c.moveTo(object.ballX, top); c.lineTo(object.ballX, ballY - radius); c.stroke(); c.fillStyle = '#27303a'; c.beginPath(); c.arc(object.ballX, ballY, radius, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#c1cbd3'; c.lineWidth = 4; c.stroke(); c.fillStyle = '#4b5661'; c.fillRect(object.x - 17, top - 13, 34, 21); }
    if (object.type === 'concrete') { c.fillStyle = object.active ? '#929b9b' : '#626969'; c.fillRect(object.x - object.width / 2, object.y - 7, object.width, 14); c.fillStyle = '#c4cccc'; for (let mark = -object.width / 2 + 7; mark < object.width / 2; mark += 16) c.fillRect(object.x + mark, object.y - 3, 7, 3); if (object.active) { c.strokeStyle = '#dfe7e7'; c.lineWidth = 2; c.beginPath(); c.moveTo(object.x - object.width / 2, object.y - 8); c.lineTo(object.x - object.width / 2 + 8, object.groundY); c.moveTo(object.x + object.width / 2, object.y - 8); c.lineTo(object.x + object.width / 2 - 8, object.groundY); c.stroke(); } }
    if (falling || sliding || specialistMoving) c.restore();
  }
  drawTechnologyBuilding(c, object, time) {
    const left = object.x - object.width / 2; const top = object.groundY - object.height;
    const damaged = object.durability < 3; const pulse = .5 + .5 * Math.sin(time / 280 + object.x);
    c.fillStyle = '#0d1c2e'; c.fillRect(left - 5, top - 8, object.width + 10, object.height + 8);
    c.fillStyle = '#234158'; c.fillRect(left + 4, top + 5, object.width - 8, object.height - 5);
    c.fillStyle = '#102b42'; c.fillRect(left + 13, top + 17, object.width - 26, object.height - 28);
    c.fillStyle = damaged ? '#ef715e' : '#6fdef0';
    c.fillRect(left - 5, top - 10, object.width + 10, 7);
    c.fillRect(left + 6, top + 7, 4, object.height - 16);
    c.fillRect(left + object.width - 10, top + 7, 4, object.height - 16);
    for (let row = top + 27; row < object.groundY - 18; row += 19) {
      c.fillStyle = '#2e5269'; c.fillRect(left + 13, row + 10, object.width - 26, 3);
      for (let col = left + 21; col < left + object.width - 20; col += 17) {
        const lit = (Math.floor(row / 19) + Math.floor(col / 17)) % 4 !== 0;
        c.fillStyle = lit ? damaged ? '#dc705d' : '#6db7ce' : '#233f52'; c.fillRect(col, row, 8, 7);
      }
    }
    c.globalAlpha = .4 + pulse * .45; c.fillStyle = damaged ? '#ff9267' : '#a9f7f5';
    c.fillRect(object.x - 13, top - 30, 26, 13); c.fillRect(object.x - 3, top - 40, 6, 10);
    c.globalAlpha = 1;
    if (damaged) { c.strokeStyle = '#f57759'; c.lineWidth = 3; c.beginPath(); c.moveTo(object.x + 8, top + 12); c.lineTo(object.x - 4, top + 38); c.lineTo(object.x + 10, top + 58); c.stroke(); }
  }
  drawCrane(c, object, time) {
    const height = object.height || 220; const armLength = object.armLength || 180; const top = object.groundY - height; const radius = object.ballRadius || 28; const damaged = (object.towerDurability ?? 2) < 2;
    if (object.active !== false) {
      c.strokeStyle = damaged ? '#9b7530' : '#e3ba48'; c.lineWidth = 11; c.beginPath(); c.moveTo(object.x, object.groundY); c.lineTo(object.x + (damaged ? object.direction * 5 : 0), top); c.lineTo(object.x + object.direction * armLength, top + (damaged ? 7 : 0)); c.stroke();
      c.strokeStyle = '#8d7228'; c.lineWidth = 3; for (let rung = object.groundY - 18; rung > top + 12; rung -= 22) { c.beginPath(); c.moveTo(object.x - 12, rung); c.lineTo(object.x + 12, rung - 16); c.stroke(); }
      c.strokeStyle = damaged ? '#a98538' : '#e3ba48'; c.lineWidth = 5; c.beginPath(); c.moveTo(object.x, top + 20); c.lineTo(object.x + object.direction * (armLength - 32), object.groundY - 70); c.moveTo(object.x - 24, object.groundY); c.lineTo(object.x + 24, object.groundY); c.stroke(); c.fillStyle = damaged ? '#713e32' : '#4b5661'; c.fillRect(object.x - 17, top - 13, 34, 21);
      if (damaged) { c.strokeStyle = '#ff7655'; c.lineWidth = 3; c.beginPath(); c.moveTo(object.x - 8, top + height * .34); c.lineTo(object.x + 10, top + height * .42); c.lineTo(object.x - 7, top + height * .51); c.stroke(); const spark = Math.floor(time / 90) % 4; c.fillStyle = spark % 2 ? '#fff3a0' : '#ff6a3d'; c.fillRect(object.x + object.direction * (armLength * .48) + spark * 2, top + 3 + spark * 3, 4, 4); c.globalAlpha = .22 + Math.sin(time / 180) * .08; c.fillStyle = '#1a1d22'; c.beginPath(); c.arc(object.x + 7, top - 18 - (time / 35 % 28), 10 + spark * 2, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    } else { c.fillStyle = '#6f633a'; c.fillRect(object.x - 34, object.groundY - 9, 68, 9); c.fillRect(object.x - 22, object.groundY - 17, 44, 8); }
    const ballY = object.cableIntact === false ? object.ballY : object.ballY + Math.sin(time / 450) * 9;
    if (object.cableIntact !== false) { c.strokeStyle = '#929da8'; c.lineWidth = 4; c.beginPath(); c.moveTo(object.ballX, top); c.lineTo(object.ballX, ballY - radius); c.stroke(); c.strokeStyle = '#fff0a0'; c.lineWidth = 1; c.setLineDash([5,7]); c.stroke(); c.setLineDash([]); } else if (object.active !== false) { c.strokeStyle = '#c7cdd2'; c.lineWidth = 3; c.beginPath(); c.moveTo(object.ballX, top); c.lineTo(object.ballX - 3, top + 18); c.lineTo(object.ballX + 4, top + 25); c.stroke(); }
    if (!this.structureAnimations.some((animation) => animation.id === object.id)) { c.fillStyle = '#27303a'; c.beginPath(); c.arc(object.ballX, ballY, radius, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#c1cbd3'; c.lineWidth = 4; c.stroke(); }
  }
  drawMeteorAnimations(c, time) {
    for (const meteor of this.meteorAnimations) {
      if (meteor.impacted) {
        const age = time - meteor.impactedAt;
        const progress = clamp(age / 1400, 0, 1);
        const fade = Math.pow(1 - progress, 1.25);
        const reach = meteor.radius * (.3 + progress * 1.7);
        c.save(); c.globalAlpha = fade; c.shadowColor = '#ff6d35'; c.shadowBlur = 18;
        c.strokeStyle = '#ff7e3d'; c.lineWidth = Math.max(2, 8 * (1 - progress));
        c.beginPath(); c.ellipse(meteor.x, meteor.y - 5, reach, reach * .36, 0, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#fff0ad';
        for (let ray = 0; ray < 18; ray += 1) {
          const angle = ray / 18 * Math.PI * 2;
          const distance = reach * (ray % 3 ? .8 : 1.15);
          const size = ray % 3 ? 5 : 8;
          c.fillRect(Math.round(meteor.x + Math.cos(angle) * distance - size / 2), Math.round(meteor.y - 5 + Math.sin(angle) * distance * .36 - size / 2), size, size);
        }
        c.shadowBlur = 0; c.globalAlpha = fade * .55; c.fillStyle = '#ff9b52';
        for (let plume = 0; plume < 9; plume += 1) {
          const offset = (plume - 4) * 12 + Math.sin(plume * 2.3 + age / 190) * 8;
          const rise = progress * (95 + plume % 3 * 18);
          c.fillRect(Math.round(meteor.x + offset - 7), Math.round(meteor.y - rise - 18), 14 + plume % 3 * 4, 16 + plume % 2 * 8);
        }
        c.restore();
        continue;
      }
      if (time < meteor.started) continue;
      const progress = clamp((time - meteor.started) / meteor.duration, 0, 1);
      if (progress >= 1) {
        meteor.impacted = true; meteor.impactedAt = time;
        this.spawnExplosion({ impact: { x: meteor.x, y: meteor.y }, radius: meteor.radius, weapon: 'meteorSalvo', secondaryMeteor: true, interactions: [] });
        this.spawnImpactEcho(meteor.x, meteor.y, 'meteorSalvo', meteor.radius, 2000);
        this.floaters.push({ x: meteor.x, y: meteor.y - 52, text: 'IMPACTO METEÓRICO!', age: 0, life: 1.8, color: '#ffae6b' });
        if (meteor.damage) this.spawnDamageNumbers({ damage: meteor.damage });
        this.onMeteorImpact?.();
        this.flushPendingState();
        continue;
      }
      const fall = progress * progress;
      const x = meteor.x + meteor.direction * 68 * (1 - fall);
      const y = meteor.fromY + (meteor.y - meteor.fromY) * fall;
      const targetPulse = .45 + .3 * Math.sin(time / 75);
      c.save();
      c.strokeStyle = `rgba(255,105,72,${targetPulse})`;
      c.lineWidth = 3; c.setLineDash([11, 7]); c.lineDashOffset = -time / 25;
      c.beginPath(); c.ellipse(meteor.x, meteor.y - 3, meteor.radius * .72, 12, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#ff8252';
      for (let tick = -1; tick <= 1; tick += 2) c.fillRect(meteor.x + tick * meteor.radius * .72 - 2, meteor.y - 12, 4, 18);
      if (time - (meteor.lastTrailAt || 0) >= 38) {
        meteor.lastTrailAt = time;
        for (let spark = 0; spark < 4; spark += 1) this.addParticle({ kind: spark % 3 ? 'spark' : 'smoke', x: x + (Math.random() - .5) * 14, y: y - 8 - Math.random() * 12, vx: (Math.random() - .5) * 44, vy: -90 - Math.random() * 80, size: spark % 3 ? 3 + spark : 8, color: spark % 3 ? '#ff9d58' : '#51444a', gravity: spark % 3 ? 30 : -12, life: .45 + Math.random() * .3, bounce: 0, drag: .96 });
      }
      c.shadowColor = '#ff713d'; c.shadowBlur = 24;
      for (let trail = 9; trail >= 1; trail -= 1) {
        const trailing = clamp(progress - trail * .025, 0, 1);
        const eased = trailing * trailing;
        const tx = meteor.x + meteor.direction * 68 * (1 - eased);
        const ty = meteor.fromY + (meteor.y - meteor.fromY) * eased;
        const size = 3 + (10 - trail) * 1.4;
        c.globalAlpha = .12 + (10 - trail) * .07;
        c.fillStyle = trail % 3 ? '#ff7648' : '#ffe59c';
        c.fillRect(Math.round(tx - size / 2), Math.round(ty - size / 2), Math.ceil(size), Math.ceil(size));
      }
      c.globalAlpha = 1; c.fillStyle = '#913e3c'; c.fillRect(Math.round(x - 15), Math.round(y - 15), 30, 30);
      c.fillStyle = '#ff7345'; c.fillRect(Math.round(x - 11), Math.round(y - 13), 23, 24);
      c.fillStyle = '#fff0af'; c.fillRect(Math.round(x - 7), Math.round(y - 9), 14, 13);
      c.fillStyle = '#ffffff'; c.fillRect(Math.round(x - 3), Math.round(y - 6), 6, 6);
      c.restore();
    }
    this.meteorAnimations = this.meteorAnimations.filter((meteor) => !meteor.impacted || time - meteor.impactedAt < 1400);
  }

  drawFireworkAnimations(c, time) {
    const palette = ['#ff69c8', '#68d5ff', '#ffd75e', '#8dff79']; this.fireworkAnimations = this.fireworkAnimations.filter((animation) => time - animation.started < animation.duration);
    for (const animation of this.fireworkAnimations) {
      if (time < animation.started) continue; const progress = clamp((time - animation.started) / animation.duration, 0, 1); const color = palette[animation.colorIndex % palette.length]; const controlX = (animation.fromX + animation.x) / 2; const controlY = Math.min(animation.fromY, animation.toY) - 65 - Math.abs(animation.x - animation.fromX) * .28;
      const pointAt = (p) => animation.path?.length ? animation.path[Math.min(animation.path.length - 1, Math.floor(p * (animation.path.length - 1)))] : ({ x: (1-p)*(1-p)*animation.fromX + 2*(1-p)*p*controlX + p*p*animation.x, y: (1-p)*(1-p)*animation.fromY + 2*(1-p)*p*controlY + p*p*animation.toY }); c.save(); c.shadowColor = color; c.shadowBlur = 9;
      for (let trail = 0; trail < 9; trail += 1) { const p = clamp(progress - trail * .026, 0, 1); const point = pointAt(p); c.globalAlpha = 1 - trail / 10; c.fillStyle = trail % 3 ? color : '#fff8ce'; const size = trail % 3 ? 4 : 6; c.fillRect(point.x - size / 2, point.y - size / 2, size, size); }
      if (progress > .72) { const burst = (progress - .72) / .28; c.globalAlpha = 1 - burst * .72; for (let ray = 0; ray < 12; ray += 1) { const angle = ray / 12 * Math.PI * 2; const reach = 8 + burst * 28; c.fillStyle = ray % 3 ? color : '#ffffff'; const size = ray % 3 ? 4 : 6; c.fillRect(animation.x + Math.cos(angle) * reach - size / 2, animation.toY + Math.sin(angle) * reach - size / 2, size, size); } }
      c.restore();
    }
  }
  drawGravityAnimations(c, time) {
    this.gravityAnimations = this.gravityAnimations.filter((effect) => time - effect.started < effect.duration);
    for (const effect of this.gravityAnimations) {
      const progress = clamp((time - effect.started) / effect.duration, 0, 1); const fade = Math.min(1, progress * 7, (1 - progress) * 5);
      c.save(); c.translate(effect.x, effect.y); c.globalAlpha = fade;
      const halo = c.createRadialGradient(0, 0, 5, 0, 0, effect.radius); halo.addColorStop(0, '#080416e8'); halo.addColorStop(.2, '#5c31af88'); halo.addColorStop(.66, '#9c62ff23'); halo.addColorStop(1, '#b88aff00'); c.fillStyle = halo; c.beginPath(); c.arc(0, 0, effect.radius, 0, Math.PI * 2); c.fill();
      for (let ring = 0; ring < 4; ring += 1) { const radius = effect.radius * (.24 + ring * .22); c.strokeStyle = ring % 2 ? '#d6a5ff' : '#8551ee'; c.lineWidth = (ring ? 3 : 6) / Math.max(.4, this.camera.zoom); c.setLineDash([12 + ring * 5, 14]); c.lineDashOffset = (ring % 2 ? -1 : 1) * (time - effect.started) * .1; c.beginPath(); c.ellipse(0, 0, radius, radius * .7, 0, 0, Math.PI * 2); c.stroke(); }
      c.setLineDash([]); c.fillStyle = '#080214'; c.shadowColor = '#cb9bff'; c.shadowBlur = 25; c.beginPath(); c.arc(0, 0, 19 + Math.sin(time / 85) * 3, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#f3deff'; c.lineWidth = 3; c.stroke(); c.restore();
    }
  }
  drawZeusAnimations(c, time) {
    this.zeusAnimations = this.zeusAnimations.filter((effect) => time - effect.started < effect.duration);
    for (const effect of this.zeusAnimations) {
      const progress = clamp((time - effect.started) / effect.duration, 0, 1);
      const top = Math.min(this.camera.y + 45 / this.camera.zoom, effect.y - 280);
      const brightness = progress < .13 ? progress / .13 : Math.max(.12, 1 - progress) * (.72 + Math.sin(time / 47) * .28);
      const pulse = Math.floor((time - effect.started) / 85);
      c.save(); c.fillStyle = `rgba(5,12,30,${.2 * (1 - progress)})`; c.fillRect(this.camera.x, this.camera.y, VIEW.width / this.camera.zoom, VIEW.height / this.camera.zoom); c.fillStyle = '#182a48'; c.globalAlpha = .55 * (1 - progress); for (let cloud = -4; cloud <= 4; cloud += 1) { const cx = effect.x + cloud * 76 + Math.sin(time / 260 + cloud) * 12; c.fillRect(cx - 50, top - 28 + cloud % 3 * 6, 110, 18); c.fillRect(cx - 23, top - 42 + cloud % 3 * 6, 60, 16); } c.restore();
      c.save(); c.globalAlpha = Math.min(1, brightness); c.strokeStyle = '#ecffff'; c.shadowColor = '#55dfff'; c.shadowBlur = 25; c.lineCap = 'square';
      for (const width of [42, 22, 7]) {
        c.lineWidth = width; c.strokeStyle = width === 42 ? '#2b9bc980' : width === 22 ? '#79eaff' : '#ffffff'; c.beginPath(); c.moveTo(effect.x + 18, top);
        for (let step = 1; step <= 13; step += 1) { const ratio = step / 13; const offset = step === 13 ? 0 : Math.sin(step * 8.7 + pulse * 1.9) * (13 + ratio * 13); c.lineTo(effect.x + offset, top + (effect.y - top) * ratio); }
        c.stroke();
      }
      c.lineWidth = 3; c.strokeStyle = '#c9f7ff'; for (let branch = 0; branch < 6; branch += 1) { const startY = top + (effect.y - top) * (.3 + branch * .095); const side = branch % 2 ? -1 : 1; c.beginPath(); c.moveTo(effect.x + Math.sin(branch * 8.7 + pulse * 1.9) * 16, startY); c.lineTo(effect.x + side * (32 + branch * 5), startY + 25); c.lineTo(effect.x + side * (53 + branch * 7), startY + 52); c.stroke(); }
      c.shadowBlur = 0; c.strokeStyle = '#d8faff'; c.lineWidth = 4; c.beginPath(); c.arc(effect.x, effect.y, 22 + progress * 130, 0, Math.PI * 2); c.stroke(); c.restore();
      if (pulse % 4 === 0 && progress < .86) { c.save(); c.globalAlpha = .16 * (1 - progress); c.fillStyle = '#e8faff'; c.fillRect(this.camera.x, this.camera.y, VIEW.width / this.camera.zoom, VIEW.height / this.camera.zoom); c.restore(); }
    }
  }
  drawStructureAnimations(c, time) { this.structureAnimations = this.structureAnimations.filter((animation) => time - animation.started < animation.duration); for (const animation of this.structureAnimations) { const progress = clamp((time - animation.started) / animation.duration, 0, 1); if (animation.type === 'droneMissile') { const y = animation.fromY + (animation.toY - animation.fromY) * progress * progress; c.fillStyle = '#ffcf58'; c.fillRect(animation.x - 4, y - 11, 8, 18); c.fillStyle = '#ff7557'; c.fillRect(animation.x - 3, y + 7, 6, 12); continue; } if (animation.type === 'teslaArc') { c.save(); c.strokeStyle = '#e9feff'; c.lineWidth = 5; c.shadowColor = '#64e8ff'; c.shadowBlur = 14; c.beginPath(); c.moveTo(animation.fromX, animation.fromY); for (let step = 1; step < 7; step += 1) { const p = step / 7; c.lineTo(animation.fromX + (animation.x - animation.fromX) * p + (step % 2 ? 9 : -9) * (1 - progress), animation.fromY + (animation.toY - animation.fromY) * p); } c.lineTo(animation.x, animation.toY); c.stroke(); c.restore(); continue; } if (animation.type === 'buildingFragment') { const point = animation.path[Math.min(animation.path.length - 1, Math.floor(progress * animation.path.length))]; if (!point) continue; const size = animation.size || 8; c.save(); c.translate(point.x, point.y); c.rotate(progress * Math.PI * 5 + size); c.fillStyle = size % 2 ? '#8a654c' : '#4a5964'; c.fillRect(-size / 2, -size / 2, size, size); c.fillStyle = '#d08a55'; c.fillRect(-size / 2 + 2, -size / 2 + 2, Math.max(2, size - 5), 3); c.restore(); continue; } const eased = progress * progress; const y = animation.fromY + (animation.toY - animation.fromY) * eased; c.save(); c.fillStyle = '#1f2730'; c.shadowColor = '#fff1af'; c.shadowBlur = progress > .8 ? 18 : 4; c.beginPath(); c.arc(animation.x, y, animation.radius, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#d5dce2'; c.lineWidth = 4; c.stroke(); c.restore(); } }
  drawGrave(c, grave) { if (grave.active === false) return; c.fillStyle = '#111923cc'; c.fillRect(grave.x - 12, grave.y - 24, 24, 19); c.fillStyle = '#e7edf2'; c.font = 'bold 16px monospace'; c.textAlign = 'center'; c.fillText('☠', grave.x, grave.y - 9); c.fillStyle = grave.color; c.fillRect(grave.x - 9, grave.y - 4, 18, 2); c.font = 'bold 6px monospace'; c.fillText(grave.nickname, grave.x, grave.y - 28); if (grave.loot?.length) { c.fillStyle = '#f4d35e'; c.fillText(`${grave.loot.length}× SAQUE`, grave.x, grave.y - 37); } }

  drawMinimap(c) {
    if (!this.game) return; const { width, height, left, top } = this.minimapBounds(); const arenaWidth = this.arenaWidth(); const mapX = (x) => left + x / arenaWidth * width; const mapY = (y) => top + y / WORLD.height * height;
    c.fillStyle = '#050a13cc'; c.fillRect(left - 3, top - 3, width + 6, height + 6); c.strokeStyle = '#43536a'; c.strokeRect(left - 3, top - 3, width + 6, height + 6);
    for (let px = 0; px < width; px += 2) { const wx = px / width * arenaWidth; const wy = this.terrainHeights[Math.floor(wx)]; c.fillStyle = '#718064'; c.fillRect(left + px, mapY(wy), 2, 2); }
    for (const platform of this.visualPlatforms) if (platform.active) { c.fillStyle = platform.kind === 'treeBranch' ? '#77ad58' : platform.moving ? '#71dce8' : '#a9bc68'; c.fillRect(mapX(this.platformX(platform)), mapY(platform.y), Math.max(2, platform.width / arenaWidth * width), 2); }
    for (const zone of this.game.fireZones || []) { c.globalAlpha = .8; c.fillStyle = '#ff643d'; c.fillRect(mapX(zone.x) - Math.max(2, zone.radius / arenaWidth * width), mapY(zone.y) - 2, Math.max(4, zone.radius * 2 / arenaWidth * width), 3); }
    const water = visibleWaterColumns(this.game.waterZones, 0, arenaWidth - 1, this.worldNow(), 20);
    for (let index = 0; index < water.surfaces.length; index += 1) if (Number.isFinite(water.surfaces[index])) { c.fillStyle = '#54bee8'; c.fillRect(mapX(water.firstX + index * water.step), mapY(water.surfaces[index]), Math.max(1, water.step / arenaWidth * width), 3); }
    if (this.arenaVisual && this.arenaVisual.event.type !== 'gale' && !(this.arenaVisual.event.weatherPrelude && this.arenaVisual.event.warning)) { for (const impact of this.arenaVisual.event.impacts || []) { const pulse = 2 + Math.sin(performance.now() / 90) * 1.2; c.strokeStyle = ['lightning', 'flood'].includes(this.arenaVisual.event.type) ? '#9eecff' : this.arenaVisual.event.type === 'eruption' ? '#ff5a2f' : '#ffcf68'; c.lineWidth = 1; c.beginPath(); c.arc(mapX(impact.x), mapY(impact.y), pulse + Math.max(2, impact.radius / WORLD.width * width), 0, Math.PI * 2); c.stroke(); } for (const river of this.arenaVisual.event.lavaRivers || []) { c.fillStyle = '#ff5a2f'; c.fillRect(mapX(river.left), top + height - 5, Math.max(2, river.width / WORLD.width * width), 4); } for (const drop of this.arenaVisual.event.drops || []) { c.fillStyle = drop.type === 'lootbox' ? '#fff2a3' : '#ffd45f'; c.fillRect(mapX(drop.x) - 2, top + 4, drop.type === 'lootbox' ? 5 : 3, height - 8); } }
    c.globalAlpha = 1; for (const p of this.visualPlayers.values()) if (p.visualAlive !== false && !p.hidden) { const position = this.renderPosition(p); c.fillStyle = p.id === this.playerId ? '#ffffff' : p.color; c.fillRect(mapX(position.x) - 1, mapY(position.y) - 1, p.id === this.playerId ? 4 : 3, p.id === this.playerId ? 4 : 3); if (p.id === this.playerId) { c.strokeStyle = '#b7ec58'; c.strokeRect(mapX(position.x) - 3, mapY(position.y) - 3, 8, 8); } }
    const viewW = VIEW.width / this.camera.zoom; c.strokeStyle = '#b7ec58aa'; c.strokeRect(mapX(this.camera.x), top + 1, viewW / arenaWidth * width, height - 2);
  }
  shade(hex, amount) { const n = Number.parseInt(hex.slice(1), 16); return `rgb(${clamp((n >> 16) + 255 * amount, 0, 255)},${clamp(((n >> 8) & 255) + 255 * amount, 0, 255)},${clamp((n & 255) + 255 * amount, 0, 255)})`; }
}
