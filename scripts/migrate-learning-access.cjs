'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {parseEnv}=require('node:util');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
(async()=>{
 let c;
 try {
 const args=process.argv.slice(2);assert(args.every(x=>x==='--apply'),'Unknown argument');const apply=args.includes('--apply');
 const e={...parseEnv(read('.env.database.local')),...process.env},app=parseEnv(read('.env.local'));
 const url=new URL(app.NEXT_PUBLIC_SUPABASE_URL);assert.equal(url.protocol,'https:');const ref=url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];assert(ref);
 assert(e.DB_HOST===`db.${ref}.supabase.co`||(e.DB_HOST.endsWith('.pooler.supabase.com')&&e.DB_USER.endsWith(`.${ref}`)),'Project mismatch');
 if(e.DB_EXPECTED_PROJECT_REF)assert.equal(e.DB_EXPECTED_PROJECT_REF,ref);
 if(apply)assert.equal(e.LEARNING_ACCESS_APPLY_PROJECT_REF,ref,'Explicit project confirmation required');
 c=new Client({host:e.DB_HOST,port:Number(e.DB_PORT||5432),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,e.DB_SSL_CA_PATH),'utf8')},connectionTimeoutMillis:15000});
 c.on('notice',()=>{});await c.connect();assert(c.connection.stream.authorized);
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'");
 const sql=read('docs/database/migration-stage-6-learning-access.sql').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm,'');
 await c.query(sql);await c.query(sql);
 const tables=['learning_subscriptions','learning_subscription_audit','learning_packages','learning_package_attempts','learning_trial_uses'];
 const acl=await c.query("SELECT relname,relrowsecurity,has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') access FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1)",[tables]);
 assert.equal(acl.rowCount,5);for(const r of acl.rows){assert(r.relrowsecurity);assert.equal(r.access,false);}
 const funcs=await c.query("SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_access,has_function_privilege('authenticated',p.oid,'EXECUTE') client_access FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname LIKE 'learning_%') OR (n.nspname='public' AND p.proname IN ('learning_access_context','learning_subscription_workspace','learning_subscription_set','start_learning_attempt','start_exam_attempt','start_school_assignment'))");
 for(const f of funcs.rows){assert.equal(f.anon_access,false);assert.equal(f.client_access,f.nspname==='public');assert(f.prosecdef);if(f.nspname==='public')assert(f.proconfig.includes('search_path=pg_catalog'));}
 await c.query('SAVEPOINT fixtures');await c.query(read('tests/database/learning-access.sql'));await c.query(read('tests/database/learning-access-extended.sql'));await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ROLLBACK TO SAVEPOINT fixtures');
 await c.query(apply?'COMMIT':'ROLLBACK');console.log(JSON.stringify({verified:true,committed:apply,tlsVerified:true,projectIdentityMatched:true,idempotent:true,securedTables:5,fixturesRolledBack:true,tests:'learning-access',twoSessionStressTest:false}));
 }catch(err){if(c)await c.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({verified:false,committed:false,code:err.code||err.name,message:err.message}));process.exitCode=1;}
 finally{if(c)await c.end();}
})();
