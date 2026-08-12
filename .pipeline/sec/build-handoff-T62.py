"""Builds and validates the stage-08 T62 security handoff. Verifier tooling, not app code."""
import json
import pathlib

FINDINGS = [
    {
        "id": "SEC-002",
        "severity": "high",
        "category": "A02:2021 Cryptographic Failures - unauthenticated TLS to the database",
        "location": "server/src/db/pool.ts:28; .env DATABASE_SSL=require; .env DATABASE_SSL_CA (empty)",
        "evidence": (
            "T62 re-verification of the T60 finding. The CODE fix landed and defaults safely: "
            "config/index.ts:161-162 derives 'verify-full' for any non-local host. The DEPLOYED "
            "configuration overrides it - the live .env sets DATABASE_SSL=require, which "
            "pool.ts:28 maps to {rejectUnauthorized:false}, and DATABASE_SSL_CA is empty so no CA "
            "is pinned either. DATABASE_URL host is aws-0-ap-southeast-2.pooler.supabase.com, i.e. "
            "a remote managed host reached over the public internet. Channel is encrypted but the "
            "peer is never authenticated, so an active machine-in-the-middle succeeds: it obtains "
            "the database password and every row - identity_account.email_hash, question/answer "
            "bodies, grievance_report contents. pool.ts:14-17 documents this exact property "
            "('it encrypts the channel but accepts any certificate'). Env values were read by "
            "digest/enum comparison; no secret was printed. DSN carries no sslmode= (checked), so "
            "the explicit option is what reaches the socket."
        ),
        "provenance": "semgrep@1.172.0:problem-based-packs.insecure-transport.js-node.bypass-tls-verification.bypass-tls-verification (native WARNING) + manual config re-verification (security-audit skill step 3, storage/transport class)",
        "fix_hint": "Download prod-ca-2021.crt from the Supabase dashboard into server/certs/, set DATABASE_SSL_CA to it and DATABASE_SSL=verify-full (or unset DATABASE_SSL entirely and let the derived default apply). Restart and confirm a query succeeds.",
    },
    {
        "id": "SEC-019",
        "severity": "high",
        "category": "A02:2021 Cryptographic Failures - identity hashes retained under a published pepper",
        "location": ".env EMAIL_HASH_PEPPER_RETIRED; .env.example:41; server/src/shared/email-identity.ts:85-92,121-124; server/src/config/index.ts:188",
        "evidence": (
            "Residual of T60 SEC-001, which was recorded as fixed. The ACTIVE pepper is genuinely "
            "rotated: its version prefix is now v2 and it carries no placeholder marker, and "
            "requiredSecret() at config/index.ts:32-46 refuses to boot on a placeholder. But "
            "EMAIL_HASH_PEPPER_RETIRED is still 'v1:change-me-in-every-real-environment' - byte- "
            "identical to the value committed in tracked .env.example:41 - and it is loaded by "
            "optional() at config/index.ts:188, which applies NO placeholder guard. "
            "hashNormalizedEmail() (email-identity.ts:103-106) writes new rows under v2, so new "
            "accounts are safe; candidateHashes() (email-identity.ts:121-124) keeps v1 live for "
            "lookups. Every identity_account.email_hash row still stored with the 'v1$' prefix was "
            "therefore computed with a secret any reader of this repository knows. Campus addresses "
            "are low-entropy and enumerable, so that reduces the keyed HMAC to a membership- "
            "confirmation oracle against the product's core anonymity promise (RR-7/RR-13). "
            "Reachability is narrower than at T60: migration 008 revoked the anon/authenticated "
            "grants, so the hashes are no longer readable by an anonymous PostgREST caller - "
            "exploitation now needs database access. That is why this is high and not critical. "
            "No rehash or backfill tool exists (server/scripts/ contains only "
            "admin-delete-identity.ts), and re-hashing verified accounts is impossible because "
            "email_encrypted is NULL for them (SEC-020)."
        ),
        "provenance": "manual re-verification of T60 SEC-001 (security-audit skill step 3, secrets-outside-git-history class); digest/marker comparison of .env against tracked .env.example:41",
        "fix_hint": "Decide and record what happens to the pre-rotation rows: either delete/quarantine every identity_account whose email_hash starts with 'v1$', or accept the exposure in writing with a named owner. Then clear EMAIL_HASH_PEPPER_RETIRED so the published pepper is no longer a live lookup key, and extend requiredSecret() to cover the RETIRED variable so this cannot recur.",
    },
    {
        "id": "SEC-021",
        "severity": "high",
        "category": "A09:2021 Security Logging Failures - live OTP and raw email written to stdout",
        "location": "server/src/modules/notification/email-provider.ts:59-73 (console.log at :66 and :72); .env EMAIL_PROVIDER=console; .env NODE_ENV=development",
        "evidence": (
            "Residual of T60 SEC-006. The code remedy landed: email-provider.ts:42-43 throws when a "
            "non-delivering provider is selected under a production NODE_ENV. That guard is keyed "
            "on NODE_ENV, and the live .env sets NODE_ENV=development while DATABASE_URL points at "
            "the live Supabase instance holding real data - so the guard permits the console "
            "provider against production data. ConsoleEmailProvider.sendVerification "
            "(email-provider.ts:66) then console.logs the raw recipient address and the raw "
            "verification OTP on one line. The OTP is a live account-takeover credential and the "
            "raw address is the one identifier the whole product exists to keep out of reach; "
            "stdout is what the host's log aggregation captures, and shared/logger.ts's "
            "REDACT_PATHS cannot help because this is a direct console.log, not a pino field."
        ),
        "provenance": "manual re-verification of T60 SEC-006 (security-audit skill step 3, secrets-in-config class); config read from .env by key enumeration",
        "fix_hint": "Point the environment that talks to the live database at a real adapter (EMAIL_PROVIDER=smtp with SMTP_HOST/SMTP_USER/SMTP_PASS), or point DATABASE_URL at a disposable database. Longer term, key the email-provider.ts:42 guard on whether DATABASE_URL is a remote host rather than on NODE_ENV, since NODE_ENV is the variable most likely to be wrong.",
    },
    {
        "id": "SEC-008",
        "severity": "medium",
        "category": "A01:2021 Broken Access Control - user enumeration / membership disclosure",
        "location": "server/src/modules/identity/identity.service.ts:62, :115; server/src/modules/identity/identity.routes.ts:22-33",
        "evidence": (
            "Still open, re-verified this run. A1 POST /verification/initiate returns 409 "
            "email_already_registered (identity.service.ts:115, and :62 on the same path) versus "
            "202 verification_pending (:91, :121), so an unauthenticated caller learns whether any "
            "given campus address already has a Murmur account. rateLimit(initiateLimiter) at "
            "identity.routes.ts:22 bounds the rate (10/hour/caller by default) but not the "
            "disclosure itself."
        ),
        "provenance": "manual re-verification of T60 SEC-008 (security-audit skill step 3, authZ class)",
        "fix_hint": "Return the same 202 shape for both the new-address and already-registered paths and deliver the difference by email instead, or accept the disclosure in writing given the single-campus threat model.",
    },
    {
        "id": "SEC-009",
        "severity": "medium",
        "category": "A01:2021 Broken Access Control - unauthenticated write endpoint",
        "location": "server/src/modules/analytics/analytics.routes.ts:56",
        "evidence": (
            "SEVERITY RE-ASSESSED DOWNWARD from T60's rating after reading the code as it exists "
            "today; T60's own evidence text ('eventSchema accepts actorProfileId (uuid, optional) "
            "and metadata (arbitrary record) from any anonymous caller') no longer matches the "
            "file. The forgeable-attribution half is FIXED: analytics.routes.ts:39-41 declares "
            "actorProfileId as z.undefined() so a client-supplied value is refused with a 400 "
            "rather than ignored, and attribution comes only from actorFrom() at :50-54, which "
            "requires a signature-valid session token. eventType is allowlisted at :64 and "
            "metadata is sanitized at :72. What remains is genuine and is what this finding now "
            "records: the route is registered with rateLimit(eventsLimiter) but WITHOUT "
            "requireSession, so any internet caller can write rows into analytics_event, which is "
            "append-only and never deleted from (PRV-1). Consequences: pollution of the six PRD "
            "metrics gating R8, and unbounded growth of a table with no retention. Two "
            "aggravators: (a) config.trustProxy is unset in the live .env, so behind a proxy every "
            "caller shares one rate-limit bucket (app.ts:24-33 documents this), which is both a "
            "bypass and a campus-wide lockout risk; (b) actorFrom() verifies the token signature "
            "but does not load the live profile, so a banned user's unexpired token still "
            "attributes events - contrast require-session.ts:44, where the live profile load is "
            "the revocation authority. The endpoint being unauthenticated is a deliberate, "
            "documented design choice (analytics.routes.ts:11-13: the registration funnel it "
            "measures happens before anyone has a session, PRD R8), so this is reported as "
            "residual risk on an accepted design rather than as a missing guard."
        ),
        "provenance": "manual authZ route review (security-audit skill step 3, authZ class) - re-verification of T60 SEC-009 against analytics.routes.ts as of commit 80b1b57",
        "fix_hint": "Keep the route unauthenticated but bound the damage: set TRUST_PROXY to match the deployment so the per-caller bucket is real, add a retention/rollup job for analytics_event, and consider having actorFrom() drop attribution for a profile that is banned or missing.",
    },
    {
        "id": "SEC-020",
        "severity": "medium",
        "category": "A02:2021 - documented security control silently inactive on live data",
        "location": "server/src/config/index.ts:74-101 (development branch at :78-79); server/src/shared/email-encryption.ts:29-31; .env EMAIL_ENCRYPTION_KEY (empty), .env NODE_ENV=development",
        "evidence": (
            "Residual of T60 SEC-011. The code remedy landed: emailEncryptionKey() at "
            "config/index.ts:80-85 refuses to boot when the key is unset outside "
            "development/test. The live .env sets NODE_ENV=development and leaves "
            "EMAIL_ENCRYPTION_KEY empty (verified: its sha256 equals the sha256 of the empty "
            "string), while DATABASE_URL points at the live Supabase instance - so the "
            "development branch at config/index.ts:78-79 returns '', key() at "
            "email-encryption.ts:18-19 returns null, encryptEmail() returns null at :31, and "
            "identity_account.email_encrypted is written NULL for real accounts while the schema "
            "notes and code comments all say the address is encrypted at rest. Storing nothing is "
            "confidentiality-SAFE, which is why this is medium and not high; the harm is that S2 "
            "resend and manual-fallback review will find an empty column, and that it makes "
            "SEC-019 unfixable - a v1-peppered row cannot be re-hashed because the plaintext "
            "address needed to recompute it was never stored."
        ),
        "provenance": "manual re-verification of T60 SEC-011 (security-audit skill step 3, storage class); .env inspected by digest comparison",
        "fix_hint": "Set EMAIL_ENCRYPTION_KEY in any environment whose DATABASE_URL is the live instance, and gate the config/index.ts:78 development escape on the database being local rather than on NODE_ENV.",
    },
    {
        "id": "SEC-012",
        "severity": "medium",
        "category": "A06:2021 Vulnerable and Outdated Components",
        "location": "package-lock.json (root/server tree); client/package-lock.json",
        "evidence": (
            "BOTH lockfiles scanned this run, closing T60's coverage gap (T60 left "
            "client/package-lock.json unscanned). Note there is no server/package.json - the "
            "server IS the root package, so package-lock.json is the server lockfile. Full tree: "
            "root critical 1 / high 4 / moderate 4; client critical 0 / high 2 / moderate 2. "
            "Production-only re-run (npm audit --omit=dev) returns 0 of every severity for BOTH "
            "trees. Every critical/high resolves into dev tooling: vitest "
            "(GHSA-5xrq-8626-4rwp, critical, and only exploitable while the Vitest UI server is "
            "listening, which no script here starts), vite (GHSA-4w7w-66w2-5vf9, "
            "GHSA-fx2h-pf6j-xcff, GHSA-v6wh-96g9-6wx3), nanoid (GHSA-2v37-7h3g-55p8), js-yaml "
            "(GHSA-5p4m-2wfm-xmqj) and brace-expansion (GHSA-mh99-v99m-4gvg, "
            "GHSA-rgw5-rvv9-x895) under the eslint chain. Held at medium rather than raised to "
            "the native critical/high because nothing shipped to a user carries them."
        ),
        "provenance": "npm@10.9.2 audit --json (SUBSTITUTE for the mandated osv-scanner, which is absent) - reports .pipeline/sec/npm-audit-{server,client}-T62.json and the --omit=dev pair",
        "fix_hint": "npm update vitest vite in both trees at the next convenient point; no production action required. Re-check with osv-scanner once a binary is obtainable, since npm audit only covers the npm advisory database.",
    },
    {
        "id": "SEC-013",
        "severity": "medium",
        "category": "A05:2021 Security Misconfiguration - no Content-Security-Policy on the document that executes script",
        "location": "client/index.html (no CSP meta tag present); server/src/app.ts:42-45",
        "evidence": (
            "Still open, re-verified: grep for Content-Security-Policy or http-equiv in "
            "client/index.html returns nothing. helmet() at app.ts:52 sets a CSP on JSON API "
            "responses only, and app.ts:42-45 states this explicitly and says SEC-013 stays open. "
            "The document that actually executes script is client/index.html, served by vite in "
            "dev and by the gateway in prod, and it carries no policy. This is the unenforced "
            "premise behind the OQ-14 decision to keep the session token in localStorage: that "
            "choice was accepted partly because the client has no third-party script surface, and "
            "nothing enforces that."
        ),
        "provenance": "manual re-verification of T60 SEC-013 (security-audit skill step 3, input-validation/trust-boundary class)",
        "fix_hint": "Serve a CSP header from whatever fronts client/index.html in production (default-src 'self'), and add the equivalent meta tag for dev so the two do not drift.",
    },
    {
        "id": "SEC-022",
        "severity": "medium",
        "category": "A08:2021 Software and Data Integrity Failures - CI actions pinned to mutable tags",
        "location": ".github/workflows/ci.yml:47, :48, :87, :90, :98, :105, :106",
        "evidence": (
            "Seven instances of a third-party GitHub Action referenced by a mutable tag "
            "(actions/checkout@v4, actions/setup-node@v4, gitleaks/gitleaks-action@v2) rather than "
            "by an immutable commit SHA. Whoever controls those tags can change what runs inside a "
            "workflow that has repository credentials. Recorded at medium per this run's "
            "normalization (semgrep WARNING -> medium); semgrep's own metadata rates the impact "
            "HIGH, and that native label is kept here rather than dropped. Not raised to high "
            "because the actions are first-party GitHub or a well-known scanner and this is "
            "near-universal practice."
        ),
        "provenance": "semgrep@1.172.0:yaml.github-actions.security.github-actions-mutable-action-tag.github-actions-mutable-action-tag (native severity WARNING, metadata impact HIGH, confidence HIGH) x7",
        "fix_hint": "Pin each `uses:` to a full commit SHA with the version in a trailing comment, and let dependabot bump them.",
    },
    {
        "id": "SEC-015",
        "severity": "low",
        "category": "A07:2021 Identification and Authentication Failures - bootstrap token replay",
        "location": "server/src/shared/session.ts:77-92; server/src/modules/session/session.routes.ts:29-52",
        "evidence": (
            "Still open, re-verified. issue() at session.ts:77-82 builds {sub, typ, iat, exp} with "
            "no jti, and POST /session/exchange (session.routes.ts:29-52) performs no consumption "
            "bookkeeping, so one bootstrap token mints unlimited session tokens until its 15-minute "
            "exp. Kept at low: the window is short, the token is HMAC-signed, the profile is "
            "re-read live at :38-41 so a ban lands in between, and holding the token already means "
            "holding the OTP."
        ),
        "provenance": "manual re-verification of T60 SEC-015 (security-audit skill step 3, authZ class)",
        "fix_hint": "Either add a jti plus a short-lived used-token set, or accept and correct the comment at session.ts:13 that describes the token as 'exchangeable once', since today it is not.",
    },
    {
        "id": "SEC-016",
        "severity": "low",
        "category": "A09:2021 Security Logging Failures - PII in operator output",
        "location": "server/scripts/admin-delete-identity.ts:19, :32, :41",
        "evidence": (
            "Still open, re-verified. The script prints the operator-supplied raw email address on "
            "the malformed path (:19), the not-found path (:32) and the deletion confirmation "
            "(:41); the address is also on the process command line (:11, argv[2]) and therefore in "
            "shell history and the process table. Low because it is an operator-run one-off, not a "
            "service path."
        ),
        "provenance": "manual re-verification of T60 SEC-016 (security-audit skill step 3, secrets-in-config class)",
        "fix_hint": "Print the email_hash instead of the address, and read the address from stdin rather than argv.",
    },
    {
        "id": "SEC-017",
        "severity": "low",
        "category": "Operational safety - destructive test guard retains a name-substring branch",
        "location": "tests/helpers/test-db.ts:43-63 (specifically :47)",
        "evidence": (
            "Materially improved since T60 but not fully closed. The blanket "
            "MURMUR_TEST_DB_CONFIRM opt-out is gone, replaced by MURMUR_TEST_DB_ALLOW pinned to an "
            "exact host/database fingerprint (:49-53), which is a real fix. The residual is the "
            "early return at :47, `if (db.includes('test')) return;` - still a name substring "
            "heuristic that authorises TRUNCATE across every table on any database whose name "
            "contains 'test'. It does not fire against this project's live database (every Supabase "
            "database is named 'postgres'), which is why it stays low."
        ),
        "provenance": "manual re-verification of T60 SEC-017 (security-audit skill step 3, storage class)",
        "fix_hint": "Drop the :47 early return and require the explicit fingerprint everywhere, or narrow it to a local host as well as a name.",
    },
    {
        "id": "SEC-023",
        "severity": "low",
        "category": "A04:2021 Insecure Design - no rate limit on the credential-exchange endpoint",
        "location": "server/src/modules/session/session.routes.ts:29",
        "evidence": (
            "New this run, from the skill's 'rate limiting present on login/OTP/signup paths' "
            "check. POST /session/exchange is the endpoint that mints a 30-day session credential, "
            "and it is the only credential-handling route registered with no limiter: A1 and A2 "
            "carry rateLimit(initiateLimiter/confirmLimiter) (identity.routes.ts:22, :42), A8 "
            "carries rateLimitByProfile (grievance.routes.ts:66), A12 carries rateLimit "
            "(analytics.routes.ts:56). Low, not medium: the token is an HMAC-SHA256 over a 32-byte "
            "key so grinding is infeasible, and each call costs one profile read. What is "
            "unbounded is the request volume itself."
        ),
        "provenance": "manual route review (security-audit skill step 3, rate-limiting class) - NEW in T62, not present in T60",
        "fix_hint": "Add rateLimit(<a new exchangeLimiter>) to session.routes.ts:29, bucketed by address like the other pre-session routes.",
    },
    {
        "id": "SEC-018",
        "severity": "info",
        "category": "A03:2021 Injection - dynamic code execution in a vendored, unreferenced bundle",
        "location": "client/src/components/support.js (2 x `new Function`, plus semgrep hits at :863, :1095, :1317, :1337, :1584, :1598, :1610, :1788)",
        "evidence": (
            "Unchanged since T60 and still not reachable. The file's first line declares it "
            "GENERATED from dc-runtime (the Claude Design preview runtime). Verified this run that "
            "NOTHING under client/src imports it: a grep for 'support.js', './support' and "
            "'components/support' across client/src returns no importer outside the file itself, "
            "so it is not on the client/index.html -> /src/main.ts path. semgrep's other hits in "
            "this file (wildcard postMessage at :1317 and :1788, prototype pollution at :1095, "
            "format string at :863/:1584/:1598/:1610) are recorded here for the same reason and "
            "with the same disposition. One semgrep rule "
            "(javascript.express.security.express-insecure-template-usage) TIMED OUT on this file, "
            "so SAST coverage of it is incomplete - which costs nothing while it stays "
            "unreferenced, and would need re-running if it is ever imported."
        ),
        "provenance": "semgrep@1.172.0 (multiple rules; see .pipeline/sec/semgrep-T62.json) + manual reachability check - re-verification of T60 SEC-018",
        "fix_hint": "Delete the file if the design preview runtime is no longer needed, or move it out of client/src so it is not mistaken for shipped code.",
    },
]

