import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioAssetUrl, rawAudioAssetUrl, selectedAudioKind } from '../client/audio-assets.js';
import { SOUND_PRESETS } from '../client/mobile-audio.js';
import { BattleAudio } from '../client/audio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selections = JSON.parse(fs.readFileSync(path.join(root, 'docs/SOUND_CHOICES_APPROVED.json'), 'utf8')).selections;
const imported = {
  'missile-flight': 'approved-missile-flight', electric: 'approved-electric', vortex: 'approved-vortex',
  'propulsion-vortex': 'meteor',
  'shark-bite': 'approved-shark-bite', 'laser-impact': 'approved-laser-impact',
  explosion: 'approved-explosion', 'impact-wind': 'approved-impact-wind', thunder: 'approved-electric',
  'impact-fire': 'fireball-impact',
};

test('todas as escolhas confirmadas resolvem para WAVs existentes, sem encadear remapeamentos', () => {
  assert.equal(Object.keys(selections).length, 38);
  for (const [kind, choice] of Object.entries(selections)) {
    const expected = choice.option === 'ARQUIVO' ? imported[kind] : choice.sound;
    assert.equal(selectedAudioKind(kind), expected, kind);
    assert.ok(fs.existsSync(path.join(root, 'client/sounds', `${expected}.wav`)), kind);
    assert.ok(SOUND_PRESETS[kind], kind);
  }
  assert.equal(selectedAudioKind('shot'), 'heavy');
  assert.equal(selectedAudioKind('heavy'), 'shot-ap');
  assert.equal(selectedAudioKind('vortex'), 'approved-vortex');
  assert.equal(selectedAudioKind('propulsion-vortex'), 'meteor');
  assert.match(audioAssetUrl('shot', import.meta.url).pathname, /heavy\.wav$/);
  assert.match(rawAudioAssetUrl('shot', import.meta.url).pathname, /shot\.wav$/);
});

test('a Propulsão usa o sonic boom no impacto, enquanto tornados mantêm seu som de vento', () => {
  const calls = [];
  const audio = Object.create(BattleAudio.prototype);
  audio.unlock = () => {};
  audio.playMobile = (kind) => { calls.push(kind); return true; };
  audio.shotImpact({ weapon: 'gravity', impact: { material: 'earth' } });
  audio.vortexSpawn();
  assert.deepEqual(calls, ['propulsion-vortex', 'vortex']);
});

test('trilhas escolhidas tocam durante a trajetória e terminam antes do impacto', () => {
  const calls = [];
  const audio = Object.create(BattleAudio.prototype);
  audio.playMobile = (...args) => calls.push(args);
  audio.projectileFlight({ weapon: 'standard' }, 1.2);
  audio.projectileFlight({ weapon: 'standard', combo: ['guidedBullet'] }, .8);
  audio.projectileFlight({ weapon: 'fireworks' }, 1.5);
  audio.projectileFlight({ weapon: 'standard', laser: true }, 1.5);
  assert.deepEqual(calls.map((args) => args[0]), ['missile-flight', 'guided-missile-flight', 'firework-flight']);
  assert.deepEqual(calls.map((args) => args[5]), [1.08, .68, 1.38]);
});

test('shots and impacts cycle through distinct recordings', () => {
  const calls = [];
  const audio = Object.create(BattleAudio.prototype);
  audio.unlock = () => {};
  audio.playMobile = (kind) => { calls.push(kind); return true; };
  for (let index = 0; index < 3; index += 1) audio.shoot(.3, 'standard', 0, { hasImpact: false });
  assert.deepEqual(calls, ['shot', 'shot-alt-a', 'shot-alt-b']);
  calls.length = 0;
  for (let index = 0; index < 3; index += 1) audio.impact({ weapon: 'standard', impact: { material: 'earth' } });
  assert.deepEqual(calls, ['explosion-dry', 'impact-alt-b', 'impact-alt-a']);
});

test('storm, Zeus, supply, lucky winds and revival use the new layered cues', () => {
  const calls = [];
  const audio = Object.create(BattleAudio.prototype);
  audio.unlock = () => {};
  audio.isReady = () => true;
  audio.playMobile = (kind) => { calls.push(kind); return true; };
  audio.arena('lightning', true);
  audio.arena('lightning', false);
  audio.lightningStrike();
  audio.detonation('zeus');
  audio.arena('supply', true);
  audio.arena('supply', false);
  audio.arena('luckyWinds', false);
  audio.revive();
  assert.deepEqual(calls, ['thunder-roll', 'thunder-clap', 'thunder-anime', 'explosion-heavy', 'thunder-roll', 'thunder-anime', 'explosion-heavy', 'helicopter-pass', 'supply', 'holy-revival', 'holy-revival']);
});
