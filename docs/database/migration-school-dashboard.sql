-- Apply in Supabase SQL Editor before using the school dashboard.
-- Authorizes SCHOOL accounts linked to an existing school, without membership checks.
BEGIN;
DROP FUNCTION IF EXISTS public.get_school_dashboard();
CREATE OR REPLACE FUNCTION public.get_school_students()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user uuid;
  v_school uuid;
  v_account_type text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Silakan login terlebih dahulu.' USING ERRCODE = '42501';
  END IF;
  SELECT p.school_id, p.account_type INTO v_school, v_account_type
  FROM public.profiles p WHERE p.id = v_user;
  IF v_account_type IS DISTINCT FROM 'SCHOOL' THEN
    RAISE EXCEPTION 'Hanya akun sekolah yang dapat mengakses dashboard sekolah.' USING ERRCODE = '42501';
  END IF;
  IF v_school IS NULL OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = v_school) THEN
    RAISE EXCEPTION 'Profil akun harus terhubung dengan sekolah yang valid.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'school', (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'city', s.city, 'province', s.province) FROM public.schools s WHERE s.id = v_school),
    'students', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'nisn', p.nisn, 'full_name', p.full_name) ORDER BY p.full_name, p.id), '[]'::jsonb)
      FROM public.profiles p WHERE p.school_id = v_school AND p.is_managed = true)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_school_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_school_students() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
