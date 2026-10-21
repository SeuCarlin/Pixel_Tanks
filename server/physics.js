import { CLASS_BALANCE, CLASS_EVOLUTIONS, MAP_STRUCTURE_BALANCE, SHOT_PATH_RATE, STRUCTURE_MATERIALS, WEAPON_BALANCE, WORLD, clamp } from '../shared/constants.js';
import { terrainY, carveTerrain } from './terrain.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';
import { resolveTankFootprint, spiderSurfaceRect } from '../shared/movement.js';
import { tankHitZone } from '../shared/tank-hitbox.js';
import { simulateGpsShot } from './gps.js';
import { swimmableWaterSurface } from '../shared/flood.js';
import { deflectProjectile } from '../shared/wind-vortex.js';

export function simulateShot({ terrain, objects = [], players = [], powerups = [], windVortices = [], ignorePlayerId, guidedTarget = null, tankZones = false, x, y, angle, power, gravity, wind = 0, direction = 1 }) {
  if (guidedTarget) {
    const guided = simulateGpsShot({ terrain, objects, players, powerups, windVortices, ignorePlayerId, guidedTarget, x, y, angle, power, direction });
    if (guided) return guided;
  }
  const radians = (angle * Math.PI) / 180;
  let px = x + Math.cos(radians) * 18 * direction;
  let py = y - Math.sin(radians) * 18;
  let vx = Math.cos(radians) * power * direction;
  let vy = -Math.sin(radians) * power;
  const path = [];
  const collectedPowerupIds = [];
  const dt = 1 / 60;
  for (let step = 0; step < 900; step += 1) {
    if (guidedTarget && step > 8 && step < 240) {
      const dx = guidedTarget.x - px; const dy = guidedTarget.y - py; const distance = Math.max(1, Math.hypot(dx, dy));
      vx += clamp(dx / distance * Math.min(420, Math.hypot(vx, vy)) - vx, -4.2, 4.2);
      vy += clamp(dy / distance * Math.min(420, Math.hypot(vx, vy)) - vy, -4.2, 4.2);
    }
    const previousY = py; px += vx * dt; py += vy * dt;
    vx += wind * dt;
    vy += gravity * dt;
    const deflection = deflectProjectile(windVortices, px, py, vx, vy, dt);
    vx = deflection.vx; vy = deflection.vy;
    if (step % 3 === 0) path.push({ x: Math.round(px), y: Math.round(py), ...(deflection.vortex ? { vortexLift: true, vortexFire: Boolean(deflection.vortex.fire) } : {}) });
    if (px < 0 || px >= WORLD.width || py > WORLD.height + 30) return { path, collectedPowerupIds, impact: null };
    const hit = players.find((player) => player.alive && player.id !== ignorePlayerId && (tankZones ? tankHitZone(player, px, py) : Math.hypot(player.x - px, player.y - py) <= WORLD.tankRadius + 3));
    if (hit) return { path, collectedPowerupIds, impact: { x: px, y: py, playerId: hit.id, ...(tankZones ? { hitZone: tankHitZone(hit, px, py) } : {}) } };
    const powerup = powerups.find((item) => item.active && item.revealed !== false && !item.destroyed && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14);
    if (powerup) collectedPowerupIds.push(powerup.id);
    const structure = projectileStructureAt(objects, px, py);
    if (structure) { path.push({ x: Math.round(px), y: Math.round(py) }); return { path, collectedPowerupIds, impact: { x: px, y: py, structure: structure.type, structureId: structure.id } }; }
    const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && Math.min(previousY, py) <= entry.y + entry.height && Math.max(previousY, py) >= entry.y);
    if (platform) return { path, collectedPowerupIds, impact: { x: px, y: clamp(py, platform.y, platform.y + platform.height), platformId: platform.id } };
    if (py >= terrainY(terrain, px)) return { path, collectedPowerupIds, impact: { x: px, y: py } };
  }
  return { path, collectedPowerupIds, impact: null };
}

