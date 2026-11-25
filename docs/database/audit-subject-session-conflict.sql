-- READ ONLY. Inspect staging/production manually; do not infer definitions from names.
BEGIN TRANSACTION READ ONLY;
SELECT i.indexrelid::regclass AS index_name,i.indisunique,i.indisvalid,i.indisready,
       pg_get_indexdef(i.indexrelid) AS definition,pg_get_expr(i.indpred,i.indrelid) AS predicate,
       c.conname,c.contype,pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_index i LEFT JOIN pg_constraint c ON c.conindid=i.indexrelid
WHERE i.indrelid='public.exam_attempts'::regclass ORDER BY 1;
SELECT conname,contype,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='public.exam_attempts'::regclass;
SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger
WHERE tgrelid='public.exam_attempts'::regclass AND NOT tgisinternal;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN('start_tka_tryout','start_student_exercise','resume_exam_attempt','resume_tka_tryout','resume_student_exercise'))
   OR (n.nspname='private' AND p.proname IN('school_actor','is_game_exam_attempt','subject_session_conflict'));
SELECT n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod) AS type
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='private' AND c.relname IN('bossfight_sessions','virtualpet_sessions','mapadventure_sessions')
  AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,a.attnum;
SELECT attempt_type,attempt_status,count(*) FROM public.exam_attempts GROUP BY 1,2 ORDER BY 1,2;
-- Detect inconsistent data without exposing student identifiers or changing rows.
SELECT count(*) AS duplicate_active_subject_groups FROM (
 SELECT user_id,grade,subject_name FROM public.exam_attempts WHERE attempt_status='IN_PROGRESS'
 GROUP BY user_id,grade,subject_name HAVING count(*)>1
) x;
ROLLBACK;
