// One browser, several human seats. Keep the normal room and command validation.
export class LocalSession {
  constructor(rooms, emit, protocolVersion) {
    this.rooms = rooms; this.emit = emit; this.protocolVersion = protocolVersion;
    this.sockets = []; this.active = this.makeSocket(); this.primary = this.active;
  }
  makeSocket() {
    const handlers = new Map();
    const socket = { readyState: 1, handlers, on: (type, fn) => handlers.set(type, fn), send: (raw) => {
      if (socket === this.active) this.emit(JSON.parse(raw));
    } };
    this.sockets.push(socket);
    return socket;
  }
  connect(handler) { this.connection = handler; handler(this.primary); }
  prepare(payload, socket) {
    const requested = Number(payload.rules?.localPlayers) || 1;
    this.humanCount = payload.quickTraining || payload.debugMode ? 1 : Math.max(1, Math.min(10, Math.floor(requested)));
    const bots = Math.max(this.humanCount === 1 ? 1 : 0, Math.min(10 - this.humanCount, Math.floor(Number(payload.rules?.botCount) || 0)));
    payload.rules = { ...payload.rules, botCount: bots, maxPlayers: Math.min(10, Math.max(this.humanCount + bots, Number(payload.rules?.maxPlayers) || 2)) };
    payload.accountToken = null;
    this.rooms.rooms.clear(); this.sockets = [socket]; this.active = socket;
  }
  configure(room) {
    room.rules.localPlayers = this.humanCount;
    for (let index = 1; index < this.humanCount; index++) {
      const socket = this.makeSocket(); this.connection(socket);
      let nickname = `Jogador ${index + 1}`;
      while (room.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) nickname += '+';
      this.rooms.join(socket, { code: room.code, nickname });
    }
  }
  beforeSync(room) {
    if (room.rules.localPlayers < 2) return;
    let next;
    if (!room.game && room.players.find(p => p.id === this.active.playerId)?.ready) next = room.players.find(p => !p.isBot && !p.ready);
    else if (room.game?.phase === 'playing') next = room.game.players[room.game.turnIndex];
    const socket = next && !next.isBot && this.sockets.find(entry => entry.playerId === next.id);
    if (!socket || socket === this.active) return;
    this.active = socket;
    const player = room.players.find(entry => entry.id === socket.playerId);
    this.emit({ type: 'WELCOME', payload: { protocolVersion: this.protocolVersion, playerId: player.id, token: player.token, localHandoff: true, nickname: player.nickname } });
  }
  dispatch(message) {
    let socket = this.active;
    if (['REMATCH', 'REROLL_SCENARIO'].includes(message.type)) {
      const room = this.rooms.rooms.get(socket.roomCode);
      socket = this.sockets.find(entry => entry.playerId === room?.hostId) || socket;
    }
    socket.handlers.get('message')?.(JSON.stringify(message));
  }
}