TRIAGED_FALSE_POSITIVES = [
    {
        "id": "FP-1",
        "finding": "javascript.node-crypto.security.gcm-no-tag-length.gcm-no-tag-length",
        "location": "server/src/shared/email-encryption.ts:45",
        "native_severity": "ERROR (would normalize to high)",
        "why_false_positive": (
            "The rule warns that a caller-influenced short auth tag could be accepted. Here the tag "
            "is not caller-influenced in length: it is a fixed-offset 16-byte slice, "
            "blob.subarray(12, 28), taken at email-encryption.ts:43 from a layout this module "
            "itself wrote at :36 ([12-byte IV][16-byte tag][ciphertext]). A truncated tag cannot be "
            "presented because the offsets are constants, so setAuthTag at :46 always receives "
            "exactly 16 bytes."
        ),
        "provenance": "semgrep@1.172.0:javascript.node-crypto.security.gcm-no-tag-length; triage by file:line read per security-audit skill step 4",
    },
    {
        "id": "FP-2",
        "finding": "javascript.express.security.injection.raw-html-format.raw-html-format (x2)",
        "location": "client/src/screens/question-feed.ts:62; client/src/screens/question-thread.ts:175",
        "native_severity": "WARNING (would normalize to medium)",
        "why_false_positive": (
            "Both sites interpolate user-generated content into markup, but every interpolation "
            "passes through esc() from client/src/screens/dom.ts:21-27, which replaces &, <, > and "
            "\". Checked the surrounding template at question-feed.ts:52-71 and "
            "question-thread.ts:165-177: every author, title, body, topic and badge value is "
            "wrapped in esc(), and each one lands either in a text node or inside a "
            "DOUBLE-quoted attribute - so esc() not covering the single quote does not open an "
            "attribute break here. If any future interpolation is placed in a single-quoted "
            "attribute this becomes real, so the gap in esc() is noted rather than dismissed."
        ),
        "provenance": "semgrep@1.172.0:javascript.express.security.injection.raw-html-format; triage by file:line read per security-audit skill step 4",
    },
]

