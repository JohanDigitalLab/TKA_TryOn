import { NextResponse } from "next/server";
import { loadProvinces } from "@/lib/indonesia/provinces.mjs";

// Menyediakan daftar provinsi untuk dropdown formulir sekolah tanpa bergantung
// pada kebijakan CORS penyedia data wilayah.
export async function GET() {
  const { provinces, source } = await loadProvinces();
  return NextResponse.json(
    { provinces, source },
    {
      status: 200,
      headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" },
    }
  );
}
