# Claude Design — Round 6 (T39 landing gaps: S13, S15, and two console headers)

**Raised:** 2026-08-09, immediately after T39 landed S13–S17 into `client/src/components/`.
**Project:** `ecb9e3e6-a250-49f3-9b7a-f356994a9f54` — "Murmur email entry form"
(owner: rishi, type `PROJECT_TYPE_PROJECT`, so `list_projects` does not return it —
pass the UUID directly to `get_project` / `get_file`).
**Design contract:** `docs/06-ui.md` §2. **Briefs:** §3.13 (S13), §3.15 (S15).
**Taste direction:** D2 (`docs/gates/taste-gate.json`).
**Screen specs:** `docs/04-ux.md` §4 S13, S15.

---

## Why this round exists now

The complaints backend is finished: the tables (T33), intake with its legal clock (T34), and
the deadline watchdog (T38). T39 then landed the five screens that were drawn back in July and
compared each one against the server that now exists.

Four of the five are fine or are engineering's problem. **The report form is not.** It was
drawn before the legal categories existed, and the categories it offers do not line up with the
ones the law and the database now require — in a way that would put the most urgent kind of
complaint on the slowest clock.

Everything below is a correction to a screen that already exists. **No new screens are being
asked for.**

---

## Gap 1 — the report form cannot report the two worst things ⚠️ **highest value, legal**

**What is drawn.** Five choices: *Reveals someone's real identity · Harassment or bullying ·
Hate or threats · Spam or advertising · Something else serious.*

**What is true.** The server accepts **eight** fixed reasons and nothing else — the list is
pinned by a database constraint, so a reason outside it is refused at submit. **Three of the
eight start a 24-hour legal deadline. The other five start a 15-day one.** The reason *is* the
clock; that is the entire design of T34.

**Two of the three fast-clock reasons are not on the screen.** A student reporting intimate
images of themselves shared without consent has nothing to select but *"Something else
serious"* — which maps to the catch-all, and the catch-all is deliberately **not** expedited.

**What it costs.** That complaint silently gets **fifteen days instead of twenty-four hours**.
Nothing errors. Nothing looks wrong. The ticket reads perfectly normal and carries the wrong
statutory deadline — on the single most time-critical category the law recognises.

### The eight reasons, what each covers, and which clock it starts

These are the server's own values. Please design **one selectable option per row** — eight, not
five, not nine.

| Server value | What it legally covers | Clock |
|---|---|---|
| `non_consensual_imagery` | Intimate or private images of a person shared without their consent | **24 hours** |
| `sexual_content_morphed` | Sexual imagery that has been faked or edited to depict someone | **24 hours** |
| `impersonation` | Someone pretending to *be* a specific person | **24 hours** |
| `harassment` | Targeted abuse, bullying, or persistent unwanted attention | 15 days |
| `hate_speech` | Attacks on a person or group for who they are | 15 days |
| `threat_of_violence` | A threat to physically harm someone | 15 days |
| `spam_or_scam` | Advertising, phishing, or fraud | 15 days |
| `other` | Anything else serious. Deliberately **not** expedited — guessing urgency from an uncategorised complaint is what having categories avoids | 15 days |

**The ask.** Student-facing wording for all eight, and a layout that holds eight options
without becoming a wall — a scrolling list, grouped sections, or a short-then-"more reasons"
disclosure are all fine. **The wording is yours; the eight rows are not negotiable**, because
the server refuses anything else.

**One thing to be careful with, and it is a real tension.** The three urgent categories are the
hardest ones to read when you are the person they happened to. Please do not make them louder
or scarier than the rest — a student in that situation should be able to find their category
without the screen making the moment worse. Order and tone are yours to judge; D2's "no burden"
note applies here more than anywhere.

---

## Gap 2 — "Hate or threats" is one button for two different laws

**What is drawn.** A single chip covering both.

**What is true.** `hate_speech` and `threat_of_violence` are two separate values. With one
chip, the app has no way to know which one the student meant, and it has to guess — which is
exactly the guessing the eight-category design removed.

**The ask.** Two separate options, per the table above. Covered by Gap 1 if you redraw the whole
list; called out separately so it does not get merged again for tidiness.

---

## Gap 3 — the screen promises tracking it has just taken away

**What is drawn.** "Report anonymously" defaults to **on**. Its own hint is accurate:
*"Not even the reviewer sees who reported. You won't get status updates."* Then the success
card immediately after says: *"Track it anytime in My Reports."*

