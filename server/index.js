import os from 'node:os';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { CLIENT, PROTOCOL_VERSION, SERVER } from '../shared/protocol.js';
import { refreshTankStates } from '../shared/tank-states.js';
import { activateClusterShot, activateFireworksShot, activateHarpoon, activateVerticalShot, chooseClassEvolution, claimReward, debugAction, fire, movePlayer, moveSpecialistDeployable, nextTurn, ninjaFatal, publicGame, rerollBackpackerArsenal, selectPowerup, setPlayerAim, setSoloControl, tickRoom, useArsenal, usePowerup } from './game.js';
import { RoomManager } from './rooms.js';
import { isLocalRequest, lanUrls, publicOrigin } from './host-info.js';
import { AccountStore } from './accounts.js';
import { MatchTelemetry } from './match-telemetry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const accounts = new AccountStore();
const authFailures = new Map();
app.use('/api/account', express.json({ limit: '2kb' }), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const bearer = (req) => /^Bearer ([a-f0-9]{64})$/.exec(req.get('Authorization') || '')?.[1] || null;
const accountIdFor = (token) => token ? accounts.accountForToken(token)?.id || null : null;
for (const action of ['register', 'login']) app.post(`/api/account/${action}`, (req, res) => {
  const key = `${req.socket.remoteAddress}:${String(req.body?.username || '').toLocaleLowerCase('pt-BR')}`;
  const entry = authFailures.get(key) || { attempts: 0, until: 0 };
  if (entry.until > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
  try {
    const result = action === 'register' ? accounts.register(req.body?.username, req.body?.password) : accounts.login(req.body?.username, req.body?.password);
    authFailures.delete(key);
    res.status(action === 'register' ? 201 : 200).json(result);
  } catch (error) {
    entry.attempts += 1; if (entry.attempts >= 6) { entry.attempts = 0; entry.until = Date.now() + 15 * 60_000; }
    authFailures.set(key, entry);
    res.status(action === 'login' ? 401 : 400).json({ error: error.message });
  }
});
app.get('/api/account/me', (req, res) => { const account = accounts.accountForToken(bearer(req)); if (!account) return res.status(401).json({ error: 'Sessão expirada.' }); res.json(accounts.profile(account)); });
app.post('/api/account/logout', (req, res) => { accounts.logout(bearer(req)); res.json({ ok: true }); });
app.use((req, res, next) => { if (/\.(?:html|js|css)$/.test(req.path) || req.path === '/') res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate'); next(); });
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/health', (_req, res) => res.json({ ok: true, protocolVersion: PROTOCOL_VERSION }));
const port = Number(process.env.PORT) || 3000;
let configuredPublicUrl = null;
try { configuredPublicUrl = publicOrigin(process.env.TANKDOTS_PUBLIC_URL || JSON.parse(readFileSync(path.join(__dirname, '..', 'host-config.json'), 'utf8')).publicUrl); } catch { configuredPublicUrl = publicOrigin(process.env.TANKDOTS_PUBLIC_URL); }
app.get('/host-info', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ lanUrls: isLocalRequest(req.socket.remoteAddress) ? lanUrls(os.networkInterfaces(), port) : [], publicUrl: configuredPublicUrl });
});
const server = app.listen(port, '0.0.0.0', () => {
  console.log('\n=================================\n TANKDOTS WARS SERVER\n=================================');
  console.log(`Local: http://localhost:${port}`);
  for (const url of lanUrls(os.networkInterfaces(), port)) console.log(`LAN:   ${url}`);
  if (configuredPublicUrl) console.log(`Link configurado: ${configuredPublicUrl}`);
  console.log('Players: 0/10\nRooms: 0\n');
});

const wss = new WebSocketServer({ server });
const rooms = new RoomManager();
const send = (ws, type, payload = {}) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type, payload: type === SERVER.WELCOME ? { ...payload, protocolVersion: PROTOCOL_VERSION } : payload }));
function audience(room) { return [...room.players, ...(room.spectators || [])]; }
function broadcast(room, type, payload) { for (const member of audience(room)) if (member.socket) send(member.socket, type, payload); }
function sync(room) {
  if (room.game) {
    if (!room.telemetry || room.telemetry.gameId !== room.game.matchId) room.telemetry = new MatchTelemetry(room.game);
    room.telemetry.observe(room);
    if (room.game.phase === 'finished') {
      room.game.matchAwards ||= room.telemetry.finish(room);
      if (!room.game.statsSaved && !room.game.debugMode && !room.game.training) {
        try { accounts.recordMatch(room, room.game.matchAwards); room.game.statsSaved = true; }
        catch (error) { console.error('Falha ao salvar estatísticas da partida:', error); }
      }
    }
  }
  broadcast(room, SERVER.ROOM_STATE, rooms.publicRoom(room));
  if (room.game) for (const player of room.players) if (player.socket) send(player.socket, SERVER.GAME_STATE, publicGame(room.game, player.id));
  if (room.game) for (const spectator of room.spectators || []) if (spectator.socket) send(spectator.socket, SERVER.GAME_STATE, publicGame(room.game, null));
}
function broadcastShot(room, shot) {
  room.telemetry?.shot(shot);
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
      if (type === CLIENT.CREATE_ROOM || type === CLIENT.JOIN_ROOM) {
        const accountId = accountIdFor(payload.accountToken);
        if (payload.accountToken && !accountId) throw new Error('Sua sessão expirou. Entre novamente na conta.');
        const result = type === CLIENT.CREATE_ROOM ? rooms.create(ws, { ...payload, accountId }) : rooms.join(ws, { ...payload, accountId });
        send(ws, SERVER.WELCOME, { playerId: ws.playerId, token: result.token }); sync(result.room); return;
      }
      if (type === CLIENT.WATCH_ROOM) { const result = rooms.watch(ws, payload); send(ws, SERVER.WELCOME, { spectatorId: result.spectator.id, token: result.spectator.token, spectator: true }); sync(result.room); return; }
      if (type === CLIENT.PING) { send(ws, SERVER.PONG, { at: Date.now() }); return; }
      room = rooms.rooms.get(ws.roomCode); if (!room) throw new Error('Entre em uma sala primeiro.');
      if (type === CLIENT.LINK_ACCOUNT) {
        const accountId = accountIdFor(payload.accountToken);
        const player = room.players.find((entry) => entry.id === ws.playerId && !entry.isBot);
        if (!accountId || !player) throw new Error('Entre numa conta para vincular esta partida.');
        if (player.accountId && player.accountId !== accountId) throw new Error('Esta vaga já está vinculada a outra conta.');
        if (room.players.some((entry) => entry.id !== player.id && entry.accountId === accountId)) throw new Error('Esta conta já está nesta sala.');
        player.accountId = accountId;
        if (room.game?.phase === 'finished' && room.game.matchAwards && !room.game.debugMode && !room.game.training) accounts.recordMatch(room, room.game.matchAwards);
        sync(room); return;
      }
      if (room.game?.paused && ![CLIENT.SET_SOLO_CONTROL, CLIENT.CHAT, CLIENT.LEAVE_ROOM].includes(type)) throw new Error('Partida pausada.');
      if (type === CLIENT.SET_AIM) { const update = setPlayerAim(room, ws.playerId, payload); if (update) broadcast(room, SERVER.AIM_UPDATE, update); return; }
      if (type === CLIENT.START_GAME) rooms.setReady(room.code, ws.playerId);
      else if (type === CLIENT.REROLL_SCENARIO) rooms.rerollScenario(room.code, ws.playerId);
      else if (type === CLIENT.SET_CLASS) rooms.setClass(room.code, ws.playerId, payload.classType);
      else if (type === CLIENT.SET_ARSENAL) rooms.setArsenal(room.code, ws.playerId, payload.choices);
      else if (type === CLIENT.DEBUG_ACTION) debugAction(room, ws.playerId, payload);
      else if (type === CLIENT.MOVE) movePlayer(room, ws.playerId, payload.direction, payload.arsenal, { continuous: true, vertical: payload.vertical, targetX: payload.targetX, targetY: payload.targetY });
      else if (type === CLIENT.MOVE_DEPLOYABLE) moveSpecialistDeployable(room, ws.playerId, payload);
      else if (type === CLIENT.SELECT_POWERUP) selectPowerup(room, ws.playerId, payload.type ?? null);
      else if (type === CLIENT.USE_POWERUP) usePowerup(room, ws.playerId, payload);
      else if (type === CLIENT.USE_ARSENAL) useArsenal(room, ws.playerId, payload);
      else if (type === CLIENT.NINJA_FATAL) ninjaFatal(room, ws.playerId, payload.targetId, Number.isFinite(Number(payload.x)) && Number.isFinite(Number(payload.y)) ? { x: Number(payload.x), y: Number(payload.y) } : null);
      else if (type === CLIENT.REROLL_BACKPACKER) rerollBackpackerArsenal(room, ws.playerId);
      else if (type === CLIENT.CLAIM_REWARD) claimReward(room, ws.playerId, payload.type);
      else if (type === CLIENT.CHOOSE_CLASS_EVOLUTION) chooseClassEvolution(room, ws.playerId, payload.type);
      else if (type === CLIENT.SET_SOLO_CONTROL) setSoloControl(room, ws.playerId, payload);
      else if (type === CLIENT.CHAT) { const author = room.players.find((p) => p.id === ws.playerId) || (room.spectators || []).find((entry) => entry.id === ws.spectatorId); const text = String(payload.text || '').trim().replace(/[<>]/g, '').slice(0, 160); if (text && author) broadcast(room, SERVER.CHAT, { id: `${Date.now()}-${author.id}`, playerId: author.id, nickname: author.nickname, color: author.color || '#b7c5d8', spectator: Boolean(ws.isSpectator), text, at: Date.now() }); return; }
      else if (type === CLIENT.LEAVE_ROOM) { const left = rooms.leave(ws); ws.roomCode = null; ws.playerId = null; if (left && rooms.rooms.has(left.code)) sync(left); return; }
      else if (type === CLIENT.FIRE) { const results = fire(room, ws.playerId, payload); broadcastShot(room, { shooterId: ws.playerId, results }); }
      else if (type === CLIENT.ACTIVATE_VERTICAL) { const results = activateVerticalShot(room, ws.playerId, payload.token, payload.target); broadcastShot(room, { shooterId: ws.playerId, results, replaceVertical: true, verticalActivated: true }); }
      else if (type === CLIENT.ACTIVATE_CLUSTER) { const results = activateClusterShot(room, ws.playerId, payload.token); broadcastShot(room, { shooterId: ws.playerId, results, replaceCluster: true }); }
      else if (type === CLIENT.ACTIVATE_FIREWORKS) { const results = activateFireworksShot(room, ws.playerId, payload.token); broadcastShot(room, { shooterId: ws.playerId, results, replaceFireworks: true }); }
      else if (type === CLIENT.ACTIVATE_HARPOON) activateHarpoon(room, ws.playerId);
      else if (type === CLIENT.PASS_TURN) { if (room.game?.players[room.game.turnIndex]?.id !== ws.playerId) throw new Error('Não é seu turno.'); if (room.game.shotEndsAt || room.game.harpoonPull) throw new Error('Aguarde a animação concluir.'); if (room.game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.'); nextTurn(room); }
      else if (type === CLIENT.REMATCH) { if (room.hostId !== ws.playerId) throw new Error('Apenas o anfitrião pode reiniciar.'); room.game = null; for (const player of room.players) player.ready = Boolean(player.isBot); }
      room.telemetry?.action(room, ws.playerId, type);
      sync(room);
    } catch (error) { send(ws, SERVER.ERROR, { message: error.message || 'Mensagem inválida.' }); }
  });
  ws.on('close', () => { const room = rooms.disconnect(ws); if (room && rooms.rooms.has(room.code)) sync(room); });
});

setInterval(() => {
  for (const room of rooms.rooms.values()) {
    const result = tickRoom(room);
    room.telemetry?.observe(room);
    if (result?.shot) broadcastShot(room, result.shot);
    const stateChanged = room.game ? refreshTankStates(room.game) : false;
    if (result?.changed || stateChanged) sync(room);
  }
}, 300);
