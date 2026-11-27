import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { normalizeWhatsAppNumber, settingEnabled, validateSettingsPatch, whatsAppUrl, settingsError, textLength } from '../src/lib/admin/platform-settings.mjs';

test('validasi dan normalisasi konfigurasi allowlist', () => {
  assert.equal(normalizeWhatsAppNumber('+62 (812) 3456-7890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber('081234567890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber(''), '');
  for (const value of ['abc0812345678', '123', '00123456789012345678', 'https://evil.test']) assert.throws(() => normalizeWhatsAppNumber(value));
  assert.deepEqual(validateSettingsPatch({ WA_NUMBER: '081234567890', AUTO_CALC_COMPETENCY: 'TRUE', WA_MSG_SISWA: ' Halo ' }), { WA_NUMBER: '6281234567890', AUTO_CALC_COMPETENCY: '1', WA_MSG_SISWA: 'Halo' });
  for (const patch of [{}, { SECRET: 'x' }, { WA_NUMBER: 123 }, { AUTO_CALC_COMPETENCY: 'yes' }, { WA_MSG_SISWA: 'x'.repeat(256) }, []]) assert.throws(() => validateSettingsPatch(patch));
  assert.equal(textLength('😀'.repeat(255)), 255);
  assert.equal(validateSettingsPatch({ WA_MSG_SISWA: '😀'.repeat(255) }).WA_MSG_SISWA.length, 510);
  assert.equal(settingEnabled('1'), true); assert.equal(settingEnabled('TRUE'), true); assert.equal(settingEnabled('0'), false);
  assert.equal(whatsAppUrl('081234567890', 'Halo & ?'), 'https://wa.me/6281234567890?text=Halo%20%26%20%3F');
  assert.equal(whatsAppUrl(''), '');
  assert.match(settingsError({ code: 'PGRST202' }), /Backend Pengaturan belum/);
  assert.match(settingsError({ code: '40001' }), /berubah sejak/);
});

// Explicit opt-in: never connects to a remote PostgreSQL database.
const require = createRequire(import.meta.url);
let PGlite;
if (process.env.PGLITE_MODULE_PATH) ({ PGlite } = require(process.env.PGLITE_MODULE_PATH));
else { try { ({ PGlite } = require('@electric-sql/pglite')); } catch { /* optional isolated engine */ } }

test('SQL terisolasi: otorisasi, hak akses, atomisitas, revisi, audit, idempotensi, duplikat', { skip: !PGlite && 'Set PGLITE_MODULE_PATH ke instalasi PGlite lokal untuk tes SQL' }, async () => {
  const db = new PGlite();
  const migration = await readFile(new URL('../docs/database/migration-admin-platform-settings.sql', import.meta.url), 'utf8');
  const admin = '00000000-0000-4000-8000-000000000001';
  const student = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,banned_until timestamptz,deleted_at timestamptz);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, account_status text,is_verified boolean);
      CREATE TABLE public.user_global_roles(user_id uuid,role text);
      CREATE TABLE public.settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"group" varchar(50) NOT NULL DEFAULT 'SYSTEM', name varchar(50) NOT NULL,value varchar(255) NOT NULL,type varchar(50) NOT NULL,options varchar(255) NOT NULL,description text NOT NULL);
      INSERT INTO auth.users(id,banned_until) VALUES ('${admin}',NULL),('${student}',NULL);
      INSERT INTO public.profiles VALUES ('${admin}','ACTIVE',true),('${student}','ACTIVE',true);
      INSERT INTO public.user_global_roles VALUES ('${admin}','super_admin');
      INSERT INTO public.settings(name,value,type,options,description) VALUES ('AUTO_CALC_COMPETENCY','1','BOOL','',''),('WA_MSG_SISWA','Original','TEXT','','');`);
    await db.exec(migration);
    await db.exec(migration);
    const actor = id => db.query("SELECT set_config('test.actor',$1,false)", [id]);
    const rpc = async (name, args = []) => (await db.query(`SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`, args)).rows[0].result;
    const save = (revision, patch, reason = 'Pengujian sintetis') => rpc('admin_platform_settings_save', [revision, JSON.stringify(patch), reason]);
    await actor(admin);
    assert.deepEqual(await rpc('admin_platform_settings_get'), { revision: 0, values: { AUTO_CALC_COMPETENCY: '1', WA_MSG_SISWA: 'Original' } });
    let result = await save(0, { WA_NUMBER: '081234567890', WA_MSG_SEKOLAH: 'Halo', AUTO_CALC_COMPETENCY: 'TRUE' });
    assert.equal(result.revision, 1); assert.equal(result.values.WA_NUMBER, '6281234567890');
    assert.equal((await rpc('admin_platform_settings_history'))[0].changes.WA_NUMBER.before, null);
    assert.equal((await rpc('admin_platform_settings_history'))[0].actor_id, admin);
    await assert.rejects(save(0, { WA_NUMBER: '' }), /Stale settings revision/);
    assert.equal((await save(1, { WA_NUMBER: '6281234567890' })).revision, 1);
    for (const patch of [{ SECRET: 'x' }, { WA_MSG_SISWA: 'x'.repeat(256) }, { WA_NUMBER: 'abc0812345678' }, { AUTO_CALC_COMPETENCY: 'yes' }, { WA_MSG_SISWA: 4 }, {}]) await assert.rejects(save(1, patch));
    await assert.rejects(save(1, { WA_NUMBER: '' }, 'x'));
    // First loop iteration could write: later validation failure must roll it back.
    await assert.rejects(save(1, { WA_MSG_SISWA: 'Must rollback', ZZ_SECRET: 'not allowed' }));
    assert.equal((await rpc('admin_platform_settings_get')).values.WA_MSG_SISWA, 'Original');
    assert.equal((await rpc('admin_platform_settings_history')).length, 1);
    assert.deepEqual(await rpc('admin_platform_settings_history', [1]), []);
    result = await save(1, { WA_NUMBER: '', WA_MSG_SISWA: '😀'.repeat(255) });
    assert.equal(result.revision, 2); assert.equal(result.values.WA_NUMBER, '');
    for (const sql of ["UPDATE public.profiles SET account_status='SUSPENDED'", 'UPDATE public.profiles SET is_verified=false', "UPDATE auth.users SET banned_until=now()+interval '1 day'"]) {
      await db.exec(sql);
      await assert.rejects(rpc('admin_platform_settings_get'), /super admin required/);
      await assert.rejects(save(2, { WA_NUMBER: '' }), /super admin required/);
      await assert.rejects(rpc('admin_platform_settings_history'), /super admin required/);
      await db.exec("UPDATE public.profiles SET account_status='active',is_verified=true; UPDATE auth.users SET banned_until=NULL");
    }
    await db.exec('UPDATE auth.users SET deleted_at=now()');
    await assert.rejects(rpc('admin_platform_settings_get'), /super admin required/);
    await db.exec('UPDATE auth.users SET deleted_at=NULL');
    await actor(student);
    await assert.rejects(rpc('admin_platform_settings_get'), /super admin required/);
    await assert.rejects(save(2, { WA_NUMBER: '' }), /super admin required/);
    await assert.rejects(rpc('admin_platform_settings_history'), /super admin required/);
    await actor(''); await assert.rejects(rpc('admin_platform_settings_get'), /super admin required/);
    await actor(admin);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT * FROM public.settings'), /permission denied/);
      await assert.rejects(db.query('SELECT * FROM public.platform_settings_audit'), /permission denied/);
      await assert.rejects(db.query('UPDATE public.platform_settings_state SET revision=99'), /permission denied/);
      await assert.rejects(rpc('admin_platform_settings_authorize'), /permission denied/);
      if (role === 'anon') await assert.rejects(rpc('admin_platform_settings_get'), /permission denied/);
      else assert.equal((await rpc('admin_platform_settings_get')).revision, 2);
      await db.exec('RESET ROLE');
    }
    await db.exec(migration);
    assert.equal((await rpc('admin_platform_settings_get')).revision, 2);
    assert.equal((await rpc('admin_platform_settings_history')).length, 2);
    await db.exec('DROP INDEX public.settings_platform_allowlist_unique');
    await db.exec("INSERT INTO public.settings(name,value,type,options,description) VALUES ('WA_NUMBER','duplicate','TEXT','','')");
    await assert.rejects(db.exec(migration), /Duplicate SYSTEM settings/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.settings WHERE name='WA_NUMBER'")).rows[0].n, 2);
  } finally { await db.close(); }
});

test('integrasi navigasi dan konsumen tetap menggunakan kontrak produksi', async () => {
  const read = path => readFile(new URL(path, import.meta.url), 'utf8');
  assert.match(await read('../src/components/admin/admin-sidebar.js'), /label: "Pengaturan", href: "\/admin\/settings"/);
  const student = await read('../src/app/student/page.js');
  assert.match(student, /href=\{url\}/); assert.doesNotMatch(student, /window\.open/);
  assert.match(student, /number\.error \|\| text\.error/);
  assert.match(await read('../src/app/student/challenge/page.js'), /\["1", "TRUE"\]\.includes/);
});
