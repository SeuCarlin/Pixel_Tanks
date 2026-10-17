import { CLIENT, SERVER } from '/shared/protocol.js';
import { ARSENAL_DEFS, POWERUP_DEFS, POWERUPS } from '/shared/constants.js';
import { GameNetwork } from './network.js';
import { Renderer } from './renderer.js';
import { BattleAudio } from './audio.js';

const $ = (q) => document.querySelector(q); const $$ = (q) => [...document.querySelectorAll(q)];
const net = new GameNetwork(); const renderer = new Renderer($('#gameCanvas'));
const audio = new BattleAudio();
let room = null; let game = null; let playerId = sessionStorage.getItem('tankPlayerId'); let spectatorMode = Boolean(sessionStorage.getItem('tankSpectatorToken')); let lastTurn = null; let toastTimer;
let aimDirection = 1; let aiming = false;
let selectedWeapon = 'standard'; let resultSoundPlayed = false; let resultSequence = 0; let lastArenaEventKey = null;
let focusTimer; let pickupTimer; let rouletteTimer; let arenaAlertTimer; let savedArsenalSeed = null;
let serverClockOffset = 0; const gameNow = () => Date.now() + serverClockOffset;
const LEGACY_ARSENAL_ART = ['heavy', 'cluster', 'fireworks', 'zeus', 'gravity', 'jump', 'spider'];
const NEW_ARSENAL_ART = ['grenade', 'mineLayer', 'moleBomb', 'armoredDash', 'verticalStrike'];
const chatHistory = [];
const DAMAGE_INFO = Object.freeze({
  extraShot: 'repete o dano da arma', doubleShot: '2× o dano da arma', tripleShot: '3× o dano da arma', bigExplosion: 'mantém o dano da arma', megaMissile: 'até 135 HP', freeze: 'mantém o dano da arma', guidedBullet: 'mantém o dano da arma', heal: 'sem dano', shield: 'sem dano', movementBoost: 'sem dano', rocketDash: 'sem dano', lightningStep: 'sem dano', bridgeKit: 'mantém o dano da arma', teleport: 'mantém o dano da arma', invisibility: 'sem dano', excavator: 'sem dano', armorPiercer: 'mantém o dano da arma', shockwave: 'até 24 HP', bunkerBuster: 'até 58 HP', ammoCrate: 'sem dano', molotov: 'impacto + fogo', repairDrone: 'sem dano', overcharge: 'sem dano', laser: '72 HP por alvo',
  heavy: 'até 62 HP', cluster: 'até 24 HP por fragmento', fireworks: 'até 94 HP combinados', zeus: 'até 52 HP combinados', gravity: 'até 18 HP', grenade: 'até 58 HP', mineLayer: '42 HP por mina', moleBomb: 'até 66 HP', armoredDash: '38 HP', verticalStrike: 'até 34 HP', jump: 'sem dano', spider: 'sem dano', standard: 'até 44 HP',
});
function combatDescription(type, info) { const damage = DAMAGE_INFO[type]; return damage ? `${info.description} Dano: ${damage}.` : info.description; }
function screen(id) { $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id)); document.body.classList.toggle('playing', id === 'gameScreen'); if (id === 'gameScreen' && matchMedia('(pointer: coarse) and (orientation: landscape)').matches) window.screen.orientation?.lock?.('landscape').catch(() => {}); }
function toast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2300); }
function send(type, payload) { net.send(type, payload); }
const POWERUP_USAGE = {
  lootbox: 'Os três aprimoramentos da caixa foram aplicados ao seu tanque e adicionados ao arsenal ou inventário.',
  extraShot: 'É ativado automaticamente depois que seu próximo projétil concluir a trajetória.',
  doubleShot: 'Seu próximo ataque dispara dois projéteis. Uma carga é consumida por ataque.',
  tripleShot: 'Seu próximo ataque dispara três projéteis. Uma carga é consumida por ataque.',
  bigExplosion: 'A próxima explosão ganha uma cratera maior. O efeito é automático.',
  megaMissile: 'Seu próximo disparo vira uma Mega Bomba atômica: 190 blocos de alcance, até 135 HP e explosão em cogumelo.',
  freeze: 'Seu próximo disparo congela por dois turnos cada inimigo atingido.',
  guidedBullet: 'Seu próximo projétil corrige a rota automaticamente em direção a um adversário visível.',
  heal: 'A cura foi aplicada imediatamente ao seu tanque.',
  shield: 'A próxima vez que você receber dano, uma carga reduz o impacto automaticamente.',
  movementBoost: 'Todos os seus movimentos ficam maiores permanentemente. Os bônus acumulam.',
  rocketDash: 'Equipe e use uma seta de movimento. A arrancada amplia um deslocamento sem atravessar paredes.',
  lightningStep: 'Equipe e toque no cenário até 270 blocos do tanque para escolher o pouso.',
  bridgeKit: 'Equipe e atire. No primeiro impacto nasce uma ponte resistente de microblocos.',
  teleport: 'Ao atirar, você será transportado para uma posição segura próxima ao impacto.',
  invisibility: 'Já está ativo: somente você enxerga sua posição durante seus próximos dois turnos.',
  excavator: 'Use os botões de movimento contra uma parede. Cada avanço escava e consome uma carga.',
  armorPiercer: 'Selecione no inventário. Seu próximo ataque atravessará qualquer escudo.',
  shockwave: 'Selecione no inventário. O próximo impacto arremessará tanques para longe.',
  bunkerBuster: 'Selecione no inventário. O próximo disparo abrirá uma cratera muito mais profunda.',
  ammoCrate: 'Um obus pesado e uma munição cluster já foram adicionados ao seu arsenal.',
  molotov: 'Selecione no inventário e atire. O impacto deixa fogo que causa dano por três turnos.',
  repairDrone: 'O drone já está ativo e recuperará vida ao fim dos seus próximos três turnos.',
  overcharge: 'Todas as cargas do arsenal foram restauradas imediatamente.',
  laser: 'Equipe e atire. O feixe atravessa vários inimigos e imobiliza seu tanque no próximo turno.',
};
const SELECTABLE_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'excavator', 'armorPiercer', 'shockwave', 'bunkerBuster', 'rocketDash', 'lightningStep', 'bridgeKit', 'molotov', 'laser']);
function showPickup(type, player) {
  const info = POWERUP_DEFS[type] || ARSENAL_DEFS[type]; if (!info) return;
  const arsenalPickup = Boolean(ARSENAL_DEFS[type]);
  const counts = new Map(); for (const item of player.inventory || []) counts.set(item, (counts.get(item) || 0) + 1);
  const count = arsenalPickup ? player.ammo?.[type] || 1 : type === 'shield' ? player.shieldCharges : type === 'invisibility' ? player.invisibleTurns : type === 'heal' ? 0 : counts.get(type) || 1;
  const contents = type === 'lootbox' ? (player.lastPickup?.contents || []).map((reward) => (POWERUP_DEFS[reward] || ARSENAL_DEFS[reward])?.name).filter(Boolean) : [];
  const selectable = SELECTABLE_POWERUPS.has(type); $('#pickupReveal').style.setProperty('--pickup', info.color); $('#pickupEyebrow').textContent = type === 'lootbox' ? 'LOOTBOX RARA • 3 RECOMPENSAS' : arsenalPickup ? 'HABILIDADE COLETADA • DISPONÍVEL NO ARSENAL' : selectable ? 'POWERUP COLETADO • SELECIONE NO INVENTÁRIO' : 'POWERUP COLETADO • EFEITO AUTOMÁTICO'; $('#pickupShort').textContent = info.short; $('#pickupName').textContent = info.name; $('#pickupDescription').textContent = contents.length ? `Você recebeu: ${contents.join(' • ')}.` : combatDescription(type, info); $('#pickupUsage').textContent = arsenalPickup ? 'Uma carga foi adicionada. A habilidade aparece no seletor de armas e pode ser usada nesta partida.' : POWERUP_USAGE[type] || 'O efeito ficará disponível no seu inventário.';
  $('#pickupStack').textContent = ['heal', 'ammoCrate', 'lootbox'].includes(type) ? 'EFEITO APLICADO IMEDIATAMENTE' : type === 'invisibility' ? `${count} TURNOS ACUMULADOS` : `${count} ${count === 1 ? 'CARGA' : 'CARGAS'} ACUMULADAS`;
  $('#pickupReveal').classList.remove('show'); void $('#pickupReveal').offsetWidth; $('#pickupReveal').classList.add('show'); clearTimeout(pickupTimer); pickupTimer = setTimeout(() => $('#pickupReveal').classList.remove('show'), 5200);
}
$('#pickupClose').onclick = () => { clearTimeout(pickupTimer); $('#pickupReveal').classList.remove('show'); };

