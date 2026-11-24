"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PortalHeader from "@/components/portal-header";

/** Portal header yang sama dengan dashboard siswa, dipakai oleh halaman game. */
export default function GameHeader() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("Siswa");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadName() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!mounted || !userData.user) return;
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", userData.user.id)
          .maybeSingle();
        if (mounted && profileData?.full_name) {
          setDisplayName(profileData.full_name);
        }
      } catch {
        // Header tetap memakai nama bawaan bila profil tidak tersedia.
      }
    }

    void loadName();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/");
    }
  }

  return (
    <PortalHeader
      displayName={displayName}
      signingOut={signingOut}
      onSignOut={handleSignOut}
    />
  );
}