export function simulateVectorShot({ terrain, players = [], powerups = [], windVortices = [], ignorePlayerId, x, y, targetX, targetY }) {
  const dx = targetX - x; const dy = targetY - y; const magnitude = Math.hypot(dx, dy);
  if (magnitude < 12) throw new Error('Escolha um ponto mais distante para redirecionar.');
  let vx = dx / magnitude * 14; let vy = dy / magnitude * 14;
  const path = [{ x: Math.round(x), y: Math.round(y), vertical: true }]; const collectedPowerupIds = [];
  let px = x; let py = y;
  for (let step = 0; step < 450; step += 1) {
    const previousY = py; px += vx; py += vy;
    const deflection = deflectProjectile(windVortices, px, py, vx * 60, vy * 60, 1 / 60);
    vx = deflection.vx / 60; vy = deflection.vy / 60;
    path.push({ x: Math.round(px), y: Math.round(py), vertical: true, ...(deflection.vortex ? { vortexLift: true, vortexFire: Boolean(deflection.vortex.fire) } : {}) });
    if (px < 0 || px >= WORLD.width || py < -40 || py > WORLD.height + 30) return { path, collectedPowerupIds, impact: null };
    const hit = players.find((player) => player.alive && player.id !== ignorePlayerId && Math.hypot(player.x - px, player.y - py) <= WORLD.tankRadius + 3);
    if (hit) return { path, collectedPowerupIds, impact: { x: px, y: py, playerId: hit.id } };
    const powerup = powerups.find((item) => item.active && item.revealed !== false && !item.destroyed && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14);
    if (powerup) collectedPowerupIds.push(powerup.id);
    const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && Math.min(previousY, py) <= entry.y + entry.height && Math.max(previousY, py) >= entry.y);
    if (platform) return { path, collectedPowerupIds, impact: { x: px, y: clamp(py, platform.y, platform.y + platform.height), platformId: platform.id } };
    if (py >= terrainY(terrain, px)) return { path, collectedPowerupIds, impact: { x: px, y: py } };
  }
  return { path, collectedPowerupIds, impact: null };
}

export function simulateBouncingGrenade({ terrain, powerups = [], windVortices = [], guidedTarget = null, x, y, angle, power, gravity, wind = 0, direction = 1 }) {
  const radians = angle * Math.PI / 180; let px = x + Math.cos(radians) * 18 * direction; let py = y - Math.sin(radians) * 18; let vx = Math.cos(radians) * power * direction; let vy = -Math.sin(radians) * power; const path = []; const collectedPowerupIds = []; const bounces = []; const dt = 1 / 60;
  for (let step = 0; step < 1200 && bounces.length < 3; step += 1) {
    if (guidedTarget && bounces.length === 0 && step > 8 && step < 240) { const dx = guidedTarget.x - px; const dy = guidedTarget.y - py; const distance = Math.max(1, Math.hypot(dx, dy)); vx += clamp(dx / distance * 330 - vx, -4.2, 4.2); vy += clamp(dy / distance * 330 - vy, -4.2, 4.2); }
    const previousY = py; px += vx * dt; py += vy * dt; vx += wind * dt; vy += gravity * dt;
    const deflection = deflectProjectile(windVortices, px, py, vx, vy, dt); vx = deflection.vx; vy = deflection.vy;
    if (step % 3 === 0) path.push({ x: Math.round(px), y: Math.round(py), ...(deflection.vortex ? { vortexLift: true, vortexFire: Boolean(deflection.vortex.fire) } : {}) });
    const powerup = powerups.find((item) => item.active && item.revealed !== false && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14); if (powerup) collectedPowerupIds.push(powerup.id);
    if (px <= 8 || px >= WORLD.width - 8) { px = clamp(px, 8, WORLD.width - 8); vx *= -.68; bounces.push({ x: px, y: py }); }
    const ground = terrainY(terrain, px); const platform = vy > 0 ? terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && previousY + 3 <= entry.y && py + 3 >= entry.y) : null;
    if (py >= ground || platform) { py = platform ? platform.y - 3 : ground - 3; vy = -Math.max(75, Math.abs(vy) * .58); vx *= .76; bounces.push({ x: px, y: py }); }
    if (py > WORLD.height + 30) return { path, collectedPowerupIds, bounces, impact: null };
  }
  vx *= .9; vy = Math.min(0, vy);
  for (let fuse = 0; fuse < SHOT_PATH_RATE * 3; fuse += 1) {
    const previousX = px; const previousY = py;
    px = clamp(px + vx * dt, 8, WORLD.width - 8); py += vy * dt; vy += gravity * dt;
    const oldGround = terrainY(terrain, previousX); const ground = terrainY(terrain, px);
    if (ground < oldGround - 10 && previousY + 3 >= oldGround - 6) { px = previousX; vx *= -.28; }
    const platform = terrain.floatingPlatforms?.filter((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && previousY + 3 <= entry.y + 3 && py + 3 >= entry.y).sort((a, b) => a.y - b.y)[0];
    const support = platform ? Math.min(platform.y, terrainY(terrain, px)) : terrainY(terrain, px);
    if (py + 3 >= support && vy >= 0) { py = support - 3; vy = 0; }
    vx *= .985;
    if (px <= 8 || px >= WORLD.width - 8) vx *= -.45;
    path.push({ x: Math.round(px), y: Math.round(py), fuse: true });
    if (py > WORLD.height + 30) return { path, collectedPowerupIds, bounces, impact: null };
  }
  return { path, collectedPowerupIds, bounces, impact: { x: px, y: py } };
}

