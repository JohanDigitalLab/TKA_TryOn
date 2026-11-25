
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import ThemeToggle from "@/components/theme-toggle";
import { studentRegistrationPath } from "@/lib/student/registration.mjs";
import { supabase } from "@/lib/supabase";

const levels = [
  {
    name: "SD / MI",
    value: "sd",
    grade: "KELAS 6",
    description: "Persiapan Tes Kemampuan Akademik jenjang Sekolah Dasar.",
    subjects: ["Bahasa Indonesia", "Matematika"],
  },
  {
    name: "SMP / MTs",
    value: "smp",
    grade: "KELAS 9",
    description: "Persiapan Tes Kemampuan Akademik jenjang Sekolah Menengah Pertama.",
    subjects: ["Bahasa Indonesia", "Matematika"],
  },
  {
    name: "SMA / MA / SMK",
    value: "sma",
    grade: "KELAS 12",
    description: "Persiapan Tes Kemampuan Akademik jenjang Sekolah Menengah Atas.",
    subjects: ["Mata Pelajaran Wajib", "Mata Pelajaran Pilihan"],
  },
];

const plans = [
  {
    name: "Siswa Mandiri",
    href: "/register?method=independent",
    action: "Daftar Sekarang",
    price: "Rp49.000",
    suffix: "sekali bayar sampai lulus",
    tone: "blue",
    features: [
      "Simulasi TKA berbasis CBT",
      "Latihan soal sesuai jenjang",
      "Riwayat hasil dan review jawaban",
      "Rekomendasi belajar dari hasil pengerjaan",
    ],
  },
  {
    name: "Sekolah",
    href: "/school/register",
    action: "Daftar Sekarang",
    price: "Rp25.000",
    suffix: "per siswa",
    tone: "blue",
    features: [
      "Dashboard sekolah dan pengelolaan siswa",
      "Jadwal try-out bersama",
      "Penugasan latihan dengan batas waktu",
      "Monitoring hasil belajar dan peringkat",
    ],
  },
];

function getDashboardPath(profile) {
  if (profile?.is_subscribed === false) return "/subscription";
  if (profile?.account_type === "STUDENT") {
    return profile.is_managed === true ? "/mstudent" : "/student";
  }
  if (profile?.account_type === "SCHOOL") return "/school";
  if (profile?.account_type === "ADMIN") return "/admin";
  return null;
}

