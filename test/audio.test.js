import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BattleAudio } from '../client/audio.js';
import { AUDIO_ASSET_VERSION, audioAssetUrl } from '../client/audio-assets.js';
import { SOUND_PRESETS } from '../client/mobile-audio.js';

test('all native mobile sound URLs have valid served WAV assets', async () => {
  for (const kind of Object.keys(SOUND_PRESETS)) {
    const bytes = await readFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', kind);
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', kind);
    assert.ok(bytes.length > 1000, kind);
    assert.equal(bytes.readUInt16LE(22), 1, `${kind} must be mono for compact mobile delivery`);
    assert.equal(bytes.readUInt16LE(34), 16, `${kind} must be 16-bit PCM`);
    const duration = (bytes.length - 44) / (bytes.readUInt32LE(24) * 2);
    assert.ok(Math.abs(duration - SOUND_PRESETS[kind].duration) < .03, `${kind} must reserve its full native playback time`);
    if (kind !== 'music') {
      let squareSum = 0; let peak = 0;
      for (let index = 44; index + 1 < bytes.length; index += 2) {
        const sample = bytes.readInt16LE(index) / 32768;
        squareSum += sample * sample; peak = Math.max(peak, Math.abs(sample));
      }
      const rms = Math.sqrt(squareSum / ((bytes.length - 44) / 2));
      assert.ok(rms >= (kind.startsWith('ambient-') ? .006 : .025), `${kind} must remain audible in the minimalist mix`);
      assert.ok(peak < .9, `${kind} must leave headroom for overlapping effects`);
    }
  }
});

test('replaced WAVs have a versioned URL for browser and iPhone caches', () => {
  const url = audioAssetUrl('shot', import.meta.url);
  assert.ok(url.pathname.endsWith('/sounds/shot.wav'));
  assert.equal(url.searchParams.get('v'), AUDIO_ASSET_VERSION);
});

test('sound test previews supplied combat recordings', async () => {
  const audio = new BattleAudio();
  audio.isReady = () => true;
  audio.usingMobileAudio = () => true;
  const cues = [];
  audio.playMobile = (kind, group, delay) => { cues.push({ kind, group, delay }); return true; };
  assert.equal(await audio.previewBattleSounds(), true);
  assert.deepEqual(cues.map((entry) => entry.kind), ['shot', 'explosion-heavy', 'shot-laser']);
  assert.deepEqual(cues.map((entry) => entry.delay), [0, 1.15, 2.85]);
});

test('new launch sounds are audible and distinct on the native mobile path', async () => {
  const kinds = ['shot-flame', 'shot-cryo', 'shot-ap', 'shot-gravity', 'shot-soap', 'shot-harpoon', 'shot-hunter', 'shot-deploy', 'vortex', 'vortex-deflect', 'vortex-fire'];
  const signatures = [];
  for (const kind of kinds) {
    const bytes = await readFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url));
    let energy = 0;
    for (let index = 44; index < bytes.length; index += 2) { const sample = bytes.readInt16LE(index) / 32768; energy += sample * sample; }
    assert.ok(Math.sqrt(energy / ((bytes.length - 44) / 2)) > .012, `${kind} should not be silent`);
    signatures.push(bytes.subarray(44, 400).toString('base64'));
  }
  assert.equal(new Set(signatures).size, kinds.length);
});

test('new procedural cues are audible while hover stays short and quiet', async () => {
  for (const kind of ['shot-kinetic', 'impact-wood']) {
    const bytes = await readFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url));
    let energy = 0; let peak = 0;
    for (let index = 44; index < bytes.length; index += 2) {
      const sample = bytes.readInt16LE(index) / 32768;
      energy += sample * sample; peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(Math.sqrt(energy / ((bytes.length - 44) / 2)) > .04, `${kind} should be clear in the mix`);
    assert.ok(peak < .5, `${kind} should still leave headroom`);
  }
  const hover = await readFile(new URL('../client/sounds/ui-hover.wav', import.meta.url));
  assert.ok((hover.length - 44) / (22050 * 2) <= .12, 'hover must not ring for half a second');
});

