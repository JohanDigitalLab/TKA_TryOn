
"use client";

import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { authLink, localPath } from "@/lib/school/onboarding.mjs";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isResetMode = searchParams.get("reset") === "1";

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const authLock = useRef(false);
  const authBusy = loading || resetLoading || updateLoading;

  useEffect(() => {
    if (!isResetMode) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session) setErrorMessage("Tautan reset password tidak valid atau sudah kedaluwarsa.");
    });
  }, [isResetMode]);

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    setErrorMessage("");
    if (newPassword.length < 8) {
      setErrorMessage("Password baru minimal harus 8 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi password belum sama.");
      return;
    }
    if (authLock.current) return;
    authLock.current = true;
    setUpdateLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (error) {
      setErrorMessage(error.message || "Password belum berhasil diperbarui.");
    } finally {
      authLock.current = false;
      setUpdateLoading(false);
    }
  }

  async function handlePasswordReset() {
    setErrorMessage("");
    setSuccessMessage("");

    if (!email.trim()) {
      setErrorMessage("Masukkan email terlebih dahulu untuk menerima tautan reset password.");
      return;
    }

    if (authLock.current) return;
    authLock.current = true;
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login?reset=1`,
      });
      if (error) throw error;
      setSuccessMessage("Tautan reset password telah dikirim. Periksa inbox dan folder spam Anda.");
    } catch (error) {
      setErrorMessage(error.message || "Tautan reset password belum dapat dikirim.");
    } finally {
      authLock.current = false;
      setResetLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("Email dan password wajib diisi.");
      return;
    }

    if (authLock.current) return;
    authLock.current = true;
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      if (!data.session) {
        throw new Error("Sesi login belum berhasil dibuat.");
      }

      const { data: profile } = await supabase.from("profiles").select("education_level").eq("id",data.user.id).maybeSingle();
      router.push(localPath(searchParams.get("next"), profile?.education_level ? "/student" : "/school"));
      router.refresh();
    } catch (error) {
      console.error("Login error:", error);

      if (
        error.message?.toLowerCase().includes("email not confirmed")
      ) {
        setErrorMessage(
          "Email belum dikonfirmasi. Silakan periksa email Anda."
        );
      } else if (
        error.message?.toLowerCase().includes("invalid login credentials")
      ) {
        setErrorMessage("Email atau password tidak sesuai.");
      } else {
        setErrorMessage(
          error.message || "Login gagal. Silakan coba kembali."
        );
      }
    } finally {
      authLock.current = false;
      setLoading(false);
    }
  }

  if (isResetMode) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-8">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <Link href="/login" className="text-sm font-semibold text-slate-600 hover:text-blue-700">← Kembali ke login</Link>
          <h1 className="mt-8 text-2xl font-extrabold text-slate-900">Buat password baru</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Gunakan minimal 8 karakter untuk mengamankan akun Anda.</p>
          <form onSubmit={handlePasswordUpdate} className="mt-6 space-y-4" aria-busy={authBusy}>
            <fieldset disabled={authBusy} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Password baru
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Ulangi password baru
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            {errorMessage && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
            <button type="submit" disabled={updateLoading} className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{updateLoading ? "Menyimpan…" : "Simpan password baru"}</button>
            </fieldset>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-12">
        <section className="overflow-hidden rounded-3xl border border-blue-100 bg-blue-50 shadow-sm">
          <Image
            src="/auth-illustration.svg"
            alt="Pelajar mempersiapkan TKA dengan simulasi dan melihat kemajuan belajar"
            width={900}
            height={720}
            priority
            className="h-auto max-h-64 w-full object-cover object-center sm:max-h-80 lg:max-h-none"
          />
          <div className="px-8 pb-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
              SKILL ON • CONFIDENCE ON
            </p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">
              Siap melanjutkan persiapan TKA?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Masuk untuk melanjutkan latihan, simulasi, dan evaluasi belajar Anda.
            </p>
          </div>
        </section>

        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">
        <Link href="/" className="mb-6 inline-flex min-h-11 items-center text-sm font-semibold text-slate-600 hover:text-blue-700">
          ← Kembali ke beranda
        </Link>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-blue-700">
            TKA <span className="text-slate-900">TryOn</span>
          </h1>
          <p className="mt-2 text-xs font-bold tracking-widest text-slate-400">
            SKILL ON • CONFIDENCE ON
          </p>
        </div>

        <h2 className="text-2xl font-extrabold text-slate-800">
          Selamat Datang!
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Masuk untuk melanjutkan perjalanan belajar dan persiapan TKA.
        </p>

        <form onSubmit={handleLogin} aria-busy={authBusy} className="mt-8 space-y-5">
          <fieldset disabled={authBusy} className="space-y-5">
          <div>
            <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              autoComplete="email"
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <button
            type="button"
            aria-controls="login-password"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((previous) => !previous)}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            {showPassword ? "Sembunyikan password" : "Tampilkan password"}
          </button>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
            >
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sedang masuk..." : "Masuk ke TKA TryOn →"}
          </button>

          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={loading || resetLoading}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetLoading ? "Mengirim tautan…" : "Lupa password? Kirim tautan reset"}
          </button>
          </fieldset>
        </form>

        <div className="my-7 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">PENGGUNA BARU?</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <p className="text-center text-sm text-slate-500">
          Belum punya akun?{" "}
          <Link
            href={authLink("register", localPath(searchParams.get("next")))}
            className="font-bold text-blue-600 hover:text-blue-700"
          >
            Daftar sekarang
          </Link>
        </p>

        <p className="mt-4 text-center text-sm"><Link href="/school/register" className="font-bold text-blue-700 underline">Akun staf / pendaftaran sekolah</Link> · <Link href="/school/join" className="font-bold text-blue-700 underline">Undangan siswa</Link></p>
        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 TKA TryOn
        </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50"><p className="font-semibold text-slate-600">Memuat halaman login…</p></main>}>
      <LoginContent />
    </Suspense>
  );
}
