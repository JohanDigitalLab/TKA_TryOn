"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function ActionTable({ title, kind, dateLabel }) {
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

  const totalPages = Math.max(1, Math.ceil(result.total / 5));
  const tableId = `action-${kind.toLowerCase()}`;
  return (
    <article className="min-w-0 rounded-2xl border border-line bg-surface shadow-sm" aria-labelledby={`${tableId}-title`}>
      <h2 id={`${tableId}-title`} className="px-5 py-5 text-xl font-extrabold text-ink">{title}</h2>
      {error && <div role="alert" className="px-5 pb-4 text-sm text-warning-ink">{error} <button type="button" onClick={() => setRetry((value) => value + 1)} className="font-bold underline">Coba lagi</button></div>}
      <div className="overflow-x-auto">
        <table id={tableId} aria-busy={loading} className="min-w-full text-left text-sm">
          <thead className="border-y border-line bg-surface-muted text-xs uppercase tracking-wide text-ink-muted">
            <tr><th scope="col" className="px-5 py-4">#</th><th scope="col" className="px-5 py-4">Mata Pelajaran</th><th scope="col" className="px-5 py-4">{dateLabel}</th></tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {loading ? <tr><td colSpan="3" className="px-5 py-8 text-center text-ink-muted">Memuat data…</td></tr> : error ? <tr><td colSpan="3" className="px-5 py-8 text-center text-ink-muted">Data tidak dapat ditampilkan.</td></tr> : result.rows.length ? result.rows.map((row, index) => (
              <tr key={row.id}><td className="px-5 py-4">{(page - 1) * 5 + index + 1}</td><td className="px-5 py-4">{row.subject_name || "-"}</td><td className="whitespace-nowrap px-5 py-4">{row.event_at ? new Date(row.event_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"}</td></tr>
            )) : <tr><td colSpan="3" className="px-5 py-8 text-center text-ink-muted">{kind === "ASSIGNMENT" ? "Belum ada tugas dari sekolah." : "Belum ada try out bersama yang dijadwalkan."}</td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label={`Paginasi ${title}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
        <p aria-live="polite" className="text-xs text-ink-muted">Halaman {page} dari {totalPages} · {result.total} data</p>
        <div className="flex gap-2">
          <button type="button" aria-controls={tableId} disabled={loading || page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40">Sebelumnya</button>
          <button type="button" aria-controls={tableId} disabled={loading || !!error || page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-line px-3 py-2 text-xs font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40">Berikutnya</button>
        </div>
      </nav>
    </article>
  );
}

export default function StudentActionTables() {
  return <div className="grid gap-5 lg:grid-cols-2"><ActionTable title="Tugas Sekolah" kind="ASSIGNMENT" dateLabel="Deadline" /><ActionTable title="Try Out Bersama" kind="SCHEDULED_TRYOUT" dateLabel="Tanggal" /></div>;
}
