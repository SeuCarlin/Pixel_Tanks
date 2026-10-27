"""Import the cues selected on 2026-10-26 from D:/sons.

Usage: python scripts/import-selected-sfx.py D:/sons
The hashes pin the imported WAVs to the player's exact source files.
"""

import argparse
import hashlib
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RATE = 22050
# cue: source, first second, last second, target RMS, source SHA-256
CLIPS = {
    "shot-standard-user": ("dragon-studio-boom-425459.mp3", 0, 1.65, .085, "288457b2f6f6adf58654cdc0d13c39f41041a9644cb1be0f77b931b9067369a2"),
    "shot-standard-alt-user": ("universfield-epic-cinematic-explosion-454857.mp3", 0, 1.65, .085, "29004b4e798fe96fc24fa9057dbc310cba1d982d7d14a51257f01ea53c38905a"),
    "sabotage-pulse": ("flutie8211-ray-gun-blast-1-546936.mp3", 0, 2.15, .08, "e0d2cae348336730eb22df0103b12a5e31bc770914359de9ecad69d366d50313"),
    "vortex-end": ("fnx_sound-futuristic-alien-resonance-287308.mp3", 1.15, 3.7, .075, "9c7fb712136ed77b688a5cd770f4e62aadc1761c3b24bce4a9ba65b7f831e047"),
    "impact-tank-standard": ("freesound_community-explosion-47821.mp3", 0, 2.55, .09, "c0c9bc1f9aae383a87dd2dc63b68d8c6e1cbc7b0fbcfd75fc64b069987c29eb2"),
    "impact-tank-ap": ("ribhavagrawal-explosion-under-snow-sfx-230505.mp3", 0, 1.55, .09, "3342809e1d41dd98b08711a28e7627aa088f96e0a5fb4ddd318b394b3b239fb5"),
    "impact-tank-heavy": ("soundtaker-heavy-shot-sound-477215.mp3", 0, 2.65, .095, "0f2cc2e6afeecfbbc4fd71976b772fe710c204285de0b817d224805adf96aa61"),
    "jump-user": ("u_886nnea2gb-sci-fi-cannon-firing-whoosh-after-fire-low-pitch-slight-reverb-204400.mp3", 0, 1.15, .08, "f208a8665d94f2124a6a9f8018502656d6915765b02f113655c06937593cf188"),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    source_dir = parser.parse_args().source_dir
    for cue, (filename, start, end, target_rms, expected_hash) in CLIPS.items():
        source = source_dir / filename
        if hashlib.sha256(source.read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f"Source file changed: {source}")
        command = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-i", str(source),
                   "-af", "highpass=f=35", "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"]
        samples = np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype="<f4").copy()
        samples = samples[round(start * RATE):round(end * RATE)]
        samples -= float(np.mean(samples))
        fade = min(round((.12 if cue == "vortex-end" else .055) * RATE), len(samples) // 6)
        samples[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
        samples[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
        rms = float(np.sqrt(np.mean(samples * samples)))
        peak = float(np.max(np.abs(samples)))
        samples *= min(target_rms / max(rms, .001), .72 / max(peak, .001))
        destination = ROOT / "client/sounds" / f"{cue}.wav"
        with wave.open(str(destination), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(np.round(np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        print(f"{cue}: {len(samples) / RATE:.2f}s")


if __name__ == "__main__":
    main()
