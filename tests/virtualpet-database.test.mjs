import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Explicit opt-in to a disposable in-memory PostgreSQL WASM engine. No live DB.
const modulePath = process.env.VIRTUALPET_PGLITE_MODULE || process.env.BOSSFIGHT_PGLITE_MODULE;
test('VirtualPet PostgreSQL integration: actual migrations, RPC, grading and guards', { skip: !modulePath }, async (t) => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  t.after(() => db.close());
  const sql = async name => readFile(new URL(`../docs/database/${name}`, import.meta.url), 'utf8');
  const uid = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,education_level text,nickname text,full_name text,account_type text DEFAULT 'STUDENT',account_status text DEFAULT 'active');
    CREATE TABLE public.subjects(subject_code text,name text);
    CREATE TABLE public.subject_topics(id uuid PRIMARY KEY);
    CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subject_code text,subject_name text,education_level_id text,question_status text,question_type text,difficulty text);
    CREATE TABLE public.question_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid,version_status text,version_number integer,question_text text,instruction text,stimulus_id uuid);
    CREATE TABLE public.question_stimuli(id uuid,title text,content_text text,file_url text,media_description text);
    CREATE TABLE public.question_options(question_version_id uuid,option_code text,option_text text,option_order integer,is_correct boolean);
    -- Actual category contract: slash-separated category_label, not category_options.
    CREATE TABLE public.question_category_items(question_version_id uuid,item_number integer,item_text text,category_label text,correct_category text);
    CREATE TABLE public.exam_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,education_level text,grade integer,subject_name text,duration_minutes integer NOT NULL,total_questions integer,attempt_type varchar(10),started_at timestamptz,deadline_at timestamptz,attempt_status text DEFAULT 'IN_PROGRESS',correct_answers integer,score numeric,submitted_at timestamptz);
    CREATE TABLE public.exam_attempt_questions(attempt_id uuid,question_id uuid,question_version_id uuid,question_order integer,UNIQUE(attempt_id,question_id));
    CREATE TABLE public.exam_attempt_answers(attempt_id uuid,question_id uuid,answer_payload jsonb,answered_at timestamptz,UNIQUE(attempt_id,question_id));
    CREATE FUNCTION public.submit_exercise_attempt(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.resume_student_exercise(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.save_exercise_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.resume_tka_tryout(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.submit_tka_attempt(p_attempt_id uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.save_tka_answer(p_attempt_id uuid,p_question_id uuid,p_answer_payload jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    INSERT INTO profiles(id,education_level,nickname,full_name) VALUES('${uid}','sd','Nina','Nina'),('${other}','sd','Raka','Raka');
    INSERT INTO auth.users(id,email_confirmed_at) VALUES('${uid}',now()),('${other}',now());
    INSERT INTO subjects VALUES('mat-sd','Matematika');
  `);
  await db.exec(await sql('migration-gamification-foundation.sql'));
  const stage1 = await sql('migration-stage-1.sql');
  await db.exec(stage1.slice(stage1.indexOf('CREATE OR REPLACE FUNCTION private.exam_answer_payload_is_valid'), stage1.indexOf('REVOKE ALL ON FUNCTION private.exam_answer_payload_is_valid')));
  await db.exec(await sql('migration-bossfight.sql'));
  const migration = await sql('migration-virtualpet.sql');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(await sql('migration_generic_exam_attempt.sql'));
  await db.exec(await sql('migration_generic_exam_attempt.sql'));
  const user = id => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  const rpc = async (action, payload = {}) => (await db.query('SELECT public.virtualpet($1,$2::jsonb) data', [action, JSON.stringify(payload)])).rows[0].data;
  const count = async table => Number((await db.query(`SELECT count(*) n FROM ${table}`)).rows[0].n);
  const rows = async statement => (await db.query(statement)).rows;
  const start = async (scenario = 'KUIZ') => (await rpc('start', { scenario })).session;
  const answers = (s, goodCount = s.total) => s.questions.map((q, i) => ({
    question_id: q.id,
    answer_payload: q.type === 'PGK_KATEGORI'
      ? { category_answers: Object.fromEntries(q.category_items.map(c => [c.item_number, i < goodCount ? ` ${q.answer_keys.category_answers[c.item_number].toUpperCase()} ` : (q.answer_keys.category_answers[c.item_number] === 'Benar' ? 'Salah' : 'Benar')])) }
      : { option_codes: i < goodCount ? [...q.answer_keys.option_codes].reverse() : ['A'] },
  }));
  const finish = (s, goodCount = s.total) => rpc('finish', { attempt_id: s.attempt_id, answers: answers(s, goodCount) });
  const bank = async (n = 15) => {
    await db.exec(`UPDATE questions SET question_status='DRAFT';
      INSERT INTO questions(subject_code,subject_name,education_level_id,question_status,question_type,difficulty)
      SELECT 'mat-sd','Matematika','sd','PUBLISHED',(ARRAY['PG_TUNGGAL','PGK_MA','PGK_KATEGORI'])[1+i%3],CASE WHEN i%2=0 THEN ' Mudah ' ELSE 'Sedang' END FROM generate_series(1,${n}) i;
      INSERT INTO question_versions(question_id,version_status,version_number,question_text,estimate_minutes)
      SELECT id,'PUBLISHED',1,'Frozen text',5 FROM questions WHERE question_status='PUBLISHED';
      INSERT INTO question_options SELECT v.id,'A','wrong',1,false FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE q.question_status='PUBLISHED' AND q.question_type<>'PGK_KATEGORI';
      INSERT INTO question_options SELECT v.id,'B','correct',2,true FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE q.question_status='PUBLISHED' AND q.question_type<>'PGK_KATEGORI';
      INSERT INTO question_options SELECT v.id,'C','also correct',3,true FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE q.question_status='PUBLISHED' AND q.question_type='PGK_MA';
      INSERT INTO question_category_items SELECT v.id,1,'Statement 1','Benar / Salah','Benar' FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE q.question_status='PUBLISHED' AND q.question_type='PGK_KATEGORI';
      INSERT INTO question_category_items SELECT v.id,2,'Statement 2','Benar / Salah','Salah' FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE q.question_status='PUBLISHED' AND q.question_type='PGK_KATEGORI';
    `);
  };
  let petId;

  await t.test('account gate, settings/tips, foundation mapping and adoption cannot reset inventory', async () => {
    await user(''); await assert.rejects(rpc('bootstrap'), /Active authenticated STUDENT/);
    await user(uid);
    for (const [column, value] of [['account_type', 'ADMIN'], ['account_status', 'inactive']]) {
      await db.query(`UPDATE profiles SET ${column}=$1 WHERE id=$2`, [value, uid]);
      await assert.rejects(rpc('bootstrap'), /Active authenticated STUDENT/);
      await db.query(`UPDATE profiles SET ${column}=$1 WHERE id=$2`, [column === 'account_type' ? 'STUDENT' : 'active', uid]);
    }
    await db.query('UPDATE auth.users SET banned_until=now()+interval \'1 day\' WHERE id=$1', [uid]);
    await assert.rejects(rpc('bootstrap'), /Active authenticated STUDENT/);
    await db.query('UPDATE auth.users SET banned_until=NULL,email_confirmed_at=NULL WHERE id=$1', [uid]);
    await assert.rejects(rpc('bootstrap'), /Active authenticated STUDENT/);
    await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [uid]);
    await db.exec(`INSERT INTO gamification_tips(application,message,is_active) VALUES('VIRTUALPET','Pet tip',true),('VIRTUALPET','Inactive',false),('BOSSFIGHT','Other',true)`);
    let b = await rpc('bootstrap');
    assert.equal(b.pet, null); assert.deepEqual(b.settings, { SHOW_TIPS: '1' }); assert.equal(b.tip.message, 'Pet tip');
    await rpc('bootstrap'); assert.equal(await count('user_settings'), 1);
    assert.equal((await rpc('settings', { settings: { SHOW_TIPS: '0' } })).tip, null);
    assert.equal((await rpc('bootstrap')).settings.SHOW_TIPS, '0');
    for (const settings of [{ SHOW_TIPS: true }, { SHOW_TIPS: '2' }, { SUBJECT: 'x' }]) await assert.rejects(rpc('settings', { settings }), /SHOW_TIPS/);
    await rpc('settings', { settings: { SHOW_TIPS: '1' } });
    b = await rpc('adopt', { pet_type: 'cat', pet_name: 'Milo' }); petId = b.pet.id;
    assert.equal(b.pet.pet_type, 'cat'); assert.equal(b.pet.pet_name, 'Milo'); assert.equal(b.pet.xp, 0); assert.equal(b.pet.level, 0);
    assert.deepEqual(b.inventory, { water: 0, rice: 0, apple: 0, donut: 0, cake: 0, vitamin: 0 });
    await assert.rejects(rpc('feed', { item: 'water' }), /empty/);
    await db.query('UPDATE virtual_pets SET hunger=70 WHERE id=$1', [petId]);
    b = await rpc('adopt', { pet_type: 'dog', pet_name: 'Milo2' }); assert.equal(b.pet.id, petId); assert.equal(b.pet.hunger, 70);
    await assert.rejects(rpc('start', { scenario: 'KUIZ', score: 100 }), /Unknown payload/);
  });

  await t.test('strict easy/medium <=5 intersection, exact shortage and no partial session writes', async () => {
    await bank(15);
    await db.exec(`UPDATE questions SET difficulty='Sulit' WHERE id IN(SELECT id FROM questions WHERE question_status='PUBLISHED' LIMIT 1);
      UPDATE question_versions SET estimate_minutes=6 WHERE question_id IN(SELECT id FROM questions WHERE question_status='PUBLISHED' AND difficulty='Sedang' LIMIT 1);
      UPDATE questions SET education_level_id='smp' WHERE id IN(SELECT id FROM questions WHERE question_status='PUBLISHED' AND difficulty='Sedang' AND id NOT IN(SELECT question_id FROM question_versions WHERE estimate_minutes=6) LIMIT 1)`);
    let pool = (await db.query("SELECT private.virtualpet_pool('sd','KUIZ',10) p")).rows[0].p;
    assert.equal(pool.length, 10); assert.equal(new Set(pool.map(q => q.id)).size, 10);
    assert.ok(pool.every(q => ['MUDAH', 'SEDANG'].includes(q.difficulty.trim().toUpperCase()) && Number(q.estimate_minutes) <= 5));
    const before = await count('exam_attempts');
    await assert.rejects(start('PENYELAMATAN'), /dibutuhkan 15, tersedia 12/);
    await bank(9);
    // Plenty of hard/long questions exist but MUST NOT fill a KUIZ shortage.
    await db.exec("UPDATE questions SET question_status='PUBLISHED' WHERE difficulty='Sulit'");
    await assert.rejects(start(), /dibutuhkan 10, tersedia 9/);
    assert.equal(await count('exam_attempts'), before); assert.equal(await count('private.virtualpet_sessions'), 0);
    await bank(14); await assert.rejects(start('PENYELAMATAN'), /dibutuhkan 15, tersedia 14/);
  });

  await t.test('latest published version wins; draft, malformed keys and unusable categories are excluded', async () => {
    await bank(15);
    const selected = (await db.query("SELECT id FROM questions WHERE question_status='PUBLISHED' AND question_type='PG_TUNGGAL' LIMIT 1")).rows[0].id;
    await db.query(`INSERT INTO question_versions(question_id,version_status,version_number,question_text,estimate_minutes)
      VALUES($1,'PUBLISHED',2,'Latest published but too long',6),($1,'DRAFT',3,'Draft must not replace published',2)`, [selected]);
    // Latest published is selected before eligibility/structure; never revive v1.
    await assert.rejects(db.query("SELECT private.virtualpet_pool('sd','KUIZ',15)"), /dibutuhkan 15, tersedia 14/);
    await db.exec(`DELETE FROM question_options WHERE question_version_id IN(
      SELECT v.id FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE q.question_status='PUBLISHED' AND q.question_type='PGK_MA');
      UPDATE question_category_items SET correct_category='Unknown' WHERE question_version_id IN(
      SELECT v.id FROM question_versions v JOIN questions q ON q.id=v.question_id WHERE q.question_status='PUBLISHED' AND q.question_type='PGK_KATEGORI')`);
    await assert.rejects(db.query("SELECT private.virtualpet_pool('sd','KUIZ',15)"), /dibutuhkan 15, tersedia 4/);
    await bank(15);
    const id = (await db.query("SELECT id FROM questions WHERE question_status='PUBLISHED' LIMIT 1")).rows[0].id;
    await db.query(`INSERT INTO question_versions(question_id,version_status,version_number,question_text,estimate_minutes)
      VALUES($1,'DRAFT',99,'Do not pick draft',100)`, [id]);
    const pool = (await db.query("SELECT private.virtualpet_pool('sd','KUIZ',15) p")).rows[0].p;
    assert.ok(pool.every(q => q.text === 'Frozen text'));
  });

  await t.test('all three types, active resume, ownership, immutable snapshots and malformed answer rollback', async () => {
    await bank(10);
    const s = await start();
    assert.deepEqual(new Set(s.questions.map(q => q.type)), new Set(['PG_TUNGGAL', 'PGK_MA', 'PGK_KATEGORI']));
    assert.equal(s.total, 10); assert.equal(s.deadline_at, null); assert.equal(s.remaining_seconds, null);
    assert.equal((await start('HOTS')).attempt_id, s.attempt_id);
    assert.deepEqual((await rpc('bootstrap')).session, s);
    assert.equal(await count('exam_attempt_questions'), 10);
    await user(other); await rpc('adopt', { pet_type: 'bird', pet_name: 'Other' });
    await assert.rejects(finish(s), /session unavailable/); assert.equal((await rpc('bootstrap')).session, null);
    await user(uid);
    const valid = answers(s); const bad = structuredClone(valid); bad[1] = bad[0];
    await assert.rejects(rpc('finish', { attempt_id: s.attempt_id, answers: bad }), /Duplicate/);
    await assert.rejects(rpc('finish', { attempt_id: s.attempt_id, answers: valid.slice(1) }), /Exactly one/);
    const malformed = structuredClone(valid); malformed.find((a, i) => s.questions[i].type === 'PGK_KATEGORI').answer_payload = { category_answers: { 1: 'Benar' } };
    await assert.rejects(rpc('finish', { attempt_id: s.attempt_id, answers: malformed }), /Every category/);
    const invalidOption = structuredClone(valid); invalidOption.find((a, i) => s.questions[i].type === 'PG_TUNGGAL').answer_payload = { option_codes: ['Z'] };
    await assert.rejects(rpc('finish', { attempt_id: s.attempt_id, answers: invalidOption }), /Invalid option/);
    const category = s.questions.find(q => q.type === 'PGK_KATEGORI');
    const grade = async (q, answer) => (await db.query('SELECT private.virtualpet_grade($1::jsonb,$2::jsonb) correct', [JSON.stringify(q), JSON.stringify(answer)])).rows[0].correct;
    await assert.rejects(grade(category, { category_answers: { 1: 'Unknown', 2: 'Salah' } }), /Invalid category/);
    await assert.rejects(grade(category, { category_answers: { 1: 'Benar', 99: 'Salah' } }), /Unknown category/);
    await assert.rejects(grade(category, { category_answers: { 1: true, 2: 'Salah' } }), /Invalid category/);
    const multi = s.questions.find(q => q.type === 'PGK_MA');
    assert.equal(await grade(multi, { option_codes: [] }), false);
    assert.equal(await grade(multi, { option_codes: ['B'] }), false);
    await assert.rejects(grade(multi, { option_codes: ['B', 'B'] }), /Invalid option/);
    const foreign = structuredClone(valid); foreign[0].question_id = other;
    await assert.rejects(rpc('finish', { attempt_id: s.attempt_id, answers: foreign }), /frozen question pool/);
    assert.equal(await count('exam_attempt_answers'), 0); assert.equal(await count('gamification_log'), 0);
    // Current bank keys/text change after start; frozen pool remains authoritative.
    await db.exec("UPDATE question_options SET is_correct=NOT is_correct; UPDATE question_category_items SET correct_category='Salah'; UPDATE question_versions SET question_text='Changed'");
    assert.deepEqual((await rpc('bootstrap')).session, s);
    const r = await finish(s, 7); assert.equal(r.correct, 7); assert.equal(r.score, 70); assert.equal(r.passed, false); assert.equal(r.profile_xp, 0);
    assert.equal(await count('exam_attempt_answers'), 10); assert.equal(await count('gamification_log'), 0);
  });

  await t.test('8/10 KUIZ passes, canonical results persist and replay never duplicates rewards', async () => {
    await bank(10); const s = await start(); const r = await finish(s, 8);
    assert.equal(r.correct, 8); assert.equal(r.passed, true); assert.equal(r.score, 80); assert.equal(r.profile_xp, 1);
    assert.equal(r.inventory.water, 1); assert.equal(r.inventory.rice, 1); assert.equal(r.rewards.profile_xp, 1);
    assert.equal(r.pet.xp, 0); assert.equal(r.pet.level, 0);
    assert.deepEqual(await rows('SELECT activity,xp_score FROM gamification_log'), [{ activity: 'Nina menyelesaikan quiz bersama Milo2.', xp_score: 1 }]);
    const exam = (await db.query('SELECT * FROM exam_attempts WHERE id=$1', [s.attempt_id])).rows[0];
    assert.equal(exam.attempt_type, 'GAMIFICATION'); assert.equal(exam.gamification_app, 'VIRTUALPET'); assert.equal(exam.attempt_status, 'SUBMITTED'); assert.equal(exam.correct_answers, 8); assert.equal(Number(exam.score), 80); assert.equal(exam.deadline_at, null);
    await db.exec(migration); // Redeployment after persisted state must not reset it.
    const replay = await rpc('finish', { attempt_id: s.attempt_id });
    assert.deepEqual(replay.rewards, r.rewards); assert.deepEqual(replay.inventory, r.inventory); assert.equal(replay.profile_xp, 1); assert.equal(await count('gamification_log'), 1);
  });

  await t.test('HOTS prioritizes hard OR long, only HOTS falls back, two frozen snack draws and +5 XP', async () => {
    await bank(15);
    await db.exec(`UPDATE questions SET difficulty='Sulit' WHERE id IN(SELECT id FROM questions WHERE question_status='PUBLISHED' LIMIT 2);
      UPDATE question_versions SET estimate_minutes=6 WHERE question_id IN(SELECT id FROM questions WHERE question_status='PUBLISHED' AND difficulty<>'Sulit' LIMIT 2)`);
    const s = await start('HOTS');
    assert.equal(s.total, 10);
    assert.equal(s.questions.filter(q => q.difficulty === 'Sulit' || Number(q.estimate_minutes) > 5).length, 4);
    assert.equal(s.questions.filter(q => q.difficulty !== 'Sulit' && Number(q.estimate_minutes) <= 5).length, 6);
    const before = (await rpc('bootstrap')).inventory; const r = await finish(s, 8);
    assert.equal(r.passed, true); assert.equal(r.rewards.profile_xp, 5); assert.equal(r.snacks.length, 2);
    const snackNames = ['apple', 'donut', 'cake', 'vitamin'];
    assert.ok(r.snacks.every(x => snackNames.includes(x)));
    assert.equal(snackNames.reduce((sum, key) => sum + r.rewards[key], 0), 2);
    for (const key of snackNames) assert.equal(r.inventory[key] - before[key], r.rewards[key]);
    assert.equal((await rows('SELECT activity FROM gamification_log WHERE xp_score=5')).map(r => r.activity).join('|'), 'Nina menyelesaikan soal-soal HOTS bersama Milo2.');
    const replay = await finish(s, 0); assert.deepEqual(replay.snacks, r.snacks); assert.deepEqual(replay.inventory, r.inventory); assert.equal(replay.profile_xp, 6);
  });

  await t.test('rescue requires 12/15 and adds 50 capped at 100 with effective reward', async () => {
    await bank(15); let s = await start('PENYELAMATAN'); let r = await finish(s, 11);
    assert.equal(r.passed, false); assert.equal(r.rewards.profile_xp, 0);
    await db.query("UPDATE virtual_pets SET hunger=80,hydration=20,last_updated_at=clock_timestamp() AT TIME ZONE 'UTC' WHERE id=$1", [petId]);
    s = await start('PENYELAMATAN'); r = await finish(s, 12);
    assert.equal(r.total, 15); assert.equal(r.correct, 12); assert.equal(r.score, 80); assert.equal(r.passed, true);
    assert.equal(r.pet.hunger, 100); assert.equal(r.pet.hydration, 70); assert.equal(r.rewards.hunger, 20); assert.equal(r.rewards.hydration, 50); assert.equal(r.profile_xp, 8);
    assert.equal((await rows('SELECT activity FROM gamification_log WHERE xp_score=2')).map(r => r.activity).join('|'), 'Nina menyelamatkan Milo2 dari kepingsanan.');
    const replay = await finish(s); assert.equal(replay.pet.hydration, 70); assert.equal(replay.profile_xp, 8); assert.equal(await count('gamification_log'), 3);
  });

  await t.test('decay carries fractional points/minutes, feed clamps without resetting carry', async () => {
    await db.query("UPDATE virtual_pets SET hunger=100,hydration=100,happiness=100,last_updated_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute 10 seconds' WHERE id=$1", [petId]);
    await db.query('UPDATE private.virtualpet_decay SET hunger_carry=0,hydration_carry=0 WHERE pet_id=$1', [petId]);
    let b = await rpc('bootstrap'); assert.equal(b.pet.hunger, 100); assert.equal(b.pet.hydration, 100);
    let d = (await db.query('SELECT * FROM private.virtualpet_decay WHERE pet_id=$1', [petId])).rows[0];
    assert.ok(Number(d.hunger_carry) > 0.066 && Number(d.hunger_carry) < 0.067); assert.equal(Number(d.hydration_carry), 0.1);
    const timestamp = b.pet.last_updated_at;
    await rpc('bootstrap');
    assert.deepEqual((await db.query('SELECT * FROM private.virtualpet_decay WHERE pet_id=$1', [petId])).rows[0], d);
    assert.equal((await rpc('bootstrap')).pet.last_updated_at, timestamp);
    await db.query("UPDATE virtual_pets SET last_updated_at=last_updated_at-interval '14 minutes' WHERE id=$1", [petId]);
    b = await rpc('bootstrap'); assert.equal(b.pet.hunger, 99); assert.equal(b.pet.hydration, 99);
    b = await rpc('feed', { item: 'water' }); assert.equal(b.pet.hydration, 100); assert.equal(b.inventory.water, 0);
    d = (await db.query('SELECT * FROM private.virtualpet_decay WHERE pet_id=$1', [petId])).rows[0]; assert.equal(Number(d.hydration_carry), 0.5);
    await db.query("UPDATE virtual_pets SET last_updated_at=(clock_timestamp() AT TIME ZONE 'UTC')+interval '1 day' WHERE id=$1", [petId]);
    b = await rpc('bootstrap'); assert.equal(b.pet.hunger, 99);
    await db.query("UPDATE virtual_pets SET last_updated_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '100 hours' WHERE id=$1", [petId]);
    b = await rpc('bootstrap'); assert.equal(b.pet.hunger, 0); assert.equal(b.pet.hydration, 0); assert.equal(b.pet.status, 'fainted');
  });

  await t.test('generic RPC and direct exam guards protect active/finished attempts and both memberships', async () => {
    await bank(10); const s = await start(); const q = s.questions[0];
    for (const statement of ['SELECT public.submit_exam_attempt($1)', 'SELECT public.resume_exam_attempt($1)']) await assert.rejects(db.query(statement, [s.attempt_id]), /Use VirtualPet/);
    await assert.rejects(db.query('SELECT public.save_exam_answer($1,$2,$3::jsonb)', [s.attempt_id, q.id, JSON.stringify(answers(s)[0].answer_payload)]), /Use VirtualPet/);
    await db.query("SELECT set_config('virtualpet.writing_results','true',false)");
    for (const statement of [
      "UPDATE exam_attempts SET gamification_app=NULL WHERE id=$1",
      "DELETE FROM exam_attempts WHERE id=$1",
      "DELETE FROM exam_attempt_questions WHERE attempt_id=$1",
      "UPDATE exam_attempt_questions SET attempt_id=gen_random_uuid() WHERE attempt_id=$1",
      "INSERT INTO exam_attempt_questions(attempt_id,question_id,question_version_id,question_order) SELECT $1,id,id,99 FROM questions LIMIT 1",
      "INSERT INTO exam_attempt_answers(attempt_id,question_id,answer_payload) SELECT $1,id,'{}'::jsonb FROM questions LIMIT 1",
    ]) await assert.rejects(db.query(statement, [s.attempt_id]), /Use VirtualPet/);
    await assert.rejects(db.exec("INSERT INTO exam_attempts(user_id,duration_minutes,attempt_type,gamification_app) VALUES('11111111-1111-1111-1111-111111111111',60,'GAMIFICATION','VIRTUALPET')"), /Use VirtualPet/);
    const legacy = (await db.query("INSERT INTO exam_attempts(user_id,duration_minutes,attempt_type) VALUES($1,60,'TRYOUT') RETURNING id", [uid])).rows[0].id;
    await db.query('INSERT INTO exam_attempt_questions(attempt_id,question_id,question_version_id,question_order) VALUES($1,$2,$3,1)', [legacy, q.id, q.version]);
    await assert.rejects(db.query('UPDATE exam_attempt_questions SET attempt_id=$1 WHERE attempt_id=$2', [s.attempt_id, legacy]), /Use VirtualPet/);
    await finish(s, 0);
    await assert.rejects(db.query('DELETE FROM exam_attempt_answers WHERE attempt_id=$1', [s.attempt_id]), /Use VirtualPet/);
    await db.exec('SET ROLE authenticated');
    for (const table of ['private.virtualpet_sessions', 'private.virtualpet_decay', 'public.virtual_pets', 'public.virtual_pet_items']) await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
    await assert.rejects(db.query("SELECT private.virtualpet_pool('sd','KUIZ',10)"), /permission denied/);
    // The public SECURITY DEFINER RPC remains usable under the client role.
    assert.equal((await rpc('bootstrap')).pet.id, petId);
    await db.exec('RESET ROLE');
  });
});
