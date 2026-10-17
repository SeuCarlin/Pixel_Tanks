// A native media-element path for mobile browsers that report a running
// AudioContext but still produce no sound from its Web Audio graph.
const RATE = 22050;
export const SOUND_PRESETS = {
  ready: { duration: .42, notes: [523, 659, 784], shape: 'sine' },
  ui: { duration: .12, notes: [660, 880], shape: 'square' },
  move: { duration: .17, notes: [105, 76], shape: 'square', noise: .08 },
  shot: { duration: .34, notes: [320, 100], shape: 'saw', noise: .16 },
  heavy: { duration: .52, notes: [175, 42], shape: 'saw', noise: .2 },
  electric: { duration: .48, notes: [1320, 220], shape: 'square', noise: .3 },
  launch: { duration: .4, notes: [170, 1040], shape: 'saw', noise: .13 },
  pickup: { duration: .46, notes: [440, 659, 880], shape: 'sine' },
  power: { duration: .36, notes: [350, 1050], shape: 'sine' },
  explosion: { duration: .9, notes: [110, 33], shape: 'saw', noise: .38 },
  thunder: { duration: 1.3, notes: [96, 32], shape: 'saw', noise: .48 },
  warning: { duration: .5, notes: [530, 230], shape: 'square' },
  turn: { duration: .32, notes: [460, 690, 920], shape: 'sine' },
  victory: { duration: .9, notes: [440, 554, 659, 880], shape: 'sine' },
  defeat: { duration: .85, notes: [320, 210, 110], shape: 'saw' },
  music: { duration: 16.55, notes: [], shape: 'arrangement' },
};

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

const midi = (note) => 440 * 2 ** ((note - 69) / 12);
export const MENU_BEAT = 60 / 116;
export const MENU_CHORDS = [
  [57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 74], [55, 59, 62, 64],
  [50, 53, 57, 60], [52, 55, 59, 62], [53, 57, 60, 64], [55, 59, 62, 67],
];
export const MENU_BASS = [33, 29, 36, 31, 38, 40, 29, 31];
export const MENU_LEAD = [
  [[0, 69, .85], [1.5, 72, .5], [2.5, 74, .4], [3, 76, .8]],
  [[0, 72, .8], [1.5, 69, .5], [2.5, 67, .4], [3, 69, .8]],
  [[0, 67, .75], [1, 72, .45], [2, 74, .55], [3, 79, .75]],
  [[0, 76, .8], [1.5, 74, .45], [2.5, 72, .4], [3, 71, .75]],
  [[0, 69, .75], [1, 72, .45], [2, 77, .6], [3, 76, .75]],
  [[0, 74, .8], [1.5, 71, .45], [2.5, 69, .4], [3, 67, .75]],
  [[0, 69, .6], [1, 72, .45], [2, 76, .55], [3, 81, .65]],
  [[0, 79, .65], [1, 74, .5], [2, 71, .5], [3, 67, .7]],
];
export const MENU_STRUM = [0, .75, 1.5, 2.25, 2.75, 3.5];

