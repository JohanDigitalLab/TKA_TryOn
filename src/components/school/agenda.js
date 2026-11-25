"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { requireAdvanced, classParticipantIds, scheduleAvailability, validateSchedule } from '@/lib/school/advanced.mjs';
import { schoolRpc } from '@/lib/school/rpc-contract.mjs';
import { Field, Panel, SchoolSelect, buttonClass } from '@/components/school/portal';

const blank = { label: '', tka_code: '', start_at: '', deadline_at: '', ids: '' };
const date = value => new Date(value).toLocaleString('id-ID');

// Remount on school/role changes: no stale response may cross school scopes.
export function AgendaSelector({ portal, student = false }) {
  const memberships = (portal.context?.memberships || []).filter(m => student ? m.role === 'student' : ['teacher', 'school_admin'].includes(m.role));
  const [selected, setSelected] = useState(memberships[0]?.school_id || '');
  const membership = memberships.find(m => m.school_id === selected);
  return <div className="space-y-5">
    <nav className="flex flex-wrap gap-5 font-bold text-accent-strong"><Link href={student ? '/student' : '/school'}>← Dashboard</Link><Link href={student ? '/student/assignments' : '/teacher'}>Tugas sekolah</Link>{!student && <Link href="/school/manage">Manajemen sekolah</Link>}</nav>
    <SchoolSelect memberships={memberships} value={membership?.school_id || ''} onChange={setSelected} />
    {!membership ? <p>Membership {student ? 'siswa' : 'guru/admin'} aktif diperlukan. Pilih sekolah; afiliasi profil tidak memberi izin.</p> : <AgendaWorkspace key={`${membership.school_id}:${membership.role}`} schoolId={membership.school_id} role={membership.role} student={student} />}
  </div>;
}

