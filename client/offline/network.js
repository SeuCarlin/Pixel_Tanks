// The standalone build runs the authoritative game in a dedicated browser worker.
export class GameNetwork extends EventTarget {
  constructor() { super(); this.socket = null; }
  connect() {
    if (this.worker) return;
    this.socket = { readyState: 0 };
    this.worker = new Worker(new URL('./local-engine.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'LOCAL_READY') {
        this.socket.readyState = 1;
        this.emit('status', { online: true });
      } else this.emit(data.type, data.payload);
    };
    this.worker.onerror = () => {
      this.socket.readyState = 3;
      this.emit('status', { online: false });
      this.emit('ERROR', { message: 'Não foi possível iniciar a partida local. Recarregue a página.' });
    };
  }
  send(type, payload = {}) { if (this.socket?.readyState === 1) this.worker.postMessage({ type, payload }); }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, handler) { this.addEventListener(type, (event) => handler(event.detail)); }
}
