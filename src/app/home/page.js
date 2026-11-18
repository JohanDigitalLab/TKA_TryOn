"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getDashboardPath(profile) {
  if (profile?.is_subscribed === false) return "/subscription";
  if (profile?.account_type === "STUDENT") {
    return profile.is_managed === true ? "/mstudent" : "/student";
  }
  if (profile?.account_type === "SCHOOL") return "/school";
  if (profile?.account_type === "ADMIN") return "/admin";
  return "/";
}

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
        .select("is_subscribed, account_type, is_managed")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (!active) return;
      if (error) {
        router.push("/");
        return;
      }

      router.push(getDashboardPath(profile));
    }

    void redirectUser();
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
