import { progressionState, STARTER_CLASSES, STARTER_ARSENAL } from '/shared/progression.js';
import { CLASS_DEFS, ARSENAL_DEFS } from '/shared/constants.js';
import { atlasStyle } from '/shared/card-art.js';
export function initProgressionUI(accountUI) {
  const button = document.createElement('button'); button.className = 'tutorial-button'; button.id = 'progressionButton'; button.textContent = '◈ CARTAS E CONQUISTAS';
  document.querySelector('.header-actions').prepend(button);
  const modal = document.createElement('div'); modal.id = 'progressionModal'; modal.className = 'tutorial-modal progression-modal'; modal.hidden = true; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Árvore de conquistas'); document.body.append(modal);
  let busy = false;
  let filter = 'all';
  const branches = { assault: ['ASSALTO', '01', 'Poder de fogo', '#ff9c65'], mobility: ['MOBILIDADE', '02', 'Domine as rotas', '#77d8ff'], control: ['CONTROLE', '03', 'Transforme a arena', '#be9cff'], support: ['SUPORTE', '04', 'Mantenha a equipe viva', '#87efba'] };
  const art = (kind, card) => `<i class="atlas-art atlas-${kind === 'class' ? 'classes' : 'arsenal'} art-${card}" style="${atlasStyle(card, kind === 'class' ? 'classes' : 'arsenal')}"></i>`;
  async function render() {
    const profile = await accountUI.refresh(), state = profile?.progression || progressionState();
    modal.innerHTML = `<section class="progression-panel panel"><button class="tutorial-close" data-close aria-label="Fechar">×</button><p class="eyebrow">ARQUIVO DO COMANDANTE</p><h2>ÁRVORE DE CONQUISTAS</h2><div class="progression-wallet"><strong>NÍVEL ${state.level}</strong><span>${state.xp} / ${state.nextLevelXp} XP</span><strong>◈ ${state.balance} BATTLE DOTS</strong><span>${state.percent}% DA COLEÇÃO</span></div><p>${profile ? `Comandante ${profile.username}: ` : 'Entre na conta do servidor para salvar sua coleção. ' }Conclua o desafio <b>ou</b> alcance o nível <b>ou</b> use Battle Dots. Partidas concluídas no servidor concedem moeda e XP; treino, laboratório e partidas offline não concedem recompensas.</p>${!profile ? '<button class="primary" data-login>ENTRAR / CRIAR CONTA</button>' : ''}<p id="progressionMessage" role="status"></p><h3>CARTAS INICIAIS • LIBERADAS</h3><div class="starter-cards">${STARTER_CLASSES.map(card => `<span>${art('class',card)}${CLASS_DEFS[card].name}</span>`).join('')}${STARTER_ARSENAL.map(card => `<span>${art('arsenal',card)}${ARSENAL_DEFS[card].name}</span>`).join('')}</div><div class="achievement-tree">${Object.entries({assault:'ASSALTO',mobility:'MOBILIDADE',control:'CONTROLE',support:'SUPORTE'}).map(([branch,title])=>`<section class="achievement-branch"><h3>${title}</h3>${state.cards.filter(c=>c.branch===branch).map(c=>`<article class="achievement-node ${c.owned?'unlocked':''}" data-card-id="${c.id}">${art(c.kind,c.card)}<small>${c.kind==='class'?'CLASSE':'ARSENAL'} • ${c.owned?'LIBERADA':'BLOQUEADA'}</small><h4>${c.name}</h4><b>${c.title}</b><p>${c.description}: ${Math.floor(c.current)} / ${c.target}</p><div class="achievement-progress" role="progressbar" aria-label="${c.title}" aria-valuenow="${c.percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${c.percent}%"></i></div><span>${c.percent}% DO DESAFIO • OU NÍVEL ${c.level}</span><button data-unlock="${c.id}" ${c.owned||!profile||state.balance<c.price?'disabled':''}>${c.owned?`✓ LIBERADA • ${c.earnedBy}`:`LIBERAR • ◈ ${c.price}`}</button></article>`).join('')}</section>`).join('')}</div></section>`;
  }
  const originalRender = render;
  render = async () => {
    await originalRender();
    const panel = modal.querySelector('.progression-panel');
    const wallet = panel.querySelector('.progression-wallet');
    const stats = [...wallet.children];
    wallet.innerHTML = `<div class="commander-rank"><span>◆</span><div><small>PATENTE DO COMANDANTE</small>${stats[0].outerHTML}<em>${stats[1].textContent}</em></div></div><div class="dots-vault"><small>SALDO DISPONÍVEL</small>${stats[2].outerHTML}<em>Invista em novas cartas</em></div><div class="collection-radar" style="--completion:${parseInt(stats[3].textContent)}%"><strong>${parseInt(stats[3].textContent)}%</strong><small>COLEÇÃO</small></div>`;
    panel.querySelector('.eyebrow').textContent = 'CENTRAL DE OPERAÇÕES / PROGRESSÃO';
    const starters = panel.querySelector('.starter-cards');
    const heading = starters.previousElementSibling;
    const starterDetails = document.createElement('details'); starterDetails.className = 'starter-loadout';
    heading.replaceWith(starterDetails); starterDetails.innerHTML = '<summary><span>◆ BASE OPERACIONAL</span><small>4 classes + 6 arsenais iniciais · ver cartas</small></summary>'; starterDetails.append(starters);
    const tree = panel.querySelector('.achievement-tree');
    const toolbar = document.createElement('div'); toolbar.className = 'tree-toolbar';
    toolbar.innerHTML = `<div><strong>ESCOLHA SUA ESPECIALIZAÇÃO</strong><small>As conexões organizam as trilhas. Cada carta tem seu próprio desafio.</small></div><nav aria-label="Filtrar cartas">${[['all','TODAS'],['class','CLASSES'],['arsenal','ARSENAIS'],['owned','LIBERADAS']].map(([id,label])=>`<button data-filter="${id}" aria-pressed="${filter===id}">${label}</button>`).join('')}</nav>`;
    tree.before(toolbar);
    for (const [index, branch] of [...tree.children].entries()) {
      const [id, [name, number, subtitle, color]] = Object.entries(branches)[index];
      branch.style.setProperty('--branch-color', color);
      const nodes = [...branch.querySelectorAll('.achievement-node')];
      const owned = nodes.filter(node=>node.classList.contains('unlocked')).length;
      branch.querySelector('h3').outerHTML = `<header class="branch-header"><span class="branch-number">${number}</span><div><h3>${name}</h3><small>${subtitle}</small></div><b>${owned}/${nodes.length}</b></header>`;
      for (const [n,node] of nodes.entries()) {
        const kind = node.dataset.cardId.split(':')[0];
        node.hidden = !(filter==='all'||filter===kind||filter==='owned'&&node.classList.contains('unlocked'));
        node.style.setProperty('--node-order',n);
        node.querySelector('small').className = 'node-state';
        const image = node.querySelector('.atlas-art');
        const visual = document.createElement('div'); visual.className = 'node-visual'; image.replaceWith(visual); visual.append(image);
        visual.insertAdjacentHTML('beforeend', `<span class="node-seal">${node.classList.contains('unlocked')?'✓':'◆'}</span>`);
        const description = node.querySelector('p');
        description.insertAdjacentHTML('beforebegin','<label class="challenge-label">MISSÃO DE DESBLOQUEIO</label>');
      }
      const visible = nodes.filter(node=>!node.hidden).length;
      if (!visible) branch.insertAdjacentHTML('beforeend','<p class="branch-empty">Nenhuma carta neste filtro.<br>Continue sua jornada.</p>');
    }
  };
  button.onclick = async () => { modal.hidden = false; await render(); };
  modal.onclick = async event => {
    if (event.target === modal || event.target.closest('[data-close]')) { modal.hidden = true; return; }
    if (event.target.closest('[data-login]')) { modal.hidden = true; accountUI.show(); return; }
    const tab = event.target.closest('[data-filter]');
    if (tab) { filter = tab.dataset.filter; await render(); return; }
    const unlock = event.target.closest('[data-unlock]'); if (!unlock || unlock.disabled || busy) return;
    busy = true; unlock.disabled = true;
    try {
      const response = await fetch('/api/account/unlock', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${accountUI.token()}`}, body:JSON.stringify({cardId:unlock.dataset.unlock}) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      await render(); document.querySelector('#progressionMessage').textContent = 'Carta liberada e salva na sua conta!';
    } catch (error) { document.querySelector('#progressionMessage').textContent = error.message; }
    finally { busy = false; }
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') modal.hidden = true; });
}
