-- Manual deployment via Supabase SQL Editor as the trusted schema owner.
-- Requires migration-gamification-foundation.sql and subject_topics.subject_code.
-- subject_themes.subject stores subject_topics.subject_code (not subject name).
-- Adds missing DISTINCT pairs only; existing IDs, themes and icons stay intact.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Serialize schema/backfill changes and keep the source stable for this transaction.
LOCK TABLE public.subject_topics IN SHARE MODE;
LOCK TABLE public.subject_themes IN ACCESS EXCLUSIVE MODE;

-- Foundation originally allowed only one theme per subject. Remove only UNIQUE
-- constraints/indexes whose sole key is subject; retain PKs and other constraints.
-- No CASCADE: dependent foreign keys must be reviewed explicitly by the operator.
DO $$
DECLARE
  subject_att smallint;
  entry record;
BEGIN
  SELECT attnum INTO STRICT subject_att FROM pg_attribute
  WHERE attrelid = 'public.subject_themes'::regclass
    AND attname = 'subject' AND NOT attisdropped;

  FOR entry IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.subject_themes'::regclass
      AND contype = 'u' AND conkey = ARRAY[subject_att]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.subject_themes DROP CONSTRAINT %I', entry.conname);
  END LOOP;

  FOR entry IN
    SELECT idx.indexrelid::regclass AS index_name
    FROM pg_index idx
    WHERE idx.indrelid = 'public.subject_themes'::regclass
      AND idx.indisunique AND NOT idx.indisprimary
      AND idx.indnkeyatts = 1 AND idx.indkey[0] = subject_att
      AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = idx.indexrelid)
  LOOP
    EXECUTE format('DROP INDEX %s', entry.index_name);
  END LOOP;

  -- Do not silently merge existing IDs/icons if duplicate pairs already exist.
  IF EXISTS (
    SELECT 1 FROM public.subject_themes GROUP BY subject, theme HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate subject/theme pairs exist in subject_themes; reconcile them before retrying';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subject_themes'::regclass AND contype = 'u'
      AND conkey = ARRAY[subject_att, (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.subject_themes'::regclass
          AND attname = 'theme' AND NOT attisdropped
      )]::smallint[]
  ) THEN
    ALTER TABLE public.subject_themes
      ADD CONSTRAINT subject_themes_subject_theme_key UNIQUE (subject, theme);
  END IF;
END $$;

INSERT INTO public.subject_themes (subject, theme)
SELECT DISTINCT topic.subject_code, topic.theme
FROM public.subject_topics AS topic
WHERE nullif(btrim(topic.subject_code), '') IS NOT NULL
  AND nullif(btrim(topic.theme), '') IS NOT NULL
ON CONFLICT (subject, theme) DO NOTHING;

-- Preserve original text/case to match existing topic joins exactly.
-- New topic_uid values and icon defaults come from the existing table schema.
COMMIT;
