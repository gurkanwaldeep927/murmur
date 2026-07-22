---
name: security-audit
description: Method for stage-08 security verification — SAST, secret, and dependency scanning plus the manual check classes automated scanners miss in AI-generated codebases. Used by security-agent.
---
# security-audit

## Method
1. **Tool matrix (boring defaults, pinned versions recorded):**
   | Class | Tool | Invocation | Pass signal |
   |---|---|---|---|
   | SAST | semgrep | `semgrep scan --config auto --json --output sec/semgrep.json` | 0 critical/high after triage |
   | Secrets | gitleaks | `gitleaks detect --report-format json --report-path sec/gitleaks.json` | exit 0 |
   | SCA | osv-scanner | `osv-scanner --lockfile <lf> --format json` per lockfile | 0 critical/high vulns |
   Fallbacks (record why): SAST=codeql if repo already uses it; SCA=trivy fs.
2. **Severity normalization:** map each tool's native severity to
   critical/high/medium/low; keep the native label in evidence. Semgrep
   `--config auto` findings tagged OWASP get category = the OWASP ID.
3. **Manual check classes** (top documented vibe-code failure modes; grep +
   targeted read, each result recorded pass/finding):
   - Secrets outside git history: `.env` committed? config files with literal
     keys the scanners deduped?
   - AuthZ, not just authN: every state-changing route/endpoint checks
     ownership/role — not merely "logged in". List endpoints from the TRD
     API surface; verify each.
   - Storage/DB rules: Supabase RLS enabled per table / Firebase rules not
     `allow read, write: if true` / S3 buckets not public — whichever the
     stack uses.
   - Webhook handlers verify signatures before acting (any payment/messaging
     integration in the TRD).
   - Rate limiting present on login/OTP/signup paths.
   - Input validation at trust boundaries (schema-validated request bodies).
4. **Triage rule:** a scanner finding may be marked false-positive only with
   file:line evidence explaining why; false-positive triage is itself
   provenance-tagged. When unsure, keep the severity.
5. **Output:** findings + counts + tool_runs into the stage-08 handoff shape.
