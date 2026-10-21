import { MobileAudio } from './mobile-audio.js';

import { shotLaunchStyle } from './shot-launch.js';

function settledWithin(promise, milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(false); });
  });
}

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
    let savedVolumes = {}; try { savedVolumes = JSON.parse(localStorage.getItem('tankVolumes') || '{}'); } catch {}
    this.volumes = Object.fromEntries(['music', 'effects', 'interface'].map((group) => [group, Math.max(0, Math.min(1, Number(savedVolumes[group] ?? 1) || 0))]));
    this.outputGroup = 'effects';
    this.mobile = new MobileAudio();
  }

  setVolume(group, value) {
    if (!(group in this.volumes)) return;
    this.volumes[group] = Math.max(0, Math.min(1, Number(value) || 0));
    try { localStorage.setItem('tankVolumes', JSON.stringify(this.volumes)); } catch {}
    if (group === 'music' && this.mobile.music) this.mobile.music.volume = this.volumes.music;
  }

  usingMobileAudio() { return this.mobile.ready && this.enabled; }

  playMobile(kind, group = 'effects', delay = 0) {
    if (!this.usingMobileAudio()) return false;
    const volume = this.volumes[group];
    if (volume <= 0) return true;
    if (delay > 0) setTimeout(() => { if (this.usingMobileAudio()) this.mobile.play(kind, volume); }, delay * 1000);
    else this.mobile.play(kind, volume);
    return true;
  }

  inGroup(group, play) { const previous = this.outputGroup; this.outputGroup = group; try { return play(); } finally { this.outputGroup = previous; } }

  requestPlaybackSession() {
    const device = globalThis.navigator;
    if (!device?.audioSession || !(/iPhone|iPad|iPod/.test(device.userAgent || '') || (device.platform === 'MacIntel' && device.maxTouchPoints > 1))) return false;
    try { device.audioSession.type = 'playback'; return device.audioSession.type === 'playback'; } catch { return false; }
  }

  async unlock() {
    if (!this.enabled) return false;
    try {
      // iOS defaults Web Audio to an ambient session, which the silent switch
      // can mute even while AudioContext.state reports "running".
      this.requestPlaybackSession();
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
    if (!this.enabled) return false;
    // Native audio begins in the same tap stack. Web Audio remains available
    // as a fallback, but a hanging resume() must not freeze the enable button.
    this.requestPlaybackSession();
    const native = this.mobile.unlock();
    const web = this.unlock();
    const [nativeReady, webReady] = await Promise.all([settledWithin(native, 3000), settledWithin(web, 1500)]);
    const ready = nativeReady || webReady;
    if (ready && feedback && !this.activationConfirmed) {
      this.activationConfirmed = true;
      if (!this.playMobile('ready', 'interface')) {
        this.tone(520, 760, .12, 'square', .13);
        this.tone(760, 1040, .16, 'sine', .1, .08);
      }
    }
    return ready;
  }

  resumeExisting() { if (this.enabled) this.requestPlaybackSession(); if (this.enabled && this.context && this.context.state !== 'running') return this.unlock(); return Promise.resolve(this.context?.state === 'running'); }

  enable() { this.enabled = true; try { localStorage.setItem('tankSound', 'on'); } catch {} return this.enabled; }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('tankSound', this.enabled ? 'on' : 'off'); } catch {}
    if (this.enabled) { this.activationConfirmed = false; this.activate(true); }
    else { this.stopMenuMusic(); this.mobile.stop(); }
    return this.enabled;
  }

  isReady() { return Boolean(this.enabled && (this.mobile.ready || this.context?.state === 'running')); }

  testOutput() {
    if (!this.isReady()) return false;
    if (this.mobile.ready) {
      const group = this.volumes.interface > 0 ? 'interface' : 'effects';
      if (this.volumes[group] <= 0) return false;
      return this.mobile.play('ready', this.volumes[group], 9);
    }
    this.inGroup('interface', () => { this.tone(480, 720, .16, 'square', .15); this.tone(720, 960, .2, 'sine', .12, .17); });
    this.inGroup('effects', () => this.noise(.14, .18, .34, 2400, 'highpass'));
    return true;
  }

  async testOutputVerified() {
    if (!this.testOutput()) return false;
    return this.usingMobileAudio() ? settledWithin(this.mobile.lastPlayPromise, 2500) : true;
  }

  detonation(weapon) {
    if (!this.isReady()) return;
    if (this.playMobile(weapon === 'megaCannon' || weapon === 'zeus' ? 'thunder' : 'explosion')) return;
    if (weapon === 'zeus') { this.tone(1550, 75, .18, 'square', .24); this.tone(760, 80, .6, 'sawtooth', .17); this.rumble(.06, 1.25, 1.2); this.noise(.7, .43, .02, 3700, 'highpass'); return; }
    if (weapon === 'megaCannon') { this.tone(1380, 55, 1.5, 'sawtooth', .3); this.tone(2100, 320, .9, 'sine', .2); this.rumble(.05, 1.7, 1.4); this.noise(1.45, .65, .02, 2500); }
    else { this.tone(160, 35, .9, 'sawtooth', .26); this.rumble(.05, 1.25, 1.15); this.noise(.85, .4, .02, 1300); }
  }

  impact(shot) {
    if (!this.usingMobileAudio() || !shot?.impact || shot.delayedStrike) return false;
    if (shot.armorPiercer) return this.playMobile('heavy');
    const kind = shot.weapon === 'zeus' || shot.weapon === 'teslaOrb' || shot.weapon === 'verticalStrike' ? 'thunder' :
      shot.weapon === 'fireworks' ? 'explosion-fireworks' : shot.megaMissile || shot.weapon === 'megaCannon' ? 'explosion-mega' :
      shot.weapon === 'heavy' ? 'explosion-heavy' : shot.noExplosion ? 'power' : 'explosion';
    return this.playMobile(kind);
  }

  clusterSplit() { if (!this.isReady()) return; if (this.playMobile('shot')) return; this.tone(750, 155, .45, 'square', .14); for (let i = 0; i < 3; i += 1) this.tone(390 + i * 110, 80, .3, 'sawtooth', .1, i * .08); this.noise(.24, .16, .03, 2600, 'highpass'); }
  eagleDive() { if (!this.isReady()) return; if (this.playMobile('eagle')) return; this.tone(710, 1510, .19, 'sawtooth', .19); this.tone(1510, 540, .53, 'sawtooth', .22, .16); this.tone(1250, 430, .41, 'triangle', .13, .22); this.noise(.38, .075, .19, 2500, 'bandpass'); }
  fireworksBurst() { if (!this.isReady()) return; if (this.playMobile('explosion-fireworks')) return; this.tone(980, 210, .42, 'sawtooth', .18); for (let i = 0; i < 12; i += 1) this.tone(600 + i % 4 * 180, 140, .17, 'triangle', .07, i * .035); this.noise(.3, .2, 0, 3200, 'highpass'); }
  clusterImpact() { if (!this.isReady()) return; if (this.playMobile('explosion')) return; this.tone(190, 42, .42, 'sawtooth', .19); this.noise(.44, .28, 0, 1200); }
  sentryBurst() { if (!this.isReady()) return; if (this.usingMobileAudio()) { for (let shot = 0; shot < 5; shot += 1) this.playMobile('shot', 'effects', shot * .14); return; } for (let shot = 0; shot < 5; shot += 1) { this.noise(.055, .105, shot * .14, 2700, 'highpass'); this.tone(245, 110, .07, 'square', .075, shot * .14); } }
  vortexSpawn() { this.unlock(); if (this.playMobile('vortex')) return; this.noise(.88, .3, 0, 950, 'bandpass'); this.tone(115, 310, .86, 'sawtooth', .13); this.tone(420, 125, .66, 'sine', .12, .16); this.noise(.52, .18, .12, 3400, 'highpass'); }
  vortexDeflect(fire = false) { this.unlock(); if (this.playMobile(fire ? 'vortex-fire' : 'vortex-deflect')) return; this.tone(fire ? 410 : 720, fire ? 95 : 1280, .4, fire ? 'sawtooth' : 'triangle', .17); this.noise(.35, .23, .02, fire ? 2300 : 4100, 'bandpass'); this.tone(125, 270, .28, 'sine', .08, .08); }
  droneIntercept() { this.unlock(); if (this.playMobile('electric')) return; this.tone(520, 1380, .18, 'triangle', .17); this.tone(1420, 170, .32, 'sawtooth', .15, .12); this.noise(.2, .24, .14, 3800, 'highpass'); }
  vortexIgnite() { this.unlock(); if (this.playMobile('vortex-fire')) return; this.noise(.82, .37, 0, 2750, 'highpass'); this.tone(180, 55, .8, 'sawtooth', .24); for (let ember = 0; ember < 5; ember += 1) this.noise(.07, .1, ember * .1, 4300, 'highpass'); }
  armorPiercerImpact() { if (!this.isReady() || this.usingMobileAudio()) return; this.tone(2180, 240, .42, 'sawtooth', .23); this.tone(1040, 115, .31, 'square', .16, .04); this.noise(.45, .3, .01, 4200, 'highpass'); }

  startMenuMusic() {
    if (!this.isReady() || this.menuMusicPlaying) return false;
    if (this.usingMobileAudio()) { this.menuMusicPlaying = this.mobile.startMusic(this.volumes.music * .55); return this.menuMusicPlaying; }
    this.menuMusicPlaying = true;
    this.menuMusicStep = 0;
    this.playMenuMusicStep();
    return true;
  }

  stopMenuMusic() {
    this.menuMusicPlaying = false;
    this.mobile.stopMusic();
    clearTimeout(this.menuMusicTimer);
    this.menuMusicTimer = null;
  }

  playMenuMusicStep() {
    if (!this.menuMusicPlaying || !this.isReady()) { this.stopMenuMusic(); return; }
    const melody = [330, 392, 440, 392, 294, 370, 440, 370, 330, 392, 494, 440, 294, 330, 392, 247];
    const bass = [82.41, 73.42, 98, 65.41];
    const step = this.menuMusicStep % melody.length;
    const note = melody[step];
    this.inGroup('music', () => {
      this.tone(note, note * (step % 4 === 3 ? 1.015 : 1), .19, step % 2 ? 'triangle' : 'square', .032);
      if (step % 4 === 0) {
        const bassNote = bass[Math.floor(step / 4) % bass.length];
        this.tone(bassNote, bassNote * .995, .62, 'triangle', .045);
        this.noise(.035, .018, 0, 2100, 'highpass');
      } else if (step % 4 === 2) {
        this.noise(.025, .012, 0, 3100, 'highpass');
      }
    });
    this.menuMusicStep += 1;
    this.menuMusicTimer = setTimeout(() => this.playMenuMusicStep(), 250);
  }

  hover() {
    if (!this.isReady()) return;
    if (this.usingMobileAudio()) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now - this.lastHoverAt < 55) return;
    this.lastHoverAt = now;
    this.inGroup('interface', () => { this.tone(690, 930, .045, 'square', .035); this.tone(1160, 880, .035, 'sine', .018, .018); });
  }

  tone(from, to, duration, type = 'square', volume = .12, delay = 0) {
    if (!this.enabled || this.usingMobileAudio()) return;
    // Never replay a stale event after a suspended tab or a later user gesture.
    if (!this.context || !this.master || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, from), t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(.001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume * this.volumes[this.outputGroup]), t + Math.min(.012, duration * .15));
    gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(t);
    oscillator.stop(t + duration + .02);
  }

  noise(duration = .35, volume = .22, delay = 0, cutoff = 900, filterType = 'lowpass') {
    if (!this.enabled || this.usingMobileAudio()) return;
    if (!this.context || !this.master || this.context.state !== 'running') return;
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
    gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume * this.volumes[this.outputGroup]), t + Math.min(.01, duration * .12));
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
    const launch = shotLaunchStyle({ ...effect, weapon });
    const modified = ['atomic', 'laser', 'frost', 'pierce', 'fire'].includes(launch.type);
    const mobileShot = modified ? launch.sound : ({ grenade: 'shot-grenade', markerBomb: 'shot-grenade', verticalStrike: 'shot-vertical', seismicCharge: 'shot-seismic', droneStrike: 'shot-drone', moleBomb: 'shot-mole', vitalRecycling: 'pickup', superheat: 'shot-flame' })[weapon] || launch.sound;
    if (this.playMobile(mobileShot)) {
      return;
    }
    const heavy = weapon === 'heavy' || effect.megaMissile;
    const laser = effect.laser;
    const charge = Math.max(1, effect.damageMultiplier || 1);
    const modifier = effect.combo?.[0] || (effect.freeze ? 'freeze' : effect.shockwave ? 'shockwave' : effect.bunkerBuster ? 'bunkerBuster' : effect.armorPiercer ? 'armorPiercer' : null);
    if (effect.mirror) { this.tone(920, 1640, .22, 'sine', .12); this.tone(1640, 920, .24, 'triangle', .09, .18); }
    if (effect.flyingHunter) { this.tone(150, 310, Math.max(.7, flightSeconds * .65), 'sawtooth', .16); this.noise(Math.max(.5, flightSeconds * .6), .09, 0, 2200, 'bandpass'); }
    this.noise(.055, heavy ? .32 : .22, 0, weapon === 'teslaOrb' || weapon === 'zeus' ? 5200 : 3200, 'highpass');
    if (effect.megaMissile) { this.tone(82, 28, .72, 'sawtooth', .52); this.noise(.55, .42, .015, 560); }
    else if (laser) { this.tone(1680, 210, .62, 'sine', .3); this.tone(2450, 780, .32, 'square', .1); }
    else if (launch.type === 'atomic') { this.tone(92, 26, .85, 'sawtooth', .38); this.tone(470, 92, .52, 'square', .15, .06); this.noise(.65, .43, 0, 930); }
    else if (launch.type === 'frost') { this.tone(1550, 520, .5, 'sine', .19); this.tone(2180, 880, .4, 'triangle', .11, .06); this.noise(.27, .24, 0, 4800, 'highpass'); }
    else if (launch.type === 'pierce') { this.tone(1840, 185, .27, 'sawtooth', .23); this.noise(.34, .22, 0, 3900, 'highpass'); this.tone(115, 68, .3, 'square', .17, .04); }
    else if (launch.type === 'fire') { this.tone(290, 85, .48, 'sawtooth', .22); this.noise(.47, .27, 0, 3200, 'highpass'); }
    else if (weapon === 'heavy') { this.tone(138, 36, .44, 'sawtooth', .4); this.noise(.46, .36, .018, 610); }
    else if (weapon === 'cluster') { for (let shell = 0; shell < 3; shell += 1) this.tone(340 + shell * 55, 105, .3, 'square', .1, shell * .045); }
    else if (weapon === 'fireworks') { this.tone(290, 1480, .78, 'sawtooth', .2); this.noise(.16, .13, 0, 3100, 'highpass'); }
    else if (weapon === 'gravity') { this.tone(520, 70, .68, 'sine', .23); this.tone(120, 36, .72, 'triangle', .18, .08); this.noise(.27, .3, 0, 1100); }
    else if (weapon === 'elementalWind') { this.noise(.46, .22, 0, 1850, 'bandpass'); this.tone(280, 780, .38, 'triangle', .16); this.noise(.27, .14, .16, 3900, 'highpass'); }
    else if (weapon === 'sentry') { this.tone(640, 270, .24, 'square', .2); this.tone(910, 390, .25, 'triangle', .12, .12); this.noise(.23, .22, 0, 2700, 'highpass'); }
    else if (weapon === 'flyingHunter') { this.tone(200, 640, .55, 'sawtooth', .21); this.noise(.23, .22, .03, 2300, 'bandpass'); }
    else if (weapon === 'zeus' || weapon === 'teslaOrb') { this.tone(1760, 360, .48, 'sawtooth', .24); for (let arc = 0; arc < 4; arc += 1) this.noise(.035, .11, arc * .055, 5600, 'highpass'); }
    else if (weapon === 'seismicCharge') { this.tone(118, 42, .65, 'square', .27); this.rumble(.04, .72, .52); }
    else if (weapon === 'superheat') { this.noise(.48, .26, 0, 2600, 'highpass'); this.tone(290, 72, .42, 'sawtooth', .19); for (let ember = 0; ember < 5; ember += 1) this.noise(.045, .08, ember * .08, 3600, 'highpass'); }
    else if (weapon === 'vitalRecycling') { this.tone(390, 790, .28, 'sine', .15); this.tone(770, 1240, .36, 'triangle', .1, .13); }
    else if (weapon === 'droneStrike') { this.tone(540, 920, .2, 'square', .12); for (let ping = 0; ping < 3; ping += 1) this.tone(1120, 1480, .055, 'sine', .055, .2 + ping * .12); }
    else if (weapon === 'mineLayer') { for (let mine = 0; mine < 3; mine += 1) this.tone(270 + mine * 55, 180, .12, 'square', .08, mine * .09); }
    else if (weapon === 'moleBomb') { this.tone(125, 54, Math.max(.7, flightSeconds), 'square', .17); this.noise(Math.max(.7, flightSeconds), .16, .06, 720); }
    else if (weapon === 'grenade') { this.tone(360, 110, .32, 'triangle', .15); for (let bounce = 1; bounce <= 3; bounce += 1) this.tone(520 - bounce * 75, 280 - bounce * 35, .075, 'square', .07, impactAt * bounce / 4); }
    else if (weapon === 'soapBomb') { this.tone(430, 980, .35, 'sine', .18); this.tone(760, 1260, .38, 'triangle', .1, .12); }
    else if (weapon === 'markerBomb') { this.tone(330, 145, .28, 'square', .17); for (let bounce = 1; bounce <= 3; bounce += 1) this.tone(590 + bounce * 95, 270, .085, 'square', .07, impactAt * bounce / 4); }
    else if (weapon === 'harpoon') { this.tone(880, 175, .4, 'sawtooth', .3); this.noise(.24, .22, 0, 3400, 'highpass'); }
    else if (weapon === 'waterCannon') { this.noise(.95, .22, 0, 1800, 'bandpass'); this.tone(145, 90, .65, 'triangle', .16); this.noise(.3, .13, .42, 4200, 'highpass'); }
    else if (weapon === 'verticalStrike') { this.tone(820, 1740, .52, 'sawtooth', .2); this.tone(1320, 480, .4, 'sine', .1, .12); }
    else { this.tone(225, 62, .25, 'sawtooth', .28); this.noise(.22, .22, .018, 980); }
    if (effect.combo?.includes('guidedBullet')) this.shotModifier('guidedBullet', 0);
    if (!laser && !['gravity', 'moleBomb', 'fireworks', 'harpoon', 'soapBomb', 'waterCannon'].includes(weapon)) this.tone(weapon === 'grenade' ? 320 : 520, weapon === 'grenade' ? 92 : 175, Math.max(.18, Math.min(.85, flightSeconds)), 'triangle', .065, .045);
    if (effect.hasImpact === false) return;
    if (effect.armorPiercer) return; // The AP impact is played on confirmed contact, with its own metallic cue.
    if (weapon === 'harpoon' || weapon === 'soapBomb' || weapon === 'waterCannon') { this.tone(weapon === 'harpoon' ? 510 : weapon === 'waterCannon' ? 320 : 1350, weapon === 'harpoon' ? 120 : weapon === 'waterCannon' ? 110 : 650, .24, 'triangle', .12, impactAt); return; }
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

  vertical(flightSeconds = .5, hits = 0, hasImpact = true) {
    this.unlock();
    const impactAt = Math.max(.08, flightSeconds);
    if (this.playMobile('shot-vertical')) return;
    this.tone(1580, 210, .46, 'sawtooth', .28);
    this.noise(.22, .2, 0, 2800, 'highpass');
    if (!hasImpact) return;
    this.tone(240, 38, .62, 'sine', .3, impactAt);
    this.rumble(impactAt, hits ? 1.15 : .9, .78);
    this.noise(.7, hits ? .48 : .38, impactAt, 1150);
  }

  weaponCue(kind) {
    this.unlock();
    if (this.playMobile(kind === 'soapPop' || kind === 'soapLaunch' ? 'pickup' : kind === 'harpoonPull' ? 'launch' : kind === 'harpoonLatch' || kind === 'markerBounce' ? 'ui' : 'explosion')) return;
    if (kind === 'soapLaunch') { this.tone(760, 1480, .36, 'sine', .12); this.tone(1180, 420, .22, 'triangle', .11, .08); }
    else if (kind === 'soapPop') { this.tone(1550, 310, .22, 'sine', .2); this.noise(.24, .13, 0, 4700, 'highpass'); }
    else if (kind === 'harpoonPull') { this.tone(310, 810, .38, 'sawtooth', .17); this.noise(.4, .1, 0, 1900, 'bandpass'); }
    else if (kind === 'harpoonLatch') { this.tone(980, 170, .28, 'triangle', .17); this.noise(.17, .12, 0, 3700, 'highpass'); }
    else if (kind === 'harpoonHit') { this.tone(165, 43, .4, 'square', .21); this.noise(.34, .2, 0, 1400); }
    else if (kind === 'markerBounce') { this.tone(760, 320, .12, 'square', .12); }
    else if (kind === 'marker') { this.tone(880, 110, .28, 'square', .15); this.rumble(.05, .7, .55); }
  }

  flamethrower() {
    this.unlock();
    if (this.playMobile('shot-flame')) return;
    this.noise(.58, .22, 0, 2100, 'bandpass');
    this.noise(.36, .11, .12, 3800, 'highpass');
    this.tone(150, 75, .42, 'sawtooth', .08);
  }

  turn() { this.unlock(); if (this.playMobile('turn', 'interface')) return; this.inGroup('interface', () => { this.tone(480, 720, .11, 'square', .1); this.tone(720, 1080, .14, 'square', .085, .105); }); }
  ui(kind = 'tap') {
    this.unlock();
    if (this.playMobile(kind === 'confirm' ? 'ready' : 'ui', 'interface')) return;
    this.inGroup('interface', () => {
      if (kind === 'confirm') { this.tone(430, 780, .11, 'square', .1); this.tone(720, 1120, .14, 'sine', .075, .07); return; }
      if (kind === 'cancel') { this.tone(520, 220, .13, 'square', .09); this.noise(.08, .045, 0, 1800); return; }
      if (kind === 'select') { this.tone(310, 520, .08, 'triangle', .08); this.tone(620, 760, .07, 'square', .05, .045); return; }
      if (kind === 'open') { this.tone(240, 680, .16, 'sine', .1); this.noise(.1, .05, 0, 2400, 'highpass'); return; }
      this.tone(390, 620, .075, 'square', .07); this.tone(780, 620, .045, 'sine', .045, .045);
    });
  }

  slider(value = 0) {
    const now = performance.now(); if (now - this.lastSliderAt < 42) return; this.lastSliderAt = now;
    const ratio = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.playMobile('ui', 'interface')) return;
    this.unlock(); this.inGroup('interface', () => this.tone(280 + ratio * 520, 330 + ratio * 560, .045, 'square', .035));
  }
  move(kind = 'tracks') { this.unlock(); if (this.playMobile(kind === 'armoredDash' ? 'heavy' : 'move')) return; if (kind === 'spider') { for (let foot = 0; foot < 4; foot += 1) this.tone(420 + foot * 35, 180, .045, 'square', .045, foot * .035); return; } if (kind === 'armoredDash') { this.tone(105, 42, .34, 'sawtooth', .19); this.noise(.28, .2, 0, 680); return; } this.tone(92, 58, .13, 'square', .08); this.noise(.11, .07, 0, 760); this.tone(54, 72, .08, 'triangle', .055, .075); }

  power(type) {
    this.unlock();
    if (this.playMobile(['rocketDash', 'movementBoost'].includes(type) ? 'launch' : type === 'heal' || type === 'repairDrone' ? 'pickup' : 'power')) return;
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
    if (this.playMobile('pickup')) return;
    const start = type === 'heal' ? 420 : type === 'freeze' ? 1080 : 560;
    [1, 1.34, 1.7].forEach((ratio, index) => this.tone(start * ratio, start * ratio * 1.2, .2, index === 2 ? 'sine' : 'square', .11 - index * .015, index * .085));
    this.noise(.18, .08, .04, 3200, 'highpass');
    if (type === 'megaMissile') this.tone(170, 48, .5, 'sawtooth', .18, .18);
    if (type === 'invisibility') this.tone(1450, 145, .48, 'sine', .1, .08);
  }

  arena(type, warning = true) {
    this.unlock();
    if (this.playMobile(warning ? 'warning' : ['lightning', 'bombardment', 'eruption'].includes(type) ? 'thunder' : ['luckyWinds', 'supply', 'flora'].includes(type) ? 'pickup' : 'explosion')) return;
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
    } else if (type === 'flora') {
      [294, 392, 494, 659, 784].forEach((note, index) => this.tone(note, note * 1.06, .42, index % 2 ? 'sine' : 'triangle', .075, index * .11));
      this.noise(warning ? 1.4 : 2.1, .07, 0, 3200, 'highpass');
    } else if (type === 'gale') {
      this.noise(warning ? 2.2 : 3, warning ? .18 : .38, 0, warning ? 1800 : 2600, 'bandpass'); this.tone(warning ? 190 : 130, warning ? 420 : 680, warning ? 1.8 : 3, 'sine', warning ? .08 : .15);
    } else if (type === 'flood') {
      this.noise(warning ? 2.4 : 3.2, warning ? .15 : .32, 0, 2500, 'bandpass');
      for (let drop = 0; drop < (warning ? 7 : 18); drop += 1) this.tone(650 + drop % 4 * 85, 390 + drop % 5 * 50, .09, 'sine', .045, drop * (warning ? .19 : .11));
    } else if (type === 'tectonic' || type === 'quake') {
      this.rumble(0, warning ? .8 : 1.5, warning ? .9 : 1.45);
      this.noise(warning ? .8 : 1.35, warning ? .22 : .42, 0, 460);
    } else {
      this.tone(340, 820, .3, 'square', .12);
      this.tone(620, 1260, .34, 'sine', .1, .16);
    }
  }

  teleport(delay = 0) { this.unlock(); if (this.playMobile('power', 'effects', delay)) return; this.tone(170, 1480, .46, 'sine', .18, delay); this.tone(1080, 110, .54, 'square', .12, delay + .12); this.noise(.36, .13, delay + .08, 2800, 'highpass'); }
  scenario(delay = 0) { this.unlock(); if (this.playMobile('explosion', 'effects', delay)) return; this.noise(.58, .4, delay, 860); this.tone(145, 820, .4, 'square', .14, delay + .04); this.rumble(delay + .04, .7, .62); }
  launch(kind = 'jump') { this.unlock(); if (this.playMobile('launch')) return; if (kind === 'parachute') { this.noise(.42, .1, 0, 2600, 'highpass'); this.tone(620, 340, .28, 'sine', .075); return; } if (kind === 'spiderLeap') { this.tone(260, 1160, .34, 'square', .15); for (let leg = 0; leg < 4; leg += 1) this.tone(720 + leg * 90, 340, .07, 'triangle', .05, leg * .045); this.noise(.18, .1, 0, 1900); return; } if (kind === 'doubleDash' || kind === 'rocketDash') { this.tone(92, 1480, .48, 'sawtooth', .24); this.noise(.4, .22, 0, 2400, 'highpass'); this.rumble(.03, .42, .38); return; } this.tone(140, 1080, .42, 'sawtooth', .15); this.noise(.25, .16, 0, 1600); this.tone(65, 180, .3, 'square', .1, .06); }
  armoredDash(walls = 0, hits = 0) { this.unlock(); if (this.playMobile('heavy')) return; this.tone(92, 34, .68, 'sawtooth', .3); this.noise(.52, .36, 0, 720); this.tone(58, 155, .38, 'square', .17, .04); for (let index = 0; index < walls; index += 1) { const delay = .14 + index * .11; this.noise(.28, .3, delay, 1450); this.rumble(delay, .72 + index * .08, .42); } if (hits) { this.tone(310, 42, .34, 'square', .24, .38); this.rumble(.36, 1.2, .72); } }
  ninjaSlash() { this.unlock(); if (this.playMobile('launch')) { this.playMobile('heavy', 'effects', .22); return; } this.noise(.42, .16, 0, 3500, 'highpass'); this.tone(1260, 260, .24, 'sawtooth', .14); this.noise(.55, .23, .22, 1900, 'bandpass'); this.tone(340, 70, .3, 'square', .2, .22); }

  damage(amount = 20) {
    this.unlock();
    if (this.playMobile(amount >= 70 ? 'heavy' : 'explosion')) return;
    const weight = Math.min(1.55, .75 + amount / 110);
    this.noise(.16 + Math.min(.28, amount / 260), .18 * weight, 0, 1500);
    this.tone(220, 42, .24, 'sawtooth', .16 * weight);
    if (amount >= 70) this.rumble(.025, .7, .52);
  }

  status(type) {
    this.unlock();
    if (this.playMobile(type === 'heal' ? 'pickup' : 'electric')) return;
    if (type === 'heal') [520, 700, 920, 1180].forEach((note, index) => this.tone(note, note * 1.12, .2, 'sine', .09, index * .085));
    else { this.tone(1820, 280, .62, 'triangle', .16); this.noise(.38, .12, 0, 2600, 'highpass'); }
  }

  destroyed() { this.unlock(); if (this.playMobile('explosion')) return; this.noise(1.45, .62, 0, 1100); this.rumble(0, 1.65, 1.45); this.tone(118, 22, 1.25, 'sawtooth', .42); this.noise(.62, .36, .24, 2400); }

  victory(won) {
    this.unlock();
    if (this.playMobile(won ? 'victory' : 'defeat')) return;
    if (won) [440, 554, 659, 880].forEach((note, index) => { this.tone(note, note, .28, 'square', .11, index * .15); this.tone(note / 2, note / 2, .32, 'sine', .08, index * .15); });
    else { this.tone(240, 72, .95, 'sawtooth', .16); this.rumble(.18, .65, .8); }
  }
}
