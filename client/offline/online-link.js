function install() {
  const button = document.querySelector('#accountButton'); button.textContent = 'ONLINE • LOGIN E CARTAS';
  let configured = '';
  fetch(new URL('./online-server.json', import.meta.url)).then(r=>r.json()).then(value=>{configured=value.url||'';}).catch(()=>{});
  button.onclick = () => {
    const modal = document.createElement('div'); modal.className = 'tutorial-modal';
    modal.innerHTML = '<section class="panel online-connect"><h2>JOGAR ONLINE</h2><p>Entre no servidor do anfitrião para login, conquistas, Battle Dots e multiplayer pela internet. A partida local continua disponível sem conta.</p><form><label>ENDEREÇO DO SERVIDOR<input type="url" required placeholder="https://seu-servidor.trycloudflare.com" aria-label="Endereço do servidor"></label><button class="primary">CONECTAR AO SERVIDOR</button></form><button class="secondary" data-cancel>VOLTAR</button><p role="status"></p></section>';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Jogar online ou hospedar');
    modal.querySelector('h2').textContent = 'JOGAR COM AMIGOS';
    modal.querySelector('section').insertAdjacentHTML('beforeend', `<details class="online-host-guide"><summary>QUERO HOSPEDAR NO MEU PC</summary><ol><li>Na página do jogo no itch.io, baixe <b>TankDots — Servidor Windows</b> e extraia o ZIP inteiro para uma pasta.</li><li>Abra <b>INICIAR_ONLINE.bat</b>. Não precisa instalar Node.js nem abrir portas no roteador. Na primeira execução, o iniciador baixa o túnel oficial.</li><li>Copie o endereço HTTPS que aparece na janela. Abra esse endereço, crie uma sala e envie aos amigos o endereço e o código da sala.</li><li>Seus amigos colam o endereço no campo acima, entram no servidor e usam o código em <b>ENTRAR</b>.</li></ol><p>Mantenha o PC ligado, conectado à internet e a janela aberta. O endereço muda ao reiniciar o túnel. Contas, conquistas e cartas pertencem a cada servidor; não são transferidas automaticamente entre PCs. Guarde a pasta <b>data</b> ao atualizar o servidor.</p><a href="https://seucarlin.itch.io/tank-dot-arena#download" target="_blank" rel="noopener noreferrer">ABRIR DOWNLOADS NO ITCH.IO ↗</a></details><p class="online-help-note">O itch.io mantém o modo local. Para jogar pela internet, todos devem acessar o mesmo servidor. O anfitrião pode ser você ou qualquer amigo com o pacote de servidor Windows.</p>`);
    const input = modal.querySelector('input'); input.value = localStorage.getItem('tankOnlineServer') || configured;
    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('form').onsubmit = event => { event.preventDefault(); try { const url = new URL(input.value); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Use um endereço HTTPS.'); localStorage.setItem('tankOnlineServer',url.origin); location.assign(url.origin); } catch(error){modal.querySelector('[role="status"]').textContent=error.message;} };
    document.body.append(modal); input.focus();
  };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
