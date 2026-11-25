
"use client";

import BrandLogo from "@/components/brand-logo";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ======================================================
// MENU ADMIN
// ======================================================

const menu = [
  { icon: "◫", label: "Dashboard" },
  { icon: "▤", label: "Bank Soal", section: "KONTEN AKADEMIK" },
  { icon: "⇧", label: "Import Center" },
  { icon: "✦", label: "AI Question Factory" },
  { icon: "✓", label: "Moderasi Guru" },
  { icon: "▥", label: "Paket Simulasi", section: "UJIAN & EVALUASI" },
  { icon: "▣", label: "Hasil Ujian" },
  { icon: "♙", label: "Pengguna & Sekolah", section: "MANAJEMEN" },
  { icon: "♙", label: "Manajemen Admin" },
  { icon: "▤", label: "Langganan" },
  { icon: "⚙", label: "Pengaturan" },
];

const stats = [
  {
    label: "Total Bank Soal",
    value: "—",
    note: "Menunggu koneksi database",
    icon: "▤",
  },
  {
    label: "Menunggu Telaah",
    value: "—",
    note: "Antrean moderasi",
    icon: "◷",
  },
  {
    label: "Soal Disetujui",
    value: "—",
    note: "Siap masuk bank aktif",
    icon: "✓",
  },
  {
    label: "Batch Impor",
    value: "—",
    note: "Riwayat unggahan",
    icon: "⇧",
  },
];

// ======================================================
// DAFTAR PERMISSION ADMIN OPERATOR
// ======================================================

const permissionGroups = [
  {
    title: "Onboarding Sekolah",
    items: [{ code: "school_onboarding.review", label: "Review Pengajuan Sekolah", description: "Melihat pengajuan serta menyetujui/menolak sekolah. Tidak memberi akses tiket/pesan platform atau pemulihan koordinator." }],
  },
  {
    title: "Bank Soal",
    items: [
      {
        code: "bank_soal.view",
        label: "Melihat Bank Soal",
        description: "Melihat daftar dan detail soal.",
      },
      {
        code: "bank_soal.review",
        label: "Telaah Soal",
        description: "Meninjau isi dan kualitas soal.",
      },
      {
        code: "bank_soal.edit",
        label: "Edit Soal",
        description: "Membuat revisi dan versi soal baru.",
      },
      {
        code: "bank_soal.moderate",
        label: "Moderasi Soal",
        description: "Melakukan proses moderasi akademik.",
      },
      {
        code: "bank_soal.publish",
        label: "Publikasi Soal",
        description: "Menerbitkan soal yang telah disetujui.",
      },
      {
        code: "bank_soal.import",
        label: "Import Soal",
        description: "Menggunakan Import Center.",
      },
    ],
  },
  {
    title: "Manajemen Profil Akademik",
    items: [
      {
        code: "education_level.review",
        label: "Telaah Perubahan Jenjang Pendidikan",
        description:
          "Meninjau, menyetujui, atau menolak pengajuan perubahan jenjang pendidikan siswa.",
      },
    ],
  },
];

