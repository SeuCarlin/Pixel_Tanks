import crypto from 'node:crypto';
import { ARSENAL_ITEMS, DEFAULT_ARSENAL, PLAYER_COLORS } from '../shared/constants.js';
import { createGame, sanitizeRules } from './game.js';

const cleanName = (value, fallback) => String(value || fallback).trim().replace(/[<>]/g, '').slice(0, 18);
const dealArsenal = () => {
  const remaining = ARSENAL_ITEMS.filter((type) => !DEFAULT_ARSENAL.includes(type));
  for (let index = remaining.length - 1; index > 0; index -= 1) { const swap = crypto.randomInt(index + 1); [remaining[index], remaining[swap]] = [remaining[swap], remaining[index]]; }
  return [...DEFAULT_ARSENAL, ...remaining.slice(0, 3)];
};

export class RoomManager {
  constructor() { this.rooms = new Map(); }
  create(socket, payload = {}) {
    let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const player = this.makePlayer(socket, payload.nickname, 0);
    const rules = sanitizeRules(payload.rules);
    rules.botCount = Math.min(rules.botCount, rules.maxPlayers - 1);
    const bots = Array.from({ length: rules.botCount }, (_, index) => this.makeBot(index, index + 1));
    const room = { code, name: cleanName(payload.roomName, 'Batalha rápida'), hostId: player.id, rules, players: [player, ...bots], game: null, createdAt: Date.now() };
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
  makePlayer(socket, nickname, index) {
    return { id: crypto.randomUUID(), token: crypto.randomBytes(18).toString('hex'), nickname: cleanName(nickname, `Player ${index + 1}`), color: PLAYER_COLORS[index], connected: true, socket, arsenal: [...DEFAULT_ARSENAL], arsenalOffer: dealArsenal() };
  }
  makeBot(index, colorIndex) {
    const names = ['Rook', 'Vektor', 'Nova', 'Diesel', 'Pixel', 'Echo', 'Atlas', 'Bolt', 'Mako'];
    return { id: `bot-${crypto.randomUUID()}`, nickname: `BOT ${names[index]}`, color: PLAYER_COLORS[colorIndex], connected: true, isBot: true, socket: null, arsenal: ['heavy', 'fireworks', 'zeus'] };
  }
  setArsenal(code, playerId, choices) {
    const room = this.rooms.get(code); if (!room || (room.game && room.game.phase !== 'arsenal')) throw new Error('O tempo para alterar o arsenal terminou.');
    const player = room.players.find((entry) => entry.id === playerId); if (!player || player.isBot) throw new Error('Jogador inválido.');
    const clean = [...new Set(Array.isArray(choices) ? choices : [])].filter((type) => ARSENAL_ITEMS.includes(type));
    if (clean.length !== 3) throw new Error('Escolha exatamente 3 itens para o arsenal.');
    if (clean.some((type) => !player.arsenalOffer?.includes(type))) throw new Error('Escolha somente entre as 6 cartas oferecidas.');
    player.arsenal = clean;
    const gamePlayer = room.game?.players.find((entry) => entry.id === playerId);
    if (gamePlayer) { gamePlayer.arsenal = [...clean]; gamePlayer.ammo = Object.fromEntries(clean.map((type) => [type, 1])); }
    return room;
  }
  start(code, playerId) {
    const room = this.rooms.get(code);
    if (!room || room.hostId !== playerId) throw new Error('Apenas o anfitrião pode iniciar.');
    if (room.players.length < 2) throw new Error('São necessários pelo menos 2 jogadores.');
    room.game = createGame(room); return room;
  }
  publicRoom(room) {
    return { code: room.code, name: room.name, hostId: room.hostId, rules: room.rules, players: room.players.map(({ socket, token, ...p }) => p), phase: room.game?.phase || 'lobby' };
  }
  disconnect(socket) {
    const room = this.rooms.get(socket.roomCode); if (!room) return null;
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
