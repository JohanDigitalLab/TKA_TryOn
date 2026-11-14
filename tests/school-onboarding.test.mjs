import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { academicYear, applicationPayload, authLink, classPayload, gradesFor, inviteCode, joinPath, localPath, schoolError, statusLabels, text, transferPayload } from "../src/lib/school/onboarding.mjs";

const types = [{ id:"smp",education_level_id:"smp",name:"SMP" }];
const application = { school_name:"  SMP Harapan  ",npsn:"00123456",school_type_id:"smp",address:"Jalan Harapan 1",city:"Bandung",province:"Jawa Barat",teacher_name:"Ibu Sari",teacher_position:"Kepala sekolah",contact_phone:"08123456789",authorization_confirmed:true };
test("redirect accepts only local paths including query/hash", () => {
  assert.equal(localPath("/school/join?code=abc#preview"),"/school/join?code=abc#preview");
  assert.equal(localPath("/student/../school"),"/school");
  for(const path of [null,undefined,"","https://evil.test","//evil.test","///evil.test","javascript:alert(1)","\\evil.test","/\\evil.test","/%2f%2fevil.test","/%5cevil.test","/\nevil","/%00evil","/%0aevil","/ evil","/%20evil","/bad%zz","/a/..//evil.test"]) assert.equal(localPath(path,"/school"),"/school",String(path));
});
test("auth routes retain invite through a single safely encoded next", () => {
  const path = joinPath("a".repeat(64));
  const link = authLink("login",path);
  assert.equal(new URL(link,"https://app.test").searchParams.get("next"),path);
  assert.equal(authLink("login","//evil.test"),"/login?next=%2Fstudent");
});
test("invite validation trims and enforces exact bearer code size", () => {
  assert.equal(inviteCode(` ${"b".repeat(64)} `),"b".repeat(64));
  for(const value of ["", "a".repeat(63),"a".repeat(65),"a".repeat(63)+" ","a "+"b".repeat(62)]) assert.throws(() => inviteCode(value));
});
test("application payload follows exact keys, trims, preserves leading-zero NPSN", () => {
  const result = applicationPayload({ ...application,role:"super_admin",school_id:"untrusted" },types);
  assert.equal(result.school_name,"SMP Harapan");
  assert.equal(result.npsn,"00123456");
  assert.deepEqual(Object.keys(result).sort(),Object.keys(application).sort());
});
test("application requires authority, supported type, eight numeric NPSN and every bounded field", () => {
  for(const patch of [{ authorization_confirmed:false },{ authorization_confirmed:"true" },{ school_type_id:"unknown" },{ npsn:"1234567" },{ npsn:"abcdefgh" },{ school_name:"a" },{ address:"x" },{ city:"a" },{ province:"a" },{ teacher_name:"a" },{ teacher_position:"a" },{ contact_phone:"12345" },{ school_name:"a".repeat(161) }]) assert.throws(() => applicationPayload({ ...application,...patch },types));
});
test("grade and consecutive academic year match backend", () => {
  assert.deepEqual(gradesFor("SD"),[1,2,3,4,5,6]); assert.deepEqual(gradesFor("smp"),[7,8,9]); assert.deepEqual(gradesFor("sma"),[10,11,12]); assert.deepEqual(gradesFor("unknown"),[]);
  assert.ok(academicYear("2026/2027"));
  for(const year of ["2026/2028","2026/2026","26/27","2026-2027"]) assert.equal(academicYear(year),false);
  assert.deepEqual(classPayload({ name:" VII A ",grade:"7",academic_year:"2026/2027" },"smp"),{ name:"VII A",grade:7,academic_year:"2026/2027" });
  assert.throws(() => classPayload({ name:"A",grade:10,academic_year:"2026/2027" },"smp"));
  assert.throws(() => classPayload({ name:"A",grade:7.5,academic_year:"2026/2027" },"smp"));
});
test("rename cannot change existing grade or year from submitted form", () => {
  assert.deepEqual(classPayload({ name:"B",grade:9,academic_year:"2030/2031" },"smp",{ id:"class",grade:7,academic_year:"2026/2027" }),{ class_id:"class",name:"B",grade:7,academic_year:"2026/2027" });
});
test("transfer normalizes email; recovery requires bounded reason and never accepts target user role", () => {
  assert.deepEqual(transferPayload({ email:" STAFF@Example.com ",role:"school_admin" }),{ email:"staff@example.com" });
  assert.deepEqual(transferPayload({ email:"staff@example.com",reason:" Kehilangan akses koordinator lama " },true),{ email:"staff@example.com",reason:"Kehilangan akses koordinator lama" });
  for(const email of ["a@b","a b@example.com","a@@b.com"]) assert.throws(() => transferPayload({ email }));
  assert.throws(() => transferPayload({ email:"a@b.com",reason:"singkat" },true));
});
test("safe errors distinguish missing rollout/authorization, avoid raw backend detail", () => {
  assert.match(schoolError({ code:"PGRST202" }),/belum tersedia/);
  assert.match(schoolError({ code:"42501",message:"secret" }),/Akses ditolak/);
  assert.doesNotMatch(schoolError({ code:"23505",message:"secret table row payload" }),/secret/);
  assert.match(schoolError({ message:"Education level mismatch" }),/Jenjang/);
  assert.equal(text(" abc ","Text",3,3),"abc");
  assert.throws(() => text(" ","Text",1,10));
  assert.equal(statusLabels.needs_revision,undefined);
});

test("frontend only uses authenticated RPCs and supported school actions", async () => {
  const paths = ["src/components/school/portal.js","src/components/school/transfers.js","src/components/school/communications.js","src/app/school/register/page.js","src/app/school/join/page.js","src/app/school/manage/page.js","src/app/school/messages/page.js","src/app/admin/schools/page.js"];
  const source = (await Promise.all(paths.map(p => readFile(new URL(`../${p}`,import.meta.url),"utf8")))).join("\n");
  for(const action of ["profile_update","class_save","class_archive","invite_create","invite_revoke","member_approve","member_reject","member_deactivate","member_move","message_send","platform_message","message_read","ticket_create","message_forward","ticket_reply","ticket_close","propose","accept","cancel","recover"]) assert.ok(source.includes(`"${action}"`),action);
  assert.doesNotMatch(source,/service_role|SERVICE_ROLE|dangerouslySetInnerHTML|window\.confirm|\.from\([^)]*\)\.(insert|update|delete|upsert)/);
  assert.match(source,/<fieldset disabled=\{portal.busy\}/);
  assert.match(source,/lock\.current/);
  assert.match(source,/p_confirm:false/); assert.match(source,/p_confirm:true/);
  assert.match(source,/p_action:"accept",p_data:\{ transfer_id:t.id \}/);
  assert.match(source,/ID penerima privat opsional/);
});
test("signup no longer stores misleading school code metadata; staff has no education requirement", async () => {
  const student = await readFile(new URL("../src/app/register/page.js",import.meta.url),"utf8");
  const staff = await readFile(new URL("../src/app/school/register/page.js",import.meta.url),"utf8");
  const login = await readFile(new URL("../src/app/login/page.js",import.meta.url),"utf8");
  assert.doesNotMatch(student,/school_code\s*:/); assert.match(student,/joinPath\(values.code\)/);
  assert.match(staff,/registration_method: "school_staff"/); assert.doesNotMatch(staff,/education_level\s*:/);
  assert.match(login,/localPath\(searchParams.get\("next"\)/);
  assert.equal((login.match(/if \(authLock\.current\) return;/g) || []).length,3);
  assert.equal((login.match(/<fieldset disabled=\{authBusy\}/g) || []).length,2);
});
