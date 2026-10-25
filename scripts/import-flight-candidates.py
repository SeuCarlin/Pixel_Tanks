"""Prepare short missile-flight candidates from the user's D:/sons recordings.

Run: python scripts/import-flight-candidates.py D:/sons
Requires numpy and imageio-ffmpeg. These are audition samples; gameplay waits
for the player's sound selection before a flight cue is assigned.
"""

from __future__ import annotations

import argparse
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np


RATE = 22_050
DESTINATION = Path(__file__).resolve().parents[1] / "client" / "sounds"
CLIPS = [
    ("magiaz-missil-383791.mp3", "missile-flight-magiaz.wav", 0.55, 2.55),
    ("kalsstockmedia-fall-and-blast-sound-effect-282859.mp3", "missile-flight-fall.wav", 0.55, 2.55),
    ("worldlikeall-fiery-whistle-firework-missile-explodes-in-the-night-sky-258872.mp3", "missile-flight-firework.wav", 7.5, 9.5),
    ("singularitysmarauder-heavy-missile-launch-213841.mp3", "missile-flight-heavy.wav", 1.02, 2.25),
    ("u_886nnea2gb-sci-fi-cannon-firing-whoosh-after-fire-low-pitch-slight-reverb-204400.mp3", "missile-flight-scifi.wav", 0.25, 1.25),
]


def prepare(source: Path, start: float, end: float) -> np.ndarray:
    command = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-i", str(source), "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"]
    raw = subprocess.run(command, check=True, capture_output=True).stdout
    samples = np.frombuffer(raw, dtype="<f4").copy()[round(start * RATE):round(end * RATE)]
    if samples.size < RATE // 2:
        raise ValueError(f"Flight candidate too short: {source.name}")
    samples -= float(np.mean(samples))
    fade = min(round(RATE * .055), samples.size // 8)
    samples[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    samples[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    rms = float(np.sqrt(np.mean(samples * samples)))
    samples *= min(.075 / max(rms, .001), .68 / max(float(np.max(np.abs(samples))), .001))
    return samples


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    source_dir = parser.parse_args().source_dir
    for source_name, output_name, start, end in CLIPS:
        samples = prepare(source_dir / source_name, start, end)
        output = DESTINATION / output_name
        with wave.open(str(output), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes(np.round(np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        print(f"{output.name}: {samples.size / RATE:.2f} s; RMS {np.sqrt(np.mean(samples * samples)):.3f}")


if __name__ == "__main__":
    main()
