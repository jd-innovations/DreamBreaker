-- Its own migration on purpose: a new enum value cannot be USED in the same
-- transaction that adds it (Postgres only permits that when the type itself was
-- created in that transaction). The lifecycle migration that follows references
-- 'expired' in a WHERE clause, so the value has to be committed first.

ALTER TYPE "public"."marketplace_listing_status" ADD VALUE IF NOT EXISTS 'expired';