export default function Home() {
  const router = useRouter();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleOpenLogin() {
    setLoginError("");

    const { data } = await supabase.auth.getUser();
    if (data.user) {
      router.push("/home");
      return;
    }

    setShowLogin(true);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("Sesi login belum berhasil dibuat.");

      router.push("/home");
    } catch (error) {
      setLoginError(error.message?.toLowerCase().includes("invalid login credentials")
        ? "Email atau password tidak sesuai."
        : error.message || "Login gagal. Silakan coba kembali.");
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-ink-body">

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-line bg-background">
        <div className="mx-auto grid max-w-7xl grid-cols-2 items-center gap-y-3 px-5 py-4 md:grid-cols-[1fr_auto_1fr] lg:px-8">

          {/* LOGO KIRI */}
          <Link href="/" className="flex items-center gap-3 justify-self-start">
            <BrandLogo className="h-14 w-16" priority />
            <div>
              <p className="text-xl font-extrabold tracking-tight text-ink">
                TKA <span className="text-accent-ink">TryOn</span>
              </p>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-ink-muted">
                SKILL ON • CONFIDENCE ON
              </p>
            </div>
          </Link>

          {/* AKUN KANAN */}
          <div className="flex items-center justify-self-end gap-2 md:col-start-3 md:row-start-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleOpenLogin}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Masuk
            </button>
          </div>

        </div>
      </header>

      {/* HERO */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div>
            <div className="mb-6 inline-flex border-l-2 border-accent bg-accent-soft px-3 py-2 text-xs font-bold text-accent-strong">
              PLATFORM SIMULASI TES KEMAMPUAN AKADEMIK
            </div>

            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
              Persiapkan TKA dengan{" "}
              <span className="text-accent-ink">lebih terarah.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-ink-secondary">
              TKA TryOn menyediakan fasilitas simulasi ujian berbasis komputer,
              latihan akademik, serta evaluasi kemampuan untuk membantu siswa
              mempersiapkan Tes Kemampuan Akademik.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-lg bg-primary px-6 py-3.5 text-sm font-bold text-on-primary shadow-md hover:bg-primary-hover">
                Daftar Sekarang
              </Link>
              <a href="#layanan" className="rounded-lg border border-line-strong px-6 py-3.5 text-sm font-bold text-ink-body hover:bg-surface-muted">
                Lihat Paket
              </a>
              <a href="#jenjang" className="rounded-lg border border-line-strong px-6 py-3.5 text-sm font-bold text-ink-body hover:bg-surface-muted">
                Lihat Jenjang
              </a>
            </div>

            <p className="mt-6 text-xs leading-5 text-ink-secondary">
              Platform persiapan dan simulasi independen. Bukan aplikasi resmi penyelenggara TKA.
            </p>
          </div>

          <div className="border border-line bg-surface p-6 md:p-8">
            <div className="flex items-center justify-between border-b border-line pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">TKA TRYON</p>
                <h3 className="mt-1 text-xl font-extrabold text-ink">Persiapan, Simulasi, dan Evaluasi</h3>
              </div>
              <span className="rounded-lg bg-accent-tint px-3 py-2 text-xs font-bold text-accent-strong">CBT</span>
            </div>

            <div className="mt-6 space-y-4">
              {[
                ["A", "Simulasi ujian", "Latihan ujian berbasis komputer dengan pengaturan waktu dan navigasi soal."],
                ["B", "Latihan soal", "Latihan soal berdasarkan jenjang, mata pelajaran, dan kompetensi."],
                ["C", "Evaluasi hasil", "Lihat hasil pengerjaan dan identifikasi kompetensi yang perlu ditingkatkan."],
              ].map(([code, title, description]) => (
                <div key={code} className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-bold text-accent-ink">{code}</div>
                  <div>
                    <h4 className="font-bold text-ink">{title}</h4>
                    <p className="mt-1 text-sm leading-5 text-ink-muted">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl bg-primary p-5 text-on-primary">
              <p className="text-xs font-semibold text-on-primary">SKILL ON • CONFIDENCE ON</p>
              <p className="mt-2 text-lg font-bold">Belajar terarah. Berlatih terukur. Lebih siap menghadapi TKA.</p>
            </div>
          </div>
        </div>
      </section>

      {/* JENJANG */}
      <section id="jenjang" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-ink">PROGRAM PERSIAPAN</p>
          <h3 className="mt-2 text-2xl font-extrabold text-ink md:text-3xl">Pilih Jenjang Pendidikan</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Program persiapan dan simulasi disesuaikan dengan jenjang pendidikan peserta.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {levels.map((level) => (
            <article key={level.name} className="rounded-xl border border-line bg-surface p-6 transition hover:border-accent hover:shadow-lg">
              <span className="inline-flex rounded-md bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent-strong">{level.grade}</span>
              <h4 className="mt-5 text-xl font-extrabold text-ink">{level.name}</h4>
              <p className="mt-3 min-h-12 text-sm leading-6 text-ink-muted">{level.description}</p>
              <div className="my-5 border-t border-line-subtle pt-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Cakupan persiapan</p>
                {level.subjects.map((subject) => (
                  <div key={subject} className="mb-2 flex items-center gap-2 text-sm text-ink-secondary">
                    <span className="text-accent-ink">•</span>{subject}
                  </div>
                ))}
              </div>
              <Link href={studentRegistrationPath({ level: level.value })} className="block rounded-lg border border-accent-line py-3 text-center text-sm font-bold text-accent-ink hover:bg-accent-soft">
                Daftar untuk {level.name}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* LAYANAN */}
      <section id="layanan" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-accent-ink">FASILITAS PLATFORM</p>
            <h3 className="mt-2 text-2xl font-extrabold text-ink">Daftar Satu Sekolah, Lebih Murah dan Lebih Banyak Fitur</h3>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {plans.map((plan) => (
              <article key={plan.name} className={`border p-6 sm:p-8 ${plan.tone === "blue" ? "rounded-xl border-line-strong bg-surface" : "rounded-xl border-line-strong bg-inverse text-on-inverse"}`}>
                <p className={`text-sm font-bold ${plan.tone === "blue" ? "text-accent-ink" : "text-inverse-accent"}`}>{plan.name}</p>
                <div className="mt-4 flex flex-wrap items-baseline gap-2">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className={`text-sm ${plan.tone === "blue" ? "text-ink-muted" : "text-inverse-muted"}`}>{plan.suffix}</span>
                </div>
                <ul className={`mt-7 space-y-3 text-sm ${plan.tone === "blue" ? "text-ink-secondary" : "text-inverse-muted"}`}>
                  {plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className="font-bold text-inverse-accent" aria-hidden="true">✓</span><span>{feature}</span></li>)}
                </ul>
                <Link href={plan.href} className={`mt-8 block rounded-lg px-5 py-3 text-center text-sm font-bold ${plan.tone === "blue" ? "bg-primary text-on-primary hover:bg-primary-hover" : "bg-surface text-ink hover:bg-accent-soft"}`}>{plan.action}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TENTANG */}
      <section id="tentang" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="border-l-4 border-accent bg-inverse px-6 py-10 text-on-inverse md:px-10">
          <h3 className="text-2xl font-extrabold">TKA TryOn</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-inverse-muted">
            Platform independen untuk membantu siswa mengenal karakteristik Tes Kemampuan Akademik,
            berlatih mengerjakan soal, dan mengevaluasi kesiapan akademiknya.
          </p>
          <p className="mt-5 text-xs text-ink-muted">SKILL ON • CONFIDENCE ON</p>
        </div>
      </section>

      {showLogin && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-inverse-deep/60 px-5 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-overlay-title"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLogin(false); }}
        >
          <section className="relative w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-2xl">
            <button type="button" onClick={() => setShowLogin(false)} aria-label="Tutup login" className="absolute right-5 top-5 text-2xl leading-none text-ink-muted hover:text-ink-body">×</button>
            <div className="flex items-center gap-3">
              <BrandLogo className="h-14 w-14" />
              <div>
                <p className="text-xl font-black tracking-tight text-accent-ink">TKA <span className="text-ink">TryOn</span></p>
                <p className="text-[10px] font-bold tracking-widest text-ink-muted">SKILL ON • CONFIDENCE ON</p>
              </div>
            </div>
            <h2 id="login-overlay-title" className="mt-7 text-2xl font-extrabold text-ink">Selamat Datang!</h2>
            <p className="mt-2 text-sm text-ink-muted">Masuk untuk melanjutkan perjalanan belajar.</p>
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-ink-body">Email
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" autoComplete="email" required className="mt-2 w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent-line" />
              </label>
              <label className="block text-sm font-semibold text-ink-body">Password
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent-line" />
              </label>
              {loginError && <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-ink">{loginError}</div>}
              <button type="submit" disabled={loginLoading} className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-60">{loginLoading ? "Memproses…" : "Masuk"}</button>
              <div className="text-center text-sm text-ink-muted">Belum punya akun? <Link href="/register" onClick={() => setShowLogin(false)} className="font-bold text-accent-ink hover:underline">Daftar sekarang</Link></div>
            </form>
          </section>
        </div>
      )}

    </main>
  );
}
