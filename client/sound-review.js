import { SOUND_PRESETS } from './mobile-audio.js';
import { audioAssetUrl } from './audio-assets.js';

const explicit = {
  'missile-flight': ['missile-flight-magiaz', 'missile-flight-fall', 'missile-flight-firework'],
  'guided-missile-flight': ['missile-flight-magiaz', 'missile-flight-heavy', 'missile-flight-firework'],
  'firework-flight': ['missile-flight-firework', 'missile-flight-fall', 'missile-flight-magiaz'],
  shot: ['shot', 'shot-kinetic', 'heavy'], heavy: ['heavy', 'shot-mega', 'shot-kinetic'],
  'shot-vertical': ['shot-vertical', 'shot-zeus', 'shot-laser'],
  'shot-flame': ['shot-flame', 'eruption', 'shot-fireworks'],
  'shot-elemental-water': ['shot-elemental-water', 'water-jet', 'shot-water-hunter'],
  'shot-cryo': ['shot-cryo', 'impact-ice', 'ice-break'],
  'shot-elemental-earth': ['shot-elemental-earth', 'shot-seismic', 'impact-earth'],
  vortex: ['vortex', 'vortex-deflect', 'shot-gravity'],
  'vortex-deflect': ['vortex-deflect', 'vortex', 'impact-wind'],
  'vortex-fire': ['vortex-fire', 'eruption', 'impact-fire'],
  'impact-fire': ['impact-fire', 'eruption', 'explosion-dry'],
  'water-splash': ['water-splash', 'water-mine', 'impact-earth'],
  'impact-ice': ['impact-ice', 'ice-break', 'water-splash'],
  'impact-wind': ['impact-wind', 'vortex-deflect', 'gale'],
  'impact-earth': ['impact-earth', 'explosion-dry', 'quake-impact'],
  explosion: ['explosion', 'explosion-dry', 'explosion-rolling'],
  'explosion-dry': ['explosion-dry', 'explosion', 'impact-earth'],
  'explosion-heavy': ['explosion-heavy', 'explosion-rolling', 'bombardment-hit-v2'],
  'explosion-mega': ['explosion-mega', 'explosion-heavy', 'quake-impact'],
  'bombardment-hit-v2': ['bombardment-hit-v2', 'explosion-heavy', 'bombardment-impact'],
  thunder: ['thunder', 'electric', 'bombardment-strike'],
  'impact-wood': ['impact-wood', 'tree-break', 'impact-earth'],
  'impact-concrete': ['impact-concrete', 'impact-iron', 'explosion-rolling'],
  'impact-iron': ['impact-iron', 'impact-concrete', 'ap-impact'],
  'shield-up': ['shield-up', 'electric', 'power'],
  'cloak-up': ['cloak-up', 'power', 'vortex-deflect'],
  'ui-hover': ['ui-hover', 'ui', 'ui-confirm'],
  'ui-confirm': ['ui-confirm', 'ready', 'pickup'],
  'ui-combo': ['ui-combo', 'power', 'ready'],
  'ambient-wind': ['ambient-wind', 'ambient-breeze', 'gale'],
  'ambient-water': ['ambient-water', 'ambient-waterfall', 'water-flow'],
  'ambient-fire': ['ambient-fire', 'eruption', 'impact-fire'],
  'ambient-ice': ['ambient-ice', 'ambient-snow', 'ice-break'],
};

const groups = {
  'Interface': ['ui-hover', 'ui', 'ui-confirm'],
  'Movimento e tanques': ['move', 'parachute', 'launch'],
  'Disparos': ['shot-kinetic', 'shot', 'heavy'],
  'Impactos e explosões': ['explosion', 'explosion-dry', 'explosion-heavy'],
  'Elementos e poderes': ['power', 'electric', 'vortex'],
  'Eventos': ['warning', 'bombardment-strike', 'quake-impact'],
  'Ambiente': ['ambient-breeze', 'ambient-wind', 'ambient-leaves'],
};

