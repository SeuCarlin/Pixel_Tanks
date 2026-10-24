import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleAudio } from '../client/audio.js';
import { chooseBotTarget, createGame, sanitizeRules } from '../server/game.js';
import { CARD_ROLE_LABELS, CARD_SECTIONS, cardActivation, cardDamage, cardRole, searchableCard } from '../shared/card-catalog.js';
import { CLASS_DEFS } from '../shared/constants.js';

test('all published cards have a searchable role and activation, with damage derived from balance', () => {
  let total = 0;
  for (const [section, definitions] of Object.entries(CARD_SECTIONS)) for (const [type, info] of Object.entries(definitions)) {
    total += 1;
    assert.ok(CARD_ROLE_LABELS[cardRole(type)], `${section}:${type} has no role`);
    assert.ok(cardActivation(type, section), `${section}:${type} has no activation`);
    assert.ok(searchableCard(type, info).includes(info.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  }
  assert.equal(total, 81 + Object.keys(CLASS_DEFS).length);
  assert.equal(cardDamage('heavy'), '58–141 HP (CRÍT.)');
  assert.equal(cardDamage('zeus'), '40 + 40 HP');
  assert.equal(cardDamage('megaMissile'), 'ATÉ 145 HP');
  assert.equal(cardDamage('markerBomb'), '10 HP + 3 × 30 HP');
  assert.equal(cardActivation('harpoon', 'arsenal'), '2 ATIVAÇÕES • 1 MOVIMENTO');
});

test('a shared map seed reproduces terrain while player spawn assignments vary', () => {
  const makeRoom = () => ({ rules: sanitizeRules({ seed: 'mapa-amigos-42', mapType: 'islands', powerupCount: 4 }), players: [{ id: 'a', nickname: 'A' }, { id: 'b', nickname: 'B' }] });
  const first = createGame(makeRoom()); const second = createGame(makeRoom());
  assert.deepEqual(first.terrain.heights, second.terrain.heights);
  const slots = (game) => game.players.map(({ x, y }) => `${x},${y}`).sort();
  assert.deepEqual(slots(first), slots(second));
  const orders = new Set(Array.from({ length: 16 }, () => createGame(makeRoom()).players.map(({ x }) => x).join(',')));
  assert.ok(orders.size > 1, 'identical map seeds must not pin human and bot to the same slots');
  assert.deepEqual(first.powerups.map(({ type, x }) => [type, x]), second.powerups.map(({ type, x }) => [type, x]));
});

test('bot personalities choose distinct targets without changing aim difficulty', () => {
  const bot = { id: 'bot', x: 100, health: 100, team: 'red', personality: 'aggressive' };
  const near = { id: 'near', x: 240, health: 150, team: 'blue' };
  const weak = { id: 'weak', x: 420, health: 15, team: 'blue' };
  const game = { mode: 'teams', players: [bot, near, weak, { id: 'ally', x: 800, health: 100, team: 'red', alive: true }], objects: [{ type: 'building', x: 450, active: true }] };
  assert.equal(chooseBotTarget(game, bot, [near, weak]).id, 'weak');
  bot.personality = 'demolisher'; assert.equal(chooseBotTarget(game, bot, [near, weak]).id, 'weak');
  bot.personality = 'support'; assert.equal(chooseBotTarget(game, bot, [near, weak]).id, 'weak');
  bot.personality = 'defensive'; assert.equal(chooseBotTarget(game, bot, [near, weak]).id, 'near');
});

test('audio volume preferences are clamped and scoped to the selected group', () => {
  const audio = new BattleAudio();
  audio.setVolume('music', 0); audio.setVolume('effects', 2); audio.setVolume('interface', -.5);
  assert.deepEqual(audio.volumes, { music: 0, effects: 1, interface: 0 });
  audio.inGroup('music', () => assert.equal(audio.outputGroup, 'music'));
  assert.equal(audio.outputGroup, 'effects');
});
