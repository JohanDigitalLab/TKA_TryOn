import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const available = existsSync(new URL('../.local/database/addendum-02-db.json',import.meta.url)) && existsSync(new URL('../.local/school-sql-sandbox/node_modules/@electric-sql/pglite/package.json',import.meta.url));
test('embedded PostgreSQL: actual migration, unchanged preflights, catalog and synthetic RPC execution (NOT Supabase Auth)', { skip: !available, timeout:120000 }, async () => {
  const { validate } = require('../scripts/validate-school-advanced-pglite.cjs');
  const report = await validate();
  assert.equal(report.catalogAssertions,106);
  assert.equal(report.mockAuth,true);
  assert.equal(Number(report.runtimeFixture.stored.score),100);
});