$$('.tab').forEach((tab) => tab.onclick = () => { $$('.tab,.form').forEach((x) => x.classList.remove('active')); tab.classList.add('active'); $(`#${tab.dataset.tab}Form`).classList.add('active'); });
$('#createForm').onsubmit = (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); send(CLIENT.CREATE_ROOM, { nickname: v.nickname, roomName: v.roomName, rules: { ...v, mines: Boolean(v.mines) } }); };
$('#joinForm').onsubmit = (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); send(CLIENT.JOIN_ROOM, v); };
$('#watchButton').onclick = () => { const v = Object.fromEntries(new FormData($('#joinForm'))); if (!v.code) { toast('Informe o código da sala.'); return; } send(CLIENT.WATCH_ROOM, v); };
function movementPayload(direction) { return { direction, arsenal: selectedWeapon === 'armoredDash' ? 'armoredDash' : selectedWeapon === 'spider' ? 'spider' : null }; }
$('#startButton').onclick = () => send(CLIENT.START_GAME); $('#moveLeft').onclick = () => { audio.move(); send(CLIENT.MOVE, movementPayload(-1)); }; $('#moveRight').onclick = () => { audio.move(); send(CLIENT.MOVE, movementPayload(1)); };
function activateJump() { const me = game?.players.find((player) => player.id === playerId); const openingParachute = Boolean(me?.airborne); send(CLIENT.USE_ARSENAL, openingParachute ? { type: 'parachute' } : { type: 'jump', angle: $('#angle').value, power: $('#power').value, direction: aimDirection }); if (!openingParachute) { selectedWeapon = 'standard'; $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === 'standard')); toast('NO AR • escolha o tiro e dispare'); } }
$('#fireButton').onclick = () => { if (selectedWeapon === 'jump') { activateJump(); return; } if (selectedWeapon === 'spider' || selectedWeapon === 'armoredDash') { toast(selectedWeapon === 'armoredDash' ? 'Use A/D ou as setas para executar a investida.' : 'Use A/D: salte, ganhe 2 movimentos e escale paredes permanentemente.'); return; } audio.unlock(); send(CLIENT.FIRE, { angle: $('#angle').value, power: $('#power').value, direction: aimDirection, weapon: selectedWeapon }); }; $('#passButton').onclick = () => send(CLIENT.PASS_TURN);
$('#rematchButton').onclick = () => send(CLIENT.REMATCH); $('#backButton').onclick = () => location.reload();
$('#restartButton').onclick = () => { if (confirm('Reiniciar a partida para todos os jogadores?')) send(CLIENT.REMATCH); };
$('#leaveButton').onclick = () => { const wasSpectator = spectatorMode; send(CLIENT.LEAVE_ROOM); room = null; game = null; playerId = null; spectatorMode = false; document.body.classList.remove('spectating'); sessionStorage.removeItem('tankToken'); sessionStorage.removeItem('tankPlayerId'); sessionStorage.removeItem('tankSpectatorToken'); sessionStorage.removeItem('tankRoomCode'); $('#chatMessages').innerHTML = ''; screen('homeScreen'); toast(wasSpectator ? 'Você saiu da transmissão.' : 'Você saiu da partida. Um bot assumiu seu tanque.'); };
$('#chatForm').onsubmit = (event) => { event.preventDefault(); const input = $('#chatInput'); const text = input.value.trim(); if (text) send(CLIENT.CHAT, { text }); input.value = ''; input.blur(); $('#chatPanel').classList.remove('open'); };
$('#copyCode').onclick = async () => { await navigator.clipboard?.writeText(room.code); toast('Código copiado.'); };
function updateMobileAimStick() { const angle = Number($('#angle').value); const power = Number($('#power').value); const ringWidth = $('#mobileAimStick').querySelector('.aim-stick-ring').clientWidth; const radius = ringWidth ? ringWidth * .39 : 41; const reach = (power - 100) / 480 * radius; const radians = angle * Math.PI / 180; const x = Math.cos(radians) * reach * aimDirection; const y = -Math.sin(radians) * reach; $('#aimStickKnob').style.transform = `translate(${x}px,${y}px)`; $('#stickAngle').textContent = `${angle}°`; $('#stickPower').textContent = `${Math.round((power - 100) / 4.8)}%`; }
function syncAimPreview() { renderer.setAim({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection }); updateMobileAimStick(); }
$('#angle').oninput = (e) => { $('#angleValue').textContent = `${e.target.value}°`; syncAimPreview(); }; $('#power').oninput = (e) => { $('#powerValue').textContent = `${Math.round((e.target.value - 100) / 4.8)}%`; syncAimPreview(); };
let aimingWithStick = false; let mobileAimLocked = false;
function updateAimLockButton() { const button = $('#aimLockButton'); button.classList.toggle('locked', mobileAimLocked); button.setAttribute('aria-pressed', String(mobileAimLocked)); button.innerHTML = mobileAimLocked ? '◆<span>MIRA<br>TRAVADA</span>' : '◇<span>TRAVAR<br>MIRA</span>'; $('#mobileAimStick').classList.toggle('aim-locked', mobileAimLocked); }
function updateAimFromStick(event) { if (mobileAimLocked) return; const ring = $('#mobileAimStick').querySelector('.aim-stick-ring'); const rect = ring.getBoundingClientRect(); const radius = Math.max(34, rect.width * .39); let dx = event.clientX - (rect.left + rect.width / 2); let dy = event.clientY - (rect.top + rect.height / 2); const rawDistance = Math.hypot(dx, dy); if (rawDistance > radius) { dx *= radius / rawDistance; dy *= radius / rawDistance; } const distance = Math.min(radius, rawDistance); if (Math.abs(dx) > 3) aimDirection = dx < 0 ? -1 : 1; const angle = Math.max(5, Math.min(85, Math.round(Math.atan2(Math.max(4, -dy), Math.max(4, Math.abs(dx))) * 180 / Math.PI))); $('#angle').value = angle; const power = Math.max(100, Math.min(580, Math.round(100 + distance / radius * 480))); $('#power').value = power; $('#angleValue').textContent = `${angle}°`; $('#powerValue').textContent = `${Math.round((power - 100) / 4.8)}%`; renderer.setAim({ angle, power, direction: aimDirection }); updateMobileAimStick(); $('#aimCoach').classList.remove('visible'); }
const aimStickSurface = $('#mobileAimStick').querySelector('.aim-stick-ring');
aimStickSurface.addEventListener('pointerdown', (event) => { if (!game || game.phase !== 'playing' || game.players[game.turnIndex]?.id !== playerId) return; event.preventDefault(); aimingWithStick = true; $('#mobileAimStick').classList.add('engaged'); aimStickSurface.setPointerCapture(event.pointerId); updateAimFromStick(event); });
aimStickSurface.addEventListener('pointermove', (event) => { if (aimingWithStick) updateAimFromStick(event); });
aimStickSurface.addEventListener('pointerup', (event) => { if (!aimingWithStick) return; aimingWithStick = false; updateAimFromStick(event); $('#mobileAimStick').classList.remove('engaged'); localStorage.setItem('tankAimLearned', '1'); audio.ui(); });
aimStickSurface.addEventListener('pointercancel', () => { aimingWithStick = false; $('#mobileAimStick').classList.remove('engaged'); });
$('#aimLockButton').addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); if ($('#mobileAimStick').classList.contains('disabled')) return; mobileAimLocked = !mobileAimLocked; updateAimLockButton(); navigator.vibrate?.(mobileAimLocked ? [12, 24, 12] : 8); audio.ui(); });
$('#mobileAimStick').addEventListener('click', (event) => { const button = event.target.closest('[data-aim-fine]'); if (!button || mobileAimLocked || $('#mobileAimStick').classList.contains('disabled')) return; const [type, rawDelta] = button.dataset.aimFine.split(':'); const delta = Number(rawDelta); if (type === 'angle') $('#angle').value = Math.max(5, Math.min(85, Number($('#angle').value) + delta)); else $('#power').value = Math.max(100, Math.min(580, Number($('#power').value) + delta)); $('#angleValue').textContent = `${$('#angle').value}°`; $('#powerValue').textContent = `${Math.round((Number($('#power').value) - 100) / 4.8)}%`; syncAimPreview(); navigator.vibrate?.(8); });
updateMobileAimStick();
updateAimLockButton();
$('#soundButton').textContent = audio.enabled ? '♪' : '×';
$('#soundButton').classList.toggle('muted', !audio.enabled);
$('#soundButton').onclick = () => { const enabled = audio.toggle(); $('#soundButton').textContent = enabled ? '♪' : '×'; $('#soundButton').classList.toggle('muted', !enabled); toast(enabled ? 'Som ativado.' : 'Som desativado.'); };
addEventListener('pointerdown', () => audio.unlock(), { once: true });

