-- Rollback of migration 005. Drop order is FK-reverse; indexes and triggers go with their
-- tables. set_updated_at() belongs to 001 and is left in place.
--
-- grievance_report carries a self-referencing FK (merged_into_report_id), which needs no
-- special handling: dropping the table drops the constraint with it.
DROP TABLE IF EXISTS grievance_audit_log;
DROP TABLE IF EXISTS grievance_officer_contact;
DROP TABLE IF EXISTS grievance_report;
DROP TYPE IF EXISTS grievance_resolution_enum;
DROP TYPE IF EXISTS grievance_status_enum;
