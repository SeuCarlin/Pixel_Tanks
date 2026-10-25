// Rebuild the game's short sound effects with ElevenLabs.
// Run: node --env-file=.env.local scripts/generate-sfx.mjs [sound-name ...]
// The key stays outside the repository. Existing files are kept on API errors.
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFile, writeFile } from 'node:fs/promises';

const style = 'Isolated sound effect for a detailed pixel art artillery game. Crisp retro arcade transient layered with tactile military machinery. No speech, no music, no ambience bed, no long silence.';
const cues = {
  ready: [.5, 'A bright two-step electronic system ready chime, precise and optimistic.'],
  ui: [.5, 'A tiny metallic menu button click with a soft digital blip.'],
  turn: [.6, 'A concise tactical turn notification, two clean rising electronic notes and a mechanical click.'],
  warning: [.7, 'A short urgent radar warning ping with a descending alarm tone.'],
  pickup: [.7, 'A collectible powerup: sparkling upward arpeggio, tiny metal click and warm shimmer.'],
  power: [.7, 'A charged ability activation: low mechanical click, fast electronic sweep and punchy finish.'],
  'shield-up': [.9, 'A protective energy shield snapping into place, rising crystalline hum and bright flash.'],
  'cloak-up': [.9, 'A stealth cloak activating: airy reverse shimmer, descending spectral digital sweep.'],
  move: [.5, 'Small tank tracks rolling one short step on coarse gravel, tight mechanical rattle.'],
  launch: [.7, 'A powerful tank jump propulsion burst, compressed air and brief metal acceleration.'],
  heavy: [.85, 'A heavy armor collision, dense metal crunch and low percussive thud.'],
  electric: [.8, 'A branching high voltage electrical discharge, sharp crackles and deep zap.'],
  eagle: [1.1, 'A stylized eagle screech sweeping down into a fast jet dive; energetic arcade game cue.'],
  vortex: [1.2, 'A suction vortex forming, spiraling wind and low gravity pulse, rising intensity.'],
  'vortex-deflect': [.8, 'A projectile suddenly deflected by wind, sharp spinning whoosh and metallic tick.'],
  'vortex-fire': [1.1, 'A fire tornado igniting, rotating air, roaring flame and crackling embers.'],
  shot: [.65, 'A tiny tank cannon firing a single punchy shell, dry muzzle crack with brief bass tail.'],
  'shot-cluster': [.85, 'Fragmentation missile launch; one cannon kick followed by three fast metallic rocket hiss trails.'],
  'shot-fireworks': [.9, 'Firework shell launch, bright whistling rocket rising with a sharp ignition pop.'],
  'shot-grenade': [.7, 'A spring-loaded grenade launcher firing with a bouncy metal clunk and short whoosh.'],
  'shot-vertical': [.8, 'A guided vector projectile launch, rising synthetic motor whine and sharp air cut.'],
  'shot-seismic': [.85, 'A seismic charge leaving a cannon, low piston slam, gritty earth rumble.'],
  'shot-drone': [.9, 'Three miniature attack drones releasing from a tank, quick servo whirs and propeller buzz.'],
  'shot-mole': [.9, 'A burrowing drill bomb launching, grinding metal bit and scattering pebbles.'],
  'shot-mega': [1.15, 'A gigantic atomic shell launch, huge cannon report, metal recoil and deep ominous bass.'],
  'shot-laser': [.95, 'A high energy laser charging and releasing in one sharp futuristic beam, electric hiss.'],
  'shot-flame': [.95, 'A flamethrower ignition and forceful burst, gas rush and bright crackling fire.'],
  'shot-cryo': [.85, 'A cryogenic shell launched, brittle icy glass chimes and cold compressed vapor.'],
  'shot-ap': [.75, 'An armor piercing metal dart fired at high velocity, piercing whistle and steel snap.'],
  'shot-gravity': [1.0, 'A gravity bomb launch, pulsing low frequency warble and swirling vacuum air.'],
  'shot-soap': [.85, 'A soap bubble projectile launched, liquid blip and several delicate elastic bubbles.'],
  'shot-harpoon': [.85, 'A steel harpoon fired from a tank, cable spool rattling and fast pointed whoosh.'],
  'shot-hunter': [1.0, 'A small homing aircraft launches, fast propeller startup followed by a predatory dive.'],
  'shot-deploy': [.85, 'A small sentry turret deploys, mechanical legs unfolding and servo locking.'],
  'shot-kinetic': [.8, 'A compressed kinetic cannon firing a dense slug, sharp pneumatic snap followed by a powerful accelerating bass pulse.'],
  'shot-marker': [.85, 'A marker bomb launching with a springy metal clank, three distinct ticking beeps as its bounce sensors arm.'],
  'shot-torpedo': [1.0, 'Three miniature underwater torpedoes launch rapidly, muffled mechanical thumps followed by fast cavitation trails.'],
  'shot-wind-plate': [.9, 'A compact wind plate thrown and spinning through the air, short aerodynamic whistle and flutter.'],
  'shot-meteor': [1.0, 'An artillery beacon firing toward the sky, deep rocket ignition and rising fiery whistle before a meteor strike.'],
  'shot-water-hunter': [.9, 'A mechanical shark missile launches with a watery splash, motor whirr and swift underwater swoosh.'],
  'shot-zeus': [.95, 'A tank launches a crackling lightning shell: hard electric cannon snap followed by a fast climbing blue arc and thunder tail.'],
  'shot-tesla': [.9, 'A compact Tesla orb fires, humming energy coil releases with a bright static crack and oscillating electric whine.'],
  'shot-lightning-rod': [.9, 'A deployable lightning antenna fires from a cannon, spring-loaded metal launch and electrical antenna chirp.'],
  'shot-mine': [.85, 'Three small land mines eject from a tank in rapid succession, metallic clacks and spring-loaded throws.'],
  'shot-water-mine': [.9, 'A heavy inactive naval mine tumbles out of a tank launcher, hollow metal thump and short rattling roll.'],
  'shot-elemental-water': [.95, 'A compressed sphere of water fires from a cannon, powerful liquid pressure burst and rushing water trail.'],
  'shot-elemental-earth': [.95, 'An earth elemental shell launches with a deep stone piston knock and gritty sliding rock trail.'],
  'shot-vital': [.9, 'A vital recycling shell fires, bright restorative energy pulse layered over a concise mechanical cannon shot.'],
  explosion: [1.1, 'A compact shell explosion in dirt and metal, punchy crack, rubble and short low tail.'],
  'explosion-dry': [1.0, 'A dry artillery shell blast against rocky ground, sharp initial crack and tumbling gravel, no music.'],
  'explosion-rolling': [1.35, 'A rounder layered battlefield explosion, low rolling blast followed by short scattering debris, distinct from a dry shell pop.'],
  'explosion-heavy': [1.55, 'A massive high explosive impact with metal shrapnel and falling concrete, cinematic but arcade tight.'],
  'explosion-mega': [2.4, 'A colossal atomic mushroom cloud explosion: hard initial blast, layered rolling thunder and falling debris.'],
  'explosion-fireworks': [1.55, 'Twelve tiny colorful firework explosions popping rapidly in different pitches, crackling debris.'],
  thunder: [1.7, 'A vivid lightning strike: instantaneous electric crack, several thunder claps and dark rolling tail.'],
  victory: [1.25, 'A short triumphant arcade military victory fanfare, bright synth brass stabs and metallic sparkle.'],
  defeat: [1.2, 'A short game over cue, descending broken electronic notes and low metal fade.'],
  'ui-hover': [.5, 'A feather-light metallic hover tick with a tiny high electronic sparkle.'],
  'ui-confirm': [.55, 'A positive tactical menu confirmation, clean double chime with a solid switch click.'],
  'ui-cancel': [.5, 'A low soft menu cancel click and a very short descending digital tone.'],
  'ui-combo': [.8, 'Two weapon cards combining, overlapping electronic arpeggios, powerful final lock-in chime.'],
  'sentry-burst': [1.0, 'Five tiny machine gun shots in a rhythmic burst, dry arcade metal pops, no explosion.'],
  'water-splash': [.8, 'A heavy tank splashing into a lake, a low water slap and scattered droplets.'],
  'water-flow': [1.0, 'Water streaming over a metal ledge and pouring to the ground, crisp flowing splash.'],
  'ice-break': [.9, 'A thick ice platform cracking, brittle crystalline snaps and falling shards.'],
  'tree-break': [.85, 'A tree trunk splintering and falling, dry wood cracks and a heavy wooden thud.'],
  'harpoon-latch': [.6, 'A steel harpoon striking a wall and locking in, sharp metal impact and cable rattle.'],
  'harpoon-pull': [.85, 'A taut winch cable yanking a tank rapidly toward its anchor, motor strain and steel scrape.'],
  'shark-bite': [.85, 'An underwater mechanical shark lunges and bites, water rush, metallic crunch and short blast.'],
  gale: [2.3, 'A sudden battlefield gale, gusting wind and blowing grit, one dramatic swell.'],
  'quake-warning': [2.0, 'An approaching earthquake under a battlefield, deep uneven subterranean rumbles, stone creaking and three sharper warning tremors, no explosion or music.'],
  'quake-impact': [2.3, 'A violent earthquake splits rocky ground in several places, overlapping deep seismic booms, grinding stone, cracking concrete and falling debris, no music.'],
  rain: [2.0, 'Heavy rain begins on metal tanks and wet ground, growing patter with distant dark clouds.'],
  bombardment: [1.8, 'Several artillery shells whistle vertically then explode across an arena in quick sequence.'],
  'bombardment-warning': [1.8, 'Six heavy artillery shells falling from very high above: descending whistling air, growing low menace, then an abrupt stop before impact. No explosions or music.'],
  'bombardment-impact': [2.2, 'Massive battlefield artillery bombardment begins with one sharp concussive blast, then a deep rolling barrage of several powerful explosions and falling concrete debris. Strong sub-bass body, no long silence or music.'],
  'bombardment-strike': [.65, 'One artillery shell slams vertically into rocky ground: immediate sharp crack, powerful bass explosion and short scattering debris. No whistle or music.'],
  'bombardment-bed-v2': [2.4, 'Close battlefield atmosphere after artillery hits: continuous deep concrete rubble rumble, gritty falling stones and distant metallic rattles. No distinct explosion at the beginning, no silence, no whistle, no voice or music.'],
  'bombardment-hit-v2': [1.5, 'One large artillery shell striking concrete. Instant sharp impact crack, powerful low blast, collapsing rubble and short falling debris. A strong first hit and clear decay. No whistle, no voice or music.'],
  eruption: [2.0, 'A volcano violently erupts, lava spray, rumbling rock and several fiery bursts.'],
  supply: [1.4, 'Small supply helicopter passing overhead and releasing a crate, rotor thrum and light drop.'],
  parachute: [.8, 'A parachute unfurls above a tank, brief fabric snap and airy glide.'],
  'water-jet': [2.0, 'A powerful pressurized water cannon spraying continuously for two seconds, hard stream and splashing impacts.'],
  'water-mine': [1.15, 'A large floating naval mine explodes underwater, muffled bass blast and heavy splash.'],
  'ap-impact': [.8, 'An armor piercing dart punches through steel, hard ringing metal crack and sharp sparks.'],
  drill: [1.3, 'A heavy powered drill bores through blocky rock, grinding gears and falling stone chunks.'],
  'laser-impact': [1.0, 'A blue energy laser beam cutting through concrete, searing electric hiss and crumbling debris.'],
  'impact-iron': [.8, 'An artillery projectile hitting thick iron armor, ringing metallic clang, bright sparks and short resonant tail, no explosion.'],
  'impact-concrete': [.8, 'An artillery projectile striking concrete, blunt crack, grit and chunks of masonry scattering, no explosion.'],
  'impact-wood': [.75, 'An artillery projectile piercing a tree trunk, dry woody thwack, splinters snapping and leaves shaking, no explosion.'],
  'impact-earth': [.8, 'An artillery projectile punching into soil, dense earthy thud and gravel scattering, no explosion.'],
  'impact-fire': [.9, 'A fiery projectile igniting on impact, forceful flame whoosh and bright crackling embers, no generic bomb blast.'],
  'impact-ice': [.9, 'An icy projectile bursting on impact, brittle crystalline crack and frosty vapor hiss, no generic bomb blast.'],
  'impact-wind': [.9, 'A wind projectile striking a surface, swirling gust and pressured air burst, no generic bomb blast.'],
  meteor: [1.7, 'A flaming meteor roars from the sky and slams into earth, huge rocky blast and debris.'],
};

