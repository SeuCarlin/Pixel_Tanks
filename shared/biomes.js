export const BIOMES = Object.freeze({
  flat: { name: 'Cidade', signature: 'building', event: 'collapse', sky: ['#101b2c', '#527e9f'], soil: ['#68716d', '#535f63', '#414e55', '#35444e', '#293844', '#20303d'], surface: '#a5b5a0' },
  hills: { name: 'Geleira', signature: 'concrete', event: 'luckyWinds', sky: ['#0c1930', '#81bbd5'], soil: ['#a7c6ca', '#7eaab7', '#638eaa', '#4e738d', '#385a77', '#294765'], surface: '#e0f5ed' },
  highlands: { name: 'Vulcão', signature: 'fuelTank', event: 'eruption', sky: ['#210e1e', '#9b665f'], soil: ['#875f50', '#734a43', '#633a3f', '#4e303c', '#3b2939', '#2a2433'], surface: '#cf9862' },
  platforms: { name: 'Usina', signature: 'radar', event: 'lightning', sky: ['#0b1830', '#5e9ea9'], soil: ['#5c817c', '#49736f', '#3d615f', '#314f52', '#29434c', '#20343f'], surface: '#a1d1a6' },
  canyon: { name: 'Cânion', signature: 'crane', event: 'tectonic', sky: ['#241420', '#c08b6e'], soil: ['#a77259', '#8a5d4c', '#714c43', '#59403e', '#44353b', '#322c38'], surface: '#e0b37b' },
  islands: { name: 'Base Aérea', signature: 'launcher', event: 'supply', sky: ['#0b172a', '#6ea8c5'], soil: ['#717f76', '#5d6f70', '#495e66', '#394d5b', '#2c4050', '#213344'], surface: '#b8c89e' },
  archipelago: { name: 'Arquipélago', signature: 'launcher', event: 'flood', sky: ['#0c2540', '#76b8cc'], soil: ['#a69065', '#897b5b', '#6d705c', '#50645e', '#3b555b', '#294550'], surface: '#d9c591' },
});
