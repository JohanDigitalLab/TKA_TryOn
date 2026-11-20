"use client";

import MasterDataWorkspace from "@/components/admin/master-data-workspace";

const ACCOUNT_TYPES = [
  { value: "STUDENT", label: "STUDENT" },
  { value: "SCHOOL", label: "SCHOOL" },
  { value: "ADMIN", label: "ADMIN" },
];

const ACCOUNT_STATUS = [
  { value: "active", label: "active" },
  { value: "inactive", label: "inactive" },
  { value: "banned", label: "banned" },
];

const LEVELS = [
  { value: "sd", label: "SD" },
  { value: "smp", label: "SMP" },
  { value: "sma", label: "SMA" },
];

export default function AdminMasterUsersPage() {
  return (
    <MasterDataWorkspace
      table="profiles"
      title="Pengguna"
      description="Daftar akun (profiles). Email login tidak ditampilkan sebagai kolom yang dapat diubah — email hanya dikelola melalui auth.users."
      searchPlaceholder="Cari nama, NISN, atau email login…"
      createLabel="Tambah Pengguna"
      columns={[
        { key: "full_name", label: "Nama" },
        { key: "email", label: "Email login" },
        { key: "nisn", label: "NISN" },
        { key: "account_type", label: "Tipe" },
        { key: "account_status", label: "Status" },
        { key: "education_level", label: "Jenjang" },
        { key: "is_managed", label: "Dikelola" },
        { key: "is_subscribed", label: "Berlangganan" },
      ]}
      fields={[
        { name: "full_name", label: "Nama lengkap", required: true, maxLength: 160 },
        { name: "nickname", label: "Nama panggilan", maxLength: 50 },
        { name: "nisn", label: "NISN", maxLength: 10, placeholder: "10 digit angka" },
        { name: "wa_number", label: "Nomor WhatsApp", placeholder: "0812xxxxxxxx" },
        { name: "account_type", label: "Tipe akun", type: "select", options: ACCOUNT_TYPES, required: true },
        { name: "account_status", label: "Status akun", type: "select", options: ACCOUNT_STATUS, required: true },
        {
          name: "education_level",
          label: "Jenjang",
          type: "select",
          options: LEVELS,
          hint: "Hanya sd/smp/sma. Kosong berarti belum ditentukan.",
        },
        { name: "school_id", label: "School ID", placeholder: "uuid sekolah", hint: "Kosongkan bila akun tidak tertaut sekolah." },
        { name: "is_managed", label: "Dikelola sekolah", type: "boolean" },
        { name: "is_subscribed", label: "Berlangganan", type: "boolean" },
        { name: "is_verified", label: "Terverifikasi", type: "boolean" },
      ]}
    />
  );
}