export function simulateMarkerBomb({ terrain, powerups = [], windVortices = [], x, y, angle, power, gravity, wind = 0, direction = 1 }) {
  const radians = angle * Math.PI / 180; let px = x + Math.cos(radians) * 18 * direction; let py = y - Math.sin(radians) * 18;
  let vx = Math.cos(radians) * power * direction; let vy = -Math.sin(radians) * power;
  const path = []; const bounces = []; const collectedPowerupIds = []; const dt = 1 / 60;
  for (let step = 0; step < 1350 && bounces.length < 3; step += 1) {
    const oldX = px; const oldY = py; px += vx * dt; py += vy * dt; vx += wind * dt; vy += gravity * dt;
    const deflection = deflectProjectile(windVortices, px, py, vx, vy, dt); vx = deflection.vx; vy = deflection.vy;
    if (step % 3 === 0) path.push({ x: Math.round(px), y: Math.round(py), ...(deflection.vortex ? { vortexLift: true, vortexFire: Boolean(deflection.vortex.fire) } : {}) });
    const item = powerups.find((entry) => entry.active && entry.revealed !== false && !collectedPowerupIds.includes(entry.id) && Math.hypot(entry.x - px, entry.y - py) <= 14);
    if (item) collectedPowerupIds.push(item.id);
    const wall = px <= 8 || px >= WORLD.width - 8 || (Math.abs(px - oldX) > .1 && terrainY(terrain, px) < py + 4 && terrainY(terrain, oldX) > oldY + 3);
    const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && Math.min(oldY, py) <= entry.y + entry.height && Math.max(oldY, py) >= entry.y);
    const ground = py >= terrainY(terrain, px);
    if (wall) { px = clamp(oldX, 8, WORLD.width - 8); vx = -Math.sign(vx) * Math.max(180, Math.abs(vx) * 1.1); vy = Math.min(vy, -115); }
    else if (platform || ground) { py = (platform?.y ?? terrainY(terrain, px)) - 4; vy = -Math.max(185, Math.abs(vy) * 1.12); vx *= 1.08; }
    if (wall || platform || ground) { const mark = { x: Math.round(px), y: Math.round(py), pathIndex: Math.max(0, path.length - 1), surface: wall ? 'wall' : 'floor' }; bounces.push(mark); path.push({ x: mark.x, y: mark.y, bounce: bounces.length }); }
    if (py > WORLD.height + 30) return { path, collectedPowerupIds, bounces, impact: null };
  }
  return { path, collectedPowerupIds, bounces, impact: bounces.length === 3 ? { x: px, y: py } : null };
}

export function simulateHarpoon({ terrain, objects = [], players = [], ignorePlayerId, x, y, angle, direction = 1 }) {
  const radians = angle * Math.PI / 180; const dx = Math.cos(radians) * direction; const dy = -Math.sin(radians);
  const path = []; const range = WEAPON_BALANCE.harpoon.range;
  for (let distance = 18; distance <= range; distance += 6) {
    const px = x + dx * distance; const py = y + dy * distance;
    if (px < 3 || px >= WORLD.width - 3 || py < 3 || py > WORLD.height + 20) break;
    if ((distance - 18) % 24 === 0) path.push({ x: Math.round(px), y: Math.round(py) });
    const tank = players.find((entry) => entry.alive && entry.id !== ignorePlayerId && Math.hypot(entry.x - px, entry.y - py) <= WORLD.tankRadius + 5);
    if (tank) { path.push({ x: px, y: py }); return { path, impact: { x: px, y: py, playerId: tank.id }, collectedPowerupIds: [] }; }
    const structure = projectileStructureAt(objects, px, py);
    if (structure) { path.push({ x: px, y: py }); return { path, impact: { x: px, y: py, objectId: structure.id }, collectedPowerupIds: [] }; }
    const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && py >= entry.y && py <= entry.y + entry.height);
    if (platform) { path.push({ x: px, y: py }); return { path, impact: { x: px, y: py, platformId: platform.id }, collectedPowerupIds: [] }; }
    if (py >= terrainY(terrain, px)) { path.push({ x: px, y: py }); return { path, impact: { x: px, y: py }, collectedPowerupIds: [] }; }
  }
  return { path, impact: null, collectedPowerupIds: [] };
}

