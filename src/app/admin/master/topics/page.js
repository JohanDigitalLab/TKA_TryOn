"use client";

import MasterDataWorkspace from "@/components/admin/master-data-workspace";

export default function AdminMasterTopicsPage() {
  return (
    <MasterDataWorkspace
      table="subject_topics"
      title="Tema dan Topik"
      description="Peta tema/topik per mata pelajaran (subject_topics). subject_code memakai kode mapel, bukan namanya."
      searchPlaceholder="Cari kode mapel, tema, atau topik…"
      createLabel="Tambah Tema/Topik"
      columns={[
        { key: "subject_code", label: "Kode Mapel" },
        { key: "theme", label: "Tema" },
        { key: "topic", label: "Topik" },
        { key: "syllabus", label: "Silabus" },
      ]}
      fields={[
        { name: "subject_code", label: "Kode mapel", required: true, maxLength: 40, placeholder: "MTK-smp" },
        { name: "theme", label: "Tema", required: true, maxLength: 150 },
        { name: "topic", label: "Topik", required: true, maxLength: 150 },
        { name: "syllabus", label: "Silabus", type: "textarea", hint: "Opsional, catatan acuan silabus." },
      ]}
    />
  );
}