function updateAimFromPointer(event) {
  const me = game?.players.find((player) => player.id === playerId); if (!me || game.players[game.turnIndex]?.id !== playerId) return;
  if (mobileAimLocked && matchMedia('(pointer:coarse)').matches) return { angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection };
  const point = renderer.screenToWorld(event.clientX, event.clientY); const origin = renderer.renderPosition(me); const dx = point.x - origin.x; const dy = origin.y - point.y;
  aimDirection = dx < 0 ? -1 : 1;
  const angle = Math.max(5, Math.min(85, Math.round(Math.atan2(Math.max(5, dy), Math.max(5, Math.abs(dx))) * 180 / Math.PI)));
  const power = Math.max(100, Math.min(580, Math.round(Math.hypot(dx, dy))));
  $('#angle').value = angle; $('#power').value = power; $('#angleValue').textContent = `${angle}°`; $('#powerValue').textContent = `${Math.round((power - 100) / 4.8)}%`;
  renderer.setAim({ angle, power, direction: aimDirection }); updateMobileAimStick(); $('#aimCoach').classList.remove('visible');
  return { angle, power, direction: aimDirection };
}
$('#gameCanvas').addEventListener('pointerdown', (event) => {
  if (renderer.hasAwaitingVerticalShot()) { event.preventDefault(); renderer.activateVerticalShot(); toast('ATIVAÇÃO VERTICAL!'); return; }
  if (game?.players[game.turnIndex]?.id !== playerId) return;
  const me = game.players.find((player) => player.id === playerId);
  if (['lightningStep', 'teleport'].includes(me?.selectedPowerup)) {
    const point = renderer.screenToWorld(event.clientX, event.clientY);
    send(CLIENT.USE_POWERUP, { type: me.selectedPowerup, x: point.x, y: point.y });
    toast(me.selectedPowerup === 'teleport' ? 'Teleporte acionado' : 'Passo Relâmpago acionado'); return;
  }
  if (selectedWeapon === 'jump' && !me?.airborne) { if (!mobileAimLocked) updateAimFromPointer(event); activateJump(); return; }
  if (mobileAimLocked && matchMedia('(pointer:coarse)').matches) { toast('Mira travada • pressione ATIRAR'); return; }
  aiming = true; $('#gameCanvas').setPointerCapture(event.pointerId); updateAimFromPointer(event);
});
$('#gameCanvas').addEventListener('pointermove', (event) => { if (aiming) updateAimFromPointer(event); });
$('#gameCanvas').addEventListener('pointerup', (event) => { if (!aiming) return; aiming = false; updateAimFromPointer(event); localStorage.setItem('tankAimLearned', '1'); toast('Mira travada • pressione ATIRAR'); });
$('#gameCanvas').addEventListener('wheel', (event) => { event.preventDefault(); renderer.adjustZoom(event.deltaY < 0 ? .1 : -.1); }, { passive: false });
$('#zoomOut').onclick = () => renderer.adjustZoom(-.16); $('#zoomIn').onclick = () => renderer.adjustZoom(.16); $('#zoomFit').onclick = () => { renderer.fitWorld(); toast('Mapa completo'); };
$('#inventoryBar').addEventListener('click', (event) => { const button = event.target.closest('[data-powerup]'); if (!button || !game || game.players[game.turnIndex]?.id !== playerId) return; const me = game.players.find((player) => player.id === playerId); if (me?.powerupBlockedTurns > 0) { toast('PANE ELÉTRICA • powerups bloqueados neste turno'); return; } send(CLIENT.SELECT_POWERUP, { type: me?.selectedPowerup === button.dataset.powerup ? null : button.dataset.powerup }); audio.ui(); });
$('#weaponSelector').addEventListener('click', (event) => { const button = event.target.closest('.weapon'); if (!button || button.disabled) return; selectedWeapon = button.dataset.weapon; $$('.weapon').forEach((item) => item.classList.toggle('active', item.dataset.weapon === selectedWeapon)); audio.ui(); });
addEventListener('keydown', (e) => {
  if (!game || game.phase !== 'playing') return;
  if ((e.key === 't' || e.key === 'T') && document.activeElement !== $('#chatInput')) { e.preventDefault(); $('#chatPanel').classList.add('open'); $('#chatInput').focus(); return; }
  if (document.activeElement === $('#chatInput')) { if (e.key === 'Escape') { $('#chatInput').blur(); $('#chatPanel').classList.remove('open'); } return; }
  if (e.key === 'Enter' && (selectedWeapon === 'jump' || game.players.find((player) => player.id === playerId)?.airborne)) { e.preventDefault(); activateJump(); return; }
  if (['ArrowLeft', 'a', 'A'].includes(e.key)) send(CLIENT.MOVE, movementPayload(-1)); if (['ArrowRight', 'd', 'D'].includes(e.key)) send(CLIENT.MOVE, movementPayload(1)); if (e.code === 'Space') { e.preventDefault(); if (renderer.hasAwaitingVerticalShot()) { renderer.activateVerticalShot(); toast('ATIVAÇÃO VERTICAL!'); } else $('#fireButton').click(); }
});

