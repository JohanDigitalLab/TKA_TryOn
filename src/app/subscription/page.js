"use client";

import Link from "next/link";
import StudentPage from "../student/page";

const plans = [
  {
    name: "Siswa Mandiri",
    href: "/register?method=independent",
    action: "Aktifkan Sekarang",
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
    href: "/school/register",
    action: "Aktifkan Sekarang",
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
              <Link href={plan.href} className={`mt-8 block rounded-lg px-5 py-3 text-center text-sm font-bold ${plan.tone === "blue" ? "bg-blue-700 text-white hover:bg-blue-800" : "bg-white text-slate-900 hover:bg-blue-50"}`}>{plan.action}</Link>
            </article>
          ))}
          <p className="text-sm text-slate-600 md:col-span-2">Siswa yang mendapat undangan sekolah dapat <Link href="/register?method=school" className="font-bold text-blue-700 underline">daftar sebagai siswa sekolah</Link>.</p>
        </div>
  );
}

export default function SubscriptionPage() {
  return <StudentPage subscriptionMode actionContent={<SubscriptionPlans />} />;
}