export default function AdminDashboard() {
  const router = useRouter();
  // ====================================================
  // STATE
  // ====================================================

  const [activeMenu, setActiveMenu] = useState("Dashboard");

  const [candidates, setCandidates] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  const [search, setSearch] = useState("");

  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ====================================================
  // MEMUAT DAFTAR AKUN
  // ====================================================

  const loadCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "admin_operator_list_candidates"
    );

    if (rpcError) {
      setError(rpcError.message);
      setCandidates([]);
      setLoadingCandidates(false);
      return;
    }

    setCandidates(data || []);
    setLoadingCandidates(false);
  }, []);

  function selectMenu(label) {
    if (label === "Langganan") { router.push("/admin/subscriptions"); return; }
    if (label === "Pengguna & Sekolah") { router.push("/admin/schools"); return; }
    setActiveMenu(label);
    if (label === "Manajemen Admin") {
      void loadCandidates();
    }
  }

  // ====================================================
  // PENCARIAN AKUN
  // ====================================================

  const filteredCandidates = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return candidates;

    return candidates.filter((user) => {
      const name = (user.full_name || "").toLowerCase();
      const id = (user.user_id || "").toLowerCase();

      return name.includes(keyword) || id.includes(keyword);
    });
  }, [candidates, search]);

  // ====================================================
  // MEMILIH ADMIN OPERATOR
  // ====================================================

  function selectOperator(user) {
    setSelectedUser(user);
    setSelectedPermissions(user.permissions || []);
    setError("");
    setSuccess("");
  }

  // ====================================================
  // MENGUBAH PERMISSION
  // ====================================================

  function togglePermission(code) {
    setSelectedPermissions((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code]
    );
  }

  // ====================================================
  // MENYIMPAN PENGATURAN ADMIN OPERATOR
  // ====================================================

  async function saveOperator() {
    if (!selectedUser) {
      setError("Pilih akun terlebih dahulu.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const { data, error: rpcError } = await supabase.rpc(
      "admin_operator_set_access",
      {
        p_user_id: selectedUser.user_id,
        p_is_active: true,
        p_permissions: selectedPermissions,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    const savedPermissions =
      data?.permissions || selectedPermissions;

    setSelectedUser((current) =>
      current
        ? {
            ...current,
            is_operator: true,
            is_active: true,
            permissions: savedPermissions,
          }
        : null
    );

    setSelectedPermissions(savedPermissions);

    setSuccess("Pengaturan Admin Operator berhasil disimpan.");

    await loadCandidates();

    setSaving(false);
  }

  // ====================================================
  // MENONAKTIFKAN ADMIN OPERATOR
  // ====================================================

  async function disableOperator(user) {
    const confirmed = window.confirm(
      `Nonaktifkan Admin Operator ${user.full_name || user.user_id}?`
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");
    setSaving(true);

    const { error: rpcError } = await supabase.rpc(
      "admin_operator_set_access",
      {
        p_user_id: user.user_id,
        p_is_active: false,
        p_permissions: [],
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    if (selectedUser?.user_id === user.user_id) {
      setSelectedUser({
        ...user,
        is_operator: true,
        is_active: false,
        permissions: [],
      });

      setSelectedPermissions([]);
    }

    setSuccess("Admin Operator berhasil dinonaktifkan.");

    await loadCandidates();

    setSaving(false);
  }

  // ====================================================
  // TAMPILAN DASHBOARD UTAMA
  // ====================================================

  function renderDashboard() {
    return (
      <div className="space-y-7">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-2xl font-bold text-ink">
                Selamat datang, Admin!
              </h3>

              <p className="mt-1 text-sm text-ink-muted">
                Pusat kendali konten akademik dan operasional TKA TryOn.
              </p>
            </div>

            <span className="text-xs text-ink-muted">
              Data statistik belum terhubung
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink-muted">
                  {stat.label}
                </p>

                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-xl text-accent-ink">
                  {stat.icon}
                </span>
              </div>

              <p className="mt-4 text-3xl font-bold text-ink">
                {stat.value}
              </p>

              <p className="mt-1 text-xs text-ink-muted">
                {stat.note}
              </p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-6 text-on-primary shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold tracking-widest text-on-primary">
              ACADEMIC CONTENT MANAGEMENT
            </p>

            <h3 className="mt-3 max-w-xl text-2xl font-bold">
              Bangun bank soal berkualitas bersama AI dan Guru.
            </h3>

            <p className="mt-3 max-w-xl text-sm leading-6 text-on-primary">
              Kelola soal, stimulus, kunci jawaban, pembahasan, dan proses
              telaah akademik dalam satu ekosistem terintegrasi.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  router.push("/admin/import");
                }}
                className="rounded-lg bg-surface px-4 py-2.5 text-sm font-semibold text-accent-strong hover:bg-accent-soft"
              >
                Buka Import Center →
              </button>

              <button
                onClick={() => setActiveMenu("AI Question Factory")}
                className="rounded-lg border border-on-primary/30 px-4 py-2.5 text-sm font-semibold text-on-primary hover:bg-surface/10"
              >
                AI Question Factory
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <p className="text-sm font-semibold text-ink-body">
              Status Pengembangan
            </p>

            <div className="mt-5 space-y-4">
              {[
                ["Database Foundation", "Selesai", "bg-success"],
                ["Question Bank Engine", "Selesai", "bg-success"],
                ["Import Center", "Dalam pengembangan", "bg-warning"],
                ["Moderasi Guru", "Direncanakan", "bg-surface-strong"],
                ["Simulasi Terintegrasi", "Direncanakan", "bg-surface-strong"],
              ].map(([name, status, color]) => (
                <div key={name}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-ink-secondary">
                      {name}
                    </span>

                    <span className="text-ink-muted">
                      {status}
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 rounded-full bg-surface-raised">
                    <div className={`h-1.5 w-full rounded-full ${color}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h3 className="text-lg font-bold text-ink">
              Akses Cepat
            </h3>

            <p className="mt-1 text-sm text-ink-muted">
              Pilih area kerja yang ingin dikelola.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["⇧", "Import Center", "Unggah dan validasi workbook TQBS."],
              ["✦", "AI Question Factory", "Produksi soal, kunci, dan pembahasan."],
              ["✓", "Moderasi Guru", "Telaah dan koreksi soal akademik."],
              ["▤", "Bank Soal", "Kelola koleksi soal aktif dan versinya."],
            ].map(([icon, title, desc]) => (
              <button
                key={title}
                onClick={() => {
                  if (title === "Bank Soal") {
                    router.push("/admin/questions");
                    return;
                  }

                  if (title === "Import Center") {
                    router.push("/admin/import");
                    return;
                  }

                  selectMenu(title);
                }}
                className="rounded-2xl border border-line bg-surface p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-accent hover:shadow-md"
              >
                <span className="text-2xl text-accent-ink">
                  {icon}
                </span>

                <h4 className="mt-3 font-bold text-ink-body">
                  {title}
                </h4>

                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  {desc}
                </p>

                <p className="mt-4 text-xs font-semibold text-accent-ink">
                  Buka area →
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h3 className="font-bold text-ink-body">
            Workspace Aktif
          </h3>

          <p className="mt-2 text-sm text-ink-muted">
            Menu terpilih:{" "}
            <span className="font-semibold text-accent-ink">
              {activeMenu}
            </span>
          </p>

          <p className="mt-1 text-xs text-ink-muted">
            Modul ini akan dihubungkan ke halaman dan layanan database pada
            tahap pengembangan berikutnya.
          </p>
        </section>
      </div>
    );
  }

  // ====================================================
  // TAMPILAN MANAJEMEN ADMIN
  // ====================================================

  function renderAdminManagement() {
    return (
      <div className="space-y-6">
        <section>
          <p className="text-xs font-bold tracking-widest text-accent-ink">
            SYSTEM MANAGEMENT
          </p>

          <h3 className="mt-2 text-2xl font-bold text-ink">
            Manajemen Admin
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
            Pilih akun pengguna yang sudah terdaftar, aktifkan sebagai Admin
            Operator, dan atur kewenangan berdasarkan kebutuhan pekerjaan.
          </p>
        </section>

        {error && (
          <div className="rounded-xl border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">
            <strong>Terjadi kesalahan:</strong> {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-success-line bg-success-soft p-4 text-sm text-success-ink">
            {success}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-5">
          {/* DAFTAR AKUN */}

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm xl:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-ink">
                Akun Terdaftar
              </h4>

              <button
                onClick={loadCandidates}
                disabled={loadingCandidates || saving}
                className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface-muted disabled:opacity-50"
              >
                {loadingCandidates ? "Memuat..." : "↻ Muat ulang"}
              </button>
            </div>

            <p className="mt-1 text-xs text-ink-muted">
              Daftar ini hanya dapat diakses oleh Super Admin.
            </p>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau ID akun..."
              className="mt-4 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-line"
            />

            <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto">
              {loadingCandidates ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  Memuat daftar akun...
                </p>
              ) : filteredCandidates.length === 0 ? (
                <p className="rounded-lg bg-surface-muted p-5 text-center text-sm text-ink-muted">
                  Tidak ada akun yang ditemukan.
                </p>
              ) : (
                filteredCandidates.map((user) => {
                  const selected =
                    selectedUser?.user_id === user.user_id;

                  return (
                    <button
                      key={user.user_id}
                      onClick={() => selectOperator(user)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selected
                          ? "border-accent bg-accent-soft"
                          : "border-line hover:border-accent hover:bg-surface-muted"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink-body">
                            {user.full_name || "Tanpa nama"}
                          </p>

                          <p className="mt-1 truncate text-[10px] text-ink-muted">
                            {user.user_id}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${
                            user.is_active
                              ? "bg-success-tint text-success-ink"
                              : user.is_operator
                              ? "bg-warning-tint text-warning-ink"
                              : "bg-surface-raised text-ink-muted"
                          }`}
                        >
                          {user.is_active
                            ? "AKTIF"
                            : user.is_operator
                            ? "NONAKTIF"
                            : "PENGGUNA"}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-ink-muted">
                        Status akun: {user.account_status || "Tidak tersedia"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* PENGATURAN PERMISSION */}

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm xl:col-span-3">
            {!selectedUser ? (
              <div className="flex min-h-[350px] flex-col items-center justify-center text-center">
                <span className="text-4xl text-inverse-muted">
                  ♙
                </span>

                <h4 className="mt-4 font-bold text-ink-body">
                  Pilih akun pengguna
                </h4>

                <p className="mt-2 max-w-sm text-sm leading-6 text-ink-muted">
                  Pilih akun dari daftar di sebelah kiri untuk mengatur status
                  Admin Operator dan hak aksesnya.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-5">
                  <div>
                    <p className="text-xs font-bold tracking-widest text-accent-ink">
                      PENGATURAN AKUN
                    </p>

                    <h4 className="mt-2 text-xl font-bold text-ink">
                      {selectedUser.full_name || "Tanpa nama"}
                    </h4>

                    <p className="mt-1 break-all text-xs text-ink-muted">
                      {selectedUser.user_id}
                    </p>
                  </div>

                  <span
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${
                      selectedUser.is_active
                        ? "bg-success-soft text-success-ink"
                        : "bg-surface-raised text-ink-secondary"
                    }`}
                  >
                    {selectedUser.is_active
                      ? "OPERATOR AKTIF"
                      : "BELUM AKTIF"}
                  </span>
                </div>

                <div className="mt-5">
                  <h5 className="font-bold text-ink-body">
                    Hak Akses Admin Operator
                  </h5>

                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Centang kewenangan yang akan diberikan kepada akun ini.
                    Super Admin tetap memiliki seluruh hak akses secara
                    otomatis dan tidak diatur melalui daftar ini.
                  </p>
                </div>

                <div className="mt-4 rounded-xl border border-accent-line bg-accent-soft p-4 text-sm text-accent-strong">
                  Untuk alur impor sampai terbit, berikan seluruh izin Bank Soal:
                  melihat, telaah, edit, moderasi, publikasi, dan impor.
                  Setiap izin tetap dapat diberikan terpisah sesuai tanggung jawab operator.
                  Soal impor wajib ditelaah dan disetujui sebelum diterbitkan.
                </div>

                {permissionGroups.map((group) => (
                  <div key={group.title} className="mt-5">
                    <h6 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">
                      {group.title}
                    </h6>

                    <div className="space-y-2">
                      {group.items.map((permission) => (
                        <label
                          key={permission.code}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 transition hover:border-accent hover:bg-accent-soft/50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(
                              permission.code
                            )}
                            onChange={() =>
                              togglePermission(permission.code)
                            }
                            className="mt-1 h-4 w-4 accent-accent"
                          />

                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-ink-body">
                              {permission.label}
                            </span>

                            <span className="mt-1 block text-xs text-ink-muted">
                              {permission.description}
                            </span>

                            <span className="mt-1 block text-[10px] text-ink-muted">
                              {permission.code}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="mt-6 rounded-xl bg-accent-soft p-4">
                  <p className="text-xs leading-5 text-accent-strong">
                    <strong>Catatan:</strong> Menyimpan pengaturan akan
                    mengaktifkan akun sebagai Admin Operator. Jika operator
                    dinonaktifkan, seluruh permission akan dicabut.
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    onClick={saveOperator}
                    disabled={saving}
                    className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-on-primary transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving
                      ? "Menyimpan..."
                      : "Simpan & Aktifkan Operator"}
                  </button>

                  {selectedUser.is_operator && selectedUser.is_active && (
                    <button
                      onClick={() => disableOperator(selectedUser)}
                      disabled={saving}
                      className="rounded-lg border border-danger-line px-5 py-3 text-sm font-bold text-danger-ink transition hover:bg-danger-soft disabled:opacity-50"
                    >
                      Nonaktifkan Operator
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* PRINSIP KEAMANAN */}

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h4 className="font-bold text-ink">
            Prinsip Keamanan Manajemen Admin
          </h4>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [
                "Akses Terbatas",
                "Daftar akun hanya dapat diakses Super Admin melalui RPC.",
              ],
              [
                "Permission Individual",
                "Setiap operator dapat memiliki kombinasi kewenangan berbeda.",
              ],
              [
                "Audit Log",
                "Perubahan status dan permission dicatat dalam database.",
              ],
            ].map(([title, description]) => (
              <div key={title} className="rounded-xl bg-surface-muted p-4">
                <p className="text-sm font-bold text-ink-body">
                  {title}
                </p>

                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ====================================================
  // RENDER HALAMAN
  // ====================================================

  return (
    <div className="min-h-screen bg-surface-muted text-ink-body lg:flex">
      {/* SIDEBAR */}

      <aside className="hidden w-64 shrink-0 bg-inverse-deep text-on-inverse lg:block lg:min-h-screen">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-12 w-14" />

            <div>
              <h1 className="text-lg font-bold tracking-wide">
                TKA TryOn
              </h1>

              <p className="text-xs text-ink-muted">
                SKILL ON • CONFIDENCE ON
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 py-5">
          <div className="mb-5 rounded-xl border border-white/10 bg-surface/5 p-3">
            <p className="text-xs text-ink-muted">
              AREA KERJA
            </p>

            <p className="mt-1 font-semibold">
              Super Admin
            </p>

            <p className="text-xs text-ink-muted">
              TKA TryOn Platform
            </p>
          </div>

          <nav className="space-y-1">
            {menu.map((item) => (
              <div key={item.label}>
                {item.section && (
                  <p className="mb-2 mt-5 px-3 text-[10px] font-bold tracking-widest text-ink-muted">
                    {item.section}
                  </p>
                )}

                <button
                  onClick={() => {
                    if (item.label === "Bank Soal") {
                      router.push("/admin/questions");
                      return;
                    }

                    if (item.label === "Import Center") {
                      router.push("/admin/import");
                      return;
                    }

                    selectMenu(item.label);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    activeMenu === item.label
                      ? "bg-primary font-semibold text-on-primary"
                      : "text-inverse-muted hover:bg-surface/10 hover:text-on-inverse"
                  }`}
                >
                  <span className="w-5 text-center text-lg">
                    {item.icon}
                  </span>

                  {item.label}

                  {item.label === "Moderasi Guru" && (
                    <span className="ml-auto rounded-full bg-warning/20 px-2 py-0.5 text-[10px] text-warning-ink">
                      Review
                    </span>
                  )}
                </button>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 px-6 py-5">
          <p className="text-xs text-ink-muted">
            TKA TryOn Administration
          </p>

          <p className="mt-1 text-xs text-ink-muted">
            Platform v1.0
          </p>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4 md:px-8">
          <div>
            <p className="text-xs text-ink-muted">
              ADMINISTRATION / {activeMenu.toUpperCase()}
            </p>

            <h2 className="mt-1 text-xl font-bold">
              {activeMenu === "Manajemen Admin"
                ? "Manajemen Admin"
                : "Dashboard Admin"}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success-ink">
              ● Platform Workspace
            </span>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-tint font-bold text-accent-ink">
              A
            </div>
          </div>
        </header>

        <nav aria-label="Navigasi admin layar kecil" className="flex flex-wrap gap-2 border-b border-line bg-surface px-5 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => selectMenu("Dashboard")}
            aria-pressed={activeMenu === "Dashboard"}
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft"
          >
            Dashboard
          </button>
          <button type="button" onClick={() => router.push("/admin/schools")} className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft">Review sekolah</button>
          <button type="button" onClick={() => router.push("/school")} className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft">Portal sekolah</button>
          <button type="button" onClick={() => router.push("/admin/questions")} className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft">
            Bank Soal
          </button>
          <button type="button" onClick={() => router.push("/admin/import")} className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft">
            Import Center
          </button>
          <button
            type="button"
            onClick={() => selectMenu("Manajemen Admin")}
            aria-pressed={activeMenu === "Manajemen Admin"}
            className="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-body hover:bg-accent-soft"
          >
            Manajemen Admin
          </button>
        </nav>

        <div className="mx-auto max-w-7xl space-y-7 p-5 md:p-8">
          {activeMenu === "Dashboard" ? (
            renderDashboard()
          ) : activeMenu === "Manajemen Admin" ? (
            renderAdminManagement()
          ) : (
            <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h3 className="text-xl font-bold text-ink">
                {activeMenu}
              </h3>

              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Modul ini akan dihubungkan ke halaman dan layanan database
                pada tahap pengembangan berikutnya.
              </p>
            </section>
          )}

          <footer className="border-t border-line pt-5 text-center text-xs text-ink-muted">
            © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
          </footer>
        </div>
      </main>
    </div>
  );
}
