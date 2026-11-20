-- Add requested fields to the existing exam attempts table.
-- Run in Supabase SQL Editor. This script is safe to run repeatedly.
-- The application schema uses public.exam_attempts (plural).
-- tka_configuration_uid intentionally remains nullable until legacy rows are backfilled.

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS attempt_type varchar(10),
  ADD COLUMN IF NOT EXISTS tka_configuration_uid uuid;

-- Backfill existing rows before enforcing NOT NULL on attempt_type.
-- Adjust this value if your application uses a different attempt type.
UPDATE public.exam_attempts
SET attempt_type = 'TRYOUT'
WHERE attempt_type IS NULL;

ALTER TABLE public.exam_attempts
  ALTER COLUMN attempt_type SET NOT NULL;
