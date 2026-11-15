'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
const env = { ...parseEnv(fs.readFileSync(path.join(root, '.env.database.local'), 'utf8')), ...process.env };
const client = new Client({ host: env.DB_HOST, port: Number(env.DB_PORT || 5432), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, ssl: { rejectUnauthorized: true, ca: fs.readFileSync(path.resolve(root, env.DB_SSL_CA_PATH), 'utf8') }, connectionTimeoutMillis: 15000 });
const owner = 'c409e427-1c4b-4645-8454-548e4594e50e';
const ids = ['34844b8a-4ea5-466c-a7ec-4a2b6ea0a080', '7a1e459e-86d5-4c05-ac67-0efee3291425'];
async function denied(actor, attemptId) {
  await client.query('SAVEPOINT access_test');
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [actor]);
  let error;
  try { await client.query('SELECT public.get_exam_attempt_review($1)', [attemptId]); } catch (caught) { error = caught; }
  await client.query('ROLLBACK TO SAVEPOINT access_test');
  assert.equal(error?.code, '42501', 'Unauthorized review was not denied');
}
async function main() {
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    // Baca konteks attempt sebelum SET ROLE authenticated karena verifier role
    // memang tidak diberi SELECT langsung ke exam_attempts; review tetap diuji
    // melalui RPC dengan privilege authenticated di bawah.
    const attemptContext = new Map((await client.query(
      'SELECT id, subject_name, grade FROM public.exam_attempts WHERE id = ANY($1::uuid[]) AND user_id = $2',
      [ids, owner]
    )).rows.map((row) => [row.id, row]));
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [owner]);
    const sessions = [];
    for (const id of ids) {
      const attempt = attemptContext.get(id);
      assert(attempt, `Attempt ${id} tidak ditemukan untuk owner verifier`);
      const review = (await client.query('SELECT public.get_exam_attempt_review($1) AS review', [id])).rows[0].review;
      assert.equal(review.questions.length, 20);
      assert.equal(review.questions.filter((q) => q.is_correct).length, review.correct_answers);
      assert(review.questions.every((q) => q.question_version_id && q.source_metadata?.material && q.source_metadata?.sub_material));
      sessions.push({
        subject: attempt.subject_name,
        grade: Number(attempt.grade),
        review,
      });
    }
    const source = fs.readFileSync(path.join(root, 'src/app/student/results/page.js'), 'utf8');
    const helpers = source.slice(source.indexOf('function officialMathTheme('), source.indexOf('function packageKey('));
    const context = vm.createContext({ sessions });
    vm.runInContext(`${helpers}\nvar themes = buildAnalysis(sessions, 'theme'); var topics = buildAnalysis(sessions, 'topic');`, context);
    assert(context.themes.length > 0 && context.topics.length > 0);
    assert.equal(context.themes.reduce((sum, item) => sum + item.total, 0), 40);
    assert.equal(context.topics.reduce((sum, item) => sum + item.total, 0), 40);
    assert(context.topics.every((item) => item.topic !== 'Topik belum tersedia'));
    const officialThemes = new Set(
      sessions.every((session) => Number(session.grade) === 9)
        ? ['Bilangan', 'Aljabar', 'Geometri dan Pengukuran', 'Data dan Peluang']
        : ['Bilangan', 'Geometri dan Pengukuran', 'Data']
    );
    assert(
      context.themes.every((item) => officialThemes.has(item.theme)),
      `Tema Matematika tidak resmi: ${context.themes.map((item) => item.theme).join(', ')}`
    );
    assert(!context.themes.some((item) => /belanja kebutuhan sekolah|penyajian data/i.test(item.theme)));
    await denied('00000000-0000-0000-0000-000000000001', ids[0]);
    await denied('', ids[0]);
    await denied(owner, '00000000-0000-0000-0000-000000000002');
    console.log(JSON.stringify({ verified: true, ownerReviews: sessions.length, questions: 40, themes: context.themes, topics: context.topics, otherUserDenied: true, unauthenticatedDenied: true, missingAttemptDenied: true }, null, 2));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
