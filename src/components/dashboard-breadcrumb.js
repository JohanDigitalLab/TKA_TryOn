import Link from "next/link";

/**
 * Breadcrumb sederhana: "Home / <halaman saat ini>".
 * Tautan Home menuju /home yang otomatis meneruskan pengguna ke dashboard
 * sesuai akun yang login (student / mstudent / school / admin).
 */
export default function DashboardBreadcrumb({ current }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600"
    >
      <Link href="/home" className="rounded-md px-1 py-0.5 text-blue-700 hover:underline">
        Home
      </Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page" className="text-slate-800">
        {current}
      </span>
    </nav>
  );
}
