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
    const args=process.argv.slice(2);assert(args.every(x=>x==='--apply'),'Unknown argument');
    const apply=args.includes('--apply');
    const e={...parseEnv(read('.env.database.local')),...process.env};
    const app=parseEnv(read('.env.local'));
    const url=new URL(app.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(url.protocol,'https:');
    const ref=url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
    assert(ref);
    assert(e.DB_HOST===`db.${ref}.supabase.co`||(e.DB_HOST.endsWith('.pooler.supabase.com')&&e.DB_USER.endsWith(`.${ref}`)),'Project mismatch');
    if(e.DB_EXPECTED_PROJECT_REF)assert.equal(e.DB_EXPECTED_PROJECT_REF,ref,'Project mismatch');
    if(apply)assert.equal(e.LEARNING_ACCESS_APPLY_PROJECT_REF,ref,'Explicit project confirmation required');
    c=new Client({host:e.DB_HOST,port:Number(e.DB_PORT||5432),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.resolve(root,e.DB_SSL_CA_PATH),'utf8')},connectionTimeoutMillis:15000});
    c.on('notice',()=>{});await c.connect();assert(c.connection.stream.authorized);
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'");
    const foundation=read('docs/database/migration-stage-6-learning-access.sql').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm,'');
    const unrestricted=read('docs/database/migration-stage-9-unrestricted-learning.sql').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm,'');
    await c.query(foundation);await c.query(unrestricted);
    await c.query(unrestricted);
    const funcs=await c.query("SELECT n.nspname,p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon_access,has_function_privilege('authenticated',p.oid,'EXECUTE') client_access FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('learning_access_context','start_learning_attempt','start_exam_attempt','start_school_assignment')");
    for(const f of funcs.rows){assert.equal(f.anon_access,false);assert.equal(f.client_access,true);}
    await c.query(apply?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({verified:true,committed:apply,tlsVerified:true,projectIdentityMatched:true,idempotent:true,unrestricted:true}));
  }catch(err){if(c)await c.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({verified:false,committed:false,code:err.code||err.name,message:err.message}));process.exitCode=1;}
  finally{if(c)await c.end();}
})();
