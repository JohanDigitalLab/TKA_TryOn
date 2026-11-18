-- Create TKA configuration tables.
-- Safe to run repeatedly in Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tka_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tka_code varchar(50) NOT NULL,
  education_level varchar(10) NOT NULL,
  subject_name varchar(20) NOT NULL,
  total_questions integer NOT NULL,
  duration_minutes integer NOT NULL,
  type varchar(10) NOT NULL DEFAULT 'RANDOM',
  syllabus varchar(50),
  is_default smallint NOT NULL DEFAULT 0,
  CONSTRAINT tka_configurations_pkey PRIMARY KEY (id),
  CONSTRAINT tka_configurations_tka_code_key UNIQUE (tka_code)
);

CREATE TABLE IF NOT EXISTS public.tka_question_set (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tka_code varchar(50) NOT NULL,
  question_code varchar(50) NOT NULL,
  CONSTRAINT tka_question_set_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tka_question_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tka_code varchar(50) NOT NULL,
  theme varchar(255) NOT NULL,
  topic varchar(255) NOT NULL,
  no_of_questions integer NOT NULL DEFAULT 1,
  CONSTRAINT tka_question_config_pkey PRIMARY KEY (id)
);

COMMIT;
