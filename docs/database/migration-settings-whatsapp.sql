-- Settings nomor dan pesan WhatsApp untuk aktivasi langganan.
-- Dibaca halaman /subscription lewat RPC public.get_setting(name)
-- (lihat migration-auto-calc-competency.sql). Jalankan di Supabase SQL Editor.
-- Nilai di bawah hanya placeholder; sesuaikan lewat UPDATE atau modul admin.

BEGIN;

INSERT INTO public.settings ("group", name, value, type, options, description)
SELECT v."group", v.name, v.value, v.type, v.options, v.description
FROM (VALUES
  ('SYSTEM', 'WA_NUMBER', '081200000000', 'TEXT', '',
   'Nomor WhatsApp admin untuk aktivasi langganan (format 08xx atau 628xx).'),
  ('SYSTEM', 'WA_MSG_SISWA', 'Halo TKA TryOut, saya ingin mengaktifkan langganan Siswa Mandiri.', 'TEXT', '',
   'Pesan awal saat siswa mandiri menekan Aktifkan Sekarang.'),
  ('SYSTEM', 'WA_MSG_SEKOLAH', 'Halo TKA TryOut, sekolah kami ingin mengaktifkan langganan Sekolah.', 'TEXT', '',
   'Pesan awal saat sekolah menekan Aktifkan Sekarang.')
) AS v("group", name, value, type, options, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings s
  WHERE s."group" = v."group" AND s.name = v.name
);

NOTIFY pgrst, 'reload schema';

COMMIT;
