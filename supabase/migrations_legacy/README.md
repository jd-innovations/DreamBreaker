# Legacy Supabase Migrations

These migrations are retained for audit/provenance only.

They were archived on 2026-07-25 during the DreamBreaker PB database re-baseline because the historical migration chain is not replayable from an empty database. The active replay path is now `supabase/migrations/`, beginning with `20260725000000_baseline_from_prod.sql` and its companion migrations.

Do not run these legacy files as a fresh migration chain. Do not edit or re-timestamp the PAR migrations until the new baseline and companion migrations have successfully rebuilt a clean database and passed production parity checks.