-- Rollback of 009. Restores prevent_self_vote() to migration 003's definition verbatim —
-- NOT a DROP. The trigger created by 003 still points at this function by name, so dropping
-- it would leave 003 in a state it never defined and self-voting unguarded. A rollback may
-- remove what 009 added; it may not remove what 003 was relying on.
CREATE OR REPLACE FUNCTION prevent_self_vote() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type = 'upvote' AND NEW.answer_id IS NOT NULL THEN
        IF NEW.actor_profile_id = (SELECT author_profile_id FROM answer WHERE id = NEW.answer_id) THEN
            RAISE EXCEPTION 'self-vote forbidden';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP INDEX IF EXISTS uniq_answer_accepted_per_question;
