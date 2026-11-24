import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../docs/database/migration-gamification-foundation.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tables = ['user_settings', 'subject_themes', 'virtual_pets', 'virtual_pet_items', 'gamification_log', 'gamification_leagues', 'gamification_league_members', 'gamification_tips', 'map_adventure_topics', 'map_adventure_themes', 'map_adventure_status', 'map_adventure_tools'];

test('twelve requested tables have generated UUID primary keys and RLS', () => {
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length, tables.length);
  for (const table of tables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(\\s+(?:id|topic_uid) uuid PRIMARY KEY DEFAULT gen_random_uuid\\(\\)`));
    assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`));
  }
});

test('required columns preserve requested defaults, types and nullability', () => {
  for (const fragment of [
    '"group" varchar(50) NOT NULL DEFAULT \'SYSTEM\'',
    'subject varchar(20) NOT NULL UNIQUE',
    'ADD COLUMN IF NOT EXISTS gamification_app text',
    'ADD COLUMN IF NOT EXISTS estimate_minutes numeric NOT NULL DEFAULT 2',
    'ADD COLUMN IF NOT EXISTS clue text',
    'ADD COLUMN IF NOT EXISTS xp_score int NOT NULL DEFAULT 0',
    'is_active bool NOT NULL DEFAULT true',
    'is_timeout bool NOT NULL DEFAULT false',
    'timestamp timestamp NOT NULL DEFAULT now()',
    'ALTER COLUMN learning_material SET NOT NULL',
    'ALTER COLUMN learning_material_url SET NOT NULL',
    'ALTER COLUMN is_timeout SET DEFAULT false',
    'ALTER COLUMN is_timeout SET NOT NULL',
  ]) assert.ok(sql.includes(fragment), fragment);
  for (const score of ['hydration', 'hunger', 'happiness']) {
    assert.ok(sql.includes(`${score} int NOT NULL DEFAULT 100`), score);
  }
  assert.doesNotMatch(sql, /drink_score|food_score|happy_score/);
  assert.ok(sql.includes('status varchar(255),'));
  assert.ok(sql.includes('last_updated_at timestamp,'));
});

test('virtual pet bag table is virtual_pet_items; no rename occurs', () => {
  assert.doesNotMatch(sql, /virtual_pet_bag|virtual_pet_inventory/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.virtual_pet_items \(\n\s+id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\),\n\s+virtual_pet_id uuid NOT NULL,/);
});

test('map adventure checkpoints use per-stage statuses and attempt ids', () => {
  for (const checkpoint of ['material', 'practice', 'sidequest', 'mysterychest', 'gatekeeper']) {
    assert.ok(sql.includes(`${checkpoint}_status varchar(50) NOT NULL DEFAULT 'LOCKED'`), checkpoint);
  }
  for (const attempt of ['practice_attempt_id uuid,', 'sidequest_attempt_id uuid,', 'gatekeeper_attempt_id uuid\n']) {
    assert.ok(sql.includes(attempt), attempt);
  }
  assert.doesNotMatch(sql, /mysterychest_attempt_id|material_attempt_id/);
  assert.ok(sql.includes('material_completed_at timestamp,'));
  assert.ok(sql.includes('mysterychest_completed_at timestamp,'));
  assert.doesNotMatch(sql, /kemahilmu|poslatihan|pospenjaga/);
});

test('map_adventure_themes and map_adventure_status follow the requested contract', () => {
  for (const fragment of [
    'subject varchar(255) NOT NULL,',
    'theme varchar(255) NOT NULL,',
    "status varchar(50) NOT NULL DEFAULT 'LOCKED'",
    'completed_at timestamp,',
    'order_number int'
  ]) assert.ok(sql.includes(fragment), fragment);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.map_adventure_status \(\n\s+id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\),\n\s+user_id uuid NOT NULL,\n\s+points int NOT NULL DEFAULT 0,\n\s+stars int NOT NULL DEFAULT 0\n\s*\)/);
});

test('migration is transactional and backfills only missing learning materials', () => {
  assert.match(sql, /\nBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.ok(sql.includes("COALESCE(learning_material, '')"));
  assert.ok(sql.includes('WHERE learning_material IS NULL OR learning_material_url IS NULL'));
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE)\b/);
  assert.doesNotMatch(sql, /CREATE POLICY/);
});
