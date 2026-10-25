"""Import the player's confirmed local sound choices as compact game WAVs.

Run: python scripts/import-approved-sfx.py D:/sons
Requires numpy and imageio-ffmpeg. Source MP3 hashes are checked against
docs/SOUND_CHOICES_APPROVED.json before any output is written.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RATE = 22_050
# Keep the audible event and trim only its trailing silence. Thunder and
# electric share one source because the player selected the same MP3 for both.
# Propulsion reuses meteor.wav from import-local-sfx.py: both were selected
# from 11325622-sonic-boom-sound-effect-240487.mp3.
CLIPS = {
    "missile-flight": ("approved-missile-flight", 0.0, 1.75, .065),
    "electric": ("approved-electric", 0.0, 4.8, .075),
    "vortex": ("approved-vortex", 0.0, 4.5, .075),
    "shark-bite": ("approved-shark-bite", 0.0, 3.4, .085),
    "laser-impact": ("approved-laser-impact", 0.0, 2.9, .08),
    "explosion": ("approved-explosion", 0.0, 3.5, .09),
    "impact-wind": ("approved-impact-wind", 0.0, 2.15, .075),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    source_dir = parser.parse_args().source_dir
    choices = json.loads((ROOT / "docs/SOUND_CHOICES_APPROVED.json").read_text(encoding="utf-8"))["selections"]
    for choice in choices.values():
        if choice["option"] != "ARQUIVO":
            continue
        source = source_dir / choice["fileName"]
        if source.stat().st_size != choice["fileSize"] or hashlib.sha256(source.read_bytes()).hexdigest() != choice["sha256"]:
            raise ValueError(f"Source file mismatch: {source}")
    decoded: list[tuple[str, str, np.ndarray]] = []
    for kind, (output_name, start, end, target_rms) in CLIPS.items():
        choice = choices[kind]
        source = source_dir / choice["fileName"]
        command = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-i", str(source),
                   "-af", "highpass=f=35", "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"]
        samples = np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype="<f4").copy()
        samples = samples[round(start * RATE):round(end * RATE)]
        if samples.size < RATE // 4:
            raise ValueError(f"Sound too short: {source}")
        samples -= float(np.mean(samples))
        fade = min(round(RATE * .035), samples.size // 8)
        samples[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
        samples[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
        rms = float(np.sqrt(np.mean(samples * samples)))
        peak = float(np.max(np.abs(samples)))
        samples *= min(target_rms / max(rms, .001), .68 / max(peak, .001))
        decoded.append((kind, output_name, samples))
    for kind, output_name, samples in decoded:
        destination = ROOT / "client/sounds" / f"{output_name}.wav"
        with wave.open(str(destination), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(np.round(np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        print(f"{kind}: {destination.name} ({len(samples) / RATE:.2f} s)")


if __name__ == "__main__":
    main()
