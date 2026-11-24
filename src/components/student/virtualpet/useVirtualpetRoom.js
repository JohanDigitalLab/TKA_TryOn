"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { bootstrapVirtualpet, settingsVirtualpet, adoptVirtualpet, feedVirtualpet, startVirtualpet, finishVirtualpet } from "@/app/actions/virtualpet";
import { createVirtualpetClient, mapPet } from "@/lib/student/virtualpet-client";

export default function useVirtualpetRoom() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tips, setTips] = useState(null);
  const [hideTips, setHideTips] = useState(false);
  const [result, setResult] = useState(null);
  const lock = useRef(false);
  const latest = useRef(null);
  const tipsSeen = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const client = useRef(null);
  const owner = useRef(null);
  const invalidate = useCallback(() => {
    generation.current += 1;
    latest.current = null;
    tipsSeen.current = false;
    client.current = null;
    owner.current = null;
    setState(null);
    setTips(null);
    setResult(null);
    setError("Sesi atau akun berubah. Tekan Coba lagi untuk memuat data akun saat ini.");
  }, []);

  const run = useCallback((action, payload = {}) => {
    if (lock.current) return Promise.resolve(null);
    lock.current = true;
    setBusy(true);
    setError("");
    const version = generation.current;
    if (!client.current) client.current = createVirtualpetClient({
      getSession: async () => {
        const response = await supabase.auth.getSession();
        if (!owner.current) owner.current = response.data?.session?.user?.id ?? null;
        return response;
      },
      actions: { bootstrap: bootstrapVirtualpet, settings: settingsVirtualpet, adopt: adoptVirtualpet, feed: feedVirtualpet, start: startVirtualpet, finish: finishVirtualpet },
      onIdentityChange: invalidate,
    });
    return new Promise(resolve => {
      startTransition(async () => {
        try {
          const data = await client.current(action, payload);
          if (!mounted.current || generation.current !== version) return resolve(null);
          latest.current = data;
          setState(data);
          setHideTips(data.settings.SHOW_TIPS === "0");
          if (!tipsSeen.current) {
            tipsSeen.current = true;
            if (data.settings.SHOW_TIPS === "1" && data.tip?.message) setTips(data.tip);
          }
          if (action === "finish") setResult(data);
          resolve(data);
        } catch (failure) {
          if (mounted.current) setError(failure.code === "ACCOUNT_CHANGED" ? "Akun berubah. Tekan Coba lagi untuk memuat data akun saat ini." : "" + failure.message);
          resolve(null);
        } finally {
          lock.current = false;
          if (mounted.current) setBusy(false);
        }
      });
    });
  }, [invalidate]);

  useEffect(() => {
    mounted.current = true;
    const initialize = setTimeout(() => { void run("bootstrap"); }, 0);
    let refreshTimer;
    const refresh = () => {
      if (document.hidden || lock.current || latest.current?.session || !latest.current) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (!lock.current && !latest.current?.session) void run("bootstrap"); }, 150);
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (owner.current && session?.user?.id !== owner.current)) invalidate();
    });
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted.current = false;
      clearTimeout(initialize);
      clearTimeout(refreshTimer);
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [run, invalidate]);

  async function updateTips(checked) {
    const previous = hideTips;
    setHideTips(checked);
    const saved = await run("settings", { settings: { SHOW_TIPS: checked ? "0" : "1" } });
    if (!saved) setHideTips(previous);
  }
  return { pet: state ? mapPet(state) : null, loaded: !!state, session: state?.session,
    profileXp: state?.profile_xp ?? 0, busy, error, tips, hideTips, updateTips,
    dismissTips: () => setTips(null), result, dismissResult: () => setResult(null), run };
}