test('battle blast samples retain an audible attack without clipping', async () => {
  const signatures = [];
  for (const kind of ['explosion', 'explosion-dry', 'explosion-rolling', 'explosion-heavy', 'explosion-mega', 'explosion-fireworks', 'bombardment-hit-v2']) {
    const bytes = await readFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url));
    const rate = bytes.readUInt32LE(24);
    let total = 0; let attack = 0; let peak = 0;
    for (let offset = 44; offset < bytes.length; offset += 2) {
      const sample = bytes.readInt16LE(offset) / 32768;
      total += sample * sample;
      if ((offset - 44) / 2 < rate * .08) attack += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(total / ((bytes.length - 44) / 2));
    const attackRms = Math.sqrt(attack / (rate * .08));
    assert.ok(rms >= .025, `${kind} needs an audible body`);
    assert.ok(attackRms >= .075, `${kind} needs a distinct first hit`);
    assert.ok(peak < .82, `${kind} must leave room for overlapping effects`);
    signatures.push(bytes.subarray(44, 800).toString('base64'));
  }
  assert.equal(new Set(signatures).size, signatures.length, 'blast variants should not be identical');
});

test('trimmed combat cues start on the action and reserve the right mobile channel duration', async () => {
  for (const kind of ['shot', 'shot-grenade', 'shot-ap', 'shot-flame', 'shot-tesla', 'shot-elemental-water', 'water-splash', 'laser-impact', 'quake-impact']) {
    const bytes = await readFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url));
    const seconds = (bytes.length - 44) / (bytes.readUInt32LE(24) * 2);
    const attackFrames = Math.round(bytes.readUInt32LE(24) * .08);
    let attackEnergy = 0;
    for (let offset = 44; offset < 44 + attackFrames * 2; offset += 2) {
      const value = bytes.readInt16LE(offset) / 32768;
      attackEnergy += value * value;
    }
    assert.ok(Math.sqrt(attackEnergy / attackFrames) >= .035, `${kind} must not begin with an inaudible delay`);
    assert.ok(Math.abs(seconds - SOUND_PRESETS[kind].duration) < .03, `${kind} must reserve its real mobile playback time`);
  }
});

test('the restored menu loop is audible and avoids clipping', async () => {
  const bytes = await readFile(new URL('../client/sounds/music.wav', import.meta.url));
  const samples = (bytes.length - 44) / 2;
  assert.equal(samples / 22050, 4);
  let sum = 0; let peak = 0;
  for (let index = 44; index < bytes.length; index += 2) {
    const sample = Math.abs(bytes.readInt16LE(index) / 32768);
    sum += sample * sample; peak = Math.max(peak, sample);
  }
  assert.ok(Math.sqrt(sum / samples) > .025, 'theme must not be effectively silent');
  assert.ok(peak < .98, 'theme must leave headroom for effects');
});

test('wood impacts are quiet and rate-limited independently of tree breaks', () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const audio = new BattleAudio();
  const played = [];
  audio.isReady = () => true;
  audio.playMobile = (kind, group, delay, rate, level) => { played.push({ kind, level }); return true; };
  audio.environment('woodImpact', .5);
  audio.environment('woodImpact', .5);
  assert.deepEqual(played, [{ kind: 'impact-wood', level: .21 }]);
  delete globalThis.localStorage;
});

