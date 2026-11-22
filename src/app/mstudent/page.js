"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MStudentPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/student");
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-600">
      <p role="status">Mengalihkan ke dashboard siswa…</p>
    </main>
  );
}
