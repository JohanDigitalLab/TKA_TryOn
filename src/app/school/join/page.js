"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, Field, Panel, PortalPage, Status, DateText, rpc } from "@/components/school/portal";
import { authLink, inviteCode, joinPath } from "@/lib/school/onboarding.mjs";

function Join({ portal }) {
  const [code, setCode] = useState(portal.params.get("code") || "");
  const [preview, setPreview] = useState(null);
  const [request, setRequest] = useState(null);
  const next = code.trim().length === 64 ? joinPath(code) : "/school/join";
  if (portal.guest) return <Panel title="Gabung sebagai siswa"><p>Gunakan akun siswa yang sudah ada atau daftar siswa baru. Verifikasi email dan pilih jenjang siswa sesuai kelas undangan. Kode tidak otomatis membuat keanggotaan; admin sekolah harus menyetujui permintaan.</p><Field label="Kode undangan (64 karakter)" value={code} onChange={e => setCode(e.target.value)} maxLength={64} /><div className="flex flex-wrap gap-4"><Link className="text-blue-800 underline" href={authLink("login",next)}>Masuk dengan akun siswa</Link><Link className="text-blue-800 underline" href={authLink("register",next)}>Daftar siswa baru</Link></div></Panel>;
  return <div className="space-y-6"><Panel title="Periksa undangan"><p className="text-sm text-slate-600">Undangan hanya untuk siswa, bukan guru. Preview tidak memakai kuota. Permintaan yang dikirim memesan satu slot dan menunggu admin. Slot tidak kembali setelah penolakan atau kedaluwarsa.</p><ActionForm portal={portal} label="Lihat preview undangan" reset={false} onSubmit={() => {
    const valid = inviteCode(code);
    setPreview(null); setRequest(null);
    return portal.run(async () => { const result = await rpc("school_invite_request",{ p_code: valid,p_confirm:false }); setPreview({ ...result, code:valid }); },null,"Preview undangan dimuat.");
  }}><Field label="Kode undangan" value={code} onChange={e => { setCode(e.target.value); setPreview(null); setRequest(null); }} minLength={64} maxLength={64} required autoComplete="off" /></ActionForm></Panel>
    {preview && <Panel title="Konfirmasi sekolah dan kelas"><h3 className="text-lg font-bold">{preview.school_name} · {preview.class_name}</h3><p>Kelas {preview.grade} · {preview.academic_year}</p><p>Berlaku sampai <DateText value={preview.expires_at} /></p><ActionForm portal={portal} label="Kirim permintaan bergabung" confirm="sekolah dan kelas ini benar; saya meminta persetujuan admin sekolah" onSubmit={() => portal.run(async () => { const result = await rpc("school_invite_request",{ p_code:preview.code,p_confirm:true }); setRequest(result); setPreview(null); },null,"Status permintaan berhasil diterima dari server.")} /></Panel>}
    {request && <Panel title="Status permintaan"><Status value={request.status} /><p className="break-all text-sm">ID permintaan: {request.request_id}</p><p>Pending belum berarti anggota aktif. Setelah disetujui, muat ulang portal sekolah. Jika ditolak/dinonaktifkan, minta undangan baru; pengiriman ulang kode yang sama tidak mengaktifkan akun kembali.</p></Panel>}
    <Panel title="Memeriksa permintaan sebelumnya"><p className="text-sm">Jika kode sudah digunakan namun preview tidak lagi tersedia, periksa hasil permintaan sebelumnya. Ini juga dapat mengirim permintaan bila kode belum pernah dipakai; lakukan hanya bila sudah mengenali sekolah/kelas tujuan.</p><ActionForm portal={portal} label="Periksa/kirim ulang kode yang diketahui" confirm="saya mengenali sekolah dan kelas tujuan kode ini serta menyetujui pengiriman permintaan bila belum ada" onSubmit={() => portal.run(async () => { const result = await rpc("school_invite_request",{ p_code:inviteCode(code),p_confirm:true }); setRequest(result); setPreview(null); },null,"Status permintaan dimuat.")} /></Panel>
  </div>;
}
export default function SchoolJoinPage() { return <PortalPage title="Bergabung ke sekolah">{portal => <Join portal={portal} />}</PortalPage>; }
