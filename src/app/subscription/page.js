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
            <article key={plan.name} className={`border p-6 sm:p-8 ${plan.tone === "blue" ? "rounded-xl border-line-strong bg-surface" : "rounded-xl border-line-strong bg-inverse text-on-inverse"}`}>
              <p className={`text-sm font-bold ${plan.tone === "blue" ? "text-accent-ink" : "text-inverse-accent"}`}>{plan.name}</p>
              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-black">{plan.price}</span>
                <span className={`text-sm ${plan.tone === "blue" ? "text-ink-muted" : "text-inverse-muted"}`}>{plan.suffix}</span>
              </div>
              <ul className={`mt-7 space-y-3 text-sm ${plan.tone === "blue" ? "text-ink-secondary" : "text-inverse-muted"}`}>
                {plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className="font-bold text-inverse-accent" aria-hidden="true">✓</span><span>{feature}</span></li>)}
              </ul>
              <Link href={plan.href} className={`mt-8 block rounded-lg px-5 py-3 text-center text-sm font-bold ${plan.tone === "blue" ? "bg-primary text-on-primary hover:bg-primary-hover" : "bg-surface text-ink hover:bg-accent-soft"}`}>{plan.action}</Link>
            </article>
          ))}
          <p className="text-sm text-ink-secondary md:col-span-2">Siswa yang mendapat undangan sekolah dapat <Link href="/register?method=school" className="font-bold text-accent-ink underline">daftar sebagai siswa sekolah</Link>.</p>
        </div>
  );
}

export default function SubscriptionPage() {
  return <StudentPage subscriptionMode actionContent={<SubscriptionPlans />} />;
}
