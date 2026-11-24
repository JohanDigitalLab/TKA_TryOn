import PortalGuard from "@/components/portal-guard";

// Seluruh halaman di bawah /home wajib login, tanpa pembatasan tipe akun.
// Pengguna yang belum login diarahkan ke halaman utama oleh PortalGuard.
export default function HomeLayout({ children }) {
  return <PortalGuard>{children}</PortalGuard>;
}
