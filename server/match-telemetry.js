import { matchMedals, matchSpotlights } from '../shared/achievements.js';

const blank = () => ({ playMs: 0, movement: 0, jumps: 0, flightMs: 0, glideMs: 0, teleports: 0, territoryCells: 0, damage: 0, destruction: 0, kills: 0, damageTaken: 0, healed: 0, healingDone: 0, shots: 0, arsenalUses: 0, powerupUses: 0, reactionMs: 0, reactionCount: 0, classes: {}, arsenal: {}, powerups: {} });
const keyFor = (player) => `${Math.floor(player.x / 120)}:${Math.floor(player.y / 100)}`;
const add = (record, group, key, value = 1) => { record.metrics[group][key] = (record.metrics[group][key] || 0) + value; };

export class MatchTelemetry {
  constructor(game, now = Date.now()) {
    this.gameId = game.matchId;
    this.startedAt = now;
    this.records = new Map(game.players.map((player) => [player.id, {
      metrics: blank(), cells: new Set([keyFor(player)]), lastX: player.x, lastY: player.y, lastHealth: player.health, lastAt: now,
      lastBlink: player.lastBlink?.serial, lastJump: player.lastJump?.serial, lastLaunch: player.lastLaunch?.serial,
      inventory: [...(player.inventory || [])], arsenalLastUsed: { ...player.arsenalLastUsed }, activeTurn: null, turnSeenAt: null, reactedTurns: new Set(),
    }]));
    this.seenPulses = new Set();
  }

  observe(room, now = Date.now()) {
    const game = room.game;
    if (!game || game.matchId !== this.gameId) return;
    for (const player of game.players) {
      const record = this.records.get(player.id);
      if (!record) continue;
      const metrics = record.metrics;
      const elapsed = Math.max(0, Math.min(1000, now - record.lastAt));
      if (game.phase === 'playing' && player.alive && !game.paused) {
        metrics.playMs += elapsed;
        if (player.airborne) {
          if (player.airborne.parachute || player.airborne.falling && Math.abs(player.airborne.vy || 0) < 55) metrics.glideMs += elapsed;
          else metrics.flightMs += elapsed;
        }
        record.cells.add(keyFor(player));
        const moved = Math.hypot(player.x - record.lastX, player.y - record.lastY);
        const blinked = player.lastBlink?.serial && player.lastBlink.serial !== record.lastBlink;
        if (!blinked && moved <= 260) metrics.movement += moved;
        metrics.territoryCells = record.cells.size;
        if (game.players[game.turnIndex]?.id === player.id && record.activeTurn !== game.turnNumber) {
          record.activeTurn = game.turnNumber;
          record.turnSeenAt = now;
        }
      }
      if (player.lastBlink?.serial && player.lastBlink.serial !== record.lastBlink) metrics.teleports += 1;
      if (player.lastJump?.serial && player.lastJump.serial !== record.lastJump && player.lastJump.kind === 'jump') metrics.jumps += 1;
      if (player.lastLaunch?.serial && player.lastLaunch.serial !== record.lastLaunch && player.lastLaunch.kind === 'spiderLeap') metrics.jumps += 1;
      if (player.health < record.lastHealth) metrics.damageTaken += record.lastHealth - player.health;
      else if (player.health > record.lastHealth) metrics.healed += player.health - record.lastHealth;
      const previousItems = new Map();
      for (const item of record.inventory) previousItems.set(item, (previousItems.get(item) || 0) + 1);
      const currentItems = new Map();
      for (const item of player.inventory || []) currentItems.set(item, (currentItems.get(item) || 0) + 1);
      if (player.alive) for (const [item, count] of previousItems) {
        const consumed = Math.max(0, count - (currentItems.get(item) || 0));
        if (consumed) { metrics.powerupUses += consumed; add(record, 'powerups', item, consumed); }
      }
      for (const [weapon, usedAt] of Object.entries(player.arsenalLastUsed || {})) if (record.arsenalLastUsed[weapon] !== usedAt) {
        metrics.arsenalUses += 1; add(record, 'arsenal', weapon);
      }
      record.lastX = player.x; record.lastY = player.y; record.lastHealth = player.health; record.lastAt = now;
      record.lastBlink = player.lastBlink?.serial; record.lastJump = player.lastJump?.serial; record.lastLaunch = player.lastLaunch?.serial;
      record.inventory = [...(player.inventory || [])]; record.arsenalLastUsed = { ...player.arsenalLastUsed };
    }
    for (const pulse of game.lastClassPulses || []) {
      if (!pulse.serial || this.seenPulses.has(pulse.serial)) continue;
      this.seenPulses.add(pulse.serial);
      if (pulse.type !== 'healer') continue;
      const healer = game.players.find((player) => player.classType === 'healer' && Math.hypot(player.x - pulse.x, player.y - pulse.y) < 4);
      const record = this.records.get(healer?.id);
      if (record) record.metrics.healingDone += (pulse.heals || []).filter((heal) => heal.playerId !== healer.id).reduce((sum, heal) => sum + (heal.amount || 0), 0);
    }
  }

  action(room, playerId, type, now = Date.now()) {
    const record = this.records.get(playerId);
    const game = room.game;
    if (!record || !game || game.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId) return;
    if (!['MOVE', 'FIRE', 'USE_ARSENAL', 'USE_POWERUP', 'NINJA_FATAL', 'PASS_TURN'].includes(type)) return;
    const turn = game.turnNumber;
    if (record.reactedTurns.has(turn)) return;
    record.reactedTurns.add(turn);
    record.metrics.reactionMs += Math.max(0, now - (record.turnSeenAt || now));
    record.metrics.reactionCount += 1;
  }

  shot(shot) {
    const record = this.records.get(shot.shooterId);
    const weapon = shot.results?.find((result) => result.weapon)?.weapon;
    if (record && weapon) {
      // Charge-based weapons are recorded by arsenalLastUsed during observe().
      if (weapon === 'standard' && !shot.replaceVertical && !shot.replaceCluster && !shot.replaceFireworks) { add(record, 'arsenal', weapon); record.metrics.arsenalUses += 1; }
      if (shot.results?.some((result) => result.teleport)) record.metrics.teleports += 1;
    }
  }

  finish(room, now = Date.now()) {
    this.observe(room, now);
    const game = room.game;
    const entries = game.players.map((player) => {
      const metrics = { ...this.records.get(player.id).metrics };
      metrics.playMs = Math.round(metrics.playMs);
      metrics.movement = Math.round(metrics.movement);
      metrics.damage = player.stats?.damage || 0;
      metrics.destruction = player.stats?.destruction || 0;
      metrics.kills = player.stats?.destroyed?.tank || 0;
      metrics.shots = player.stats?.shots || 0;
      metrics.healingDone += player.stats?.healingDone || 0;
      if (player.stats?.arsenalUseCounts) {
        metrics.arsenal = { ...player.stats.arsenalUseCounts, ...(metrics.arsenal.standard ? { standard: metrics.arsenal.standard } : {}) };
        metrics.arsenalUses = Object.values(metrics.arsenal).reduce((sum, count) => sum + count, 0);
      }
      metrics.classes = player.classType ? { [player.classType]: 1 } : {};
      return { playerId: player.id, nickname: player.nickname, classType: player.classType, metrics, medals: matchMedals(metrics) };
    });
    return { matchId: game.matchId, endedAt: now, players: entries, spotlights: matchSpotlights(entries) };
  }
}
