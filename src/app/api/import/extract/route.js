import { extractDocument } from "@/lib/document-extractor";
import { requireAdminPermission } from "@/lib/server/auth";
import { ApiError, accessResponse, jsonResponse, safeErrorResponse } from "@/lib/server/http.mjs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 1024 * 1024;

export async function POST(request) {
  try {
    const access = await requireAdminPermission(request, "bank_soal.import");
    if (!access.allowed) return accessResponse(access);

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_SIZE) {
      throw new ApiError(413, "Ukuran permintaan terlalu besar. Maksimal file 20 MB.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      throw new ApiError(400, "File belum dipilih atau format unggahan tidak valid.");
    }
    if (file.size === 0) throw new ApiError(400, "File yang diunggah kosong.");
    if (file.size > MAX_FILE_SIZE) throw new ApiError(413, "Ukuran file maksimal 20 MB.");

    const result = await extractDocument({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    });

    return jsonResponse({
      success: true,
      message: "Dokumen berhasil diproses.",
      data: {
        fileName: result.fileName,
        fileType: result.fileType,
        extractionMethod: result.extractionMethod,
        pageCount: result.pageCount,
        extractedText: result.extractedText,
        pageResults: result.pageResults,
        warnings: result.warnings,
        extractedAt: result.extractedAt,
      },
    });
  } catch (error) {
    console.error("Smart Import extraction error:", error?.message || error);
    return safeErrorResponse(error);
  }
}
