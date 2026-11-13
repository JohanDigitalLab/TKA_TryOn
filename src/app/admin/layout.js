
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminLayout({ children }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // ====================================================
  // MEMERIKSA SESI AUTENTIKASI
  // ====================================================

  useEffect(() => {
    let alive = true;

    async function initializeAuth() {
      const { data, error } = await supabase.auth.getSession();

      if (!alive) return;

      if (error) {
        setAuthError(error.message);
      }

      setSession(data?.session || null);
      setAuthReady(true);
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!alive) return;

      setSession(newSession);
      setAuthError("");
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // ====================================================
  // LOGIN TERPUSAT
  // ====================================================

  async function handleLogin(event) {
    event.preventDefault();

    setAuthLoading(true);
    setAuthError("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      setSession(data.session);
      setPassword("");
    } catch (error) {
      setAuthError(error.message || "Login gagal. Silakan coba kembali.");
    } finally {
      setAuthLoading(false);
    }
  }

  // ====================================================
  // LOADING
  // ====================================================

  if (!authReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-100 border-t-blue-700" />

          <p className="mt-4 text-sm font-medium text-slate-500">
            Memeriksa sesi TKA TryOn...
          </p>
        </div>
      </main>
    );
  }

  // ====================================================
  // FORM LOGIN TERPUSAT
  // ====================================================

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          <div className="mb-7 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-blue-700 text-2xl font-black text-white">
              T
            </div>

            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                TKA TryOn
              </h1>

              <p className="text-sm text-slate-500">
                Academic Content Management
              </p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Masuk ke Area Admin
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Gunakan akun TKA TryOn yang telah terdaftar. Hak akses setiap
            modul akan ditentukan berdasarkan role dan permission akun.
          </p>

          <label className="mt-6 block text-sm font-semibold text-slate-700">
            Email
          </label>

          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@email.com"
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />


          <label className="mt-5 block text-sm font-semibold text-slate-700">
            Password
          </label>

<input
  type="password"
  required
  autoComplete="current-password"
  value={password}
  onChange={(event) => setPassword(event.target.value)}
  placeholder="Masukkan password"
  style={{
    color: "#0f172a",
    WebkitTextFillColor: "#0f172a",
  }}
  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
/>


          {authError && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {authLoading ? "Memeriksa akun..." : "Masuk"}
          </button>

          <p className="mt-6 text-center text-xs text-slate-400">
            TKA TryOn · SKILL ON • CONFIDENCE ON
          </p>
        </form>
      </main>
    );
  }

  // ====================================================
  // SELURUH HALAMAN ADMIN
  // ====================================================

  return children;
}
