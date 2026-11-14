// Default: verifikasi transaksi lalu ROLLBACK. --apply diperlukan untuk COMMIT.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Client } = require('pg');
process.loadEnvFile('.env.database.local');
const client = new Client({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: true, ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') },
  connectionTimeoutMillis: 15000,
});
(async () => {
  const apply = process.argv.includes('--apply');
  try {
    await client.connect();
    await client.query('BEGIN');
    const sql = fs.readFileSync('docs/database/migration-stage-3-school-workflows.sql', 'utf8').replace(/^BEGIN;\s*|^COMMIT;\s*$/gm, '');
    await client.query(sql);
    // Re-run memastikan migration dapat dijalankan ulang tanpa menggandakan objek.
    await client.query(sql);
    const tables = await client.query(`SELECT relname, relrowsecurity,
      has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS client_write,
      has_table_privilege('anon',oid,'SELECT') AS anon_read
      FROM pg_class WHERE oid IN ('public.school_assignments'::regclass,'public.school_assignment_questions'::regclass,'public.school_assignment_recipients'::regclass)`);
    assert.equal(tables.rowCount,3);
    for (const r of tables.rows) {
      assert.equal(r.relrowsecurity,true); assert.equal(r.client_write,false); assert.equal(r.anon_read,false);
    }
    const functions = await client.query(`SELECT p.proname,p.prosecdef,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS client_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('get_teacher_workspace','save_school_assignment','set_school_assignment_status','get_student_assignments','start_school_assignment','get_school_assignment_ranking')`);
    assert.equal(functions.rowCount,6);
    for (const r of functions.rows) {
      assert.equal(r.prosecdef,true); assert.equal(r.anon_execute,false); assert.equal(r.client_execute,true);
    }
    if (fs.existsSync('tests/database/school-workflows.sql')) {
      await client.query('SAVEPOINT workflow_tests');
      await client.query(fs.readFileSync('tests/database/school-workflows.sql','utf8'));
      await client.query('ROLLBACK TO SAVEPOINT workflow_tests');
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ verified:true, committed:apply, tables:tables.rowCount, functions:functions.rowCount }));
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error(`Migration dibatalkan: ${error.code || error.name}: ${error.message}${error.where ? '\n'+error.where : ''}`);
    process.exitCode=1;
  } finally { await client.end(); }
})();
