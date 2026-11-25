"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import RegisterModal from "@/components/register-modal";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/components/theme-provider";

const vibes = [
  {
    emoji: "⚡",
    title: "Gas latihan",
    text: "Ribuan bank soal yang bikin belajar terasa seperti naik level.",
  },
  {
    emoji: "🎯",
    title: "Tahu targetmu",
    text: "Pantau progres, temukan kelemahan, lalu taklukkan satu-satu.",
  },
  {
    emoji: "🏆",
    title: "Simulasi TKA",
    text: "Bangun confidence sebelum hari TKA dengan mengikuti simulasi TKA seperti nyata.",
  },
];

const paths = [
  {
    tag: "KELAS 6",
    title: "SD / MI",
    text: "Mulai kenal pola soal TKA dengan cara yang fun.",
    color: "from-cyan-400 to-blue-500",
    level: "sd",
  },
  {
    tag: "KELAS 9",
    title: "SMP / MTs",
    text: "Upgrade skill akademikmu sebelum next chapter.",
    color: "from-violet-400 to-fuchsia-500",
    level: "smp",
  },
  {
    tag: "KELAS 12",
    title: "SMA / MA / SMK",
    text: "Bikin persiapanmu lebih terarah dan anti panik.",
    color: "from-orange-300 to-pink-500",
    level: "sma",
  },
];

// Section "Pilih jenjangmu" sedang disembunyikan dari halaman utama.
const SHOW_JENJANG = false;

