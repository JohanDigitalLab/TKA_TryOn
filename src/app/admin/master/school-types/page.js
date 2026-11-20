"use client";

import MasterDataWorkspace from "@/components/admin/master-data-workspace";

const LEVELS = [
  { value: "sd", label: "SD" },
  { value: "smp", label: "SMP" },
  { value: "sma", label: "SMA" },
];

export default function AdminMasterSchoolTypesPage() {
  return (
    <MasterDataWorkspace
      table="school_types"
      title="Tipe Sekolah"
      description="Daftar tipe sekolah (school_types). Id berupa teks singkat (mis. SD01) dan wajib diisi saat menambah data."
      searchPlaceholder="Cari id atau nama tipe sekolah…"
      createLabel="Tambah Tipe Sekolah"
      columns={[
        { key: "id", label: "Id" },
        { key: "name", label: "Nama" },
        { key: "education_level_id", label: "Jenjang" },
      ]}
      fields={[
        {
          name: "id",
          label: "Id tipe",
          required: true,
          maxLength: 20,
          placeholder: "SD01",
          pkText: true,
          hint: "Identifier teks unik; tidak dapat diubah setelah dibuat.",
        },
        { name: "name", label: "Nama", required: true, maxLength: 100, placeholder: "SD/MI" },
        { name: "education_level_id", label: "Jenjang", type: "select", options: LEVELS, required: true },
      ]}
    />
  );
}
