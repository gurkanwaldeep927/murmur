-- Migration 002 — Q&A core + moderation (plan T13)
-- Tables: topic_tag, question, answer, moderation_case
-- Source: docs/05-schema.md §4 (frozen DDL), §5 (indexes). No field invented here.
--
-- Enum scope note: §4 declares all 12 enums in one block; each migration introduces
-- only the enums its own tables use (001 took verification_status/profile_status).
-- 002 takes the three moderation enums; reputation/sync/grievance/draft enums land
-- with migrations 003–005.

-- Enums used by migration 002.
CREATE TYPE moderation_status_enum AS ENUM ('pending', 'published', 'blocked');
CREATE TYPE ai_risk_tier_enum AS ENUM ('auto_pass', 'auto_block', 'escalate');
CREATE TYPE moderation_decided_by_enum AS ENUM ('ai', 'human');

-- ---------------------------------------------------------------------
-- topic_tag — fixed, enumerable topic set backing compose (S6) and browse (S10).
-- Soft-retired via is_active, never deleted (§6: deletion would orphan
-- historical question.topic_tag_id references).
-- ---------------------------------------------------------------------
CREATE TABLE topic_tag (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    label       text NOT NULL,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- question
-- ---------------------------------------------------------------------
CREATE TABLE question (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_profile_id  uuid NOT NULL REFERENCES pseudonymous_profile(id),
    topic_tag_id       uuid NOT NULL REFERENCES topic_tag(id),
    title              text NOT NULL,
    body               text NOT NULL,
    moderation_status  moderation_status_enum NOT NULL DEFAULT 'pending',
    published_at       timestamptz,
    answer_count       integer NOT NULL DEFAULT 0,
    idempotency_key    uuid NOT NULL UNIQUE,
    search_vector      tsvector GENERATED ALWAYS AS (
                           to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
                       ) STORED,
    deleted_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- answer
-- ---------------------------------------------------------------------
CREATE TABLE answer (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id        uuid NOT NULL REFERENCES question(id),
    author_profile_id  uuid NOT NULL REFERENCES pseudonymous_profile(id),
    body               text NOT NULL,
    moderation_status  moderation_status_enum NOT NULL DEFAULT 'pending',
    accepted           boolean NOT NULL DEFAULT false,
    vote_count         integer NOT NULL DEFAULT 0,
    idempotency_key    uuid NOT NULL UNIQUE,
    search_vector      tsvector GENERATED ALWAYS AS (
                           to_tsvector('english', coalesce(body, ''))
                       ) STORED,
    deleted_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- moderation_case — one open case per moderated item; exactly one target.
-- ban_record's originating_moderation_case_id FK arrives with migration 003.
-- ---------------------------------------------------------------------
CREATE TABLE moderation_case (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id                   uuid REFERENCES question(id),
    answer_id                     uuid REFERENCES answer(id),
    ai_classification_label       text,
    risk_tier                     ai_risk_tier_enum,
    risk_score                    numeric,
    decision                      moderation_status_enum NOT NULL DEFAULT 'pending',
    decided_by                    moderation_decided_by_enum,
    decided_at                    timestamptz,
    external_provider_case_ref    text,
    provider_raw_response         jsonb,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_moderation_case_one_target
        CHECK (num_nonnulls(question_id, answer_id) = 1)
);

-- ---------------------------------------------------------------------
-- Indexes (§5)
-- ---------------------------------------------------------------------
CREATE INDEX idx_question_status_published ON question (moderation_status, published_at DESC);
CREATE INDEX idx_question_topic ON question (topic_tag_id);
CREATE INDEX idx_question_author ON question (author_profile_id);
CREATE INDEX idx_question_search_vector ON question USING GIN (search_vector);

CREATE INDEX idx_answer_question ON answer (question_id);
CREATE INDEX idx_answer_author ON answer (author_profile_id);
CREATE INDEX idx_answer_search_vector ON answer USING GIN (search_vector);

CREATE INDEX idx_moderation_case_content ON moderation_case (question_id, answer_id);
CREATE INDEX idx_moderation_case_escalation_queue ON moderation_case (risk_tier)
    WHERE risk_tier = 'escalate' AND decision = 'pending';

-- ---------------------------------------------------------------------
-- updated_at triggers (set_updated_at() created by migration 001)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_topic_tag_updated_at BEFORE UPDATE ON topic_tag
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_question_updated_at BEFORE UPDATE ON question
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_answer_updated_at BEFORE UPDATE ON answer
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_moderation_case_updated_at BEFORE UPDATE ON moderation_case
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Seed: the fixed topic set (PRD R3 / schema §3.1 purpose line).
-- Idempotent so a re-apply after a partial rollback cannot duplicate slugs.
-- ---------------------------------------------------------------------
INSERT INTO topic_tag (slug, label) VALUES
    ('placements',  'Placements'),
    ('internships', 'Internships'),
    ('professors',  'Professors'),
    ('courses',     'Courses'),
    ('advice',      'Advice')
ON CONFLICT (slug) DO NOTHING;