// Original menu theme: a steady field-march pulse, warm brass and syncopated
// plucked chords. The melody and progression are original, not a song sample.
function menuTheme() {
  const beat = MENU_BEAT;
  const frames = Math.round(beat * 32 * RATE);
  const mix = new Float32Array(frames);
  let seed = 591;
  const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0xffffffff * 2 - 1; };
  function note(start, length, pitch, instrument, volume) {
    const begin = Math.round(start * RATE);
    const count = Math.min(Math.round(length * RATE), frames - begin);
    const frequency = midi(pitch);
    for (let i = 0; i < count; i += 1) {
      const t = i / RATE; const p = i / count;
      const phase = 2 * Math.PI * frequency * (instrument === 'brass' ? t + .0008 * Math.sin(t * 11) : t);
      const body = instrument === 'pluck' ? Math.sin(phase) + .35 * Math.sin(2 * phase) + .12 * Math.sin(3 * phase)
        : instrument === 'brass' ? Math.sin(phase) + .32 * Math.sin(2 * phase) + .18 * Math.sin(3 * phase)
          : Math.sin(phase) + .19 * Math.sin(2 * phase);
      const attack = Math.min(1, t / (instrument === 'brass' ? .045 : .009));
      const envelope = instrument === 'pluck' ? Math.exp(-5.5 * p) : instrument === 'brass' ? Math.pow(1 - p, .7) : Math.exp(-3.3 * p);
      mix[begin + i] += body * attack * envelope * volume;
    }
  }
  function drum(start, kind) {
    const begin = Math.round(start * RATE);
    const length = kind === 'kick' ? .19 : kind === 'snare' ? .13 : .055;
    const count = Math.min(Math.round(length * RATE), frames - begin);
    for (let i = 0; i < count; i += 1) {
      const t = i / RATE; const p = i / count;
      const body = kind === 'kick' ? Math.sin(2 * Math.PI * (108 * t - 58 * t * t)) * Math.exp(-8 * p)
        : kind === 'snare' ? (noise() * .75 + Math.sin(2 * Math.PI * 180 * t) * .25) * Math.exp(-10 * p)
          : noise() * Math.exp(-13 * p);
      mix[begin + i] += body * (kind === 'kick' ? .24 : kind === 'snare' ? .14 : .045);
    }
  }
  for (let bar = 0; bar < 8; bar += 1) {
    const start = bar * beat * 4;
    for (const [offset, pitch, duration] of MENU_LEAD[bar]) note(start + offset * beat, duration * beat, pitch, 'brass', .105);
    for (let step = 0; step < 8; step += 1) {
      const moment = start + step * beat / 2;
      drum(moment, step % 4 === 0 ? 'kick' : step % 4 === 2 ? 'snare' : 'hat');
      if (step % 2 === 1) drum(moment, 'hat');
    }
    for (let pulse = 0; pulse < 4; pulse += 1) note(start + pulse * beat, .45 * beat, MENU_BASS[bar] + (pulse % 2 ? 7 : 0), 'bass', .18);
    for (let step = 0; step < MENU_STRUM.length; step += 1) {
      const chord = MENU_CHORDS[bar];
      note(start + MENU_STRUM[step] * beat, .65 * beat, chord[(step + bar) % chord.length], 'pluck', .078);
      if (step % 2 === 0) note(start + (MENU_STRUM[step] + .035) * beat, .55 * beat, chord[(step + bar + 2) % chord.length], 'pluck', .04);
    }
  }
  for (let i = 0; i < mix.length; i += 1) {
    const edge = Math.min(1, i / (RATE * .03), (mix.length - i) / (RATE * .1));
    mix[i] = Math.tanh(mix[i] * 1.45) * .78 * Math.max(0, edge);
  }
  return encodeWav(mix);
}

export function wavBlob(kind) {
  if (kind === 'music') return menuTheme();
  const preset = SOUND_PRESETS[kind] || SOUND_PRESETS.ui;
  const frames = Math.round(RATE * preset.duration);
  const samples = new Float64Array(frames);
  let seed = 43;
  for (let i = 0; i < frames; i += 1) {
    const t = i / RATE; const progress = t / preset.duration;
    const noteIndex = Math.min(preset.notes.length - 1, Math.floor(progress * preset.notes.length));
    const next = Math.min(preset.notes.length - 1, noteIndex + 1);
    const fraction = progress * preset.notes.length - noteIndex;
    const frequency = preset.notes[noteIndex] + (preset.notes[next] - preset.notes[noteIndex]) * fraction;
    const phase = 2 * Math.PI * frequency * t;
    const wave = preset.shape === 'square' ? Math.sign(Math.sin(phase)) : preset.shape === 'saw' ? 2 * (frequency * t % 1) - 1 : preset.shape === 'triangle' ? 2 / Math.PI * Math.asin(Math.sin(phase)) : Math.sin(phase);
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff * 2 - 1) * (preset.noise || 0);
    const attack = Math.min(1, t / .012);
    const envelope = attack * Math.pow(Math.max(0, 1 - progress), 1.25);
    samples[i] = (wave * .4 + noise) * envelope;
  }
  return encodeWav(samples);
}

export class MobileAudio {
  constructor() {
    this.supported = typeof globalThis.Audio === 'function' && Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
    this.ready = false; this.effect = null; this.music = null; this.unlockPromise = null; this.lastPlayPromise = null; this.lastError = null; this.playSerial = 0;
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

  play(kind, volume = 1) {
    if (!this.ready || !this.effect || globalThis.document?.hidden) return false;
    try {
      const serial = ++this.playSerial;
      this.effect.pause(); this.effect.src = this.url(kind); this.effect.volume = Math.max(0, Math.min(1, volume));
      const attempt = this.effect.play();
      this.lastPlayPromise = Promise.resolve(attempt).then(() => true).catch((error) => {
        if (serial !== this.playSerial && error?.name === 'AbortError') return false;
        this.lastError = error?.name || 'play failed'; this.ready = false; return false;
      });
      return true;
    } catch (error) { this.lastError = error?.name || 'play failed'; this.ready = false; return false; }
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
  stop() { this.effect?.pause(); this.stopMusic(); }
}
