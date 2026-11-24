import PortalGuard from "@/components/portal-guard";

// Seluruh halaman di bawah /student: wajib login. Belum login -> "/" (halaman utama).
// Tidak ada pembatasan account_type di area ini.
export default function StudentLayout({ children }) {
  return <PortalGuard>{children}</PortalGuard>;
}
