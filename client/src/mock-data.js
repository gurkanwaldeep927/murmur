/* =========================================================================
   Murmur UI — mock data for the render/screenshot harness.
   Every object key below is a VERBATIM schema field name from
   docs/05-schema.md §3 (tables: topic_tag, identity_account,
   pseudonymous_profile, question, answer, sync_queue_item,
   grievance_report, moderation_case, grievance_officer_contact).
   Display-only strings (relative times, copy) are computed in ui.js —
   never stored under invented field names.

   Relocated from src/ui/mock-data.js per plan T1 / architecture §1.
   ========================================================================= */

window.MOCK = {
  /* topic_tag — slug, label, is_active (docs/05-schema.md §3.1) */
  topic_tags: [
    { id: "t1", slug: "placements",  label: "Placements",  is_active: true },
    { id: "t2", slug: "internships", label: "Internships", is_active: true },
    { id: "t3", slug: "professors",  label: "Professors",  is_active: true },
    { id: "t4", slug: "courses",     label: "Courses",     is_active: true },
    { id: "t5", slug: "advice",      label: "Advice",      is_active: true }
  ],

  /* pseudonymous_profile — pseudonym, year_badge, reputation_score, status (§3.3) */
  me: { id: "p0", pseudonym: "QuietFalcon", year_badge: "’27 batch", reputation_score: 128, status: "active" },
  profiles: {
    p1: { id: "p1", pseudonym: "VelvetOwl",   year_badge: "’24 batch", reputation_score: 512, status: "active" },
    p2: { id: "p2", pseudonym: "AmberLynx",   year_badge: "’25 batch", reputation_score: 340, status: "active" },
    p3: { id: "p3", pseudonym: "MistyHeron",  year_badge: "’26 batch", reputation_score: 96,  status: "active" },
    p4: { id: "p4", pseudonym: "SolarWren",   year_badge: "’23 batch", reputation_score: 705, status: "active" }
  },

  /* identity_account — verification_status, derived_enrollment_year,
     last_verification_sent_at (§3.2) */
  identity_account: {
    verification_status: "pending",
    derived_enrollment_year: 2023,
    last_verification_sent_at: "2026-07-18T10:41:00Z"
  },

  /* question — title, body, topic_tag_id, moderation_status, published_at,
     answer_count, idempotency_key (§3.4) */
  questions: [
    { id: "q1", author_profile_id: "p3", topic_tag_id: "t1",
      title: "How brutal is the TCS Digital coding round, really?",
      body: "My assigned senior keeps saying “it’s easy if you prepared” but I want the honest version. How many DSA questions, and does the CS-fundamentals section actually matter?",
      moderation_status: "published", published_at: "2h ago", answer_count: 4 },
    { id: "q2", author_profile_id: "p0", topic_tag_id: "t4",
      title: "Is the ML elective with Prof. treatable as a GPA booster?",
      body: "Heard mixed things — heavy math but lenient grading? Anyone from the ’24/’25 batch who actually took it?",
      moderation_status: "published", published_at: "5h ago", answer_count: 2 },
    { id: "q3", author_profile_id: "p2", topic_tag_id: "t2",
      title: "Off-campus summer internship vs the college-arranged one?",
      body: "The college one pays nothing but is “safe”. Is it worth cold-emailing startups instead? Scared of ending up with neither.",
      moderation_status: "published", published_at: "yesterday", answer_count: 7 },
    { id: "q4", author_profile_id: "p3", topic_tag_id: "t5",
      title: "Feeling way behind my batch after 2nd year — is it recoverable?",
      body: "Everyone around me has projects and I have none. Seniors who felt like this — what did you actually do?",
      moderation_status: "published", published_at: "2d ago", answer_count: 12 }
  ],

  /* answer — body, moderation_status, accepted, vote_count, question_id (§3.5) */
  answers: [
    { id: "a1", question_id: "q1", author_profile_id: "p1", accepted: true,  vote_count: 38,
      moderation_status: "published",
      body: "Took it in ’23. Two DSA questions — one array/string, one DP-lite. The fundamentals MCQs decide the cutoff more than people admit. Do OS + DBMS one-pagers the night before; that alone moved three of my friends across the line." },
    { id: "a2", question_id: "q1", author_profile_id: "p2", accepted: false, vote_count: 21,
      moderation_status: "published",
      body: "Honest version: the coding round is fine, the communication round is where people get cut. Practice explaining your approach out loud — they mark it." },
    { id: "a3", question_id: "q1", author_profile_id: "p4", accepted: false, vote_count: 9,
      moderation_status: "published",
      body: "It changes year to year. ’25 batch had 1 easy + 1 medium. Don’t skip the email-writing section, it’s free marks." }
  ],

  /* sync_queue_item — client_local_id, entity_type, sync_status,
     server_assigned_id, error_reason (§3.11) */
  sync_queue_items: [
    { client_local_id: "loc-9f21", entity_type: "question", sync_status: "pending",
      server_assigned_id: null, error_reason: null,
      title_preview: "Do CGPA cutoffs for Goldman actually flex…" },
    { client_local_id: "loc-8ac4", entity_type: "answer",   sync_status: "syncing",
      server_assigned_id: null, error_reason: null,
      title_preview: "Re: Off-campus summer internship vs the…" },
    { client_local_id: "loc-77b0", entity_type: "question", sync_status: "synced",
      server_assigned_id: "q2", error_reason: null, moderation_status: "pending",
      title_preview: "Is the ML elective with Prof. treatable as…" },
    { client_local_id: "loc-51ee", entity_type: "answer",   sync_status: "synced",
      server_assigned_id: "a9", error_reason: null, moderation_status: "published",
      title_preview: "Re: How brutal is the TCS Digital coding…" },
    { client_local_id: "loc-4d02", entity_type: "question", sync_status: "conflict",
      server_assigned_id: "q7", error_reason: "Edited on two devices — we kept your latest text.",
      title_preview: "Hostel wifi workarounds during placement…" },
    { client_local_id: "loc-3b19", entity_type: "vote",     sync_status: "rejected",
      server_assigned_id: null, error_reason: "This answer was removed before your vote reached us.",
      title_preview: "Upvote · an answer on “backlog panic”" }
  ],

  /* grievance_report — reason, is_anonymous, status, sla_deadline,
     acknowledged_at, resolution_action, resolved_at, sla_breached (§3.9) */
  grievance_reports: [
    { id: "GRV-2093", reason: "Reveals someone’s real identity", is_anonymous: false,
      status: "open", sla_deadline: "in 22h", acknowledged_at: "today 11:02",
      resolution_action: null, resolved_at: null, sla_breached: false },
    { id: "GRV-2071", reason: "Harassment or bullying", is_anonymous: false,
      status: "resolved", sla_deadline: "—", acknowledged_at: "Jul 12, 09:14",
      resolution_action: "takedown", resolved_at: "Jul 12, 16:40", sla_breached: false },
    { id: "GRV-2064", reason: "Spam or advertising", is_anonymous: false,
      status: "resolved", sla_deadline: "—", acknowledged_at: "Jul 8, 18:20",
      resolution_action: "dismiss", resolved_at: "Jul 9, 10:05", sla_breached: false }
  ],

  /* moderation_case — ai_classification_label, risk_tier, risk_score,
     decision, decided_by, decided_at, external_provider_case_ref (§3.7) */
  moderation_cases: [
    { id: "MC-118", question_id: "q9", answer_id: null,
      ai_classification_label: "possible-identity-disclosure", risk_tier: "escalate",
      risk_score: 0.64, decision: "pending", decided_by: null, decided_at: null,
      external_provider_case_ref: "prov_c81f2a",
      content_preview: "“The guy who topped OS last sem — tall one from B-block, you know who — said the paper leaks…”" },
    { id: "MC-117", question_id: null, answer_id: "a41",
      ai_classification_label: "borderline-harassment", risk_tier: "escalate",
      risk_score: 0.58, decision: "pending", decided_by: null, decided_at: null,
      external_provider_case_ref: "prov_b44e91",
      content_preview: "“People who ask this every year are honestly hopeless, just drop out and…”" }
  ],

  /* grievance_officer_contact — officer_name, contact_email, contact_phone,
     process_summary (§3.14) */
  grievance_officer_contact: {
    officer_name: "A. Deshmukh",
    contact_email: "grievance@murmur.app",
    contact_phone: "+91 98xx-xx-2140",
    process_summary: "Every report is acknowledged within 24 hours and resolved within the IT Rules 2021 window. You can report in-app from any post, or write to the grievance officer directly — anonymously if you prefer."
  }
};
