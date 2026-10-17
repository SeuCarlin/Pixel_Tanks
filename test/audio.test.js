import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleAudio } from '../client/audio.js';

class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}

class FakeAudioContext {
  constructor() { this.state = 'suspended'; this.sampleRate = 8_000; this.currentTime = 0; this.destination = {}; this.oscillatorStarts = 0; }
  createGain() { return { gain: new FakeParam(), connect() {} }; }
  createDynamicsCompressor() { return { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam(), connect() {} }; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return { connect() {}, start() {} }; }
  createOscillator() { return { type: '', frequency: new FakeParam(), connect() {}, start: () => { this.oscillatorStarts += 1; }, stop() {} }; }
  createBiquadFilter() { return { type: '', frequency: new FakeParam(), connect() {} }; }
  async resume() { this.state = 'running'; }
}

test('interface sounds wait for a suspended audio context to resume', async () => {
  const context = new FakeAudioContext();
  globalThis.localStorage = { getItem: () => 'on', setItem() {} };
  globalThis.AudioContext = class { constructor() { return context; } };
  const audio = new BattleAudio();
  audio.ui('confirm');
  await audio.unlock();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.state, 'running');
  assert.ok(context.oscillatorStarts >= 2);
  delete globalThis.AudioContext;
  delete globalThis.localStorage;
});
