import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Local disposable PostgreSQL WASM only. Never consumes application DB credentials.
const modulePath = process.env.MAPADVENTURE_PGLITE_MODULE || 'C:/Users/Yoga 7/AppData/Local/npm-cache/_npx/5451a941ffe99421/node_modules/@electric-sql/pglite/dist/index.js';
test('MapAdventure actual PostgreSQL migrations and transactional RPC contract', async t => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite(); t.after(() => db.close());
  const sql = name => readFile(new URL(`../docs/database/${name}`, import.meta.url), 'utf8');
  const uid = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY,education_level text,nickname text DEFAULT 'Nina',full_name text DEFAULT 'Nina Lengkap',account_type text DEFAULT 'STUDENT',account_status text DEFAULT 'active');
    CREATE TABLE subjects(subject_code text PRIMARY KEY,name text,education_level_id text,is_active boolean DEFAULT true);
    CREATE TABLE questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subject_code text,subject_name text,education_level_id text,theme varchar(255),topic varchar(255),material text,sub_material text,question_status text,question_type text,difficulty text);
    CREATE TABLE question_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid,version_status text,version_number integer,question_text text,instruction text,stimulus_id uuid);
    CREATE TABLE question_stimuli(id uuid,title text,content_text text,file_url text,media_description text);
    CREATE TABLE question_options(question_version_id uuid,option_code text,option_text text,option_order integer,is_correct boolean);
    CREATE TABLE question_category_items(question_version_id uuid,item_number integer,item_text text,category_label text,correct_category text);
    CREATE TABLE exam_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,education_level text,grade integer,subject_name text,duration_minutes integer NOT NULL,total_questions integer,attempt_type varchar(10),started_at timestamptz,deadline_at timestamptz,attempt_status text DEFAULT 'IN_PROGRESS',correct_answers integer,score numeric,submitted_at timestamptz);
    CREATE TABLE exam_attempt_questions(attempt_id uuid,question_id uuid,question_version_id uuid,question_order integer,UNIQUE(attempt_id,question_id));
    CREATE TABLE exam_attempt_answers(attempt_id uuid,question_id uuid,answer_payload jsonb,answered_at timestamptz,UNIQUE(attempt_id,question_id));
    CREATE TABLE private.bossfight_sessions(attempt_id uuid);
    INSERT INTO auth.users VALUES('${uid}',now(),NULL,NULL),('${other}',now(),NULL,NULL);
    INSERT INTO profiles(id,education_level) VALUES('${uid}','sd'),('${other}','sd');
    INSERT INTO subjects(subject_code,name,education_level_id) VALUES('mat-sd','Matematika','sd'),('mat-smp','Matematika','smp'),('ipa-sd','IPA','sd');
  `);
  await db.exec(await sql('migration-create-subject-topics.sql'));
  await db.exec(await sql('migration-gamification-foundation.sql'));
  await db.exec(await sql('migration-virtualpet.sql'));
  await db.exec(await sql('migration-create-map-adventure-logs.sql'));
  await db.exec(await sql('migration-add-map-adventure-logs-stars.sql'));
  // Reproduce the deployed subject-wide active index absent from the old fixture.
  await db.exec(`CREATE UNIQUE INDEX uq_exam_attempts_active_user_grade_subject
    ON public.exam_attempts(user_id,grade,subject_name)
    WHERE attempt_status='IN_PROGRESS'`);
  const migration = await sql('migration-mapadventure.sql');
  await db.exec(migration); await db.exec(migration);
  await db.exec(await sql('migration_generic_exam_attempt.sql'));
  await t.test('legacy subject uniqueness excludes only MapAdventure and survives migration rerun', async () => {
    const index = (await db.query(`SELECT pg_get_indexdef('public.uq_exam_attempts_active_user_grade_subject'::regclass) ddl`)).rows[0].ddl;
    assert.match(index, /MAPADVENTURE/);
    await db.exec('BEGIN');
    try {
      await db.exec(`INSERT INTO exam_attempts(user_id,grade,subject_name,duration_minutes)
        VALUES('${uid}',6,'Index regression',60)`);
      await assert.rejects(db.exec(`INSERT INTO exam_attempts(user_id,grade,subject_name,duration_minutes)
        VALUES('${uid}',6,'Index regression',60)`), /uq_exam_attempts_active_user_grade_subject/);
    } finally { await db.exec('ROLLBACK'); }
  });
  const user = id => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  let isolated = false;
  t.afterEach(async () => { if(isolated) { await db.exec('ROLLBACK'); isolated=false; } });
  const rpc = async (a, p = {}) => {
    if (isolated) await db.exec('SAVEPOINT rpc_test');
    try {
      const data=(await db.query('SELECT public.mapadventure($1,$2::jsonb) data', [a, JSON.stringify(p)])).rows[0].data;
      if (p.attempt_id && data.session) assert.equal(data.session.attempt_id,p.attempt_id, 'explicit operation must return the selected attempt, never another unfinished session');
      if (isolated) await db.exec('RELEASE SAVEPOINT rpc_test');
      return data;
    } catch(error) {
      if (isolated) await db.exec('ROLLBACK TO SAVEPOINT rpc_test; RELEASE SAVEPOINT rpc_test');
      throw error;
    }
  };
  const rows = async (q, p = []) => (await db.query(q, p)).rows;
  const count = async table => Number((await rows(`SELECT count(*) n FROM ${table}`))[0].n);
  const open = async nodeId => (await rpc('material', { nodeId })).material;
  const read = async nodeId => rpc('read_complete', { nodeId, readToken: (await open(nodeId)).readToken });
  const start = async (nodeId, stage) => (await rpc('start', { nodeId, stage })).session;
  const resume = async s => (await rpc('bootstrap', { attempt_id: s.attempt_id })).session;
  const navigate = async (s, direction) => (await rpc(direction, { attempt_id: s.attempt_id, question_id: s.question.id })).session;
  // Update the authoritative slot ledger, not just the compatibility current-clock column.
  const expire = s => db.query(`UPDATE private.mapadventure_sessions SET
    question_ledger=jsonb_set(question_ledger,ARRAY[question_index::text,'deadline_at'],to_jsonb(clock_timestamp()-interval '1 hour')),
    question_deadline_at=clock_timestamp()-interval '1 hour' WHERE attempt_id=$1`, [s.attempt_id]);
  const good = q => q.type === 'PGK_KATEGORI' ? { category_answers: { 1: ' benar ', 2: 'SALAH' } } : { option_codes: q.type === 'PGK_MA' ? ['C', 'B'] : ['B'] };
  const wrong = q => q.type === 'PGK_KATEGORI' ? { category_answers: { 1: 'Salah', 2: 'Benar' } } : { option_codes: ['A'] };
  const acknowledge = async r => r.session?.feedback && r.session.answered < r.session.total ? { ...await rpc('next', { attempt_id: r.session.attempt_id, question_id: r.session.feedback.question_id }), answer: r.answer } : r;
  const answer = async (s, payload = good(s.question)) => acknowledge(await rpc('answer', { attempt_id: s.attempt_id, question_id: s.question.id, answer_payload: payload }));
  const complete = s => rpc('complete_node', { attempt_id: s.attempt_id });
  const finish = async (s, goodCount = s.total) => {
    // The cursor remains on a real question during feedback and after the last answer.
    // Walk bounded slots, including unanswered slots skipped earlier, without rewriting records.
    for (let visits = 0; s.answered < s.total; visits++) {
      assert.ok(visits < s.total * 3, 'finish must make progress through unanswered slots');
      if (!s.feedback) s = (await answer(s, s.index < goodCount ? good(s.question) : wrong(s.question))).session;
      else if (s.index === s.total - 1) {
        while (s.index > 0) s = await navigate(s, 'previous');
      } else s = await navigate(s, 'next');
    }
    return complete(s);
  };
  const use = (s, tool) => rpc('use_tool', { attempt_id: s.attempt_id, question_id: s.question.id, tool });
  const seedBank = async () => db.exec(`
    -- Legacy labels deliberately disagree: only current theme/topic may select a pool.
    INSERT INTO questions(subject_code,subject_name,education_level_id,theme,topic,material,sub_material,question_status,question_type,difficulty)
    SELECT c.subject_code,'Matematika',CASE WHEN c.subject_code='mat-smp' THEN 'smp' ELSE 'sd' END,c.theme,c.topic,'Legacy material','Legacy sub material','PUBLISHED',
      (ARRAY['PG_TUNGGAL','PGK_MA','PGK_KATEGORI'])[1+(i%3)],CASE WHEN i<=2 THEN 'MUDAH' WHEN i<=6 THEN 'SEDANG' WHEN i<=8 THEN 'SUSAH' ELSE 'SULIT' END
    FROM subject_topics c CROSS JOIN generate_series(1,12) i;
    INSERT INTO question_versions(question_id,version_status,version_number,question_text,clue)
    SELECT id,'PUBLISHED',1,'Frozen question','Frozen clue' FROM questions;
    INSERT INTO question_options SELECT v.id,x.code,x.code,x.ord,x.code IN('B','C') AND (q.question_type='PGK_MA' OR x.code='B')
      FROM question_versions v JOIN questions q ON q.id=v.question_id CROSS JOIN (VALUES('A',1),('B',2),('C',3),('D',4)) x(code,ord) WHERE q.question_type<>'PGK_KATEGORI';
    INSERT INTO question_category_items SELECT v.id,x.i,'Statement','Benar / Salah',x.answer FROM question_versions v JOIN questions q ON q.id=v.question_id
      CROSS JOIN (VALUES(1,'Benar'),(2,'Salah')) x(i,answer) WHERE q.question_type='PGK_KATEGORI';
  `);
  let nodeId;
  await t.test('active STUDENT gate, persistent settings/tip, authoritative subject/level, seed idempotency', async () => {
    await user(''); await assert.rejects(rpc('bootstrap'), /Active authenticated STUDENT/); await user(uid);
    for (const [col, bad, reset] of [['account_type','ADMIN','STUDENT'],['account_status','inactive','active']]) {
      await db.query(`UPDATE profiles SET ${col}=$1 WHERE id=$2`, [bad, uid]); await assert.rejects(rpc('bootstrap'), /Active authenticated STUDENT/);
      await db.query(`UPDATE profiles SET ${col}=$1 WHERE id=$2`, [reset, uid]);
    }
    for (const change of ['email_confirmed_at=NULL',"banned_until=now()+interval '1 day'",'deleted_at=now()']) {
      await db.exec(`UPDATE auth.users SET ${change} WHERE id='${uid}'`); await assert.rejects(rpc('bootstrap'), /Active authenticated STUDENT/);
      await db.exec(`UPDATE auth.users SET email_confirmed_at=now(),banned_until=NULL,deleted_at=NULL WHERE id='${uid}'`);
    }
    await db.exec(`INSERT INTO subject_themes(subject,theme) VALUES('mat-sd','A');
      INSERT INTO subject_topics(subject_code,theme,topic,learning_material,learning_material_url)
      SELECT s,t,p,'Real material','https://example.org/material.pdf' FROM (VALUES('mat-sd','A','A1'),('mat-sd','A','A2'),('mat-sd','B','B1'),('mat-sd','C','C1'),('mat-smp','Other level','Other'),('ipa-sd','IPA','IPA1')) x(s,t,p);
      UPDATE subject_topics SET learning_material='Real material',learning_material_url='https://example.org/material.pdf';
      INSERT INTO gamification_tips(application,message) VALUES('MAPADVENTURE','Real tip'),('VIRTUALPET','Wrong tip');`);
    let b = await rpc('bootstrap'); nodeId = b.nodes[0].id;
    assert.deepEqual(b.settings, { SHOW_TIPS: '1', SUBJECT: 'Matematika' }); assert.equal(b.tip.message, 'Real tip');
    assert.equal(b.subject_code, 'mat-sd'); assert.equal(b.islands.length, 3); assert.equal(b.nodes.length, 4);
    assert.equal(b.nodes.filter(n => n.material_status === 'UNLOCKED').length, 1);
    assert.equal(b.islands[0].status, 'UNLOCKED'); assert.equal(b.islands[1].status, 'LOCKED');
    await rpc('bootstrap'); assert.equal(await count('map_adventure_topics'), 4); assert.equal(await count('user_settings'), 2);
    b = await rpc('settings', { settings: { SHOW_TIPS: '0' } }); assert.equal(b.tip, null);
    assert.equal((await rpc('bootstrap')).settings.SHOW_TIPS, '0');
    for (const settings of [{SHOW_TIPS:true},{SHOW_TIPS:'2'},{SHOW_TIPS1:'0'},{SUBJECT:'Nope'},{OTHER:'x'}]) await assert.rejects(rpc('settings', {settings}));
    assert.equal(b.tip1, undefined);
    await rpc('settings', { settings: { SUBJECT: 'IPA' } }); assert.equal((await rpc('bootstrap')).subject_code, 'ipa-sd');
    await rpc('settings', { settings: { SUBJECT: 'Matematika', SHOW_TIPS: '1' } });
    for (const extra of [{score:100},{userId:other},{usedTools:false}]) await assert.rejects(rpc('bootstrap', extra), /Unknown payload/);
  });
  await t.test('material requires open token, locked nodes cannot be claimed, fixed rewards exactly once', async () => {
    const b = await rpc('bootstrap'); const locked = b.nodes[1].id;
    await assert.rejects(open(locked), /locked/);
    await assert.rejects(rpc('read_complete', {nodeId,readToken:uid}), /Open material/);
    await assert.rejects(start(nodeId,'practice'), /locked/);
    const m = await open(nodeId); assert.equal(m.text,'Real material'); assert.match(m.url,/\.pdf$/);
    let r = await rpc('read_complete', {nodeId,readToken:m.readToken});
    assert.deepEqual(r.wallet,{points:25}); assert.equal(r.status.stars,3); assert.equal(r.profile_xp,1);
    r = await read(nodeId); assert.equal(r.wallet.points,25); assert.equal(r.profile_xp,1);
    assert.equal(r.nodes[0].practice_status,'UNLOCKED');
  });
  await t.test('exact-count atomic shortage, exact filters/latest published, 3 types and fallback without duplicates', async () => {
    const before = await count('exam_attempts'); await assert.rejects(start(nodeId,'practice'), /Insufficient/); assert.equal(await count('exam_attempts'),before);
    await seedBank();
    let pool = (await rows("SELECT private.mapadventure_pool($1,'practice',3) p",[nodeId]))[0].p;
    assert.equal(pool.filter(q=>q.difficulty==='MUDAH').length,2); assert.equal(pool.length,3); assert.equal(new Set(pool.map(q=>q.id)).size,3);
    assert.ok(pool.every(q=>q.subject_code==='mat-sd' && q.theme==='A' && q.topic==='A1' && q.education_level==='sd'));
    // Even matching legacy labels must not admit a different current theme/topic.
    await db.exec('BEGIN');
    const decoys=await rows("SELECT id FROM questions WHERE subject_code='mat-sd' AND theme='A' AND topic='A1' AND difficulty='MUDAH' ORDER BY id");
    await db.exec("UPDATE questions SET material='A',sub_material='A1'");
    await db.query("UPDATE questions SET theme='Wrong theme' WHERE id=$1",[decoys[0].id]);
    await db.query("UPDATE questions SET topic='Wrong topic' WHERE id=$1",[decoys[1].id]);
    pool=(await rows("SELECT private.mapadventure_pool($1,'practice',3) p",[nodeId]))[0].p;
    assert.ok(pool.every(q=>q.subject_code==='mat-sd' && q.theme==='A' && q.topic==='A1' && q.education_level==='sd'));
    assert.ok(pool.every(q=>!decoys.some(d=>d.id===q.id))); assert.ok(pool.every(q=>q.difficulty==='SEDANG'));
    await db.exec('ROLLBACK');
    pool = (await rows("SELECT private.mapadventure_pool($1,'sidequest',5) p",[nodeId]))[0].p; assert.ok(pool.every(q=>['SUSAH','SULIT'].includes(q.difficulty)));
    await db.exec("UPDATE questions SET difficulty='SEDANG' WHERE difficulty IN('SUSAH','SULIT')");
    pool = (await rows("SELECT private.mapadventure_pool($1,'gatekeeper',5) p",[nodeId]))[0].p; assert.ok(pool.every(q=>q.difficulty==='SEDANG'));
    const q = pool[0]; await db.query("INSERT INTO question_versions(question_id,version_status,version_number,question_text) VALUES($1,'PUBLISHED',2,'Malformed latest'),($1,'DRAFT',3,'Draft')",[q.id]);
    pool = (await rows("SELECT private.mapadventure_pool($1,'sidequest',5) p",[nodeId]))[0].p; assert.ok(pool.every(x=>x.id!==q.id));
    await db.query('DELETE FROM question_versions WHERE question_id=$1 AND version_number>1',[q.id]);
    for (const type of ['PG_TUNGGAL','PGK_MA','PGK_KATEGORI']) assert.ok((await rows("SELECT private.mapadventure_pool($1,'sidequest',10) p",[nodeId]))[0].p.some(q=>q.type===type));
  });
  await t.test('safe resume/ownership, answer validation, failed stored attempts and retry', async () => {
    let s = await start(nodeId,'practice'); assert.equal(s.total,3); assert.equal(s.deadline_at,null);
    assert.equal(s.question.answer_keys,undefined); assert.equal(s.question.clue,undefined);
    const resumed=await start(nodeId,'practice'); assert.deepEqual({...resumed,server_now:null},{...s,server_now:null});
    await user(other); await rpc('bootstrap'); await assert.rejects(complete(s),/Session unavailable/); await user(uid);
    await rpc('settings',{settings:{SUBJECT:'IPA'}});
    await assert.rejects(rpc('bootstrap',{attempt_id:s.attempt_id}),/Session unavailable/);
    await rpc('settings',{settings:{SUBJECT:'Matematika'}});
    assert.equal((await resume(s)).attempt_id,s.attempt_id);
    await assert.rejects(complete(s),/All questions/);
    await assert.rejects(answer(s,{option_codes:['Z']}));
    await assert.rejects(rpc('answer',{attempt_id:s.attempt_id,question_id:uid,answer_payload:good(s.question)}),/current frozen/);
    const aid=s.attempt_id; const r=await finish(s,2); assert.equal(r.result.correct,2); assert.equal(r.result.total,3); assert.equal(r.result.passed,false); assert.equal(r.result.stars,0); assert.equal(r.profile_xp,1); assert.equal(r.wallet.points,25);
    assert.equal(r.nodes[0].practice_status,'UNLOCKED'); assert.equal(r.nodes[0].sidequest_status,'LOCKED');
    assert.equal((await rows('SELECT practice_attempt_id FROM map_adventure_topics WHERE id=$1',[nodeId]))[0].practice_attempt_id,aid);
    assert.equal((await rows('SELECT attempt_status FROM exam_attempts WHERE id=$1',[aid]))[0].attempt_status,'SUBMITTED');
    assert.equal((await complete({attempt_id:aid})).wallet.points,25);
  });
  await t.test('private frozen grading, success replay, rewards, and one tool cannot be hidden', async () => {
    let s=await start(nodeId,'practice');
    await db.exec("UPDATE question_options SET is_correct=NOT is_correct; UPDATE question_category_items SET correct_category=CASE WHEN correct_category='Benar' THEN 'Salah' ELSE 'Benar' END");
    let r=await finish(s); assert.equal(r.result.passed,true); assert.equal(r.result.stars,3); assert.equal(r.wallet.points,50); assert.equal(r.profile_xp,2);
    await db.exec("UPDATE question_options SET is_correct=NOT is_correct; UPDATE question_category_items SET correct_category=CASE WHEN correct_category='Benar' THEN 'Salah' ELSE 'Benar' END");
    assert.equal((await complete(s)).profile_xp,2);
    assert.equal((await rows('SELECT practice_attempt_id FROM map_adventure_topics WHERE id=$1',[nodeId]))[0].practice_attempt_id,s.attempt_id);
    s=await start(nodeId,'sidequest');
    const failedId=s.attempt_id;
    const before={wallet:r.wallet,status:r.status,xp:r.profile_xp};
    r=await finish(s,4);
    assert.equal(r.result.correct,4); assert.equal(r.result.total,5); assert.equal(r.result.score,80); assert.equal(r.result.passed,false);
    assert.deepEqual([r.result.points,r.result.xp,r.result.stars],[0,0,0]);
    assert.deepEqual({wallet:r.wallet,status:r.status,xp:r.profile_xp},before);
    assert.equal(r.nodes[0].sidequest_status,'UNLOCKED'); assert.equal(r.nodes[0].mysterychest_status,'LOCKED');
    assert.deepEqual((await rows('SELECT attempt_status,correct_answers,score FROM exam_attempts WHERE id=$1',[failedId]))[0],{attempt_status:'SUBMITTED',correct_answers:4,score:'80.00'});
    assert.equal((await rows('SELECT sidequest_attempt_id FROM map_adventure_topics WHERE id=$1',[nodeId]))[0].sidequest_attempt_id,failedId);
    const failedReplay=await complete(s); assert.deepEqual(failedReplay.result,r.result); assert.deepEqual(failedReplay.wallet,before.wallet); assert.equal(failedReplay.profile_xp,before.xp);
    s=await start(nodeId,'sidequest'); assert.notEqual(s.attempt_id,failedId);
    await assert.rejects(use(s,'clue'),/inventory empty/);
    r=await rpc('buy',{tool:'clue'}); assert.equal(r.wallet.points,20); assert.equal(r.status.points,20);
    r=await use(s,'clue'); assert.equal(r.session.effects.clue,'Frozen clue'); assert.equal(r.inventory.clue,0); assert.equal(r.session.tools.length,1);
    await assert.rejects(use(s,'clue'),/already used/);
    await assert.rejects(use(s,'freezetime'),/inventory empty/);
    r=await finish(r.session,5); assert.equal(r.result.correct,5); assert.equal(r.result.total,5); assert.equal(r.result.passed,true); assert.equal(r.result.stars,2); assert.equal(r.wallet.points,70); assert.equal(r.profile_xp,7); assert.equal(r.result.xp,5);
    assert.equal(r.nodes[0].mysterychest_status,'UNLOCKED');
    assert.equal((await rows('SELECT sidequest_attempt_id FROM map_adventure_topics WHERE id=$1',[nodeId]))[0].sidequest_attempt_id,s.attempt_id);
    const replay=await complete(s); assert.deepEqual(replay.result,r.result); assert.deepEqual(replay.wallet,r.wallet); assert.deepEqual(replay.status,r.status); assert.equal(replay.profile_xp,r.profile_xp);
    assert.equal(Number((await rows("SELECT count(*) n FROM gamification_log WHERE user_id=$1 AND activity='Nina melewati Misi Sampingan di pulau A' AND xp_score=5",[uid]))[0].n),1);
    const oldReplay=await complete({attempt_id:failedId}); assert.equal(oldReplay.result.passed,false); assert.deepEqual(oldReplay.wallet,r.wallet); assert.deepEqual(oldReplay.status,r.status); assert.equal(oldReplay.profile_xp,r.profile_xp);
  });
  await t.test('node-scoped gacha exactly once, server tier, wallet sync, gate and theme graph', async () => {
    await assert.rejects(rpc('gacha',{chestTier:'golden'}),/Node unavailable/);
    const b=await rpc('bootstrap'); await assert.rejects(rpc('gacha',{nodeId:b.nodes[1].id}),/Chest locked/);
    let r=await rpc('gacha',{nodeId,chestTier:'golden'}); assert.equal(r.reward.tier,'wooden'); assert.equal(r.wallet.points,r.status.points);
    const reward=r.reward; const points=r.wallet.points; const inv=r.inventory;
    r=await rpc('gacha',{nodeId,chestTier:'silver'}); assert.deepEqual(r.reward,reward); assert.equal(r.wallet.points,points); assert.deepEqual(r.inventory,inv);
    r=await finish(await start(nodeId,'gatekeeper'),3); assert.equal(r.result.passed,false); assert.equal(r.nodes[1].material_status,'LOCKED');
    const gate=await start(nodeId,'gatekeeper');
    r=await finish(gate,4); assert.equal(r.result.correct,4); assert.equal(r.result.total,5); assert.equal(r.result.stars,3); assert.equal(r.result.passed,true);
    assert.equal((await rows('SELECT gatekeeper_attempt_id FROM map_adventure_topics WHERE id=$1',[nodeId]))[0].gatekeeper_attempt_id,gate.attempt_id);
    const replay=await complete(gate); assert.deepEqual(replay.wallet,r.wallet); assert.deepEqual(replay.status,r.status); assert.equal(replay.profile_xp,r.profile_xp);
    assert.equal(r.islands[0].status,'UNLOCKED'); assert.equal(r.islands[0].stars,3); assert.equal(r.nodes[1].material_status,'UNLOCKED');
    await assert.rejects(rpc('complete_island',{islandId:r.islands[0].id}),/not complete/);
    // A completed stage is replayable; finalizing its old attempt remains immutable.
    assert.equal(r.nodes[0].gatekeeper_status,'COMPLETED');
  });
  await t.test('secondchance single retry, fiftyfifty constraints and skip replacement records/deduction', async () => {
    let b=await rpc('bootstrap'); const id=b.nodes[1].id; await read(id);
    // Operator test fixture inventory only; clients cannot grant tools.
    await db.exec(`UPDATE map_adventure_tools SET fiftyfifty=3,secondchance=3,skipreplace=3 WHERE user_id='${uid}'`);
    let s=await start(id,'practice');
    let r=await use(s,'secondchance'); r=await answer(r.session,wrong(r.session.question)); assert.equal(r.answer.retry,true); assert.equal(r.session.index,0);
    assert.equal(r.session.effects.first_answer,undefined);
    assert.ok((await rows('SELECT effects FROM private.mapadventure_sessions WHERE attempt_id=$1',[s.attempt_id]))[0].effects.first_answer);
    r=await answer(r.session,good(r.session.question)); assert.equal(r.answer.accepted,true); assert.equal(r.session.index,1);
    s=r.session;
    if(s.question.type==='PG_TUNGGAL') { r=await use(s,'fiftyfifty'); assert.ok(r.session.effects.eliminated.length>0); assert.ok(!r.session.effects.eliminated.includes('B')); s=r.session; }
    else await assert.rejects(use(s,'fiftyfifty'),/only supports/);
    const old=s.question.id; const left=(await rpc('bootstrap')).inventory.skipreplace;
    r=await use(s,'skipreplace'); assert.notEqual(r.session.question.id,old); assert.equal(r.inventory.skipreplace,left-1);
    assert.equal((await rows('SELECT count(*) n FROM exam_attempt_questions WHERE attempt_id=$1',[s.attempt_id]))[0].n,4);
    r=await finish(r.session); assert.equal(r.result.stars,2);
    r=await finish(await start(id,'sidequest')); await rpc('gacha',{nodeId:id}); r=await finish(await start(id,'gatekeeper'));
    assert.equal(r.islands[0].status,'COMPLETED'); assert.equal(r.islands[0].stars,6); assert.equal(r.islands[1].status,'UNLOCKED');
    const xp=r.profile_xp; r=await rpc('complete_island',{islandId:r.islands[0].id}); assert.equal(r.profile_xp,xp);
    await db.exec(migration); assert.equal((await rpc('bootstrap')).profile_xp,xp);
  });
  await t.test('secondchance after a locked wrong answer reopens exactly that slot once', async () => {
    await db.exec('BEGIN'); isolated = true;
    let b = await rpc('bootstrap'); const id = b.nodes[1].id; await read(id);
    await db.exec(`UPDATE map_adventure_tools SET secondchance=2 WHERE user_id='${uid}'`);
    let s = await start(id, 'practice'); const first = s.question.id;
    let r = await rpc('answer', { attempt_id: s.attempt_id, question_id: first, answer_payload: wrong(s.question) });
    assert.equal(r.answer.accepted, true); assert.equal(r.answer.correct, false);
    assert.equal(r.session.feedback.correct, false); assert.equal(r.session.answered, 1);
    // The locked record is replayed for ordinary tools but secondchance reopens the slot.
    const replay = await use(r.session, 'clue');
    assert.deepEqual(replay.answer, r.session.feedback); assert.equal(replay.session.answered, 1);
    r = await use(r.session, 'secondchance');
    assert.equal(r.session.feedback, null); assert.equal(r.session.answered, 0);
    assert.equal(r.session.effects.secondchance, true); assert.equal(r.session.effects.retried, true);
    assert.equal(r.inventory.secondchance, 1);
    assert.equal((await rows('SELECT count(*) n FROM exam_attempt_answers WHERE attempt_id=$1', [s.attempt_id]))[0].n, 0);
    assert.equal(r.session.question.id, first, 'reopening must not move the cursor or replace the question');
    // A second use on the same slot is still a single-retry contract.
    await assert.rejects(use(r.session, 'secondchance'), /already used/);
    r = await rpc('answer', { attempt_id: r.session.attempt_id, question_id: first, answer_payload: wrong(r.session.question) });
    assert.equal(r.answer.accepted, true); assert.equal(r.answer.retry, false);
    assert.equal(r.session.feedback.correct, false); assert.equal(r.session.answered, 1);
    // Correct and timeout results stay frozen; only wrong non-timeout answers can be reopened.
    await assert.rejects(use(r.session, 'secondchance'), /already used/);
    s = await navigate(r.session, 'next');
    r = await rpc('answer', { attempt_id: s.attempt_id, question_id: s.question.id, answer_payload: good(s.question) });
    assert.equal(r.session.feedback.correct, true);
    const frozen = await use(r.session, 'secondchance');
    assert.deepEqual(frozen.answer, r.session.feedback, 'a correct answer replays and is never reopened');
    assert.equal(frozen.session.answered, r.session.answered);
    assert.equal(frozen.session.feedback.correct, true);
    const saved = await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1', [s.attempt_id]);
    assert.equal(saved[0].records.length, 2);
    await db.exec('ROLLBACK'); isolated = false;
  });
  await t.test('exam generic/direct guards, old/new membership, private role revokes and advisory lock held', async () => {
    let b=await rpc('bootstrap'); const id=b.nodes.find(n=>n.theme==='B').id; await read(id); const s=await start(id,'practice');
    for(const stmt of ['SELECT submit_exam_attempt($1)','SELECT resume_exam_attempt($1)']) await assert.rejects(db.query(stmt,[s.attempt_id]),/Use MapAdventure/);
    await assert.rejects(db.query('SELECT save_exam_answer($1,$2,$3::jsonb)',[s.attempt_id,s.question.id,JSON.stringify(good(s.question))]),/Use MapAdventure/);
    await db.query("SELECT set_config('mapadventure.writing_results','true',false)");
    for(const stmt of ["UPDATE exam_attempts SET gamification_app=NULL WHERE id=$1",'DELETE FROM exam_attempts WHERE id=$1','DELETE FROM exam_attempt_questions WHERE attempt_id=$1',
      'UPDATE exam_attempt_questions SET attempt_id=gen_random_uuid() WHERE attempt_id=$1',"INSERT INTO exam_attempt_answers(attempt_id,question_id,answer_payload) VALUES($1,gen_random_uuid(),'{}')"])
      await assert.rejects(db.query(stmt,[s.attempt_id]),/Use MapAdventure/);
    await db.exec('BEGIN'); await rpc('bootstrap'); assert.ok((await rows("SELECT * FROM pg_locks WHERE locktype='advisory' AND granted")).length>0); await db.exec('ROLLBACK');
    await db.exec('SET ROLE authenticated');
    for(const table of ['private.mapadventure_sessions','private.mapadventure_reads','public.user_wallet','public.map_adventure_topics','public.map_adventure_themes','public.map_adventure_tools','public.map_adventure_status']) {
      await assert.rejects(db.query(`SELECT * FROM ${table}`),/permission denied/); await assert.rejects(db.query(`DELETE FROM ${table}`),/permission denied/);
    }
    assert.equal((await rpc('bootstrap')).session,null);
    assert.equal((await resume(s)).attempt_id,s.attempt_id);
    await db.exec('RESET ROLE');
    const legacy=(await rows("INSERT INTO exam_attempts(user_id,duration_minutes,attempt_type) VALUES($1,60,'TRYOUT') RETURNING id",[uid]))[0].id;
    await db.query('INSERT INTO exam_attempt_questions(attempt_id,question_id,question_version_id,question_order) VALUES($1,$2,$3,1)',[legacy,s.question.id,s.question.version]);
    await assert.rejects(db.query('UPDATE exam_attempt_questions SET attempt_id=$1 WHERE attempt_id=$2',[s.attempt_id,legacy]),/Use MapAdventure/);
    await assert.rejects(db.exec(`INSERT INTO exam_attempts(user_id,duration_minutes,attempt_type,gamification_app) VALUES('${uid}',60,'GAMIFICATION','MAPADVENTURE')`),/Use MapAdventure/);
    await finish(s);
    await assert.rejects(db.query('DELETE FROM exam_attempt_answers WHERE attempt_id=$1',[s.attempt_id]),/Use MapAdventure/);
  });
  await t.test('fiftyfifty effects enforced, skip shortage atomic, silver/golden tiers and island completion',async()=>{
    let b=await rpc('bootstrap'); const id=b.nodes.find(n=>n.theme==='B').id;
    await db.exec(`UPDATE map_adventure_tools SET fiftyfifty=5,skipreplace=5,secondchance=5 WHERE user_id='${uid}'`);
    // Select a single supported type deterministically for this tools test.
    await db.exec("UPDATE questions SET question_status='DRAFT' WHERE theme='B' AND question_type<>'PG_TUNGGAL'");
    let s=await start(id,'sidequest').catch(()=>null);
    // Four PG_TUNGGAL are insufficient for a five-question sidequest.
    assert.equal(s,null);
    await db.exec("UPDATE questions SET question_status='PUBLISHED',difficulty=CASE WHEN question_type='PG_TUNGGAL' THEN 'SULIT' ELSE 'SEDANG' END WHERE theme='B'");
    s=await start(id,'sidequest');
    while(s.index < s.total - 1 && s.question.type!=='PG_TUNGGAL') s=await navigate(s,'next');
    assert.ok(s.question);
    let r=await use(s,'fiftyfifty');
    await assert.rejects(answer(r.session,{option_codes:[r.session.effects.eliminated[0]]}),/Eliminated/);
    s=r.session;
    const inv=r.inventory.skipreplace;
    await db.exec("UPDATE questions SET question_status='DRAFT' WHERE theme='B'");
    await assert.rejects(use(s,'skipreplace'),/Insufficient/);
    assert.equal((await rpc('bootstrap')).inventory.skipreplace,inv);
    await db.exec("UPDATE questions SET question_status='PUBLISHED' WHERE theme='B'");
    r=await finish(s); assert.equal(r.result.stars,2);
    r=await rpc('gacha',{nodeId:id,chestTier:'golden'}); assert.equal(r.reward.tier,'silver');
    r=await finish(await start(id,'gatekeeper')); assert.equal(r.islands[1].status,'COMPLETED');
    const last=r.nodes.find(n=>n.theme==='C').id; await read(last);
    await finish(await start(last,'practice')); await finish(await start(last,'sidequest'));
    r=await rpc('gacha',{nodeId:last,chestTier:'wooden'}); assert.equal(r.reward.tier,'golden');
    r=await finish(await start(last,'gatekeeper')); assert.equal(r.islands[2].status,'COMPLETED');
    assert.equal(r.status.points,r.wallet.points);
    const summed=r.nodes.reduce((v,n)=>v+n.material_stars+n.practice_stars+n.sidequest_stars+n.gatekeeper_stars,0);
    assert.equal(r.status.stars,summed);
  });
  await t.test('redeploy repairs only MapAdventure typo, preserves canonical precedence and other feature settings',async()=>{
    await db.exec(`DELETE FROM user_settings WHERE user_id='${other}' AND "group"='MAPADVENTURE' AND name='SHOW_TIPS';
      INSERT INTO user_settings(user_id,"group",name,value) VALUES
      ('${other}','MAPADVENTURE','SHOW_TIPS1','0'),('${uid}','MAPADVENTURE','SHOW_TIPS1','0'),('${other}','VIRTUALPET','SHOW_TIPS1','1');`);
    await db.exec(migration); await db.exec(migration);
    assert.equal((await rows(`SELECT value FROM user_settings WHERE user_id=$1 AND "group"='MAPADVENTURE' AND name='SHOW_TIPS'`,[other]))[0].value,'0');
    assert.equal((await rpc('bootstrap')).settings.SHOW_TIPS,'1');
    assert.equal(Number((await rows(`SELECT count(*) n FROM user_settings WHERE "group"='MAPADVENTURE' AND name='SHOW_TIPS1'`))[0].n),0);
    assert.equal((await rows(`SELECT value FROM user_settings WHERE user_id=$1 AND "group"='VIRTUALPET' AND name='SHOW_TIPS1'`,[other]))[0].value,'1');
  });
  await t.test('sidequest prioritizes hard and medium >5, never easy >5; gatekeeper only medium in the same bank',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.exec("UPDATE questions SET difficulty='SEDANG'; UPDATE question_versions SET estimate_minutes=2");
    const ids=await rows("SELECT id FROM questions WHERE subject_code='mat-sd' AND theme='A' AND topic='A1' ORDER BY id LIMIT 5");
    await db.query("UPDATE questions SET difficulty='SUSAH' WHERE id=$1",[ids[0].id]);
    await db.query("UPDATE questions SET difficulty='MUDAH' WHERE id=$1",[ids[1].id]);
    await db.query('UPDATE question_versions SET estimate_minutes=6 WHERE question_id IN($1,$2)',[ids[1].id,ids[3].id]);
    await db.query("UPDATE questions SET difficulty='SULIT' WHERE id=$1",[ids[2].id]);
    await db.query('UPDATE question_versions SET estimate_minutes=5 WHERE question_id=$1',[ids[4].id]);
    const priority=[ids[0].id,ids[2].id,ids[3].id];
    const pool=(await rows("SELECT private.mapadventure_pool($1,'sidequest',5) p",[nodeId]))[0].p;
    assert.equal(pool.length,5); assert.equal(new Set(pool.map(q=>q.id)).size,5);
    assert.deepEqual(new Set(pool.slice(0,3).map(q=>q.id)),new Set(priority));
    assert.ok(pool.slice(3).every(q=>q.difficulty==='SEDANG' && q.estimate_minutes<=5));
    const all=(await rows("SELECT private.mapadventure_pool($1,'sidequest',11) p",[nodeId]))[0].p;
    assert.ok(all.every(q=>q.id!==ids[1].id)); assert.ok(all.some(q=>q.id===ids[4].id));
    const gate=(await rows("SELECT private.mapadventure_pool($1,'gatekeeper',9) p",[nodeId]))[0].p;
    assert.equal(gate.length,9); assert.ok(gate.every(q=>q.difficulty==='SEDANG'));
    assert.ok(gate.some(q=>q.id===ids[3].id));
    for(const selected of [pool,all,gate]) assert.ok(selected.every(q=>q.subject_code==='mat-sd' && q.education_level==='sd' && q.theme==='A' && q.topic==='A1'));
    await db.exec('ROLLBACK'); isolated=false;
  });
  for(const stage of ['sidequest','gatekeeper']) await t.test(`${stage} start/replacement shortage is atomic and replacement keeps stage restrictions and priority`,async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query(`UPDATE map_adventure_topics SET ${stage}_status='UNLOCKED',${stage}_attempt_id=NULL WHERE id=$1`,[nodeId]);
    await db.exec(`UPDATE map_adventure_tools SET skipreplace=3 WHERE user_id='${uid}'; UPDATE question_versions SET estimate_minutes=6`);
    const ids=(await rows("SELECT id FROM questions WHERE subject_code='mat-sd' AND theme='A' AND topic='A1' ORDER BY id")).map(q=>q.id);
    // Plenty of published easy-long (and, for gatekeeper, hard) decoys cannot fill a shortage.
    await db.query("UPDATE questions SET difficulty='MUDAH' WHERE id=ANY($1::uuid[])",[ids]);
    if(stage==='gatekeeper') await db.query("UPDATE questions SET difficulty=CASE WHEN id=$2 THEN 'SUSAH' ELSE 'SULIT' END WHERE id=ANY($1::uuid[])",[ids.slice(4),ids[4]]);
    await db.query("UPDATE questions SET difficulty='SEDANG' WHERE id=ANY($1::uuid[])",[ids.slice(0,4)]);
    const snapshot=async()=>({
      attempts:await rows('SELECT * FROM exam_attempts ORDER BY id'),
      membership:await rows('SELECT * FROM exam_attempt_questions ORDER BY attempt_id,question_order'),
      sessions:await rows('SELECT * FROM private.mapadventure_sessions ORDER BY attempt_id'),
      tools:await rows('SELECT * FROM map_adventure_tools ORDER BY user_id'),
      nodes:await rows('SELECT * FROM map_adventure_topics ORDER BY id'),
      wallet:await rows('SELECT * FROM user_wallet ORDER BY user_id'),
      logs:await count('gamification_log'),
    });
    const before=await snapshot();
    await assert.rejects(start(nodeId,stage),/Insufficient published questions: need 5, available 4/);
    assert.deepEqual(await snapshot(),before);
    await db.query("UPDATE questions SET difficulty='SEDANG' WHERE id=$1",[ids[4]]);
    const s=await start(nodeId,stage); assert.equal(s.total,5);
    const started=await snapshot();
    await assert.rejects(use(s,'skipreplace'),/Insufficient published questions: need 1, available 0/);
    assert.deepEqual(await snapshot(),started);
    if(stage==='sidequest') {
      // Only medium-long outranks the short-medium spare; easy-long remains forbidden.
      await db.query("UPDATE questions SET difficulty='SEDANG' WHERE id IN($1,$2)",[ids[5],ids[6]]);
      await db.query('UPDATE question_versions SET estimate_minutes=5 WHERE question_id=$1',[ids[6]]);
    } else {
      // Hard spares remain published; only this medium spare may replace the question.
      await db.query("UPDATE questions SET difficulty='SEDANG' WHERE id=$1",[ids[5]]);
    }
    const r=await use(s,'skipreplace');
    assert.equal(r.session.question.id,ids[5]); assert.equal(r.session.question.difficulty,'SEDANG');
    assert.equal(r.session.question.estimate_minutes,6); assert.equal(r.session.deadline_at,s.deadline_at);
    assert.equal(r.inventory.skipreplace,2);
    assert.equal(Number((await rows('SELECT count(*) n FROM exam_attempt_questions WHERE attempt_id=$1',[s.attempt_id]))[0].n),6);
    const stored=(await rows('SELECT pool,seen_ids,tools FROM private.mapadventure_sessions WHERE attempt_id=$1',[s.attempt_id]))[0];
    assert.ok(stored.pool.every(q=>q.difficulty==='SEDANG')); assert.equal(new Set(stored.seen_ids).size,6);
    assert.ok(stored.seen_ids.includes(s.question.id)); assert.equal(stored.tools.length,1);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('per-question deadlines, strict timeout, late answers, private persistence and no reward bypass',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query("UPDATE map_adventure_topics SET sidequest_status='UNLOCKED',sidequest_attempt_id=NULL WHERE id=$1",[nodeId]);
    let s=await start(nodeId,'sidequest');
    assert.ok(s.remaining_seconds>118 && s.remaining_seconds<=120); assert.equal(s.question.estimate_minutes,2);
    assert.equal((await rows('SELECT deadline_at FROM exam_attempts WHERE id=$1',[s.attempt_id]))[0].deadline_at,null);
    const timeout=async s=>acknowledge(await rpc('timeout',{attempt_id:s.attempt_id,question_id:s.question.id}));
    await assert.rejects(timeout(s),/not expired/);
    await assert.rejects(rpc('timeout',{attempt_id:s.attempt_id}),/Missing session/);
    await assert.rejects(rpc('timeout',{attempt_id:s.attempt_id,question_id:s.question.id,timestamp:0}),/Unknown payload/);
    await assert.rejects(answer(s,{is_timeout:true}),/Unknown answer field/);
    const before=await rpc('bootstrap'); const old=s;
    // Owner manipulates the private clock; never wait for real fixture durations.
    await expire(s);
    const expired=await resume(s); assert.equal(expired.question.id,s.question.id); assert.equal(expired.remaining_seconds,0);
    assert.equal(expired.feedback.is_timeout,true); assert.equal(expired.answered,1);
    assert.deepEqual((await resume(s)).feedback,expired.feedback);
    let r=await answer(s); assert.equal(r.answer.is_timeout,true); assert.equal(r.session.index,1);
    assert.ok(r.session.remaining_seconds>118); s=r.session;
    const stored=(await rows('SELECT answer_payload,is_timeout FROM exam_attempt_answers WHERE attempt_id=$1',[s.attempt_id]))[0];
    assert.deepEqual(stored,{answer_payload:{},is_timeout:true});
    const rec=(await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1',[s.attempt_id]))[0].records[0];
    assert.equal(rec.correct,false); assert.equal(rec.is_timeout,true);
    await assert.rejects(timeout(old),/current frozen/);
    await expire(s);
    r=await timeout(s); assert.equal(r.answer.is_timeout,true); assert.equal(r.session.index,2); assert.ok(r.session.remaining_seconds>118);
    r=await finish(r.session); assert.equal(r.result.correct,3); assert.equal(r.result.passed,false);
    assert.deepEqual([r.result.xp,r.result.points,r.result.stars],[0,0,0]); assert.deepEqual(r.wallet,before.wallet); assert.equal(r.profile_xp,before.profile_xp);
    assert.deepEqual((await complete(s)).result,r.result);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('timed tools atomic +30 once per slot, retry/replacement no reset, practice untimed, legacy resume',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query("UPDATE map_adventure_topics SET sidequest_status='UNLOCKED',practice_status='UNLOCKED',sidequest_attempt_id=NULL,practice_attempt_id=NULL WHERE id=$1",[nodeId]);
    await db.exec(`UPDATE map_adventure_tools SET freezetime=4,secondchance=4,skipreplace=4 WHERE user_id='${uid}'`);
    let s=await start(nodeId,'sidequest'); const aid=s.attempt_id;
    const original=Date.parse(s.deadline_at);
    let r=await use(s,'freezetime'); s=r.session;
    assert.equal(Date.parse(s.deadline_at)-original,30000); assert.equal(r.inventory.freezetime,3);
    await assert.rejects(use(s,'freezetime'),/already used/); assert.equal((await rpc('bootstrap')).inventory.freezetime,3);
    r=await use(s,'secondchance'); assert.equal(Date.parse(r.session.deadline_at),original+30000);
    r=await answer(r.session,wrong(r.session.question)); assert.equal(r.answer.retry,true); assert.equal(Date.parse(r.session.deadline_at),original+30000);
    r=await use(r.session,'skipreplace'); assert.equal(Date.parse(r.session.deadline_at),original+30000);
    await assert.rejects(use(r.session,'freezetime'),/already used/);
    await assert.rejects(use(r.session,'skipreplace'),/already used/);
    await expire(r.session);
    r=await use(r.session,'freezetime'); assert.equal(r.answer.is_timeout,true); assert.equal(r.inventory.freezetime,3); assert.equal(r.session.index,0);
    // Simulate pre-timer active row/snapshot at the next unanswered legacy slot.
    await db.query("UPDATE private.mapadventure_sessions SET question_index=NULL,question_ledger='{}',feedback=NULL,effects='{}',question_deadline_at=NULL,pool=(SELECT jsonb_agg(x-'estimate_minutes') FROM jsonb_array_elements(pool) x) WHERE attempt_id=$1",[aid]);
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
    const transactionalMigration=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
    await db.exec(transactionalMigration); await db.exec(transactionalMigration);
    await db.exec('SET CONSTRAINTS ALL DEFERRED');
    assert.equal((await rows('SELECT question_deadline_at FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].question_deadline_at,null);
    s=await resume({attempt_id:aid});
    assert.equal(s.index,1); assert.equal(s.feedback,null);
    assert.ok(s.remaining_seconds>118); assert.equal(s.question.estimate_minutes,2);
    assert.equal((await resume(s)).deadline_at,s.deadline_at);
    await finish(s);
    s=await start(nodeId,'practice'); assert.equal(s.deadline_at,null); assert.equal(s.remaining_seconds,null);
    await assert.rejects(rpc('timeout',{attempt_id:s.attempt_id,question_id:s.question.id}),/not expired/);
    await assert.rejects(use(s,'freezetime'),/Practice is untimed/); assert.equal((await rpc('bootstrap')).inventory.freezetime,3);
    r=await use(s,'secondchance'); assert.equal(r.session.deadline_at,null);
    r=await finish(r.session); assert.equal(r.result.passed,true);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('gatekeeper snapshots actual duration across bank edits; all timed-out questions score zero without grader error',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query("UPDATE map_adventure_topics SET gatekeeper_status='UNLOCKED',gatekeeper_attempt_id=NULL WHERE id=$1",[nodeId]);
    await db.exec('UPDATE question_versions SET estimate_minutes=6');
    let s=await start(nodeId,'gatekeeper'); assert.ok(s.remaining_seconds>358 && s.remaining_seconds<=360);
    const deadline=s.deadline_at; const initial=await rpc('bootstrap');
    await db.exec('UPDATE question_versions SET estimate_minutes=1');
    s=await resume(s); assert.equal(s.deadline_at,deadline); assert.equal(s.question.estimate_minutes,6);
    await db.exec(`UPDATE map_adventure_tools SET secondchance=5 WHERE user_id='${uid}'`);
    s=(await use(s,'secondchance')).session;
    while(s.answered < s.total) {
      await expire(s);
      const r=await answer(s); assert.equal(r.answer.is_timeout,true); assert.equal(r.answer.retry,false);
      s=r.session; if(s.answered < s.total) { assert.equal(s.question.estimate_minutes,6); assert.ok(s.remaining_seconds>358); }
    }
    const r=await complete(s); assert.equal(r.result.correct,0); assert.equal(r.result.passed,false);
    assert.deepEqual([r.result.xp,r.result.points,r.result.stars],[0,0,0]); assert.equal(r.profile_xp,initial.profile_xp); assert.deepEqual(r.wallet,initial.wallet);
    assert.equal(Number((await rows('SELECT count(*) n FROM exam_attempt_answers WHERE attempt_id=$1 AND is_timeout AND answer_payload=\'{}\'::jsonb',[s.attempt_id]))[0].n),5);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('Indonesian logs exact once for successful nodes/chests/islands, explicit island ack no duplicates and nickname fallbacks',async()=>{
    const logs=await rows('SELECT activity,xp_score FROM gamification_log WHERE user_id=$1',[uid]);
    for(const [label,xp] of [['Kemah Ilmu',1],['Latihan',1],['Misi Sampingan',5],['Pos Penjaga',1]]) {
      assert.equal(logs.filter(l=>l.activity.includes(`melewati ${label} di pulau `)).length,4);
      assert.ok(logs.filter(l=>l.activity.includes(`melewati ${label} di pulau `)).every(l=>l.xp_score===xp));
    }
    assert.equal(logs.filter(l=>l.activity.includes('menemukan kotak misteri')).length,4);
    assert.equal(logs.filter(l=>l.activity.includes('selesai menjelajahi')).length,3);
    assert.ok(logs.filter(l=>/menemukan|menjelajahi/.test(l.activity)).every(l=>l.xp_score===0));
    const b=await rpc('bootstrap'); for(const i of b.islands) { await rpc('complete_island',{islandId:i.id}); await rpc('complete_island',{islandId:i.id}); }
    assert.equal(await count('gamification_log'),logs.length);
    await db.exec('BEGIN');
    await db.query("UPDATE profiles SET nickname='  ',full_name='Nama Lengkap' WHERE id=$1",[uid]);
    await db.query("UPDATE map_adventure_topics SET material_status='UNLOCKED' WHERE id=$1",[nodeId]); await read(nodeId);
    assert.equal((await rows("SELECT count(*) n FROM gamification_log WHERE activity='Nama Lengkap melewati Kemah Ilmu di pulau A'"))[0].n,1);
    await db.query("UPDATE profiles SET full_name=' ' WHERE id=$1",[uid]);
    await db.query("UPDATE map_adventure_topics SET material_status='UNLOCKED' WHERE id=$1",[nodeId]); await read(nodeId);
    assert.equal((await rows("SELECT count(*) n FROM gamification_log WHERE activity='Siswa melewati Kemah Ilmu di pulau A'"))[0].n,1);
    await db.exec('ROLLBACK');
  });
  await t.test('branch unlock, gatekeeper bypasses chest, late sidequest/chest never downgrade completed gate',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query("UPDATE map_adventure_topics SET practice_status='UNLOCKED',sidequest_status='LOCKED',mysterychest_status='LOCKED',gatekeeper_status='LOCKED',chest_reward=NULL,practice_attempt_id=NULL,sidequest_attempt_id=NULL,gatekeeper_attempt_id=NULL WHERE id=$1",[nodeId]);
    let r=await finish(await start(nodeId,'practice'));
    assert.equal(r.nodes[0].sidequest_status,'UNLOCKED'); assert.equal(r.nodes[0].gatekeeper_status,'UNLOCKED'); assert.equal(r.nodes[0].mysterychest_status,'LOCKED');
    await assert.rejects(rpc('gacha',{nodeId}),/Chest locked/);
    r=await finish(await start(nodeId,'gatekeeper'));
    assert.equal(r.nodes[0].gatekeeper_status,'COMPLETED'); assert.equal(r.nodes[0].mysterychest_status,'LOCKED');
    r=await finish(await start(nodeId,'sidequest')); assert.equal(r.nodes[0].mysterychest_status,'UNLOCKED');
    r=await rpc('gacha',{nodeId}); assert.equal(r.nodes[0].gatekeeper_status,'COMPLETED');
    const before={wallet:r.wallet,status:r.status,xp:r.profile_xp,logs:await count('gamification_log')};
    r=await rpc('gacha',{nodeId}); assert.deepEqual({wallet:r.wallet,status:r.status,xp:r.profile_xp,logs:await count('gamification_log')},before);
    await db.query("UPDATE map_adventure_topics SET gatekeeper_status='LOCKED' WHERE id=$1",[nodeId]);
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE'); await db.exec(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));
    assert.equal((await rpc('bootstrap')).nodes[0].gatekeeper_status,'UNLOCKED');
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('completed stages replay with highest stars, delta-only global/island totals and zero duplicate rewards/logs',async()=>{
    await db.exec('BEGIN'); isolated=true;
    for(const stage of ['practice','sidequest','gatekeeper']) {
      let before=await rpc('bootstrap'); const old=before.nodes[0][`${stage}_stars`];
      await db.query(`UPDATE map_adventure_topics SET ${stage}_stars=2 WHERE id=$1`,[nodeId]);
      await db.query('UPDATE map_adventure_status SET stars=stars+$1 WHERE user_id=$2',[2-old,uid]);
      if(stage==='gatekeeper') await db.exec('UPDATE map_adventure_themes h SET stars=(SELECT sum(gatekeeper_stars) FROM map_adventure_topics WHERE theme_id=h.id)');
      before=await rpc('bootstrap'); const logs=await count('gamification_log');
      const s=await start(nodeId,stage); let r=await finish(s);
      assert.equal(r.result.stars,3); assert.equal(r.result.best_stars,3); assert.deepEqual([r.result.points,r.result.xp],[0,0]);
      assert.equal(r.status.stars,before.status.stars+1); assert.equal(r.nodes[0][`${stage}_stars`],3);
      assert.deepEqual(r.wallet,before.wallet); assert.equal(r.profile_xp,before.profile_xp); assert.equal(await count('gamification_log'),logs);
      if(stage==='gatekeeper') assert.equal(r.islands[0].stars,before.islands[0].stars+1);
      const replay=await complete(s); assert.deepEqual(replay.result,r.result); assert.deepEqual(replay.status,r.status);
      await db.exec(`UPDATE map_adventure_tools SET clue=10 WHERE user_id='${uid}'`);
      const toolSession=(await use(await start(nodeId,stage),'clue')).session;
      assert.equal((await rows(`SELECT ${stage}_attempt_id pointer FROM map_adventure_topics WHERE id=$1`,[nodeId]))[0].pointer,toolSession.attempt_id);
      r=await finish(toolSession); assert.equal(r.result.stars,2); assert.equal(r.result.best_stars,3); assert.deepEqual(r.status,replay.status);
      const failed=await start(nodeId,stage);
      r=await finish(failed,0); assert.equal(r.result.stars,0); assert.equal(r.result.best_stars,3); assert.equal(r.nodes[0][`${stage}_status`],'COMPLETED'); assert.deepEqual(r.status,replay.status);
      assert.equal(r.nodes[0][`${stage}_attempt_id`],failed.attempt_id);
      assert.equal(r.nodes[0].mysterychest_status,before.nodes[0].mysterychest_status); assert.deepEqual(r.nodes[0].chest_reward,before.nodes[0].chest_reward);
      assert.deepEqual(r.wallet,before.wallet); assert.equal(r.profile_xp,before.profile_xp);
      for (const [attempt,stars] of [[s,3],[toolSession,2],[failed,0]]) {
        assert.deepEqual((await rows('SELECT stars FROM map_adventure_logs WHERE exam_attempt_id=$1',[attempt.attempt_id])).map(l=>l.stars),[stars]);
        await complete(attempt);
      }
      assert.equal(await count('gamification_log'),logs);
    }
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('persisted current-question feedback leaves unseen clock stopped, navigation is bound, review uses frozen keys and records',async()=>{
    await db.exec('BEGIN'); isolated=true;
    const s=await start(nodeId,'gatekeeper');
    const raw=await rpc('answer',{attempt_id:s.attempt_id,question_id:s.question.id,answer_payload:good(s.question)});
    assert.equal(raw.answer.correct,true); assert.equal(raw.session.feedback.correct,true); assert.equal(raw.session.question.id,s.question.id); assert.equal(raw.session.deadline_at,s.deadline_at);
    const resumed=await resume(s); assert.deepEqual(resumed.feedback,raw.answer); assert.equal(resumed.deadline_at,s.deadline_at);
    const hidden=(await rows('SELECT pool FROM private.mapadventure_sessions WHERE attempt_id=$1',[s.attempt_id]))[0].pool[1];
    const ledger=(await rows('SELECT question_ledger FROM private.mapadventure_sessions WHERE attempt_id=$1',[s.attempt_id]))[0].question_ledger;
    assert.equal(ledger['1'],undefined, 'feedback/reload must not start the unseen slot clock');
    await assert.rejects(rpc('answer',{attempt_id:s.attempt_id,question_id:hidden.id,answer_payload:good(hidden)}),/current frozen/);
    await assert.rejects(rpc('next',{attempt_id:s.attempt_id,question_id:hidden.id}),/current frozen/);
    await user(other); await assert.rejects(rpc('next',{attempt_id:s.attempt_id,question_id:s.question.id}),/Session unavailable/); await user(uid);
    let r=await rpc('next',{attempt_id:s.attempt_id,question_id:s.question.id}); assert.ok(r.session.remaining_seconds>118);
    const deadline=r.session.deadline_at;
    await assert.rejects(rpc('next',{attempt_id:s.attempt_id,question_id:s.question.id}),/current frozen/);
    assert.equal((await resume(r.session)).deadline_at,deadline);
    const revisited=await navigate(r.session,'previous'); assert.deepEqual(revisited.feedback,raw.answer);
    assert.equal(revisited.deadline_at,s.deadline_at);
    const replay=await rpc('answer',{attempt_id:s.attempt_id,question_id:s.question.id,answer_payload:wrong(s.question)});
    assert.deepEqual(replay.answer,raw.answer); assert.deepEqual(replay.session.answer_payload,good(s.question));
    r={session:await navigate(revisited,'next')};
    // Bank edits cannot alter the final frozen review.
    await db.exec("UPDATE question_options SET is_correct=false; UPDATE question_category_items SET correct_category='Wrong'");
    r=await finish(r.session); assert.equal(r.result.review.length,5); assert.equal(r.result.correct,5);
    for(const record of r.result.review) { assert.equal(record.correct,true); assert.ok(record.question.answer_keys); assert.equal(record.question.clue,undefined); assert.ok(record.answer_payload); }
    assert.deepEqual((await complete(s)).result.review,r.result.review);
    await db.exec('ROLLBACK'); isolated=false;
  });
  for (const stage of ['practice','sidequest','gatekeeper']) await t.test(`${stage}: all status/pointer transitions, fail logs, stale recovery and rejected foreign pointers`,async()=>{
    await db.exec('BEGIN'); isolated=true;
    const pointer = `${stage}_attempt_id`, status = `${stage}_status`;
    const node = async () => (await rows('SELECT * FROM map_adventure_topics WHERE id=$1',[nodeId]))[0];
    const audit = async aid => rows('SELECT user_id,topic_attempt_id,node_type,exam_attempt_id,stars FROM map_adventure_logs WHERE exam_attempt_id=$1',[aid]);
    const snapshot = async () => ({ attempts:await count('exam_attempts'), logs:await count('map_adventure_logs'), node:await node(), state:await rpc('bootstrap') });
    // Both unlocked/completed empty pointers create and persist a new attempt immediately.
    for (const initial of ['UNLOCKED','COMPLETED']) {
      await db.query(`UPDATE map_adventure_topics SET ${status}=$1,${pointer}=NULL WHERE id=$2`,[initial,nodeId]);
      const before=await count('exam_attempts');
      let s=await start(nodeId,stage);
      assert.equal(await count('exam_attempts'),before+1); assert.equal((await node())[pointer],s.attempt_id);
      // Both statuses with unfinished pointer must resume the exact frozen session.
      const resumed=await rpc('start',{nodeId,stage});
      assert.equal(resumed.resumed,true); assert.equal(resumed.session.attempt_id,s.attempt_id);
      assert.equal(resumed.session.question.id,s.question.id); assert.equal(resumed.session.deadline_at,s.deadline_at);
      const r=await finish(s,0);
      assert.equal((await node())[status],initial); assert.equal((await node())[pointer],s.attempt_id);
      assert.deepEqual(await audit(s.attempt_id),[{user_id:uid,topic_attempt_id:nodeId,node_type:stage.toUpperCase(),exam_attempt_id:s.attempt_id,stars:0}]);
      await complete(s); await complete(s); assert.equal((await audit(s.attempt_id)).length,1);
      // Failed UNLOCKED must not fabricate completion; COMPLETED+finished also retries.
      const retried=await start(nodeId,stage); assert.notEqual(retried.attempt_id,s.attempt_id);
      assert.equal((await node())[pointer],retried.attempt_id);
      await finish(retried);
      // A stale finish cannot replace the pointer to a newer active retry.
      const newer=await start(nodeId,stage); await complete(s);
      assert.equal((await node())[pointer],newer.attempt_id); assert.equal((await resume(newer)).attempt_id,newer.attempt_id);
      await finish(newer);
    }
    // Recover stale UNLOCKED + successful finished pointer; no new exam/rewards/log.
    const successful=(await node())[pointer];
    await db.query(`UPDATE map_adventure_topics SET ${status}='UNLOCKED' WHERE id=$1`,[nodeId]);
    const before=await snapshot(); const r=await rpc('start',{nodeId,stage});
    assert.equal(r.session,null); assert.equal((await node())[status],'COMPLETED'); assert.equal((await node())[pointer],successful);
    assert.equal(await count('exam_attempts'),before.attempts); assert.equal(await count('map_adventure_logs'),before.logs);
    assert.deepEqual(r.wallet,before.state.wallet); assert.equal(r.profile_xp,before.state.profile_xp);
    // LOCKED never resumes/creates, whether pointer is empty or finished/unfinished.
    for (const value of [null,successful]) {
      await db.query(`UPDATE map_adventure_topics SET ${status}='LOCKED',${pointer}=$1 WHERE id=$2`,[value,nodeId]);
      if(stage==='gatekeeper') await db.query("UPDATE map_adventure_topics SET practice_status='UNLOCKED' WHERE id=$1",[nodeId]);
      await assert.rejects(start(nodeId,stage),/Node locked/);
    }
    await db.query(`UPDATE map_adventure_topics SET ${status}='COMPLETED',${pointer}=NULL WHERE id=$1`,[nodeId]);
    let s=await start(nodeId,stage);
    await db.query(`UPDATE map_adventure_topics SET ${status}='LOCKED' WHERE id=$1`,[nodeId]);
    await assert.rejects(start(nodeId,stage),/Node locked/);
    await db.query(`UPDATE map_adventure_topics SET ${status}='COMPLETED' WHERE id=$1`,[nodeId]);
    // A missing legacy pointer adopts its owned active session; no pool reroll.
    await db.query(`UPDATE map_adventure_topics SET ${pointer}=NULL WHERE id=$1`,[nodeId]);
    assert.equal((await start(nodeId,stage)).attempt_id,s.attempt_id); assert.equal((await node())[pointer],s.attempt_id);
    await finish(s);
    const finishedPointer=s.attempt_id;
    s=await start(nodeId,stage);
    await db.query(`UPDATE map_adventure_topics SET ${pointer}=$1 WHERE id=$2`,[finishedPointer,nodeId]);
    await assert.rejects(start(nodeId,stage),/Attempt pointer conflicts with active session/);
    await db.query(`UPDATE map_adventure_topics SET ${pointer}=$1 WHERE id=$2`,[s.attempt_id,nodeId]);
    await finish(s);
    // Reject missing, other-node, other-stage, and foreign-owner pointers, even with an owned active session.
    const otherNode=(await rpc('bootstrap')).nodes[1].id;
    const anotherStage=stage==='practice'?'sidequest':'practice';
    const wrongStage=(await rows('SELECT attempt_id FROM private.mapadventure_sessions WHERE user_id=$1 AND node_id=$2 AND stage=$3 LIMIT 1',[uid,nodeId,anotherStage]))[0].attempt_id;
    const wrongNode=(await rows('SELECT attempt_id FROM private.mapadventure_sessions WHERE user_id=$1 AND node_id=$2 LIMIT 1',[uid,otherNode]))[0].attempt_id;
    await user(other); let foreignState=await rpc('bootstrap'); const foreignNode=foreignState.nodes[0].id;
    await db.query(`UPDATE map_adventure_topics SET ${status}='COMPLETED' WHERE id=$1`,[foreignNode]);
    const foreign=await start(foreignNode,stage); await user(uid);
    s=await start(nodeId,stage);
    for (const bad of [uid,wrongStage,wrongNode,foreign.attempt_id]) {
      await db.query(`UPDATE map_adventure_topics SET ${pointer}=$1 WHERE id=$2`,[bad,nodeId]);
      const attempts=await count('exam_attempts'); await assert.rejects(start(nodeId,stage),/Attempt pointer unavailable/);
      assert.equal(await count('exam_attempts'),attempts);
    }
    await db.query(`UPDATE map_adventure_topics SET ${pointer}=$1 WHERE id=$2`,[s.attempt_id,nodeId]);
    await finish(s);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('UNLOCKED recovery/retry retains existing higher stars even when new passing score is lower',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query("UPDATE map_adventure_topics SET practice_status='UNLOCKED',practice_attempt_id=NULL WHERE id=$1",[nodeId]);
    await db.query('UPDATE map_adventure_tools SET clue=1 WHERE user_id=$1',[uid]);
    const before=await rpc('bootstrap');
    const s=(await use(await start(nodeId,'practice'),'clue')).session;
    const r=await finish(s); assert.equal(r.result.stars,2); assert.equal(r.nodes[0].practice_stars,3); assert.equal(r.result.best_stars,3);
    assert.equal(r.status.stars,before.status.stars);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('finish/log failure rolls back submission, rewards, progress and allows one retry',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query("UPDATE map_adventure_topics SET gatekeeper_status='UNLOCKED',gatekeeper_attempt_id=NULL WHERE id=$1",[nodeId]);
    let s=await start(nodeId,'gatekeeper');
    while(s.answered < s.total) s=(await answer(s)).session;
    const before=await rpc('bootstrap');
    await db.exec("CREATE FUNCTION private.reject_map_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test log failure'; END $$; CREATE TRIGGER reject_map_log BEFORE INSERT ON map_adventure_logs FOR EACH ROW EXECUTE FUNCTION private.reject_map_log()");
    await assert.rejects(complete(s),/test log failure/);
    assert.equal((await rows('SELECT attempt_status FROM exam_attempts WHERE id=$1',[s.attempt_id]))[0].attempt_status,'IN_PROGRESS');
    assert.equal((await rows('SELECT result FROM private.mapadventure_sessions WHERE attempt_id=$1',[s.attempt_id]))[0].result,null);
    let state=await rpc('bootstrap'); assert.deepEqual(state.wallet,before.wallet); assert.deepEqual(state.status,before.status); assert.equal(state.profile_xp,before.profile_xp);
    await db.exec('DROP TRIGGER reject_map_log ON map_adventure_logs');
    const finished=await complete(s); await complete(s);
    assert.equal(finished.wallet.points,before.wallet.points+50); assert.equal(finished.profile_xp,before.profile_xp+1);
    assert.equal(Number((await rows('SELECT count(*) n FROM map_adventure_logs WHERE exam_attempt_id=$1',[s.attempt_id]))[0].n),1);
    await assert.rejects(db.query('INSERT INTO map_adventure_logs(user_id,topic_attempt_id,node_type,exam_attempt_id) VALUES($1,$2,$3,$4)',[uid,nodeId,'GATEKEEPER',s.attempt_id]),/unique constraint/);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('secondchance reopens a locked timeout once with a fresh server deadline',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.exec('UPDATE map_adventure_tools SET secondchance=5');
    let s=await start(nodeId,'sidequest');
    await expire(s); s=await resume(s);
    assert.equal(s.feedback.is_timeout,true);
    const before=s.answered;
    s=(await use(s,'secondchance')).session;
    assert.equal(s.feedback,null);
    assert.equal(s.answered,before-1);
    assert.ok(new Date(s.deadline_at)>new Date(s.server_now));
    await assert.rejects(use(s,'secondchance'),/already used/);
    const saved=await rpc('answer',{attempt_id:s.attempt_id,question_id:s.question.id,answer_payload:good(s.question)});
    assert.equal(saved.session.feedback.correct,true);
  });
  await t.test('independent unfinished node/stage sessions, subject switching, descriptors and explicit ownership',async()=>{
    await db.exec('BEGIN'); isolated=true;
    const otherNode=(await rpc('bootstrap')).nodes[1].id;
    const a=await start(nodeId,'sidequest');
    const b=await start(nodeId,'gatekeeper');
    const c=await start(otherNode,'practice');
    assert.equal(new Set([a.attempt_id,b.attempt_id,c.attempt_id]).size,3);
    const stored=async()=>rows('SELECT * FROM private.mapadventure_sessions WHERE attempt_id=ANY($1::uuid[]) ORDER BY attempt_id',[[a.attempt_id,b.attempt_id,c.attempt_id]]);
    const original=await stored();
    let state=await rpc('bootstrap'); assert.equal(state.session,null);
    assert.deepEqual(new Set(state.sessions.map(s=>s.attempt_id)),new Set([a.attempt_id,b.attempt_id,c.attempt_id]));
    for(const s of [a,b,c]) {
      const descriptor=state.sessions.find(d=>d.attempt_id===s.attempt_id);
      assert.deepEqual(descriptor,{attempt_id:s.attempt_id,nodeId:s.nodeId,stage:s.stage,subject_code:'mat-sd',theme_id:state.nodes.find(n=>n.id===s.nodeId).theme_id,index:0,total:s.total,answered:0});
      assert.equal((await start(s.nodeId,s.stage)).attempt_id,s.attempt_id);
      assert.equal((await resume(s)).question.id,s.question.id);
    }
    assert.deepEqual(await stored(),original, 'selection/start resume must not reroll or reset existing clocks');
    state=await rpc('settings',{settings:{SUBJECT:'IPA'}}); assert.equal(state.session,null);
    const ipa=state.nodes[0].id; await read(ipa); const d=await start(ipa,'practice');
    assert.equal((await rpc('bootstrap')).sessions.length,4);
    for(const s of [a,b,c]) await assert.rejects(rpc('bootstrap',{attempt_id:s.attempt_id}),/Session unavailable/);
    await assert.rejects(rpc('answer',{attempt_id:a.attempt_id,question_id:a.question.id,answer_payload:good(a.question)}),/profile\/subject changed/);
    await rpc('settings',{settings:{SUBJECT:'Matematika'}});
    for(const s of [a,b,c]) assert.equal((await resume(s)).deadline_at,s.deadline_at);
    await assert.rejects(rpc('bootstrap',{attempt_id:d.attempt_id}),/Session unavailable/);
    await assert.rejects(rpc('bootstrap',{attempt_id:uid}),/Session unavailable/);
    await user(other); state=await rpc('bootstrap'); assert.equal(state.sessions.length,0);
    for(const s of [a,b,c,d]) {
      await assert.rejects(rpc('bootstrap',{attempt_id:s.attempt_id}),/Session unavailable/);
      for(const action of ['next','previous','answer','timeout','use_tool']) {
        const payload={attempt_id:s.attempt_id,question_id:s.question.id};
        if(action==='answer') payload.answer_payload=good(s.question);
        if(action==='use_tool') payload.tool='clue';
        await assert.rejects(rpc(action,payload),/Session unavailable/);
      }
    }
    await user(uid); assert.deepEqual(await stored(),original);
    const result=await finish(a); assert.equal(result.result.attempt_id,a.attempt_id);
    state=await rpc('bootstrap'); assert.equal(state.session,null);
    assert.deepEqual(new Set(state.sessions.map(s=>s.attempt_id)),new Set([b.attempt_id,c.attempt_id,d.attempt_id]));
    assert.equal((await resume(b)).deadline_at,b.deadline_at); assert.equal((await resume(c)).answered,0);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('bounded previous/next include unanswered slots; cursor is independent of record count and finish stays explicit',async()=>{
    await db.exec('BEGIN'); isolated=true;
    const initial=await rpc('bootstrap'); let s=await start(nodeId,'practice'); const aid=s.attempt_id;
    assert.equal((await navigate(s,'previous')).index,0);
    for(const action of ['next','previous']) {
      await assert.rejects(rpc(action,{attempt_id:aid}),/Missing session/);
      await assert.rejects(rpc(action,{attempt_id:aid,question_id:uid}),/current frozen/);
      await assert.rejects(rpc(action,{attempt_id:aid,question_id:s.question.id,index:2}),/Unknown payload/);
    }
    s=await navigate(s,'next'); assert.equal(s.index,1); assert.equal(s.answered,0); assert.equal(s.feedback,null);
    const second=s.question;
    s=await navigate(s,'next'); assert.equal(s.index,2); assert.equal(s.answered,0);
    assert.equal((await navigate(s,'next')).index,2);
    let r=await rpc('answer',{attempt_id:aid,question_id:s.question.id,answer_payload:good(s.question)});
    assert.equal(r.session.index,2); assert.equal(r.session.answered,1); assert.equal(r.session.question.id,s.question.id);
    assert.equal((await navigate(r.session,'next')).index,2);
    s=await navigate(r.session,'previous'); assert.equal(s.question.id,second.id); assert.equal(s.feedback,null);
    await assert.rejects(complete(s),/All questions/);
    r=await rpc('answer',{attempt_id:aid,question_id:s.question.id,answer_payload:good(s.question)});
    s=await navigate(r.session,'previous'); assert.equal(s.index,0); assert.equal(s.answered,2);
    r=await rpc('answer',{attempt_id:aid,question_id:s.question.id,answer_payload:good(s.question)});
    assert.equal(r.session.answered,3); assert.equal(r.session.index,0); assert.ok(r.session.question);
    assert.equal((await rows('SELECT attempt_status FROM exam_attempts WHERE id=$1',[aid]))[0].attempt_status,'IN_PROGRESS');
    assert.equal((await rows('SELECT result FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].result,null);
    assert.equal((await rows('SELECT count(*) n FROM map_adventure_logs WHERE exam_attempt_id=$1',[aid]))[0].n,0);
    const records=(await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].records;
    for(let i=0;i<3;i++) {
      const before=await resume(r.session);
      for(const action of ['answer','timeout','use_tool']) {
        const payload={attempt_id:aid,question_id:before.question.id};
        if(action==='answer') payload.answer_payload=wrong(before.question);
        if(action==='use_tool') payload.tool='skipreplace';
        const replay=await rpc(action,payload);
        assert.equal(replay.session.attempt_id,aid); assert.deepEqual(replay.answer,before.feedback);
        assert.deepEqual(replay.session.answer_payload,before.answer_payload);
      }
      r={session:await navigate(before,'next')};
    }
    assert.deepEqual((await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].records,records);
    assert.equal(Number((await rows('SELECT count(*) n FROM exam_attempt_answers WHERE attempt_id=$1',[aid]))[0].n),3);
    const final=await complete(r.session); assert.equal(final.result.correct,3); assert.equal(final.result.review.length,3);
    assert.deepEqual(final.wallet,initial.wallet); assert.equal(final.profile_xp,initial.profile_xp);
    assert.deepEqual((await complete({attempt_id:aid})).result,final.result);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('visited slot clocks/effects persist across back/forward/reload; unseen clocks and other sessions stay untouched',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query('UPDATE map_adventure_tools SET clue=5,secondchance=5,freezetime=5,skipreplace=5 WHERE user_id=$1',[uid]);
    let s=await start(nodeId,'gatekeeper'); const aid=s.attempt_id; const first=s.question.id;
    const unrelated=await start(nodeId,'sidequest');
    const otherBefore=(await rows('SELECT * FROM private.mapadventure_sessions WHERE attempt_id=$1',[unrelated.attempt_id]))[0];
    s=(await use(s,'clue')).session; s=(await use(s,'secondchance')).session;
    const retry=await rpc('answer',{attempt_id:aid,question_id:s.question.id,answer_payload:wrong(s.question)});
    assert.equal(retry.answer.retry,true); s=retry.session;
    const firstEffects=s.effects; assert.equal(firstEffects.first_answer,undefined);
    const firstDeadline=s.deadline_at;
    s=await navigate(s,'next'); const secondDeadline=s.deadline_at; assert.equal(s.index,1); assert.equal(s.answered,0);
    assert.deepEqual(s.effects,{});
    s=await navigate(s,'previous'); assert.equal(s.question.id,first); assert.equal(s.deadline_at,firstDeadline); assert.deepEqual(s.effects,firstEffects);
    s=await resume(s); assert.equal(s.deadline_at,firstDeadline); assert.deepEqual(s.effects,firstEffects);
    await assert.rejects(use(s,'clue'),/already used/); await assert.rejects(use(s,'secondchance'),/already used/);
    s=(await use(s,'freezetime')).session; assert.equal(Date.parse(s.deadline_at)-Date.parse(firstDeadline),30000);
    const frozen=s.deadline_at;
    const ledger=async()=>(await rows('SELECT question_ledger FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].question_ledger;
    assert.equal(Date.parse((await ledger())['0'].deadline_at),Date.parse(frozen));
    s=(await use(s,'skipreplace')).session; assert.notEqual(s.question.id,first); assert.equal(s.deadline_at,frozen); assert.equal(s.answered,0);
    assert.equal(s.effects.clue,undefined); assert.equal(s.effects.retried,undefined); assert.equal(s.effects.secondchance,undefined);
    s=await navigate(s,'next'); assert.equal(s.deadline_at,secondDeadline);
    s=await navigate(s,'previous'); s=await resume(s); assert.equal(s.deadline_at,frozen);
    await assert.rejects(use(s,'freezetime'),/already used/); await assert.rejects(use(s,'skipreplace'),/already used/);
    assert.equal((await ledger())['2'],undefined);
    // Owner ages the selected slot; navigation must expire the source once before leaving.
    await expire(s); s=await navigate(s,'next');
    // Navigation expires the selected source once before leaving, but never unrelated sessions.
    assert.equal(s.answered,1); assert.equal(s.index,1); assert.equal(s.deadline_at,secondDeadline);
    s=await navigate(s,'previous'); assert.equal(s.feedback.is_timeout,true); assert.equal(s.answered,1);
    const saved=(await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].records;
    for(let i=0;i<3;i++) await resume(s);
    assert.deepEqual((await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].records,saved);
    assert.deepEqual((await rows('SELECT * FROM private.mapadventure_sessions WHERE attempt_id=$1',[unrelated.attempt_id]))[0],otherBefore);
    assert.equal((await ledger())['2'],undefined);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('lazy expiry processes only explicitly selected slot once, never expires/submits attempt or starts unseen clocks',async()=>{
    await db.exec('BEGIN'); isolated=true;
    let a=await start(nodeId,'sidequest'); const b=await start(nodeId,'gatekeeper');
    const first=a; a=await navigate(a,'next'); const second=a;
    await expire(second);
    await expire(b);
    // Age the previous visited slot too, without selecting it.
    await db.query(`UPDATE private.mapadventure_sessions SET question_ledger=jsonb_set(question_ledger,'{0,deadline_at}',to_jsonb(clock_timestamp()-interval '10 days')) WHERE attempt_id=$1`,[a.attempt_id]);
    const before=await rows('SELECT attempt_id,records,question_ledger FROM private.mapadventure_sessions WHERE attempt_id=ANY($1::uuid[]) ORDER BY attempt_id',[[a.attempt_id,b.attempt_id]]);
    assert.equal((await rpc('bootstrap')).session,null);
    assert.deepEqual(await rows('SELECT attempt_id,records,question_ledger FROM private.mapadventure_sessions WHERE attempt_id=ANY($1::uuid[]) ORDER BY attempt_id',[[a.attempt_id,b.attempt_id]]),before);
    a=await resume(a); assert.equal(a.question.id,second.question.id); assert.equal(a.index,1); assert.equal(a.answered,1); assert.equal(a.feedback.is_timeout,true);
    assert.deepEqual(a.answer_payload,{});
    assert.equal((await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1',[b.attempt_id]))[0].records.length,0);
    let r=await rpc('timeout',{attempt_id:a.attempt_id,question_id:a.question.id}); assert.deepEqual(r.answer,a.feedback);
    a=await navigate(a,'previous'); assert.equal(a.question.id,first.question.id); assert.equal(a.answered,2); assert.equal(a.feedback.is_timeout,true);
    a=await navigate(a,'next'); assert.equal(a.answered,2);
    const ledger=(await rows('SELECT question_ledger FROM private.mapadventure_sessions WHERE attempt_id=$1',[a.attempt_id]))[0].question_ledger;
    assert.equal(ledger['2'],undefined); assert.equal(ledger['3'],undefined); assert.equal(ledger['4'],undefined);
    assert.equal(Number((await rows('SELECT count(*) n FROM exam_attempt_answers WHERE attempt_id=$1',[a.attempt_id]))[0].n),2);
    await assert.rejects(complete(a),/All questions/);
    const exams=await rows('SELECT attempt_status,deadline_at,submitted_at FROM exam_attempts WHERE id=ANY($1::uuid[])',[[a.attempt_id,b.attempt_id]]);
    assert.ok(exams.every(e=>e.attempt_status==='IN_PROGRESS' && e.deadline_at===null && e.submitted_at===null));
    assert.equal((await start(nodeId,'sidequest')).attempt_id,a.attempt_id);
    assert.equal((await resume(a)).answered,2);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('canonical redeploy replaces only known global index and preserves unfinished attempts/slot ledgers',async()=>{
    await db.exec('BEGIN'); isolated=true;
    let s=await start(nodeId,'gatekeeper'); s=await navigate(s,'next');
    const snapshot=async()=>({
      sessions:await rows('SELECT * FROM private.mapadventure_sessions ORDER BY attempt_id'),
      exams:await rows('SELECT * FROM exam_attempts ORDER BY id'),
      answers:await rows('SELECT * FROM exam_attempt_answers ORDER BY attempt_id,question_id'),
      nodes:await rows('SELECT * FROM map_adventure_topics ORDER BY id'),
    });
    const before=await snapshot();
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE; DROP INDEX private.mapadventure_active_node_stage; CREATE UNIQUE INDEX mapadventure_active_session ON private.mapadventure_sessions(user_id) WHERE result IS NULL');
    const redeploy=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
    await db.exec(redeploy); await db.exec(redeploy);
    assert.deepEqual(await snapshot(),before);
    assert.equal((await rows("SELECT to_regclass('private.mapadventure_active_session') id"))[0].id,null);
    const index=(await rows("SELECT indexdef FROM pg_indexes WHERE schemaname='private' AND indexname='mapadventure_active_node_stage'"))[0].indexdef;
    assert.match(index,/UNIQUE.*\(user_id, node_id, stage\).*result IS NULL/);
    assert.equal((await resume(s)).deadline_at,s.deadline_at);
    await db.exec('SET CONSTRAINTS ALL DEFERRED');
    const otherSession=await start(nodeId,'sidequest'); assert.notEqual(otherSession.attempt_id,s.attempt_id);
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
    const finished=(await rows('SELECT attempt_id FROM private.mapadventure_sessions WHERE user_id=$1 AND node_id=$2 AND stage=$3 AND result IS NOT NULL LIMIT 1',[uid,nodeId,'gatekeeper']))[0];
    await db.exec('SAVEPOINT duplicate_slot');
    await assert.rejects(db.query('UPDATE private.mapadventure_sessions SET result=NULL WHERE attempt_id=$1',[finished.attempt_id]),/mapadventure_active_node_stage/);
    await db.exec('ROLLBACK TO SAVEPOINT duplicate_slot; RELEASE SAVEPOINT duplicate_slot');
    // An unexpected historical name is not permission to drop an arbitrary index.
    await db.exec('CREATE INDEX mapadventure_active_session ON private.mapadventure_sessions(node_id); SAVEPOINT unsafe_index');
    await assert.rejects(db.exec(redeploy),/Unexpected mapadventure_active_session definition/);
    await db.exec('ROLLBACK TO SAVEPOINT unsafe_index; RELEASE SAVEPOINT unsafe_index');
    assert.ok((await rows("SELECT to_regclass('private.mapadventure_active_session') id"))[0].id);
    assert.equal((await resume(s)).deadline_at,s.deadline_at);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('balance conflict, incompatible wallet redeploy and insufficient purchase fail closed',async()=>{
    await db.exec('BEGIN');
    await db.exec(`UPDATE user_wallet SET points=0 WHERE user_id='${uid}'; UPDATE map_adventure_status SET points=0 WHERE user_id='${uid}'`);
    await assert.rejects(rpc('buy',{tool:'secondchance'}),/Insufficient points/);
    await db.exec('ROLLBACK');
    await db.exec(`UPDATE user_wallet SET points=points+1 WHERE user_id='${uid}'`);
    await assert.rejects(rpc('buy',{tool:'clue'}),/balance conflict/);
    await assert.rejects(db.exec(migration),/balance conflict/); await db.exec('ROLLBACK');
    await db.exec(`UPDATE user_wallet SET points=points-1 WHERE user_id='${uid}'; ALTER TABLE user_wallet ADD COLUMN coins integer`);
    await assert.rejects(db.exec(migration),/Incompatible user_wallet/); await db.exec('ROLLBACK');
    await db.exec('ALTER TABLE user_wallet DROP COLUMN coins'); await db.exec(migration);
  });
});
