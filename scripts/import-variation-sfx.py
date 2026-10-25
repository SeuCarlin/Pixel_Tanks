"""Import short, level-matched local cues for shots and arena events.

Usage: python scripts/import-variation-sfx.py D:/sons
The source hashes pin this sound pack to the recordings supplied by the player.
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
# destination: source, trim start/end in seconds, target RMS, expected SHA-256
CLIPS = {
    "shot-alt-a": ("freesound_community-cannon-shot-14799.mp3", 0, 1.65, .075, "0f02ab885e3f8ffc30a9c45801215caa36489e3356b5407d403b11852aa474ca"),
    "shot-alt-b": ("universfield-cannon-shot-352459.mp3", 0, 1.9, .075, "798dfa1a4e6dff4d07ef87cfed7cafef0c35e730be2b2d4783e97e4589ed137c"),
    "impact-alt-a": ("freesound_community-explosion-36210.mp3", 0, 1.9, .085, "62a7abecfaa27b261e1c975e8aa61d31ddc811007c8da852a05b9f5f41538f91"),
    "impact-alt-b": ("freesound_community-medium-explosion-40472.mp3", 0, 1.7, .09, "62394a4fb8554b89e4fa830caf9b84bc2b6a0e0a42f9acc3180531b1a46ce32e"),
    "helicopter-pass": ("11325622-helicopter-sound-effect-241421.mp3", 2, 4.5, .07, "c9297497823eae4254a575b86318f98e1c8ba0d2d36fe476679063ef766ef900"),
    "holy-revival": ("dragon-studio-holy-spell-cast-450460.mp3", 0, 2.8, .075, "7827a9ecaeae030b4dfa5d0b5ee85b71805337486de7d22e3602165e24ebd11c"),
    "thunder-roll": ("soundreality-thunder-sound-375727.mp3", 0, 2.7, .065, "2cdc2246c2740da40cb6a5c8984f79fdc4c9ca7dd310766af75ddf9592d03033"),
    "thunder-clap": ("u_q2hb2391vb-thunder-clap-521194.mp3", 0, 2.2, .085, "51b7b8fe3d2550bd8c1459213c720870e0fa90faf0850f41465d13037b7bfde5"),
    "thunder-anime": ("lordsonny-thunder-for-anime-161022.mp3", 0, 2.6, .07, "81bbcde5e0e13c78d74b224e7af825a62d1eade2f64bbbd91a3dce33cf2906f8"),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    source_dir = parser.parse_args().source_dir
    for destination, (filename, start, end, target_rms, expected_hash) in CLIPS.items():
        source = source_dir / filename
        if hashlib.sha256(source.read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f"Source file changed: {source}")
        command = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-i", str(source),
                   "-af", "highpass=f=35", "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"]
        samples = np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype="<f4").copy()
        samples = samples[round(start * RATE):round(end * RATE)]
        samples -= float(np.mean(samples))
        fade_time = .35 if destination == "helicopter-pass" else .18 if destination.startswith("thunder-") else .12 if destination == "holy-revival" else .055
        fade = min(round(fade_time * RATE), len(samples) // 6)
        samples[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
        samples[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
        rms = float(np.sqrt(np.mean(samples * samples)))
        peak = float(np.max(np.abs(samples)))
        samples *= min(target_rms / max(rms, .001), .7 / max(peak, .001))
        output_path = ROOT / "client/sounds" / f"{destination}.wav"
        with wave.open(str(output_path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(np.round(np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        print(f"{destination}: {len(samples) / RATE:.2f}s")


if __name__ == "__main__":
    main()