export function simulateVerticalStrike({ terrain, players = [], powerups = [], ignorePlayerId, guidedTarget = null, x, y, angle, power, gravity, wind = 0, direction = 1 }) {
  const radians = angle * Math.PI / 180; let px = x + Math.cos(radians) * 18 * direction; let py = y - Math.sin(radians) * 18; let vx = Math.cos(radians) * power * direction; let vy = -Math.sin(radians) * power; const path = []; const collectedPowerupIds = []; const dt = 1 / 60; let activated = false; let activationIndex = 0;
  for (let step = 0; step < 900; step += 1) {
    if (guidedTarget && !activated && step > 18) { vx += clamp((guidedTarget.x - px) * .003, -.7, .7); vy += clamp((guidedTarget.y - py) * .002, -.45, .45); }
    if (!activated && (vy >= -8 || step >= 150)) { activated = true; activationIndex = path.length; vx = 0; vy = Math.max(260, power * .9); }
    const previousY = py; px += vx * dt; py += vy * dt; if (!activated) { vx += wind * dt; vy += gravity * dt; }
    if (step % 3 === 0) path.push({ x: Math.round(px), y: Math.round(py), vertical: activated });
    const powerup = powerups.find((item) => item.active && item.revealed !== false && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14); if (powerup) collectedPowerupIds.push(powerup.id);
    const hit = players.find((player) => player.alive && player.id !== ignorePlayerId && Math.hypot(player.x - px, player.y - py) <= WORLD.tankRadius + 4); if (hit) return { path, activationIndex, collectedPowerupIds, impact: { x: px, y: py, playerId: hit.id } };
    const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && Math.min(previousY, py) <= entry.y + entry.height && Math.max(previousY, py) >= entry.y); if (platform) return { path, activationIndex, collectedPowerupIds, impact: { x: px, y: entryY(platform), platformId: platform.id } };
    if (px < 0 || px >= WORLD.width || py > WORLD.height + 30) return { path, activationIndex, collectedPowerupIds, impact: null };
    if (py >= terrainY(terrain, px)) return { path, activationIndex, collectedPowerupIds, impact: { x: px, y: py } };
  }
  return { path, activationIndex, collectedPowerupIds, impact: null };
}

function entryY(platform) { return clamp(platform.y, 0, WORLD.height); }

export function interruptTankControl(game, player) {
  const bubbles = (game.soapBubbles || []).filter((bubble) => bubble.playerId === player.id);
  if (bubbles.length) {
    game.soapBubbles = game.soapBubbles.filter((bubble) => bubble.playerId !== player.id);
    game.soapPops ||= [];
    for (const bubble of bubbles) {
      game.interactionSerial = (game.interactionSerial || 0) + 1;
      game.lastSoapPop = { serial: game.interactionSerial, x: player.x, y: player.y, playerId: player.id, damage: 0 };
      game.soapPops.push(game.lastSoapPop);
    }
    game.soapPops = game.soapPops.slice(-12);
  }
  if (game.harpoonPull?.playerId === player.id) game.harpoonPull = null;
  player.wallClinging = null; player.ceilingClinging = null; player.surfaceClinging = null;
  return bubbles.length > 0;
}

export function impartTankMomentum(game, player, originX, force, displace = false) {
  if (!player?.alive || force < 12) return false;
  const releasedBubble = interruptTankControl(game, player);
  if (releasedBubble && !player.airborne) player.airborne = { vx: 0, vy: -Math.min(force, 90), falling: true, startY: player.y, updatedAt: Date.now() };
  const direction = player.x >= originX ? 1 : -1;
  if (displace) player.x = clamp(player.x + direction * clamp(force * .65, 8, 35), 12, WORLD.width - 12);
  if (player.airborne) {
    player.airborne.vx = clamp(player.airborne.vx + direction * force * 2.1, -180, 180);
    player.airborne.vy = Math.min(player.airborne.vy, -clamp(16 + force * 1.4, 28, 125));
  } else if (player.supportPlatformId) {
    const platform = game.terrain.floatingPlatforms?.find((entry) => entry.id === player.supportPlatformId && entry.active);
    if (platform && player.x >= platform.x + WORLD.tankRadius && player.x <= platform.x + platform.width - WORLD.tankRadius) player.platformOffset = player.x - platform.x;
    else { player.supportPlatformId = null; player.platformOffset = null; }
  }
  game.interactionSerial = (game.interactionSerial || 0) + 1;
  player.lastImpactMotion = { serial: game.interactionSerial, direction, force, x: player.x, y: player.y };
  return true;
}

