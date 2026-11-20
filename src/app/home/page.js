"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getHomeHref, HOME_HREF_PROFILE_COLUMNS } from "@/lib/dashboard/home-href.mjs";

export default function HomeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function redirectUser() {
      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;

      if (!userData.user) {
        router.push("/");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select(HOME_HREF_PROFILE_COLUMNS)
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        router.push("/");
        return;
      }

      // Fallback "/" mencegah redirect berputar di rute /home ini.
      router.push(getHomeHref(profile, "/"));
    }

    void redirectUser();
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
