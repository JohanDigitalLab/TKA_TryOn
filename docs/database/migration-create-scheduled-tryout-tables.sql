-- Create scheduled tryout tables according to the requested specification.
-- Run in Supabase SQL Editor. Existing tables are left unchanged.
-- timestamp means timestamp without time zone, as requested.
-- Primary keys also guarantee uniqueness of id.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_tryouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tryout_code varchar(50) NOT NULL,
  label varchar(255) NOT NULL,
  description text,
  start_at timestamp without time zone NOT NULL,
  deadline timestamp without time zone NOT NULL,
  school_uid uuid NOT NULL,
  tka_code1 varchar(50) NOT NULL,
  tka_code2 varchar(50),
  tka_code3 varchar(50),
  tka_code4 varchar(50),
  tka_code5 varchar(50),
  CONSTRAINT scheduled_tryouts_pkey PRIMARY KEY (id),
  CONSTRAINT scheduled_tryouts_tryout_code_key UNIQUE (tryout_code)
);

CREATE TABLE IF NOT EXISTS public.scheduled_tryout_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scheduled_tryouts uuid NOT NULL,
  user_id uuid NOT NULL,
  CONSTRAINT scheduled_tryout_users_pkey PRIMARY KEY (id)
);

COMMIT;
