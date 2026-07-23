# OQ-14 — Repeat-session / login mechanism: RESOLVED

Status: decided by engineering (plan task **T12**, M2), 2026-07-24. Lives here so the
decision exists in the repo, not in chat.

Answers the standing gap carried by three frozen docs:

- `docs/04-ux.md` OQ-14 — "Repeat-session/login mechanism after initial verification
  (session token lifetime, whether re-verification is ever required) is unspecified by
  any TRD API; a persistent session is assumed `[ASSUMPTION]`."
- `docs/04-ux.md` §5 — "Session persistence after S4 success is assumed."
- `docs/06-ui.md` `open_questions[repeat-session]` — "affects the authenticated shell
  for S5–S15 at integration time."

The TRD names **no** login/session API: A1 and A2 are the only identity endpoints, and
A2 terminates at "activated Identity Account + linked Pseudonymous Profile". Everything
below is therefore new design, constrained to not contradict the frozen docs.

## Decision

**Stateless, signed session tokens with a bootstrap exchange, a sliding 30-day
lifetime, and revocation via live profile status. No session table. No
re-verification per session.**

### 1. No session table — stateless tokens

`docs/05-schema.md` §3 is frozen at 14 tables and none of them is a session store.
Adding one would reopen the schema stage. A signed self-describing token needs no
storage, so the schema stays frozen. §7 ("Out of Scope") is not contradicted: it never
promised a session store.

