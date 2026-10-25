// A native media-element path for mobile browsers that report a running
// AudioContext but still produce no sound from its Web Audio graph.
import { audioAssetUrl, selectedAudioKind, CUSTOM_SOUND_DURATIONS } from './audio-assets.js';
const RATE = 22050;
export const SOUND_PRESETS = {
  'missile-flight': { duration: 1.75 },
  'guided-missile-flight': { duration: 1 },
  'firework-flight': { duration: 2 },
  'propulsion-vortex': { duration: 2.4 },
  'shot-alt-a': { duration: 1.65 },
  'shot-alt-b': { duration: 1.9 },
  'impact-alt-a': { duration: 1.9 },
  'impact-alt-b': { duration: 1.7 },
  'helicopter-pass': { duration: 2.5 },
  'holy-revival': { duration: 2.8 },
  'thunder-roll': { duration: 2.7 },
  'thunder-clap': { duration: 2.2 },
  'thunder-anime': { duration: 2.6 },
  ready: { duration: .7, notes: [523, 659, 784], shape: 'sine' },
  ui: { duration: .2, notes: [660, 880], shape: 'square' },
  'ui-hover': { duration: .11 },
  'ui-confirm': { duration: .55 },
  'ui-cancel': { duration: .5 },
  'ui-combo': { duration: .8 },
  move: { duration: .35, notes: [105, 76], shape: 'square', noise: .08 },
  shot: { duration: 1, notes: [320, 100], shape: 'saw', noise: .16 },
  heavy: { duration: 1.3, notes: [175, 42], shape: 'saw', noise: .2 },
  electric: { duration: .95, notes: [1320, 220], shape: 'square', noise: .3 },
  eagle: { duration: .85, notes: [710, 1510, 540, 430], shape: 'saw', noise: .08 },
  vortex: { duration: .9, notes: [115, 310, 420, 125], shape: 'saw', noise: .28 },
  'vortex-deflect': { duration: .48, notes: [720, 1280, 270], shape: 'triangle', noise: .21 },
  'vortex-fire': { duration: .82, notes: [410, 180, 55], shape: 'saw', noise: .37 },
  'sentry-burst': { duration: .85 },
  'water-splash': { duration: 1.75 },
  'water-flow': { duration: 1 },
  'ice-break': { duration: .9 },
  'tree-break': { duration: .85 },
  'harpoon-latch': { duration: .6 },
  'harpoon-pull': { duration: .85 },
  'shark-bite': { duration: .85 },
  gale: { duration: 2.3 },
  'quake-warning': { duration: 2 },
  'quake-impact': { duration: 2.12 },
  rain: { duration: 2 },
  bombardment: { duration: 1.8 },
  eruption: { duration: 2 },
  supply: { duration: 1.4 },
  parachute: { duration: .8 },
  'water-jet': { duration: 2 },
  'water-mine': { duration: 2.25 },
  'ap-impact': { duration: .8 },
  drill: { duration: 1.3 },
  'laser-impact': { duration: 1.7 },
  meteor: { duration: 2.4 },
  'shot-cluster': { duration: 1.05 },
  'shot-fireworks': { duration: .91 },
  'shot-grenade': { duration: 1.07 },
  'shot-vertical': { duration: 1.05 },
  'shot-seismic': { duration: 1 },
  'shot-drone': { duration: .94 },
  'shot-mole': { duration: .87 },
  'shot-mega': { duration: 1.05 },
  'shot-laser': { duration: 1.48 },
  'shot-flame': { duration: 1.22 },
  'shot-cryo': { duration: .93 },
  'shot-ap': { duration: 1.275 },
  'shot-gravity': { duration: 1.01 },
  'shot-soap': { duration: .92 },
  'shot-harpoon': { duration: .88 },
  'shot-hunter': { duration: 1.06 },
  'shot-deploy': { duration: .82 },
  'shot-kinetic': { duration: .82 },
  'shot-marker': { duration: 1.12 },
  'shot-torpedo': { duration: 1.04 },
  'shot-wind-plate': { duration: .8 },
  'shot-meteor': { duration: 1.07 },
  'shot-water-hunter': { duration: 1.3 },
  'shot-zeus': { duration: 1.38 },
  'shot-tesla': { duration: 1.15 },
  'shot-lightning-rod': { duration: 1.25 },
  'shot-mine': { duration: 1.19 },
  'shot-water-mine': { duration: 1.4 },
  'shot-elemental-water': { duration: 1.09 },
  'shot-elemental-earth': { duration: 1.4 },
  'shot-vital': { duration: .85 },
  launch: { duration: .65, notes: [170, 1040], shape: 'saw', noise: .13 },
  pickup: { duration: .75, notes: [440, 659, 880], shape: 'sine' },
  power: { duration: .75, notes: [350, 1050], shape: 'sine' },
  'shield-up': { duration: .7, notes: [310, 620, 1040, 1310], shape: 'sine', noise: .06 },
  'cloak-up': { duration: .8, notes: [1420, 980, 570, 210], shape: 'triangle', noise: .08 },
  explosion: { duration: 1.4, notes: [110, 33], shape: 'saw', noise: .38 },
  'explosion-dry': { duration: 1.33 },
  'explosion-rolling': { duration: 2.4 },
  'explosion-heavy': { duration: 1.85 },
  'explosion-mega': { duration: 2.12 },
  'explosion-fireworks': { duration: 1.4 },
  'impact-iron': { duration: .8 },
  'impact-concrete': { duration: .8 },
  'impact-wood': { duration: .75 },
  'impact-earth': { duration: 1.3 },
  'impact-fire': { duration: .9 },
  'impact-ice': { duration: 1.3 },
  'impact-wind': { duration: .9 },
  thunder: { duration: 1.65, notes: [96, 32], shape: 'saw', noise: .48 },
  'bombardment-warning': { duration: 1.8 },
  'bombardment-impact': { duration: 1.37 },
  'bombardment-strike': { duration: 1.4 },
  'bombardment-bed-v2': { duration: 2.4 },
  'bombardment-hit-v2': { duration: 1.47 },
  'ambient-wind': { duration: 3.2 },
  'ambient-breeze': { duration: 3.2 },
  'ambient-leaves': { duration: 2.8 },
  'ambient-dust': { duration: 2.4 },
  'ambient-water': { duration: 2.8 },
  'ambient-waterfall': { duration: 3.2 },
  'ambient-rain': { duration: 3.2 },
  'ambient-snow': { duration: 3.2 },
  'ambient-ice': { duration: 2.7 },
  'ambient-fire': { duration: 2.76 },
  warning: { duration: 1.7, notes: [530, 230], shape: 'square' },
  turn: { duration: .4, notes: [460, 690, 920], shape: 'sine' },
  victory: { duration: 1.45, notes: [440, 554, 659, 880], shape: 'sine' },
  defeat: { duration: 1.25, notes: [320, 210, 110], shape: 'saw' },
  music: { duration: 4, notes: [330, 392, 440, 392, 294, 370, 440, 370, 330, 392, 494, 440, 294, 330, 392, 247], shape: 'triangle' },
};
const SOUND_PRIORITY = { 'missile-flight': 2, 'guided-missile-flight': 2, 'firework-flight': 2, 'propulsion-vortex': 4, ui: 0, 'ui-hover': 0, 'ui-confirm': 1, 'ui-cancel': 0, 'ui-combo': 2, ready: 0, turn: 1, move: 1, pickup: 1, power: 2, 'shield-up': 3, 'cloak-up': 3, warning: 2, launch: 2, shot: 2, electric: 2, eagle: 4, vortex: 3, 'vortex-deflect': 3, 'vortex-fire': 4, 'sentry-burst': 2, 'water-splash': 2, 'water-flow': 1, 'ice-break': 3, 'tree-break': 3, 'harpoon-latch': 2, 'harpoon-pull': 2, 'shark-bite': 4, gale: 3, 'quake-warning': 3, 'quake-impact': 5, rain: 2, bombardment: 4, 'bombardment-warning': 3, 'bombardment-impact': 4, 'bombardment-strike': 5, 'bombardment-bed-v2': 2, 'bombardment-hit-v2': 5, 'ambient-wind': 0, 'ambient-breeze': 0, 'ambient-leaves': 0, 'ambient-dust': 0, 'ambient-water': 0, 'ambient-waterfall': 0, 'ambient-rain': 0, 'ambient-snow': 0, 'ambient-ice': 0, 'ambient-fire': 0, eruption: 4, supply: 2, parachute: 1, 'water-jet': 3, 'water-mine': 4, 'ap-impact': 4, drill: 3, 'laser-impact': 4, meteor: 5, heavy: 3, explosion: 4, thunder: 4, victory: 5, defeat: 5,
  'shot-alt-a': 2, 'shot-alt-b': 2, 'impact-alt-a': 4, 'impact-alt-b': 4,
  'helicopter-pass': 2, 'holy-revival': 4, 'thunder-roll': 3, 'thunder-clap': 5, 'thunder-anime': 5,
  'shot-cluster': 2, 'shot-fireworks': 2, 'shot-grenade': 2, 'shot-vertical': 2, 'shot-seismic': 2, 'shot-drone': 2, 'shot-mole': 2, 'shot-mega': 3, 'shot-laser': 3,
  'shot-flame': 2, 'shot-cryo': 2, 'shot-ap': 2, 'shot-gravity': 2, 'shot-soap': 2, 'shot-harpoon': 2, 'shot-hunter': 2, 'shot-deploy': 2,
  'shot-kinetic': 2, 'shot-marker': 2, 'shot-torpedo': 2, 'shot-wind-plate': 2, 'shot-meteor': 2, 'shot-water-hunter': 2,
  'shot-zeus': 3, 'shot-tesla': 2, 'shot-lightning-rod': 2, 'shot-mine': 2, 'shot-water-mine': 2, 'shot-elemental-water': 2, 'shot-elemental-earth': 2, 'shot-vital': 2,
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

function minimalPreset(kind) {
  const preset = SOUND_PRESETS[kind];
  if (preset?.notes) return preset;
  const duration = preset?.duration || .5;
  const variant = [...kind].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 17) % 80;
  if (kind.startsWith('ui-')) return { duration, notes: [640 + variant, 880 + variant], shape: 'sine', noise: .025 };
  if (kind.startsWith('shot-')) {
    if (/zeus|tesla|lightning/.test(kind)) return { duration, notes: [1250 + variant, 340], shape: 'square', noise: .14 };
    if (/water|torpedo/.test(kind)) return { duration, notes: [520 + variant, 145], shape: 'sine', noise: .16 };
    if (/vital/.test(kind)) return { duration, notes: [470, 780 + variant], shape: 'sine', noise: .06 };
    return { duration, notes: [330 + variant, 85 + variant / 3], shape: /cryo|marker/.test(kind) ? 'triangle' : 'saw', noise: .12 + variant / 1000 };
  }
  if (kind.startsWith('impact-')) {
    const material = kind.slice(7);
    const styles = { iron: [1120, 180, 'square', .14], concrete: [280, 72, 'saw', .21], wood: [470, 125, 'triangle', .12], earth: [205, 58, 'saw', .18], fire: [720, 110, 'saw', .17], ice: [1500, 430, 'triangle', .1], wind: [680, 260, 'sine', .22] };
    const [from, to, shape, noise] = styles[material] || styles.earth;
    return { duration, notes: [from, to], shape, noise };
  }
  if (/explosion|bombardment|quake|meteor|eruption/.test(kind)) return { duration, notes: [165 + variant, 42], shape: 'saw', noise: .24 };
  if (/rain|gale|water|vortex|parachute/.test(kind)) return { duration, notes: [370 + variant, 160], shape: 'sine', noise: .2 };
  if (/tree|leaves|dust|drill/.test(kind)) return { duration, notes: [440 + variant, 130], shape: 'triangle', noise: .18 };
  return { duration, notes: [610 + variant, 245], shape: 'square', noise: .08 };
}

