-- Migration 004 — the offline outbox and the draft autosave table (plan T27)
-- Tables: sync_queue_item, content_draft
-- Source: docs/05-schema.md §4 (frozen DDL), §5 (indexes), §4a (write-model fork SG-5).
--
-- Enum scope note: §4 declares all 12 enums in one block; each migration introduces only the
-- enums its own tables use. 004 takes the three offline-branch enums.
--
-- APPLY ORDER, and it is the third time this trap has appeared (003, 005, now 004). This file
-- takes the empty 004 slot, so on a FRESH database it runs between 003 and 005 — but on the
-- live database 005 through 010 have already been recorded in schema_migrations, so this runs
-- LAST. Migration 008 (the SEC-003 hardening) sweeps only the tables that exist when it runs
-- and will therefore never see these two. The hardening block at the bottom is carried here,
-- idempotently, so it is correct in both orders.
--
-- It matters more here than it did for 003 or 005, and that is worth saying out loud: these two
-- tables hold text a student has written and has NOT published. `sync_queue_item.payload`
-- carries a queued post that no moderator has seen, and `content_draft.body` is a half-finished
-- thought that may never be posted at all. Reachable through the app's published API key, they
-- would be the worst leak in the product — worse than the published content, because the
-- student never chose to show any of it to anyone.

CREATE TYPE sync_entity_type_enum AS ENUM ('question', 'answer', 'vote', 'report');
CREATE TYPE sync_status_enum AS ENUM ('pending', 'syncing', 'synced', 'conflict', 'rejected');
CREATE TYPE draft_entity_type_enum AS ENUM ('question', 'answer');

-- ---------------------------------------------------------------------
-- sync_queue_item — the outbox (schema §4a, SG-5).
--
-- Two different identifiers, deliberately, and confusing them is the classic offline bug:
-- `client_local_id` is what the phone made up while it had no signal, and `id` /
-- `server_assigned_id` are what the server decides at sync time. The UNIQUE on
-- (owner_profile_id, client_local_id) is what makes a replayed batch idempotent — the phone
-- can send the same queue twice and the second one collides instead of duplicating a post.
--
-- It is scoped to the OWNER rather than being globally unique on purpose: two phones can
-- independently generate the same local id, and that is not a collision between two people.
-- ---------------------------------------------------------------------
CREATE TABLE sync_queue_item (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_profile_id    uuid NOT NULL REFERENCES pseudonymous_profile(id),
    client_local_id     uuid NOT NULL,
    idempotency_key     uuid NOT NULL,
    entity_type         sync_entity_type_enum NOT NULL,
    payload             jsonb NOT NULL,
    client_created_at   timestamptz NOT NULL,
    sync_status         sync_status_enum NOT NULL DEFAULT 'pending',
    server_assigned_id  uuid,
    retry_count         integer NOT NULL DEFAULT 0,
    last_attempt_at     timestamptz,
    error_reason        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_sync_queue_owner_local_id UNIQUE (owner_profile_id, client_local_id)
);

-- ---------------------------------------------------------------------
-- content_draft — autosave for a post still being written.
-- ---------------------------------------------------------------------
CREATE TABLE content_draft (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id           uuid NOT NULL REFERENCES pseudonymous_profile(id),
    entity_type          draft_entity_type_enum NOT NULL,
    parent_question_id   uuid REFERENCES question(id),
    topic_tag_id         uuid REFERENCES topic_tag(id),
    title                text,
    body                 text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    -- Only the answer direction is constrained, matching the frozen schema. A question draft
    -- carrying a parent id would be meaningless rather than harmful, and the indexes below do
    -- not read that column for questions — noted so the asymmetry is not later "tidied up" into
    -- a constraint nobody decided.
    CONSTRAINT chk_content_draft_answer_has_parent
        CHECK (entity_type <> 'answer' OR parent_question_id IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- Indexes (§5)
--
-- THE FROZEN SCHEMA'S TWO HALVES DISAGREE, AND THIS IS WHERE. §5's index table requires
-- `content_draft` to be "partial unique per entity_type (question: one per profile; answer:
-- one per (profile_id, parent_question_id))" — and §4's DDL block, which is what a migration
-- gets copied from, declares no content_draft index at all.
--
-- Copying §4 alone would have shipped a table where autosave has nothing to upsert against:
-- every save from the composer would INSERT another row, so a student writing one question
-- would accumulate a draft per keystroke-batch, and reopening the composer would face a pile
-- of drafts with no defensible way to pick one. It is silent — nothing errors, the table just
-- grows — which is why it is written down here rather than fixed in passing.
--
-- Both indexes are UNIQUE and partial, which is what makes `ON CONFLICT` upsert possible in
-- T28. The answer index can rely on `parent_question_id` being non-null because the CHECK
-- above guarantees it: a NULL there would not conflict with another NULL in Postgres, and the
-- uniqueness would quietly not hold.
-- ---------------------------------------------------------------------
CREATE INDEX idx_sync_queue_owner_status ON sync_queue_item (owner_profile_id, sync_status);

CREATE UNIQUE INDEX uq_content_draft_one_question_per_profile
    ON content_draft (profile_id)
    WHERE entity_type = 'question';

CREATE UNIQUE INDEX uq_content_draft_one_answer_per_question
    ON content_draft (profile_id, parent_question_id)
    WHERE entity_type = 'answer';

-- ---------------------------------------------------------------------
-- updated_at triggers (set_updated_at() created by migration 001)
--
-- `content_draft.updated_at` is not housekeeping here: it is the only thing that can say which
-- of two devices' drafts is newer, which is what the last-write-wins rule in schema §4a needs.
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_sync_queue_item_updated_at BEFORE UPDATE ON sync_queue_item
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_content_draft_updated_at BEFORE UPDATE ON content_draft
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- Storage hardening for the two tables this migration creates (SEC-003).
-- See the apply-order note at the top. Same shape as migrations 003 and 005.
-- The role guard is not padding: `anon` and `authenticated` are Supabase roles and do not
-- exist in the plain postgres:16 service CI runs against.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    role_name text;
    tbl       text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['sync_queue_item', 'content_draft']
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
        LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, role_name);
            END IF;
        END LOOP;
    END LOOP;
END $$;
