"use client";

import MasterDataWorkspace from "@/components/admin/master-data-workspace";

const STATUSES = [
  { value: "active", label: "active" },
  { value: "pending", label: "pending" },
  { value: "suspended", label: "suspended" },
  { value: "rejected", label: "rejected" },
];

export default function AdminMasterSchoolsPage() {
  return (
    <MasterDataWorkspace
      table="schools"
      title="Sekolah"
      description="Daftar sekolah (schools). school_type_id merujuk id pada tabel school_types."
      searchPlaceholder="Cari nama, NPSN, kota, atau provinsi…"
      createLabel="Tambah Sekolah"
      columns={[
        { key: "name", label: "Nama" },
        { key: "npsn", label: "NPSN" },
        { key: "school_type_id", label: "Tipe" },
        { key: "city", label: "Kota" },
        { key: "province", label: "Provinsi" },
        { key: "status", label: "Status" },
      ]}
      fields={[
        { name: "name", label: "Nama sekolah", required: true, maxLength: 160 },
        { name: "npsn", label: "NPSN", maxLength: 8, placeholder: "8 digit angka" },
        { name: "school_type_id", label: "Tipe sekolah", maxLength: 40, hint: "Id dari master Tipe Sekolah, misalnya SD01." },
        { name: "address", label: "Alamat", type: "textarea" },
        { name: "city", label: "Kota/Kabupaten", maxLength: 100 },
        { name: "province", label: "Provinsi", maxLength: 100 },
        { name: "status", label: "Status", type: "select", options: STATUSES, required: true },
      ]}
    />
  );
}
