"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Panel, PortalPage, SchoolSelect, rpc } from "@/components/school/portal";
import { MessageComposer, Messages, NewTicket, Tickets } from "@/components/school/communications";
import { supabase } from "@/lib/supabase";
import { schoolError } from "@/lib/school/onboarding.mjs";

function Inbox({ portal, membership }) {
  const schoolId = membership.school_id;
  const admin = membership.role === "school_admin";
  const [data,setData] = useState(null);
  const [recipients,setRecipients] = useState([]);
  const [error,setError] = useState("");
  const refresh = useCallback(async () => { const result = await rpc("school_communications",{ p_school_id:schoolId }); setData(result); },[schoolId]);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const result = await rpc("school_communications",{ p_school_id:schoolId });
        let members;
        if(admin) members = (await rpc("school_admin_workspace",{ p_school_id:schoolId })).members.filter(m => m.status === "active");
        else {
          // Existing RLS may expose only own membership; no directory bypass.
          const { data, error } = await supabase.from("school_memberships").select("user_id,role").eq("school_id",schoolId).eq("status","active").eq("role","school_admin");
          if(error) throw error;
          members = data || [];
        }
        if(alive) { setData(result); setRecipients(members); }
      } catch(e) { if(alive) setError(schoolError(e)); }
    }
    void load(); return () => { alive=false; };
  },[schoolId,admin]);
  if(error && !data) return <p role="alert">{error}</p>;
  if(!data) return <p role="status">Memuat pesan…</p>;
  return <div className="space-y-6">{admin && <Panel title="Kontak admin untuk siswa"><p>Bagikan ID kontak Anda melalui pengumuman sekolah atau saluran sekolah agar siswa dapat mengirim laporan privat. Direktori admin tidak dibuka kepada siswa.</p><p className="break-all select-all font-mono">{portal.user.id}</p></Panel>}<MessageComposer portal={portal} schoolId={schoolId} recipients={recipients} admin={admin} refresh={refresh} />{!admin && !recipients.length && <p role="status">Minta ID kontak admin kepada sekolah atau lihat pengumuman admin, lalu masukkan pada formulir. Server memeriksa bahwa penerima adalah admin aktif sekolah ini.</p>}<button type="button" className="font-bold text-blue-800 underline" disabled={portal.busy} onClick={() => portal.run(async () => true,refresh,"Daftar pesan dimuat ulang.")}>Muat ulang pesan sebelum mencoba kirim ulang</button><Messages portal={portal} messages={data.messages} admin={admin} refresh={refresh} names={Object.fromEntries(recipients.map(m => [m.user_id,m.name]))} />{admin && <><NewTicket portal={portal} schoolId={schoolId} refresh={refresh} /><Tickets portal={portal} tickets={data.tickets} refresh={refresh} /></>}<p className="text-sm text-slate-600">Pesan privat hanya terlihat oleh pengirim/penerima yang masih aktif. Koordinator baru dan platform tidak otomatis melihat pesan privat lama milik orang lain. Tiket sekolah dibatasi 100 terbaru.</p></div>;
}
function Communications({ portal }) {
  const memberships = portal.context?.memberships || [];
  const [selected,setSelected] = useState(portal.params.get("school") || memberships[0]?.school_id || "");
  if(portal.guest) return <Panel title="Komunikasi sekolah"><p>Masuk dengan akun anggota sekolah aktif untuk membaca pengumuman dan mengirim pesan privat kepada admin.</p></Panel>;
  const membership = memberships.find(m => m.school_id === selected);
  return <div className="space-y-6"><SchoolSelect memberships={memberships} value={membership?.school_id || ""} onChange={setSelected} disabled={portal.busy} />{!memberships.length && <Empty>Belum ada membership sekolah aktif.</Empty>}{membership && <Inbox key={membership.school_id} portal={portal} membership={membership} />}</div>;
}
export default function SchoolMessagesPage() { return <PortalPage title="Pesan dan laporan sekolah">{portal => <Communications portal={portal} />}</PortalPage>; }
