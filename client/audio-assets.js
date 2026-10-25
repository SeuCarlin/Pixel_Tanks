// Change this when replacing WAV files at the same paths. It makes browsers
// request the current sound pack after an update, including native iOS audio.
export const AUDIO_ASSET_VERSION = '20261025d';

export function audioAssetUrl(kind, baseUrl) {
  const url = new URL(`./sounds/${kind}.wav`, baseUrl);
  url.searchParams.set('v', AUDIO_ASSET_VERSION);
  return url;
}