function ambientWavBlob(kind) {
  const duration = SOUND_PRESETS[kind].duration;
  const frames = Math.round(RATE * duration);
  const samples = new Float64Array(frames);
  let seed = kind === 'ambient-wind' ? 29 : kind === 'ambient-leaves' ? 71 : kind === 'ambient-dust' ? 113 : 157;
  let low = 0; let mid = 0;
  for (let index = 0; index < frames; index += 1) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    low += (white - low) * .008; mid += (white - mid) * (kind === 'ambient-wind' ? .055 : .26);
    const time = index / RATE; const progress = time / duration;
    const fade = Math.min(1, time / .18, (duration - time) / .22);
    const motion = kind === 'ambient-wind' ? .55 + Math.sin(time * 2.2) * .18 : kind === 'ambient-leaves' ? .12 + Math.pow(Math.max(0, Math.sin(time * 5.3) * Math.cos(time * 3.4)), 2) * .8 : kind === 'ambient-water' ? .28 + Math.pow(Math.sin(time * 3.2), 2) * .44 : .16 + Math.pow(Math.max(0, Math.sin(time * 8.4)), 6) * .48;
    const texture = kind === 'ambient-wind' ? (mid - low) * .12 + low * .2 : kind === 'ambient-leaves' ? (white - mid) * .047 + mid * .095 : kind === 'ambient-water' ? mid * .12 + low * .1 : (white - mid) * .05 + low * .09;
    samples[index] = texture * motion * Math.max(0, fade) * (1 - progress * .1) * 2.8;
  }
  return encodeWav(samples);
}

