import { CLASS_DEFS, ARSENAL_DEFS } from './constants.js';
export const STARTER_CLASSES = ['armored', 'attacker', 'bomber', 'healer'];
export const STARTER_ARSENAL = ['heavy', 'cluster', 'jump', 'grenade', 'markerBomb', 'rescueFlare'];
const rows = [
  ['class','meteorologist','control','arsenal.zeus',8,5,900,'Condutor de tempestades','Use Zeus 8 vezes'],
  ['class','ninja','mobility','movement',5000,8,1400,'Passos nas sombras','Percorra 5.000 blocos'],
  ['class','saboteur','control','arsenal.mineLayer',12,6,1100,'Campo minado','Use o lança-minas 12 vezes'],
  ['class','backpacker','support','powerupUses',25,4,800,'Sempre preparado','Use 25 powerups'],
  ['class','incendiary','assault','arsenal.fireworks',15,6,1100,'Pavio aceso','Use fogos de artifício 15 vezes'],
  ['class','amphibian','mobility','arsenal.waterTorpedo',10,5,900,'Lobo dos mares','Use o Torpedo Triplo 10 vezes'],
  ['class','elementalist','control','arsenalUses',100,10,1800,'Mestre dos elementos','Use 100 habilidades de arsenal'],
  ['class','specialist','support','healingDone',500,7,1300,'Engenheiro de campo','Cure 500 HP de aliados'],
  ['arsenal','fireworks','assault','shots',15,2,180,'Primeiras faíscas','Dispare 15 vezes'],
  ['arsenal','zeus','control','damage',1000,3,400,'Alta voltagem','Cause 1.000 de dano'],
  ['arsenal','gravity','control','kills',12,5,800,'Peso da vitória','Elimine 12 tanques'],
  ['arsenal','mineLayer','control','destruction',300,2,250,'Armadilhas de campo','Some 300 pontos de destruição'],
  ['arsenal','moleBomb','control','destruction',1500,4,600,'Escavador','Some 1.500 pontos de destruição'],
  ['arsenal','armoredDash','mobility','movement',1500,3,350,'Motor aquecido','Percorra 1.500 blocos'],
  ['arsenal','verticalStrike','assault','shots',40,4,550,'Ataque pelo alto','Dispare 40 vezes'],
  ['arsenal','soapBomb','control','powerupUses',10,3,350,'Química de combate','Use 10 powerups'],
  ['arsenal','harpoon','mobility','movement',2500,4,500,'Alpinista','Percorra 2.500 blocos'],
  ['arsenal','sentry','support','kills',5,3,400,'Vigia','Elimine 5 tanques'],
  ['arsenal','spider','mobility','jumps',15,4,550,'Pelas paredes','Realize 15 saltos'],
  ['arsenal','droneStrike','assault','wins',5,6,900,'Comando aéreo','Vença 5 partidas'],
  ['arsenal','teslaOrb','control','arsenal.zeus',5,4,600,'Arcos em cadeia','Use Zeus 5 vezes'],
  ['arsenal','seismicCharge','assault','destruction',2500,5,750,'Abalo sísmico','Some 2.500 pontos de destruição'],
  ['arsenal','flyingHunter','assault','damage',2500,5,700,'Caçador dos céus','Cause 2.500 de dano'],
  ['arsenal','vitalRecycling','support','healed',500,5,700,'Segunda vida','Recupere 500 HP'],
  ['arsenal','superheat','assault','arsenal.grenade',15,4,600,'Forno de batalha','Lance 15 granadas'],
  ['arsenal','mixer','support','arsenalUses',60,7,1100,'Alquimista','Use 60 habilidades de arsenal'],
  ['arsenal','splitDamage','support','damageTaken',1500,4,600,'Compartilhar o peso','Resista a 1.500 de dano acumulado'],
  ['arsenal','waterHunter','mobility','arsenal.waterTorpedo',8,5,650,'Patrulha aquática','Use o Torpedo Triplo 8 vezes'],
  ['arsenal','waterMine','control','arsenal.mineLayer',8,4,500,'Porto protegido','Use o lança-minas 8 vezes'],
  ['arsenal','waterTorpedo','mobility','shots',25,3,350,'Três rotas','Dispare 25 vezes'],
  ['arsenal','windPlate','control','territoryCells',40,4,500,'Correntes de ar','Explore 40 setores'],
  ['arsenal','kineticCannon','assault','arsenal.heavy',20,4,550,'Força bruta','Use o obus 20 vezes'],
  ['arsenal','cryoMortar','control','arsenal.markerBomb',15,5,700,'Base glacial','Use a bomba marcadora 15 vezes'],
  ['arsenal','meteorSalvo','assault','destruction',4500,7,1200,'Chuva de meteoros','Some 4.500 pontos de destruição'],
  ['arsenal','blink','mobility','jumps',35,6,850,'Além do salto','Realize 35 saltos'],
  ['arsenal','healingDrone','support','healingDone',200,4,500,'Anjo mecânico','Cure 200 HP de aliados'],
  ['arsenal','plasmaCore','control','arsenal.zeus',15,7,1100,'Rede de plasma','Use Zeus 15 vezes'],
  ['arsenal','corrosionShell','assault','damage',5000,7,1000,'Corrosão','Cause 5.000 de dano'],
];
export const CARD_CHALLENGES = rows.map(([kind, card, branch, metric, target, level, price, title, description]) => ({ id: `${kind}:${card}`, kind, card, branch, metric, target, level, price, title, description, name: (kind === 'class' ? CLASS_DEFS : ARSENAL_DEFS)[card].name }));
export const metricValue = (totals, metric) => metric.split('.').reduce((value, key) => value?.[key], totals) || 0;
export function progressionState(account = {}) {
  const totals = account.totals || {}, stored = account.progression || {};
  const xp = stored.xp ?? (totals.matches || 0) * 100;
  const level = 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 150));
  const owned = new Set(stored.owned || []);
  const cards = CARD_CHALLENGES.map(card => {
    const current = metricValue(totals, card.metric), complete = current >= card.target;
    if (complete || level >= card.level) owned.add(card.id);
    return { ...card, current, percent: Math.min(100, Math.floor(current / card.target * 100)), levelPercent: Math.min(100, Math.floor(level / card.level * 100)), owned: owned.has(card.id), earnedBy: complete ? 'conquista' : level >= card.level ? 'nível' : owned.has(card.id) ? 'Battle Dots' : null };
  });
  return { xp, level, nextLevelXp: 150 * level * level, balance: stored.balance || 0, owned: [...owned], cards,
    classes: [...STARTER_CLASSES, ...cards.filter(c => c.owned && c.kind === 'class').map(c => c.card)],
    arsenal: [...STARTER_ARSENAL, ...cards.filter(c => c.owned && c.kind === 'arsenal').map(c => c.card)],
    percent: Math.floor((STARTER_CLASSES.length + STARTER_ARSENAL.length + owned.size) / (STARTER_CLASSES.length + STARTER_ARSENAL.length + CARD_CHALLENGES.length) * 100) };
}
export function matchRewards(metrics = {}, won = false) {
  const damage = Math.max(0, Number(metrics.damage) || 0), destruction = Math.max(0, Number(metrics.destruction) || 0), kills = Math.min(10, Math.max(0, Number(metrics.kills) || 0));
  return { dots: 40 + Math.min(80, Math.floor(damage / 20)) + Math.min(80, Math.floor(destruction / 25)) + kills * 15 + (won ? 60 : 0),
    xp: 50 + Math.min(300, Math.floor(damage / 10)) + Math.min(150, Math.floor(destruction / 10)) + kills * 25 + (won ? 100 : 0) };
}
