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

// Keep each occurrence's original A/B/C choices stable so an earlier saved
// selection retains its meaning. D/E are chosen from the closest sound family.
const extraChoices = {
  'missile-flight': ['missile-flight-heavy', 'missile-flight-scifi'],
  'guided-missile-flight': ['missile-flight-fall', 'missile-flight-scifi'],
  'firework-flight': ['missile-flight-heavy', 'missile-flight-scifi'],
  shot: ['shot-grenade', 'shot-ap'], heavy: ['shot', 'shot-cluster'],
  'shot-vertical': ['electric', 'shot-tesla'],
  'shot-flame': ['impact-fire', 'shot-hunter'],
  'shot-elemental-water': ['shot-torpedo', 'shot-soap'],
  'shot-cryo': ['shot-elemental-water', 'ambient-ice'],
  'shot-elemental-earth': ['shot-mole', 'shot-kinetic'],
  vortex: ['gale', 'ambient-wind'],
  'vortex-deflect': ['gale', 'shot-wind-plate'],
  'vortex-fire': ['shot-gravity', 'ambient-fire'],
  'impact-fire': ['explosion', 'vortex-fire'],
  'water-splash': ['impact-ice', 'water-flow'],
  'impact-ice': ['ambient-ice', 'shot-cryo'],
  'impact-wind': ['vortex', 'shot-wind-plate'],
  'impact-earth': ['impact-concrete', 'explosion'],
  explosion: ['bombardment-impact', 'explosion-heavy'],
  'explosion-dry': ['explosion-rolling', 'quake-impact'],
  'explosion-heavy': ['bombardment-impact', 'explosion-mega'],
  'explosion-mega': ['meteor', 'bombardment-hit-v2'],
  'bombardment-hit-v2': ['bombardment-strike', 'explosion-rolling'],
  thunder: ['shot-zeus', 'impact-wind'],
  'impact-wood': ['impact-concrete', 'explosion-dry'],
  'impact-concrete': ['impact-earth', 'quake-impact'],
  'impact-iron': ['laser-impact', 'explosion-rolling'],
  'shield-up': ['ui-confirm', 'shot-tesla'],
  'cloak-up': ['ambient-wind', 'ui-combo'],
  'ui-hover': ['ui-cancel', 'ready'],
  'ui-confirm': ['turn', 'ui-combo'],
  'ui-combo': ['ui-confirm', 'electric'],
  'ambient-wind': ['ambient-dust', 'ambient-leaves'],
  'ambient-water': ['water-flow', 'ambient-rain'],
  'ambient-fire': ['vortex-fire', 'ambient-dust'],
  'ambient-ice': ['impact-ice', 'ambient-breeze'],
};

const familyChoices = (kind) => {
  if (kind.startsWith('ambient-')) {
    if (/water|waterfall|rain/.test(kind)) return ['ambient-water', 'ambient-waterfall', 'ambient-rain', 'water-flow', 'rain'];
    if (/snow|ice/.test(kind)) return ['ambient-snow', 'ambient-ice', 'ambient-wind', 'ice-break', 'impact-ice'];
    if (/fire/.test(kind)) return ['ambient-fire', 'vortex-fire', 'eruption', 'impact-fire', 'ambient-dust'];
    return ['ambient-breeze', 'ambient-wind', 'ambient-leaves', 'ambient-dust', 'gale'];
  }
  if (kind.startsWith('shot-')) {
    if (/water|torpedo|soap/.test(kind)) return ['shot-elemental-water', 'shot-torpedo', 'shot-water-hunter', 'water-jet', 'shot-soap', 'shot-water-mine'];
    if (/zeus|tesla|lightning|vertical/.test(kind)) return ['shot-zeus', 'shot-tesla', 'shot-lightning-rod', 'shot-vertical', 'electric'];
    if (/flame|fireworks|meteor|mega|hunter/.test(kind)) return ['shot-flame', 'shot-fireworks', 'shot-meteor', 'shot-mega', 'heavy'];
    if (/earth|seismic|mole/.test(kind)) return ['shot-elemental-earth', 'shot-seismic', 'shot-mole', 'shot-kinetic', 'heavy'];
    if (/cryo/.test(kind)) return ['shot-cryo', 'impact-ice', 'shot-elemental-water', 'ice-break', 'shot-soap'];
    return ['shot-kinetic', 'shot', 'heavy', 'shot-grenade', 'shot-cluster', 'shot-ap', 'shot-harpoon', 'shot-deploy'];
  }
  if (kind.startsWith('impact-')) {
    if (/fire/.test(kind)) return ['impact-fire', 'eruption', 'vortex-fire', 'explosion-dry', 'explosion'];
    if (/ice/.test(kind)) return ['impact-ice', 'ice-break', 'shot-cryo', 'water-splash', 'ambient-ice'];
    if (/wind/.test(kind)) return ['impact-wind', 'vortex-deflect', 'vortex', 'gale', 'shot-wind-plate'];
    if (/iron|concrete/.test(kind)) return ['impact-iron', 'impact-concrete', 'ap-impact', 'laser-impact', 'explosion-rolling'];
    return ['impact-earth', 'impact-wood', 'impact-concrete', 'explosion-dry', 'quake-impact'];
  }
  if (kind.startsWith('explosion') || /bombardment|quake|meteor/.test(kind)) return ['explosion', 'explosion-dry', 'explosion-heavy', 'explosion-rolling', 'explosion-mega', 'bombardment-impact', 'quake-impact', 'meteor'];
  return [];
};

