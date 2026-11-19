-- Run after all historical migrations defining the history RPC.
-- ALTER FUNCTION preserves OID, implementation, defaults, ownership and ACL.
-- Fail rather than overwrite when both names exist; allow safe reapplication.
DO $$
BEGIN
  IF to_regprocedure('public.get_student_exam_history(integer,timestamptz)') IS NOT NULL THEN
    IF to_regprocedure('public.get_student_tryout_history(integer,timestamptz)') IS NOT NULL THEN
      RAISE EXCEPTION 'Both student history RPC names exist; reconcile before renaming';
    END IF;
    ALTER FUNCTION public.get_student_exam_history(integer, timestamptz)
      RENAME TO get_student_tryout_history;
  ELSIF to_regprocedure('public.get_student_tryout_history(integer,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Student history RPC (integer, timestamptz) is missing';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