Token shape (unchanged from M1's format, extended payload):

```
base64url(JSON payload) "." base64url(HMAC-SHA256(payload))
payload = { sub, typ, iat, exp }
```

`sub` is **`pseudonymous_profile.id` and nothing else**. The payload is base64, i.e.
readable by anyone holding the token, so it may never carry `identity_account_id`,
`email_hash`, or an email — NFR *identity non-disclosure* applies to tokens exactly as
it applies to response bodies.

### 2. Two token types — `bootstrap` and `session`

`typ` is part of the signed payload and is checked at every use site.

| | `typ: "bootstrap"` | `typ: "session"` |
|---|---|---|
| Issued by | A2 confirm (existing response field, plan T8) | `POST /session/exchange` |
| Lifetime | 15 min | 30 days (sliding, see §3) |
| Accepted by | `POST /session/exchange` only | every authenticated route |

Why the split rather than A2 returning a 30-day token directly: the A2 token is minted
at the end of an OTP flow, is present in the S4 screen state, and is the token most
likely to end up in a screenshot, a shared device's memory, or a log. Making it a
15-minute, single-purpose credential caps that exposure. The exchange is also the point
where the client proves it can persist state before it is handed a month-long
credential.

This does not retrofit the A2 response shape — `sessionToken` stays exactly as T8
shipped it; only its `typ` and meaning are now specified.

**Type confusion is a real attack**, so verification takes the expected `typ` as a
required argument; a token is never merely "valid", it is valid *as* a bootstrap or *as*
a session.

### 3. Sliding lifetime, no refresh tokens

A refresh-token family needs server-side rotation and reuse detection, which needs
storage, which needs a table. Rejected for §1's reason.

Instead: a session token is valid for 30 days absolute. When an authenticated request
presents a token older than the refresh threshold (7 days), the response carries a
freshly minted token in the **`X-Session-Refresh`** header, and the client swaps it in.

- An **active** user's token is continuously renewed → never logged out, which is what
  UX §5 assumes.
- An **inactive** user's token expires 30 days after last use → bounded exposure for an
  abandoned device.

The header is additive: a client that ignores it simply expires after 30 days.

### 4. Revocation without a session table

The standing objection to stateless tokens is that they cannot be revoked. Here they
effectively can, because **every authenticated request already loads the caller's
profile** to authorize it, and `pseudonymous_profile.status` is the revocation
authority that R5 (ban/suspend) already maintains:

- `active` → request proceeds.
- `suspended` → `403 account_suspended`.
- `banned` → `403 account_banned`.

A ban therefore takes effect on the banned user's **next request**, with no token
blacklist. The cost is one indexed primary-key lookup per authenticated request, which
the same request needs anyway to render an author identity.

Deleted profiles (`deleted_at` set) are treated as not-found → `401`.

### 5. Dedicated, rotation-safe signing key

M1's `shared/session.ts` signed with the email-hash pepper because no session key
existed yet (it says so in its own header comment). That is key reuse across two
unrelated security domains and would be a legitimate stage-08 finding, so T12 retires
it.

`SESSION_SIGNING_KEY` is versioned exactly like the email pepper (RR-13):
`v<n>:<secret>`. Issuing always uses the active key; verification accepts the active
key **and** `SESSION_SIGNING_KEY_RETIRED`, so a key rotation does not log out every
user mid-flight. Signature comparison is constant-time.

**Migration note:** rotating the session key invalidates nothing else; rotating the
*email pepper* no longer invalidates sessions, which was an unintended coupling in M1.

### 6. No re-verification per session

This is the direct answer to OQ-14's second half. A verified student re-opening the PWA
is authenticated by their stored session token. Re-verification (S1→S4 again) happens
only when:

1. the session token is absent, malformed, expired, or fails signature check, **or**
2. the profile behind it no longer exists.

A `suspended`/`banned` profile is **not** sent back through S1 — re-verifying would
imply a fresh registration attempt, which A11's ban check exists to refuse. It gets a
terminal state instead.

### 7. Client persistence: `localStorage`

The PWA stores `{ token, profile }` under one key and restores it at boot, calling
`GET /session` to confirm the token is still good before showing the authenticated
shell.

**Tradeoff, stated plainly:** `localStorage` is readable by any script that achieves
XSS, unlike an `httpOnly` cookie. Chosen anyway because:

- the client and API are **separate origins** in both the dev shape (Vite dev server →
  API on :4000) and the planned staging shape (T49: static host + app platform), so
  cookie auth would mean `SameSite=None` third-party cookies plus credentialed CORS —
  more moving parts and a worse default than a bearer token;
- the token authorizes **pseudonymous** actions only and carries no identity material
  (§1), so its theft does not deanonymize anyone — it impersonates a pseudonym;
- the XSS control is the client's own attack surface: no third-party scripts, and the
  design components are static markup.

**Revisit if** the deployment collapses to a single origin, at which point `httpOnly` +
`SameSite=Strict` cookies are strictly better and the exchange endpoint is the natural
place to set the cookie.

## Consequences

- **S5–S15 authenticated shell (M2+):** every route behind it uses the `requireSession`
  middleware, which attaches the caller's public profile. Route handlers never parse
  tokens themselves.
- **T15/T16 (A3/A4 create question/answer):** their "ban/suspend guard" is satisfied by
  the middleware, not re-implemented per route.
- **T37 (operator role, M5):** the payload gains a role claim then. Deliberately not
  built now — no operator authority exists until S16/S17 land, and an unused role claim
  is an unused attack surface.
- **T60/T62 (security-agent runs):** key reuse is retired ahead of the first run; the
  `localStorage` tradeoff above is the documented answer to the finding those runs will
  raise.
- **Frozen docs are not edited.** OQ-14 remains open *in* `docs/04-ux.md` as the record
  of what stage 4 knew; this file is the resolution, cited from `docs/BUILD-NOTES.md`.

## Rejected alternatives

| Option | Why not |
|---|---|
| DB-backed session table | Reopens the frozen schema for a problem a signed token already solves. |
| Long-lived token from A2, no exchange | Makes the most-exposed token in the flow a 30-day credential. |
| Refresh-token rotation family | Needs server-side reuse detection → needs the table §1 rules out. |
| JWT via a library | A dependency and a spec's worth of algorithm-confusion footguns (`alg: none`, RS/HS confusion) for a payload of four fields and one signer. |
| `httpOnly` cookie | Better in principle, but wrong for the two-origin deployment the project actually has today (§7). |
