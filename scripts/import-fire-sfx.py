"""Import the user's three new fire recordings as short, level-matched game cues.

Usage: python scripts/import-fire-sfx.py D:/sons
The original MP3 hashes protect the reproducible mix. WAVs are committed.
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
SOURCES = {
    "fireball": ("koiroylers-fireball-impact-351961.mp3", "4980bb4a61597e4da7ff365872993cfdae068fd82e234c96739daa35e15743ee"),
    "burn": ("fire impact.mp3", "6edd5dcf249df943c8ea135b356417209484241d6c4c0645f100d6b8a25d32f4"),
    "crackle": ("freesound_community-tree-falls-and-burns-down-100283.mp3", "a9507af48f476ae02de757ac31bdcafc49d49c19dd23f99756ec8fbe64b5773c"),
}


def decode(source_dir, key):
    filename, expected = SOURCES[key]
    source = source_dir / filename
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
        raise ValueError(f"Source file changed: {source}")
    command = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
               "-i", str(source), "-af", "highpass=f=55", "-f", "f32le",
               "-ac", "1", "-ar", str(RATE), "-"]
    return np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype="<f4").copy()


def segment(samples, start, duration):
    frames = round(duration * RATE)
    output = np.zeros(frames, dtype=np.float32)
    sliced = samples[round(start * RATE):round(start * RATE) + frames]
    output[:len(sliced)] = sliced
    return output


def save(name, samples, target_rms):
    samples -= float(np.mean(samples))
    fade_in = min(round(.025 * RATE), len(samples) // 8)
    fade_out = min(round(.18 * RATE), len(samples) // 5)
    samples[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)
    samples[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)
    rms = float(np.sqrt(np.mean(samples * samples)))
    peak = float(np.max(np.abs(samples)))
    samples *= min(target_rms / max(rms, .001), .72 / max(peak, .001))
    destination = ROOT / "client" / "sounds" / f"{name}.wav"
    with wave.open(str(destination), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(np.round(np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
    print(f"{name}: {len(samples) / RATE:.2f}s, RMS {float(np.sqrt(np.mean(samples * samples))):.3f}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    source_dir = parser.parse_args().source_dir
    sources = {key: decode(source_dir, key) for key in SOURCES}
    pulse = segment(sources["fireball"], 0, 2.0) * .84
    crackle = segment(sources["crackle"], .28, 1.84)
    pulse[round(.16 * RATE):] += crackle * .43
    save("superheat-fire", pulse, .105)
    save("burn-hit", segment(sources["burn"], .04, 1.55), .09)
    save("fireball-impact", segment(sources["fireball"], .02, 1.72), .10)


if __name__ == "__main__":
    main()
