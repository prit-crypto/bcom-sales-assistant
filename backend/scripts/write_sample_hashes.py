"""Writes app/assets/sample_hashes.json: the SHA-256 of every bundled sample invoice.

Used by ALLOW_ONLY_SAMPLE_FILES=true, which accepts only these files (for public demos on a free AI tier).
Run after regenerating the samples; a test fails when the list and the sample files disagree.
"""

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT.parent / "frontend" / "public" / "samples"
TARGET = ROOT / "app" / "assets" / "sample_hashes.json"


def sample_hashes(folder: Path = SAMPLES) -> dict[str, str]:
    return {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(folder.iterdir())
    }


def main() -> None:
    TARGET.write_text(json.dumps(sample_hashes(), indent=2) + "\n")
    print(f"wrote {TARGET.relative_to(ROOT)}", file=sys.stderr)


if __name__ == "__main__":
    main()
