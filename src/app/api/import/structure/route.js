import { connection } from "next/server";
import { requireAdminPermission } from "@/lib/server/auth";
import { structureQuestions } from "@/lib/server/ai-structure";
import { accessResponse, jsonResponse, safeErrorResponse } from "@/lib/server/http.mjs";
import { readJsonBody, validateStructureBody } from "@/lib/validation/import";

export async function POST(request) {
  await connection();

  try {
    const access = await requireAdminPermission(request, "bank_soal.import");
    if (!access.allowed) return accessResponse(access);

    const body = validateStructureBody(await readJsonBody(request));
    const questions = await structureQuestions(body);

    if (!questions.length) {
      return jsonResponse({
        success: false,
        message: "AI tidak menemukan soal yang dapat disusun dari dokumen.",
      }, 422);
    }

    return jsonResponse({
      success: true,
      message: `${questions.length} soal berhasil disusun oleh AI. Seluruh soal memerlukan telaah manusia.`,
      data: {
        questions,
        totalQuestions: questions.length,
        sourceFileName: body.sourceFileName,
        model: "openai/gpt-oss-20b",
        reviewStatus: "NEEDS_HUMAN_REVIEW",
      },
    });
  } catch (error) {
    console.error("Smart Import Structuring Error:", error?.message || error);
    return safeErrorResponse(error);
  }
}

export function GET() {
  return jsonResponse({ success: false, message: "Method tidak diizinkan." }, 405);
}