const tutorialSteps = [
  { icon: '♛', title: 'Seja o último tanque', text: 'Todo o campo é formado por microblocos. Explosões arrancam blocos do terreno, empurram tanques e podem abrir uma queda fatal.', tip: 'Tanques, bots e jogadores seguem exatamente as mesmas regras físicas.' },
  { icon: '↻', title: 'Entenda seu turno', text: 'Em cada turno você pode mover e atirar, ou usar dois movimentos. O cronômetro encerra o turno automaticamente quando chega a zero.', tip: 'A moldura verde e a seta mostram qual tanque está ativo.' },
  { icon: '◀ ▶', title: 'Escolha sua posição', text: 'Use A/D, as setas do teclado ou os botões na tela. O tanque acompanha subidas e descidas suaves, mas para diante de paredes muito íngremes.', tip: 'Plataformas com luz azul e a marca MÓVEL se deslocam e carregam o tanque que estiver apoiado nelas.' },
  { icon: '⌁', title: 'Controle a mira', text: 'No desktop, arraste no campo. No celular, use a alavanca: direção escolhe o lado, altura define o ângulo e distância define a força. O botão TRAVAR MIRA congela os três valores.', tip: 'Com a mira travada, nenhum toque acidental altera a trajetória; pressione novamente para destravar.' },
  { icon: '✦', title: 'Escolha seu powerup', text: 'Exploda sinais enterrados e passe sobre o item revelado. Balas também detonam itens diretamente. As cargas ficam visíveis no inventário: toque em uma delas para equipar somente o efeito que deseja usar.', tip: 'Lápides guardam o inventário do eliminado: exploda a caveira para espalhar o saque.' },
  { icon: '⚡', title: 'Domine o deslocamento', text: 'Arrancada Foguete amplia o próximo movimento. Passo Relâmpago permite equipar o item e tocar em um pouso próximo. Ponte Modular constrói uma passagem no próximo impacto.', tip: 'O Passo Relâmpago aceita apenas terrenos seguros dentro do alcance de 270 blocos.' },
  { icon: '⚙', title: 'Use o próprio cenário', text: 'Barris explodem em cadeia. Acerte botões HIT para erguer rampas e passe sobre lançadores azuis para saltar grandes distâncias.', tip: 'Objetos reagem à área da explosão, então não é necessário acertar exatamente o centro.' },
  { icon: '⌁', title: 'A arena evolui', text: 'A cada três turnos ocorre um evento. Helicópteros entregam suprimentos, miras anunciam bombardeios, raios bloqueiam powerups e fossos podem entrar em erupção.', tip: 'Observe as marcações no terreno: todo evento mostra onde e quando seu efeito acontecerá.' },
  { icon: '◇◆', title: 'Jogue em cooperativo', text: 'Ao criar a sala, escolha COOP para unir todos os jogadores humanos contra a equipe de bots. A missão termina assim que uma das equipes for eliminada.', tip: 'Explosões e habilidades não causam dano nos aliados humanos durante o cooperativo.' },
];
let tutorialStep = 0;
function renderTutorial() {
  const step = tutorialSteps[tutorialStep];
  $('#tutorialNumber').textContent = String(tutorialStep + 1).padStart(2, '0'); $('#tutorialIcon').textContent = step.icon; $('#tutorialTitle').textContent = step.title; $('#tutorialText').textContent = step.text; $('#tutorialTip').textContent = `DICA: ${step.tip}`;
  $('#tutorialDots').innerHTML = tutorialSteps.map((_, i) => `<button aria-label="Etapa ${i + 1}" class="${i === tutorialStep ? 'active' : ''}" data-step="${i}"></button>`).join('');
  $$('#tutorialDots button').forEach((button) => button.onclick = () => { tutorialStep = Number(button.dataset.step); renderTutorial(); });
  $('#tutorialPrev').disabled = tutorialStep === 0; $('#tutorialNext').textContent = tutorialStep === tutorialSteps.length - 1 ? 'COMEÇAR ✓' : 'PRÓXIMO →';
}
function openTutorial() { tutorialStep = 0; renderTutorial(); $('#tutorialModal').hidden = false; document.body.classList.add('modal-open'); }
function closeTutorial() { $('#tutorialModal').hidden = true; document.body.classList.remove('modal-open'); localStorage.setItem('tankTutorialSeen', '1'); }
$('#tutorialButton').onclick = openTutorial; $('#tutorialClose').onclick = closeTutorial; $('#tutorialPrev').onclick = () => { tutorialStep = Math.max(0, tutorialStep - 1); renderTutorial(); };
$('#tutorialNext').onclick = () => { if (tutorialStep === tutorialSteps.length - 1) closeTutorial(); else { tutorialStep += 1; renderTutorial(); } };
$('#tutorialModal').onclick = (event) => { if (event.target === $('#tutorialModal')) closeTutorial(); };
addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#tutorialModal').hidden) closeTutorial(); });
if (!localStorage.getItem('tankTutorialSeen')) setTimeout(openTutorial, 550);

