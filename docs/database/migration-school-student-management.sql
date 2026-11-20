-- Manajemen siswa dikelola oleh akun sekolah/admin.
-- Menyediakan daftar siswa lengkap (untuk pencarian, paging, dan modal edit),
-- pembuatan akun siswa baru, serta pembaruan data siswa.
--
-- Jalankan SETELAH migration-school-profile-operator.sql dan
-- migration-add-profile-account-fields.sql.
--
-- Catatan: create_school_student menulis langsung ke auth.users. Fungsi ini
-- SECURITY DEFINER dengan owner postgres, sehingga hanya bisa dipanggil lewat
-- RPC (tidak ada grant tulis ke tabel auth.users bagi authenticated/anon).
-- Kolom yang diisi mengikuti struktur minimum auth.users Supabase; bila versi
-- GoTrue di proyekmu menambahkan kolom NOT NULL tanpa default, sesuaikan INSERT.
BEGIN;

-- =====================================================
-- 1. DAFTAR SISWA KELOLAAN LENGKAP
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_school_students_detail(p_school_id uuid DEFAULT NULL)
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT upper(btrim(coalesce(p.account_type, ''))), p.school_id
    INTO v_role, v_own_school
  FROM public.profiles p
  WHERE p.id = v_user;

  IF v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Hanya akun sekolah atau admin yang dapat melihat daftar siswa.' USING ERRCODE = '42501';
  END IF;

  v_target := CASE WHEN v_role = 'ADMIN' THEN COALESCE(p_school_id, v_own_school) ELSE v_own_school END;
  IF v_target IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Email yang ditampilkan selalu email login (auth.users.email);
  -- kolom profiles.email sudah dihapus dari skema.
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'user_id', s.id,
             'nisn', nullif(btrim(coalesce(s.nisn, '')), ''),
             'full_name', s.full_name,
             'email', nullif(btrim(coalesce(u.email, '')), ''),
             'wa_number', s.wa_number,
             'education_level', lower(btrim(coalesce(s.education_level, ''))),
             'profile_completed', s.profile_completed) ORDER BY s.full_name, s.id)
    FROM public.profiles s
    LEFT JOIN auth.users u ON u.id = s.id
    WHERE s.school_id = v_target
      AND upper(btrim(coalesce(s.account_type, ''))) = 'STUDENT'
      AND s.is_managed IS TRUE
  ), '[]'::jsonb);
END;
$$;

-- =====================================================
-- 2. BUAT AKUN SISWA BARU
-- =====================================================

