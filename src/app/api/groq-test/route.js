import { connection } from "next/server";
import { requireSuperAdmin } from "@/lib/server/auth";
import { testGroqConnection } from "@/lib/server/ai-structure";
import { accessResponse, jsonResponse, safeErrorResponse } from "@/lib/server/http.mjs";

export async function GET(request) {
  await connection();

  try {
    const access = await requireSuperAdmin(request);
    if (!access.allowed) return accessResponse(access);

    const result = await testGroqConnection();
    return jsonResponse({
      success: true,
      message: "Koneksi AI berhasil.",
      ...result,
    });
  } catch (error) {
    console.error("Groq health check failed:", error?.message || error);
    return safeErrorResponse(error);
  }
}
