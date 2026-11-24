// Synthetic data only. auth.uid() is explicitly mocked by the offline harness.
const assert = require('node:assert/strict');
module.exports = async function exercise(db) {
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const teacher=id(1), student=id(2), school=id(3), question=id(4), version=id(5);
  const actor = async u => db.query("SELECT set_config('sandbox.actor',$1,false)",[u]);
  const rpc = async (name, args = []) => (await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
  await db.exec(`INSERT INTO auth.users(id,email_confirmed_at) VALUES ('${teacher}',now()),('${student}',now());
    INSERT INTO public.education_levels(id,name,grade) VALUES ('sd','Sandbox SD',6);
    INSERT INTO public.subjects(subject_code,name,education_level_id) VALUES ('SANDBOX','Sandbox Mathematics','sd');
    INSERT INTO public.profiles(id,full_name,education_level) VALUES ('${teacher}','Sandbox Teacher','sd'),('${student}','Sandbox Student','sd');
    INSERT INTO public.schools(id,name,created_by) VALUES ('${school}','Sandbox School','${teacher}');
    INSERT INTO public.school_memberships(school_id,user_id,role) VALUES ('${school}','${student}','student');
    INSERT INTO public.questions(id,question_code,education_level_id,grade,subject_code,subject_name,question_type,question_status)
      VALUES ('${question}','SANDBOX-Q','sd',6,'SANDBOX','Sandbox Mathematics','PG_TUNGGAL','PUBLISHED');
    INSERT INTO public.question_versions(id,question_id,version_number,question_text,explanation,version_status)
      VALUES ('${version}','${question}',1,'Synthetic question','Synthetic explanation','PUBLISHED');
    INSERT INTO public.question_options(question_version_id,option_code,option_text,option_order,is_correct)
      VALUES ('${version}','A','Correct',1,true),('${version}','B','Incorrect',2,false);
    INSERT INTO public.tka_configurations(tka_code,education_level,subject_code,total_questions,duration_minutes,type)
      VALUES ('SANDBOX-SET','SD','SANDBOX',1,1,'SET');
    INSERT INTO public.tka_question_set(tka_code,question_code) VALUES ('SANDBOX-SET','SANDBOX-Q');`);
  await actor(teacher);
  const capability = await rpc('school_advanced_capabilities',[school]);
  assert.equal(capability.capability_version,'school-advanced-sql/1');
  const now = Date.now();
  const created = await rpc('create_school_schedule',[school,'Sandbox agenda','SANDBOX-SET',new Date(now+600000).toISOString(),new Date(now+3600000).toISOString(),[student]]);
  const sid = created.schedule_id;
  assert.equal(created.status,'draft');
  assert.equal((await rpc('set_school_schedule_status',[sid,'published',1])).status,'published');
  await assert.rejects(rpc('set_school_schedule_status',[sid,'published',1]),/Invalid transition or stale revision/);
  await assert.rejects(db.query('UPDATE public.question_options SET option_text=$1 WHERE question_version_id=$2',['tamper',version]),/immutable/);
  await assert.rejects(db.query('DELETE FROM public.scheduled_tryout_users WHERE scheduled_tryouts=$1',[sid]),/frozen/);
  assert.equal((await rpc('get_school_schedule_participants',[sid])).total,1);
  await actor(student);
  assert.equal((await rpc('get_school_schedule_agenda',[school])).schedules.length,1);
  await assert.rejects(rpc('start_school_schedule',[sid]),/Agenda unavailable/);
  await assert.rejects(rpc('get_school_schedule_participants',[sid]),/42501|scope required/);
  // Separate active fixture: do not bypass the published-agenda freeze to move its clock.
  const active=id(6);
  await actor(teacher);
  await db.query(`INSERT INTO public.scheduled_tryouts(id,tryout_code,label,start_at,deadline_at,school_uid,tka_code1,agenda_status,agenda_created_by,agenda_revision,agenda_snapshot)
    SELECT $1,'SANDBOX-ACTIVE','Active fixture',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',school_uid,tka_code1,'draft',agenda_created_by,1,agenda_snapshot
    FROM public.scheduled_tryouts WHERE id=$2`,[active,sid]);
  await db.query('INSERT INTO public.scheduled_tryout_users(scheduled_tryouts,user_id) VALUES ($1,$2)',[active,student]);
  // Privileged synthetic fixture setup, not an RPC publish/parity claim.
  await db.query("UPDATE public.scheduled_tryouts SET agenda_status='published' WHERE id=$1",[active]);
  await actor(student);
  const started=await rpc('start_school_schedule',[active]);
  const attempt=started.attempt_id;
  assert.ok(attempt);
  assert.equal((await rpc('start_school_schedule',[active])).attempt_id,attempt);
  await assert.rejects(rpc('save_exam_answer',[attempt,question,{selected_option:'A'}]),/Jawaban tidak sesuai/);
  await rpc('save_exam_answer',[attempt,question,{option_codes:['A']}]);
  await rpc('resume_exam_attempt',[attempt]);
  await rpc('submit_exam_attempt',[attempt]);
  const stored=(await db.query('SELECT attempt_status,score FROM public.exam_attempts WHERE id=$1',[attempt])).rows[0];
  assert.equal(stored.attempt_status,'SUBMITTED');
  assert.equal(Number(stored.score),100);
  await actor(teacher);
  const classroom=id(7);
  await db.exec(`INSERT INTO public.school_types(id,name,education_level_id) VALUES ('SANDBOX-SD','Sandbox SD','sd');
    INSERT INTO public.classes(id,school_id,name,education_level_id,grade) VALUES ('${classroom}','${school}','Sandbox Class','sd',6);
    INSERT INTO public.student_academic_profiles(user_id,education_level_id,school_type_id,grade,school_id,class_id)
      VALUES ('${student}','sd','SANDBOX-SD',6,'${school}','${classroom}');`);
  await rpc('get_teacher_workspace',[school]);
  const assignment=await rpc('save_school_assignment',[school,classroom,'Sandbox assignment','Sandbox Mathematics',1,1,new Date(Date.now()-60000).toISOString(),new Date(Date.now()+3600000).toISOString()]);
  await rpc('set_school_assignment_status',[assignment,'published']);
  await actor(student);
  assert.equal((await rpc('get_student_assignments')).length,1);
  const task=await rpc('start_school_assignment',[assignment]);
  assert.ok(task.attempt_id);
  await rpc('resume_exam_attempt',[task.attempt_id]);
  await rpc('save_exam_answer',[task.attempt_id,question,{option_codes:['A']}]);
  await rpc('submit_exam_attempt',[task.attempt_id]);
  await actor(teacher);
  assert.equal(Number((await rpc('get_school_assignment_ranking',[assignment]))[0].score),100);
  await actor('');
  await assert.rejects(rpc('school_advanced_capabilities',[school]),/Active verified account required/);
  return { scenario:'synthetic agenda and assignment create/publish/list/start/resume/save/submit/ranking, stale revision, content/cohort freeze, early start and mock-actor denials', stored };
};
