// Offline only: no environment, database, network, or changes to review artifacts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replaceAll('\r\n', '\n');
const hash = (s, algorithm = 'sha256') => crypto.createHash(algorithm).update(s).digest('hex');
const pin = 'bf6c2bc274e7def1432142c528fc800243feff4775ae245e80471ff23f99356f';
const quote = s => "'" + s.replaceAll("'", "''") + "'";
function definitions(sql) {
 return [...sql.matchAll(/CREATE OR REPLACE FUNCTION ([\w.]+)\([\s\S]*?AS (\$\w+\$)[\s\S]*?\2;/g)].map(m => ({ name: m[1], sql: m[0], tag: m[2] }));
}
function replaceOnce(sql, from, to) {
 if (sql.split(from).length !== 2) throw Error('Source drift: ' + from);
 return sql.replace(from, to);
}
function build() {
 const raw = fs.readFileSync(path.join(root, '.local/database/addendum-02-db.json'));
 if (hash(raw) !== pin) throw Error('Snapshot drift: human review required');
 const snapshot = JSON.parse(raw);
 const blockers = read('docs/database/migration-school-advanced-blockers.sql');
 const agenda = read('docs/database/migration-school-advanced-agenda.sql');
 const canonical = new Map();
 for (const f of [...definitions(blockers), ...definitions(agenda)]) canonical.set(f.name, f);
 // Concrete legacy bugs: required type omitted; automatic history expiration.
 let legacy = canonical.get('private.learning_legacy_start').sql;
 const expiration = legacy.slice(legacy.indexOf('    -- 5. Tutup attempt'), legacy.indexOf('    -- 6. Cari sesi'));
 if (!expiration.includes("SET attempt_status = 'EXPIRED'")) throw Error('Legacy expiration drift');
 legacy = replaceOnce(legacy, expiration, '    -- Preserve historical attempts; never expire another session automatically.\n');
 legacy = replaceOnce(legacy, '            duration_minutes\n        )', '            duration_minutes,\n            attempt_type\n        )');
 legacy = replaceOnce(legacy, '            p_duration_minutes\n        )', "            p_duration_minutes,\n            'TRYOUT'\n        )");
 canonical.get('private.learning_legacy_start').sql = legacy;
 const schema = blockers.slice(blockers.indexOf('-- NOT VALID:'), blockers.indexOf('-- Otoritas:'));
 const agendaSchema = agenda.slice(agenda.indexOf('-- Nullable columns'), agenda.indexOf('-- Conservative transaction'));
 const triggers = agenda.slice(agenda.indexOf('CREATE TRIGGER school_agenda_freeze'), agenda.indexOf('-- Snapshot-derived'))
   .replace(/CREATE OR REPLACE FUNCTION private\.school_agenda_content_freeze\(\)[\s\S]*?END \$f\$;/, '')
   .replace(/^REVOKE[^\n]*\n/gm, '');
 const acl = new Map();
 for (const sql of [blockers, agenda]) for (const m of sql.matchAll(/(REVOKE ALL|GRANT EXECUTE) ON FUNCTION ([^;]+);/g)) acl.set(m[0], m[0]);
 const signatures = new Map();
 for (const statement of acl.values()) {
  const m = statement.match(/ON FUNCTION ([\w.]+)(\([^;]*?\)) (?:FROM|TO)/);
  if (canonical.has(m[1])) signatures.set(m[1], m[1] + m[2]);
 }
 for (const name of canonical.keys()) if (!signatures.has(name)) throw Error('Missing ACL signature: ' + name);
 const existingNames = new Set([...canonical.keys(), 'private.school_actor', 'private.school_require', 'private.has_school_role',
  'private.exam_answer_payload_is_valid', 'private.exam_answer_is_correct', 'private.load_student_exercise',
  'public.learning_access_context', 'public.start_school_assignment', 'public.resume_exam_attempt',
  'public.xget_teacher_workspace', 'public.xsave_school_assignment', 'public.xset_school_assignment_status', 'public.xget_school_assignment_ranking']);
 for (const name of ['create_school_student','update_school_student','set_school_operator','reset_school_student_password',
  'update_school_profile','update_student_profile','xschool_admin_mutate','xschool_invite_request','xschool_coordinator_transfer']) existingNames.add('public.' + name);
 // Pin transitive underlying implementations, not only the visible RPC signatures.
 let changed = true;
 while (changed) {
  changed = false;
  for (const f of snapshot.sets.functions.filter(f => existingNames.has(f.schema_name + '.' + f.proname))) {
   for (const dependency of f.definition.matchAll(/\b(public|private)\.([a-z_]+)\s*\(/g)) {
    const name = dependency[1] + '.' + dependency[2];
    if (!existingNames.has(name)) { existingNames.add(name); changed = true; }
   }
  }
 }
 const existing = snapshot.sets.functions.filter(f => existingNames.has(f.schema_name + '.' + f.proname));
 const fullSig = f => f.signature.startsWith(f.schema_name + '.') ? f.signature : f.schema_name + '.' + f.signature;
 const rows = existing.map(f => `(${quote(fullSig(f))},${quote(hash(f.definition, 'md5'))},${quote(f.arguments)},${quote(f.result)},${f.security_definer},${f.anon_execute},${f.authenticated_execute})`).join(',\n');
 const tables = ['schools','profiles','classes','school_memberships','student_academic_profiles','school_assignments','school_assignment_questions','school_assignment_recipients','scheduled_tryouts','scheduled_tryout_users','exam_attempts','exam_attempt_questions','exam_attempt_answers','tka_configurations','tka_question_set','questions','question_versions','question_options','question_category_items','question_stimuli'];
 const tableRows = tables.map(t => `('public.${t}')`).join(',');
 const privilegeRows = snapshot.sets.privileges.filter(p => tables.includes(p.table_name)).map(p =>
  `(${quote(p.rolname)},${quote('public.' + p.table_name)},${p.can_select},${p.can_insert},${p.can_update},${p.can_delete},${p.can_truncate})`).join(',\n');
 const privilegeCheck = `DO $table_acl$\nDECLARE r record;\nBEGIN\n FOR r IN SELECT * FROM (VALUES ${privilegeRows}) e(role_name,relation,sel,ins,upd,del,trunc) LOOP\n  IF has_table_privilege(r.role_name,r.relation,'SELECT') IS DISTINCT FROM r.sel\n  OR has_table_privilege(r.role_name,r.relation,'INSERT') IS DISTINCT FROM r.ins\n  OR has_table_privilege(r.role_name,r.relation,'UPDATE') IS DISTINCT FROM r.upd\n  OR has_table_privilege(r.role_name,r.relation,'DELETE') IS DISTINCT FROM r.del\n  OR has_table_privilege(r.role_name,r.relation,'TRUNCATE') IS DISTINCT FROM r.trunc\n  THEN RAISE EXCEPTION 'HOLD: table ACL drift % %',r.role_name,r.relation; END IF;\n END LOOP;\nEND $table_acl$;\n`;
 const header = `-- Generated offline by scripts/build-school-advanced-deployment.cjs. Do not edit generated bodies.\n-- Snapshot ${snapshot.capturedAt}; SHA256 ${pin}. Not a live-backend claim.\n-- STAGING FIRST. Production only after staging evidence + separate human approval.\nBEGIN;\nSET LOCAL search_path = pg_catalog;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n-- HUMAN APPROVAL EDIT ZONE: change false to true ONLY after documented review.\nSET LOCAL school_deploy.human_approved = 'false';\nSET LOCAL school_deploy.mapping_approved = 'false';\nSET LOCAL school_deploy.affiliation_writers_approved = 'false';\nDO $approval$\nBEGIN\n IF current_setting('school_deploy.human_approved',true) IS DISTINCT FROM 'true'\n OR current_setting('school_deploy.mapping_approved',true) IS DISTINCT FROM 'true'\n OR current_setting('school_deploy.affiliation_writers_approved',true) IS DISTINCT FROM 'true'\n THEN RAISE EXCEPTION 'HOLD: human approval, schools.id mapping and affiliation writer review required'; END IF;\nEND $approval$;\n-- Reconcile both review gates only inside this approved transaction.\nSET LOCAL school_blockers.school_uid_reference = 'schools.id';\nSET LOCAL school_advanced.school_uid_reference = 'schools.id';\nSET LOCAL school_advanced.affiliation_writers_reviewed = 'approved';\nSELECT pg_advisory_xact_lock(hashtextextended('school:blockers:migration:v1',0));\nSELECT pg_advisory_xact_lock(hashtextextended('school:advanced:agenda:v1',0));\nLOCK TABLE ${tables.map(t => 'public.' + t).join(', ')}, auth.users IN SHARE ROW EXCLUSIVE MODE;\nDO $baseline$\nDECLARE r record; f oid;\nBEGIN\n FOR r IN SELECT * FROM (VALUES\n${rows}\n ) expected(signature,definition_md5,arguments,result,definer,anon_exec,authenticated_exec) LOOP\n  f:=to_regprocedure(r.signature);\n  IF f IS NULL THEN RAISE EXCEPTION 'HOLD: missing dependency %',r.signature; END IF;\n  IF md5(pg_get_functiondef(f)) IS DISTINCT FROM r.definition_md5\n  OR pg_get_function_arguments(f) IS DISTINCT FROM r.arguments\n  OR pg_get_function_result(f) IS DISTINCT FROM r.result\n  OR (SELECT prosecdef FROM pg_proc WHERE oid=f) IS DISTINCT FROM r.definer\n  OR has_function_privilege('anon',f,'EXECUTE') IS DISTINCT FROM r.anon_exec\n  OR has_function_privilege('authenticated',f,'EXECUTE') IS DISTINCT FROM r.authenticated_exec\n  THEN RAISE EXCEPTION 'HOLD: dependency definition/signature/ACL drift %',r.signature; END IF;\n END LOOP;\n FOR r IN SELECT * FROM (VALUES ${tableRows}) expected(relation) LOOP\n  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass(r.relation) AND relrowsecurity)\n  THEN RAISE EXCEPTION 'HOLD: missing relation or RLS drift %',r.relation; END IF;\n END LOOP;\n IF EXISTS(SELECT 1 FROM public.scheduled_tryouts t JOIN public.profiles p ON p.id=t.school_uid WHERE p.account_type='SCHOOL')\n THEN RAISE EXCEPTION 'HOLD: ambiguous school ID/account UID profile collision'; END IF;\n IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.scheduled_tryouts'::regclass AND attname='agenda_status' AND NOT attisdropped)\n THEN RAISE EXCEPTION 'HOLD: non-idempotent deployment already installed or partial drift'; END IF;\nEND $baseline$;\n`;
 const columnRows = snapshot.sets.columnPrivileges.filter(p => tables.includes(p.table_name)).map(p =>
  `(${quote(p.rolname)},${quote('public.' + p.table_name)},${quote(p.column_name)},${p.can_insert},${p.can_update})`).join(',\n');
 const absentRows = [...canonical.keys()].filter(name => !snapshot.sets.functions.some(f => f.schema_name + '.' + f.proname === name))
  .map(name => `(${quote(name.split('.')[0])},${quote(name.split('.')[1])})`).join(',');
 const absentCheck = `DO $absent$\nBEGIN\n IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace\n JOIN (VALUES ${absentRows}) e(schema_name,name) ON e.schema_name=n.nspname AND e.name=p.proname)\n THEN RAISE EXCEPTION 'HOLD: unexpected new function already exists; partial installation or catalog drift'; END IF;\nEND $absent$;\n`;
 const columnCheck = `DO $column_acl$\nDECLARE r record;\nBEGIN\n FOR r IN SELECT * FROM (VALUES ${columnRows}) e(role_name,relation,col,ins,upd) LOOP\n  IF has_column_privilege(r.role_name,r.relation,r.col,'INSERT') IS DISTINCT FROM r.ins\n  OR has_column_privilege(r.role_name,r.relation,r.col,'UPDATE') IS DISTINCT FROM r.upd\n  THEN RAISE EXCEPTION 'HOLD: column ACL drift % % %',r.role_name,r.relation,r.col; END IF;\n END LOOP;\n IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_classes_id_school_id_unique') AND indisunique AND indisvalid)\n OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.uq_exam_attempts_active_user_grade_subject') AND indisunique AND indisvalid)\n THEN RAISE EXCEPTION 'HOLD: required unique index missing or invalid'; END IF;\nEND $column_acl$;\n` + absentCheck;
 const preflight = blockers.slice(blockers.indexOf('DO $preflight$'), blockers.indexOf('-- NOT VALID:'));
 const dependencyGate = agenda.slice(agenda.indexOf('DO $gate$'), agenda.indexOf('-- Nullable columns'));
 // Dependency gate must run after blocker constraints/helpers, not before them.
 const blockerOnly = [...canonical.values()].filter(f => !definitions(agenda).some(a => a.name === f.name));
 const rest = [...canonical.values()].filter(f => !blockerOnly.includes(f));
 const sql = header + privilegeCheck + columnCheck + preflight + schema + blockerOnly.map(f => f.sql).join('\n\n') + '\n' + dependencyGate + agendaSchema + rest.map(f => f.sql).join('\n\n') + '\n' + triggers + '\n' + [...acl.values()].join('\n') + '\nCOMMIT;\n';
 const constraintChecks = [
  ['public.scheduled_tryouts','school_blockers_schedule_school_fk','f','school_uid','public.schools','id',false],
  ['public.scheduled_tryout_users','school_blockers_schedule_recipient_unique','u','scheduled_tryouts,user_id',null,null,true],
  ['public.scheduled_tryout_users','school_blockers_recipient_schedule_fk','f','scheduled_tryouts','public.scheduled_tryouts','id',false],
  ['public.scheduled_tryout_users','school_blockers_recipient_user_fk','f','user_id','auth.users','id',false],
  ['public.school_assignments','school_blockers_assignment_class_school_fk','f','class_id,school_id','public.classes','id,school_id',false],
  ['public.profiles','school_blockers_profile_school_fk','f','school_id','public.schools','id',false],
  ['public.exam_attempts','school_agenda_one_attempt','u','scheduled_tryout_id,user_id',null,null,true],
  ['public.exam_attempts','school_agenda_participant_fk','f','scheduled_tryout_id,user_id','public.scheduled_tryout_users','scheduled_tryouts,user_id',false],
  ['public.exam_attempts','school_agenda_attempt_type','c','scheduled_tryout_id,attempt_type,tka_code,deadline_at',null,null,false],
 ];
 const constraintRows = constraintChecks.map(row => '(' + row.map(v => v === null ? 'NULL' : typeof v === 'boolean' ? String(v) : quote(v)).join(',') + ')').join(',\n');
 const extraVerification = `\n-- Structural checks: exact local/referenced keys, validation state, no cascading FK actions.\nWITH expected(relation,name,kind,keys,target,target_keys,validated) AS (VALUES ${constraintRows})\nSELECT e.name,coalesce(c.contype::text=e.kind AND c.convalidated=e.validated\n AND (e.kind='c' OR (SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num)=e.keys)\n AND (e.kind<>'f' OR (c.confrelid=to_regclass(e.target) AND c.confupdtype='a' AND c.confdeltype='a'\n AND (SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)=e.target_keys)),false) AS ok,\n pg_get_constraintdef(c.oid) AS definition\nFROM expected e LEFT JOIN pg_constraint c ON c.conrelid=to_regclass(e.relation) AND c.conname=e.name;\nWITH expected(role_name,relation,sel,ins,upd,del,trunc) AS (VALUES ${privilegeRows})\nSELECT e.role_name,e.relation,has_table_privilege(e.role_name,e.relation,'SELECT')=e.sel\n AND has_table_privilege(e.role_name,e.relation,'INSERT')=e.ins\n AND has_table_privilege(e.role_name,e.relation,'UPDATE')=e.upd\n AND has_table_privilege(e.role_name,e.relation,'DELETE')=e.del\n AND has_table_privilege(e.role_name,e.relation,'TRUNCATE')=e.trunc AS ok FROM expected e;\n-- Trigger coverage must produce seven true rows.\nWITH expected(relation,name,helper) AS (VALUES\n ('public.scheduled_tryouts','school_agenda_freeze','private.school_agenda_freeze()'),\n ('public.scheduled_tryout_users','school_agenda_cohort_freeze','private.school_agenda_freeze()'),\n ${['questions','question_versions','question_options','question_category_items','question_stimuli'].map(t => `('public.${t}','school_agenda_content_freeze','private.school_agenda_content_freeze()')`).join(',\n')})\nSELECT e.relation,e.name,coalesce(t.tgenabled='O' AND t.tgfoid=to_regprocedure(e.helper),false) AS ok\nFROM expected e LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass(e.relation) AND t.tgname=e.name;\n`;
 const functionRows = [...canonical.values()].map(f => {
  const body = f.sql.split(f.tag)[1];
  return `(${quote(signatures.get(f.name))},${quote(hash(body, 'md5'))},${f.name.startsWith('public.')})`;
 }).join(',\n');
 const constraintNames = [...(schema + agendaSchema).matchAll(/ADD CONSTRAINT (\w+)/g)].map(m => m[1]);
 const verification = `-- Read-only catalog checks, caller privileges only (security invoker; no function installed).\n-- Run manually AFTER successful install. Every ok must be true. No auth spoofing.\nBEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\nWITH expected(signature,body_md5,authenticated_exec) AS (VALUES\n${functionRows}\n)\nSELECT e.signature, p.oid IS NOT NULL AND p.prosecdef\n AND p.proconfig @> ARRAY['search_path=pg_catalog']\n AND md5(p.prosrc)=e.body_md5\n AND NOT has_function_privilege('anon',p.oid,'EXECUTE')\n AND has_function_privilege('authenticated',p.oid,'EXECUTE')=e.authenticated_exec\n AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS ok,\n pg_get_function_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result,pg_get_userbyid(p.proowner) AS owner\nFROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);\nSELECT c.conname,c.convalidated,pg_get_constraintdef(c.oid) AS definition\nFROM pg_constraint c WHERE c.conname IN (${constraintNames.map(quote).join(',')}) ORDER BY c.conname;\n-- Expect ${constraintNames.length} named constraints; five blocker FKs + two agenda checks/FKs remain NOT VALID.\nWITH expected(relation) AS (VALUES ${tableRows})\nSELECT e.relation,coalesce(c.relrowsecurity,false) AS ok,c.relforcerowsecurity,\n has_table_privilege('anon',c.oid,'SELECT') AS anon_select,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select\nFROM expected e LEFT JOIN pg_class c ON c.oid=to_regclass(e.relation);\nSELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies\nWHERE schemaname='public' AND tablename IN (${tables.map(quote).join(',')}) ORDER BY tablename,policyname;\nSELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition\nFROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace\nWHERE NOT t.tgisinternal AND t.tgname LIKE 'school_agenda_%' ORDER BY c.relname,t.tgname;\n-- Existing dispatchers/ACL remain pinned by deployment preflight; x aliases must remain closed.\nSELECT p.oid::regprocedure AS signature,NOT has_function_privilege('anon',p.oid,'EXECUTE')\n AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace\nWHERE n.nspname='public' AND p.proname IN ('xget_teacher_workspace','xsave_school_assignment','xset_school_assignment_status','xget_school_assignment_ranking');\nCOMMIT;\n`;
 const inlineConstraints = `\n-- Include inline agenda status/creator/attempt FK constraints and preserved existing constraints.\nSELECT c.conrelid::regclass AS relation,c.conname,c.convalidated,pg_get_constraintdef(c.oid) AS definition\nFROM pg_constraint c WHERE c.conrelid IN ('public.scheduled_tryouts'::regclass,'public.exam_attempts'::regclass) ORDER BY c.conrelid,c.conname;\n`;
 return { sql, verification: verification.replace('COMMIT;\n', extraVerification + inlineConstraints + 'COMMIT;\n') };
}
if (require.main === module) {
 const result = build();
 const artifacts = [['docs/database/deploy-school-advanced.sql', result.sql], ['docs/database/verify-school-advanced.sql', result.verification]];
 for (const [file, content] of artifacts) {
  if (process.argv.includes('--check')) { if (fs.readFileSync(path.join(root, file), 'utf8') !== content) throw Error('Generated artifact drift: ' + file); }
  else fs.writeFileSync(path.join(root, file), content);
 }
 console.log('PASS: offline school deployment artifacts ' + (process.argv.includes('--check') ? 'byte-identical' : 'generated') + '; no SQL executed.');
}
module.exports = { build, definitions };