test('ambient sound selection reserves native channels for combat', () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const audio = new BattleAudio();
  audio.isReady = () => true;
  const played = [];
  audio.playMobile = (kind) => { played.push(kind); return true; };
  const view = { game: { phase: 'playing', wind: 15, roundNumber: 2, terrain: { type: 'flat', floatingPlatforms: [] },
    fireZones: [{ x: 640, y: 530, radius: 80, turnsLeft: 3 }], weather: { kind: 'rain', startedAt: 0 }, waterZones: [] },
    camera: { x: 0, y: 100, zoom: 1 }, terrainHeights: Array(1800).fill(560), now: 5000 };
  audio.updateAmbient(view);
  assert.equal(audio.ambientNextAt.size, 2);
  assert.ok(audio.ambientNextAt.has('ambient-fire'));
  assert.ok(audio.ambientNextAt.has('ambient-rain'));
  assert.ok(played.length <= 1, 'the second ambient layer is staggered');
  delete globalThis.localStorage;
});

class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}

class FakeAudioContext {
  constructor() { this.state = 'suspended'; this.sampleRate = 8_000; this.currentTime = 0; this.destination = {}; this.oscillatorStarts = 0; this.bufferStarts = 0; this.outputConnections = 0; }
  createGain() { return { gain: new FakeParam(), connect: (target) => { if (target === this.destination) this.outputConnections += 1; } }; }
  createDynamicsCompressor() { return { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam(), connect() {} }; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return { connect() {}, start: () => { this.bufferStarts += 1; } }; }
  createOscillator() { return { type: '', frequency: new FakeParam(), connect() {}, start: () => { this.oscillatorStarts += 1; }, stop() {} }; }
  createBiquadFilter() { return { type: '', frequency: new FakeParam(), connect() {} }; }
  async resume() { this.state = 'running'; }
}

test('suspended mobile audio resumes without replaying stale effects', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  for (const state of ['suspended', 'interrupted']) {
    const context = new FakeAudioContext(); context.state = state;
    context.resume = async () => { await new Promise((resolve) => setImmediate(resolve)); context.state = 'running'; };
    globalThis.AudioContext = class { constructor() { return context; } };
    const audio = new BattleAudio();
    audio.ui('confirm');
    await audio.unlock();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.state, 'running');
    assert.equal(context.oscillatorStarts, 0);
    audio.ui('confirm');
    assert.ok(context.oscillatorStarts >= 2);
    assert.equal(context.outputConnections, 1);
  }
  delete globalThis.AudioContext;
  delete globalThis.localStorage;
});

test('first user activation confirms the audio output and reuses one context', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const context = new FakeAudioContext(); globalThis.AudioContext = class { constructor() { return context; } };
  const audio = new BattleAudio(); await audio.activate(true); await audio.activate(true);
  assert.equal(context.state, 'running'); assert.equal(context.outputConnections, 1); assert.equal(context.oscillatorStarts, 2);
  delete globalThis.AudioContext; delete globalThis.localStorage;
});

test('iPhone playback session is selected before Web Audio starts and restored on return', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const audioSession = { type: 'ambient' };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'CriOS/130 iPhone', audioSession } });
  const context = new FakeAudioContext();
  globalThis.AudioContext = class { constructor() { assert.equal(audioSession.type, 'playback'); return context; } };
  try {
    const audio = new BattleAudio();
    assert.equal(await audio.activate(false), true);
    assert.equal(audioSession.type, 'playback');
    audioSession.type = 'ambient';
    assert.equal(await audio.resumeExisting(), true);
    assert.equal(audioSession.type, 'playback');
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    delete globalThis.AudioContext; delete globalThis.localStorage;
  }
});

test('output check can be replayed while sound remains enabled', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const context = new FakeAudioContext(); globalThis.AudioContext = class { constructor() { return context; } };
  const audio = new BattleAudio(); await audio.activate(false);
  const initial = context.oscillatorStarts;
  assert.equal(audio.testOutput(), true);
  assert.equal(audio.testOutput(), true);
  assert.equal(audio.enabled, true);
  assert.equal(context.oscillatorStarts, initial + 4);
  delete globalThis.AudioContext; delete globalThis.localStorage;
});

