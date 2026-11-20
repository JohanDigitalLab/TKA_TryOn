-- Seed subject_topics for Kurikulum Merdeka 2026.
-- Run after migration-create-subject-topics.sql in Supabase SQL Editor.
-- subject_code is intentionally not unique because one subject has many topics.

BEGIN;

ALTER TABLE public.subject_topics
  DROP CONSTRAINT IF EXISTS subject_topics_subject_code_key;

INSERT INTO public.subject_topics (subject_code, theme, topic, syllabus)
SELECT v.subject_code, v.theme, v.topic, v.syllabus
FROM (VALUES
  ('MAT-SD', 'Bilangan', 'Operasi hitung bilangan cacah', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Bilangan', 'Kelipatan, faktor, KPK, dan FPB', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Bilangan', 'Pecahan senilai dan urutan pecahan', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Bilangan', 'Operasi hitung pecahan', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Bilangan', 'Pecahan, desimal, dan persen', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Geometri dan Pengukuran', 'Satuan panjang, berat, dan volume', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Geometri dan Pengukuran', 'Waktu dan kecepatan', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Geometri dan Pengukuran', 'Keliling dan luas bangun datar', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Geometri dan Pengukuran', 'Volume kubus dan balok', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Geometri dan Pengukuran', 'Bangun datar dan bangun ruang', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Geometri dan Pengukuran', 'Sudut', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Data', 'Membaca tabel dan diagram', 'Kurikulum Merdeka 2026'),
  ('MAT-SD', 'Data', 'Rata-rata, median, dan modus', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menemukan informasi', 'Informasi tersurat', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menemukan informasi', 'Makna kata dan istilah', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menemukan informasi', 'Membaca tabel dan diagram', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menemukan informasi', 'Urutan dan langkah', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menyimpulkan isi bacaan', 'Ide pokok dan simpulan', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menyimpulkan isi bacaan', 'Tokoh dan perasaan', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menyimpulkan isi bacaan', 'Amanat dan nilai', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menyimpulkan isi bacaan', 'Sebab-akibat dan alur', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menyimpulkan isi bacaan', 'Bahasa kias dan puisi', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menilai dan menanggapi', 'Fakta dan opini', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menilai dan menanggapi', 'Kesesuaian judul dan isi', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menilai dan menanggapi', 'Membandingkan teks', 'Kurikulum Merdeka 2026'),
  ('BI-SD', 'Menilai dan menanggapi', 'Menerapkan isi bacaan', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Bilangan', 'Bilangan real, pangkat, dan akar', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Bilangan', 'Faktorisasi prima, KPK, dan FPB', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Bilangan', 'Perbandingan, skala, dan laju', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Bilangan', 'Estimasi', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Aljabar', 'Bentuk aljabar', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Aljabar', 'Persamaan dan pertidaksamaan linear', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Aljabar', 'Sistem persamaan linear dua variabel', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Aljabar', 'Relasi dan fungsi', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Aljabar', 'Barisan dan deret', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Geometri dan Pengukuran', 'Sudut dan garis', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Geometri dan Pengukuran', 'Teorema Pythagoras', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Geometri dan Pengukuran', 'Kesebangunan dan kekongruenan', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Geometri dan Pengukuran', 'Transformasi geometri', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Geometri dan Pengukuran', 'Bangun ruang: jaring-jaring dan volume', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Geometri dan Pengukuran', 'Keliling dan luas', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Data dan Peluang', 'Penyajian data', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Data dan Peluang', 'Ukuran pemusatan dan penyebaran', 'Kurikulum Merdeka 2026'),
  ('MAT-SMP', 'Data dan Peluang', 'Peluang', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menemukan informasi', 'Informasi tersurat', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menemukan informasi', 'Makna kata dan istilah', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menemukan informasi', 'Membaca tabel dan diagram', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menemukan informasi', 'Urutan dan langkah', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menyimpulkan isi bacaan', 'Ide pokok dan simpulan', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menyimpulkan isi bacaan', 'Tokoh dan perasaan', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menyimpulkan isi bacaan', 'Amanat dan nilai', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menyimpulkan isi bacaan', 'Sebab-akibat dan alur', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menyimpulkan isi bacaan', 'Bahasa kias dan puisi', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menilai dan menanggapi', 'Fakta dan opini', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menilai dan menanggapi', 'Kesesuaian judul dan isi', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menilai dan menanggapi', 'Membandingkan teks', 'Kurikulum Merdeka 2026'),
  ('BI-SMP', 'Menilai dan menanggapi', 'Menerapkan isi bacaan', 'Kurikulum Merdeka 2026')
) AS v(subject_code, theme, topic, syllabus)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subject_topics t
  WHERE t.subject_code = v.subject_code
    AND t.theme = v.theme
    AND t.topic = v.topic
    AND t.syllabus IS NOT DISTINCT FROM v.syllabus
);

COMMIT;