export default function HomeNewPage() {
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);
  const [registerLevel, setRegisterLevel] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingGame, setPendingGame] = useState(null);

  async function openLogin() {
    const { data } = await supabase.auth.getUser();
    if (data.user) router.push("/home");
    else {
      setPendingGame(null);
      setShowLogin(true);
    }
  }

  async function openGame(route) {
    const { data } = await supabase.auth.getUser();
    if (data.user) router.push(route);
    else {
      setPendingGame(route);
      setShowLogin(true);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginError || !data.session)
      setError(loginError?.message || "Login belum berhasil. Coba lagi ya.");
    else router.push(pendingGame || "/home");
    setLoading(false);
  }

  return (
    <main
      suppressHydrationWarning
      className={`${theme === "light" ? "theme-light" : ""} min-h-screen overflow-hidden bg-[#10102a] text-white selection:bg-fuchsia-400 selection:text-[#10102a]`}
    >
      <style>{`
        .theme-muted { color: rgb(255 255 255 / 0.6); }
        .theme-strong { color: white; }
        .theme-subtle { color: rgb(255 255 255 / 0.5); }
        .theme-action { color: white; border-color: rgb(255 255 255 / 0.2); }
        .theme-badge { color: white !important; }
        [data-tka-theme="light"] .theme-light { background: #f7f8ff !important; color: #171735 !important; }
        [data-tka-theme="light"] .theme-light .theme-muted { color: rgb(23 23 53 / 0.78); }
        [data-tka-theme="light"] .theme-light .theme-strong { color: rgb(23 23 53 / 0.9); }
        [data-tka-theme="light"] .theme-light .theme-subtle { color: rgb(23 23 53 / 0.62); }
        [data-tka-theme="light"] .theme-light .theme-action { color: rgb(23 23 53 / 0.85); border-color: rgb(23 23 53 / 0.2); }
        [data-tka-theme="light"] .theme-light .border-white\\/10,
        [data-tka-theme="light"] .theme-light .border-white\\/20 { border-color: rgb(23 23 53 / .14) !important; }
        [data-tka-theme="light"] .theme-light .bg-white\\/\\[\\.06\\] { background: rgb(23 23 53 / .06) !important; }
      `}</style>
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        aria-hidden="true"
      >
        <div className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-cyan-400 blur-[120px]" />
        <div className="absolute right-0 top-96 h-96 w-96 rounded-full bg-fuchsia-500 blur-[140px]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-2 lg:px-8 lg:py-4">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo className="h-20 w-25" priority />
          <div>
            <p className="text-lg font-black tracking-tight">
              TKA <span className="text-cyan-300">TryOut</span>
            </p>
            <p className="theme-subtle text-[9px] font-bold tracking-[0.2em]">
              SKILL ON • CONFIDENCE ON
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="theme-muted hidden text-sm sm:inline">
            Sudah punya akun?
          </span>
          <button
            type="button"
            onClick={openLogin}
            className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-bold transition hover:border-cyan-300 hover:bg-white/10 sm:px-5"
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Aktifkan mode ${theme === "dark" ? "terang" : "gelap"}`}
            className="rounded-full border border-white/20 px-3 py-2.5 text-sm transition hover:border-cyan-300 hover:bg-white/10"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:pb-28 lg:pt-20">
        <div>
          <div className="mb-7 inline-flex rotate-[-2deg] items-center gap-2 rounded-full bg-[#d9ff5b] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#10102a] shadow-[4px_4px_0_#f5a8ff]">
            ✦ Belajar nggak harus boring
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[.95] tracking-[-.06em] sm:text-7xl lg:text-8xl">
            Ready to <span className="text-cyan-300">level up</span> your TKA?
          </h1>
          <p className="theme-muted mt-7 max-w-xl text-base leading-7 sm:text-lg">
            Platform latihan dan simulasi TKA yang bikin kamu lebih siap, lebih
            pede, dan tetap jadi versi terbaik dirimu.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setRegisterLevel("")}
              className="rounded-full bg-[#d9ff5b] px-7 py-4 text-sm font-black text-[#10102a] shadow-[5px_5px_0_#f5a8ff] transition hover:-translate-y-1 hover:shadow-[7px_7px_0_#f5a8ff]"
            >
              Mulai sekarang →
            </button>
          </div>
          <div className="theme-muted mt-10 flex items-center gap-4 text-xs">
            <span className="flex -space-x-2">
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#10102a] bg-orange-300">
                😎
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#10102a] bg-cyan-300">
                🤓
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#10102a] bg-fuchsia-300">
                🧠
              </span>
            </span>
            <span>
              <b className="theme-strong">Belajar bareng</b>
              <br />
              siswa yang mau berkembang
            </span>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md rotate-2 rounded-[2rem] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-xl lg:rotate-3">
          <div className="rounded-[1.5rem] bg-[#f7f5ff] p-6 text-[#10102a]">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#10102a] px-3 py-1 text-[10px] font-black text-white">
                TKA TRYOUT
              </span>
              <span className="text-xl">✦</span>
            </div>
            <p className="mt-12 text-sm font-bold text-fuchsia-500">
              TODAY&apos;S MISSION
            </p>
            <h2 className="mt-2 text-4xl font-black leading-none">
              Bikin progres,
              <br />
              bukan stres.
            </h2>
            <div className="mt-8 rounded-2xl bg-[#d9ff5b] p-4">
              <div className="flex justify-between text-xs font-black">
                <span>PROGRESS BELAJAR</span>
                <span>72%</span>
              </div>
              <div className="mt-3 h-3 rounded-full bg-black/10">
                <div className="h-3 w-[72%] rounded-full bg-[#10102a]" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-cyan-200 p-4">
                <p className="text-2xl">⚡</p>
                <p className="mt-3 text-xs font-black">12 latihan</p>
              </div>
              <div className="rounded-2xl bg-fuchsia-200 p-4">
                <p className="text-2xl">🎯</p>
                <p className="mt-3 text-xs font-black">Target on</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="cara-belajar"
        className={`relative z-10 border-y px-5 py-16 lg:px-8 ${theme === "light" ? "border-slate-200 bg-slate-50 text-slate-900" : "border-white/10 bg-[#151832] text-white"}`}
      >
        <div className="mx-auto max-w-7xl">
          <p
            className={`text-xs font-black tracking-[.25em] ${theme === "light" ? "text-slate-500" : "text-white/55"}`}
          >
            WHY TRYOUT?
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight sm:text-5xl">
            Small steps.{" "}
            <span
              className={theme === "light" ? "text-slate-700" : "text-cyan-200"}
            >
              Big glow-up.
            </span>
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {vibes.map((item) => (
              <article
                key={item.title}
                className={`rounded-3xl border p-6 shadow-sm transition hover:-translate-y-1 ${theme === "light" ? "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md" : "border-white/10 bg-white/[.07] hover:bg-white/10"}`}
              >
                <span className="text-4xl">{item.emoji}</span>
                <h3
                  className={`mt-8 text-xl font-black ${theme === "light" ? "text-slate-900" : "text-white"}`}
                >
                  {item.title}
                </h3>
                <p
                  className={`mt-2 text-sm leading-6 ${theme === "light" ? "text-slate-600" : "text-white/65"}`}
                >
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="games" aria-labelledby="play-learn-title" className="relative z-10 mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className={`text-xs font-black tracking-[.25em] ${theme === "light" ? "text-violet-700" : "text-lime-300"}`}>LESS SCROLLING, MORE LEVELING UP</p>
            <h2 id="play-learn-title" className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
              Bermain sambil belajar?<br />
              <span className={theme === "light" ? "text-violet-600" : "text-lime-300"}>Kenapa nggak.</span>
            </h2>
          </div>
          <span className="-rotate-6 rounded-full border-2 border-current px-4 py-2 text-sm font-black">✦ Belajar, tapi seru.</span>
        </div>
        <div className="mt-12 grid gap-8 px-1 md:grid-cols-3 md:gap-6 md:py-5">
          {[
            { title: "Boss Fight", tag: "MAIN CHARACTER ENERGY", emoji: "🐲", accent: "⚔️", label: "Kalahkan boss. Menangkan progres.", text: "Ubah soal jadi jurus andalan. Jawab tantangan, hadapi boss, dan buktikan skill-mu!", color: "bg-[#ffc4e6]", shape: "rounded-[3rem_1.5rem_4rem_1.5rem] md:-rotate-2", scene: "bg-[#bda6ff]", badge: "BOSS LEVEL", meter: "w-2/3", route: "/student/fightboss" },
            { title: "Sahabat Virtual", tag: "YOUR NEW STUDY BESTIE", emoji: "🐣", accent: "💖", label: "Rawat bestie. Upgrade diri.", text: "Teman kecil, motivasi besar. Belajar bareng binatang kesayangan dan temani dia tumbuh!", color: "bg-[#d9ff83]", shape: "rounded-[4rem_4rem_1.5rem_3rem] md:translate-y-6 md:rotate-2", scene: "bg-[#a9e7b7]", badge: "BESTIE MODE", meter: "w-4/5", route: "/student/virtualpet" },
            { title: "Petualangan Peta", tag: "GO EXPLORE, GO GROW", emoji: "🏝️", accent: "🧭", label: "Buka peta. Temukan potensimu.", text: "Jelajahi pulau, tuntaskan misi. Tiap langkah adalah bukti pemahaman materi kamu!", color: "bg-[#a6eaff]", shape: "rounded-[1.5rem_4rem_2rem_4rem] md:-rotate-1", scene: "bg-[#76ccdf]", badge: "KOTAK MISTERI", meter: "w-1/2", route: "/student/mapadventure" },
          ].map((game) => (
            <button key={game.title} type="button" onClick={() => openGame(game.route)} aria-label={`Main ${game.title}`} className={`group relative flex flex-col border-2 border-[#17152e] p-6 text-left text-[#17152e] shadow-[6px_7px_0_#17152e] transition-transform duration-200 hover:-translate-y-2 focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-violet-500 motion-reduce:transform-none ${game.color} ${game.shape}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black tracking-wider">{game.tag}</span>
                <span aria-hidden="true" className="text-2xl">✦</span>
              </div>
              <div aria-hidden="true" className={`relative mt-5 flex h-44 items-center justify-center overflow-hidden rounded-[2rem_3rem_2rem_4rem] border-2 border-[#17152e]/15 ${game.scene}`}>
                <div className="absolute h-32 w-32 rounded-full border-2 border-dashed border-white/70" />
                <span className="relative text-8xl drop-shadow-lg transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transform-none">{game.emoji}</span>
                <span className="absolute right-4 top-4 rotate-12 text-3xl">{game.accent}</span>
                <span className="absolute bottom-3 left-3 -rotate-6 rounded-lg border-2 border-[#17152e] bg-white px-2 py-1 text-[9px] font-black shadow-[2px_2px_0_#17152e]">{game.badge}</span>
                <span className="absolute bottom-4 right-4 text-xl">✧</span>
              </div>
              <h3 className="mt-6 text-3xl font-black tracking-tight">{game.title}</h3>
              <p className="mt-2 text-sm font-extrabold">{game.label}</p>
              <p className="mt-3 flex-1 text-sm leading-6 text-[#17152e]/80">{game.text}</p>
              <div aria-hidden="true" className="mt-6 h-2 overflow-hidden rounded-full bg-black/10"><div className={`h-full rounded-full bg-[#17152e] ${game.meter}`} /></div>
              <span className="mt-4 flex items-center justify-between text-sm font-black">Let’s play & learn <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17152e] text-xl text-white">↗</span></span>
            </button>
          ))}
        </div>
      </section>

      {SHOW_JENJANG && (
      <section
        id="jenjang"
        className="relative z-10 mx-auto max-w-7xl px-5 py-16 lg:px-8"
      >
        <p className="text-xs font-black tracking-[.25em] text-orange-300">
          PICK YOUR VIBE
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
          Pilih jenjangmu.
        </h2>
        <div className="mt-9 grid gap-5 md:grid-cols-3">
          {paths.map((path) => (
            <button
              key={path.title}
              type="button"
              onClick={() => setRegisterLevel(path.level)}
              className={`group rounded-3xl bg-gradient-to-br ${path.color} p-6 text-left text-[#10102a] transition hover:-translate-y-2 hover:rotate-1`}
            >
              <div className="flex items-start justify-between">
                <span className="rounded-full bg-black/10 px-3 py-1 text-[10px] font-black">
                  {path.tag}
                </span>
                <span className="text-2xl transition group-hover:translate-x-1">
                  ↗
                </span>
              </div>
              <h3 className="mt-14 text-3xl font-black">{path.title}</h3>
              <p className="mt-2 text-sm font-medium text-black/65">
                {path.text}
              </p>
            </button>
          ))}
        </div>
      </section>
      )}

      {showLogin && (
        <div
          className={`fixed inset-0 z-50 grid place-items-center px-5 backdrop-blur-md ${theme === "light" ? "bg-slate-900/25" : "bg-[#080817]/80"}`}
          onMouseDown={(event) =>
            event.target === event.currentTarget && (setShowLogin(false), setPendingGame(null))
          }
        >
          <form
            onSubmit={handleLogin}
            className={`w-full max-w-md rounded-[2rem] border p-8 shadow-2xl ${theme === "light" ? "border-slate-200 bg-white text-slate-900" : "border-white/20 bg-[#191940] text-white"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">Welcome back ✦</h2>
              <button
                type="button"
                onClick={() => {
                  setShowLogin(false);
                  setPendingGame(null);
                }}
                className={`text-2xl ${theme === "light" ? "text-slate-400" : "text-white/50"}`}
              >
                ×
              </button>
            </div>
            <p
              className={`mt-2 text-sm ${theme === "light" ? "text-slate-600" : "text-white/55"}`}
            >
              Lanjutkan progress belajarmu.
            </p>
            <label className="mt-7 block text-sm font-bold">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-cyan-300 ${theme === "light" ? "border-slate-300 bg-slate-50 text-slate-900" : "border-white/15 bg-white/10 text-white"}`}
              />
            </label>
            <label className="mt-4 block text-sm font-bold">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-cyan-300 ${theme === "light" ? "border-slate-300 bg-slate-50 text-slate-900" : "border-white/15 bg-white/10 text-white"}`}
              />
            </label>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-400/15 p-3 text-sm text-red-200"
              >
                {error}
              </p>
            )}
            <button
              disabled={loading}
              className="mt-6 w-full rounded-xl bg-[#d9ff5b] py-3.5 font-black text-[#10102a] disabled:opacity-60"
            >
              {loading ? "Loading..." : "Masuk ke akun →"}
            </button>
            <p
              className={`mt-5 text-center text-sm ${theme === "light" ? "text-slate-600" : "text-white/50"}`}
            >
              Belum punya akun?{" "}
              <button
                type="button"
                onClick={() => {
                  // Tutup pop-up login lalu buka pop-up registrasi.
                  setShowLogin(false);
                  setRegisterLevel("");
                }}
                className="font-bold text-cyan-500"
              >
                Daftar sekarang
              </button>
            </p>
          </form>
        </div>
      )}
      {registerLevel !== null && (
        <RegisterModal
          level={registerLevel || null}
          onClose={() => setRegisterLevel(null)}
        />
      )}
    </main>
  );
}