export function AgendaWorkspace({ schoolId, role, student }) {
  const [agenda, setAgenda] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(blank);
  const [roster, setRoster] = useState(null);
  const [classId, setClassId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [monitor, setMonitor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const sequence = useRef(0);
  const clock = useRef({ received: 0, server: 0 });
  const [serverNow, setServerNow] = useState(NaN);
  const call = useCallback((name, params) => schoolRpc(supabase, name, params, { schoolId }), [schoolId]);
  const reload = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true); setReady(false); setAgenda(null); setMonitor(null); setConfirm(null); setError('');
    try {
      const data = await call('get_school_schedule_agenda', { p_school_id: schoolId });
      if (!alive.current || version !== sequence.current) return;
      clock.current = { received: performance.now(), server: Date.parse(data.server_now) };
      setServerNow(clock.current.server); setAgenda(data); setReady(true);
    } catch (e) { if (alive.current && version === sequence.current) setError(e.message); }
    finally { if (alive.current && version === sequence.current) setLoading(false); }
  }, [call, schoolId]);
  useEffect(() => {
    alive.current = true;
    const requestSequence = sequence;
    const task = setTimeout(() => void reload(), 0);
    const timer = setInterval(() => { if (clock.current.received) setServerNow(clock.current.server + performance.now() - clock.current.received); }, 1000);
    return () => { alive.current = false; requestSequence.current++; clearTimeout(task); clearInterval(timer); };
  }, [reload]);
  async function run(operation, success) {
    if (lock.current || !ready || loading) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await operation();
      if (alive.current) { setNotice(success); await reload(); }
    } catch (e) {
      // Ambiguous writes and stale revisions are never retried. Require explicit reload.
      if (alive.current) { setError(e.message); setReady(false); setConfirm(null); }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function loadRoster() {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await requireAdvanced(supabase, schoolId);
      const data = await schoolRpc(supabase, 'school_admin_workspace', { p_school_id: schoolId });
      if (alive.current) { setRoster(data); setClassId(''); setSelectedIds([]); }
    } catch (e) { if (alive.current) setError(e.message); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function showMonitor(item, offset = 0) {
    if (lock.current || !ready) return;
    lock.current = true; setBusy(true); setError(''); setMonitor(null);
    try {
      const data = await call('get_school_schedule_participants', { p_schedule_id: item.schedule_id, p_limit: 100, p_offset: offset });
      if (alive.current) setMonitor({ item, data, offset });
    } catch (e) { if (alive.current) { setError(e.message); setReady(false); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function create(event) {
    event.preventDefault();
    void run(async () => {
      const manual = form.ids.trim() ? form.ids.trim().split(/[\s,;]+/) : [];
      // Never send class IDs or membership IDs: the RPC requires user UUIDs.
      const params = validateSchedule({ p_school_id: schoolId, p_label: form.label.trim(), p_tka_code: form.tka_code.trim(), p_start_at: new Date(form.start_at).toISOString(), p_deadline_at: new Date(form.deadline_at).toISOString(), p_participant_ids: [...new Set([...selectedIds, ...manual])] });
      await call('create_school_schedule', params);
      if (alive.current) { setForm(blank); setSelectedIds([]); }
    }, 'Draft tersimpan. Periksa peserta lalu terbitkan.');
  }
  const field = key => ({ value: form[key], onChange: e => setForm(old => ({ ...old, [key]: e.target.value })) });
  const students = roster?.members.filter(m => m.role === 'student' && m.status === 'active' && m.class_id === classId) || [];
  return <div className="space-y-6">
    <p className="text-sm text-ink-secondary">Satu paket SET, satu kesempatan. Jam, durasi penuh, jenjang, otorisasi dan hasil ditentukan server. Capability bukan bukti kelulusan staging/live.</p>
    <button className={buttonClass} disabled={busy || loading} onClick={reload}>Muat ulang & periksa capability</button>
    {loading && <p role="status">Memeriksa kontrak dan agenda sekolah…</p>}
    {!loading && !ready && <p role="status">Agenda unavailable. Operasi dinonaktifkan sampai capability sekolah dan data berhasil diverifikasi kembali.</p>}
    {error && <p role="alert" className="border-l-2 border-warning-line bg-warning-soft p-4">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!student && <Panel title="Buat draft agenda SET"><form onSubmit={create}><fieldset disabled={!ready || loading || busy} className="space-y-4 disabled:opacity-50">
      <Field label="Judul agenda" required minLength={3} maxLength={255} {...field('label')} />
      <Field label="Kode paket SET resmi" required {...field('tka_code')} />
      <p className="text-sm">Masukkan kode SET yang diberikan pengelola bank soal. Kontrak tidak menyediakan katalog paket staf. Tidak ada RANDOM, kode buatan atau fallback pool; server memeriksa paket dan kecukupan soal saat publish.</p>
      <Field label="Mulai (waktu lokal perangkat)" type="datetime-local" required {...field('start_at')} />
      <Field label="Batas akhir (cukup untuk seluruh durasi SET)" type="datetime-local" required {...field('deadline_at')} />
      {role === 'school_admin' && <><button type="button" className={buttonClass} onClick={loadRoster}>Muat pilihan peserta per kelas</button>{roster && <>
        <Field label="Kelas peserta" value={classId} onChange={e => setClassId(e.target.value)} options={roster.classes.filter(c => !c.archived).map(c => ({ value: c.id, label: `${c.name} · ${c.grade} · ${c.academic_year}` }))} />
        <button type="button" className={buttonClass} disabled={!classId} onClick={() => setSelectedIds(ids => [...new Set([...ids, ...classParticipantIds(roster, classId)])])}>Pilih siswa aktif dalam kelas</button>
        {students.map(m => <label key={m.user_id} className="flex gap-2"><input type="checkbox" checked={selectedIds.includes(m.user_id)} onChange={e => setSelectedIds(ids => e.target.checked ? [...new Set([...ids, m.user_id])] : ids.filter(id => id !== m.user_id))} />{m.name || m.user_id} · {m.user_id}</label>)}
        <p>{selectedIds.length} pengguna dipilih lintas kelas.</p><button type="button" onClick={() => setSelectedIds([])}>Kosongkan pilihan</button>
      </>}</>}
      <Field label="ID pengguna peserta tambahan (UUID, pisahkan koma/baris; bukan ID kelas)" multiline {...field('ids')} />
      <p className="text-sm">Guru belum memiliki endpoint roster kelas. Gunakan ID pengguna resmi dari koordinator. Membership aktif bukan bukti akun verified; semua peserta diperiksa ulang server saat draft dan publish. Maksimum 500 pengguna unik.</p>
      <button type="submit" className={buttonClass}>{busy ? 'Memproses…' : 'Simpan draft agenda'}</button>
    </fieldset></form></Panel>}
    <Panel title="Daftar agenda (100 terbaru)">{ready && agenda?.schedules.length === 0 && <p>Belum ada agenda yang tersedia untuk akun ini.</p>}{ready && agenda?.schedules.map(item => {
      const availability = scheduleAvailability(item, serverNow);
      return <article key={item.schedule_id} className="space-y-3 border-t border-line py-4"><h3 className="text-xl font-bold">{item.label}</h3><p>{item.status} · revisi {item.revision} · SET {item.tka_code}</p><p>{date(item.start_at)} — {date(item.deadline_at)}</p>
        {student ? availability.canStart ? <Link prefetch={false} className={buttonClass} href={`/student/challenge?scheduledId=${encodeURIComponent(item.schedule_id)}`}>{availability.label}</Link> : <p>{availability.label}</p> : <div className="flex flex-wrap gap-3">
          {item.status === 'draft' && <button disabled={busy || !ready} className={buttonClass} onClick={() => setConfirm({ item, status: 'published' })}>Terbitkan agenda</button>}
          {item.status !== 'cancelled' && <button disabled={busy || !ready} className={buttonClass} onClick={() => setConfirm({ item, status: 'cancelled' })}>Batalkan agenda</button>}
          <button disabled={busy || !ready} className={buttonClass} onClick={() => showMonitor(item)}>Monitor peserta</button>
        </div>}
      </article>;
    })}</Panel>
    {confirm && ready && <Panel title={confirm.status === 'published' ? 'Konfirmasi publikasi' : 'Konfirmasi pembatalan'}><p>Publish membekukan SET dan peserta. Cancel menolak start/resume/save/submit termasuk finalize terlambat. Histori tetap disimpan. Draft tidak bisa diedit: batalkan dan buat ulang.</p><div className="flex gap-3"><button className={buttonClass} disabled={busy} onClick={() => setConfirm(null)}>Kembali</button><button className={buttonClass} disabled={busy} onClick={() => run(() => call('set_school_schedule_status', { p_schedule_id: confirm.item.schedule_id, p_status: confirm.status, p_expected_revision: confirm.item.revision }), 'Status agenda diperbarui.')}>Konfirmasi revisi {confirm.item.revision}</button></div></Panel>}
    {monitor && ready && <Panel title={`Monitor · ${monitor.item.label}`}><p>{monitor.data.total} peserta · status {monitor.data.status} · server {date(monitor.data.server_now)}</p><p className="text-sm">Hanya data peserta agenda ini; tidak ada jawaban, kunci atau hasil mandiri. Halaman maksimum 100 peserta.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Siswa', 'Status', 'Mulai', 'Submit', 'Deadline attempt', 'Terjawab', 'Skor'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{monitor.data.participants.map(p => <tr key={p.user_id}><td className="p-2">{p.full_name || p.user_id}</td><td>{p.attempt_status || 'Belum mulai'}</td><td>{p.started_at ? date(p.started_at) : '—'}</td><td>{p.submitted_at ? date(p.submitted_at) : '—'}</td><td>{p.deadline_at ? date(p.deadline_at) : '—'}</td><td>{p.answered_count}</td><td>{p.score ?? '—'}</td></tr>)}</tbody></table></div><nav className="flex gap-3"><button className={buttonClass} disabled={busy || monitor.offset === 0} onClick={() => showMonitor(monitor.item, Math.max(0, monitor.offset - 100))}>Sebelumnya</button><button className={buttonClass} disabled={busy} onClick={() => showMonitor(monitor.item, monitor.offset)}>Perbarui monitor</button><button className={buttonClass} disabled={busy || monitor.offset + 100 >= monitor.data.total} onClick={() => showMonitor(monitor.item, monitor.offset + 100)}>Berikutnya</button></nav></Panel>}
  </div>;
}
