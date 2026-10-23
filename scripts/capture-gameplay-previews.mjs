// Records the real game renderer playing shot results produced by the server physics.
// Start the local server, then run: node scripts/capture-gameplay-previews.mjs [weapon ...]
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { activateClusterShot, activateFireworksShot, activateHarpoon, activateVerticalShot, applyArenaPulse, createGame, fire, publicGame, sanitizeRules, tickRoom } from '../server/game.js';
import { ARSENAL_DEFS, EVENT_DEFS, POWERUP_DEFS, WORLD } from '../shared/constants.js';
import { simulateShot } from '../server/physics.js';

const output = new URL('../client/assets/gameplay-previews/', import.meta.url);
await mkdir(output, { recursive: true });
const selected = process.argv.slice(2);
const weapons = selected.length ? selected : Object.entries(ARSENAL_DEFS).filter(([, info]) => info.kind === 'shot').map(([type]) => type);
const browser = await chromium.launch({ headless: true });
const failed = [];

function makeShot(type, powerup = null) {
  const weapon = powerup ? 'standard' : type;
  const room = { rules: sanitizeRules({ seed: `preview-${type}`, powerupCount: 0, enabledEvents: [], classesEnabled: false }), players: [
    { id: 'preview-shooter', nickname: 'VOCÊ', color: '#b7ec58', arsenal: powerup ? ['heavy'] : [type] },
    { id: 'preview-target', nickname: 'ALVO', color: '#ff755c', arsenal: ['heavy'] },
  ] };
  room.game = createGame(room);
  const game = room.game;
  game.phase = 'playing'; game.roundNumber = 2; game.openingRestrictionsActive = false; game.turnIndex = 0;
  game.actions = { movesLeft: 2, attackAvailable: true }; game.wind = 0;
  game.terrain.heights.fill(650); game.terrain.floatingPlatforms = []; game.objects = []; game.mines = []; game.powerups = []; game.waterZones = [];
  const [shooter, target] = game.players;
  shooter.x = 220; shooter.y = 650 - WORLD.tankRadius; shooter.turnsPlayed = 2; if (!powerup) { if (!shooter.arsenal.includes(type)) shooter.arsenal.push(type); shooter.ammo[type] = 1; }
  if (powerup) { shooter.inventory = [powerup]; shooter.selectedPowerups = [powerup]; shooter.selectedPowerup = powerup; }
  target.y = shooter.y; target.turnsPlayed = 2;
  if (type === 'lightningRod') shooter.classType = 'meteorologist';
  if (type === 'waterCannon') shooter.classType = 'amphibian';
  if (type === 'megaCannon') { shooter.classType = 'attacker'; shooter.megaCannonCharge = 9999; }
  if (type.startsWith('elemental')) { shooter.classType = 'elementalist'; shooter.elementalCurrent = type; }
  const water = ['waterHunter', 'waterMine', 'waterTorpedo'].includes(type);
  if (water) {
    game.waterZones = [{ id: 'preview-lake', x: 740, radius: 560, surfaceY: 530, fluid: true, fluidVolume: 100000 }];
    shooter.y = type === 'waterTorpedo' ? 575 : shooter.y;
    shooter.swimming = type === 'waterTorpedo';
    target.y = type === 'waterTorpedo' ? 575 : 650 - WORLD.tankRadius;
    target.swimming = type === 'waterTorpedo';
  }
  const angle = ['waterCannon', 'waterTorpedo', 'harpoon'].includes(type) ? 0 : 32;
  const power = type === 'waterTorpedo' ? 300 : 220;
  const predicted = simulateShot({ terrain: game.terrain, ignorePlayerId: shooter.id, x: shooter.x, y: shooter.y, angle, power, gravity: room.rules.gravity, players: [] }).impact;
  target.x = type === 'waterTorpedo' ? 690 : type === 'waterCannon' ? 540 : type === 'harpoon' ? 520 : Math.min(920, Math.max(460, predicted.x));
  const before = structuredClone(publicGame(game, shooter.id));
  const results = fire(room, shooter.id, { weapon, angle, power, direction: 1 });
  const after = publicGame(game, shooter.id);
  let secondary = null; let afterSecondary = null; let secondaryAt = 0; let replaceSecondary = null;
  const choice = type === 'cluster' ? room.pendingClusterChoice : type === 'fireworks' ? room.pendingFireworksChoice : type === 'verticalStrike' ? room.pendingVerticalChoice : null;
  if (choice) {
    // Advance the real activation window enough to show the first projectile in flight.
    choice.startedAt -= 460;
    if (type === 'cluster') { secondary = activateClusterShot(room, shooter.id, choice.token); replaceSecondary = 'replaceCluster'; }
    if (type === 'fireworks') { secondary = activateFireworksShot(room, shooter.id, choice.token); replaceSecondary = 'replaceFireworks'; }
    if (type === 'verticalStrike') { secondary = activateVerticalShot(room, shooter.id, choice.token, { x: target.x, y: target.y }); replaceSecondary = 'replaceVertical'; }
    afterSecondary = publicGame(room.game, shooter.id); secondaryAt = 650;
  }
  if (type === 'harpoon' && room.game.harpoonAnchor) {
    room.game.shotEndsAt = null;
    room.game.harpoonAnchor.readyAt = Date.now() - 1;
    const pull = activateHarpoon(room, shooter.id);
    afterSecondary = publicGame(room.game, shooter.id);
    secondaryAt = Math.max(900, Math.min(1900, results[0].path.length / 80 * 1000 + 100));
    replaceSecondary = 'harpoonPull';
    // Preserve the server's actual pull trajectory as snapshots for the recording.
    const startedAt = pull.startedAt; const endsAt = pull.endsAt;
    secondary = [];
    for (let step = 0; step <= 12; step += 1) {
      const elapsed = (endsAt - startedAt) * step / 12;
      if (room.game.harpoonPull) { room.game.harpoonPull.startedAt = Date.now() - elapsed; room.game.harpoonPull.endsAt = room.game.harpoonPull.startedAt + endsAt - startedAt; }
      tickRoom(room);
      secondary.push(publicGame(room.game, shooter.id));
    }
  }
  let delayed = null; let afterDelayed = null; let delayAt = 0;
  if (room.game.delayedStrikes?.length) {
    delayAt = Math.max(1800, Math.min(...room.game.delayedStrikes.map((strike) => strike.executeAt - Date.now())));
    for (const strike of room.game.delayedStrikes) strike.executeAt = Date.now() - 1;
    delayed = tickRoom(room)?.shot || null;
    afterDelayed = delayed ? publicGame(room.game, shooter.id) : null;
  }
  return { kind: 'shot', before, after, results, secondary, afterSecondary, secondaryAt, replaceSecondary, delayed, afterDelayed, delayAt };
}

