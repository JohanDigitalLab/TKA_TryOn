
"use client";

import Image from "next/image";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const [method, setMethod] = useState("independent");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

  const labelClass = "mb-2 block text-sm font-bold text-slate-800";

  const optionClass = (active) =>
    `rounded-xl border-2 p-4 text-left transition cursor-pointer ${
      active
        ? "border-blue-600 bg-blue-50 text-blue-800"
        : "border-slate-300 bg-white text-slate-800 hover:border-blue-300"
    }`;

  async function handleRegister(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);

    const fullName = formData.get("fullName")?.toString().trim();
    const email = formData.get("email")?.toString().trim();
    const educationLevel = formData.get("educationLevel")?.toString();
    const schoolCode = formData.get("schoolCode")?.toString().trim() || "";
    const password = formData.get("password")?.toString();

    if (!fullName || !email || !educationLevel || !password) {
      setErrorMessage("Mohon lengkapi seluruh data pendaftaran.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password minimal harus 8 karakter.");
      return;
    }

    if (method === "school" && !schoolCode) {
      setErrorMessage("Masukkan kode bergabung dari sekolah.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            education_level: educationLevel,
            registration_method: method,
            school_code: method === "school" ? schoolCode : null,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) throw error;

      if (data.session) {
        setSuccessMessage(
          "Akun berhasil dibuat! Pendaftaran selesai dan Anda sudah dapat masuk."
        );
      } else {
        setSuccessMessage(
          "Pendaftaran berhasil dikirim! Silakan periksa email Anda dan klik tautan konfirmasi sebelum masuk ke TKA TryOn."
        );
      }

      form.reset();
      setMethod("independent");
    } catch (error) {
      console.error("Registration error:", error);

      let message = error.message || "Pendaftaran gagal. Silakan coba kembali.";

      if (message.toLowerCase().includes("already registered")) {
        message = "Email ini sudah terdaftar. Silakan masuk menggunakan akun tersebut.";
      } else if (message.toLowerCase().includes("password")) {
        message = "Password belum memenuhi ketentuan.";
      } else if (message.toLowerCase().includes("rate limit")) {
        message = "Terlalu banyak percobaan. Silakan tunggu beberapa saat.";
      }

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(480px,640px)] lg:gap-12">
        <section className="overflow-hidden rounded-3xl border border-blue-100 bg-blue-50 shadow-sm">
          <Image
            src="/auth-illustration.svg"
            alt="Pelajar mempersiapkan TKA dengan simulasi dan melihat kemajuan belajar"
            width={900}
            height={720}
            priority
            className="h-auto max-h-64 w-full object-cover object-center sm:max-h-80 lg:max-h-none"
          />
          <div className="px-8 pb-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
              SKILL ON • CONFIDENCE ON
            </p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950">
              Bangun kebiasaan belajar yang lebih percaya diri
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Buat akun untuk menyimpan perjalanan latihan, mengikuti simulasi, dan memahami progres Anda.
            </p>
          </div>
        </section>

        <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/40 sm:p-9">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-blue-700">
            TKA <span className="text-slate-950">TryOn</span>
          </h1>
          <p className="mt-2 text-xs font-bold tracking-widest text-slate-600">
            SKILL ON • CONFIDENCE ON
          </p>
        </div>

        <h2 className="text-2xl font-extrabold text-slate-900">
          Buat Akun Baru
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Mulai perjalanan persiapan Tes Kemampuan Akademik bersama TKA TryOn.
        </p>

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMethod("independent")}
            className={optionClass(method === "independent")}
            disabled={loading}
          >
            <span className="block text-2xl">🎓</span>
            <span className="mt-3 block text-sm font-bold">Daftar Mandiri</span>
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
            disabled={loading}
          >
            <span className="block text-2xl">🏫</span>
            <span className="mt-3 block text-sm font-bold">Bergabung Sekolah</span>
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

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-800">
            <strong className="block mb-1">Pendaftaran Berhasil</strong>
            {successMessage}
            <a
              href="/login"
              className="mt-3 inline-block font-bold text-blue-700 underline"
            >
              Lanjut ke halaman masuk →
            </a>
          </div>
        )}

        <form onSubmit={handleRegister} className="mt-8 space-y-5">

          <div>
            <label className={labelClass}>Nama Lengkap</label>
            <input
              type="text"
              name="fullName"
              placeholder="Masukkan nama lengkap"
              autoComplete="name"
              className={inputClass}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              name="email"
              placeholder="nama@email.com"
              autoComplete="email"
              className={inputClass}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className={labelClass}>Jenjang Pendidikan</label>
            <select
              name="educationLevel"
              defaultValue=""
              className={`${inputClass} text-slate-800`}
              required
              disabled={loading}
            >
              <option value="" disabled>
                Pilih jenjang pendidikan
              </option>
              <option value="sd">SD / MI - Kelas 6</option>
              <option value="smp">SMP / MTs - Kelas 9</option>
              <option value="sma">SMA / MA / SMK - Kelas 12</option>
            </select>
          </div>

          {method === "school" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <label className={labelClass}>Kode Bergabung Sekolah</label>
              <input
                type="text"
                name="schoolCode"
                placeholder="Masukkan kode dari sekolah"
                className={inputClass}
                required
                disabled={loading}
              />
              <p className="mt-2 text-xs leading-5 text-slate-700">
                Dapatkan kode bergabung dari guru atau admin sekolah.
              </p>
            </div>
          )}

          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              name="password"
              placeholder="Buat password minimal 8 karakter"
              autoComplete="new-password"
              className={inputClass}
              minLength={8}
              required
              disabled={loading}
            />
            <p className="mt-2 text-xs text-slate-600">
              Gunakan password yang mudah diingat dan sulit ditebak.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sedang Membuat Akun..." : "Buat Akun →"}
          </button>

        </form>

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

        <p className="mt-8 text-center text-xs text-slate-500">
          © 2026 TKA TryOn · SKILL ON • CONFIDENCE ON
        </p>

        </div>
      </div>
    </main>
  );
}
