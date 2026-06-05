import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


STEMS = ["vocals", "drums", "bass", "other"]


def run_demucs(input_path: Path, output_dir: Path, stem: str) -> Path:
    demucs_stem = "vocals" if stem == "instrumental" else stem
    command = [
        sys.executable,
        "-m",
        "demucs",
        "--two-stems",
        demucs_stem,
        "-o",
        str(output_dir),
        str(input_path),
    ]

    process = subprocess.run(command, capture_output=True, text=True)
    if process.returncode != 0:
        raise RuntimeError(process.stderr or process.stdout or "Demucs failed.")

    separated_root = output_dir / "htdemucs" / input_path.stem
    source_file = separated_root / ("no_vocals.wav" if stem == "instrumental" else f"{stem}.wav")
    if not source_file.exists():
        raise FileNotFoundError(f"Demucs output was not found: {source_file}")

    final_file = output_dir / f"{input_path.stem}-{stem}.wav"
    shutil.copy2(source_file, final_file)
    return final_file


def find_ffmpeg() -> str | None:
    configured = os.environ.get("FFMPEG_LOCATION")
    if configured:
        return configured

    return shutil.which("ffmpeg") or "ffmpeg"


def create_instrumental(output_dir: Path, stem_paths: dict[str, Path]) -> Path | None:
    ffmpeg = find_ffmpeg()
    required = [stem_paths.get("drums"), stem_paths.get("bass"), stem_paths.get("other")]
    if not ffmpeg or any(path is None or not path.exists() for path in required):
        return None

    instrumental_path = output_dir / "instrumental.wav"
    command = [
        ffmpeg,
        "-y",
        "-i",
        str(required[0]),
        "-i",
        str(required[1]),
        "-i",
        str(required[2]),
        "-filter_complex",
        "amix=inputs=3:duration=longest:normalize=0",
        str(instrumental_path),
    ]

    process = subprocess.run(command, capture_output=True, text=True)
    if process.returncode != 0:
        return None

    return instrumental_path if instrumental_path.exists() else None


def run_demucs_all(input_path: Path, output_dir: Path) -> dict[str, Path]:
    command = [
        sys.executable,
        "-m",
        "demucs",
        "-o",
        str(output_dir),
        str(input_path),
    ]

    process = subprocess.run(command, capture_output=True, text=True)
    if process.returncode != 0:
        raise RuntimeError(process.stderr or process.stdout or "Demucs failed.")

    separated_root = output_dir / "htdemucs" / input_path.stem
    if not separated_root.exists():
        raise FileNotFoundError(f"Demucs output folder was not found: {separated_root}")

    stem_paths: dict[str, Path] = {}
    for stem in STEMS:
        source_file = separated_root / f"{stem}.wav"
        if not source_file.exists():
            raise FileNotFoundError(f"Demucs output was not found: {source_file}")

        final_file = output_dir / f"{stem}.wav"
        shutil.copy2(source_file, final_file)
        stem_paths[stem] = final_file

    instrumental_path = create_instrumental(output_dir, stem_paths)
    if instrumental_path:
        stem_paths["instrumental"] = instrumental_path

    return stem_paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Separate audio stems with Demucs.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--stem", required=True, choices=["vocals", "instrumental", "drums", "bass", "all"])
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        raise FileNotFoundError(f"Input file does not exist: {input_path}")

    if args.stem == "all":
        stem_paths = run_demucs_all(input_path, output_dir)
        print(
            json.dumps(
                {
                    "stem": "all",
                    "files": {stem: str(file_path) for stem, file_path in stem_paths.items()},
                },
                ensure_ascii=False,
            )
        )
        return

    output_path = run_demucs(input_path, output_dir, args.stem)
    print(
        json.dumps(
            {
                "stem": args.stem,
                "outputPath": str(output_path),
                "fileName": output_path.name,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
