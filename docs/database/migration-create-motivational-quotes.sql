-- Create the requested motivational quotes table.
-- Safe to run repeatedly in Supabase SQL Editor.
-- The primary key also guarantees uniqueness of id.

CREATE TABLE IF NOT EXISTS public.motivational_quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote varchar(255) NOT NULL,
  source varchar(255),
  reference varchar(255),
  CONSTRAINT motivational_quotes_pkey PRIMARY KEY (id)
);
