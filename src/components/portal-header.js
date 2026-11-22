"use client";

import { useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";

export default function PortalHeader({ displayName = "Siswa", signingOut = false, onSignOut, isManaged = null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "S";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-1 sm:px-5 sm:py-2 lg:px-8">
        <Link href="/" aria-label="Kembali ke halaman utama TKA TryOn" className="flex items-center gap-3">
          <BrandLogo className="h-20 w-25" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">TKA <span className="text-blue-700">TryOn</span></h1>
            <p className="text-[10px] font-semibold tracking-widest text-slate-500">SKILL ON • CONFIDENCE ON</p>
          </div>
        </Link>
        <nav aria-label="Navigasi portal" className="flex items-center gap-1 sm:gap-2">
          <div className="relative">
            <button
              type="button"
              aria-label={`Buka menu profil ${displayName}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-base font-bold text-blue-700 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:h-16 sm:w-16"
            >
              {initials}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                  {displayName}
                </div>
                {isManaged === false && (
                  <Link
                    href="/student/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Profil
                  </Link>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={signingOut}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {signingOut ? "Keluar…" : "Keluar"}
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
