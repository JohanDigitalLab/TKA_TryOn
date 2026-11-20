-- Halaman Profil Siswa: RPC pembaruan profil mandiri.
-- Jalankan di Supabase SQL Editor sebelum halaman /student/profile digunakan.
-- Bucket 'avatars' dan policy RLS-nya kini berada di file terpisah:
-- migration-storage-avatars-bucket.sql (jalankan lebih dulu bila belum pernah).
-- Fungsi bersifat SECURITY DEFINER dengan owner postgres sehingga trigger
-- proteksi jenjang (current_user = authenticated) tidak memblokir perubahan
-- education_level oleh pemilik akun itu sendiri melalui RPC ini.
BEGIN;

-- =====================================================
-- RPC PEMBARUAN PROFIL
-- =====================================================

-- Signature lama (7 parameter) di-drop agar PostgREST tidak ambigu;
-- email kini selalu merujuk email login (auth.users.email), bukan kolom profiles.
DROP FUNCTION IF EXISTS public.update_student_profile(text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_student_profile(
  p_full_name text DEFAULT NULL,
  p_nickname text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_education_level text DEFAULT NULL,
  p_nisn text DEFAULT NULL,
  p_wa_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_nickname text := nullif(btrim(coalesce(p_nickname, '')), '');
  v_avatar_url text := nullif(btrim(coalesce(p_avatar_url, '')), '');
  v_level text := lower(nullif(btrim(coalesce(p_education_level, '')), ''));
  v_nisn text := nullif(btrim(coalesce(p_nisn, '')), '');
  v_email text;
  v_wa text := nullif(regexp_replace(coalesce(p_wa_number, ''), '[^0-9+]', '', 'g'), '');
  v_completed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil akun tidak ditemukan.' USING ERRCODE = '42501';
  END IF;

  -- Hanya siswa mandiri (bukan siswa kelolaan sekolah) yang dapat membuka halaman ini.
  IF lower(btrim(coalesce(v_profile.account_type, ''))) <> 'student'
     OR COALESCE(v_profile.is_managed, false) IS TRUE THEN
    RAISE EXCEPTION 'Hanya akun siswa mandiri yang dapat memperbarui profil ini.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_full_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Nama lengkap harus 2-160 karakter.' USING ERRCODE = '22023';
  END IF;

  IF v_nickname IS NOT NULL AND char_length(v_nickname) > 50 THEN
    RAISE EXCEPTION 'Nama panggilan maksimal 50 karakter.' USING ERRCODE = '22023';
  END IF;

  IF v_avatar_url IS NOT NULL
     AND (char_length(v_avatar_url) > 2048
          OR (v_avatar_url !~* '^https://' AND v_avatar_url !~* '^http://')) THEN
    RAISE EXCEPTION 'URL avatar tidak valid.' USING ERRCODE = '22023';
  END IF;

  IF v_level IS NOT NULL AND v_level NOT IN ('sd', 'smp', 'sma') THEN
    RAISE EXCEPTION 'Jenjang pendidikan harus sd, smp, atau sma.' USING ERRCODE = '22023';
  END IF;

  IF v_nisn IS NOT NULL AND v_nisn !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'NISN harus tepat 10 digit angka.' USING ERRCODE = '22023';
  END IF;

  IF v_wa IS NOT NULL THEN
    IF v_wa LIKE '00%' THEN
      v_wa := '+' || substring(v_wa FROM 3);
    ELSIF v_wa LIKE '0%' THEN
      v_wa := '+62' || substring(v_wa FROM 2);
    END IF;
    IF v_wa !~ '^\+62[1-9][0-9]{6,13}$' OR char_length(v_wa) > 20 THEN
      RAISE EXCEPTION 'Nomor WhatsApp tidak valid. Contoh: 081234567890.' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.profiles
  SET full_name = v_full_name,
      nickname = v_nickname,
      avatar_url = v_avatar_url,
      education_level = v_level,
      nisn = v_nisn,
      wa_number = v_wa,
      updated_at = now()
  WHERE id = v_user;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user;

  -- Email diambil dari akun login; tidak lagi disimpan di profiles.
  SELECT nullif(btrim(coalesce(u.email, '')), '') INTO v_email
  FROM auth.users u
  WHERE u.id = v_user;

  -- Kelengkapan profil: nama, email login, nomor WhatsApp, dan jenjang pendidikan.
  v_completed := char_length(btrim(coalesce(v_profile.full_name, ''))) > 0
    AND v_email IS NOT NULL
    AND nullif(btrim(coalesce(v_profile.wa_number, '')), '') IS NOT NULL
    AND lower(btrim(coalesce(v_profile.education_level, ''))) IN ('sd', 'smp', 'sma');

  IF v_profile.profile_completed IS DISTINCT FROM v_completed THEN
    UPDATE public.profiles
    SET profile_completed = v_completed,
        profile_completed_at = CASE WHEN v_completed THEN now() ELSE profile_completed_at END
    WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user,
    'full_name', v_profile.full_name,
    'nickname', v_profile.nickname,
    'avatar_url', v_profile.avatar_url,
    'education_level', v_profile.education_level,
    'nisn', nullif(btrim(coalesce(v_profile.nisn, '')), ''),
    'email', v_email,
    'wa_number', v_profile.wa_number,
    'profile_completed', v_completed
  );
END;
$$;

COMMENT ON FUNCTION public.update_student_profile(text, text, text, text, text, text) IS
  'Memperbarui enam field profil siswa mandiri dan menghitung ulang profile_completed.';

REVOKE ALL ON FUNCTION public.update_student_profile(text, text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_student_profile(text, text, text, text, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
