// A native media-element path for mobile browsers that report a running
// AudioContext but still produce no sound from its Web Audio graph.
const RATE = 22050;
export const SOUND_PRESETS = {
  ready: { duration: .42, notes: [523, 659, 784], shape: 'sine' },
  ui: { duration: .12, notes: [660, 880], shape: 'square' },
  'ui-hover': { duration: .5 },
  'ui-confirm': { duration: .55 },
  'ui-cancel': { duration: .5 },
  'ui-combo': { duration: .8 },
  move: { duration: .17, notes: [105, 76], shape: 'square', noise: .08 },
  shot: { duration: .34, notes: [320, 100], shape: 'saw', noise: .16 },
  heavy: { duration: .52, notes: [175, 42], shape: 'saw', noise: .2 },
  electric: { duration: .48, notes: [1320, 220], shape: 'square', noise: .3 },
  eagle: { duration: .85, notes: [710, 1510, 540, 430], shape: 'saw', noise: .08 },
  vortex: { duration: .9, notes: [115, 310, 420, 125], shape: 'saw', noise: .28 },
  'vortex-deflect': { duration: .48, notes: [720, 1280, 270], shape: 'triangle', noise: .21 },
  'vortex-fire': { duration: .82, notes: [410, 180, 55], shape: 'saw', noise: .37 },
  'sentry-burst': { duration: 1 },
  'water-splash': { duration: .8 },
  'water-flow': { duration: 1 },
  'ice-break': { duration: .9 },
  'tree-break': { duration: .85 },
  'harpoon-latch': { duration: .6 },
  'harpoon-pull': { duration: .85 },
  'shark-bite': { duration: .85 },
  gale: { duration: 2.3 },
  'quake-warning': { duration: 2 },
  'quake-impact': { duration: 2.3 },
  rain: { duration: 2 },
  bombardment: { duration: 1.8 },
  eruption: { duration: 2 },
  supply: { duration: 1.4 },
  parachute: { duration: .8 },
  'water-jet': { duration: 2 },
  'water-mine': { duration: 1.15 },
  'ap-impact': { duration: .8 },
  drill: { duration: 1.3 },
  'laser-impact': { duration: 1 },
  meteor: { duration: 1.7 },
  'shot-cluster': { duration: .95 },
  'shot-fireworks': { duration: .95 },
  'shot-grenade': { duration: .95 },
  'shot-vertical': { duration: .95 },
  'shot-seismic': { duration: .95 },
  'shot-drone': { duration: .95 },
  'shot-mole': { duration: .95 },
  'shot-mega': { duration: .95 },
  'shot-laser': { duration: .95 },
  'shot-flame': { duration: .95 },
  'shot-cryo': { duration: .95 },
  'shot-ap': { duration: .95 },
  'shot-gravity': { duration: .95 },
  'shot-soap': { duration: .95 },
  'shot-harpoon': { duration: .95 },
  'shot-hunter': { duration: .95 },
  'shot-deploy': { duration: .95 },
  'shot-kinetic': { duration: .8 },
  'shot-marker': { duration: .85 },
  'shot-torpedo': { duration: 1 },
  'shot-wind-plate': { duration: .9 },
  'shot-meteor': { duration: 1 },
  'shot-water-hunter': { duration: .9 },
  launch: { duration: .4, notes: [170, 1040], shape: 'saw', noise: .13 },
  pickup: { duration: .46, notes: [440, 659, 880], shape: 'sine' },
  power: { duration: .36, notes: [350, 1050], shape: 'sine' },
  'shield-up': { duration: .62, notes: [310, 620, 1040, 1310], shape: 'sine', noise: .06 },
  'cloak-up': { duration: .72, notes: [1420, 980, 570, 210], shape: 'triangle', noise: .08 },
  explosion: { duration: .9, notes: [110, 33], shape: 'saw', noise: .38 },
  'explosion-dry': { duration: 1 },
  'explosion-rolling': { duration: 1.35 },
  'explosion-heavy': { duration: 1.35 },
  'explosion-mega': { duration: 2.3 },
  'explosion-fireworks': { duration: 1.4 },
  'impact-iron': { duration: .8 },
  'impact-concrete': { duration: .8 },
  'impact-wood': { duration: .75 },
  'impact-earth': { duration: .8 },
  'impact-fire': { duration: .9 },
  'impact-ice': { duration: .9 },
  'impact-wind': { duration: .9 },
  thunder: { duration: 1.3, notes: [96, 32], shape: 'saw', noise: .48 },
  warning: { duration: .5, notes: [530, 230], shape: 'square' },
  turn: { duration: .32, notes: [460, 690, 920], shape: 'sine' },
  victory: { duration: .9, notes: [440, 554, 659, 880], shape: 'sine' },
  defeat: { duration: .85, notes: [320, 210, 110], shape: 'saw' },
  music: { duration: 4, notes: [330, 392, 440, 392, 294, 370, 440, 370, 330, 392, 494, 440, 294, 330, 392, 247], shape: 'triangle' },
};
const SOUND_PRIORITY = { ui: 0, 'ui-hover': 0, 'ui-confirm': 1, 'ui-cancel': 0, 'ui-combo': 2, ready: 0, turn: 1, move: 1, pickup: 1, power: 2, 'shield-up': 3, 'cloak-up': 3, warning: 2, launch: 2, shot: 2, electric: 2, eagle: 4, vortex: 3, 'vortex-deflect': 3, 'vortex-fire': 4, 'sentry-burst': 2, 'water-splash': 2, 'water-flow': 1, 'ice-break': 3, 'tree-break': 3, 'harpoon-latch': 2, 'harpoon-pull': 2, 'shark-bite': 4, gale: 3, 'quake-warning': 3, 'quake-impact': 5, rain: 2, bombardment: 4, eruption: 4, supply: 2, parachute: 1, 'water-jet': 3, 'water-mine': 4, 'ap-impact': 4, drill: 3, 'laser-impact': 4, meteor: 5, heavy: 3, explosion: 4, thunder: 4, victory: 5, defeat: 5,
  'shot-cluster': 2, 'shot-fireworks': 2, 'shot-grenade': 2, 'shot-vertical': 2, 'shot-seismic': 2, 'shot-drone': 2, 'shot-mole': 2, 'shot-mega': 3, 'shot-laser': 3,
  'shot-flame': 2, 'shot-cryo': 2, 'shot-ap': 2, 'shot-gravity': 2, 'shot-soap': 2, 'shot-harpoon': 2, 'shot-hunter': 2, 'shot-deploy': 2,
  'shot-kinetic': 2, 'shot-marker': 2, 'shot-torpedo': 2, 'shot-wind-plate': 2, 'shot-meteor': 2, 'shot-water-hunter': 2,
  'explosion-heavy': 4, 'explosion-mega': 4, 'explosion-fireworks': 4, 'explosion-dry': 4, 'explosion-rolling': 4,
  'impact-iron': 4, 'impact-concrete': 4, 'impact-wood': 4, 'impact-earth': 4, 'impact-fire': 4, 'impact-ice': 4, 'impact-wind': 4 };