const categoryExtras = {
  'Interface': ['ui-cancel', 'ui-combo', 'ready', 'turn', 'pickup', 'warning', 'victory', 'defeat'],
  'Movimento e tanques': ['harpoon-pull', 'drill', 'tree-break', 'shot-harpoon', 'ui'],
  'Disparos': ['shot-grenade', 'shot-cluster', 'shot-ap', 'shot-harpoon', 'shot-laser', 'shot-deploy'],
  'Impactos e explosões': ['impact-earth', 'impact-iron', 'impact-wood', 'impact-ice', 'explosion-rolling', 'bombardment-impact'],
  'Elementos e poderes': ['vortex-deflect', 'impact-wind', 'shield-up', 'cloak-up', 'pickup', 'shot-gravity'],
  'Eventos': ['gale', 'thunder', 'eruption', 'rain', 'bombardment-warning', 'supply', 'meteor'],
  'Ambiente': ['ambient-dust', 'ambient-water', 'ambient-fire', 'ambient-rain', 'ambient-snow', 'ambient-ice'],
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

const flightCandidates = new Set(['missile-flight-magiaz', 'missile-flight-fall', 'missile-flight-firework', 'missile-flight-heavy', 'missile-flight-scifi']);
const newOccurrences = new Set(['missile-flight', 'guided-missile-flight', 'firework-flight']);
const allKinds = [...newOccurrences, ...Object.keys(SOUND_PRESETS).filter((kind) => kind !== 'music')];
const saved = (() => { try { return JSON.parse(localStorage.getItem('tankdotsSoundReview') || '{}'); } catch { return {}; } })();
const validOptions = ['A', 'B', 'C', 'D', 'E', 'OUTRO', 'ARQUIVO'];
const state = Object.fromEntries(Object.entries(saved).filter(([kind, choice]) => allKinds.includes(kind) && choice?.confirmed && validOptions.includes(choice.option) && (choice.option !== 'ARQUIVO' || choice.fileName)));
const drafts = new Map();
const catalog = [...new Set([...Object.keys(SOUND_PRESETS), ...flightCandidates])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const player = new Audio();
let playbackSerial = 0;
let previewBlobUrl = null;
let pickerKind = null;
const $ = (selector) => document.querySelector(selector);
const status = (message) => { $('#status').textContent = message; };

function openFileStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tankdotsSoundReviewFiles', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function fileStore(kind, file) {
  const db = await openFileStore();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('files', file ? 'readwrite' : 'readonly');
      const request = file ? transaction.objectStore('files').put(file, kind) : transaction.objectStore('files').get(kind);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(file || request.result);
    });
  } finally { db.close(); }
}

async function playAudio(source, description) {
  const serial = ++playbackSerial;
  player.pause();
  if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); previewBlobUrl = null; }
  if (source instanceof Blob) { previewBlobUrl = URL.createObjectURL(source); player.src = previewBlobUrl; }
  else player.src = source;
  player.currentTime = 0;
  status(description);
  try { await player.play(); }
  catch { if (serial === playbackSerial) status('Não foi possível reproduzir este áudio. Tente novamente.'); }
}

function soundUrl(sound) { return audioAssetUrl(sound, import.meta.url).href; }