export function applyExplosion(game, x, y, radius = 48, baseDamage = 55, effects = {}) {
  const source = effects.sourcePlayerId && game.players.find((entry) => entry.id === effects.sourcePlayerId);
  const shieldUses = new Map();
  for (const player of game.players) if (player.alive && player.classType === 'ninja' && player.invisibleTurns > 0 && player.lastNinjaReveal?.reason === 'ghost' && !player.lastNinjaReveal.destroyed && Math.hypot(player.lastNinjaReveal.x - x, player.lastNinjaReveal.y - y) <= radius) { game.interactionSerial = (game.interactionSerial || 0) + 1; player.lastNinjaReveal.destroyed = true; player.lastNinjaReveal.destroyedSerial = game.interactionSerial; }
  const sourceClass = source?.teslaDisabledTurns > 0 ? null : source?.classType;
  const ignoreShield = effects.ignoreShield || sourceClass === 'attacker';
  if (sourceClass === 'bomber' && !effects.deathBlast) radius += CLASS_BALANCE.bomberRadius;
  const left = Math.max(0, Math.floor(x - radius)); const right = Math.min(WORLD.width - 1, Math.ceil(x + radius));
  const terrainBefore = game.terrain.heights.slice(left, right + 1); const activePlatforms = new Set((game.terrain.floatingPlatforms || []).filter((platform) => platform.active).map((platform) => platform.id));
  if (effects.verticalBeam) {
    const core = Math.min(radius, effects.beamWidth || radius * .42);
    for (let px = left; px <= right; px += 1) {
      const distance = Math.abs(px - x);
      const depth = distance <= core ? WORLD.height + 80 : Math.min(WORLD.height + 80, game.terrain.heights[px] + Math.round(165 * (1 - (distance - core) / Math.max(1, radius - core))));
      game.terrain.heights[px] = Math.max(game.terrain.heights[px], depth);
    }
  } else if (!effects.noTerrain) carveTerrain(game.terrain, x, y, radius);
  for (const item of game.powerups || []) {
    if (item.revealed) { if (item.active) item.y = Math.min(item.y, terrainY(game.terrain, item.x) - 12); continue; }
    const buriedY = item.buriedY ?? item.y;
    const exposedByCrater = terrainY(game.terrain, item.x) >= buriedY - 3;
    const touchedByBlast = Math.hypot(item.x - x, buriedY - y) <= radius * 1.12;
    if (!exposedByCrater && !touchedByBlast) continue;
    item.revealed = true; item.active = true; item.y = terrainY(game.terrain, item.x) - 12; item.anchorY = item.y;
  }
  for (const platform of game.terrain.floatingPlatforms || []) {
    if (!platform.active || effects.noTerrain) continue;
    const nearestX = clamp(x, platform.x, platform.x + platform.width);
    const distance = effects.verticalBeam ? Math.abs(x - nearestX) : Math.hypot(x - nearestX, y - platform.y);
    if (distance > radius) continue;
    platform.durability = effects.verticalBeam ? 0 : Math.max(0, platform.durability - Math.max(18, Math.round((1 - distance / radius) * 72)));
    if (platform.durability === 0) platform.active = false;
  }
  if (effects.sourcePlayerId) for (const player of game.players || []) if (player.alive && player.id !== effects.sourcePlayerId && (game.friendlyFire || !['coop', 'teams', 'teamHill'].includes(game.mode) || !source || player.team !== source.team) && (effects.verticalBeam ? Math.abs(player.x - x) : Math.hypot(player.x - x, player.y - y)) <= radius * (effects.deathBlast ? 1 : 1.45)) { player.lastDamageSourceId = effects.sourcePlayerId; player.lastDamageTurn = game.turnNumber; }
  settleScenarioObjects(game);
  const damage = [];
  for (const player of game.players) {
    if (!player.alive) continue;
    if (game.damageImmunePlayerIds?.has?.(player.id)) continue;
    const targetClass = player.teslaDisabledTurns > 0 ? null : player.classType;
    if (targetClass === 'saboteur' && ['teslaOrb', 'shockCoil'].includes(effects.attackType)) continue;
    if (!game.friendlyFire && ['coop', 'teams', 'teamHill'].includes(game.mode) && source && player.id !== source.id && player.team === source.team) continue;
    const distance = effects.verticalBeam ? Math.abs(player.x - x) : Math.hypot(player.x - x, player.y - y);
    if (distance > radius * (effects.deathBlast ? 1 : 1.45) && effects.directHit?.playerId !== player.id) continue;
    let amount = effects.directHit?.playerId === player.id ? effects.directHit.damage : effects.deathBlast ? baseDamage : Math.round(baseDamage * (1 - distance / (radius * 1.45)));
    if (sourceClass === 'attacker') amount += 20 + Math.round((player.maxHealth || 0) * CLASS_BALANCE.attackerMaxHealthDamage);
    if (source && source.id !== player.id && !source.teslaDisabledTurns && !effects.deathBlast) amount += (source.classEvolutions || []).filter((type) => type === 'overdrive').length * CLASS_EVOLUTIONS.overdrive.damage;
    if (sourceClass === 'armored') amount = Math.max(0, amount - 10);
    if (sourceClass === 'bomber' && !effects.deathBlast) amount += CLASS_BALANCE.bomberDamage;
    if (targetClass === 'bomber') amount = Math.max(0, amount - (effects.eventType === 'bombardment' ? CLASS_BALANCE.bomberBombardmentResistance : CLASS_BALANCE.bomberResistance));
    if (targetClass === 'meteorologist' && effects.eventType) amount = Math.round(amount * CLASS_BALANCE.meteorologistEventResistance);
    const structureShield = amount > 0 ? (game.objects || []).filter((object) => object.type === 'shieldGenerator' && object.active && (object.shieldEnergy ?? 0) > 0 && Math.hypot(player.x - object.x, player.y - (object.groundY - object.height / 2)) <= (object.shieldRadius || MAP_STRUCTURE_BALANCE.shieldGenerator.radius)).sort((a, b) => Math.hypot(player.x - a.x, player.y - (a.groundY - a.height / 2)) - Math.hypot(player.x - b.x, player.y - (b.groundY - b.height / 2)))[0] : null;
    if (structureShield) { amount = Math.ceil(amount * MAP_STRUCTURE_BALANCE.shieldGenerator.damageMultiplier); if (!shieldUses.has(structureShield.id)) shieldUses.set(structureShield.id, { object: structureShield, targetIds: [] }); shieldUses.get(structureShield.id).targetIds.push(player.id); }
    if (!ignoreShield && !player.teslaDisabledTurns && (player.shield || player.shieldCharges > 0)) { amount = Math.ceil(amount * 0.35); player.shieldCharges = Math.max(0, (player.shieldCharges || 1) - 1); player.shield = player.shieldCharges > 0; }
    if (player.armorAuraActive && !player.teslaDisabledTurns) amount = Math.ceil(amount * (1 - CLASS_BALANCE.armoredPulseReduction));
    player.health = clamp(player.health - Math.max(0, amount), 0, player.maxHealth);
    if (source && source.id !== player.id && amount > 0 && player.splitDamageUntilRound >= game.roundNumber) { const reflected = Math.ceil(amount * .5); source.health = Math.max(0, source.health - reflected); source.alive = source.health > 0; source.lastDamageRound = game.roundNumber; source.lastDamageSourceId = player.id; source.lastDamageTurn = game.turnNumber; game.interactionSerial = (game.interactionSerial || 0) + 1; player.lastSplitReflection = { serial: game.interactionSerial, x: player.x, y: player.y, toX: source.x, toY: source.y, amount: reflected }; }
    const push = Math.round(amount * 0.42 * (effects.pushMultiplier || 1));
    if (push > 0) player.x = clamp(player.x + (player.x < x ? -push : push), 4, WORLD.width - 4);
    if (amount > 0) { player.lastDamageRound = game.roundNumber || 1; if (effects.sourcePlayerId && player.id !== effects.sourcePlayerId) { player.lastDamageSourceId = effects.sourcePlayerId; player.lastDamageTurn = game.turnNumber; } }
    if (player.health <= 0) player.alive = false;
    else if (amount > 0) impartTankMomentum(game, player, x, push);
    damage.push({ playerId: player.id, amount, knockback: push, ...(structureShield ? { structureShieldId: structureShield.id } : {}), ...(effects.directHit?.playerId === player.id ? { hitZone: effects.directHit.zone, critical: effects.directHit.zone === 'head' } : {}) });
  }
  for (const { object, targetIds } of shieldUses.values()) {
    object.shieldEnergy = Math.max(0, (object.shieldEnergy || 0) - 1);
    game.interactionSerial = (game.interactionSerial || 0) + 1;
    object.lastShieldPulse = { serial: game.interactionSerial, x: object.x, y: object.groundY - object.height / 2, radius: object.shieldRadius || MAP_STRUCTURE_BALANCE.shieldGenerator.radius, targetIds, explosionX: x, explosionY: y, energy: object.shieldEnergy };
  }
  settlePlayers(game);
  const removedDepth = terrainBefore.reduce((sum, height, index) => sum + Math.max(0, game.terrain.heights[left + index] - height), 0);
  damage.destruction = { terrainBlocks: Math.floor(removedDepth / 5), platformIds: (game.terrain.floatingPlatforms || []).filter((platform) => activePlatforms.has(platform.id) && !platform.active).map((platform) => platform.id) };
  return damage;
}