const IMPACT_STYLES = {
  explosion: { body: 1, crack: 1, debris: 0 },
  'explosion-dry': { body: .85, crack: 1.22, debris: 0 },
  'explosion-rolling': { body: 1.08, crack: .9, debris: 3 },
  'explosion-heavy': { body: 1.22, crack: 1.12, debris: 2 },
  'explosion-mega': { body: 1.35, crack: 1.18, debris: 4 },
  'explosion-fireworks': { body: .68, crack: 1.12, debris: 6 },
  'bombardment-hit-v2': { body: 1.28, crack: 1.3, debris: 3 },
};

// A short bright crack, a pitched mid-bass thud and sparse debris make blasts
// readable on phone speakers without replacing the game's pixel-like sound.
function impactWavBlob(kind) {
  const style = IMPACT_STYLES[kind];
  const duration = SOUND_PRESETS[kind].duration;
  const frames = Math.round(RATE * duration);
  const samples = new Float64Array(frames);
  let seed = [...kind].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 17);
  let low = 0; let mid = 0;
  const debrisTimes = Array.from({ length: style.debris }, (_, index) => .14 + index * (kind === 'explosion-fireworks' ? .15 : .19));
  for (let index = 0; index < frames; index += 1) {
    const time = index / RATE;
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    low += (white - low) * .025;
    mid += (white - mid) * .24;
    const bright = white - mid;
    const presence = mid - low;
    const onset = Math.min(1, time / .0015);
    const crack = bright * Math.exp(-time * 46) * .53 * style.crack;
    const grit = presence * Math.exp(-time * 8.5 / duration) * .57 * style.body;
    const swept = Math.min(time, .42);
    const pitch = 170 - 95 * swept / .42;
    const phase = 170 * swept - 95 * swept * swept / (.42 * 2) + 75 * Math.max(0, time - .42);
    const thud = Math.sin(2 * Math.PI * phase)
      * Math.exp(-time * 5.8 / duration) * .35 * style.body;
    const sub = Math.sin(2 * Math.PI * pitch * time * .54) * Math.exp(-time * 7 / duration) * .09 * style.body;
    let fragments = 0;
    for (const at of debrisTimes) {
      const elapsed = time - at;
      if (elapsed >= 0 && elapsed < .11) fragments += (bright * .12 + presence * .17) * Math.exp(-elapsed * 28);
    }
    samples[index] = Math.max(-.78, Math.min(.78, (crack + grit + thud + sub + fragments) * onset));
  }
  return encodeWav(samples);
}

