"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { bootstrapMapadventure, settingsMapadventure, materialMapadventure, readCompleteMapadventure, startMapadventure, answerMapadventure, timeoutMapadventure, nextMapadventure, previousMapadventure, useToolMapadventure, buyMapadventure, mapadventure_complete_node, mapadventure_complete_island, mapadventure_open_gatcha } from "@/app/actions/mapadventure";
import { createMapadventureClient, openGachaChest } from "@/lib/student/mapadventure-client";

const actions = {
  bootstrap: bootstrapMapadventure, settings: settingsMapadventure, material: materialMapadventure,
  read_complete: readCompleteMapadventure, start: startMapadventure, answer: answerMapadventure,
  timeout: timeoutMapadventure, next: nextMapadventure, previous: previousMapadventure, use_tool: useToolMapadventure, buy: buyMapadventure,
  complete_node: (p, userId) => mapadventure_complete_node(userId, p.nodeId, undefined, undefined, p.attempt_id),
  complete_island: (p, userId) => mapadventure_complete_island(userId, p.islandId),
  gacha: (p, userId) => mapadventure_open_gatcha(userId, p.chestTier, p.nodeId),
};
export default function useMapAdventure() {
  const [state, setState] = useState(null);
  const [selection, setViewSelection] = useState(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const viewKey = useRef(null);
  const setSelection = useCallback(value => {
    setViewSelection(value);
    try { if (viewKey.current) sessionStorage.setItem(viewKey.current, JSON.stringify(value)); } catch { /* Optional navigation memory. */ }
  }, []);
  const closeQuiz = useCallback(() => setQuizOpen(false), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tips, setTips] = useState(null);
  const [hideTips, setHideTips] = useState(false);
  const [material, setMaterial] = useState(null);
  const [result, setResult] = useState(null);
  const [reward, setReward] = useState(null);
  const lock = useRef(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const owner = useRef(null);
  const client = useRef(null);
  const tipsSeen = useRef(false);
  const invalidate = useCallback(() => {
    generation.current += 1;
    owner.current = null;
    viewKey.current = null;
    setViewSelection(null); setQuizOpen(false);
    client.current = null;
    tipsSeen.current = false;
    setState(null); setTips(null); setMaterial(null); setResult(null); setReward(null); setNotice(""); setHideTips(false);
    setError("Sesi atau akun berubah. Muat ulang data akun saat ini.");
  }, []);
  const run = useCallback((action, payload = {}, context = {}) => {
    if (lock.current) return Promise.resolve(null);
    lock.current = true;
    setBusy(true); setError(""); setNotice("");
    const version = generation.current;
    if (!client.current) client.current = createMapadventureClient({
      getSession: async () => {
        const response = await supabase.auth.getSession();
        if (!owner.current) owner.current = response.data?.session?.user?.id ?? null;
        return response;
      }, actions, onIdentityChange: invalidate,
    });
    const request = client.current;
    return new Promise(resolve => startTransition(async () => {
      try {
        const data = await request(action, payload, context);
        if (!mounted.current || version !== generation.current) return resolve(null);
        const key = `mapadventure-view:${owner.current}:${data.subject_code}`;
        if (viewKey.current !== key) {
          viewKey.current = key;
          let saved = null;
          try { saved = JSON.parse(sessionStorage.getItem(key) || "null"); } catch { /* Ignore invalid navigation memory. */ }
          const savedNode = data.nodes.find(node => node.id === saved?.node && node.theme_id === saved?.island);
          const savedIsland = data.islands.find(island => island.id === saved?.island);
          setViewSelection(savedNode ? { island: savedNode.theme_id, node: savedNode.id } : savedIsland ? { island: savedIsland.id } : null);
          setQuizOpen(false);
        }
        // Loading the map never opens a quiz. Only a matching stage click can.
        if (action === "start") {
          const matches = data.session?.nodeId === payload.nodeId && data.session?.stage === payload.stage;
          setQuizOpen(matches);
          if (matches) { setTips(null); setMaterial(null); setResult(null); setReward(null); }
        }
        if (!data.session) setQuizOpen(false);
        setState(data); setHideTips(data.settings.SHOW_TIPS === "0");
        setNotice(data.notice || "");
        if (!tipsSeen.current) {
          tipsSeen.current = true;
          if (action !== "start" && data.settings.SHOW_TIPS === "1" && data.tip?.message) setTips(data.tip);
        }
        if (data.material) setMaterial(data.material);
        if (data.result) setResult(data.result);
        if (data.reward) setReward(data.reward);
        resolve(data);
      } catch (failure) {
        if (mounted.current && version === generation.current) {
          setError(failure.message);
          if (action === "start") setQuizOpen(false);
        }
        resolve(null);
      } finally {
        lock.current = false;
        if (mounted.current) setBusy(false);
      }
    }));
  }, [invalidate]);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => { void run("bootstrap"); }, 0);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (owner.current && owner.current !== session?.user?.id)) invalidate();
    });
    return () => { mounted.current = false; generation.current += 1; clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [run, invalidate]);
  async function updateTips(checked) {
    if (lock.current) return;
    const previous = hideTips;
    const version = generation.current;
    setHideTips(checked);
    const saved = await run("settings", { settings: { SHOW_TIPS: checked ? "0" : "1" } });
    if (!saved && version === generation.current) setHideTips(previous);
  }
  const closeFeedback = useCallback(() => { setError(""); setNotice(""); }, []);
  const reportError = useCallback(message => { setNotice(""); setError(message); }, []);
  return { state, busy, error, notice, tips, hideTips, updateTips, run, closeFeedback, reportError,
    selection, setSelection, quizOpen, closeQuiz,
    material, closeMaterial: () => setMaterial(null), result, closeResult: () => setResult(null),
    reward, closeReward: () => setReward(null), closeTips: () => setTips(null),
    openGachaChest: (nodeId, tier) => openGachaChest(run, nodeId, tier) };
}
