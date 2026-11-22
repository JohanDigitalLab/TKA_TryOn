
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";

export default function AdminLayout({ children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Guard area admin: hanya account_type = ADMIN yang boleh masuk.
  const [adminAccess, setAdminAccess] = useState("checking"); // checking | allowed | denied
  const [checkedUserId, setCheckedUserId] = useState(null);
  const userId = session?.user?.id || null;

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

  useEffect(() => {
    if (!userId) return undefined;

    let active = true;

    async function checkAdminAccess() {
      try {
        // await lebih dulu agar tidak ada setState sinkron di body effect.
        await Promise.resolve();
        const { data, error } = await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", userId)
          .maybeSingle();
        if (!active) return;
        const accountType = String(error ? "" : data?.account_type || "").toUpperCase();
        if (accountType === "ADMIN") {
          setCheckedUserId(userId);
          setAdminAccess("allowed");
        } else {
          setCheckedUserId(userId);
          setAdminAccess("denied");
          router.replace("/home");
        }
      } catch {
        if (!active) return;
        setCheckedUserId(userId);
        setAdminAccess("denied");
        router.replace("/home");
      }
    }

    void checkAdminAccess();
    return () => {
      active = false;
    };
  }, [userId, router]);

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
            Memeriksa sesi TKA TryOut...
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
            <BrandLogo className="h-16 w-16" />

            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                TKA TryOut
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
            Gunakan akun TKA TryOut yang telah terdaftar. Hak akses setiap
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
            TKA TryOut · SKILL ON • CONFIDENCE ON
          </p>
        </form>
      </main>
    );
  }

  // ====================================================
  // SELURUH HALAMAN ADMIN
  // ====================================================

  // Belum ada hasil pemeriksaan untuk user ini: jangan render konten admin.
  if (adminAccess === "checking" || checkedUserId !== userId) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p role="status" className="font-semibold text-slate-600">
          Memeriksa akses admin…
        </p>
      </main>
    );
  }

  if (adminAccess === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5 text-center">
        <p className="font-semibold text-slate-600">
          Mengalihkan ke beranda…
        </p>
      </main>
    );
  }

  return children;
}
