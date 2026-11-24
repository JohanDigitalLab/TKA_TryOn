// Offline-only reproducible assembly. Reads the catalog snapshot and blockers SQL, never env/network/DB.
const fs = require('node:fs');
const crypto = require('node:crypto');
const snapshotPath = '.local/database/addendum-02-db.json';
const target = 'docs/database/migration-school-advanced-agenda.sql';
const raw = fs.readFileSync(snapshotPath);
if (crypto.createHash('sha256').update(raw).digest('hex') !== 'bf6c2bc274e7def1432142c528fc800243feff4775ae245e80471ff23f99356f') throw Error('Snapshot drift: review required');
const functions = JSON.parse(raw).sets.functions;
const blockers = fs.readFileSync('docs/database/migration-school-advanced-blockers.sql', 'utf8').replaceAll('\r\n', '\n');
const marker = '-- Snapshot-derived reconciled assignment and engine functions follow.';
const base = fs.readFileSync(target, 'utf8').split(marker)[0] + marker + '\n';
function snapshot(name) {
 const f = functions.find(f => f.proname === name);
 if (!f) throw Error(`Missing snapshot function ${name}`);
 return f.definition.replaceAll('\r\n', '\n').trimEnd() + ';\n';
}
function blocker(name) {
 const start = blockers.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
 const end = blockers.indexOf('$function$;', start);
 if (start < 0 || end < 0) throw Error(`Missing blocker ${name}`);
 return blockers.slice(start, end + '$function$;'.length);
}
function replace(source, from, to) {
 if (!source.includes(from)) throw Error(`Source drift: ${from}`);
 return source.replace(from, to);
}
const output = [];
// Guard every callable legacy start entry point without adopting event/assignment sessions.
let legacy = snapshot('learning_legacy_start');
legacy = replace(legacy, "SET search_path TO 'public', 'pg_temp'", "SET search_path TO 'pg_catalog'");
legacy = replace(legacy, 'BEGIN\n', `BEGIN
    PERFORM private.school_actor();
    PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||v_user_id::text,0));
    IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE user_id=v_user_id AND grade=p_grade
      AND subject_name=p_subject_name AND attempt_status='IN_PROGRESS'
      AND (scheduled_tryout_id IS NOT NULL OR attempt_type='ASSIGNMENT')) THEN
      RAISE EXCEPTION 'Use the activity-specific start/resume endpoint';
    END IF;
`);
output.push(legacy);
const publics = [];
const privates = ['private.learning_legacy_start(integer,text,integer,integer)',
 'private.school_advanced_scope(uuid,uuid,text[])','private.require_school_staff(uuid)',
 'private.school_schedule_access(uuid)','private.school_schedule_deadline(uuid)'];
for (const name of ['get_teacher_workspace','save_school_assignment','set_school_assignment_status','get_school_assignment_ranking']) {
 let sql = snapshot('x' + name);
 sql = replace(sql, 'public.x' + name + '(', 'public.' + name + '(');
 sql = sql.replace(' STABLE SECURITY DEFINER', ' SECURITY DEFINER');
 sql = replace(sql, "SET search_path TO 'public', 'pg_temp'", "SET search_path TO 'pg_catalog'");
 if (name === 'set_school_assignment_status') {
  sql = replace(sql, 'BEGIN\n', 'BEGIN\n  LOCK TABLE public.schools, public.profiles, public.school_memberships, auth.users IN SHARE MODE;\n');
  sql = replace(sql, 'n integer;', 'n integer; recipient uuid;');
  sql = replace(sql, "IF n=0 THEN RAISE EXCEPTION 'Kelas belum memiliki siswa aktif yang sesuai.'; END IF;", "IF n=0 THEN RAISE EXCEPTION 'Kelas belum memiliki siswa aktif yang sesuai.'; END IF;\n    FOR recipient IN SELECT user_id FROM public.school_assignment_recipients WHERE assignment_id=a.id ORDER BY user_id LOOP\n      PERFORM private.school_advanced_scope(a.school_id,recipient,ARRAY['student']);\n    END LOOP;");
  sql = replace(sql, "AND q.question_type IN ('PG_TUNGGAL','PGK_MA','PGK_KATEGORI')", "AND v.version_status='PUBLISHED' AND q.question_type IN ('PG_TUNGGAL','PGK_MA','PGK_KATEGORI')");
 }
 if (name === 'get_school_assignment_ranking') {
  sql = replace(sql, "WHERE r.assignment_id=a.id AND e.attempt_status='SUBMITTED'", "WHERE a.status='published' AND r.assignment_id=a.id AND e.attempt_type='ASSIGNMENT' AND e.attempt_status='SUBMITTED'");
 }
 output.push(sql);
 const original = functions.find(f => f.proname === 'x' + name);
 const oldSig = 'public.' + original.signature.replace(/^public\./, '');
 const sig = oldSig.replace('.x' + name, '.' + name);
 publics.push(sig);
 // Old x names retain no callable surface, including previous effective grants.
 output.push(`REVOKE ALL ON FUNCTION ${oldSig} FROM PUBLIC, anon, authenticated;`);
}
let studentAssignments = snapshot('get_student_assignments');
studentAssignments = studentAssignments.replace(' STABLE SECURITY DEFINER',' SECURITY DEFINER');
studentAssignments = replace(studentAssignments,"SET search_path TO 'public', 'pg_temp'","SET search_path TO 'pg_catalog'");
studentAssignments = replace(studentAssignments,'DECLARE result jsonb;','DECLARE result jsonb; sid uuid;');
studentAssignments = replace(studentAssignments,'BEGIN\n',`BEGIN
  PERFORM private.school_actor();
  FOR sid IN SELECT DISTINCT a.school_id FROM public.school_assignment_recipients r
    JOIN public.school_assignments a ON a.id=r.assignment_id WHERE r.user_id=auth.uid() AND a.status<>'draft' LOOP
    PERFORM private.school_advanced_scope(sid,auth.uid(),ARRAY['student']);
  END LOOP;
`);
output.push(studentAssignments);
publics.push('public.get_student_assignments()');
let assignment = blocker('private.school_assignment_access');
assignment = replace(assignment, 'SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id FOR SHARE;',
 "SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id;\n  PERFORM private.school_advanced_scope(a.school_id,u,ARRAY['student']);\n  SELECT * INTO a FROM public.school_assignments WHERE id=p_assignment_id FOR SHARE;");
