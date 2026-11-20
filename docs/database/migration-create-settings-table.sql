-- Tabel baru: settings (konfigurasi platform).
-- id uuid PK default gen_random_uuid(); "group" varchar(50) NOT NULL default 'SYSTEM';
-- name varchar(50) NOT NULL; value varchar(255) NOT NULL.
-- Catatan: "group" adalah kata terkadung PostgreSQL, jadi selalu ditulis dengan
-- kutip ganda pada DDL/DML. Jalankan di Supabase SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "group" varchar(50) NOT NULL DEFAULT 'SYSTEM',
  name varchar(50) NOT NULL,
  value varchar(255) NOT NULL,
  CONSTRAINT settings_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.settings IS
  'Konfigurasi platform per grup (default SYSTEM).';
COMMENT ON COLUMN public.settings."group" IS
  'Grup pengaturan; default SYSTEM. Kata terkadung, tulis sebagai "group".';
COMMENT ON COLUMN public.settings.name IS
  'Kunci pengaturan, misalnya maintenance_mode.';
COMMENT ON COLUMN public.settings.value IS
  'Nilai pengaturan dalam bentuk teks (maks 255 karakter).';

CREATE INDEX IF NOT EXISTS settings_group_idx
  ON public.settings ("group", name);

-- Akses langsung via PostgREST ditutup (tidak ada policy = tolak semua).
-- Pembacaan/penulisan dilakukan melalui RPC SECURITY DEFINER, mengikuti
-- pola modul admin master data.
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

COMMIT;
