import crypto from 'node:crypto';
import { ARSENAL_ITEMS, CLASS_DEFS, DEFAULT_ARSENAL, PLAYER_COLORS } from '../shared/constants.js';
import { createGame, sanitizeRules } from './game.js';

const cleanName = (value, fallback) => String(value || fallback).trim().replace(/[<>]/g, '').slice(0, 18);
const dealArsenal = () => [...ARSENAL_ITEMS];

export class RoomManager {
  constructor() { this.rooms = new Map(); }
  create(socket, payload = {}) {
    let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const player = this.makePlayer(socket, payload.nickname, 0);
    const rules = sanitizeRules(payload.rules);
    rules.botCount = Math.min(rules.botCount, rules.maxPlayers - 1);
    const bots = Array.from({ length: rules.botCount }, (_, index) => this.makeBot(index, index + 1));
    const room = { code, name: cleanName(payload.roomName, 'Batalha rápida'), hostId: player.id, rules, players: [player, ...bots], spectators: [], game: null, createdAt: Date.now() };
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
    room.players.push(player); socket.roomCode = code; socket.playerId = player.id;
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
    return { id: crypto.randomUUID(), token: crypto.randomBytes(18).toString('hex'), nickname: cleanName(nickname, `Player ${index + 1}`), color: PLAYER_COLORS[index], connected: true, socket, arsenal: [...DEFAULT_ARSENAL], arsenalOffer: dealArsenal(), classType: 'armored' };
  }
  makeBot(index, colorIndex) {
    const names = ['Rook', 'Vektor', 'Nova', 'Diesel', 'Pixel', 'Echo', 'Atlas', 'Bolt', 'Mako'];
    const personalities = ['aggressive', 'collector', 'defensive', 'demolisher', 'support'];
    return { id: `bot-${crypto.randomUUID()}`, nickname: `BOT ${names[index]}`, color: PLAYER_COLORS[colorIndex], connected: true, isBot: true, personality: personalities[index % personalities.length], socket: null, arsenal: ['heavy', 'fireworks', 'zeus'], classType: Object.keys(CLASS_DEFS)[index % Object.keys(CLASS_DEFS).length] };
  }
  setClass(code, playerId, classType) {
    const room = this.rooms.get(code); if (!room || !room.rules.classesEnabled) throw new Error('As classes estão desativadas nesta partida.');
    if (room.game && room.game.phase !== 'class') throw new Error('O tempo para escolher a classe terminou.');
    const player = room.players.find((entry) => entry.id === playerId); if (!player || player.isBot) throw new Error('Jogador inválido.');
    if (!CLASS_DEFS[classType]) throw new Error('Escolha uma classe válida.');
    player.classType = classType;
    const gamePlayer = room.game?.players.find((entry) => entry.id === playerId);
    if (gamePlayer) {
      const previousMax = gamePlayer.maxHealth;
      gamePlayer.classType = classType;
      gamePlayer.maxHealth = room.rules.health + (classType === 'armored' ? 50 : 0);
      gamePlayer.health = Math.min(gamePlayer.maxHealth, gamePlayer.health + Math.max(0, gamePlayer.maxHealth - previousMax));
      gamePlayer.spiderClimb = classType === 'ninja';
      gamePlayer.arsenal = [...player.arsenal];
      if (classType === 'meteorologist' && !gamePlayer.arsenal.includes('lightningRod')) gamePlayer.arsenal.push('lightningRod');
      if (classType === 'saboteur' && !gamePlayer.arsenal.includes('teslaOrb')) gamePlayer.arsenal.push('teslaOrb');
      gamePlayer.ammo = Object.fromEntries(gamePlayer.arsenal.map((type) => [type, 1]));
    }
    return room;
  }
  setArsenal(code, playerId, choices) {
    const room = this.rooms.get(code); if (!room || (room.game && room.game.phase !== 'arsenal')) throw new Error('O tempo para alterar o arsenal terminou.');
    const player = room.players.find((entry) => entry.id === playerId); if (!player || player.isBot) throw new Error('Jogador inválido.');
    const clean = [...new Set(Array.isArray(choices) ? choices : [])].filter((type) => ARSENAL_ITEMS.includes(type));
    if (clean.length !== 3) throw new Error('Escolha exatamente 3 itens para o arsenal.');
    if (clean.some((type) => !player.arsenalOffer?.includes(type))) throw new Error('Escolha somente entre as cartas oferecidas.');
    player.arsenal = clean;
    const gamePlayer = room.game?.players.find((entry) => entry.id === playerId);
    if (gamePlayer) { gamePlayer.arsenal = [...clean]; if (player.classType === 'meteorologist' && !gamePlayer.arsenal.includes('lightningRod')) gamePlayer.arsenal.push('lightningRod'); if (player.classType === 'saboteur' && !gamePlayer.arsenal.includes('teslaOrb')) gamePlayer.arsenal.push('teslaOrb'); gamePlayer.ammo = Object.fromEntries(gamePlayer.arsenal.map((type) => [type, 1])); }
    return room;
  }
  start(code, playerId) {
    const room = this.rooms.get(code);
    if (!room || room.hostId !== playerId) throw new Error('Apenas o anfitrião pode iniciar.');
    if (room.players.length < 2) throw new Error('São necessários pelo menos 2 jogadores.');
    if (room.rules.gameMode === 'coop' && !room.players.some((player) => player.isBot)) throw new Error('O modo cooperativo precisa de pelo menos um bot adversário.');
    room.game = createGame(room); return room;
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
      const humans = room.players.filter((p) => !p.isBot);
      if (!humans.length) this.rooms.delete(room.code);
      else if (room.hostId === socket.playerId) room.hostId = humans[0].id;
    }
    return room;
  }

  leave(socket) { return this.disconnect(socket); }
}