**What is true.** Both, separately — and that is the problem. An anonymous report stores **no
reporter at all**, permanently and by design (T33): it is not hidden on screen, it is never
written down. So it can never appear in My Reports, and it can never be merged with a duplicate.
**On the default path, the success card is false.**

**What it costs.** A student reports something serious, is told to track it, goes to My Reports,
and finds nothing. That reads as a lost report on the one screen that has to feel trustworthy.

**The ask — a judgment call, and it is yours.** Two honest shapes:

- **Flip the default to identified**, with anonymity as a deliberate choice. Stronger tracking,
  and the reporter is stored — which is a real privacy cost for someone reporting a person who
  might work out who they are.
- **Keep anonymous as the default** and make the success card conditional: no tracking promise
  on the anonymous path, and say plainly that the trade was for anonymity.

**What is not on the table:** attaching a reporter to anonymous reports so they can be tracked.
That undoes the thing T33 was built to guarantee.

---

## Gap 4 — the merged state describes something that did not happen

**What is drawn.** *"Someone else flagged this too — it's under review as ticket GRV-2093, and
your report was added to it."*

**What is true.** The merge is **your own duplicate folding into your own open ticket**. It
happens when *you* report the same thing twice. The server's own sentence is: *"You'd already
reported this. We've added it to your open report rather than starting a new one."*

Two problems, and the second is the one that matters: the screen also prints **another ticket's
id**, which the server deliberately never returns, precisely so one reporter learns nothing
about another's report.

**The ask.** Keep the warm framing — the calm, "this is fine" tone is right. Change what it
says to match: your earlier report, not someone else's, and no second ticket id.

---

## Gap 5 — S15 invents a named human on a legally-required page

**What is drawn.** A grievance officer card: **A. Deshmukh**, `grievance@murmur.app`,
`+91 98xx-xx-2140`. Below it, the process description carries a clear `PLACEHOLDER` stamp.

**What is true.** The name, email and phone are placeholders too — and they are the *only* part
of that page a person in trouble actually needs. The real ones do not exist yet; they are
**T42**, and they are launch-blocking.

**What it costs.** The stamp on the paragraph tells a reader "the wording below is not final".
It says nothing about the person above it, so a fabricated name with a plausible email reads as
a real, reachable human on a page whose entire purpose is that there *is* one.

**The ask.** A design for the state where **the contact details are not configured yet** —
`docs/06-ui.md` §3.15 lists it and marks it "must never ship", which is exactly why it needs to
exist: the page must be capable of refusing to invent a person. Something honest and calm, not
an error. And when details *are* present, they render as today.

---

## Gap 6 — the console headers carry a real person's name *(small)*

**What is drawn.** S16 and S17 both show `operator: gurkanwaldeep`, and the decided rows read
"by gurkanwaldeep".

**What is true.** The only identity this product holds for anybody is a **pseudonym** — there is
no real-name field anywhere, deliberately. An operator would appear as `quiet-otter-4821`.

**The ask.** Treat it as a slot, not a name, and check the layout still reads with something
roughly twice as long and lowercase-hyphenated.

---

## What is deliberately NOT being asked for

- **A "reveals someone's real identity" / doxxing option.** It is on the screen today and it
  maps to **no server value** — `impersonation` is pretending to *be* someone, not unmasking
  them. That there is no category for the harm this whole product exists to prevent is a real
  gap, and it is **not yours to fix**: it belongs to the legal review (**T43**) and is recorded
  in `docs/TASK-STATUS.md`. A ninth chip would be refused by the database at submit — a control
  that looks live and cannot work, which is the one thing this project never ships. **Please
  design eight.**
- **Any of the engineering findings from T39.** The escalation queue's missing AI labels, the
  SLA-breach warning that would never fire, the `escalate_further` value name, the missing
  My Reports and officer-contact endpoints — all of those are code, and all of them are written
  up in `client/src/components/README.md`.
- **New screens.** Every gap above is a change to a screen that already exists.
- **Ticket display ids.** `GRV-2093` is a nice shape and there is no column behind it. Whether
  to add one is an engineering decision, not a drawing.

---

## What lands after this

The corrected S13 and S15 are pulled back into `client/src/components/` as a copy job (that is
Claude Code's lane, not a design session), and the eight-reason list becomes the thing **T40**
wires to `GET /reports/reasons`. Until then S13 stays landed-but-unwired, which is where it
would be anyway — T40 also needs the My Reports endpoint, which nothing has built yet.
