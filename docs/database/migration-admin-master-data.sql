-- Master Data admin: daftar / simpan / hapus untuk tabel referensi platform.
-- Tabel yang didukung: profiles, subjects, subject_topics, schools,
-- school_types, education_levels.
-- Otorisasi: private.is_super_admin() (sama seperti modul Bank Soal).
-- Nama tabel/kolom divalidasi terhadap whitelist server-side; identifier SQL
-- dinamis hanya dari whitelist, nilai lewat parameter $1/$2.
-- Jalankan di Supabase SQL Editor.
BEGIN;

-- =====================================================
-- 1. DAFTAR + PENCARIAN
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_master_list(
  p_table text,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_select text;
  v_from text;
  v_order text;
  v_search text;
  v_where text := '';
  v_pattern text := nullif(btrim(coalesce(p_search, '')), '');
  v_like text;
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 200), 1), 500);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(private.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Hanya super admin yang dapat membuka master data.' USING ERRCODE = '42501';
  END IF;

  CASE v_table
    WHEN 'profiles' THEN
      v_select := 'x.id, x.full_name, x.nickname, x.education_level, x.account_type, '
        || 'x.account_status, x.nisn, x.wa_number, x.school_id, x.is_managed, '
        || 'x.is_subscribed, x.is_verified, x.profile_completed, x.created_at, '
        || 'nullif(btrim(coalesce(u.email, '''')), '''') AS email';
      v_from := 'public.profiles x LEFT JOIN auth.users u ON u.id = x.id';
      v_order := 'full_name NULLS LAST, id';
      v_search := 'x.full_name, x.nisn, x.account_type, x.nickname, u.email';
    WHEN 'subjects' THEN
      v_select := 'x.id, x.subject_code, x.name, x.education_level_id, x.is_active, x.created_at';
      v_from := 'public.subjects x';
      v_order := 'education_level_id, name';
      v_search := 'x.subject_code, x.name, x.education_level_id';
    WHEN 'subject_topics' THEN
      v_select := 'x.id, x.subject_code, x.theme, x.topic, x.syllabus';
      v_from := 'public.subject_topics x';
      v_order := 'subject_code, theme, topic';
      v_search := 'x.subject_code, x.theme, x.topic';
    WHEN 'schools' THEN
      v_select := 'x.id, x.name, x.npsn, x.school_type_id, x.address, x.city, x.province, '
        || 'x.status, x.created_by, x.created_at';
      v_from := 'public.schools x';
      v_order := 'name';
      v_search := 'x.name, x.npsn, x.city, x.province';
    WHEN 'school_types' THEN
      v_select := 'x.id, x.name, x.education_level_id';
      v_from := 'public.school_types x';
      v_order := 'name';
      v_search := 'x.id, x.name, x.education_level_id';
    WHEN 'education_levels' THEN
      v_select := 'x.id, x.name, x.grade, x.created_at';
      v_from := 'public.education_levels x';
      v_order := 'grade NULLS LAST, id';
      v_search := 'x.id, x.name';
    ELSE
      RAISE EXCEPTION 'Tabel master data tidak dikenal.' USING ERRCODE = '22023';
  END CASE;

  IF v_pattern IS NOT NULL THEN
    -- Kembangkan daftar kolom menjadi rangkaian OR ILIKE.
    SELECT string_agg(format('%s ILIKE $1', c), ' OR ') INTO v_where
    FROM unnest(string_to_array(v_search, ',')) AS c;
    v_where := ' WHERE (' || v_where || ')';
    v_like := '%' || v_pattern || '%';
  END IF;

  EXECUTE format('SELECT count(*) FROM %s%s', v_from, v_where)
    INTO v_total USING v_like;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb ORDER BY %s), ''[]''::jsonb) '
    || 'FROM (SELECT %s FROM %s%s LIMIT $2 OFFSET $3) q',
    v_order, v_select, v_from, v_where
  ) INTO v_rows
  USING v_like, v_limit, v_offset;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total,
    'limit', v_limit, 'offset', v_offset);
END;
$$;

