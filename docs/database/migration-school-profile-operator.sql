-- Halaman /school/profile dan /school/operator.
-- Semua akses lewat RPC SECURITY DEFINER: tabel profiles dan schools tidak
-- diberi grant tulis langsung, dan trigger proteksi jenjang tetap dihormati
-- karena fungsi berjalan sebagai owner (postgres).
--
-- Jalankan SETELAH migration-storage-avatars-bucket.sql (bucket avatars)
-- dan migration-add-profile-account-fields.sql.
BEGIN;

-- =====================================================
-- 1. BACA DATA SEKOLAH + OPERATOR + KANDIDAT
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_school_profile(p_school_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_own_school uuid;
  v_target uuid;
  v_types jsonb;
  v_school jsonb;
  v_operators jsonb := '[]'::jsonb;
  v_candidates jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT upper(btrim(coalesce(p.account_type, ''))), p.school_id
    INTO v_role, v_own_school
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Hanya akun sekolah atau admin yang dapat mengakses data sekolah.' USING ERRCODE = '42501';
  END IF;

  -- Tipe sekolah diurutkan menurut grade jenjang pendidikannya, lalu namanya.
  -- school_types.education_level_id berisi kode teks ('sd'/'smp'/'sma') yang sama
  -- dengan education_levels.id, jadi join memakai perbandingan teks dinormalisasi.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name,
             'education_level_id', t.education_level_id, 'grade', t.grade)
           ORDER BY t.grade NULLS LAST, t.name), '[]'::jsonb)
    INTO v_types
  FROM (
    SELECT st.id, st.name, st.education_level_id, el.grade
    FROM public.school_types st
    LEFT JOIN public.education_levels el
      ON lower(btrim(el.id)) = lower(btrim(coalesce(st.education_level_id, '')))
  ) t;

  -- Admin boleh menyebut sekolah mana pun; akun sekolah terkunci pada school_id-nya.
  v_target := CASE WHEN v_role = 'ADMIN' THEN COALESCE(p_school_id, v_own_school) ELSE v_own_school END;

  IF v_target IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'npsn', s.npsn,
      'school_type_id', s.school_type_id,
      'address', s.address,
      'city', s.city,
      'province', s.province,
      'status', s.status,
      'education_level', lower(btrim(coalesce(st.education_level_id, '')))
    ) INTO v_school
    FROM public.schools s
    LEFT JOIN public.school_types st ON st.id = s.school_type_id
    WHERE s.id = v_target;

    IF v_school IS NULL THEN
      RAISE EXCEPTION 'Sekolah tidak ditemukan.' USING ERRCODE = '22023';
    END IF;

    -- Operator = akun SCHOOL yang tertaut pada sekolah ini (siswa dikelola tidak ikut).
    -- Email diambil dari akun login (auth.users.email).
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'user_id', p.id, 'full_name', p.full_name,
             'email', nullif(btrim(coalesce(u.email, '')), ''),
             'account_type', p.account_type) ORDER BY p.full_name, p.id), '[]'::jsonb)
      INTO v_operators
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.school_id = v_target
      AND upper(btrim(coalesce(p.account_type, ''))) = 'SCHOOL';
  END IF;

  -- Calon operator: akun sekolah yang belum terhubung ke sekolah mana pun.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', p.id, 'full_name', p.full_name,
           'email', nullif(btrim(coalesce(u.email, '')), '')) ORDER BY p.full_name, p.id), '[]'::jsonb)
    INTO v_candidates
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE upper(btrim(coalesce(p.account_type, ''))) = 'SCHOOL'
    AND p.school_id IS NULL;

  RETURN jsonb_build_object(
    'role', v_role,
    'school_id', v_target,
    'school', v_school,
    'school_types', v_types,
    'operators', v_operators,
    'candidates', v_candidates
  );
END;
$$;