net.on('status', ({ online }) => { $('.status').classList.toggle('online', online); $('#connectionText').textContent = online ? 'servidor online' : 'reconectando'; if (online && room && sessionStorage.getItem('tankToken')) send(CLIENT.JOIN_ROOM, { code: room.code, token: sessionStorage.getItem('tankToken') }); else if (online && room && sessionStorage.getItem('tankSpectatorToken')) send(CLIENT.WATCH_ROOM, { code: room.code, token: sessionStorage.getItem('tankSpectatorToken') }); });
net.on(SERVER.WELCOME, (data) => { if (data.playerId) { spectatorMode = false; playerId = data.playerId; renderer.setPlayer(playerId); sessionStorage.setItem('tankPlayerId', data.playerId); sessionStorage.setItem('tankToken', data.token); } else if (data.spectator) { spectatorMode = true; playerId = null; renderer.setPlayer(null); sessionStorage.removeItem('tankPlayerId'); sessionStorage.removeItem('tankToken'); sessionStorage.setItem('tankSpectatorToken', data.token); document.body.classList.add('spectating'); $('#spectatorBadge').hidden = false; } });
net.on(SERVER.ERROR, ({ message }) => toast(message));
net.on(SERVER.CHAT, (message) => { chatHistory.push(message); if (chatHistory.length > 40) chatHistory.shift(); $('#chatMessages').innerHTML = chatHistory.map((entry) => `<div><b style="color:${entry.color}">${escapeHtml(entry.nickname)}</b><span>${escapeHtml(entry.text)}</span></div>`).join(''); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; $('#chatPanel').classList.add('has-message'); setTimeout(() => $('#chatPanel').classList.remove('has-message'), 5000); });
net.on(SERVER.ROOM_STATE, (state) => { room = state; sessionStorage.setItem('tankRoomCode', state.code); renderRoom(); if (state.phase === 'lobby') screen('roomScreen'); });
net.on(SERVER.GAME_STATE, (state) => {
  if (Number.isFinite(state.serverTime)) serverClockOffset = state.serverTime - Date.now();
  const before = game?.players.find((player) => player.id === playerId); const after = state.players.find((player) => player.id === playerId);
  if (game) for (const nextPlayer of state.players) { const previousPlayer = game.players.find((entry) => entry.id === nextPlayer.id); if (!previousPlayer) continue; if (nextPlayer.health < previousPlayer.health && nextPlayer.alive) audio.damage(previousPlayer.health - nextPlayer.health); if (previousPlayer.alive && !nextPlayer.alive) audio.destroyed(); if (nextPlayer.health > previousPlayer.health && nextPlayer.regenTurns >= 0) audio.status('heal'); if ((nextPlayer.frozenTurns || 0) > (previousPlayer.frozenTurns || 0)) audio.status('freeze'); }
  if (before && after && after.lastPickup?.serial && after.lastPickup.serial !== before.lastPickup?.serial) { const pickup = { type: after.lastPickup.type, player: structuredClone(after) }; renderer.spawnPickupEffect(after, pickup.type); renderer.whenBattleAnimationsComplete(() => { audio.pickup(pickup.type); showPickup(pickup.type, pickup.player); }); }
  if (before && after?.lastLaunch?.serial && after.lastLaunch.serial !== before.lastLaunch?.serial) audio.launch();
  if (before && after?.lastBlink?.serial && after.lastBlink.serial !== before.lastBlink?.serial) { audio.teleport(0); renderer.spawnTeleport(after.lastBlink); }
  game = state; renderer.setGame(state); renderRewardOffer();
  const arenaEvent = state.events?.at(-1); const arenaEventKey = arenaEvent ? `${arenaEvent.id}:${arenaEvent.warning ? 'warning' : 'impact'}` : null;
  if (arenaEvent && arenaEventKey !== lastArenaEventKey) { lastArenaEventKey = arenaEventKey; renderer.playArenaEvent(arenaEvent, gameNow()); audio.arena(arenaEvent.type, arenaEvent.warning); showArenaAlert(arenaEvent); }
  const sequence = ++resultSequence;
  if (state.phase === 'finished') { screen('gameScreen'); renderHud(); renderer.whenBattleAnimationsComplete(() => { if (sequence === resultSequence && game?.phase === 'finished') renderResult(); }); }
  else if (state.phase === 'arsenal') { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; if (!spectatorMode && savedArsenalSeed !== state.seed) openArsenal(true); else { $('#arsenalModal').hidden = true; renderHud(); } }
  else if (state.phase === 'roulette') { resultSoundPlayed = false; screen('gameScreen'); $('#arsenalModal').hidden = true; renderRoulette(state); }
  else { resultSoundPlayed = false; screen('gameScreen'); $('#rouletteModal').hidden = true; clearInterval(rouletteTimer); renderHud(); }
});

