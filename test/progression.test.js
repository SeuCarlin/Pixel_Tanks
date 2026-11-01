import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountStore } from '../server/accounts.js';
import { RoomManager } from '../server/rooms.js';
import { CLASS_DEFS, SELECTABLE_ARSENAL_ITEMS } from '../shared/constants.js';
import { CARD_CHALLENGES, STARTER_CLASSES, STARTER_ARSENAL, progressionState, matchRewards } from '../shared/progression.js';

test('every class and arsenal card has a starter grant or a reachable challenge', () => {
  assert.deepEqual(new Set([...STARTER_CLASSES,...CARD_CHALLENGES.filter(c=>c.kind==='class').map(c=>c.card)]),new Set(Object.keys(CLASS_DEFS)));
  assert.deepEqual(new Set([...STARTER_ARSENAL,...CARD_CHALLENGES.filter(c=>c.kind==='arsenal').map(c=>c.card)]),new Set(SELECTABLE_ARSENAL_ITEMS));
  assert.equal(new Set(CARD_CHALLENGES.map(c=>c.id)).size,CARD_CHALLENGES.length);
  const initial=progressionState(); assert.deepEqual(initial.classes,STARTER_CLASSES); assert.deepEqual(initial.arsenal,STARTER_ARSENAL);
  for(const card of CARD_CHALLENGES){assert.ok(card.target>0&&card.price>0&&card.level>1); if(card.metric.startsWith('arsenal.'))assert.notEqual(card.metric.split('.')[1],card.card);}
});
test('themed challenges and level thresholds independently unlock permanent collection cards', () => {
  const challenge=progressionState({totals:{arsenal:{zeus:8}},progression:{xp:0}});
  assert.ok(challenge.classes.includes('meteorologist')); assert.equal(challenge.cards.find(c=>c.id==='class:meteorologist').percent,100);
  const halfway=progressionState({totals:{arsenal:{zeus:4}},progression:{xp:0}});
  assert.equal(halfway.cards.find(c=>c.id==='class:meteorologist').percent,50);
  assert.ok(progressionState({progression:{xp:7350}}).classes.includes('ninja'));
});
test('server rejects locked classes and arsenal even when a client bypasses the picker', () => {
  const rooms=new RoomManager({collectionFor:()=>progressionState()}),socket={};
  const {room}=rooms.create(socket,{rules:{maxPlayers:2,botCount:1}});
  assert.throws(()=>rooms.setClass(room.code,socket.playerId,'ninja'),/conquistas/);
  assert.throws(()=>rooms.setArsenal(room.code,socket.playerId,['heavy','jump','plasmaCore']),/oferecidas/);
  rooms.setClass(room.code,socket.playerId,'attacker'); rooms.setArsenal(room.code,socket.playerId,['heavy','jump','cluster']);
});
test('rematch preparation refreshes cards unlocked after the previous match', () => {
  const account={progression:{xp:0,owned:[]}},rooms=new RoomManager({collectionFor:()=>progressionState(account)}),socket={};
  const {room}=rooms.create(socket,{rules:{botCount:1}});
  assert.ok(!room.players[0].classOffer.includes('ninja'));
  account.progression.owned.push('class:ninja','arsenal:plasmaCore');
  rooms.publicRoom(room);
  rooms.setClass(room.code,socket.playerId,'ninja');
  rooms.setArsenal(room.code,socket.playerId,['heavy','jump','plasmaCore']);
});
test('Battle Dots, XP, purchases and match deduplication survive restart beyond visible history', () => {
  const dir=mkdtempSync(path.join(os.tmpdir(),'tank-progression-')),file=path.join(dir,'accounts.json');
  try{
    const store=new AccountStore(file),{token}=store.register('ProgressQA','Test-password-123'),account=store.accountForToken(token);
    const room={players:[{id:'human',accountId:account.id,team:'humans'}],game:{mode:'ffa',winner:'human'}};
    const result=id=>({matchId:id,endedAt:Date.now(),players:[{playerId:'human',classType:'armored',metrics:{damage:100,shots:1},medals:[]}]});
    const reward=matchRewards({damage:100,shots:1},true);
    store.recordMatch(room,result('first')); assert.equal(store.profile(account).progression.balance,reward.dots);
    for(let i=0;i<31;i++)store.recordMatch(room,result(`more-${i}`));
    const before=store.profile(account).progression.balance;
    assert.equal(store.recordMatch(room,result('first')),false);assert.equal(store.profile(account).progression.balance,before);
    // A high-level account can buy a card whose challenge and level are still unmet.
    const card=CARD_CHALLENGES.find(c=>c.id==='class:elementalist');
    account.progression.xp=0; account.progression.owned=[]; account.totals.arsenalUses=0;
    assert.throws(()=>store.purchase(account,'invalid'),/inexistente/);
    const profile=store.purchase(account,card.id); assert.ok(profile.progression.classes.includes('elementalist'));
    assert.equal(profile.progression.balance,before-card.price);
    assert.throws(()=>store.purchase(account,card.id),/liberada/);
    const restored=new AccountStore(file);assert.ok(restored.profile(restored.accountForToken(token)).progression.classes.includes('elementalist'));
    account.progression.balance=0; assert.throws(()=>store.purchase(account,'class:ninja'),/insuficientes/);
    room.game.debugMode=true; const matches=account.totals.matches; assert.equal(store.recordMatch(room,result('debug')),false);assert.equal(account.totals.matches,matches);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
