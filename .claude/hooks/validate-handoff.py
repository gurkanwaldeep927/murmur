#!/usr/bin/env python3
"""PostToolUse hook (matcher: Write|Edit) — Hook #1 of the doctrine.

Validates the JSON handoff block whenever a stage doc (docs/0N-*.md) is written or
edited. Exit code 2 blocks and feeds the error list back to the agent so it can fix
and rewrite. Also increments a per-doc correction counter so the Stop hook can enforce
the 3-attempt cap on handoff fixes.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import handofflib  # noqa: E402


def bump_counter(project_dir: Path, stage: str):
    f = project_dir / ".pipeline" / "handoff-fix-attempts.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(f.read_text()) if f.exists() else {}
    data[stage] = data.get(stage, 0) + 1
    f.write_text(json.dumps(data, indent=2))
    return data[stage]


def main():
    payload = json.load(sys.stdin)
    tool_input = payload.get("tool_input", {})
    file_path = tool_input.get("file_path") or tool_input.get("path") or ""
    project_dir = Path(payload.get("cwd", "."))

    stage, errors = handofflib.validate_doc(file_path, project_dir)
    if stage is None:  # not a stage doc — nothing to do
        sys.exit(0)
    if not errors:
        # reset the correction counter on success
        f = project_dir / ".pipeline" / "handoff-fix-attempts.json"
        if f.exists():
            data = json.loads(f.read_text())
            data.pop(stage, None)
            f.write_text(json.dumps(data, indent=2))
        sys.exit(0)

    attempts = bump_counter(project_dir, stage)
    msg = [f"HANDOFF VALIDATION FAILED for docs stage '{stage}' (attempt {attempts}/3):"]
    msg += [f"  - {e}" for e in errors]
    if attempts >= 3:
        msg.append("Correction cap reached. Do NOT keep rewriting: record this as a "
                   "blocking Open Question (owner: human) and stop.")
    else:
        msg.append("Fix the handoff block and rewrite the file.")
    print("\n".join(msg), file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
