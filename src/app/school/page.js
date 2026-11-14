"use client";

import Link from "next/link";
import { Empty, Panel, PortalPage, Status } from "@/components/school/portal";
import { IncomingTransfers } from "@/components/school/transfers";

export default function SchoolPage() {
  return <PortalPage title="Portal sekolah">{portal => portal.guest ? <Panel title="Sekolah dan siswa"><p>Staf dapat mendaftarkan sekolah dengan akun email terverifikasi tanpa profil pendidikan siswa. Siswa bergabung melalui undangan kelas dan persetujuan admin.</p><div className="flex flex-wrap gap-4 font-bold text-blue-800"><Link href="/school/register">Daftarkan sekolah / akun staf →</Link><Link href="/school/join">Gabung sebagai siswa →</Link></div></Panel> : <>
    <IncomingTransfers portal={portal} />
    <Panel title="Keanggotaan aktif">{!portal.context.memberships.length && <Empty>Belum ada keanggotaan aktif. Periksa status pengajuan atau gunakan undangan siswa. Pengajuan/permintaan pending belum memberikan akses sekolah.</Empty>}{portal.context.memberships.map(m => <article className="space-y-3 border-t border-slate-200 py-4" key={m.school_id}><h3 className="text-lg font-bold">{m.school_name}</h3><p>{({ school_admin:"Admin sekolah",teacher:"Guru legacy",student:"Siswa" })[m.role] || m.role}{m.is_primary ? " · Koordinator utama" : ""}</p><div className="flex flex-wrap gap-4 font-bold text-blue-800">{m.role === "school_admin" && <Link href={`/school/manage?school=${m.school_id}`}>Kelola sekolah</Link>}<Link href={`/school/messages?school=${m.school_id}`}>Pesan sekolah</Link>{["school_admin","teacher"].includes(m.role) && <Link href="/teacher">Kelola tugas</Link>}{m.role === "student" && <Link href="/student/assignments">Tugas siswa</Link>}</div></article>)}</Panel>
    <Panel title="Pengajuan sekolah">{!portal.context.applications.length && <Empty />}{portal.context.applications.map(a => <p className="flex flex-wrap gap-3" key={a.id}>{a.school_name} <Status value={a.status} /></p>)}<Link href="/school/register" className="font-bold text-blue-800 underline">Lihat catatan / ajukan sekolah</Link></Panel>
    <p className="text-sm text-slate-600">Undangan staf/guru baru belum tersedia. Guru legacy tetap memakai otorisasi tugas tingkat sekolah; pembatasan guru per kelas/mapel belum diterapkan. Tidak ada perluasan akses guru dari portal ini.</p>
  </>}</PortalPage>;
}
