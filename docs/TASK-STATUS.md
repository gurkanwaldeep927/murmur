# Murmur — Task Status in Plain English

**Last updated: 2026-08-04**

A simple map of all 77 tasks: what each one actually *means*, whether it's finished, and
what went wrong along the way. No jargon. The formal version lives in `docs/07-plan.md`;
this file is the human-readable one.

**Score so far: 28 done · 45 not started · 4 waiting on something**

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
| T45 | Record the sign-up funnel specifically | 🟡 half |
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
| T51 | Finish recording usage stats for this section | 🟡 half |
| **T62** | **Security expert checks who's allowed to read/write what. Must pass before this milestone can close** ← **next job** | ⬜ |

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
| T21 | Database tables for points and ban records | ⬜ |
| T22 | Upvote and "this answered my question" — points are awarded by the server so nobody can cheat | ⬜ |
| T23 | Check bans everywhere — asking, answering, voting | ⬜ |
| T24 | Actually issue a ban, and make it survive someone deleting their account | ⬜ |
| T25 | *(Designer — copy job)* Search, topic list, profile screens | ⬜ |
| T26 | Connect those three screens | ⬜ |
| T52 | Record how people use search | ⬜ |
| T57 | Test: delete account → try to rejoin with same email → refused | ⬜ |
| T65 | Security expert attacks the ban system with tricks like `First.Last@` vs `first.last@` | ⬜ |
| T66 | Speed check on search and points | ⬜ |

---

# Milestone 4 — Works without internet

*Goal: write a question with no signal; it posts itself when you're back online.*

| Task | In plain words | Status |
|---|---|---|
| T27 | Database tables for the offline outbox and saved drafts | ⬜ |
| T28 | Save posts on the phone when offline, send them later | ⬜ |
| T29 | Receive those saved posts, handle duplicates, check them for safety before publishing | ⬜ |
| T30 | *(Designer — copy job)* The "sync status" screen | ⬜ |
| T31 | Show the honest status of each post: waiting → sending → checking → live / blocked | ⬜ |
| T32 | A watchdog that alerts if any post gets stuck forever | ⬜ |
| T58 | Test proving no offline post is ever silently lost | ⬜ |
| T68 | Speed test: what if everyone comes back online at once | ⬜ |
| T67 | Kill the server mid-save, then restore from backup. **Needs a database we're allowed to destroy and rebuild** | 🔴 waiting |

---

# Milestone 5 — Reporting and the moderator's desk

*Goal: report bad content, and a real human handles it within the legal deadline.*

| Task | In plain words | Status |
|---|---|---|
| T33 | Database tables for complaints and their audit trail | ⬜ |
| T34 | "Report this post" — creates a ticket with a legal deadline attached | ⬜ |
| T35 | The moderator's tools: take down, dismiss, or escalate — every action logged | ⬜ |
| T36 | A way for a moderator to decide on posts the AI flagged but nobody reported | ⬜ |
| T37 | Moderator-only access — students get a polite "not allowed" | ⬜ |
| T38 | Timers that chase the legal deadlines and alert the moderator | ⬜ |
| T39 | *(Designer — copy job)* 5 screens: report, my reports, contact info, queue, resolve | ⬜ |
| T40 | Connect the 3 student-facing ones | ⬜ |
| T41 | Connect the 2 moderator ones | ⬜ |
| T53 | Record report and moderation stats | ⬜ |
| T59 | Tests proving the legal deadlines are calculated right | ⬜ |
| T69 | Biggest security review — moderator permissions, complaint data | ⬜ |
| T70 | Full privacy audit — actually runs the data-deletion rules, not just reads them | ⬜ |
| T71 | Check the app produces useful logs before launch | ⬜ |
| T43 | *(Lawyer)* Confirm the legal deadlines and write the consent wording | 🔴 waiting on a lawyer |

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

## 🟠 Real, but less dangerous

### 4. Email encryption is switched off (SEC-011)
The encryption key is blank, so it silently does nothing. Everyone assumes it's on. Not fixed
yet.

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
A banned person could delete their account and rejoin. Not fixed yet — it's properly part of
**T24**, since the ban record it has to survive doesn't exist until Milestone 3.

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

# What to do next

1. **T62** — the security gate. Milestone 2 can't close without it. The three access-control
   holes it would have tripped over (6b, 6c, 6d above) were cleared on 4 August, so it now has
   a real chance of passing rather than just re-reporting what we knew. **It needs one line
   from you first:** the file `.pipeline/unlock` exists but is empty, and it must contain the
   text `08`. Until then the guardrail blocks the gate from writing its report. Claude Code
   deliberately won't write that line itself — a guard an agent can lift for itself isn't a
   guard.
2. **T51** — finish the usage stats. T19 unblocked it.
3. **T19b** — swap in the two cards Claude Design is redrawing (see below).
4. Then Milestone 3, plus fixing problems 3–7 above.

**One thing waiting on you, and it's quick:** two bits of wording on the screens promise
something the app can't do — a post "usually takes a few minutes" to be checked, when in
reality nothing gets published at all until T14b. And there's no screen for "your post was
refused", which the system can genuinely return. Both have been sent to Claude Design as
`docs/design-prompts/T19-round-3.md`. Until they come back, those spots show the wording the
server itself sends, which is at least true.

**Meanwhile, whenever you can** — these are yours and they unblock things:
- **T49** put the app on a server → unblocks T11 and closes Milestone 1
- **T54** get AI-checker prices → unblocks T14b, which is what finally lets posts go public
