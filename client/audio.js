import { MobileAudio, SOUND_PRESETS } from './mobile-audio.js';

import { shotLaunchStyle } from './shot-launch.js';
import { ambientLevels } from './ambient-sound.js';

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
    this.lastEnvironmentAt = new Map();
    this.activationConfirmed = false;
    this.menuMusicPlaying = false;
    this.menuMusicStep = 0;
    this.menuMusicTimer = null;
    let savedVolumes = {}; try { savedVolumes = JSON.parse(localStorage.getItem('tankVolumes') || '{}'); } catch {}
    this.volumes = Object.fromEntries(['music', 'effects', 'interface'].map((group) => [group, Math.max(0, Math.min(1, Number(savedVolumes[group] ?? 1) || 0))]));
    this.outputGroup = 'effects';
    this.mobile = new MobileAudio();
    this.sampleBuffers = new Map();
    this.sampleRequests = new Map();
    this.samplesPrimed = false;
    this.cueSerial = 0;
    this.ambientNextAt = new Map();
    this.ambientSources = new Map();
  }

  setVolume(group, value) {
    if (!(group in this.volumes)) return;
    this.volumes[group] = Math.max(0, Math.min(1, Number(value) || 0));
    try { localStorage.setItem('tankVolumes', JSON.stringify(this.volumes)); } catch {}
    if (group === 'music' && this.mobile.music) this.mobile.music.volume = this.volumes.music;
  }

  usingMobileAudio() { return this.mobile.ready && this.enabled; }

  loadSample(kind) {
    if (!this.context?.decodeAudioData || !globalThis.window || !SOUND_PRESETS[kind] || this.sampleRequests.has(kind)) return;
    const url = new URL(`./sounds/${kind}.wav`, import.meta.url);
    const request = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Sound ${kind}: HTTP ${response.status}`);
      return response.arrayBuffer();
    }).then((bytes) => this.context.decodeAudioData(bytes)).then((buffer) => this.sampleBuffers.set(kind, buffer)).catch(() => false);
    this.sampleRequests.set(kind, request);
  }

  primeSamples() {
    if (this.samplesPrimed || this.mobile.supported || !this.context?.decodeAudioData || !globalThis.window) return;
    this.samplesPrimed = true;
    ['ready', 'ui', 'ui-confirm', 'shot', 'heavy', 'explosion', 'explosion-heavy', 'shot-laser', 'shot-ap', 'laser-impact', 'ap-impact'].forEach((kind) => this.loadSample(kind));
    const rest = Object.keys(SOUND_PRESETS).filter((kind) => kind !== 'music' && !this.sampleRequests.has(kind));
    const loadNext = () => {
      if (!this.enabled || !rest.length) return;
      const kind = rest.shift();
      this.loadSample(kind);
      this.sampleRequests.get(kind)?.finally(() => setTimeout(loadNext, 80));
    };
    setTimeout(() => { for (let worker = 0; worker < 3; worker += 1) loadNext(); }, 900);
  }

  // The same WAV assets play through native media on mobile and Web Audio on desktop.
  playMobile(kind, group = 'effects', delay = 0, rate = 1, level = 1) {
    if (!this.enabled) return false;
    const volume = this.volumes[group] * level;
    if (volume <= 0) return true;
    if (this.usingMobileAudio()) {
      if (delay > 0) setTimeout(() => { if (this.usingMobileAudio()) this.mobile.play(kind, volume, undefined, rate); }, delay * 1000);
      else if (!this.mobile.play(kind, volume, undefined, rate)) return false;
      return true;
    }
    if (!this.context || this.context.state !== 'running') return false;
    const buffer = this.sampleBuffers.get(kind);
    if (!buffer) { this.loadSample(kind); return false; }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(.85, Math.min(1.15, rate));
    gain.gain.value = volume * .58;
    source.connect(gain); gain.connect(this.master);
    if (kind.startsWith('ambient-')) { this.ambientSources.set(kind, source); source.onended = () => { if (this.ambientSources.get(kind) === source) this.ambientSources.delete(kind); }; }
    source.start(this.context.currentTime + delay);
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
      if (this.context?.state === 'closed') { this.context = null; this.master = null; this.activationConfirmed = false; this.sampleBuffers.clear(); this.sampleRequests.clear(); this.samplesPrimed = false; }
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
      if (this.context.state === 'running') this.primeSamples();
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
    else { this.stopMenuMusic(); this.stopAmbient(); this.mobile.stop(); }
    return this.enabled;
  }

  isReady() { return Boolean(this.enabled && (this.mobile.ready || this.context?.state === 'running')); }

  stopAmbient(kind = null) {
    this.mobile.stopAmbient(kind);
    for (const [name, source] of this.ambientSources) if (!kind || name === kind) { try { source.stop(); } catch {} this.ambientSources.delete(name); }
    if (kind) this.ambientNextAt.delete(kind); else this.ambientNextAt.clear();
  }

  updateAmbient(view) {
    if (!view || !this.isReady() || this.volumes.effects <= 0 || globalThis.document?.hidden) { this.stopAmbient(); return; }
    const levels = ambientLevels(view);
    const now = globalThis.performance?.now?.() ?? Date.now();
    // Keep only the two most relevant textures; mobile has four native channels
    // and the other two must remain free for shots and impacts.
    const active = Object.entries(levels).filter(([, level]) => level >= .045)
      .sort(([a, levelA], [b, levelB]) => levelB + (this.ambientNextAt.has(`ambient-${b}`) ? .04 : 0) - levelA - (this.ambientNextAt.has(`ambient-${a}`) ? .04 : 0))
      .slice(0, 2);
    const chosen = new Set(active.map(([name]) => `ambient-${name}`));
    for (const kind of [...this.ambientNextAt.keys()]) if (!chosen.has(kind)) this.stopAmbient(kind);
    for (const [index, [name, level]] of active.entries()) {
      const kind = `ambient-${name}`;
      if (!this.ambientNextAt.has(kind)) this.ambientNextAt.set(kind, now + index * 350);
      if (now < this.ambientNextAt.get(kind)) continue;
      const played = this.playMobile(kind, 'effects', 0, 1, level);
      this.ambientNextAt.set(kind, now + (played ? (SOUND_PRESETS[kind]?.duration || 3) * 1000 + 180 : 450));
    }
  }

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
    const kind = weapon === 'megaCannon' || weapon === 'zeus' ? 'thunder' : weapon === 'waterMine' ? 'water-mine' : weapon === 'heavy' ? 'explosion-heavy' : 'explosion';
    if (this.playMobile(kind)) return;
    if (weapon === 'zeus') { this.tone(1550, 75, .18, 'square', .24); this.tone(760, 80, .6, 'sawtooth', .17); this.rumble(.06, 1.25, 1.2); this.noise(.7, .43, .02, 3700, 'highpass'); return; }
    if (weapon === 'megaCannon') { this.tone(1380, 55, 1.5, 'sawtooth', .3); this.tone(2100, 320, .9, 'sine', .2); this.rumble(.05, 1.7, 1.4); this.noise(1.45, .65, .02, 2500); }
    else { this.noise(.045, .34, 0, 5600, 'highpass'); this.tone(160, 35, .9, 'sawtooth', .26); this.rumble(.05, 1.25, 1.15); this.noise(.85, .4, .02, 1300); for (let debris = 0; debris < 4; debris += 1) this.tone(740 - debris * 105, 170 - debris * 18, .07, 'square', .045, .12 + debris * .075); }
  }

  mineDrop(hit = false) {
    if (!this.isReady()) return;
    if (this.playMobile(hit ? 'water-mine' : 'ui')) return;
    this.tone(hit ? 240 : 370, hit ? 72 : 160, hit ? .24 : .13, 'triangle', hit ? .16 : .09);
    this.noise(hit ? .15 : .07, hit ? .12 : .06, 0, hit ? 1200 : 2500, 'bandpass');
  }

  meteorImpact() {
    if (!this.isReady()) return;
    if (this.playMobile('meteor')) return;
    this.tone(215, 39, .55, 'sawtooth', .24);
    this.rumble(.02, .9, 1.05);
    this.noise(.58, .35, 0, 1450);
    this.noise(.36, .14, .08, 4200, 'highpass');
  }

  impact(shot) {
    if (!shot?.impact || shot.delayedStrike) return false;
    if (shot.elementalBurst) return false; // The elemental imprint has its own confirmed-impact cue.
    const material = shot.impact?.material;
    const kind = shot.armorPiercer ? 'ap-impact' : shot.laser ? 'laser-impact' :
      ['zeus', 'teslaOrb', 'verticalStrike'].includes(shot.weapon) ? 'thunder' :
      shot.weapon === 'fireworks' ? 'explosion-fireworks' :
      shot.megaMissile || shot.weapon === 'megaCannon' ? 'explosion-mega' :
      shot.weapon === 'heavy' ? 'explosion-heavy' :
      shot.elementalType === 'elementalWater' || shot.weapon === 'waterCannon' ? 'water-splash' :
      shot.elementalType === 'elementalEarth' ? 'impact-earth' :
      shot.elementalType === 'elementalFire' || shot.combo?.includes('molotov') ? 'impact-fire' :
      shot.elementalType === 'elementalIce' || shot.freeze ? 'impact-ice' :
      shot.elementalType === 'elementalWind' ? 'impact-wind' :
      shot.noExplosion ? material && SOUND_PRESETS[`impact-${material}`] ? `impact-${material}` : 'power' :
      material === 'earth' ? 'explosion-dry' :
      material === 'iron' || material === 'concrete' ? 'explosion-rolling' : 'explosion';
    return this.playMobile(kind);
  }

  shotImpact(shot) {
    if (!shot?.impact) return;
    if (shot.delayedStrike && !shot.soundDetonation) { this.playMobile(shot.weapon === 'droneStrike' ? 'shot-deploy' : 'shot-marker'); return; }
    if (shot.weapon === 'waterMine') { this.mineDrop(shot.damage?.some((entry) => entry.amount > 0)); return; }
    if (shot.weapon === 'waterHunter' && shot.sharkBite) this.weaponCue('sharkBite');
    if (shot.armorPiercer) { this.armorPiercerImpact(); return; }
    if (shot.weapon === 'harpoon' || shot.weapon === 'soapBomb' && !shot.megaMissile) { this.weaponCue(shot.weapon === 'harpoon' ? 'harpoonLatch' : 'soapLaunch'); return; }
    if (shot.soundDetonation) { this.detonation(shot.weapon); return; }
    if (shot.weapon === 'fireworks' && shot.canActivateFireworks) { this.fireworksBurst(); return; }
    this.impact(shot.elementalBurst ? { ...shot, elementalBurst: false, elementalType: null } : shot);
  }

  clusterSplit() { if (!this.isReady()) return; if (this.playMobile('shot')) return; this.tone(750, 155, .45, 'square', .14); for (let i = 0; i < 3; i += 1) this.tone(390 + i * 110, 80, .3, 'sawtooth', .1, i * .08); this.noise(.24, .16, .03, 2600, 'highpass'); }
  eagleDive() { if (!this.isReady()) return; if (this.playMobile('eagle')) return; this.tone(710, 1510, .19, 'sawtooth', .19); this.tone(1510, 540, .53, 'sawtooth', .22, .16); this.tone(1250, 430, .41, 'triangle', .13, .22); this.noise(.38, .075, .19, 2500, 'bandpass'); }
  fireworksBurst() { if (!this.isReady()) return; if (this.playMobile('explosion-fireworks')) return; this.tone(980, 210, .42, 'sawtooth', .18); for (let i = 0; i < 12; i += 1) this.tone(600 + i % 4 * 180, 140, .17, 'triangle', .07, i * .035); this.noise(.3, .2, 0, 3200, 'highpass'); }
  clusterImpact() { if (!this.isReady()) return; if (this.playMobile('explosion')) return; this.tone(190, 42, .42, 'sawtooth', .19); this.noise(.44, .28, 0, 1200); }
  sentryBurst() { if (!this.isReady()) return; if (this.playMobile('sentry-burst')) return; for (let shot = 0; shot < 5; shot += 1) { this.noise(.055, .105, shot * .14, 2700, 'highpass'); this.tone(245, 110, .07, 'square', .075, shot * .14); } }
  vortexSpawn() { this.unlock(); if (this.playMobile('vortex')) return; this.noise(.88, .3, 0, 950, 'bandpass'); this.tone(115, 310, .86, 'sawtooth', .13); this.tone(420, 125, .66, 'sine', .12, .16); this.noise(.52, .18, .12, 3400, 'highpass'); }
  vortexDeflect(fire = false) { this.unlock(); if (this.playMobile(fire ? 'vortex-fire' : 'vortex-deflect')) return; this.tone(fire ? 410 : 720, fire ? 95 : 1280, .4, fire ? 'sawtooth' : 'triangle', .17); this.noise(.35, .23, .02, fire ? 2300 : 4100, 'bandpass'); this.tone(125, 270, .28, 'sine', .08, .08); }
  droneIntercept() { this.unlock(); if (this.playMobile('electric')) return; this.tone(520, 1380, .18, 'triangle', .17); this.tone(1420, 170, .32, 'sawtooth', .15, .12); this.noise(.2, .24, .14, 3800, 'highpass'); }
  vortexIgnite() { this.unlock(); if (this.playMobile('vortex-fire')) return; this.noise(.82, .37, 0, 2750, 'highpass'); this.tone(180, 55, .8, 'sawtooth', .24); for (let ember = 0; ember < 5; ember += 1) this.noise(.07, .1, ember * .1, 4300, 'highpass'); }
  armorPiercerImpact() { if (!this.isReady()) return; if (this.playMobile('ap-impact')) return; this.tone(2180, 240, .42, 'sawtooth', .23); this.tone(1040, 115, .31, 'square', .16, .04); this.noise(.45, .3, .01, 4200, 'highpass'); }

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
    if (this.lastHoverAt && now - this.lastHoverAt < 180) return;
    this.lastHoverAt = now;
    if (this.playMobile('ui-hover', 'interface', 0, 1, .5)) return;
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
    const selectedShot = modified ? launch.sound : ({ grenade: 'shot-grenade', markerBomb: 'shot-marker', verticalStrike: 'shot-vertical', seismicCharge: 'shot-seismic', droneStrike: 'shot-drone', moleBomb: 'shot-mole', waterCannon: 'water-jet', waterTorpedo: 'shot-torpedo', waterHunter: 'shot-water-hunter', kineticCannon: 'shot-kinetic', meteorSalvo: 'shot-meteor', windPlate: 'shot-wind-plate', vitalRecycling: 'shot-vital', superheat: 'shot-flame' })[weapon] || launch.sound;
    if (this.playMobile(selectedShot)) {
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
    else if (weapon === 'windPlate') { this.tone(690, 380, .2, 'square', .12); this.noise(.37, .19, .1, 2100, 'bandpass'); this.tone(180, 520, .45, 'triangle', .14, .17); }
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
    const cue = ({ soapPop: 'pickup', soapLaunch: 'shot-soap', harpoonPull: 'harpoon-pull', harpoonLatch: 'harpoon-latch', harpoonHit: 'heavy', markerBounce: 'ui', marker: 'explosion', sharkBite: 'shark-bite' })[kind] || 'explosion';
    if (this.playMobile(cue)) return;
    if (kind === 'soapLaunch') { this.tone(760, 1480, .36, 'sine', .12); this.tone(1180, 420, .22, 'triangle', .11, .08); }
    else if (kind === 'soapPop') { this.tone(1550, 310, .22, 'sine', .2); this.noise(.24, .13, 0, 4700, 'highpass'); }
    else if (kind === 'harpoonPull') { this.tone(310, 810, .38, 'sawtooth', .17); this.noise(.4, .1, 0, 1900, 'bandpass'); }
    else if (kind === 'harpoonLatch') { this.tone(980, 170, .28, 'triangle', .17); this.noise(.17, .12, 0, 3700, 'highpass'); }
    else if (kind === 'harpoonHit') { this.tone(165, 43, .4, 'square', .21); this.noise(.34, .2, 0, 1400); }
    else if (kind === 'markerBounce') { this.tone(760, 320, .12, 'square', .12); }
    else if (kind === 'marker') { this.tone(880, 110, .28, 'square', .15); this.rumble(.05, .7, .55); }
    else if (kind === 'sharkBite') { this.noise(.08, .28, 0, 4300, 'highpass'); this.tone(420, 58, .2, 'square', .22); this.tone(95, 38, .48, 'sawtooth', .24, .055); this.rumble(.04, .55, .48); }
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
    if (this.playMobile(({ confirm: 'ui-confirm', combo: 'ui-combo', cancel: 'ui-cancel', open: 'ui-confirm' })[kind] || 'ui', 'interface')) return;
    this.inGroup('interface', () => {
      if (kind === 'confirm') { this.tone(430, 780, .11, 'square', .1); this.tone(720, 1120, .14, 'sine', .075, .07); return; }
      if (kind === 'combo') { this.tone(340, 560, .09, 'triangle', .1); this.tone(560, 840, .12, 'square', .07, .07); this.tone(840, 1260, .2, 'sine', .075, .15); return; }
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

  environment(kind, intensity = 1) {
    if (!this.isReady()) return;
    const now = performance.now(); const cooldown = kind === 'waterFlow' ? 900 : kind === 'woodImpact' ? 550 : kind === 'treeBreak' ? 350 : kind === 'tracks' ? 240 : 90;
    if (this.lastEnvironmentAt.has(kind) && now - this.lastEnvironmentAt.get(kind) < cooldown) return;
    this.lastEnvironmentAt.set(kind, now); const strength = Math.max(.2, Math.min(1.4, Number(intensity) || 1));
    const mobileKind = ({ hardLanding: 'heavy', structureFall: 'heavy', treeBreak: 'tree-break', woodImpact: 'impact-wood', iceBreak: 'ice-break', waterLanding: 'water-splash', waterFlow: 'water-flow', parachute: 'parachute' })[kind] || 'move';
    if (this.playMobile(mobileKind, 'effects', 0, 1, kind === 'woodImpact' ? strength * .42 : strength)) return;
    if (kind === 'softLanding') { this.noise(.12, .07 * strength, 0, 1250, 'bandpass'); this.tone(92, 58, .11, 'triangle', .055 * strength); }
    else if (kind === 'hardLanding') { this.rumble(0, .35 + strength * .3, .28 + strength * .18); this.noise(.28, .17 * strength, 0, 820); for (let rock = 0; rock < 3; rock += 1) this.tone(250 - rock * 38, 70, .06, 'square', .04 * strength, rock * .055); }
    else if (kind === 'waterLanding') { this.noise(.36, .15 * strength, 0, 1750, 'bandpass'); this.tone(185, 95, .3, 'sine', .065 * strength); for (let drop = 0; drop < 4; drop += 1) this.tone(720 + drop * 120, 410, .055, 'sine', .025, .08 + drop * .045); }
    else if (kind === 'woodImpact') { this.noise(.12, .08 * strength, 0, 1150, 'bandpass'); this.tone(155, 88, .14, 'triangle', .055 * strength); }
    else if (kind === 'treeBreak') { this.noise(.18, .18 * strength, 0, 1450, 'bandpass'); this.tone(190, 62, .35, 'sawtooth', .13 * strength); for (let crack = 0; crack < 5; crack += 1) this.noise(.035, .1, crack * .055, 3600, 'highpass'); }
    else if (kind === 'structureFall') { this.rumble(0, .45 + strength * .35, .5); this.noise(.42, .25 * strength, 0, 760); this.tone(125, 38, .4, 'square', .12 * strength); }
    else if (kind === 'waterFlow') { this.noise(.5, .055 * strength, 0, 2100, 'bandpass'); this.tone(260, 170, .4, 'sine', .025 * strength); }
    else if (kind === 'iceBreak') { this.noise(.36, .13 * strength, 0, 4200, 'highpass'); for (let shard = 0; shard < 4; shard += 1) this.tone(1250 + shard * 240, 520 + shard * 80, .12, 'triangle', .038 * strength, shard * .055); }
    else if (kind === 'iceSlide') { this.noise(.18, .06, 0, 4300, 'highpass'); this.tone(1280, 860, .16, 'sine', .055); }
    else if (kind === 'parachute') { this.noise(.32, .06, 0, 2700, 'highpass'); this.tone(510, 390, .22, 'sine', .045); }
  }

  power(type) {
    this.unlock();
    if (this.playMobile(['rocketDash', 'movementBoost'].includes(type) ? 'launch' : type === 'excavator' ? 'drill' : type === 'heal' || type === 'repairDrone' ? 'pickup' : 'power')) return;
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

  statusActivated(kind) {
    this.unlock();
    if (this.playMobile(kind === 'shield' ? 'shield-up' : 'cloak-up')) return;
    if (kind === 'shield') {
      this.tone(260, 790, .42, 'sine', .17);
      this.tone(660, 1320, .46, 'triangle', .11, .08);
      this.noise(.22, .1, 0, 4700, 'highpass');
    } else {
      this.tone(1490, 200, .66, 'sine', .13);
      this.tone(780, 1560, .38, 'triangle', .075, .1);
      this.noise(.46, .075, 0, 3300, 'highpass');
    }
  }

  elementalImpact(kind) {
    this.unlock();
    const mobile = kind === 'elementalWind' ? 'impact-wind' : kind === 'elementalIce' ? 'impact-ice' : kind === 'elementalWater' ? 'water-splash' : kind === 'elementalEarth' ? 'impact-earth' : 'impact-fire';
    if (this.playMobile(mobile)) return;
    if (kind === 'elementalFire') { this.noise(.5, .2, 0, 3200, 'highpass'); this.tone(240, 60, .44, 'sawtooth', .12); }
    else if (kind === 'elementalWater') { this.noise(.6, .16, 0, 1900, 'bandpass'); this.tone(300, 110, .5, 'sine', .09); }
    else if (kind === 'elementalIce') { this.tone(1500, 550, .48, 'sine', .14); this.noise(.28, .12, 0, 4700, 'highpass'); }
    else if (kind === 'elementalEarth') { this.tone(125, 38, .6, 'sawtooth', .18); this.noise(.44, .22, 0, 800); }
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
    const cue = warning ? ({ gale: 'gale', quake: 'quake-warning', bombardment: 'bombardment-warning', flood: 'rain', lightning: 'thunder', supply: 'supply' })[type] || 'warning'
      : ({ lightning: 'thunder', quake: 'quake-impact', bombardment: 'bombardment-strike', eruption: 'eruption', gale: 'gale', flood: 'water-flow', supply: 'supply', luckyWinds: 'pickup', flora: 'pickup' })[type] || 'explosion';
    const played = this.playMobile(cue);
    if (type === 'bombardment' && !warning) this.playMobile('bombardment-bed-v2', 'effects', .18, 1, .22);
    if (played) return;
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

  bombardmentStrike(intensity = 1) {
    this.unlock();
    const cue = this.cueSerial++ % 2 ? 'bombardment-impact' : 'bombardment-hit-v2';
    if (this.playMobile(cue, 'effects', 0, Math.max(.92, 1.09 - intensity * .06))) {
      if (!this.usingMobileAudio()) this.rumble(.015, .55 + intensity * .16, .85 + intensity * .14);
      return;
    }
    this.noise(.06, .42, 0, 4400, 'highpass');
    this.rumble(.015, .65 + intensity * .17, .85 + intensity * .12);
    this.noise(.45, .25 + intensity * .04, .025, 780);
  }

  teleport(delay = 0) { this.unlock(); if (this.playMobile('power', 'effects', delay)) return; this.tone(170, 1480, .46, 'sine', .18, delay); this.tone(1080, 110, .54, 'square', .12, delay + .12); this.noise(.36, .13, delay + .08, 2800, 'highpass'); }
  scenario(delay = 0) { this.unlock(); if (this.playMobile('explosion', 'effects', delay)) return; this.noise(.58, .4, delay, 860); this.tone(145, 820, .4, 'square', .14, delay + .04); this.rumble(delay + .04, .7, .62); }
  launch(kind = 'jump') { this.unlock(); if (this.playMobile(kind === 'parachute' ? 'parachute' : 'launch')) return; if (kind === 'parachute') { this.noise(.42, .1, 0, 2600, 'highpass'); this.tone(620, 340, .28, 'sine', .075); return; } if (kind === 'spiderLeap') { this.tone(260, 1160, .34, 'square', .15); for (let leg = 0; leg < 4; leg += 1) this.tone(720 + leg * 90, 340, .07, 'triangle', .05, leg * .045); this.noise(.18, .1, 0, 1900); return; } if (kind === 'doubleDash' || kind === 'rocketDash') { this.tone(92, 1480, .48, 'sawtooth', .24); this.noise(.4, .22, 0, 2400, 'highpass'); this.rumble(.03, .42, .38); return; } this.tone(140, 1080, .42, 'sawtooth', .15); this.noise(.25, .16, 0, 1600); this.tone(65, 180, .3, 'square', .1, .06); }
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

  destroyed() { this.unlock(); if (this.playMobile('explosion')) return; this.noise(.055, .7, 0, 6200, 'highpass'); this.noise(1.45, .62, 0, 1100); this.rumble(0, 1.65, 1.45); this.tone(118, 22, 1.25, 'sawtooth', .42); this.noise(.62, .36, .24, 2400); for (let collapse = 0; collapse < 6; collapse += 1) { this.tone(520 - collapse * 55, 90, .11, collapse % 2 ? 'square' : 'triangle', .065, .18 + collapse * .105); this.noise(.08, .08, .18 + collapse * .105, 2100, 'bandpass'); } }

  victory(won) {
    this.unlock();
    if (this.playMobile(won ? 'victory' : 'defeat')) return;
    if (won) [440, 554, 659, 880].forEach((note, index) => { this.tone(note, note * 1.01, .34, index % 2 ? 'triangle' : 'square', .11, index * .15); this.tone(note / 2, note / 2, .4, 'sine', .08, index * .15); if (index > 1) this.noise(.035, .035, index * .15, 4800, 'highpass'); });
    else { this.tone(240, 72, .95, 'sawtooth', .16); this.tone(120, 46, 1.2, 'triangle', .1, .12); this.rumble(.18, .65, .8); }
  }
}