MANUAL_CHECK_CLASSES = {
    "secrets_outside_git_history": {
        "result": "pass",
        "detail": (
            "No .env has ever been committed on any ref (git log --all --diff-filter=A over "
            "'*.env', '.env', 'server/.env', 'client/.env' returns nothing). The live "
            "EMAIL_HASH_PEPPER_ACTIVE, SESSION_SIGNING_KEY and the DATABASE_URL password were each "
            "searched across all history with git log --all -S and appear in zero commits, and in "
            "zero tracked worktree files. .gitignore:3-4 covers .env and .env.local. The tracked "
            "detect-secrets hits are all fixtures or the documented sample: .env.example:12, "
            "ci.yml:33/:40, .claude/agents/security-agent.md:32, and ten tests/unit/*.test.ts "
            "'Basic Auth Credentials' hits which are Bearer-token literals in test setup. The one "
            "real placeholder-derived exposure is tracked separately as SEC-019."
        ),
    },
    "authz_not_just_authn": {
        "result": "pass",
        "detail": (
            "All 18 registered routes enumerated from server/src/app.ts and the seven routers it "
            "mounts, and each examined on three separate questions (session? ownership? "
            "attribution?). Full table in docs/08-security.md. Every state-changing route that "
            "touches a row belonging to someone else enforces ownership rather than mere "
            "authentication: accept is restricted to the question author "
            "(reputation.service.ts:146), self-vote is blocked in the service "
            "(reputation.service.ts:94, :149) AND by a database trigger "
            "(003_reputation.up.sql:110-124), idempotency-key replay across users is refused "
            "(content.service.ts:108-111, :135-137), reads are viewer-scoped in SQL "
            "(content.repo.ts:127, :217, :236), and sync scopes every item to the session's "
            "ownerProfileId (sync.service.ts:246, :263, :277-278, :292). No route lets the caller "
            "influence whose identity a write is attributed to. The one unauthenticated write, "
            "POST /events, is recorded as SEC-009."
        ),
    },
    "storage_db_rules": {
        "result": "pass",
        "detail": (
            "Specifically re-verified the concern that migration 008 only sweeps tables existing "
            "when it ran. It does not leave the later tables uncovered: 003_reputation.up.sql:141- "
            "142 hardens ban_record and reputation_event, 004_offline_queue.up.sql:130 hardens "
            "sync_queue_item and content_draft, and 005_grievance.up.sql:125 hardens "
            "grievance_report, grievance_audit_log and grievance_officer_contact - each with "
            "ENABLE ROW LEVEL SECURITY plus a role-guarded REVOKE ALL for anon and authenticated. "
            "008 itself sweeps pg_tables (008:55-59), revokes the standing grants (008:70-72) and "
            "revokes the Supabase DEFAULT privileges that were re-issuing them (008:76-81). All 14 "
            "tables created across migrations 001-006 are covered; 007, 009 and 010 create no "
            "tables. Deliberate ENABLE-without-FORCE is documented at 008:20-37. "
            "[ASSUMPTION] verified against migration SOURCE only - this run did not query the live "
            "database to confirm the migrations are applied there."
        ),
    },
    "webhook_signature_verification": {
        "result": "not applicable",
        "detail": (
            "No webhook surface exists. A case-insensitive grep across server/src for webhook, "
            "x-hub-signature, stripe, razorpay and signature returns no handler; there is no "
            "payment or messaging integration in the TRD. Nothing to verify."
        ),
    },
    "rate_limiting_on_auth_paths": {
        "result": "finding",
        "detail": (
            "A1 initiate and A2 confirm both carry limiters (identity.routes.ts:22, :42) backed by "
            "FixedWindowLimiter with a swept, HMAC-keyed bucket table (rate-limit.ts:46-85), and "
            "A2 additionally burns a per-token guess budget (identity.service.ts:188, :199 against "
            "config.verificationMaxConfirmAttempts) - T60's SEC-004 is closed. The gap is POST "
            "/session/exchange, which mints the 30-day credential and has no limiter: SEC-023. "
            "config.trustProxy being unset also weakens every address-keyed limiter behind a "
            "proxy, noted inside SEC-009."
        ),
    },
    "input_validation_at_trust_boundaries": {
        "result": "pass",
        "detail": (
            "Every request body and route parameter is zod-parsed before use: "
            "content.routes.ts:83-90/:116-119/:122/:147-151/:178, analytics.routes.ts:33-42, "
            "reputation.routes.ts:31, grievance.routes.ts:26-38, sync.routes.ts:30-32, "
            "session.routes.ts:30-33, identity.routes.ts:15-17/:35-38. zod objects strip unknown "
            "keys by default, which is the second reason a client-supplied author field cannot "
            "reach a service call. Body size is capped at 256kb (app.ts:54) and sync batches at "
            "MAX_BATCH_ITEMS (sync.routes.ts:31)."
        ),
    },
}


