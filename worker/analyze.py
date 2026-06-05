import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np


MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def load_audio(input_path: Path):
    return librosa.load(input_path, sr=None, mono=True)


def estimate_bpm(y, sr) -> float:
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return round(float(np.ravel(tempo)[0]), 2)


def estimate_key(y, sr) -> dict:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    chroma_mean = chroma_mean / max(chroma_mean.sum(), 1e-9)

    best = {"score": -1.0, "tonic": "C", "mode": "major"}
    for i, note in enumerate(NOTES):
        major_score = float(np.corrcoef(chroma_mean, np.roll(MAJOR_PROFILE, i))[0, 1])
        minor_score = float(np.corrcoef(chroma_mean, np.roll(MINOR_PROFILE, i))[0, 1])

        if major_score > best["score"]:
            best = {"score": major_score, "tonic": note, "mode": "major"}
        if minor_score > best["score"]:
            best = {"score": minor_score, "tonic": note, "mode": "minor"}

    mode = "Major" if best["mode"] == "major" else "Minor"
    return {
        "key": best["tonic"],
        "mode": mode,
        "tonic": best["tonic"],
        "modeSlug": best["mode"],
        "confidenceScore": round(best["score"], 4),
        "confidence": confidence_label(best["score"]),
    }


def suggest_chords(key_info: dict) -> list[str]:
    tonic_index = NOTES.index(key_info["tonic"])
    if key_info["modeSlug"] == "minor":
        degrees = [(0, "m"), (5, "m"), (7, ""), (3, ""), (8, ""), (10, ""), (2, "dim")]
        progression = [0, 3, 4, 1]
    else:
        degrees = [(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m"), (11, "dim")]
        progression = [0, 4, 5, 3]

    scale_chords = [f"{NOTES[(tonic_index + semitone) % 12]}{quality}" for semitone, quality in degrees]
    return [scale_chords[index] for index in progression]


def confidence_label(score: float) -> str:
    if score >= 0.55:
        return "high"
    if score >= 0.32:
        return "medium"
    return "low"


def format_duration(seconds: float) -> str:
    total_seconds = max(0, int(round(seconds)))
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes:02d}:{seconds:02d}"


def analyze_audio(input_path: Path) -> dict:
    y, sr = load_audio(input_path)
    duration_seconds = float(librosa.get_duration(y=y, sr=sr))
    key_info = estimate_key(y, sr)

    return {
        "duration": format_duration(duration_seconds),
        "durationSeconds": round(duration_seconds, 2),
        "bpm": int(round(estimate_bpm(y, sr))),
        "key": key_info["key"],
        "mode": key_info["mode"],
        "chords": suggest_chords(key_info),
        "confidence": key_info["confidence"],
        "confidenceScore": key_info["confidenceScore"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze audio with librosa.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--action", choices=["full", "bpm", "key", "chords"], default="full")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Input file does not exist: {input_path}")

    if args.action == "full":
        print(json.dumps(analyze_audio(input_path), ensure_ascii=False))
        return

    y, sr = load_audio(input_path)
    response = {"action": args.action}

    if args.action == "bpm":
        response["bpm"] = estimate_bpm(y, sr)
    elif args.action == "key":
        response.update(estimate_key(y, sr))
    else:
        key_info = estimate_key(y, sr)
        response.update(key_info)
        response["chords"] = suggest_chords(key_info)

    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
