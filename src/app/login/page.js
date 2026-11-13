
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(event) {
    event.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("Email dan password wajib diisi.");
      return;
    }

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

      router.push("/student");
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
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">

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

        <form onSubmit={handleLogin} aria-busy={loading} className="mt-8 space-y-5">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sedang masuk..." : "Masuk ke TKA TryOn →"}
          </button>
        </form>

        <div className="my-7 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">PENGGUNA BARU?</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <p className="text-center text-sm text-slate-500">
          Belum punya akun?{" "}
          <Link
            href="/register"
            className="font-bold text-blue-600 hover:text-blue-700"
          >
            Daftar sekarang
          </Link>
        </p>

        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 TKA TryOn
        </p>
      </div>
    </main>
  );
}
