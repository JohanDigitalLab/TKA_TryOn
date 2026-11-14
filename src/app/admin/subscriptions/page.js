"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SubscriptionsPage() {
  const [rows, setRows] = useState([]);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState("user");
  const [target, setTarget] = useState("");
  const [active, setActive] = useState(true);
  const [expiry, setExpiry] = useState("");
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState(0);
  const [checkedAt, setCheckedAt] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc("learning_subscription_workspace");
      if (rpcError) throw rpcError;
      setRows(data || []);
      setCheckedAt(Date.now());
      setAuthorized(true);
    } catch {
      setAuthorized(false);
      setError("Data langganan tidak dapat dibuka. Halaman ini hanya untuk superadmin aktif dengan akun terverifikasi.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) return load(); });
    return () => { alive = false; };
  }, [load]);

  function edit(row) {
    setKind(row.school_id ? "school" : "user");
    setTarget(row.school_id || row.user_id);
    setActive(row.active);
    setExpiry(row.expires_at ? new Date(new Date(row.expires_at).getTime() - new Date(row.expires_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
    setRevision(row.revision);
    setReason("");
    setNotice("");
  }
  function changeTarget(value, nextKind = kind) {
    setTarget(value);
    setKind(nextKind);
    setRevision(0);
    setNotice("");
  }
  async function save(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    const id = target.trim().toLowerCase();
    if (!uuidPattern.test(id)) { setError("Masukkan ID akun atau sekolah yang valid."); return; }
    const existing = rows.find(row => (kind === "school" ? row.school_id : row.user_id) === id);
    if (existing && revision !== existing.revision) { edit(existing); setError("Target sudah memiliki langganan. Data terbaru dimuat; periksa kembali sebelum menyimpan."); return; }
    if (active && expiry && new Date(expiry).getTime() <= Date.now()) { setError("Masa aktif harus berakhir setelah waktu sekarang."); return; }
    if (!window.confirm(`${active ? "Aktifkan" : "Nonaktifkan"} langganan ${kind === "school" ? "sekolah" : "akun"} ${id}?${active && !expiry ? " Akses tidak memiliki batas tanggal otomatis." : ""}`)) return;
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("learning_subscription_set", {
        p_user_id: kind === "user" ? id : null,
        p_school_id: kind === "school" ? id : null,
        p_active: active,
        p_expires_at: expiry ? new Date(expiry).toISOString() : null,
        p_expected_revision: revision,
        p_reason: reason.trim(),
      });
      if (rpcError) throw rpcError;
      setRows(previous => [data, ...previous.filter(row => row.id !== data.id)].slice(0, 500));
      setCheckedAt(Date.now());
      setRevision(data.revision);
      setReason("");
      setNotice("Perubahan langganan tersimpan dan tercatat di audit.");
    } catch (err) {
      setError(err.code === "40001" ? "Data berubah. Muat ulang daftar lalu pilih kembali target sebelum menyimpan." : "Langganan gagal disimpan. Periksa ID target, masa aktif, alasan perubahan, dan hak akses.");
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-800">
    <div className="mx-auto max-w-5xl">
      <Link href="/admin" className="text-sm font-bold text-blue-700">← Dashboard admin</Link>
      <h1 className="mt-5 text-3xl font-extrabold">Langganan belajar</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Aktivasi manual akun siswa atau sekolah. Langganan sekolah berlaku untuk siswa dengan keanggotaan aktif di sekolah aktif. Setiap perubahan memerlukan alasan dan dicatat di server.</p>
      {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="my-4 rounded-lg bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
      <button type="button" disabled={loading || busy} onClick={() => { setLoading(true); setError(""); void load(); }} className="my-5 min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold disabled:opacity-50">{loading ? "Memuat…" : "Muat ulang daftar"}</button>
      {authorized && <>
        <form onSubmit={save} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">Atur akses langganan</h2>
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Jenis target<select value={kind} onChange={e => changeTarget("", e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3"><option value="user">Akun siswa</option><option value="school">Sekolah</option></select></label>
            <label className="text-sm font-semibold">ID target<input required value={target} onChange={e => changeTarget(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 font-mono" placeholder="UUID akun atau sekolah" /></label>
            <label className="text-sm font-semibold">Status<select value={String(active)} onChange={e => setActive(e.target.value === "true")} className="mt-2 block w-full rounded-lg border border-slate-300 p-3"><option value="true">Aktif</option><option value="false">Nonaktif</option></select></label>
            <label className="text-sm font-semibold">Berakhir pada (waktu lokal)<input type="datetime-local" value={expiry} onChange={e => setExpiry(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /><span className="mt-1 block text-xs font-normal text-slate-500">Kosongkan hanya jika tidak ada batas tanggal otomatis.</span></label>
            <label className="text-sm font-semibold sm:col-span-2">Alasan perubahan<textarea required minLength={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3" /></label>
          </fieldset>
          <p className="text-xs text-slate-500">Revisi yang diperiksa: {revision}. Cocokkan ID dengan akun atau sekolah yang benar sebelum mengonfirmasi.</p>
          <button disabled={busy || loading} className="min-h-11 rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan perubahan"}</button>
        </form>
        <section className="mt-8" aria-label="Daftar langganan">
          <h2 className="text-xl font-bold">Langganan terbaru</h2>
          <p className="mt-2 text-sm text-slate-500">Maksimal 500 catatan terbaru. Pilih catatan untuk mengubahnya.</p>
          {!rows.length && <p className="mt-4 text-sm text-slate-600">Belum ada langganan yang dicatat.</p>}
          <ul className="mt-4 space-y-3">{rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="min-w-0 text-sm"><p className="font-bold">{row.school_id ? "Sekolah" : "Akun siswa"} · {row.active && (!row.expires_at || new Date(row.expires_at).getTime() > checkedAt) ? "Aktif saat diperiksa" : "Tidak aktif"}</p><p className="mt-1 break-all font-mono text-xs">{row.school_id || row.user_id}</p><p className="mt-1 text-slate-500">Berakhir: {row.expires_at ? new Date(row.expires_at).toLocaleString("id-ID") : "Tanpa batas tanggal otomatis"} · Revisi {row.revision}</p></div>
            <button disabled={busy} onClick={() => edit(row)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-bold">Pilih</button>
          </li>)}</ul>
        </section>
      </>}
    </div>
  </main>;
}
