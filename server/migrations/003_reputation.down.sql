-- Rollback of migration 003. Drop order is FK-reverse; indexes and triggers go with their
-- tables. set_updated_at() belongs to 001 and is left in place.
--
-- prevent_self_vote() IS dropped here, unlike set_updated_at(): it was created by this
-- migration and is used by nothing else, so leaving it behind would make a re-apply's
-- CREATE OR REPLACE silently inherit whatever the old definition was.
--
-- Unlike 008, this rollback is faithful — dropping these tables removes a capability, it
-- does not re-open a hole. The RLS and REVOKE statements in the up-migration disappear
-- with the tables they applied to.
DROP TABLE IF EXISTS reputation_event;
DROP TABLE IF EXISTS ban_record;
DROP FUNCTION IF EXISTS prevent_self_vote();
DROP TYPE IF EXISTS reputation_event_type_enum;
