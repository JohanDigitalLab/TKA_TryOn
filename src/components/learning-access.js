"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LearningAccess() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getSession();
        if (alive) setState(auth?.session ? { authenticated: true, loading: false } : { guest: true, loading: false });
      } catch {
        if (alive) setState({ authenticated: true, loading: false });
      }
    }
    void load();
    return () => { alive = false; };
  }, []);
  if (state.loading) return <p role="status" className="text-sm text-slate-600">Memeriksa sesi…</p>;
  if (state.guest) return <p className="text-sm text-slate-600">Masuk untuk memulai kegiatan belajar.</p>;
  return <section aria-label="Akses belajar" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
    <p className="font-bold">Akses belajar tersedia</p>
    <p>Kamu dapat memulai simulasi TKA dan latihan soal tanpa batas percobaan. Setiap sesi tetap mengikuti durasi pengerjaan dan paket mapel yang dipilih.</p>
    <p className="mt-1">Sesi yang sudah dimulai dan riwayat hasil tetap dapat diakses.</p>
  </section>;
}
