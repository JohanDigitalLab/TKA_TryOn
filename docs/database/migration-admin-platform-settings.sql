-- Apply manually after review. No configured value is seeded or overwritten.
BEGIN;
LOCK TABLE public.settings IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.settings WHERE "group"='SYSTEM'
    AND name IN ('WA_NUMBER','WA_MSG_SISWA','WA_MSG_SEKOLAH','AUTO_CALC_COMPETENCY')
    GROUP BY name HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate SYSTEM settings: resolve explicitly before migration';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS settings_platform_allowlist_unique ON public.settings(name)
  WHERE "group"='SYSTEM' AND name IN ('WA_NUMBER','WA_MSG_SISWA','WA_MSG_SEKOLAH','AUTO_CALC_COMPETENCY');
CREATE TABLE IF NOT EXISTS public.platform_settings_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO public.platform_settings_state(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.platform_settings_audit (
  revision integer PRIMARY KEY,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 300),
  changes jsonb NOT NULL CHECK(jsonb_typeof(changes)='object' AND octet_length(changes::text)<=12000)
);
ALTER TABLE public.platform_settings_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings_state, public.platform_settings_audit, public.settings FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_platform_settings_authorize()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_global_roles r
    JOIN public.profiles p ON p.id=r.user_id JOIN auth.users u ON u.id=p.id
    WHERE r.user_id=auth.uid() AND r.role='super_admin'
      AND lower(btrim(p.account_status))='active' AND p.is_verified IS TRUE
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until<=now())
  ) THEN RAISE EXCEPTION 'Active verified super admin required' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_platform_settings_authorize() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_platform_settings_get()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.admin_platform_settings_authorize();
  -- One statement snapshot keeps values and revision consistent.
  SELECT jsonb_build_object('revision',s.revision,'values',COALESCE((
    SELECT jsonb_object_agg(t.name,t.value) FROM public.settings t WHERE t."group"='SYSTEM'
      AND t.name IN ('WA_NUMBER','WA_MSG_SISWA','WA_MSG_SEKOLAH','AUTO_CALC_COMPETENCY')
  ),'{}'::jsonb)) INTO result FROM public.platform_settings_state s WHERE singleton;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_platform_settings_save(p_revision integer,p_changes jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_revision integer; k text; v jsonb; normalized text; old_value text;
  diff jsonb := '{}'::jsonb;
BEGIN
  PERFORM public.admin_platform_settings_authorize();
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'Alasan wajib 5–300 karakter' USING ERRCODE='22023'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'object' OR p_changes='{}'::jsonb
    OR octet_length(p_changes::text)>12000 THEN
    RAISE EXCEPTION 'Perubahan tidak valid' USING ERRCODE='22023'; END IF;
  SELECT revision INTO current_revision FROM public.platform_settings_state WHERE singleton FOR UPDATE;
  IF p_revision IS DISTINCT FROM current_revision THEN
    RAISE EXCEPTION 'Stale settings revision' USING ERRCODE='40001'; END IF;
  -- Lock legacy rows as well; compare-and-swap revision serializes all RPC writes.
  LOCK TABLE public.settings IN SHARE ROW EXCLUSIVE MODE;
  FOR k,v IN SELECT * FROM jsonb_each(p_changes) LOOP
    IF k NOT IN ('WA_NUMBER','WA_MSG_SISWA','WA_MSG_SEKOLAH','AUTO_CALC_COMPETENCY')
      OR jsonb_typeof(v)<>'string' OR char_length(v #>> '{}')>255 THEN
      RAISE EXCEPTION 'Kunci, tipe, atau panjang pengaturan tidak valid' USING ERRCODE='22023'; END IF;
    normalized := btrim(v #>> '{}');
    IF k='WA_NUMBER' AND normalized<>'' THEN
      IF normalized !~ '^\+?[0-9 ()-]+$' THEN RAISE EXCEPTION 'Nomor WhatsApp tidak valid' USING ERRCODE='22023'; END IF;
      normalized := regexp_replace(normalized,'[^0-9]','','g');
      IF left(normalized,1)='0' THEN normalized := '62'||substr(normalized,2); END IF;
      IF normalized !~ '^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'Nomor WhatsApp harus 8–15 digit' USING ERRCODE='22023'; END IF;
    ELSIF k='AUTO_CALC_COMPETENCY' THEN
      IF lower(normalized) NOT IN ('1','0','true','false') THEN RAISE EXCEPTION 'Boolean tidak valid' USING ERRCODE='22023'; END IF;
      normalized := CASE WHEN lower(normalized) IN ('1','true') THEN '1' ELSE '0' END;
    END IF;
    SELECT value INTO old_value FROM public.settings WHERE "group"='SYSTEM' AND name=k;
    IF old_value IS DISTINCT FROM normalized THEN
      diff := diff || jsonb_build_object(k,jsonb_build_object('before',old_value,'after',normalized));
      UPDATE public.settings SET value=normalized WHERE "group"='SYSTEM' AND name=k;
      IF NOT FOUND THEN
        INSERT INTO public.settings("group",name,value,type,options,description)
          VALUES('SYSTEM',k,normalized,CASE WHEN k='AUTO_CALC_COMPETENCY' THEN 'BOOL' ELSE 'TEXT' END,'','Dikelola melalui Pengaturan admin');
      END IF;
    END IF;
  END LOOP;
  IF diff<>'{}'::jsonb THEN
    current_revision := current_revision+1;
    UPDATE public.platform_settings_state SET revision=current_revision WHERE singleton;
    INSERT INTO public.platform_settings_audit(revision,actor_id,reason,changes)
      VALUES(current_revision,auth.uid(),btrim(p_reason),diff);
  END IF;
  RETURN public.admin_platform_settings_get();
END $$;

CREATE OR REPLACE FUNCTION public.admin_platform_settings_history(p_before integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.admin_platform_settings_authorize();
  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.revision DESC),'[]'::jsonb) INTO result FROM (
    SELECT revision,actor_id,created_at,reason,changes FROM public.platform_settings_audit
    WHERE p_before IS NULL OR revision<p_before ORDER BY revision DESC LIMIT 20
  ) h;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_platform_settings_get(), public.admin_platform_settings_save(integer,jsonb,text), public.admin_platform_settings_history(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_settings_get(), public.admin_platform_settings_save(integer,jsonb,text), public.admin_platform_settings_history(integer) TO authenticated;
COMMENT ON TABLE public.platform_settings_audit IS 'Allowlisted nonsecret settings only; reasons must not contain credentials or personal data.';
NOTIFY pgrst, 'reload schema';
COMMIT;
