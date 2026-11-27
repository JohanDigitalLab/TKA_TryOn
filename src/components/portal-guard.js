"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { hasSuperAdminRole } from "@/lib/dashboard/global-role.mjs";
import {
  getHomeHref,
  HOME_HREF_PROFILE_COLUMNS,
} from "@/lib/dashboard/home-href.mjs";

/**
 * Guard area portal (admin / school / student) di sisi klien.
 *
 * Aturan:
 * 1. Belum login (atau verifikasi sesi gagal) -> halaman utama "/".
 * 2. allowedTypes diisi dan account_type profil tidak termasuk daftar itu ->
 *    dashboard milik akun tersebut menurut getHomeHref(profil).
 * 3. allowedTypes kosong -> cukup terverifikasi login (mis. seluruh rute /student).
 *
 * Catatan rendering: selama "checking" children tetap dirender tetapi ditutupi
 * overlay opaque. Menyembunyikan children sepenuhnya membuat shell statis rute
 * dinamis kosong sehingga build Cache Components gagal
 * (blocking-prerender-metadata-runtime). Saat akses ditolak, children dilepas.
 *
 * Redirect memakai window.location.replace agar layout tidak menarik
 * next/navigation ke shell statis. Otorisasi sebenarnya tetap milik PostgreSQL
 * (RPC + RLS); guard ini lapisan UX.
 *
 * @param {{children: import("react").ReactNode, allowedTypes?: string[]}} props
 */
export default function PortalGuard({ children, allowedTypes }) {
  const [access, setAccess] = useState("checking"); // checking | allowed | denied
  // String stabil agar effect tidak berjalan ulang setiap render.
  const types = (Array.isArray(allowedTypes) ? allowedTypes : [])
    .map((type) => String(type || "").toUpperCase())
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    let active = true;
    const wanted = types ? types.split(",") : null;

    async function checkAccess() {
      try {
        // await lebih dulu agar tidak ada setState sinkron di body effect.
        await Promise.resolve();
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;

        if (error || !data?.user) {
          setAccess("denied");
          window.location.replace("/");
          return;
        }

        if (!wanted) {
          setAccess("allowed");
          return;
        }

        // Global superadmin is independent of the underlying student profile.
        // Only the admin portal accepts this role override.
        if (wanted.includes("ADMIN")) {
          const isSuperAdmin = await hasSuperAdminRole(supabase, data.user.id);
          if (!active) return;
          if (isSuperAdmin) {
            setAccess("allowed");
            return;
          }
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select(HOME_HREF_PROFILE_COLUMNS)
          .eq("id", data.user.id)
          .maybeSingle();
        if (!active) return;

        const accountType = String(
          profileError ? "" : profile?.account_type || "",
        ).toUpperCase();

        if (wanted.includes(accountType)) {
          setAccess("allowed");
          return;
        }

        setAccess("denied");
        window.location.replace(getHomeHref(profile));
      } catch {
        if (!active) return;
        setAccess("denied");
        window.location.replace("/");
      }
    }

    void checkAccess();
    return () => {
      active = false;
    };
  }, [types]);

  if (access === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-5 text-center">
        <p role="status" className="font-semibold text-slate-600">
          Mengalihkan…
        </p>
      </main>
    );
  }

  return (
    <>
      {children}
      {access === "checking" && (
        <main
          className="fixed inset-0 z-50 grid place-items-center bg-slate-50"
          aria-busy="true"
        >
          <p role="status" className="font-semibold text-slate-600">
            Memeriksa akses…
          </p>
        </main>
      )}
    </>
  );
}
