#!/usr/bin/env python3
"""PreToolUse hook (matcher: Write|Edit|Bash) — Hook #3 of the doctrine.

Three protections, exit code 2 = block:
1. Prior-stage docs are frozen: docs/0N-*.md is read-only once any higher-numbered
   stage doc exists. Override for deliberate retrofits: list prefixes in
   .pipeline/unlock (e.g. a file containing "02 03").
2. docs/gates/taste-gate.json is human-only. No agent writes it, ever.
3. Destructive bash is blocked: rm -rf outside tmp, force-push, DROP/TRUNCATE,
   redirects or in-place edits targeting docs/.
"""
import json
import re
import sys
from pathlib import Path

DESTRUCTIVE = [
    (r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b(?!.*\b/tmp/)", "rm -rf outside /tmp"),
    (r"\bgit\s+push\s+.*(--force|-f)\b", "force push"),
    (r"\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b", "destructive SQL"),
    (r"\bmkfs\b|\bdd\s+if=", "disk-level destruction"),
    (r"(>|>>)\s*docs/(0[1-9]|1[0-5])-", "shell redirect into a stage doc (use Write/Edit so hooks can validate)"),
    (r"\bsed\s+-i[^|]*docs/(0[1-9]|1[0-5])-", "in-place edit of a stage doc via sed"),
    (r"\b(rm|mv)\b[^|]*docs/(0[1-9]|1[0-5])-", "removing/moving a stage doc"),
    (r"docs/gates/taste-gate\.json", "touching the taste gate from bash (human-only file)"),
    (r"\.pipeline/waivers/", "touching waivers from shell (human-only files)"),
    # PowerShell equivalents (Windows: shell commands may arrive via the PowerShell tool)
    (r"\bRemove-Item\b(?=[^|]*-Recurse)(?=[^|]*-Force)", "Remove-Item -Recurse -Force"),
    (r"\b(Set-Content|Out-File|Add-Content)\b[^|]*docs[/\\](0[1-9]|1[0-5])-", "shell write into a stage doc (use Write/Edit so hooks can validate)"),
]

# Quality-kit denylist (DECISION QK-1): verification-stage Bash is scan/test-only.
# Bypassed only when a human creates .pipeline/unlock (deliberate override).
QK_DESTRUCTIVE = [
    (r"\bgit\s+reset\s+--hard\b", "git reset --hard"),
    (r"\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b", "piping a download to a shell"),
    (r"\bnpm\s+publish\b|\btwine\s+upload\b", "package publish"),
    (r"\bdocker\s+system\s+prune\b", "docker system prune"),
    (r"\bterraform\s+(destroy|apply\s+-destroy)\b", "terraform destroy"),
    (r"\baws\s+\S+.*\bdelete", "aws delete verb"),
    (r"\bdocker\s+(kill|stop|pause|rm)\s+(?!qk-chaos-)", "docker kill/stop/pause/rm outside the qk-chaos-* namespace (chaos agent may only touch instances it started)"),
]


def unlocked_prefixes(project_dir: Path):
    f = project_dir / ".pipeline" / "unlock"
    if not f.exists():
        return set()
    return set(f.read_text().split())


def frozen_reason(file_path: str, project_dir: Path):
    m = re.search(r"docs/(0[1-9]|1[0-5])-[^/]*\.md$", file_path.replace("\\", "/"))
    if not m:
        return None
    n = int(m.group(1))
    if m.group(1) in unlocked_prefixes(project_dir):
        return None
    docs = project_dir / "docs"
    if docs.exists():
        for p in list(docs.glob("0[1-9]-*.md")) + list(docs.glob("1[0-5]-*.md")):
            try:
                if int(p.name[:2]) > n:
                    return (f"docs/{m.group(1)}-* is frozen: stage {p.name[:2]} already exists. "
                            f"Prior-stage docs are read-only. For a deliberate retrofit, a human "
                            f"adds '{m.group(1)}' to .pipeline/unlock.")
            except ValueError:
                continue
    return None


def main():
    payload = json.load(sys.stdin)
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})
    project_dir = Path(payload.get("cwd", "."))

    if tool in ("Write", "Edit"):
        fp = (tool_input.get("file_path") or tool_input.get("path") or "").replace("\\", "/")
        if fp.endswith("docs/gates/taste-gate.json") or "/gates/taste-gate.json" in fp:
            print("BLOCKED: taste-gate.json is human-only. Taste has no objective signal; "
                  "an agent-authored selection defeats the gate. Stop and tell the user "
                  "the pipeline is waiting on their design-direction choice.", file=sys.stderr)
            sys.exit(2)
        if ".pipeline/waivers/" in fp:
            print("BLOCKED: waivers are human-only. An agent-authored waiver defeats the "
                  "quality gate. Escalate the finding as a blocking Open Question instead.",
                  file=sys.stderr)
            sys.exit(2)
        reason = frozen_reason(fp, project_dir)
        if reason:
            print(f"BLOCKED: {reason}", file=sys.stderr)
            sys.exit(2)

    if tool in ("Bash", "PowerShell"):
        cmd = tool_input.get("command", "")
        for pattern, label in DESTRUCTIVE:
            if re.search(pattern, cmd, re.IGNORECASE):
                print(f"BLOCKED: {label}. This command is outside the UI agent's scoped "
                      f"Bash mandate (render/screenshot/dev-server only).", file=sys.stderr)
                sys.exit(2)
        if not (project_dir / ".pipeline" / "unlock").exists():
            for pattern, label in QK_DESTRUCTIVE:
                if re.search(pattern, cmd, re.IGNORECASE):
                    print(f"BLOCKED: {label}. Verification-stage shell is scan/test-only "
                          f"(QK-1). A human may create .pipeline/unlock for a deliberate "
                          f"override.", file=sys.stderr)
                    sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
