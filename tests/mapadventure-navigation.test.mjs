import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("island navigation stays above the topic map and selects an available island by default", () => {
  const page = read("src/components/student/mapadventure/MapAdventure.jsx");
  assert.match(page, /state\?\.islands\.find\(i => i\.status !== "LOCKED"\)/);
  assert.ok(page.indexOf("<IslandNavigation") < page.indexOf("<TopicMap"));
  assert.match(page, /onSelect=\{id => setSelection\(\{ island: id \}\)\}/);
  assert.match(page, /n\.theme_id === island\?\.id/);
  assert.match(page, /<TopicTrail node=\{node\} game=\{game\}/);
  assert.doesNotMatch(page, /Kepulauan Pengetahuan/);
});

test("island list supports horizontal scrolling, arrows, resize and server locks", () => {
  const source = read("src/components/student/mapadventure/IslandMap.jsx");
  assert.match(source, /Geser daftar pulau ke kiri/);
  assert.match(source, /Geser daftar pulau ke kanan/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /scrollBy/);
  assert.match(source, /ResizeObserver/);
  assert.match(source, /requestAnimationFrame\(centerActiveIsland\)/);
  assert.match(source, /ResizeObserver\(centerActiveIsland\)/);
  assert.match(source, /behavior: "instant"/);
  assert.match(source, /\[selectedId, islands, updateArrows\]/);
  assert.match(source, /disabled=\{busy \|\| locked\}/);
  assert.match(source, /island\.status === "LOCKED"/);
});

test("child map branches after practice and keeps distinct icons for locked nodes", () => {
  const page = read("src/components/student/mapadventure/MapAdventure.jsx");
  assert.match(page, /const edges = \[\[0, 1\], \[1, 2\], \[2, 3\], \[1, 4\]\]/);
  assert.match(page, /\{stage.symbol\}/);
  assert.doesNotMatch(page, /<Lock/);
  assert.match(page, /bg-slate-100 grayscale/);
  assert.match(page, /aria-label="Kembali ke map pulau"/);
  assert.match(page, /aria-label="Buka tas perlengkapan"/);
  assert.match(page, /fixed inset-x-0 z-30/);
  assert.match(page, /Math.max\(headerBottom \+ 16, bounds.top \+ 16\)/);
  assert.match(page, /window.getComputedStyle\(header\)/);
  assert.match(page, /getBoundingClientRect/);
  assert.match(page, /window.addEventListener\("scroll", updatePosition/);
  assert.match(page, /\[\[68, 92\], \[50, 235\], \[20, 365\], \[20, 540\], \[78, 645\]\]/);
  assert.match(page, /text-xs font-bold text-indigo-500 sm:text-sm/);
  assert.match(page, /const midY = \(y \+ ny\) \/ 2/);
  assert.match(page, /h-12 w-12 shrink-0 items-center justify-center whitespace-nowrap/);
});

test("compact header matches BossFight structure and removes redundant map labels", () => {
  const page = read("src/components/student/mapadventure/MapAdventure.jsx");
  const islands = read("src/components/student/mapadventure/IslandMap.jsx");
  assert.match(page, /<DashboardBreadcrumb current="Map Adventure"/);
  assert.match(page, /max-w-4xl/);
  assert.match(page, /mb-8 flex items-center justify-between gap-3/);
  assert.match(page, /state && settingsOpen && <Modal title="Pengaturan"/);
  assert.match(page, /aria-label="Pengaturan" aria-haspopup="dialog"/);
  assert.match(page, /<select aria-label="Mata pelajaran"/);
  assert.match(page, /aria-label="Saldo dan bintang"/);
  assert.doesNotMatch(page, /Ketuk topik untuk menjelajah/);
  assert.ok(page.indexOf('aria-label="Saldo dan bintang"') > page.indexOf('<IslandNavigation'));
  assert.doesNotMatch(page, /Muat ulang data|XP profil|progres tersimpan otomatis| global/);
  assert.doesNotMatch(islands, /PULAU \{island.order_number\}|<Lock/);
  assert.match(islands, /before:mx-auto after:mx-auto/);
});

test("errors and notifications use one dismissible top-layer popup including answer validation", () => {
  const page = read("src/components/student/mapadventure/MapAdventure.jsx");
  const hook = read("src/components/student/mapadventure/useMapAdventure.js");
  assert.equal((page.match(/<Feedback game=\{game\} \/>/g) || []).length, 1);
  assert.match(page, /element.showModal\(\)/);
  assert.match(page, /data-map-notification aria-labelledby/);
  assert.match(page, /onCancel=\{event => \{ event.preventDefault\(\); game.closeFeedback\(\); \}\}/);
  assert.match(page, /game.reportError\(error.message\)/);
  assert.match(hook, /const closeFeedback = useCallback/);
  assert.match(hook, /const reportError = useCallback/);
});

test("topic map renders connected nodes using authoritative material and gatekeeper status", () => {
  const source = read("src/components/student/mapadventure/IslandMap.jsx");
  assert.match(source, /aria-label="Peta topik pulau"/);
  assert.match(source, /<svg/);
  assert.match(source, /<path/);
  assert.match(source, /topic\.material_status === "LOCKED"/);
  assert.match(source, /topic\.gatekeeper_status === "COMPLETED"/);
  assert.match(source, /onSelect\(topic\.id\)/);
  assert.match(source, /topic\.gatekeeper_stars/);
});
