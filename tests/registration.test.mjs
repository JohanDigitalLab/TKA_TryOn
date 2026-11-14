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

test("tautan undangan tetap mengunci jalur siswa sekolah dan mempertahankan kode", () => {
  const next = `/school/join?code=${"a".repeat(64)}`;
  const selected = context(new URLSearchParams({ method: "independent", next }).toString());
  assert.equal(selected.method, "school");
  assert.equal(selected.next, next);
  assert.equal(context("next=/school/join-other").method, null);
});

test("jenjang hanya diminta bila belum dipilih dan tetap divalidasi", () => {
  assert.equal(registrationEducationLevel(context(""), "sd"), "sd");
  assert.throws(() => registrationEducationLevel(context(""), ""), /Pilih jenjang/);
  assert.throws(() => registrationEducationLevel(context(""), "invalid"), /Pilih jenjang/);
});

test("tombol paket berbeda tujuan dan formulir menampilkan konteks tetap", async () => {
  const read = path => readFile(new URL(path, import.meta.url), "utf8");
  const subscription = await read("../src/app/subscription/page.js");
  assert.ok(subscription.includes('href: "/register?method=independent"'));
  assert.ok(subscription.includes('href: "/school/register"'));
  assert.ok(subscription.includes('href="/register?method=school"'));
  assert.ok(subscription.includes("href={plan.href}"));
  const register = await read("../src/app/register/page.js");
  assert.ok(register.includes("{context.method ? ("));
  assert.ok(register.includes("{level ? ("));
  assert.ok(register.includes("registrationEducationLevel(context, values.education_level)"));
  assert.ok(register.includes("registration_method: method"));
  const home = await read("../src/app/page.js");
  assert.ok(home.includes("studentRegistrationPath({ level: level.value })"));
});