-- =====================================================
-- 2. PERBARUI DATA SEKOLAH
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_school_profile(
  p_school_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_npsn text DEFAULT NULL,
  p_school_type_id text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_province text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_own_school uuid;
  v_target uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_npsn text := nullif(btrim(coalesce(p_npsn, '')), '');
  v_type text := nullif(btrim(coalesce(p_school_type_id, '')), '');
  v_address text := btrim(coalesce(p_address, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_province text := btrim(coalesce(p_province, ''));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT upper(btrim(coalesce(p.account_type, ''))), p.school_id
    INTO v_role, v_own_school
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Hanya akun sekolah atau admin yang dapat memperbarui data sekolah.' USING ERRCODE = '42501';
  END IF;

  -- Akun sekolah selalu menulis ke sekolahnya sendiri.
  v_target := CASE WHEN v_role = 'ADMIN' THEN COALESCE(p_school_id, v_own_school) ELSE v_own_school END;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Akun belum terhubung ke sekolah mana pun.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'Nama sekolah harus 3-160 karakter.' USING ERRCODE = '22023';
  END IF;
  IF v_npsn IS NOT NULL AND v_npsn !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'NPSN harus tepat 8 digit angka.' USING ERRCODE = '22023';
  END IF;
  IF v_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.school_types st WHERE st.id = v_type) THEN
    RAISE EXCEPTION 'Tipe sekolah tidak dikenali.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_address) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Alamat harus 3-500 karakter.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_city) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Kota/kabupaten harus 2-100 karakter.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_province) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Provinsi harus 2-100 karakter.' USING ERRCODE = '22023';
  END IF;
  IF v_npsn IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.schools s WHERE s.npsn = v_npsn AND s.id <> v_target
  ) THEN
    RAISE EXCEPTION 'NPSN sudah digunakan sekolah lain.' USING ERRCODE = '23505';
  END IF;

  PERFORM 1 FROM public.schools s WHERE s.id = v_target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sekolah tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.schools
  SET name = v_name,
      npsn = coalesce(v_npsn, npsn),
      school_type_id = coalesce(v_type, school_type_id),
      address = v_address,
      city = v_city,
      province = v_province,
      updated_at = now()
  WHERE id = v_target;

  RETURN public.get_school_profile(v_target);
END;
$$;

-- =====================================================
-- 3. Tambah / HAPUS OPERATOR SEKOLAH
-- =====================================================

CREATE OR REPLACE FUNCTION public.set_school_operator(
  p_user_id uuid,
  p_assign boolean DEFAULT true,
  p_school_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_own_school uuid;
  v_target uuid;
  v_level text;
  v_member public.profiles%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Akun target wajib dipilih.' USING ERRCODE = '22023';
  END IF;

  SELECT upper(btrim(coalesce(p.account_type, ''))), p.school_id
    INTO v_role, v_own_school
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Hanya akun sekolah atau admin yang dapat mengelola operator.' USING ERRCODE = '42501';
  END IF;

  v_target := CASE WHEN v_role = 'ADMIN' THEN COALESCE(p_school_id, v_own_school) ELSE v_own_school END;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Akun belum terhubung ke sekolah mana pun.' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(coalesce(st.education_level_id, ''))) INTO v_level
  FROM public.schools s
  LEFT JOIN public.school_types st ON st.id = s.school_type_id
  WHERE s.id = v_target;

  SELECT * INTO v_member FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun target tidak ditemukan.' USING ERRCODE = '22023';
  END IF;
  IF upper(btrim(coalesce(v_member.account_type, ''))) <> 'SCHOOL' THEN
    RAISE EXCEPTION 'Hanya akun sekolah yang dapat menjadi operator.' USING ERRCODE = '42501';
  END IF;

  IF p_assign IS TRUE THEN
    -- Pindah antar sekolah harus dilakukan admin; akun sekolah hanya menambah yang kosong.
    IF v_role = 'SCHOOL' AND v_member.school_id IS NOT NULL AND v_member.school_id <> v_target THEN
      RAISE EXCEPTION 'Akun sudah terhubung ke sekolah lain.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
    SET school_id = v_target,
        education_level = NULLIF(v_level, ''),
        updated_at = now()
    WHERE id = p_user_id;
  ELSE
    IF v_member.school_id IS DISTINCT FROM v_target THEN
      RAISE EXCEPTION 'Akun bukan operator sekolah ini.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
    SET school_id = NULL,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  SELECT jsonb_build_object(
    'user_id', p.id,
    'school_id', p.school_id,
    'education_level', p.education_level,
    'full_name', p.full_name,
    'email', nullif(btrim(coalesce(u.email, '')), '')
  ) INTO v_result
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;

  RETURN v_result;
END;
$$;

-- =====================================================
-- 4. PERBARUI PROFIL OPERATOR SEKOLAH
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_operator_profile(
  p_full_name text DEFAULT NULL,
  p_nickname text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
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
  IF upper(btrim(coalesce(v_profile.account_type, ''))) NOT IN ('SCHOOL', 'ADMIN') THEN
    RAISE EXCEPTION 'Halaman ini hanya untuk akun sekolah atau admin.' USING ERRCODE = '42501';
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

  -- Email tidak disimpan di profiles; perubahan email login tidak dilakukan dari sini.
  UPDATE public.profiles
  SET full_name = v_full_name,
      nickname = v_nickname,
      avatar_url = v_avatar_url,
      wa_number = v_wa,
      updated_at = now()
  WHERE id = v_user;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user;

  -- Kelengkapan: nama, email login, WhatsApp, dan jenjang (diisi saat sekolah ditautkan).
  SELECT nullif(btrim(coalesce(u.email, '')), '') INTO v_email
  FROM auth.users u
  WHERE u.id = v_user;

  v_completed := char_length(btrim(coalesce(v_profile.full_name, ''))) > 0
    AND v_email IS NOT NULL
    AND nullif(btrim(coalesce(v_profile.wa_number, '')), '') IS NOT NULL
    AND lower(btrim(coalesce(v_profile.education_level, ''))) IN ('sd', 'smp', 'sma');

  IF v_profile.profile_completed IS DISTINCT FROM v_completed THEN
    UPDATE public.profiles
    SET profile_completed = v_completed
    WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user,
    'full_name', v_profile.full_name,
    'nickname', v_profile.nickname,
    'avatar_url', v_profile.avatar_url,
    'email', v_email,
    'wa_number', v_profile.wa_number,
    'education_level', v_profile.education_level,
    'account_type', v_profile.account_type,
    'school_id', v_profile.school_id,
    'profile_completed', v_completed
  );
END;
$$;

COMMENT ON FUNCTION public.get_school_profile(uuid) IS
  'Data sekolah pemanggil/admin beserta operator dan kandidat operator.';
COMMENT ON FUNCTION public.update_school_profile(uuid, text, text, text, text, text, text) IS
  'Memperbarui baris public.schools milik akun sekolah atau sekolah terpilih admin.';
COMMENT ON FUNCTION public.set_school_operator(uuid, boolean, uuid) IS
  'Menautkan atau melepas akun sekolah dari sekolah aktif; menyalin jenjang sekolah.';
COMMENT ON FUNCTION public.update_operator_profile(text, text, text, text) IS
  'Memperbarui profil operator sekolah dan menghitung ulang profile_completed.';

DO $$ DECLARE f regprocedure; BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_school_profile', 'update_school_profile', 'set_school_operator', 'update_operator_profile')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
