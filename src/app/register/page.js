
"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [method, setMethod] = useState("independent");

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

  const labelClass =
    "mb-2 block text-sm font-bold text-slate-800";

  const optionClass = (active) =>
    `rounded-xl border-2 p-4 text-left transition cursor-pointer ${
      active
        ? "border-blue-600 bg-blue-50 text-blue-800"
        : "border-slate-300 bg-white text-slate-800 hover:border-blue-300"
    }`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/40 sm:p-9">

        {/* BRAND */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-blue-700">
            TKA <span className="text-slate-950">TryOn</span>
          </h1>

          <p className="mt-2 text-xs font-bold tracking-widest text-slate-600">
            SKILL ON • CONFIDENCE ON
          </p>
        </div>

        {/* JUDUL */}
        <h2 className="text-2xl font-extrabold text-slate-900">
          Buat Akun Baru
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Mulai perjalanan persiapan Tes Kemampuan Akademik bersama TKA TryOn.
        </p>

        {/* PILIHAN PENDAFTARAN */}
        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">

          <button
            type="button"
            onClick={() => setMethod("independent")}
            className={optionClass(method === "independent")}
          >
            <span className="block text-2xl">🎓</span>

            <span className="mt-3 block text-sm font-bold">
              Daftar Mandiri
            </span>

            <span className="mt-1 block text-xs text-slate-600">
              Belajar secara mandiri
            </span>

            {method === "independent" && (
              <span className="mt-3 block text-xs font-bold text-blue-700">
                ✓ Pilihan aktif
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMethod("school")}
            className={optionClass(method === "school")}
          >
            <span className="block text-2xl">🏫</span>

            <span className="mt-3 block text-sm font-bold">
              Bergabung Sekolah
            </span>

            <span className="mt-1 block text-xs text-slate-600">
              Gunakan kode dari sekolah
            </span>

            {method === "school" && (
              <span className="mt-3 block text-xs font-bold text-blue-700">
                ✓ Pilihan aktif
              </span>
            )}
          </button>

        </div>

        {/* FORM PENDAFTARAN */}
        <form className="mt-8 space-y-5">

          {/* NAMA */}
          <div>
            <label className={labelClass}>
              Nama Lengkap
            </label>

            <input
              type="text"
              name="fullName"
              placeholder="Masukkan nama lengkap"
              autoComplete="name"
              className={inputClass}
            />
          </div>

          {/* EMAIL */}
          <div>
            <label className={labelClass}>
              Email
            </label>

            <input
              type="email"
              name="email"
              placeholder="nama@email.com"
              autoComplete="email"
              className={inputClass}
            />
          </div>

          {/* JENJANG */}
          <div>
            <label className={labelClass}>
              Jenjang Pendidikan
            </label>

            <select
              name="educationLevel"
              defaultValue=""
              className={`${inputClass} text-slate-800`}
            >
              <option value="" disabled>
                Pilih jenjang pendidikan
              </option>

              <option value="sd">
                SD / MI - Kelas 6
              </option>

              <option value="smp">
                SMP / MTs - Kelas 9
              </option>

              <option value="sma">
                SMA / MA / SMK - Kelas 12
              </option>
            </select>
          </div>

          {/* KODE SEKOLAH */}
          {method === "school" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <label className={labelClass}>
                Kode Bergabung Sekolah
              </label>

              <input
                type="text"
                name="schoolCode"
                placeholder="Masukkan kode dari sekolah"
                className={inputClass}
              />

              <p className="mt-2 text-xs leading-5 text-slate-700">
                Dapatkan kode bergabung dari guru atau admin sekolah.
              </p>
            </div>
          )}

          {/* PASSWORD */}
          <div>
            <label className={labelClass}>
              Password
            </label>

            <input
              type="password"
              name="password"
              placeholder="Buat password"
              autoComplete="new-password"
              className={inputClass}
            />

            <p className="mt-2 text-xs text-slate-600">
              Gunakan password yang mudah diingat dan sulit ditebak.
            </p>
          </div>

          {/* TOMBOL */}
          <button
            type="button"
            className="w-full rounded-xl bg-blue-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-800"
          >
            Buat Akun →
          </button>

        </form>

        {/* LOGIN */}
        <div className="mt-7 border-t border-slate-200 pt-6 text-center">
          <p className="text-sm text-slate-700">
            Sudah punya akun?{" "}
            <a
              href="/login"
              className="font-bold text-blue-700 hover:text-blue-900"
            >
              Masuk di sini
            </a>
          </p>
        </div>

        {/* FOOTER */}
        <p className="mt-8 text-center text-xs text-slate-500">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </p>

      </div>
    </main>
  );
}
