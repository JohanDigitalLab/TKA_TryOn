-- Add requested account/profile fields to public.profiles.
-- Safe to run repeatedly in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name varchar(255),
  ADD COLUMN IF NOT EXISTS nickname varchar(50),
  ADD COLUMN IF NOT EXISTS is_subscribed boolean,
  ADD COLUMN IF NOT EXISTS is_verified boolean,
  ADD COLUMN IF NOT EXISTS account_type varchar(10),
  ADD COLUMN IF NOT EXISTS nisn char(10),
  ADD COLUMN IF NOT EXISTS school_uid uuid,
  ADD COLUMN IF NOT EXISTS is_managed boolean,
  ADD COLUMN IF NOT EXISTS email varchar(50),
  ADD COLUMN IF NOT EXISTS wa_number varchar(20),
  ADD COLUMN IF NOT EXISTS profile_completed boolean,
  ADD COLUMN IF NOT EXISTS has_tried_tryout boolean,
  ADD COLUMN IF NOT EXISTS has_tried_exercise boolean;

-- Normalize existing rows before applying the requested constraints/defaults.
UPDATE public.profiles
SET full_name = ''
WHERE full_name IS NULL;

UPDATE public.profiles
SET is_subscribed = false
WHERE is_subscribed IS NULL;

UPDATE public.profiles
SET is_verified = false
WHERE is_verified IS NULL;

UPDATE public.profiles
SET account_type = 'STUDENT'
WHERE account_type IS NULL;

UPDATE public.profiles
SET is_managed = false
WHERE is_managed IS NULL;

UPDATE public.profiles
SET profile_completed = false
WHERE profile_completed IS NULL;

UPDATE public.profiles
SET has_tried_tryout = false
WHERE has_tried_tryout IS NULL;

UPDATE public.profiles
SET has_tried_exercise = false
WHERE has_tried_exercise IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN full_name TYPE varchar(255),
  ALTER COLUMN full_name SET NOT NULL,
  ALTER COLUMN is_subscribed SET DEFAULT false,
  ALTER COLUMN is_subscribed SET NOT NULL,
  ALTER COLUMN is_verified SET DEFAULT false,
  ALTER COLUMN is_verified SET NOT NULL,
  ALTER COLUMN account_type SET DEFAULT 'STUDENT',
  ALTER COLUMN is_managed SET DEFAULT false,
  ALTER COLUMN is_managed SET NOT NULL,
  ALTER COLUMN profile_completed SET DEFAULT false,
  ALTER COLUMN profile_completed SET NOT NULL,
  ALTER COLUMN has_tried_tryout SET DEFAULT false,
  ALTER COLUMN has_tried_tryout SET NOT NULL,
  ALTER COLUMN has_tried_exercise SET DEFAULT false,
  ALTER COLUMN has_tried_exercise SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_type_length,
  ADD CONSTRAINT profiles_account_type_length CHECK (char_length(account_type) <= 10);

-- Email is unique when supplied; multiple NULL values remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (email)
  WHERE email IS NOT NULL;
