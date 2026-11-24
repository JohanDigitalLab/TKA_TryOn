"use client";
/* ============================================================================
 * MAP ADVENTURE — Peta Eksplorasi Materi (Skill Tree)
 * Gamifikasi "100% Pure Effort" untuk bank soal SD/SMP/SMA.
 * 4 Pulau · tiap pulau 4–5 topik · soal ringan agar progres mudah disimulasi.
 * ==========================================================================*/
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import "./mapadventure.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Backpack, BookOpen, Check, ChevronLeft, ChevronRight, Coins, Dumbbell, Lightbulb, Lock, Moon, Package, Percent, RefreshCw, Scroll, Settings, ShieldCheck, Snowflake, Sparkles, Star, Sun, Swords, Tent, Trophy, X, } from "lucide-react";
/* ============================ KATALOG TOOLS =============================== */
const TOOLS = [
    { id: "clue", name: "Clue", cost: 30, desc: "Menampilkan petunjuk langkah awal / rumus kunci pada soal aktif.", icon: Lightbulb, color: "text-amber-500" },
    { id: "freeze", name: "Freeze Time", cost: 40, desc: "Menghentikan timer selama 30 detik (hanya di Pos Penjaga).", icon: Snowflake, color: "text-cyan-500" },
    { id: "fifty", name: "50 : 50", cost: 50, desc: "Menghapus 2 opsi jawaban yang salah secara acak.", icon: Percent, color: "text-violet-500" },
    { id: "skip", name: "Skip & Replace", cost: 60, desc: "Mengganti soal saat ini dengan soal cadangan dari bank soal.", icon: RefreshCw, color: "text-emerald-500" },
    { id: "shield", name: "Second Chance", cost: 75, desc: "Perisai: jika salah pilih pertama, kamu boleh memilih ulang.", icon: ShieldCheck, color: "text-rose-500" },
];
const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
/* ========================= BUILDER SOAL RINGKAS =========================== */
function mk(id, prompt, correct, wrongs, clue, pos) {
    const options = [...wrongs];
    options.splice(pos, 0, correct);
    return { id, prompt, options, answer: pos, clue };
}
/** Deret aritmetika otomatis: soal super gampang untuk simulasi progres. */
function arithSeries(idBase, op, pairs) {
    return pairs.map(([a, b], i) => {
        const r = op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : a / b;
        const candidates = [r + 1, r - 1, r + 2, r + 3, r - 2]
            .filter((n) => n >= 0 && n !== r)
            .map(String)
            .slice(0, 3);
        return mk(`${idBase}${i}`, `${a} ${op} ${b} = …`, String(r), candidates, `Hitung pelan-pelan: ${a} ${op} ${b} = ${r}.`, i % 4);
    });
}
function mkAll(idBase, rows) {
    return rows.map(([p, c, w, cl], i) => mk(`${idBase}${i}`, p, c, w, cl, i % 4));
}
/* ============================ MOCKUP 4 PULAU ============================== */
const ISLANDS_MATH = [
    /* ---------------------- PULAU 1 · HITUNG (SD) -------------------------- */
    {
        id: "hitung",
        name: "Pulau Hitung",
        emoji: "🧮",
        theme: "Fondasi Berhitung · SD",
        grad: "from-sky-400 to-blue-600",
        softBorder: "border-sky-200 dark:border-sky-500/30",
        topics: [
            {
                id: "tambah",
                name: "Penjumlahan",
                emoji: "➕",
                materi: {
                    title: "Kemah Ilmu — Penjumlahan Santai",
                    paragraphs: [
                        "Penjumlahan adalah menggabungkan dua kelompok benda menjadi satu. Contoh: 3 kelereng + 2 kelereng = 5 kelereng.",
                        "TIPS: Gunakan garis bilangan. Mulai dari angka besar, lalu maju sebanyak angka kecil. 7 + 5 → mulai dari 7, maju 5 langkah → 12.",
                        "Sifat pertukaran berlaku: 7 + 5 sama dengan 5 + 7. Pilih urutan yang paling mudah di kepalamu!",
                    ],
                },
                latihan: arithSeries("tm-l", "+", [[7, 5], [12, 6], [9, 8]]),
                side: arithSeries("tm-s", "+", [[25, 14], [46, 28]]),
                gate: arithSeries("tm-g", "+", [[6, 7], [13, 5], [20, 15], [8, 9], [34, 25]]),
                backup: arithSeries("tm-b", "+", [[11, 10], [42, 17]]),
            },
            {
                id: "kurang",
                name: "Pengurangan",
                emoji: "➖",
                materi: {
                    title: "Kemah Ilmu — Pengurangan",
                    paragraphs: [
                        "Pengurangan adalah mengambil sebagian dari sekelompok benda. 10 − 3 berarti dari 10 diambil 3, sisa 7.",
                        "TIPS: Hitung mundur di garis bilangan, atau pikirkan 'berapa tambahan dari yang kecil ke yang besar?' (13 − 7 → 7 + 6 = 13, jawab 6).",
                        "Pengurangan adalah kebalikan penjumlahan: jika 8 + 5 = 13, maka 13 − 5 = 8.",
                    ],
                },
                latihan: arithSeries("kr-l", "−", [[15, 6], [20, 8], [13, 7]]),
                side: arithSeries("kr-s", "−", [[45, 18], [62, 27]]),
                gate: arithSeries("kr-g", "−", [[12, 5], [18, 9], [25, 13], [30, 14], [41, 26]]),
                backup: arithSeries("kr-b", "−", [[16, 7], [50, 23]]),
            },
            {
                id: "kali",
                name: "Perkalian",
                emoji: "✖️",
                materi: {
                    title: "Kemah Ilmu — Perkalian",
                    paragraphs: [
                        "Perkalian adalah penjumlahan berulang. 4 × 3 artinya 4 + 4 + 4 = 12.",
                        "TIPS: Hafalkan perkalian kecil (2–5) lewat lagu atau tepuk tangan. Sisanya tinggal diulang-ulang sedikit.",
                        "Sifat pertukaran juga berlaku: 7 × 3 = 3 × 7. Kalau 7 × 3 sulit, balik jadi 3 × 7.",
                    ],
                },
                latihan: arithSeries("kl-l", "×", [[3, 4], [5, 6], [2, 7]]),
                side: arithSeries("kl-s", "×", [[8, 7], [9, 6]]),
                gate: arithSeries("kl-g", "×", [[4, 5], [7, 3], [6, 8], [9, 4], [3, 9]]),
                backup: arithSeries("kl-b", "×", [[5, 5], [8, 6]]),
            },
            {
                id: "bagi",
                name: "Pembagian",
                emoji: "➗",
                materi: {
                    title: "Kemah Ilmu — Pembagian",
                    paragraphs: [
                        "Pembagian adalah membagi rata. 12 ÷ 3 = 4 karena 3 × 4 = 12.",
                        "TIPS: Selalu balik ke perkalian! '12 dibagi 3' sama dengan '3 kali berapa hasilnya 12?'.",
                        "Pembagian adalah kebalikan perkalian, seperti pengurangan adalah kebalikan penjumlahan.",
                    ],
                },
                latihan: arithSeries("bg-l", "÷", [[12, 3], [20, 4], [18, 6]]),
                side: arithSeries("bg-s", "÷", [[56, 7], [72, 8]]),
                gate: arithSeries("bg-g", "÷", [[15, 3], [24, 6], [36, 4], [42, 7], [63, 9]]),
                backup: arithSeries("bg-b", "÷", [[28, 4], [45, 9]]),
            },
            {
                id: "campur",
                name: "Operasi Campuran",
                emoji: "🔀",
                materi: {
                    title: "Kemah Ilmu — Urutan Operasi",
                    paragraphs: [
                        "Aturan emas: kerjakan perkalian/pembagian DULU, baru penjumlahan/pengurangan. Kurung paling dulu!",
                        "Contoh: 5 + 3 × 2 → kerjakan 3 × 2 = 6 dulu → 5 + 6 = 11 (bukan 16!).",
                        "TIPS hafalan: 'Kurung, Kali-Bagi, Tambah-Kurang' — KKT.",
                    ],
                },
                latihan: mkAll("cm-l", [
                    ["5 + 3 × 2 = …", "11", ["16", "10", "13"], "Kali dulu: 3 × 2 = 6 → 5 + 6 = 11."],
                    ["20 − 4 × 3 = …", "8", ["48", "12", "5"], "Kali dulu: 4 × 3 = 12 → 20 − 12 = 8."],
                    ["(6 + 4) ÷ 5 = …", "2", ["14", "5", "4"], "Kurung dulu: 6 + 4 = 10 → 10 ÷ 5 = 2."],
                ]),
                side: mkAll("cm-s", [
                    ["3 × (7 − 2) = …", "15", ["11", "21", "16"], "Kurung dulu: 7 − 2 = 5 → 3 × 5 = 15."],
                    ["50 ÷ (2 + 8) = …", "5", ["10", "25", "8"], "Kurung dulu: 2 + 8 = 10 → 50 ÷ 10 = 5."],
                ]),
                gate: mkAll("cm-g", [
                    ["4 + 4 × 4 = …", "20", ["32", "16", "24"], "4 × 4 = 16 → 4 + 16 = 20."],
                    ["(12 − 4) ÷ 2 = …", "4", ["8", "2", "6"], "12 − 4 = 8 → 8 ÷ 2 = 4."],
                    ["6 × 3 − 8 = …", "10", ["18", "26", "12"], "6 × 3 = 18 → 18 − 8 = 10."],
                    ["30 ÷ 5 + 9 = …", "15", ["6", "12", "14"], "30 ÷ 5 = 6 → 6 + 9 = 15."],
                    ["(2 + 3) × (4 + 1) = …", "25", ["13", "20", "15"], "5 × 5 = 25."],
                ]),
                backup: mkAll("cm-b", [
                    ["7 + 7 × 0 = …", "7", ["0", "14", "49"], "7 × 0 = 0 → 7 + 0 = 7."],
                    ["(10 − 6) × 3 = …", "12", ["8", "16", "18"], "10 − 6 = 4 → 4 × 3 = 12."],
                ]),
            },
        ],
    },
    /* --------------------- PULAU 2 · PECAHAN (SD) -------------------------- */
    {
        id: "pecahan",
        name: "Pulau Pecahan",
        emoji: "🍕",
        theme: "Poten-Poten Pizza · SD",
        grad: "from-rose-400 to-pink-600",
        softBorder: "border-rose-200 dark:border-rose-500/30",
        topics: [
            {
                id: "pengenalan",
                name: "Pengenalan Pecahan",
                emoji: "🍕",
                materi: {
                    title: "Kemah Ilmu — Apa itu Pecahan?",
                    paragraphs: [
                        "Pecahan menyatakan bagian dari keseluruhan. Pizza dipotong 8 sama besar; 1 potong = 1/8.",
                        "Bilangan atas = pembilang (berapa bagian diambil), bawah = penyebut (total bagian).",
                        "Setengah = 1/2, seperempat = 1/4. Makin besar penyebut, makin kecil tiap potongannya!",
                    ],
                },
                latihan: mkAll("pg-l", [
                    ["Pizza 8 bagian sama besar. 1 bagian ditulis …", "1/8", ["1/2", "1/4", "8/1"], "Penyebut = total 8 bagian, pembilang 1."],
                    ["Dimakan 3 dari 4 potong kue. Bagian termakan = …", "3/4", ["1/4", "4/3", "2/4"], "3 dari 4 → 3/4."],
                    ["'Setengah' ditulis …", "1/2", ["1/3", "2/1", "1/4"], "Setengah = dibagi 2 sama rata."],
                ]),
                side: mkAll("pg-s", [
                    ["Donat 6 bagian, dimakan 2. Sisa …", "4/6", ["2/6", "6/2", "1/2"], "6 − 2 = 4 sisa dari 6 → 4/6."],
                    ["Kue 10 bagian, diambil 7. Bagian diambil = …", "7/10", ["3/10", "10/7", "7/7"], "7 dari 10 → 7/10."],
                ]),
                gate: mkAll("pg-g", [
                    ["Kertas dilipat 4 sama besar, diwarnai 1 bagian → …", "1/4", ["1/2", "3/4", "4/1"], "1 dari 4 → 1/4."],
                    ["8 permen, 3 merah. Bagian merah = …", "3/8", ["5/8", "8/3", "3/5"], "3 dari 8 → 3/8."],
                    ["Sebotol air diminum 1 dari 2 bagian sama → …", "1/2", ["1/3", "2/1", "1/4"], "Setengah = 1/2."],
                    ["Kebun 5 petak, 2 ditanami. Bagian ditanami = …", "2/5", ["3/5", "5/2", "2/2"], "2 dari 5 → 2/5."],
                    ["Pita 9 sama panjang, dipotong 4. Bagian terpotong = …", "4/9", ["5/9", "9/4", "4/5"], "4 dari 9 → 4/9."],
                ]),
                backup: mkAll("pg-b", [
                    ["Kue 12 bagian, dimakan 5 → bagian termakan = …", "5/12", ["7/12", "12/5", "5/7"], "5 dari 12 → 5/12."],
                    ["6 siswa, 2 pakai kacamata. Bagian berkacamata = …", "2/6", ["4/6", "6/2", "1/6"], "2 dari 6 → 2/6."],
                ]),
            },
            {
                id: "senilai",
                name: "Pecahan Senilai",
                emoji: "🪙",
                materi: {
                    title: "Kemah Ilmu — Pecahan Senilai",
                    paragraphs: [
                        "Pecahan senilai = nilainya sama meski angkanya beda: 1/2 = 2/4 = 3/6.",
                        "Caranya: kali atau bagi pembilang DAN penyebut dengan angka yang sama. 1/2 × (3/3) = 3/6.",
                        "Bayangkan pizza: 1 potong dari 2 sama besarnya dengan 2 potong dari 4!",
                    ],
                },
                latihan: mkAll("sn-l", [
                    ["1/2 = …/6", "3", ["2", "4", "6"], "2 × 3 = 6, maka 1 × 3 = 3."],
                    ["2/3 = …/9", "6", ["3", "5", "8"], "3 × 3 = 9, maka 2 × 3 = 6."],
                    ["3/4 = 6/…", "8", ["6", "12", "4"], "3 × 2 = 6, maka 4 × 2 = 8."],
                ]),
                side: mkAll("sn-s", [
                    ["1/2 = 4/…", "8", ["6", "4", "10"], "1 × 4 = 4 → 2 × 4 = 8."],
                    ["2/5 = …/15", "6", ["5", "8", "10"], "5 × 3 = 15 → 2 × 3 = 6."],
                ]),
                gate: mkAll("sn-g", [
                    ["1/3 = …/12", "4", ["3", "6", "9"], "3 × 4 = 12 → 1 × 4 = 4."],
                    ["2/4 senilai dengan …", "1/2", ["2/3", "3/4", "1/4"], "Bagi dua: 2/4 = 1/2."],
                    ["3/5 = 6/…", "10", ["8", "15", "5"], "3 × 2 = 6 → 5 × 2 = 10."],
                    ["4/6 senilai dengan …", "2/3", ["3/4", "1/2", "4/5"], "Bagi 2: 4/6 = 2/3."],
                    ["1/4 = …/8", "2", ["4", "3", "1"], "4 × 2 = 8 → 1 × 2 = 2."],
                ]),
                backup: mkAll("sn-b", [
                    ["5/10 senilai dengan …", "1/2", ["1/5", "2/5", "1/10"], "Bagi 5: 5/10 = 1/2."],
                    ["2/6 = …/3", "1", ["2", "3", "6"], "6 ÷ 2 = 3 → 2 ÷ 2 = 1."],
                ]),
            },
            {
                id: "jumlah-pecahan",
                name: "Penjumlahan Pecahan",
                emoji: "🧩",
                materi: {
                    title: "Kemah Ilmu — Menjumlah Pecahan (Penyebut Sama)",
                    paragraphs: [
                        "Jika penyebut SAMA, tinggal jumlahkan pembilangnya: 1/4 + 2/4 = 3/4.",
                        "Penyebut tidak ikut dijumlah! 1/4 + 2/4 BUKAN 3/8.",
                        "Jika hasilnya 4/4, itu sama dengan 1 utuh.",
                    ],
                },
                latihan: mkAll("jl-l", [
                    ["1/4 + 2/4 = …", "3/4", ["3/8", "1/2", "2/4"], "Pembilang: 1 + 2 = 3, penyebut tetap 4."],
                    ["2/5 + 1/5 = …", "3/5", ["3/10", "2/5", "4/5"], "2 + 1 = 3 → 3/5."],
                    ["3/8 + 2/8 = …", "5/8", ["5/16", "1/8", "6/8"], "3 + 2 = 5 → 5/8."],
                ]),
                side: mkAll("jl-s", [
                    ["1/3 + 2/3 = …", "1 utuh", ["2/3", "1/3", "3/1"], "1 + 2 = 3 → 3/3 = 1 utuh."],
                    ["3/6 + 1/6 = …", "4/6", ["4/12", "2/6", "5/6"], "3 + 1 = 4 → 4/6."],
                ]),
                gate: mkAll("jl-g", [
                    ["1/2 + 1/2 = …", "1 utuh", ["1/2", "2/2 persis", "1/4"], "1 + 1 = 2 → 2/2 = 1 utuh."],
                    ["2/7 + 3/7 = …", "5/7", ["5/14", "4/7", "6/7"], "2 + 3 = 5 → 5/7."],
                    ["1/6 + 2/6 = …", "3/6", ["3/12", "2/6", "4/6"], "1 + 2 = 3 → 3/6."],
                    ["4/9 + 2/9 = …", "6/9", ["6/18", "5/9", "7/9"], "4 + 2 = 6 → 6/9."],
                    ["2/4 + 1/4 = …", "3/4", ["3/8", "2/4", "1/4"], "2 + 1 = 3 → 3/4."],
                ]),
                backup: mkAll("jl-b", [
                    ["5/8 + 1/8 = …", "6/8", ["6/16", "4/8", "7/8"], "5 + 1 = 6 → 6/8."],
                    ["1/5 + 3/5 = …", "4/5", ["4/10", "2/5", "3/5"], "1 + 3 = 4 → 4/5."],
                ]),
            },
            {
                id: "desimal",
                name: "Desimal",
                emoji: "🔢",
                materi: {
                    title: "Kemah Ilmu — Sahabat Desimal",
                    paragraphs: [
                        "Desimal adalah pecahan berpenyebut 10, 100, dst. 1/2 = 0,5 dan 1/4 = 0,25.",
                        "7/10 = 0,7 — angka setelah koma menunjukkan persepuluhan.",
                        "0,5 + 0,5 = 1,0 = satu utuh. Koma harus lurus saat menjumlah!",
                    ],
                },
                latihan: mkAll("ds-l", [
                    ["1/2 sebagai desimal = …", "0,5", ["0,2", "1,2", "0,25"], "Setengah = 0,5."],
                    ["3/4 sebagai desimal = …", "0,75", ["0,34", "0,43", "0,25"], "3 ÷ 4 = 0,75."],
                    ["7/10 sebagai desimal = …", "0,7", ["0,1", "7,0", "0,17"], "Persepuluhan: 7/10 = 0,7."],
                ]),
                side: mkAll("ds-s", [
                    ["0,5 + 0,5 = …", "1", ["0,10", "0,55", "1,5"], "Setengah + setengah = satu utuh."],
                    ["1/4 sebagai desimal = …", "0,25", ["0,4", "0,5", "0,14"], "1 ÷ 4 = 0,25."],
                ]),
                gate: mkAll("ds-g", [
                    ["2/10 = …", "0,2", ["0,02", "2,1", "0,25"], "2 persepuluh = 0,2."],
                    ["0,5 = …", "1/2", ["1/5", "5/100", "1/4"], "0,5 = setengah = 1/2."],
                    ["9/10 = …", "0,9", ["0,09", "9,1", "0,19"], "9 persepuluh = 0,9."],
                    ["1/5 = …", "0,2", ["0,1", "0,5", "0,15"], "1 ÷ 5 = 0,2."],
                    ["0,25 = …", "1/4", ["1/2", "1/5", "2/5"], "0,25 = seperempat."],
                ]),
                backup: mkAll("ds-b", [
                    ["5/10 = …", "0,5", ["0,05", "5,1", "0,15"], "5 persepuluh = 0,5."],
                    ["3/5 = …", "0,6", ["0,3", "0,35", "0,5"], "3 ÷ 5 = 0,6."],
                ]),
            },
        ],
    },
    /* -------------------- PULAU 3 · ALJABAR (SMP) -------------------------- */
    {
        id: "aljabar",
        name: "Pulau Aljabar",
        emoji: "🔤",
        theme: "Peta Harta x & y · SMP",
        grad: "from-teal-400 to-emerald-600",
        softBorder: "border-teal-200 dark:border-teal-500/30",
        topics: [
            {
                id: "plsv",
                name: "Persamaan Linear",
                emoji: "⚖️",
                materi: {
                    title: "Kemah Ilmu — Pulau Aljabar: Persamaan Linear",
                    paragraphs: [
                        "Selamat datang di Pulau Aljabar, Petualang! Di kemah ini kamu menguasai fondasi sebelum menyeberang ke Pos Penjaga.",
                        "Persamaan Linear Satu Variabel (PLSV): bentuk umumnya ax + b = c. Tujuannya: isolasi x sendirian.",
                        "RUMUS KUNCI — Pindahkan dengan lawan operasi: 3x + 5 = 20 → kurangi 5 → 3x = 15 → bagi 3 → x = 5.",
                        "RUMUS KUNCI — Distribusi dulu: 2(x − 4) = 10 → 2x − 8 = 10 → 2x = 18 → x = 9.",
                        "TIPS: Substitusikan kembali nilai x ke soal awal. Kalau ruas kiri = ruas kanan, jawabanmu sah!",
                    ],
                },
                latihan: mkAll("al-l", [
                    ["4x + 8 = 24 → x = …", "4", ["2", "6", "8"], "4x = 24 − 8 = 16 → x = 16 ÷ 4."],
                    ["3(x − 2) = 12 → x = …", "6", ["4", "5", "8"], "3x − 6 = 12 → 3x = 18 → x = 6."],
                    ["x + 7 = 15 → x = …", "8", ["7", "9", "22"], "x = 15 − 7 = 8."],
                ]),
                side: mkAll("al-s", [
                    ["5x = 45 → x = …", "9", ["8", "5", "40"], "x = 45 ÷ 5 = 9."],
                    ["2x + 3 = 11 → x = …", "4", ["3", "5", "7"], "2x = 8 → x = 4."],
                ]),
                gate: mkAll("al-g", [
                    ["5x − 7 = 18 → x = …", "5", ["3", "7", "25"], "5x = 25 → x = 5."],
                    ["7 − 2x = 1 → x = …", "3", ["2", "4", "6"], "−2x = −6 → x = 3."],
                    ["x/3 + 2 = 5 → x = …", "9", ["1", "6", "21"], "x/3 = 3 → x = 9."],
                    ["x + 4 = 10 → x = …", "6", ["4", "14", "10"], "x = 10 − 4 = 6."],
                    ["3x = 21 → x = …", "7", ["6", "18", "24"], "x = 21 ÷ 3 = 7."],
                ]),
                backup: mkAll("al-b", [
                    ["6x + 9 = 45 → x = …", "6", ["4", "9", "36"], "6x = 36 → x = 6."],
                    ["4x − 5 = 15 → x = …", "5", ["4", "6", "10"], "4x = 20 → x = 5."],
                ]),
            },
            {
                id: "pertidaksamaan",
                name: "Pertidaksamaan",
                emoji: "⚖️",
                materi: {
                    title: "Kemah Ilmu — Pertidaksamaan Linear",
                    paragraphs: [
                        "Tanda > artinya 'lebih dari', < artinya 'kurang dari', ≥ 'lebih dari atau sama dengan'.",
                        "Cara menyelesaikan mirip persamaan: pindahkan angka dengan lawan operasi.",
                        "HATI-HATI: jika mengali/membagi dengan bilangan NEGATIF, tanda dibalik. −2x < 8 → x > −4.",
                    ],
                },
                latihan: mkAll("pt-l", [
                    ["x + 3 > 7 → x > …", "4", ["3", "7", "10"], "x > 7 − 3 → x > 4."],
                    ["2x < 10 → x < …", "5", ["2", "8", "20"], "x < 10 ÷ 2 → x < 5."],
                    ["x − 5 ≥ 2 → x ≥ …", "7", ["2", "3", "5"], "x ≥ 2 + 5 → x ≥ 7."],
                ]),
                side: mkAll("pt-s", [
                    ["3x > 15 → x > …", "5", ["3", "12", "45"], "x > 15 ÷ 3 → x > 5."],
                    ["x + 6 ≤ 10 → x ≤ …", "4", ["6", "10", "16"], "x ≤ 10 − 6 → x ≤ 4."],
                ]),
                gate: mkAll("pt-g", [
                    ["2x + 2 > 12 → x > …", "5", ["4", "6", "10"], "2x > 10 → x > 5."],
                    ["x − 4 < 3 → x < …", "7", ["4", "3", "1"], "x < 3 + 4 → x < 7."],
                    ["4x ≤ 20 → x ≤ …", "5", ["4", "16", "24"], "x ≤ 20 ÷ 4 → x ≤ 5."],
                    ["6 − x > 2 → x < …", "4", ["2", "6", "8"], "−x > −4 → x < 4."],
                    ["x/2 ≥ 3 → x ≥ …", "6", ["3", "1.5", "9"], "x ≥ 3 × 2 → x ≥ 6."],
                ]),
                backup: mkAll("pt-b", [
                    ["3x − 6 > 9 → x > …", "5", ["3", "6", "15"], "3x > 15 → x > 5."],
                    ["x + 9 ≤ 15 → x ≤ …", "6", ["9", "15", "24"], "x ≤ 15 − 9 → x ≤ 6."],
                ]),
            },
            {
                id: "himpunan",
                name: "Himpunan",
                emoji: "🔵",
                materi: {
                    title: "Kemah Ilmu — Himpunan Dasar",
                    paragraphs: [
                        "Irisan (∩) = anggota yang ada di KEDUA himpunan. Gabungan (∪) = semua anggota digabung (tanpa duplikat).",
                        "Contoh: A = {1,2,3}, B = {3,4} → A ∩ B = {3} dan A ∪ B = {1,2,3,4}.",
                        "Jika tidak ada anggota yang sama, n(A ∪ B) = n(A) + n(B).",
                    ],
                },
                latihan: mkAll("hm-l", [
                    ["A={1,2,3}, B={3,4}. A ∩ B = …", "{3}", ["{1,2,3,4}", "{1,4}", "{2}"], "Anggota yang sama: hanya 3."],
                    ["A={1,2,3}, B={3,4}. A ∪ B = …", "{1,2,3,4}", ["{3}", "{1,2}", "{2,3,4}"], "Gabung semua, tanpa duplikat."],
                    ["n(A)=5, n(B)=3, tidak beririsan → n(A ∪ B) = …", "8", ["5", "3", "15"], "5 + 3 = 8."],
                ]),
                side: mkAll("hm-s", [
                    ["A={2,4,6}, B={4,6,8}. A ∩ B = …", "{4,6}", ["{2,8}", "{2,4,6,8}", "{6,8}"], "Yang ada di keduanya: 4 dan 6."],
                    ["S={1..5}, A={1,2}. Komplemen A = …", "{3,4,5}", ["{1,2}", "{1,2,3}", "{5}"], "Anggota S yang bukan A."],
                ]),
                gate: mkAll("hm-g", [
                    ["A={a,b}, B={b,c}. A ∩ B = …", "{b}", ["{a,c}", "{a,b,c}", "{c}"], "Hanya b yang sama."],
                    ["A={1,2}, B={3,4}. A ∪ B punya … anggota", "4", ["2", "3", "1"], "2 + 2 = 4, tak ada duplikat."],
                    ["A={1,2,3}. Banyak anggota A = …", "3", ["1", "2", "6"], "Tinggal dihitung: 3."],
                    ["A={5}, B={5}. A ∩ B = …", "{5}", ["{}", "{5,5,5}", "kosong"], "Keduanya memuat 5."],
                    ["A={2,4}, B={4,6}. A ∪ B = …", "{2,4,6}", ["{4}", "{2,6}", "{2,4,4,6}"], "Gabung, 4 hanya sekali."],
                ]),
                backup: mkAll("hm-b", [
                    ["A={x,y,z}, B={z}. A ∩ B = …", "{z}", ["{x,y}", "{x,y,z}", "{}"], "Z ada di keduanya."],
                    ["n(A)=4, n(B)=4, beririsan 1 → n(A ∪ B) = …", "7", ["8", "4", "6"], "4 + 4 − 1 = 7."],
                ]),
            },
            {
                id: "pola",
                name: "Pola Bilangan",
                emoji: "🌀",
                materi: {
                    title: "Kemah Ilmu — Detektif Pola",
                    paragraphs: [
                        "Cari selisih antar suku! 2,4,6,8 → selisihnya +2, jadi suku berikutnya 10.",
                        "Pola bisa berupa kelipatan (2,4,8,16 → kali 2) atau kuadrat (1,4,9,16 → 1²,2²,3²,4²).",
                        "TIPS: tulis selisih antar suku di baris kecil di bawahnya — polanya langsung kelihatan.",
                    ],
                },
                latihan: mkAll("pl-l", [
                    ["2, 4, 6, 8, …", "10", ["9", "12", "14"], "Naik 2 terus: 8 + 2 = 10."],
                    ["1, 3, 5, 7, …", "9", ["8", "11", "6"], "Bilangan ganjil: 7 + 2 = 9."],
                    ["5, 10, 15, …", "20", ["18", "25", "16"], "Kelipatan 5: 15 + 5 = 20."],
                ]),
                side: mkAll("pl-s", [
                    ["1, 4, 9, 16, …", "25", ["20", "24", "36"], "Kuadrat: 5² = 25."],
                    ["1, 2, 4, 8, …", "16", ["12", "10", "32"], "Kalikan 2: 8 × 2 = 16."],
                ]),
                gate: mkAll("pl-g", [
                    ["3, 6, 9, 12, …", "15", ["14", "18", "13"], "Kelipatan 3."],
                    ["10, 9, 8, 7, …", "6", ["5", "8", "7"], "Turun 1 terus."],
                    ["2, 4, 8, 16, …", "32", ["24", "20", "64"], "Kalikan 2."],
                    ["1, 2, 3, 5, 8, …", "13", ["10", "11", "12"], "Fibonacci: 5 + 8 = 13."],
                    ["7, 14, 21, …", "28", ["25", "27", "35"], "Kelipatan 7."],
                ]),
                backup: mkAll("pl-b", [
                    ["4, 8, 12, …", "16", ["14", "20", "15"], "Kelipatan 4."],
                    ["100, 90, 80, …", "70", ["60", "75", "85"], "Turun 10."],
                ]),
            },
        ],
    },
    /* ------------------- PULAU 4 · GEOMETRI (SMP) -------------------------- */
    {
        id: "geometri",
        name: "Pulau Geometri",
        emoji: "📐",
        theme: "Bentuk, Ruang & Sudut · SMP",
        grad: "from-amber-400 to-orange-600",
        softBorder: "border-amber-200 dark:border-amber-500/30",
        topics: [
            {
                id: "bangun-datar",
                name: "Bangun Datar",
                emoji: "🔷",
                materi: {
                    title: "Kemah Ilmu — Kenali Bangun Datar",
                    paragraphs: [
                        "Segitiga: 3 sisi, 3 sudut. Persegi: 4 sisi sama panjang, 4 sudut siku-siku.",
                        "Persegi panjang: sisi berhadapan sama panjang. Lingkaran: punya sisi lengkung, tak bersudut.",
                        "Trapesium: hanya sepasang sisi sejajar. Layang-layang: dua pasang sisi sama pendek/panjang.",
                    ],
                },
                latihan: mkAll("bd-l", [
                    ["Banyak sisi segitiga = …", "3", ["2", "4", "5"], "Tri = tiga."],
                    ["Persegi memiliki … sudut siku-siku", "4", ["2", "3", "5"], "Empat pojok siku."],
                    ["Bangun bersisi 4 sama panjang adalah …", "persegi", ["persegi panjang", "trapesium", "lingkaran"], "4 sisi sama = persegi."],
                ]),
                side: mkAll("bd-s", [
                    ["Banyak sisi segi lima = …", "5", ["4", "6", "3"], "Penta = lima."],
                    ["Bangun yang punya sisi lengkung = …", "lingkaran", ["persegi", "segitiga", "layang-layang"], "Hanya lingkaran yang melengkung."],
                ]),
                gate: mkAll("bd-g", [
                    ["Segi enam punya … sisi", "6", ["5", "4", "8"], "Heksa = enam."],
                    ["Persegi panjang punya … pasang sisi sejajar", "2", ["1", "3", "4"], "Atas-bawah & kiri-kanan."],
                    ["Bangun dengan 3 sudut = …", "segitiga", ["persegi", "segi lima", "trapesium"], "Tiga sudut, tiga sisi."],
                    ["Trapesium punya pasang sisi sejajar sebanyak …", "1", ["2", "3", "0"], "Hanya sepasang."],
                    ["Sudut persegi semuanya …", "siku-siku", ["lancip", "tumpul", "lurus"], "Tiap pojok 90°."],
                ]),
                backup: mkAll("bd-b", [
                    ["Layang-layang punya … pasang sisi sama panjang", "2", ["1", "3", "4"], "Dua pasang berdekatan."],
                    ["Segi delapan punya … sisi", "8", ["6", "7", "10"], "Okta = delapan."],
                ]),
            },
            {
                id: "keliling-luas",
                name: "Keliling & Luas",
                emoji: "📏",
                materi: {
                    title: "Kemah Ilmu — Keliling & Luas",
                    paragraphs: [
                        "Keliling = jumlah semua sisi (mengelilingi). Luas = area di dalam (menutup permukaan).",
                        "Persegi: K = 4 × s, L = s × s. Persegi panjang: K = 2 × (p + l), L = p × l.",
                        "Segitiga: L = ½ × alas × tinggi. Jangan lupa satuannya: keliling cm, luas cm².",
                    ],
                },
                latihan: mkAll("kl2-l", [
                    ["Persegi sisi 5 cm, keliling = …", "20 cm", ["10 cm", "25 cm", "15 cm"], "4 × 5 = 20."],
                    ["Persegi panjang 6 × 4 cm, keliling = …", "20 cm", ["24 cm", "10 cm", "28 cm"], "2 × (6 + 4) = 20."],
                    ["Persegi sisi 3 cm, luas = …", "9 cm²", ["6 cm²", "12 cm²", "3 cm²"], "3 × 3 = 9."],
                ]),
                side: mkAll("kl2-s", [
                    ["Persegi panjang 5 × 3 cm, luas = …", "15 cm²", ["8 cm²", "16 cm²", "10 cm²"], "5 × 3 = 15."],
                    ["Segitiga alas 4, tinggi 6 → luas = …", "12 cm²", ["24 cm²", "10 cm²", "18 cm²"], "½ × 4 × 6 = 12."],
                ]),
                gate: mkAll("kl2-g", [
                    ["Persegi sisi 6 cm, keliling = …", "24 cm", ["12 cm", "36 cm", "30 cm"], "4 × 6 = 24."],
                    ["Persegi sisi 4 cm, luas = …", "16 cm²", ["8 cm²", "20 cm²", "12 cm²"], "4 × 4 = 16."],
                    ["Persegi panjang 8 × 2 cm, luas = …", "16 cm²", ["10 cm²", "20 cm²", "12 cm²"], "8 × 2 = 16."],
                    ["Persegi panjang 7 × 3 cm, keliling = …", "20 cm", ["21 cm", "10 cm", "24 cm"], "2 × (7 + 3) = 20."],
                    ["Segitiga alas 6 tinggi 2 → luas = …", "6 cm²", ["12 cm²", "8 cm²", "3 cm²"], "½ × 6 × 2 = 6."],
                ]),
                backup: mkAll("kl2-b", [
                    ["Persegi sisi 10 cm, luas = …", "100 cm²", ["40 cm²", "20 cm²", "50 cm²"], "10 × 10 = 100."],
                    ["Persegi panjang 9 × 1 cm, keliling = …", "20 cm", ["9 cm", "18 cm", "10 cm"], "2 × (9 + 1) = 20."],
                ]),
            },
            {
                id: "sudut",
                name: "Sudut",
                emoji: "📐",
                materi: {
                    title: "Kemah Ilmu — Bermain Sudut",
                    paragraphs: [
                        "Sudut siku-siku = 90°, sudut lurus = 180°, satu putaran penuh = 360°.",
                        "Lancip < 90°, tumpul antara 90° dan 180°.",
                        "Jam 03.00: jarum pendek di 3, panjang di 12 → sudutnya persis siku-siku, 90°.",
                    ],
                },
                latihan: mkAll("sd-l", [
                    ["Sudut siku-siku = …", "90°", ["45°", "180°", "360°"], "Siku-siku = seperempat putaran."],
                    ["Sudut lurus = …", "180°", ["90°", "270°", "360°"], "Lurus = setengah putaran."],
                    ["Jam 03.00 membentuk sudut …", "90°", ["180°", "45°", "60°"], "Sepertiga? Bukan — tepat siku-siku."],
                ]),
                side: mkAll("sd-s", [
                    ["90° − 45° = …", "45°", ["90°", "55°", "35°"], "Setengah siku-siku."],
                    ["Sudut lancip lebih kecil dari …", "90°", ["180°", "45°", "360°"], "Lancip < siku-siku."],
                ]),
                gate: mkAll("sd-g", [
                    ["Satu putaran penuh = …", "360°", ["180°", "90°", "270°"], "Lingkaran penuh."],
                    ["Jam 06.00 membentuk sudut …", "180°", ["90°", "360°", "120°"], "Dua jarum berlawanan = lurus."],
                    ["Sudut tumpul berada di antara …", "90° dan 180°", ["0° dan 90°", "180° dan 360°", "45° dan 90°"], "Lebih dari siku, kurang dari lurus."],
                    ["2 sudut siku-siku = …", "180°", ["90°", "270°", "360°"], "90 + 90 = 180."],
                    ["Setengah putaran = …", "180°", ["90°", "360°", "45°"], "Setengah lingkaran."],
                ]),
                backup: mkAll("sd-b", [
                    ["Jam 12.00 (sejajar) membentuk sudut …", "0°", ["90°", "180°", "360°"], "Berimpitan = 0°."],
                    ["3 sudut siku = …", "270°", ["180°", "360°", "210°"], "3 × 90 = 270."],
                ]),
            },
            {
                id: "bangun-ruang",
                name: "Bangun Ruang",
                emoji: "🧊",
                materi: {
                    title: "Kemah Ilmu — Bangun Ruang",
                    paragraphs: [
                        "Kubus: 6 sisi, 12 rusuk, 8 titik sudut. Semua sisinya persegi sama besar.",
                        "Balok: volume = p × l × t. Kubus: volume = s × s × s.",
                        "Tabung punya 2 lingkaran + selimut; bola hanya punya 1 sisi lengkung tanpa rusuk.",
                    ],
                },
                latihan: mkAll("br-l", [
                    ["Banyak rusuk kubus = …", "12", ["6", "8", "10"], "4 bawah + 4 atas + 4 tegak."],
                    ["Banyak sisi kubus = …", "6", ["4", "8", "12"], "Seperti dadu!"],
                    ["Volume kubus sisi 2 cm = …", "8 cm³", ["4 cm³", "6 cm³", "12 cm³"], "2 × 2 × 2 = 8."],
                ]),
                side: mkAll("br-s", [
                    ["Balok 2 × 3 × 4 cm, volume = …", "24 cm³", ["9 cm³", "12 cm³", "20 cm³"], "2 × 3 × 4 = 24."],
                    ["Bola memiliki … rusuk", "0", ["1", "2", "12"], "Bola mulus tanpa rusuk."],
                ]),
                gate: mkAll("br-g", [
                    ["Titik sudut kubus = …", "8", ["6", "12", "4"], "8 pojok."],
                    ["Volume kubus sisi 3 cm = …", "27 cm³", ["9 cm³", "18 cm³", "12 cm³"], "3 × 3 × 3 = 27."],
                    ["Alas tabung berbentuk …", "lingkaran", ["persegi", "segitiga", "elips"], "Dua lingkaran sejajar."],
                    ["Balok 5 × 2 × 1 cm, volume = …", "10 cm³", ["7 cm³", "15 cm³", "8 cm³"], "5 × 2 × 1 = 10."],
                    ["Banyak sisi balok = …", "6", ["4", "8", "12"], "Sama seperti kubus."],
                ]),
                backup: mkAll("br-b", [
                    ["Volume kubus sisi 4 cm = …", "64 cm³", ["16 cm³", "32 cm³", "48 cm³"], "4 × 4 × 4 = 64."],
                    ["Prisma segitiga punya … sisi", "5", ["3", "4", "6"], "2 segitiga + 3 persegi panjang."],
                ]),
            },
        ],
    },
];
/* Helper topik ringkas: id, nama, emoji, judul materi, paragraf, latihan(3), side(2), gate(5), backup(2) */
function T(id, name, emoji, title, paras, l, s, g, b) {
    return {
        id,
        name,
        emoji,
        materi: { title, paragraphs: paras },
        latihan: mkAll(`${id}-l`, l),
        side: mkAll(`${id}-s`, s),
        gate: mkAll(`${id}-g`, g),
        backup: mkAll(`${id}-b`, b),
    };
}
/* ---------------------- MATA PELAJARAN: IPA (SD) -------------------------- */
const ISLANDS_IPA = [
    {
        id: "tubuh",
        name: "Pulau Tubuh Manusia",
        emoji: "🫀",
        theme: "Sistem Tubuh · SD",
        grad: "from-red-400 to-rose-600",
        softBorder: "border-rose-200 dark:border-rose-500/30",
        topics: [
            T("penc", "Pencernaan", "🍎", "Kemah Ilmu — Pencernaan", [
                "Makanan dicerna agar sari-sarinya serap tubuh. Urutannya: mulut → kerongkongan → lambung → usus halus → usus besar.",
                "Di mulut, makanan dikunyah gigi dan dilunakkan air liur.",
                "Sari makanan diserap di usus halus; sisanya dibuang lewat usus besar.",
            ], [
                ["Makanan pertama dikunyah di …", "mulut", ["lambung", "usus", "hidung"], "Proses cerna dimulai di mulut."],
                ["Setelah kerongkongan, makanan menuju …", "lambung", ["usus", "paru", "jantung"], "Lambung mencerna dengan asam."],
                ["Sari makanan diserap di …", "usus halus", ["usus besar", "mulut", "hidung"], "Usus halus = tempat penyerapan."],
            ], [
                ["Penghubung mulut dan lambung = …", "kerongkongan", ["usus", "tenggorokan", "hati"], "Kerongkongan jalannya makanan."],
                ["Sisa makanan dibuang lewat …", "usus besar", ["lambung", "mulut", "paru"], "Usus besar membentuk feses."],
            ], [
                ["Gigi berfungsi untuk …", "mengunyah", ["menyaring", "memompa", "melihat"], "Gigi memecah makanan."],
                ["Asam pencerna ada di …", "lambung", ["usus", "mulut", "hati"], "Lambung punya asam klorida."],
                ["Air liur dibuat di …", "mulut", ["lambung", "usus", "hidung"], "Kelenjar liur ada di mulut."],
                ["Paru-paru berfungsi untuk …", "bernapas", ["mencerna", "memompa darah", "melihat"], "Organ napas, bukan cerna!"],
                ["Urutan benar: mulut → kerongkongan → …", "lambung", ["usus besar", "anus", "hati"], "Lambung setelah kerongkongan."],
            ], [
                ["Organ cerna terpanjang = …", "usus halus", ["kerongkongan", "lambung", "mulut"], "Usus halus sangat panjang."],
                ["Feses dibentuk di …", "usus besar", ["lambung", "mulut", "hati"], "Usus besar menyerap air."],
            ]),
            T("napas", "Pernapasan", "🌬️", "Kemah Ilmu — Pernapasan", [
                "Kita bernapas mengambil oksigen dan membuang karbon dioksida.",
                "Urutan jalan napas: hidung → tenggorokan → bronkus → paru-paru.",
                "Di dalam paru, udara ditampung di gelembung kecil bernama alveolus.",
            ], [
                ["Gas yang kita butuhkan saat napas = …", "oksigen", ["karbon dioksida", "nitrogen", "uap"], "Tubuh butuh oksigen."],
                ["Gas yang kita buang = …", "karbon dioksida", ["oksigen", "hidrogen", "helium"], "Kita membuang CO2."],
                ["Tempat pertukaran udara di paru = …", "alveolus", ["bronkus", "hidung", "lambung"], "Alveolus gelembung udara."],
            ], [
                ["Napas lewat dua lubang di wajah bernama …", "hidung", ["telinga", "mata", "mulut saja"], "Hidung jalan napas utama."],
                ["Cabang tenggorokan ke paru disebut …", "bronkus", ["alveolus", "trakea", "diafragma"], "Bronkus percabangan trakea."],
            ], [
                ["Tenggorokan disebut juga …", "trakea", ["bronkus", "alveolus", "hidung"], "Trakea = tenggorokan."],
                ["Otot bantu napas bernama …", "diafragma", ["jantung", "hati", "ginjal"], "Diafragma mengatur napas."],
                ["Bernapas mengambil gas … dari udara", "oksigen", ["CO2", "asap", "uap"], "Oksigen gas kehidupan."],
                ["Helaan napas masuk disebut …", "tarik napas", ["buang napas", "bersin", "batuk"], "Inspirasi = tarik napas."],
                ["Paru manusia berjumlah …", "2", ["1", "3", "4"], "Kiri dan kanan."],
            ], [
                ["Menyaring debu udara dilakukan oleh …", "rambut hidung", ["gigi", "lidah", "telinga"], "Rambut hidung penyaring."],
                ["Gas buang hasil napas = …", "karbon dioksida", ["oksigen", "uap air murni", "nitrogen"], "CO2 dibuang."],
            ]),
            T("darah", "Peredaran Darah", "❤️", "Kemah Ilmu — Peredaran Darah", [
                "Darah dipompa oleh jantung ke seluruh tubuh melalui pembuluh darah.",
                "Jantung manusia punya 4 ruang: 2 serambi dan 2 bilik.",
                "Pembuluh nadi (arteri) membawa darah keluar jantung; pembuluh balik (vena) kembali ke jantung.",
            ], [
                ["Pemompa darah tubuh = …", "jantung", ["paru", "hati", "ginjal"], "Jantung pompa utama."],
                ["Ruang jantung berjumlah …", "4", ["2", "3", "5"], "2 serambi + 2 bilik."],
                ["Pembuluh bawa darah keluar jantung = …", "arteri", ["vena", "kapiler", "urat"], "Nadi = arteri."],
            ], [
                ["Pembuluh balik ke jantung = …", "vena", ["arteri", "saraf", "tendon"], "Vena = pembuluh balik."],
                ["Warna darah kaya oksigen = …", "merah segar", ["biru", "hijau", "kuning"], "Oksigen bikin merah cerah."],
            ], [
                ["Jantung terletak di dada bagian …", "kiri", ["kanan", "tengah punggung", "perut"], "Condong ke kiri."],
                ["Cairan pengangkut zat gizi = …", "darah", ["air ludah", "keringat", "empedu"], "Darah pengangkut nutrisi."],
                ["Detak jantung saat olahraga jadi …", "lebih cepat", ["lebih lambat", "berhenti", "sama saja"], "Butuh oksigen lebih."],
                ["Pembuluh paling halus = …", "kapiler", ["arteri", "vena", "aorta"], "Kapiler sangat kecil."],
                ["Serambi jantung berjumlah …", "2", ["1", "3", "4"], "Kiri & kanan."],
            ], [
                ["Pembuluh nadi besar disebut …", "aorta", ["vena cava", "kapiler", "limfa"], "Aorta nadi terbesar."],
                ["Darah merah karena mengandung …", "hemoglobin", ["klorofil", "melanin", "keratin"], "Hemoglobin pengikat O2."],
            ]),
        ],
    },
    {
        id: "energi-ipa",
        name: "Pulau Energi",
        emoji: "⚡",
        theme: "Energi & Gerak · SD",
        grad: "from-amber-400 to-orange-600",
        softBorder: "border-amber-200 dark:border-amber-500/30",
        topics: [
            T("bentuk-e", "Bentuk Energi", "🔆", "Kemah Ilmu — Bentuk Energi", [
                "Energi tidak dapat diciptakan, hanya berubah bentuk.",
                "Contoh: lampu mengubah energi listrik menjadi cahaya dan panas.",
                "Sumber energi terbesar bumi adalah matahari.",
            ], [
                ["Sumber energi terbesar = …", "matahari", ["bulan", "api", "angin"], "Matahari pusat energi."],
                ["Lampu menyala ubah energi listrik menjadi …", "cahaya", ["suara", "gerak", "air"], "Listrik → cahaya."],
                ["Energi gerak disebut juga …", "kinetik", ["potensial", "kimia", "bunyi"], "Kinetik = gerak."],
            ], [
                ["Baterai menyimpan energi …", "kimia", ["cahaya", "bunyi", "gerak"], "Kimia → listrik."],
                ["Radio menghasilkan energi …", "bunyi", ["cahaya", "panas besar", "gerak"], "Radio mengeluarkan suara."],
            ], [
                ["Kipas angin ubah listrik menjadi …", "gerak", ["cahaya", "bunyi", "kimia"], "Baling-baling berputar."],
                ["Energi tidak bisa …", "diciptakan", ["dirasakan", "diukur", "dipakai"], "Hukum kekekalan energi."],
                ["Panas matahari sampai ke bumi lewat …", "radiasi", ["konduksi", "konveksi", "aliran"], "Radiasi tanpa medium."],
                ["Makanan memberi energi jenis …", "kimia", ["cahaya", "listrik", "bunyi"], "Energi kimia makanan."],
                ["PLTA memanfaatkan energi …", "air", ["angin", "api", "batu"], "Air menggerakkan turbin."],
            ], [
                ["Setrika ubah listrik menjadi …", "panas", ["cahaya", "gerak", "bunyi"], "Setrika memanas."],
                ["Energi gerak angin dipakai oleh …", "kincir angin", ["lampu", "radio", "kompor"], "Kincir manfaatkan angin."],
            ]),
            T("ubah-e", "Perubahan Energi", "🔄", "Kemah Ilmu — Perubahan Energi", [
                "Televisi: listrik → cahaya + bunyi.",
                "Telinga kita mengubah bunyi menjadi sinyal yang dimengerti otak.",
                "Panel surya mengubah energi cahaya matahari menjadi listrik.",
            ], [
                ["TV mengubah listrik menjadi cahaya dan …", "bunyi", ["bau", "rasa", "gerak roda"], "TV ada suara juga."],
                ["Panel surya hasilkan …", "listrik", ["air", "uap", "batu bara"], "Cahaya → listrik."],
                ["Gitar bergetar menghasilkan …", "bunyi", ["cahaya", "panas", "listrik"], "Senar getar = bunyi."],
            ], [
                ["Lampu tidur ubah listrik jadi …", "cahaya", ["suara", "aroma", "air"], "Lampu = cahaya."],
                ["Energi potensial ada pada benda …", "di ketinggian", ["berlari", "menyanyi", "menyala"], "Makin tinggi makin besar."],
            ], [
                ["Fotosintesis ubah cahaya menjadi …", "kimia", ["bunyi", "gerak", "listrik"], "Cahaya → gula (kimia)."],
                ["Bola diam di puncak punya energi …", "potensial", ["kinetik", "bunyi", "cahaya"], "Posisi = potensial."],
                ["Saat jatuh, potensial berubah jadi …", "kinetik", ["kimia", "cahaya", "bunyi"], "Gerak = kinetik."],
                ["Dinamo sepeda hasilkan …", "listrik", ["bensin", "uap", "angin"], "Gerak → listrik."],
                ["Energi bunyi berasal dari …", "getaran", ["cahaya", "warna", "bau"], "Bunyi = getaran."],
            ], [
                ["Kompor gas ubah kimia menjadi …", "panas", ["cahaya saja", "bunyi", "gerak"], "Api = panas."],
                ["Kincir air mengubah gerak air menjadi …", "energi listrik", ["cahaya", "bunyi", "uap"], "Turbin menghasilkan listrik."],
            ]),
            T("gaya", "Gaya & Gerak", "🛒", "Kemah Ilmu — Gaya dan Gerak", [
                "Gaya adalah tarikan atau dorongan yang bisa mengubah gerak benda.",
                "Gaya gravitasi membuat benda jatuh ke bumi.",
                "Gaya gesek memperlambat benda, misalnya rem sepeda.",
            ], [
                ["Gaya adalah …", "tarikan atau dorongan", ["warna", "bunyi", "bau"], "Definisi gaya."],
                ["Bola jatuh karena gaya …", "gravitasi", ["gesek", "pegas", "magnet"], "Gravitasi menarik ke bumi."],
                ["Rem sepeda memakai gaya …", "gesek", ["magnet", "gravitasi", "pegas"], "Kampas rem = gesekan."],
            ], [
                ["Benda bergerak makin cepat jika gaya searah dengan …", "gerak", ["warna", "berat", "ukuran"], "Gaya searah mempercepat."],
                ["Pegas ditekan lalu melenting = gaya …", "pegas", ["gesek", "gravitasi", "magnet"], "Gaya pegas mengembalikan bentuk."],
            ], [
                ["Satuan gaya adalah …", "newton", ["gram", "liter", "meter"], "N = newton."],
                ["Magnet menarik benda berbahan …", "besi", ["kayu", "plastik", "kertas"], "Magnet ↔ besi."],
                ["Sepatu sepatu olahraga bersol kasar untuk …", "memperbesar gesek", ["mengurangi berat", "mempercepat jatuh", "menahan magnet"], "Sol kasar = anti licin."],
                ["Balon udara naik karena …", "udara panas lebih ringan", ["ditarik magnet", "ditiup angin", "beratnya besar"], "Gas panas mengangkat balon."],
                ["Bola berhenti karena …", "gaya gesek", ["gravitasi saja", "warna", "ukuran"], "Gesekan memperlambat."],
            ], [
                ["Gaya dapat mengubah bentuk benda, contoh …", "plastisin ditekan", ["buku dibaca", "lampu menyala", "air mendidih"], "Tekanan mengubah bentuk."],
                ["Tarikan tali pada lomba = gaya …", "tarik", ["dorong", "gesek", "magnet"], "Tali ditarik."],
            ]),
        ],
    },
];
/* ------------------ MATA PELAJARAN: BAHASA INDONESIA ---------------------- */
const ISLANDS_BINDO = [
    {
        id: "membaca",
        name: "Pulau Membaca",
        emoji: "📖",
        theme: "Pemahaman Teks · SD-SMP",
        grad: "from-indigo-400 to-violet-600",
        softBorder: "border-indigo-200 dark:border-indigo-500/30",
        topics: [
            T("ide-pokok", "Ide Pokok", "💡", "Kemah Ilmu — Ide Pokok Paragraf", [
                "Ide pokok adalah gagasan utama sebuah paragraf, biasanya ada di kalimat utama.",
                "Kalimat utama bisa di awal (deduktif) atau di akhir (induktif).",
                "Cara cepat: tanyakan 'paragraf ini membahas apa?'",
            ], [
                ["Ide pokok adalah …", "gagasan utama", ["judul buku", "jumlah kata", "nama penulis"], "Ide pokok = gagasan utama."],
                ["Ide pokok biasanya ada pada kalimat …", "utama", ["penutup saja", "acak", "pertanyaan"], "Kalimat utama memuat ide pokok."],
                ["Paragraf dengan kalimat utama di awal disebut …", "deduktif", ["induktif", "campuran", "narasi"], "Deduktif = umum ke khusus."],
            ], [
                ["'Kucing peliharaanku lucu. Bulunya halus...' Ide pokoknya …", "kucing peliharaan lucu", ["bulu halus", "cara memandikan", "harga kucing"], "Kalimat pertama = inti."],
                ["Kalimat penjelas berfungsi …", "merinci ide pokok", ["mengganti judul", "menghapus paragraf", "menambah nama"], "Penjelas merinci."],
            ], [
                ["Paragraf induktif kalimat utamanya di …", "akhir", ["awal", "tengah", "judul"], "Induktif = khusus ke umum."],
                ["Gagasan pendukung disebut kalimat …", "penjelas", ["utama", "tanya", "perintah"], "Penjelas mendukung utama."],
                ["Sebelum mencari ide pokok, kita harus …", "membaca paragraf", ["menutup buku", "menghitung halaman", "mewarnai"], "Baca dulu, baru cari inti."],
                ["Ide pokok berbeda dari …", "judul", ["gagasan", "inti", "pokok"], "Judul ≠ ide pokok."],
                ["Satu paragraf punya ide pokok sebanyak …", "satu", ["dua", "tiga", "banyak"], "Satu inti per paragraf."],
            ], [
                ["Inti paragraf 'Bumi makin panas akibat...' = …", "bumi makin panas", ["warna bumi", "jumlah benua", "nama planet"], "Panas bumi = inti."],
                ["Kalimat utama biasanya bersifat …", "umum", ["sangat panjang", "berima", "berangka"], "Umum lalu dirinci."],
            ]),
            T("prosedur", "Teks Prosedur", "📋", "Kemah Ilmu — Teks Prosedur", [
                "Teks prosedur berisi langkah-langkah membuat atau melakukan sesuatu.",
                "Ciri-cirinya: memakai kata perintah (potong, aduk, nyalakan) dan urutan yang jelas.",
                "Contoh: resep masakan, cara memakai aplikasi, aturan permainan.",
            ], [
                ["Teks prosedur berisi …", "langkah-langkah", ["cerita lucu", "puisi", "berita"], "Prosedur = langkah."],
                ["Kata 'aduklah' termasuk kata …", "perintah", ["tanya", "sapa", " seru"], "Imperatif = perintah."],
                ["Contoh teks prosedur adalah …", "resep masakan", ["dongeng", "berita pagi", "puisi"], "Resep ada langkahnya."],
            ], [
                ["Langkah prosedur harus disusun secara …", "berurutan", ["acak", "terbalik", "serentak"], "Urutan penting."],
                ["Tujuan teks prosedur = pembaca bisa …", "melakukan/membuat", ["tidur", "bernyanyi", "berlari"], "Instruksi praktis."],
            ], [
                ["'Campurkan tepung dan air' adalah bagian …", "langkah", ["tujuan", "penutup", "judul"], "Isi langkah."],
                ["Kata bilangan 'pertama, kedua' menandakan …", "urutan", ["jumlah uang", "warna", "rasa"], "Penanda tahapan."],
                ["Teks prosedur biasanya memakai kalimat …", "imperatif", ["interogatif", "deklaratif panjang", "rima"], "Kalimat perintah."],
                ["Bagian awal teks prosedur biasanya berisi …", "tujuan", ["harga", "nama penulis", "daftar pustaka"], "Pendahuluan tujuan."],
                ["'Selamat mencoba!' biasanya di bagian …", "penutup", ["pembuka", "langkah", "judul"], "Sapaan penutup."],
            ], [
                ["Alat & bahan ditulis sebelum …", "langkah", ["penutup", "judul", "sapaan"], "Daftar dulu, lalu langkah."],
                ["Contoh lain teks prosedur: …", "cara memakai kompor", ["cerita rakyat", "puisi anak", "berita olahraga"], "Instruksi pemakaian."],
            ]),
            T("narasi", "Teks Cerita", "🧚", "Kemah Ilmu — Teks Narasi", [
                "Teks narasi menceritakan peristiwa secara berurutan (awal, tengah, akhir).",
                "Unsur cerita: tokoh, latar (tempat/waktu), alur, dan pesan.",
                "Contoh: dongeng, fabel, dan cerita pengalaman pribadi.",
            ], [
                ["Teks narasi bersifat …", "menceritakan", ["memerintah", "menanya", "menghitung"], "Narasi = cerita."],
                ["Pelaku dalam cerita disebut …", "tokoh", ["latar", "alur", "amanat"], "Tokoh = pelaku."],
                ["Waktu & tempat cerita disebut …", "latar", ["tokoh", "judul", "alur"], "Latar = setting."],
            ], [
                ["Pesan cerita disebut …", "amanat", ["judul", "tokoh", "latar"], "Amanat = pesan."],
                ["Urutan kejadian cerita disebut …", "alur", ["tokoh", "latar", "judul"], "Alur = plot."],
            ], [
                ["Fabel adalah cerita tentang …", "hewan", ["robot", "planet", "sejarah"], "Fabel = hewan berperan manusia."],
                ["'Pada zaman dahulu...' penanda teks …", "narasi", ["prosedur", "berita", "daftar"], "Pembuka cerita."],
                ["Cerita pengalaman termasuk narasi karena …", "menceritakan peristiwa", ["memberi perintah", "menanya", "mendaftar"], "Ada urutan kejadian."],
                ["Tokoh baik disebut protagonis, tokoh lawan disebut …", "antagonis", ["narator", "figuran", "kru"], "Antagonis = penentang."],
                ["Bagian akhir cerita berisi …", "penyelesaian", ["perkenalan", "daftar isi", "harga"], "Resolusi di akhir."],
            ], [
                ["Penyampai cerita disebut …", "narator", ["tokoh", "penulis lagu", "sutradara saja"], "Narator = pencerita."],
                ["Konflik cerita biasanya di bagian …", "tengah", ["daftar pustaka", "sampul", "judul"], "Puncak di tengah/klimaks."],
            ]),
        ],
    },
    {
        id: "kata",
        name: "Pulau Kata",
        emoji: "✏️",
        theme: "Kosakata & Ejaan · SD",
        grad: "from-emerald-400 to-teal-600",
        softBorder: "border-emerald-200 dark:border-emerald-500/30",
        topics: [
            T("sinanton", "Sinonim & Antonim", "🔁", "Kemah Ilmu — Sinonim dan Antonim", [
                "Sinonim = kata yang maknanya mirip: cantik–indah, besar–raya.",
                "Antonim = kata yang maknanya berlawanan: panas–dingin, naik–turun.",
                "Kaya kosakata membuat tulisan tidak membosankan.",
            ], [
                ["Sinonim kata 'pintar' = …", "cerdas", ["bodoh", "malas", "lambat"], "Pintar ≈ cerdas."],
                ["Antonim 'rajin' = …", "malas", ["tekun", "giat", "sigap"], "Lawan rajin = malas."],
                ["Sinonim berarti …", "persamaan makna", ["lawan makna", "salah tulis", "kata baru"], "Sinonim = mirip makna."],
            ], [
                ["Antonim 'panjang' = …", "pendek", ["lebar", "tinggi", "besar"], "Panjang ↔ pendek."],
                ["Sinonim 'indah' = …", "cantik", ["buruk", "kotor", "sempit"], "Indah ≈ cantik."],
            ], [
                ["Lawan makna disebut …", "antonim", ["sinonim", "homonym", "akronim"], "Antonim = lawan."],
                ["Antonim 'gelap' = …", "terang", ["redup", "senja", "malam"], "Gelap ↔ terang."],
                ["Sinonim 'melihat' = …", "memandang", ["mendengar", "meraba", "mencium"], "Memandang ≈ melihat."],
                ["Antonim 'kaya' = …", "miskin", ["sultan", "berlimpah", "punya"], "Kaya ↔ miskin."],
                ["Sinonim 'senang' = …", "gembira", ["sedih", "marah", "takut"], "Senang ≈ gembira."],
            ], [
                ["Antonim 'datang' = …", "pergi", ["sampai", "tiba", "mampir"], "Datang ↔ pergi."],
                ["Sinonim 'mudah' = …", "gampang", ["sulit", "berat", "lama"], "Mudah ≈ gampang."],
            ]),
            T("baku", "Kata Baku", "📏", "Kemah Ilmu — Kata Baku", [
                "Kata baku adalah kata yang sesuai kaidah bahasa dan Kamus Besar (KBBI).",
                "Contoh: apotek (bukan apotik), analisis ( bukan analisa), risiko (bukan resik0).",
                "Kata baku dipakai dalam surat resmi, karya ilmiah, dan ujian.",
            ], [
                ["Bentuk baku yang benar = …", "apotek", ["apotik", "apotic", "apotikek"], "KBBI: apotek."],
                ["Kata baku untuk hasil pemeriksaan = …", "analisis", ["analisa", "analize", "analiss"], "KBBI: analisis."],
                ["Bentuk baku yang benar = …", "praktik", ["praktek", "practik", "praktekik"], "KBBI: praktik."],
            ], [
                ["'Risiko' adalah bentuk …", "baku", ["tidak baku", "slang", "daerah"], "Baku: risiko."],
                ["Kata baku untuk uang saku = …", "saku", ["sakuku", "sakoe", "sck"], "Tetap saku."],
            ], [
                ["Bentuk baku 'kualitas' lawannya tidak baku …", "kwalitas", ["kualitas", "kwaliteit", "kuality"], "Yang benar kualitas."],
                ["Surat resmi sebaiknya memakai kata …", "baku", ["slang", "daerah", "gaul"], "Resmi = baku."],
                ["Bentuk baku dari 'jadwal' adalah …", "jadwal", ["jadual", "jaadwal", "dzadwal"], "KBBI: jadwal."],
                ["'Cek' bentuk bakunya …", "cek", ["cheque", "check", "chek"], "KBBI menyerap jadi cek."],
                ["Kata 'izin' ditulis baku dengan …", "z", ["s", "c", "ts"], "Izin memakai z."],
            ], [
                ["Bentuk tidak baku dari 'cabai' = …", "cabe", ["cabai", "caba", "chai"], "Baku: cabai."],
                ["Kata baku untuk 'silakan' adalah …", "silakan", ["silahkan", "silakana", "silaan"], "KBBI: silakan (tanpa h)."],
            ]),
            T("kalimat", "Kalimat", "❓", "Kemah Ilmu — Jenis Kalimat", [
                "Kalimat tanya memakai kata tanya (apa, siapa, di mana) dan tanda tanya.",
                "Kalimat perintah memakai kata kerja perintah dan sering diakhiri tanda seru.",
                "Kalimat berita (deklaratif) menyampaikan informasi dan diakhiri titik.",
            ], [
                ["'Di mana rumahmu?' termasuk kalimat …", "tanya", ["perintah", "berita", "sapa"], "Ada kata tanya."],
                ["'Tutup pintu itu!' termasuk kalimat …", "perintah", ["tanya", "berita", "puisi"], "Ada perintah."],
                ["Kalimat berita diakhiri tanda …", "titik", ["tanya", "seru", "koma"], "Deklaratif = titik."],
            ], [
                ["Kata tanya untuk tempat = …", "di mana", ["kapan", "siapa", "mengapa"], "Di mana = tempat."],
                ["'Ibu membeli sayur.' adalah kalimat …", "berita", ["tanya", "perintah", "bujukan"], "Menyatakan info."],
            ], [
                ["Kata tanya untuk waktu = …", "kapan", ["di mana", "siapa", "apa"], "Kapan = waktu."],
                ["'Ayo, kita bersih-bersih!' kalimat …", "ajakan", ["tanya", "berita", "sumpah"], "Ajakan bentuk perintah."],
                ["Kata tanya untuk orang = …", "siapa", ["apa", "mana", "bagaimana"], "Siapa = orang."],
                ["Kalimat tanya diakhiri tanda …", "tanya", ["titik", "seru", "petik"], "Tanda tanya wajib."],
                ["'Jangan berlari!' adalah kalimat …", "larangan", ["tanya", "berita", "pujian"], "Larangan = perintah negatif."],
            ], [
                ["Kata tanya untuk alasan = …", "mengapa", ["siapa", "mana", "berapa"], "Mengapa = alasan."],
                ["Kalimat 'Adik menangis.' berpola …", "S-P", ["P-S", "O-P", "K-P"], "Adik(S) menangis(P)."],
            ]),
        ],
    },
];
/* ------------------ MATA PELAJARAN: BAHASA INGGRIS ------------------------ */
const ISLANDS_BING = [
    {
        id: "greetings",
        name: "Island of Greetings",
        emoji: "👋",
        theme: "Sapaan & Perkenalan · SD-SMP",
        grad: "from-sky-400 to-blue-600",
        softBorder: "border-sky-200 dark:border-sky-500/30",
        topics: [
            T("greet", "Greetings", "🌞", "Kemah Ilmu — Greetings", [
                "Sapaan pagi: 'Good morning'. Siang-sore: 'Good afternoon'. Malam: 'Good evening'.",
                "'How are you?' dijawab 'I'm fine, thank you.'",
                "Sapaan santai untuk teman: 'Hi!' atau 'Hello!'.",
            ], [
                ["Sapaan pagi dalam Inggris = …", "Good morning", ["Good night", "Good bye", "Good luck"], "Pagi = morning."],
                ["'How are you?' menanyakan …", "kabar", ["nama", "umur", "alamat"], "Menanyakan kondisi."],
                ["Jawaban sopan: 'I'm fine, …'", "thank you", ["good bye", "sorry", "excuse me"], "Ucapan terima kasih."],
            ], [
                ["Sapaan malam hari (ramai) = …", "Good evening", ["Good morning", "Good night", "Good noon"], "Evening = malam menjelang tidur."],
                ["Ucapan berpisah = …", "Good bye", ["Good morning", "Welcome", "Hello"], "Bye = berpisah."],
            ], [
                ["'Good afternoon' dipakai saat …", "siang/sore", ["subuh", "tengah malam", "pagi buta"], "Afternoon = siang."],
                ["Sapaan santai untuk teman = …", "Hi!", ["Good night", "Sorry", "Please"], "Hi = kasual."],
                ["'Thank you' artinya …", "terima kasih", ["maaf", "halo", "selamat tinggal"], "Thanks = terima kasih."],
                ["Sebelum mengganggu kita bilang …", "excuse me", ["good night", "wow", "congrats"], "Permisi = excuse me."],
                ["'Good night' dipakai saat …", "mau tidur", ["pagi hari", "makan", "belajar"], "Night = sebelum tidur."],
            ], [
                ["Sapaan lewat telepon = …", "Hello", ["Goodbye", "Thanks", "Sorry"], "Telepon: Hello."],
                ["'See you tomorrow' artinya …", "sampai jumpa besok", ["selamat tidur", "terima kasih", "permisi"], "Tomorrow = besok."],
            ]),
            T("intro", "Introduction", "🙋", "Kemah Ilmu — Introducing Yourself", [
                "Perkenalan: 'My name is …', 'I am … years old', 'I live in …'.",
                "Menanyakan nama: 'What is your name?'",
                "Menanyakan asal: 'Where do you come from?'",
            ], [
                ["'My name … Rina' kata yang benar = …", "is", ["are", "am", "be"], "Nama tunggal = is."],
                ["Menanyakan nama: 'What is your …?'", "name", ["age", "book", "school"], "Name = nama."],
                ["'I … ten years old.' kata yang benar = …", "am", ["is", "are", "be"], "I am."],
            ], [
                ["Menanyakan tempat tinggal: 'Where do you …?'", "live", ["eat", "sleep only", "run"], "Live = tinggal."],
                ["'Nice to meet you' artinya …", "senang bertemu Anda", ["selamat pagi", "apa kabar", "selamat jalan"], "Ucapan bertemu."],
            ], [
                ["'He … my brother.' kata yang benar = …", "is", ["am", "are", "be"], "He is."],
                ["'They … students.' kata yang benar = …", "are", ["is", "am", "be"], "They are."],
                ["Menanyakan umur: 'How old are …?'", "you", ["your", "yours", "you are"], "Are you."],
                ["'I come … Indonesia.' kata yang benar = …", "from", ["in", "at", "on"], "Come from = berasal."],
                ["Kata untuk 'saya' = …", "I", ["you", "he", "we"], "I = saya."],
            ], [
                ["'Let me introduce …' (memperkenalkan diri) = …", "myself", ["me", "my", "mine"], "Introduce myself."],
                ["'She is my …' (teman perempuan) = …", "friend", ["teacher only", "book", "house"], "Friend = teman."],
            ]),
            T("numbers", "Numbers", "🔢", "Kemah Ilmu — Numbers", [
                "Satu sampai sepuluh: one, two, three, four, five, six, seven, eight, nine, ten.",
                "Puluhan: twenty (20), thirty (30), forty (40), fifty (50).",
                "Angka dipakai untuk umur, harga, jam, dan nomor telepon.",
            ], [
                ["'7' dalam bahasa Inggris = …", "seven", ["six", "eight", "seventy"], "Seven = tujuh."],
            ], [
                ["'twenty' artinya …", "20", ["12", "2", "200"], "Twenty = dua puluh."],
                ["'nine' artinya …", "9", ["5", "6", "19"], "Nine = sembilan."],
            ], [
                ["'five' = …", "5", ["4", "6", "15"], "Five = lima."],
                ["'thirty' = …", "30", ["13", "3", "300"], "Thirty = tiga puluh."],
                ["'eleven' = …", "11", ["7", "1", "17"], "Eleven = sebelas."],
                ["'fifty' = …", "50", ["15", "5", "500"], "Fifty = lima puluh."],
                ["'three' = …", "3", ["13", "30", "2"], "Three = tiga."],
            ], [
                ["'eight' = …", "8", ["18", "80", "6"], "Eight = delapan."],
                ["'forty' = …", "40", ["14", "4", "400"], "Forty = empat puluh."],
            ]),
        ],
    },
    {
        id: "daily",
        name: "Island of Daily Life",
        emoji: "🌅",
        theme: "Kegiatan Sehari-hari · SD-SMP",
        grad: "from-pink-400 to-purple-600",
        softBorder: "border-pink-200 dark:border-pink-500/30",
        topics: [
            T("daily-act", "Daily Activities", "⏰", "Kemah Ilmu — Daily Activities", [
                "Kegiatan pagi: wake up (bangun), take a bath (mandi), have breakfast (sarapan).",
                "Kegiatan sekolah: go to school, study, read a book.",
                "Kegiatan malam: have dinner, do homework, go to sleep.",
            ], [
                ["'Bangun tidur' = …", "wake up", ["go to sleep", "have lunch", "take a bath"], "Wake up = bangun."],
                ["'Sarapan' = …", "have breakfast", ["have dinner", "have lunch", "make bed"], "Breakfast = pagi."],
                ["'Mandi' = …", "take a bath", ["brush teeth", "get dressed", "wake up"], "Bath = mandi."],
            ], [
                ["'Berangkat sekolah' = …", "go to school", ["go home", "go to bed", "go shopping"], "School pagi hari."],
                ["'Mengerjakan PR' = …", "do homework", ["play game", "watch TV", "take a nap"], "Homework = PR."],
            ], [
                ["'Sikat gigi' = …", "brush teeth", ["wash hands", "comb hair", "take a bath"], "Brush = menyikat."],
                ["'Makan siang' = …", "have lunch", ["have breakfast", "have dinner", "snack only"], "Lunch = siang."],
                ["'Tidur' = …", "go to sleep", ["wake up", "get up", "eat"], "Sleep = tidur."],
                ["'Membaca buku' = …", "read a book", ["write a letter", "draw a picture", "sing a song"], "Read = membaca."],
                ["'Bermain bola' = …", "play football", ["play piano", "play card only", "sleep"], "Football = sepak bola."],
            ], [
                ["'Ganti baju' = …", "get dressed", ["take off shoes", "wash face", "comb hair"], "Dressed = berpakaian."],
                ["'Cuci tangan' = …", "wash hands", ["brush teeth", "wash car", "clean room"], "Wash hands sebelum makan."],
            ]),
            T("hobby", "Hobbies", "🎨", "Kemah Ilmu — Hobbies", [
                "Menanyakan hobi: 'What is your hobby?'",
                "Jawaban: 'My hobby is …' (reading, swimming, singing, playing games).",
                "Kata 'like + V-ing': I like swimming, She likes reading.",
            ], [
                ["'Hobi' dalam bahasa Inggris = …", "hobby", ["job", "body", "happy"], "Hobby = hobi."],
                ["'Menyanyi' = …", "singing", ["swimming", "dancing", "reading"], "Sing = menyanyi."],
                ["'Berenang' = …", "swimming", ["running", "jumping", "riding"], "Swim = renang."],
            ], [
                ["'What is your …?' untuk menanyakan hobi = …", "hobby", ["name", "age", "school"], "Hobi = hobby."],
                ["'Membaca' = …", "reading", ["writing", "drawing", "cooking"], "Read = baca."],
            ], [
                ["'I like …' (memasak) = …", "cooking", ["sleeping", "walking only", "reading only"], "Cook = masak."],
                ["'She … dancing.' (suka, subjek she) = …", "likes", ["like", "liking", "is like"], "She + likes."],
                ["'Menggambar' = …", "drawing", ["rowing", "drowning", "driving"], "Draw = gambar."],
                ["'Bermain game' = …", "playing games", ["doing homework", "sleeping", "eating"], "Play = bermain."],
                ["'Menari' = …", "dancing", ["singing", "swimming", "running"], "Dance = tari."],
            ], [
                ["'Collecting stamps' artinya …", "mengumpulkan prangko", ["bermain stamp", "membeli rumah", "membaca peta"], "Collect = mengumpulkan."],
                ["'My hobby is …' diisi kata …", "ber-V-ing", ["berkata", "berangka", "berwarna"], "Hobi + gerund."],
            ]),
            T("family", "Family", "👪", "Kemah Ilmu — Family Members", [
                "Ayah = father, ibu = mother, kakak laki = older brother, adik perempuan = younger sister.",
                "Kakek = grandfather, nenek = grandmother.",
                "'This is my …' untuk memperkenalkan anggota keluarga.",
            ], [
                ["'Ibu' = …", "mother", ["father", "sister", "aunt"], "Mother = ibu."],
                ["'Ayah' = …", "father", ["uncle", "brother", "cousin"], "Father = ayah."],
                ["'Kakak perempuan' = …", "older sister", ["younger brother", "aunt", "cousin"], "Sister perempuan."],
            ], [
                ["'Kakek' = …", "grandfather", ["grandmother", "uncle", "brother"], "Grandfather = kakek."],
                ["'Adik laki-laki' = …", "younger brother", ["older sister", "uncle", "cousin"], "Brother laki-laki."],
            ], [
                ["'Nenek' = …", "grandmother", ["grandfather", "aunt", "mother"], "Grandmother = nenek."],
                ["'Paman' = …", "uncle", ["aunt", "cousin", "brother"], "Uncle = paman."],
                ["'Bibi' = …", "aunt", ["uncle", "sister", "mother"], "Aunt = bibi."],
                ["'Sepupu' = …", "cousin", ["brother", "uncle", "nephew"], "Cousin = sepupu."],
                ["Keluarga besar = …", "extended family", ["small family", "big house", "old town"], "Extended = besar."],
            ], [
                ["'This is my family' berarti …", "ini keluargaku", ["itu sekolahku", "siapa namamu", "dimana rumahmu"], "Perkenalan keluarga."],
                ["'Anak' = …", "child", ["adult", "baby only", "friend"], "Child = anak."],
            ]),
        ],
    },
];
const SUBJECTS = [
    { id: "matematika", name: "Matematika", emoji: "📐", islands: ISLANDS_MATH },
    { id: "ipa", name: "IPA", emoji: "🔬", islands: ISLANDS_IPA },
    { id: "bindo", name: "Bahasa Indonesia", emoji: "📖", islands: ISLANDS_BINDO },
    { id: "bing", name: "Bahasa Inggris", emoji: "🔤", islands: ISLANDS_BING },
];
/* ================================= RNG ==================================== */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rollChest(tier) {
    const r = Math.random();
    if (tier === "wooden") {
        if (r < 0.7) {
            const p = randInt(20, 60);
            return { kind: "points", amount: p, label: `+${p} Poin` };
        }
        const t = Math.random() < 0.5 ? "clue" : "freeze";
        return { kind: "tool", tool: t, amount: 1, label: `1× ${TOOL_MAP[t].name}` };
    }
    if (tier === "silver") {
        if (r < 0.6) {
            const p = randInt(75, 150);
            return { kind: "points", amount: p, label: `+${p} Poin` };
        }
        const t = Math.random() < 0.5 ? "fifty" : "skip";
        return { kind: "tool", tool: t, amount: 1, label: `1× ${TOOL_MAP[t].name}` };
    }
    if (r < 0.5) {
        const p = randInt(200, 500);
        return { kind: "points", amount: p, label: `JACKPOT +${p} Poin!` };
    }
    if (Math.random() < 0.5) {
        return { kind: "tool", tool: "shield", amount: 1, label: "1× Second Chance" };
    }
    return { kind: "combo", tools: ["fifty", "clue"], label: "Paket Kombo: 50:50 + Clue" };
}
const CHEST_META = {
    wooden: { name: "Wooden Chest", body: "from-amber-700 to-amber-900", ring: "border-amber-600", glow: "shadow-amber-500/40" },
    silver: { name: "Silver Chest", body: "from-slate-300 to-slate-500", ring: "border-slate-300", glow: "shadow-slate-200/50" },
    golden: { name: "Golden Chest", body: "from-yellow-300 to-amber-500", ring: "border-yellow-300", glow: "shadow-yellow-400/60" },
};
/* ========================= SUB-KOMPONEN: UTIL ============================= */
function Stars({ count, size = 14 }) {
    return (<span className="inline-flex items-center gap-0.5" aria-label={`${count} bintang`}>
      {[1, 2, 3].map((i) => (<Star key={i} size={size} className={i <= count ? "fill-yellow-400 text-yellow-400 drop-shadow" : "text-slate-300 dark:text-slate-600"}/>))}
    </span>);
}
function AnimatedNumber({ value }) {
    const [display, setDisplay] = useState(value);
    const rafRef = useRef(null);
    useEffect(() => {
        const from = display;
        const to = value;
        if (from === to)
            return;
        const start = performance.now();
        const dur = 800;
        const tick = (now) => {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(Math.round(from + (to - from) * eased));
            if (p < 1)
                rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current)
                cancelAnimationFrame(rafRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    return <span className="tabular-nums font-extrabold">{display.toLocaleString("id-ID")}</span>;
}
/* ======================== SUB-KOMPONEN: PETA TOPIK ======================== */
function TopicMap({ island, progress, onTopic, }) {
    const n = island.topics.length;
    const rowH = 132;
    const topPad = 80;
    const height = n * rowH + topPad;
    return (<div className="relative mx-auto w-full max-w-md" style={{ height }}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
        {island.topics.slice(0, -1).map((_, i) => {
            const ax = i % 2 === 0 ? 32 : 68;
            const bx = (i + 1) % 2 === 0 ? 32 : 68;
            const ay = topPad + i * rowH;
            const by = topPad + (i + 1) * rowH;
            const done = !!progress[`${island.id}.${island.topics[i].id}`]?.gate;
            const midY = (ay + by) / 2;
            return (<path key={i} d={`M ${ax} ${ay + 30} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by - 30}`} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={4} strokeLinecap="round" strokeDasharray="2 10" className={done ? "stroke-emerald-400/80 dark:stroke-emerald-400/70" : "stroke-slate-300 dark:stroke-slate-700"}/>);
        })}
      </svg>

      {island.topics.map((topic, i) => {
            const rec = progress[`${island.id}.${topic.id}`];
            const done = !!rec?.gate;
            const prevDone = i === 0 || !!progress[`${island.id}.${island.topics[i - 1].id}`]?.gate;
            const unlocked = prevDone && !done;
            const x = i % 2 === 0 ? 32 : 68;
            const y = topPad + i * rowH;
            return (<button key={topic.id} type="button" onClick={() => onTopic(i)} disabled={!prevDone} className="group absolute z-10 flex w-[150px] -translate-x-1/2 -translate-y-1/2 touch-manipulation flex-col items-center gap-1 text-center focus:outline-none" style={{ left: `${x}%`, top: y }} aria-label={`${topic.name} — ${done ? "selesai" : unlocked ? "terbuka" : "terkunci"}`}>
            <span className={[
                    "relative flex h-14 w-14 items-center justify-center rounded-full border-4 text-xl transition-transform sm:h-16 sm:w-16",
                    !prevDone
                        ? "border-slate-300 bg-slate-200 grayscale dark:border-slate-700 dark:bg-slate-800"
                        : done
                            ? "border-emerald-400 bg-gradient-to-br from-emerald-400 to-green-600 text-white"
                            : `bg-gradient-to-br ${island.grad} border-white text-white dark:border-slate-900`,
                    unlocked && "hover:scale-110",
                ].join(" ")} style={unlocked ? { animation: "mapadventure-node-pulse 1.8s ease-in-out infinite" } : undefined}>
              {done ? <Check size={26} strokeWidth={3}/> : prevDone ? topic.emoji : <Lock size={22}/>}
            </span>
            <span className={[
                    "rounded-lg px-2 py-0.5 text-[11px] font-bold leading-tight backdrop-blur",
                    prevDone
                        ? "bg-white/80 text-slate-800 shadow dark:bg-slate-800/80 dark:text-slate-100"
                        : "text-slate-400 dark:text-slate-500",
                ].join(" ")}>
              {i + 1}. {topic.name}
            </span>
            {done ? <Stars count={rec?.gate ?? 0}/> : <span className="text-[10px] text-slate-400 dark:text-slate-500">{prevDone ? "Ketuk untuk menjelajah" : "Selesaikan topik sebelumnya"}</span>}
          </button>);
        })}
    </div>);
}
const TOPIC_NODE_DEFS = [
    { id: "kemah", stage: "materi", x: 68, y: 132, title: "Kemah Ilmu", subtitle: "Materi", icon: Tent, accent: "from-teal-400 to-emerald-600" },
    { id: "latihan", stage: "latihan", x: 50, y: 275, title: "Pos Latihan", subtitle: "3 Pemanasan", icon: Dumbbell, accent: "from-sky-400 to-blue-600" },
    { id: "side", stage: "side", x: 20, y: 405, title: "Side Quest HOTS", subtitle: "Cabang Rahasia", icon: Scroll, accent: "from-fuchsia-400 to-purple-600" },
    { id: "chest", stage: "chest", x: 20, y: 550, title: "Mystery Chest", subtitle: "Peti Kejutan", icon: Package, accent: "from-yellow-300 to-amber-500" },
    { id: "gate", stage: "gate", x: 78, y: 685, title: "Pos Penjaga", subtitle: "Ujian · 45s", icon: Swords, accent: "from-orange-400 to-red-600" },
];
const TOPIC_EDGES = [
    ["kemah", "latihan"],
    ["latihan", "gate"],
    ["latihan", "side"],
    ["side", "chest"],
];
function topicNodeStatus(rec, id) {
    switch (id) {
        case "kemah":
            return rec.materi ? "completed" : "unlocked";
        case "latihan":
            return rec.latihan ? "completed" : rec.materi ? "unlocked" : "locked";
        case "side":
            return rec.side ? "completed" : rec.latihan ? "unlocked" : "locked";
        case "chest":
            return rec.chest ? "completed" : rec.side ? "unlocked" : "locked";
        case "gate":
            return rec.gate ? "completed" : rec.latihan ? "unlocked" : "locked";
    }
}
function TopicMapView({ island, topic, rec, onNode, onBack, barTop, }) {
    const height = 760;
    return (<>
      {/* Floating tema/topik: di bawah nav saat nav terlihat; pojok kiri atas saat nav ter-scroll keluar */}
      <div id="theme-topic-linkback" className="pointer-events-none fixed inset-x-0 z-30" style={{ top: barTop + 4 }}>
        <div className="mx-auto flex max-w-3xl justify-start px-4 sm:px-6">
          <div className={`pointer-events-auto ml-2 flex w-[12vw] min-w-[170px] max-w-[25vw] items-center gap-2 rounded-2xl border bg-white/90 py-2.5 pl-2 pr-2.5 shadow-lg backdrop-blur-md dark:bg-slate-800/90 ${island.softBorder}`}>
            <button type="button" onClick={onBack} className="shrink-0 rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 active:scale-95 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600" aria-label="Kembali ke peta pulau">
              <ChevronRight size={16} className="rotate-180"/>
            </button>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{island.name}</p>
              <h3 className="text-sm font-extrabold leading-snug text-slate-700 dark:text-slate-100">{topic.name}</h3>
              <span className="mt-0.5 flex items-center">
                <Stars count={rec.gate ?? 0} size={13}/>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Peta anak (skill tree topik) */}
      <div className="relative mx-auto w-full max-w-md" style={{ height }}>
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
          {TOPIC_EDGES.map(([a, b]) => {
            const na = TOPIC_NODE_DEFS.find((n) => n.id === a);
            const nb = TOPIC_NODE_DEFS.find((n) => n.id === b);
            const open = topicNodeStatus(rec, a) === "completed";
            const midY = (na.y + nb.y) / 2;
            return (<path key={`${a}-${b}`} d={`M ${na.x} ${na.y + 34} C ${na.x} ${midY}, ${nb.x} ${midY}, ${nb.x} ${nb.y - 34}`} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={4} strokeLinecap="round" strokeDasharray="2 10" className={open ? "stroke-emerald-400/80 dark:stroke-emerald-400/70" : "stroke-slate-300 dark:stroke-slate-700"}/>);
        })}
        </svg>

        {TOPIC_NODE_DEFS.map((def) => {
            const status = topicNodeStatus(rec, def.id);
            const Icon = def.icon;
            const locked = status === "locked";
            const done = status === "completed";
            const active = status === "unlocked";
            const stars = typeof rec[def.stage] === "number" ? rec[def.stage] : 0;
            return (<button key={def.id} type="button" onClick={() => onNode(def.stage)} disabled={locked || (def.id === "chest" && done)} className="group absolute z-10 flex w-[116px] -translate-x-1/2 -translate-y-1/2 touch-manipulation flex-col items-center gap-1 text-center focus:outline-none sm:w-[150px] sm:gap-1.5" style={{ left: `${def.x}%`, top: def.y }} aria-label={`${def.title} — ${status}`}>
              <span className={[
                    "relative flex h-14 w-14 items-center justify-center rounded-full border-4 transition-transform sm:h-16 sm:w-16",
                    locked
                        ? "border-slate-300 bg-slate-200 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                        : done
                            ? def.id === "chest"
                                ? "border-yellow-300 bg-gradient-to-br from-yellow-300 to-amber-500 text-white"
                                : "border-emerald-400 bg-gradient-to-br from-emerald-400 to-green-600 text-white"
                            : `bg-gradient-to-br ${def.accent} border-white text-white dark:border-slate-900`,
                    active && "hover:scale-110",
                    !locked && "cursor-pointer",
                ].join(" ")} style={active ? { animation: "mapadventure-node-pulse 1.8s ease-in-out infinite" } : undefined}>
                <Icon size={24} strokeWidth={2.2} className="sm:!h-7 sm:!w-7"/>
                {locked && (<span className="absolute -bottom-1 -right-1 rounded-full bg-slate-500 p-1 text-white dark:bg-slate-700">
                    <Lock size={10}/>
                  </span>)}
                {done && def.id !== "chest" && (<span className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-1 text-white">
                    <Check size={12} strokeWidth={3}/>
                  </span>)}
              </span>

              <span className={[
                    "rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-tight backdrop-blur sm:rounded-lg sm:px-2 sm:py-1 sm:text-[11px]",
                    locked
                        ? "text-slate-400 dark:text-slate-500"
                        : "bg-white/80 text-slate-800 shadow dark:bg-slate-800/80 dark:text-slate-100",
                ].join(" ")}>
                {def.title}
              </span>

              {done && stars > 0 ? (<Stars count={stars}/>) : (<span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {done && def.id === "chest" ? "Terbuka!" : def.subtitle}
                </span>)}
            </button>);
        })}
      </div>
    </>);
}
/* ================= SUB-KOMPONEN: MODAL MATER (READER) ===================== */
function MateriModal({ materi, onClaim, onClose }) {
    const [finished, setFinished] = useState(false);
    const [claimed, setClaimed] = useState(false);
    const scrollRef = useRef(null);
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el)
            return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24)
            setFinished(true);
    }, []);
    /* Materi pendek tanpa scroll: tandai selesai otomatis. */
    useEffect(() => {
        const el = scrollRef.current;
        if (!el)
            return;
        const check = () => {
            if (el.scrollHeight <= el.clientHeight + 24)
                setFinished(true);
        };
        const initialCheck = setTimeout(check, 0);
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => { clearTimeout(initialCheck); ro.disconnect(); };
    }, []);
    return (<ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <span className="rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 p-2.5 text-white shadow-lg">
          <Tent size={22}/>
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Kemah Ilmu</p>
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{materi.title}</h3>
        </div>
        <button type="button" onClick={onClose} className="ml-auto shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Tutup">
          <X size={18}/>
        </button>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="max-h-[48dvh] space-y-3 overflow-y-auto overscroll-contain p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {materi.paragraphs.map((p, i) => (<p key={i} className={p.startsWith("RUMUS") || p.startsWith("HATI-HATI") || p.startsWith("Aturan") ? "rounded-xl border-l-4 border-amber-400 bg-amber-50 p-3 font-medium dark:bg-amber-500/10" : undefined}>
            {p}
          </p>))}
      </div>

      <div className="border-t border-slate-200 p-4 dark:border-slate-700">
        {!finished ? (<p className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <BookOpen size={14}/> Gulir catatan sampai akhir untuk menyelesaikannya…
          </p>) : claimed ? (<p className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <Check size={14}/> Materi dikuasai! Pos Latihan terbuka.
          </p>) : (<button type="button" onClick={() => {
                setClaimed(true);
                onClaim();
            }} className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-extrabold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]">
            Klaim +10 Poin dari Tetua Kemah
          </button>)}
      </div>
    </ModalShell>);
}
/* ================= SUB-KOMPONEN: MODAL KUIS + TOOLS ======================= */
function QuizModal({ title, sub, grad, questions, backups, timed, points, inventory, onSpend, onComplete, onClose, pushToast, }) {
    const [order, setOrder] = useState(questions);
    const [index, setIndex] = useState(0);
    const [current, setCurrent] = useState(questions[0]);
    const [phase, setPhase] = useState("answering");
    const [selected, setSelected] = useState(null);
    const [hidden, setHidden] = useState([]);
    const [clueShown, setClueShown] = useState(false);
    const [shieldArmed, setShieldArmed] = useState(false);
    const [shieldSaved, setShieldSaved] = useState(false);
    const [usedSkipThisQ, setUsedSkipThisQ] = useState(false);
    const [usedFiftyThisQ, setUsedFiftyThisQ] = useState(false);
    const [usedFreezeThisQ, setUsedFreezeThisQ] = useState(false);
    const [backupsLeft, setBackupsLeft] = useState(backups);
    const [timeLeft, setTimeLeft] = useState(45);
    const [frozen, setFrozen] = useState(false);
    const [correctCount, setCorrectCount] = useState(0);
    const [toolsUsed, setToolsUsed] = useState(0);
    const isLast = index === order.length - 1;
    const wasCorrect = selected === current.answer;
    /* Timer */
    useEffect(() => {
        if (!timed || phase !== "answering" || frozen)
            return;
        const iv = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
        return () => clearInterval(iv);
    }, [timed, phase, frozen, index]);
    useEffect(() => {
        if (timed && phase === "answering" && timeLeft === 0) {
            const timeout = setTimeout(() => {
                setSelected(-1);
                setPhase("feedback");
                pushToast("Waktu habis! ⏰", "bad");
            }, 0);
            return () => clearTimeout(timeout);
        }
    }, [timeLeft, timed, phase, pushToast]);
    /* Freeze auto-thaw */
    useEffect(() => {
        if (!frozen)
            return;
        const to = setTimeout(() => setFrozen(false), 30000);
        return () => clearTimeout(to);
    }, [frozen]);
    const markToolUse = useCallback(() => setToolsUsed((n) => n + 1), []);
    const tryUse = useCallback((tool) => {
        if (!onSpend(tool)) {
            pushToast(`Poin tidak cukup untuk ${TOOL_MAP[tool].name}.`, "bad");
            return false;
        }
        markToolUse();
        return true;
    }, [onSpend, pushToast, markToolUse]);
    const resetQuestionState = (next) => {
        setCurrent(next);
        setHidden([]);
        setClueShown(false);
        setShieldArmed(false);
        setSelected(null);
        setUsedSkipThisQ(false);
        setUsedFiftyThisQ(false);
        if (timed)
            setTimeLeft(45);
    };
    const activateClue = () => {
        if (clueShown || phase !== "answering")
            return;
        if (tryUse("clue"))
            setClueShown(true);
    };
    const activateFreeze = () => {
        if (!timed || usedFreezeThisQ || phase !== "answering" || frozen)
            return;
        if (tryUse("freeze")) {
            setFrozen(true);
            setUsedFreezeThisQ(true);
            pushToast("❄️ Timer dibekukan 30 detik!", "info");
        }
    };
    const activateFifty = () => {
        if (usedFiftyThisQ || phase !== "answering")
            return;
        if (tryUse("fifty")) {
            const wrong = current.options
                .map((_, i) => i)
                .filter((i) => i !== current.answer)
                .sort(() => Math.random() - 0.5)
                .slice(0, 2);
            setHidden(wrong);
            setUsedFiftyThisQ(true);
        }
    };
    const activateSkip = () => {
        if (usedSkipThisQ)
            return;
        if (backupsLeft.length === 0) {
            pushToast("Tidak ada soal cadangan tersisa.", "bad");
            return;
        }
        if (tryUse("skip")) {
            const [nextBackup, ...rest] = backupsLeft;
            setBackupsLeft(rest);
            setOrder((prev) => prev.map((q, i) => (i === index ? nextBackup : q)));
            setUsedFiftyThisQ(false);
            setShieldSaved(false);
            resetQuestionState(nextBackup);
            setUsedSkipThisQ(true);
            pushToast("Soal diganti dengan soal cadangan! 🔄", "info");
        }
    };
    const activateShield = () => {
        if (shieldArmed || phase !== "answering")
            return;
        if (tryUse("shield")) {
            setShieldArmed(true);
            pushToast("🛡️ Perisai aktif untuk soal ini!", "info");
        }
    };
    const choose = (i) => {
        if (phase !== "answering" || hidden.includes(i))
            return;
        const correct = i === current.answer;
        if (!correct && shieldArmed) {
            setShieldArmed(false);
            setShieldSaved(true);
            pushToast("Perisai mematahkan kesalahanmu — pilih ulang!", "good");
            return;
        }
        setSelected(i);
        setPhase("feedback");
        if (correct)
            setCorrectCount((c) => c + 1);
    };
    const advance = () => {
        if (isLast) {
            onComplete({ correct: correctCount, total: order.length, toolsUsed });
            return;
        }
        const next = order[index + 1];
        setIndex((i) => i + 1);
        setPhase("answering");
        setShieldSaved(false);
        setUsedFreezeThisQ(false);
        resetQuestionState(next);
    };
    return (<ModalShell onClose={onClose} wide>
      {/* Header kuis */}
      <div className={`flex items-center gap-2 bg-gradient-to-r ${grad} p-3 text-white sm:gap-3 sm:p-4`}>
        <Swords size={20}/>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{title}</p>
          <p className="truncate text-[11px] opacity-90">{sub}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
          Soal {index + 1}/{order.length}
        </span>
        <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 hover:bg-white/20" aria-label="Keluar">
          <X size={18}/>
        </button>
      </div>

      {/* Timer */}
      {timed && (<div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 sm:px-4 dark:border-slate-700">
          <span className={[
                "rounded-full px-3 py-1 text-sm font-extrabold tabular-nums",
                frozen
                    ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                    : timeLeft <= 10
                        ? "animate-pulse bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
            ].join(" ")}>
            {frozen ? "❄️ FROZEN" : `⏱ ${timeLeft}s`}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className={`h-full rounded-full transition-all duration-1000 ${frozen ? "bg-cyan-400" : timeLeft <= 10 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${(timeLeft / 45) * 100}%` }}/>
          </div>
        </div>)}

      {/* Soal */}
      <div className="space-y-3 p-3 sm:p-4">
        {clueShown && (<div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <Lightbulb size={16} className="mt-0.5 shrink-0"/>
            <span>{current.clue}</span>
          </div>)}
        {shieldArmed && (<div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-2 text-xs font-semibold text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
            <ShieldCheck size={14}/> Perisai Second Chance aktif — salah pertama akan dimaafkan.
          </div>)}
        {shieldSaved && (<div className="rounded-xl bg-rose-100 p-2 text-center text-xs font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
            🛡️ Perisai pecah! Silakan pilih jawaban lain.
          </div>)}

        <p className="text-[13px] font-bold leading-relaxed text-slate-800 sm:text-sm dark:text-slate-100">{current.prompt}</p>

        <div className="grid gap-2">
          {current.options.map((opt, i) => {
            const isHidden = hidden.includes(i);
            const isAnswer = i === current.answer;
            const isPicked = selected === i;
            const showState = phase === "feedback";
            return (<button key={i} type="button" disabled={isHidden || phase !== "answering"} onClick={() => choose(i)} className={[
                    "flex min-h-[44px] touch-manipulation items-center gap-2 rounded-xl border-2 px-2.5 py-2.5 text-left text-[13px] font-semibold transition sm:gap-3 sm:px-3 sm:text-sm",
                    isHidden
                        ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-300 line-through opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-700"
                        : showState && isAnswer
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : showState && isPicked
                                ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                                : "border-slate-200 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
                ].join(" ")}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-extrabold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
                {showState && isAnswer && <Check size={16} className="ml-auto shrink-0 text-emerald-600"/>}
                {showState && isPicked && !isAnswer && <X size={16} className="ml-auto shrink-0 text-red-600"/>}
              </button>);
        })}
        </div>

        {phase === "feedback" && (<div className={`rounded-xl p-3 text-center text-sm font-extrabold ${wasCorrect
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"}`}>
            {wasCorrect ? "✅ Tepat sekali!" : selected === -1 ? "⏰ Waktu habis!" : "❌ Kurang tepat."}
          </div>)}
      </div>

      {/* Katalog Tools */}
      <div className="border-t border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-900/60 sm:p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Backpack size={13}/> Tas Peralatan — pakai stok atau tukar poin
        </p>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {TOOLS.map((tool) => {
            const stock = inventory[tool.id];
            const canAfford = stock > 0 || points >= tool.cost;
            const disabled = phase !== "answering" ||
                !canAfford ||
                (tool.id === "clue" && clueShown) ||
                (tool.id === "fifty" && usedFiftyThisQ) ||
                (tool.id === "shield" && shieldArmed) ||
                (tool.id === "freeze" && (!timed || usedFreezeThisQ || frozen)) ||
                (tool.id === "skip" && (usedSkipThisQ || backupsLeft.length === 0));
            const handlers = {
                clue: activateClue,
                freeze: activateFreeze,
                fifty: activateFifty,
                skip: activateSkip,
                shield: activateShield,
            };
            const Icon = tool.icon;
            return (<button key={tool.id} type="button" disabled={disabled} onClick={handlers[tool.id]} title={`${tool.name} — ${tool.desc}`} className="flex min-h-[52px] touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1.5 text-center shadow-sm transition enabled:hover:-translate-y-0.5 enabled:hover:shadow disabled:opacity-40 sm:min-h-0 sm:gap-1 sm:rounded-xl sm:p-2 dark:border-slate-700 dark:bg-slate-800">
                <Icon size={16} className={tool.color}/>
                <span className="hidden text-[9px] font-bold leading-tight text-slate-600 sm:block dark:text-slate-300">
                  {tool.name}
                </span>
                <span className="text-[8px] font-extrabold leading-none text-amber-600 sm:text-[9px] dark:text-amber-400">
                  {stock > 0 ? `×${stock}` : `${tool.cost}p`}
                </span>
              </button>);
        })}
        </div>
      </div>

      {/* Footer aksi */}
      <div className="border-t border-slate-200 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 dark:border-slate-700">
        {phase === "feedback" ? (<button type="button" onClick={advance} className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 py-3 text-sm font-extrabold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]">
            {isLast ? "Selesaikan Kuis 🏁" : "Soal Berikutnya"} <ChevronRight size={16} className="inline"/>
          </button>) : (<p className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
            Pilih satu jawaban{timed ? " sebelum waktu habis" : ""}. Butuh bantuan? Gunakan peralatanmu!
          </p>)}
      </div>
    </ModalShell>);
}
/* ================ SUB-KOMPONEN: MODAL GACHA / MYSTERY CHEST =============== */
function GachaModal({ tier, onReward, onClose, }) {
    const [stage, setStage] = useState("idle");
    const [reward, setReward] = useState(null);
    const meta = CHEST_META[tier];
    const confetti = useMemo(() => Array.from({ length: 42 }, (_, i) => ({
        id: i,
        left: (i * 37 + 11) % 100,
        delay: ((i * 13) % 60) / 100,
        color: ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#a855f7", "#f43f5e"][i % 6],
        size: 6 + ((i * 7) % 8),
    })), []);
    const open = () => {
        if (stage !== "idle")
            return;
        setStage("shaking");
        setTimeout(() => {
            const r = rollChest(tier);
            setReward(r);
            onReward(r);
            setStage("reveal");
        }, 1500);
    };
    const RewardIcon = reward?.kind === "points" ? Coins : reward?.kind === "combo" ? Sparkles : TOOL_MAP[reward?.tool ?? "clue"].icon;
    return (<ModalShell onClose={stage === "reveal" ? onClose : undefined}>
      <div className="relative flex flex-col items-center gap-4 overflow-hidden p-6 text-center sm:p-8">
        {stage === "reveal" && (<>
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300" style={{ animation: "mapadventure-glow-burst 0.9s ease-out forwards" }}/>
            {confetti.map((c) => (<span key={c.id} className="pointer-events-none absolute top-0 rounded-sm" style={{
                    left: `${c.left}%`,
                    width: c.size,
                    height: c.size,
                    backgroundColor: c.color,
                    animation: `mapadventure-confetti-fall 1.6s ${c.delay}s ease-in forwards`,
                }}/>))}
          </>)}

        <p className="relative z-10 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {tier === "golden" ? "✨ Gacha Langka ✨" : "Peti Kejutan"}
        </p>

        {stage !== "reveal" && (<button type="button" onClick={open} className={`relative z-10 touch-manipulation rounded-2xl border-4 ${meta.ring} bg-gradient-to-br ${meta.body} p-5 text-white shadow-2xl ${meta.glow} transition hover:scale-105 active:scale-95 sm:p-6`} style={stage === "shaking" ? { animation: "mapadventure-chest-shake 0.35s ease-in-out infinite" } : undefined} aria-label={`Buka ${meta.name}`}>
            <Package size={52} strokeWidth={1.6} className="sm:!h-16 sm:!w-16"/>
            {stage === "idle" && (<span className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-amber-600 dark:text-amber-400">
                Klik untuk Membuka!
              </span>)}
            {stage === "shaking" && (<span className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-extrabold text-slate-500 dark:text-slate-400">
                🔓 Membuka peti…
              </span>)}
          </button>)}

        {stage === "reveal" && reward && (<div className="relative z-10 mt-2 flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border-2 border-yellow-300 bg-gradient-to-b from-amber-50 to-yellow-100 p-5 shadow-xl sm:p-6 dark:from-amber-500/10 dark:to-yellow-500/10" style={{ animation: "mapadventure-pop-in 0.5s ease-out" }}>
            <span className="rounded-full bg-white p-4 shadow dark:bg-slate-800">
              <RewardIcon size={40} className="text-amber-500"/>
            </span>
            <p className="text-lg font-black text-slate-800 dark:text-slate-100">{meta.name} Terbuka!</p>
            <p className="text-sm font-extrabold text-amber-700 dark:text-amber-300">{reward.label}</p>
            <button type="button" onClick={onClose} className="mt-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-2.5 text-sm font-extrabold text-white shadow-lg transition hover:brightness-110 active:scale-95">
              Ambil Hadiah 🎁
            </button>
          </div>)}

        <div className="h-6"/>
      </div>
    </ModalShell>);
}
/* ======================= SUB-KOMPONEN: MODAL SHELL ======================== */
function ModalShell({ children, onClose, wide, }) {
    return (<div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`max-h-[92dvh] w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"} overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:max-h-[88vh] sm:rounded-3xl`} style={{ animation: "mapadventure-toast-in 0.25s ease-out" }} onClick={(e) => e.stopPropagation()}>
        <div className="max-h-[92dvh] overflow-y-auto overscroll-contain sm:max-h-[88vh]">{children}</div>
      </div>
    </div>);
}
/* ================== SUB-KOMPONEN: POPUP TAS PERALATAN ===================== */
function BagModal({ inventory, points, onBuy, onClose, onReset, }) {
    return (<ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white">
        <Backpack size={20}/>
        <div className="min-w-0">
          <p className="text-sm font-extrabold">Tas Peralatan</p>
          <p className="text-[11px] opacity-90">Stok tools hasil usaha belajarmu</p>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
          <Coins size={13}/> {points.toLocaleString("id-ID")}
        </span>
        <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 hover:bg-white/20" aria-label="Tutup">
          <X size={18}/>
        </button>
      </div>

      <div className="space-y-2 p-4">
        {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const stock = inventory[tool.id];
            return (<div key={tool.id} className={`flex items-center gap-3 rounded-xl border-2 p-3 ${stock > 0
                    ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-800/50"}`}>
              <span className="shrink-0 rounded-lg bg-white p-2 shadow dark:bg-slate-800">
                <Icon size={18} className={tool.color}/>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{tool.name}</p>
                <p className="text-[11px] font-medium leading-snug text-slate-500 dark:text-slate-400">{tool.desc}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <p className={`text-lg font-black tabular-nums ${stock > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                  ×{stock}
                </p>
                <button type="button" onClick={() => onBuy(tool.id)} disabled={points < tool.cost} className="flex touch-manipulation items-center gap-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[11px] font-extrabold text-white shadow transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-40">
                  <Coins size={11}/> Beli {tool.cost}
                </button>
              </div>
            </div>);
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 p-4 dark:border-slate-700">
        <p className="mr-auto min-w-0 text-[10px] font-semibold leading-snug text-slate-400 dark:text-slate-500">
          Tools dipakai langsung saat kuis — stok dipakai dulu, baru tukar Poin.
        </p>
        <button type="button" onClick={() => {
            onReset();
            onClose();
        }} className="shrink-0 rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/40 dark:hover:bg-rose-500/10">
          Reset Progres
        </button>
      </div>
    </ModalShell>);
}
/* =================== SUB-KOMPONEN: POPUP PENGATURAN ======================= */
function SettingsModal({ current, onPick, onClose, }) {
    return (<ModalShell onClose={onClose}>
      <div className="flex items-center gap-3 bg-gradient-to-r from-slate-600 to-slate-800 p-4 text-white">
        <Settings size={20}/>
        <div className="min-w-0">
          <p className="text-sm font-extrabold">Pengaturan</p>
          <p className="text-[11px] opacity-90">Pilih mata pelajaran favoritmu</p>
        </div>
        <button type="button" onClick={onClose} className="ml-auto shrink-0 rounded-lg p-1 hover:bg-white/20" aria-label="Tutup">
          <X size={18}/>
        </button>
      </div>

      <div className="space-y-2 p-4">
        {SUBJECTS.map((sub) => {
            const active = sub.id === current;
            return (<button key={sub.id} type="button" onClick={() => onPick(sub.id)} className={[
                    "flex w-full touch-manipulation items-center gap-3 rounded-xl border-2 p-3 text-left transition",
                    active
                        ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow dark:border-slate-700 dark:bg-slate-800",
                ].join(" ")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl dark:bg-slate-700">
                {sub.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-slate-800 dark:text-slate-100">{sub.name}</span>
                <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {sub.islands.length} pulau · {sub.islands.reduce((n, isl) => n + isl.topics.length, 0)} topik
                </span>
              </span>
              {active ? (<span className="shrink-0 rounded-full bg-indigo-500 p-1.5 text-white">
                  <Check size={13} strokeWidth={3}/>
                </span>) : (<ChevronRight size={16} className="shrink-0 text-slate-400"/>)}
            </button>);
        })}
      </div>

      <p className="border-t border-slate-200 p-3 text-center text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:text-slate-500">
        Progres tiap mata pelajaran terpisah selama sesi ini · Mode demo
      </p>
    </ModalShell>);
}
/* ============================ KOMPONEN UTAMA ============================== */
export default function MapAdventure() {
    const [dark, setDark] = useState(false);
    const [points, setPoints] = useState(120);
    const [inventory, setInventory] = useState({
        clue: 1,
        freeze: 0,
        fifty: 0,
        skip: 0,
        shield: 0,
    });
    const [progress, setProgress] = useState({});
    const [subjectIdx, setSubjectIdx] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [islandIdx, setIslandIdx] = useState(0);
    const [openTopic, setOpenTopic] = useState(null);
    const [activeStage, setActiveStage] = useState(null);
    const [gacha, setGacha] = useState(null);
    const [showBag, setShowBag] = useState(false);
    const [barTop, setBarTop] = useState(62);
    const navRef = useRef(null);
    const islandListRef = useRef(null);
    const [canLeft, setCanLeft] = useState(false);
    const [canRight, setCanRight] = useState(true);
    const [toasts, setToasts] = useState([]);
    const toastId = useRef(0);
    /* Posisi floating bar: tepat di bawah nav saat nav terlihat; pojok kiri atas saat nav keluar. */
    useEffect(() => {
        const el = navRef.current;
        if (!el)
            return;
        const update = () => {
            const bottom = el.getBoundingClientRect().bottom;
            // Posisi awal (nav terlihat): 36px di bawah nav. Nav keluar: terkunci 110px (78 + 32).
            setBarTop(bottom > 70 ? bottom + 36 : 110);
        };
        const initialUpdate = setTimeout(update, 0);
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            clearTimeout(initialUpdate);
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [openTopic]);
    /* Panah carousel pulau: update status saat scroll/resize. */
    const updateIslandArrows = useCallback(() => {
        const el = islandListRef.current;
        if (!el)
            return;
        setCanLeft(el.scrollLeft > 4);
        setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }, []);
    useEffect(() => {
        const initialArrows = setTimeout(updateIslandArrows, 0);
        window.addEventListener("resize", updateIslandArrows);
        return () => { clearTimeout(initialArrows); window.removeEventListener("resize", updateIslandArrows); };
    }, [updateIslandArrows]);
    /* Pulau aktif ditampilkan di tengah (browser auto-clamp utk pulau pertama/terakhir). */
    useEffect(() => {
        const el = islandListRef.current;
        if (!el)
            return;
        const card = el.children[islandIdx];
        if (card) {
            el.scrollTo({
                left: card.offsetLeft - (el.clientWidth - card.clientWidth) / 2,
                behavior: "smooth",
            });
        }
        updateIslandArrows();
    }, [islandIdx, updateIslandArrows]);
    const scrollIslands = useCallback((dir) => {
        const el = islandListRef.current;
        if (!el)
            return;
        const card = el.children[0];
        const step = card ? card.clientWidth + 8 : 280;
        el.scrollBy({ left: dir * step, behavior: "smooth" });
    }, []);
    const pushToast = useCallback((text, tone = "info") => {
        const id = ++toastId.current;
        setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
    }, []);
    const gainPoints = useCallback((n) => setPoints((p) => p + n), []);
    const addTool = useCallback((tool, amount) => {
        setInventory((inv) => ({ ...inv, [tool]: inv[tool] + amount }));
    }, []);
    const spendTool = useCallback((tool) => {
        if (inventory[tool] > 0) {
            setInventory((inv) => ({ ...inv, [tool]: inv[tool] - 1 }));
            return true;
        }
        const cost = TOOL_MAP[tool].cost;
        if (points >= cost) {
            setPoints((p) => p - cost);
            return true;
        }
        return false;
    }, [inventory, points]);
    /** Beli tool dengan Poin dari pop-up Tas. */
    const buyTool = useCallback((tool) => {
        const cost = TOOL_MAP[tool].cost;
        if (points < cost) {
            pushToast(`Poin kurang ${cost - points} untuk membeli ${TOOL_MAP[tool].name}.`, "bad");
            return;
        }
        setPoints((p) => p - cost);
        setInventory((inv) => ({ ...inv, [tool]: inv[tool] + 1 }));
        pushToast(`🛒 ${TOOL_MAP[tool].name} dibeli! −${cost} Poin masuk ke tas.`, "good");
    }, [points, pushToast]);
    /* ------------------------- TURUNAN PROGRES ----------------------------- */
    const subject = SUBJECTS[subjectIdx];
    const islands = subject.islands;
    const totalTopics = useMemo(() => islands.reduce((n, isl) => n + isl.topics.length, 0), [islands]);
    const island = islands[islandIdx];
    const topic = openTopic !== null ? island.topics[openTopic] : null;
    const tKey = openTopic !== null ? `${island.id}.${island.topics[openTopic].id}` : "";
    const rec = progress[tKey] ?? {};
    const islandUnlocked = useCallback((i) => {
        if (i === 0)
            return true;
        const prev = islands[i - 1];
        const last = prev.topics[prev.topics.length - 1];
        return !!progress[`${prev.id}.${last.id}`]?.gate;
    }, [progress, islands]);
    const totalStars = useMemo(() => Object.values(progress).reduce((n, r) => n + (r.materi ? 1 : 0) + (r.latihan ?? 0) + (r.side ?? 0) + (r.chest ? 1 : 0) + (r.gate ?? 0), 0), [progress]);
    const completedTopics = useMemo(() => Object.values(progress).filter((r) => r.gate).length, [progress]);
    const totalToolStock = useMemo(() => Object.values(inventory).reduce((a, b) => a + b, 0), [inventory]);
    const patchTopic = (key, patch) => setProgress((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
    /* ------------------------- HANDLER PENYELESAIAN ------------------------ */
    const claimMateri = () => {
        patchTopic(tKey, { materi: true });
        gainPoints(10);
        setActiveStage(null);
        pushToast("🏕️ +10 Poin! Pos Latihan terbuka.", "good");
    };
    const finishLatihan = ({ correct }) => {
        patchTopic(tKey, { latihan: Math.max(1, correct) });
        gainPoints(25);
        setActiveStage(null);
        pushToast("💪 Latihan selesai! +25 Poin. Side Quest & Pos Penjaga terbuka.", "good");
    };
    const finishSide = ({ correct, total, toolsUsed }) => {
        setActiveStage(null);
        if (correct === total) {
            patchTopic(tKey, { side: toolsUsed === 0 ? 2 : 1 });
            pushToast(toolsUsed === 0
                ? "🧠 HOTS sempurna TANPA tools! Mystery Chest Golden muncul!"
                : "🧠 Side Quest HOTS ditaklukkan! Mystery Chest muncul.", "good");
        }
        else {
            pushToast(`HOTS ${correct}/${total} — taklukkan kedua soal untuk membuka peti!`, "bad");
        }
    };
    const finishGate = ({ correct, total, toolsUsed }) => {
        setActiveStage(null);
        const pct = correct / total;
        if (pct < 0.8) {
            pushToast(`🚧 Penjaga menahanmu (${Math.round(pct * 100)}%). Minimal 80% — coba lagi!`, "bad");
            return;
        }
        let starCount;
        let tier;
        if (pct === 1 && toolsUsed === 0) {
            starCount = 3;
            tier = "golden";
            pushToast("👑 SEMPURNA tanpa tools! 3 Bintang Emas + Golden Gacha Box!", "good");
        }
        else if (pct === 1) {
            starCount = 2;
            tier = "silver";
            pushToast("🥈 Lulus 100% (memakai tools). 2 Bintang Perak + Silver Gacha Box!", "good");
        }
        else {
            starCount = 1;
            tier = "wooden";
            pushToast(`🥉 Lulus ${Math.round(pct * 100)}%. 1 Bintang + Wooden Gacha Box.`, "good");
        }
        patchTopic(tKey, { gate: starCount });
        const isLastTopic = openTopic === island.topics.length - 1;
        if (isLastTopic && islandIdx < islands.length - 1 && !islandUnlocked(islandIdx + 1)) {
            pushToast(`🗺️ ${islands[islandIdx + 1].emoji} ${islands[islandIdx + 1].name} berhasil ditemukan!`, "good");
        }
        setGacha({ tier, isChestClaim: false });
    };
    const applyGachaReward = (reward) => {
        if (reward.kind === "points")
            gainPoints(reward.amount);
        else if (reward.kind === "tool")
            addTool(reward.tool, reward.amount);
        else
            reward.tools.forEach((t) => addTool(t, 1));
        if (gacha?.isChestClaim)
            patchTopic(tKey, { chest: true });
    };
    const onStage = (stage) => {
        if (stage === "chest") {
            setGacha({ tier: rec.side === 2 ? "golden" : "silver", isChestClaim: true });
            return;
        }
        setActiveStage(stage);
    };
    /** Ganti mata pelajaran dari pop-up Pengaturan. */
    const pickSubject = (id) => {
        const idx = SUBJECTS.findIndex((s) => s.id === id);
        if (idx < 0 || idx === subjectIdx) {
            setShowSettings(false);
            return;
        }
        setSubjectIdx(idx);
        setIslandIdx(0);
        setOpenTopic(null);
        setShowSettings(false);
        pushToast(`${SUBJECTS[idx].emoji} Mata pelajaran diganti: ${SUBJECTS[idx].name}!`, "info");
    };
    const resetProgress = () => {
        setProgress({});
        setPoints(120);
        setInventory({ clue: 1, freeze: 0, fifty: 0, skip: 0, shield: 0 });
        setIslandIdx(0);
        setOpenTopic(null);
        setActiveStage(null);
        setGacha(null);
        pushToast("Progres direset. Petualangan baru dimulai!", "info");
    };
    /* ------------------------------ RENDER ---------------------------------- */
    return (<div className={dark ? "mapadventure-scope dark" : "mapadventure-scope"}>
      {/* overflow-x-clip (bukan hidden) — hidden membuat scrollport yang mematahkan position:sticky header */}
      <div className="min-h-dvh overflow-x-clip bg-gradient-to-b from-sky-100 via-indigo-50 to-emerald-50 text-slate-800 transition-colors dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
        {/* ============================ HEADER ============================ */}
        <div className="mx-auto max-w-3xl px-3 pb-3 py-8">
            <DashboardBreadcrumb current="Petualangan Peta Materi" />
                <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 text-white shadow-lg shadow-indigo-500/20">
                        <Tent size={24}/>
                    </span>
                    <div className="min-w-0">
                         <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                        Petualangan Peta Materi
                        </h1>
                       <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-indigo-600 dark:text-indigo-400">
                        {subject.name} · {islands.length} Tema
                        </p>
                    </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-700 shadow-inner sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm dark:bg-amber-500/15 dark:text-amber-300">
                    <Coins size={13} className="sm:!h-4 sm:!w-4"/>
                    <AnimatedNumber value={points}/>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-extrabold text-yellow-700 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm dark:bg-yellow-500/15 dark:text-yellow-300">
                    <Star size={12} className="fill-current sm:!h-[15px] sm:!w-[15px]"/>
                    <span className="tabular-nums">{totalStars}</span>
                    </div>

                    <button type="button" onClick={() => setShowSettings(true)} className="shrink-0 rounded-full bg-slate-200 p-1.5 text-slate-600 transition hover:scale-110 sm:p-2 dark:bg-slate-800 dark:text-slate-300" aria-label="Pengaturan mata pelajaran">
                    <Settings size={14} className="sm:!h-4 sm:!w-4"/>
                    </button>

                    <button type="button" onClick={() => setDark((d) => !d)} className="shrink-0 rounded-full bg-slate-200 p-1.5 text-slate-600 transition hover:scale-110 sm:p-2 dark:bg-slate-800 dark:text-slate-300" aria-label="Ganti mode gelap/terang">
                    {dark ? <Sun size={14} className="sm:!h-4 sm:!w-4"/> : <Moon size={14} className="sm:!h-4 sm:!w-4"/>}
                    </button>
                    </div>
                </header>
        </div>
        <nav ref={navRef} className="mx-auto max-w-3xl px-3 pt-4 sm:px-2">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => scrollIslands(-1)} disabled={!canLeft} className="shrink-0 rounded-full border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-md backdrop-blur transition enabled:hover:scale-110 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-300" aria-label="Geser daftar pulau ke kiri">
              <ChevronLeft size={16}/>
            </button>

            <div ref={islandListRef} onScroll={updateIslandArrows} className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto py-1 before:mx-auto after:mx-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {islands.map((isl, i) => {
            const unlocked = islandUnlocked(i);
            const doneCount = isl.topics.filter((tp) => progress[`${isl.id}.${tp.id}`]?.gate).length;
            const selected = i === islandIdx;
            return (<button key={isl.id} type="button" disabled={!unlocked} onClick={() => {
                    setIslandIdx(i);
                    setOpenTopic(null);
                }} className={[
                    "flex w-full shrink-0 snap-center touch-manipulation items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left transition sm:w-[272px]",
                    selected
                        ? "border-indigo-400 bg-white shadow-md dark:border-indigo-500 dark:bg-slate-800"
                        : unlocked
                            ? "border-slate-200 bg-white/60 hover:-translate-y-0.5 hover:shadow dark:border-slate-700 dark:bg-slate-900/50"
                            : "border-slate-200 bg-slate-100 opacity-60 dark:border-slate-800 dark:bg-slate-900",
                ].join(" ")}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg ${unlocked ? isl.grad : "from-slate-300 to-slate-400"}`}>
                      {unlocked ? isl.emoji : <Lock size={16} className="text-white"/>}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-extrabold">{isl.name}</span>
                      <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {unlocked ? `${doneCount}/${isl.topics.length} topik · ${isl.theme}` : "Terkunci — selesaikan pulau sebelumnya"}
                      </span>
                    </span>
                  </button>);
        })}
            </div>

            <button type="button" onClick={() => scrollIslands(1)} disabled={!canRight} className="shrink-0 rounded-full border border-slate-200 bg-white/95 p-2 text-slate-600 shadow-md backdrop-blur transition enabled:hover:scale-110 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-300" aria-label="Geser daftar pulau ke kanan">
              <ChevronRight size={16}/>
            </button>
          </div>
        </nav>

        {/* ============================= PETA ============================= */}
        {/* backdrop-filter sengaja tidak dipakai di sini: membuat containing block yg membatalkan position:fixed anak */}
        <main className="mx-[max(0.75rem,calc((100%-48rem)/2))] mb-8 mt-3 max-w-3xl rounded-3xl border border-slate-200/80 bg-white/40 px-2 pb-8 pt-4 shadow-sm sm:px-4 sm:pt-6 dark:border-slate-700/80 dark:bg-slate-900/30">
          {topic ? (<TopicMapView island={island} topic={topic} rec={rec} onNode={onStage} onBack={() => setOpenTopic(null)} barTop={barTop}/>) : (<>
              <div className="mb-4 flex items-center justify-center gap-2 text-center">
                <Sparkles size={16} className="text-indigo-500"/>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {island.emoji} {island.name} · ketuk satu topik untuk membuka peta petualangannya!
                </p>
              </div>

              <TopicMap island={island} progress={progress} onTopic={(i) => setOpenTopic(i)}/>
            </>)}

          {/* ============ FLOATING TAS (TAMPIL DI MAP UTAMA & MAP ANAK, KANAN ATAS) ========== */}
          <div id="tool-bag" className="pointer-events-none fixed inset-x-0 z-40" style={{ top: barTop + 4 }}>
              <div className="mx-auto flex max-w-3xl justify-end px-4 sm:px-6">
                <button type="button" onClick={() => setShowBag(true)} className="pointer-events-auto relative mr-2 flex h-[68px] w-[68px] touch-manipulation items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/40 ring-4 ring-white/60 transition hover:scale-110 active:scale-95 dark:ring-slate-900/60" aria-label="Buka Tas Peralatan">
                  <Backpack size={36} strokeWidth={1.8}/>
                  {totalToolStock > 0 && (<span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-black text-white shadow">
                      {totalToolStock}
                    </span>)}
                </button>
              </div>
            </div>
        </main>

        {/* ============================ MODALS ============================ */}
        {showSettings && <SettingsModal current={subject.id} onPick={pickSubject} onClose={() => setShowSettings(false)}/>}

        {showBag && (<BagModal inventory={inventory} points={points} onBuy={buyTool} onClose={() => setShowBag(false)} onReset={resetProgress}/>)}

        {topic && activeStage === "materi" && (<MateriModal materi={topic.materi} onClaim={claimMateri} onClose={() => setActiveStage(null)}/>)}

        {topic && activeStage === "latihan" && (<QuizModal key={`${tKey}-latihan-${rec.latihan ?? 0}`} title={`Pos Latihan — ${topic.name}`} sub="3 Soal Pemanasan" grad={island.grad} questions={topic.latihan} backups={[]} timed={false} points={points} inventory={inventory} onSpend={spendTool} onComplete={finishLatihan} onClose={() => setActiveStage(null)} pushToast={pushToast}/>)}

        {topic && activeStage === "side" && (<QuizModal key={`${tKey}-side-${rec.side ?? 0}`} title={`Side Quest HOTS — ${topic.name}`} sub="Cabang Rahasia · 2 Soal" grad="from-fuchsia-500 to-purple-600" questions={topic.side} backups={[]} timed={false} points={points} inventory={inventory} onSpend={spendTool} onComplete={finishSide} onClose={() => setActiveStage(null)} pushToast={pushToast}/>)}

        {topic && activeStage === "gate" && (<QuizModal key={`${tKey}-gate-${rec.gate ?? 0}`} title={`Pos Penjaga — ${topic.name}`} sub="Ujian Topik · Target ≥ 80%" grad="from-orange-500 to-red-600" questions={topic.gate} backups={topic.backup} timed points={points} inventory={inventory} onSpend={spendTool} onComplete={finishGate} onClose={() => setActiveStage(null)} pushToast={pushToast}/>)}

        {gacha && (<GachaModal tier={gacha.tier} onReward={applyGachaReward} onClose={() => setGacha(null)}/>)}

        {/* ============================ TOASTS ============================ */}
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4">
          {toasts.map((t) => (<div key={t.id} className={[
                "max-w-md rounded-xl px-4 py-2.5 text-center text-xs font-bold text-white shadow-2xl",
                t.tone === "good"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                    : t.tone === "bad"
                        ? "bg-gradient-to-r from-rose-500 to-red-600"
                        : "bg-gradient-to-r from-slate-600 to-slate-800",
            ].join(" ")} style={{ animation: "mapadventure-toast-in 0.3s ease-out" }}>
              {t.text}
            </div>))}
        </div>
      </div>
    </div>);
}