test('mobile activation starts native media in the tap stack and routes effects through it', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  globalThis.matchMedia = () => ({ matches: true });
  const plays = [];
  globalThis.Audio = class {
    constructor() { this.src = ''; this.volume = 1; this.loop = false; }
    play() { plays.push(this.src.split('?')[0]); return Promise.resolve(); }
    pause() {}
  };
  const context = new FakeAudioContext(); globalThis.AudioContext = class { constructor() { return context; } };
  try {
    const audio = new BattleAudio();
    const pending = audio.activate(false);
    assert.ok(plays.length >= 1, 'native play() must be called before the first await');
    assert.equal(await pending, true);
    await Promise.resolve();
    assert.ok(audio.mobile.channels.length >= 2, 'mobile effects need independent channels so impacts do not cut off launches');
    const freeChannels = () => audio.mobile.channels.forEach((channel) => { channel.busyUntil = 0; });
    assert.equal(audio.usingMobileAudio(), true);
    assert.equal(await audio.testOutputVerified(), true);
    freeChannels(); audio.ui('confirm');
    freeChannels(); audio.move();
    freeChannels(); audio.shoot(.2, 'heavy', 0, { hasImpact: false });
    assert.ok(plays.at(-1).endsWith('/heavy.wav'));
    freeChannels(); audio.shoot(.2, 'fireworks', 0, { hasImpact: false });
    assert.ok(plays.at(-1).endsWith('/shot-fireworks.wav'));
    for (const [weapon, effect, sound] of [
      ['gravity', {}, 'shot-gravity'], ['soapBomb', {}, 'shot-soap'], ['harpoon', {}, 'shot-harpoon'],
      ['flyingHunter', {}, 'shot-hunter'], ['sentry', {}, 'shot-deploy'],
      ['kineticCannon', {}, 'shot-kinetic'], ['markerBomb', {}, 'shot-marker'], ['waterTorpedo', {}, 'shot-torpedo'],
      ['windPlate', {}, 'shot-wind-plate'], ['meteorSalvo', {}, 'shot-meteor'], ['waterHunter', {}, 'shot-water-hunter'],
      ['heavy', { freeze: true }, 'shot-cryo'], ['zeus', { armorPiercer: true }, 'shot-ap'],
      ['standard', { combo: ['molotov'] }, 'shot-flame'],
    ]) {
      freeChannels(); audio.shoot(.2, weapon, 0, { ...effect, hasImpact: false });
      assert.ok(plays.at(-1).endsWith(`/${sound}.wav`), weapon);
    }
    for (const [weapon, sound] of [['zeus', 'shot-zeus'], ['teslaOrb', 'shot-tesla'], ['lightningRod', 'shot-lightning-rod'], ['mineLayer', 'shot-mine'], ['waterMine', 'shot-water-mine'], ['elementalWater', 'shot-elemental-water'], ['elementalEarth', 'shot-elemental-earth'], ['vitalRecycling', 'shot-vital']]) {
      freeChannels(); audio.shoot(.2, weapon, 0, { hasImpact: false });
      assert.ok(plays.at(-1).endsWith(`/${sound}.wav`), weapon);
    }
    for (const [elementalType, elementCue] of [['elementalFire', 'shot-flame'], ['elementalWater', 'shot-elemental-water'], ['elementalIce', 'shot-cryo'], ['elementalWind', 'vortex-deflect'], ['elementalEarth', 'shot-elemental-earth']]) {
      freeChannels(); const before = plays.length;
      audio.shoot(.2, 'heavy', 0, { elementalType, hasImpact: false });
      assert.deepEqual(plays.slice(before).map((src) => src.split('/').at(-1)), ['heavy.wav', `${elementCue}.wav`], `${elementalType} must layer the cannon with its element`);
      freeChannels(); const beforeImpact = plays.length;
      audio.shotImpact({ impact: { material: 'earth' }, weapon: 'heavy', elementalBurst: true, elementalType });
      assert.deepEqual(plays.slice(beforeImpact).map((src) => src.split('/').at(-1)), [({ elementalFire: 'impact-fire', elementalWater: 'water-splash', elementalIce: 'impact-ice', elementalWind: 'impact-wind', elementalEarth: 'impact-earth' })[elementalType] + '.wav', 'explosion-heavy.wav'], `${elementalType} must layer the elemental and shell impacts`);
    }
    freeChannels(); audio.impact({ impact: true, weapon: 'fireworks' });
    assert.ok(plays.at(-1).endsWith('/explosion-fireworks.wav'));
    const materialBlasts = { iron: 'explosion-rolling', concrete: 'explosion-rolling', wood: 'explosion', earth: 'explosion-dry' };
    for (const material of ['iron', 'concrete', 'wood', 'earth']) {
      freeChannels(); const beforeImpact = plays.length; audio.impact({ impact: { material }, weapon: 'standard' });
      assert.equal(plays.length, beforeImpact + 1, `${material} must play one impact cue`);
      assert.ok(plays.at(-1).endsWith(`/${materialBlasts[material]}.wav`), `${material} must still explode`);
    }
    for (const [elementalType, cue] of [['elementalFire', 'impact-fire'], ['elementalIce', 'impact-ice'], ['elementalWind', 'impact-wind'], ['elementalEarth', 'impact-earth']]) {
      freeChannels(); audio.impact({ impact: { material: 'earth' }, weapon: 'standard', elementalType });
      assert.ok(plays.at(-1).endsWith(`/${cue}.wav`), elementalType);
    }
    freeChannels(); audio.impact({ impact: { material: 'iron' }, weapon: 'sentry', noExplosion: true });
    assert.ok(plays.at(-1).endsWith('/impact-iron.wav'), 'non-explosive contact uses its surface cue');
    freeChannels(); audio.impact({ impact: { material: 'concrete' }, weapon: 'standard', laser: true });
    assert.ok(plays.at(-1).endsWith('/laser-impact.wav'));
    freeChannels(); audio.impact({ impact: { material: 'iron' }, weapon: 'standard', armorPiercer: true });
    assert.ok(plays.at(-1).endsWith('/ap-impact.wav'));
    freeChannels(); audio.sentryBurst();
    assert.ok(plays.at(-1).endsWith('/sentry-burst.wav'));
    freeChannels(); audio.eagleDive();
    assert.ok(plays.at(-1).endsWith('/eagle.wav'));
    freeChannels(); const beforeLayered = plays.length;
    audio.shoot(.2, 'heavy', 0, { hasImpact: false }); audio.bombardmentStrike(1);
    assert.equal(plays.length, beforeLayered + 2, 'a new impact should have another native channel');
    assert.ok(plays.at(-1).endsWith('/bombardment-hit-v2.wav'));
    freeChannels(); audio.shotImpact({ impact: { material: 'earth' }, weapon: 'standard', concealed: true });
    assert.ok(plays.at(-1).endsWith('/explosion-dry.wav'), 'concealed shots still need a blast');
    freeChannels(); audio.shotImpact({ impact: { material: 'earth' }, weapon: 'seismicCharge', delayedStrike: true });
    assert.ok(plays.at(-1).endsWith('/shot-marker.wav'), 'delayed attacks need a confirmed marker sound');
    freeChannels(); audio.shotImpact({ impact: { material: 'earth' }, weapon: 'standard', elementalBurst: true, elementalType: 'elementalFire' });
    assert.ok(plays.at(-1).endsWith('/explosion-dry.wav'), 'elemental attacks keep their terrain blast');
    freeChannels(); audio.arena('bombardment', true);
    assert.ok(plays.at(-1).endsWith('/bombardment-warning.wav'));
    freeChannels(); audio.arena('bombardment', false);
    assert.ok(plays.at(-1).endsWith('/bombardment-strike.wav'));
    await new Promise((resolve) => setTimeout(resolve, 220));
    const bedChannel = audio.mobile.channels.find((channel) => channel.element.src.includes('/bombardment-bed-v2.wav?'));
    assert.equal(bedChannel.element.volume, .22, 'the rubble bed must stay below the shell impacts');
    audio.bombardmentStrike(1);
    assert.ok(audio.mobile.channels.some((channel) => channel !== bedChannel && channel.element.src.includes('/bombardment-impact.wav?')), 'the blast must play without cutting off the rubble bed');
    assert.ok(plays.length >= 7);
    assert.equal(context.oscillatorStarts, 0, 'mobile fallback should not double-play Web Audio');
    assert.equal(audio.startMenuMusic(), true);
    audio.stopMenuMusic();
  } finally {
    delete globalThis.AudioContext; delete globalThis.Audio; delete globalThis.matchMedia; delete globalThis.localStorage;
  }
});

