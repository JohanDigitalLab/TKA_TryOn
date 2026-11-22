"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function ActionTable({ title, kind, dateLabel, onHasData }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data, error: requestError } = await supabase.rpc("get_mstudent_actions", { p_kind: kind, p_page: page });
        if (requestError) throw requestError;
        if (!data || !Array.isArray(data.rows) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error("Respons server tidak valid.");
        if (!mounted) return;
        const lastPage = Math.max(1, Math.ceil(data.total / 5));
        if (page > lastPage) { setPage(lastPage); return; }
        setResult(data);
      } catch (err) {
        if (mounted) setError(err.message || "Data belum berhasil dimuat.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [kind, page, retry]);

  useEffect(() => {
    if (!loading) onHasData?.(result.total > 0 || Boolean(error));
  }, [error, loading, onHasData, result.total]);

  const totalPages = Math.max(1, Math.ceil(result.total / 5));
  const tableId = `action-${kind.toLowerCase()}`;

  // Jangan merender panel/tabel selama data belum diketahui agar tidak terjadi
  // flash konten kosong sebelum respons RPC selesai.
  if (loading) return null;

  // Panel tidak perlu mengambil ruang jika endpoint berhasil tetapi tidak ada data.
  if (!error && result.total === 0) return null;

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby={`${tableId}-title`}>
      <h2 id={`${tableId}-title`} className="px-5 py-5 text-xl font-extrabold text-slate-950">{title}</h2>
      {error && <div role="alert" className="px-5 pb-4 text-sm text-amber-800">{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="font-bold underline">Coba lagi</button></div>}
      <div className="overflow-x-auto">
        <table id={tableId} aria-busy={loading} className="min-w-full text-left text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th scope="col" className="px-5 py-4">#</th><th scope="col" className="px-5 py-4">Mata Pelajaran</th><th scope="col" className="px-5 py-4">{dateLabel}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {error ? <tr><td colSpan="3" className="px-5 py-8 text-center text-slate-500">Data tidak dapat ditampilkan.</td></tr> : result.rows.length ? result.rows.map((row, index) => (
              <tr key={row.id}><td className="px-5 py-4">{(page - 1) * 5 + index + 1}</td><td className="px-5 py-4">{row.subject_name || "-"}</td><td className="whitespace-nowrap px-5 py-4">{row.event_at ? new Date(row.event_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"}</td></tr>
            )) : <tr><td colSpan="3" className="px-5 py-8 text-center text-slate-500">{kind === "ASSIGNMENT" ? "Belum ada tugas dari sekolah." : "Belum ada try out bersama yang dijadwalkan."}</td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label={`Paginasi ${title}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <p aria-live="polite" className="text-xs text-slate-500">Halaman {page} dari {totalPages} · {result.total} data</p>
        <div className="flex gap-2">
          <button type="button" aria-controls={tableId} disabled={loading || page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Sebelumnya</button>
          <button type="button" aria-controls={tableId} disabled={loading || !!error || page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya</button>
        </div>
      </nav>
    </article>
  );
}

export default function StudentActionTables({ onVisibilityChange }) {
  const [loaded, setLoaded] = useState({ assignment: false, tryout: false });
  const [hasVisibleData, setHasVisibleData] = useState(false);

  const updateVisibility = (key, visible) => {
    setLoaded((previous) => ({ ...previous, [key]: true }));
    if (visible) setHasVisibleData(true);
  };

  useEffect(() => {
    if (loaded.assignment && loaded.tryout) {
      onVisibilityChange?.(hasVisibleData);
    }
  }, [hasVisibleData, loaded, onVisibilityChange]);

  if (loaded.assignment && loaded.tryout && !hasVisibleData) return null;

  return <div className="grid gap-5 lg:grid-cols-2"><ActionTable title="Tugas Sekolah" kind="ASSIGNMENT" dateLabel="Batas Waktu" onHasData={(visible) => updateVisibility("assignment", visible)} /><ActionTable title="Try Out Bersama" kind="SCHEDULED_TRYOUT" dateLabel="Tanggal" onHasData={(visible) => updateVisibility("tryout", visible)} /></div>;
}
