
import Link from "next/link";

const services = [
  {
    number: "01",
    title: "Simulasi TKA",
    description:
      "Kerjakan simulasi ujian dengan tampilan CBT, batas waktu, navigasi soal, dan mekanisme pengerjaan terstruktur.",
    status: "DALAM PENGEMBANGAN",
    available: false,
  },
  {
    number: "02",
    title: "Latihan Akademik",
    description:
      "Latihan berdasarkan jenjang pendidikan, mata pelajaran, dan kompetensi yang diujikan.",
    status: "BUKA LATIHAN",
    available: true,
    href: "/student/subjects",
  },
  {
    number: "03",
    title: "Hasil dan Evaluasi",
    description:
      "Lihat hasil pengerjaan, capaian kompetensi, dan rekomendasi peningkatan kemampuan.",
    status: "SEGERA TERSEDIA",
    available: false,
  },
];

export default function StudentPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">

          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-lg font-black text-white">
              T
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                TKA <span className="text-blue-700">TryOn</span>
              </h1>
              <p className="text-[10px] font-semibold tracking-widest text-slate-500">
                SKILL ON • CONFIDENCE ON
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900">
                Peserta Demo
              </p>
              <p className="text-xs text-slate-500">
                Profil belum terhubung
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
              P
            </div>
          </div>

        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">

        {/* SAPAAN */}
        <section className="mb-8">
          <p className="text-sm font-semibold text-blue-700">
            DASHBOARD PESERTA
          </p>

          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Selamat datang di TKA TryOn
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Pusat persiapan, latihan akademik, dan simulasi Tes Kemampuan
            Akademik untuk membantu Anda menghadapi ujian dengan lebih siap.
          </p>
        </section>

        {/* INFORMASI PESERTA */}
        <section className="mb-9 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                INFORMASI PESERTA
              </p>
              <h3 className="mt-2 text-lg font-bold text-slate-900">
                Lengkapi profil pendidikan Anda
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Jenjang dan kelas akan digunakan untuk menyesuaikan materi
                latihan serta paket simulasi TKA.
              </p>
            </div>

            <span className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              DEMO
            </span>
          </div>
        </section>

        {/* LAYANAN PESERTA */}
        <section id="layanan" className="mb-10 scroll-mt-28">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              LAYANAN PESERTA
            </p>
            <h3 className="mt-2 text-xl font-extrabold text-slate-950 sm:text-2xl">
              Pilih Aktivitas Anda
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Akses fasilitas persiapan dan evaluasi TKA.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <article
                key={service.number}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-blue-700">
                    LAYANAN {service.number}
                  </span>

                  <span
                    className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold tracking-wide ${
                      service.available
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {service.available ? "TERSEDIA" : "BELUM TERSEDIA"}
                  </span>
                </div>

                <h4 className="mt-6 text-lg font-extrabold text-slate-900">
                  {service.title}
                </h4>

                <p className="mt-3 flex-1 text-sm leading-6 text-slate-500">
                  {service.description}
                </p>

                {service.available ? (
                  <Link
                    href={service.href}
                    className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800"
                  >
                    {service.status} →
                  </Link>
                ) : (
                  <div className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-400">
                    {service.status}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* INFORMASI SIMULASI */}
        <section className="mb-10 rounded-xl border border-blue-100 bg-blue-50 p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
            TENTANG TKA TRYON
          </p>

          <h3 className="mt-3 text-xl font-extrabold text-slate-950">
            Berlatih dengan sistem ujian berbasis komputer
          </h3>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            TKA TryOn dikembangkan sebagai platform persiapan dan simulasi
            Tes Kemampuan Akademik. Peserta dapat berlatih, mengenali
            karakteristik soal, serta mengevaluasi kesiapan akademiknya.
          </p>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-slate-200 py-7 text-center">
          <p className="text-xs text-slate-500">
            © 2026 TKA TryOn
          </p>
          <p className="mt-1 text-xs font-semibold tracking-wider text-blue-700">
            SKILL ON • CONFIDENCE ON
          </p>
        </footer>

      </div>
    </main>
  );
}