function canonicalWav(bytes, name) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('The API did not return WAV audio');
  let format, data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (tag === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + size);
    if (tag === 'data') data = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size & 1);
  }
  if (!format || !data) throw new Error('WAV format or samples missing');
  const codec = format.readUInt16LE(0), channels = format.readUInt16LE(2), rate = format.readUInt32LE(4), bits = format.readUInt16LE(14);
  if (codec !== 1 || bits !== 16 || !channels || !rate) throw new Error(`Unsupported WAV ${codec}/${bits}`);
  const frames = Math.floor(data.length / (channels * 2));
  const samples = Buffer.alloc(frames * 2);
  let squareSum = 0;
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) sum += data.readInt16LE((i * channels + channel) * 2);
    const value = Math.round(sum / channels);
    samples.writeInt16LE(value, i * 2);
    squareSum += value * value;
  }
  // AI outputs can have a single loud spike followed by an inaudible body.
  // RMS matching plus a soft limiter preserves the body and leaves mix headroom.
  const rms = Math.sqrt(squareSum / Math.max(1, frames)) / 32768;
  const target = /^ui|ready|turn|victory|defeat/.test(name) ? .095 : /rain|gale|water-flow|move|parachute/.test(name) ? .085 : /explosion|thunder|meteor|bombardment/.test(name) ? .17 : .13;
  const scale = Math.min(28, target / Math.max(.002, rms));
  for (let i = 0; i < frames; i += 1) {
    const fadeIn = Math.min(1, i / Math.max(1, rate * .003));
    const fadeOut = Math.min(1, (frames - 1 - i) / Math.max(1, rate * .018));
    const value = Math.tanh(samples.readInt16LE(i * 2) / 32768 * scale * 1.2) * .84 * Math.max(0, Math.min(fadeIn, fadeOut));
    samples.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const wav = Buffer.alloc(44 + samples.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length, 40); samples.copy(wav, 44);
  return wav;
}

