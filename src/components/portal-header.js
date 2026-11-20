"use client";

import Link from "next/link";
import BrandLogo from "@/components/brand-logo";

export default function PortalHeader({ displayName = "Siswa", signingOut = false, onSignOut }) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "S";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 lg:px-8">
        <Link href="/" aria-label="Kembali ke halaman utama TKA TryOn" className="flex items-center gap-3">
          <BrandLogo className="h-12 w-14" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">TKA <span className="text-blue-700">TryOn</span></h1>
            <p className="text-[10px] font-semibold tracking-widest text-slate-500">SKILL ON • CONFIDENCE ON</p>
          </div>
        </Link>
        <nav aria-label="Navigasi portal" className="flex items-center gap-1 sm:gap-2">
          <span aria-label={`Profil ${displayName}`} title={displayName} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700 sm:h-10 sm:w-10">{initials}</span>
          <button type="button" aria-label="Keluar dari akun" onClick={onSignOut} disabled={signingOut} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 sm:px-3 sm:text-sm">{signingOut ? "Keluar…" : "Keluar"}</button>
        </nav>
      </div>
    </header>
  );
}