output.push(assignment);
privates.push('private.school_assignment_access(uuid,uuid)');
let resume = snapshot('resume_tka_tryout');
resume = replace(resume, 'a public.exam_attempts%ROWTYPE; qs jsonb; ans jsonb;', 'a public.exam_attempts%ROWTYPE; qs jsonb; ans jsonb; due timestamptz;');
resume = replace(resume, 'BEGIN\n', "BEGIN\n  PERFORM pg_advisory_xact_lock(hashtextextended('learning:user:'||u::text,0));\n  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=u AND scheduled_tryout_id IS NOT NULL) THEN\n    due:=private.school_schedule_deadline(p_attempt_id);\n  END IF;\n");
resume = replace(resume, "'remaining_seconds',greatest", "'deadline_at',coalesce(due,a.started_at+a.duration_minutes*interval '1 minute'),\n    'remaining_seconds',greatest");
resume = replace(resume, "(a.started_at+a.duration_minutes*interval '1 minute'-clock_timestamp())", "(coalesce(due,a.started_at+a.duration_minutes*interval '1 minute')-clock_timestamp())");
output.push(resume);
privates.push('private.resume_tka_tryout(uuid)');
for (const name of ['save_exam_answer','submit_exam_attempt']) {
 let sql = blocker('public.' + name);
 sql = replace(sql, 'v_assignment_deadline timestamptz;', 'v_assignment_deadline timestamptz;\n  v_schedule_deadline timestamptz;');
 const select = '  SELECT * INTO v_attempt\n';
 sql = replace(sql, select, "  IF EXISTS(SELECT 1 FROM public.exam_attempts WHERE id=p_attempt_id AND user_id=v_user_id AND scheduled_tryout_id IS NOT NULL) THEN\n    v_schedule_deadline:=private.school_schedule_deadline(p_attempt_id);\n  END IF;\n" + select);
 if (name === 'save_exam_answer') {
  sql = replace(sql, '  v_now := clock_timestamp();', "  v_now := clock_timestamp();\n  IF v_attempt.scheduled_tryout_id IS NOT NULL AND (v_schedule_deadline IS NULL OR v_now>=v_schedule_deadline) THEN\n    RAISE EXCEPTION 'Agenda deadline reached';\n  END IF;");
 } else {
  sql = replace(sql, '  SELECT COUNT(*)::integer,', "  IF v_attempt.scheduled_tryout_id IS NOT NULL THEN\n    IF v_schedule_deadline IS NULL THEN RAISE EXCEPTION 'Invalid agenda deadline'; END IF;\n    v_submitted_after_deadline:=clock_timestamp()>=v_schedule_deadline;\n  END IF;\n\n  SELECT COUNT(*)::integer,");
 }
 output.push(sql);
 publics.push(name === 'save_exam_answer' ? 'public.save_exam_answer(uuid,uuid,jsonb)' : 'public.submit_exam_attempt(uuid)');
}
// Standalone engine must neither resume an event attempt nor expire event/history rows.
let start = snapshot('start_tka_tryout');
start = replace(start, "AND attempt_type='TRYOUT' AND attempt_status='IN_PROGRESS'", "AND scheduled_tryout_id IS NULL AND attempt_type='TRYOUT' AND attempt_status='IN_PROGRESS'");
start = replace(start, "  UPDATE public.exam_attempts SET attempt_status='EXPIRED' WHERE user_id=u AND grade=g AND subject_name=subj\n    AND attempt_status='IN_PROGRESS' AND started_at+duration_minutes*interval '1 minute'<=clock_timestamp();", "  -- No automatic expiration: preserve all historical and event attempts.");
output.push(start);
publics.push('public.start_tka_tryout(text)');
publics.push('public.create_school_schedule(uuid,text,text,timestamptz,timestamptz,uuid[])',
 'public.set_school_schedule_status(uuid,text,bigint)', 'public.start_school_schedule(uuid)',
 'public.get_school_schedule_agenda(uuid)', 'public.get_school_schedule_participants(uuid,integer,integer)',
 'public.school_advanced_capabilities(uuid)');
output.push(`CREATE OR REPLACE FUNCTION public.school_advanced_capabilities(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 PERFORM private.school_require(p_school_id,false);
 PERFORM private.school_advanced_scope(p_school_id,private.school_actor(),ARRAY['teacher','school_admin','student']);
 RETURN jsonb_build_object('capability_version','school-advanced-sql/1','school_id',p_school_id,
 'assignment_contract',1,'agenda_contract',1,'single_set_package',true,'max_attempts',1,
 'full_duration_start',true,'revocation_finalize','deny','school_reference','schools.id');
END $f$;`);
for (const sig of privates) output.push(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`);
for (const sig of publics) output.push(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;\nGRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`);
output.push('ROLLBACK; -- REVIEW-ONLY. Never run as an application migration.\n');
fs.writeFileSync(target, base + output.join('\n\n'));
console.log('Assembled review-only SQL from pinned local snapshot; no DB/network access.');