function encodeWav(samples) {
  const frames = samples.length;
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const label = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  label(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); label(8, 'WAVE');
  label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i += 1) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Blob([bytes], { type: 'audio/wav' });
}

export function wavBlob(kind) {
  const preset = SOUND_PRESETS[kind]?.notes ? SOUND_PRESETS[kind] : { ...SOUND_PRESETS.ui, duration: SOUND_PRESETS[kind]?.duration || SOUND_PRESETS.ui.duration };
  const frames = Math.round(RATE * preset.duration);
  const samples = new Float64Array(frames);
  let seed = 43;
  for (let i = 0; i < frames; i += 1) {
    const t = i / RATE; const progress = t / preset.duration;
    const noteIndex = Math.min(preset.notes.length - 1, Math.floor(progress * preset.notes.length));
    const next = Math.min(preset.notes.length - 1, noteIndex + 1);
    const fraction = progress * preset.notes.length - noteIndex;
    const frequency = preset.notes[noteIndex] + (preset.notes[next] - preset.notes[noteIndex]) * (kind === 'music' ? 0 : fraction);
    const phase = 2 * Math.PI * frequency * t;
    const wave = preset.shape === 'square' ? Math.sign(Math.sin(phase)) : preset.shape === 'saw' ? 2 * (frequency * t % 1) - 1 : preset.shape === 'triangle' ? 2 / Math.PI * Math.asin(Math.sin(phase)) : Math.sin(phase);
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff * 2 - 1) * (preset.noise || 0);
    const attack = Math.min(1, t / .012);
    const envelope = kind === 'music' ? attack * Math.min(1, (preset.duration - t) / .08) * (.72 + .28 * Math.sin(Math.PI * (progress * preset.notes.length % 1))) : attack * Math.pow(Math.max(0, 1 - progress), 1.25);
    samples[i] = (wave * .4 + noise) * envelope;
  }
  return encodeWav(samples);
}

