import PortalGuard from "@/components/portal-guard";

// Seluruh halaman di bawah /admin: wajib login dan account_type = ADMIN.
// Belum login -> "/" (halaman utama); tipe akun lain -> getHomeHref(profil).
export default function AdminLayout({ children }) {
  return <PortalGuard allowedTypes={["ADMIN"]}>{children}</PortalGuard>;
}
