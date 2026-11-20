-- Update public.subjects identity columns.
-- Run this migration in the Supabase SQL Editor.
--
-- Result:
--   id  -> name (unique, no longer primary key)
--   uuid -> uuid primary key, unique, generated automatically

BEGIN;

-- Remove the existing primary-key constraint from subjects.id.
ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_pkey;

-- Rename the existing subject identifier column.
ALTER TABLE public.subjects
  RENAME COLUMN id TO name;

-- The former id column is now the subject name and must be unique.
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_name_key UNIQUE (name);

-- Add the new UUID identity column. Existing rows receive generated UUIDs.
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS uuid uuid;

UPDATE public.subjects
SET uuid = gen_random_uuid()
WHERE uuid IS NULL;

ALTER TABLE public.subjects
  ALTER COLUMN uuid SET DEFAULT gen_random_uuid(),
  ALTER COLUMN uuid SET NOT NULL;

ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_uuid_pkey PRIMARY KEY (uuid);

COMMIT;
