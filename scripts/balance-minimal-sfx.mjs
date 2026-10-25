// Raise quiet minimalist cues without changing their waveform or the ambient bed.
import { readFile, writeFile } from 'node:fs/promises';
import { SOUND_PRESETS } from '../client/mobile-audio.js';

const targetRms = .03;
const peakLimit = .55;
for (const kind of Object.keys(SOUND_PRESETS)) {
  if (kind === 'music' || kind.startsWith('ambient-')) continue;
  const url = new URL(`../client/sounds/${kind}.wav`, import.meta.url);
  const wav = await readFile(url);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.readUInt16LE(34) !== 16) throw new Error(`${kind} must be 16-bit PCM WAV`);
  const count = (wav.length - 44) / 2;
  let energy = 0; let peak = 0;
  for (let offset = 44; offset + 1 < wav.length; offset += 2) {
    const value = wav.readInt16LE(offset) / 32768;
    energy += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = Math.sqrt(energy / count);
  const gain = Math.min(targetRms / Math.max(rms, 1e-6), peakLimit / Math.max(peak, 1e-6));
  if (gain <= 1.01) continue;
  for (let offset = 44; offset + 1 < wav.length; offset += 2) wav.writeInt16LE(Math.round(wav.readInt16LE(offset) * gain), offset);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await writeFile(url, wav); break; }
    catch (error) {
      if (attempt === 4 || !['EBUSY', 'EPERM', 'UNKNOWN'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  process.stdout.write(`${kind}: ${rms.toFixed(3)} -> ${(rms * gain).toFixed(3)} RMS\n`);
}