handoff = {
    "stage": "security",
    "schema_version": "1.0",
    "inputs_consumed": [
        {
            "stage": "plan",
            "handoff_sha256": "78cb95758b9dacd9f30c491fba071772d5b8ce7f93d37aa57c16bbd2ea645997",
        },
        {
            "stage": "security-M1-T60",
            "handoff_sha256": "e950bb39a0fa0a6f7af8d1e34acb19ee68864a3b63f0b38247da1c8269e65bcc",
        },
    ],
    "status": "fail",
    "open_questions": [
        {
            "id": "OQ-SEC-02",
            "text": (
                "SEC-019 - EMAIL_HASH_PEPPER_RETIRED is still the published placeholder "
                "'v1:change-me-in-every-real-environment' (identical to tracked .env.example:41), so "
                "every identity_account.email_hash row stored with the 'v1$' prefix was computed "
                "under a pepper any reader of this repository knows. Those rows CANNOT be re-hashed, "
                "because email_encrypted is NULL for them (SEC-020) and HMAC is one-way. A human must "
                "decide between two options, both of which have a real cost: (a) delete or quarantine "
                "every v1$ identity_account row - this destroys real accounts and those students must "
                "re-register; or (b) accept the membership-confirmation exposure in writing, on the "
                "record, with a named owner. This agent cannot choose, cannot waive it, and has not."
            ),
            "owner": "gurkanwaldeep",
            "blocking": True,
        },
        {
            "id": "OQ-SEC-03",
            "text": (
                "SEC-002 and SEC-021 - the single environment that talks to the live Supabase "
                "instance is configured as a development environment: DATABASE_SSL=require "
                "(unauthenticated TLS, no CA pinned), EMAIL_PROVIDER=console (real OTPs and raw "
                "addresses to stdout), EMAIL_ENCRYPTION_KEY empty and NODE_ENV=development (which is "
                "what disarms the boot guards written for T60's SEC-006 and SEC-011). Each code "
                "remedy from T60 landed and each is bypassed by configuration. A human must decide "
                "whether to fix the configuration or to split dev and production environments; the "
                "M2 gate cannot pass while a live database is reached this way."
            ),
            "owner": "gurkanwaldeep",
            "blocking": True,
        },
        {
            "id": "OQ-SEC-04",
            "text": (
                "Tool substitution - gitleaks, osv-scanner and trivy are all absent from this machine "
                "and binary downloads have failed here before, so the mandated secret and SCA "
                "scanners could not be run locally. detect-secrets@1.5.0 (worktree only, NOT git "
                "history) and npm@10.9.2 audit (npm advisory database only) were substituted. This is "
                "partly compensated: the CI secrets-scan job runs the real gitleaks/gitleaks-action@v2 "
                "and succeeded on commit 80b1b57, which is this run's HEAD. Confirm whether that job "
                "scans full history or only the pushed commit range, and whether the environment "
                "should carry these binaries before T48 re-executes every signal from scratch."
            ),
            "owner": "gurkanwaldeep",
            "blocking": False,
        },
    ],
    "waivers_cited": [],
    "tool_runs": [
        {
            "tool": "semgrep",
            "version": "1.172.0",
            "exit_code": 0,
            "invocation": "semgrep.exe scan --config auto --json --output .pipeline/sec/semgrep-T62.json .",
            "report_path": ".pipeline/sec/semgrep-T62.json",
        },
        {
            "tool": "detect-secrets (SUBSTITUTE for gitleaks - absent)",
            "version": "1.5.0",
            "exit_code": 0,
            "invocation": "python -m detect_secrets scan --all-files > .pipeline/sec/detect-secrets-T62.json",
            "report_path": ".pipeline/sec/detect-secrets-T62.json",
        },
        {
            "tool": "git history secret search (SUPPLEMENT - detect-secrets does not read history)",
            "version": "git 2.x",
            "exit_code": 0,
            "invocation": "git log --all --diff-filter=A -- '*.env' .env server/.env client/.env; git log --all -S<live-secret> for EMAIL_HASH_PEPPER_ACTIVE, SESSION_SIGNING_KEY, DATABASE_URL password",
            "report_path": ".pipeline/sec/history-secret-search-T62.txt",
        },
        {
            "tool": "gitleaks via CI (MANDATED TOOL - ran remotely, not locally)",
            "version": "gitleaks-action@v2",
            "exit_code": 0,
            "invocation": "GitHub Actions job 'secrets-scan' on run 31521354238, commit 80b1b57 (this run's HEAD), conclusion=success",
            "report_path": "https://github.com/gurkanwaldeep927/murmur/actions/runs/31521354238",
        },
        {
            "tool": "npm audit (SUBSTITUTE for osv-scanner - absent; trivy also absent)",
            "version": "10.9.2",
            "exit_code": 1,
            "invocation": "npm audit --json (root/server lockfile) and (cd client && npm audit --json), plus --omit=dev re-runs of both",
            "report_path": ".pipeline/sec/npm-audit-server-T62.json, .pipeline/sec/npm-audit-client-T62.json, .pipeline/sec/npm-audit-server-prod-T62.json, .pipeline/sec/npm-audit-client-prod-T62.json",
        },
    ],
    "findings": FINDINGS,
    "counts": {
        "critical": sum(1 for f in FINDINGS if f["severity"] == "critical"),
        "high": sum(1 for f in FINDINGS if f["severity"] == "high"),
        "medium": sum(1 for f in FINDINGS if f["severity"] == "medium"),
        "low": sum(1 for f in FINDINGS if f["severity"] == "low"),
    },
    "gate_rule": "pass requires counts.critical==0 and counts.high==0 (unwaived)",
}

out = pathlib.Path(".pipeline/sec/handoff-08-security-T62.json")
out.write_text(json.dumps(handoff, indent=2), encoding="utf-8")

# Side artifacts consumed by the stage doc / gate record.
pathlib.Path(".pipeline/sec/triage-false-positives-T62.json").write_text(
    json.dumps(TRIAGED_FALSE_POSITIVES, indent=2), encoding="utf-8"
)
pathlib.Path(".pipeline/sec/manual-check-classes-T62.json").write_text(
    json.dumps(MANUAL_CHECK_CLASSES, indent=2), encoding="utf-8"
)
print("wrote", out, "findings:", len(FINDINGS), "counts:", handoff["counts"])
print("info-severity findings (not in counts object per schema):",
      sum(1 for f in FINDINGS if f["severity"] == "info"))
