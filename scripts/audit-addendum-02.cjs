// Read-only catalog + aggregate audit. Never invokes application RPCs or migrations.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const scratch = path.join(root, '.local/database');
const envFile = (name) => fs.existsSync(path.join(root, name)) ? parseEnv(fs.readFileSync(path.join(root, name), 'utf8')) : {};
const queries = {
  session: `SELECT current_setting('transaction_read_only') read_only, current_setting('transaction_isolation') isolation, s.ssl,s.version tls_version,s.cipher FROM pg_stat_ssl s WHERE s.pid=pg_backend_pid()`,
  tables: `SELECT n.nspname schema_name,c.relname table_name,c.relkind,c.relrowsecurity rls,c.relforcerowsecurity force_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m') ORDER BY 1,2`,
  columns: `SELECT n.nspname schema_name,c.relname table_name,a.attnum ordinal,a.attname column_name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_expression,a.attidentity identity,a.attgenerated generated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2,3`,
  constraints: `SELECT n.nspname schema_name,c.relname table_name,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid,true) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') ORDER BY 1,2,3`,
  enums: `SELECT n.nspname schema_name,t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname IN ('public','private') ORDER BY 1,2,4`,
  indexes: `SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','private') ORDER BY 1,2,3`,
  policies: `SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','private') ORDER BY 1,2,3`,
  functions: `SELECT n.nspname schema_name,p.proname,p.oid::regprocedure::text signature,pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,p.prosecdef security_definer,p.provolatile volatility,p.proconfig settings,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f' ORDER BY 1,3`,
  triggers: `SELECT n.nspname schema_name,c.relname table_name,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND NOT t.tgisinternal ORDER BY 1,2,3`,
  privileges: `SELECT r.rolname,c.relname table_name,has_table_privilege(r.oid,c.oid,'SELECT') can_select,has_table_privilege(r.oid,c.oid,'INSERT') can_insert,has_table_privilege(r.oid,c.oid,'UPDATE') can_update,has_table_privilege(r.oid,c.oid,'DELETE') can_delete,has_table_privilege(r.oid,c.oid,'TRUNCATE') can_truncate FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public' AND c.relkind IN ('r','p') ORDER BY 2,1`,
  columnPrivileges: `SELECT r.rolname,c.relname table_name,a.attname column_name,has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') can_insert,has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') can_update FROM pg_roles r CROSS JOIN pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY 2,3,1`,
  defaults: `SELECT d.defaclrole::regrole::text owner,n.nspname schema_name,d.defaclobjtype,d.defaclacl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace`
};
(async () => {
  let client;
  try {
    assert.equal(process.argv.length, 2, 'No arguments accepted');
    const db = { ...envFile('.env.database.local'), ...process.env };
    const app = { ...envFile('.env.local'), ...process.env };
    const test = envFile('.env.test.local');
    for (const key of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD','DB_SSL_CA_PATH']) assert(db[key], 'Missing database configuration');
    const url = new URL(app.NEXT_PUBLIC_SUPABASE_URL);
    const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    assert(url.protocol === 'https:' && match, 'Managed HTTPS project required');
    const ref = match[1];
    assert(db.DB_HOST === `db.${ref}.supabase.co` || (db.DB_HOST.endsWith('.pooler.supabase.com') && db.DB_USER.endsWith(`.${ref}`)), 'Project mismatch');
    if (db.DB_EXPECTED_PROJECT_REF) assert.equal(db.DB_EXPECTED_PROJECT_REF, ref, 'Expected project mismatch');
    const testProjectMatched = test.NEXT_PUBLIC_SUPABASE_URL ? new URL(test.NEXT_PUBLIC_SUPABASE_URL).hostname === url.hostname : null;
    client = new Client({ host:db.DB_HOST,port:Number(db.DB_PORT || 5432),database:db.DB_NAME,user:db.DB_USER,password:db.DB_PASSWORD,
      ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,db.DB_SSL_CA_PATH),'utf8')},connectionTimeoutMillis:15000,application_name:'addendum-02-readonly-audit' });
    client.on('notice', () => {});
    await client.connect();
    assert.equal(client.connection.stream.authorized, true, 'TLS verification failed');
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
    const output = {capturedAt:new Date().toISOString(),tlsVerified:true,projectIdentityMatched:true,testProjectMatched,sets:{},queries};
    const select = async (name, sql) => {
      // SQL comes exclusively from the fixed maps below; READ ONLY is the DB guard.
      assert(/^\s*(SELECT|WITH)\b/i.test(sql), 'Only fixed read queries accepted');
      output.sets[name] = (await client.query(sql)).rows;
      console.log(JSON.stringify({set:name,rows:output.sets[name].length}));
    };
    for (const [name,sql] of Object.entries(queries)) await select(name,sql);
    // Fixed aggregate queries only; no user rows, question text, keys, or review notes.
    const aggregates = {
      seeds: `SELECT 'education_levels' dataset,jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id) values FROM public.education_levels UNION ALL SELECT 'school_types',jsonb_agg(jsonb_build_object('id',id,'name',name,'education_level_id',education_level_id) ORDER BY id) FROM public.school_types UNION ALL SELECT 'subjects',jsonb_agg(jsonb_build_object('id',id,'name',name,'education_level_id',education_level_id,'is_active',is_active) ORDER BY id) FROM public.subjects`,
      inventory: `WITH targets(grade,subject_name) AS (VALUES (6,'Bahasa Indonesia'),(6,'Matematika'),(9,'Bahasa Indonesia'),(9,'Matematika')), current_versions AS (SELECT v.*,EXISTS(SELECT 1 FROM public.question_reviews r WHERE r.question_id=v.question_id AND r.question_version_id=v.id) any_review,EXISTS(SELECT 1 FROM public.question_reviews r WHERE r.question_id=v.question_id AND r.question_version_id=v.id AND r.review_action='APPROVE') approval_record FROM public.question_versions v WHERE v.is_current) SELECT t.grade,t.subject_name,count(DISTINCT q.id)::int unique_questions,count(DISTINCT q.id) FILTER(WHERE v.id IS NOT NULL)::int with_current,count(DISTINCT q.id) FILTER(WHERE q.question_status='PUBLISHED')::int question_published,count(DISTINCT q.id) FILTER(WHERE q.question_status='PUBLISHED' AND v.version_status='PUBLISHED')::int current_published,count(DISTINCT q.id) FILTER(WHERE v.any_review)::int current_any_review_record,count(DISTINCT q.id) FILTER(WHERE v.approval_record)::int current_approval_record,count(DISTINCT q.id) FILTER(WHERE q.question_status='PUBLISHED' AND v.version_status='PUBLISHED' AND v.approval_record)::int published_current_approval_record,count(DISTINCT v.content_hash) FILTER(WHERE q.question_status='PUBLISHED' AND v.version_status='PUBLISHED' AND v.content_hash IS NOT NULL)::int distinct_published_nonnull_hashes,100 target FROM targets t LEFT JOIN public.questions q ON q.grade=t.grade AND q.subject_name=t.subject_name LEFT JOIN current_versions v ON v.question_id=q.id GROUP BY t.grade,t.subject_name ORDER BY 1,2`,
      inventoryStatuses: `SELECT q.education_level_id,q.grade,q.subject_name,q.question_type,q.question_status,q.source_type,v.version_status,v.is_current,count(*)::int version_rows,count(DISTINCT q.id)::int unique_questions FROM public.questions q LEFT JOIN public.question_versions v ON v.question_id=q.id GROUP BY 1,2,3,4,5,6,7,8 ORDER BY 1,2,3,4,5,6,7,8`,
      reviewAggregates: `SELECT review_action,count(*)::int records,count(DISTINCT question_id)::int unique_questions,count(DISTINCT question_version_id)::int unique_versions,count(DISTINCT reviewer_id)::int distinct_reviewer_accounts,count(*) FILTER(WHERE reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)::int attributed_records FROM public.question_reviews GROUP BY 1 ORDER BY 1`,
      inventoryIntegrity: `SELECT (SELECT count(*)::int FROM public.questions) all_questions,(SELECT count(*)::int FROM public.question_versions) all_versions,(SELECT count(*)::int FROM public.questions q WHERE NOT EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.is_current)) missing_current,(SELECT count(*)::int FROM (SELECT question_id FROM public.question_versions WHERE is_current GROUP BY question_id HAVING count(*)>1) x) multiple_current,(SELECT count(*)::int FROM (SELECT content_hash FROM public.question_versions WHERE is_current AND content_hash IS NOT NULL GROUP BY content_hash HAVING count(*)>1) x) duplicate_current_hash_groups,(SELECT count(*)::int FROM public.question_versions WHERE is_current AND content_hash IS NULL) current_missing_hash,(SELECT count(*)::int FROM public.question_reviews r JOIN public.question_versions v ON v.id=r.question_version_id WHERE v.question_id<>r.question_id) review_pair_mismatch`,
      duplicateHashSummary: `WITH hashes AS (SELECT v.content_hash,count(*) n,count(DISTINCT q.grade) grades,count(DISTINCT q.subject_name) subjects FROM public.question_versions v JOIN public.questions q ON q.id=v.question_id WHERE v.is_current AND v.content_hash IS NOT NULL GROUP BY v.content_hash) SELECT count(*)::int distinct_current_hashes,count(*) FILTER(WHERE n>1)::int duplicate_groups,COALESCE(sum(n) FILTER(WHERE n>1),0)::int rows_in_duplicate_groups,count(*) FILTER(WHERE n>1 AND grades>1)::int cross_grade_groups,count(*) FILTER(WHERE n>1 AND subjects>1)::int cross_subject_groups FROM hashes`,
      dimensionCoverage: `SELECT q.grade,q.subject_name,count(*)::int current_questions,count(*) FILTER(WHERE NULLIF(btrim(q.element),'') IS NOT NULL)::int element_present,count(*) FILTER(WHERE NULLIF(btrim(q.material),'') IS NOT NULL)::int material_present,count(*) FILTER(WHERE NULLIF(btrim(q.sub_material),'') IS NOT NULL)::int sub_material_present,count(*) FILTER(WHERE NULLIF(btrim(q.competency),'') IS NOT NULL)::int competency_present,count(*) FILTER(WHERE NULLIF(btrim(q.indicator),'') IS NOT NULL)::int indicator_present,count(*) FILTER(WHERE q.cognitive_level IS NOT NULL)::int cognitive_present FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id AND v.is_current WHERE q.grade IN(6,9) AND q.subject_name IN('Bahasa Indonesia','Matematika') GROUP BY 1,2 ORDER BY 1,2`,
      profiles: `SELECT count(*)::int total,count(*) FILTER(WHERE account_status='active')::int active,count(*) FILTER(WHERE education_level IS NOT NULL)::int education_level_present,count(*) FILTER(WHERE education_level_locked_at IS NOT NULL)::int education_level_locked,count(*) FILTER(WHERE profile_completed_at IS NOT NULL)::int completion_marker_present,count(*) FILTER(WHERE NULLIF(btrim(full_name),'') IS NOT NULL)::int name_present FROM public.profiles`,
      profileLevels: `SELECT education_level,account_status,count(*)::int profiles FROM public.profiles GROUP BY 1,2 ORDER BY 1,2`,
      schoolAggregates: `SELECT 'schools' dataset,count(*)::int records FROM public.schools UNION ALL SELECT 'classes',count(*)::int FROM public.classes UNION ALL SELECT 'school_memberships',count(*)::int FROM public.school_memberships UNION ALL SELECT 'school_invites',count(*)::int FROM public.school_invites UNION ALL SELECT 'student_academic_profiles',count(*)::int FROM public.student_academic_profiles UNION ALL SELECT 'school_assignments',count(*)::int FROM public.school_assignments UNION ALL SELECT 'school_assignment_questions',count(*)::int FROM public.school_assignment_questions UNION ALL SELECT 'school_assignment_recipients',count(*)::int FROM public.school_assignment_recipients`,
      academicReadiness: `SELECT count(*)::int total,count(*) FILTER(WHERE school_id IS NOT NULL)::int school_linked,count(*) FILTER(WHERE class_id IS NOT NULL)::int class_linked,count(*) FILTER(WHERE grade IN(6,9))::int target_grade_profiles FROM public.student_academic_profiles`,
      questionWorkflow: `SELECT q.question_status,v.version_status,count(DISTINCT q.id)::int unique_questions FROM public.questions q LEFT JOIN public.question_versions v ON v.question_id=q.id AND v.is_current GROUP BY 1,2 ORDER BY 1,2`
    };
    output.aggregateQueries = aggregates;
    for (const [name,sql] of Object.entries(aggregates)) await select(name,sql);
    // Detect contact columns from metadata, then return coverage counts only.
    for (const table of ['profiles','student_academic_profiles','schools']) {
      const contacts = output.sets.columns.filter(c => c.table_name === table && /phone|whatsapp|(^|_)wa($|_)|contact/i.test(c.column_name));
      const expressions = contacts.map(c => `count(*) FILTER(WHERE NULLIF(btrim("${c.column_name}"::text),'') IS NOT NULL)::int AS "${c.column_name}_present"`);
      if (expressions.length) await select(table+'ContactCoverage',`SELECT count(*)::int total,${expressions.join(',')} FROM public."${table}"`);
    }
    await client.query('ROLLBACK');
    fs.mkdirSync(scratch,{recursive:true});
    const file = path.join(scratch,'addendum-02-db.json');
    const serialized = JSON.stringify(output,null,2)+'\n';
    fs.writeFileSync(file,serialized);
    console.log(JSON.stringify({completed:true,readOnly:true,tlsVerified:true,projectIdentityMatched:true,testProjectMatched,sha256:crypto.createHash('sha256').update(serialized).digest('hex')}));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(()=>{});
    console.error(JSON.stringify({completed:false,code:error.code || error.name}));
    process.exitCode=1;
  } finally { if (client) await client.end(); }
})();
