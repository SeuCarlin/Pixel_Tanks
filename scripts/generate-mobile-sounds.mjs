// Render the desktop synthesizer to WAV so mobile's native audio path uses
// the same timbres. Run with `node scripts/generate-mobile-sounds.mjs`.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const client = fileURLToPath(new URL('../client/', import.meta.url));
const destination = resolve(client, 'sounds');
const sounds = {
  ready: [.7, 'audio.testOutput()'],
  ui: [.2, "audio.ui('tap')"],
  move: [.35, "audio.move('tracks')"],
  shot: [.95, "audio.shoot(.65, 'standard', 0, { hasImpact: false })"],
  heavy: [.95, "audio.shoot(.65, 'heavy', 0, { hasImpact: false })"],
  electric: [.95, "audio.shoot(.65, 'zeus', 0, { hasImpact: false })"],
  eagle: [.85, 'audio.eagleDive()'],
  vortex: [.9, 'audio.vortexSpawn()'],
  'vortex-deflect': [.48, 'audio.vortexDeflect(false)'],
  'vortex-fire': [.82, 'audio.vortexIgnite()'],
  'shot-cluster': [.95, "audio.shoot(.65, 'cluster', 0, { hasImpact: false })"],
  'shot-fireworks': [.95, "audio.shoot(.65, 'fireworks', 0, { hasImpact: false })"],
  'shot-grenade': [.95, "audio.shoot(.65, 'grenade', 0, { hasImpact: false })"],
  'shot-vertical': [.95, 'audio.vertical(.65, 0, false)'],
  'shot-seismic': [.95, "audio.shoot(.65, 'seismicCharge', 0, { hasImpact: false })"],
  'shot-drone': [.95, "audio.shoot(.65, 'droneStrike', 0, { hasImpact: false })"],
  'shot-mole': [.95, "audio.shoot(.65, 'moleBomb', 0, { hasImpact: false })"],
  'shot-mega': [.95, "audio.shoot(.65, 'megaCannon', 0, { hasImpact: false })"],
  'shot-laser': [.95, "audio.shoot(.65, 'laser', 0, { hasImpact: false, laser: true })"],
  'shot-flame': [.95, "audio.shoot(.65, 'standard', 0, { hasImpact: false, combo: ['molotov'] })"],
  'shot-cryo': [.95, "audio.shoot(.65, 'standard', 0, { hasImpact: false, freeze: true })"],
  'shot-ap': [.95, "audio.shoot(.65, 'standard', 0, { hasImpact: false, armorPiercer: true })"],
  'shot-gravity': [.95, "audio.shoot(.65, 'gravity', 0, { hasImpact: false })"],
  'shot-soap': [.95, "audio.shoot(.65, 'soapBomb', 0, { hasImpact: false })"],
  'shot-harpoon': [.95, "audio.shoot(.65, 'harpoon', 0, { hasImpact: false })"],
  'shot-hunter': [.95, "audio.shoot(.65, 'flyingHunter', 0, { hasImpact: false, flyingHunter: true })"],
  'shot-deploy': [.95, "audio.shoot(.65, 'sentry', 0, { hasImpact: false })"],
  launch: [.65, "audio.launch('jump')"],
  pickup: [.75, "audio.pickup('heal')"],
  power: [.75, "audio.power('shield')"],
  'shield-up': [.7, "audio.statusActivated('shield')"],
  'cloak-up': [.8, "audio.statusActivated('invisibility')"],
  explosion: [1.1, 'audio.rumble(0, .9, .68); audio.noise(.68, .38, 0, 1100)'],
  'explosion-heavy': [1.35, 'audio.rumble(0, 1.25, 1.05); audio.noise(1.05, .5, 0, 1100)'],
  'explosion-mega': [2.3, 'audio.rumble(0, 1.75, 1.75); audio.noise(1.9, .58, 0, 760); audio.rumble(.18, 1.45, 2.05)'],
  'explosion-fireworks': [1.4, "audio.rumble(0, .9, .68); for (let i = 0; i < 12; i++) { audio.tone(760 + i % 4 * 170, 210, .13, i % 2 ? 'square' : 'triangle', .075, i * .055); audio.noise(.1, .075, i * .055, 2100) }"],
  thunder: [1.65, 'audio.thunder(0, .9)'],
  warning: [1.7, "audio.arena('bombardment', true)"],
  turn: [.4, 'audio.turn()'],
  victory: [1.45, 'audio.victory(true)'],
  defeat: [1.25, 'audio.victory(false)'],
};

const server = createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname;
  if (!['/', '/audio.js', '/mobile-audio.js', '/shot-launch.js'].includes(name)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
  response.end(name === '/' ? '<!doctype html><title>Sound renderer</title>' : await readFile(resolve(client, name.slice(1))));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await mkdir(destination, { recursive: true });
  const requested = new Set(process.argv.slice(2));
  for (const [kind, [duration, source]] of Object.entries(sounds)) {
    if (requested.size && !requested.has(kind)) continue;
    const encoded = await page.evaluate(async ({ duration, source }) => {
      const { BattleAudio } = await import('/audio.js');
      const rate = 22050;
      const context = new OfflineAudioContext(1, Math.ceil(rate * duration), rate);
      // The desktop synthesizer checks for a running context; offline contexts
      // are suspended until startRendering(), so only that state is adapted.
      const runningContext = new Proxy(context, { get(target, key) { return key === 'state' ? 'running' : typeof target[key] === 'function' ? target[key].bind(target) : target[key]; } });
      const audio = new BattleAudio();
      audio.context = runningContext;
      audio.master = context.createGain();
      audio.master.gain.value = .58;
      audio.master.connect(context.destination);
      audio.unlock = () => Promise.resolve(true);
      audio.volumes = { music: 1, effects: 1, interface: 1 };
      audio.enabled = true;
      // Stable noise makes generated assets reproducible.
      let seed = 137;
      const random = Math.random;
      Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      try { new Function('audio', source)(audio); } finally { Math.random = random; }
      const samples = (await context.startRendering()).getChannelData(0);
      const wav = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(wav);
      const label = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
      label(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); label(8, 'WAVE');
      label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      label(36, 'data'); view.setUint32(40, samples.length * 2, true);
      for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
      const bytes = new Uint8Array(wav);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    }, { duration, source });
    await writeFile(resolve(destination, `${kind}.wav`), Buffer.from(encoded, 'base64'));
    process.stdout.write(`${kind} `);
  }
  process.stdout.write('\n');
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
