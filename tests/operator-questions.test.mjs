import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL(`../${p}`,import.meta.url),'utf8');

test('Smart Import memakai izin operator dan tidak lagi membatasi role superadmin',async()=>{
 const ui=await read('src/app/admin/import/page.js');
 assert.match(ui,/admin_has_permission/);
 assert.match(ui,/p_permission_code: "bank_soal.import"/);
 assert.doesNotMatch(ui,/Fitur ini hanya untuk Super Admin|Akses Super Admin diperlukan|Super Admin terverifikasi/);
 for(const p of ['extract','structure']){
  assert.match(await read(`src/app/api/import/${p}/route.js`),/requireAdminPermission\(request, "bank_soal.import"\)/);
 }
});

test('Bank Soal memuat izin moderasi dan publikasi serta mengirim versi eksplisit',async()=>{
 const ui=await read('src/components/admin/questions-workspace.js');
 for(const code of ['view','review','edit','moderate','publish','import']) assert.ok(ui.includes(`bank_soal.${code}`));
 assert.match(ui,/Object.values\(PERMISSIONS\)/);
 assert.match(ui,/p_version_id: version.id/);
 assert.match(ui,/review_question_version/);
 assert.match(ui,/b.version_number - a.version_number/);
});

test('workflow server mewajibkan izin, versi terbaru, telaah dan persetujuan terpisah',async()=>{
 const sql=await read('docs/database/migration-stage-7-operator-questions.sql');
 for(const marker of ['email_confirmed_at IS NOT NULL','a.is_active','FOR UPDATE',"action='REVIEW'","action='APPROVE'",'version_number>v.version_number',"v.version_status<>'APPROVED'",'question_workflow_audit','REVOKE ALL']) assert.ok(sql.includes(marker),marker);
 assert.match(sql,/IF q.question_status<>'PUBLISHED'/);
 assert.match(sql,/private.has_admin_permission\(''bank_soal.import''\)/);
});
