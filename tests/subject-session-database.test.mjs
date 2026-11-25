import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.SUBJECT_SESSION_PGLITE_MODULE;
const read = name => readFile(new URL(`../docs/database/${name}`, import.meta.url), 'utf8');
test('subject start RPCs execute safely with the legacy unique subject index', { skip: !modulePath }, async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  t.after(() => db.close());
  const user = '11111111-1111-1111-1111-111111111111';
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION private.school_actor() RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
      IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
      RETURN auth.uid(); END $$;
    CREATE FUNCTION public.learning_access_context() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"unrestricted":true}'::jsonb $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,education_level text);
    CREATE TABLE public.subjects(subject_code text PRIMARY KEY,name text);
    CREATE TABLE public.tka_configurations(tka_code text PRIMARY KEY,education_level text,subject_code text,total_questions integer,duration_minutes integer,type text);
    CREATE TABLE public.tka_question_config(id serial,tka_code text,theme text,topic text,no_of_questions integer);
    CREATE TABLE public.tka_question_set(tka_code text,question_code text);
    CREATE TABLE public.subject_topics(subject_code text,theme text,topic text);
    CREATE TABLE public.student_competency(user_id uuid,subject text,theme text,topic text,competency_level text);
    CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_code text,subject_code text,grade integer,education_level_id text,question_status text,question_type text);
    CREATE TABLE public.question_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid,version_status text,version_number integer,question_text text,instruction text,stimulus_id uuid);
    CREATE TABLE public.question_stimuli(id uuid,title text,content_text text,file_url text,media_description text);
    CREATE TABLE public.question_options(question_version_id uuid,option_code text,option_text text,option_order integer);
    CREATE TABLE public.question_category_items(question_version_id uuid,item_number integer,item_text text,category_label text);
    CREATE TABLE public.exam_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,education_level text,grade integer,subject_name text,duration_minutes integer,total_questions integer,attempt_type varchar(12),tka_code text,started_at timestamptz,deadline_at timestamptz,attempt_status text DEFAULT 'IN_PROGRESS',correct_answers integer,score numeric,submitted_at timestamptz);
    CREATE UNIQUE INDEX legacy_active_subject ON public.exam_attempts(user_id,grade,subject_name) WHERE attempt_status='IN_PROGRESS';
    CREATE TABLE public.exam_attempt_questions(attempt_id uuid,question_id uuid,question_version_id uuid,question_order integer,UNIQUE(attempt_id,question_id));
    CREATE TABLE public.exam_attempt_answers(attempt_id uuid,question_id uuid,answer_payload jsonb,answered_at timestamptz,UNIQUE(attempt_id,question_id));
    INSERT INTO profiles VALUES('${user}','sd');
    INSERT INTO subjects VALUES('mat-sd','Matematika');
    INSERT INTO tka_configurations VALUES('A','SD','mat-sd',2,60,'RANDOM'),('B','SD','mat-sd',2,60,'SET');
    INSERT INTO questions(question_code,subject_code,grade,education_level_id,question_status,question_type) SELECT 'q'||n,'mat-sd',6,'sd','PUBLISHED','PG_TUNGGAL' FROM generate_series(1,3) n;
    INSERT INTO question_versions(question_id,version_status,version_number,question_text) SELECT id,'PUBLISHED',1,'snapshot' FROM questions;
    SELECT set_config('request.jwt.claim.sub','${user}',false);
  `);
  const helper = await read('migration-subject-session-conflict.sql');
  await db.exec(helper);
  await db.exec(await read('migration-start-tka-tryout.sql'));
  await db.exec(await read('migration-start-student-exercise.sql'));
  await db.exec(await read('migration_generic_exam_attempt.sql'));
  const call = async (sql, params = []) => (await db.query(sql, params)).rows[0].result;
  const start = (code = 'A') => call('SELECT public.start_tka_tryout($1) result', [code]);
  const exercise = () => call("SELECT public.start_student_exercise('mat-sd',2) result");
  const finish = () => db.exec("UPDATE public.exam_attempts SET attempt_status='SUBMITTED' WHERE attempt_status='IN_PROGRESS'");
  const seed = async (type, duration = 60, code = null) => call(`INSERT INTO public.exam_attempts(user_id,education_level,grade,subject_name,duration_minutes,total_questions,attempt_type,tka_code,started_at)
    VALUES('${user}','SD',6,'Matematika',$2,1,$1,$3,clock_timestamp()-interval '2 days') RETURNING id result`, [type, duration, code]);
  const status = id => call('SELECT attempt_status result FROM public.exam_attempts WHERE id=$1', [id]);

  await t.test('same config resumes persisted snapshots and saved answers before entitlement recheck', async () => {
    const first = await start();
    assert.equal(first.resumed, false);
    const qid = first.questions[0].question_id;
    await db.query("INSERT INTO exam_attempt_answers VALUES($1,$2,'{\"option_codes\":[\"A\"]}',now())", [first.attempt_id, qid]);
    await db.exec(`CREATE OR REPLACE FUNCTION public.learning_access_context() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$`);
    const again = await start();
    assert.equal(again.attempt_id, first.attempt_id);
    assert.equal(again.resumed, true);
    assert.deepEqual(again.questions, first.questions);
    assert.deepEqual(again.answers[qid], { option_codes: ['A'] });
    await assert.rejects(start('B'), /LEARNING_SUBSCRIPTION_REQUIRED/);
    await db.exec(`CREATE OR REPLACE FUNCTION public.learning_access_context() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"unrestricted":true}'::jsonb $$`);
    const conflict = await start('B');
    assert.equal(conflict.existing_session.attempt_id, first.attempt_id);
    assert.equal(conflict.existing_session.attempt_type, 'TRYOUT');
    assert.equal(conflict.attempt_id, undefined);
    assert.equal((await exercise()).existing_session.attempt_id, first.attempt_id);
    await finish();
  });
  await t.test('old exercises and assignments never expire or masquerade as tryout; dispatcher restores actual type', async () => {
    for (const type of ['EXERCISE', 'ASSIGNMENT']) {
      const id = await seed(type);
      const before = await call('SELECT to_jsonb(a) result FROM exam_attempts a WHERE id=$1', [id]);
      const conflict = await start();
      assert.equal(conflict.existing_session.attempt_id, id);
      assert.equal(conflict.existing_session.attempt_type, type);
      const resumed = await call('SELECT public.resume_exam_attempt($1) result', [id]);
      assert.equal(resumed.attempt_type, type);
      assert.equal(resumed.remaining_seconds, null);
      assert.deepEqual(await call('SELECT to_jsonb(a) result FROM exam_attempts a WHERE id=$1', [id]), before);
      if (type === 'EXERCISE') assert.equal((await exercise()).attempt_id, id);
      await finish();
    }
  });
  await t.test('only valid timed TRYOUT expires, invalid timing remains active', async () => {
    const expired = await seed('TRYOUT', 60, 'A');
    const fresh = await start();
    assert.equal(await status(expired), 'EXPIRED');
    assert.notEqual(fresh.attempt_id, expired);
    await finish();
    for (const duration of [0, null]) {
      const id = await seed('TRYOUT', duration, 'A');
      assert.equal((await start()).existing_session.attempt_id, id);
      assert.equal(await status(id), 'IN_PROGRESS');
      await finish();
    }
    const expiredForExercise = await seed('TRYOUT', 60, 'B');
    assert.equal((await exercise()).attempt_type, 'EXERCISE');
    assert.equal(await status(expiredForExercise), 'EXPIRED');
    await finish();
  });
  await t.test('tagged games and all optional legacy game links block both starts unchanged', async () => {
    const tagged = await seed('GAMIFICATION');
    for (const run of [start, exercise]) {
      const result = await run();
      assert.equal(result.reason, 'GAME_SESSION_ACTIVE');
      assert.equal(result.existing_session, undefined);
    }
    assert.equal(await status(tagged), 'IN_PROGRESS');
    await assert.rejects(call('SELECT public.resume_exam_attempt($1) result', [tagged]), /game-specific/);
    await finish();
    for (const game of ['bossfight', 'virtualpet', 'mapadventure']) {
      await db.exec(`CREATE TABLE private.${game}_sessions(attempt_id uuid)`);
      for (const type of ['TRYOUT', 'EXERCISE']) {
        const id = await seed(type, 60, type === 'TRYOUT' ? 'A' : null);
        await db.query(`INSERT INTO private.${game}_sessions VALUES($1)`, [id]);
        for (const run of [start, exercise]) assert.equal((await run()).reason, 'GAME_SESSION_ACTIVE');
        // Unexpired legacy tags must not enter either same-type resume shortcut.
        await db.query('UPDATE exam_attempts SET started_at=clock_timestamp() WHERE id=$1', [id]);
        for (const run of [start, exercise]) assert.equal((await run()).reason, 'GAME_SESSION_ACTIVE');
        assert.equal(await status(id), 'IN_PROGRESS');
        await assert.rejects(call('SELECT public.resume_exam_attempt($1) result', [id]), /Use (BossFight|VirtualPet|MapAdventure)/);
        await finish();
      }
    }
  });
  await t.test('ownership, grants, idempotent helper deployment and legacy index remain intact', async () => {
    await db.exec(helper);
    const attempt = await start();
    await db.exec("SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false)");
    await assert.rejects(call('SELECT public.resume_exam_attempt($1) result', [attempt.attempt_id]), /unavailable/);
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(start(), /Authentication required/);
    assert.equal(await call("SELECT has_function_privilege('authenticated','private.subject_session_conflict(uuid,integer,text)','EXECUTE') result"), false);
    assert.equal(await call("SELECT has_function_privilege('anon','public.start_tka_tryout(text)','EXECUTE') result"), false);
    assert.equal(await call("SELECT count(*)::integer result FROM pg_index WHERE indexrelid='legacy_active_subject'::regclass AND indisunique AND indisvalid"), 1);
    assert.equal(await call("SELECT count(*)::integer result FROM (SELECT user_id,grade,subject_name FROM exam_attempts WHERE attempt_status='IN_PROGRESS' GROUP BY 1,2,3 HAVING count(*)>1) x"), 0);
  });
});
