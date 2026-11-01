function install() {
  const button = document.querySelector('#accountButton'); button.textContent = 'ONLINE • LOGIN E CARTAS';
  let configured = '';
  fetch(new URL('./online-server.json', import.meta.url)).then(r=>r.json()).then(value=>{configured=value.url||'';}).catch(()=>{});
  button.onclick = () => {
    const modal = document.createElement('div'); modal.className = 'tutorial-modal';
    modal.innerHTML = '<section class="panel online-connect"><h2>JOGAR ONLINE</h2><p>Entre no servidor do anfitrião para login, conquistas, Battle Dots e multiplayer pela internet. A partida local continua disponível sem conta.</p><form><label>ENDEREÇO DO SERVIDOR<input type="url" required placeholder="https://seu-servidor.trycloudflare.com" aria-label="Endereço do servidor"></label><button class="primary">CONECTAR AO SERVIDOR</button></form><button class="secondary" data-cancel>VOLTAR</button><p role="status"></p></section>';
    const input = modal.querySelector('input'); input.value = localStorage.getItem('tankOnlineServer') || configured;
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('form').onsubmit = event => { event.preventDefault(); try { const url = new URL(input.value); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Use um endereço HTTPS.'); localStorage.setItem('tankOnlineServer',url.origin); location.assign(url.origin); } catch(error){modal.querySelector('[role="status"]').textContent=error.message;} };
    document.body.append(modal); input.focus();
  };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