function showArenaAlert(event) {
  const names = { supply: 'SUPRIMENTOS AÉREOS', quake: 'ABALO DA ARENA', bombardment: 'BOMBARDEIO PROGRESSIVO', lightning: 'TEMPESTADE ELÉTRICA', collapse: 'COLAPSO DO CENÁRIO', tectonic: 'EVENTO TECTÔNICO', luckyWinds: 'VENTOS DE SORTE', eruption: 'ERUPÇÃO VULCÂNICA' };
  const details = { supply: `Helicóptero em aproximação • ${event.lootboxChance || 0}% de chance de Lootbox.`, quake: 'O solo irá se romper em pontos marcados.', bombardment: 'Miras confirmadas. Cada projétil seguinte terá uma explosão maior.', lightning: 'A descarga causa dano e bloqueia powerups por um turno.', collapse: 'Partes instáveis do terreno serão destruídas.', tectonic: 'O terremoto remodelará o solo e deslocará todos os tanques.', luckyWinds: 'Zonas douradas recuperarão 40 HP dos tanques em seu interior.', eruption: 'A lava subirá pelos fossos e lançará bolas de fogo em direções aleatórias.' };
  const warningSeconds = event.executeAt ? Math.max(1, Math.ceil((event.executeAt - gameNow()) / 1000)) : 3; const prefix = event.type === 'supply' && event.warning ? `◆ CHEGADA EM ${warningSeconds}s • ` : event.type === 'luckyWinds' && event.warning ? `✦ AURA EM ${warningSeconds}s • ` : event.type === 'eruption' && event.warning ? `♨ ERUPÇÃO EM ${warningSeconds}s • ` : event.warning ? `⚠ IMPACTO EM ${warningSeconds}s • ` : '◆ EFEITO • '; $('#arenaAlertTitle').textContent = `${prefix}${names[event.type] || 'EVENTO'}`; $('#arenaAlertDetail').textContent = details[event.type] || event.label; const alert = $('#arenaAlert'); alert.classList.toggle('impact', !event.warning); alert.classList.toggle('lucky', event.type === 'luckyWinds'); alert.classList.toggle('eruption', event.type === 'eruption'); alert.classList.remove('show'); void alert.offsetWidth; alert.classList.add('show'); clearTimeout(arenaAlertTimer); arenaAlertTimer = setTimeout(() => alert.classList.remove('show'), event.warning ? warningSeconds * 1000 : 2800);
}
net.on(SERVER.SHOT_RESULT, (result) => {
  renderer.playShot(result); const first = result.results?.[0]; const flight = renderer.shotDuration(result);
  const hits = result.results?.reduce((sum, shot) => sum + shot.damage.filter((entry) => entry.amount > 0).length, 0) || 0;
  audio.shoot(flight, first?.weapon || 'standard', hits, first || {}); if (result.results?.some((shot) => shot.teleport)) audio.teleport(flight);
  if (result.results?.some((shot) => shot.interactions?.length)) audio.scenario(flight);
  clearTimeout(focusTimer); $('#gameScreen').classList.add('focus'); focusTimer = setTimeout(() => $('#gameScreen').classList.remove('focus'), (flight + .85) * 1000);
});

function renderRoom() {
  $('#roomName').textContent = room.name; $('#roomCode').textContent = room.code; $('#playerCount').textContent = `${room.players.length} / ${room.rules.maxPlayers}`;
  $('#roster').innerHTML = room.players.map((p) => `<div class="player-card ${p.isBot ? 'bot' : ''}" style="--color:${p.color}"><span class="tank-avatar"></span><div><strong>${escapeHtml(p.nickname)}</strong><small>${p.id === room.hostId ? '★ ANFITRIÃO' : p.isBot ? '◆ BOT • IA' : p.connected ? 'PRONTO' : 'DESCONECTADO'}</small></div></div>`).join('');
  const labels = { gameMode: 'Modo', maxPlayers: 'Jogadores', botCount: 'Bots', botDifficulty: 'Dificuldade IA', health: 'Vida inicial', turnSeconds: 'Tempo de turno', gameSpeed: 'Velocidade', mapType: 'Tipo de mapa', powerupCount: 'Powerups', mines: 'Minas', gravity: 'Gravidade' };
  const difficultyNames = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };
  $('#rulesList').innerHTML = Object.entries(labels).map(([key, label]) => `<div><dt>${label}</dt><dd>${room.rules[key] === true ? 'ATIVADAS' : room.rules[key] === false ? 'DESATIVADAS' : key === 'botDifficulty' ? difficultyNames[room.rules[key]] : key === 'gameMode' ? (room.rules[key] === 'coop' ? 'COOP' : 'CADA UM POR SI') : escapeHtml(String(room.rules[key]))}</dd></div>`).join('');
  const host = playerId === room.hostId; $('#startButton').hidden = !host; $('#restartButton').hidden = !host || room.phase === 'lobby'; $('#waitingMessage').hidden = host; $('#waitingMessage').textContent = spectatorMode ? `◉ ASSISTINDO • ${room.spectatorCount || 1} ESPECTADOR(ES)` : 'Aguardando o anfitrião...'; $('#startButton').disabled = room.players.length < 2;
  const me = room.players.find((player) => player.id === playerId); $('#arsenalButton').hidden = spectatorMode; $('#arsenalButton').textContent = `MEU ARSENAL: ${(me?.arsenal || []).map((type) => ARSENAL_DEFS[type]?.short).join(' • ')}`; $('#spectatorBadge').hidden = !spectatorMode;
}

