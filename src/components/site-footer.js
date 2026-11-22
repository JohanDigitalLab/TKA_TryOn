"use client";

import { useTheme } from "@/components/theme-provider";

export default function SiteFooter() {
  const { theme } = useTheme();
  const light = theme === "light";

  return (
    <footer
      className={`border-t ${
        light
          ? "border-slate-200 bg-slate-50 text-slate-400"
          : "border-white/10 bg-[#10102a] text-white/45"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-5 py-6 text-xs md:flex-row lg:px-8">
        <p>© 2026 TKA TryOn. All rights reserved.</p>
        <p>SKILL ON • CONFIDENCE ON</p>
      </div>
    </footer>
  );
}
