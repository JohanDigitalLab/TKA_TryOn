-- Change subject_topics.subject_code from varchar to text.
-- Run this migration in the Supabase SQL Editor.

BEGIN;

ALTER TABLE public.subject_topics
  ALTER COLUMN subject_code TYPE text
  USING subject_code::text;

COMMIT;
