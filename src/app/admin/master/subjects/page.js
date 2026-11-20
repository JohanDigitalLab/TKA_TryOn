"use client";

import MasterDataWorkspace from "@/components/admin/master-data-workspace";

const LEVELS = [
  { value: "sd", label: "SD" },
  { value: "smp", label: "SMP" },
  { value: "sma", label: "SMA" },
];

export default function AdminMasterSubjectsPage() {
  return (
    <MasterDataWorkspace
      table="subjects"
      title="Mata Pelajaran"
      description="Daftar mata pelajaran (subjects). subject_code sebaiknya berakhiran jenjang, misalnya MTK-sd."
      searchPlaceholder="Cari kode atau nama mata pelajaran…"
      createLabel="Tambah Mata Pelajaran"
      columns={[
        { key: "subject_code", label: "Kode" },
        { key: "name", label: "Nama" },
        { key: "education_level_id", label: "Jenjang" },
        { key: "is_active", label: "Aktif" },
      ]}
      fields={[
        { name: "subject_code", label: "Kode mapel", required: true, maxLength: 40, placeholder: "MTK-smp" },
        { name: "name", label: "Nama", required: true, maxLength: 100 },
        { name: "education_level_id", label: "Jenjang", type: "select", options: LEVELS, required: true },
        { name: "is_active", label: "Aktif", type: "boolean", default: true },
      ]}
    />
  );
}
