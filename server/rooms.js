import crypto from 'node:crypto';
import { CLASS_DEFS, DEFAULT_ARSENAL, PLAYER_COLORS, SELECTABLE_ARSENAL_ITEMS, TEAM_COLORS } from '../shared/constants.js';
import { createGame, sanitizeRules } from './game.js';
import { driveStats } from '../shared/movement.js';
import { chooseBotArsenal, chooseBotClass } from './bot-loadout.js';

const cleanName = (value, fallback) => String(value || fallback).trim().replace(/[<>]/g, '').slice(0, 18);
const dealArsenal = () => [...SELECTABLE_ARSENAL_ITEMS];
function syncTeamAppearance(room) {
  const mode = room.rules.gameMode;
  const count = Math.max(2, Math.min(room.rules.teamCount || 2, room.players.length));
  room.players.forEach((player, index) => {
    player.team = ['teams', 'teamHill'].includes(mode) ? `team-${index % count + 1}` : player.isBot ? 'bots' : 'humans';
    player.color = ['teams', 'teamHill'].includes(mode) ? TEAM_COLORS[index % count] : mode === 'coop' ? TEAM_COLORS[player.isBot ? 1 : 0] : PLAYER_COLORS[index % PLAYER_COLORS.length];
  });
}

function rerollBotArsenal(bot) {
  const previous = bot.arsenal.join(',');
  let next = chooseBotArsenal(bot.classType);
  for (let attempt = 0; next.join(',') === previous && attempt < 4; attempt += 1) next = chooseBotArsenal(bot.classType);
  if (next.join(',') === previous) {
    next[0] = SELECTABLE_ARSENAL_ITEMS.find((type) => !next.includes(type));
  }
  bot.arsenal = next;
}

function syncBotClasses(room) {
  if (!['teams', 'teamHill', 'coop'].includes(room.rules.gameMode)) return;
  for (const team of new Set(room.players.map((player) => player.team))) {
    const members = room.players.filter((player) => player.team === team);
    const occupied = new Set(members.filter((player) => !player.isBot && player.classSelected).map((player) => player.classType));
    const reroll = [];
    for (const bot of members.filter((player) => player.isBot)) {
      if (occupied.has(bot.classType)) reroll.push(bot);
      else occupied.add(bot.classType);
    }
    for (const bot of reroll) {
      bot.classType = chooseBotClass([...occupied]);
      rerollBotArsenal(bot);
      const gameBot = room.game?.players.find((player) => player.id === bot.id);
      if (gameBot) {
        const previousMax = gameBot.maxHealth;
        gameBot.classType = bot.classType;
        gameBot.maxHealth = room.rules.health + (bot.classType === 'armored' ? 50 : 0);
        gameBot.health = Math.min(gameBot.maxHealth, gameBot.health + Math.max(0, gameBot.maxHealth - previousMax));
        gameBot.spiderClimb = false;
        gameBot.fuel = driveStats(gameBot).maxFuel;
        gameBot.arsenal = [...bot.arsenal];
        if (bot.classType === 'saboteur' && !gameBot.arsenal.includes('teslaOrb')) gameBot.arsenal.push('teslaOrb');
        if (bot.classType === 'engineer' && !gameBot.arsenal.includes('sentry')) gameBot.arsenal.push('sentry');
        gameBot.ammo = Object.fromEntries(gameBot.arsenal.map((type) => [type, type === 'superheat' ? 0 : 1])); gameBot.superheatEnemyTurns = 0;
        gameBot.megaCannonCharge = 0;
      }
      occupied.add(bot.classType);
    }
  }
}