function category(kind) {
  if (['missile-flight', 'guided-missile-flight', 'firework-flight'].includes(kind)) return 'Disparos';
  if (kind.startsWith('ui') || ['ready', 'turn', 'warning', 'victory', 'defeat'].includes(kind)) return 'Interface';
  if (kind.startsWith('ambient-') || kind === 'music') return 'Ambiente';
  if (['move', 'parachute', 'tree-break', 'drill', 'harpoon-pull'].includes(kind)) return 'Movimento e tanques';
  if (kind.startsWith('shot') || ['heavy', 'launch', 'water-jet', 'sentry-burst'].includes(kind)) return 'Disparos';
  if (kind.startsWith('impact') || kind.startsWith('explosion') || ['ap-impact', 'laser-impact', 'water-splash', 'water-mine', 'ice-break', 'harpoon-latch', 'shark-bite', 'meteor'].includes(kind)) return 'Impactos e explosões';
  if (['bombardment', 'bombardment-bed-v2', 'bombardment-hit-v2', 'bombardment-impact', 'bombardment-strike', 'bombardment-warning', 'supply', 'eruption', 'gale', 'rain', 'thunder', 'quake-warning', 'quake-impact'].includes(kind)) return 'Eventos';
  return 'Elementos e poderes';
}

const names = {
  'missile-flight': 'Trilha do míssil no ar · novo', 'guided-missile-flight': 'Míssil guiado no ar · novo', 'firework-flight': 'Microfoguetes dos fogos no ar · novo',
  shot: 'Disparo padrão', heavy: 'Disparo pesado', vortex: 'Vórtex ao nascer', 'vortex-deflect': 'Vórtex desviando projétil', 'vortex-fire': 'Vórtex pegando fogo',
  'shot-flame': 'Disparo elemental: fogo', 'shot-elemental-water': 'Disparo elemental: água', 'shot-cryo': 'Disparo elemental: gelo', 'shot-elemental-earth': 'Disparo elemental: terra',
  'impact-fire': 'Impacto elemental: fogo', 'water-splash': 'Impacto elemental: água', 'impact-ice': 'Impacto elemental: gelo', 'impact-wind': 'Impacto elemental: vento', 'impact-earth': 'Impacto elemental: terra',
  'shot-vertical': 'Tiro Vetorial: mudança de rota', 'explosion-dry': 'Explosão no solo', 'explosion-heavy': 'Explosão pesada', 'explosion-mega': 'Explosão atômica',
  'bombardment-hit-v2': 'Bombardeio: impacto', 'ambient-breeze': 'Brisa ambiente', 'ambient-wind': 'Vento ambiente', 'ambient-fire': 'Fogo ambiente', 'ambient-water': 'Água ambiente', 'ambient-ice': 'Gelo ambiente',
};
function label(kind) { return names[kind] || kind.replaceAll('-', ' ').replaceAll('v2', 'segunda versão').replace(/^./, (letter) => letter.toUpperCase()); }

const flightCandidates = new Set(['missile-flight-magiaz', 'missile-flight-fall', 'missile-flight-firework', 'missile-flight-heavy']);
const newOccurrences = new Set(['missile-flight', 'guided-missile-flight', 'firework-flight']);
const allKinds = [...newOccurrences, ...Object.keys(SOUND_PRESETS).filter((kind) => kind !== 'music')];
const saved = (() => { try { return JSON.parse(localStorage.getItem('tankdotsSoundReview') || '{}'); } catch { return {}; } })();
const state = Object.fromEntries(Object.entries(saved).filter(([kind, choice]) => allKinds.includes(kind) && choice?.confirmed && ['A', 'B', 'C'].includes(choice.option)));
const player = new Audio();
const $ = (selector) => document.querySelector(selector);
const status = (message) => { $('#status').textContent = message; };

function choices(kind) {
  const base = explicit[kind] || [kind, ...groups[category(kind)]];
  return [...new Set(base.filter((candidate) => candidate in SOUND_PRESETS || flightCandidates.has(candidate)))].concat(groups[category(kind)].filter((candidate) => candidate !== kind && !base.includes(candidate))).slice(0, 3);
}

