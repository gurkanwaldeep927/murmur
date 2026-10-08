# Murmur — Task Status in Plain English

**Last updated: 2026-10-08**

A simple map of all 77 tasks: what each one actually *means*, whether it's finished, and
what went wrong along the way. No jargon. The formal version lives in `docs/07-plan.md`;
this file is the human-readable one.

**Interactive version:** <https://claude.ai/code/artifact/fbb2c323-e656-4583-bab6-640db91d76db>
— the same 77 tasks as a filterable board with per-task explanations, built from
`docs/task-board.html`. It is a *view*: ticking a box there is a personal note stored in that
browser. **This file remains the source of truth**, and a real status change is still an edit
here, in the same turn as the work.

**Score so far: 40 done · 0 half done · 32 not started · 5 waiting on something** *(= 77)*

**8 October engineering update:** the 77-task score is unchanged. A focused T28 repair
fixes posts lost during an in-flight sync, stale storage after a quota failure, the blank
first offline reload, and offline compose access after reopening. Independent unit
verification passed **269 tests**, and local integration/NFR verification passed **219**.
See `docs/PROGRESS-2026-10-08.md` for the evidence and remaining gates. These repairs do
not close T62 or a new milestone. The code commit's pushed-branch CI passed; see the
progress report for the exact run and the final delivery boundary.

*The previous line here read "28 done · 45 not started · 4 waiting", which added up to 77 but
was wrong on two of the three numbers — the half-done ones had nowhere to go and the waiting
ones were undercounted. Counted directly off the tables on 6 August.*

---

## What the app is (one paragraph)

Murmur lets college students ask questions anonymously and get answers from seniors at their
own college. You prove you're a real student with your college email, but nobody ever sees
your email — you get a nickname and a "batch of '26" badge instead. Every post is checked
before it goes public, so the space stays safe.

---

## Status meanings

| Symbol | Means |
|---|---|
| ✅ **Done** | Finished and tested |
| 🟡 **Half done** | Started, some parts left |
| ⬜ **Not started** | Ready to build when we get to it |
| 🔴 **Waiting** | Can't start — needs something from outside (you, a lawyer, a vendor) |

---

# Milestone 1 — Prove a student can sign up

*Goal: a real student signs up with their college email on a real phone and gets a nickname.*

| Task | In plain words | Status |
|---|---|---|
| T1 | Delete leftover junk files from the old setup | ✅ |
| T2 | Build the skeleton of the app — folders, server, empty phone app | ✅ |
| T3 | Set up the robot that checks our work every time we save code | ✅ |
| T4 | Set up the database and the system for changing its shape safely | ✅ |
| T5 | Make the app able to send the login code to someone's email | ✅ |
| T6 | *(You)* Write down how to read the admission year out of a college email | ✅ |
| T7 | Build "enter your email" — check it's a real college email, not already used | ✅ |
| T8 | Build "enter the code" — verify it, work out the year, create the nickname | ✅ |
| T9 | *(Designer)* Make the 4 sign-up screens look good | ✅ |
| T10 | Connect those 4 screens to the real sign-up system | ✅ |
| T44 | Start recording anonymous usage stats (how many sign up, etc.) | ✅ |
| T45 | Record the sign-up funnel specifically | ✅ *(see below)* |
| T50 | The scrambler that hides emails so nobody can read them from the database | ✅ |
| T55 | A test that checks no email ever leaks out in any response | ✅ |
| T60 | Security expert reviews the sign-up code | ✅ |
| T61 | Privacy expert reviews what personal data we store | ✅ |
| T49 | *(You)* Put the app on a real server on the internet | 🔴 waiting on you |
| T11 | Try the whole thing on a real phone with a real email | 🔴 waiting on T49 |

---

# Milestone 2 — Asking and answering questions

*Goal: post a question, get an answer, and nothing goes public without being checked.*

| Task | In plain words | Status |
|---|---|---|
| T12 | Stay logged in — don't make people re-verify every time they open the app | ✅ |
| T13 | Add database tables for questions, answers, topics, and safety checks | ✅ |
| T14a | The safety checker — holds every post until it's approved. **If it can't check, it refuses to publish** (safer than guessing) | ✅ |
| T15 | Build "post a question" | ✅ |
| T16 | Build "post an answer under a question" | ✅ |
| T17 | Build the home feed — show recent approved questions | ✅ |
| T18 | *(Designer)* Make the 4 main screens: feed, ask, thread, answer | ✅ |
| T56 | Tests proving nothing ever sneaks past the safety check | ✅ |
| T63 | Reliability expert tries to break the safety checker | ✅ |
| T19 | Connect those 4 screens to the real system | ✅ *(one bit left — see below)* |
| T51 | Finish recording usage stats for this section | ✅ *(see below)* |
| **T62** | **Security expert checks who's allowed to read/write what. Must pass before this milestone can close** | ⬜ **ran 13 Aug — failed on 3 things, all yours (see below)** |

**About T62 (ran 13 August — result: FAIL, and the reason is worth reading):** the security
review of *who is allowed to read and write what*. This one is **blocking**: Milestone 2
cannot close until it passes.

**The code passed. Your `.env` file did not.** That distinction is the whole result.

All **17** routes the server exposes were examined — every one, none skipped — against three
separate questions:

*(The report and the gate file say **18**, and both numbers are right: the table has 18 rows
because the 18th is the "no such route" fallback, which is not an endpoint anyone can call.
17 is the number of real endpoints. Written down here because two different counts of the
same thing look like one of them is a mistake.)*

The three questions: is it behind a login, does it check that the *thing* belongs to you, and
can a caller make the server write a post under somebody else's name. **The answer to the
third question is no, everywhere, on two independent grounds:** the author is always taken
from the verified session and never from the request body, *and* the request schemas throw
away any extra field a caller invents. The strongest check found anywhere in the codebase is
on "accept this answer" — only the person who *asked* may accept, and it is checked before
the already-accepted case, so a stranger cannot even learn whether a question is resolved.

**Zero critical. Three high — and all three are settings in `.env`, not code.** Nothing needs
to be programmed to fix them. Two are ten-minute jobs; one is a decision only you can make.

**1. The database connection is encrypted but the server is never checked.** `.env` sets
`DATABASE_SSL=require`, which explicitly overrides the safe default the code would otherwise
pick. "Require" means *scramble the traffic but accept whatever certificate shows up* — so
someone positioned between you and Supabase can present their own certificate, and get the
database password and every row in it. **Fix:** download `prod-ca-2021.crt` from the Supabase
dashboard into `server/certs/`, point `DATABASE_SSL_CA` at it, and set
`DATABASE_SSL=verify-full` — or simply delete the `DATABASE_SSL` line, because the code's own
default for a remote host is already `verify-full`. About ten minutes.

**2. Live student emails and their login codes are being printed to the screen.** `.env` has
`EMAIL_PROVIDER=console` and `NODE_ENV=development`. The console provider prints the raw
email address and the live one-time code to standard output, and it is *allowed* to run only
because `NODE_ENV` says development — while `DATABASE_URL` points at the real Supabase
database holding real accounts. So the one environment touching live data is the one
configured to have every guard switched off. **Fix:** two variables.

**3. Old email fingerprints were computed with a secret that is published in this repo.**
The *active* scrambling key was genuinely rotated — that part of problem #2 is properly
closed. But `EMAIL_HASH_PEPPER_RETIRED` still holds the placeholder
`v1:change-me-in-every-real-environment`, byte-for-byte the same as line 41 of the tracked
`.env.example`. Every `identity_account` row still stored under the old version was
fingerprinted with a secret anyone reading this project can see, which turns those rows into
a way to *test* whether a given student ever signed up. It is high rather than critical only
because migration 008 removed anonymous database access, so it now takes database credentials
rather than a public request.

**And this one cannot simply be fixed.** The fingerprints are one-way and the raw addresses
were never kept, so they **cannot be re-computed** under the new key. The two real options
are: delete or quarantine every old-version row — which destroys real student accounts — or
accept the risk in writing with your name on it. That is not a decision an agent may make,
so it is recorded as blocking and waiting on you.

**What the review confirmed is genuinely fixed** from the first security run (T60): the
scrambling key rotation, the login-code brute-force limit, the log redaction that stops the
database password reaching the logs, rate limiting on the sign-up path, the response security
headers, and the CI pipeline — the last one verified by reading the actual run's result on
this exact commit, not by trusting a note.

**One earlier finding was re-rated downward, deliberately.** T60 recorded that "record a usage
event" accepted a caller-supplied identity. **That is no longer true** — the field is now
refused outright and the actor is derived from a verified token. What remains is that the
route needs no login at all, which the product spec actually requires. Rated medium, and the
reasoning is written down rather than the old severity being copied forward.

**One thing the review could not settle:** whether the row-level database protections are
actually *switched on* in the live database. The migrations that enable them are correct and
were read line by line, but nobody queried the live database to confirm they were applied.
Written down rather than assumed either way.

**What this costs you right now, plainly:** Milestone 2 stays open. Nothing about the app's
own logic is blocking it — the three fixes are two `.env` edits and one decision. The full
report is in `docs/08-security.md`, and the machine-readable record is
`docs/gates/security-gate-M2.json`.

### The rest of T62's list — done the same night (13 August), and it does **not** unblock M2

The gate found fourteen things. Three are the highs above and they are yours. **The other
eleven were the smaller ones, and seven of those were mine — so they are done.** Full write-up:
`docs/08-security.md` §12, added *after* the report rather than edited into it, for a reason
worth knowing: a gate report that gets quietly rewritten can no longer be compared against its
own re-run. On 4 August a gate file claimed something was unfixed that had been fixed days
earlier, and a session went on re-diagnosing it. So the original stands and the fixes sit
underneath it, dated.

**Be clear about what this bought: nothing, as far as the gate is concerned.** The gate passes
only when there are zero critical and zero high findings. All three highs are `.env` values.
Nothing below touches them, so **M2 is exactly as blocked as it was.** What it does buy is that
when you fix those three, the re-run finds a short list instead of a long one.

**What actually changed:**

- **The one credential route with no limit at all now has one.** Signing in — swapping the
  short-lived token from the email code for a real 30-day session — could be called as many
  times a second as anyone liked. Worth understanding *why* that mattered, because the obvious
  answer is wrong: it was **not** that someone could guess the token. That token is signed, and
  guessing the signature is not realistically possible. It was that **every attempt makes the
  server ask the database a question**, and a route anyone can call for free that makes the
  database work is a way to knock the app over. It is now capped per device, like the two
  sign-up routes. The cap is deliberately looser than theirs, because an attempt here costs no
  email and **a student on a bad connection retrying must not get locked out of their own
  account.**
- **A comment was telling a lie, and the lie was the fix.** The code said the sign-in token was
  *"exchangeable once"*. It never was — nothing anywhere marked it used, so the same token works
  repeatedly for its full 15 minutes. Building real single-use was rejected on purpose: it needs
  the app to remember things between requests, which is exactly what the session design ruled
  out, and a half-version would be *worse* — single-use on one server and replayable across two,
  which looks enforced and is not. **So the comment now says what is true, with the cost written
  next to it:** whoever gets hold of that token has 15 minutes, not one use, and it cannot be
  cancelled. That is bounded by the new cap above, and the damage is one account whose own inbox
  already had the code. Seventh time a comment in this project claimed something the code did
  not do.
