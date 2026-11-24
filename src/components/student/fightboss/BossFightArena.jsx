"use client";
import "./fightboss.css";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Coins,
  Crown,
  Moon,
  Pencil,
  Flame,
  Heart,
  RotateCcw,
  Shield,
  Settings,
  Skull,
  Snowflake,
  Sparkles,
  Sword,
  Swords,
  Sun,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
export const SUBJECTS = ["Acak", "Matematika", "Bahasa Indonesia"];
export const MOCK_QUESTIONS = [
  {
    id: "q1",
    subject: "Bahasa Indonesia",
    passage:
      "Setiap sore, Nara melewati sebuah taman kecil di dekat sekolahnya. Dahulu taman itu menjadi tempat anak-anak membaca, bermain, dan menunggu orang tua. Namun, sejak beberapa bulan terakhir, bangkunya dipenuhi daun kering dan beberapa pot tanaman dibiarkan kosong. Sampah plastik juga mulai menumpuk di sudut pagar. Banyak warga mengeluh, tetapi belum ada yang mengambil langkah untuk merawatnya.\n\nPada suatu Jumat, Nara mengajak tiga temannya membersihkan taman. Mereka membawa sapu dari rumah, memilah sampah, dan menata kembali pot yang masih dapat digunakan. Pekerjaan itu ternyata lebih berat daripada yang mereka bayangkan. Setelah satu jam, baru sebagian kecil taman yang terlihat bersih. Salah seorang teman Nara menyarankan agar mereka berhenti karena merasa usaha mereka tidak akan membawa perubahan besar.\n\nNara tidak memaksa temannya untuk melanjutkan. Ia justru mengusulkan pembagian tugas yang lebih sederhana. Dua orang menyapu jalan setapak, satu orang mengumpulkan sampah plastik, sementara ia membersihkan bangku. Mereka juga membuat tulisan kecil berisi ajakan menjaga kebersihan, bukan larangan yang menyalahkan pengunjung. Menurut Nara, orang akan lebih mudah tergerak jika diajak bekerja bersama daripada hanya ditegur.\n\nSeorang penjual minuman yang melihat kegiatan mereka kemudian meminjamkan pengki dan menyediakan air minum. Keesokan harinya, beberapa orang tua datang membawa bibit bunga. Warga lain membantu memperbaiki bangku yang rusak. Dalam dua minggu, taman itu kembali digunakan sebagai tempat membaca dan berkumpul. Anak-anak bahkan membuat jadwal bergiliran untuk menyiram tanaman setelah pulang sekolah.\n\nKetika ditanya mengapa ia memulai kegiatan itu, Nara menjawab bahwa ia tidak menunggu semua orang setuju terlebih dahulu. Ia hanya ingin melakukan hal kecil yang dapat dikerjakan saat itu. Baginya, taman yang nyaman bukan hasil kerja satu orang, melainkan hasil kepedulian yang menular dari satu tindakan sederhana kepada tindakan berikutnya.",
    question:
      "Berdasarkan keseluruhan bacaan, pesan utama yang paling tepat adalah …",
    options: [
      "Perubahan hanya dapat terjadi jika seluruh warga menyetujuinya sejak awal.",
      "Tindakan kecil yang dilakukan bersama dapat mendorong perubahan yang berarti.",
      "Merawat taman merupakan tanggung jawab anak-anak yang bermain di sana.",
      "Menegur pengunjung adalah cara terbaik untuk menjaga kebersihan taman.",
    ],
    answer: 1,
    explanation:
      "Tindakan sederhana Nara dan teman-temannya menggerakkan warga untuk ikut membantu. Pesan utama bacaan adalah kepedulian dan kerja sama yang dimulai dari langkah kecil dapat menghasilkan perubahan berarti.",
  },
  {
    id: "q2",
    subject: "Bahasa Indonesia",
    question:
      "Pada kalimat “Pelajar yang dinamis selalu aktif menyesuaikan diri dengan perubahan”, kata dinamis paling tepat bermakna …",
    options: [
      "aktif, giat, dan mudah menyesuaikan diri",
      "sangat rajin belajar di dalam kelas",
      "mudah dipengaruhi pendapat orang lain",
      "kaku dan sulit diajak bekerja sama",
    ],
    answer: 0,
    explanation:
      "Dinamis berarti aktif, giat, dan mudah bergerak menyesuaikan diri dengan perubahan. Sinonimnya antara lain progresif dan energik.",
  },
  {
    id: "q3",
    subject: "Matematika",
    question:
      "Sebuah buku berharga Rp80.000 mendapat diskon 25%. Berapa harga setelah diskon?",
    options: ["Rp20.000", "Rp55.000", "Rp65.000", "Rp60.000"],
    answer: 3,
    explanation: "Diskon = 25% × Rp80.000 = Rp20.000. Harga akhirnya Rp60.000.",
  },
  {
    id: "q4",
    subject: "Matematika",
    question:
      "Rata-rata nilai ulangan Doni pada empat kali tes adalah 78. Berapakah nilai tes kelima agar rata-ratanya menjadi 80?",
    formula: "80 = (total 4 nilai + x) ÷ 5",
    options: ["82", "84", "86", "88"],
    answer: 3,
    explanation:
      "Total empat nilai = 4 × 78 = 312. Agar rata-rata lima tes = 80, total harus 5 × 80 = 400. Nilai kelima = 400 − 312 = 88.",
  },
  {
    id: "q5",
    subject: "Matematika",
    question: "Sebuah persegi memiliki panjang sisi 9 cm. Berapakah luasnya?",
    formula: "L = sisi × sisi",
    options: ["18 cm²", "36 cm²", "81 cm²", "90 cm²"],
    answer: 2,
    explanation: "Luas persegi adalah sisi × sisi, sehingga 9 × 9 = 81 cm².",
  },
  {
    id: "q6",
    subject: "Matematika",
    question: "Perhatikan pola bilangan berikut.",
    formula: "3, 6, 12, 24, …",
    options: ["30", "36", "48", "52"],
    answer: 2,
    explanation:
      "Setiap suku dikalikan 2, sehingga suku berikutnya adalah 24 × 2 = 48. Perhatikan bahwa polanya kelipatan, bukan penjumlahan tetap.",
  },
  {
    id: "q7",
    subject: "Bahasa Indonesia",
    passage:
      "Perpustakaan sekolah kami baru saja diperbarui. Rak-rak buku disusun ulang berdasarkan tema sehingga pengunjung lebih mudah mencari bacaan. Koleksi baru berupa buku Ensiklopedia anak dan komik sains ditempatkan di sudut yang dekat dengan cahaya matahari. Pustakawan juga menambahkan pojok baca bean bag agar siswa betah berlama-lama.\n\nNamun, perubahan itu belum diiringi kebiasaan baru. Beberapa siswa masih mengembalikan buku melewati batas waktu dan ada yang meletakkan kembali buku pada rak yang salah. Kepala sekolah berencana menunjuk duta baca dari setiap kelas untuk mengingatkan teman secara ramah, bukan menghukum.",
    question: "Ide pokok paragraf pertama bacaan di atas adalah …",
    options: [
      "Pustakawan menambahkan pojok baca bean bag.",
      "Koleksi baru ditempatkan dekat cahaya matahari.",
      "Perpustakaan sekolah baru saja diperbarui.",
      "Beberapa siswa terlambat mengembalikan buku.",
    ],
    answer: 2,
    explanation:
      "Kalimat utama paragraf pertama berada di awal: perpustakaan sekolah baru diperbarui. Kalimat berikutnya menjelaskan perwujudan pembaruan tersebut.",
  },
  {
    id: "q8",
    subject: "Bahasa Indonesia",
    question: "Manakah kalimat yang menggunakan kata baku dengan tepat?",
    options: [
      "Saya menganalisis data hasil penelitian bersama teman kelompok.",
      "Dia memprediksi cuaca besok akan cerah berdasarkan aplikasi.",
      "Kami akan merubah jadwal ujian karena bertepatan dengan lomba.",
      "Adik mengerjakan PR dengan menggunakan penggaris baru.",
    ],
    answer: 0,
    explanation:
      "Kata baku yang benar adalah menganalisis (bukan menganalisa), memprediksi tetap memprediksi, dan merubah seharusnya mengubah. Opsi A memakai bentuk baku dengan imbuhan me- + analisis + -is menjadi menganalisis.",
  },
];
const TURN_SECONDS = 30;
const MAX_HP = 100;
const BASE_DAMAGE = 20;
const TURN_DELAY = 2400;
const EMPTY_POWERS = { fifty: false, heal: false, freeze: false };
function HealthBar({ label, value, boss = false, onEdit }) {
  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold sm:text-sm">
        <span className="flex items-center gap-1.5">
          {boss ? <Skull size={14} /> : <Heart size={14} />} {label}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit nama ${label}`}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Pencil size={14} />
            </button>
          )}
        </span>
        <span className="shrink-0 text-right tabular-nums text-slate-500 dark:text-slate-400">
          <span>{value} /</span>
          <span className="block opacity-50 sm:inline">{MAX_HP}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={MAX_HP}
        aria-valuenow={value}
        className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <motion.div
          initial={false}
          animate={{ width: `${(value / MAX_HP) * 100}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${boss ? "bg-gradient-to-r from-rose-600 to-pink-400" : "bg-gradient-to-r from-emerald-600 to-emerald-400"}`}
        />
      </div>
    </div>
  );
}
// Inline vector avatars keep this single-file demo independent of external assets.
function Fighter({ boss = false, attack, name = "Raja Aljabar" }) {
  const active = boss
    ? attack === "smash"
    : attack === "punch" || attack === "kick";
  return (
    <svg
      viewBox="0 0 160 180"
      role="img"
      aria-label={boss ? name : "Avatar petarung siswa"}
      className="h-32 w-28 overflow-visible sm:h-44 sm:w-40"
    >
      <ellipse
        cx="80"
        cy="172"
        rx="46"
        ry="7"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M48 78 L24 153 L80 140 L136 153 L112 78 Z"
        fill={boss ? "#881337" : "#065f46"}
      />
      <path
        d="M54 82 Q80 66 106 82 L113 132 Q80 149 47 132 Z"
        fill={boss ? "#be123c" : "#10b981"}
        stroke={boss ? "#fb7185" : "#6ee7b7"}
        strokeWidth="3"
      />
      <path
        d="M58 135 L54 162 L72 162 L80 139 M88 139 L92 162 L110 162 L102 135"
        fill="#334155"
        stroke="#0f172a"
        strokeWidth="4"
      />
      {!boss && attack === "kick" && (
        <path
          d="M83 133 L146 109 L156 122 L103 153"
          fill="#10b981"
          stroke="#a7f3d0"
          strokeWidth="4"
        />
      )}
      <motion.g
        animate={
          active
            ? { rotate: boss ? [-30, -100, 20, 0] : [0, -55, 0] }
            : { rotate: 0 }
        }
        transition={{ duration: 0.6 }}
        style={{ transformOrigin: "50px 90px" }}
      >
        <path
          d="M52 88 L30 112"
          stroke={boss ? "#fb7185" : "#6ee7b7"}
          strokeWidth="18"
          strokeLinecap="round"
        />
        <circle
          cx="28"
          cy="115"
          r="13"
          fill={boss ? "#9f1239" : "#047857"}
          stroke={boss ? "#fda4af" : "#a7f3d0"}
          strokeWidth="3"
        />
      </motion.g>
      <motion.g
        animate={
          active
            ? { rotate: boss ? [30, 100, -20, 0] : [0, -100, 0] }
            : { rotate: 0 }
        }
        transition={{ duration: 0.6 }}
        style={{ transformOrigin: "108px 90px" }}
      >
        <path
          d="M108 88 L130 112"
          stroke={boss ? "#fb7185" : "#6ee7b7"}
          strokeWidth="18"
          strokeLinecap="round"
        />
        <circle
          cx="132"
          cy="115"
          r="13"
          fill={boss ? "#9f1239" : "#047857"}
          stroke={boss ? "#fda4af" : "#a7f3d0"}
          strokeWidth="3"
        />
      </motion.g>
      <rect
        x="48"
        y="24"
        width="64"
        height="59"
        rx="23"
        fill={boss ? "#fecdd3" : "#fde68a"}
        stroke={boss ? "#9f1239" : "#065f46"}
        strokeWidth="4"
      />
      <path
        d="M47 48 L48 25 Q80 0 113 25 L112 48 L97 32 L65 36 Z"
        fill={boss ? "#4c0519" : "#064e3b"}
      />
      {boss && (
        <path
          d="M48 24 L43 5 L66 15 L80 0 L94 15 L117 5 L111 25 Z"
          fill="#fbbf24"
          stroke="#b45309"
          strokeWidth="3"
        />
      )}
      <path
        d={
          boss ? "M60 48 L71 52 M89 52 L100 48" : "M60 50 L69 50 M91 50 L100 50"
        }
        stroke="#0f172a"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d={boss ? "M68 68 Q80 59 92 68" : "M69 65 Q80 75 91 65"}
        fill="none"
        stroke="#0f172a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M80 92 L91 105 L80 121 L69 105 Z"
        fill={boss ? "#fbbf24" : "#ecfdf5"}
      />
    </svg>
  );
}
function Popup({ title, children, onClose, color }) {
  const panelRef = useRef(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 backdrop-blur-sm sm:items-center sm:p-5"
    >
      <motion.section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        initial={{ y: reduced ? 0 : 60 }}
        animate={{ y: 0 }}
        exit={{ y: reduced ? 0 : 60 }}
        transition={{ duration: 0.2 }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const items = Array.from(
              event.currentTarget.querySelectorAll(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
              ),
            );
            const first = items[0];
            const last = items[items.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === panelRef.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (
              !event.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === panelRef.current)
            ) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
        style={{
          border: color
            ? `3px solid ${color === "red" ? "#f43f5e" : "#10b981"}`
            : undefined,
        }}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-3xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none dark:bg-slate-900 sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-extrabold sm:text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pop-up dan jeda"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}
export default function BossFightArena() {
  const [questionOpen, setQuestionOpen] = useState(false);
  const [resting, setResting] = useState(false);
  const [healing, setHealing] = useState(null);
  const [subject, setSubject] = useState("Acak");
  const [draftSubject, setDraftSubject] = useState("Acak");
  const [matchMode, setMatchMode] = useState("system");
  const [draftMatchMode, setDraftMatchMode] = useState("system");
  const [names, setNames] = useState(["Player 1", "Player 2"]);
  const [editing, setEditing] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [activePlayer, setActivePlayer] = useState(0);
  const [combos, setCombos] = useState([0, 0]);
  const [inventories, setInventories] = useState([
    { ...EMPTY_POWERS },
    { ...EMPTY_POWERS },
  ]);
  const [questionOrder, setQuestionOrder] = useState([]);
  const [battleMode, setBattleMode] = useState("limited");
  const [maxQuestions, setMaxQuestions] = useState(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftMode, setDraftMode] = useState("limited");
  const [draftLimit, setDraftLimit] = useState("5");
  const [resultKind, setResultKind] = useState(null);
  const [playerHP, setPlayerHP] = useState(MAX_HP);
  const [bossHP, setBossHP] = useState(MAX_HP);
  const [maxCombo, setMaxCombo] = useState(0);
  const [timer, setTimer] = useState(TURN_SECONDS);
  const [timerMax, setTimerMax] = useState(TURN_SECONDS);
  const [gameStatus, setGameStatus] = useState("playing");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);
  const [eliminated, setEliminated] = useState([]);
  const [impact, setImpact] = useState(null);
  const [muted, setMuted] = useState(false);
  const [theme, setTheme] = useState("light");
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState(
    "Pilih jawaban yang tepat untuk menyerang!",
  );
  const lockRef = useRef(false);
  const mutedRef = useRef(false);
  const audioRef = useRef(null);
  const pendingRef = useRef(null);
  const impactId = useRef(0);
  const reduceMotion = useReducedMotion();
  const available = MOCK_QUESTIONS.filter(
    (item) => subject === "Acak" || item.subject === subject,
  );
  const pool = [...available].sort(
    (a, b) => questionOrder.indexOf(a.id) - questionOrder.indexOf(b.id),
  );
  const bossName =
    subject === "Matematika"
      ? "Raja Aljabar"
      : subject === "Bahasa Indonesia"
        ? "Pujangga Sastra"
        : "Ilmuwan Roket";
  const arenaName = subject === "Acak" ? "Planet Mars" : `Arena ${subject}`;
  const pvp = matchMode === "pvp";
  const currentPlayer = pvp ? activePlayer : 0;
  const activeName = names[currentPlayer];
  const activeHP = currentPlayer === 0 ? playerHP : bossHP;
  const comboCount = combos[currentPlayer];
  const powers = inventories[currentPlayer];
  function editName(index) {
    if (lockRef.current) return;
    setDraftName(names[index]);
    setEditing(index);
  }
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("bossfight-theme", next);
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }
  useEffect(() => {
    const ids = MOCK_QUESTIONS.map((item) => item.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const timeout = setTimeout(() => setQuestionOrder(ids), 0);
    return () => clearTimeout(timeout);
  }, []);
  const question = pool[questionIndex % pool.length];
  const correctCount = records.filter((record) => record.correct).length;
  const accuracy = records.length
    ? Math.round((correctCount / records.length) * 100)
    : 0;
  const critical = comboCount >= 3;
  const playSound = useCallback((sound) => {
    if (mutedRef.current || typeof window === "undefined") return;
    try {
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      void context.resume().catch(() => {});
      const notes = {
        attack: [220, 440],
        critical: [330, 660, 990],
        hurt: [180, 90],
        victory: [523.25, 659.25, 783.99, 1046.5],
        defeat: [330, 261.63, 196, 130.81],
        power: [440, 554.37, 880],
      };
      notes[sound].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.1;
        oscillator.type = sound === "hurt" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.09, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.24);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    } catch {
      /* Audio is optional on unsupported or restricted browsers. */
    }
  }, []);
  useEffect(
    () => () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
      if (audioRef.current) void audioRef.current.close().catch(() => {});
    },
    [],
  );
  const answer = useCallback(
    (choice) => {
      if (
        lockRef.current ||
        gameStatus !== "playing" ||
        settingsOpen ||
        editing !== null ||
        !questionOpen
      )
        return;
      lockRef.current = true;
      setLocked(true);
      setSelected(choice);
      setQuestionOpen(false);
      setHealing(null);
      const correct = choice === question.answer;
      const nextCombo = correct ? comboCount + 1 : 0;
      const isCritical = correct && nextCombo >= 3;
      const damage = BASE_DAMAGE * (isCritical ? 1.5 : 1);
      const target = correct ? 1 - currentPlayer : currentPlayer;
      const hit = correct ? damage : BASE_DAMAGE;
      const nextBossHP = target === 1 ? Math.max(0, bossHP - hit) : bossHP;
      const nextPlayerHP =
        target === 0 ? Math.max(0, playerHP - hit) : playerHP;
      const nextRecords = [
        ...records,
        { questionIndex, selected: choice, correct, player: currentPlayer },
      ];
      setRecords(nextRecords);
      setCombos((previous) =>
        previous.map((value, index) =>
          index === currentPlayer ? nextCombo : value,
        ),
      );
      setMaxCombo((previous) => Math.max(previous, nextCombo));
      setBossHP(nextBossHP);
      setPlayerHP(nextPlayerHP);
      setImpact({
        id: ++impactId.current,
        attack: target === 0 ? "smash" : isCritical ? "kick" : "punch",
        damage: hit,
        target,
      });
      setNotice(
        pvp
          ? `${activeName}: ${correct ? (isCritical ? "CRITICAL! Jawaban benar" : "Jawaban benar") : choice === null ? "Waktu habis" : "Jawaban salah"} · ${names[target]} −${hit} HP`
          : correct
            ? isCritical
              ? `CRITICAL! Flying kick · ${damage} damage!`
              : `Tepat! Pukulan masuk · ${damage} damage!`
            : choice === null
              ? "Waktu habis! Boss melakukan double smash."
              : "Belum tepat! Boss membalas dengan double smash.",
      );
      playSound(correct ? (isCritical ? "critical" : "attack") : "hurt");
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        const finished =
          battleMode === "limited" && nextRecords.length >= maxQuestions;
        if (nextBossHP === 0 || nextPlayerHP === 0 || finished) {
          const knockout = nextBossHP === 0 || nextPlayerHP === 0;
          const tied = pvp && nextPlayerHP === nextBossHP;
          const won = pvp
            ? nextPlayerHP > nextBossHP
            : nextPlayerHP > 0 &&
              (nextBossHP === 0 ||
                nextRecords.filter((record) => record.correct).length >
                  nextRecords.length / 2);
          setResultKind(knockout ? "ko" : "points");
          setGameStatus(tied ? "draw" : won ? "victory" : "defeat");
          playSound(won ? "victory" : "defeat");
        } else {
          if (pvp) setActivePlayer(1 - currentPlayer);
          setQuestionIndex((previous) => previous + 1);
          setTimer(TURN_SECONDS);
          setTimerMax(TURN_SECONDS);
          setEliminated([]);
          setSelected(null);
          setImpact(null);
          setLocked(false);
          lockRef.current = false;
          setQuestionOpen(true);
          setNotice("Giliranmu! Pilih jawaban untuk menyerang.");
        }
      }, TURN_DELAY);
    },
    [
      bossHP,
      comboCount,
      gameStatus,
      playSound,
      playerHP,
      question.answer,
      questionIndex,
      records,
      battleMode,
      maxQuestions,
      settingsOpen,
      questionOpen,
      editing,
      pvp,
      currentPlayer,
      activeName,
      names,
    ],
  );
  useEffect(() => {
    if (
      gameStatus !== "playing" ||
      locked ||
      settingsOpen ||
      editing !== null ||
      !questionOpen
    )
      return;
    if (timer <= 0) {
      answer(null);
      return;
    }
    const timeout = setTimeout(
      () => setTimer((previous) => Math.max(0, previous - 1)),
      1000,
    );
    return () => clearTimeout(timeout);
  }, [answer, gameStatus, locked, timer, settingsOpen, questionOpen, editing]);
  function activatePower(power) {
    if (
      lockRef.current ||
      gameStatus !== "playing" ||
      settingsOpen ||
      editing !== null ||
      !questionOpen ||
      powers[power]
    )
      return;
    if (power === "heal" && activeHP === MAX_HP) return;
    setInventories((previous) =>
      previous.map((inventory, index) =>
        index === currentPlayer ? { ...inventory, [power]: true } : inventory,
      ),
    );
    if (power === "fifty") {
      setEliminated(
        question.options
          .map((_, index) => index)
          .filter((index) => index !== question.answer)
          .sort(() => Math.random() - 0.5)
          .slice(0, 2),
      );
      setNotice("50:50 aktif. Dua jawaban salah sudah dieliminasi.");
    } else if (power === "heal") {
      setHealing(Math.min(20, MAX_HP - activeHP));
      setQuestionOpen(false);
      lockRef.current = true;
      setLocked(true);
      (currentPlayer === 0 ? setPlayerHP : setBossHP)((previous) =>
        Math.min(MAX_HP, previous + 20),
      );
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        setHealing(null);
        setLocked(false);
        lockRef.current = false;
        setQuestionOpen(true);
      }, 1800);
      setNotice("Healing! HP pemain pulih hingga 20 poin.");
    } else {
      setTimer((previous) => previous + 15);
      setTimerMax((previous) => previous + 15);
      setNotice("Freeze Time! Tambahan 15 detik untuk soal ini.");
    }
    playSound("power");
  }
  function restart() {
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = null;
    lockRef.current = false;
    setPlayerHP(MAX_HP);
    setBossHP(MAX_HP);
    setCombos([0, 0]);
    setActivePlayer(0);
    setMaxCombo(0);
    setTimer(TURN_SECONDS);
    setTimerMax(TURN_SECONDS);
    setQuestionIndex(0);
    setRecords([]);
    setSelected(null);
    setLocked(false);
    setInventories([{ ...EMPTY_POWERS }, { ...EMPTY_POWERS }]);
    const shuffled = MOCK_QUESTIONS.map((item) => item.id);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQuestionOrder(shuffled);
    setEliminated([]);
    setImpact(null);
    setReview(false);
    setGameStatus("playing");
    setResultKind(null);
    setSettingsOpen(false);
    setQuestionOpen(false);
    setHealing(null);
    setResting(false);
    setNotice("Pertarungan baru dimulai. Siap bertarung? GO!");
  }
  const powerButtons = [
    { id: "fifty", icon: Sparkles, label: "50:50", detail: "Hapus 2 opsi" },
    { id: "heal", icon: Heart, label: "Heal", detail: "+20 HP" },
    { id: "freeze", icon: Snowflake, label: "Freeze", detail: "+15 detik" },
  ];
  return (
    <div
      className={theme === "dark" ? "fightboss-scope dark" : "fightboss-scope"}
    >
      <main className="relative min-h-dvh overflow-hidden bg-slate-50 px-3 py-8 text-slate-900 selection:bg-emerald-200 dark:bg-[#090e19] dark:text-slate-100 sm:px-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[650px] bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.09),transparent_65%)]"
        />
        <div className="relative mx-auto max-w-4xl">
          <DashboardBreadcrumb current="Boss Fight" />
          <header className="mb-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-emerald-500 p-2.5 text-white shadow-lg shadow-emerald-500/20">
                <Swords size={24} />
              </span>
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">
                  Boss Fight<span className="text-emerald-500"></span>
                </h1>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400">
                  Learn. Battle. Level up.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  theme === "dark"
                    ? "Gunakan tema terang"
                    : "Gunakan tema gelap"
                }
                aria-pressed={theme === "dark"}
                className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-700 dark:bg-slate-900"
              >
                {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
              </button>
            </div>
          </header>
          <section
            aria-label="Arena pertarungan"
            className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
          >
            <div
              id="arena-header"
              className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800"
            >
              <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500 sm:text-base">
                <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700 sm:text-sm dark:bg-amber-500/10 dark:text-amber-400">
                  {pvp ? "PLAYER VS PLAYER" : "BOSS LEVEL 10"}
                </span>

              </span>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  disabled={locked && gameStatus === "playing"}
                  onClick={() => {
                    setDraftMatchMode(matchMode);
                    setDraftMode(battleMode);
                    setDraftLimit(String(maxQuestions));
                    setDraftSubject(subject);
                    setSettingsOpen(true);
                  }}
                  aria-label="Pengaturan pertarungan"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition enabled:hover:border-emerald-400 enabled:hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:enabled:hover:text-emerald-400"
                >
                  <Settings size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    mutedRef.current = !muted;
                    setMuted(!muted);
                  }}
                  aria-label={muted ? "Aktifkan suara" : "Matikan suara"}
                  aria-pressed={muted}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-emerald-400"
                >
                  {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-3 pt-4 sm:gap-20 sm:px-8">
              <HealthBar
                label={names[0]}
                value={playerHP}
                onEdit={pvp ? () => editName(0) : undefined}
              />
              <HealthBar
                label={pvp ? names[1] : bossName}
                value={bossHP}
                boss
                onEdit={pvp ? () => editName(1) : undefined}
              />
            </div>
            <AnimatePresence>
              {healing !== null && (
                <motion.div
                  key="heal"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    left: currentPlayer === 0 ? 20 : undefined,
                    right: currentPlayer === 1 ? 20 : undefined,
                  }}
                  className="absolute top-28 z-20 rounded-xl bg-emerald-500 px-4 py-2 text-xl font-black text-white shadow-lg"
                >
                  +{healing} HP ✨
                </motion.div>
              )}
            </AnimatePresence>
            <div className="relative flex h-[clamp(180px,32dvh,280px)] items-end justify-between px-6 pb-4 sm:h-60 sm:px-20">
              <div
                aria-hidden="true"
                className="absolute inset-x-8 bottom-3 h-16 rounded-[50%] border border-emerald-500/15 bg-gradient-to-r from-emerald-500/5 to-rose-500/5"
              />
              <motion.div
                key={`player-${impact?.id ?? 0}`}
                className="relative z-10"
                animate={
                  reduceMotion
                    ? {}
                    : impact?.attack === "punch"
                      ? { x: [0, 85, 0], rotate: [0, 12, 0] }
                      : impact?.attack === "kick"
                        ? { x: [0, 100, 0], y: [0, -55, 0], rotate: [0, 30, 0] }
                        : impact?.attack === "smash"
                          ? { x: [0, -8, 8, -5, 0] }
                          : {}
                }
                transition={{ duration: 0.7 }}
              >
                <Fighter attack={impact?.attack} />
              </motion.div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-10">
                <span className="text-2xl font-black italic text-slate-200 dark:text-slate-800">
                  VS
                </span>
              </div>
              <AnimatePresence mode="wait">
                {!questionOpen && !settingsOpen && gameStatus === "playing" && (
                  <motion.div
                    key={locked ? `feedback-${impact?.id ?? "heal"}` : "ready"}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-x-0 bottom-1 z-30 flex justify-center px-4"
                  >
                    {locked ? (
                      <div
                        role="status"
                        aria-live="polite"
                        className={`max-w-xs rounded-2xl border bg-white/95 px-4 py-3 text-center text-sm font-extrabold shadow-xl backdrop-blur-md dark:bg-slate-950/95 ${pvp ? ((healing !== null ? currentPlayer === 0 : impact?.target === 1) ? "border-emerald-400 text-emerald-600 dark:text-emerald-400" : "border-rose-400 text-rose-600 dark:text-rose-400") : healing !== null ? "border-emerald-400 text-emerald-600 dark:text-emerald-400" : impact?.attack === "smash" ? "border-rose-400 text-rose-600 dark:text-rose-400" : "border-amber-400 text-amber-600 dark:text-amber-400"}`}
                      >
                        <span className="mb-1 flex justify-center">
                          {healing !== null ? (
                            <Heart size={22} />
                          ) : impact?.attack === "smash" ? (
                            <Shield size={22} />
                          ) : (
                            <Sword size={22} />
                          )}
                        </span>
                        {notice}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setResting(false);
                          setQuestionOpen(true);
                        }}
                        className="pointer-events-auto min-h-14 max-w-xs rounded-2xl border border-emerald-300 bg-emerald-600 px-5 py-4 text-center text-base font-black text-white shadow-xl shadow-emerald-950/20 transition hover:bg-emerald-500 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500"
                      >
                        {resting
                          ? "Selesai Istirahat? GO lagi!"
                          : "Siap bertarung? GO!"}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.div
                key={`boss-${impact?.id ?? 0}`}
                className="relative z-10"
                animate={
                  reduceMotion
                    ? {}
                    : impact?.attack === "smash"
                      ? { x: [0, -85, 0], y: [0, -25, 0], rotate: [0, -15, 0] }
                      : impact
                        ? { x: [0, 9, -9, 7, -7, 0], rotate: [0, 5, -5, 0] }
                        : {}
                }
                transition={{ duration: 0.7 }}
              >
                <Fighter
                  boss
                  attack={impact?.attack}
                  name={pvp ? names[1] : bossName}
                />
              </motion.div>
              <AnimatePresence>
                {impact && (
                  <motion.div
                    key={impact.id}
                    initial={{ opacity: 0, y: 0, scale: 0.6 }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      y: reduceMotion ? 0 : -65,
                      scale: 1,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2 }}
                    className={`pointer-events-none absolute top-14 z-20 text-center font-black ${impact.attack === "smash" ? "left-[15%] text-rose-500" : "right-[15%] text-amber-500"}`}
                  >
                    <span className="text-3xl sm:text-4xl">
                      −{impact.damage}
                    </span>
                    <p className="text-[10px] uppercase tracking-widest">
                      {impact.attack === "kick"
                        ? "Critical kick!"
                        : impact.attack === "smash"
                          ? "Double smash!"
                          : "Nice hit!"}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <span
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold ${comboCount ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
              >
                <Flame size={15} /> {comboCount}× COMBO{" "}
                {critical && "· CRITICAL 1.5×"}
              </span>
              <span className="text-[11px] text-slate-500">
                3 benar beruntun = flying kick{" "}
                <Zap size={12} className="inline text-amber-500" />
              </span>
            </div>
          </section>

          <AnimatePresence>
            {settingsOpen && (
              <Popup
                title="Pengaturan pertarungan"
                onClose={() => setSettingsOpen(false)}
              >
                <section className="p-5">
                  <p className="mb-4 text-xs text-slate-500">
                    Timer dijeda. Menerapkan pengaturan akan mengulang sesi dan
                    mereset seluruh bantuan.
                  </p>
                  <fieldset className="mb-4">
                    <legend className="mb-2 text-sm font-bold">
                      Lawan bertarung
                    </legend>
                    <div className="flex flex-wrap gap-4">
                      {["system", "pvp"].map((mode) => (
                        <label
                          key={mode}
                          className="flex min-h-11 items-center gap-2 text-sm font-bold"
                        >
                          <input
                            type="radio"
                            name="match-mode"
                            value={mode}
                            checked={draftMatchMode === mode}
                            onChange={() => setDraftMatchMode(mode)}
                            className="accent-emerald-600"
                          />
                          {mode === "system"
                            ? "Player vs System"
                            : "Player vs Player"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-sm font-bold">
                    Mata pelajaran
                    <select
                      value={draftSubject}
                      onChange={(event) => setDraftSubject(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
                    >
                      {SUBJECTS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-4 block text-sm font-bold">
                    Mode pertarungan
                    <select
                      value={draftMode}
                      onChange={(event) =>
                        setDraftMode(
                          event.target.value === "death" ? "death" : "limited",
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
                    >
                      <option value="limited">Maksimal jumlah soal</option>
                      <option value="death">Fight to Death</option>
                    </select>
                  </label>
                  {draftMode === "limited" && (
                    <label className="mt-4 block text-sm font-bold">
                      Maksimal jumlah soal (1–100)
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={draftLimit}
                        onChange={(event) => setDraftLimit(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950"
                      />
                    </label>
                  )}
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={
                        draftMode === "limited" &&
                        (!Number.isInteger(Number(draftLimit)) ||
                          Number(draftLimit) < 1 ||
                          Number(draftLimit) > 100)
                      }
                      onClick={() => {
                        setMatchMode(draftMatchMode);
                        setSubject(draftSubject);
                        setBattleMode(draftMode);
                        if (draftMode === "limited")
                          setMaxQuestions(Number(draftLimit));
                        restart();
                      }}
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                    >
                      Terapkan & mulai ulang
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className="rounded-xl border border-slate-300 px-4 py-3 text-sm dark:border-slate-700"
                    >
                      Batal
                    </button>
                  </div>
                </section>
              </Popup>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {questionOpen && !settingsOpen && gameStatus === "playing" && (
              <Popup
                title={`Giliranmu - ${activeName}`}
                color={currentPlayer === 1 ? "red" : "green"}
                onClose={() => {
                  setQuestionOpen(false);
                  setResting(true);
                }}
              >
                <section
                  aria-label="Soal dan jawaban"
                  className="overflow-hidden bg-white dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between px-5 pt-5 sm:px-7">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                        Soal {questionIndex + 1}
                        <span className="text-slate-400">
                          {" "}
                          / {battleMode === "death" ? "∞" : maxQuestions}
                        </span>
                      </span>
                      <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-slate-800 sm:inline">
                        {question.subject}
                      </span>
                    </div>
                    <span
                      role="timer"
                      aria-label={`Sisa waktu ${timer} detik`}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums ${timer <= 10 ? "bg-rose-100 text-rose-600 dark:bg-rose-500/10" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                    >
                      <Timer size={15} /> {timer}s
                    </span>
                  </div>
                  <div className="mx-5 mt-4 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 sm:mx-7">
                    <motion.div
                      initial={false}
                      animate={{ width: `${(timer / timerMax) * 100}%` }}
                      transition={{ duration: reduceMotion ? 0 : 0.5 }}
                      className={`h-full rounded-full ${timer <= 10 ? "bg-rose-500" : "bg-emerald-500"}`}
                    />
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={question.id}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="px-4 py-4 sm:px-7"
                    >
                      {question.passage && (
                        <div className="mb-4">
                          <p className="mb-2 flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <span className="flex items-center gap-1">
                              <BookOpen size={14} /> Bacaan
                            </span>
                            <span className="text-slate-500">
                              Gulir untuk membaca ↓
                            </span>
                          </p>
                          <div
                            role="region"
                            aria-label="Teks bacaan, dapat digulir"
                            tabIndex={0}
                            className="max-h-[28dvh] overflow-y-auto overscroll-contain whitespace-pre-line break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 sm:max-h-[35dvh]"
                          >
                            {question.passage}
                          </div>
                        </div>
                      )}
                      <h2 className="whitespace-pre-line break-words text-base font-bold leading-relaxed sm:text-xl">
                        {question.question}
                      </h2>
                      {question.formula && (
                        <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-semibold dark:border-slate-700 dark:bg-slate-950">
                          <code>{question.formula}</code>
                        </pre>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <div className="grid grid-cols-3 gap-2 px-5 pb-5 sm:px-7">
                    {powerButtons.map(({ id, icon: Icon, label, detail }) => (
                      <button
                        key={id}
                        type="button"
                        disabled={
                          settingsOpen ||
                          locked ||
                          gameStatus !== "playing" ||
                          powers[id] ||
                          (id === "heal" && activeHP === MAX_HP)
                        }
                        onClick={() => activatePower(id)}
                        title={
                          id === "heal" && activeHP === MAX_HP
                            ? "HP masih penuh"
                            : detail
                        }
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-2 py-3 transition hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-35 dark:border-slate-700 dark:hover:bg-violet-500/10"
                      >
                        <Icon size={17} className="shrink-0 text-violet-500" />
                        <span className="text-left">
                          <span className="block text-xs font-bold">
                            {label}
                          </span>
                          <span className="hidden text-[10px] text-slate-500 sm:block">
                            {powers[id] ? "Sudah dipakai" : detail}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-950/20 sm:grid-cols-2 sm:p-7">
                    {question.options.map((option, index) => {
                      const removed = eliminated.includes(index);
                      const isAnswer = locked && index === question.answer;
                      const wrong =
                        locked &&
                        selected === index &&
                        index !== question.answer;
                      return (
                        <button
                          type="button"
                          key={`${question.id}-${index}`}
                          disabled={
                            settingsOpen ||
                            locked ||
                            removed ||
                            gameStatus !== "playing"
                          }
                          onClick={() => answer(index)}
                          aria-label={`${"ABCD"[index]}. ${option}${removed ? ", dieliminasi" : ""}`}
                          className={`group flex min-h-16 items-center gap-3 rounded-xl border-2 p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${removed ? "border-transparent opacity-25" : isAnswer ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : wrong ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "border-slate-200 bg-white enabled:hover:border-emerald-400 enabled:hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"}`}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold ${isAnswer ? "bg-emerald-500 text-white" : wrong ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}
                          >
                            {isAnswer ? (
                              <Check size={18} />
                            ) : wrong ? (
                              <X size={18} />
                            ) : (
                              "ABCD"[index]
                            )}
                          </span>
                          <span
                            className={`flex-1 text-sm font-semibold ${removed ? "line-through" : ""}`}
                          >
                            {option}
                          </span>
                          {!locked && !removed && (
                            <ChevronRight
                              size={15}
                              className="text-slate-300 group-hover:text-emerald-500"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </Popup>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {editing !== null && (
              <Popup title="Ganti nama pemain" onClose={() => setEditing(null)}>
                <form
                  className="p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = draftName.trim();
                    if (!name) return;
                    setNames((previous) =>
                      previous.map((value, index) =>
                        index === editing ? name : value,
                      ),
                    );
                    setEditing(null);
                  }}
                >
                  <label className="block text-sm font-bold">
                    Nama pemain
                    <input
                      autoFocus
                      maxLength={24}
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!draftName.trim()}
                    className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:opacity-40"
                  >
                    Simpan nama
                  </button>
                </form>
              </Popup>
            )}
          </AnimatePresence>
          <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">
            Satu jawaban, satu serangan. Setiap kesalahan adalah kesempatan
            belajar.
            <br />
            {battleMode === "death"
              ? "Fight to Death: pertarungan berlanjut sampai salah satu HP habis."
              : `Batas ${maxQuestions} soal: mayoritas benar = Menang Angka. HP habis = KO.`}{" "}
            Bantuan hanya sekali per pemain per sesi.{" "}
            {pvp &&
              `Pemain bergantian menjawab pertanyaan. Sekarang giliran: ${activeName}.`}
          </p>
        </div>

        <AnimatePresence>
          {impact?.attack === "smash" && (
            <motion.div
              key={`flash-${impact.id}`}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, reduceMotion ? 0.04 : 0.15, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55 }}
              className="pointer-events-none fixed inset-0 z-40 bg-rose-600"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {gameStatus !== "playing" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
            >
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="result-title"
                initial={{ scale: reduceMotion ? 1 : 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onKeyDown={(event) => {
                  if (event.key === "Tab") {
                    const elements = Array.from(
                      event.currentTarget.querySelectorAll(
                        "button:not(:disabled)",
                      ),
                    );
                    const first = elements[0];
                    const last = elements[elements.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                      event.preventDefault();
                      last?.focus();
                    } else if (
                      !event.shiftKey &&
                      document.activeElement === last
                    ) {
                      event.preventDefault();
                      first?.focus();
                    }
                  }
                }}
                className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8"
              >
                {review ? (
                  <>
                    <button
                      autoFocus
                      type="button"
                      onClick={() => setReview(false)}
                      className="mb-5 flex items-center gap-2 text-sm font-bold text-emerald-600"
                    >
                      <ArrowLeft size={16} /> Kembali ke hasil
                    </button>
                    <h2 id="result-title" className="mb-5 text-2xl font-black">
                      Bekal untuk ronde berikutnya
                    </h2>
                    <div className="space-y-4">
                      {records.map((record) => {
                        const item = pool[record.questionIndex % pool.length];
                        return (
                          <article
                            key={record.questionIndex}
                            className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
                          >
                            <p
                              className={`mb-2 flex items-center gap-2 text-xs font-bold ${record.correct ? "text-emerald-500" : "text-rose-500"}`}
                            >
                              {record.correct ? (
                                <Check size={14} />
                              ) : (
                                <X size={14} />
                              )}{" "}
                              {pvp ? `${names[record.player]} · ` : ""}Soal{" "}
                              {record.questionIndex + 1} ·{" "}
                              {record.correct
                                ? "Benar"
                                : record.selected === null
                                  ? "Waktu habis"
                                  : "Belum tepat"}
                            </p>
                            <h3 className="text-sm font-bold">
                              {item.question}
                            </h3>
                            {item.formula && (
                              <code className="mt-2 block text-sm">
                                {item.formula}
                              </code>
                            )}
                            <p className="mt-3 text-xs text-slate-500">
                              Jawabanmu:{" "}
                              {record.selected === null
                                ? "Tidak menjawab"
                                : item.options[record.selected]}
                            </p>
                            <p className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              Kunci: {item.options[item.answer]}
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                              {item.explanation}
                            </p>
                          </article>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={restart}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"
                    >
                      <RotateCcw size={16} /> Main Lagi
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl ${gameStatus === "victory" ? "bg-amber-100 text-amber-500 dark:bg-amber-500/10" : "bg-rose-100 text-rose-500 dark:bg-rose-500/10"}`}
                    >
                      {gameStatus === "victory" ? (
                        <Trophy size={42} />
                      ) : (
                        <Shield size={42} />
                      )}
                    </div>
                    <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
                      Pertarungan selesai
                    </p>
                    <h2
                      id="result-title"
                      className="mt-2 text-center text-3xl font-black"
                    >
                      {pvp
                        ? gameStatus === "draw"
                          ? "Seri!"
                          : `${names[gameStatus === "victory" ? 0 : 1]} menang ${resultKind === "ko" ? "KO!" : "angka!"}`
                        : gameStatus === "victory"
                          ? resultKind === "ko"
                            ? "KO! 🎉"
                            : "Menang Angka! 🎉"
                          : resultKind === "ko"
                            ? "Kalah KO"
                            : "Kalah Angka"}
                    </h2>
                    <p className="mb-6 mt-2 text-center text-sm text-slate-500">
                      {pvp
                        ? `${names[0]}: ${playerHP} HP · ${names[1]}: ${bossHP} HP. ${gameStatus === "draw" ? "HP sama, pertandingan seri." : "Pemain dengan HP tersisa lebih tinggi menang."}`
                        : gameStatus === "victory"
                          ? "Ilmu adalah kekuatan. Kamu menaklukkan tantangan!"
                          : "Pahlawan pun perlu latihan. Pelajari, lalu coba lagi."}
                    </p>
                    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-4 text-center dark:bg-slate-950">
                      <div>
                        <p className="text-xl font-black">
                          {correctCount * 100}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                          Skor
                        </p>
                      </div>
                      <div>
                        <p className="text-xl font-black text-emerald-500">
                          {accuracy}%
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                          Akurasi
                        </p>
                      </div>
                      <div>
                        <p className="text-xl font-black text-amber-500">
                          {maxCombo}×
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                          Max combo
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-center text-xs text-slate-500">
                      {correctCount} benar dari {records.length} soal dijawab ·{" "}
                      {battleMode === "death"
                        ? "Fight to Death · tanpa batas soal"
                        : `batas ${maxQuestions} soal`}
                    </p>
                    <div className="my-5 flex justify-center gap-5 text-sm font-bold">
                      <span className="flex items-center gap-1.5 text-violet-500">
                        <Crown size={17} /> +
                        {gameStatus === "victory" ? correctCount * 50 + 100 : 0}{" "}
                        XP
                      </span>
                      <span className="flex items-center gap-1.5 text-amber-500">
                        <Coins size={17} /> +
                        {gameStatus === "victory" ? correctCount * 10 + 25 : 0}{" "}
                        koin
                      </span>
                    </div>
                    <p className="mb-5 text-center text-[10px] text-slate-400">
                      Hadiah demo sesi ini; tidak disimpan ke akun.
                    </p>
                    <button
                      autoFocus
                      type="button"
                      onClick={restart}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                    >
                      <RotateCcw size={16} /> Main Lagi <ArrowRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReview(true)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3.5 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <BookOpen size={16} /> Lihat Pembahasan
                    </button>
                  </>
                )}
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