export class RoomManager {
  constructor() { this.rooms = new Map(); }
  create(socket, payload = {}) {
    let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const player = this.makePlayer(socket, payload.nickname, 0);
    const rules = sanitizeRules(payload.quickTraining ? { maxPlayers: 2, botCount: 1, botDifficulty: 'easy', roundLimit: 10, turnSeconds: 30, powerupCount: 16, gameSpeed: 1, mapType: 'flat', health: 200, gameMode: 'ffa', classesEnabled: true, mines: false } : payload.rules);
    rules.training = Boolean(payload.quickTraining);
    rules.botCount = Math.min(rules.botCount, rules.maxPlayers - 1);
    const bots = Array.from({ length: rules.botCount }, (_, index) => this.makeBot(index, index + 1));
    if (rules.training) { player.classType = 'armored'; player.classSelected = true; player.arsenal = ['heavy', 'zeus', 'jump']; player.arsenalSelected = true; player.ready = true; }
    const room = { code, name: cleanName(payload.roomName, 'Batalha rápida'), hostId: player.id, rules, players: [player, ...bots], spectators: [], game: null, createdAt: Date.now() };
    syncTeamAppearance(room); syncBotClasses(room);
    if (rules.training) { room.game = createGame(room, true); room.game.rouletteEndsAt = Date.now() + 4200; }
    this.rooms.set(code, room); socket.roomCode = code; socket.playerId = player.id;
    return { room, token: player.token };
  }
  join(socket, payload = {}) {
    const code = String(payload.code || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error('Sala não encontrada.');
    const reconnect = payload.token && room.players.find((p) => p.token === payload.token);
    if (reconnect) { reconnect.connected = true; reconnect.socket = socket; socket.roomCode = code; socket.playerId = reconnect.id; return { room, token: reconnect.token }; }
    if (room.game || room.players.length >= room.rules.maxPlayers) throw new Error(room.game ? 'A partida já começou.' : 'Sala lotada.');
    if (room.players.some((p) => p.nickname.toLowerCase() === String(payload.nickname).trim().toLowerCase())) throw new Error('Esse nickname já está em uso.');
    const player = this.makePlayer(socket, payload.nickname, room.players.length);
    room.players.push(player); syncTeamAppearance(room); syncBotClasses(room); socket.roomCode = code; socket.playerId = player.id;
    return { room, token: player.token };
  }
  watch(socket, payload = {}) {
    const code = String(payload.code || '').trim().toUpperCase(); const room = this.rooms.get(code); if (!room) throw new Error('Sala não encontrada.'); room.spectators ||= [];
    const reconnect = payload.token && room.spectators.find((entry) => entry.token === payload.token);
    if (reconnect) { reconnect.socket = socket; reconnect.connected = true; socket.roomCode = code; socket.spectatorId = reconnect.id; socket.isSpectator = true; return { room, spectator: reconnect }; }
    const spectator = { id: `spectator-${crypto.randomUUID()}`, token: crypto.randomBytes(18).toString('hex'), nickname: cleanName(payload.nickname, `Espectador ${room.spectators.length + 1}`), connected: true, socket };
    room.spectators.push(spectator); socket.roomCode = code; socket.spectatorId = spectator.id; socket.isSpectator = true; return { room, spectator };
  }
  makePlayer(socket, nickname, index) {
    return { id: crypto.randomUUID(), token: crypto.randomBytes(18).toString('hex'), nickname: cleanName(nickname, `Player ${index + 1}`), color: PLAYER_COLORS[index], connected: true, socket, arsenal: [...DEFAULT_ARSENAL], arsenalOffer: dealArsenal(), classType: 'armored', classSelected: false, arsenalSelected: false, ready: false };
  }
  makeBot(index, colorIndex) {
    const names = ['Rook', 'Vektor', 'Nova', 'Diesel', 'Pixel', 'Echo', 'Atlas', 'Bolt', 'Mako'];
    const personalities = ['aggressive', 'collector', 'defensive', 'demolisher', 'support'];
    const classType = chooseBotClass();
    return { id: `bot-${crypto.randomUUID()}`, nickname: `BOT ${names[index]}`, color: PLAYER_COLORS[colorIndex], connected: true, isBot: true, personality: personalities[index % personalities.length], socket: null, arsenal: chooseBotArsenal(classType), classType, classSelected: true, arsenalSelected: true, ready: true };
  }
  setClass(code, playerId, classType) {
    const room = this.rooms.get(code); if (!room || !room.rules.classesEnabled) throw new Error('As classes estão desativadas nesta partida.');
    if (room.game && room.game.phase !== 'class') throw new Error('O tempo para escolher a classe terminou.');
    const player = room.players.find((entry) => entry.id === playerId); if (!player || player.isBot) throw new Error('Jogador inválido.');
    if (!CLASS_DEFS[classType]) throw new Error('Escolha uma classe válida.');
    player.classType = classType;
    player.classSelected = true; player.ready = false;
    syncBotClasses(room);
    const gamePlayer = room.game?.players.find((entry) => entry.id === playerId);
    if (gamePlayer) {
      const previousMax = gamePlayer.maxHealth;
      gamePlayer.classType = classType;
      gamePlayer.maxHealth = room.rules.health + (classType === 'armored' ? 50 : 0);
      gamePlayer.health = Math.min(gamePlayer.maxHealth, gamePlayer.health + Math.max(0, gamePlayer.maxHealth - previousMax));
      gamePlayer.spiderClimb = false;
      gamePlayer.fuel = driveStats(gamePlayer).maxFuel;
      gamePlayer.arsenal = player.arsenal.filter((type) => !['megaCannon', 'lightningRod'].includes(type));
      if (classType === 'saboteur' && !gamePlayer.arsenal.includes('teslaOrb')) gamePlayer.arsenal.push('teslaOrb');
      if (classType === 'engineer' && !gamePlayer.arsenal.includes('sentry')) gamePlayer.arsenal.push('sentry');
      gamePlayer.ammo = Object.fromEntries(gamePlayer.arsenal.map((type) => [type, type === 'superheat' ? 0 : 1])); gamePlayer.superheatEnemyTurns = 0;
      gamePlayer.megaCannonCharge = 0;
    }
    return room;
  }
  setArsenal(code, playerId, choices) {
    const room = this.rooms.get(code); if (!room || (room.game && room.game.phase !== 'arsenal')) throw new Error('O tempo para alterar o arsenal terminou.');
    const player = room.players.find((entry) => entry.id === playerId); if (!player || player.isBot) throw new Error('Jogador inválido.');
    const clean = [...new Set(Array.isArray(choices) ? choices : [])].filter((type) => SELECTABLE_ARSENAL_ITEMS.includes(type));
    if (clean.length !== 3) throw new Error('Escolha exatamente 3 itens para o arsenal.');
    if (clean.some((type) => !player.arsenalOffer?.includes(type))) throw new Error('Escolha somente entre as cartas oferecidas.');
    player.arsenal = clean;
    player.arsenalSelected = true; player.ready = false;
    const gamePlayer = room.game?.players.find((entry) => entry.id === playerId);
    if (gamePlayer) { gamePlayer.arsenal = [...clean]; if (player.classType === 'saboteur' && !gamePlayer.arsenal.includes('teslaOrb')) gamePlayer.arsenal.push('teslaOrb'); if (player.classType === 'engineer' && !gamePlayer.arsenal.includes('sentry')) gamePlayer.arsenal.push('sentry'); gamePlayer.ammo = Object.fromEntries(gamePlayer.arsenal.map((type) => [type, type === 'superheat' ? 0 : 1])); gamePlayer.superheatEnemyTurns = 0; }
    return room;
  }
  start(code, playerId) {
    const room = this.rooms.get(code);
    if (!room || room.hostId !== playerId) throw new Error('Apenas o anfitrião pode iniciar.');
    if (room.players.length < 2) throw new Error('São necessários pelo menos 2 jogadores.');
    if (room.rules.gameMode === 'coop' && !room.players.some((player) => player.isBot)) throw new Error('O modo cooperativo precisa de pelo menos um bot adversário.');
    room.game = createGame(room); return room;
  }
  setReady(code, playerId) {
    const room = this.rooms.get(code);
    if (!room || room.game) throw new Error('A partida já começou.');
    const player = room.players.find((entry) => entry.id === playerId && !entry.isBot && entry.connected);
    if (!player) throw new Error('Jogador inválido.');
    if (room.players.length < 2) throw new Error('São necessários pelo menos 2 jogadores.');
    if (room.rules.gameMode === 'coop' && !room.players.some((entry) => entry.isBot)) throw new Error('O modo cooperativo precisa de pelo menos um bot adversário.');
    if (!player.ready && room.rules.classesEnabled && !player.classSelected) throw new Error('Escolha sua classe antes de marcar Pronto.');
    if (!player.ready && !player.arsenalSelected) throw new Error('Escolha seu arsenal antes de marcar Pronto.');
    player.ready = !player.ready;
    if (room.players.every((entry) => entry.ready)) room.game = createGame(room, true);
    return room;
  }
  publicRoom(room) {
    return { code: room.code, name: room.name, hostId: room.hostId, rules: room.rules, players: room.players.map(({ socket, token, ...p }) => p), spectators: (room.spectators || []).map(({ socket, token, ...entry }) => entry), spectatorCount: (room.spectators || []).filter((entry) => entry.connected).length, phase: room.game?.phase || 'lobby' };
  }
  disconnect(socket) {
    const room = this.rooms.get(socket.roomCode); if (!room) return null;
    if (socket.isSpectator) { const spectator = (room.spectators || []).find((entry) => entry.id === socket.spectatorId); if (spectator) { spectator.connected = false; spectator.socket = null; } return room; }
    const player = room.players.find((p) => p.id === socket.playerId); if (player) { player.connected = false; player.socket = null; }
    if (room.game && player && !player.isBot) {
      player.isBot = true; player.nickname = `${player.nickname} [BOT]`;
      const gamePlayer = room.game.players.find((p) => p.id === player.id);
      if (gamePlayer) { gamePlayer.isBot = true; gamePlayer.connected = true; }
      const humans = room.players.filter((p) => !p.isBot && p.connected);
      if (room.hostId === player.id && humans.length) room.hostId = humans[0].id;
    }
    if (!room.game) {
      room.players = room.players.filter((p) => p.id !== socket.playerId);
      if (room.players.length) { syncTeamAppearance(room); syncBotClasses(room); }
      const humans = room.players.filter((p) => !p.isBot);
      if (!humans.length) this.rooms.delete(room.code);
      else if (room.hostId === socket.playerId) room.hostId = humans[0].id;
    }
    return room;
  }

  leave(socket) { return this.disconnect(socket); }
}
