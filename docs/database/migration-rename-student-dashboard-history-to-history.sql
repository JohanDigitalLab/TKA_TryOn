-- Run after migration-student-dashboard-history.sql; do not rerun the historical
-- creator after this rename. See STUDENT_HISTORY.md for deployment order.
-- ALTER FUNCTION preserves OID, implementation, defaults, ownership and ACL.
-- Fail rather than overwrite when both names exist; allow safe reapplication.
DO $$
BEGIN
  IF to_regprocedure('public.get_student_dashboard_history(integer)') IS NOT NULL THEN
    IF to_regprocedure('public.get_student_history(integer)') IS NOT NULL THEN
      RAISE EXCEPTION 'Both student dashboard history RPC names exist; reconcile before renaming';
    END IF;
    ALTER FUNCTION public.get_student_dashboard_history(integer)
      RENAME TO get_student_history;
  ELSIF to_regprocedure('public.get_student_history(integer)') IS NULL THEN
    RAISE EXCEPTION 'Student dashboard history RPC (integer) is missing';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
