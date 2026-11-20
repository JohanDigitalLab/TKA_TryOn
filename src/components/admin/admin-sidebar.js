"use client";

import { useRouter } from "next/navigation";
import BrandLogo from "@/components/brand-logo";

// Satu sumber kebenaran menu sidebar admin.
// item.href  -> navigasi rute; item.section -> judul grup; sisanya view internal.
export const ADMIN_MENU = [
  { icon: "◫", label: "Dashboard" },
  { icon: "▤", label: "Bank Soal", section: "KONTEN AKADEMIK", href: "/admin/questions" },
  { icon: "⇧", label: "Import Center", href: "/admin/import" },
  { icon: "✦", label: "AI Question Factory" },
  { icon: "✓", label: "Moderasi Guru" },
  { icon: "▥", label: "Paket Simulasi", section: "UJIAN & EVALUASI" },
  { icon: "▣", label: "Hasil Ujian" },
  { icon: "☰", label: "Pengguna", section: "MASTER DATA", href: "/admin/master/users" },
  { icon: "▦", label: "Mata Pelajaran", href: "/admin/master/subjects" },
  { icon: "⊞", label: "Tema dan Topik", href: "/admin/master/topics" },
  { icon: "⌂", label: "Sekolah", href: "/admin/master/schools" },
  { icon: "◈", label: "Tipe Sekolah", href: "/admin/master/school-types" },
  { icon: "≡", label: "Jenjang Pendidikan", href: "/admin/master/education-levels" },
  { icon: "♙", label: "Manajemen Admin", section: "MANAJEMEN" },
  { icon: "⚙", label: "Pengaturan" },
];

export default function AdminSidebar({ active, onSelect }) {
  const router = useRouter();

  return (
    <aside className="hidden w-64 shrink-0 bg-slate-950 text-white lg:block lg:min-h-screen">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-12 w-14" />

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
          {ADMIN_MENU.map((item) => (
            <div key={item.label}>
              {item.section && (
                <p className="mb-2 mt-5 px-3 text-[10px] font-bold tracking-widest text-slate-500">
                  {item.section}
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  if (item.href) {
                    router.push(item.href);
                    return;
                  }
                  onSelect?.(item.label);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  active === item.label || active === `Master: ${item.label}`
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
  );
}
