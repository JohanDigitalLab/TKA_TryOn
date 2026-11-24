import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../docs/database/migration-gamification-foundation.sql', import.meta.url), 'utf8');
const tables = ['user_settings', 'subject_themes', 'virtual_pets', 'virtual_pet_items', 'gamification_log', 'gamification_leagues', 'gamification_league_members', 'map_adventure_topics', 'map_adventure_themes', 'map_adventure_tools'];

test('ten requested tables have generated UUID primary keys and RLS', () => {
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length, 10);
  for (const table of tables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(\\s+(?:id|topic_uid) uuid PRIMARY KEY DEFAULT gen_random_uuid\\(\\)`));
    assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`));
  }
});

test('required columns preserve requested defaults, types and nullability', () => {
  for (const fragment of [
    '"group" varchar(50) NOT NULL DEFAULT \'SYSTEM\'',
    'subject varchar(20) NOT NULL UNIQUE',
    'ADD COLUMN IF NOT EXISTS gamification text',
    'ADD COLUMN IF NOT EXISTS estimate_minutes numeric NOT NULL DEFAULT 2',
    'ADD COLUMN IF NOT EXISTS clue text',
    'ADD COLUMN IF NOT EXISTS xp_score int NOT NULL DEFAULT 0',
    'is_active bool NOT NULL DEFAULT true',
    'is_completed bool NOT NULL DEFAULT false',
    'timestamp timestamp NOT NULL DEFAULT now()',
    'ALTER COLUMN learning_material SET NOT NULL',
    'ALTER COLUMN learning_material_url SET NOT NULL',
  ]) assert.ok(sql.includes(fragment), fragment);
  for (const score of ['drink_score', 'food_score', 'happy_score']) {
    assert.ok(sql.includes(`${score} int NOT NULL DEFAULT 100`));
  }
  for (const checkpoint of ['kemahilmu', 'poslatihan', 'sidequest', 'mysterychest', 'pospenjaga']) {
    assert.ok(sql.includes(`${checkpoint}_timestamp timestamp`));
    assert.ok(sql.includes(`${checkpoint}_attempt_id uuid`));
  }
});

test('migration is transactional and backfills only missing learning materials', () => {
  assert.match(sql, /\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.ok(sql.includes("COALESCE(learning_material, '')"));
  assert.ok(sql.includes('WHERE learning_material IS NULL OR learning_material_url IS NULL'));
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE)\b/);
  assert.doesNotMatch(sql, /CREATE POLICY/);
});
