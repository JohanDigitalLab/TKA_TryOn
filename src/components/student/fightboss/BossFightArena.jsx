"use client";
import "./fightboss.css";
import { supabase } from "@/lib/supabase";
import { createBossfightClient, answerPayload } from "@/lib/student/bossfight-client";
import { BossFightChoices, BossFightReview } from "./BossFightQuestions";
import DashboardBreadcrumb from "@/components/dashboard-breadcrumb";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Crown,
  Moon,
  Pencil,
  Flame,
  Heart,
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

const TURN_SECONDS = 30;
const MAX_HP = 100;
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
function Fighter({ boss = false, attack, pose = "idle", name = "Raja Aljabar" }) {
  const active = boss
    ? attack === "smash"
    : attack === "punch" || attack === "kick";
  return (
    <svg
      viewBox="0 0 160 180"
      role="img"
      aria-label={`${name}: ${pose === "ko" ? "terkapar di lantai" : pose === "winner" ? "menang dengan kedua tangan terangkat" : "siap bertarung"}`}
      data-pose={pose}
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
          pose === "winner" ? { rotate: 45, x: -12, y: 10 } : active
            ? { rotate: boss ? [-30, -100, 20, 0] : [0, -55, 0], x: 0, y: 0 }
            : { rotate: 0, x: 0, y: 0 }
        }
        transition={{ duration: 0.6 }}
        style={{ transformBox: "view-box", transformOrigin: "52px 88px" }}
      >
        <path
          d={pose === "winner" ? "M52 88 L0 88" : "M52 88 L30 112"}
          stroke={boss ? "#fb7185" : "#6ee7b7"}
          strokeWidth="18"
          strokeLinecap="round"
        />
        <circle
          cx={pose === "winner" ? 0 : 28}
          cy={pose === "winner" ? 88 : 115}
          r="13"
          fill={boss ? "#9f1239" : "#047857"}
          stroke={boss ? "#fda4af" : "#a7f3d0"}
          strokeWidth="3"
        />
      </motion.g>
      <motion.g
        animate={
          pose === "winner" ? { rotate: -45, x: 12, y: 10 } : active
            ? { rotate: boss ? [30, 100, -20, 0] : [0, -100, 0], x: 0, y: 0 }
            : { rotate: 0, x: 0, y: 0 }
        }
        transition={{ duration: 0.6 }}
        style={{ transformBox: "view-box", transformOrigin: "108px 88px" }}
      >
        <path
          d={pose === "winner" ? "M108 88 L160 88" : "M108 88 L130 112"}
          stroke={boss ? "#fb7185" : "#6ee7b7"}
          strokeWidth="18"
          strokeLinecap="round"
        />
        <circle
          cx={pose === "winner" ? 160 : 132}
          cy={pose === "winner" ? 88 : 115}
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
  const [subject, setSubject] = useState("Matematika");
  const [draftSubject, setDraftSubject] = useState("Matematika");
  const [matchMode, setMatchMode] = useState("system");
  const [draftMatchMode, setDraftMatchMode] = useState("system");
  const [names, setNames] = useState(["Player 1", "Player2"]);
  const [editing, setEditing] = useState(null);
  const [draftName, setDraftName] = useState("");
  const [activePlayer, setActivePlayer] = useState(0);
  const [combos, setCombos] = useState([0, 0]);
  const [inventories, setInventories] = useState([
    { ...EMPTY_POWERS },
    { ...EMPTY_POWERS },
  ]);

  const [battleMode, setBattleMode] = useState("death");
  const [maxQuestions, setMaxQuestions] = useState(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftMode, setDraftMode] = useState("death");
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
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [tip, setTip] = useState(null);
  const [hideTips, setHideTips] = useState(false);
  const [selection, setSelection] = useState([]);
  const [categories, setCategories] = useState({});
  const [serverResult, setServerResult] = useState(null);
  const [resultClosed, setResultClosed] = useState(false);
  const retryRef = useRef(null);
  const healRef = useRef(false);
  const request = useCallback(async (payload) => createBossfightClient(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.access_token;
  })(payload), []);
  const profileNameRef = useRef("Player 1");
  function applySettings(settings, playerName) {
    if (playerName?.trim()) profileNameRef.current = playerName.trim();
    setSubject(settings.SUBJECT || "Matematika");
    setMatchMode(settings.IS_PVP === "1" ? "pvp" : "system");
    setBattleMode(!settings.FIGHT_MODE || settings.FIGHT_MODE === "Fight to Death" ? "death" : "limited");
    setMaxQuestions(Number(settings.MAX_QUESTIONS || 5));
    setNames([settings.IS_PVP === "1" ? settings.P1_NAME?.trim() || profileNameRef.current : profileNameRef.current, settings.P2_NAME || "Player2"]);
  }
  async function run(operation) {
    retryRef.current = operation;
    setBusy(true); setError("");
    try { await operation(); retryRef.current = null; }
    catch (failure) { setError(failure.message || "Koneksi terputus. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function acceptSession(next) {
    setSession(next); applySettings(next.settings, next.player_name);
    setPlayerHP(next.hp[0]); setBossHP(next.hp[1]); setCombos(next.combo);
    setMaxCombo(previous => Math.max(previous, ...next.combo));
    setActivePlayer((next.questions[0]?.player || 1) - 1);
    setQuestionIndex(next.used);
    setInventories(previous => previous.map((inventory, index) => ({...inventory, heal: next.healed[index]})));
    if (next.terminal) {
      const finished = next.result ? next : await request({action: "finish", attempt_id: next.attempt_id, records: []});
      setSession(finished); setServerResult(finished.result); setResultClosed(false);
      setResultKind(finished.hp.includes(0) ? "ko" : "points");
      setGameStatus(finished.result.winner === 0 ? "draw" : finished.result.victory ? "victory" : "defeat");
      setQuestionOpen(false);
    }
  }
  useEffect(() => {
    let alive = true;
    const operation = async () => {
      const data = await request();
      if (!alive) return;
      applySettings(data.settings, data.player_name);
      setTip(data.settings.SHOW_TIPS === "1" ? data.tip : null);
    };
    retryRef.current = operation;
    operation().then(() => { if (alive) retryRef.current = null; })
      .catch(failure => { if (alive) setError(failure.message); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [request]);
  // The server returns the entire remaining batch in authoritative order.
  // Consume only its head; each answer response supplies the remaining queue/refill.
  const pool = (session?.questions || []).map(q => ({
    ...q, optionDetails: q.options, subject, question: q.text, passage: q.stimulus?.content_text,
    options: (q.options || []).map(option => option.option_text),
  }));
  const bossName =
    subject === "Matematika"
      ? "Raja Aljabar"
      : subject === "Bahasa Indonesia"
        ? "Pujangga Sastra"
        : "Ilmuwan Roket";
  const pvp = matchMode === "pvp";
  const totalQuestionLimit = maxQuestions * (pvp ? 2 : 1);
  const currentPlayer = pvp ? activePlayer : 0;
  const winner = serverResult?.winner;
  const playerPose = serverResult && winner !== 0 ? (winner === 1 ? "winner" : resultKind === "ko" ? "ko" : "idle") : "idle";
  const bossPose = serverResult && winner !== 0 ? (winner === 2 ? "winner" : resultKind === "ko" ? "ko" : "idle") : "idle";
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
  const question = pool[0] || {options: [], category_items: []};
  const correctCount = serverResult?.correct ?? session?.correct ?? 0;
  const accuracy = session?.used ? Math.round(correctCount / session.used * 100) : 0;
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
  // Captures the displayed question and exact payload for offline retries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const answer = async (choice) => {
    if (busy || error || lockRef.current || !session || session.terminal || !session.questions.length || !questionOpen) return;
    lockRef.current = true; setLocked(true); setSelected(choice);
    const raw = session.questions[0];
    const payload = { action: "batch", attempt_id: session.attempt_id, records: [{
      question_id: raw.id, answer_payload: choice === null ? {} : answerPayload(raw, choice),
      is_timeout: choice === null, heal: healRef.current,
    }] };
    const beforeCorrect = session.correct;
    let accepted = null;
    let feedbackApplied = false;
    const operation = async () => {
      // Once acknowledged, retry only finalization, never the answer or its effects.
      const next = accepted ?? await request(payload);
      accepted = next;
      if (!feedbackApplied) {
      feedbackApplied = true;
      const correct = next.correct > beforeCorrect;
      const target = correct ? 1 - currentPlayer : currentPlayer;
      const damage = Math.max(0, session.hp[target] - next.hp[target]);
      setQuestionOpen(false);
      setPlayerHP(next.hp[0]); setBossHP(next.hp[1]);
      const isCritical = correct && next.combo[currentPlayer] >= 3;
      setNotice(pvp ? `${activeName}: ${correct ? (isCritical ? "CRITICAL! Jawaban benar" : "Jawaban benar") : choice === null ? "Waktu habis" : "Jawaban salah"} · ${names[target]} −${damage} HP` : correct ? (isCritical ? `CRITICAL! Flying kick · ${damage} damage!` : `Tepat! Pukulan masuk · ${damage} damage!`) : choice === null ? "Waktu habis! Boss melakukan double smash." : "Belum tepat! Boss membalas dengan double smash.");
      setImpact({id: ++impactId.current, target, damage, attack: target === 0 ? "smash" : next.combo[currentPlayer] >= 3 ? "kick" : "punch"});
      playSound(correct ? (isCritical ? "critical" : "attack") : "hurt");
      const record = {questionIndex, selected: choice, correct, player: currentPlayer, question};
      setRecords(previous => {
        const updated = previous.some(r => r.question.id === question.id) ? previous : [...previous, record];
        try { sessionStorage.setItem('bossfight-review-' + session.attempt_id, JSON.stringify(updated)); } catch {}
        return updated;
      });
      healRef.current = false;
      // Biarkan arena terlihat sampai animasi serangan dan angka damage selesai.
      await new Promise(resolve => { pendingRef.current = setTimeout(resolve, 2200); });
      pendingRef.current = null;
      }
      await acceptSession(next);
      setSelection([]); setCategories({}); setEliminated([]);
      setTimer(TURN_SECONDS); setTimerMax(TURN_SECONDS);
      setSelected(null); setLocked(false); lockRef.current = false;
      setNotice("Giliranmu! Pilih jawaban untuk menyerang.");
      setQuestionOpen(!next.terminal);
    };
    await run(operation);
  };
  useEffect(() => {
    if (
      gameStatus !== "playing" ||
      locked || busy || error || tip ||
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
  }, [answer, gameStatus, locked, timer, settingsOpen, questionOpen, editing, busy, error, tip]);
  function activatePower(power) {
    if (
      lockRef.current ||
      gameStatus !== "playing" ||
      settingsOpen ||
      editing !== null ||
      !questionOpen ||
      powers[power] || busy || error || power === "fifty"
    )
      return;
    if (power === "heal" && activeHP === MAX_HP) return;
    setInventories((previous) =>
      previous.map((inventory, index) =>
        index === currentPlayer ? { ...inventory, [power]: true } : inventory,
      ),
    );
    if (power === "heal") {
      healRef.current = true;
      setNotice("Heal disiapkan untuk jawaban berikutnya. HP dikonfirmasi server.");
    } else {
      setTimer((previous) => previous + 15);
      setTimerMax((previous) => previous + 15);
      setNotice("Freeze Time! Tambahan 15 detik untuk soal ini.");
    }
    playSound("power");
  }
  function resetToReady() {
    if (busy || lockRef.current) return;
    setQuestionOpen(false); setResting(false); setSettingsOpen(false); setEditing(null);
    setSession(null); setServerResult(null); setResultClosed(false); setReview(false); setResultKind(null);
    setGameStatus("playing"); setPlayerHP(MAX_HP); setBossHP(MAX_HP);
    setActivePlayer(0); setCombos([0, 0]); setMaxCombo(0); setQuestionIndex(0); setRecords([]);
    setImpact(null); setHealing(null); setSelected(null); setLocked(false);
    setSelection([]); setCategories({}); setEliminated([]);
    setInventories([{...EMPTY_POWERS}, {...EMPTY_POWERS}]);
    setTimer(TURN_SECONDS); setTimerMax(TURN_SECONDS);
    lockRef.current = false; healRef.current = false; retryRef.current = null;
    setError(""); setNotice("Pilih jawaban yang tepat untuk menyerang!");
  }
  async function restart() {
    if (busy || error) return;
    await run(async () => {
      const next = await request({action: "start"});
      let cached = [];
      try { cached = JSON.parse(sessionStorage.getItem('bossfight-review-' + next.attempt_id) || '[]'); } catch {}
      setRecords(cached); setReview(false); setServerResult(null); setGameStatus("playing");
      setInventories([{...EMPTY_POWERS}, {...EMPTY_POWERS}]);
      setLocked(false); lockRef.current = false; healRef.current = false;
      setTimer(TURN_SECONDS); setTimerMax(TURN_SECONDS); setSelection([]); setCategories({});
      await acceptSession(next);
      setQuestionOpen(!next.terminal);
    });
  }
  async function saveSettings(patch) {
    if (busy || error) return;
    await run(async () => {
      const data = await request({action: "settings", settings: patch});
      if (!session || serverResult) applySettings(data.settings, data.player_name);
      setSettingsOpen(false); setEditing(null);
      setNotice("Pengaturan disimpan untuk sesi berikutnya; sesi aktif tidak direset.");
    });
  }
  const powerButtons = [
    { id: "fifty", icon: Sparkles, label: "50:50", detail: "Tidak tersedia tanpa kunci jawaban" },
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
          {busy && <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-[110] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600 motion-reduce:animate-none" />Memuat BossFight…</div>}
          {error && <div role="alert" className="my-4 rounded-xl border border-rose-400 p-4">{error}<button className="ml-3 underline" disabled={busy} onClick={() => retryRef.current && run(retryRef.current)}>Coba lagi</button></div>}
          {tip && <Popup title="Tips BossFight" onClose={() => { if (!busy) { if (hideTips) void run(async () => { await request({action: "settings", settings: {SHOW_TIPS: "0"}}); setTip(null); }); else setTip(null); } }}><div className="p-5"><p>{tip.message}</p><label className="mt-4 block"><input type="checkbox" checked={hideTips} onChange={e => setHideTips(e.target.checked)} /> Jangan tampilkan lagi</label></div></Popup>}
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
                  {pvp ? "PLAYER VS PLAYER" : subject === "Acak" ? "BOSS LEVEL 10" : subject}
                </span>

              </span>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  disabled={busy || !!error || (locked && gameStatus === "playing")}
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
                  playerPose === "ko" ? { rotate: -90, y: 28, x: 0 } : serverResult ? { rotate: 0, y: 0, x: 0 } : reduceMotion
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
                <Fighter attack={serverResult ? null : impact?.attack} pose={playerPose} name={names[0]} />
              </motion.div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-10">
                <span className="text-2xl font-black italic text-slate-200 dark:text-slate-800">
                  VS
                </span>
              </div>
              {serverResult && resultClosed && <div className="absolute inset-0 z-30 flex items-center justify-center"><button type="button" onClick={resetToReady} className="rounded-2xl bg-emerald-600 px-6 py-4 font-black text-white shadow-xl">Main Lagi</button></div>}
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
                          if (busy || error || tip) return;
                          if (session && !session.terminal) setQuestionOpen(true); else void restart();
                        }}
                        className="pointer-events-auto min-h-14 max-w-xs rounded-2xl border border-emerald-300 bg-emerald-600 px-5 py-4 text-center text-base font-black text-white shadow-xl shadow-emerald-950/20 transition hover:bg-emerald-500 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-500"
                      >
                        {resting
                          ? "Selesai Istirahat? GO lagi!"
                          : "Siap Bertarung? GO!"}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.div
                key={`boss-${impact?.id ?? 0}`}
                className="relative z-10"
                animate={
                  bossPose === "ko" ? { rotate: 90, y: 28, x: 0 } : serverResult ? { rotate: 0, y: 0, x: 0 } : reduceMotion
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
                  attack={serverResult ? null : impact?.attack}
                  pose={bossPose}
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
                onClose={() => { if (!busy) setSettingsOpen(false); }}
              >
                <section className="p-5">
                  <p className="mb-4 text-xs text-slate-500">
                    Timer dijeda. Pengaturan disimpan untuk sesi berikutnya. Sesi aktif tidak direset.
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
                        busy || !!error || draftMode === "limited" &&
                        (!Number.isInteger(Number(draftLimit)) ||
                          Number(draftLimit) < 1 ||
                          Number(draftLimit) > 100)
                      }
                      onClick={() => saveSettings({SUBJECT: draftSubject, IS_PVP: draftMatchMode === "pvp" ? "1" : "0", FIGHT_MODE: draftMode === "death" ? "Fight to Death" : "Maksimal jumlah soal", MAX_QUESTIONS: draftLimit})}
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                    >
                      Simpan untuk sesi berikutnya
                    </button>
                    <button
                      type="button"
                      disabled={busy}
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
            {questionOpen && session && !busy && !error && !tip && !settingsOpen && gameStatus === "playing" && (
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
                          / {battleMode === "death" ? "∞" : totalQuestionLimit}
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
                      {question.instruction && <p className="mt-2 text-sm">{question.instruction}</p>}
                      {question.stimulus?.file_url && <a href={question.stimulus.file_url} target="_blank" rel="noopener noreferrer" className="underline">Buka media stimulus</a>}
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
                          settingsOpen || busy || !!error || id === "fifty" ||
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
                  <div className="space-y-4 border-t border-slate-200 p-5 dark:border-slate-800 sm:p-7">
                    <BossFightChoices question={question} selection={selection} categories={categories} selected={selected} disabled={locked || busy || !!error || settingsOpen || gameStatus !== "playing"} onSelect={index => question.type === "PGK_MA" ? setSelection(previous => previous.includes(index) ? previous.filter(i => i !== index) : [...previous, index]) : setSelected(index)} onCategory={(number, value) => setCategories(previous => ({ ...previous, [number]: value }))} />
                    <button className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40" disabled={locked || busy || !!error || (question.type === "PG_TUNGGAL" ? selected === null : question.type === "PGK_MA" ? !selection.length : question.category_items.some(item => !categories[item.item_number]))} onClick={() => answer(question.type === "PG_TUNGGAL" ? selected : question.type === "PGK_MA" ? selection : categories)}>Kirim Jawaban</button>
                  </div>
                </section>
              </Popup>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {editing !== null && (
              <Popup title="Ganti nama pemain" onClose={() => { if (!busy) setEditing(null); }}>
                <form
                  className="p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = draftName.trim();
                    if (!name || busy || error) return;
                    void saveSettings(editing === 1 ? {P2_NAME: name} : {P1_NAME: name});
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
                    disabled={busy || !!error || !draftName.trim()}
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
              : pvp ? `Batas ${totalQuestionLimit} soal (${maxQuestions} per pemain). HP habis = KO.` : `Batas ${totalQuestionLimit} soal: mayoritas benar = Menang Angka. HP habis = KO.`}{" "}
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
          {serverResult && !resultClosed && gameStatus !== "playing" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md ${review ? "p-0 sm:p-4" : "p-4"}`}
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
                        "button:not(:disabled), a[href]",
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
                className={`w-full overflow-y-auto border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${review ? "h-dvh max-w-3xl rounded-none px-4 py-6 sm:h-auto sm:max-h-[90dvh] sm:rounded-3xl sm:py-8" : "max-h-[90dvh] max-w-lg rounded-3xl p-6 sm:p-8"}`}
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
                    <div className="space-y-4">
                      {records.length < (session?.used || 0) && <p>Riwayat parsial: hanya jawaban yang tersimpan di browser ini tersedia setelah memuat ulang.</p>}
                      <BossFightReview records={records} names={names} pvp={pvp} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setReview(false)}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"
                    >
                      <X size={16} /> Kembali ke Hasil
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
                          {correctCount}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                          Benar
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
                      {correctCount} benar dari {session?.used || 0} soal dijawab ·{" "}
                      {battleMode === "death"
                        ? "Fight to Death · tanpa batas soal"
                        : `batas ${totalQuestionLimit} soal`}
                    </p>
                    <div className="my-5 flex justify-center gap-5 text-sm font-bold">
                      <span className="flex items-center gap-1.5 text-violet-500">
                        <Crown size={17} /> +
                        {serverResult?.xp || 0} XP
                      </span>
                    </div>
                    <button
                      autoFocus
                      type="button"
                      onClick={() => { setResultClosed(true); setReview(false); setImpact(null); }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white transition hover:bg-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                    >
                      <X size={16} /> Tutup
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
