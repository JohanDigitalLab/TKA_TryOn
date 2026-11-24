-- Fondasi gamifikasi. Jalankan melalui Supabase SQL Editor.
-- Tidak menambahkan FK/policy/kolom relasi di luar kontrak yang diminta.
-- RLS tanpa policy menutup akses client; akses aplikasi perlu RPC/policy terpisah.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  "group" varchar(50) NOT NULL DEFAULT 'SYSTEM',
  name varchar(50) NOT NULL,
  value varchar(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subject_themes (
  topic_uid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject varchar(20) NOT NULL UNIQUE,
  theme varchar(255) NOT NULL,
  icon text
);

ALTER TABLE public.subject_topics
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS learning_material text,
  ADD COLUMN IF NOT EXISTS learning_material_url text;
-- Backfill hanya NULL, sehingga materi yang sudah ada tetap utuh.
UPDATE public.subject_topics
SET learning_material = COALESCE(learning_material, ''),
    learning_material_url = COALESCE(learning_material_url, '')
WHERE learning_material IS NULL OR learning_material_url IS NULL;
ALTER TABLE public.subject_topics
  ALTER COLUMN learning_material SET NOT NULL,
  ALTER COLUMN learning_material_url SET NOT NULL;

ALTER TABLE public.exam_attempts ADD COLUMN IF NOT EXISTS gamification text;
ALTER TABLE public.question_versions
  ADD COLUMN IF NOT EXISTS estimate_minutes numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS clue text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp_score int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.virtual_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  name varchar(50) NOT NULL,
  level int NOT NULL DEFAULT 0,
  status varchar(255),
  xp_score int NOT NULL DEFAULT 0,
  drink_score int NOT NULL DEFAULT 100,
  food_score int NOT NULL DEFAULT 100,
  happy_score int NOT NULL DEFAULT 100,
  is_active bool NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.virtual_pet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  virtual_pet_id uuid NOT NULL,
  water int NOT NULL DEFAULT 0,
  rice int NOT NULL DEFAULT 0,
  apple int NOT NULL DEFAULT 0,
  donut int NOT NULL DEFAULT 0,
  cake int NOT NULL DEFAULT 0,
  vitamin int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.gamification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity text NOT NULL,
  xp_score int NOT NULL DEFAULT 0,
  timestamp timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gamification_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(50) NOT NULL,
  icon text,
  created_at timestamp NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

-- Tidak ada league_id pada spesifikasi; tidak ditambahkan secara implisit.
CREATE TABLE IF NOT EXISTS public.gamification_league_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  member_since timestamp NOT NULL DEFAULT now(),
  xp_base_score int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.map_adventure_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  theme varchar(255) NOT NULL,
  topic varchar(255) NOT NULL,
  kemahilmu_timestamp timestamp,
  kemahilmu_attempt_id uuid,
  poslatihan_timestamp timestamp,
  poslatihan_attempt_id uuid,
  sidequest_timestamp timestamp,
  sidequest_attempt_id uuid,
  mysterychest_timestamp timestamp,
  mysterychest_attempt_id uuid,
  pospenjaga_timestamp timestamp,
  pospenjaga_attempt_id uuid
);

CREATE TABLE IF NOT EXISTS public.map_adventure_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  theme varchar(255) NOT NULL,
  is_completed bool NOT NULL DEFAULT false,
  completed_at timestamp
);

CREATE TABLE IF NOT EXISTS public.map_adventure_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clue int NOT NULL DEFAULT 0,
  freezetime int NOT NULL DEFAULT 0,
  fiftyfifty int NOT NULL DEFAULT 0,
  skipreplace int NOT NULL DEFAULT 0,
  secondchance int NOT NULL DEFAULT 0
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_pet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_adventure_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_adventure_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_adventure_tools ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
COMMIT;
