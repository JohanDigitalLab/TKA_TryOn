"use client";

import { usePathname } from "next/navigation";

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/home") return null;

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-5 py-6 text-xs text-slate-400 md:flex-row lg:px-8">
        <p>© 2026 TKA TryOn. All rights reserved.</p>
        <p>SKILL ON • CONFIDENCE ON</p>
      </div>
    </footer>
  );
}