- **The guard protecting your real database got a second condition, and this is the one I would
  read twice.** The test suites wipe every row in every table. What stopped them doing that to
  your live data was that the database's *name* had to contain the word "test" — a spelling
  check, with no check of *which machine*. So any database anywhere named `something_test` was
  fair game. That was not theoretical: your `DATABASE_URL` points at the real Supabase database
  with real accounts in it. It now also has to be a database on this machine. **The cost:** if
  you ever run the suites against a remote test database, you now have to name it explicitly in
  a variable — the error message prints the exact line to paste.
- **Live student email addresses were being typed into the terminal.** The admin
  delete-an-account script took the address as a command-line argument and printed it back three
  times. Neither of those is the database, and that is the point: a command-line argument sits in
  your shell history **after** the account it names has been deleted, and is visible to every
  other program running at the time. Deleting the row and leaving the address in your history is
  not a deletion. It now reads the address from a pipe and identifies the account by its
  fingerprint instead of echoing it.
- **The robot that checks our work could have been swapped under us.** Each helper the checker
  downloads was pinned to a label like `v4` — and a label is a pointer its owner can move
  whenever they like, to anything. Those helpers run with access to the project's own
  credentials. All seven are now pinned to an exact, unmovable version.
- **Every known-vulnerable dependency is now gone — both halves, including the *critical* one.**
  This took two goes, and the two-goes part is the lesson. The report said "update two packages
  when convenient". It was not that: what remained needed jumping the **test framework across two
  whole versions and the build tool across three** — replacing them, not updating them. I did the
  easy three-quarters first and stopped, on purpose: if you bump the thing that *runs* your tests
  in the same change as you edit security code, and the tests go red, **you cannot tell which one
  did it.** So the security work went in and turned green on its own first. Then a second branch
  containing nothing but two version numbers had exactly one possible cause of failure — and it
  went green too. **Both dependency lists now report zero problems, at every severity.**

  **The scary word is worth defusing rather than celebrating.** One was labelled *critical* and
  genuinely was — but every one of them is a **development** tool: things that build and test the
  app on my machine, never anything a student's phone downloads. Both shipping lists were already
  clean before I started. That is why the gate rated it medium, and closing it does not
  retroactively make it worse than that.

  **What could not be known without trying, and now is known:** nothing else had to change. No
  test file and no source file was edited — which matters, because a dependency bump that quietly
  rewrites your assertions is how a test suite stops testing what it used to. And the one runtime
  path a build cannot check was checked by hand: the development server starts, and its
  forwarding-to-the-API still *engages* instead of silently serving the wrong thing — the exact
  bug from 2 August, where a missing entry served a web page to something expecting data and the
  error surfaced miles from the cause.
- **And a hole found beside it, in the checker itself.** The dependency scan had only ever looked
  at the server's list. The phone app's list — which is where the worst of these actually live —
  **had never been scanned at all, by anything.** It is scanned now.

**Two I deliberately did not touch, and the reason is the same in both cases: doing them would
have meant guessing.**

- **The browser-level protection (a "content security policy") cannot be written yet.** It is a
  rule telling the browser which servers the app may talk to. The app talks to its own API — and
  **nobody knows that address yet, because the app is not hosted anywhere. That is T49, yours.**
  I could have added the version that works on my machine, and it would have *silently broken
  every screen* in the real one, while looking finished. Left open with the reason attached.
- **The last unauthenticated route has three suggested fixes and not one of them is mine.** One
  is a setting that cannot be chosen until T49 exists. One needs a decision on **how long usage
  data may legally be kept — a lawyer's answer (T43)**, and inventing a number would mean
  wiring a job that deletes real data on a guess. The third is a genuine trade with no right
  answer written down anywhere: it would add a database lookup to the busiest write in the app.

**Verified, not assumed:** typecheck on both halves clean, lint zero errors, all 39 SQL
statements plan cleanly, **226 unit tests green across 28 files**, and the full pipeline green on
CI — read from the run's own result, including the database-backed tests that cannot be trusted
on this laptop. **And every new guard was watched failing first:** each was deliberately broken,
6 tests went red, then it was put back. An all-clear from a check nobody has ever seen fail is
not evidence — sixth time that has been applied here.

**About T45 (done 9 August):** proving the sign-up funnel is actually recorded — **and finding
that one of the six numbers the product promises was quietly wrong.**

The markers themselves were written back in July. What was never written was **anything that
checks they fire.** Exactly the hole found in T51 for a different section: a marker is one line
inside a branch, and a tidy-up can delete it without a single test going red. You'd find out at
T46, months later, with the work that produced it long finished.

**The first test of this path found a real bug in the product, not in the test.**

*"How many people who start signing up actually finish"* — activation — is one of the six
numbers the product promises. Its recording ran **inside** the database transaction that creates
the account. But recording a statistic is deliberately "fire and forget": it goes off on a
*different* database connection and does not wait. So it was arriving **before** the new account
existed, the database rejected it for pointing at somebody who wasn't there yet, and — because a
failed statistic is designed never to break anything — **it was thrown away in silence.**

So: every successful sign-up was being counted as not-finished. Activation would have read
**zero, for ever**, while people were signing up normally.

Nothing could have caught this. No test read that table on this path, and the only trace was one
warning line among many. It is the same shape as the very first serious bug in this project —
code that looked perfect, failed every single time, and was invisible because nothing was
watching. **Fixed:** all four sign-up outcomes are now recorded *after* the account is safely
saved. That also makes the other three honest, because a record of something that got undone is
a lie.

**Every dead-end branch is now tested too** — year unreadable, address banned, too many wrong
codes. Those are exactly the ones a tidy-up removes, because nothing visible depends on them.

**Two properties pinned that would be impossible to reconstruct later:**

- "Too many wrong codes" is recorded with **no name attached** — deliberately. Whoever burned
  through those guesses may well *not* be the owner of that address. Attaching a name would put
  an attacker's behaviour onto a real student's record.
- **No email address appears anywhere** in what gets recorded — checked against the actual stored
  text, not against the code that stored it.

**And a check the codebase asked for but could not enforce.** A comment in the code says "keep
this list in step with what the app sends". Comments have failed this project four times already.
There is now a test that reads the app's own source and proves every marker it sends is one the
server accepts. Without it, a marker the server doesn't recognise is refused with an error the
app never looks at — nothing breaks, nothing is logged, the number is just **absent**.

**About T51 (done 6 August):** "recording usage stats" means dropping little markers in the
code that say *this just happened*, so that later you can count how many people used the app
and how fast questions got answered. Three of the six numbers the product promises to measure
had **no source at all**:

- **How many people use it each week.** Nothing was recorded when anyone signed in or opened
  the app. Not "recorded wrongly" — not recorded. The file even had a comment saying a hook
  belonged there, and it had never been written.
- **How fast questions get answered.** The moment an answer became visible was never written
  down anywhere you could count it from.
- **How many posts the checker decided by itself versus handed to a human.** This one was
  recorded, but only at the instant someone pressed post. Every decision made *afterwards* —
  which, until the real checker is plugged in, is **every single decision** — was invisible.
  The number would have read "nothing ever gets decided" forever, while posts were in fact
  being decided.

All three now have a real source, and — for the first time in this project — the recording
itself has tests. There were none before: the only mention of that table anywhere in the test
suite was the line that empties it.

Two things were deliberately left alone, and both are written down in the code so the
reasoning gets re-examined rather than forgotten: no marker on every single request (that
table is never cleaned out, so one row per tap would make it the biggest thing in the
product), and none on logout (there is no reliable way to tell *who* logged out without
changing how logout behaves).

**About T19's "one bit left":** the app is wired up and works. What hasn't happened is the
*look-at-it-on-a-screen* check — comparing the finished screens against what the designer
asked for. That needs the app actually running somewhere, which needs **T49**. It's written
down as not done rather than quietly skipped.

---

# Milestone 3 — Search, upvotes, and bans

*Goal: find old answers, reward good ones, and keep bad actors out for good.*

| Task | In plain words | Status |
|---|---|---|
| T20 | Search by keyword, topic, and batch year | ⬜ |
| T21 | Database tables for points and ban records | ✅ *(see below)* |
| T22 | Upvote and "this answered my question" — points are awarded by the server so nobody can cheat | ✅ *(see below)* |
| T23 | Check bans everywhere — asking, answering, voting | ✅ *(see below)* |
| T24 | Actually issue a ban, and make it survive someone deleting their account | ✅ *(see below)* |
| T25 | ~~*(Designer — copy job)*~~ Search, topic list, profile screens — **it was mine, not yours** | ✅ *(see below)* |
| T26 | Connect those three screens | ⬜ |
| T52 | Record how people use search | ⬜ |
| T57 | Test: delete account → try to rejoin with same email → refused | ⬜ |
| T65 | Security expert attacks the ban system with tricks like `First.Last@` vs `first.last@` | ⬜ |
| T66 | Speed check on search and points | ⬜ |

**About T25 (done 9 August):** the search, topic-browse and profile screens are now in the
repo — **and this task should never have been on your list.**

**What actually happened: it was filed in the wrong lane.** This file has been telling you
for days that T25 is *"yours, 15 minutes — pull three screens out of the design project"*.
The working rules say something different, and they are right: Claude Design **creates**
screens; **landing** them in the repo is a copy job and belongs to me. The screens were
created back in July — all seventeen of them — so there was no design work left to do. I
have access to the design project, the full ID is written down, and the three files came
down in one go. **Nothing was blocked. It had simply been handed to the wrong person.**

Worth checking whether **T39** (the five moderator/report screens, still marked "designer")
is sitting in exactly the same mistake. On the face of it, it is.

**Copying the files is not the work. The work is the list of places these designs disagree
with the app that actually exists** — that list is in `client/src/components/README.md`, and
it is what T26 reads before wiring anything. At T18 that same list caught four mismatches
that would otherwise have been found one at a time, each costing a round trip to the
designer. Twenty-five went in this time. Six are worth your attention:

**The good surprise: two of the three screens can be wired up today.**

- **The profile screen is fully powered already.** Nickname, batch badge, points, and
  account state all come back from a call the app already makes on every open. When these
  screens were drawn, points did not exist yet and would have had to be hidden. **T22 fixed
  that on 8 August, so the points chip is real now.** The three account states the design
  draws — active, paused, closed — are the exact three the database allows. Nothing to
  translate.
- **Topic browse is powered too.** The five topic names in the design are letter-for-letter
  the five in the database, and asking the server for "questions in this topic" already
  works. This screen does **not** need the search work (T20) that everything else is waiting
  on.
- **Search itself has nothing behind it.** Not "partly" — there is no search in the app at
  all yet; what exists is "show me the recent ones". That is T20, and T20 is one of the
  things parked behind T62. So of the three screens, one is genuinely waiting.

**Three things that need a decision, and none of them is mine to make:**

- **The profile screen tells a paused student "this clears automatically; nothing is
  permanent." It does not clear automatically.** Nothing in the app ever pauses an account,
  and nothing would un-pause one — deliberately, from T24: no automatic punishment until a
  human moderator's desk exists in Milestone 5. A student reading that sentence would wait
  for something that is never coming. **Same shape as the "usually takes a few minutes"
  wording found at T19, and it gets the same treatment: a wording fix from Claude Design,
  not from me.** I did not rewrite it; that is not my lane.