function renderPickerResults() {
  const search = $('#pickerSearch').value.trim().toLocaleLowerCase('pt-BR');
  const results = $('#pickerResults');
  results.replaceChildren();
  const matches = catalog.filter((sound) => `${sound} ${label(sound)} ${category(sound)}`.toLocaleLowerCase('pt-BR').includes(search));
  for (const sound of matches) {
    const item = document.createElement('div'); item.className = 'picker-item';
    const name = document.createElement('span'); name.textContent = `${label(sound)} · ${sound}.wav`; name.title = name.textContent;
    const play = document.createElement('button'); play.type = 'button'; play.textContent = '▶ OUVIR';
    play.onclick = () => playAudio(soundUrl(sound), `Prévia: ${sound}.wav`);
    const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'choose'; choose.textContent = 'ESCOLHER';
    choose.onclick = () => {
      drafts.set(pickerKind, { option: 'OUTRO', sound });
      $('#soundPicker').close();
      status(`${label(pickerKind)}: ${sound}.wav escolhido. Confirme na ocorrência para salvar.`);
      render();
    };
    item.append(name, play, choose); results.append(item);
  }
  if (!matches.length) { const empty = document.createElement('p'); empty.textContent = 'Nenhum som encontrado. Você pode escolher um arquivo abaixo.'; results.append(empty); }
}

function openPicker(kind) {
  pickerKind = kind;
  $('#pickerTitle').textContent = `BUSCAR SOM PARA ${label(kind).toLocaleUpperCase('pt-BR')}`;
  $('#pickerSearch').value = '';
  $('#pickerFile').value = '';
  renderPickerResults();
  $('#soundPicker').showModal();
  $('#pickerSearch').focus();
}

function choices(kind) {
  const base = explicit[kind] || [kind, ...groups[category(kind)]];
  const candidates = [...base, ...(extraChoices[kind] || []), ...familyChoices(kind), ...categoryExtras[category(kind)], ...groups[category(kind)]];
  return [...new Set(candidates.filter((candidate) => candidate in SOUND_PRESETS || flightCandidates.has(candidate)))].slice(0, 5);
}

function render() {
  const search = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const selectedCategory = $('#category').value;
  const filter = $('#filter').value;
  const visible = allKinds.filter((kind) => (!selectedCategory || category(kind) === selectedCategory) && (!search || `${kind} ${label(kind)}`.toLocaleLowerCase('pt-BR').includes(search)) && (filter !== 'pending' || !state[kind]) && (filter !== 'confirmed' || state[kind]));
  $('#list').replaceChildren();
  for (const kind of visible) {
    const draft = drafts.get(kind);
    const selection = draft || state[kind];
    const row = document.createElement('section'); row.className = `row ${state[kind] && !draft ? 'confirmed' : ''}`; row.dataset.kind = kind;
    const heading = document.createElement('div'); heading.className = 'row-head';
    const title = document.createElement('strong'); title.textContent = label(kind);
    const meta = document.createElement('span'); meta.textContent = `${category(kind)} · ${kind}`;
    heading.append(title, meta); row.append(heading);
    const options = document.createElement('div'); options.className = 'options';
    for (const [index, candidate] of choices(kind).entries()) {
      const letter = 'ABCDE'[index]; const option = document.createElement('div'); option.className = `option ${selection?.option === letter ? 'selected' : ''}`;
      const choiceLabel = document.createElement('label');
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = kind; radio.value = letter; radio.checked = selection?.option === letter;
      radio.onchange = () => { drafts.set(kind, { option: letter, sound: candidate }); render(); };
      option.onclick = (event) => { if (event.target.closest('button')) return; radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); };
      const letterLabel = document.createElement('b'); letterLabel.textContent = letter;
      choiceLabel.append(radio, letterLabel); const play = document.createElement('button'); play.type = 'button'; play.textContent = '▶ OUVIR';
      play.onclick = () => playAudio(soundUrl(candidate), `${label(kind)} · opção ${letter}: ${candidate}.wav`);
      const filename = document.createElement('code'); filename.title = `${candidate}.wav`; filename.textContent = ({ 'missile-flight-magiaz': 'míssil contínuo', 'missile-flight-fall': 'queda rasante', 'missile-flight-firework': 'assobio de fogo de artifício', 'missile-flight-heavy': 'motor de míssil pesado', 'missile-flight-scifi': 'sopro de míssil sci-fi' })[candidate] || `${candidate}.wav`;
      option.append(choiceLabel, play, filename); options.append(option);
    }
    row.append(options);
    if (selection && ['OUTRO', 'ARQUIVO'].includes(selection.option)) {
      const custom = document.createElement('div'); custom.className = 'custom-choice';
      const name = document.createElement('strong'); name.textContent = selection.option === 'OUTRO' ? `OUTRO SOM: ${selection.sound}.wav` : `ARQUIVO: ${selection.fileName}`;
      const play = document.createElement('button'); play.type = 'button'; play.textContent = '▶ OUVIR ESCOLHA';
      play.onclick = async () => {
        if (selection.option === 'OUTRO') return playAudio(soundUrl(selection.sound), `Prévia: ${selection.sound}.wav`);
        try { const file = await fileStore(kind); if (!file) throw new Error('Arquivo não encontrado'); await playAudio(file, `Prévia: ${selection.fileName}`); }
        catch { status('Este arquivo não está salvo neste navegador. Selecione-o novamente.'); }
      };
      custom.append(name, play); row.append(custom);
    }
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const hint = document.createElement('span'); hint.textContent = draft ? 'Nova escolha pendente' : state[kind] ? `Confirmado: ${state[kind].option}` : newOccurrences.has(kind) ? 'Novo som de voo · A sugerida' : 'A = som usado hoje';
    const browse = document.createElement('button'); browse.className = 'browse'; browse.type = 'button'; browse.textContent = '+ BUSCAR OUTRO SOM'; browse.onclick = () => openPicker(kind);
    const confirm = document.createElement('button'); confirm.className = 'confirm'; confirm.type = 'button'; confirm.textContent = state[kind] && !draft ? '✓ CONFIRMADO' : 'CONFIRMAR OPÇÃO';
    confirm.onclick = () => {
      if (!selection) { status('Escolha uma das sugestões ou busque outro som antes de confirmar.'); return; }
      state[kind] = { ...selection, confirmed: true };
      drafts.delete(kind);
      localStorage.setItem('tankdotsSoundReview', JSON.stringify(state));
      status(`${label(kind)}: ${selection.option === 'ARQUIVO' ? selection.fileName : selection.sound + '.wav'} confirmado.`);
      render();
    };
    actions.append(hint, browse, confirm); row.append(actions); $('#list').append(row);
  }
  $('#counter').textContent = `${Object.keys(state).length}/${allKinds.length} confirmados`;
}

