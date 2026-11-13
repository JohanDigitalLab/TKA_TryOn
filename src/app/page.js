
import Link from "next/link";

const levels = [
  {
    name: "SD / MI",
    grade: "KELAS 6",
    description: "Persiapan Tes Kemampuan Akademik jenjang Sekolah Dasar.",
    subjects: ["Bahasa Indonesia", "Matematika"],
  },
  {
    name: "SMP / MTs",
    grade: "KELAS 9",
    description: "Persiapan Tes Kemampuan Akademik jenjang Sekolah Menengah Pertama.",
    subjects: ["Bahasa Indonesia", "Matematika"],
  },
  {
    name: "SMA / MA / SMK",
    grade: "KELAS 12",
    description: "Persiapan Tes Kemampuan Akademik jenjang Sekolah Menengah Atas.",
    subjects: ["Mata Pelajaran Wajib", "Mata Pelajaran Pilihan"],
  },
];

const services = [
  {
    number: "01",
    title: "Simulasi TKA",
    description: "Latihan ujian berbasis komputer dengan pengaturan waktu dan navigasi soal.",
  },
  {
    number: "02",
    title: "Latihan Akademik",
    description: "Latihan soal berdasarkan jenjang, mata pelajaran, dan kompetensi.",
  },
  {
    number: "03",
    title: "Hasil dan Evaluasi",
    description: "Lihat hasil pengerjaan dan identifikasi kompetensi yang perlu ditingkatkan.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 items-center gap-y-3 px-5 py-4 md:grid-cols-[1fr_auto_1fr] lg:px-8">

          {/* LOGO KIRI */}
          <Link href="/" className="flex items-center gap-3 justify-self-start">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-700 text-lg font-black text-white">
              T
            </div>
            <div>
              <p className="text-xl font-extrabold tracking-tight text-slate-900">
                TKA <span className="text-blue-700">TryOn</span>
              </p>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-500">
                SKILL ON • CONFIDENCE ON
              </p>
            </div>
          </Link>

          {/* NAVIGASI TENGAH */}
          <nav className="col-span-2 row-start-2 flex items-center justify-center gap-6 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-700 sm:gap-8 md:col-span-1 md:col-start-2 md:row-start-1 md:border-0 md:pt-0 md:text-base">
            <a href="#jenjang" className="py-1 hover:text-blue-700">
              Jenjang Pendidikan
            </a>
            <a href="#layanan" className="py-1 hover:text-blue-700">
              Layanan
            </a>
            <a href="#tentang" className="py-1 hover:text-blue-700">
              Tentang
            </a>
          </nav>

          {/* AKUN KANAN */}
          <div className="flex items-center justify-self-end gap-2 md:col-start-3 md:row-start-1">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:px-4"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Daftar
            </Link>
          </div>

        </div>
      </header>

      {/* HERO */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
              PLATFORM SIMULASI TES KEMAMPUAN AKADEMIK
            </div>

            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-slate-950 md:text-5xl">
              Persiapkan TKA dengan{" "}
              <span className="text-blue-700">lebih terarah.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600">
              TKA TryOn menyediakan fasilitas simulasi ujian berbasis komputer,
              latihan akademik, serta evaluasi kemampuan untuk membantu siswa
              mempersiapkan Tes Kemampuan Akademik.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-lg bg-blue-700 px-6 py-3.5 text-sm font-bold text-white shadow-md hover:bg-blue-800">
                Mulai Persiapan
              </Link>
              <a href="#jenjang" className="rounded-lg border border-slate-300 px-6 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Lihat Jenjang
              </a>
            </div>

            <p className="mt-6 text-xs leading-5 text-slate-600">
              Platform persiapan dan simulasi independen. Bukan aplikasi resmi penyelenggara TKA.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm md:p-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">TKA TRYON</p>
                <h3 className="mt-1 text-xl font-extrabold text-slate-900">Pusat Persiapan TKA</h3>
              </div>
              <span className="rounded-lg bg-blue-100 px-3 py-2 text-xs font-bold text-blue-800">CBT</span>
            </div>

            <div className="mt-6 space-y-4">
              {[
                ["A", "Simulasi ujian", "Pengalaman pengerjaan berbasis komputer"],
                ["B", "Latihan soal", "Persiapan berdasarkan mata pelajaran"],
                ["C", "Evaluasi hasil", "Analisis kemampuan dan perkembangan"],
              ].map(([code, title, description]) => (
                <div key={code} className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 font-bold text-blue-700">{code}</div>
                  <div>
                    <h4 className="font-bold text-slate-900">{title}</h4>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl bg-blue-700 p-5 text-white">
              <p className="text-xs font-semibold text-blue-100">SKILL ON • CONFIDENCE ON</p>
              <p className="mt-2 text-lg font-bold">Belajar terarah. Berlatih terukur. Lebih siap menghadapi TKA.</p>
            </div>
          </div>
        </div>
      </section>

      {/* JENJANG */}
      <section id="jenjang" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">PROGRAM PERSIAPAN</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950 md:text-3xl">Pilih Jenjang Pendidikan</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Program persiapan dan simulasi disesuaikan dengan jenjang pendidikan peserta.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {levels.map((level) => (
            <article key={level.name} className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-lg">
              <span className="inline-flex rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">{level.grade}</span>
              <h4 className="mt-5 text-xl font-extrabold text-slate-900">{level.name}</h4>
              <p className="mt-3 min-h-12 text-sm leading-6 text-slate-500">{level.description}</p>
              <div className="my-5 border-t border-slate-100 pt-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Cakupan persiapan</p>
                {level.subjects.map((subject) => (
                  <div key={subject} className="mb-2 flex items-center gap-2 text-sm text-slate-600">
                    <span className="text-blue-700">•</span>{subject}
                  </div>
                ))}
              </div>
              <Link href="/register" className="block rounded-lg border border-blue-200 py-3 text-center text-sm font-bold text-blue-700 hover:bg-blue-50">
                Daftar untuk {level.name}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* LAYANAN */}
      <section id="layanan" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">FASILITAS PLATFORM</p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Persiapan, Simulasi, dan Evaluasi</h3>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {services.map((service) => (
              <article key={service.number} className="border-l-2 border-blue-600 py-2 pl-5">
                <p className="text-sm font-bold text-blue-700">{service.number}</p>
                <h4 className="mt-3 text-lg font-bold text-slate-900">{service.title}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-500">{service.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TENTANG */}
      <section id="tentang" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="rounded-2xl bg-slate-900 px-6 py-10 text-white md:px-10">
          <h3 className="text-2xl font-extrabold">TKA TryOn</h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            Platform independen untuk membantu siswa mengenal karakteristik Tes Kemampuan Akademik,
            berlatih mengerjakan soal, dan mengevaluasi kesiapan akademiknya.
          </p>
          <p className="mt-5 text-xs text-slate-400">SKILL ON • CONFIDENCE ON</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-5 py-6 text-xs text-slate-400 md:flex-row lg:px-8">
          <p>© 2026 TKA TryOn. All rights reserved.</p>
          <p>SKILL ON • CONFIDENCE ON</p>
        </div>
      </footer>

    </main>
  );
}
