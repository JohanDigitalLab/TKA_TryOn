import PortalGuard from "@/components/portal-guard";

// Seluruh halaman di bawah /school: wajib login dan account_type SCHOOL atau ADMIN
// (admin mengelola data sekolah). Belum login -> "/" (halaman utama);
// tipe akun lain -> getHomeHref(profil).
export default function SchoolLayout({ children }) {
  return <PortalGuard allowedTypes={["SCHOOL", "ADMIN"]}>{children}</PortalGuard>;
}
