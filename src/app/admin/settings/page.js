"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/admin-sidebar';
import { supabase } from '@/lib/supabase';
import { SETTING_KEYS, SETTING_LABELS, settingEnabled, settingsError, textLength, validateSettingsPatch, whatsAppUrl } from '@/lib/admin/platform-settings.mjs';

const inputClass = 'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:opacity-60';
const buttonClass = 'min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:opacity-50';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 sm:p-7';
function formValues(values) {
  return Object.fromEntries(SETTING_KEYS.map(key => [key, key === 'AUTO_CALC_COMPETENCY' ? (settingEnabled(values[key]) ? '1' : '0') : values[key] ?? '']));
}
function preview(number, message) {
  try { return whatsAppUrl(number, message); } catch { return ''; }
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const savingRef = useRef(false);
  const baseline = snapshot ? formValues(snapshot.values) : {};
  const changed = SETTING_KEYS.filter(key => draft[key] !== baseline[key]);
  const dirty = !!snapshot && changed.length > 0;

  const loadHistory = useCallback(async (before = null) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_platform_settings_history', { p_before: before });
      if (rpcError) throw rpcError;
      if (!Array.isArray(data)) throw new Error('Respons riwayat tidak valid.');
      setHistory(rows => before === null ? data : [...rows, ...data]);
      setHasMore(data.length === 20);
    } catch (err) { setHistoryError(settingsError(err)); }
    finally { setHistoryLoading(false); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setReviewing(false);
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_platform_settings_get');
      if (rpcError) throw rpcError;
      if (!Number.isInteger(data?.revision) || !data?.values) throw new Error('Respons pengaturan tidak valid.');
      setSnapshot(data);
      setDraft(formValues(data.values));
      setReason('');
      await loadHistory();
    } catch (err) { setError(settingsError(err)); }
    finally { setLoading(false); }
  }, [loadHistory]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const protect = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  function mayLeave() { return !savingRef.current && (!dirty || window.confirm('Ada perubahan belum disimpan. Tinggalkan draf?')); }
  function navigate(label) { if (mayLeave()) router.push(label === 'Manajemen Admin' ? '/admin#operators' : '/admin'); }
  function refresh() { if (!savingRef.current && (!dirty || window.confirm('Muat ulang dan buang perubahan draf?'))) { setNotice(''); void load(); } }
  function review(event) {
    event.preventDefault();
    setNotice(''); setError('');
    try {
      validateSettingsPatch(Object.fromEntries(changed.map(key => [key, draft[key]])));
      if (textLength(reason.trim()) < 5 || textLength(reason.trim()) > 300) throw new Error('Alasan wajib 5–300 karakter.');
      setReviewing(true);
    } catch (err) { setError(settingsError(err)); }
  }
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const patch = validateSettingsPatch(Object.fromEntries(changed.map(key => [key, draft[key]])));
      const { data, error: rpcError } = await supabase.rpc('admin_platform_settings_save', { p_revision: snapshot.revision, p_changes: patch, p_reason: reason.trim() });
      if (rpcError) throw rpcError;
      if (!Number.isInteger(data?.revision) || !data?.values) throw new Error('Respons simpan tidak valid. Muat ulang untuk memastikan status; jangan menganggap perubahan tersimpan.');
      setSnapshot(data); setDraft(formValues(data.values)); setReason(''); setReviewing(false);
      setNotice(`Pengaturan tersimpan di database (revisi ${data.revision}).`);
      await loadHistory();
    } catch (err) { setError(settingsError(err)); setReviewing(false); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return (
    <main className="flex min-h-screen bg-slate-50 text-slate-800">
      <AdminSidebar active="Pengaturan" onSelect={navigate} beforeNavigate={mayLeave} />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <button type="button" className={buttonClass} disabled={saving} onClick={() => navigate('Dashboard')}>← Dashboard admin</button>
          <span className="text-sm text-slate-500">TKA TryOn • Super Admin</span>
        </header>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-blue-700">ADMINISTRASI PLATFORM</p><h1 className="mt-1 text-3xl font-extrabold text-slate-950">Pengaturan</h1><p className="mt-2 text-sm text-slate-600">Konfigurasi yang benar-benar digunakan aplikasi. Hanya Super Admin aktif dan terverifikasi.</p></div><button className={buttonClass} disabled={loading || saving} onClick={refresh}>Muat ulang</button></div>
          {error && <p role="alert" className="rounded-xl border border-amber-300 bg-white p-4 text-slate-800">{error}</p>}
          {notice && <p role="status" className="rounded-xl border border-blue-300 bg-white p-4 text-blue-700">{notice}</p>}
          {loading ? <p role="status">Memuat konfigurasi…</p> : snapshot && <form onSubmit={review} className="space-y-6">
            <fieldset disabled={saving || reviewing} className={`${cardClass} space-y-5`}>
              <legend className="px-2 text-lg font-bold">WhatsApp aktivasi langganan</legend>
              <p className="text-sm text-slate-600">Nomor kosong menonaktifkan tautan aktivasi. Pesan kosong membuka chat tanpa teks. Tidak ada nomor contoh yang dipasang otomatis.</p>
              {['WA_NUMBER', 'WA_MSG_SISWA', 'WA_MSG_SEKOLAH'].map(key => <div key={key}>
                <label htmlFor={key} className="font-semibold">{SETTING_LABELS[key]} {changed.includes(key) && <span className="text-sm text-blue-700">• Diubah</span>}</label>
                {key === 'WA_NUMBER' ? <input id={key} type="tel" maxLength={255} autoComplete="off" className={inputClass} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} aria-describedby={`${key}-help`} /> : <textarea id={key} rows={3} className={inputClass} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} aria-describedby={`${key}-help`} />}
                <p id={`${key}-help`} className="mt-1 text-xs text-slate-500">{key === 'WA_NUMBER' ? 'Gunakan kode negara. Awalan 08 dinormalisasi menjadi 628.' : `${textLength(draft[key])}/255 karakter. Teks dikirim apa adanya; tidak ada substitusi placeholder.`} {snapshot.values[key] === undefined && 'Belum dikonfigurasi di database.'}</p>
              </div>)}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h2 className="font-bold">Pratinjau draf WhatsApp</h2><p className="text-xs text-slate-600">Membuka WhatsApp tidak mengirim pesan otomatis dan tidak menyimpan draf.</p>{['WA_MSG_SISWA', 'WA_MSG_SEKOLAH'].map(key => { const url = preview(draft.WA_NUMBER, draft[key]); return <div key={key} className="mt-3"><p className="whitespace-pre-wrap break-words text-sm">{draft[key] || '(Tanpa pesan)'}</p>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-blue-700">Uji {key === 'WA_MSG_SISWA' ? 'pesan siswa' : 'pesan sekolah'} ↗</a> : <p className="text-sm text-slate-500">Isi nomor valid untuk membuka pratinjau.</p>}</div>; })}</div>
            </fieldset>
            <fieldset disabled={saving || reviewing} className={cardClass}><legend className="px-2 text-lg font-bold">Evaluasi pembelajaran</legend><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={draft.AUTO_CALC_COMPETENCY === '1'} onChange={e => setDraft({ ...draft, AUTO_CALC_COMPETENCY: e.target.checked ? '1' : '0' })} /><span><strong>Hitung kompetensi otomatis {changed.includes('AUTO_CALC_COMPETENCY') && '• Diubah'}</strong><span className="mt-1 block text-sm text-slate-600">Memicu perhitungan kompetensi siswa dan sekolah setelah pengiriman ujian di Tantangan. Tidak menghitung ulang riwayat secara massal.{snapshot.values.AUTO_CALC_COMPETENCY === undefined && ' Belum dikonfigurasi; dianggap nonaktif.'}</span></span></label></fieldset>
            <section className={cardClass}><h2 className="text-lg font-bold">Tinjau dan simpan</h2><p className="mt-1 text-sm text-slate-600">Revisi {snapshot.revision} • {dirty ? `${changed.length} pengaturan diubah` : 'Tidak ada perubahan'}. Semua perubahan disimpan bersama dan dicatat dalam audit.</p><label htmlFor="reason" className="mt-4 block font-semibold">Alasan perubahan</label><textarea id="reason" rows={2} minLength={5} maxLength={300} required disabled={saving || reviewing} className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Jelaskan tujuan perubahan, tanpa data pribadi atau rahasia." />
              {reviewing && <div className="mt-4 rounded-xl border border-blue-300 p-4" role="region" aria-label="Konfirmasi perubahan"><h3 className="font-bold">Konfirmasi perubahan aktif</h3><ul className="my-3 list-inside list-disc">{changed.map(key => <li key={key}>{SETTING_LABELS[key]}</li>)}</ul><p className="text-sm">Nilai draf akan langsung digunakan aplikasi setelah tersimpan. Lanjutkan?</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={saving} className={`${buttonClass} bg-blue-700 text-white`} onClick={save}>{saving ? 'Menyimpan…' : 'Konfirmasi dan simpan'}</button><button type="button" disabled={saving} className={buttonClass} onClick={() => setReviewing(false)}>Kembali mengedit</button></div></div>}
              {!reviewing && <button type="submit" disabled={!dirty || saving || loading} className={`${buttonClass} mt-4 bg-blue-700 text-white`}>Tinjau perubahan</button>}
            </section>
          </form>}
          <section className={cardClass}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Riwayat perubahan</h2><button type="button" disabled={historyLoading || saving} className={buttonClass} onClick={() => loadHistory()}>Segarkan riwayat</button></div>{historyError && <p role="alert" className="mt-3">{historyError}</p>}{historyLoading && <p role="status">Memuat riwayat…</p>}{!history.length && !historyLoading && <p className="mt-3 text-sm text-slate-600">Belum ada riwayat yang dimuat. Perubahan sebelum migrasi tidak direkonstruksi.</p>}<ol className="mt-4 space-y-4">{history.map(row => <li key={row.revision} className="rounded-xl border border-slate-200 p-4"><p className="font-semibold">Revisi {row.revision} • {new Date(row.created_at).toLocaleString('id-ID')}</p><p className="break-all text-xs text-slate-500">ID pelaku: {row.actor_id}</p><p className="mt-2 break-words text-sm">{row.reason}</p><details className="mt-2 text-sm"><summary>Lihat perubahan ({Object.keys(row.changes).length})</summary>{Object.entries(row.changes).map(([key, value]) => <div key={key} className="mt-2 break-words"><strong>{SETTING_LABELS[key] || key}</strong><p className="whitespace-pre-wrap">Sebelum: {value.before ?? '(belum ada)'}</p><p className="whitespace-pre-wrap">Sesudah: {value.after || '(kosong)'}</p></div>)}</details></li>)}</ol>{hasMore && <button type="button" disabled={historyLoading} className={`${buttonClass} mt-4`} onClick={() => loadHistory(history.at(-1).revision)}>Muat riwayat lebih lama</button>}</section>
          <section className={cardClass}><h2 className="text-lg font-bold">Identitas dan batas pengaturan</h2><p className="mt-2 text-sm text-slate-600">TKA TryOn • SKILL ON • CONFIDENCE ON. Identitas merek dikelola bersama kode aplikasi. Harga masih ditetapkan di halaman paket dan landing, bukan dari tabel pengaturan. Pembayaran dan kunci integrasi bukan konfigurasi generik; jangan memasukkan rahasia ke pesan atau alasan audit.</p><div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-blue-700"><Link href="/admin/master/users" onClick={e => { if (!mayLeave()) e.preventDefault(); }}>Master pengguna</Link><button type="button" disabled={saving} onClick={() => navigate('Manajemen Admin')}>Manajemen operator</button><Link href="/admin/master/schools" onClick={e => { if (!mayLeave()) e.preventDefault(); }}>Master sekolah</Link></div></section>
        </div>
      </div>
    </main>
  );
}
