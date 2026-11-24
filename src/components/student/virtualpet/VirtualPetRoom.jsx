"use client";
import { useEffect, useRef, useState } from "react";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";
import useVirtualpetRoom from "./useVirtualpetRoom";
import VirtualpetQuiz from "./VirtualpetQuiz";
import { MODES } from "@/lib/student/virtualpet-client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Backpack,
  BookOpen,
  Check,
  Droplets,
  Heart,
  Home,
  Leaf,
  Moon,
  PawPrint,
  Settings2,
  Sparkles,
  Star,
  Sun,
  Utensils,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
const KEY = "tka-tryon-virtual-pet-v1";
const SPECIES = [
  {
    id: "capybara",
    name: "Kapybara",
    description: "Si santai yang selalu menemanimu",
  },
  {
    id: "bear",
    name: "Beruang Madu",
    description: "Hangat, manis, dan suka belajar",
  },
  {
    id: "cat",
    name: "Kucing Oranye",
    description: "Si aktif dengan sejuta tingkah",
  },
];
const ITEMS = [
  {
    id: "water",
    name: "Air segar",
    emoji: "💧",
    benefit: "+30 Minum",
    tier: "KEBUTUHAN",
    color: "#e5f4fc",
  },
  {
    id: "rice",
    name: "Nasi hangat",
    emoji: "🍙",
    benefit: "+30 Makan",
    tier: "KEBUTUHAN",
    color: "#fff1df",
  },
  {
    id: "apple",
    name: "Apel manis",
    emoji: "🍎",
    benefit: "+10 Makan, Minum & Bahagia",
    tier: "COMMON",
    color: "#eff6e4",
  },
  {
    id: "donut",
    name: "Donat stroberi",
    emoji: "🍩",
    benefit: "+15 Makan & Bahagia",
    tier: "RARE",
    color: "#f5eafb",
  },
  {
    id: "cake",
    name: "Kue pelangi",
    emoji: "🍰",
    benefit: "+20 Makan & Bahagia",
    tier: "LEGENDARY",
    color: "#fff4cd",
  },
  {
    id: "vitamin",
    name: "Vitamin sehat",
    emoji: "💊",
    benefit: "+5 Makan, Minum & Bahagia",
    tier: "PERAWATAN",
    color: "#e4f5ed",
  },
];
const LABEL = {
  happy: "Bahagia banget",
  normal: "Nyaman & tenang",
  hungry_thirsty: "Butuh perhatian",
  sick: "Sedang kurang sehat",
  fainted: "Sedang hibernasi",
};
/** Self-contained vector illustration, shared by the room and adoption cards. */
function PetIllustration({ species, status, small = false }) {
  const reduced = useReducedMotion();
  const ill = status === "sick";
  const asleep = status === "fainted";
  const happy = status === "happy";
  const color = ill
    ? "#bcabc0"
    : species === "cat"
      ? "#e8a355"
      : species === "bear"
        ? "#6f4b35"
        : "#bb9069";
  const light = ill ? "#d6c8dc" : species === "bear" ? "#bd9568" : "#e7c6a0";
  return (
    <motion.svg
      viewBox="0 0 360 300"
      role="img"
      aria-label={`${SPECIES.find((s) => s.id === species)?.name}, ${LABEL[status]}`}
      className="h-full w-full overflow-visible"
      animate={
        !reduced && happy && !small
          ? { y: [0, -9, 0], rotate: [-1, 1, -1] }
          : { y: 0 }
      }
      transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
    >
      <ellipse
        cx="181"
        cy="272"
        rx="105"
        ry="14"
        fill="#61492f"
        opacity=".12"
      />
      {asleep && (
        <>
          <rect
            x="38"
            y="43"
            width="284"
            height="238"
            rx="100"
            fill="#d7edf3"
            fillOpacity=".65"
            stroke="#87bac7"
            strokeWidth="5"
          />
          <path d="M63 230h234" stroke="#87bac7" strokeWidth="5" />
          <text x="267" y="80" fill="#6585a1" fontSize="28" fontWeight="bold">
            Zz
          </text>
        </>
      )}
      <ellipse cx="181" cy="214" rx="91" ry="61" fill={color} />
      <ellipse cx="137" cy="260" rx="31" ry="15" fill={color} />
      <ellipse cx="228" cy="260" rx="31" ry="15" fill={color} />
      {species === "cat" ? (
        <>
          <path
            d="M98 111 91 44q35 1 61 43M210 84q26-35 56-38l-7 72"
            fill={color}
            stroke="#b7773d"
            strokeWidth="3"
          />
          <path d="m105 87-4-27 30 25m95-1 26-23-3 31" fill="#e9b4a7" />
          <path
            d="M262 229q68-70 61-10-6 33-53 35"
            fill="none"
            stroke={color}
            strokeWidth="22"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="111" cy="83" rx="27" ry="28" fill={color} />
          <ellipse cx="245" cy="83" rx="27" ry="28" fill={color} />
          <ellipse cx="111" cy="83" rx="14" ry="15" fill={light} />
          <ellipse cx="245" cy="83" rx="14" ry="15" fill={light} />
        </>
      )}
      <rect
        x="78"
        y="76"
        width="205"
        height="154"
        rx={species === "capybara" ? 65 : 78}
        fill={color}
      />
      <ellipse
        cx="180"
        cy="190"
        rx={species === "capybara" ? 72 : 51}
        ry="37"
        fill={light}
      />
      {species === "cat" && (
        <g stroke="#ba773d" strokeWidth="7" strokeLinecap="round">
          <path d="m161 80 5 22m16-25v24m19-20-5 22" />
          <path d="m92 172 19 4m-20 11 19-2m158-13-19 4m20 11-19-2" />
        </g>
      )}
      <motion.g
        style={{ transformOrigin: "180px 145px" }}
        animate={
          !small && !happy && !asleep && !reduced
            ? { scaleY: [1, 1, 0.08, 1, 1] }
            : { scaleY: 1 }
        }
        transition={{
          duration: 5,
          times: [0, 0.85, 0.88, 0.91, 1],
          repeat: Infinity,
        }}
      >
        {happy ? (
          <g stroke="#433327" strokeWidth="6" fill="none" strokeLinecap="round">
            <path d="M116 148q11-20 22 0m84 0q11-20 22 0" />
          </g>
        ) : asleep ? (
          <g stroke="#554355" strokeWidth="5" fill="none" strokeLinecap="round">
            <path d="m115 148 22 4m85 0 22-4" />
          </g>
        ) : (
          <>
            <ellipse cx="127" cy="145" rx="6" ry={ill ? 5 : 8} fill="#362c27" />
            <ellipse cx="233" cy="145" rx="6" ry={ill ? 5 : 8} fill="#362c27" />
            <circle cx="129" cy="142" r="2" fill="white" />
            <circle cx="235" cy="142" r="2" fill="white" />
          </>
        )}
      </motion.g>
      <ellipse cx="111" cy="166" rx="16" ry="9" fill="#e39a8a" opacity=".55" />
      <ellipse cx="250" cy="166" rx="16" ry="9" fill="#e39a8a" opacity=".55" />
      {species === "capybara" ? (
        <>
          <ellipse cx="163" cy="179" rx="4" ry="3" fill="#75523c" />
          <ellipse cx="194" cy="179" rx="4" ry="3" fill="#75523c" />
        </>
      ) : (
        <path d="M171 172q9-6 18 0l-9 8Z" fill="#49352d" />
      )}
      <path
        d={
          ill || status === "hungry_thirsty"
            ? "M168 204q12-12 24 0"
            : happy
              ? "M164 196q16 24 32 0Z"
              : "M168 198q12 10 24 0"
        }
        fill={happy ? "#7a473d" : "none"}
        stroke="#674c3b"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {happy && (
        <path
          d="M173 206q8-6 15 0"
          stroke="#eea1a0"
          strokeWidth="5"
          strokeLinecap="round"
        />
      )}
      {species === "bear" && (
        <path d="m151 235 29 16 29-16-9 23h-39Z" fill="#f5ce80" />
      )}
      {!ill && !asleep && (
        <>
          <path
            d="M154 79q23-18 49-3"
            stroke="#658a47"
            strokeWidth="6"
            fill="none"
          />
          <ellipse
            cx="178"
            cy="67"
            rx="14"
            ry="7"
            transform="rotate(-25 178 67)"
            fill="#86a35d"
          />
          <ellipse
            cx="198"
            cy="69"
            rx="13"
            ry="7"
            transform="rotate(25 198 69)"
            fill="#a9bf75"
          />
        </>
      )}
      {ill && (
        <>
          <rect
            x="139"
            y="88"
            width="83"
            height="24"
            rx="7"
            fill="#edf9fb"
            stroke="#a0c8d9"
            strokeWidth="2"
          />
          <path
            d="m156 93-4 14m22-14-4 14m22-14-4 14m22-14-4 14"
            stroke="#bedfea"
            strokeWidth="3"
          />
        </>
      )}
      {status === "hungry_thirsty" && (
        <path d="M269 111q-18 25 0 25t0-25" fill="#84c7e4" />
      )}
    </motion.svg>
  );
}
/** Cute backpack resting on the room floor; clicking it opens the inventory popup. */
function FloorBag({ count, onOpen }) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-label={`Buka tas perbekalan, ${count} item`}
      whileHover={reduced ? {} : { y: -4, rotate: -3 }}
      whileTap={reduced ? {} : { scale: 0.9 }}
      className="absolute bottom-5 right-[5%] z-20 cursor-pointer transition-transform sm:bottom-7 sm:right-[6%]"
    >
      <svg
        viewBox="0 0 64 68"
        className="h-[52px] w-[52px] drop-shadow-[0_4px_4px_rgba(97,73,47,.22)] md:h-[62px] md:w-[62px]"
      >
        <ellipse cx="32" cy="63" rx="19" ry="4" fill="#61492f" opacity=".14" />
        <path
          d="M24 13q8-9 16 0"
          fill="none"
          stroke="#5d7a3f"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M14 26q-6 2-6 10t6 10M50 26q6 2 6 10t-6 10"
          fill="none"
          stroke="#5d7a3f"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <rect x="10" y="18" width="44" height="42" rx="14" fill="#7d9b57" />
        <path
          d="M10 32q0-14 22-14t22 14v2a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z"
          fill="#6b8a49"
        />
        <rect x="21" y="40" width="22" height="14" rx="6" fill="#93b06d" />
        <path d="M21 45h22" stroke="#7d9b57" strokeWidth="2.5" />
        <circle cx="32" cy="49" r="2.8" fill="#f4efdd" />
        <path
          d="M20 27h24"
          stroke="#5d7a3f"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity=".45"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#73895d] px-1 text-center text-[9px] font-bold leading-[18px] text-white shadow ring-2 ring-white/70">
          {count}
        </span>
      )}
      <span className="absolute -bottom-1 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-white/85 px-2 py-0.5 text-[8px] font-bold text-[#748064] md:block">
        Tas perbekalan
      </span>
    </motion.button>
  );
}
function Meter({ label, value, color, icon }) {
  return (
    <div className="vp-meter">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          {icon}
          {label}
        </span>
        <span>
          <b>{value}</b>
          <span className="opacity-40"> / 100</span>
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <motion.div
          className="h-full rounded-full"
          style={{ background: value < 15 ? "#d78391" : color }}
          animate={{ width: `${value}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </div>
    </div>
  );
}
export default function VirtualPetRoom() {
  const { pet, loaded, session, profileXp, busy, error, tips, hideTips, updateTips, dismissTips, result, dismissResult, run } = useVirtualpetRoom();
  const [species, setSpecies] = useState("capybara");
  const [name, setName] = useState("Mochi");
  const [dark, setDark] = useState(false);
  const [muted, setMuted] = useState(true);
  const [tab, setTab] = useState("Semua item");
  const [toast, setToast] = useState("");
  const [effects, setEffects] = useState([]);
  const [adopt, setAdopt] = useState(false);
  const [bag, setBag] = useState(false);
  const [help, setHelp] = useState(false);
  const audio = useRef(null);
  const room = useRef(null);
  const timer = useRef(null);
  const effectTimers = useRef([]);
  const lastStatus = useRef(null);
  const reduced = useReducedMotion();
  const status = pet?.status || "normal";
  const level = pet?.level ?? 0;
  const xp = pet ? pet.xp % 100 : 0;
  const totalItems = pet
    ? Object.values(pet.inventory).reduce((a, b) => a + b, 0)
    : 0;
  useEffect(() => {
    const pendingEffects = effectTimers.current;
    const initialize = setTimeout(() => {
      try { setDark(localStorage.getItem(`${KEY}-theme`) === "dark"); } catch { /* Optional theme. */ }
    }, 0);
    return () => {
      clearTimeout(initialize);
      if (timer.current) clearTimeout(timer.current);
      pendingEffects.forEach(clearTimeout);
      void audio.current?.close();
    };
  }, []);
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(`${KEY}-theme`, dark ? "dark" : "light");
      } catch {
        /* Theme still works in memory. */
      }
    }
  }, [dark, loaded]);
  function sound(kind) {
    if (muted) return;
    try {
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      void context.resume();
      const notes =
        kind === "happy" || kind === "feed"
          ? [523, 659, 784]
          : kind === "sick" || kind === "fainted"
            ? [330, 262, 196]
            : [392, 330];
      notes.forEach((frequency, i) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + i * 0.12;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.07, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.26);
      });
    } catch {
      /* Audio is optional on unsupported browsers. */
    }
  }
  useEffect(() => {
    if (pet && lastStatus.current !== status) {
      if (lastStatus.current) sound(status);
      lastStatus.current = status;
    }
  });
  function notify(message) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3800);
  }
  async function startPet() {
    if (!name.trim() || busy) return;
    if (await run("adopt", { pet_type: species, pet_name: name.trim() })) {
      setAdopt(false);
      notify("Sahabatmu siap menemani. Progres tetap tersimpan! 🌱");
      sound("happy");
    }
  }
  function openBag() {
    if (busy || tips || session || !loaded) return;
    pet ? setBag(true) : notify("Adopsi sahabatmu dulu, ya!");
  }
  async function feed(id) {
    if (!pet || busy || !pet.inventory[id]) return;
    const item = ITEMS.find(value => value.id === id);
    if (!await run("feed", { item: id })) return;
    const effect = { id: crypto.randomUUID(), emoji: item.emoji, text: item.benefit, special: id === "cake", x: 0, y: 60 };
    setEffects(previous => [...previous, effect]);
    effectTimers.current.push(setTimeout(() => setEffects(previous => previous.filter(value => value.id !== effect.id)), 2100));
    sound("feed");
    notify(item.name + " diberikan — " + item.benefit);
  }
  async function startQuiz(scenario) {
    if (await run("start", { scenario })) { setHelp(false); setBag(false); }
  }
  const modalOpen = loaded && !tips && !session && !result && (!pet || adopt);
  return (
    <div className={dark ? "virtualpet-scope dark" : "virtualpet-scope"}>
      <div className="vp-app min-h-dvh bg-[#f8f9f5] text-[#354436] dark:bg-[#18231e] dark:text-[#e3eadd]">
        <style>{`
      .vp-app{font-family:Arial,Helvetica,sans-serif;font-size:14px;overflow-x:hidden;--panel:#fff;--line:#e8ece3;--muted:#879183;--green:#66834e;--soft:#f3f6ee}
      .dark .vp-app{--panel:#233129;--line:#37483b;--muted:#a4b09e;--green:#a5c68a;--soft:#2c3b2e}
      .vp-app button{touch-action:manipulation}
      .vp-app button:disabled{cursor:not-allowed;opacity:.5}
      .vp-panel{background:var(--panel);border:1px solid var(--line);border-radius:22px}
      .vp-muted{color:var(--muted)}
      .vp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;padding:11px 16px;font-weight:600;transition:background .2s,transform .2s;cursor:pointer}
      .vp-btn:hover{filter:brightness(.97);transform:translateY(-1px)}
      .vp-app button:focus-visible{outline:3px solid #94ad6f;outline-offset:4px}
      .vp-icon{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid var(--line);background:var(--panel);border-radius:12px;cursor:pointer}
      .vp-meter{padding:19px 20px;border-radius:16px;background:var(--soft)}
      .vp-room{background:linear-gradient(180deg,#f5ecd8 0%,#f5ecd8 72%,#e9dcc4 72%,#eee3ce 100%)}
      .dark .vp-room{background:linear-gradient(180deg,#354037 0%,#354037 72%,#414737 72%,#464a39 100%)}
      .vp-room.unwell{filter:saturate(.55);background:linear-gradient(#d8d5e4 72%,#c8c4d4 72%)}
      .vp-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px}
      .vp-item:hover{border-color:#a9bd8d!important;box-shadow:0 5px 16px #6077470d}
      .vp-item:disabled{opacity:.5;cursor:not-allowed}
      .vp-dot{background-image:radial-gradient(#92a47b30 1px,transparent 1px);background-size:16px 16px}
      .vp-modal{max-height:92dvh;overflow-y:auto;overscroll-behavior:contain}
      .vp-room-line{position:absolute;left:0;right:0;height:1px;background:#b7a17b22}
      .vp-nav-active{background:#eef3e7;color:#667e4e}
      .dark .vp-nav-active{background:#35462e;color:#c6d7ae}
      .vp-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
      .vp-tabs::-webkit-scrollbar{display:none}
      .vp-tab{position:relative;flex:0 0 auto;min-height:42px;padding:10px 12px;font-size:11px;font-weight:600;white-space:nowrap;cursor:pointer}
      @media(max-width:1050px){.vp-grid{grid-template-columns:minmax(0,1fr) 265px}}
      @media(max-width:767px){
        .vp-grid{grid-template-columns:minmax(0,1fr);gap:16px}
        .vp-desktop,.vp-badge,.vp-room-caption,.vp-decor-side{display:none!important}
        .vp-room{min-height:330px!important}
        .vp-h1{font-size:25px!important}
        .vp-mission-btn{width:100%!important}
        .vp-hero-pill{display:none!important}
      }
      @media(prefers-reduced-motion:reduce){.vp-app *,.vp-app *:before,.vp-app *:after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
    `}</style>
        <main className="mx-auto max-w-[1200px] px-3 py-8 sm:px-3 md:px-8">
          <DashboardBreadcrumb current="Sahabat Virtual" />
          {!loaded && <p role="status" className="vp-panel mb-4 p-4">{busy ? "Memuat sahabatmu…" : "Data VirtualPet belum dimuat."}</p>}
          {error && !session && <div role="alert" className="vp-panel fixed inset-x-4 top-4 z-[75] mx-auto max-w-xl p-4 text-red-600 shadow-xl">{error}<button disabled={busy} className="vp-btn ml-3 bg-[var(--soft)]" onClick={() => run("bootstrap")}>Coba lagi</button></div>}
          {busy && <p role="status" className="mb-3 text-xs">Memproses perintah…</p>}
          <header id="header" className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-[#799261] p-2.5 text-white shadow-lg shadow-[#799261]/25">
                <PawPrint size={24} />
              </span>
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">
                  Sahabat Virtual
                </h1>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-[var(--green)]">
                  Belajar. Merawat. Tumbuh bersama.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="shrink-0 rounded-full vp-icon !h-10 !w-10"
                aria-label={
                  dark ? "Aktifkan mode terang" : "Aktifkan mode gelap"
                }
                aria-pressed={dark}
                onClick={() => setDark((d) => !d)}
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </header>
          <div className="vp-grid">
            <section className="vp-panel overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <Home size={16} className="shrink-0 text-[var(--green)]" />{" "}
                  <span className="truncate">Ruang nyaman</span>{" "}
                  <span className="hidden shrink-0 rounded-md bg-[var(--soft)] px-2 py-1 text-[9px] font-medium vp-muted sm:inline">
                    RUMAH LEVEL {level}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="vp-icon relative !h-9 !w-9 !rounded-lg"
                    onClick={openBag}
                    aria-label="Buka tas perbekalan"
                  >
                    <Backpack size={15} />
                    {pet && totalItems > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 min-w-[16px] rounded-full bg-[#73895d] px-1 text-center text-[8px] font-bold leading-4 text-white">
                        {totalItems}
                      </span>
                    )}
                  </button>
                  <button
                    className="vp-icon !h-9 !w-9 !rounded-lg"
                    onClick={() => {
                      setMuted((m) => !m);
                    }}
                    aria-label={muted ? "Aktifkan suara" : "Matikan suara"}
                  >
                    {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <button
                    className="vp-icon !h-9 !w-9 !rounded-lg"
                    onClick={() => {
                      if (pet) {
                        setSpecies(pet.species);
                        setName(pet.name);
                      }
                      setAdopt(true);
                    }}
                    disabled={busy || !loaded || !!tips || !!session}
                    aria-label="Ganti peliharaan"
                  >
                    <Settings2 size={15} />
                  </button>
                </div>
              </div>
              <div
                ref={room}
                className={`vp-room relative isolate flex min-h-[400px] items-end justify-center overflow-hidden ${status === "sick" || status === "fainted" ? "unwell" : ""}`}
              >
                <div className="absolute left-[8%] top-8 h-[100px] w-[76px] rounded-t-[38px] border-[6px] border-[#e1d1b1] bg-[#dbe9d1] shadow-[0_4px_0_#b6a38618] md:top-10 md:h-[133px] md:w-[100px] md:rounded-t-[48px] md:border-[7px]">
                  <div className="absolute inset-0 overflow-hidden rounded-t-[32px] md:rounded-t-[40px]">
                    <div className="absolute -right-3 top-3 h-8 w-8 rounded-full bg-[#f9e9a5] md:h-10 md:w-10" />
                    <div className="absolute -bottom-7 -left-5 h-16 w-20 rounded-full bg-[#b5c99f] md:h-20 md:w-24" />
                    <div className="absolute -bottom-6 left-7 h-14 w-20 rounded-full bg-[#a3bd8c] md:h-16 md:w-24" />
                  </div>
                  <div className="absolute left-1/2 top-0 h-full w-1 bg-[#e1d1b1]" />
                  <div className="absolute left-0 top-[60%] h-1 w-full bg-[#e1d1b1]" />
                </div>
                <div className="vp-decor-side absolute right-[10%] top-16 w-[77px]">
                  <div className="mx-auto flex h-20 w-16 items-center justify-center rounded-t-full border-[5px] border-[#c8ac83] bg-[#eee5cf]">
                    <Leaf
                      size={35}
                      className="rotate-[-25deg] text-[#92a271]"
                    />
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-[#c3a27c] shadow-md" />
                  <div className="absolute -right-3 top-[75px] text-3xl">
                    🌱
                  </div>
                </div>
                <div className="vp-room-line top-[80%]" />
                <div className="vp-room-line top-[93%]" />
                <div className="absolute bottom-6 left-[17%] h-14 w-[60%] rounded-[50%] border-[5px] border-[#d6c6a5] bg-[#dfe2c5] opacity-70 md:h-16 md:border-[6px]" />
                <div
                  className="absolute bottom-10 left-[5%] text-[30px] md:bottom-12 md:left-[7%] md:text-[45px]"
                  aria-hidden="true"
                >
                  🪴
                </div>
                <div
                  className="vp-decor-side absolute bottom-11 right-[17%] text-[36px]"
                  aria-hidden="true"
                >
                  🧶
                </div>
                <div className="absolute left-1/2 top-5 z-10 w-max max-w-[86%] -translate-x-1/2 rounded-2xl rounded-bl-sm bg-white/90 px-3.5 py-2 text-center text-[11px] font-medium leading-snug text-[#748064] shadow-sm md:top-7 md:px-4 md:py-2.5 md:text-xs">
                  {status === "happy"
                    ? "Bersamamu, belajar jadi seru!"
                    : status === "sick"
                      ? "Aku butuh vitamin dan istirahat…"
                      : status === "fainted"
                        ? "Bantu aku bangun lagi, ya…"
                        : status === "hungry_thirsty"
                          ? "Boleh minta makan dan minum?"
                          : "Senang kamu ada di sini ♡"}
                </div>
                {pet && (
                  <div
                    className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5 md:hidden"
                    aria-label="Kebutuhan sahabatmu"
                  >
                    <span className="flex w-14 items-center justify-center gap-1 rounded-full bg-white/85 py-1 text-[10px] font-bold text-[#54718a] shadow-sm">
                      <Droplets size={11} className="text-[#79a9c0]" />
                      {pet.hydration}
                    </span>
                    <span className="flex w-14 items-center justify-center gap-1 rounded-full bg-white/85 py-1 text-[10px] font-bold text-[#8a6a3d] shadow-sm">
                      <Utensils size={11} className="text-[#c99b65]" />
                      {pet.hunger}
                    </span>
                    <span className="flex w-14 items-center justify-center gap-1 rounded-full bg-white/85 py-1 text-[10px] font-bold text-[#94566c] shadow-sm">
                      <Heart size={11} className="text-[#cc8c9e]" />
                      {pet.happiness}
                    </span>
                  </div>
                )}
                <FloorBag count={totalItems} onOpen={openBag} />
                <div className="relative z-10 mb-8 h-[225px] w-[265px] max-w-[85%] sm:mb-9 sm:h-[260px] sm:w-[310px] md:max-w-[78%]">
                  {pet ? (
                    <PetIllustration species={pet.species} status={status} />
                  ) : (
                    <PetIllustration species="capybara" status="normal" />
                  )}
                  {status === "happy" &&
                    [0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="absolute text-[#d88c8a]"
                        style={{
                          left: `${20 + i * 26}%`,
                          top: `${i % 2 ? 3 : 12}%`,
                        }}
                        animate={
                          reduced
                            ? {}
                            : {
                                y: [-3, -18, -3],
                                opacity: [0.4, 0.9, 0.4],
                                rotate: [-12, 12, -12],
                              }
                        }
                        transition={{
                          duration: 3,
                          delay: i * 0.7,
                          repeat: Infinity,
                        }}
                      >
                        <Heart size={i === 1 ? 20 : 14} fill="currentColor" />
                      </motion.div>
                    ))}
                </div>
                <AnimatePresence>
                  {effects.map((e) => (
                    <motion.div
                      key={e.id}
                      className="pointer-events-none absolute left-1/2 top-[60%] z-30"
                      initial={{
                        x: reduced ? 0 : e.x,
                        y: reduced ? 0 : e.y,
                        scale: 0.7,
                        opacity: 1,
                      }}
                      animate={{
                        x: 0,
                        y: -30,
                        scale: [1, 1.4, 1],
                        opacity: [1, 1, 0],
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0.2 : 1.7 }}
                    >
                      <span className="text-3xl sm:text-4xl">{e.emoji}</span>
                      <span className="absolute -left-10 top-11 w-32 rounded-full bg-white/95 px-3 py-2 text-center text-[11px] font-bold text-[#688653] shadow sm:-left-12 sm:top-12 sm:w-40 sm:text-xs">
                        {e.text}
                      </span>
                      {e.special &&
                        Array.from({ length: 8 }, (_, i) => (
                          <motion.span
                            key={i}
                            className="absolute text-lg"
                            initial={{ x: 0, y: 0 }}
                            animate={{
                              x: Math.cos((i * Math.PI) / 4) * 100,
                              y: Math.sin((i * Math.PI) / 4) * 90 - 30,
                              opacity: 0,
                            }}
                            transition={{ delay: 0.6, duration: 1 }}
                          >
                            {e.emoji === "🍰" ? "✨" : "💗"}
                          </motion.span>
                        ))}
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div className="vp-room-caption absolute bottom-3 left-4 rounded-full bg-white/60 px-3 py-1.5 text-[10px] text-[#82765f]">
                  ✦ Tempat favorit untuk tumbuh
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <span className="flex items-center gap-2 text-xs vp-muted">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#9db47d]" />
                  {pet?.name || "Sahabatmu"}{" "}
                  {status === "happy"
                    ? "merasa disayang. Terus pertahankan!"
                    : "menantikan perhatian kecil darimu."}
                </span>
                <span className="hidden text-[10px] vp-muted sm:block">
                  Diperbarui otomatis
                </span>
              </div>
            </section>
            <aside className="flex flex-col gap-4">
              <section className="vp-panel p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-2xl bg-[#f1eadc] p-1">
                    {" "}
                    <PetIllustration
                      species={pet?.species || "capybara"}
                      status="normal"
                      small
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold">
                      {pet?.name || "Sahabat baru"}
                      <span className="ml-2 text-xs text-[#a4b58d]">✦</span>
                    </h2>
                    <p className="mt-1 truncate text-[11px] vp-muted">
                      {SPECIES.find((s) => s.id === pet?.species)?.name ||
                        "Pilih sahabatmu"}{" "}
                      · Sahabat belajarmu
                    </p>
                  </div>
                </div>
                <div className="mb-5 flex items-center justify-between gap-2">
                  <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[#f8f0d7] px-2.5 py-1.5 text-[11px] font-bold text-[#9b8345]">
                    <Star size={12} fill="currentColor" /> Level {level}
                  </span>
                  <span className="truncate rounded-full bg-[var(--soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--green)]">
                    {status === "happy" ? "♡" : "◌"} {LABEL[status]}
                  </span>
                </div>
                <div className="mb-2 flex justify-between text-[10px]">
                  <span className="font-semibold">Tumbuh bersama</span>
                  <span className="vp-muted">{xp} / 100 XP</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--soft)]">
                  <motion.div
                    className="h-full rounded-full bg-[#a6b881]"
                    animate={{ width: `${xp}%` }}
                  />
                </div>
                <p className="mt-2 text-[10px] vp-muted">
                  XP profil: {profileXp} · Hadiah kuis menambah XP profil, bukan XP pet.
                </p>
              </section>
              <section className="vp-panel hidden flex-1 p-4 md:block">
                <h3 className="mb-4 px-1 text-xs font-bold">
                  Kebutuhan sahabatmu
                </h3>
                <div className="space-y-3">
                  <Meter
                    label="Minum"
                    value={pet?.hydration ?? 0}
                    color="#8eb9ce"
                    icon={<Droplets size={16} className="text-[#79a9c0]" />}
                  />
                  <Meter
                    label="Makan"
                    value={pet?.hunger ?? 0}
                    color="#dbb37e"
                    icon={<Utensils size={16} className="text-[#c99b65]" />}
                  />
                  <Meter
                    label="Bahagia"
                    value={pet?.happiness ?? 0}
                    color="#d89aab"
                    icon={<Heart size={16} className="text-[#cc8c9e]" />}
                  />
                </div>
              </section>
            </aside>
          </div>
          {status === "fainted" && pet && (
            <section className="vp-panel mt-5 p-5">
              <h3 className="font-bold">Misi penyelamatan: 15 soal tanpa batas waktu</h3>
              <p className="my-3 text-xs vp-muted">Minimal 12/15 benar (80%): kenyang dan hidrasi +50, maksimal 100; XP profil +2.</p>
              <button disabled={busy} className="vp-btn bg-[#73895d] text-white" onClick={() => startQuiz("PENYELAMATAN")}>Mulai penyelamatan</button>
            </section>
          )}
          <section className="vp-dot mt-5 flex flex-col items-start gap-4 rounded-2xl border border-[#e0e7d5] bg-[#edf2e5] p-4 text-[#526644] sm:mt-6 sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-[#3a4c33] dark:bg-[#2b3b29]">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/60 text-[#82976b]">
                <BookOpen size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold dark:text-[#d3e2c5]">
                  Ilmu untukmu, hadiah untuk sahabatmu.
                </h3>
                <p className="mt-1 text-[11px] text-[#849277]">
                  Selesaikan kuis untuk mengumpulkan makanan dan XP baru.
                </p>
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                className="vp-btn flex-1 border border-[#cdd8bd] bg-[var(--panel)] text-xs text-[#5c7044] sm:flex-none"
                onClick={openBag}
              >
                <Backpack size={15} /> Buka tas ({totalItems})
              </button>
              <button
                className="vp-btn flex-1 bg-[#73895d] text-xs text-white sm:flex-none"
                disabled={busy || !loaded || !!tips || !!session}
                onClick={() => setHelp(true)}
              >
                Ayo belajar <ArrowRight size={15} />
              </button>
            </div>
          </section>

        </main>
        {tips && <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="vp-tip-title" className="vp-panel w-full max-w-md p-6"><h2 id="vp-tip-title" className="font-bold">Tips sahabat virtual</h2><p className="my-4 whitespace-pre-wrap">{tips.message}</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={hideTips} onChange={event => updateTips(event.target.checked)} />Jangan tampilkan lagi</label><button disabled={busy} className="vp-btn mt-4 bg-[#73895d] text-white" onClick={dismissTips}>Lanjutkan</button></section></div>}
        {session && !tips && <VirtualpetQuiz key={session.attempt_id} session={session} busy={busy} error={error} onFinish={payload => run("finish", payload)} />}
        {result && !tips && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="vp-result-title" className="vp-panel w-full max-w-md p-6"><h2 id="vp-result-title" className="text-xl font-bold">{result.passed ? "Misi berhasil!" : "Terus semangat belajar!"}</h2><p className="my-3">Hasil server: {result.correct}/{result.total} benar · Nilai {result.score} · Ambang 80%</p><ul className="text-sm">{Object.entries(result.rewards || {}).filter(([, count]) => count > 0).map(([id, count]) => <li key={id}>{ITEMS.find(item => item.id === id)?.name || ({ profile_xp: "XP profil", hunger: "Kenyang", hydration: "Hidrasi" })[id] || id}: +{count}</li>)}</ul>{!result.passed && <p className="text-sm">Belum mendapat hadiah. Coba lagi dengan sesi baru.</p>}<button className="vp-btn mt-4 bg-[#73895d] text-white" onClick={dismissResult}>Kembali ke ruangan</button></section></div>}
        <AnimatePresence>
          {bag && loaded && !tips && !session && !result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={() => setBag(false)}
            >
              <motion.section
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: "spring", damping: 28, stiffness: 320 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="bag-title"
                onClick={(e) => e.stopPropagation()}
                className="vp-panel vp-modal relative w-full max-w-[660px] rounded-b-none p-5 sm:rounded-b-[22px] sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="bag-title"
                      className="flex items-center gap-2 text-base font-bold"
                    >
                      <span className="text-lg">🎒</span> Tas perbekalan{" "}
                      <span className="ml-1 rounded-md bg-[var(--soft)] px-2 py-1 text-[10px] font-medium vp-muted">
                        {totalItems} item
                      </span>
                    </h2>
                    <p className="mt-1.5 text-xs vp-muted">
                      Hadiah dari usaha belajarmu. Klik item untuk
                      memberikannya.
                    </p>
                  </div>
                  <button
                    className="vp-icon !h-9 !w-9 shrink-0"
                    onClick={() => setBag(false)}
                    aria-label="Tutup tas perbekalan"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="vp-tabs my-4 md:my-5">
                  {["Semua item", "Makan & minum", "Snack", "Perawatan"].map(
                    (t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`vp-tab ${tab === t ? "text-[var(--green)]" : "vp-muted"}`}
                      >
                        {t}
                        {t === tab && (
                          <motion.span
                            layoutId="bag-tab"
                            className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#879d69]"
                          />
                        )}
                      </button>
                    ),
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {ITEMS.filter(
                    (i) =>
                      tab === "Semua item" ||
                      (tab === "Makan & minum"
                        ? ["water", "rice"].includes(i.id)
                        : tab === "Snack"
                          ? ["apple", "donut", "cake"].includes(i.id)
                          : i.id === "vitamin"),
                  ).map((item) => {
                    const blocked = busy || !pet || !pet.inventory[item.id];
                    return (
                      <motion.button
                        whileHover={reduced || blocked ? {} : { y: -4 }}
                        whileTap={reduced || blocked ? {} : { scale: 0.96 }}
                        key={item.id}
                        disabled={blocked}
                        onClick={() => feed(item.id)}
                        title={`Berikan ${item.name}`}
                        className="vp-item relative rounded-2xl border border-[var(--line)] p-2.5 text-left transition-shadow sm:p-3"
                      >
                        <span className="absolute right-2 top-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-semibold">
                          ×{pet?.inventory[item.id] ?? 0}
                        </span>
                        <div
                          style={{ background: item.color }}
                          className="mb-2.5 flex h-[64px] items-center justify-center rounded-xl text-[32px] sm:mb-3 sm:h-[77px] sm:text-[39px]"
                        >
                          {item.emoji}
                        </div>
                        <p
                          className={`text-[8px] font-bold tracking-widest ${item.id === "cake" ? "text-[#b49a46]" : item.id === "donut" ? "text-[#a28ac1]" : "vp-muted"}`}
                        >
                          {item.tier}
                        </p>
                        <h3 className="mt-1 truncate text-xs font-bold sm:mt-1.5">
                          {item.name}
                        </h3>
                        <p className="mt-1 text-[10px] vp-muted">
                          {item.benefit}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-[var(--soft)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-[#82976b] dark:bg-white/10">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">
                        Stok menipis? Isi lagi lewat belajar!
                      </p>
                      <p className="mt-0.5 text-[10px] vp-muted">
                        Selesaikan kuis untuk mendapatkan makanan, minuman, dan
                        snack langka.
                      </p>
                    </div>
                  </div>
                  <button
                    className="vp-btn shrink-0 bg-[#73895d] text-xs text-white"
                    onClick={() => {
                      setBag(false);
                      setHelp(true);
                    }}
                  >
                    Ayo belajar <ArrowRight size={14} />
                  </button>
                </div>
                <p className="mt-3 flex items-center justify-center gap-2 text-center text-[10px] vp-muted">
                  <Heart size={12} className="shrink-0" /> Snack bukan pengganti
                  makan dan minum, ya. Rawat dengan seimbang!
                </p>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {modalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-[#243025]/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            >
              <motion.section
                initial={{ y: 20, scale: 0.97 }}
                animate={{ y: 0, scale: 1 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="adopt-title"
                className="vp-panel vp-modal relative w-full max-w-[660px] rounded-b-none p-5 sm:rounded-b-[22px] sm:p-6 md:p-8"
              >
                {pet && (
                  <button
                    className="vp-icon absolute right-4 top-4"
                    aria-label="Tutup pemilihan"
                    onClick={() => setAdopt(false)}
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="mb-2 text-center text-3xl">🌿</div>
                <p className="text-center text-[10px] font-bold tracking-[.2em] text-[var(--green)]">
                  AWAL CERITA KECIL KALIAN
                </p>
                <h2
                  id="adopt-title"
                  className="mt-3 text-center text-xl font-bold sm:text-2xl"
                >
                  Kenalan dengan sahabat barumu
                </h2>
                <p className="mt-2 text-center text-xs vp-muted">
                  Pilih teman yang akan menemani setiap petualangan belajarmu.
                </p>
                <div className="my-5 grid grid-cols-3 gap-2 md:gap-3">
                  {SPECIES.map((s) => (
                    <button
                      key={s.id}
                      aria-pressed={species === s.id}
                      onClick={() => setSpecies(s.id)}
                      className={`relative rounded-2xl border-2 p-1.5 md:p-3 ${species === s.id ? "border-[#8da674] bg-[var(--soft)]" : "border-[var(--line)]"}`}
                    >
                      {species === s.id && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-[#839b6a] p-1 text-white">
                          <Check size={10} />
                        </span>
                      )}
                      <div className="h-[72px] sm:h-24 md:h-32">
                        <PetIllustration species={s.id} status="happy" small />
                      </div>
                      <p className="text-[10px] font-bold leading-tight sm:text-[11px] md:text-sm">
                        {s.name}
                      </p>
                      <p className="mt-1 hidden text-[10px] vp-muted md:block">
                        {s.description}
                      </p>
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void startPet();
                  }}
                >
                  <label htmlFor="pet-name" className="text-xs font-semibold">
                    Nama panggilan sahabatmu
                  </label>
                  <input
                    id="pet-name"
                    maxLength={50}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Mochi"
                    className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--soft)] px-4 py-3 text-base outline-[#8da674] md:text-sm"
                  />
                  <p className="mt-2 text-[10px] vp-muted">
                    {pet
                      ? "Mengganti nama atau jenis mempertahankan seluruh progres dan inventory."
                      : "Satu nama kecil untuk persahabatan yang besar. Maksimal 50 karakter. Inventory awal kosong; kumpulkan melalui kuis."}
                  </p>
                  <button
                    disabled={busy || !name.trim()}
                    type="submit"
                    className="vp-btn mt-5 w-full bg-[#73895d] text-white disabled:opacity-40"
                  >
                    {pet
                      ? "Simpan sahabat ini"
                      : "Mulai persahabatan"}
                    <Heart size={16} />
                  </button>
                </form>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {help && loaded && !tips && !session && !result && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5"
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="quiz-title"
                className="vp-panel relative w-full max-w-md rounded-b-none p-6 sm:rounded-b-[22px] sm:p-7"
              >
                <button
                  className="vp-icon absolute right-4 top-4"
                  onClick={() => setHelp(false)}
                  aria-label="Tutup"
                >
                  <X size={16} />
                </button>
                <BookOpen className="mb-4 text-[var(--green)]" size={30} />
                <h2 id="quiz-title" className="text-xl font-bold">
                  Belajar untuk sahabatmu
                </h2>
                <p className="mt-3 text-sm leading-relaxed vp-muted">Soal acak lintas mata pelajaran sesuai jenjang, tanpa timer. Hadiah hanya jika minimal 80% benar (8/10 atau 12/15), dinilai server. Sesi aktif harus diselesaikan dan dilanjutkan setelah memuat ulang.</p>
                {MODES.map(mode => <button key={mode.id} disabled={busy || !pet} className="vp-btn mt-3 w-full flex-col bg-[var(--soft)] text-left" onClick={() => startQuiz(mode.id)}><span>{mode.label} · {mode.count} soal</span><span className="text-xs font-normal">{mode.reward}</span></button>)}
              </section>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className="pointer-events-none fixed inset-x-3 bottom-4 z-[70] flex justify-center sm:inset-x-4 sm:bottom-6"
          aria-live="polite"
          role="status"
        >
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                className="flex w-full max-w-lg items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5 text-xs shadow-xl sm:px-5 sm:py-4 sm:text-sm"
              >
                <span className="shrink-0 text-[#8ea66f]">
                  <Sparkles size={19} />
                </span>
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