for (const item of ['', ...new Set(allKinds.map(category))]) { if (!item) continue; const option = document.createElement('option'); option.value = item; option.textContent = item; $('#category').append(option); }
for (const element of ['#search', '#category', '#filter']) element && $(element).addEventListener('input', render);
$('#pickerClose').onclick = () => $('#soundPicker').close();
$('#pickerSearch').addEventListener('input', renderPickerResults);
$('#pickerPreviewFile').onclick = () => {
  const file = $('#pickerFile').files[0];
  if (!file) { status('Escolha um arquivo de áudio primeiro.'); return; }
  playAudio(file, `Prévia: ${file.name}`);
};
$('#pickerUseFile').onclick = async () => {
  const file = $('#pickerFile').files[0];
  if (!file) { status('Escolha um arquivo de áudio primeiro.'); return; }
  if (!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg|m4a)$/i.test(file.name)) { status('Escolha um arquivo de áudio MP3, WAV, OGG ou M4A.'); return; }
  const kind = pickerKind;
  const button = $('#pickerUseFile'); button.disabled = true;
  try {
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    await fileStore(kind, file);
    drafts.set(kind, { option: 'ARQUIVO', fileName: file.name, fileSize: file.size, sha256: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('') });
    $('#soundPicker').close();
    status(`${label(kind)}: ${file.name} escolhido. Confirme na ocorrência para salvar. O arquivo permanece neste navegador.`);
    render();
  } catch (error) { status(`Não foi possível salvar o arquivo neste navegador: ${error.message}`); }
  finally { button.disabled = false; }
};
$('#copy').onclick = async () => {
  const payload = JSON.stringify({ game: 'TankDots Wars', version: 1, selections: state }, null, 2);
  try { await navigator.clipboard.writeText(payload); status(`${Object.keys(state).length} escolhas copiadas. Cole o JSON na conversa.`); }
  catch { status('Não foi possível copiar automaticamente. Selecione o texto abaixo.'); const preview = document.createElement('textarea'); preview.value = payload; preview.style.width = '100%'; preview.style.minHeight = '160px'; $('#list').prepend(preview); preview.select(); }
};
render();
