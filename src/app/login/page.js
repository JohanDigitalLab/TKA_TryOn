
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight text-blue-700">
            TKA <span className="text-slate-900">TryOn</span>
          </h1>
          <p className="mt-2 text-xs font-bold tracking-widest text-slate-400">
            SKILL ON • CONFIDENCE ON
          </p>
        </div>

        <h2 className="text-2xl font-extrabold text-slate-800">
          Selamat Datang!
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Masuk untuk melanjutkan perjalanan belajar dan persiapan TKA.
        </p>

        <form className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              type="email"
              placeholder="nama@email.com"
className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              type="password"
              placeholder="Masukkan password"
className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"            />
          </div>

          <button
            type="button"
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
          >
            Masuk ke TKA TryOn →
          </button>
        </form>

        <div className="my-7 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">PENGGUNA BARU?</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <p className="text-center text-sm text-slate-500">
          Belum punya akun?{" "}
          <span className="font-bold text-blue-600">
            Daftar sekarang
          </span>
        </p>

        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 TKA TryOn
        </p>
      </div>
    </main>
  );
}