const normalizeOnly = process.argv.includes('--normalize-only');
const chosen = process.argv.slice(2).filter((argument) => argument !== '--normalize-only');
const selected = chosen.length ? chosen : Object.keys(cues);
for (const name of selected) if (!cues[name]) throw new Error(`Unknown sound ${name}`);
const client = normalizeOnly ? null : new ElevenLabsClient();
for (const name of selected) {
  const [duration, prompt] = cues[name];
  try {
    let bytes;
    if (normalizeOnly) bytes = await readFile(new URL(`../client/sounds/${name}.wav`, import.meta.url));
    else {
      const direction = name.startsWith('bombardment-') ? 'Isolated, powerful battlefield sound effect for a pixel art artillery game. Clear attack, tactile debris, thick mid-bass that remains audible on phone speakers. No speech, no music.' : style;
      const stream = await client.textToSoundEffects.convert({ text: `${direction} ${prompt}`, durationSeconds: duration, promptInfluence: .72, modelId: 'eleven_text_to_sound_v2', outputFormat: 'wav_22050' });
      const chunks = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      bytes = Buffer.concat(chunks);
    }
    const wav = canonicalWav(bytes, name);
    await writeFile(new URL(`../client/sounds/${name}.wav`, import.meta.url), wav);
    process.stdout.write(`${name}: ${wav.length} bytes\n`);
  } catch (error) {
    process.stderr.write(`${name}: ${error?.statusCode || error?.status || error?.message || 'generation failed'}\n`);
    process.exitCode = 1;
    if (error?.statusCode === 401 || error?.statusCode === 429) break;
  }
}
