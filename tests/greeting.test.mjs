import test from "node:test";
import assert from "node:assert/strict";
import { getTimeGreeting } from "../src/lib/student/greeting.mjs";

// Construct local dates so tests do not depend on the machine's timezone.
for (const [hour, minute, expected] of [
  [0, 0, "Selamat Malam"],
  [3, 59, "Selamat Malam"],
  [4, 0, "Selamat Pagi"],
  [10, 59, "Selamat Pagi"],
  [11, 0, "Selamat Siang"],
  [17, 59, "Selamat Siang"],
  [18, 0, "Selamat Malam"],
  [23, 59, "Selamat Malam"],
]) {
  test(`sapaan waktu lokal ${hour}:${String(minute).padStart(2, "0")} adalah ${expected}`, () => {
    assert.equal(getTimeGreeting(new Date(2026, 10, 14, hour, minute)), expected);
  });
}
