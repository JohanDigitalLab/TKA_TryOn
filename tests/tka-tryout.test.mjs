import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const sql = await readFile(new URL('../docs/database/migration-start-tka-tryout.sql', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../src/app/student/tryout/page.js', import.meta.url), 'utf8');

test('nullable classification is independent of legacy element/material', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS theme varchar\(255\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS topic varchar\(255\)/);
  assert.doesNotMatch(sql, /UPDATE public\.questions|SET theme|SET topic/);
});
test('selection caps each row, excludes duplicates, fills shortages and rejects empty inventory', () => {
  assert.match(sql, /q\.theme=r\.theme AND q\.topic=r\.topic/);
  assert.match(sql, /least\(r\.no_of_questions,cfg\.total_questions-cardinality\(selected\)\)/);
  assert.equal((sql.match(/NOT\(q\.id=ANY\(selected\)\)/g) || []).length, 2);
  assert.match(sql, /s\.question_code=q\.question_code/);
  assert.match(sql, /LIMIT greatest\(0,cfg\.total_questions-cardinality\(selected\)\)/);
  assert.match(sql, /IF cardinality\(selected\)=0 THEN RAISE/);
  assert.match(sql, /version_status='PUBLISHED'\s+ORDER BY version_number DESC,id DESC LIMIT 1/);
  assert.doesNotMatch(sql, /is_current\s*=|UPDATE public\.tka_configurations/);
  assert.match(sql, /total_questions=actual/);
  assert.match(sql, /'TRYOUT',cfg\.tka_code/);
});
test('start and resume use ownership, account/level/access checks and transaction locks', () => {
  assert.match(sql, /^--[^]*BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /private\.school_actor\(\)/);
  assert.match(sql, /public\.learning_access_context\(\)/);
  assert.match(sql, /TKA education level mismatch/);
  assert.match(sql, /user_id=u AND tka_code=cfg\.tka_code/);
  assert.match(sql, /clock_timestamp\(\)<started_at\+duration_minutes\*interval '1 minute'/);
  assert.match(sql, /FROM PUBLIC,anon,authenticated/);
  for (const declaration of sql.matchAll(/SECURITY DEFINER([^]*?)AS \$\$/g)) {
    assert.match(declaration[1], /SET search_path=pg_catalog/);
  }
});
test('safe loader only reads persisted snapshots and explicitly allowlists exam fields', () => {
  const loader = sql.split('CREATE OR REPLACE FUNCTION private.load_tka_tryout')[1].split('END $$;')[0];
  assert.doesNotMatch(loader, /INSERT |UPDATE public\.|random\(|is_correct|correct_category|explanation/);
  for (const key of ['questions', 'options', 'category_items', 'answers', 'remaining_seconds']) assert.ok(loader.includes(`'${key}'`));
  assert.match(loader, /v\.id=aq\.question_version_id AND v\.question_id=q\.id/);
  assert.match(sql, /RETURN private\.tka_legacy_resume\(p_attempt_id\)/);
});
test('frontend starts server attempt with synchronous duplicate guard and recoverable errors', () => {
  assert.match(frontend, /async function saveConfiguration/);
  assert.match(frontend, /if \(startingRef\.current\) return/);
  assert.match(frontend, /supabase\.rpc\("start_tka_tryout"/);
  assert.match(frontend, /p_tka_code: selectedConfiguration\.tka_code/);
  assert.match(frontend, /challenge\?attemptId=\$\{encodeURIComponent\(data\.attempt_id\)\}/);
  assert.match(frontend, /disabled=\{!isReady \|\| starting\}/);
  assert.doesNotMatch(frontend, /sessionStorage/);
});