export function wavBlob(kind) {
  if (kind.startsWith('ambient-')) return ambientWavBlob(kind);
  if (IMPACT_STYLES[kind]) return impactWavBlob(kind);
  const preset = minimalPreset(kind);
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
    // Later procedural cues need the same perceived level as the original short synths.
    samples[i] = (wave * .4 + noise) * envelope * (SOUND_PRESETS[kind]?.notes ? 1 : kind === 'ui-hover' ? .26 : .38);
  }
  return encodeWav(samples);
}

export class MobileAudio {
  constructor() {
    this.supported = typeof globalThis.Audio === 'function' && Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
    this.ready = false; this.effect = null; this.channels = []; this.music = null; this.unlockPromise = null; this.lastPlayPromise = null; this.lastError = null; this.playSerial = 0;
  }

  // Real .wav URLs are more reliable than blob URLs in mobile WebKit.
  url(kind) { return audioAssetUrl(kind in SOUND_PRESETS ? kind : 'ui', import.meta.url).href; }

  unlock() {
    if (!this.supported) return Promise.resolve(false);
    if (this.ready) return Promise.resolve(true);
    if (this.unlockPromise) return this.unlockPromise;
    try {
      this.effect ||= new Audio();
      this.effect.preload = 'auto'; this.effect.src = this.url('ready'); this.effect.volume = .9;
      // play() is invoked synchronously in the tap handler, before any await.
      const attempt = this.effect.play();
      const secondary = Array.from({ length: 5 }, () => {
        const element = new Audio(); element.preload = 'auto'; element.src = this.url('ready'); element.volume = 0;
        const priming = Promise.resolve(element.play()).then(() => { element.pause(); return element; }).catch(() => null);
        return priming;
      });
      this.unlockPromise = Promise.resolve(attempt).then(() => {
        this.ready = true; this.lastError = null;
        this.channels = [{ element: this.effect, busyUntil: 0, priority: 0 }];
        Promise.all(secondary).then((extra) => this.channels.push(...extra.filter(Boolean).map((element) => ({ element, busyUntil: 0, priority: 0 }))));
        return true;
      }).catch((error) => { this.lastError = error?.name || 'play failed'; return false; }).finally(() => { this.unlockPromise = null; });
      return this.unlockPromise;
    } catch (error) { this.lastError = error?.name || 'play failed'; return Promise.resolve(false); }
  }