function makeEvent(type) {
  const room = { rules: sanitizeRules({ seed: `preview-event-${type}`, enabledEvents: [type], powerupCount: 4 }), players: [
    { id: 'preview-shooter', nickname: 'VOCÊ', color: '#b7ec58', arsenal: ['heavy'] },
    { id: 'preview-target', nickname: 'ALVO', color: '#ff755c', arsenal: ['heavy'] },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 7; room.game.turnNumber = 13;
  if (type === 'eruption') room.game.terrain.heights.fill(WORLD.height, 840, 1000);
  const before = publicGame(room.game, 'preview-shooter');
  const warning = structuredClone(applyArenaPulse(room, { forcedType: type }));
  if (!warning) throw new Error('event was not scheduled');
  const warningState = publicGame(room.game, 'preview-shooter');
  room.game.pendingArenaEvent.executeAt = Date.now() - 1;
  room.game.events.at(-1).executeAt = Date.now() - 1;
  tickRoom(room);
  const impact = structuredClone(room.game.events.at(-1));
  if (impact.warning) throw new Error('event impact was not resolved');
  return { kind: 'event', before, warningState, warning, impactState: publicGame(room.game, 'preview-shooter'), impact };
}

try {
  for (const type of weapons) {
    const powerup = type.startsWith('powerup:') ? type.slice(8) : null;
    const eventType = type.startsWith('event:') ? type.slice(6) : null;
    if (eventType ? !EVENT_DEFS[eventType] : powerup ? !POWERUP_DEFS[powerup] : !ARSENAL_DEFS[type] || ARSENAL_DEFS[type].kind !== 'shot') { failed.push([type, 'not a recordable action']); continue; }
    let fixture;
    try { fixture = eventType ? makeEvent(eventType) : makeShot(type, powerup); } catch (error) { failed.push([type, `physics: ${error.message}`]); continue; }
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${process.env.GAME_URL || 'http://localhost:3000'}/health`);
      const recording = await page.evaluate(async ({ kind, before, after, results, secondary, afterSecondary, secondaryAt, replaceSecondary, delayed, afterDelayed, delayAt, warningState, warning, impactState, impact }) => {
        document.body.innerHTML = '<div style="width:1280px;height:720px;overflow:hidden"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px"></canvas></div><canvas id="record" width="640" height="360" hidden></canvas>';
        document.body.style.margin = '0';
        const { Renderer } = await import('/renderer.js');
        const renderer = new Renderer(document.querySelector('#scene'));
        renderer.setPlayer('preview-shooter'); renderer.setGame(before);
        if (kind === 'event') {
          renderer.fitWorld();
          const warningMs = warning.type === 'supply' ? 2500 : 1800;
          warning.executeAt = Date.now() + warningMs;
          renderer.setGame(warningState); renderer.playArenaEvent(warning, Date.now());
          setTimeout(() => { renderer.setGame(impactState); renderer.playArenaEvent(impact, Date.now()); }, warningMs);
        } else {
          renderer.camera = { x: 0, y: 225, zoom: 1.45 }; renderer.userZoom = 1.45; renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
          renderer.playShot({ shooterId: 'preview-shooter', results }); renderer.setGame(after);
          if (secondary && afterSecondary) setTimeout(() => {
            if (replaceSecondary === 'harpoonPull') {
              secondary.forEach((state, index) => setTimeout(() => {
                const pull = state.harpoonPull;
                if (pull) { const remaining = pull.endsAt - pull.startedAt; pull.startedAt = Date.now() - remaining * index / 12; pull.endsAt = pull.startedAt + remaining; }
                renderer.setGame(state);
              }, index * 95));
            } else { renderer.playShot({ shooterId: 'preview-shooter', results: secondary, [replaceSecondary]: true }); renderer.setGame(afterSecondary); }
          }, secondaryAt);
          if (delayed && afterDelayed) setTimeout(() => { renderer.playShot(delayed); renderer.setGame(afterDelayed); }, delayAt);
        }
        const source = document.querySelector('#scene'); const canvas = document.querySelector('#record'); const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
        const mime = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E') ? 'video/mp4;codecs=avc1.42E01E' : 'video/webm;codecs=vp8';
        const recorder = new MediaRecorder(canvas.captureStream(18), { mimeType: mime, videoBitsPerSecond: 520000 });
        const chunks = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        const duration = kind === 'event' ? (warning.type === 'supply' ? 5700 : 5000) : Math.min(8500, Math.max(3800, renderer.shotDuration({ results }) * 1000 + 1800, delayed ? delayAt + 2300 : 0, secondary ? secondaryAt + 2100 : 0));
        // Keep the action legible in the narrow mobile card: crop surplus sky on shot clips.
        let drawing = true; const copy = () => { if (!drawing) return; if (kind === 'event') ctx.drawImage(source, 0, 0, 640, 360); else ctx.drawImage(source, 120, 150, 1000, 562.5, 0, 0, 640, 360); requestAnimationFrame(copy); }; copy();
        recorder.start(); await new Promise((resolve) => setTimeout(resolve, duration));
        const stopped = new Promise((resolve) => { recorder.onstop = resolve; }); recorder.stop(); await stopped; drawing = false;
        const blob = new Blob(chunks, { type: mime });
        const data = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
        return { base64: data, mime, duration: Math.round(duration), size: blob.size };
      }, fixture);
      if (errors.length || recording.size < 1000) throw new Error(errors.join('; ') || `empty recording: ${recording.size}`);
      const ext = recording.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      await writeFile(new URL(`${eventType ? `event-${eventType}` : powerup ? `powerup-${powerup}` : type}.${ext}`, output), Buffer.from(recording.base64, 'base64'));
      console.log(`${type}: ${ext}, ${recording.size} bytes, ${recording.duration} ms`);
    } catch (error) { failed.push([type, error.message]); }
    finally { await page.close(); }
  }
} finally { await browser.close(); }
if (failed.length) { console.error('Failed previews:', failed); process.exitCode = 1; }
