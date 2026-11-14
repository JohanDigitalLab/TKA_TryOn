import Link from "next/link";

const plans = [
  {
    name: "Siswa Mandiri",
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
    price: "Rp25.000",
    suffix: "per siswa",
    tone: "slate",
    features: [
      "Dashboard sekolah dan pengelolaan siswa",
      "Jadwal try-out bersama",
      "Penugasan latihan dengan batas waktu",
      "Monitoring hasil belajar dan peringkat",
    ],
  },
];

export default function SubscriptionPage() {
  return (
    <main className="min-h-screen bg-[#f5f6f3] text-slate-800">
      <header className="border-b border-slate-200 bg-[#f5f6f3]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Kembali ke beranda TKA TryOn">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-lg font-black text-white">T</span>
            <span>
              <span className="block text-xl font-extrabold tracking-tight text-slate-900">TKA <span className="text-blue-700">TryOn</span></span>
              <span className="block text-[10px] font-semibold tracking-widest text-slate-500">SKILL ON • CONFIDENCE ON</span>
            </span>
          </Link>
          <Link href="/login" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Masuk</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16 lg:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">PILIH CARA BELAJAR</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Investasi belajar yang sederhana dan transparan</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">Coba pengalaman TKA TryOn terlebih dahulu. Informasi di halaman ini adalah rancangan paket; aktivasi pembayaran nyata belum diaktifkan.</p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2" aria-label="Pilihan paket TKA TryOn">
          {plans.map((plan) => (
            <article key={plan.name} className={`border p-6 sm:p-8 ${plan.tone === "blue" ? "border-slate-300 bg-white" : "border-slate-300 bg-slate-900 text-white"}`}>
              <p className={`text-sm font-bold ${plan.tone === "blue" ? "text-blue-700" : "text-blue-200"}`}>{plan.name}</p>
              <div className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-black">{plan.price}</span>
                <span className={`text-sm ${plan.tone === "blue" ? "text-slate-500" : "text-slate-300"}`}>{plan.suffix}</span>
              </div>
              <ul className={`mt-7 space-y-3 text-sm ${plan.tone === "blue" ? "text-slate-600" : "text-slate-200"}`}>
                {plan.features.map((feature) => <li key={feature} className="flex gap-3"><span className="font-bold text-blue-400" aria-hidden="true">✓</span><span>{feature}</span></li>)}
              </ul>
              <Link href="/register" className={`mt-8 block rounded-lg px-5 py-3 text-center text-sm font-bold ${plan.tone === "blue" ? "bg-blue-700 text-white hover:bg-blue-800" : "bg-white text-slate-900 hover:bg-blue-50"}`}>Coba fitur sekarang →</Link>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-8 max-w-3xl border-l-2 border-amber-500 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <p className="font-bold">Catatan aktivasi</p>
          <p className="mt-1">Belum ada pembayaran atau transaksi yang dianggap berhasil. Aktivasi paket akan dilakukan setelah payment gateway, validasi webhook, dan rekonsiliasi transaksi dikonfigurasi.</p>
        </section>

        <div className="mt-10 text-center"><Link href="/" className="text-sm font-bold text-blue-700 hover:text-blue-900">← Kembali ke beranda</Link></div>
      </div>
    </main>
  );
}
