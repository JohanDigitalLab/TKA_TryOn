"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { normalizeStudentSubjects, normalizeStudentTopics, studentSubjectsRequest, studentTopicsRequest, studentStartConfig } from "@/lib/student/rpc-contract.mjs";

export default function StartSession({ attemptType }) {
  const router = useRouter();
  const exercise = attemptType === "EXERCISE";
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [subjectCode, setSubjectCode] = useState("");
  const [questionCount, setQuestionCount] = useState("");
  const [theme, setTheme] = useState("");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [topicsError, setTopicsError] = useState("");
  const [revision, setRevision] = useState(0);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setTopicsError("");
      try {
        const request = studentSubjectsRequest();
        const { data, error: rpcError } = await supabase.rpc(request.name, request.args);
        if (rpcError) throw rpcError;
        const rows = normalizeStudentSubjects(data);
        if (active) setSubjects(rows);
        if (exercise) {
          try {
            const request = studentTopicsRequest();
            const { data, error: rpcError } = await supabase.rpc(request.name, request.args);
            if (rpcError) throw rpcError;
            const rows = normalizeStudentTopics(data);
            if (active) setTopics(rows);
          } catch (err) {
            if (active) {
              setTopics([]);
              setTheme("");
              setTopic("");
              setTopicsError(err?.message || "Materi belum berhasil dimuat.");
            }
          }
        }
      } catch (err) {
        if (active) setError(err?.message || "Mata pelajaran belum berhasil dimuat.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [exercise, revision]);

  const selected = subjects.find((row) => row.subject_code === subjectCode);
  const catalog = topics.filter((row) => row.subject_code === subjectCode);
  const themes = [...new Set(catalog.map((row) => row.theme))];
  const topicOptions = [...new Set(catalog.filter((row) => row.theme === theme).map((row) => row.topic))];

  function start(event) {
    event.preventDefault();
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    try {
      const config = studentStartConfig({ subjects, subjectCode, attemptType,
        questionCount: questionCount === "" ? null : Number(questionCount),
        theme: theme || null, topic: topic || null, topics });
      sessionStorage.setItem("tryon-exam-config", JSON.stringify(config));
      sessionStorage.removeItem("tryon-simulation-results");
      sessionStorage.removeItem("tryon-exam-result");
      router.push("/student/challenge");
    } catch (err) {
      setError(err?.message || "Konfigurasi sesi tidak dapat disimpan.");
      startingRef.current = false;
      setStarting(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-raised px-4 py-8 text-ink-body">
      <section className="mx-auto max-w-2xl rounded-2xl bg-surface p-6 shadow-sm sm:p-8">
        <Link href="/student" className="text-sm font-bold text-accent-ink underline">← Dashboard siswa</Link>
        <h1 className="mt-5 text-2xl font-extrabold">{exercise ? "Latihan mandiri" : "Tryout TKA"}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">{exercise
          ? "Latihan tanpa batas waktu. Pilih jumlah soal serta materi, atau gunakan pilihan adaptif dari server. Jumlah soal aktual mengikuti ketersediaan soal terbit."
          : "Pilih mata pelajaran. Jumlah soal, durasi, dan jenis pemilihan mengikuti konfigurasi TKA server."}</p>
        <p className="mt-2 text-sm text-ink-muted">Jika ada sesi yang masih berjalan, server dapat memulihkannya. Akses dan ketersediaan soal diperiksa server saat memulai.</p>
        {loading && <p role="status" className="mt-6">Memuat pilihan dari server…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
        {!loading && <>
          <button type="button" disabled={starting} onClick={() => setRevision((value) => value + 1)} className="mt-4 min-h-11 text-sm font-bold text-accent-ink underline">Muat ulang pilihan server</button>
          {!subjects.length ? <p className="mt-4">Belum ada mata pelajaran yang tersedia untuk profilmu.</p> :
            <form onSubmit={start} className="mt-4 space-y-5">
              <label className="block text-sm font-bold">Mata pelajaran
                <select required disabled={starting} value={subjectCode} onChange={(event) => { setSubjectCode(event.target.value); setTheme(""); setTopic(""); }} className="mt-2 block min-h-11 w-full rounded-lg border border-line-strong px-3">
                  <option value="">Pilih mata pelajaran</option>
                  {subjects.map((row) => <option key={row.subject_code} value={row.subject_code}>{row.name}</option>)}
                </select>
              </label>
              {!exercise && selected && (selected.configuration
                ? <p className="rounded-lg bg-accent-soft p-4 text-sm">{selected.configuration.total_questions} soal · {selected.configuration.duration_minutes} menit · {selected.configuration.type === "SET" ? "Paket soal" : "Soal acak"}</p>
                : <p role="status" className="text-sm text-warning-ink">Konfigurasi TKA belum tersedia untuk mata pelajaran ini.</p>)}
              {exercise && <>
                <label className="block text-sm font-bold">Jumlah soal (1–100)
                  <input required type="number" min="1" max="100" step="1" disabled={starting} value={questionCount} onChange={(event) => setQuestionCount(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-line-strong px-3" />
                </label>
                {topicsError && <p role="status" className="rounded-lg bg-warning-soft p-3 text-sm text-warning-ink">{topicsError} Pilihan adaptif tetap tersedia. Muat ulang untuk mencoba mengambil materi lagi.</p>}
                <label className="block text-sm font-bold">Materi
                  <select disabled={!selected || starting || !themes.length} value={theme} onChange={(event) => { setTheme(event.target.value); setTopic(""); }} className="mt-2 block min-h-11 w-full rounded-lg border border-line-strong px-3">
                    <option value="">Adaptif — server memilih materi</option>
                    {themes.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold">Topik
                  <select disabled={!theme || starting} value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-line-strong px-3">
                    <option value="">Semua topik dalam materi terpilih</option>
                    {topicOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </>}
              <button disabled={starting || !selected || (!exercise && !selected.configuration)} className="min-h-11 w-full rounded-lg bg-primary px-5 py-3 font-bold text-on-primary disabled:opacity-50">{starting ? "Membuka sesi…" : exercise ? "Mulai latihan tanpa timer" : "Mulai tryout"}</button>
            </form>}
        </>}
        <Link href="/student/results" className="mt-6 inline-block min-h-11 text-sm font-bold text-accent-ink underline">Riwayat dan lanjutkan sesi</Link>
      </section>
    </main>
  );
}
