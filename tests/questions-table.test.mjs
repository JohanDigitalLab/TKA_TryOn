import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/components/admin/questions-workspace.js', import.meta.url), 'utf8');

test('ukuran halaman 25/50/100 dipakai untuk range database dan total halaman', () => {
  assert.match(source, /const PAGE_SIZE_OPTIONS = \[25, 50, 100\]/);
  assert.match(source, /\[pageSize, setPageSize\] = useState\(25\)/);
  assert.match(source, /const from = page \* pageSize/);
  assert.match(source, /const to = from \+ pageSize - 1/);
  assert.match(source, /\.range\(from, to\)/);
  assert.match(source, /Math.ceil\(totalCount \/ pageSize\)/);
  assert.match(source, /setPageSize\(size\);\s+setPage\(0\)/);
  assert.match(source, /page,\s+pageSize,/);
});

test('tabel tunggal mempertahankan identitas dan menampilkan materi serta ringkasan pagination', () => {
  assert.equal((source.match(/<table\b/g) || []).length, 1);
  assert.doesNotMatch(source, /Total Bank Soal|filterType|setFilterType|>Tanggal<|formatDate/);
  for (const label of ['Kode Soal', 'Jenjang / Kelas', 'Mata Pelajaran', 'Materi / Topik', 'Detail / Telaah', 'soal pada halaman ini']) {
    assert.ok(source.includes(label), label);
  }
  assert.match(source, /question.material\?\.trim\(\) \|\| "—"/);
  assert.match(source, /question.sub_material\?\.trim\(\) \|\| "—"/);
  for (const field of ['education_level_id', 'grade', 'subject_name', 'question_status']) {
    assert.ok(source.includes(`query.eq("${field}"`), field);
  }
  assert.match(source, /return searchable.includes\(keyword\)/);
});

test('aksi lama dipertahankan dan aksi baru tidak melewati backend atau permission', () => {
  assert.match(source, /target="tka-question-detail"/);
  assert.match(source, /encodeURIComponent\(question.id\)/);
  assert.match(source, /can\(PERMISSIONS.import\) \? \(\s+<Link\s+href="\/admin\/import"/);
  assert.match(source, /onClick=\{\(\) => openArchive\(question\)\}/);
  assert.match(source, /disabled=\{!can\(PERMISSIONS.archive\)/);
  assert.match(source, /id="question-archive-help"/);
  assert.doesNotMatch(source, /\.delete\(/);
});

test('filter catalog tidak berasal dari halaman aktif dan halaman usang dibatasi ulang', () => {
  assert.match(source, /catalog.map\(\(q\) => q.subject_name\)/);
  assert.match(source, /\.order\("id"\)\.range\(from, from \+ 499\)/);
  assert.match(source, /if \(page > lastPage\) \{\s+setPage\(lastPage\)/);
  assert.match(source, /setSearch\(event.target.value\); setPage\(0\)/);
});

test('kondisi daftar dan scroll disimpan per tab tanpa menyimpan isi soal', () => {
  assert.match(source, /sessionStorage.getItem\(LIST_STATE_KEY\)/);
  assert.match(source, /sessionStorage.setItem\(LIST_STATE_KEY/);
  assert.match(source, /window.name = "tka-question-list"/);
  assert.match(source, /window.scrollTo/);
  assert.match(source, /if \(!detailOnly && !listReady\) return/);
});
