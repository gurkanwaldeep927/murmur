"""Shared handoff-block extraction and validation. Stdlib only — no deps, boring on purpose.

A stage doc (docs/0N-*.md) must end with a fenced ```json block. Validation rules live
in .claude/schemas/handoff-<stage>.json (custom minimal format, not JSON Schema):

{
  "artifact": "ux",              # required value of the "artifact" key
  "handoff": "schema",           # required value of the "handoff" key
  "required": ["flows", ...],    # top-level keys that must exist
  "nonempty": ["flows", ...],    # top-level arrays that must be non-empty
  "item_required": {             # per-item required keys for listed arrays
    "flows": ["id", "name"]
  }
}
"""
import datetime
import json
import re
import sys
from pathlib import Path

STAGE_BY_PREFIX = {
    "01": "research", "02": "prd", "03": "trd",
    "04": "ux", "05": "schema", "06": "ui", "07": "plan",
    # quality kit (stages 08–15)
    "08": "security", "09": "ai_security", "10": "tests",
    "11": "test_verification", "12": "performance", "13": "observability",
    "14": "resilience", "15": "production_readiness",
    # additions drop (DECISION QK-7): privacy runs before 15 in execution order
    "16": "privacy",
}

# Quality stages whose handoffs may cite waivers (.pipeline/waivers/<id>.json, human-only)
WAIVER_STAGES = {"security", "ai_security", "test_verification",
                 "performance", "resilience", "production_readiness", "privacy"}

FENCE_RE = re.compile(r"```json\s*\n(.*?)\n```", re.DOTALL)


def stage_for_path(path: str):
    name = Path(path).name
    m = re.match(r"(0[1-9]|1[0-6])-", name)
    if m and Path(path).parts and "docs" in Path(path).parts:
        return STAGE_BY_PREFIX.get(m.group(1))
    return None


def extract_handoff(doc_text: str):
    """Return (obj, error). Uses the LAST fenced json block in the doc."""
    blocks = FENCE_RE.findall(doc_text)
    if not blocks:
        return None, "no ```json handoff block found (must be the last section of the doc)"
    try:
        return json.loads(blocks[-1]), None
    except json.JSONDecodeError as e:
        return None, f"handoff block is not valid JSON: {e}"


def load_schema(stage: str, project_dir: Path):
    base = project_dir / ".claude" / "schemas"
    # custom minimal format (stages 02–07) or draft-07 (quality kit, *.schema.json)
    for name in (f"handoff-{stage}.json", f"handoff-{stage}.schema.json"):
        p = base / name
        if p.exists():
            return json.loads(p.read_text())
    return None


_JS_TYPES = {"object": dict, "array": list, "string": str,
             "number": (int, float), "boolean": bool}


def _js_validate(obj, schema: dict, path: str = "$"):
    """Minimal draft-07 subset validator for the quality-kit schemas — stdlib only,
    same boring-tech reasoning as the custom checker. Supports exactly the constructs
    those schemas use: type, const, enum, pattern, minimum, minItems, required,
    properties, additionalProperties:false, items."""
    errs = []
    t = schema.get("type")
    if t:
        if t == "integer":
            ok = isinstance(obj, int) and not isinstance(obj, bool)
        elif t == "number":
            ok = isinstance(obj, (int, float)) and not isinstance(obj, bool)
        else:
            ok = isinstance(obj, _JS_TYPES.get(t, object))
        if not ok:
            return [f"{path}: expected {t}, got {type(obj).__name__}"]
    if "const" in schema and obj != schema["const"]:
        errs.append(f"{path}: must equal {schema['const']!r}")
    if "enum" in schema and obj not in schema["enum"]:
        errs.append(f"{path}: must be one of {schema['enum']}")
    if isinstance(obj, str) and "pattern" in schema and not re.search(schema["pattern"], obj):
        errs.append(f"{path}: does not match pattern {schema['pattern']!r}")
    if isinstance(obj, (int, float)) and not isinstance(obj, bool) \
            and "minimum" in schema and obj < schema["minimum"]:
        errs.append(f"{path}: below minimum {schema['minimum']}")
    if isinstance(obj, dict):
        for k in schema.get("required", []):
            if k not in obj:
                errs.append(f"{path}: missing required key: {k}")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for k in obj:
                if k not in props:
                    errs.append(f"{path}: unexpected key: {k}")
        for k, sub in props.items():
            if k in obj:
                errs += _js_validate(obj[k], sub, f"{path}.{k}")
    if isinstance(obj, list):
        if "minItems" in schema and len(obj) < schema["minItems"]:
            errs.append(f"{path}: needs at least {schema['minItems']} items")
        items = schema.get("items")
        if isinstance(items, dict):
            for i, it in enumerate(obj):
                errs += _js_validate(it, items, f"{path}[{i}]")
    return errs