function openArsenal(timed = false) {
  const player = (game?.phase === 'arsenal' ? game.players : room?.players)?.find((entry) => entry.id === playerId); const selected = new Set(player?.arsenal || []); const offered = new Set(player?.arsenalOffer || Object.keys(ARSENAL_DEFS));
  $('#arsenalCatalog').innerHTML = Object.entries(ARSENAL_DEFS).filter(([type]) => offered.has(type)).map(([type, info]) => { const artIndex = LEGACY_ARSENAL_ART.indexOf(type); const newArtIndex = NEW_ARSENAL_ART.indexOf(type); const newArt = newArtIndex >= 0 ? ' new-arsenal-art arsenal-new-atlas' : ''; return `<button class="${selected.has(type) ? 'selected' : ''}" data-arsenal="${type}" style="--item:${info.color};--art-col:${Math.max(0, artIndex)};--new-art-col:${Math.max(0, newArtIndex)}"><span class="arsenal-card-art${newArt}"></span><span class="arsenal-check">✓</span><b>${info.short}</b><strong>${info.name}</strong><span class="arsenal-description">${escapeHtml(combatDescription(type, info))}</span><i>${info.kind === 'movement' ? 'MOVIMENTO' : 'TIRO ESPECIAL'}</i></button>`; }).join('');
  updateArsenalSelection();
  $('#arsenalModal').hidden = false;
  $('#arsenalClose').hidden = timed; $('#arsenalCountdown').textContent = timed ? Math.max(0, Math.ceil((game.arsenalEndsAt - gameNow()) / 1000)) : '';
}
$('#arsenalButton').onclick = openArsenal; $('#arsenalClose').onclick = () => { $('#arsenalModal').hidden = true; };
function updateArsenalSelection() { const count = $$('#arsenalCatalog .selected').length; $('#arsenalSelectedCount').textContent = `${count} / 3`; $('#arsenalSave').disabled = count !== 3; }
$('#arsenalCatalog').onclick = (event) => { const button = event.target.closest('[data-arsenal]'); if (!button) return; if (!button.classList.contains('selected') && $$('#arsenalCatalog .selected').length >= 3) { toast('Remova um poder antes de escolher outro.'); return; } button.classList.toggle('selected'); updateArsenalSelection(); audio.ui(); };
$('#arsenalSave').onclick = () => { const choices = $$('#arsenalCatalog .selected').map((button) => button.dataset.arsenal); if (choices.length !== 3) { toast('Escolha exatamente 3 poderes.'); return; } if (game?.phase === 'arsenal') savedArsenalSeed = game.seed; send(CLIENT.SET_ARSENAL, { choices }); $('#arsenalModal').hidden = true; };

function renderRewardOffer() {
  const active = game?.players[game?.turnIndex]; const offer = active?.id === playerId ? active.rewardOffer : null; const modal = $('#rewardModal');
  modal.hidden = !offer; if (!offer) return;
  $('#rewardChoices').innerHTML = offer.choices.map((type) => { const info = POWERUP_DEFS[type]; const index = POWERUPS.indexOf(type); const fresh = index >= 19; return `<button data-reward="${type}" class="powerup-${type}" style="--item:${info.color};--col:${fresh ? index - 19 : index % 5};--row:${Math.min(3, Math.floor(index / 5))}"><i class="card-art${fresh ? ' new-art' : ''}"></i><span class="card-rarity">POWERUP</span><b>${info.short}</b><strong>${info.name}</strong><span>${escapeHtml(combatDescription(type, info))}</span><em>ESCOLHER</em></button>`; }).join('');
  $$('#rewardChoices [data-reward]').forEach((button) => button.onclick = () => send(CLIENT.CLAIM_REWARD, { type: button.dataset.reward }));
}

function renderRoulette(state) {
  clearInterval(rouletteTimer); const modal = $('#rouletteModal'); modal.hidden = false;
  $('#rouletteTrack').innerHTML = state.players.map((player, index) => `<div data-player-index="${index}" style="--player:${player.color}"><b>${escapeHtml(player.nickname)}</b></div>`).join('');
  const update = () => { const now = gameNow(); const spinEndsAt = state.rouletteSpinEndsAt || state.rouletteEndsAt; const spinning = now < spinEndsAt; const progress = Math.min(1, (now - state.rouletteStartedAt) / Math.max(1, spinEndsAt - state.rouletteStartedAt)); const sequenceIndex = Math.min(state.rouletteSequence.length - 1, Math.floor(progress * state.rouletteSequence.length)); const activeIndex = spinning ? state.rouletteSequence[sequenceIndex] : state.turnIndex; $$('#rouletteTrack>div').forEach((item) => item.classList.toggle('active', Number(item.dataset.playerIndex) === activeIndex)); const winner = state.players[state.turnIndex]; const countdown = Math.max(1, Math.ceil((state.rouletteEndsAt - now) / 1000)); $('#rouletteResult').textContent = spinning ? 'SORTEANDO...' : `${winner.nickname} COMEÇA • PARTIDA EM ${countdown}`; };
  update(); rouletteTimer = setInterval(update, 80);
}