test('menu theme and hover feedback play only after audio is unlocked', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const context = new FakeAudioContext(); globalThis.AudioContext = class { constructor() { return context; } };
  const audio = new BattleAudio();
  audio.hover();
  assert.equal(context.oscillatorStarts, 0);
  await audio.activate(false);
  assert.equal(audio.startMenuMusic(), true);
  const musicStarts = context.oscillatorStarts;
  assert.ok(musicStarts >= 2);
  audio.stopMenuMusic();
  audio.hover();
  assert.ok(context.oscillatorStarts > musicStarts);
  const afterHover = context.oscillatorStarts;
  audio.hover();
  assert.equal(context.oscillatorStarts, afterHover, 'a repeated hover in the same moment stays silent');
  assert.equal(audio.menuMusicTimer, null);
  delete globalThis.AudioContext; delete globalThis.localStorage;
});

test('weapons, movement powers and lightning use layered sound signatures', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const context = new FakeAudioContext(); globalThis.AudioContext = class { constructor() { return context; } };
  const audio = new BattleAudio(); await audio.activate(false);
  const beforeHeavy = context.oscillatorStarts; audio.shoot(.5, 'heavy', 1, { damageMultiplier: 1.5 });
  assert.ok(context.oscillatorStarts - beforeHeavy >= 5);
  const beforeTesla = context.bufferStarts; audio.shoot(.5, 'teslaOrb', 1, {});
  assert.ok(context.bufferStarts - beforeTesla >= 7);
  const beforeSpider = context.oscillatorStarts; audio.move('spider');
  assert.equal(context.oscillatorStarts - beforeSpider, 4);
  const beforeStorm = context.bufferStarts; audio.arena('lightning', true);
  assert.ok(context.bufferStarts - beforeStorm >= 9);
  delete globalThis.AudioContext; delete globalThis.localStorage;
});

test('a projectile leaving the arena has no delayed explosion sound', async () => {
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  const context = new FakeAudioContext(); globalThis.AudioContext = class { constructor() { return context; } };
  const audio = new BattleAudio(); await audio.activate(false);
  const before = context.oscillatorStarts; audio.shoot(1.2, 'standard', 0, { hasImpact: false });
  const withoutImpact = context.oscillatorStarts - before;
  const beforeImpact = context.oscillatorStarts; audio.shoot(1.2, 'standard', 0, { hasImpact: true });
  assert.ok(withoutImpact < context.oscillatorStarts - beforeImpact);
  const beforeVertical = context.oscillatorStarts; audio.vertical(1.2, 0, false);
  const verticalFlight = context.oscillatorStarts - beforeVertical;
  const beforeVerticalImpact = context.oscillatorStarts; audio.vertical(1.2, 0, true);
  assert.ok(verticalFlight < context.oscillatorStarts - beforeVerticalImpact);
  delete globalThis.AudioContext; delete globalThis.localStorage;
});
