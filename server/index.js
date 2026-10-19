import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { CLIENT, SERVER } from '../shared/protocol.js';
import { activateClusterShot, activateFireworksShot, activateHarpoon, activateVerticalShot, chooseClassEvolution, claimReward, fire, movePlayer, nextTurn, ninjaFatal, publicGame, rerollBackpackerArsenal, selectPowerup, tickRoom, useArsenal, usePowerup } from './game.js';
import { RoomManager } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use((req, res, next) => { if (/\.(?:html|js|css)$/.test(req.path) || req.path === '/') res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate'); next(); });
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/health', (_req, res) => res.json({ ok: true }));
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((n) => n?.family === 'IPv4' && !n.internal).map((n) => n.address);
  console.log('\n=================================\n TANKDOTS WARS SERVER\n=================================');
  console.log(`Local: http://localhost:${port}`);
  for (const ip of ips) console.log(`LAN:   http://${ip}:${port}`);
  console.log('Players: 0/10\nRooms: 0\n');
});

const wss = new WebSocketServer({ server });
const rooms = new RoomManager();
const send = (ws, type, payload = {}) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type, payload }));
function audience(room) { return [...room.players, ...(room.spectators || [])]; }
function broadcast(room, type, payload) { for (const member of audience(room)) if (member.socket) send(member.socket, type, payload); }
function sync(room) {
  broadcast(room, SERVER.ROOM_STATE, rooms.publicRoom(room));
  if (room.game) for (const player of room.players) if (player.socket) send(player.socket, SERVER.GAME_STATE, publicGame(room.game, player.id));
  if (room.game) for (const spectator of room.spectators || []) if (spectator.socket) send(spectator.socket, SERVER.GAME_STATE, publicGame(room.game, null));
}
function broadcastShot(room, shot) {
  const shooter = room.game?.players.find((player) => player.id === shot.shooterId);
  for (const player of audience(room)) {
    if (!player.socket) continue;
    const concealed = shooter?.invisibleTurns > 0 && player.id !== shooter.id;
    const results = concealed ? shot.results.map((result) => ({ ...result, path: [], teleport: null, concealed: true })) : shot.results;
    send(player.socket, SERVER.SHOT_RESULT, { ...shot, results });
  }
}

wss.on('connection', (ws) => {
  send(ws, SERVER.WELCOME, { message: 'Conectado ao TankDots Wars' });
  ws.on('message', (raw) => {
    try {
      const { type, payload = {} } = JSON.parse(raw.toString());
      let room;
      if (type === CLIENT.CREATE_ROOM) { const result = rooms.create(ws, payload); send(ws, SERVER.WELCOME, { playerId: ws.playerId, token: result.token }); sync(result.room); return; }
      if (type === CLIENT.JOIN_ROOM) { const result = rooms.join(ws, payload); send(ws, SERVER.WELCOME, { playerId: ws.playerId, token: result.token }); sync(result.room); return; }
      if (type === CLIENT.WATCH_ROOM) { const result = rooms.watch(ws, payload); send(ws, SERVER.WELCOME, { spectatorId: result.spectator.id, token: result.spectator.token, spectator: true }); sync(result.room); return; }
      if (type === CLIENT.PING) { send(ws, SERVER.PONG, { at: Date.now() }); return; }
      room = rooms.rooms.get(ws.roomCode); if (!room) throw new Error('Entre em uma sala primeiro.');
      if (type === CLIENT.START_GAME) rooms.setReady(room.code, ws.playerId);
      else if (type === CLIENT.SET_CLASS) rooms.setClass(room.code, ws.playerId, payload.classType);
      else if (type === CLIENT.SET_ARSENAL) rooms.setArsenal(room.code, ws.playerId, payload.choices);
      else if (type === CLIENT.MOVE) movePlayer(room, ws.playerId, payload.direction, payload.arsenal, { continuous: true });
      else if (type === CLIENT.SELECT_POWERUP) selectPowerup(room, ws.playerId, payload.type ?? null);
      else if (type === CLIENT.USE_POWERUP) usePowerup(room, ws.playerId, payload);
      else if (type === CLIENT.USE_ARSENAL) useArsenal(room, ws.playerId, payload);
      else if (type === CLIENT.NINJA_FATAL) ninjaFatal(room, ws.playerId, payload.targetId);
      else if (type === CLIENT.REROLL_BACKPACKER) rerollBackpackerArsenal(room, ws.playerId);
      else if (type === CLIENT.CLAIM_REWARD) claimReward(room, ws.playerId, payload.type);
      else if (type === CLIENT.CHOOSE_CLASS_EVOLUTION) chooseClassEvolution(room, ws.playerId, payload.type);
      else if (type === CLIENT.CHAT) { const author = room.players.find((p) => p.id === ws.playerId) || (room.spectators || []).find((entry) => entry.id === ws.spectatorId); const text = String(payload.text || '').trim().replace(/[<>]/g, '').slice(0, 160); if (text && author) broadcast(room, SERVER.CHAT, { id: `${Date.now()}-${author.id}`, playerId: author.id, nickname: author.nickname, color: author.color || '#b7c5d8', spectator: Boolean(ws.isSpectator), text, at: Date.now() }); return; }
      else if (type === CLIENT.LEAVE_ROOM) { const left = rooms.leave(ws); ws.roomCode = null; ws.playerId = null; if (left && rooms.rooms.has(left.code)) sync(left); return; }
      else if (type === CLIENT.FIRE) { const results = fire(room, ws.playerId, payload); broadcastShot(room, { shooterId: ws.playerId, results }); }
      else if (type === CLIENT.ACTIVATE_VERTICAL) { const results = activateVerticalShot(room, ws.playerId, payload.token, payload.target); broadcastShot(room, { shooterId: ws.playerId, results, replaceVertical: true, verticalActivated: true }); }
      else if (type === CLIENT.ACTIVATE_CLUSTER) { const results = activateClusterShot(room, ws.playerId, payload.token); broadcastShot(room, { shooterId: ws.playerId, results, replaceCluster: true }); }
      else if (type === CLIENT.ACTIVATE_FIREWORKS) { const results = activateFireworksShot(room, ws.playerId, payload.token); broadcastShot(room, { shooterId: ws.playerId, results, replaceFireworks: true }); }
      else if (type === CLIENT.ACTIVATE_HARPOON) activateHarpoon(room, ws.playerId);
      else if (type === CLIENT.PASS_TURN) { if (room.game?.players[room.game.turnIndex]?.id !== ws.playerId) throw new Error('Não é seu turno.'); if (room.game.shotEndsAt || room.game.harpoonPull) throw new Error('Aguarde a animação concluir.'); if (room.game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.'); nextTurn(room); }
      else if (type === CLIENT.REMATCH) { if (room.hostId !== ws.playerId) throw new Error('Apenas o anfitrião pode reiniciar.'); room.game = null; for (const player of room.players) player.ready = Boolean(player.isBot); }
      sync(room);
    } catch (error) { send(ws, SERVER.ERROR, { message: error.message || 'Mensagem inválida.' }); }
  });
  ws.on('close', () => { const room = rooms.disconnect(ws); if (room && rooms.rooms.has(room.code)) sync(room); });
});

setInterval(() => {
  for (const room of rooms.rooms.values()) {
    const result = tickRoom(room);
    if (result?.shot) broadcastShot(room, result.shot);
    if (result?.changed) sync(room);
  }
}, 300);
