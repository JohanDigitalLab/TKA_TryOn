
"use client";

import { useState } from "react";

const menu = [
  { icon: "◫", label: "Dashboard", active: true },
  { icon: "▤", label: "Bank Soal", section: "KONTEN AKADEMIK" },
  { icon: "⇧", label: "Import Center" },
  { icon: "✦", label: "AI Question Factory" },
  { icon: "✓", label: "Moderasi Guru" },
  { icon: "▥", label: "Paket Simulasi", section: "UJIAN & EVALUASI" },
  { icon: "▣", label: "Hasil Ujian" },
  { icon: "♙", label: "Pengguna & Sekolah", section: "MANAJEMEN" },
  { icon: "⚙", label: "Pengaturan" },
];

const stats = [
  { label: "Total Bank Soal", value: "—", note: "Menunggu koneksi database", icon: "▤" },
  { label: "Menunggu Telaah", value: "—", note: "Antrean moderasi guru", icon: "◷" },
  { label: "Soal Disetujui", value: "—", note: "Siap masuk bank aktif", icon: "✓" },
  { label: "Batch Impor", value: "—", note: "Riwayat unggahan", icon: "⇧" },
];

export default function AdminDashboard() {
  const [activeMenu, setActiveMenu] = useState("Dashboard");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 md:flex">
      <aside className="w-full bg-slate-950 text-white md:min-h-screen md:w-64 md:shrink-0">
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold">
              T
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide">TKA TryOn</h1>
              <p className="text-xs text-slate-400">SKILL ON • CONFIDENCE ON</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-5">
          <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-slate-400">AREA KERJA</p>
            <p className="mt-1 font-semibold">Super Admin</p>
            <p className="text-xs text-slate-400">TKA TryOn Platform</p>
          </div>

          <nav className="space-y-1">
            {menu.map((item) => (
              <div key={item.label}>
                {item.section && (
                  <p className="mb-2 mt-5 px-3 text-[10px] font-bold tracking-widest text-slate-500">
                    {item.section}
                  </p>
                )}
                <button
                  onClick={() => setActiveMenu(item.label)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    activeMenu === item.label
                      ? "bg-blue-600 font-semibold text-white"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="w-5 text-center text-lg">{item.icon}</span>
                  {item.label}
                  {item.label === "Moderasi Guru" && (
                    <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                      Review
                    </span>
                  )}
                </button>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-white/10 px-6 py-5">
          <p className="text-xs text-slate-500">TKA TryOn Administration</p>
          <p className="mt-1 text-xs text-slate-400">Platform v1.0</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div>
            <p className="text-xs text-slate-400">ADMINISTRATION / OVERVIEW</p>
            <h2 className="mt-1 text-xl font-bold">Dashboard Admin</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              ● Platform Workspace
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
              A
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-7 p-5 md:p-8">
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">
                  Selamat datang, Admin!
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Pusat kendali konten akademik dan operasional TKA TryOn.
                </p>
              </div>
              <span className="text-xs text-slate-400">
                Data statistik belum terhubung
              </span>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-700">
                    {stat.icon}
                  </span>
                </div>
                <p className="mt-4 text-3xl font-bold text-slate-900">{stat.value}</p>
                <p className="mt-1 text-xs text-slate-400">{stat.note}</p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-800 p-6 text-white shadow-sm lg:col-span-2">
              <p className="text-xs font-semibold tracking-widest text-blue-200">
                ACADEMIC CONTENT MANAGEMENT
              </p>
              <h3 className="mt-3 max-w-xl text-2xl font-bold">
                Bangun bank soal berkualitas bersama AI dan Guru.
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100">
                Kelola soal, stimulus, kunci jawaban, pembahasan, dan proses
                telaah akademik dalam satu ekosistem terintegrasi.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setActiveMenu("Import Center")}
                  className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-50"
                >
                  Buka Import Center →
                </button>
                <button
                  onClick={() => setActiveMenu("AI Question Factory")}
                  className="rounded-lg border border-white/30 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
                >
                  AI Question Factory
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-800">Status Pengembangan</p>
              <div className="mt-5 space-y-4">
                {[
                  ["Database Foundation", "Selesai", "bg-emerald-500"],
                  ["Question Bank Engine", "Selesai", "bg-emerald-500"],
                  ["Import Center", "Dalam pengembangan", "bg-amber-500"],
                  ["Moderasi Guru", "Direncanakan", "bg-slate-300"],
                  ["Simulasi Terintegrasi", "Direncanakan", "bg-slate-300"],
                ].map(([name, status, color]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-600">{name}</span>
                      <span className="text-slate-400">{status}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                      <div className={`h-1.5 w-full rounded-full ${color}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-slate-900">Akses Cepat</h3>
              <p className="mt-1 text-sm text-slate-500">
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
                  onClick={() => setActiveMenu(title)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
                >
                  <span className="text-2xl text-blue-700">{icon}</span>
                  <h4 className="mt-3 font-bold text-slate-800">{title}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>
                  <p className="mt-4 text-xs font-semibold text-blue-700">Buka area →</p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-800">Workspace Aktif</h3>
            <p className="mt-2 text-sm text-slate-500">
              Menu terpilih: <span className="font-semibold text-blue-700">{activeMenu}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Modul ini akan dihubungkan ke halaman dan layanan database pada tahap pengembangan berikutnya.
            </p>
          </section>

          <footer className="border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
            © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
          </footer>
        </div>
      </main>
    </div>
  );
}