export class MobileAudio {
  constructor() {
    this.supported = typeof globalThis.Audio === 'function' && Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
    this.ready = false; this.effect = null; this.music = null; this.unlockPromise = null; this.lastPlayPromise = null; this.lastError = null; this.playSerial = 0; this.busyUntil = 0; this.currentPriority = 0;
  }

  // Real .wav URLs are more reliable than blob URLs in mobile WebKit.
  url(kind) { return new URL(`./sounds/${kind in SOUND_PRESETS ? kind : 'ui'}.wav`, import.meta.url).href; }

  unlock() {
    if (!this.supported) return Promise.resolve(false);
    if (this.ready) return Promise.resolve(true);
    if (this.unlockPromise) return this.unlockPromise;
    try {
      this.effect ||= new Audio();
      this.effect.preload = 'auto'; this.effect.src = this.url('ready'); this.effect.volume = .9;
      // play() is invoked synchronously in the tap handler, before any await.
      const attempt = this.effect.play();
      this.unlockPromise = Promise.resolve(attempt).then(() => { this.ready = true; this.lastError = null; return true; }).catch((error) => { this.lastError = error?.name || 'play failed'; return false; }).finally(() => { this.unlockPromise = null; });
      return this.unlockPromise;
    } catch (error) { this.lastError = error?.name || 'play failed'; return Promise.resolve(false); }
  }

  play(kind, volume = 1, priority = SOUND_PRIORITY[kind] || 0, rate = 1) {
    if (!this.ready || !this.effect || globalThis.document?.hidden) return false;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now < this.busyUntil && priority < this.currentPriority) return false;
    try {
      const serial = ++this.playSerial;
      this.effect.pause(); this.effect.src = this.url(kind); this.effect.volume = Math.max(0, Math.min(1, volume)); this.effect.playbackRate = Math.max(.85, Math.min(1.15, rate));
      this.currentPriority = priority; this.busyUntil = now + Math.min(.85, SOUND_PRESETS[kind]?.duration || .2) * 1000;
      const attempt = this.effect.play();
      this.lastPlayPromise = Promise.resolve(attempt).then(() => true).catch((error) => {
        if (serial !== this.playSerial && error?.name === 'AbortError') return false;
        this.lastError = error?.name || 'play failed'; this.ready = false; this.busyUntil = 0; return false;
      });
      return true;
    } catch (error) { this.lastError = error?.name || 'play failed'; this.ready = false; this.busyUntil = 0; return false; }
  }

  startMusic(volume = 1) {
    if (!this.ready || globalThis.document?.hidden) return false;
    try {
      this.music ||= new Audio(); this.music.src ||= this.url('music'); this.music.loop = true; this.music.volume = Math.max(0, Math.min(1, volume));
      Promise.resolve(this.music.play()).catch((error) => { this.lastError = error?.name || 'music blocked'; });
      return true;
    } catch (error) { this.lastError = error?.name || 'music blocked'; return false; }
  }

  stopMusic() { this.music?.pause(); }
  stop() { this.effect?.pause(); this.busyUntil = 0; this.stopMusic(); }
}
