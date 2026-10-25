// Generate short environmental textures with ElevenLabs, then make them fit the
// game's restrained, pixel-like sound palette. The API key stays in .env.local.
// Run: node --env-file=.env.local scripts/generate-ambient-sfx.mjs [name ...]
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { writeFile } from 'node:fs/promises';

const RATE = 22050;
const cues = {
  'ambient-breeze': [3.2, 'Soft airy breeze flowing gently across an open pixel art battlefield. Smooth subtle low wind, sparse little swells, no dramatic gust, no voices, no music, no birds.'],
  'ambient-rain': [3.2, 'A continuous, clearly audible but gentle rain pattering on a miniature metal tank and blocky terrain for the entire clip. Many small droplets with steady density, subdued retro game texture. No storm, thunder, music, voices or silence.'],
  'ambient-snow': [3.2, 'Quiet snowy wind over a frozen pixel art battlefield, soft powdery air and tiny dry snow grains drifting. Restrained and delicate, no blizzard, music or voices.'],
  'ambient-ice': [2.7, 'Close delicate creaks and tiny crystalline crackles from a thick ice platform in a pixel art game. Occasional isolated ticks, little cold air hiss, no shattering crash, music or voices.'],
  'ambient-fire': [2.8, 'Small contained flames burning on a pixel art battlefield, gentle crackling embers and a soft airy flame. No explosion, big roar, music or voices.'],
  'ambient-waterfall': [3.2, 'A small stream of water trickling off a pixel art platform into a shallow pool, light bubbling splashes and gentle ripples. No giant waterfall, music or voices.'],
};

function monoPcm(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected WAV data');
  let format; let payload;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    if (type === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'data') payload = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length & 1);
  }
  if (!format || !payload || format.readUInt16LE(0) !== 1 || format.readUInt16LE(14) !== 16) throw new Error('Expected 16-bit PCM WAV');
  const channels = format.readUInt16LE(2);
  const rate = format.readUInt32LE(4);
  const frames = Math.floor(payload.length / (channels * 2));
  const source = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) sum += payload.readInt16LE((frame * channels + channel) * 2) / 32768;
    source[frame] = sum / channels;
  }
  const target = new Float32Array(Math.round(frames * RATE / rate));
  for (let index = 0; index < target.length; index += 1) {
    const position = index * rate / RATE;
    const left = Math.min(frames - 1, Math.floor(position));
    target[index] = source[left] * (1 - (position - left)) + source[Math.min(frames - 1, left + 1)] * (position - left);
  }
  return target;
}

function pixelTexture(source, kind, seconds) {
  const frames = Math.min(source.length, Math.round(seconds * RATE));
  if (frames < RATE) throw new Error('Ambient sample was too short');
  const prepared = new Float32Array(frames);
  const soft = kind === 'ambient-snow' || kind === 'ambient-breeze';
  let low = 0; let dc = 0; let energy = 0; let peak = 0;
  for (let index = 0; index < frames; index += 1) {
    const value = source[index];
    dc += (value - dc) * .0003;
    low += (value - low) * (soft ? .18 : .32);
    const mixed = (low * (soft ? .72 : .42) + value * (soft ? .28 : .58)) - dc;
    prepared[index] = mixed;
    energy += mixed * mixed;
    peak = Math.max(peak, Math.abs(mixed));
  }
  const rms = Math.sqrt(energy / frames);
  const rain = kind === 'ambient-rain';
  const scale = rain ? Math.min(40, .055 / Math.max(rms, .001)) : Math.min(.052 / Math.max(rms, .002), .34 / Math.max(peak, .002));
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  let held = 0;
  for (let index = 0; index < frames; index += 1) {
    if (index % 2 === 0) {
      const value = rain ? Math.tanh(prepared[index] * scale / .32) * .32 : prepared[index] * scale;
      held = Math.round(value * 512) / 512;
    }
    const fade = Math.min(1, index / (RATE * .16), (frames - index - 1) / (RATE * .2));
    wav.writeInt16LE(Math.round(Math.max(-.5, Math.min(.5, held * Math.max(0, fade))) * 32767), 44 + index * 2);
  }
  return wav;
}

const selected = process.argv.slice(2);
for (const name of selected) if (!(name in cues)) throw new Error(`Unknown ambience: ${name}`);
const client = new ElevenLabsClient();
for (const name of selected.length ? selected : Object.keys(cues)) {
  const [durationSeconds, prompt] = cues[name];
  const stream = await client.textToSoundEffects.convert({
    text: `Minimalist retro pixel game ambience. One isolated environmental texture, soft and steady, with a small sonic footprint. ${prompt}`,
    durationSeconds, promptInfluence: .72, modelId: 'eleven_text_to_sound_v2', outputFormat: 'wav_22050',
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const wav = pixelTexture(monoPcm(Buffer.concat(chunks)), name, durationSeconds);
  await writeFile(new URL(`../client/sounds/${name}.wav`, import.meta.url), wav);
  process.stdout.write(`${name}: ${wav.length} bytes\n`);
}
