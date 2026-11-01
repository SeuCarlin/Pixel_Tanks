import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Read actual central-directory names, before any extractor can normalize them.
export async function verifyItchZip(file) {
  const zip = await readFile(file);
  let end = zip.length - 22;
  for (; end >= Math.max(0, zip.length - 65557); end--) if (zip.readUInt32LE(end) === 0x06054b50) break;
  if (end < Math.max(0, zip.length - 65557)) throw new Error('ZIP end record missing');
  const count = zip.readUInt16LE(end + 10), names = [];
  let offset = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const length = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 46, offset + 46 + length).toString('utf8');
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) throw new Error(`Nonportable ZIP path: ${name}`);
    names.push(name);
    offset += 46 + length + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  for (const required of ['index.html', 'app.js', 'network.js', 'local-engine.js', 'shared/constants.js', 'engine/game.js', 'assets/tankdots-icon.svg']) {
    if (!names.includes(required)) throw new Error(`ZIP missing exact path: ${required}`);
  }
  return names;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = await verifyItchZip(process.argv[2]);
  console.log(`ZIP verified: ${names.length} portable paths, root entry point and simulation present.`);
}