def validate(obj: dict, schema: dict):
    """Return a list of error strings (empty = valid). Dispatches on schema format:
    draft-07 ("$schema" present, quality kit) vs the custom minimal format (02–07)."""
    if "$schema" in schema:
        errs = _js_validate(obj, schema)
        errs += _house_rules(obj)
        return errs
    errs = []
    if obj.get("artifact") != schema["artifact"]:
        errs.append(f'artifact must be "{schema["artifact"]}", got {obj.get("artifact")!r}')
    if schema.get("handoff") and obj.get("handoff") != schema["handoff"]:
        errs.append(f'handoff must be "{schema["handoff"]}", got {obj.get("handoff")!r}')
    for key in schema.get("required", []):
        if key not in obj:
            errs.append(f"missing required key: {key}")
    for key in schema.get("nonempty", []):
        if key in obj and isinstance(obj[key], list) and len(obj[key]) == 0:
            errs.append(f"{key} must be non-empty")
    for key, fields in schema.get("item_required", {}).items():
        for i, item in enumerate(obj.get(key) or []):
            if not isinstance(item, dict):
                errs.append(f"{key}[{i}] must be an object")
                continue
            for f in fields:
                if f not in item:
                    errs.append(f"{key}[{i}] missing required field: {f}")
    errs += _house_rules(obj)
    return errs


def _house_rules(obj: dict):
    """Rules that apply to every stage's handoff regardless of schema format."""
    errs = []
    for i, oq in enumerate(obj.get("open_questions") or []):
        if isinstance(oq, dict):
            if not oq.get("owner"):
                errs.append(f"open_questions[{i}] has no owner (house rule: owner + blocking flag)")
            if "blocking" not in oq:
                errs.append(f"open_questions[{i}] missing blocking flag")
    return errs


def check_waivers(obj: dict, stage: str, project_dir: Path):
    """A cited waiver is valid only as a human-created .pipeline/waivers/<id>.json
    with finding_id, waived_by, reason, and an unexpired expires date."""
    errs = []
    if stage not in WAIVER_STAGES:
        return errs
    for wid in obj.get("waivers_cited") or []:
        f = project_dir / ".pipeline" / "waivers" / f"{wid}.json"
        if not f.exists():
            errs.append(f"cited waiver {wid}: no .pipeline/waivers/{wid}.json "
                        f"(waivers are human-created; agents may only cite them)")
            continue
        try:
            w = json.loads(f.read_text())
        except json.JSONDecodeError:
            errs.append(f"waiver {wid}: file is not valid JSON")
            continue
        missing = [k for k in ("finding_id", "waived_by", "reason", "expires") if not w.get(k)]
        if missing:
            errs.append(f"waiver {wid}: missing fields {missing}")
            continue
        try:
            if datetime.date.fromisoformat(str(w["expires"])[:10]) < datetime.date.today():
                errs.append(f"waiver {wid}: expired on {w['expires']}")
        except ValueError:
            errs.append(f"waiver {wid}: unparseable expires date {w['expires']!r}")
    return errs


def validate_doc(path: str, project_dir: Path):
    """Full pipeline: read doc, extract block, validate against its stage schema.
    Returns (stage, errors). stage=None means the file isn't a stage doc."""
    stage = stage_for_path(path)
    if not stage:
        return None, []
    p = Path(path)
    if not p.exists():
        return stage, [f"{path} does not exist"]
    obj, err = extract_handoff(p.read_text())
    if err:
        errors = [err]
    else:
        schema = load_schema(stage, project_dir)
        # No schema registered — warn-only (research stage, or pre-retrofit docs)
        errors = validate(obj, schema) if schema is not None else []
        errors += check_waivers(obj, stage, project_dir)
    # Per-stage warn-only flag: new gates run one full pass non-blocking
    # (create .pipeline/warn-only/<stage>; delete after one clean end-to-end run)
    if errors and (project_dir / ".pipeline" / "warn-only" / stage).exists():
        print(f"[warn-only] {stage}: " + "; ".join(errors), file=sys.stderr)
        return stage, []
    return stage, errors
