import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/harpoon-activation';
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
    state.actions = { movesLeft: 2, attackAvailable: true }; state.shotEndsAt = null; state.harpoonPull = null; state.arenaWarningUntil = 0;
    player.alive = true; player.x = 620; player.y = 440; player.motionState = 'airborne';
    player.airborne = { vx: 18, vy: 36, parachute: false, startY: 300, updatedAt: Date.now() };
    state.harpoonAnchor = { ownerId: player.id, x: 780, y: 520, readyAt: Date.now() - 1000 };
    window.__qaCommands = [];
    window.__qaNetwork.send = (type, payload) => window.__qaCommands.push({ type, payload: structuredClone(payload) });
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    document.activeElement?.blur();
  });
  await page.waitForTimeout(150);

  const expectPull = async (label, action) => {
    await action(); await page.waitForTimeout(80);
    const commands = await page.evaluate(() => structuredClone(window.__qaCommands));
    if (commands.length !== 1 || commands[0].type !== 'ACTIVATE_HARPOON') errors.push(`${label}: ${JSON.stringify(commands)}`);
    await page.evaluate(() => { window.__qaNetwork.emit('ERROR', { message: 'reiniciando QA' }); window.__qaCommands.length = 0; });
    return commands;
  };

  await page.locator('#weaponSelector [data-weapon="standard"]').click();
  const selected = await page.evaluate(() => JSON.parse(window.render_game_to_text()).arsenal.selected);
  if (selected !== 'standard') errors.push(`Could not select another action: ${selected}`);
  const buttonCommands = await expectPull('Fire button over selected weapon', () => page.locator('#fireButton').click());
  const enterCommands = await expectPull('Enter while airborne', () => page.keyboard.press('Enter'));
  const spaceCommands = await expectPull('Space while airborne', () => page.keyboard.press('Space'));

  const touchPoint = await page.evaluate(() => {
    const canvas = document.querySelector('#gameCanvas'); const rect = canvas.getBoundingClientRect();
    for (const py of [.35, .48, .62]) for (const px of [.28, .5, .72]) {
      const x = rect.left + rect.width * px; const y = rect.top + rect.height * py;
      if (document.elementFromPoint(x, y) === canvas) return { x, y };
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const touchCommands = await expectPull('Arena touch', () => page.touchscreen.tap(touchPoint.x, touchPoint.y));
  await page.waitForTimeout(3200);
  const ui = await page.evaluate(() => ({
    coach: document.querySelector('#aimCoach')?.textContent.replace(/\s+/g, ' ').trim(),
    fire: JSON.parse(window.render_game_to_text()).fire,
  }));
  if (!ui.coach?.includes('PUXAR CABO DO ARPÃO') || !ui.coach?.includes('Enter')) errors.push(`Harpoon coach: ${ui.coach}`);
  if (!ui.fire?.label?.includes('PUXAR')) errors.push(`Harpoon fire label: ${JSON.stringify(ui.fire)}`);
  await page.screenshot({ path: `${output}/harpoon-ready-mobile.png` });

  await writeFile(`${output}/results.json`, JSON.stringify({ selected, buttonCommands, enterCommands, spaceCommands, touchPoint, touchCommands, ui, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
