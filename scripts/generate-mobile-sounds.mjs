import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SOUND_PRESETS, wavBlob } from '../client/mobile-audio.js';

const destination = resolve(fileURLToPath(new URL('../client/sounds/', import.meta.url)));
await mkdir(destination, { recursive: true });
for (const kind of Object.keys(SOUND_PRESETS)) {
  const bytes = Buffer.from(await wavBlob(kind).arrayBuffer());
  await writeFile(resolve(destination, `${kind}.wav`), bytes);
}
