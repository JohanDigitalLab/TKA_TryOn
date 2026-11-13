const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

const yes = (value) =>
  ["YA", "YES", "TRUE", "1"].includes(upper(value));

const no = (value) =>
  ["TIDAK", "NO", "FALSE", "0"].includes(upper(value));

const normalizeJenjang = (value) => {
  const v = upper(value);

  if (["SD", "MI"].includes(v)) return "SD";
  if (["SMP", "MTS", "MTs".toUpperCase()].includes(v)) return "SMP";
  if (["SMA", "MA"].includes(v)) return "SMA";
  if (["SMK"].includes(v)) return "SMK";

  return v;
};

export function validateWorkbook(sheets) {
  const issues = [];

  const add = (severity, sheet, row, field, message) => {
    issues.push({ severity, sheet, row, field, message });
  };

  const mapelRows = sheets.MATA_PELAJARAN.rows;
  const stimulusRows = sheets.STIMULUS.rows;
  const questionRows = sheets.SOAL.rows;
  const responseRows = sheets.RESPON_KUNCI.rows;

  const mapelMap = new Map();
  const stimulusMap = new Map();
  const questionMap = new Map();
  const responseMap = new Map();

  mapelRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.mapel_id);

    if (!id) {
      add("ERROR", "MATA_PELAJARAN", rowNumber, "mapel_id",
        "ID mata pelajaran wajib diisi.");
      return;
    }

    if (mapelMap.has(id)) {
      add("ERROR", "MATA_PELAJARAN", rowNumber, "mapel_id",
        `ID mata pelajaran duplikat: ${id}.`);
    } else {
      mapelMap.set(id, data);
    }

    [
      "jenjang",
      "kelas",
      "satuan_pendidikan",
      "mata_pelajaran",
      "kategori_mapel",
    ].forEach((field) => {
      if (!clean(data[field])) {
        add("ERROR", "MATA_PELAJARAN", rowNumber, field,
          `Kolom ${field} wajib diisi.`);
      }
    });

    if (
      data.jenjang &&
      !["SD", "SMP", "SMA", "SMK"].includes(
        normalizeJenjang(data.jenjang)
      )
    ) {
      add("ERROR", "MATA_PELAJARAN", rowNumber, "jenjang",
        "Jenjang harus SD/MI, SMP/MTs, SMA/MA, atau SMK.");
    }
  });

  stimulusRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.stimulus_id);

    if (!id) {
      add("ERROR", "STIMULUS", rowNumber, "stimulus_id",
        "ID stimulus wajib diisi.");
      return;
    }

    if (stimulusMap.has(id)) {
      add("ERROR", "STIMULUS", rowNumber, "stimulus_id",
        `ID stimulus duplikat: ${id}.`);
    } else {
      stimulusMap.set(id, data);
    }

    if (!clean(data.jenis_stimulus)) {
      add("ERROR", "STIMULUS", rowNumber, "jenis_stimulus",
        "Jenis stimulus wajib diisi.");
    }

    if (!clean(data.konten_teks) && !clean(data.file_url)) {
      add("ERROR", "STIMULUS", rowNumber, "konten_teks",
        "Stimulus harus memiliki teks atau file media.");
    }
  });

  questionRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.id_soal);

    if (!id) {
      add("ERROR", "SOAL", rowNumber, "id_soal",
        "ID soal wajib diisi.");
      return;
    }

    if (questionMap.has(id)) {
      add("ERROR", "SOAL", rowNumber, "id_soal",
        `ID soal duplikat: ${id}.`);
    } else {
      questionMap.set(id, data);
    }

    [
      "mapel_id",
      "jenjang",
      "kelas",
      "mata_pelajaran",
      "struktur_soal",
      "jenis_soal",
      "pertanyaan",
    ].forEach((field) => {
      if (!clean(data[field])) {
        add("ERROR", "SOAL", rowNumber, field,
          `Kolom ${field} wajib diisi.`);
      }
    });

    const mapel = mapelMap.get(clean(data.mapel_id));

    if (clean(data.mapel_id) && !mapel) {
      add("ERROR", "SOAL", rowNumber, "mapel_id",
        `Mata pelajaran ${data.mapel_id} tidak ditemukan.`);
    }

    if (mapel) {
      ["jenjang", "kelas", "mata_pelajaran"].forEach((field) => {
        if (upper(data[field]) !== upper(mapel[field])) {
          add("ERROR", "SOAL", rowNumber, field,
            `Data ${field} tidak sesuai dengan MATA_PELAJARAN.`);
        }
      });
    }

    const structure = upper(data.struktur_soal);
    const type = upper(data.jenis_soal);
    const stimulusId = clean(data.stimulus_id);

    if (!["SOAL_TUNGGAL", "SOAL_GRUP"].includes(structure)) {
      add("ERROR", "SOAL", rowNumber, "struktur_soal",
        "Struktur harus SOAL_TUNGGAL atau SOAL_GRUP.");
    }

    if (!["PG_TUNGGAL", "PGK_MA", "PGK_KATEGORI"].includes(type)) {
      add("ERROR", "SOAL", rowNumber, "jenis_soal",
        "Jenis soal tidak dikenali.");
    }

    if (structure === "SOAL_GRUP" && !stimulusId) {
      add("ERROR", "SOAL", rowNumber, "stimulus_id",
        "Soal grup wajib menggunakan stimulus.");
    }

    if (stimulusId && !stimulusMap.has(stimulusId)) {
      add("ERROR", "SOAL", rowNumber, "stimulus_id",
        `Stimulus ${stimulusId} tidak ditemukan.`);
    }

    if (!clean(data.hak_penggunaan)) {
      add("WARNING", "SOAL", rowNumber, "hak_penggunaan",
        "Hak penggunaan sumber belum dicantumkan.");
    }
  });

  responseRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.id_soal);

    if (!id) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "id_soal",
        "ID soal pada respons wajib diisi.");
      return;
    }

    if (!questionMap.has(id)) {
      add("ERROR", "RESPON_KUNCI", rowNumber, "id_soal",
        `Soal ${id} tidak ditemukan.`);
    }

    if (!responseMap.has(id)) responseMap.set(id, []);
    responseMap.get(id).push({ rowNumber, data });
  });

  questionRows.forEach(({ rowNumber, data }) => {
    const id = clean(data.id_soal);
    if (!id) return;

    const type = upper(data.jenis_soal);
    const responses = responseMap.get(id) || [];

    if (!responses.length) {
      add("ERROR", "SOAL", rowNumber, "id_soal",
        "Soal belum memiliki respons atau kunci jawaban.");
      return;
    }

    responses.forEach((response) => {
      const item = response.data;

      if (type !== "PGK_KATEGORI" && !clean(item.kode_respon)) {
        add("ERROR", "RESPON_KUNCI", response.rowNumber, "kode_respon",
          "Kode respons wajib diisi.");
      }

      if (!clean(item.teks_respon)) {
        add("ERROR", "RESPON_KUNCI", response.rowNumber, "teks_respon",
          "Teks opsi/pernyataan wajib diisi.");
      }
    });

    if (["PG_TUNGGAL", "PGK_MA"].includes(type)) {
      const codes = responses.map((r) => upper(r.data.kode_respon));
      const correct = responses.filter((r) => yes(r.data.is_correct));

      if (responses.length < 2) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "teks_respon",
          "Soal pilihan jawaban minimal memiliki dua opsi.");
      }

      if (new Set(codes).size !== codes.length) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "kode_respon",
          "Kode opsi tidak boleh duplikat.");
      }

      responses.forEach((r) => {
        if (!yes(r.data.is_correct) && !no(r.data.is_correct)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "is_correct",
            "is_correct harus YA atau TIDAK.");
        }
      });

      if (type === "PG_TUNGGAL" && correct.length !== 1) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "is_correct",
          "PG tunggal harus memiliki tepat satu kunci jawaban.");
      }

      if (type === "PGK_MA" && correct.length < 1) {
        add("ERROR", "RESPON_KUNCI", rowNumber, "is_correct",
          "PGK multi-jawaban minimal memiliki satu kunci.");
      }
    }

    if (type === "PGK_KATEGORI") {
      const numbers = new Set();

      responses.forEach((r) => {
        const number = clean(r.data.nomor_pernyataan);
        const categories = clean(r.data.kategori_respon)
          .split(/[\/|;,]/)
          .map((v) => upper(v))
          .filter(Boolean);

        const answer = upper(r.data.kunci_kategori);

        if (!number || numbers.has(number)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "nomor_pernyataan",
            "Nomor pernyataan wajib diisi dan tidak boleh duplikat.");
        }

        numbers.add(number);

        if (!categories.length || !answer) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "kategori_respon",
            "Kategori dan kunci kategori wajib diisi.");
        } else if (!categories.includes(answer)) {
          add("ERROR", "RESPON_KUNCI", r.rowNumber, "kunci_kategori",
            "Kunci harus sesuai dengan salah satu kategori.");
        }
      });
    }

    if (responses.every((r) => !clean(r.data.pembahasan_umum))) {
      add("WARNING", "RESPON_KUNCI", rowNumber, "pembahasan_umum",
        "Pembahasan belum dicantumkan.");
    }
  });

  return issues;
}
