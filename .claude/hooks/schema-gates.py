#!/usr/bin/env python3
"""PostToolUse hook (matcher: Write|Edit) — schema stage gates SG-1 and SG-2.

Fires only on writes to docs/05-schema.md. Two checks, exit 2 = block + feedback:

SG-1  DDL objective signal:
      - dialect "sqlite"  -> every ```sql block executed against sqlite3 :memory:
      - other dialects    -> parsed with sqlglot if installed (blocking);
                             sqlglot absent -> WARN-ONLY (printed, exit 0 contribution)
SG-2  Bidirectional UX<->schema trace diff:
      - forward: every (screen, data_need.field) in docs/04-ux.md handoff is claimed
        by >=1 schema field trace containing "UX:<screen>.data_needs[<field>]"
      - reverse: every schema trace with a "UX:" prefix references a real data_need
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import handofflib  # noqa: E402

SQL_FENCE_RE = re.compile(r"```sql\s*\n(.*?)\n```", re.DOTALL)
UX_TRACE_RE = re.compile(r"UX:(\w+)\.data_needs\[([^\]]+)\]")


def check_ddl(doc_text: str, dialect: str):
    errs, warns = [], []
    blocks = SQL_FENCE_RE.findall(doc_text)
    if not blocks:
        errs.append("no ```sql DDL blocks found — the schema doc must carry runnable DDL (SG-1)")
        return errs, warns
    ddl = "\n".join(blocks)
    if (dialect or "").lower() == "sqlite":
        try:
            con = sqlite3.connect(":memory:")
            con.executescript(ddl)
            con.close()
        except sqlite3.Error as e:
            errs.append(f"DDL failed to execute against sqlite :memory: — {e} (SG-1)")
    else:
        try:
            import sqlglot
            try:
                sqlglot.parse(ddl, read=(dialect or "").lower() or None)
            except sqlglot.errors.ParseError as e:
                errs.append(f"DDL failed to parse for dialect '{dialect}' — {e} (SG-1)")
            except Exception:
                # unknown dialect string for sqlglot: parse dialect-agnostically
                try:
                    sqlglot.parse(ddl)
                except sqlglot.errors.ParseError as e:
                    errs.append(f"DDL failed to parse (dialect-agnostic) — {e} (SG-1)")
        except ImportError:
            warns.append(f"WARN-ONLY: sqlglot not installed; DDL for dialect '{dialect}' "
                         f"was NOT verified. Install sqlglot to make SG-1 blocking for "
                         f"non-sqlite dialects.")
    return errs, warns


def check_traces(schema_obj: dict, project_dir: Path):
    errs = []
    ux_doc = project_dir / "docs" / "04-ux.md"
    if not ux_doc.exists():
        return ["docs/04-ux.md missing — cannot run trace diff (SG-2)"]
    ux_obj, err = handofflib.extract_handoff(ux_doc.read_text())
    if err:
        return [f"04-ux.md handoff unreadable — {err} (SG-2)"]

    # Set of UX coordinates that exist
    ux_needs = set()
    for screen in ux_obj.get("screens", []):
        for dn in screen.get("data_needs", []):
            if isinstance(dn, dict) and dn.get("field"):
                ux_needs.add((screen.get("id"), dn["field"]))

    # Set of UX coordinates claimed by schema traces
    claimed = set()
    for table in schema_obj.get("tables", []):
        for field in table.get("fields", []):
            trace = field.get("trace", "") if isinstance(field, dict) else ""
            for screen_id, need in UX_TRACE_RE.findall(trace):
                claimed.add((screen_id, need))
                if (screen_id, need) not in ux_needs:  # reverse check
                    errs.append(f"schema field {table.get('name')}.{field.get('name')} "
                                f"traces to UX:{screen_id}.data_needs[{need}] which does "
                                f"not exist in 04-ux.md (SG-2 reverse)")

    for coord in sorted(ux_needs - claimed, key=str):  # forward check
        errs.append(f"UX data_need {coord[0]}.{coord[1]} is not claimed by any schema "
                    f"field trace — silently dropped data need (SG-2 forward)")
    return errs


def main():
    payload = json.load(sys.stdin)
    tool_input = payload.get("tool_input", {})
    fp = (tool_input.get("file_path") or tool_input.get("path") or "").replace("\\", "/")
    if not fp.endswith("docs/05-schema.md"):
        sys.exit(0)
    project_dir = Path(payload.get("cwd", "."))
    doc = Path(fp)
    if not doc.exists():
        sys.exit(0)

    text = doc.read_text()
    obj, err = handofflib.extract_handoff(text)
    if err:
        sys.exit(0)  # validate-handoff.py owns malformed-block feedback; don't double-fire

    errs, warns = check_ddl(text, obj.get("dialect", ""))
    errs += check_traces(obj, project_dir)

    for w in warns:
        print(w, file=sys.stderr)
    if errs:
        print("SCHEMA GATES FAILED (SG-1/SG-2):\n" + "\n".join(f"  - {e}" for e in errs) +
              "\nFix and rewrite docs/05-schema.md. If a data_need genuinely cannot be "
              "stored as designed, that is an escalation — record a blocking Open "
              "Question, never drop it.", file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