CREATE OR REPLACE FUNCTION public.create_school_student(
  p_nisn text,
  p_email text,
  p_full_name text,
  p_wa_number text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_school_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_own_school uuid;
  v_target uuid;
  v_level text;
  v_nisn text := btrim(coalesce(p_nisn, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_full_name, ''));
  v_wa text := nullif(regexp_replace(coalesce(p_wa_number, ''), '[^0-9+]', '', 'g'), '');
  v_id uuid := gen_random_uuid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;

  SELECT upper(btrim(coalesce(p.account_type, ''))), p.school_id
    INTO v_role, v_own_school
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Hanya akun sekolah atau admin yang dapat menambah siswa.' USING ERRCODE = '42501';
  END IF;

  v_target := CASE WHEN v_role = 'ADMIN' THEN COALESCE(p_school_id, v_own_school) ELSE v_own_school END;
  IF v_target IS NULL OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = v_target) THEN
    RAISE EXCEPTION 'Sekolah tujuan tidak valid.' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(coalesce(el.education_level_id, ''))) INTO v_level
  FROM public.schools s
  LEFT JOIN public.school_types el ON el.id = s.school_type_id
  WHERE s.id = v_target;

  -- Validasi field wajib dan format.
  IF v_nisn = '' OR v_nisn !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'NISN wajib diisi dan tepat 10 digit angka.' USING ERRCODE = '22023';
  END IF;
  IF v_email = '' OR char_length(v_email) > 50
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Email wajib diisi dengan format yang valid.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Nama lengkap wajib diisi, 2-160 karakter.' USING ERRCODE = '22023';
  END IF;
  IF p_password IS NULL OR char_length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password minimal 8 karakter.' USING ERRCODE = '22023';
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

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'Email sudah digunakan.' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.nisn = v_nisn) THEN
    RAISE EXCEPTION 'NISN sudah digunakan akun lain.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, is_sso_user
  )
  VALUES (
    v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('full_name', v_name, 'registration_method', 'school'),
    now(), now(), '', '', false
  );

  -- Trigger handle_new_user mungkin sudah membuat baris profil; pastikan nilainya.
  -- Email tidak disimpan di profiles; cukup email login pada auth.users.
  INSERT INTO public.profiles (
    id, full_name, nisn, wa_number, account_type, is_managed,
    school_id, education_level, education_level_locked_at, profile_completed, updated_at
  )
  VALUES (
    v_id, v_name, v_nisn, v_wa, 'STUDENT', true,
    v_target, NULLIF(v_level, ''), CASE WHEN NULLIF(v_level, '') IS NULL THEN NULL ELSE now() END,
    false, now()
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      nisn = EXCLUDED.nisn,
      wa_number = EXCLUDED.wa_number,
      account_type = 'STUDENT',
      is_managed = true,
      school_id = EXCLUDED.school_id,
      education_level = COALESCE(public.profiles.education_level, EXCLUDED.education_level),
      updated_at = now();

  RETURN jsonb_build_object(
    'user_id', v_id,
    'nisn', v_nisn,
    'full_name', v_name,
    'email', v_email,
    'wa_number', v_wa,
    'school_id', v_target,
    'education_level', NULLIF(v_level, '')
  );
END;
$$;

-- =====================================================
-- 3. PERBARUI DATA SISWA (NISN dan EMAIL TIDAK BERUBAH)
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_school_student(
  p_user_id uuid,
  p_full_name text,
  p_wa_number text DEFAULT NULL,
  p_school_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_own_school uuid;
  v_target uuid;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_wa text := nullif(regexp_replace(coalesce(p_wa_number, ''), '[^0-9+]', '', 'g'), '');
  v_email text;
  v_student public.profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Siswa wajib dipilih.' USING ERRCODE = '22023';
  END IF;

  SELECT upper(btrim(coalesce(p.account_type, ''))), p.school_id
    INTO v_role, v_own_school
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Hanya akun sekolah atau admin yang dapat mengubah data siswa.' USING ERRCODE = '42501';
  END IF;

  v_target := CASE WHEN v_role = 'ADMIN' THEN COALESCE(p_school_id, v_own_school) ELSE v_own_school END;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Sekolah tujuan tidak valid.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Nama lengkap wajib diisi, 2-160 karakter.' USING ERRCODE = '22023';
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

  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = p_user_id
    AND school_id = v_target
    AND upper(btrim(coalesce(account_type, ''))) = 'STUDENT'
    AND is_managed IS TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan pada sekolah ini.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET full_name = v_name,
      wa_number = v_wa,
      updated_at = now()
  WHERE id = p_user_id;

  SELECT * INTO v_student FROM public.profiles WHERE id = p_user_id;

  -- Email dikembalikan dari akun login, bukan dari profiles.
  SELECT nullif(btrim(coalesce(u.email, '')), '') INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  RETURN jsonb_build_object(
    'user_id', v_student.id,
    'nisn', nullif(btrim(coalesce(v_student.nisn, '')), ''),
    'full_name', v_student.full_name,
    'email', v_email,
    'wa_number', v_student.wa_number,
    'education_level', lower(btrim(coalesce(v_student.education_level, '')))
  );
END;
$$;

-- =====================================================
-- 4. RESET PASSWORD SISWA
-- =====================================================

CREATE OR REPLACE FUNCTION public.reset_school_student_password(
  p_user_id uuid,
  p_password text,
  p_school_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_own_school uuid;
  v_target uuid;
  v_email text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Siswa wajib dipilih.' USING ERRCODE = '22023';
  END IF;
  IF p_password IS NULL OR char_length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password minimal 8 karakter.' USING ERRCODE = '22023';
  END IF;

  SELECT upper(btrim(coalesce(p.account_type, ''))), p.school_id
    INTO v_role, v_own_school
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_role IS DISTINCT FROM 'SCHOOL' AND v_role IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Hanya akun sekolah atau admin yang dapat mengatur ulang password siswa.' USING ERRCODE = '42501';
  END IF;

  v_target := CASE WHEN v_role = 'ADMIN' THEN COALESCE(p_school_id, v_own_school) ELSE v_own_school END;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Sekolah tujuan tidak valid.' USING ERRCODE = '42501';
  END IF;

  -- Kunci perubahan pada siswa kelolaan sekolah aktif milik pemanggil.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.school_id = v_target
      AND upper(btrim(coalesce(p.account_type, ''))) = 'STUDENT'
      AND p.is_managed IS TRUE
  ) THEN
    RAISE EXCEPTION 'Siswa tidak ditemukan pada sekolah ini.' USING ERRCODE = '42501';
  END IF;

  SELECT nullif(btrim(coalesce(u.email, '')), '') INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  UPDATE auth.users
  SET encrypted_password = crypt(p_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun login siswa tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('user_id', p_user_id, 'email', v_email, 'password_reset', true);
END;
$$;

COMMENT ON FUNCTION public.get_school_students_detail(uuid) IS
  'Daftar siswa dikelola sekolah pemanggil/admin; email memakai email login.';
COMMENT ON FUNCTION public.create_school_student(text, text, text, text, text, uuid) IS
  'Membuat akun auth.users dan profil STUDENT is_managed untuk sekolah aktif.';
COMMENT ON FUNCTION public.update_school_student(uuid, text, text, uuid) IS
  'Memperbarui nama dan nomor WhatsApp siswa; NISN dan email tidak diubah.';
COMMENT ON FUNCTION public.reset_school_student_password(uuid, text, uuid) IS
  'Mengatur ulang password login siswa kelolaan sekolah aktif.';

DO $$ DECLARE f regprocedure; BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_school_students_detail', 'create_school_student', 'update_school_student', 'reset_school_student_password')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
