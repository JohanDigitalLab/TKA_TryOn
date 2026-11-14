"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LearningAccess({ mode, showPlanLink = true }) {
  const [state, setState] = useState({ loading: true });
  const router = useRouter();
  function continuePackage(pkg) {
    try {
      sessionStorage.setItem("tryon-exam-config", JSON.stringify({
        simulationId: pkg.id,
        level: pkg.grade === 9 ? "smp" : "sd",
        grade: pkg.grade,
        subjects: pkg.subjects,
        activityType: pkg.mode === "mission" ? "latihan" : "simulasi",
        questionCount: pkg.question_count,
        duration: pkg.duration_minutes,
        currentSubjectIndex: pkg.current_subject_index,
        sessionResults: [],
        status: "in_progress",
      }));
      router.push("/student/challenge");
    } catch {
      setState(previous => ({ ...previous, storageError: true }));
    }
  }
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const { data: auth } = await supabase.auth.getSession();
        if (!auth?.session) { if (alive) setState({ guest: true }); return; }
        const { data, error } = await supabase.rpc("learning_access_context");
        if (alive) setState(error || !data ? { error: true } : { data, userId: auth.session.user.id });
      } catch {
        if (alive) setState({ error: true });
      }
    }
    void load();
    return () => { alive = false; };
  }, []);
  if (state.loading) return <p role="status" className="text-sm text-slate-600">Memeriksa akses belajar…</p>;
  if (state.guest) return <p className="text-sm text-slate-600">Masuk untuk melihat kuota percobaan dan status langgananmu.</p>;
  if (state.error) return <p role="status" className="text-sm text-amber-800">Status akses belum dapat dimuat. Pemeriksaan akses tetap dilakukan saat memulai kegiatan.</p>;
  const { data } = state;
  const available = mode ? data.trials?.[mode] : null;
  return <section aria-label="Akses belajar" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
    <p className="font-bold">{data.subscribed ? "Langganan aktif" : "Akses percobaan"}</p>
    {!data.subscribed && (mode ? <p>{available ? "Kamu masih memiliki satu kali percobaan untuk kegiatan ini." : "Kesempatan mencoba kegiatan ini sudah digunakan. Aktifkan langganan untuk memulai paket baru."}</p> : <><p>Simulasi TKA: {data.trials?.simulation ? "1 kali percobaan tersedia" : "percobaan sudah digunakan"}.</p><p>Latihan soal: {data.trials?.mission ? "1 kali percobaan tersedia" : "percobaan sudah digunakan"}.</p></>)}
    <p>Satu percobaan berlaku untuk satu paket mapel yang dipilih, bukan setiap mapel. Paket berlaku 24 jam; waktu setiap sesi tetap mengikuti durasi pengerjaan.</p>
    {!data.subscribed && showPlanLink && <Link href="/subscription" className="font-bold underline">Lihat paket dan aktivasi langganan →</Link>}
    {!showPlanLink && <p className="mt-2 break-all">ID akun untuk aktivasi: <span className="select-all font-mono">{state.userId}</span></p>}
    <p className="mt-1">Sesi yang sudah dimulai dan riwayat hasil tetap dapat diakses.</p>
    {state.storageError && <p role="alert">Penyimpanan browser tidak tersedia. Izinkan penyimpanan untuk melanjutkan paket.</p>}
    {data.packages?.filter(pkg => !mode || pkg.mode === mode).map(pkg => <div key={pkg.id} className="mt-3 border-t border-blue-200 pt-3">
      <p className="font-semibold">{pkg.mode === "mission" ? "Latihan soal" : "Simulasi TKA"} · {pkg.subjects.join(", ")}</p>
      <p className="text-xs">Batas mulai mapel berikutnya: {new Date(pkg.expires_at).toLocaleString("id-ID")}</p>
      <button onClick={() => continuePackage(pkg)} className="mt-2 min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-bold text-white">Lanjutkan paket yang sudah dimulai →</button>
    </div>)}
  </section>;
}
