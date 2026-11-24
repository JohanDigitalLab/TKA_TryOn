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
  const migration = await sql('migration-mapadventure.sql');
  await db.exec(migration); await db.exec(migration);
  await db.exec(await sql('migration_generic_exam_attempt.sql'));
  const user = id => db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  let isolated = false;
  t.afterEach(async () => { if(isolated) { await db.exec('ROLLBACK'); isolated=false; } });
  const rpc = async (a, p = {}) => {
    if (isolated) await db.exec('SAVEPOINT rpc_test');
    try {
      const data=(await db.query('SELECT public.mapadventure($1,$2::jsonb) data', [a, JSON.stringify(p)])).rows[0].data;
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
  const good = q => q.type === 'PGK_KATEGORI' ? { category_answers: { 1: ' benar ', 2: 'SALAH' } } : { option_codes: q.type === 'PGK_MA' ? ['C', 'B'] : ['B'] };
  const wrong = q => q.type === 'PGK_KATEGORI' ? { category_answers: { 1: 'Salah', 2: 'Benar' } } : { option_codes: ['A'] };
  const answer = (s, payload = good(s.question)) => rpc('answer', { attempt_id: s.attempt_id, question_id: s.question.id, answer_payload: payload });
  const complete = s => rpc('complete_node', { attempt_id: s.attempt_id });
  const finish = async (s, goodCount = s.total) => {
    while (s.question) { const r = await answer(s, s.index < goodCount ? good(s.question) : wrong(s.question)); s = r.session; }
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
    await assert.rejects(rpc('settings',{settings:{SUBJECT:'IPA'}}),/Finish active/);
    await assert.rejects(complete(s),/All questions/);
    await assert.rejects(answer(s,{option_codes:['Z']}));
    await assert.rejects(rpc('answer',{attempt_id:s.attempt_id,question_id:uid,answer_payload:good(s.question)}),/current frozen/);
    const aid=s.attempt_id; const r=await finish(s,2); assert.equal(r.result.correct,2); assert.equal(r.result.total,3); assert.equal(r.result.passed,false); assert.equal(r.result.stars,0); assert.equal(r.profile_xp,1); assert.equal(r.wallet.points,25);
    assert.equal(r.nodes[0].practice_status,'UNLOCKED'); assert.equal(r.nodes[0].sidequest_status,'LOCKED');
    assert.equal((await rows('SELECT practice_attempt_id FROM map_adventure_topics WHERE id=$1',[nodeId]))[0].practice_attempt_id,null);
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
    assert.equal((await rows('SELECT sidequest_attempt_id FROM map_adventure_topics WHERE id=$1',[nodeId]))[0].sidequest_attempt_id,null);
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
    await assert.rejects(start(nodeId,'gatekeeper'),/already completed/);
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
    assert.equal((await rpc('bootstrap')).session.attempt_id,s.attempt_id);
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
    while(s.question && s.question.type!=='PG_TUNGGAL') s=(await answer(s)).session;
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
    await db.query(`UPDATE map_adventure_topics SET ${stage}_status='UNLOCKED' WHERE id=$1`,[nodeId]);
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
    await db.query("UPDATE map_adventure_topics SET sidequest_status='UNLOCKED' WHERE id=$1",[nodeId]);
    let s=await start(nodeId,'sidequest');
    assert.ok(s.remaining_seconds>118 && s.remaining_seconds<=120); assert.equal(s.question.estimate_minutes,2);
    assert.equal((await rows('SELECT deadline_at FROM exam_attempts WHERE id=$1',[s.attempt_id]))[0].deadline_at,null);
    const timeout=s=>rpc('timeout',{attempt_id:s.attempt_id,question_id:s.question.id});
    await assert.rejects(timeout(s),/not expired/);
    await assert.rejects(rpc('timeout',{attempt_id:s.attempt_id}),/Missing session/);
    await assert.rejects(rpc('timeout',{attempt_id:s.attempt_id,question_id:s.question.id,timestamp:0}),/Unknown payload/);
    await assert.rejects(answer(s,{is_timeout:true}),/Unknown answer field/);
    const before=await rpc('bootstrap'); const old=s;
    // Owner manipulates the private clock; never wait for real fixture durations.
    await db.query('UPDATE private.mapadventure_sessions SET question_deadline_at=clock_timestamp() WHERE attempt_id=$1',[s.attempt_id]);
    const expired=(await rpc('bootstrap')).session; assert.equal(expired.question.id,s.question.id); assert.equal(expired.remaining_seconds,0);
    let r=await answer(s); assert.equal(r.answer.is_timeout,true); assert.equal(r.session.index,1);
    assert.ok(r.session.remaining_seconds>118); s=r.session;
    const stored=(await rows('SELECT answer_payload,is_timeout FROM exam_attempt_answers WHERE attempt_id=$1',[s.attempt_id]))[0];
    assert.deepEqual(stored,{answer_payload:{},is_timeout:true});
    const rec=(await rows('SELECT records FROM private.mapadventure_sessions WHERE attempt_id=$1',[s.attempt_id]))[0].records[0];
    assert.equal(rec.correct,false); assert.equal(rec.is_timeout,true);
    await assert.rejects(timeout(old),/current frozen/);
    await db.query("UPDATE private.mapadventure_sessions SET question_deadline_at=clock_timestamp()-interval '1 hour' WHERE attempt_id=$1",[s.attempt_id]);
    r=await timeout(s); assert.equal(r.answer.is_timeout,true); assert.equal(r.session.index,2); assert.ok(r.session.remaining_seconds>118);
    r=await finish(r.session); assert.equal(r.result.correct,3); assert.equal(r.result.passed,false);
    assert.deepEqual([r.result.xp,r.result.points,r.result.stars],[0,0,0]); assert.deepEqual(r.wallet,before.wallet); assert.equal(r.profile_xp,before.profile_xp);
    assert.deepEqual((await complete(s)).result,r.result);
    await db.exec('ROLLBACK'); isolated=false;
  });
  await t.test('timed tools atomic +30 once per slot, retry/replacement no reset, practice untimed, legacy resume',async()=>{
    await db.exec('BEGIN'); isolated=true;
    await db.query("UPDATE map_adventure_topics SET sidequest_status='UNLOCKED',practice_status='UNLOCKED' WHERE id=$1",[nodeId]);
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
    await db.query('UPDATE private.mapadventure_sessions SET question_deadline_at=clock_timestamp() WHERE attempt_id=$1',[aid]);
    r=await use(r.session,'freezetime'); assert.equal(r.answer.is_timeout,true); assert.equal(r.inventory.freezetime,3); assert.equal(r.session.index,1);
    // Simulate pre-timer active row/snapshot, deploy twice, initialize only on first resume.
    await db.query("UPDATE private.mapadventure_sessions SET question_deadline_at=NULL,pool=(SELECT jsonb_agg(x-'estimate_minutes') FROM jsonb_array_elements(pool) x) WHERE attempt_id=$1",[aid]);
    await db.exec('SET CONSTRAINTS ALL IMMEDIATE');
    const transactionalMigration=migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
    await db.exec(transactionalMigration); await db.exec(transactionalMigration);
    await db.exec('SET CONSTRAINTS ALL DEFERRED');
    assert.equal((await rows('SELECT question_deadline_at FROM private.mapadventure_sessions WHERE attempt_id=$1',[aid]))[0].question_deadline_at,null);
    s=(await rpc('bootstrap')).session; assert.ok(s.remaining_seconds>118); assert.equal(s.question.estimate_minutes,2);
    assert.equal((await rpc('bootstrap')).session.deadline_at,s.deadline_at);
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
    await db.query("UPDATE map_adventure_topics SET gatekeeper_status='UNLOCKED' WHERE id=$1",[nodeId]);
    await db.exec('UPDATE question_versions SET estimate_minutes=6');
    let s=await start(nodeId,'gatekeeper'); assert.ok(s.remaining_seconds>358 && s.remaining_seconds<=360);
    const deadline=s.deadline_at; const initial=await rpc('bootstrap');
    await db.exec('UPDATE question_versions SET estimate_minutes=1');
    s=(await rpc('bootstrap')).session; assert.equal(s.deadline_at,deadline); assert.equal(s.question.estimate_minutes,6);
    await db.exec(`UPDATE map_adventure_tools SET secondchance=5 WHERE user_id='${uid}'`);
    s=(await use(s,'secondchance')).session;
    while(s.question) {
      await db.query('UPDATE private.mapadventure_sessions SET question_deadline_at=clock_timestamp() WHERE attempt_id=$1',[s.attempt_id]);
      const r=await answer(s); assert.equal(r.answer.is_timeout,true); assert.equal(r.answer.retry,false);
      s=r.session; if(s.question) { assert.equal(s.question.estimate_minutes,6); assert.ok(s.remaining_seconds>358); }
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
