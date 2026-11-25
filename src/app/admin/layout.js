
"use client";

import { useEffect, useState } from "react";
import BrandLogo from "@/components/brand-logo";
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
      <main className="grid min-h-screen place-items-center bg-surface-muted">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-accent-line border-t-accent" />

          <p className="mt-4 text-sm font-medium text-ink-muted">
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
      <main className="grid min-h-screen place-items-center bg-surface-muted p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm"
        >
          <div className="mb-7 flex items-center gap-4">
            <BrandLogo className="h-16 w-16" />

            <div>
              <h1 className="text-2xl font-extrabold text-ink">
                TKA TryOn
              </h1>

              <p className="text-sm text-ink-muted">
                Academic Content Management
              </p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-ink">
            Masuk ke Area Admin
          </h2>

          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Gunakan akun TKA TryOn yang telah terdaftar. Hak akses setiap
            modul akan ditentukan berdasarkan role dan permission akun.
          </p>

          <label className="mt-6 block text-sm font-semibold text-ink-body">
            Email
          </label>

          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@email.com"
            className="mt-2 w-full rounded-lg border border-line-strong px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-line"
          />


          <label className="mt-5 block text-sm font-semibold text-ink-body">
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
    color: "var(--ink)",
    WebkitTextFillColor: "var(--ink)",
  }}
  className="mt-2 w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm font-medium text-ink placeholder:text-ink-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-line"
/>


          {authError && (
            <div className="mt-5 rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger-ink">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-bold text-on-primary transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {authLoading ? "Memeriksa akun..." : "Masuk"}
          </button>

          <p className="mt-6 text-center text-xs text-ink-muted">
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
