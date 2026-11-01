import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
const url = process.argv[2];
if (!url) throw new Error('Pass the standalone URL');
const output = `output/web-game/local-multiplayer${process.env.QA_BROWSER === 'webkit' ? '-webkit' : ''}`; await mkdir(output, { recursive: true });
const browser = await (process.env.QA_BROWSER === 'webkit' ? webkit : chromium).launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' });
await context.addInitScript(() => localStorage.setItem('tankTutorialSeen', '1'));
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
try {
  await page.goto(url); await page.locator('#audioPromptEnable').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.ready);
  await page.evaluate(async () => {
    const { BattleAudio } = await import('./audio.js');
    const button = document.createElement('button'); button.id = 'qaAudioStart'; button.textContent = 'Audio QA';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
    button.onclick = () => { window.qaAudio = new BattleAudio(); window.qaAudio.activate(false); };
    document.body.append(button);
  });
  await page.locator('#qaAudioStart').click();
  await page.waitForFunction(() => window.qaAudio?.isReady());
  await page.locator('#qaAudioStart').evaluate(button => button.remove());
  // Play every packaged cue through an unlocked mobile context, without new gestures.
  const audioCheck = await page.evaluate(async () => {
    const { SOUND_PRESETS } = await import('./mobile-audio.js');
    const audio = window.qaAudio;
    const kinds = Object.keys(SOUND_PRESETS).filter(kind => kind !== 'music');
    // This Windows WebKit build has no Web Audio implementation; do not claim
    // mixer validation there. Chromium mobile validates the full sample pack.
    if (!audio.context) {
      audio.mobile.stop();
      return { total: 0, starts: 0, failed: [], silent: [], state: 'not tested: AudioContext unavailable in this WebKit build' };
    }
    await Promise.all(kinds.map(kind => audio.loadSample(kind)));
    audio.mobile.channels.forEach(channel => { channel.busyUntil = Infinity; channel.priority = 99; });
    let starts = 0;
    const createSource = audio.context.createBufferSource.bind(audio.context);
    audio.context.createBufferSource = () => { const source = createSource(); const start = source.start.bind(source); source.start = (...args) => { starts++; start(...args); }; return source; };
    const failed = kinds.filter(kind => !audio.playMobile(kind, 'effects', 0, 1, .02));
    const silent = kinds.filter(kind => { const buffer = audio.sampleBuffers.get(kind); if (!buffer) return true; return !buffer.getChannelData(0).some(value => Math.abs(value) > .005); });
    audio.stopAmbient();
    return { total: kinds.length, starts, failed, silent, state: audio.context.state };
  });
  assert.deepEqual(audioCheck.failed, []); assert.deepEqual(audioCheck.silent, []); assert.equal(audioCheck.starts, audioCheck.total);
  await page.locator('#createForm [name="nickname"]').fill('Carlos');
  await page.locator('#createForm [name="localPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('0');
  await page.locator('#createForm button[type="submit"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).lobbyPlayers?.length === 2);
  const humans = (await state()).lobbyPlayers.map(player => player.id);
  for (let index = 0; index < 2; index++) {
    assert.equal((await state()).localPlayerId, humans[index]);
    await page.locator('#arsenalButton').click();
    await page.locator(`#classCatalog [data-class-type="${index ? 'attacker' : 'armored'}"]`).click();
    await page.waitForTimeout(650);
    assert.ok(await page.locator('#classNext').evaluate(button => button.classList.contains('prep-beacon')));
    await page.locator('#classNext').click();
    for (const type of index ? ['heavy','jump','grenade'] : ['cluster','markerBomb','rescueFlare']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
    await page.locator('#arsenalSave').click();
    await page.waitForFunction(() => document.querySelector('#startButton').classList.contains('prep-beacon'));
    await page.waitForTimeout(650);
    const readyRect = await page.locator('#startButton').boundingBox();
    assert.ok(readyRect.y >= 0 && readyRect.y + readyRect.height <= 410, 'Ready should scroll into the mobile viewport');
    await page.screenshot({ path: `${output}/ready-player-${index + 1}.png` });
    await page.locator('#startButton').click();
    if (!index) await page.waitForFunction(id => JSON.parse(window.render_game_to_text()).localPlayerId !== id, humans[0]);
  }
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 60000 });
  await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.localPlayerId === s.currentPlayerId; });
  const first = await state();
  await page.screenshot({ path: `${output}/shared-turn.png` });
  assert.notEqual(first.players[0].classType, first.players[1].classType);
  await context.setOffline(true);
  await page.locator('#passButton').click();
  await page.waitForFunction(id => { const s = JSON.parse(window.render_game_to_text()); return s.localPlayerId !== id && s.localPlayerId === s.currentPlayerId; }, first.localPlayerId);
  const second = await state(); assert.notEqual(second.localPlayerId, first.localPlayerId);
  await page.locator('#passButton').click();
  await page.waitForFunction(id => { const s = JSON.parse(window.render_game_to_text()); return s.localPlayerId === id && s.currentPlayerId === id; }, first.localPlayerId);
  await page.waitForFunction(() => !document.querySelector('#fireButton').disabled);
  await page.locator('#fireButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shots.length > 0);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/validation.json`, JSON.stringify({ audioCheck, turn: (await state()).turn, passed: true }, null, 2));
  console.log(JSON.stringify({ passed: true, audioCheck, turns: (await state()).turn }));
} catch (error) { await page.screenshot({ path: `${output}/failure.png` }); console.error(JSON.stringify({ errors, state: await state().catch(() => null) })); throw error; }
finally { await browser.close(); }
