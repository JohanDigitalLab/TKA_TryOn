import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { educationLevels, registrationContext, registrationEducationLevel, studentRegistrationPath } from "../src/lib/student/registration.mjs";

const context = query => registrationContext(new URLSearchParams(query));

test("pilihan paket siswa diteruskan dan parameter asing tidak dipercaya", () => {
  assert.equal(context("method=independent").method, "independent");
  assert.equal(context("method=school").method, "school");
  assert.equal(context("method=admin").method, null);
  assert.equal(context("").method, null);
  assert.equal(context("level=university").level, null);
  assert.equal(context("next=https://evil.example").next, "/student");
});

test("setiap jenjang dari beranda dikunci saat menyusun metadata pendaftaran", () => {
  for (const level of educationLevels) {
    const path = studentRegistrationPath({ level: level.value });
    const selected = context(path.split("?")[1]);
    assert.equal(selected.level.value, level.value);
    assert.equal(selected.level.label, level.label);
    assert.equal(registrationEducationLevel(selected, "tampered"), level.value);
    assert.equal(selected.method, null);
  }
});

test("paket dan jenjang dapat diteruskan bersamaan tanpa memilih ulang", () => {
  const path = studentRegistrationPath({ method: "independent", level: "smp" });
  const selected = context(path.split("?")[1]);
  assert.equal(selected.method, "independent");
  assert.equal(selected.level.value, "smp");
  assert.equal(studentRegistrationPath({ method: "admin", level: "invalid" }), "/register");
});

test("tautan undangan lama menjaga konteks sekolah tanpa menuju halaman dihapus", () => {
  const next = `/school/join?code=${"a".repeat(64)}`;
  const selected = context(new URLSearchParams({ method: "independent", next }).toString());
  assert.equal(selected.method, "school");
  assert.equal(selected.next, "/student");
  assert.equal(context("next=/school/join-other").method, null);
});

test("jenjang hanya diminta bila belum dipilih dan tetap divalidasi", () => {
  assert.equal(registrationEducationLevel(context(""), "sd"), "sd");
  assert.throws(() => registrationEducationLevel(context(""), ""), /Pilih jenjang/);
  assert.throws(() => registrationEducationLevel(context(""), "invalid"), /Pilih jenjang/);
});

test("tombol paket berbeda tujuan dan formulir menampilkan konteks tetap", async () => {
  const read = path => readFile(new URL(path, import.meta.url), "utf8");
  // Paket langganan kini hidup di dashboard siswa (/student), bukan halaman terpisah.
  const subscription = await read("../src/app/student/page.js");
  assert.ok(!subscription.includes('href: "/register"'));
  assert.ok(!subscription.includes('href: "/school/register"'));
  assert.ok(!subscription.includes('href: "/subscription"'));
  assert.ok(subscription.includes("export function SubscriptionPlans"));
  // Aktivasi paket memakai settings WhatsApp per paket.
  assert.ok(subscription.includes('messageSetting: "WA_MSG_SISWA"'));
  assert.ok(subscription.includes('messageSetting: "WA_MSG_SEKOLAH"'));
  assert.ok(subscription.includes('if (!target) throw new Error('));
  assert.ok(!subscription.includes("method=independent"));
  assert.ok(!subscription.includes("method=school"));
  // Tombol aktivasi kini membuka WhatsApp memakai settings, bukan link /register.
  assert.ok(subscription.includes('<ActivationWhatsApp plan={plan} />'));
  assert.ok(subscription.includes('p_name: "WA_NUMBER"'));
  assert.ok(subscription.includes('whatsAppUrl(number.data,'));
  assert.ok(subscription.includes('href={url}'));
  assert.ok(!subscription.includes("Catatan aktivasi"));
  assert.ok(!subscription.includes("Belum ada pembayaran atau transaksi yang dianggap berhasil."));
  const register = await read("../src/app/register/page.js");
  assert.ok(register.includes("<h1 className=\"text-3xl font-black\">Daftar Akun</h1>"));
  assert.ok(register.includes("{level ? ("));
  assert.ok(register.includes("registrationEducationLevel(context, values.education_level)"));
  assert.ok(register.includes('registration_method: "independent"'));
  // Beranda tidak lagi menautkan halaman /register; pendaftaran dibuka lewat modal.
  const home = await read("../src/app/page.js");
  assert.ok(!home.includes('href="/register"'));
  assert.ok(home.includes("import RegisterModal"));
  assert.ok(home.includes("<RegisterModal"));
  assert.ok(home.includes("setRegisterLevel(path.level)"));
});

test("kartu game beranda membuka rute saat login dan popup login saat belum", async () => {
  const home = await readFile(new URL("../src/app/page.js", import.meta.url), "utf8");
  assert.match(home, /async function openGame\(route\) \{\s*const \{ data \} = await supabase\.auth\.getUser\(\);\s*if \(data\.user\) router\.push\(route\);\s*else \{\s*setPendingGame\(route\);\s*setShowLogin\(true\);/);
  assert.match(home, /router\.push\(pendingGame \|\| "\/home"\)/);
  assert.match(home, /onClick=\{\(\) => openGame\(game\.route\)\}/);
  assert.doesNotMatch(home, /<Link key=\{game\.title\} href=\{game\.route\}/);
});
