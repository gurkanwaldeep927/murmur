-- Migration 009 — close two gaps on the accept path (plan T22).
-- Reasoning and costs: decisions/a6-vote-accept-semantics.md §2, §3.
--
-- Both of these are additive integrity constraints on tables migration 003 created. Neither
-- contradicts the frozen schema; they cover cases §4's DDL did not consider, because the
-- schema wrote its trigger against A6's one named error ("self-vote forbidden") and the
-- accept half of the same endpoint was never asked about.

-- ---------------------------------------------------------------------
-- 1. Self-accept is self-voting wearing a different event type.
--
-- 003's prevent_self_vote() guards event_type = 'upvote' only. Ask a question, answer it
-- yourself, accept it: +15 reputation out of nothing, which is exactly the manufacture R5
-- exists to prevent. Widened rather than given a second trigger, so "may this actor credit
-- this answer" has one home and a future third event type has one obvious place to go.
--
-- CREATE OR REPLACE keeps the trigger binding from 003 intact — the trigger points at the
-- function by name, so replacing the body is all that is needed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_self_vote() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type IN ('upvote', 'accepted_answer') AND NEW.answer_id IS NOT NULL THEN
        IF NEW.actor_profile_id = (SELECT author_profile_id FROM answer WHERE id = NEW.answer_id) THEN
            RAISE EXCEPTION 'self-vote forbidden';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. One accepted answer per question.
--
-- The application checks first so the student gets a named 409 rather than a constraint
-- violation, but two accepts arriving together would both pass that read. Only an index
-- evaluated at write time can refuse the second, which is the same reasoning as 003's
-- duplicate-vote index.
--
-- Partial: unaccepted answers are the overwhelming majority and must not collide.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX uniq_answer_accepted_per_question
    ON answer (question_id)
    WHERE accepted;
