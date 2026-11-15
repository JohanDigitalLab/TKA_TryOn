'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const assert = require('node:assert/strict');
const { Client } = require('pg');

const root = path.resolve(__dirname, '..');
const readEnv = (file) => fs.existsSync(path.join(root, file))
  ? parseEnv(fs.readFileSync(path.join(root, file), 'utf8'))
  : {};
const env = { ...readEnv('.env.database.local'), ...readEnv('.env.local'), ...process.env };

const reviewFunction = fs.readFileSync(
  path.join(root, 'docs/database/migration-results-review-metadata.sql'), 'utf8'
);

function databaseConfig() {
  for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL_CA_PATH']) {
    assert(env[key], `Missing ${key}`);
  }
  assert(env.NEXT_PUBLIC_SUPABASE_URL, 'Missing NEXT_PUBLIC_SUPABASE_URL');
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(url.protocol, 'https:');
  const ref = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  assert(ref, 'Managed Supabase project required');
  assert(
    env.DB_HOST === `db.${ref}.supabase.co`
      || (env.DB_HOST.endsWith('.pooler.supabase.com') && env.DB_USER.endsWith(`.${ref}`)),
    'Project mismatch'
  );
  if (env.DB_EXPECTED_PROJECT_REF) assert.equal(env.DB_EXPECTED_PROJECT_REF, ref);
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync(path.resolve(root, env.DB_SSL_CA_PATH), 'utf8'),
    },
    connectionTimeoutMillis: 15000,
    application_name: 'tka-results-review-metadata-apply',
  };
}

(async () => {
  const client = new Client(databaseConfig());
  try {
    await client.connect();
    assert.equal(client.connection.stream.authorized, true);
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'");
    await client.query(reviewFunction);
    const check = await client.query(`
      SELECT pg_get_functiondef('public.get_exam_attempt_review(uuid)'::regprocedure) AS definition,
             has_function_privilege('authenticated', 'public.get_exam_attempt_review(uuid)', 'EXECUTE') AS authenticated_execute,
             has_function_privilege('anon', 'public.get_exam_attempt_review(uuid)', 'EXECUTE') AS anon_execute
    `);
    const row = check.rows[0];
    assert(row.definition.includes("'source_metadata'"), 'Deployed function does not contain source metadata enrichment');
    assert.equal(row.authenticated_execute, true, 'Authenticated execute grant was lost');
    assert.equal(row.anon_execute, false, 'Anonymous execute grant is unsafe');
    // Exercise the real owner path before committing, not only the definition.
    const sample = (await client.query("SELECT id, user_id FROM public.exam_attempts WHERE attempt_status='SUBMITTED' ORDER BY created_at DESC LIMIT 1")).rows[0];
    if (sample) {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [sample.user_id]);
      const review = (await client.query('SELECT public.get_exam_attempt_review($1) AS review', [sample.id])).rows[0].review;
      assert.equal(review.attempt_id, sample.id);
      assert(Array.isArray(review.questions) && review.questions.length > 0, 'Owner review has no questions');
      assert(review.questions.every((question) => question.source_metadata), 'Missing source metadata');
      await client.query('RESET ROLE');
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({
      applied: true,
      committed: true,
      tlsVerified: true,
      function: 'public.get_exam_attempt_review(uuid)',
      authenticatedExecute: row.authenticated_execute,
      anonymousExecute: row.anon_execute,
    }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({
      applied: false,
      committed: false,
      code: error.code || error.name,
      message: error.message,
    }));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
