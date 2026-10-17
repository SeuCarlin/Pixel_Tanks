export class BattleAudio {
  constructor() {
    this.enabled = localStorage.getItem('tankSound') !== 'off';
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.resumePromise = null;
    this.lastSliderAt = 0;
  }

  async unlock() {
    if (!this.enabled) return false;
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      if (this.context?.state === 'closed') { this.context = null; this.master = null; this.compressor = null; }
      this.context ||= new AudioContextClass();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = .34;
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -16;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 7;
        this.compressor.attack.value = .003;
        this.compressor.release.value = .24;
        this.master.connect(this.compressor);
        this.compressor.connect(this.context.destination);
        // A one-frame silent buffer unlocks Web Audio reliably on iOS Safari.
        const primer = this.context.createBufferSource();
        primer.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        primer.connect(this.master);
        primer.start(0);
      }
      // WebKit may report `interrupted` after screen lock, tab switching or
      // an incoming notification. Resume every non-running state on touch.
      if (this.context.state !== 'running') {
        this.resumePromise ||= this.context.resume().catch(() => false).finally(() => { this.resumePromise = null; });
        await this.resumePromise;
      }
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('tankSound', this.enabled ? 'on' : 'off');
    if (this.enabled) this.unlock().then((ready) => { if (ready) this.ui('confirm'); });
    return this.enabled;
  }

  tone(from, to, duration, type = 'square', volume = .12, delay = 0) {
    if (!this.enabled) return;
    if (!this.context || !this.master || this.context.state !== 'running') { this.unlock().then((ready) => { if (ready) this.tone(from, to, duration, type, volume, delay); }); return; }
    const t = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, from), t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), t + Math.min(.012, duration * .15));
    gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(t);
    oscillator.stop(t + duration + .02);
  }

  noise(duration = .35, volume = .22, delay = 0, cutoff = 900, filterType = 'lowpass') {
    if (!this.enabled) return;
    if (!this.context || !this.master || this.context.state !== 'running') { this.unlock().then((ready) => { if (ready) this.noise(duration, volume, delay, cutoff, filterType); }); return; }
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.ceil(rate * duration), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const t = this.context.currentTime + delay;
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(80, cutoff), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(45, cutoff * .22), t + duration);
    gain.gain.setValueAtTime(.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), t + Math.min(.01, duration * .12));
    gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
  }

  rumble(delay = 0, intensity = 1, duration = .8) {
    this.noise(duration, .32 * intensity, delay, 420);
    this.tone(82, 24, duration, 'sawtooth', .22 * intensity, delay);
    this.tone(48, 22, duration * .9, 'sine', .2 * intensity, delay + .025);
  }

  shoot(flightSeconds = .5, weapon = 'standard', hits = 0, effect = {}) {
    this.unlock();
    const impactAt = Math.max(.08, flightSeconds);
    const heavy = weapon === 'heavy' || effect.megaMissile;
    const laser = effect.laser;
    const charge = Math.max(1, effect.damageMultiplier || 1);
    this.noise(.055, heavy ? .32 : .24, 0, 3200, 'highpass');
    this.tone(laser ? 1420 : effect.megaMissile ? 74 : heavy ? 132 : 210, laser ? 190 : effect.megaMissile ? 34 : heavy ? 40 : 58, laser ? .62 : effect.megaMissile ? .58 : heavy ? .38 : .24, laser ? 'sine' : 'sawtooth', laser ? .3 : effect.megaMissile ? .5 : heavy ? .38 : .28);
    this.noise(heavy ? .42 : .22, heavy ? .34 : .23, .018, heavy ? 620 : 980);
    if (!laser && weapon !== 'gravity') this.tone(weapon === 'grenade' ? 320 : 520, weapon === 'grenade' ? 92 : 175, Math.max(.18, Math.min(.85, flightSeconds)), 'triangle', .075, .045);
    if (weapon === 'gravity') {
      this.tone(210, 36, 2, 'sine', .28, impactAt);
      this.tone(72, 25, 2, 'sawtooth', .21, impactAt);
      this.noise(2, .27, impactAt, 540);
    } else if (laser) {
      this.noise(.22, .25, impactAt, 3600, 'highpass');
      this.tone(920, 72, .65, 'sawtooth', .26, impactAt);
    } else {
      this.rumble(impactAt, effect.megaMissile ? 1.75 : heavy ? 1.25 * charge : .9, effect.megaMissile ? 1.75 : heavy ? 1.05 : .68);
      this.noise(effect.megaMissile ? 1.9 : heavy ? 1.05 : .68, effect.megaMissile ? .58 : heavy ? .5 : .38, impactAt, effect.megaMissile ? 760 : 1100);
    }
    if (effect.megaMissile) { this.rumble(impactAt + .18, 1.45, 2.05); this.noise(2.1, .5, impactAt + .1, 1450); }
    if (weapon === 'cluster') for (let index = 0; index < 3; index += 1) this.noise(.25, .23, impactAt + .08 + index * .09, 1250);
    if (weapon === 'fireworks') for (let index = 0; index < 12; index += 1) { const delay = impactAt + index * .055; this.tone(760 + index % 4 * 170, 210, .13, index % 2 ? 'square' : 'triangle', .075, delay); this.noise(.1, .075, delay, 2100); }
    if (weapon === 'moleBomb') this.rumble(.12, .65, Math.max(.7, flightSeconds));
    if (effect.freeze) this.tone(1680, 260, .72, 'triangle', .18, impactAt);
    if (effect.shockwave) this.tone(105, 760, .58, 'sine', .24, impactAt);
    if (hits) { this.tone(360, 58, .28, 'square', .18, impactAt + .035); this.noise(.28, .24, impactAt + .025, 1800); }
  }

  vertical(flightSeconds = .5, hits = 0) {
    this.unlock();
    const impactAt = Math.max(.08, flightSeconds);
    this.tone(1580, 210, .46, 'sawtooth', .28);
    this.noise(.22, .2, 0, 2800, 'highpass');
    this.tone(240, 38, .62, 'sine', .3, impactAt);
    this.rumble(impactAt, hits ? 1.15 : .9, .78);
    this.noise(.7, hits ? .48 : .38, impactAt, 1150);
  }

  turn() { this.unlock(); this.tone(480, 720, .11, 'square', .1); this.tone(720, 1080, .14, 'square', .085, .105); }
  ui(kind = 'tap') {
    this.unlock();
    if (kind === 'confirm') { this.tone(430, 780, .11, 'square', .1); this.tone(720, 1120, .14, 'sine', .075, .07); return; }
    if (kind === 'cancel') { this.tone(520, 220, .13, 'square', .09); this.noise(.08, .045, 0, 1800); return; }
    if (kind === 'select') { this.tone(310, 520, .08, 'triangle', .08); this.tone(620, 760, .07, 'square', .05, .045); return; }
    if (kind === 'open') { this.tone(240, 680, .16, 'sine', .1); this.noise(.1, .05, 0, 2400, 'highpass'); return; }
    this.tone(390, 620, .075, 'square', .07); this.tone(780, 620, .045, 'sine', .045, .045);
  }

  slider(value = 0) {
    const now = performance.now(); if (now - this.lastSliderAt < 42) return; this.lastSliderAt = now;
    const ratio = Math.max(0, Math.min(1, Number(value) || 0));
    this.unlock(); this.tone(280 + ratio * 520, 330 + ratio * 560, .045, 'square', .035);
  }
  move() { this.unlock(); this.tone(92, 58, .13, 'square', .08); this.noise(.11, .07, 0, 760); this.tone(54, 72, .08, 'triangle', .055, .075); }

  pickup(type) {
    this.unlock();
    const start = type === 'heal' ? 420 : type === 'freeze' ? 1080 : 560;
    [1, 1.34, 1.7].forEach((ratio, index) => this.tone(start * ratio, start * ratio * 1.2, .2, index === 2 ? 'sine' : 'square', .11 - index * .015, index * .085));
    this.noise(.18, .08, .04, 3200, 'highpass');
    if (type === 'megaMissile') this.tone(170, 48, .5, 'sawtooth', .18, .18);
    if (type === 'invisibility') this.tone(1450, 145, .48, 'sine', .1, .08);
  }

  arena(type, warning = true) {
    this.unlock();
    if (type === 'supply') {
      if (warning) { for (let beat = 0; beat < 8; beat += 1) this.noise(.12, .065, beat * .16, 520); this.tone(118, 165, 1.45, 'sawtooth', .09); }
      else [520, 700, 940, 1220].forEach((note, index) => this.tone(note, note * 1.08, .18, 'square', .09, index * .095));
    } else if (type === 'bombardment') {
      if (warning) { this.tone(480, 170, .42, 'square', .16); this.tone(480, 150, .42, 'square', .16, .52); }
      else for (let blast = 0; blast < 5; blast += 1) { this.rumble(blast * .11, .9 + blast * .16, .55 + blast * .08); this.noise(.4 + blast * .07, .32 + blast * .045, blast * .11, 950); }
    } else if (type === 'eruption') {
      this.rumble(0, warning ? .9 : 1.45, warning ? 1.5 : 2.35);
      if (!warning) for (let burst = 0; burst < 7; burst += 1) { this.noise(.28, .25, .18 + burst * .2, 1200); this.tone(125 - burst * 5, 35, .4, 'square', .13, .18 + burst * .2); }
    } else if (type === 'lightning') {
      this.tone(warning ? 1060 : 1900, warning ? 1460 : 80, warning ? .6 : .85, 'sawtooth', warning ? .13 : .3);
      if (!warning) { this.noise(.09, .52, 0, 4200, 'highpass'); this.noise(.78, .42, .03, 1200); this.rumble(.06, 1.1, .85); }
    } else if (type === 'luckyWinds') {
      [392, 523, 659, 784].forEach((note, index) => this.tone(note, note * 1.04, .38, 'sine', .085, index * .12));
    } else if (type === 'tectonic' || type === 'quake') {
      this.rumble(0, warning ? .8 : 1.5, warning ? .9 : 1.45);
      this.noise(warning ? .8 : 1.35, warning ? .22 : .42, 0, 460);
    } else {
      this.tone(340, 820, .3, 'square', .12);
      this.tone(620, 1260, .34, 'sine', .1, .16);
    }
  }

  teleport(delay = 0) { this.unlock(); this.tone(170, 1480, .46, 'sine', .18, delay); this.tone(1080, 110, .54, 'square', .12, delay + .12); this.noise(.36, .13, delay + .08, 2800, 'highpass'); }
  scenario(delay = 0) { this.unlock(); this.noise(.58, .4, delay, 860); this.tone(145, 820, .4, 'square', .14, delay + .04); this.rumble(delay + .04, .7, .62); }
  launch() { this.unlock(); this.tone(140, 1080, .42, 'sawtooth', .15); this.noise(.25, .16, 0, 1600); this.tone(65, 180, .3, 'square', .1, .06); }

  damage(amount = 20) {
    this.unlock();
    const weight = Math.min(1.55, .75 + amount / 110);
    this.noise(.16 + Math.min(.28, amount / 260), .18 * weight, 0, 1500);
    this.tone(220, 42, .24, 'sawtooth', .16 * weight);
    if (amount >= 70) this.rumble(.025, .7, .52);
  }

  status(type) {
    this.unlock();
    if (type === 'heal') [520, 700, 920, 1180].forEach((note, index) => this.tone(note, note * 1.12, .2, 'sine', .09, index * .085));
    else { this.tone(1820, 280, .62, 'triangle', .16); this.noise(.38, .12, 0, 2600, 'highpass'); }
  }

  destroyed() { this.unlock(); this.noise(1.45, .62, 0, 1100); this.rumble(0, 1.65, 1.45); this.tone(118, 22, 1.25, 'sawtooth', .42); this.noise(.62, .36, .24, 2400); }

  victory(won) {
    this.unlock();
    if (won) [440, 554, 659, 880].forEach((note, index) => { this.tone(note, note, .28, 'square', .11, index * .15); this.tone(note / 2, note / 2, .32, 'sine', .08, index * .15); });
    else { this.tone(240, 72, .95, 'sawtooth', .16); this.rumble(.18, .65, .8); }
  }
}
