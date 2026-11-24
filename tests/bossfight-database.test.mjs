import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Optional isolated PostgreSQL WASM; no network database, no live credentials.
const modulePath = process.env.BOSSFIGHT_PGLITE_MODULE;
test('BossFight PostgreSQL integration: real RPC, helpers and persistence', { skip: !modulePath }, async (t) => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    -- Canonical generic RPCs also gate VirtualPet; this suite only needs membership.
    CREATE TABLE private.virtualpet_sessions(attempt_id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,education_level text,nickname text,full_name text,xp_score integer DEFAULT 0);
    CREATE TABLE public.subjects(subject_code text,name text);
    CREATE TABLE public.user_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,"group" text,name text,value text);
    CREATE TABLE public.gamification_tips(id uuid DEFAULT gen_random_uuid(),application text,message text,is_active boolean);
    CREATE TABLE public.gamification_log(id uuid DEFAULT gen_random_uuid(),user_id uuid,activity text,xp_score integer);
    CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subject_code text,education_level_id text,question_status text,question_type text);
    CREATE TABLE public.question_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid,version_status text,version_number integer,estimate_minutes numeric,question_text text,instruction text,stimulus_id uuid);
    CREATE TABLE public.question_stimuli(id uuid,title text,content_text text,file_url text,media_description text);
    CREATE TABLE public.question_options(question_version_id uuid,option_code text,option_text text,option_order integer,is_correct boolean);
    CREATE TABLE public.question_category_items(question_version_id uuid,item_number integer,item_text text,category_label text,correct_category text);
    CREATE TABLE public.exam_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,education_level text,grade integer,subject_name text,duration_minutes integer,total_questions integer,attempt_type varchar(10),gamification_app text,started_at timestamptz,deadline_at timestamptz,attempt_status text DEFAULT 'IN_PROGRESS',correct_answers integer,score numeric,submitted_at timestamptz);
    CREATE TABLE public.exam_attempt_questions(attempt_id uuid,question_id uuid,question_version_id uuid,question_order integer,UNIQUE(attempt_id,question_id));
    CREATE TABLE public.exam_attempt_answers(attempt_id uuid,question_id uuid,answer_payload jsonb,answered_at timestamptz,is_timeout boolean DEFAULT false,UNIQUE(attempt_id,question_id));
    CREATE FUNCTION private.submit_exercise_attempt(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION private.resume_student_exercise(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION private.save_exercise_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION private.resume_tka_tryout(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    INSERT INTO profiles VALUES('11111111-1111-1111-1111-111111111111','sd','Nina','Nina',0),('22222222-2222-2222-2222-222222222222','smp','Raka','Raka',0);
    INSERT INTO subjects VALUES('mat-sd','Matematika'),('mat-smp','Matematika');
    INSERT INTO gamification_tips(application,message,is_active) VALUES('BOSSFIGHT','Tip Boss',true),('OTHER','Wrong tip',true);
    INSERT INTO questions(subject_code,education_level_id,question_status,question_type) SELECT 'mat-sd','sd','PUBLISHED','PG_TUNGGAL' FROM generate_series(1,12);
    INSERT INTO question_versions(question_id,version_status,version_number,estimate_minutes,question_text) SELECT id,'PUBLISHED',1,2,'Real text' FROM questions;
    INSERT INTO question_options SELECT id,'A','wrong',1,false FROM question_versions;
    INSERT INTO question_options SELECT id,'B','correct',2,true FROM question_versions;
  `);
  const stage1 = await readFile(new URL('../docs/database/migration-stage-1.sql', import.meta.url), 'utf8');
  await db.exec(stage1.slice(stage1.indexOf('CREATE OR REPLACE FUNCTION private.exam_answer_payload_is_valid'), stage1.indexOf('REVOKE ALL ON FUNCTION private.exam_answer_payload_is_valid')));
  const generic = await readFile(new URL('../docs/database/migration_generic_exam_attempt.sql', import.meta.url), 'utf8');
  await db.exec(generic);
  await db.exec(generic); // canonical generic RPCs redeploy cleanly.
  const migration = await readFile(new URL('../docs/database/migration-bossfight.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // redeployment must preserve state.
  const genericAfter = await db.query("SELECT pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('submit_exam_attempt','save_exam_answer','resume_exam_attempt')");
  assert.equal(genericAfter.rows.length, 3);
  for (const row of genericAfter.rows) assert.match(row.d, /bossfight_sessions/);
  const uid = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  const user = async id => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  const rpc = async (action, payload = {}) => (await db.query('SELECT public.bossfight($1,$2::jsonb) AS data', [action, JSON.stringify(payload)])).rows[0].data;
  const count = async table => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  const record = (s, good = true, heal = false, timeout = false) => ({ question_id: s.questions[0].id, answer_payload: timeout ? {} : { option_codes: [good ? 'B' : 'A'] }, heal, is_timeout: timeout });
  await user(''); await assert.rejects(rpc('bootstrap'), /Authentication/);
  await user(uid);
  const boot = await rpc('bootstrap');
  assert.deepEqual(boot.settings, { SHOW_TIPS: '1', SUBJECT: 'Matematika', IS_PVP: '0', FIGHT_MODE: 'Maksimal jumlah soal', MAX_QUESTIONS: '10', P2_NAME: 'Player2' });
  assert.equal(boot.tip.message, 'Tip Boss'); assert.equal(await count('user_settings'), 6);
  await db.query(`DELETE FROM user_settings WHERE user_id=$1 AND name='P2_NAME'`, [uid]);
  assert.equal((await rpc('bootstrap')).settings.P2_NAME, 'Player2');
  await rpc('settings', { settings: { P2_NAME: 'Rival' } });
  assert.equal((await rpc('bootstrap')).settings.P2_NAME, 'Rival');
  await rpc('bootstrap'); assert.equal(await count('user_settings'), 6);
  await assert.rejects(rpc('settings', { settings: { IS_PVP: true } }), /Invalid setting/);
  await assert.rejects(rpc('settings', { settings: { MAX_QUESTIONS: '0' } }), /Invalid question limit/);
  await db.query(`INSERT INTO user_settings(user_id,"group",name,value) VALUES($1,'BOSSFIGHT','SHOW_TIPS','0')`, [uid]);
  await rpc('settings', { settings: { SHOW_TIPS: '1', MAX_QUESTIONS: '10' } });
  assert.equal((await db.query(`SELECT count(DISTINCT value) n FROM user_settings WHERE name='SHOW_TIPS'`)).rows[0].n, 1);
  let s = await rpc('start'); const aid = s.attempt_id;
  assert.equal(s.questions.length, 10); assert.ok(s.questions.every(q => !('answer_keys' in q)));
  assert.equal((await rpc('start')).attempt_id, aid); assert.equal(await count('exam_attempt_questions'), 0);
  await assert.rejects(rpc('finish', { attempt_id: aid }), /not terminal/);
  await user(other); await assert.rejects(rpc('batch', { attempt_id: aid }), /unavailable/); await user(uid);
  await assert.rejects(db.query('SELECT public.submit_exam_attempt($1)', [aid]), /Use BossFight/);
  const first = record(s);
  s = await rpc('batch', { attempt_id: aid, records: [first] });
  assert.deepEqual(s.hp, [100, 80]);
  const retry = await rpc('batch', { attempt_id: aid, records: [first] }); assert.equal(retry.used, 1); assert.equal(retry.questions[0].id, s.questions[0].id);
  await assert.rejects(rpc('batch', { attempt_id: aid, records: [{ ...first, heal: true }] }), /already locked/);
  const seen = new Set([first.question_id]);
  while (!s.terminal) {
    assert.ok(!seen.has(s.questions[0].id)); seen.add(s.questions[0].id);
    s = await rpc('batch', { attempt_id: aid, records: [record(s)] });
  }
  assert.equal(s.used, 4); assert.deepEqual(s.hp, [100, 0]);
  s = await rpc('finish', { attempt_id: aid }); assert.equal(s.result.xp, 1);
  assert.equal(await count('exam_attempt_questions'), 4); assert.equal(await count('exam_attempt_answers'), 4); assert.equal(await count('gamification_log'), 1);
  await rpc('finish', { attempt_id: aid }); assert.equal(await count('gamification_log'), 1);
  assert.equal((await db.query('SELECT xp_score FROM profiles WHERE id=$1', [uid])).rows[0].xp_score, 1);
  assert.match((await db.query('SELECT activity FROM gamification_log')).rows[0].activity, /Nina bertarung melawan Boss Matematika dan menang/);
  // Wrong/self damage, one heal, timeout and limited majority.
  await rpc('settings', { settings: { MAX_QUESTIONS: '3' } });
  s = await rpc('start');
  s = await rpc('batch', { attempt_id: s.attempt_id, records: [record(s, false)] }); assert.deepEqual(s.hp, [80, 100]);
  s = await rpc('batch', { attempt_id: s.attempt_id, records: [record(s, true, true)] }); assert.deepEqual(s.hp, [100, 80]);
  await assert.rejects(rpc('batch', { attempt_id: s.attempt_id, records: [record(s, true, true)] }), /Heal already used/);
  s = await rpc('finish', { attempt_id: s.attempt_id, records: [record(s, false, false, true)] });
  assert.equal(s.result.victory, false); assert.equal(s.result.xp, 0);
  assert.equal((await db.query('SELECT count(*) n FROM exam_attempt_answers WHERE is_timeout')).rows[0].n, 1);
  // Alternating PvP, independent combo and heal; equal HP is a draw.
  await rpc('settings', { settings: { MAX_QUESTIONS: '2', IS_PVP: '1' } });
  s = await rpc('start'); assert.equal(s.questions[0].player, 1);
  s = await rpc('batch', { attempt_id: s.attempt_id, records: [record(s)] }); assert.equal(s.questions[0].player, 2);
  s = await rpc('finish', { attempt_id: s.attempt_id, records: [record(s)] });
  assert.equal(s.result.winner, 0); assert.equal(s.result.xp, 0);
  // Direct or unrelated legacy writes cannot mutate BossFight attempts.
  await assert.rejects(db.query("UPDATE exam_attempts SET score=100 WHERE id=$1", [aid]), /Use BossFight/);
  await assert.rejects(db.query("DELETE FROM exam_attempt_answers WHERE attempt_id=$1", [aid]), /Use BossFight/);
  await assert.rejects(db.query("INSERT INTO exam_attempt_questions(attempt_id,question_id,question_version_id,question_order) SELECT $1,id,id,99 FROM questions LIMIT 1", [aid]), /Use BossFight/);
  // Strict majority while both alive awards correct+1.
  await rpc('settings', { settings: { MAX_QUESTIONS: '3', IS_PVP: '0' } });
  s = await rpc('start');
  s = await rpc('batch', { attempt_id: s.attempt_id, records: [record(s)] });
  s = await rpc('batch', { attempt_id: s.attempt_id, records: [record(s)] });
  s = await rpc('finish', { attempt_id: s.attempt_id, records: [record(s, false)] });
  assert.equal(s.result.victory, true); assert.equal(s.result.xp, 1); assert.deepEqual(s.hp, [80, 60]);
  // Wrong-only unlimited run ends by self KO, never awards XP.
  await rpc('settings', { settings: { FIGHT_MODE: 'Fight to Death' } });
  s = await rpc('start');
  while (!s.terminal) s = await rpc('batch', { attempt_id: s.attempt_id, records: [record(s, false)] });
  assert.equal(s.used, 5); assert.equal(s.hp[0], 0);
  s = await rpc('finish', { attempt_id: s.attempt_id }); assert.equal(s.result.xp, 0);
  // Real multi-record batch, rollback on skipped order, retry and exact limited cap.
  await rpc('settings', { settings: { FIGHT_MODE: 'Maksimal jumlah soal', MAX_QUESTIONS: '3' } });
  s = await rpc('start'); assert.equal(s.questions.length, 3);
  let records = s.questions.map(q => ({ question_id: q.id, answer_payload: { option_codes: ['B'] }, is_timeout: false, heal: false }));
  await assert.rejects(rpc('batch', { attempt_id: s.attempt_id, records: [records[0], records[2]] }), /order conflict/);
  assert.equal((await rpc('start')).used, 0);
  s = await rpc('batch', { attempt_id: s.attempt_id, records }); assert.equal(s.used, 3);
  assert.equal((await rpc('batch', { attempt_id: s.attempt_id, records })).used, 3);
  await rpc('finish', { attempt_id: s.attempt_id });
  // Configurable initial/refill batches and no repeated questions, including true exhaustion.
  await db.exec('UPDATE private.bossfight_config SET death_initial=2,death_additional=3');
  await rpc('settings', { settings: { FIGHT_MODE: 'Fight to Death', IS_PVP: '1' } });
  s = await rpc('start'); assert.equal(s.questions.length, 2);
  records = s.questions.map(q => ({ question_id: q.id, answer_payload: { option_codes: ['B'] }, is_timeout: false, heal: false }));
  s = await rpc('batch', { attempt_id: s.attempt_id, records });
  assert.equal(s.terminal, false); assert.equal(s.questions.length, 3);
  assert.ok(s.questions.every(q => !records.some(r => r.question_id === q.id)));
  while (!s.terminal) s = await rpc('batch', { attempt_id: s.attempt_id, records: [record(s, false)] });
  await rpc('finish', { attempt_id: s.attempt_id });
  // All three actual question types and published/education/estimate filters.
  await db.exec(`UPDATE question_versions SET estimate_minutes=6;
    INSERT INTO questions(id,subject_code,education_level_id,question_status,question_type) VALUES
     ('33333333-3333-3333-3333-333333333333','mat-sd','sd','PUBLISHED','PGK_KATEGORI'),
     ('44444444-4444-4444-4444-444444444444','mat-sd','sd','PUBLISHED','PGK_MA'),
     ('55555555-5555-5555-5555-555555555555','mat-sd','smp','PUBLISHED','PG_TUNGGAL'),
     ('66666666-6666-6666-6666-666666666666','mat-sd','sd','DRAFT','PG_TUNGGAL');
    INSERT INTO question_versions(question_id,version_status,version_number,estimate_minutes,question_text)
     SELECT id,'PUBLISHED',1,2,'Special question' FROM questions WHERE id IN('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666');
    INSERT INTO question_category_items SELECT id,1,'Statement','Benar / Salah','Benar' FROM question_versions WHERE question_id='33333333-3333-3333-3333-333333333333';
    INSERT INTO question_options SELECT id,'A','correct',1,true FROM question_versions WHERE question_id='44444444-4444-4444-4444-444444444444';
    INSERT INTO question_options SELECT id,'C','correct',2,true FROM question_versions WHERE question_id='44444444-4444-4444-4444-444444444444';
  `);
  await rpc('settings', { settings: { FIGHT_MODE: 'Maksimal jumlah soal', MAX_QUESTIONS: '10', IS_PVP: '0' } });
  s = await rpc('start');
  while (!s.terminal) {
    const q = s.questions[0];
    assert.ok(['PGK_KATEGORI', 'PGK_MA'].includes(q.type));
    const answer_payload = q.type === 'PGK_KATEGORI' ? { category_answers: { '1': 'Benar' } } : { option_codes: ['C', 'A'] };
    s = await rpc('batch', { attempt_id: s.attempt_id, records: [{ question_id: q.id, answer_payload, is_timeout: false, heal: false }] });
  }
  s = await rpc('finish', { attempt_id: s.attempt_id }); assert.equal(s.used, 2); assert.equal(s.correct, 2); assert.equal(s.result.xp, 1);
  // Death exhausts the real bank without refetching prior questions.
  await rpc('settings', { settings: { FIGHT_MODE: 'Fight to Death' } });
  s = await rpc('start'); assert.equal(s.questions.length, 2);
  const exhaustedIds = s.questions.map(q => q.id);
  for (const id of exhaustedIds) {
    s = await rpc('batch', { attempt_id: s.attempt_id, records: [{ question_id: id, answer_payload: {}, is_timeout: true, heal: false }] });
  }
  assert.equal(s.terminal, true); assert.equal(s.used, 2); assert.deepEqual(s.questions, []);
  await rpc('finish', { attempt_id: s.attempt_id });
  // RLS/grants: authenticated cannot access private state directly.
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT * FROM private.bossfight_sessions'), /permission denied/);
  await db.exec('RESET ROLE');
});
