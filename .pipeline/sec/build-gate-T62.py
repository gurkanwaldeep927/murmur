"""Builds docs/gates/security-gate-M2.json. Verifier tooling, not app code."""
import json
import pathlib

h = json.loads(pathlib.Path(".pipeline/sec/handoff-08-security-T62.json").read_text(encoding="utf-8"))
fp = json.loads(pathlib.Path(".pipeline/sec/triage-false-positives-T62.json").read_text(encoding="utf-8"))
mc = json.loads(pathlib.Path(".pipeline/sec/manual-check-classes-T62.json").read_text(encoding="utf-8"))

gate = {
    "gate": "security",
    "stage": 8,
    "task": "T62",
    "milestone": "M2",
    "run_number": 2,
    "mode": "blocking",
    "mode_source": (
        "quality-kit-additions/cadence.md \u00a72 (M2 row) + docs/07-plan.md line 472 milestone M2 "
        "exit_criterion: \"Quality gate: T62 security-agent authz run is BLOCKING for this "
        "milestone's exit\"; promotion mechanic \u2014 T60 was this agent's warn-only first run, T62 "
        "is its blocking second run"
    ),
    "run_date": "2026-08-13",
    "agent": "security-agent",
    "skill": ".claude/skills/security-audit/SKILL.md",
    "repo_root": "C:\\Users\\Gurka\\OneDrive\\Desktop\\nit",
    "repo_root_provenance": "[ASSUMPTION: repo root = cwd] \u2014 the plan handoff names no repo_root field (unchanged from T60)",
    "commit": "80b1b57",
    "branch": "task/T62-authz-security-gate",
    "git_remote": "https://github.com/gurkanwaldeep927/murmur.git",
    "phase_0_gate": {
        "plan_doc_present": True,
        "plan_handoff_parses": True,
        "plan_handoff_validates_against_schema": True,
        "plan_handoff_schema": ".claude/schemas/handoff-plan.json",
        "plan_handoff_sha256": "78cb95758b9dacd9f30c491fba071772d5b8ce7f93d37aa57c16bbd2ea645997",
        "plan_handoff_sha256_matches_T60": True,
        "plan_status_not_blocked": True,
        "plan_status_field_present": False,
        "plan_blocking_open_questions": 0,
        "codebase_present": True,
        "skill_readable": True,
        "stage_doc_writable": True,
        "stage_doc_writable_provenance": (
            ".pipeline/unlock contains \"08 09 10 11 12 13\" (written by human 2026-08-11); T60 "
            "could not write docs/08-security.md because the guard froze it"
        ),
        "disposition": "pass",
    },
    "gate_rule": "pass requires counts.critical==0 and counts.high==0 (unwaived)",
    "result": "fail",
    "blocks_milestone_exit": True,
    "blocks_milestone_exit_reason": (
        "This run is BLOCKING per cadence.md \u00a72 (M2 row) and docs/07-plan.md line 472. "
        "counts.high==3 with zero waivers, so the gate rule is not satisfied and M2 cannot exit. "
        "All three high findings are configuration-layer residuals of T60 findings whose CODE "
        "remedies did land; none requires an application-code change to close."
    ),
    "counts": dict(h["counts"], info=1, total=len(h["findings"])),
    "counts_verified_against_findings_array": True,
    "counts_note": (
        "The schema's counts object carries only critical/high/medium/low; the one info finding "
        "(SEC-018) is in the findings array and is reported here for completeness."
    ),
    "waivers": {
        "directory": ".pipeline/waivers/",
        "exists": False,
        "files_found": 0,
        "waivers_cited": [],
        "note": (
            "No finding in this run is waived. The waivers directory does not exist, so no waiver "
            "could be valid even if one were cited. Per cadence.md \u00a76.2 only a human waives, via "
            ".pipeline/waivers/<finding-id>.json. This agent granted none and is not permitted to."
        ),
    },
    "tool_coverage": {
        "sast": {
            "mandated": "semgrep scan --config auto --json",
            "status": "full",
            "installed": True,
            "version": "1.172.0",
            "ran_as_mandated": True,
            "rules_run": 503,
            "files_scanned": 273,
            "findings_returned": 19,
            "note": (
                "Registry reachable this run (config auto resolved 503 rules), so T60's fallback to "
                "10 self-authored local rules in .pipeline/sec/local-rules.yaml was NOT used. Two "
                "invocation notes recorded honestly: (1) `python -m semgrep` exits 2 silently on "
                "this machine with no diagnostic on stdout or stderr \u2014 the working entrypoint is "
                "the console script at "
                "C:/Users/Gurka/AppData/Local/Programs/Python/Python312/Scripts/semgrep.exe; (2) the "
                "first attempt added --metrics=off, which is incompatible with --config auto and "
                "was dropped."
            ),
            "coverage_gaps": [
                "Scan was limited to files tracked by git (semgrep default).",
                "47 files skipped by .semgrepignore patterns.",
                "One rule (javascript.express.security.express-insecure-template-usage) TIMED OUT "
                "on client/src/components/support.js \u2014 recorded in the errors array of the report "
                "and inside finding SEC-018.",
            ],
            "report_path": ".pipeline/sec/semgrep-T62.json",
        },
        "secrets": {
            "mandated": "gitleaks detect --report-format json (full git history)",
            "status": "substituted-with-partial-compensation",
            "installed_locally": False,
            "substitute": "detect-secrets@1.5.0 (worktree) + targeted git-history search",
            "substitution_reason": (
                "gitleaks is absent from this machine and binary downloads have failed in this "
                "environment before; boring-tech rule says do not install exotic tooling to work "
                "around that mid-gate."
            ),
            "coverage_gap": (
                "detect-secrets scans the WORKING TREE only \u2014 it does not read git history, which "
                "is the specific thing gitleaks is mandated for. Partially compensated two ways: "
                "(a) the CI job 'secrets-scan' runs the real gitleaks/gitleaks-action@v2 and "
                "CONCLUDED SUCCESS on run 31521354238 against commit 80b1b57, which is exactly this "
                "run's HEAD; (b) this run additionally searched all refs directly with `git log "
                "--all --diff-filter=A` for any committed .env and `git log --all -S<value>` for "
                "each live secret, all negative. Residual unknown: whether gitleaks-action@v2 "
                "scanned full history or only the pushed commit range \u2014 carried as non-blocking "
                "OQ-SEC-04."
            ),
            "report_path": ".pipeline/sec/detect-secrets-T62.json, .pipeline/sec/history-secret-search-T62.txt",
        },
        "sca": {
            "mandated": "osv-scanner --lockfile <each lockfile> --json (fallback trivy fs .)",
            "status": "substituted",
            "installed_locally": False,
            "fallback_installed_locally": False,
            "substitute": "npm@10.9.2 audit --json",
            "substitution_reason": (
                "Neither osv-scanner nor the mandated fallback trivy is present, and binary "
                "downloads have failed in this environment before."
            ),
            "coverage_gap": (
                "npm audit resolves only against the npm advisory database; osv.dev aggregates "
                "additional sources (GHSA, GitLab, distro trackers) and would likely return a "
                "superset. Ecosystem coverage is otherwise identical here because both lockfiles "
                "are npm."
            ),
            "lockfiles_scanned": [
                "package-lock.json (root \u2014 this IS the server package; there is no server/package.json)",
                "client/package-lock.json",
            ],
            "t60_gap_closed": (
                "Yes \u2014 T60 left client/package-lock.json unscanned; both lockfiles were scanned "
                "this run, full tree and --omit=dev."
            ),
            "report_path": (
                ".pipeline/sec/npm-audit-server-T62.json, .pipeline/sec/npm-audit-client-T62.json, "
                ".pipeline/sec/npm-audit-server-prod-T62.json, .pipeline/sec/npm-audit-client-prod-T62.json"
            ),
        },
    },
    "manual_check_classes": mc,
    "triaged_false_positives": fp,
    "t60_finding_disposition": {
        "note": (
            "Every T60 finding was re-verified against the code as it exists at commit 80b1b57 "
            "rather than carried forward on trust, because prior artifacts in this repo have "
            "recorded fixed findings as unfixed."
        ),
        "closed": {
            "SEC-001": (
                "Active pepper rotated to a v2 secret with no placeholder marker, and "
                "config/index.ts:32-46 requiredSecret() now refuses to boot on a placeholder. "
                "CLOSED as written \u2014 but see SEC-019, which is the untouched residual on the "
                "RETIRED pepper and on rows already hashed under it."
            ),
            "SEC-004": (
                "CLOSED. config.verificationMaxConfirmAttempts exists (config/index.ts:225) and is "
                "enforced at identity.service.ts:188 with the failure burn at :199."
            ),
            "SEC-005": (
                "CLOSED. shared/logger.ts REDACT_PATHS now covers req.headers.authorization, "
                "res.headers['x-session-refresh'] in both casings, cookies, and "
                "req.remoteAddress/remotePort."
            ),
            "SEC-007": (
                "CLOSED. shared/rate-limit.ts exists with a swept, HMAC-keyed FixedWindowLimiter; "
                "initiate and confirm limiters are wired at identity.routes.ts:22 and :42. Residual "
                "about TRUST_PROXY being unset is folded into SEC-009 rather than dropped."
            ),
            "SEC-010": "CLOSED. app.ts:51-52 disables x-powered-by and installs helmet() ahead of all routes.",
            "SEC-014": (
                "CLOSED. The blocking CI control has now executed: run 31521354238 on commit "
                "80b1b57 shows jobs build-test, sca, secrets-scan and sast all conclusion=success. "
                "A git remote also now exists, which it did not at T60."
            ),
        },
        "closed_at_code_but_open_at_configuration": {
            "SEC-002": (
                "Code fix landed (pool.ts:23-38 + the derived verify-full default at "
                "config/index.ts:161-162) but the live .env sets DATABASE_SSL=require against a "
                "remote Supabase host with no CA. Re-recorded as SEC-002, high."
            ),
            "SEC-006": (
                "Code fix landed (email-provider.ts:42-43 refuses a non-delivering provider under a "
                "production NODE_ENV) but the live .env sets EMAIL_PROVIDER=console with "
                "NODE_ENV=development against the live database. Re-recorded as SEC-021, high."
            ),
            "SEC-011": (
                "Code fix landed (config/index.ts:80-85 refuses to boot with the key unset outside "
                "dev/test) but the live .env leaves EMAIL_ENCRYPTION_KEY empty with "
                "NODE_ENV=development against the live database. Re-recorded as SEC-020, medium."
            ),
        },
        "still_open_unchanged": {
            "SEC-003": (
                "CLOSED in migration source and verified beyond T60's fix_hint \u2014 see "
                "manual_check_classes.storage_db_rules, including the M3/M4/M5 tables that 008's "
                "catalogue sweep could not have seen. Listed here only because whether the "
                "migrations are APPLIED to the live database was not verified this run."
            ),
            "SEC-008": "Still open, unchanged. Medium.",
            "SEC-013": "Still open, unchanged; app.ts:42-45 says so in the code itself. Medium.",
            "SEC-015": "Still open, unchanged. Low.",
            "SEC-016": "Still open, unchanged. Low.",
            "SEC-018": "Still open, unchanged, and confirmed still unreferenced from client/src. Info.",
        },
        "materially_changed_severity": {
            "SEC-009": (
                "T60 recorded this as an unauthenticated write with CALLER-SUPPLIED ATTRIBUTION. "
                "The attribution half is fixed in the code today: analytics.routes.ts:39-41 refuses "
                "a client-supplied actorProfileId outright, and :50-54 derives the actor from a "
                "verified session token. Re-assessed DOWNWARD to medium on this run's own reading, "
                "not copied from T60. The endpoint is still unauthenticated, which is a documented "
                "design requirement (PRD R8), so what remains is residual risk on an accepted design."
            ),
            "SEC-012": (
                "Held at medium. Both lockfiles now scanned; production trees return 0 "
                "vulnerabilities of every severity, so no critical/high reaches a user."
            ),
            "SEC-017": (
                "Materially improved \u2014 the blanket MURMUR_TEST_DB_CONFIRM opt-out is gone and "
                "replaced by an exact host/database fingerprint pin. Held at low for the residual "
                "name-substring branch at tests/helpers/test-db.ts:47."
            ),
        },
        "could_not_determine": {
            "SEC-003 (applied state)": (
                "Whether migrations 003/004/005/008 are actually APPLIED to the live Supabase "
                "database was NOT verified. The environment constraint forbids running the "
                "integration suite, and this agent chose not to issue ad-hoc queries against a live "
                "database holding real data. Source-level verification is complete and passes; "
                "applied-state verification is outstanding and should be done by a human with read "
                "access."
            )
        },
    },
    "new_in_t62": ["SEC-019", "SEC-020", "SEC-021", "SEC-022", "SEC-023"],
    "authz_review": {
        "scope": "repo-wide, per the gate rule \u2014 not limited to the A3/A4/A5/T12 surface named in the task",
        "routes_enumerated": 18,
        "routes_source": "server/src/app.ts and the seven routers it mounts",
        "routes_unexamined": 0,
        "questions_asked_per_route": [
            "behind requireSession?",
            "ownership checked, not merely session-exists?",
            "can the caller influence whose identity the write is attributed to?",
        ],
        "table_location": "docs/08-security.md \u00a74",
        "result": (
            "One route is not behind requireSession (POST /events, SEC-009, by documented design). "
            "Zero routes allow the caller to influence write attribution. Zero routes act on "
            "another user's row without an ownership check."
        ),
    },
    "recommended_fix_order": [
        {"rank": 1, "id": "SEC-002", "why": "Cheapest of the three highs and the largest blast radius: one CA file plus one variable, and it currently exposes the database password and every row to an active machine-in-the-middle."},
        {"rank": 2, "id": "SEC-021", "why": "Two-variable configuration change. Until it is done, every real verification OTP and raw campus address is printed to stdout."},
        {"rank": 3, "id": "SEC-019", "why": "Ranked third only because it needs a human DECISION rather than an edit, and the decision destroys data either way. Blocking OQ-SEC-02."},
        {"rank": 4, "id": "SEC-020", "why": "One variable. Do it alongside SEC-019, since it is the reason SEC-019 cannot be remediated by re-hashing."},
        {"rank": 5, "id": "SEC-013", "why": "Highest-value medium: it is the unenforced premise behind the OQ-14 decision to keep the session token in localStorage."},
        {"rank": 6, "id": "SEC-009", "why": "Set TRUST_PROXY and add analytics_event retention; both are small and the second one only gets more expensive with time."},
        {"rank": 7, "id": "SEC-023", "why": "Three lines, and it removes the last unlimited credential-handling endpoint."},
        {"rank": 8, "id": "SEC-022", "why": "Mechanical SHA pinning across seven ci.yml lines."},
        {"rank": 9, "id": "SEC-012", "why": "npm update in both trees. No production exposure, so it can wait for a convenient moment."},
        {"rank": 10, "id": "SEC-008", "why": "Needs a product decision about the single-campus threat model before it is worth code."},
        {"rank": 11, "id": "SEC-015 / SEC-016 / SEC-017 / SEC-018", "why": "Low and info. Batch them whenever their files are open for another reason."},
    ],
    "open_questions": h["open_questions"],
    "artifacts": {
        "stage_doc": "docs/08-security.md",
        "handoff": ".pipeline/sec/handoff-08-security-T62.json",
        "handoff_schema": ".claude/schemas/handoff-security.schema.json",
        "handoff_validation": "jsonschema 4.25.1 Draft7Validator \u2014 0 errors, first attempt, 0 correction rounds used of the 3 permitted",
        "gate_record": "docs/gates/security-gate-M2.json",
        "raw_reports": [
            ".pipeline/sec/semgrep-T62.json",
            ".pipeline/sec/semgrep-T62.stderr.txt",
            ".pipeline/sec/detect-secrets-T62.json",
            ".pipeline/sec/history-secret-search-T62.txt",
            ".pipeline/sec/npm-audit-server-T62.json",
            ".pipeline/sec/npm-audit-client-T62.json",
            ".pipeline/sec/npm-audit-server-prod-T62.json",
            ".pipeline/sec/npm-audit-client-prod-T62.json",
            ".pipeline/sec/triage-false-positives-T62.json",
            ".pipeline/sec/manual-check-classes-T62.json",
            ".pipeline/sec/build-handoff-T62.py",
            ".pipeline/sec/build-gate-T62.py",
        ],
        "t60_artifacts_not_overwritten": True,
    },
    "environment_constraints_honoured": {
        "no_application_code_changed": (
            "Verified \u2014 nothing under server/src, client/src or tests/ was written by this run. "
            "Only docs/08-security.md, docs/gates/security-gate-M2.json and .pipeline/sec/* were created."
        ),
        "integration_and_nfr_suites_not_run": "Honoured \u2014 DATABASE_URL points at a live Supabase instance with real data.",
        "live_database_not_queried": (
            "Honoured \u2014 no ad-hoc query was issued against the live database. This is the reason "
            "the applied state of the RLS migrations is recorded as could-not-determine rather than as pass."
        ),
        "no_waiver_written": "Honoured \u2014 the waivers directory was never written to and does not exist.",
        "unlock_file_not_written": "Honoured \u2014 .pipeline/unlock was read only.",
        "human_only_gate_file_not_written": "Honoured \u2014 the human-only taste gate record under docs/gates/ was not touched.",
        "docs_01_through_07_not_edited": "Honoured \u2014 docs/07-plan.md was read for the Phase 0 gate only.",
        "no_git_operations": (
            "Honoured \u2014 no commit, no merge, no push. Branch task/T62-authz-security-gate still "
            "carries zero commits from this agent."
        ),
        "secret_values_never_printed": (
            "Honoured \u2014 .env was inspected by sha256 digest, placeholder-marker matching, "
            "version-prefix extraction and enum comparison. No secret value appears in any artifact "
            "this run produced."
        ),
    },
}

p = pathlib.Path("docs/gates/security-gate-M2.json")
p.write_text(json.dumps(gate, indent=2), encoding="utf-8")
print("wrote", p)
print("result:", gate["result"], "| counts:", gate["counts"], "| blocks_milestone_exit:", gate["blocks_milestone_exit"])
