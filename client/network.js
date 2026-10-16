export class GameNetwork extends EventTarget {
  constructor() { super(); this.socket = null; this.reconnectAttempts = 0; this.reconnectTimer = null; this.heartbeat = null; }
  connect() {
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}`);
    this.socket.addEventListener('open', () => { this.reconnectAttempts = 0; clearInterval(this.heartbeat); this.heartbeat = setInterval(() => this.send('PING', { at: Date.now() }), 25000); this.emit('status', { online: true }); });
    this.socket.addEventListener('close', () => { clearInterval(this.heartbeat); this.emit('status', { online: false }); clearTimeout(this.reconnectTimer); const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts++); this.reconnectTimer = setTimeout(() => this.connect(), delay); });
    this.socket.addEventListener('error', () => this.socket?.close());
    this.socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); this.emit(message.type, message.payload); });
  }
  send(type, payload = {}) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type, payload })); }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, handler) { this.addEventListener(type, (event) => handler(event.detail)); }
}
