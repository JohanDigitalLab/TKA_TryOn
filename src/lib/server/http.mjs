export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function safeErrorResponse(error) {
  if (error instanceof ApiError) {
    return jsonResponse({ success: false, message: error.message }, error.status);
  }
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return jsonResponse({ success: false, message: "Waktu pemrosesan layanan habis." }, 504);
  }
  return jsonResponse({ success: false, message: "Terjadi kesalahan saat memproses permintaan." }, 500);
}

export function accessResponse(access) {
  return jsonResponse({ success: false, message: access.message }, access.status);
}

/** Enforce byte limits while reading, even without Content-Length. */
export async function readBoundedBody(message, maxBytes, overflowStatus = 413) {
  const declared = message.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new ApiError(overflowStatus, "Ukuran permintaan melebihi batas atau tidak valid.");
  }
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ApiError(overflowStatus, "Ukuran permintaan melebihi batas.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
