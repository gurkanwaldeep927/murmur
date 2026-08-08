-- Rollback of 004 (plan T27).
--
-- Tables first, then the enums they use: an enum cannot be dropped while a column still
-- declares it. The indexes and triggers go with their tables, so they need no line of their own.
DROP TABLE IF EXISTS content_draft;
DROP TABLE IF EXISTS sync_queue_item;

DROP TYPE IF EXISTS draft_entity_type_enum;
DROP TYPE IF EXISTS sync_status_enum;
DROP TYPE IF EXISTS sync_entity_type_enum;
