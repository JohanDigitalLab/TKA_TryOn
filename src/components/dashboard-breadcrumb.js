"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getHomeHref, HOME_HREF_PROFILE_COLUMNS } from "@/lib/dashboard/home-href.mjs";

/**
 * Breadcrumb sederhana: "Home / <halaman saat ini>".
 * Tautan Home ditentukan getHomeHref(profil) — /student, /school,
 * atau /admin — dengan fallback /home selama profil belum dimuat
 * atau tidak dikenali.
 */
export default function DashboardBreadcrumb({ current }) {
  const [href, setHref] = useState("/home");

  useEffect(() => {
    let active = true;

    async function resolveHomeHref() {
      try {
        // await lebih dulu agar tidak ada setState sinkron di body effect.
        await Promise.resolve();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select(HOME_HREF_PROFILE_COLUMNS)
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;

        setHref(getHomeHref(profile));
      } catch {
        // Fallback tetap /home; jangan ganggu tampilan halaman.
      }
    }

    void resolveHomeHref();
    return () => {
      active = false;
    };
  }, []);

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600"
    >
      <Link href={href} className="rounded-md px-1 py-0.5 text-blue-700 hover:underline">
        Home
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="text-slate-800">
        {current}
      </span>
    </nav>
  );
}
