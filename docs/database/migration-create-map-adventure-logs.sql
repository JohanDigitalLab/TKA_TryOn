-- MANUAL DEPLOY ONLY through Supabase SQL Editor as the trusted schema owner.
-- Creates the requested table only; does not backfill or change game RPCs.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.map_adventure_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  map_topic_id uuid NOT NULL,
  node_type text NOT NULL,
  exam_attempt_id uuid NOT NULL,
  stars integer NOT NULL DEFAULT 0,
  CONSTRAINT map_adventure_logs_node_type_check
    CHECK (node_type IN ('PRACTICE', 'SIDEQUEST', 'GATEKEEPER'))
);

-- Preserve rows if the earlier manual draft was installed with its old column name.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='map_adventure_logs' AND column_name='map_topic_id')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='map_adventure_logs' AND column_name='topic_attempt_id') THEN
    ALTER TABLE public.map_adventure_logs RENAME COLUMN map_topic_id TO topic_attempt_id;
  END IF;
END $$;

COMMENT ON COLUMN public.map_adventure_logs.node_type
  IS 'PRACTICE | SIDEQUEST | GATEKEEPER';

-- No foreign keys, extra uniqueness constraints or public write policies requested.
-- PRIMARY KEY already makes id unique and NOT NULL.
ALTER TABLE public.map_adventure_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.map_adventure_logs FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
