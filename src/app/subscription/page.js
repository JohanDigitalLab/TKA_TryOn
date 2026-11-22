"use client";

import { supabase } from "@/lib/supabase";
import { StudentDashboard } from "../student/page";

const plans = [
  {
    name: "Siswa Mandiri",
    action: "Aktifkan Sekarang",
    messageSetting: "WA_MSG_SISWA",
    price: "Rp49.000",
    suffix: "sekali bayar sampai lulus",
    tone: "blue",
    features: [
      "Simulasi TKA berbasis CBT",
      "Latihan soal sesuai jenjang",
      "Riwayat hasil dan review jawaban",
      "Rekomendasi belajar dari hasil pengerjaan",
    ],
  },
  {
    name: "Sekolah",
    action: "Aktifkan Sekarang",
    messageSetting: "WA_MSG_SEKOLAH",
    price: "Rp25.000",
    suffix: "per siswa",
    tone: "blue",
    features: [
      "Dashboard sekolah dan pengelolaan siswa",
      "Jadwal try-out bersama",
      "Penugasan latihan dengan batas waktu",
      "Monitoring hasil belajar dan peringkat",
    ],
  },
];

function normalizeWhatsAppNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  // 08xx -> 628xx agar valid untuk tautan wa.me.
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

async function openActivationWhatsApp(plan) {
  // Ambil nomor dan pesan dari tabel settings lewat RPC get_setting.
  const [{ data: numberData }, { data: messageData }] = await Promise.all([
    supabase.rpc("get_setting", { p_name: "WA_NUMBER" }),
    supabase.rpc("get_setting", { p_name: plan.messageSetting }),
  ]);

  const number = normalizeWhatsAppNumber(numberData);
  const message = String(messageData || "").trim();

  // Setting nomor WA belum tersedia; tidak melakukan apa-apa.
  if (!number) return;

  const url = `https://wa.me/${number}${
    message ? `?text=${encodeURIComponent(message)}` : ""
  }`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function SubscriptionPlans() {
  return (
        <div className="grid gap-6 md:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.name} className={`border p-6 sm:p-8 ${plan.tone === "blue" ? "rounded-xl border-slate-300 bg-white" : "rounded-xl border-slate-300 bg-slate-900 text-white"}`}>
              <p className={`text-sm font-bold ${plan.tone === "blue" ? "text-blue-700" : "text-blue-200"}`}>{plan.name}</p>
              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-black">{plan.price}</span>
                <span className={`text-sm ${plan.tone === "blue" ? "text-slate-500" : "text-slate-300"}`}>{plan.suffix}</span>
              </div>
              <ul className={`mt-7 space-y-3 text-sm ${plan.tone === "blue" ? "text-slate-600" : "text-slate-200"}`}>
                {plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className="font-bold text-blue-400" aria-hidden="true">✓</span><span>{feature}</span></li>)}
              </ul>
              <button
                type="button"
                onClick={() => openActivationWhatsApp(plan)}
                className={`mt-8 block w-full rounded-lg px-5 py-3 text-center text-sm font-bold ${plan.tone === "blue" ? "bg-blue-700 text-white hover:bg-blue-800" : "bg-white text-slate-900 hover:bg-blue-50"}`}
              >
                {plan.action}
              </button>
            </article>
          ))}
        </div>
  );
}

export default function SubscriptionPage() {
  return <StudentDashboard subscriptionMode actionContent={<SubscriptionPlans />} />;
}
