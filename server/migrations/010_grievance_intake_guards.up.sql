-- Migration 010 — the two database-level rules A8 report intake depends on (plan T34).
-- Design + costs: decisions/a8-report-intake-slas.md
--
-- Nothing here adds a column. Both statements below constrain columns migration 005 already
-- created, because both rules protect a number that is legally significant and that the
-- application alone cannot be trusted to keep honest.

-- ---------------------------------------------------------------------
-- 1. `reason` is a closed vocabulary, not free text.
--
-- The TRD requires a CATEGORY-SEGMENTED resolution SLA (§7: general 15 days, specific
-- unlawful-content categories expedited). The frozen schema has no category column — so the
-- reason IS the category, and the deadline is derived from it. UX F7 already says the reporter
-- "selects a reason", i.e. a closed set.
--
-- Why the constraint is here and not only in TypeScript: if any future writer can store a
-- reason the SLA table has never heard of, the deadline computation silently takes its general
-- 15-day branch on a complaint the law gives 24 hours. That failure is invisible — a plausible
-- deadline on a wrong clock — which is the exact shape this project keeps paying for.
--
-- The code checks first so the reporter gets a named error; this refuses regardless
-- (decisions/oq-schema-aggregates-and-vote-enforcement.md §2).
--
-- A CHECK rather than an enum type: `reason` is frozen as `text` in docs/05-schema.md §4, and
-- a CHECK adds the rule without changing the column's type.
-- ---------------------------------------------------------------------
-- The three expedited categories are listed first, and the grouping is not cosmetic: it is the
-- only thing that changes the deadline, so it is the thing a reader must see. The mapping
-- itself lives in server/src/modules/grievance/grievance.slas.ts, named, so T43's legal review
-- is one edit.
ALTER TABLE grievance_report
    ADD CONSTRAINT chk_grievance_report_reason CHECK (reason IN (
        -- expedited (IT Rules 2021 Rule 3(2)(b))
        'non_consensual_imagery',
        'sexual_content_morphed',
        'impersonation',
        -- general (Rule 3(2)(a))
        'harassment',
        'hate_speech',
        'threat_of_violence',
        'spam_or_scam',
        'other'
    ));

-- ---------------------------------------------------------------------
-- 2. `sla_deadline` cannot be moved after the ticket is filed.
--
-- Migration 005's achievement is that `sla_breached` is GENERATED: no code can set it and no
-- code can unset it. But it is generated from `resolved_at > sla_deadline`, so a mutable
-- deadline defeats it without ever touching the flag — push the deadline out, resolve late,
-- and the compliance record reads clean. The generated column closes the front door; this
-- closes the back one.
--
-- Cost, stated in the decision doc: a ticket filed under the wrong reason cannot have its
-- deadline corrected by an UPDATE. That is deliberate — re-categorisation needs an audited
-- path of its own, and it must not arrive as a loosened trigger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grievance_report_freeze_deadline() RETURNS trigger AS $$
BEGIN
    IF NEW.sla_deadline IS DISTINCT FROM OLD.sla_deadline THEN
        RAISE EXCEPTION 'sla_deadline is immutable once a grievance report exists'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grievance_report_freeze_deadline
    BEFORE UPDATE ON grievance_report
    FOR EACH ROW EXECUTE FUNCTION grievance_report_freeze_deadline();
