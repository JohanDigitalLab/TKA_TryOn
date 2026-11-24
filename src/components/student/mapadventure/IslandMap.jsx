"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";

export function IslandNavigation({ islands, nodes, selectedId, onSelect, busy }) {
  const list = useRef(null);
  const [arrows, setArrows] = useState({ left: false, right: false });
  const updateArrows = useCallback(() => {
    const element = list.current;
    if (!element) return;
    setArrows({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    function centerActiveIsland() {
      const selected = element.querySelector('[aria-current="true"]');
      if (selected && element.clientWidth > 0) {
        const left = selected.offsetLeft - (element.clientWidth - selected.clientWidth) / 2;
        element.scrollTo({ left: Math.max(0, Math.min(left, element.scrollWidth - element.clientWidth)), behavior: "instant" });
      }
      updateArrows();
    }
    // Tunggu layout pertama selesai; jangan animasikan dari pulau yang salah pada mobile.
    const frame = requestAnimationFrame(centerActiveIsland);
    const observer = new ResizeObserver(centerActiveIsland);
    observer.observe(element);
    const selected = element.querySelector('[aria-current="true"]');
    if (selected) observer.observe(selected);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [selectedId, islands, updateArrows]);

  function scroll(direction) {
    list.current?.scrollBy({ left: direction * list.current.clientWidth, behavior: "smooth" });
  }

  return <nav aria-label="Daftar pulau" className="flex min-w-0 items-center gap-2">
    <button type="button" aria-label="Geser daftar pulau ke kiri" disabled={!arrows.left} onClick={() => scroll(-1)} className="shrink-0 rounded-full border bg-white p-2 shadow-sm disabled:opacity-30 dark:bg-slate-900"><ChevronLeft size={20} /></button>
    <div ref={list} onScroll={updateArrows} className="relative flex min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto py-2 before:mx-auto after:mx-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {islands.map((island, index) => {
        const topics = nodes.filter(node => node.theme_id === island.id);
        const done = topics.filter(node => node.gatekeeper_status === "COMPLETED").length;
        const locked = island.status === "LOCKED";
        return <button key={island.id} type="button" aria-current={selectedId === island.id ? "true" : undefined} disabled={busy || locked} onClick={() => onSelect(island.id)} className={`flex w-full shrink-0 snap-center items-center gap-3 rounded-2xl border-2 p-3 text-left transition sm:w-72 ${selectedId === island.id ? "border-indigo-400 bg-white shadow-md dark:bg-slate-800" : "border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-900"} ${locked ? "opacity-50" : "hover:border-indigo-300"}`}>
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-xl text-white ${locked ? "grayscale" : ""}`}>{["🏝️", "🌋", "🌲", "🏔️"][index % 4]}</span>
          <span className="min-w-0"><span className="block break-words text-sm font-extrabold">{island.theme}</span><span className="mt-1 block text-xs text-slate-500">{locked ? "Selesaikan pulau sebelumnya" : `${done}/${topics.length} topik selesai`}</span></span>
        </button>;
      })}
    </div>
    <button type="button" aria-label="Geser daftar pulau ke kanan" disabled={!arrows.right} onClick={() => scroll(1)} className="shrink-0 rounded-full border bg-white p-2 shadow-sm disabled:opacity-30 dark:bg-slate-900"><ChevronRight size={20} /></button>
  </nav>;
}

export function TopicMap({ topics, busy, onSelect }) {
  const top = 64;
  const row = 144;
  const height = Math.max(200, topics.length * row + 40);
  return <div role="group" aria-label="Peta topik pulau" className="relative mx-auto w-full max-w-md" style={{ height }}>
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {topics.slice(0, -1).map((topic, i) => {
        const x = i % 2 === 0 ? 28 : 72;
        const nextX = i % 2 === 0 ? 72 : 28;
        const y = top + i * row;
        return <path key={topic.id} d={`M ${x} ${y + 28} C ${x} ${y + row / 2}, ${nextX} ${y + row / 2}, ${nextX} ${y + row - 28}`} fill="none" stroke={topic.gatekeeper_status === "COMPLETED" ? "#34d399" : "#94a3b8"} strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
    {topics.map((topic, i) => {
      const locked = topic.material_status === "LOCKED";
      const done = topic.gatekeeper_status === "COMPLETED";
      return <button key={topic.id} type="button" disabled={busy || locked} onClick={() => onSelect(topic.id)} aria-label={`${topic.topic}: ${done ? "Selesai" : locked ? "Terkunci" : "Terbuka"}`} className="absolute flex w-[44%] -translate-x-1/2 -translate-y-8 flex-col items-center gap-2 text-center disabled:cursor-not-allowed" style={{ left: `${i % 2 === 0 ? 28 : 72}%`, top: top + i * row }}>
        <span className={`relative flex h-16 w-16 items-center justify-center rounded-full border-4 text-2xl shadow-lg transition ${locked ? "border-slate-300 bg-slate-200 text-slate-400 grayscale" : done ? "border-emerald-200 bg-emerald-500 text-white" : "border-white bg-gradient-to-br from-indigo-400 to-violet-600 text-white hover:scale-110"}`}>{["📍", "📚", "🧩", "🔭", "🎯"][i % 5]}{done && <Check size={18} className="absolute -right-1 -top-1 rounded-full bg-emerald-600 text-white" />}</span>
        <span className="max-w-full break-words rounded-lg bg-white/90 px-2 py-1 text-xs font-extrabold dark:bg-slate-800">{i + 1}. {topic.topic}</span>
        <span className="text-xs text-slate-500">{locked ? "Selesaikan topik sebelumnya" : done ? <span className="inline-flex items-center gap-1 text-amber-500"><Star size={13} fill="currentColor" />{topic.gatekeeper_stars} bintang</span> : "Ketuk untuk menjelajah"}</span>
      </button>;
    })}
  </div>;
}
