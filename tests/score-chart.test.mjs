import test from "node:test";
import assert from "node:assert/strict";
import { buildScoreChart } from "../src/lib/student/score-chart.mjs";

test("grafik kosong tidak menghasilkan koordinat invalid", () => {
  const chart = buildScoreChart([]);
  assert.deepEqual(chart.points, []);
  assert.equal(chart.line, "");
});

test("satu sesi ditampilkan sebagai titik di tengah grafik", () => {
  const chart = buildScoreChart([{ score: 80 }]);
  assert.equal(chart.points[0].x, (chart.left + chart.width - chart.right) / 2);
  assert(Number.isFinite(chart.points[0].y));
});

test("garis menghubungkan nilai sesuai urutan sesi dengan skala tetap", () => {
  const chart = buildScoreChart([{ score: 0 }, { score: 35 }, { score: 80 }, { score: 100 }]);
  assert.equal(chart.points[0].y, chart.height - chart.bottom);
  assert.equal(chart.points[3].y, chart.top);
  assert(chart.points.every((point, index) => !index || point.x > chart.points[index - 1].x));
  assert(chart.points[1].y > chart.points[2].y);
  assert.equal(chart.line.split(" ").length, 4);
});

test("nilai tidak valid diamankan dan banyak sesi memperlebar grafik", () => {
  const chart = buildScoreChart([{ score: -5 }, { score: 110 }, { score: "invalid" }, { score: "35.50" }]);
  assert.deepEqual(chart.points.map((point) => point.score), [0, 100, 0, 35.5]);
  assert(buildScoreChart(Array.from({ length: 50 }, () => ({ score: 50 }))).width > chart.width);
});
