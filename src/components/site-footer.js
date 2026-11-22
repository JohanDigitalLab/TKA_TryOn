"use client";

import { useTheme } from "@/components/theme-provider";

export default function SiteFooter() {
  const { theme } = useTheme();
  const light = theme === "light";

  return (
    <footer
      className="border-t border-slate-200 bg-slate-50 text-slate-400"
    >
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-5 py-6 text-xs md:flex-row lg:px-8">
        <p>© 2026 TKA TryOut. All rights reserved.</p>
        <p>SKILL ON • CONFIDENCE ON</p>
      </div>
    </footer>
  );
}