-- =====================================================
-- 2. SIMPAN (TAMBAH / UBAH)
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_master_save(
  p_table text,
  p_id text DEFAULT NULL,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_allowed text[];
  v_pk_is_text boolean;
  v_is_insert boolean := nullif(btrim(coalesce(p_id, '')), '') IS NULL;
  v_key text;
  v_cast text;
  v_cols text[] := '{}';
  v_vals text[] := '{}';
  v_set text[] := '{}';
  i integer;
  v_sql text;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(private.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Hanya super admin yang dapat mengubah master data.' USING ERRCODE = '42501';
  END IF;

  v_allowed := CASE v_table
    WHEN 'profiles' THEN ARRAY['full_name', 'nickname', 'education_level', 'account_type',
      'account_status', 'nisn', 'wa_number', 'school_id', 'is_managed', 'is_subscribed', 'is_verified']
    WHEN 'subjects' THEN ARRAY['subject_code', 'name', 'education_level_id', 'is_active']
    WHEN 'subject_topics' THEN ARRAY['subject_code', 'theme', 'topic', 'syllabus']
    WHEN 'schools' THEN ARRAY['name', 'npsn', 'school_type_id', 'address', 'city', 'province', 'status']
    WHEN 'school_types' THEN ARRAY['name', 'education_level_id']
    WHEN 'education_levels' THEN ARRAY['name', 'grade']
    ELSE NULL
  END;
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'Tabel master data tidak dikenal.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Payload tidak valid.' USING ERRCODE = '22023';
  END IF;

  SELECT (a.atttypid <> 'uuid'::regtype) INTO v_pk_is_text
  FROM pg_attribute a
  WHERE a.attrelid = ('public.' || v_table)::regclass
    AND a.attname = 'id' AND a.attnum > 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tabel master data tidak dikenal.' USING ERRCODE = '22023';
  END IF;

  -- Semua kunci payload harus ada di whitelist. 'id' ditangani terpisah
  -- (hanya untuk insert tabel ber-PK teks) sehingga tidak perlu diizinkan.
  FOR v_key IN SELECT jsonb_object_keys(p_data) LOOP
    IF v_key = 'id' THEN
      CONTINUE;
    END IF;
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Kolom % tidak diizinkan untuk tabel %.', v_key, v_table USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF v_is_insert AND v_pk_is_text THEN
    -- Tabel dengan PK teks (school_types, education_levels) wajib membawa id.
    IF nullif(btrim(coalesce(p_data ->> 'id', '')), '') IS NULL THEN
      RAISE EXCEPTION 'ID wajib diisi untuk tabel %.', v_table USING ERRCODE = '22023';
    END IF;
    v_cols := v_cols || ARRAY['id'];
    v_vals := v_vals || ARRAY[format('($1->>%L)::text', 'id')];
  END IF;

  FOREACH v_key IN ARRAY v_allowed LOOP
    IF p_data ? v_key THEN
      SELECT format_type(a.atttypid, a.atttypmod) INTO v_cast
      FROM pg_attribute a
      WHERE a.attrelid = ('public.' || v_table)::regclass
        AND a.attname = v_key AND a.attnum > 0;
      v_cols := v_cols || ARRAY[v_key];
      v_vals := v_vals || ARRAY[format('($1->>%L)::%s', v_key, v_cast)];
    END IF;
  END LOOP;

  IF v_is_insert AND v_table = 'schools' THEN
    v_cols := v_cols || ARRAY['created_by'];
    v_vals := v_vals || ARRAY['$2::uuid'];
  END IF;

  IF cardinality(v_cols) = 0 THEN
    RAISE EXCEPTION 'Tidak ada data yang dikirim.' USING ERRCODE = '22023';
  END IF;

  IF v_is_insert THEN
    v_sql := format('INSERT INTO public.%I AS x (%s) VALUES (%s) RETURNING to_jsonb(x)',
      v_table,
      (SELECT string_agg(quote_ident(c), ', ') FROM unnest(v_cols) AS c),
      array_to_string(v_vals, ', '));
    EXECUTE v_sql INTO v_result USING p_data, v_user;
  ELSE
    FOR i IN 1..cardinality(v_cols) LOOP
      v_set := v_set || ARRAY[quote_ident(v_cols[i]) || ' = ' || v_vals[i]];
    END LOOP;
    v_sql := format('UPDATE public.%I AS x SET %s WHERE x.id = $2::%s RETURNING to_jsonb(x)',
      v_table,
      array_to_string(v_set, ', '),
      CASE WHEN v_pk_is_text THEN 'text' ELSE 'uuid' END);
    EXECUTE v_sql INTO v_result USING p_data, p_id;
    IF v_result IS NULL THEN
      RAISE EXCEPTION 'Data tidak ditemukan.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

-- =====================================================
-- 3. HAPUS
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_master_delete(p_table text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_pk_is_text boolean;
  v_id text := nullif(btrim(coalesce(p_id, '')), '');
  v_affected integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(private.is_super_admin(), false) THEN
    RAISE EXCEPTION 'Hanya super admin yang dapat menghapus master data.' USING ERRCODE = '42501';
  END IF;
  IF v_table NOT IN ('profiles', 'subjects', 'subject_topics', 'schools', 'school_types', 'education_levels') THEN
    RAISE EXCEPTION 'Tabel master data tidak dikenal.' USING ERRCODE = '22023';
  END IF;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'ID wajib diisi.' USING ERRCODE = '22023';
  END IF;

  SELECT (a.atttypid <> 'uuid'::regtype) INTO v_pk_is_text
  FROM pg_attribute a
  WHERE a.attrelid = ('public.' || v_table)::regclass
    AND a.attname = 'id' AND a.attnum > 0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tabel master data tidak dikenal.' USING ERRCODE = '22023';
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1::%s', v_table,
    CASE WHEN v_pk_is_text THEN 'text' ELSE 'uuid' END);
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Data tidak ditemukan.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('deleted', true, 'table', v_table, 'id', v_id);
END;
$$;

COMMENT ON FUNCTION public.admin_master_list(text, text, integer, integer) IS
  'Daftar master data (whitelist tabel) untuk super admin dengan pencarian ILIKE.';
COMMENT ON FUNCTION public.admin_master_save(text, text, jsonb) IS
  'Tambah/ubah baris master data; kolom divalidasi whitelist server-side.';
COMMENT ON FUNCTION public.admin_master_delete(text, text) IS
  'Hapus baris master data milik whitelist tabel oleh super admin.';

DO $$ DECLARE f regprocedure; BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_master_list', 'admin_master_save', 'admin_master_delete')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
