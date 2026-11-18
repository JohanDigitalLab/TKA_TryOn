-- Rename subject_topics.subject_id to subject_code.
-- Run this migration in the Supabase SQL Editor.

BEGIN;

ALTER TABLE public.subject_topics
  RENAME COLUMN subject_id TO subject_code;

COMMIT;
