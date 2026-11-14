"use client";

import Link from "next/link";
import { ActionForm, Field, Panel, PortalPage, Status, DateText, rpc } from "@/components/school/portal";
import { applicationFields, applicationPayload, authLink, text } from "@/lib/school/onboarding.mjs";
import { supabase } from "@/lib/supabase";

function Registration({ portal }) {
  if (portal.guest) return <Panel title="Akun penanggung jawab sekolah"><p>Daftarkan akun staf dengan email yang akan diverifikasi. Tidak perlu mengisi jenjang pendidikan siswa. Membuat akun tidak langsung membuat sekolah atau memberikan peran admin.</p><ActionForm portal={portal} label="Buat akun staf" onSubmit={values => {
    const name = text(values.full_name,"Nama lengkap",2,160);
    if (values.password.length < 8) throw new Error("Password minimal 8 karakter.");
    return portal.run(async () => { const { error } = await supabase.auth.signUp({ email: values.email.trim(), password: values.password, options: { data: { full_name: name, registration_method: "school_staff" }, emailRedirectTo: `${window.location.origin}/school/register` } }); if(error) throw error; },null,"Pendaftaran dikirim. Verifikasi email sebelum mengajukan sekolah; bila email sudah terdaftar, gunakan akun yang ada.");
  }}><Field name="full_name" label="Nama lengkap" autoComplete="name" minLength={2} maxLength={160} required /><Field name="email" label="Email staf" type="email" autoComplete="email" maxLength={254} required /><Field name="password" label="Password" type="password" autoComplete="new-password" minLength={8} required /></ActionForm><Link className="text-blue-800 underline" href={authLink("login","/school/register")}>Gunakan akun yang sudah ada</Link></Panel>;
  const pending = portal.context.applications.some(a => a.status === "pending");
  return <div className="space-y-6"><Panel title="Status pengajuan">{!portal.context.applications.length && <p>Belum ada pengajuan. NPSN wajib 8 angka. Pengajuan ditinjau reviewer platform sebelum sekolah aktif.</p>}{portal.context.applications.map(a => <article key={a.id} className="space-y-2 border-b border-slate-200 py-4"><h3 className="font-bold">{a.school_name} · {a.npsn}</h3><Status value={a.status} /><p className="text-sm"><DateText value={a.created_at} /></p>{a.review_note && <p className="whitespace-pre-wrap">Catatan reviewer: {a.review_note}</p>}{a.status === "approved" && <Link className="font-bold text-blue-800 underline" href={`/school/manage?school=${a.school_id}`}>Buka pengelolaan sekolah</Link>}{a.status === "rejected" && <p className="text-sm">Kamu bisa mengajukan kembali melalui formulir di bawah. Riwayat pengajuan sebelumnya tetap tersimpan dan tidak dapat diubah.</p>}</article>)}</Panel>
    {!pending ? <Panel title="Ajukan sekolah"><p className="text-sm text-slate-600">Pastikan data benar sebelum mengirim. Pengajuan yang sedang menunggu pemeriksaan tidak dapat diubah. Setiap akun dan NPSN hanya boleh memiliki satu pengajuan yang menunggu pemeriksaan. Pembayaran belum diaktifkan.</p><ActionForm portal={portal} label="Kirim pengajuan sekolah" confirm="saya berwenang mewakili sekolah dan data pengajuan benar" onSubmit={values => portal.run(() => rpc("submit_school_application",{ p_data: applicationPayload({ ...values, authorization_confirmed: true },portal.context.school_types) }),null,"Pengajuan dikirim dan menunggu peninjauan.")}>
      {applicationFields.map(([name,label,min,max]) => <Field key={name} name={name} label={label} required minLength={min} maxLength={max} multiline={name === "address"} />)}<Field name="npsn" label="NPSN (wajib 8 angka)" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} required /><Field name="school_type_id" label="Tipe sekolah" required options={portal.context.school_types.map(t => ({ value:t.id,label:t.name }))} />
    </ActionForm></Panel> : <p role="status">Pengajuan sedang ditinjau. Tidak ada penyimpanan draft atau pengeditan pengajuan pending.</p>}
  </div>;
}
export default function SchoolRegisterPage() { return <PortalPage title="Pendaftaran sekolah">{portal => <Registration portal={portal} />}</PortalPage>; }
