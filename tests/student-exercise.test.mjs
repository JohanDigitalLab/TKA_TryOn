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
 const loader=sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.start_student_exercise'));
 assert.doesNotMatch(loader,/is_correct|correct_category|explanation|scoring_rule/);
 for(const key of ["'options'","'category_items'","'answers'","'remaining_seconds',NULL","user_id=u","attempt_type='EXERCISE'"]) assert.ok(loader.includes(key),key);
});
test('exercise save and submit retain structure checks without deadline; legacy dispatch preserved',()=>{
 const save=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION private.exercise_save_answer'),sql.indexOf('DO $$ BEGIN'));
 assert.ok(save.includes('private.exam_answer_payload_is_valid'));
 assert.ok(save.includes('ON CONFLICT (attempt_id, question_id)'));
 assert.ok(save.includes('private.exam_answer_is_correct'));
 assert.doesNotMatch(save,/duration_minutes/);
 for(const name of ['resume_exam_attempt','save_exam_answer','submit_exam_attempt']) assert.ok(sql.includes('private.exercise_legacy_'+name));
});
test('first start, subsequent subjects, double click guards and untimed CBT are wired',()=>{
 const form=read('src/app/student/exercise/page.js'),cbt=read('src/app/student/challenge/page.js');
 assert.ok(form.includes('supabase.rpc("start_student_exercise"'));
 assert.ok(form.includes('if (startingRef.current) return'));
 assert.ok(cbt.includes('delete currentConfig.exerciseAttemptId'));
 assert.ok(cbt.includes('if (advancingRef.current) return'));
 assert.ok(cbt.includes('currentConfig.adaptiveExercise ? "start_student_exercise"'));
 assert.ok(cbt.includes('!attemptId || untimed'));
});
