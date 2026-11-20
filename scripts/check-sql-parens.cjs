// Pemeriksa keseimbangan tanda kurung pada body fungsi PL/pgSQL ($$ ... $$)
// di file migrasi SQL. Mengabaikan komentar baris (--) dan string literal ('...').
// Pemakaian: node scripts/check-sql-parens.cjs [file1.sql file2.sql ...]
const fs = require("fs");
const path = require("path");

const targets =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : fs
        .readdirSync("docs/database")
        .filter((f) => f.endsWith(".sql"))
        .map((f) => path.join("docs/database", f));

function stripLiteralsAndComments(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "'") {
      i++; // buka kutip
      while (i < text.length) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += " "; // placeholder string
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

let failed = 0;
for (const file of targets) {
  const raw = fs.readFileSync(file, "utf8");
  // Ambil potongan di antara $$ ... $$ berpasangan.
  const parts = raw.split("$$");
  parts.forEach((body, idx) => {
    if (idx % 2 === 0) return; // di luar body fungsi
    const cleaned = stripLiteralsAndComments(body);
    let depth = 0;
    let minDepth = 0;
    let line = 1;
    for (const ch of cleaned) {
      if (ch === "\n") line++;
      else if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth < minDepth) minDepth = depth;
      }
    }
    if (depth !== 0 || minDepth < 0) {
      failed++;
      console.log(
        `FAIL ${file} [blok $$ #${idx}] depth=${depth} min=${minDepth}`,
      );
    }
  });
}

if (failed === 0) {
  console.log(`OK: ${targets.length} file, semua body $$ seimbang kurungnya.`);
} else {
  console.log(`${failed} blok bermasalah.`);
  process.exit(1);
}
