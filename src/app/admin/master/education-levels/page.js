"use client";

import MasterDataWorkspace from "@/components/admin/master-data-workspace";

export default function AdminMasterEducationLevelsPage() {
  return (
    <MasterDataWorkspace
      table="education_levels"
      title="Jenjang Pendidikan"
      description="Daftar jenjang (education_levels). Id berupa kode teks (mis. sd/smp/sma) dan wajib diisi saat menambah data."
      searchPlaceholder="Cari id atau nama jenjang…"
      createLabel="Tambah Jenjang"
      columns={[
        { key: "id", label: "Id" },
        { key: "name", label: "Nama" },
        { key: "grade", label: "Kelas" },
      ]}
      fields={[
        {
          name: "id",
          label: "Id jenjang",
          required: true,
          maxLength: 20,
          placeholder: "smp",
          pkText: true,
          hint: "Identifier teks unik; tidak dapat diubah setelah dibuat.",
        },
        { name: "name", label: "Nama", required: true, maxLength: 50, placeholder: "Sekolah Menengah Pertama" },
        { name: "grade", label: "Kelas acuan", type: "number", required: true, hint: "Angka, misalnya 9 untuk SMP." },
      ]}
    />
  );
}
