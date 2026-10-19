import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/parachute-input';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(process.env.QA_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { GameNetwork } = await import('/network.js');
    const { Renderer } = await import('/renderer.js');
    const originalSetGame = Renderer.prototype.setGame;
    Renderer.prototype.setGame = function (...args) { window.__qaRenderer = this; return originalSetGame.apply(this, args); };
    const originalEmit = GameNetwork.prototype.emit;
    GameNetwork.prototype.emit = function (type, detail) {
      window.__qaNetwork = this;
      if (type === 'GAME_STATE') {
        if (window.__qaFrozen && !window.__qaInjecting) return;
        window.__qaLatestState = structuredClone(detail);
      }
      return originalEmit.call(this, type, detail);
    };
  });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 25000 });
  if (await page.locator('#trainingClose').isVisible()) await page.locator('#trainingClose').click();

  await page.evaluate(() => {
    window.__qaFrozen = true;
    const state = structuredClone(window.__qaLatestState);
    const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    state.turnIndex = state.players.indexOf(player); state.roundNumber = 2; state.openingRestrictionsActive = false;
    state.actions = { movesLeft: 2, attackAvailable: true }; state.shotEndsAt = null; state.harpoonAnchor = null; state.harpoonPull = null; state.arenaWarningUntil = 0;
    player.alive = true; player.x = 620; player.y = 440; player.motionState = 'airborne'; player.airborne = { vx: 24, vy: 42, parachute: false, startY: 300, updatedAt: Date.now() };
    window.__qaCommands = [];
    window.__qaNetwork.send = (type, payload) => window.__qaCommands.push({ type, payload: structuredClone(payload) });
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    document.activeElement?.blur();
  });
  await page.waitForTimeout(150);

  const before = await page.evaluate(() => ({
    text: JSON.parse(window.render_game_to_text()),
    coach: document.querySelector('#aimCoach')?.textContent.replace(/\s+/g, ' ').trim(),
  }));
  if (before.text.arsenal.selected !== null) errors.push(`Expected no selected card after jump, got ${before.text.arsenal.selected}`);
  if (!before.coach?.includes('Espaço') || !before.coach?.includes('toque')) errors.push(`Missing parachute input hint: ${before.coach}`);

  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  const keyboardCommands = await page.evaluate(() => structuredClone(window.__qaCommands));
  if (keyboardCommands.length !== 1 || keyboardCommands[0].type !== 'USE_ARSENAL' || keyboardCommands[0].payload?.type !== 'parachute') {
    errors.push(`Space command: ${JSON.stringify(keyboardCommands)}`);
  }

  await page.evaluate(() => { window.__qaCommands.length = 0; });
  await page.locator('#weaponSelector [data-weapon="standard"]').click();
  const touchPoint = await page.evaluate(() => {
    const canvas = document.querySelector('#gameCanvas'); const rect = canvas.getBoundingClientRect();
    for (const py of [.35, .48, .62]) for (const px of [.28, .5, .72]) {
      const x = rect.left + rect.width * px; const y = rect.top + rect.height * py;
      if (document.elementFromPoint(x, y) === canvas) return { x, y };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.tap(touchPoint.x, touchPoint.y);
  await page.waitForTimeout(80);
  const touchCommands = await page.evaluate(() => structuredClone(window.__qaCommands));
  if (touchCommands.length !== 1 || touchCommands[0].type !== 'USE_ARSENAL' || touchCommands[0].payload?.type !== 'parachute') {
    errors.push(`Touch command with another card selected: ${JSON.stringify(touchCommands)}`);
  }

  await page.evaluate(() => {
    const state = structuredClone(window.__qaLatestState); const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    player.airborne.parachute = true; player.airborne.vx = 0; player.airborne.vy = 28;
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${output}/parachute-open-mobile.png` });
  const after = await page.evaluate(() => ({
    text: JSON.parse(window.render_game_to_text()),
    coach: document.querySelector('#aimCoach')?.textContent.replace(/\s+/g, ' ').trim(),
  }));
  const local = after.text.players.find((entry) => entry.id === after.text.localPlayerId);
  if (!local?.airborne?.parachute || !after.coach?.includes('A/D')) errors.push(`Open parachute state: ${JSON.stringify({ local, coach: after.coach })}`);

  await writeFile(`${output}/results.json`, JSON.stringify({ before, keyboardCommands, touchPoint, touchCommands, after, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
