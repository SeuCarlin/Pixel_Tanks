"""Trim and level user-provided MP3 effects into the game's compact WAV format.

Usage: python scripts/import-local-sfx.py D:/sons
Requires: numpy and imageio-ffmpeg. The converted WAVs are committed; these
packages and the source MP3 files are not needed to play the game.
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np


RATE = 22_050
DESTINATION = Path(__file__).resolve().parents[1] / "client" / "sounds"

# source, destination cue, first second, last second, desired RMS, peak ceiling
# Repeated source files marked "(1)" have identical bytes; import each once.
SOUNDS = [
    ("11325622-sonic-boom-sound-effect-240487.mp3", "meteor", 0.0, 2.4, .085, .65),
    ("daviddumaisaudio-large-underwater-explosion-190270.mp3", "water-mine", .55, 2.8, .085, .65),
    ("dragon-studio-boom-425459.mp3", "explosion-heavy", 0.0, 1.85, .10, .67),
    ("dragon-studio-boom-425459.mp3", "bombardment-impact", .08, 1.45, .09, .64),
    ("dragon-studio-elemental-spell-impact-water-478377.mp3", "water-splash", 1.1, 2.85, .075, .60),
    ("floraphonic-liquid-whoosh-3-185332.mp3", "shot-elemental-water", .61, 1.7, .060, .55),
    ("flutie8211-gun-shot-and-echo-549910.mp3", "sentry-burst", 0.0, .23, .065, .55),
    ("flutie8211-ray-gun-blast-1-546936.mp3", "shot-tesla", .13, 1.28, .070, .58),
    ("flutie8211-ray-gun-blast-2-573561.mp3", "shot-zeus", 0.0, 1.38, .070, .58),
    ("freesound_community-071180_laser-gun-cannon-shotmp3-88117.mp3", "shot-laser", 0.0, 1.48, .075, .60),
    ("freesound_community-cannon-shot-14799.mp3", "shot", 0.0, 1.0, .075, .60),
    ("freesound_community-cannon-shot-6153.mp3", "shot-grenade", .18, 1.25, .075, .60),
    ("freesound_community-explosion-36210.mp3", "explosion-dry", .05, 1.38, .085, .64),
    ("freesound_community-explosion-47821.mp3", "explosion-rolling", .08, 2.48, .085, .65),
    ("freesound_community-explosion-47821.mp3", "bombardment-hit-v2", .08, 1.55, .09, .65),
    ("freesound_community-medium-explosion-40472.mp3", "explosion", .1, 1.5, .09, .65),
    ("freesound_community-mortar-96223.mp3", "bombardment-strike", 0.0, 1.4, .075, .60),
    ("lordsonny-plasma-gun-fire-162136.mp3", "shot-flame", .28, 1.5, .075, .60),
    ("magiazzz-cannon_shot_1-1782958714819-560881.mp3", "heavy", 0.0, 1.3, .085, .65),
    ("rescopicsound-elemental-magic-spell-cast-d-228349.mp3", "shot-elemental-earth", 1.08, 2.48, .065, .57),
    ("rescopicsound-elemental-magic-spell-impact-outgoing-228342.mp3", "impact-earth", 0.0, 1.3, .075, .60),
    ("ribhavagrawal-explosion-under-snow-sfx-230505.mp3", "impact-ice", .1, 1.4, .075, .60),
    ("snoops_audio-08-weaponry-ultra-heavy-cannon-b-343781.mp3", "shot-mega", 0.0, 1.05, .085, .65),
    ("snoops_audio-08-weaponry-ultra-heavy-cannon-c-343783.mp3", "shot-kinetic", 0.0, .82, .085, .65),
    ("soundtaker-heavy-shot-sound-477215.mp3", "shot-ap", .075, 1.35, .080, .62),
    ("u_886nnea2gb-sci-fi-cannon-firing-whoosh-after-fire-low-pitch-slight-reverb-204400.mp3", "shot-gravity", .12, 1.13, .065, .56),
    ("u_phmtspdc8p-blast-vibration-141530.mp3", "quake-impact", .18, 2.3, .075, .60),
    ("universfield-cannon-shot-352459.mp3", "shot-cluster", .1, 1.15, .075, .60),
    ("universfield-epic-cinematic-explosion-454857.mp3", "explosion-mega", .08, 2.2, .09, .67),
    ("voicebosch-the-moses-laser-cannon-182841.mp3", "laser-impact", 12.25, 13.95, .075, .60),
]

# Additional weapon launches are short pitch/length variants of the supplied
# recordings. Their cue names stay unique so each arsenal weapon remains clear.
DERIVED_SOUNDS = [
    ("shot-cluster", "shot-fireworks", 1.16),
    ("shot-zeus", "shot-vertical", 1.32),
    ("bombardment-strike", "shot-seismic", 1.4),
    ("shot-tesla", "shot-drone", 1.22),
    ("shot-kinetic", "shot-mole", .94),
    ("impact-ice", "shot-cryo", 1.4),
    ("shot-elemental-water", "shot-soap", 1.18),
    ("shot-ap", "shot-harpoon", 1.45),
    ("shot-flame", "shot-hunter", 1.15),
    ("shot-grenade", "shot-deploy", 1.3),
    ("bombardment-strike", "shot-marker", 1.25),
    ("shot-elemental-water", "shot-torpedo", 1.05),
    ("shot-gravity", "shot-wind-plate", 1.26),
    ("shot-mega", "shot-meteor", .98),
    ("shot-elemental-water", "shot-water-hunter", .84),
    ("shot-tesla", "shot-lightning-rod", .92),
    ("shot-grenade", "shot-mine", .9),
    ("shot-elemental-water", "shot-water-mine", .78),
    ("shot-elemental-earth", "shot-vital", 1.65),
]


def decode(path: Path, converter: str) -> np.ndarray:
    result = subprocess.run(
        [converter, "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-af", "highpass=f=35", "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
        check=True, capture_output=True,
    )
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def save_wav(path: Path, samples: np.ndarray) -> tuple[float, float]:
    pcm = np.round(np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(RATE)
        target.writeframes(pcm.tobytes())
    rms = float(np.sqrt(np.mean(samples * samples)))
    peak = float(np.max(np.abs(samples)))
    return rms, peak


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != RATE:
            raise ValueError(f"Unexpected WAV format: {path}")
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(np.float32) / 32768


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="directory containing the source MP3 files")
    args = parser.parse_args()
    converter = imageio_ffmpeg.get_ffmpeg_exe()
    missing = [source for source, *_ in SOUNDS if not (args.source / source).is_file()]
    if missing:
        raise SystemExit("Missing source files: " + ", ".join(missing))
    seen: dict[str, str] = {}
    for source, cue, start, end, target_rms, peak_ceiling in SOUNDS:
        path = args.source / source
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen and seen[digest] != source:
            raise SystemExit(f"Duplicate file under another name: {source}")
        seen[digest] = source
        decoded = decode(path, converter)
        segment = decoded[round(start * RATE):round(end * RATE)]
        if len(segment) < RATE // 10:
            raise SystemExit(f"Invalid trim: {source}")
        if cue == "sentry-burst":
            # One tiny muzzle crack, repeated at the five projectile beats.
            taps = np.zeros(round(.85 * RATE), dtype=np.float32)
            for index in range(5):
                offset = round(index * .14 * RATE)
                taps[offset:offset + len(segment)] += segment * (.83 ** index)
            segment = taps
        fade_in = min(round(.006 * RATE), len(segment) // 4)
        fade_out = min(round(.085 * RATE), len(segment) // 4)
        segment[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
        segment[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)
        peak = max(1e-8, float(np.max(np.abs(segment))))
        rms = max(1e-8, float(np.sqrt(np.mean(segment * segment))))
        gain = min(target_rms / rms, peak_ceiling / peak)
        segment *= gain
        rms, peak = save_wav(DESTINATION / f"{cue}.wav", segment)
        print(f"{cue:23} {len(segment)/RATE:4.2f}s RMS={rms:.3f} peak={peak:.3f}  <- {source}")
    for source_cue, cue, speed in DERIVED_SOUNDS:
        source = read_wav(DESTINATION / f"{source_cue}.wav")
        positions = np.arange(0, len(source) - 1, speed, dtype=np.float32)
        segment = np.interp(positions, np.arange(len(source)), source).astype(np.float32)
        fade_in = min(round(.006 * RATE), len(segment) // 4)
        fade_out = min(round(.085 * RATE), len(segment) // 4)
        segment[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
        segment[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)
        peak = max(1e-8, float(np.max(np.abs(segment))))
        rms = max(1e-8, float(np.sqrt(np.mean(segment * segment))))
        segment *= min(.075 / rms, .6 / peak)
        rms, peak = save_wav(DESTINATION / f"{cue}.wav", segment)
        print(f"{cue:23} {len(segment)/RATE:4.2f}s RMS={rms:.3f} peak={peak:.3f}  <- {source_cue} at {speed:.2f}x")
    # Fireworks use twelve tiny cuts from the supplied dry explosion instead
    # of one large blast, matching the twelve projectiles in gameplay.
    explosion = read_wav(DESTINATION / "explosion-dry.wav")[:round(.15 * RATE)]
    fireworks = np.zeros(round(1.4 * RATE), dtype=np.float32)
    for index in range(12):
        speed = 1.05 + (index % 4) * .12
        positions = np.arange(0, len(explosion) - 1, speed, dtype=np.float32)
        tap = np.interp(positions, np.arange(len(explosion)), explosion).astype(np.float32)
        offset = round((index * .105 + index % 3 * .009) * RATE)
        fireworks[offset:offset + len(tap)] += tap * (1 - index * .025)
    fireworks[-round(.085 * RATE):] *= np.linspace(1, 0, round(.085 * RATE), dtype=np.float32)
    peak = max(1e-8, float(np.max(np.abs(fireworks))))
    rms = max(1e-8, float(np.sqrt(np.mean(fireworks * fireworks))))
    fireworks *= min(.085 / rms, .63 / peak)
    rms, peak = save_wav(DESTINATION / "explosion-fireworks.wav", fireworks)
    print(f"{'explosion-fireworks':23} {len(fireworks)/RATE:4.2f}s RMS={rms:.3f} peak={peak:.3f}  <- 12 cuts of explosion-dry")


if __name__ == "__main__":
    main()
