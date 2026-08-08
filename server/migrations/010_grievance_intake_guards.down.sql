-- Rollback of 010 (plan T34).
--
-- Order matters in the same way it does on the way up, in reverse: the trigger goes before the
-- function it calls, or the DROP FUNCTION fails on a dependency.
DROP TRIGGER IF EXISTS trg_grievance_report_freeze_deadline ON grievance_report;
DROP FUNCTION IF EXISTS grievance_report_freeze_deadline();

ALTER TABLE grievance_report DROP CONSTRAINT IF EXISTS chk_grievance_report_reason;