  play(kind, volume = 1, priority = SOUND_PRIORITY[kind] || 0, rate = 1, maxDuration = null) {
    if (!this.ready || !this.effect || globalThis.document?.hidden) return false;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const available = this.channels.filter((channel) => now >= channel.busyUntil);
    const channel = available[0] || this.channels.filter((entry) => priority >= entry.priority).sort((a, b) => a.priority - b.priority || a.busyUntil - b.busyUntil)[0];
    if (!channel) return false;
    try {
      const serial = ++this.playSerial;
      const element = channel.element;
      element.pause(); element.src = this.url(kind); element.volume = Math.max(0, Math.min(1, volume)); element.playbackRate = Math.max(.85, Math.min(1.15, rate));
      const chosen = selectedAudioKind(kind);
      const fullDuration = CUSTOM_SOUND_DURATIONS[chosen] || SOUND_PRESETS[chosen]?.duration || SOUND_PRESETS[kind]?.duration || .2;
      channel.kind = kind; channel.priority = priority; channel.playId = serial; channel.busyUntil = now + Math.min(fullDuration, Number.isFinite(maxDuration) && maxDuration > 0 ? maxDuration : Infinity) * 1000;
      const attempt = element.play();
      if (Number.isFinite(maxDuration) && maxDuration > 0) setTimeout(() => { if (channel.playId === serial) { element.pause(); channel.busyUntil = 0; channel.kind = null; } }, maxDuration * 1000);
      this.lastPlayPromise = Promise.resolve(attempt).then(() => true).catch((error) => {
        if (serial !== this.playSerial && error?.name === 'AbortError') return false;
        this.lastError = error?.name || 'play failed'; channel.busyUntil = 0; return false;
      });
      return true;
    } catch (error) { this.lastError = error?.name || 'play failed'; channel.busyUntil = 0; return false; }
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
  stopAmbient(kind = null) { for (const channel of this.channels) if (channel.kind?.startsWith('ambient-') && (!kind || channel.kind === kind)) { channel.element.pause(); channel.busyUntil = 0; channel.kind = null; } }
  stop() { for (const channel of this.channels) { channel.element.pause(); channel.busyUntil = 0; } this.stopMusic(); }
}
