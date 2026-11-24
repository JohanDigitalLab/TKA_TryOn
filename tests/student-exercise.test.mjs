import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('docs/database/migration-start-student-exercise.sql');
test('exercise selection validates actor, education, count and snapshots atomically',()=>{
 for(const text of ['auth.uid()',"p_question_count NOT BETWEEN 1 AND 100",'pg_advisory_xact_lock','t.subject_code=p_subject_code','c.user_id=u',"IN('NA','KURANG','CUKUP')",'q.theme=r.theme AND q.topic=r.topic','NOT(q.id=ANY(selected))','LIMIT 1','ORDER BY version_number DESC,id DESC','GET DIAGNOSTICS actual=ROW_COUNT','total_questions=actual',"IF actual=0 THEN RAISE EXCEPTION"]) assert.ok(sql.includes(text),text);
 assert.doesNotMatch(sql,/q\.(element|material|difficulty)/);
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
 assert.doesNotMatch(sql,/\b(?:AS|DO) \$(?!\$|function\$)/);
});
test('active loader excludes keys and explanations while retaining nested structures',()=>{
 // Slice hanya fungsi resume publik; save/submit memakai scorer privat secara sengaja.
 const loader=sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.save_exercise_answer'));
 assert.doesNotMatch(loader,/is_correct|correct_category|explanation|scoring_rule/);
 // EXERCISE mandiri dan ASSIGNMENT sekolah memakai fungsi latihan yang sama.
 for(const key of ["'options'","'category_items'","'answers'","'remaining_seconds',NULL","user_id=u","attempt_type IN('EXERCISE','ASSIGNMENT')","'attempt_type',a.attempt_type"]) assert.ok(loader.includes(key),key);
});

test('private exercise helpers are retired in favour of public functions',()=>{
 // Desain terkini: fungsi spesifik berada di skema public, versi privat di-drop.
 for(const name of ['resume_student_exercise(p_attempt_id uuid)','save_exercise_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb)','submit_exercise_attempt(p_attempt_id uuid)']){
  assert.ok(sql.includes(`DROP FUNCTION IF EXISTS private.${name}`),name);
  assert.doesNotMatch(sql,new RegExp(`CREATE OR REPLACE FUNCTION private\\.${name.split('(')[0]}`),name);
 }
 for(const name of ['public.resume_student_exercise(p_attempt_id uuid)','public.save_exercise_answer(','public.submit_exercise_attempt(p_attempt_id uuid)']){
  assert.ok(sql.includes(`CREATE OR REPLACE FUNCTION ${name}`),name);
 }
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.resume_student_exercise\(uuid\),\s*public\.save_exercise_answer\(uuid,uuid,jsonb\),\s*public\.submit_exercise_attempt\(uuid\) TO authenticated/);
});
test('exercise save and submit retain structure checks without deadline; generic RPCs live only in the canonical file',()=>{
 const firstCommit=sql.indexOf('COMMIT;');
 const save=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.save_exercise_answer'),firstCommit);
 assert.ok(save.includes('private.exam_answer_payload_is_valid'));
 assert.ok(save.includes('ON CONFLICT (attempt_id, question_id)'));
 assert.ok(save.includes('private.exam_answer_is_correct'));
 assert.doesNotMatch(save,/duration_minutes/);
 // Attempt lain (termasuk TRYOUT/gamification) ditolak oleh filter tipe:
 // save memiliki dua pemeriksaan (WHERE + IF status), submit satu pemeriksaan WHERE.
 assert.equal((save.match(/attempt_type (?:IN|NOT IN)\('EXERCISE','ASSIGNMENT'\)/g)||[]).length,3);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.(submit_exam_attempt|save_exam_answer|resume_exam_attempt)|exercise_legacy/);
 const generic=read('docs/database/migration_generic_exam_attempt.sql');
 for(const name of ['resume_exam_attempt','save_exam_answer','submit_exam_attempt']) assert.ok(generic.includes('public.'+name),name);
 assert.doesNotMatch(generic,/exercise_legacy/);
});
test('first start, subsequent subjects, double click guards and untimed CBT are wired',()=>{
 const form=read('src/app/student/exercise/page.js'),cbt=read('src/app/student/challenge/page.js');
 assert.ok(form.includes('supabase.rpc("start_student_exercise"'));
 assert.ok(form.includes('if (startingRef.current) return'));
 assert.ok(cbt.includes('delete currentConfig.exerciseAttemptId'));
 assert.ok(cbt.includes('if (advancingRef.current) return'));
 assert.ok(cbt.includes('"start_student_exercise"'));
 assert.ok(cbt.includes('currentConfig.adaptiveExercise'));
 assert.ok(cbt.includes('!attemptId || untimed'));
});
test('subjects.is_mandatory migration adds non-null boolean default true',()=>{
 const sql=read('docs/database/migration-subjects-is-mandatory.sql');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT true/);
 assert.match(sql,/COMMENT ON COLUMN public\.subjects\.is_mandatory/);
 assert.match(sql,/NOTIFY pgrst, 'reload schema'/);
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
});
test('start_student_exercise gains p_theme and p_topic with latest published selection',()=>{
 const sql=read('docs/database/migration-start-student-exercise.sql');
 assert.match(sql,/public\.start_student_exercise\(\s*p_subject_code text,\s*p_question_count integer DEFAULT 20,\s*p_theme text DEFAULT NULL,\s*p_topic text DEFAULT NULL/);
 assert.match(sql,/DROP FUNCTION IF EXISTS public\.start_student_exercise\(text, integer\)/);
 assert.match(sql,/v_topic IS NOT NULL AND v_theme IS NULL/);
 assert.match(sql,/q\.theme=v_theme/);
 assert.match(sql,/\(v_topic IS NULL OR q\.topic=v_topic\)/);
 assert.match(sql,/ORDER BY random\(\) LIMIT p_question_count/);
 assert.match(sql,/v\.version_status='PUBLISHED'/);
 assert.match(sql,/ORDER BY version_number DESC,id DESC LIMIT 1/);
 // perilaku adaptif lama tetap dipertahankan saat theme tidak diisi
 assert.match(sql,/IN\('NA','KURANG','CUKUP'\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.start_student_exercise\(text, integer, text, text\) FROM PUBLIC, anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.start_student_exercise\(text, integer, text, text\) TO authenticated/);
 assert.match(sql,/NOTIFY pgrst, 'reload schema'/);
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;/);
 assert.doesNotMatch(sql,/\b(?:AS|DO) \$(?!\$|function\$)/);
});
test('staging contract checks new signature, old signature removal, and is_mandatory',()=>{
 const sql=read('tests/database/student-exercise.sql');
 assert.match(sql,/start_student_exercise\(text,integer,text,text\)/);
 assert.match(sql,/Ambiguous old start_student_exercise signature still present/);
 assert.match(sql,/subjects\.is_mandatory column missing/);
});