function renderHud() {
  const active = game.players[game.turnIndex]; const mine = game.phase === 'playing' && !game.shotEndsAt && !(game.arenaWarningUntil > gameNow()) && active?.id === playerId; $('#mobileAimStick').classList.toggle('disabled', !mine); $('#aimLockButton').classList.toggle('disabled', !mine);
  if (mine) { if (!mobileAimLocked) aimDirection = game.players.find((player) => player.id === playerId)?.facing || aimDirection; updateMobileAimStick(); }
  $('#turnPlayer').textContent = active?.nickname || '—'; $('#movesLeft').textContent = game.shotEndsAt ? 'PROJÉTIL EM VOO' : active?.frozenTurns > 0 ? `CONGELADO • ${active.frozenTurns}T` : active?.powerupBlockedTurns > 0 ? `PANE ELÉTRICA • SEM POWERUPS` : `${game.actions.movesLeft} ${game.actions.movesLeft === 1 ? 'AÇÃO' : 'AÇÕES'}`;
  const wind = game.wind || 0; $('#windValue').textContent = wind === 0 ? 'CALMO' : `${Math.abs(wind)} ${wind > 0 ? '→' : '←'}`; $('#windArrow').textContent = wind === 0 ? '•' : wind > 0 ? '»' : '«'; $('#windArrow').className = wind === 0 ? '' : wind > 0 ? 'right' : 'left';
  const turnsToEvent = 3 - (game.turnNumber % 3); $('#arenaEvent').textContent = `EVENTO EM ${turnsToEvent} ${turnsToEvent === 1 ? 'TURNO' : 'TURNOS'}`;
  $('#scoreStrip').innerHTML = game.players.map((p) => `<div class="score-player ${p.alive ? '' : 'dead'}" data-team="${p.team || (p.isBot ? 'bots' : 'humans')}" style="--c:${p.color}"><span><b>${game.mode === 'coop' ? (p.isBot ? '◆ ' : '◇ ') : ''}${escapeHtml(p.nickname)}</b><i>${p.alive ? `${p.health} HP` : 'FORA'}</i></span><div class="healthbar"><i style="width:${p.health / p.maxHealth * 100}%"></i></div></div>`).join('');
  ['#moveLeft', '#moveRight'].forEach((id) => $(id).disabled = !mine || game.actions.movesLeft <= 0); $('#fireButton').disabled = !mine || !game.actions.attackAvailable; $('#passButton').disabled = !mine;
  const me = game.players.find((player) => player.id === playerId);
  $('#arsenalWeapons').innerHTML = (me?.arsenal || []).map((type) => { const info = ARSENAL_DEFS[type]; const count = type === 'spider' && me?.spiderClimb ? '∞' : me?.ammo?.[type] || 0; const artIndex = LEGACY_ARSENAL_ART.indexOf(type); const newArtIndex = NEW_ARSENAL_ART.indexOf(type); const newArt = newArtIndex >= 0 ? ' new-arsenal-art arsenal-new-atlas' : ''; return `<button class="weapon ${selectedWeapon === type ? 'active' : ''}" data-weapon="${type}" title="${escapeHtml(combatDescription(type, info))}" style="--arsenal:${info.color};--art-col:${Math.max(0, artIndex)};--new-art-col:${Math.max(0, newArtIndex)}"><i class="hud-arsenal-art${newArt}"></i><small>${info.short}</small><b>${count}</b></button>`; }).join('');
  const inventory = new Map(); for (const type of me?.inventory || []) inventory.set(type, (inventory.get(type) || 0) + 1);
  if (me?.shieldCharges > 0) inventory.set('shield', me.shieldCharges); if (me?.invisibleTurns > 0) inventory.set('invisibility', me.invisibleTurns);
  const powerupsBlocked = me?.powerupBlockedTurns > 0; $('.powerup-hud').classList.toggle('blocked', powerupsBlocked); $('.powerup-help b').textContent = powerupsBlocked ? 'PANE ELÉTRICA' : 'POWERUPS'; $('.powerup-help span').textContent = powerupsBlocked ? 'BLOQUEADOS ATÉ O FIM DESTE TURNO' : 'COLETE • TOQUE NO ITEM PARA EQUIPAR NESTA RODADA';
  $('#inventoryBar').innerHTML = inventory.size ? [...inventory].map(([type, count]) => { const info = POWERUP_DEFS[type]; if (!info) return ''; const selectable = SELECTABLE_POWERUPS.has(type) && (me?.inventory || []).includes(type); const tag = selectable ? 'button' : 'span'; const selected = me?.selectedPowerup === type ? ' selected' : ''; const attribute = selectable ? ` data-powerup="${type}"${powerupsBlocked ? ' disabled' : ''}` : ''; const index = POWERUPS.indexOf(type); const fresh = index >= 19; return `<${tag} class="powerup-chip${selected}"${attribute} style="--item:${info.color};--col:${fresh ? index - 19 : index % 5};--row:${Math.min(3,Math.floor(index / 5))}" title="${escapeHtml(combatDescription(type, info))}"><span class="inventory-art${fresh ? ' new-art' : ''}"></span><b>${info.short}</b><span>${info.name}</span><em>×${count}</em>${selected ? '<i>EQUIPADO</i>' : ''}</${tag}>`; }).join('') : '<i>nenhum item ativo</i>';
  $$('.weapon').forEach((button) => { const movement = ARSENAL_DEFS[button.dataset.weapon]?.kind === 'movement'; const count = button.dataset.weapon === 'standard' || (button.dataset.weapon === 'spider' && me?.spiderClimb) ? Infinity : me?.ammo?.[button.dataset.weapon] || 0; button.disabled = !mine || (movement ? game.actions.movesLeft <= 0 : !game.actions.attackAvailable) || count <= 0; });
  if (selectedWeapon !== 'standard' && (!me?.arsenal?.includes(selectedWeapon) || ((me?.ammo?.[selectedWeapon] || 0) <= 0 && !(selectedWeapon === 'spider' && me?.spiderClimb) && !(selectedWeapon === 'jump' && me?.airborne)))) { selectedWeapon = 'standard'; $$('.weapon').forEach((button) => button.classList.toggle('active', button.dataset.weapon === 'standard')); }
  const choosingBlink = mine && !powerupsBlocked && ['lightningStep', 'teleport'].includes(me?.selectedPowerup);
  $('#aimCoach').innerHTML = choosingBlink ? `<b>⚡</b><span>TOQUE NUM POUSO PRÓXIMO<small>Alcance máximo: ${me?.selectedPowerup === 'teleport' ? 580 : 270} blocos</small></span>` : '<b>1</b><span>ARRASTE NO CAMPO PARA MIRAR<small>Solte para travar a trajetória</small></span>';
  $('#aimCoach').classList.toggle('visible', choosingBlink || (mine && lastTurn !== game.turnNumber && !localStorage.getItem('tankAimLearned')));
  if (mine && lastTurn !== game.turnNumber) { $('#turnBanner').classList.remove('show'); void $('#turnBanner').offsetWidth; $('#turnBanner').classList.add('show'); renderer.setAim({ angle: Number($('#angle').value), power: Number($('#power').value), direction: aimDirection, visible: true }); audio.turn(); }
  lastTurn = game.turnNumber;
}

function renderResult() {
  const coopVictory = game.mode === 'coop' && game.winningTeam === 'humans'; const personalVictory = game.winner === playerId || coopVictory;
  if (!resultSoundPlayed) { audio.victory(personalVictory); resultSoundPlayed = true; }
  screen('resultScreen'); const winner = game.players.find((p) => p.id === game.winner); $('#winnerName').textContent = game.mode === 'coop' ? (coopVictory ? 'MISSÃO CUMPRIDA!' : 'EQUIPE ELIMINADA') : winner?.id === playerId ? 'VITÓRIA!' : winner ? `${winner.nickname} VENCEU` : 'EMPATE';
  $('#winnerSubtitle').textContent = game.mode === 'coop' ? (coopVictory ? 'Os comandantes humanos derrotaram todos os bots.' : 'Os bots dominaram a arena.') : winner ? 'Foi o último tanque de pé.' : 'Nenhum tanque sobreviveu.';
  const ranked = [...game.players].sort((a, b) => Number(b.alive) - Number(a.alive) || b.health - a.health || b.stats.damage - a.stats.damage);
  $('#ranking').innerHTML = ranked.map((p, i) => `<div class="rank-row"><b>#${i + 1}</b><span>${escapeHtml(p.nickname)}</span><span>${p.stats.damage} DANO • ${p.stats.shots} TIROS</span></div>`).join('');
  $('#rematchButton').hidden = playerId !== room.hostId;
}

setInterval(() => {
  if (!game) return;
  if (game.phase === 'playing') { const seconds = Math.max(0, Math.ceil((game.turnEndsAt - gameNow()) / 1000)); $('#turnTimer').textContent = seconds; const offer = game.players.find((player) => player.id === playerId)?.rewardOffer; if (offer) $('#rewardCountdown').textContent = Math.max(0, Math.ceil((offer.expiresAt - gameNow()) / 1000)); }
  if (game.phase === 'arsenal') $('#arsenalCountdown').textContent = Math.max(0, Math.ceil((game.arsenalEndsAt - gameNow()) / 1000));
}, 200);
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
net.connect();
