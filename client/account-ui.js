import { MEDAL_DEFS, MEDAL_TIERS, medalArtSvg, medalDefinition, medalValue } from '/shared/achievements.js';
import { ARSENAL_DEFS, CLASS_DEFS, POWERUP_DEFS } from '/shared/constants.js';

const $ = (selector) => document.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const format = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value || 0);
const duration = (milliseconds) => `${Math.floor((milliseconds || 0) / 60_000)} min`;
const tierLabel = { bronze: 'BRONZE', prata: 'PRATA', ouro: 'OURO' };
const itemNames = { classes: CLASS_DEFS, arsenal: ARSENAL_DEFS, powerups: POWERUP_DEFS };
const itemName = (group, key) => itemNames[group]?.[key]?.name || key;

export function renderMatchRecords(result, playerId, players = []) {
  if (!result) return '<p class="record-empty">As estatísticas ficam disponíveis quando a partida termina.</p>';
  const own = result.players.find((entry) => entry.playerId === playerId);
  if (!own) return '<p class="record-empty">Assista à conclusão para ver os destaques da arena.</p>';
  const metrics = own.metrics;
  const values = MEDAL_DEFS.map((definition) => {
    const value = medalValue(metrics, definition.id);
    const shown = value === null ? '—' : definition.id === 'gameplaySeconds' ? duration(metrics.playMs) : `${format(value)} ${definition.unit}`;
    return `<div class="match-record" style="--record-color:${definition.color}">${medalArtSvg(definition.id, own.medals.find((medal) => medal.id === definition.id)?.tier || 'bronze')}<span><small>${escape(definition.name)}</small><b>${escape(shown)}</b></span></div>`;
  }).join('');
  const medals = own.medals.length ? own.medals.map((medal) => {
    const definition = medalDefinition(medal.id);
    return `<div class="earned-medal tier-${medal.tier}" style="--record-color:${definition.color}">${medalArtSvg(medal.id, medal.tier)}<span><b>${escape(definition.name)}</b><small>${tierLabel[medal.tier]} · ${format(medal.value)} ${definition.unit}</small></span></div>`;
  }).join('') : '<p class="record-empty">Ainda sem medalhas nesta batalha. Cada marco tem níveis bronze, prata e ouro.</p>';
  const spotlights = result.spotlights.filter((spotlight) => spotlight.playerId === playerId).map((spotlight) => medalDefinition(spotlight.id)?.name).filter(Boolean);
  return `<div class="record-heading"><b>SEU REGISTRO DE BATALHA</b><span>${escape(duration(metrics.playMs))} em combate · ${own.medals.length} medalha(s)</span></div><div class="match-records">${values}</div><div class="record-heading"><b>MEDALHAS DESTA PARTIDA</b><span>${spotlights.length ? `DESTAQUE: ${escape(spotlights.slice(0, 3).join(' · '))}` : 'SUPERE SEUS MARCOS'}</span></div><div class="earned-medals">${medals}</div>`;
}