function objectGroundY(object) {
  if (Number.isFinite(object.groundY)) return object.groundY;
  if (object.type === 'barrel') return object.y + 8;
  if (object.type === 'launcher') return object.y + 4;
  if (object.type === 'switch') return object.y + 5;
  return object.y;
}

function objectFootprint(object) {
  if (['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'healingStation', 'concrete', 'lightningRod', 'sentry', 'specialistDrone', 'ammoTerminal', 'shieldGenerator', 'repulsor', 'treeSmall', 'treeMedium', 'treeLarge'].includes(object.type)) return Math.max(12, (object.width || 70) * .42);
  if (object.type === 'crane') return 30;
  if (object.type === 'ramp') return Math.max(25, (object.width || 120) * .35);
  return 12;
}

function terrainSupportY(game, object) {
  const half = objectFootprint(object); const samples = [];
  for (let index = 0; index < 7; index += 1) samples.push(terrainY(game.terrain, object.x - half + half * 2 * index / 6));
  samples.sort((a, b) => a - b); return samples[Math.floor(samples.length / 2)];
}

function damageStructuresFromFall(game, falling, distance, material) {
  if (distance < 55 || material.mass < .8) return [];
  const damaged = [];
  const radius = material.impactRadius + Math.min(75, distance * .16);
  const force = distance >= 170 && material.mass >= 1.1 ? 2 : 1;
  for (const target of game.objects) {
    if (target === falling || target.active === false) continue;
    if (!['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'healingStation', 'lightningRod', 'sentry', 'specialistDrone', 'ammoTerminal', 'shieldGenerator', 'repulsor', 'treeSmall', 'treeMedium', 'treeLarge', 'crane'].includes(target.type)) continue;
    const gap = Math.abs(target.x - falling.x) - ((falling.width || 36) + (target.width || 36)) / 2;
    if (gap > radius || Math.abs(objectGroundY(target) - falling.groundY) > Math.max(55, distance * .4)) continue;
    const key = target.type === 'crane' ? 'towerDurability' : 'durability';
    const before = target[key] ?? (target.type === 'crane' ? 2 : 3);
    target[key] = Math.max(0, before - force);
    if (target[key] === 0) target.active = false;
    game.interactionSerial = (game.interactionSerial || 0) + 1;
    target.lastImpact = { serial: game.interactionSerial, fromId: falling.id, material: material.material, force, destroyed: target.active === false };
    damaged.push({ id: target.id, durability: target[key], destroyed: target.active === false });
  }
  return damaged;
}

export function settleScenarioObjects(game) {
  if (!game?.objects?.length) return [];
  const falls = [];
  for (const object of game.objects) {
    if (object.active === false && object.type !== 'crane') continue;
    if (object.type === 'specialistDrone' && object.hovering) continue;
    const oldGround = objectGroundY(object); const previousSupportId = object.supportPlatformId;
    let platform = previousSupportId && game.terrain.floatingPlatforms?.find((entry) => entry.id === previousSupportId && entry.active);
    const terrainGround = terrainSupportY(game, object);
    if (!platform && terrainGround > oldGround + 3) {
      const half = objectFootprint(object);
      platform = game.terrain.floatingPlatforms?.filter((entry) => entry.active && !entry.moving && entry.y > oldGround + 3 && entry.y < terrainGround && object.x - half >= entry.x && object.x + half <= entry.x + entry.width).sort((a, b) => a.y - b.y)[0];
    }
    const nextGround = platform ? platform.y : terrainGround; const lostPlatform = Boolean(previousSupportId && !platform);
    if (platform) { object.supportPlatformId = platform.id; object.platformOffset = object.x - platform.x; }
    else { object.supportPlatformId = null; object.platformOffset = null; }
    if (!Number.isFinite(nextGround) || nextGround > WORLD.height + 35) { object.active = false; object.fallenOut = true; continue; }
    const delta = nextGround - oldGround; if (Math.abs(delta) < 3 && !lostPlatform) continue;
    const fallDistance = Math.max(0, delta); object.groundY = nextGround;
    if (['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'healingStation', 'lightningRod', 'sentry', 'ammoTerminal', 'shieldGenerator', 'repulsor', 'treeSmall', 'treeMedium', 'treeLarge'].includes(object.type)) object.y = nextGround - object.height / 2;
    else if (object.type === 'crane') { object.y = nextGround - (object.height || 220) / 2; if (object.cableIntact !== false) object.ballY += delta; else object.ballY = terrainY(game.terrain, object.ballX) - Math.max(8, (object.ballRadius || 28) * .45); }
    else if (object.type === 'concrete') object.y = fallDistance > 8 || lostPlatform ? nextGround - 7 : object.y + delta;
    else if (object.type === 'barrel') object.y = nextGround - 8;
    else if (object.type === 'launcher') object.y = nextGround - 4;
    else if (object.type === 'switch') object.y = nextGround - 5;
    else object.y += delta;
    if (object.type === 'treeLarge' && Math.abs(delta) >= 3) {
      for (const branch of game.terrain.floatingPlatforms || []) if (branch.treeId === object.id) branch.y += delta;
      for (const row of object.branchRows || []) row.y += delta;
    }
    if (fallDistance < 8) continue;
    const material = STRUCTURE_MATERIALS[object.type] || { material: 'metal', mass: 1, impactRadius: 24, craterRadius: 0 };
    game.interactionSerial = (game.interactionSerial || 0) + 1; object.lastFall = { serial: game.interactionSerial, fromGroundY: oldGround, toGroundY: nextGround, distance: fallDistance, material: material.material };
    const range = Math.max(material.impactRadius, (object.width || 0) * .55);
    const baseDamage = clamp(Math.round((16 + fallDistance * .42) * material.mass), 8, 145);
    if (material.craterRadius && fallDistance >= 90 && !platform) carveTerrain(game.terrain, object.x, nextGround + material.craterRadius * .55, material.craterRadius);
    for (const player of game.players || []) { if (!player.alive || game.damageImmunePlayerIds?.has?.(player.id) || Math.abs(player.x - object.x) > range || Math.abs(player.y - nextGround) > 130) continue; const amount = Math.max(8, Math.round(baseDamage * (1 - Math.abs(player.x - object.x) / (range * 1.3)))); player.health = Math.max(0, player.health - amount); player.alive = player.health > 0; player.lastDamageRound = game.roundNumber; }
    const structures = damageStructuresFromFall(game, object, fallDistance, material);
    falls.push({ id: object.id, type: object.type, distance: fallDistance, damage: baseDamage, structures });
  }
  return falls;
}

export function settlePlayers(game) {
  for (const player of game.players) {
    if (!player.alive || player.airborne) continue;
    if (player.surfaceClinging && player.spiderClimb) {
      const surface = spiderSurfaceRect(game.terrain, game.objects, player.surfaceClinging);
      if (surface) {
        const side = player.surfaceClinging.side; const radius = WORLD.tankRadius;
        if (side === 'top' || side === 'bottom') {
          player.x = clamp(player.x, surface.left + radius, surface.right - radius);
          player.y = side === 'top' ? surface.top - radius : surface.bottom + radius;
        } else {
          player.x = side === 'left' ? surface.left - radius : surface.right + radius;
          player.y = clamp(player.y, surface.top + radius, surface.bottom - radius);
        }
        continue;
      }
      player.surfaceClinging = null;
    }
    if (player.ceilingClinging && player.spiderClimb) { const ceiling = game.terrain.floatingPlatforms?.find((entry) => entry.id === player.ceilingClinging && entry.active && player.x >= entry.x && player.x <= entry.x + entry.width); if (ceiling) { player.y = ceiling.y + (ceiling.height || 8) + WORLD.tankRadius; continue; } player.ceilingClinging = null; }
    if (player.wallClinging) {
      const wallY = terrainY(game.terrain, player.x + player.wallClinging * (WORLD.tankRadius + 3));
      if (player.spiderClimb && wallY < player.y + WORLD.tankRadius - 5) continue;
      player.wallClinging = null;
    }
    const startFall = (targetY) => {
      if (targetY - player.y <= 14) return false;
      player.supportPlatformId = null; player.platformOffset = null;
      player.airborne = { vx: 0, vy: 0, parachute: false, falling: true, startY: player.y, updatedAt: Date.now() };
      return true;
    };
    const standOnPlatform = (platform) => {
      const clear = (x) => [x - WORLD.tankRadius - 2, x, x + WORLD.tankRadius + 2].every((at) => terrainY(game.terrain, at) >= platform.y - 1);
      let landingX = player.x;
      if (!clear(landingX)) {
        landingX = null;
        for (let offset = 4; offset <= platform.width && landingX === null; offset += 4) for (const direction of [-1, 1]) {
          const candidate = player.x + offset * direction;
          if (candidate >= platform.x && candidate <= platform.x + platform.width && clear(candidate)) { landingX = candidate; break; }
        }
      }
      if (landingX === null) return false;
      player.x = landingX; player.y = platform.y - WORLD.tankRadius; player.supportPlatformId = platform.id; player.platformOffset = landingX - platform.x;
      return true;
    };
    const current = game.terrain.floatingPlatforms?.find((platform) => platform.id === player.supportPlatformId && platform.active && player.x >= platform.x && player.x <= platform.x + platform.width);
    if (current && standOnPlatform(current)) continue;
    const surface = (player.buoyActive || player.classType === 'amphibian' && !player.teslaDisabledTurns) ? swimmableWaterSurface(game.terrain, game.waterZones, player.x) : null;
    if (surface !== null && player.y + WORLD.tankRadius >= surface - 2) { player.y = surface - WORLD.tankRadius * .45; player.supportPlatformId = null; player.platformOffset = null; player.swimming = true; continue; }
    player.swimming = false;
    const below = game.terrain.floatingPlatforms?.filter((platform) => platform.active && player.x >= platform.x && player.x <= platform.x + platform.width && platform.y >= player.y + WORLD.tankRadius - 3).sort((a, b) => a.y - b.y)[0];
    if (below) { if (startFall(below.y - WORLD.tankRadius)) continue; if (standOnPlatform(below)) continue; }
    player.supportPlatformId = null; player.platformOffset = null;
    const settled = resolveTankFootprint(game.terrain, player.x, { clearance: player.spiderClimb ? 28 : 7 });
    if (settled.ground > WORLD.height) { if (startFall(WORLD.height + 20)) continue; player.alive = false; player.health = 0; continue; }
    if (startFall(settled.ground - WORLD.tankRadius)) continue;
    player.x = settled.x; player.y = settled.ground - WORLD.tankRadius;
  }
}
