-- MANUAL DEPLOY ONLY; run after migration-create-map-adventure-logs.sql,
-- before migration-mapadventure.sql. No live DB automation or historical backfill.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
ALTER TABLE public.map_adventure_logs
  ADD COLUMN IF NOT EXISTS stars integer NOT NULL DEFAULT 0;
NOTIFY pgrst, 'reload schema';
COMMIT;
