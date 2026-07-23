-- Rollback of migration 002. Drop order is FK-reverse; indexes and triggers go
-- with their tables. set_updated_at() belongs to 001 and is left in place.
DROP TABLE IF EXISTS moderation_case;
DROP TABLE IF EXISTS answer;
DROP TABLE IF EXISTS question;
DROP TABLE IF EXISTS topic_tag;
DROP TYPE IF EXISTS moderation_decided_by_enum;
DROP TYPE IF EXISTS ai_risk_tier_enum;
DROP TYPE IF EXISTS moderation_status_enum;