export function createAccountUI(onLinked = () => {}) {
  let token = localStorage.getItem('tankAccountToken') || '';
  let profile = null;
  let mode = 'login';
  const modal = $('#accountModal');
  const form = $('#accountForm');
  const message = $('#accountMessage');
  const button = $('#accountButton');
  const credentials = $('#accountCredentials');
  const profileBox = $('#accountProfile');
  const setMessage = (value, error = false) => { message.textContent = value; message.classList.toggle('error', error); };

  async function request(path, options = {}) {
    const response = await fetch(`/api/account/${path}`, { ...options, headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível acessar a conta.');
    return data;
  }

  function renderProfile() {
    button.textContent = profile ? `◈ ${profile.username}` : '◈ CRIAR CONTA / ENTRAR';
    credentials.hidden = Boolean(profile);
    profileBox.hidden = !profile;
    if (!profile) return;
    const totals = profile.totals || {};
    const winRate = totals.matches ? Math.round((totals.wins || 0) / totals.matches * 100) : 0;
    const top = (group) => Object.entries(totals[group] || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => `<span>${escape(itemName(group, name))} <b>${format(count)}</b></span>`).join('') || '<small>Nenhum uso registrado</small>';
    const medals = Object.entries(profile.medals || {}).filter(([, count]) => count > 0).sort((a, b) => {
      const tier = (entry) => MEDAL_TIERS.indexOf(entry[0].split(':')[1]); return tier(b) - tier(a) || b[1] - a[1];
    }).slice(0, 12).map(([key, count]) => { const [id, tier] = key.split(':'); const definition = medalDefinition(id); return definition ? `<div class="profile-medal" style="--record-color:${definition.color}">${medalArtSvg(id, tier)}<span>${escape(definition.name)}<small>${tierLabel[tier]} · ${format(count)}×</small></span></div>` : ''; }).join('');
    const history = (profile.history || []).slice(0, 6).map((entry) => `<li><b class="${entry.result}">${({ win: 'VITÓRIA', loss: 'DERROTA', draw: 'EMPATE' })[entry.result]}</b><span>${escape(entry.classType || 'SEM CLASSE')} · ${new Date(entry.endedAt).toLocaleDateString('pt-BR')}</span><small>${format(entry.metrics.damage)} dano · ${format(entry.metrics.kills)} abates</small></li>`).join('');
    profileBox.innerHTML = `<div class="account-name">COMANDANTE <strong>${escape(profile.username)}</strong></div><div class="profile-overview"><span><small>PARTIDAS</small><b>${format(totals.matches)}</b></span><span><small>VITÓRIAS</small><b>${format(totals.wins)}</b></span><span><small>TAXA DE VITÓRIA</small><b>${winRate}%</b></span><span><small>TEMPO EM COMBATE</small><b>${duration(totals.playMs)}</b></span></div><div class="profile-overview"><span><small>DANO</small><b>${format(totals.damage)}</b></span><span><small>DESTRUIÇÃO</small><b>${format(totals.destruction)}</b></span><span><small>ABATES</small><b>${format(totals.kills)}</b></span><span><small>CURA</small><b>${format(totals.healed)}</b></span></div><div class="profile-loadouts"><div><h3>CLASSES</h3>${top('classes')}</div><div><h3>ARSENAL</h3>${top('arsenal')}</div><div><h3>POWERUPS</h3>${top('powerups')}</div></div><h3>MEDALHAS</h3><div class="profile-medals">${medals || '<p>Conclua partidas para conquistar medalhas.</p>'}</div><h3>ÚLTIMAS BATALHAS</h3><ul class="profile-history">${history || '<li class="empty">Nenhuma partida concluída ainda.</li>'}</ul>`;
  }

  async function refresh() {
    if (!token) return null;
    try { profile = await request('me'); renderProfile(); return profile; }
    catch { token = ''; profile = null; localStorage.removeItem('tankAccountToken'); renderProfile(); return null; }
  }
  async function submit(event) {
    event.preventDefault();
    setMessage('Verificando conta...');
    try {
      const result = await request(mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.elements.username.value.trim(), password: form.elements.password.value }) });
      token = result.token; localStorage.setItem('tankAccountToken', token); profile = result.profile; form.reset(); renderProfile(); setMessage('Conta conectada. Suas próximas partidas serão registradas.');
      for (const input of document.querySelectorAll('#createForm [name="nickname"], #joinForm [name="nickname"]')) if (!input.value.trim()) input.value = profile.username;
      onLinked(token);
    } catch (error) { setMessage(error.message, true); }
  }
  function show() { modal.hidden = false; setMessage(''); refresh(); }
  function hide() { modal.hidden = true; }
  button.addEventListener('click', show);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) hide(); });
  $('#accountClose').addEventListener('click', hide);
  modal.addEventListener('click', (event) => { if (event.target === modal) hide(); });
  form.addEventListener('submit', submit);
  for (const tab of modal.querySelectorAll('[data-account-mode]')) tab.addEventListener('click', () => { mode = tab.dataset.accountMode; modal.querySelectorAll('[data-account-mode]').forEach((entry) => entry.classList.toggle('active', entry.dataset.accountMode === mode)); $('#accountSubmit').textContent = mode === 'register' ? 'CRIAR CONTA' : 'ENTRAR'; setMessage(''); });
  $('#accountLogout').addEventListener('click', async () => { try { await request('logout', { method: 'POST' }); } catch {} token = ''; profile = null; localStorage.removeItem('tankAccountToken'); renderProfile(); setMessage('Você saiu da conta.'); });
  renderProfile(); refresh();
  return { token: () => token, profile: () => profile, refresh, show };
}