- **The topic tiles each show a question count — "42 questions" — and there is no such
  number anywhere.** The server sends topic names and nothing else. Either the server starts
  counting, or the tiles stop claiming. **What must not happen is the app estimating it.** A
  believable wrong number that nobody can check is the exact failure this project has
  written down five times already.
- **The profile screen lists "your questions and answers", and there is no way to ask for
  them.** You can ask the server for a topic's questions; you cannot ask for your own. No
  task in the plan builds it. This is the *same missing piece* found at T34 for "my
  reports" — a screen the plan requires with no task feeding it. **Its likely home is T26.**
  Written down rather than quietly built here, because inventing an endpoint inside a copy
  job is how scope goes missing.

**About T24 (done 8 August):** actually issuing a ban — **this closes problem #7.**

Until today, "banned" was a state the app could *read* but nothing could ever *set*. The
sign-up check and the session gate had both been looking at columns no code ever wrote.

Issuing a ban now does three things together, or none of them: it writes the permanent ban
record, marks the profile banned, and marks the account banned. Together matters — a record
without the status change lets the person keep posting until someone notices, and a status
change without the record vanishes the moment they delete their account, which is exactly the
bug being fixed. There is a test that deliberately crashes the operation halfway and checks
nothing survived.

**And it now survives deletion, proven rather than argued.** The test deletes the account and
then tries to sign up again with the same address — refused. Also refused: the same address
with capitals, and with a `+tag`. Also checked, because a ban must not become a blanket
refusal: an unrelated student can still sign up afterwards.

**Nothing bans anyone automatically, and that is deliberate.** The obvious wiring would be
"the AI blocked this post, so ban the author". It was rejected: one blocked post is not a
severe violation, there is no severity measure to trigger on, and **the false-positive rate of
the AI checker is completely unknown until you get vendor quotes (T54)**. One wrong automatic
ban permanently removes a real student — permanently, because ban records are never deleted by
design. The trigger is meant to be a human, arriving with the moderator's desk in Milestone 5.
There is even a test asserting nothing calls it yet, so that when M5 wires it up, the decision
gets revisited instead of quietly drifting.

**What this costs you right now, plainly:** until Milestone 5, the app cannot remove anyone. It
can hold and block their posts one at a time, but a repeat offender stays. That is the real
state of the product.

**A crash found and fixed on the way.** Deleting an account and then trying to sign up again
with the same address returned a **500 error** — the app crashed. The sign-up check ignores
deleted accounts, but the database still reserves the address, so the insert collided and
nobody caught it. It now returns the honest "this email is already registered" instead. It
also means something more important: **the ban check never even ran** for a deleted account —
the crash happened first. Whether an *erased* address may ever be reused is a legal question
(T43/T70), deliberately not decided here; this only stops a crash from standing in for an
answer.

**And a second thing the same test found, which matters for the privacy work:** *an account
cannot simply be deleted.* The usage-statistics table and the points ledger both point at the
profile, so the database refuses to remove it. Whoever builds erasure (T70) has to decide, table
by table, between **deleting those rows** — which rewrites history and changes past numbers —
and **cutting the link but keeping the row**, which keeps the numbers but leaves a trail. That
is a real decision with a real cost either way, and it is better found now than at the moment
someone exercises their legal right to be forgotten.

**A gap in the plan, found while doing this and worth your attention:** *there is no way to
delete an account.* No screen, no endpoint, nothing — and no task in the plan builds one. But
T57 (Milestone 3) is written as "delete account → try to rejoin → refused", and the privacy
work in Milestone 5 assumes deletion exists. Today's test does the deletion directly in the
database, exactly as a real erasure would, and says so rather than pretending. **The likely
right home is T70 (privacy, M5)** — it should not be invented earlier, because the legal
retention decisions from T43 shape what deletion is even allowed to remove.

**About T23 (done 8 August):** checking bans everywhere.

**Most of this turned out to be already true, and the job was proving it.** Every signed-in
action goes through one gate that loads your profile *fresh from the database on every single
request* — so a ban takes effect on the very next tap, and no individual screen or endpoint has
to remember to check. There are now tests for asking, answering, upvoting and accepting,
including one that uses a session issued *before* the ban to prove the app trusts the database
and not the login token.

**One real thing was wrong, and it was the dangerous direction.** The ban lookup contained an
escape hatch: if the ban table did not exist, it answered *"not banned"* and let registration
continue. That was written deliberately back in July, when the lookup existed but the table did
not yet — and it was correct until 8 August, when the table arrived. Left alone it would have
become a permanent path where a database problem quietly readmits every banned person, with
nothing reporting it. **Removed.** An unreadable ban table now stops registration loudly. A
student who cannot sign up today is a problem someone fixes; a banned student who quietly gets
back in is not.

**One thing about matching that is worth knowing, because it is a deliberate trade.** A ban
follows the address through capital letters (`First.Last@` = `first.last@`) and through
`+tags`. It does **not** follow it through dots on a college domain — `first.last@` and
`firstlast@` are treated as two different people. Gmail treats them as one; most college
schemes do not, and collapsing them would refuse a real, different student. **The cost: if the
launch campus does alias dots, a banned person returns by removing one.** The fix, if so, is to
add that specific domain to the aliasing list — not to loosen matching for everyone. Written
down here rather than left in a code comment, because it is your call, not the code's.

**About T22 (done 8 August):** upvoting, and marking an answer as the one that solved it.

**The client never sends points.** It sends *which answer* — the server decides what that is
worth and writes it to the ledger. Sending `{"delta": 9999}` in the request body does nothing,
and there is a test that proves it, because "nobody can cheat" is the actual requirement.

**Four rules nothing upstream had decided, now decided and written down** in
`decisions/a6-vote-accept-semantics.md`, each with what it costs:

- **Only the person who asked can accept an answer.** "Accepted" means *this solved my
  problem*, and exactly one person knows. Cost: a question whose author never comes back can
  never have an accepted answer.
- **You cannot accept your own answer to your own question.** This one was a real hole. The
  frozen schema's anti-cheat trigger guarded upvotes only — so asking a question, answering it
  yourself and accepting it was 15 points out of nothing. Migration 009 widens the trigger.
- **One accepted answer per question, and it cannot be moved.** Cost, and it is the weakest of
  the four: accept the wrong answer by mistake and you are stuck with it. Un-accepting needs a
  compensating entry in the ledger, which brings its own abuse questions, and nothing needs it
  yet.
- **An upvote is worth 1, an accepted answer 15.** Both are guesses — no document anywhere sets
  them. They live as two named constants. Changing them later will *not* move existing scores,
  because the ledger records what was applied at the time, not a pointer to today's number.

**One thing found while building it, and fixed here:** you could have earned points on an
answer that was still being reviewed, or one that had been blocked. The plan's own wording is
"reputation on published content", and an answer nobody can see has not helped anyone yet.
Voting on unpublished content now returns "no such answer" — deliberately the same response as
a genuinely missing one, so someone guessing IDs cannot learn that a hidden answer exists.

**The promise T21 made is kept.** T21 chose to update scores instantly rather than by a
background job, and the price of that choice was that a bug could leave the stored score
disagreeing with the ledger. There is now a query that finds exactly that — and, more
importantly, **tests that deliberately corrupt a score and check the query notices.** An
all-clear from a check nobody has ever seen fail is not evidence, which is the same lesson as
problems 8 through 11e, in a different costume.

**About T21 (done 8 August):** two new tables — the points ledger and the ban list — plus the
rules the database itself refuses to break.

The points table is **append-only**: a score is not a number anyone sets, it is the sum of
everything that ever happened. That is what makes cheating structural rather than a rule
someone has to remember.

Two rules are enforced *inside the database*, not only in the code:

- **You cannot upvote your own answer.** A trigger checks the answer's author before the row
  is allowed in.
- **You cannot upvote the same answer twice.** An index refuses the second one. This half
  matters more than it sounds: if only the code checked, two taps arriving at the same instant
  would both read "not voted yet" and both go through. The database is the only place that can
  refuse the second one, because it decides at the moment of writing.

The ban list is **deliberately not linked** to accounts or profiles. That looks like an
oversight and is the opposite of one: a link is exactly what would let deleting your account
take the ban with it — the problem listed as #7 above. There is nothing for a delete to travel
along. It is matched by the same email fingerprint the sign-up check uses, so a capital letter
or a `+tag` cannot make a ban quietly stop matching.

**Two decisions were written down rather than left to whoever builds T22**, in
`decisions/oq-schema-aggregates-and-vote-enforcement.md` — the frozen schema document had
explicitly left both to the build stage:

1. **Scores update immediately, in the same transaction as the vote** — not by a background
   job. A background job that dies keeps serving stale numbers with nothing raising a flag,
   which is this project's most-repeated failure. The cost: T22 must ship a reconciliation
   query comparing the cached score against the ledger, so a disagreement is *detectable*
   rather than assumed impossible.
2. **The rule lives in the database, the message lives in the code.** Both layers stay. The
   code checks first so a student gets "you cannot vote for yourself" instead of a raw
   database error; the database refuses regardless of what the code checked.

