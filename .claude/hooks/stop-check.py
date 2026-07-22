#!/usr/bin/env python3
"""Stop hook (referenced from each agent's frontmatter, auto-scoped to SubagentStop) —
Hook #2 of the doctrine.

Usage: stop-check.py <stage>   (stage ∈ ux | schema | ui | plan | prd | trd)

Enforces the completion checklist: the stage doc must exist with a valid handoff
block, the UI iteration cap must hold, and the taste gate must remain human-authored.
Exit code 2 blocks the stop and feeds the deficit back — UNLESS stop_hook_active is
already set (loop safety: a hard cap on the enforcement loop itself, per the
loop-engineering rule) or the agent has already recorded a blocking Open Question
(escalation is a legitimate way to finish).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import handofflib  # noqa: E402

DOC = {"prd": "02-prd.md", "trd": "03-trd.md", "ux": "04-ux.md",
       "schema": "05-schema.md", "ui": "06-ui.md", "plan": "07-plan.md",
       # quality kit (stages 08–15)
       "security": "08-security.md", "ai_security": "09-ai-security.md",
       "tests": "10-tests.md", "test_verification": "11-test-verification.md",
       "performance": "12-performance.md", "observability": "13-observability.md",
       "resilience": "14-resilience.md", "production_readiness": "15-production-readiness.md",
       "privacy": "16-privacy.md"}
UI_ITERATION_CAP = 3


def main():
    stage = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = json.load(sys.stdin)
    project_dir = Path(payload.get("cwd", "."))

    if not stage:
        # Fallback path (settings.json SubagentStop with no arg): check the
        # highest-numbered stage doc present — that's the stage that just ran.
        docs_dir = project_dir / "docs"
        docs = sorted(list(docs_dir.glob("0[2-9]-*.md")) + list(docs_dir.glob("1[0-6]-*.md"))) \
            if docs_dir.exists() else []
        if docs:
            stage = handofflib.STAGE_BY_PREFIX.get(docs[-1].name[:2], "")

    # Loop safety: never fight a stop twice. One forced continuation max.
    if payload.get("stop_hook_active"):
        sys.exit(0)

    if stage not in DOC:
        sys.exit(0)

    doc_path = project_dir / "docs" / DOC[stage]
    problems = []

    if not doc_path.exists():
        problems.append(f"docs/{DOC[stage]} was never written")
        obj = None
    else:
        _, errors = handofflib.validate_doc(str(doc_path), project_dir)
        problems += errors
        obj, err = handofflib.extract_handoff(doc_path.read_text())
        if err:
            obj = None

    # Escalation is a legitimate exit: a blocking OQ recorded by the agent means it
    # stopped on purpose — but only if the handoff block itself is structurally valid.
    # An invalid block can't be trusted to carry an escalation.
    if not problems and obj and any(
        q.get("blocking") for q in obj.get("open_questions", []) if isinstance(q, dict)
    ):
        sys.exit(0)

    if stage == "ui":
        it = project_dir / ".pipeline" / "ui-iterations.json"
        if it.exists():
            for screen, n in json.loads(it.read_text()).items():
                if n > UI_ITERATION_CAP:
                    problems.append(f"screen {screen} used {n} iterations (cap {UI_ITERATION_CAP}) "
                                    f"— overruns must become Open Questions, not extra loops")
        gate = project_dir / "docs" / "gates" / "taste-gate.json"
        if not gate.exists():
            problems.append("taste-gate.json missing — the UI stage ran without human taste approval")

    if problems:
        print(f"COMPLETION CHECKLIST FAILED for stage '{stage}':\n" +
              "\n".join(f"  - {p}" for p in problems) +
              "\nEither fix the deficit, or record it as a blocking Open Question "
              "(owner: human) in the handoff and finish.", file=sys.stderr)
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
