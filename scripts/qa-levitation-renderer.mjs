import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = 'output/web-game/harpoon-bubble-frozen/renderer';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(process.env.QA_URL || 'http://localhost:3001', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { Renderer } = await import('/renderer.js');
    const now = Date.now();
    const player = { id: 'floating-target', x: 450, y: 310, renderX: 450, renderY: 310, targetX: 450, targetY: 310, airborne: { vx: 0, vy: -80 }, supportPlatformId: null, facing: 1, color: '#68d8ff', health: 150, shieldCharges: 0, frozenTurns: 0, armorFractureTurns: 0, invisibleTurns: 0, alive: true, visualAlive: true };
    const bubble = { id: 'bubble-qa', playerId: player.id, impactAt: now - 1000, executeAt: now + 4000, x: 450, y: 150, phase: 1 };
    const renderer = Object.create(Renderer.prototype);
    renderer.serverClockOffset = 0;
    renderer.game = { serverTime: now, soapBubbles: [bubble], harpoonPull: null, players: [player], terrain: { floatingPlatforms: [] } };
    renderer.visualPlayers = new Map([[player.id, player]]);
    renderer.terrainHeights = Array(5600).fill(320);
    renderer.camera = { x: 0, y: 0, zoom: 1 };
    renderer.addParticle = () => {};
    renderer.spawnDust = () => {};
    renderer.spawnTrackDust = () => {};
    let falseLandings = 0;
    renderer.spawnLandingEffect = () => { falseLandings += 1; };
    renderer.syncPlayers([{ ...player, x: 450, y: 150, airborne: null }], false, renderer.game);
    for (let frame = 0; frame < 60; frame += 1) renderer.updatePlayers(1 / 60);
    const bubbleY = player.renderY;
    if (bubbleY > 180 || falseLandings !== 0) throw new Error(`bubble failed to lift visually: y=${bubbleY}, landings=${falseLandings}`);

    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 520;
    canvas.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:900px;height:520px;image-rendering:pixelated';
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#153047'; ctx.fillRect(0, 0, 900, 520);
    ctx.fillStyle = '#263b48'; ctx.fillRect(0, 320, 900, 200);
    ctx.fillStyle = '#809e72'; ctx.fillRect(0, 320, 900, 5);
    renderer.drawTank(ctx, player, false, performance.now());
    renderer.drawSoapBubbles(ctx, performance.now());
    canvas.id = 'qa-flight-canvas';
    document.body.append(canvas);

    renderer.game.soapBubbles = [];
    renderer.game.harpoonPull = { playerId: player.id, fromX: 450, fromY: 150, toX: 130, toY: 100 };
    player.targetX = 130; player.targetY = 100;
    for (let frame = 0; frame < 60; frame += 1) renderer.updatePlayers(1 / 60);
    const pulledY = player.renderY;
    if (pulledY > 125) throw new Error(`harpoon pull snapped to ground: y=${pulledY}`);
    window.__qaFlightRenderer = renderer;
    return { bubbleY, pulledY, falseLandings };
  });
  await page.screenshot({ path: `${destination}/bubble-lift.png` });
  await page.evaluate(() => {
    const renderer = window.__qaFlightRenderer;
    const target = renderer.visualPlayers.get('floating-target');
    target.renderX = 350; target.renderY = 150;
    const owner = { id: 'owner', renderX: 100, renderY: 100, targetX: 100, targetY: 100, x: 100, y: 100, facing: 1, color: '#e9a659', alive: true, visualAlive: true };
    renderer.visualPlayers.set(owner.id, owner);
    renderer.game.players.push(owner);
    renderer.game.harpoonPull = { ...renderer.game.harpoonPull, ownerId: owner.id, targetPlayerId: target.id, anchorX: 450, anchorY: 150, startedAt: Date.now() - 260, endsAt: Date.now() + 260 };
    const canvas = document.querySelector('#qa-flight-canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#153047'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#263b48'; ctx.fillRect(0, 320, canvas.width, 200);
    ctx.fillStyle = '#809e72'; ctx.fillRect(0, 320, canvas.width, 5);
    renderer.drawTank(ctx, owner, false, performance.now());
    renderer.drawTank(ctx, target, false, performance.now());
    renderer.drawHarpoonCable(ctx, performance.now());
  });
  await page.screenshot({ path: `${destination}/enemy-pull.png` });
  await writeFile(`${destination}/state.json`, JSON.stringify(result, null, 2));
  await writeFile(`${destination}/errors.json`, JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
