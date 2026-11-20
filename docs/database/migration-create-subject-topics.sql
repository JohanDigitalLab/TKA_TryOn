-- Create the subject_topics table.
-- Run this migration in the Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subject_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_code varchar(20) NOT NULL,
  theme varchar(255) NOT NULL,
  topic varchar(255) NOT NULL,
  syllabus varchar(255)
);

COMMENT ON TABLE public.subject_topics IS 'Daftar tema, topik, dan silabus untuk setiap subject.';
COMMENT ON COLUMN public.subject_topics.id IS 'Identifier unik subject topic.';
COMMENT ON COLUMN public.subject_topics.subject_code IS 'Kode subject, maksimal 20 karakter.';
COMMENT ON COLUMN public.subject_topics.theme IS 'Tema subject.';
COMMENT ON COLUMN public.subject_topics.topic IS 'Topik subject.';
COMMENT ON COLUMN public.subject_topics.syllabus IS 'Silabus subject, opsional.';

COMMIT;
