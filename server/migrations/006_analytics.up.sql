-- Migration 006 — analytics_event (plan T44; moved up from M6 so metric history
-- accumulates from tracer time — see docs/07-plan.md revision note §1).
-- Source: docs/05-schema.md §3.12 (frozen DDL) + §7 index list.
-- Append-only ledger: no updated_at trigger by design.

CREATE TABLE analytics_event (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type         text NOT NULL,
    actor_profile_id   uuid REFERENCES pseudonymous_profile(id),
    occurred_at        timestamptz NOT NULL DEFAULT now(),
    metadata           jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_event_type_time ON analytics_event (event_type, occurred_at);
CREATE INDEX idx_analytics_event_actor ON analytics_event (actor_profile_id);
