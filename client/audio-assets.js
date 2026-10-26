// Change this when replacing WAV files at the same paths. It makes browsers
// request the current sound pack after an update, including native iOS audio.
export const AUDIO_ASSET_VERSION = '20261025h';

// Confirmed in docs/SOUND_CHOICES_APPROVED.json. Resolve exactly once: a
// selection such as shot -> heavy means the original heavy.wav that was heard
// on the review page, regardless of the separate choice for the heavy cue.
const approvedSounds = {
  'missile-flight': 'approved-missile-flight',
  'guided-missile-flight': 'missile-flight-scifi',
  'firework-flight': 'missile-flight-firework',
  'ui-hover': 'ui',
  'ui-confirm': 'turn',
  'ui-cancel': 'ui',
  'ui-combo': 'power',
  shot: 'heavy',
  heavy: 'shot-ap',
  electric: 'approved-electric',
  vortex: 'approved-vortex',
  'propulsion-vortex': 'meteor',
  'vortex-deflect': 'shot-wind-plate',
  'vortex-fire': 'ambient-fire',
  'water-flow': 'ambient-water',
  'ice-break': 'explosion',
  'tree-break': 'explosion-mega',
  'shark-bite': 'approved-shark-bite',
  'laser-impact': 'approved-laser-impact',
  explosion: 'approved-explosion',
  'explosion-dry': 'explosion',
  'impact-concrete': 'explosion-rolling',
  'impact-fire': 'fireball-impact',
  'impact-ice': 'ambient-ice',
  'impact-wood': 'impact-earth',
  'impact-wind': 'approved-impact-wind',
  thunder: 'approved-electric',
  'ambient-breeze': 'ambient-wind',
  'ambient-rain': 'ambient-wind',
};

export const CUSTOM_SOUND_DURATIONS = {
  'approved-missile-flight': 1.75,
  'approved-electric': 4.8,
  'approved-vortex': 4.5,
  'approved-shark-bite': 3.4,
  'approved-laser-impact': 2.9,
  'approved-explosion': 3.5,
  'approved-impact-wind': 2.15,
};

export function selectedAudioKind(kind) { return approvedSounds[kind] || kind; }

export function rawAudioAssetUrl(kind, baseUrl) {
  const url = new URL(`./sounds/${kind}.wav`, baseUrl);
  url.searchParams.set('v', AUDIO_ASSET_VERSION);
  return url;
}

export function audioAssetUrl(kind, baseUrl) {
  return rawAudioAssetUrl(selectedAudioKind(kind), baseUrl);
}
