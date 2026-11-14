"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authLink, schoolError, statusLabels } from "@/lib/school/onboarding.mjs";

export const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 min-h-11";
export const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
export function Status({ value }) { return <span className="inline-block rounded bg-slate-100 px-2 py-1 text-sm font-semibold">{statusLabels[value] || value}</span>; }
export function DateText({ value }) { return <time dateTime={value}>{value ? new Date(value).toLocaleString("id-ID") : "—"}</time>; }
export function Panel({ title, children }) { return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-extrabold">{title}</h2>{children}</section>; }
export function Empty({ children = "Belum ada data." }) { return <p className="text-sm text-slate-600">{children}</p>; }
export function Field({ name, label, options, multiline, ...props }) {
  return <label className="block text-sm font-semibold">{label}{options ? <select name={name} className={inputClass} {...props}><option value="">Pilih…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : multiline ? <textarea name={name} className={inputClass} rows={4} {...props} /> : <input name={name} className={inputClass} {...props} />}</label>;
}
export function ActionForm({ portal, label, children, onSubmit, confirm, reset = true }) {
  const [localError, setLocalError] = useState("");
  return <form className="space-y-3" aria-label={label} aria-busy={portal.busy} onSubmit={async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setLocalError("");
    try { if (await onSubmit(values) && reset) form.reset(); } catch (error) { setLocalError(schoolError(error)); }
  }}><fieldset disabled={portal.busy} className="space-y-3">{children}{confirm && <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-1 size-5 shrink-0" />Saya memahami dan mengonfirmasi: {confirm}</label>}<button className={buttonClass} type="submit">{portal.busy ? "Memproses…" : label}</button></fieldset>{localError && <p role="alert" className="text-sm text-red-700">{localError}</p>}</form>;
}
export async function rpc(name, params) { const result = await supabase.rpc(name, params); if (result.error) throw result.error; return result.data; }
export function PortalPage({ title, children }) { return <Suspense fallback={<p role="status" className="p-8">Memuat portal…</p>}><PortalContent title={title}>{children}</PortalContent></Suspense>; }
function PortalContent({ title, children }) {
  const params = useSearchParams();
  const [user, setUser] = useState(null);
  const [context, setContext] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const reload = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") throw error;
    const account = data?.user || null;
    setUser(account);
    if (!account?.email_confirmed_at) setContext(null);
    if (account?.email_confirmed_at) setContext(await rpc("school_portal_context"));
  }, []);
  useEffect(() => {
    let alive = true;
    async function load() { try { await reload(); } catch (e) { if (alive) setError(schoolError(e)); } finally { if (alive) setReady(true); } }
    void load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { if (alive) { setUser(null); setContext(null); setReady(false); setTimeout(load,0); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [reload]);
  const run = useCallback(async (operation, refresh, message = "Perubahan tersimpan.") => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await operation();
      if (refresh) await refresh();
      await reload();
      setNotice(`${message}${result?.transfer_id ? ` ID transfer: ${result.transfer_id}${result.expires_at ? ` · Kedaluwarsa: ${new Date(result.expires_at).toLocaleString("id-ID")}` : ""}. Simpan ID ini untuk pembatalan bila diperlukan.` : ""}`); return result ?? true;
    } catch (e) {
      setError(schoolError(e));
      // Never retry mutations automatically after an ambiguous response.
      try { if (refresh) await refresh(); await reload(); } catch { /* retain original error */ }
      return false;
    } finally { lock.current = false; setBusy(false); }
  }, [reload]);
  const next = typeof window === "undefined" ? "/school" : `${window.location.pathname}${window.location.search}`;
  const portal = { user, context, params, busy, run, reload };
  const Content = children;
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900"><div className="mx-auto max-w-6xl space-y-6">
    <nav aria-label="Navigasi portal" className="flex flex-wrap gap-4 border-b border-slate-200 pb-4 text-sm font-bold text-blue-800">{[["/","Beranda"],["/school","Sekolah"],["/school/register","Daftarkan sekolah"],["/school/join","Gabung siswa"],["/school/manage","Kelola sekolah"],["/school/messages","Pesan"],["/student","Ruang siswa"],["/teacher","Tugas staf"]].map(([href,label]) => <Link key={href} href={href}>{label}</Link>)}{context?.can_review_applications && <Link href="/admin/schools">Review platform</Link>}{user && <button disabled={busy} type="button" onClick={() => run(async () => { const { error } = await supabase.auth.signOut(); if(error) throw error; }, null, "Kamu sudah keluar dari akun.")}>Keluar</button>}</nav>
    <header><h1 className="text-3xl font-black">{title}</h1>{user && <p className="mt-2 text-sm text-slate-600">Akun: {user.email}</p>}</header>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}{notice && <p role="status" className="rounded border border-green-200 bg-green-50 p-4 text-green-900">{notice}</p>}
    {!ready ? <p role="status">Memeriksa akun…</p> : !user ? <>{<Content {...portal} guest />}<Panel title="Sudah memiliki akun?"><Link className={buttonClass} href={authLink("login",next)}>Masuk untuk melanjutkan</Link></Panel></> : !user.email_confirmed_at ? <Panel title="Verifikasi email diperlukan"><p>Konfirmasi email terlebih dahulu, kemudian masuk kembali. Akun guru dan staf tidak perlu mengisi jenjang pendidikan siswa.</p><button className={buttonClass} disabled={busy} onClick={() => run(async () => { const { error } = await supabase.auth.resend({ type: "signup", email: user.email, options: { emailRedirectTo: `${window.location.origin}${next}` } }); if(error) throw error; },null,"Permintaan verifikasi sudah diproses. Periksa kotak masuk dan folder spam emailmu.")}>Kirim ulang verifikasi</button></Panel> : context ? <><button type="button" className="text-sm font-bold text-blue-800 underline" disabled={busy} onClick={() => run(async () => true,null,"Data akun dan akses sekolah sudah diperbarui.")}>Perbarui data akun dan sekolah</button>{<Content {...portal} />}</> : <button className={buttonClass} disabled={busy} onClick={() => run(async () => true)}>Coba muat portal kembali</button>}
  </div></main>;
}
export function SchoolSelect({ memberships, value, onChange, disabled }) { return <label className="block max-w-lg text-sm font-bold">Sekolah<select className={inputClass} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}><option value="">Pilih sekolah…</option>{memberships.map(m => <option key={m.school_id} value={m.school_id}>{m.school_name}</option>)}</select></label>; }
