# Runbook — T49: first staging deploy

**Owner:** human (you). **Blocks:** T11 (real signup on a real phone), which is what closes
Milestone 1. **Written:** 2026-08-04.

This is a checklist, not a tutorial. Every item on it exists because something in this repo
will misbehave — sometimes silently — if it is skipped. Where an item has a "what goes wrong"
line, that failure has already been observed or reasoned out during a gate, not imagined.

---

## 0. Before you start

The app deliberately **publishes nothing** right now. With no moderation provider bound
(T14b, M6), every question and answer is held pending. That is R6's fail-closed posture
working correctly (plan RR-21) — not a broken deploy. Do not spend an evening debugging it.

What you *can* prove on staging today: sign-up end to end, session persistence, posting into
the held state, and the feed rendering. That is T11.

---

## 1. Environment variables

Copy from `.env.example`, then set each of these for real. The app refuses to boot on several
of them rather than running degraded — that is deliberate.

| Variable | Value | If you get it wrong |
|---|---|---|
| `DATABASE_URL` | Managed Postgres DSN. **No `?sslmode=`** — see §2 | App refuses to start and tells you why |
| `DATABASE_SSL` | `verify-full` (see §2) | See §2 |
| `DATABASE_SSL_CA` | Path to Supabase's `prod-ca-2021.crt` (see §2) | `verify-full` fails with `SELF_SIGNED_CERT_IN_CHAIN` |
| `EMAIL_HASH_PEPPER_ACTIVE` | A real `v1:<random>` secret, **not** the one in `.env.example` | Refuses to boot (config guard, SEC-001) |
| `SESSION_SIGNING_KEY` | A real `v1:<random>`, **different** from the pepper | Refuses to boot |
| `EMAIL_PROVIDER` | A real adapter (e.g. `smtp`) — **never** `console` | Refuses to boot outside dev (PRV-6): `console` prints every student's email and live OTP to the log |
| `CAMPUS_EMAIL_DOMAINS` | The launch campus domain | Nobody can sign up, or the wrong people can |
| `TRUST_PROXY` | See §3 — the one that bites | Whole campus locked out at once |

Generate a secret:

```
node -e "console.log('v1:'+require('crypto').randomBytes(32).toString('base64url'))"
```

---

## 2. TLS to the database (SEC-002)

Set `DATABASE_SSL=verify-full`. Not `require`.

**The difference matters and is easy to wave away.** `require` encrypts the connection but
does **not** check who is on the other end — so someone positioned between the app and the
database can still present their own certificate, terminate the connection, and read every
credential and every `email_hash` in transit. `verify-full` encrypts *and* verifies. `require`
exists in this codebase only as a temporary escape hatch.

**Supabase needs its CA file for this to work.** Its chain is
`*.pooler.supabase.com` ← `Supabase Intermediate 2021 CA` ← `Supabase Root 2021 CA`, all
self-signed by Supabase Inc, so Node's built-in trust store rejects it with
`SELF_SIGNED_CERT_IN_CHAIN`. Fix:

1. Supabase dashboard → **Database Settings → SSL Configuration** → download `prod-ca-2021.crt`
2. Save it as `server/certs/supabase-prod-ca-2021.crt` (commit it — a public root CA is not a
   secret, and a runtime download is one more thing that can fail at boot)
3. Set `DATABASE_SSL_CA=server/certs/supabase-prod-ca-2021.crt`

**Take the CA from the dashboard, never from the live connection.** Trusting a root handed to
you by the endpoint you are trying to authenticate proves nothing — a machine-in-the-middle
simply presents its own root and you pin that. This is why the file is not auto-fetched.

Do **not** put `sslmode=` in the DSN. It silently overrides the app's own ssl setting (pg
merges the parsed connection string on top of the explicit config), so the two would disagree
with the invisible one winning. The app refuses to start if it finds one.

---

## 3. `TRUST_PROXY` — read this one twice

The SEC-007 rate limiters bucket requests by `req.ip` (`server/src/app.ts:20-29`).

- **Unset behind a load balancer:** every request reports the *proxy's* address. All callers
  share one bucket. The first few students exhaust the hourly signup budget and **the entire
  campus is locked out at once**, looking exactly like an outage.
- **Set too permissively:** a caller spoofs `X-Forwarded-For` and gets a fresh bucket per
  request — the limiter is then decorative.

Set it to the **number of proxy hops** in front of the app. On most single-proxy platforms
(Render, Railway, Fly, Heroku) that is `1`. Verify after deploy: two requests from your phone
and your laptop must produce two *different* buckets — the simplest check is that hitting the
signup limit on one device does not lock out the other.

---

## 4. Database

Run migrations against the staging database:

```
npm run migrate
npm run migrate:status
```

`008_row_level_security` must show applied. Then confirm the storage surface is actually shut
(this is SEC-003, and on the dev project it was wide open — `anon` had `SELECT/INSERT/UPDATE/
DELETE/TRUNCATE` on every table including `identity_account`):

```sql
-- expect: every table true / false
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;

-- expect: 0 rows
SELECT grantee, table_name FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee IN ('anon','authenticated');
```

**Do not set `MURMUR_TEST_DB_ALLOW` on staging.** It authorises the test suite to TRUNCATE
every table on the exact connection it names. It belongs on a developer machine pointed at a
disposable database, nowhere else.

---

## 5. After deploy — prove it, don't assume it

1. `GET /health` → `{"status":"ok"}`. A `503 degraded` means the app is up but cannot reach
   the database — usually TLS (§2) or the DSN.
2. Response headers on any route include `strict-transport-security`, `x-content-type-options:
   nosniff`, `content-security-policy`, and **no `x-powered-by`** (SEC-010).
3. Check the logs for one full signup. There must be **no email address, no OTP, and no
   session token** anywhere in them (PRV-5 / PRV-6 / SEC-005). If you see any of the three,
   stop and treat it as a leak — that is the product's core promise failing in the one place
   nobody looks.
4. **T11:** real student email, real phone, all the way to a nickname and a batch badge.

---

## 6. Known limitations to record, not fix today

- **The rate limiter is in-process.** At N instances the effective ceiling is N × the
  configured value. The TRD admits no second datastore at v1 scale, and per-instance is
  strictly better than the zero we had. **Deploy single-instance** until that changes.
- **`EMAIL_ENCRYPTION_KEY` is still blank (SEC-011).** `email_encrypted` is written NULL and
  everyone assumes encryption is on. Turning it on now leaves old rows unencrypted and new
  rows encrypted, so it needs a data migration, not a config edit. Open.
- **No client CSP (SEC-013).** The header in §5 rides on API responses; the document that
  actually executes script is the PWA, served by the gateway. Open.

---

## 7. If you have to roll back

`npm run migrate:down` reverses the last applied migration. Note that `008`'s rollback is
**deliberately asymmetric**: it disables RLS but does **not** restore the `anon` /
`authenticated` grants. A rollback exists to undo a broken change, not to re-open a security
hole — so rolling back is safe to do without re-exposing the database.