function render() {
  const search = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const selectedCategory = $('#category').value;
  const filter = $('#filter').value;
  const visible = allKinds.filter((kind) => (!selectedCategory || category(kind) === selectedCategory) && (!search || `${kind} ${label(kind)}`.toLocaleLowerCase('pt-BR').includes(search)) && (filter !== 'pending' || !state[kind]) && (filter !== 'confirmed' || state[kind]));
  $('#list').replaceChildren();
  for (const kind of visible) {
    const row = document.createElement('section'); row.className = `row ${state[kind] ? 'confirmed' : ''}`; row.dataset.kind = kind;
    const heading = document.createElement('div'); heading.className = 'row-head';
    const title = document.createElement('strong'); title.textContent = label(kind);
    const meta = document.createElement('span'); meta.textContent = `${category(kind)} · ${kind}`;
    heading.append(title, meta); row.append(heading);
    const options = document.createElement('div'); options.className = 'options';
    for (const [index, candidate] of choices(kind).entries()) {
      const letter = 'ABC'[index]; const option = document.createElement('div'); option.className = `option ${state[kind]?.option === letter ? 'selected' : ''}`;
      const choiceLabel = document.createElement('label');
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = kind; radio.value = letter; radio.checked = state[kind]?.option === letter;
      radio.onchange = () => { for (const sibling of options.children) sibling.classList.toggle('selected', sibling.querySelector('input').checked); };
      const letterLabel = document.createElement('b'); letterLabel.textContent = letter;
      choiceLabel.append(radio, letterLabel); const play = document.createElement('button'); play.type = 'button'; play.textContent = '▶ OUVIR';
      play.onclick = async () => { player.pause(); player.src = audioAssetUrl(candidate, import.meta.url).href; player.currentTime = 0; try { await player.play(); status(`${label(kind)} · opção ${letter}: ${candidate}.wav`); } catch { status('Não foi possível reproduzir. Clique novamente para liberar o áudio.'); } };
      const filename = document.createElement('code'); filename.textContent = ({ 'missile-flight-magiaz': 'míssil contínuo', 'missile-flight-fall': 'queda rasante', 'missile-flight-firework': 'assobio de fogo de artifício', 'missile-flight-heavy': 'motor de míssil pesado' })[candidate] || `${candidate}.wav`;
      option.append(choiceLabel, play, filename); options.append(option);
    }
    row.append(options);
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const hint = document.createElement('span'); hint.textContent = state[kind] ? `Confirmado: ${state[kind].option}` : newOccurrences.has(kind) ? 'Novo som de voo · A sugerida' : 'A = som usado hoje';
    const confirm = document.createElement('button'); confirm.className = 'confirm'; confirm.type = 'button'; confirm.textContent = state[kind] ? '✓ CONFIRMADO' : 'CONFIRMAR OPÇÃO';
    confirm.onclick = () => { const selected = options.querySelector('input:checked'); if (!selected) { status('Escolha A, B ou C antes de confirmar.'); return; } state[kind] = { option: selected.value, sound: choices(kind)['ABC'.indexOf(selected.value)], confirmed: true }; localStorage.setItem('tankdotsSoundReview', JSON.stringify(state)); status(`${label(kind)}: opção ${selected.value} confirmada.`); render(); };
    actions.append(hint, confirm); row.append(actions); $('#list').append(row);
  }
  $('#counter').textContent = `${Object.keys(state).length}/${allKinds.length} confirmados`;
}

for (const item of ['', ...new Set(allKinds.map(category))]) { if (!item) continue; const option = document.createElement('option'); option.value = item; option.textContent = item; $('#category').append(option); }
for (const element of ['#search', '#category', '#filter']) element && $(element).addEventListener('input', render);
$('#copy').onclick = async () => {
  const payload = JSON.stringify({ game: 'TankDots Wars', version: 1, selections: state }, null, 2);
  try { await navigator.clipboard.writeText(payload); status(`${Object.keys(state).length} escolhas copiadas. Cole o JSON na conversa.`); }
  catch { status('Não foi possível copiar automaticamente. Selecione o texto abaixo.'); const preview = document.createElement('textarea'); preview.value = payload; preview.style.width = '100%'; preview.style.minHeight = '160px'; $('#list').prepend(preview); preview.select(); }
};
render();
