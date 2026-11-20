"use client";

import { supabase } from "@/lib/supabase";
import { statusLabels } from "@/lib/school/onboarding.mjs";

export const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 min-h-11";
export const buttonClass = "group inline-flex min-h-14 items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-700 to-indigo-600 px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:from-blue-800 hover:to-indigo-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-200";
export function Status({ value }) { return <span className="inline-block rounded bg-slate-100 px-2 py-1 text-sm font-semibold">{statusLabels[value] || value}</span>; }
export function DateText({ value }) { return <time dateTime={value}>{value ? new Date(value).toLocaleString("id-ID") : "—"}</time>; }
export function Panel({ title, children }) { return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-xl font-extrabold">{title}</h2>{children}</section>; }
export function Empty({ children = "Belum ada data." }) { return <p className="text-sm text-slate-600">{children}</p>; }
export function Field({ name, label, options, multiline, ...props }) {
  return <label className="block text-sm font-semibold">{label}{options ? <select name={name} className={inputClass} {...props}><option value="">Pilih…</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : multiline ? <textarea name={name} className={inputClass} rows={4} {...props} /> : <input name={name} className={inputClass} {...props} />}</label>;
}
export async function rpc(name, params) { const result = await supabase.rpc(name, params); if (result.error) throw result.error; return result.data; }