**One thing about this migration that is easy to get wrong later:** it is numbered 003 but it
runs *after* 006, 007 and 008 on your existing database, because it was written later than
them. Migration 008 is the one that closed the biggest security hole (problem #6b), and it
works by sweeping every table that existed *at the time it ran* — so it will never see these
two. The protection is therefore written into migration 003 itself, which means it is correct
whether it runs before or after 008. There is a test asserting it, because a future tidy-up
that removes it as "duplicated" would silently strip the second lock off the two tables that
decide who is banned.

---

# Milestone 4 — Works without internet

*Goal: write a question with no signal; it posts itself when you're back online.*

| Task | In plain words | Status |
|---|---|---|
| T27 | Database tables for the offline outbox and saved drafts | ✅ *(see below)* |
| T28 | Save posts on the phone when offline, send them later | ✅ *(see below)* |
| T29 | Receive those saved posts, handle duplicates, check them for safety before publishing | ✅ *(see below)* |
| T30 | *(Designer)* The "sync status" screen — **brief written, ready for you** | ⬜ |
| T31 | Show the honest status of each post: waiting → sending → checking → live / blocked | ⬜ |
| T32 | A watchdog that alerts if any post gets stuck forever | ✅ *(see below)* |
| T58 | Test proving no offline post is ever silently lost | ⬜ |
| T68 | Speed test: what if everyone comes back online at once | ⬜ |
| T67 | Kill the server mid-save, then restore from backup. **Needs a database we're allowed to destroy and rebuild** | 🔴 waiting |

**About T28 (done 11 August):** the phone's own offline queue — writing with no signal, and
sending it later.

This is the half of offline mode that lives on the phone. T29 built the server side on
9 August; this is what feeds it.

**The one thing worth understanding, because everything else follows from it.** When you tap
"Ask" and the request fails, there are two completely different reasons, and treating them the
same loses posts:

- **The server answered and said no** — bad topic, rate limit, banned. Retrying that forever is
  how a queue becomes a landfill. It is shown as an error, exactly as before.
- **Nobody answered** — no signal, the request timed out, the connection died. **Nobody knows
  whether it worked**, including us. That, and only that, goes into the queue.

**The detail that decides whether you get one post or two.** A request that timed out may well
have been written by the server before the line dropped. So when the post falls back to the
queue it carries **the same idempotency key** the failed attempt used — the key that lets the
server recognise "this is the same post again" instead of creating a second copy. A fresh key
there would post the same question twice, under the student's own name, with nothing tying the
two together and no error anywhere. This is the single most load-bearing line in the task, and
there is a test that fails if the key is regenerated.

**A post can be destroyed by nothing but batch arithmetic, and that is now prevented.**
Write a question offline, then write an answer to it. The answer can only point at its question
by the id the phone invented. T29 is strict about this on purpose: an id the server has never
seen is *permanent* refusal, because nothing later can supply it. So if the batch cap happened
to cut between the two — or the phone's clock had drifted and made the answer look older — the
answer would arrive alone and be **thrown away for ever**. The queue now refuses to send a
child without its parent. And once the question does land, the answer's payload is rewritten to
the real server id, so it no longer depends on the server still holding a queue row at all.

**Two students on one phone do not share a queue**, and this is the one that would have been
worst. The queue is filed under the profile id, not the device. A shared queue would let the
second person's session flush the first person's posts — and the server attributes every synced
post to whoever is signed in at that moment, so those posts would go **live under the wrong
student's pseudonym**. In a product whose entire promise is that a post cannot be traced back
to a person, publishing one as somebody else is the worst thing that can happen, and it would
have looked exactly like the app working. Drafts are filed the same way, for a gentler version
of the same reason: a half-written thought is more private than a published post, because the
student never chose to show it to anyone.

**A ban ends the queue instead of being retried for ever.** T29 wrote down an obligation it
could not enforce: a banned account's whole batch is refused at the door with a `403`, and *"a
phone that retries on 403 would carry those posts forever"*. No response body can say that, so
it is now a rule in the client, with tests. **A dead session does the opposite** — it leaves the
queue untouched, because the posts belong to the profile, not to the login, and the same student
signing back in must find them still there.

**Autosave saves over itself rather than piling up.** T27 found that the frozen schema's two
halves disagreed: the table list allowed unlimited drafts, the index list allowed one. The index
list was right, and the local store reproduces both of its rules — one question draft per
student, one answer draft per question. Without that, "save as you type" leaves a draft every
few seconds and reopening the composer faces a pile of them. Nothing would error; the store just
grows.

**When the device won't let us save, it says so.** Storage can be full or switched off. The
session code is allowed to shrug at that — a session that doesn't persist is annoying. **An
outbox that doesn't persist loses the post**, so the failure is reported and the student gets a
different, honest sentence asking them not to close the app, instead of a reassuring one that
is untrue.

**Three things deliberately not built, each with its cost:**

- **No timed retry.** The queue drains when the browser says a network appeared, and that is
  all. There is no "try again in 30 seconds" loop, because a backoff schedule nobody has
  specified is a number invented on the spot — and the same batch re-sent during an outage is
  every phone hammering the server at its worst moment. *The cost:* a phone that comes back
  online without firing that event waits until the app is next opened. There is a test that the
  runner does not re-send a batch nothing came back from.
- **No sync-status screen.** That is S12, and its design is **T30, still yours**. Until it
  exists, a queued post is visible only on the card shown right after you write it. The queue
  itself is complete and tested, so T31 wires a screen onto something already known to work.
- **No "syncing" state on disk.** The database has one and nothing anywhere writes it — T32
  watches for it precisely because a state nothing writes is one nobody would notice being set
  by mistake. A phone that died mid-send with "sending" saved would own exactly that bug: not
  finished, not retryable, invisible. In-flight is held in memory only, and dies with the app.

**Every guard here was watched failing before it was trusted.** The parent rule, the ban rule
and the per-profile filing were each removed on purpose and the tests went red; then they were
put back. An all-clear from a check nobody has ever seen fail is not evidence — fifth time that
has been applied in this project.

**Three gaps found while building it, written down rather than invented around:**

1. **`content_draft` is a table nothing can reach.** T27 created it; there is no endpoint for it
   anywhere, in the technical spec or the code, and **no task in the plan builds one**. It
   changes nothing today, because a draft store that needs the network is not a draft store —
   local is right either way. What is genuinely missing is the *server* half: the reason that
   table carries a "newest wins" timestamp is cross-device drafts, and **starting a question on
   a laptop will not continue it on a phone**. Nobody owns that.
2. **Offline posts are invisible to the usage statistics.** The "a question was submitted"
   marker fires on the online path only, so from 11 August the funnel undercounts by however
   many posts are written offline. No event was added here on purpose: **there is no M4
   instrumentation task in the plan at all** (T51 covered M2, T52 covers M3, T53 covers M5), and
   inventing one event for one composer designs the metric one endpoint at a time — the exact
   mistake T34 wrote down and handed to T53. It needs a home.
3. **The sync result does not say whether a synced post was published or held.** A10 answers
   with the server id and nothing about moderation, so once a queued post lands the phone knows
   it arrived and cannot tell whether it went live or into the review queue. **T31 needs that
   distinction to draw its "checking" state honestly** — it will need a second read, or A10
   needs to carry the moderation status. Better found now than while wiring the screen.

**About T32 (done 9 August):** the watchdog for offline posts that never finish.

The product promises that **every** post written offline eventually ends up in one of three
states — posted, refused, or resolved. A promise like that is worth nothing unless something
could catch it being false, so this is that something. Every test for it **plants a stuck post
on purpose** and checks the watchdog spots it. An all-clear from a check nobody has ever seen
fail is not evidence — the third time that lesson has been applied in this project.

**Two deliberate omissions, both with a stated cost.**

**It doesn't retry.** The server keeps the post's text, so it *could* finish the job itself even
if the phone never comes back — and for someone who deleted the app, that's the only thing that
ever would. Not built, for one reason worth understanding: **a post appearing under a student's
name days later, at a moment they didn't choose, is a product decision, not a plumbing detail.**
It also needs a "give up after N tries" rule that no document anywhere sets. *The cost:* a post
whose phone never returns stays stuck for ever, and this watchdog keeps counting it for ever.
That's a permanent visible number rather than a queue that looks clean because nobody counted.
There's a test asserting no retry happens, so the decision gets revisited rather than drifting.

**It doesn't email anyone.** The complaint deadlines (T38) have a recipient the law requires to
exist. A stuck post doesn't — there is no engineer's mailbox configured anywhere, and inventing
one nobody reads would *look* like alerting while being nothing of the kind. It writes a proper
error line with counts on every check, which is the thing an alerting system reads. **T71 is the
task that turns it into something reaching a human. Until then it is visible in the logs and
nowhere else** — and that sentence is written into the code itself, not just here.

It watches a status called "syncing" as well as "waiting", even though **nothing in the app ever
sets "syncing"**. That's the reason to watch it: a state nothing writes is a state nobody would
notice being written by mistake and never cleared.

**About T29 (done 9 August):** receiving the posts a phone wrote while it had no signal.

**The whole design turns on one distinction: is this failure permanent, or is it "try again"?**
Get it backwards and a student loses a post they never did anything wrong with.

- **Permanent** — the topic doesn't exist; the question this answer replies to was itself
  refused; you voted on your own answer. None of these become true later, so the post is marked
  refused and the phone can stop carrying it.
- **Try again** — a database hiccup, a rate limit, an unexpected error. The post was never going
  to be refused. Marking it "refused" would *destroy* it. These stay queued with the attempt
  counted.

The list of permanent reasons is a **list of what IS permanent**, not a list of what isn't. So a
reason nobody has classified yet falls through to "try again". The cost of forgetting one is a
post that arrives a batch later; the cost of the other arrangement is a post thrown away.

**One bad post does not cost you the other thirty-nine.** There is no all-or-nothing here — each
item in the batch reports its own outcome. The technical spec is unusually blunt about this
("partial-batch failure is expected, not exceptional") and the code is shaped around it.

**Posts sent this way cannot skip the safety check — not because something checks, but because
there is no other road.** Sync doesn't have its own way to publish anything; it calls the exact
same "post a question" code the app uses when online. The test proves it by making the safety
checker return a specific verdict, which only happens if the checker actually ran.

**The hard case, and the one the outbox table exists for.** You're offline. You write a question,
then write an answer to your own question. Neither exists on the server yet — so the answer can
only refer to its question by the id **your phone made up**. The server now translates: it
processes them oldest-first, so the question gets a real id, and the answer finds it. If the
question was refused, the answer is refused too. If the question just hasn't landed yet, the
answer **waits** — it isn't refused, because its only problem is where it sits in a queue.

**A hole closed while building it:** the limit on how many reports one person can file lives on
the "report" endpoint. Sync doesn't go through that endpoint — so offline reporting would have
been a way around the limit entirely. It's now checked here too, and being over the limit counts
as "try again", not "refused".

**One thing done differently from the spec, deliberately.** The spec lists "banned user" as a
per-post rejection reason. A ban applies to the *person*, not to a post, so the whole batch is
refused at the door instead — by the same gate every other signed-in route uses. Writing a
second ban check to produce a prettier response is exactly the duplication that gate exists to
prevent. **This puts a job on whoever builds the phone side (T28):** a "you're banned" response
must make the phone stop retrying, not keep the queue forever. It's written down in the code,
because no response body can say it.

**And something recorded rather than faked.** The design allows for a "conflict" outcome —
two versions of the same thing, newest wins. **It can never happen today**, because every kind
of thing the queue can carry is a *new* post, never an *edit* — and nothing in the entire plan
builds editing. Rather than leave that as a comment, there's a test asserting no conflict is ever
produced. It will start failing the day editing arrives, which is exactly when someone needs to
design that rule instead of assuming it was already handled.

**A flaky test found and fixed on the way, and it matters more than it looks.** The usage-stats
writes are deliberately "fire and forget" — they're allowed to finish *after* the app has already
replied, so that recording a statistic can never slow down or break a student's post. But that
means a test which deletes an account can be beaten by a stats write still in the air, and it
fails on something unrelated to what it was testing. It did exactly that, **intermittently** —
which is the worst kind, because it teaches everyone to just re-run instead of reading. There's
now a way to wait for those writes to land, used by the tests. **The same thing will be needed
twice more:** by a proper shutdown (so a deploy doesn't discard the last few seconds of
statistics), and by the real account-deletion work in T70.

**About T27 (done 9 August):** the two tables the offline mode needs — the outbox, and saved
drafts.

**The design document contradicted itself, and copying it faithfully would have shipped the bug.**
The schema document has two halves: a list of tables, and a list of the indexes those tables need.
The index list says a student may have **one saved draft** — one for a question, one per question
they're answering. The table list, which is the half a database change gets copied from, says
nothing about it at all.

Copying the table list alone would have produced autosave with nothing to overwrite: **every
save inserts a new row.** A student writing one question would leave behind a draft for every few
seconds of typing, and reopening the composer would face a pile of them with no sensible way to
pick one. Nothing would have errored. The table would just have grown. Both indexes are in, with a
test for each.

**One thing about the replay guard that is easy to get backwards.** A phone that was offline
invents its own id for each post. The rule is "the same id twice **from the same student** is a
replay" — not "the same id twice, ever". Two different phones can independently invent the same
id, and that is two different people, not a duplicate. Making it globally unique would have
**refused a stranger's genuine post.** There is a test for both directions.

**These two tables are the most sensitive in the product, and that changes how they were built.**
Everything else stores things a student chose to publish. These store what they *haven't*: a post
waiting for signal that no moderator has seen, and a half-written thought that may never be posted
at all. So the same second lock that protects the complaints table is carried here too, and the
comment saying why is deliberately blunt — so nobody removes it later as duplication.

---

# Milestone 5 — Reporting and the moderator's desk

*Goal: report bad content, and a real human handles it within the legal deadline.*

| Task | In plain words | Status |
|---|---|---|
| T33 | Database tables for complaints and their audit trail | ✅ *(see below)* |
| T34 | "Report this post" — creates a ticket with a legal deadline attached | ✅ *(see below)* |
| T35 | The moderator's tools: take down, dismiss, or escalate — every action logged | ⬜ |
| T36 | A way for a moderator to decide on posts the AI flagged but nobody reported | ⬜ |
| T37 | Moderator-only access — students get a polite "not allowed" | ⬜ |
| T38 | Timers that chase the legal deadlines and alert the moderator | ✅ *(see below)* |
| T39 | ~~*(Designer — copy job)*~~ 5 screens: report, my reports, contact info, queue, resolve — **also mine, not yours** | ✅ *(see below — one finding here has legal weight)* |
| T40 | Connect the 3 student-facing ones | ⬜ |
| T41 | Connect the 2 moderator ones | ⬜ |
| T53 | Record report and moderation stats | ⬜ |
| T59 | Tests proving the legal deadlines are calculated right | ⬜ |
| T69 | Biggest security review — moderator permissions, complaint data | ⬜ |
| T70 | Full privacy audit — actually runs the data-deletion rules, not just reads them | ⬜ |
| T71 | Check the app produces useful logs before launch | ⬜ |
| T43 | *(Lawyer)* Confirm the legal deadlines and write the consent wording | 🔴 waiting on a lawyer |

**About T39 (done 9 August):** the five Milestone 5 screens — report, my reports, contact
details, and the two moderator ones. **Same wrong lane as T25**, same fix: they were already
drawn, and landing them is mine.

**One finding here is more serious than anything T25 turned up, and it is worth your five
minutes.**

**The report form cannot report the two worst things that can happen to someone.**

T34's whole achievement was that the legal deadline is decided by *what kind of complaint it
is* — a small set of severe categories get **24 hours**, everything else gets **15 days**.
The law names them. Three of the eight are on the fast clock: intimate images shared without
consent, doctored sexual images, and someone impersonating you.

The report screen offers **five** choices. **Two of those three are not among them.** A
student reporting intimate images of themselves posted without consent has nothing to pick
except *"Something else serious"* — which is the catch-all, and the catch-all is deliberately
**not** expedited. So the most urgent complaint the platform can receive would quietly be
given fifteen days instead of twenty-four hours.

Nothing is broken in the code. T34 locked the categories into the database precisely so a
deadline could never be wrong. **This defeats it from the other end: the category is correct,
it just cannot be chosen.** It needs a fuller list on the screen — a Claude Design change, not
something to patch in the wiring.

**The brief is written and waiting for you:** `docs/design-prompts/T39-round-6.md`. It carries
all eight reasons with what each one legally covers and which clock it starts, plus the other
four design corrections below. The eight values in it were diffed against the server's own list
before it was committed rather than copied by eye — eight for eight.

**Two more problems in the same list, smaller but real.** "Hate or threats" is one button for
two different legal categories, so the app cannot tell which one you meant. And *"Reveals
someone's real identity"* — doxxing, the single harm this entire product exists to prevent —
**matches no category at all.** Impersonation is pretending to *be* someone; this is unmasking
them. That gap sits above the screens, with the legal review (T43), and is written down rather
than invented around.

**Then the contradiction a student would actually hit.** Reporting is set to **anonymous by
default**. The toggle honestly warns that anonymous means no status updates — that is true and
permanent, because an anonymous report deliberately stores nobody (T33). But the confirmation
screen straight after says *"Track it anytime in My Reports."* On the default path, that is
false. Either the default flips or the confirmation changes. **What must not happen is
"fixing" it by quietly attaching the reporter to anonymous reports** — that is exactly what
T33 built the anonymity to prevent.

**The contact page invents a person.** It shows a named grievance officer with an email and a
phone number. All three are the designer's placeholders. The *process description* underneath
is correctly stamped PLACEHOLDER — the human being is not. A named person with contact details
on a legally-required page reads as real. **Safer shape: the page refuses to show contact
details it does not have**, rather than falling back to invented ones. The real details are
**T42**, yours.

**And that page has to work for someone who does not have an account** — the design says so
and the law expects it, because a student refused at sign-up still needs to reach a human.
Every complaint route today requires being signed in. Whoever builds that endpoint (T40) needs
to know this before they build it the obvious way.

**On the moderator screens, two things are worth knowing.** The queue's underlying table is
already complete — nothing needs building in the database. But until the real AI checker is
plugged in (**T14b**), every item in that queue arrives with **no AI verdict at all**, because
nothing classified it; it got there by giving up after repeated failures. The console must say
that plainly instead of showing an empty box that looks like a bug.

And the resolution screen contains a trap that would have shipped silently: it warns the
moderator *"you are about to resolve this late"*. If that warning is wired to the field it
looks like it should use, **it would never once fire** — because that field only becomes true
*after* something is resolved late. It has to compare the clock to the deadline instead.
Sixth time this project has found a check that could never fail; it was caught before being
built, which is the cheapest place to catch it.

**About T38 (done 9 August):** the watchdog that chases the legal deadlines.

**The task title asks for three timers. One of them should not exist, and building it anyway
would have been the dangerous choice.** The "acknowledge within 24 hours" timer has nothing to
count down to — T34 acknowledges every report in the same single write that creates it, so the
deadline cannot be missed by anyone being slow. A countdown there would sit silent forever, and
**that silence would have been read as compliance.** What it does instead: a report with no
acknowledgement means the code that files reports is *broken*, so it is alerted the moment it is
seen, at any age. There is a test that breaks one on purpose.

**The "deadline approaching" warning is a percentage, not a number of hours.** This sounds like a
detail and is not. A single fixed warning window cannot serve both clocks: "two days left" on a
24-hour deadline fires *before the report was even filed*, and "six hours left" on a 15-day
deadline arrives about ninety hours too late to do anything with. So the warning fires when **a
quarter of that category's budget remains** — 6 hours on the fast clock, 3¾ days on the slow one.
It stays correct on its own if the lawyer (T43) changes the deadlines.

**A missed deadline gets one email, and a count on every single check.** One email, because an
alert that repeats every five minutes is an alert people filter out. A count every check, because
a breach nobody has acted on must not go quiet just because its one email was already sent. That
number is what a monitoring rule (T71) watches.

**Nothing is recorded as "sent" unless it was actually sent.** Right now the app has **nobody to
send these to** — the officer's contact details are T42, which is yours, and no fallback address
is set. So today every check finds the alerts, sends nothing, **writes nothing**, and logs one
loud line saying it has no recipient. The alerts stay *due*: there is a test that adds an officer
afterwards and watches them fire. Writing "the officer was notified" into a legal record when
nobody was notified is worse than having no record at all.

**The alert emails say almost nothing on purpose** — ticket number, category, deadline. No
reported post, no reporter, no author. An operator's mailbox is a place things get forwarded from,
and the whole promise of this product is that a post can't be traced back to a student. The
officer opens the ticket in the console to see the rest. The test checks the actual text of the
email, not just that one was sent.

**Where the watchdog keeps its memory, and why it matters:** in the complaint's own audit trail,
not in a new hidden field. "The officer was warned at 14:02" is exactly the kind of fact that
belongs in a compliance record, and it means no database change was needed to build any of this.

**What it costs you right now, plainly:** until **T42** (your task — the real grievance officer's
name and contact), this entire watchdog can see the deadlines and can tell nobody about them. It
is not broken and it is not silent — it says so on every check. But nothing reaches a human until
that contact exists.

**About T34 (done 9 August):** "report this post" — the ticket, and the clock attached to it.

**The thing this task was for turned out to be missing.** The job is *"work out the legal
deadline"*, and the technical spec says the deadline depends on **what kind of complaint it is**:
most things get 15 days, but a small set of serious ones — someone's private images posted
without consent, someone impersonating them — get a matter of hours, because the law says so.
The database built yesterday (T33) has **no field saying what kind of complaint it is.** Just a
free-text box called "reason". So there was nothing to decide the deadline from.

**Fixed by reading the design brief literally.** It says the reporter *"selects a reason"* — a
selection is a fixed list, not a sentence. So the reason **is** the category: eight fixed
choices, three of them on the fast clock. Nothing new was added to the database; the existing
"reason" box is now restricted to those eight, **by the database itself**.

Why restrict it in the database and not just in the code: if anything can write any reason, then
a reason the deadline table has never heard of quietly gets the 15-day clock — on a complaint
the law may give 24 hours. That failure is invisible. It looks like a perfectly normal ticket
with a perfectly normal deadline, and it is simply the wrong deadline.

**The second hole, and this one is the interesting one.** T33's achievement was that "this
deadline was missed" is worked out by the database and cannot be set or unset by anyone. But it
is worked out by comparing *when it was resolved* against *when it was due* — and **when it was
due could still be edited.** So the flag could be defeated without ever being touched: move the
deadline out a month, resolve late, and the record reads clean. The front door was locked and
the back door was open. **The deadline is now frozen the moment the ticket is filed** — the
database refuses any attempt to change it, and there is a test that tries.

*The cost of that, stated:* a ticket filed under the wrong reason cannot have its deadline
quietly corrected. If it needs re-categorising, that has to become a proper, logged operator
action — not an invisible update. That is deliberate.

**Every report is acknowledged the instant it's filed**, in the same single write that creates
it — so the "acknowledge within 24 hours" rule can never be broken, because there is no way to
create a ticket without acknowledging it. The audit trail records that acknowledgement as done
*by the system*, never as a human having read the complaint; telling those two apart is the
whole reason that log exists.

> **This changes a later task, so it is written here rather than discovered there.** T38 is meant
> to build "timers that chase the legal deadlines". Its acknowledgement timer now has nothing to
> count down to. What it should do instead is check that no ticket exists *without* an
> acknowledgement — a ticket that has one missing is a bug in this code, not a slow human. The
> query for it is written and there is a test that deliberately breaks a ticket to prove the
> query notices. **A timer that can never fire would otherwise be mistaken for compliance.**

**Reporting the same thing twice adds to your existing report instead of opening a second one.**
A second ticket would come with a second deadline and a second "was it late?" flag, and would sit
open forever, making both the queue and the lateness statistics look worse than reality — for an
event that told nobody anything new. The fact that you reported twice is written into the audit
trail, where facts about a ticket belong.

**Anonymity holds in the audit trail too, not just on the ticket.** This is the half that is easy
to miss: an anonymous report whose *log* still names the reporter is anonymous on the screen only,
and any later query undoes it. **The honest cost:** anonymous reports cannot be de-duplicated,
because matching needs the reporter's identity — the very thing anonymity refuses to store. So
repeated anonymous reports on the same post create separate tickets. Storing the reporter "just
for de-duplication" would undo exactly what T33 built. What bounds it instead is the rate limit.

**And that rate limit counts per person, not per device** — unlike every other limit in the app,
which counts per device because those routes have no signed-in person to count. Reporting does.
A whole campus shares one internet address, so counting reports per device would let one abusive
reporter lock out everyone on the same network. That is the same "lock out the whole campus"
failure already written down against `TRUST_PROXY`, arriving by a different road.

**All the deadline numbers are guesses until a lawyer says otherwise (T43).** 24 hours to
acknowledge, 24 hours to resolve the serious categories, 15 days for the rest. They live as three
named values so the legal review is one edit — and changing them will **not** move tickets that
already exist, because each ticket stores the deadline that was in force when it was filed, and
that value is now frozen. That is what a compliance record has to do.

**A gap found, not invented around:** there is **no way to read your own reports back.** The "My
Reports" screen needs one and no task in the plan builds one — this task's spec is intake only.
It is recorded rather than quietly added; its likely home is **T40**, the first task that cannot
proceed without it. Same for usage statistics on reporting: that belongs to T53, in full, so the
events get designed against all the reporting screens at once rather than one endpoint at a time.

**About T33 (done 8 August):** the three tables the complaints process needs.

**The one worth understanding: "this deadline was missed" is not a flag anybody sets.** The
database works it out from two timestamps — when it was due, and when it was actually
resolved. Nobody can forget to mark it, and, more to the point, **nobody can un-mark it**:
there is a test that tries to write the flag directly and the database refuses outright. On a
process with legal deadlines attached, that difference is the whole thing.

An overdue-but-unresolved report reads as **not breached** — it is unfinished, not late. The
breach is a fact about when it actually got resolved.

**Anonymity is stored, not styled.** An anonymous report keeps no reporter at all, rather than
keeping the reporter and hiding them on screen. Hiding on screen is something a future query
can undo by accident.

**The audit log only accepts three kinds of actor** — the reporter, an operator, or the system
— because being able to tell an operator's action from an automatic one is the entire value of
having the log. Anything else is refused by the database.

Same apply-order trap as T21: numbered 005, but it runs *after* the security migration on your
database, so it carries its own locks. Tested.

---

# Milestone 6 — Turn on real AI checking, then launch

*Goal: a real AI checks posts, everything is measured, and we get a go/no-go decision.*

| Task | In plain words | Status |
|---|---|---|
| T54 | *(You)* Get prices from AI content-checking companies. **Can be done any day — earlier is better** | 🔴 waiting on you |
| T14b | Plug the chosen AI in and tune it. **Until this is done, nothing users post ever goes public** | ⬜ |
| T64 | Try to trick the AI with sneaky text hidden inside posts | ⬜ |
| T42 | *(You)* Write the real legal page and put the real officer's contact details in | ⬜ |
| T46 | Prove every number you care about can actually be calculated | ⬜ |
| T72 | *(You)* Emergency guide: how to change the secret keys | ⬜ |
| T73 | *(You)* Emergency guide: what to do if the AI checker goes down | ⬜ |
| T74 | *(You)* Emergency guide: what to do if a legal deadline is missed | ⬜ |
| T75 | *(Lawyer)* Emergency guide: what to do if there's a data breach | ⬜ |
| T76 | Privacy expert signs off the final privacy document | ⬜ |
| T47 | Run every single test one last time | ⬜ |
| T48 | **The launch decision.** Re-checks everything from scratch, trusts nothing, says GO or NO-GO | ⬜ |

---

# Problems we hit, and where

## 🔴 Serious — these would have broken the product

### 1. Posting questions could never have worked (T14a, T15, T16, T17)
**What broke:** Two pieces of database code had a mistake that made the database reject them
every single time. Not "sometimes" — always. These two pieces are what marks a post as
approved and publishes it. So **no post could ever have gone live.**

**Why nobody noticed:** The code *looked* perfect. The spell-checker for code (TypeScript)
can't read inside database instructions — to it, they're just text. And all 39 quick tests
passed, because those tests deliberately don't touch the database.

**How we found it:** The first time we connected to a real database, on 1 August.

**Fixed:** Yes, and now proven working by real tests.

---

### 2. Everyone's email could have been unscrambled (T50)
**What broke:** The secret key used to scramble email addresses was still set to the example
value — `change-me-in-every-real-environment` — which is written in a public file. Anyone who
read the project could have unscrambled every student's email and destroyed the anonymity the
whole product is built on.

**Fixed:** Yes, on 30 July. New secret, plus the app now **refuses to start** if it finds a
placeholder key. A comment saying "change me" didn't work; refusing to boot does.

---

### 3. Held posts could get stuck invisible forever (RES-3, affects T14a)
**What's broken:** If the safety checker fails in an unexpected way, the "try again" counter
doesn't move. So the post is never retried and never sent to a human. It just sits there,
invisible, forever.

**Why it was the nastiest one:** nobody would ever have noticed. The student can't see their
post, nobody else can see it, and nothing raises a flag. It just quietly doesn't exist.

**Fixed:** ✅ **2 August.** Every kind of failure now moves the counter, so the post always
reaches a human eventually. Two related problems in the same area were fixed at the same
time: a confused answer from the safety checker used to crash the app (now it just holds the
post, which is the safe thing), and a wrongly-configured safety checker used to look fine at
startup and only break when the first student posted (now the app refuses to start).

---

### 4. A dropped database connection can take the whole server down (found 6 August, fixed 7 August)

**What's broken:** the app keeps a pool of open database connections. Connections that are
sitting idle sometimes die on their own — the network hiccups, the provider recycles them.
That is normal and expected. What is not normal is that **nobody is listening for it.** The
pool is created with no error handler, so when an idle connection dies the failure has
nowhere to go and becomes an unhandled crash.

**Why it matters twice over:**

1. **In production it can kill the process.** Not because of a bug in our logic — because of
   a network blip we already know happens.
2. **It prints the database password.** When that unhandled error is reported, whatever
   catches it dumps the entire connection object, and the password sits in the middle of it
   in plain text. Seen doing exactly that in a test run on 5 August.

**What is NOT affected:** `.env` is not in git and never has been, so the password never
went into the repository or its history. It has only ever appeared in output on your own
machine.

**Two separate things to do:**
- **You: still outstanding.** Rotate the database password in the Supabase dashboard, since
  it has been on screen. The code fix below stops *new* leaks; it cannot un-see the one that
  already happened.
- **Us: done 7 August.** The listener is in (`server/src/db/pool.ts`). A dying idle
  connection is now one line in the log instead of a crash, and the line carries only two
  things — the error's message and its code (`ECONNRESET` and the like). The error object is
  deliberately **not** handed to the logger whole, because that object is what holds the
  connection, and the connection is what holds the password. Copying two harmless fields out
  is the only shape that can't quietly regress into printing it again.

  Five tests came with it, and they check both halves separately, because they are two
  different bugs wearing one coat: that a failure no longer escapes the process, and that
  the password never appears in what gets written. The password one asserts against the
  actual text of the log line, not the object — the leak happens at the moment of writing,
  so only the written bytes prove anything.

  ~~**One place still has the same hole and was left alone on purpose:**~~
  `scripts/db-inventory.ts` — **closed 9 August.** The hand-run inventory script built its own
  connection pool with no listener, so if it ever failed while you were watching it could still
  print the password. It now has the same listener, using the *same shared function* as the
  server rather than a copy — a "keep these two in step" comment is the pattern that has failed
  this project four times.

  **The test was watched failing before it was trusted.** The listener was removed on purpose
  and all three checks went red; then it was put back. An all-clear from a check nobody has
  ever seen fail is not evidence — fourth time that has been applied here.

  **Timing worth knowing:** this mattered more this week than last, because rotating the
  password is still on your list, and the most likely moment to run that script is right after
  a rotation — when what it could print is the *new* password.

**Why this hid so long:** a healthy connection never triggers it, and the home network to a
Sydney-hosted database is exactly the situation that does. It has probably been failing
quietly on every laptop run for weeks.

---

## 🟠 Real, but less dangerous

### 4. Email encryption was switched off (SEC-011)
**Fixed 6 August.** The key was blank, so the scrambler silently did nothing — and every
document, comment and note went on saying addresses were encrypted. Nothing warned. Nothing
failed. The app looked healthy.

Now the app **refuses to start** on a real server without a key, and checks the key is the
right size at startup rather than during a student's first sign-up. On a developer's laptop
it still runs with no key, because a guard that breaks local work is a guard that gets
deleted. Third time this exact remedy has been needed (the pepper, the console mailer, now
this).

**One thing worth knowing, because it changes how bad this was:** nothing in the app reads
the encrypted address today — the code that would unscramble it has no callers. So what was
broken was the *claim*, not a live leak. It would have become a real loss the moment the
"resend my code" screen went looking for the address and found nothing, for every account
created while the key was blank — and by then the original is gone for good.

### 5. Login codes and session keys were being written into the logs (PRV-5, PRV-6)
Two separate leaks, both **fixed 2 August**:

- Every time a signed-in student did anything, their **session key** — the thing that proves
  they're them — got written into the log in full. Worse, each time the app quietly issued a
  *fresh* key, that one got logged too. Their internet address went with it.
- The default email setting printed each student's **real email address and their login code**
  straight to the screen log. On a real server that would have gone into the log system —
  every student's identity and password, in one place. Exactly what this app promises never
  to do.

Found by reading the log during our own test, not by a tool. Both now scrubbed, and the app
**refuses to start** if the unsafe email setting is used outside a developer's laptop.

### 6. Anyone could guess login codes forever, and sign up unlimited times (SEC-004, SEC-007)
Both **fixed 2 August.**

- **The login code could be guessed until it worked.** Nothing counted wrong guesses, so
  someone could try all million 6-digit codes in minutes and walk in as another student.
  This was the worst thing on the list: proving you're a real student with your college
  email is the foundation everything else stands on, and it wasn't holding. Now you get 5
  guesses per code; after that the code is destroyed and you must request a new one. A wrong
  guess and a used-up code look identical, so an attacker can't tell when to start over.
- **Nothing stopped one person signing up with thousands of addresses.** There was a limit
  per email address, but none per *person* — so someone could pump unlimited mail through
  our email account. Now capped per device, per hour.

### ⚠️ One thing to remember when the app goes on a real server (T49)
The new limits count requests per device. If the app sits behind a load balancer and one
setting (`TRUST_PROXY`) isn't set correctly, the app will think **every student is the same
person** and lock out the entire campus at once. It's one line of configuration — but it
has to be right.

### 6b. Anyone with the app's public key could read — or wipe — the whole database (SEC-003)
**Fixed 4 August.** This was the largest hole found so far.

Supabase gives every project a public API and a public key that is *meant* to sit in the app
people download. On our database, that key's account had been given full permission on every
table — read, write, delete, and "empty this table completely". Nobody granted it; it is the
default, and it was quietly re-applied to each new table we created.

In plain terms: anyone who opened the app's code could have read every stored email
fingerprint, published posts without them ever passing the safety check, changed the safety
checker's verdicts, or deleted everything.

Now the permissions are stripped, a second lock is switched on behind them, and the default
that kept re-granting them is switched off — so tables we build in later milestones don't
re-open it.

**One thing worth knowing:** the security report told us to switch that second lock to its
strictest setting. We deliberately didn't. On the strictest setting the lock also applies to
*our own app*, and since we haven't written any "who may see what" rules yet, the app would
have read **zero rows from every table** — every screen blank — while still reporting itself
healthy. We checked first that the app's own account is exempt at the setting we chose.

### 6c. The database connection wasn't checking who it was talking to (SEC-002)
**Partly fixed 4 August.** The connection was scrambled, but it never verified the database
was really our database — so someone sitting in between could have impersonated it and read
everything going past. Now it's a proper setting instead of a stray flag in a link, and a real
environment gets the strict version by default.

**Not finished:** Supabase signs its own certificates, so the strict version needs a file
downloaded from your Supabase dashboard. Until then we're on the same level of protection as
before — not worse, not yet better. One-minute job, in
`runbooks/staging-deploy-T49.md` §2.

### 6d. Every response announced what the server was built with (SEC-010)
**Fixed 4 August.** Standard protective headers were missing entirely, and every reply
advertised `x-powered-by: Express` — free reconnaissance for anyone probing. Added.

This does **not** cover the phone app itself (SEC-013) — that's a separate, still-open item,
and saying otherwise would be the kind of false "done" this project has already been bitten by.

### 7. Deleting an account also deletes the ban (SEC-016 / PRV-2)
**Fixed 8 August, in T24.** A banned person could delete their account and rejoin. The ban
record deliberately has no link back to the account, so there is nothing for a deletion to
travel along — and there is now a test that deletes the account and confirms the same address
is still refused, including under capitals and `+tags`.

Worth knowing: the fix was waiting on the record itself, which only arrived with T21 that same
morning. It was open by design, not overlooked.

---

## 🔧 Problems in our *tools*, not the product

These are the ones that let problem #1 hide for eleven days.

### 8. Our SQL checker hid its own findings (T14a–T17)
It ran all 25 database instructions in one batch. When the first one failed, the database
refused all the rest — so it reported **1 real bug as 23 fake ones**, and hid a second real
bug behind the first. Fixed 1 August.

### 9. The tests couldn't read their own settings (T56 and others)
The tests checked "do I have a database address?" *before* loading the file that contains the
database address. So they always said no. **The tests could never have run on your laptop,
no matter what.** Fixed 1 August.

### 10. The tests deleted each other's data (T56 and others)
Test files ran at the same time against one database, each wiping it clean before starting.
They kept destroying each other's work — 26 failures, every one fake. Fixed 1 August. This
would have broken the automatic checker too, and looked like a random ghost.

### 11. The automatic checker had never run once (T3)
It was written on 21 July but the code was never uploaded anywhere, so it had literally never
executed. Every claim of "the robot checks this" was false. Fixed 1 August — first run, all
four checks passed.

### 11b. The database tests had stopped running, and nothing said so (found 4 August)
When we fixed the "don't wipe a real database by accident" guard back on 2 August, the setting
it looks for changed name. The settings file was never updated to match. From that moment, all
**53 database-backed tests refused to run on your laptop** — every time, silently.

The automatic checker abroad was unaffected, because its database is *named* in a way the
guard accepts without any setting. Which is exactly why nobody noticed: the loud half kept
saying green while the quiet half wasn't running at all.

**Same lesson, fourth time:** the thing that watches has to be working before its silence
means anything.

### 11c. The security reports we were working from are out of date (found 4 August)
Before starting, we spot-checked one finding the reports listed as unfixed — and it had
already been fixed days ago. So the count of "29 problems still open" is **not a number to
trust**; some unknown share of them are already done.

Nothing was lost, but it changes how the list must be used: **check each finding against the
actual code before acting on it.** T62's run will rebuild an honest list.

### 11d. The full test suite can no longer be trusted on your laptop (found 5 August)

The database-backed tests talk to a database in Sydney. Every single query makes that round
trip, so the suite takes **fifteen minutes on a good run** — and on a bad one a single test
sat for **twenty-eight minutes** before the connection died and took the rest of the file
down with it. Three tests fail this way on a completely clean tree, with none of our changes
in it, so a red result here means nothing on its own.

**What this changes:** the automatic checker abroad is now the only honest gate for anything
that touches the database. It runs its own Postgres on the same machine as the tests, so
there is no network to drop. Locally, run the tests that do not need a database — those are
fast and truthful.

This also makes finding #4 above much worse than it looks: the crash it describes is exactly
what turns one dropped connection into a whole failed file.

### 11e. A green tick that meant nothing (found 5 August)

A verification run was reported as passing when it had in fact failed four test files. The
command's output had been piped through another program to shorten it, and the *shortening*
program's success was read as the *test* run's success. The tests had failed; the tick was
the pipe's.

Caught within the same session by reading the actual output. **Fifth instance of the same
lesson, and the cheapest one to repeat: check what the green tick is actually reporting on.**

### 17. The one unlock line is actually five, and nobody had noticed (found 9 August)

This file has been telling you for days that T62 needs **one line** — the text `08` in
`.pipeline/unlock`. That is true for T62 and **wrong for everything after it.**

Here is the rule the guard actually follows, read out of the code
(`.claude/hooks/guardrail.py`, lines 45–66): a numbered document becomes **read-only the
moment any higher-numbered one exists.** `docs/16-privacy.md` exists. So documents 01
through 15 are *all* frozen right now, and every remaining quality gate is a task whose
whole job is to write one of them:

| Gate | The document it must write | The line it needs |
|---|---|---|
| T62, T65, T69 — the security reviews | `docs/08-security.md` | `08` |
| T47 — run every test one last time | `docs/11-…` | `11` |
| T66, T68 — the speed checks | `docs/12-performance.md` | `12` |
| T71 — the "does it produce useful logs" check | `docs/13-…` | `13` |
| T48 — **the launch decision** | `docs/15-production-readiness.md` | `15` |

**What this costs you if it stays unwritten:** each of those gates would run, do its work,
and then fail at the last step when it tries to save its report. You'd find out one gate at
a time, over weeks, each time thinking it was a new problem. It is one problem.

**The fix is one file with five entries**, space-separated, e.g. `08 11 12 13 15`. Do it
once now rather than five times later. **It stays yours.** An agent that can unlock its own
audit is not being audited.

**A second, smaller thing found in the same read, and it points the other way.** The file
does two different jobs, and it does them by two different rules. The freeze above reads the
file's **contents**. But a separate guard — the one that stops a review agent from running
arbitrary commands (line 102) — switches off merely because the file **exists**, whatever is
in it. The file exists today and is empty. **So that second guard is already off while
nothing is actually unlocked.** Not dangerous on its own, and not something to quietly
"repair" — a guard's behaviour is your call, not mine. But you should know that creating an
empty file was not a no-op.

### 18. There is no way to report the one thing this product exists to prevent (found 9 August, T39 — **for the lawyer, T43**)

Murmur's whole promise is that a student can ask a question **without anyone knowing it was
them.** The way that promise gets broken is somebody posting *"that's Rohan from the third
floor, obviously"* — unmasking a person. In plain terms: doxxing.

**There is no complaint category for it.** The eight reasons a report can carry cover
harassment, hate, threats, spam, impersonation, two kinds of non-consensual imagery, and a
catch-all. **Not doxxing.** The closest one, `impersonation`, is a different thing entirely —
that is somebody pretending to *be* you, not somebody revealing who you are.

**Why it looked covered and wasn't.** The report screen has a choice reading *"Reveals
someone's real identity"*, so at a glance the product appears to handle it. That choice maps to
nothing the server accepts; it was drawn in July, before the categories existed.

**What it costs:** the single harm most specific to this product either gets filed under
"Something else serious" — the slow 15-day clock — or the reporter gives up. Either way the
platform cannot count how often its core promise is being broken, because there is no category
to count.

**Why this is not being fixed here.** Adding a ninth reason means deciding **which legal clock
it earns**, and that is a reading of the IT Rules, not a code change. Guessing 15 days could be
wrong in the direction that matters. It goes to **T43** with the rest of the legal review.
Adding the option to the screen first would produce a button the database refuses — a control
that looks live and does nothing, which is the failure this project refuses to ship.

### 19. The "is this database safe to wipe?" check had stopped counting half the database (found 9 August)

There is a small script whose only job is to answer one question before you point the
destructive test suites at a database: **how much is actually in here?** It prints a row count
per table and a total. You read the total, and you decide whether that database is disposable.

**It was counting eight tables. The database has fourteen.**

The list was typed by hand back when there were eight, and every table added since — the
**complaints**, the **ban records**, the **points ledger**, the **offline queue**, and the
**half-written drafts a student never posted** — was simply not on it. Nothing errored. The
script printed a clean, confident, wrong total.

**And it was wrong in the worst direction.** The six it missed are, almost exactly, the six you
would least want to destroy. A database full of real complaints could print a small number and
read as empty — which is precisely the reading that would make someone say "fine, wipe it".

Nobody was harmed: the destructive suites have their own separate guard (the database name must
contain "test"), so this was the *second* line of defence, not the only one. But a second line
of defence that quietly stopped working is worth exactly nothing, and you would not have known.

**Fixed by removing the list.** The script now asks the database itself which tables exist. It
cannot go stale again, because there is no longer anything to keep up to date. **Same lesson as
the four before it** — a comment or a hand-kept list saying "remember to update this" has failed
every single time it has been tried in this project.

### 12. Nothing was checking the phone app at all (found 2 August, T19)
The robot checked the server. It never checked the **app the student actually touches** — not
the spell-checker, not the style rules, nothing. So the four sign-up screens built back in
July had been sitting there completely unexamined the whole time.

Fixed before writing a single new screen. It found a real mistake within minutes: two screens
were handing the wrong kind of value to the bit that decides which "your post is being
reviewed" card to show. That would have shipped.

**Same lesson as the five above, third time now:** the thing that watches has to be working
before its silence means anything.

---

## 🟡 Confusions that cost time but weren't real bugs

### 12. "The database is unreachable"
The address in the settings was in a format your home internet can't understand (IPv6 only).
Switching to the other address Supabase provides — the "pooler" — fixed it instantly. Nothing
was wrong with the code.

### 13. "The designs are lost" (T18)
The design project looked missing for a whole session. It wasn't. The ID had been written
down half-complete, and the project was a slightly different type that doesn't show up in
searches. All 17 screens were sitting there the whole time. Now recorded properly.

### 14. "We need to install security scanners"
We didn't. The automatic checker downloads all three itself. The only thing actually missing
was uploading the code.

### 15. The safety reports were run in the wrong order (T60, T61, T63)
Three reviews were run at the same time. Two finished first and accidentally locked the third
out of writing its report. The findings survived, the document didn't. **Lesson: run these
one at a time, in order.**

### 16. A migration could have deleted the stats table (T13)
The "undo the last database change" command picked the wrong change to undo. Caught and fixed
before it caused damage.

---

# The one big lesson

Three of the five bugs found on 1 August were **in the tools meant to catch bugs**, not in the
product. The two real product bugs survived eleven days *because* nothing above them could see.

> **Fix the thing that's watching before you trust what it tells you.**

A test suite that can't run is worth less than one that runs and fails.

---

# What to do next — current as of 8 October 2026

1. **Review the T28 reliability repair on `fix/t28-offline-data-loss`.** It preserves
   posts added during sync, keeps the newest state when storage is full, caches the
   actual app bundles, and keeps the existing composer reachable when a feed read
   fails. Previously fetched topic slugs survive a reload; only public slug/label
   reference data is retained. No new visual design was authored.
2. **T62 still blocks search and operator authorization work.** The isolated cloud
   database contains no live students and cannot resolve the three historical live
   deployment findings. Trusted database TLS, a real production email configuration,
   and a human decision on old placeholder-key fingerprints remain required. Do not
   change T20 or T37 until the security gate is independently green or human-waived.
3. **Finish the branch delivery without bypassing the security milestone.** All local
   tests and builds passed, and pushed code commit `9668d51` passed CI run
   `37802658217` (build/test, secrets scan, SAST and SCA). The GitHub API returned
   `Forbidden`, but the run's own web page supplied its final `Success` result.
   Verify later branch commits before the required merge; this is T28 repair evidence,
   not a T62 security-gate pass or permission to start T20/T37.
4. **Keep the human/design tracks explicit:** T49 staging deployment, T54 moderation
   vendor choice, T30 corrected sync-status design, T19/T39 returned design corrections,
   T42 officer details, T43 legal/retention decisions, and T72–T75 runbooks. The existing
   design briefs remain the inputs; do not invent legal numbers, vendor choices, or
   human approvals to make a task appear unblocked.

The cloud machine now has a local disposable PostgreSQL database; historical laptop
latency notes below do not describe it. Run tests with `DOTENV_CONFIG_PATH=/dev/null`
and an explicit loopback `murmur_test` URL so the development `.env` cannot repopulate
variables that guard tests intentionally remove. Use the saved startup instructions
to restart services after a restored environment; processes do not survive snapshots.

The August notes below are retained as history. Their statements that T28 is still
buildable or that a missing unlock alone resolves T62 are superseded by this section.
Never create an unlock or waiver on behalf of the human.

## Historical next-step notes (August 2026)

1. **T62 — it has now run, and it failed on three things that are all yours.** You wrote
   `.pipeline/unlock` on 11 August, which unblocked it; the gate ran on 13 August. **Zero
   problems in the code — every one of the 17 routes passed the access-control review.** The
   three failures are all settings in `.env`. Full explanation under "About T62" above; the
   short version:
   - **`DATABASE_SSL=require` → change it to `verify-full` (or just delete the line).** You
     also need `prod-ca-2021.crt` from the Supabase dashboard in `server/certs/`, pointed at
     by `DATABASE_SSL_CA`. **~10 minutes.** Right now the database connection is scrambled but
     the server on the other end is never actually checked.
   - **`EMAIL_PROVIDER=console` + `NODE_ENV=development` while pointing at the live
     database.** Live student emails and their login codes get printed to the screen. **Two
     variables.**
   - **`EMAIL_HASH_PEPPER_RETIRED` is still the published placeholder — and this one is a
     decision, not an edit.** The affected fingerprints cannot be re-computed, so the choice is
     delete/quarantine those rows (destroys real accounts) or accept it in writing with your
     name on it. **Nothing else can proceed on this one until you choose.**

   After the first two are done, T62 gets re-run. It only counts as passed when the re-run
   says so — not because the fixes look right.
2. ~~**The missing database-connection listener**~~ — **done 7 August** (problem #4 above).
   Still yours and still open: **rotate the database password**, since it has been on screen.
3. ~~**T25** — pull the three screens out of the design project~~ — **done 9 August, and it
   was never yours.** It was filed in the wrong lane; see "About T25" above. ~~**T39**~~ —
   **also done 9 August, and it was the same mistake.** Both are now landed. **T30 is the only
   design-lane item left, and it is a genuine one** — its brief exists because the drawn
   screen gets three things wrong, so it needs a real round with Claude Design, not a copy.
   **New and needs you: the report form is missing two of the three legally-urgent
   categories** — see "About T39" above. That one is a Claude Design change with a legal
   consequence, and it is the highest-value design request outstanding. **Its brief is written
   and ready to paste:** `docs/design-prompts/T39-round-6.md` — six corrections across S13,
   S15 and the two console headers. **And one thing on it is the lawyer's, not the designer's:**
   problem #18 below — there is no complaint category for doxxing at all.
4. **T19b** — swap in the two cards Claude Design is redrawing (see below).
5. Then the rest of Milestone 3, plus fixing the remaining problems above.

~~T22 — upvoting and accepting~~ — **done 8 August**, including the reconciliation query T21
required of it. ~~T23 — ban checks everywhere~~ — **done 8 August**, and it closed a fail-open
path in the ban lookup. ~~T24 — issuing a ban~~ — **done 8 August**, closing problem #7.
~~T34 — report a post~~ — **done 9 August**, and it closed a way of hiding a missed legal
deadline that T33 had left open.

~~T38 — the deadline watchdog~~ — **done 9 August**, and it deliberately did not build one of the
three timers its own title asks for, because that one could never fire.

**Everything left in Milestone 5 needs the same missing thing: the app does not know what an
operator is.** T35 (the moderator's tools), T36 (deciding on AI-flagged posts) and T41 (the
moderator screens) are all "operator-only", and there is no such thing as an operator yet. That
is **T37**, a small task with no blockers.

**And T37 is the one thing that cannot be built in front of T62.** It changes the session gate —
the exact code T62 inspects. Every task built so far has been chosen to stay out of T62's way
(new tables, new endpoints, a background job); T37 cannot be. **T62 has now run, but it has not
passed**, so this still holds: reshaping the session gate before the re-run means the gate
inspects different code than the one that failed, and the comparison is lost. T37 waits for a
green T62, and Milestone 5 waits with it.

~~T27 — the offline-outbox and draft tables~~ — **done 9 August**, and it caught a contradiction
between the design document's two halves.

~~T29 — receiving the offline queue~~ — **done 9 August**, and it closed a way around the
report limit plus a flaky test that had been teaching everyone to re-run instead of read.

~~T32 — the stuck-post watchdog~~ — **done 9 August**.

~~T45 — the sign-up funnel~~ — **done 9 August**, and it found that the activation number had
been silently reading zero.

**That is the end of what can be built without you, and there is now nothing half-finished.**
Six tasks landed today (T34, T38, T27, T29, T32, T45), plus two bugs the tests flushed out — one
in the product (activation never recorded) and one in the tools (a flaky test). What remains is,
without exception, one of:

- **behind T62** — T37, and through it T35, T36 and T41; plus T20 and all of Milestone 3 after it.
  These all change the code T62 is waiting to inspect;
- ~~**the phone app** — T28 and T31, which need the screens from T30 first;~~ **Wrong, and it is
  the third time the same mistake has been found today (9 August).** **T31** needs T30 — that is
  in the plan. **T28 does not.** Its dependencies are T19 and T27, and both have been done since
  9 August. T28 is the *phone's own machinery* — remembering a post written with no signal,
  giving it an id, not sending it twice, saving drafts as you type. None of that is a screen.
  The only screen it touches is the composer, which landed at T19. **T28 is buildable now and it
  is mine.** See "the phone app, and what is actually blocking it" below;
- **a designer** — ~~T25~~, ~~T39~~ (both landed 9 August; they were mis-filed, not blocked),
  leaving **T30**, plus the new report-category request from T39.
  **T30's brief is now written and waiting**:
  `docs/design-prompts/T30-sync-status.md`. It carries three things the design would otherwise
  get wrong — a "waiting on something else" state the spec never anticipated, a `conflict` state
  the spec lists that **can never happen** (so please don't draw it), and a missing screen for
  "your account was removed, these posts will never send";
- **you** — T49 (deploy), T54 (AI vendor prices), T42 (officer details), T43 (lawyer),
  T72–T75 (emergency guides).

**The single highest-value thing you can do is the one line in `.pipeline/unlock`.** It is the
literal text `08`. It unblocks T62, and T62 unblocks roughly half of everything left.

**What is genuinely stuck behind T62, and it is now most of the product:** T37, and through T37
the whole rest of Milestone 5 (T35, T36, T41); plus T20 (search) and everything after it in
Milestone 3. All of those change the code T62 is waiting to inspect. **Your one line in
`.pipeline/unlock` now unblocks roughly half of what is left.**

**Why Milestone 3 work started while T62 is still open.** T62 inspects who may read and write
questions, answers and the feed. Building *those* areas before it runs would just make its job
bigger and its findings staler. T21 touched none of them — it only added two tables — so it was
safe to build in front of the gate. The same will not be true of T20 (search), which changes
the read path T62 is about to look at; that one waits.

~~T51 — finish the usage stats~~ — **done 6 August.** ~~T21 — the points and ban tables~~ —
**done 8 August.**

**One change in how we work, from problem 11d:** anything that touches the database is now
checked by the automatic checker abroad, not on your laptop. Your laptop still runs the
faster half. This is not a preference — the laptop's run takes fifteen minutes when it works
and fails on a clean tree when it doesn't, so a red result there tells you nothing.

**One thing waiting on you, and it's quick:** two bits of wording on the screens promise
something the app can't do — a post "usually takes a few minutes" to be checked, when in
reality nothing gets published at all until T14b. And there's no screen for "your post was
refused", which the system can genuinely return. Both have been sent to Claude Design as
`docs/design-prompts/T19-round-3.md`. Until they come back, those spots show the wording the
server itself sends, which is at least true.

## The phone app, and what is actually blocking it *(found 9 August)*

Three tasks were sitting in the wrong place today. T25 and T39 were filed as the designer's when
they were mine. **T28 was filed as blocked when it is not.** Same shape, third time — so the
lesson is worth writing down rather than just the fix:

> **"X needs Y" in a summary is not the same as "X depends on Y" in the plan.** Check the plan.

Here is the real state of the offline feature:

| Task | What it is | Blocked by |
|---|---|---|
| T27 | The tables the outbox needs | ✅ done |
| T29 | The server receiving a queue a phone wrote offline | ✅ done |
| T32 | The watchdog for posts that never finish | ✅ done |
| **T28** | **The phone's own side: remember it, name it, don't send it twice, save drafts** | **nothing — buildable now** |
| T30 | *(Designer)* The "sync status" screen | you — brief is written |
| T31 | Showing that status on screen | T28 **and** T30 |

**Why the confusion was easy to make.** T28 and T31 are both "the phone app", they are both in
Milestone 4, and they sound like one job. They are not. T31 draws a list of what is in the
queue; **T28 is the queue.** Only T31 needs a screen that does not exist yet.

**One thing already written down for whoever builds it**, and it is in the server code rather
than here because no response body can say it: when the server refuses a whole batch because the
person is banned, **the phone must stop trying, not retry forever.** A queue that keeps
retrying a refusal carries those posts for ever.

**Meanwhile, whenever you can** — these are yours and they unblock things:
- **T49** put the app on a server → unblocks T11 and closes Milestone 1
- **T54** get AI-checker prices → unblocks T14b, which is what finally lets posts go public
