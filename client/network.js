export class GameNetwork extends EventTarget {
  constructor() { super(); this.socket = null; }
  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}`);
    this.socket.addEventListener('open', () => this.emit('status', { online: true }));
    this.socket.addEventListener('close', () => { this.emit('status', { online: false }); setTimeout(() => this.connect(), 1800); });
    this.socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); this.emit(message.type, message.payload); });
  }
  send(type, payload = {}) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type, payload })); }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, handler) { this.addEventListener(type, (event) => handler(event.detail)); }
}
