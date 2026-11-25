"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import { supabase } from "@/lib/supabase";
import { authLink, localPath } from "@/lib/school/onboarding.mjs";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // No requested destination: let /home apply the existing role routing policy.
  const next = localPath(params.get("next"), "/home");
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (active && !error && data?.user) router.replace(next);
    }).catch(() => { /* A failed session check must still allow password login. */ });
    return () => { active = false; };
  }, [next, router]);

  async function login(event) {
    event.preventDefault();
    if (lock.current) return;
    const values = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(values.get("email") || "").trim(),
        password: String(values.get("password") || ""),
      });
      if (error || !data?.session || !data?.user) throw new Error("LOGIN_FAILED");
      router.replace(next);
    } catch {
      setError("Login belum berhasil. Periksa email dan password, verifikasi email, lalu coba kembali.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-muted px-5 py-10">
      <div className="mx-auto max-w-md space-y-6 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <Link href="/" className="inline-flex items-center gap-3 font-bold text-accent-strong"><BrandLogo className="h-14 w-14" />Beranda TKA TryOn</Link>
        <h1 className="text-3xl font-black">Masuk</h1>
        <p className="text-sm text-ink-secondary">Gunakan akun siswa, guru, staf sekolah, atau admin yang sudah terdaftar.</p>
        {error && <p role="alert" className="rounded border border-danger-line bg-danger-soft p-4 text-danger-ink">{error}</p>}
        <form onSubmit={login} aria-busy={busy}>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm font-semibold">Email<input name="email" type="email" autoComplete="username" required className="mt-1 block min-h-11 w-full rounded border border-line-strong px-3 py-2" /></label>
            <label className="block text-sm font-semibold">Password<input name="password" type="password" autoComplete="current-password" required className="mt-1 block min-h-11 w-full rounded border border-line-strong px-3 py-2" /></label>
            <button type="submit" className="min-h-11 w-full rounded bg-primary px-4 py-3 font-bold text-on-primary disabled:opacity-60">{busy ? "Memproses…" : "Masuk"}</button>
          </fieldset>
        </form>
        <p className="text-sm">Belum punya akun? <Link href={authLink("register", next)} className="font-bold text-accent-ink underline">Daftar siswa</Link> · <Link href={authLink("school/register", next)} className="font-bold text-accent-ink underline">Daftar staf / sekolah</Link></p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<p role="status" className="p-8">Memuat login…</p>}><LoginForm /></Suspense>;
}
