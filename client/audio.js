export class BattleAudio {
  constructor() {
    let storedPreference = null; try { storedPreference = localStorage.getItem('tankSound'); } catch {}
    this.enabled = storedPreference !== 'off';
    this.context = null;
    this.master = null;
    this.resumePromise = null;
    this.lastSliderAt = 0;
    this.lastHoverAt = 0;
    this.activationConfirmed = false;
    this.menuMusicPlaying = false;
    this.menuMusicStep = 0;
    this.menuMusicTimer = null;
  }

  async unlock() {
    if (!this.enabled) return false;
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      if (this.context?.state === 'closed') { this.context = null; this.master = null; this.activationConfirmed = false; }
      this.context ||= new AudioContextClass();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = .58;
        // A direct output is more reliable than a compressor chain on mobile
        // WebKit and on desktop devices with dynamically changing outputs.
        this.master.connect(this.context.destination);
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

  async activate(feedback = true) {
    const ready = await this.unlock();
    if (ready && feedback && !this.activationConfirmed) {
      this.activationConfirmed = true;
      this.tone(520, 760, .12, 'square', .13);
      this.tone(760, 1040, .16, 'sine', .1, .08);
    }
    return ready;
  }

  resumeExisting() { if (this.enabled && this.context && this.context.state !== 'running') return this.unlock(); return Promise.resolve(this.context?.state === 'running'); }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('tankSound', this.enabled ? 'on' : 'off'); } catch {}
    if (this.enabled) { this.activationConfirmed = false; this.activate(true); }
    else this.stopMenuMusic();
    return this.enabled;
  }

  isReady() { return Boolean(this.enabled && this.context?.state === 'running'); }

  startMenuMusic() {
    if (!this.isReady() || this.menuMusicPlaying) return false;
    this.menuMusicPlaying = true;
    this.menuMusicStep = 0;
    this.playMenuMusicStep();
    return true;
  }

  stopMenuMusic() {
    this.menuMusicPlaying = false;
    clearTimeout(this.menuMusicTimer);
    this.menuMusicTimer = null;
  }

  playMenuMusicStep() {
    if (!this.menuMusicPlaying || !this.isReady()) { this.stopMenuMusic(); return; }
    const melody = [330, 392, 440, 392, 294, 370, 440, 370, 330, 392, 494, 440, 294, 330, 392, 247];
    const bass = [82.41, 73.42, 98, 65.41];
    const step = this.menuMusicStep % melody.length;
    const note = melody[step];
    this.tone(note, note * (step % 4 === 3 ? 1.015 : 1), .19, step % 2 ? 'triangle' : 'square', .032);
    if (step % 4 === 0) {
      const bassNote = bass[Math.floor(step / 4) % bass.length];
      this.tone(bassNote, bassNote * .995, .62, 'triangle', .045);
      this.noise(.035, .018, 0, 2100, 'highpass');
    } else if (step % 4 === 2) this.noise(.025, .012, 0, 3100, 'highpass');
    this.menuMusicStep += 1;
    this.menuMusicTimer = setTimeout(() => this.playMenuMusicStep(), 250);
  }

  hover() {
    if (!this.isReady()) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now - this.lastHoverAt < 55) return;
    this.lastHoverAt = now;
    this.tone(690, 930, .045, 'square', .035);
    this.tone(1160, 880, .035, 'sine', .018, .018);
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

  thunder(delay = 0, intensity = 1) {
    this.noise(.07, .48 * intensity, delay, 5200, 'highpass');
    this.noise(1.15, .4 * intensity, delay + .025, 980);
    this.rumble(delay + .04, 1.15 * intensity, 1.05);
    this.noise(.75, .18 * intensity, delay + .42, 520);
    this.tone(68, 24, 1.35, 'sawtooth', .19 * intensity, delay + .08);
  }

  shotModifier(type, delay = 0) {
    if (type === 'freeze') { this.tone(1850, 480, .55, 'triangle', .15, delay); this.tone(1320, 2100, .32, 'sine', .08, delay + .12); }
    else if (type === 'guidedBullet') { for (let step = 0; step < 4; step += 1) this.tone(620 + step * 150, 760 + step * 170, .1, 'square', .045, delay + step * .08); }
    else if (type === 'armorPiercer') { this.noise(.08, .18, delay, 5200, 'highpass'); this.tone(980, 95, .28, 'square', .16, delay); }
    else if (type === 'shockwave') { this.tone(105, 920, .62, 'sine', .25, delay); this.noise(.44, .2, delay + .03, 1500); }
    else if (type === 'bunkerBuster') { this.tone(92, 28, .8, 'sawtooth', .26, delay); this.noise(.68, .32, delay, 610); }
    else if (type === 'molotov') { this.noise(.58, .17, delay, 2600, 'highpass'); for (let pop = 0; pop < 5; pop += 1) this.noise(.035, .055, delay + .08 + pop * .09, 1900); }
    else if (type === 'bridgeKit') { for (let hit = 0; hit < 4; hit += 1) this.tone(460 + hit * 70, 250, .07, 'square', .06, delay + hit * .075); }
    else if (type === 'bigExplosion') { this.tone(130, 42, .72, 'sawtooth', .2, delay); this.noise(.72, .26, delay, 820); }
    else if (type === 'doubleShot' || type === 'tripleShot' || type === 'extraShot') { const count = type === 'tripleShot' ? 3 : 2; for (let shot = 0; shot < count; shot += 1) this.tone(720 + shot * 120, 390, .1, 'square', .055, delay + shot * .06); }
  }

  shoot(flightSeconds = .5, weapon = 'standard', hits = 0, effect = {}) {
    this.unlock();
    const impactAt = Math.max(.08, flightSeconds);
    const heavy = weapon === 'heavy' || effect.megaMissile;
    const laser = effect.laser;
    const charge = Math.max(1, effect.damageMultiplier || 1);
    const modifier = effect.combo?.[0] || (effect.freeze ? 'freeze' : effect.shockwave ? 'shockwave' : effect.bunkerBuster ? 'bunkerBuster' : effect.armorPiercer ? 'armorPiercer' : null);
    if (effect.mirror) { this.tone(920, 1640, .22, 'sine', .12); this.tone(1640, 920, .24, 'triangle', .09, .18); }
    if (effect.flyingHunter) { this.tone(150, 310, Math.max(.7, flightSeconds * .65), 'sawtooth', .16); this.noise(Math.max(.5, flightSeconds * .6), .09, 0, 2200, 'bandpass'); const dive = Math.max(.22, flightSeconds * .48); this.tone(1420, 520, .28, 'triangle', .16, dive); this.tone(760, 1260, .2, 'sine', .1, dive + .1); }
    this.noise(.055, heavy ? .32 : .22, 0, weapon === 'teslaOrb' || weapon === 'zeus' ? 5200 : 3200, 'highpass');
    if (effect.megaMissile) { this.tone(82, 28, .72, 'sawtooth', .52); this.noise(.55, .42, .015, 560); }
    else if (laser) { this.tone(1680, 210, .62, 'sine', .3); this.tone(2450, 780, .32, 'square', .1); }
    else if (weapon === 'heavy') { this.tone(138, 36, .44, 'sawtooth', .4); this.noise(.46, .36, .018, 610); }
    else if (weapon === 'cluster') { for (let shell = 0; shell < 3; shell += 1) this.tone(340 + shell * 55, 105, .3, 'square', .1, shell * .045); }
    else if (weapon === 'fireworks') { this.tone(290, 1480, .78, 'sawtooth', .2); this.noise(.16, .13, 0, 3100, 'highpass'); }
    else if (weapon === 'zeus' || weapon === 'teslaOrb') { this.tone(1760, 360, .48, 'sawtooth', .24); for (let arc = 0; arc < 4; arc += 1) this.noise(.035, .11, arc * .055, 5600, 'highpass'); }
    else if (weapon === 'seismicCharge') { this.tone(118, 42, .65, 'square', .27); this.rumble(.04, .72, .52); }
    else if (weapon === 'droneStrike') { this.tone(540, 920, .2, 'square', .12); for (let ping = 0; ping < 3; ping += 1) this.tone(1120, 1480, .055, 'sine', .055, .2 + ping * .12); }
    else if (weapon === 'mineLayer') { for (let mine = 0; mine < 3; mine += 1) this.tone(270 + mine * 55, 180, .12, 'square', .08, mine * .09); }
    else if (weapon === 'moleBomb') { this.tone(125, 54, Math.max(.7, flightSeconds), 'square', .17); this.noise(Math.max(.7, flightSeconds), .16, .06, 720); }
    else if (weapon === 'grenade') { this.tone(360, 110, .32, 'triangle', .15); for (let bounce = 1; bounce <= 3; bounce += 1) this.tone(520 - bounce * 75, 280 - bounce * 35, .075, 'square', .07, impactAt * bounce / 4); }
    else if (weapon === 'verticalStrike') { this.tone(820, 1740, .52, 'sawtooth', .2); this.tone(1320, 480, .4, 'sine', .1, .12); }
    else { this.tone(225, 62, .25, 'sawtooth', .28); this.noise(.22, .22, .018, 980); }
    if (!laser && !['gravity', 'moleBomb', 'fireworks'].includes(weapon)) this.tone(weapon === 'grenade' ? 320 : 520, weapon === 'grenade' ? 92 : 175, Math.max(.18, Math.min(.85, flightSeconds)), 'triangle', .065, .045);
    if (weapon === 'gravity') {
      this.tone(420, 38, .85, 'sine', .25); this.noise(.4, .18, 0, 520);
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
    if (weapon === 'cluster') for (let index = 0; index < 3; index += 1) { this.noise(.25, .23, impactAt + .08 + index * .09, 1250); this.tone(260 + index * 60, 48, .22, 'sawtooth', .11, impactAt + .08 + index * .09); }
    if (weapon === 'fireworks') for (let index = 0; index < 12; index += 1) { const delay = impactAt + index * .055; this.tone(760 + index % 4 * 170, 210, .13, index % 2 ? 'square' : 'triangle', .075, delay); this.noise(.1, .075, delay, 2100); }
    if (weapon === 'droneStrike') for (let missile = 0; missile < 3; missile += 1) { this.tone(980, 85, .2, 'sawtooth', .12, impactAt + missile * .13); this.noise(.2, .15, impactAt + missile * .13, 1400); }
    if (weapon === 'teslaOrb' || weapon === 'zeus') { this.thunder(impactAt, .72); for (let arc = 0; arc < 4; arc += 1) this.noise(.045, .16, impactAt + arc * .07, 6200, 'highpass'); }
    if (weapon === 'seismicCharge') { for (let wave = 0; wave < 3; wave += 1) this.rumble(impactAt + wave * .18, .85 + wave * .18, .62); }
    if (weapon === 'mineLayer') for (let mine = 0; mine < 3; mine += 1) this.tone(650 - mine * 80, 240, .11, 'square', .075, impactAt + mine * .1);
    if (weapon === 'moleBomb') this.rumble(.12, .65, Math.max(.7, flightSeconds));
    if (effect.freeze) this.tone(1680, 260, .72, 'triangle', .18, impactAt);
    if (effect.shockwave) this.tone(105, 760, .58, 'sine', .24, impactAt);
    if (modifier && modifier !== 'megaMissile') this.shotModifier(modifier, impactAt + .02);
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
  move(kind = 'tracks') { this.unlock(); if (kind === 'spider') { for (let foot = 0; foot < 4; foot += 1) this.tone(420 + foot * 35, 180, .045, 'square', .045, foot * .035); return; } if (kind === 'armoredDash') { this.tone(105, 42, .34, 'sawtooth', .19); this.noise(.28, .2, 0, 680); return; } this.tone(92, 58, .13, 'square', .08); this.noise(.11, .07, 0, 760); this.tone(54, 72, .08, 'triangle', .055, .075); }

  power(type) {
    this.unlock();
    if (type === 'invisibility') { this.tone(1480, 120, .48, 'sine', .12); this.noise(.28, .07, 0, 3200, 'highpass'); }
    else if (type === 'shield') { this.tone(340, 960, .32, 'triangle', .13); this.tone(680, 1220, .42, 'sine', .08, .08); }
    else if (type === 'heal' || type === 'repairDrone') [440, 554, 659, 880].forEach((note, index) => this.tone(note, note * 1.08, .16, 'sine', .07, index * .065));
    else if (type === 'excavator') { this.tone(145, 52, .38, 'square', .14); this.noise(.34, .13, 0, 820); }
    else if (type === 'teleport' || type === 'lightningStep') { this.tone(420, 1480, .25, 'sine', .12); this.tone(1180, 260, .28, 'square', .07, .08); }
    else if (type === 'rocketDash' || type === 'movementBoost') { this.tone(180, 1180, .3, 'sawtooth', .13); this.noise(.18, .09, 0, 2200, 'highpass'); }
    else if (type === 'mirror') { this.tone(780, 1560, .24, 'sine', .12); this.tone(1560, 780, .26, 'triangle', .09, .1); }
    else if (type === 'trickster') { this.tone(260, 1320, .28, 'square', .12); this.tone(1320, 210, .32, 'sine', .1, .08); }
    else if (type === 'flyingHunter') { this.tone(125, 460, .42, 'sawtooth', .13); this.tone(1420, 530, .24, 'triangle', .1, .22); }
    else { this.tone(520, 840, .12, 'square', .08); this.tone(920, 1180, .14, 'sine', .06, .07); }
  }

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
      if (warning) { this.noise(2.1, .12, 0, 430); this.thunder(.18, .48); this.thunder(1.05, .34); this.tone(980, 1420, .7, 'sawtooth', .08, .08); }
      else { this.tone(2300, 72, .32, 'sawtooth', .36); this.thunder(0, 1.18); this.thunder(.52, .7); for (let crack = 0; crack < 5; crack += 1) this.noise(.028, .19, crack * .045, 6800, 'highpass'); }
    } else if (type === 'luckyWinds') {
      [392, 523, 659, 784].forEach((note, index) => this.tone(note, note * 1.04, .38, 'sine', .085, index * .12));
    } else if (type === 'gale') {
      this.noise(warning ? 2.2 : 3, warning ? .18 : .38, 0, warning ? 1800 : 2600, 'bandpass'); this.tone(warning ? 190 : 130, warning ? 420 : 680, warning ? 1.8 : 3, 'sine', warning ? .08 : .15);
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
  launch(kind = 'jump') { this.unlock(); if (kind === 'parachute') { this.noise(.42, .1, 0, 2600, 'highpass'); this.tone(620, 340, .28, 'sine', .075); return; } if (kind === 'spiderLeap') { this.tone(260, 1160, .34, 'square', .15); for (let leg = 0; leg < 4; leg += 1) this.tone(720 + leg * 90, 340, .07, 'triangle', .05, leg * .045); this.noise(.18, .1, 0, 1900); return; } if (kind === 'doubleDash' || kind === 'rocketDash') { this.tone(92, 1480, .48, 'sawtooth', .24); this.noise(.4, .22, 0, 2400, 'highpass'); this.rumble(.03, .42, .38); return; } this.tone(140, 1080, .42, 'sawtooth', .15); this.noise(.25, .16, 0, 1600); this.tone(65, 180, .3, 'square', .1, .06); }
  armoredDash(walls = 0, hits = 0) { this.unlock(); this.tone(92, 34, .68, 'sawtooth', .3); this.noise(.52, .36, 0, 720); this.tone(58, 155, .38, 'square', .17, .04); for (let index = 0; index < walls; index += 1) { const delay = .14 + index * .11; this.noise(.28, .3, delay, 1450); this.rumble(delay, .72 + index * .08, .42); } if (hits) { this.tone(310, 42, .34, 'square', .24, .38); this.rumble(.36, 1.2, .72); } }

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
