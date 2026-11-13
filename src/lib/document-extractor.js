
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import path from "node:path";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_OCR_PAGES = 30;
const MIN_TEXT_LENGTH = 80;
const OCR_SCALE = 1.5;

const SUPPORTED_EXTENSIONS = [
  ".docx",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
];

// ==========================================
// VALIDASI FILE
// ==========================================

function getExtension(fileName = "") {
  const lastDot = fileName.lastIndexOf(".");

  return lastDot >= 0
    ? fileName.slice(lastDot).toLowerCase()
    : "";
}

function validateFile({ fileName, buffer }) {
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Nama file tidak valid.");
  }

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Data file tidak valid.");
  }

  if (buffer.length === 0) {
    throw new Error("File kosong.");
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("Ukuran file maksimal 20 MB.");
  }

  const extension = getExtension(fileName);

  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error(
      "Format belum didukung. Gunakan DOCX, PDF, JPG, JPEG, atau PNG."
    );
  }

  return extension;
}

// ==========================================
// NORMALISASI TEKS
// ==========================================

function normalizeText(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

// ==========================================
// OCR ENGINE
// ==========================================

async function createOcrWorker() {
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "tesseract.js",
    "src",
    "worker-script",
    "node",
    "index.js"
  );

  return createWorker("ind+eng", 1, {
    workerPath,
  });
}

async function recognizeImage(buffer, worker) {
  const result = await worker.recognize(buffer);

  return normalizeText(result?.data?.text || "");
}

// ==========================================
// EKSTRAKSI WORD / DOCX
// ==========================================

async function extractWord(buffer) {
  const result = await mammoth.extractRawText({ buffer });

  const text = normalizeText(result.value);

  if (!text) {
    throw new Error(
      "Tidak ditemukan teks dalam dokumen Word."
    );
  }

  return {
    text,
    method: "DOCX_TEXT",
    warnings: (result.messages || []).map(
      (message) => message.message
    ),
    pages: null,
    pageResults: [],
  };
}

// ==========================================
// EKSTRAKSI GAMBAR
// ==========================================

async function extractImage(buffer) {
  let worker;

  try {
    worker = await createOcrWorker();

    const text = await recognizeImage(buffer, worker);

    if (!text) {
      throw new Error(
        "OCR tidak menemukan teks pada gambar."
      );
    }

    return {
      text,
      method: "IMAGE_OCR",
      warnings: [],
      pages: 1,
      pageResults: [
        {
          pageNumber: 1,
          text,
          method: "OCR",
        },
      ],
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

// ==========================================
// EKSTRAKSI PDF
// ==========================================

async function extractPdf(buffer) {
  const parser = new PDFParse({
    data: buffer,
  });

  let worker;

  try {
    const textResult = await parser.getText();

    const pageResults = Array.isArray(textResult.pages)
      ? textResult.pages
      : [];

    const extractedPages = pageResults.map((page, index) => ({
      pageNumber: page.num || page.pageNumber || index + 1,
      text: normalizeText(page.text || ""),
      method: "PDF_TEXT",
    }));

    const totalPages =
      textResult.total ||
      extractedPages.length ||
      null;

    const warnings = [];
    let outputPages = [];

    // --------------------------------------
    // PDF DENGAN DATA TEKS PER HALAMAN
    // --------------------------------------

    if (extractedPages.length > 0) {
      const pagesNeedingOcr = extractedPages.filter(
        (page) => page.text.length < MIN_TEXT_LENGTH
      );

      const ocrPages = pagesNeedingOcr.slice(
        0,
        MAX_OCR_PAGES
      );

      const ocrPageNumbers = new Set(
        ocrPages.map((page) => page.pageNumber)
      );

      if (ocrPages.length > 0) {
        worker = await createOcrWorker();

        for (const page of extractedPages) {
          if (page.text.length >= MIN_TEXT_LENGTH) {
            outputPages.push(page);
            continue;
          }

          if (!ocrPageNumbers.has(page.pageNumber)) {
            outputPages.push({
              ...page,
              warning:
                "Halaman belum diproses OCR karena batas maksimal halaman.",
            });

            continue;
          }

          try {
            const screenshot = await parser.getScreenshot({
              partial: [page.pageNumber],
              scale: OCR_SCALE,
              imageBuffer: true,
              imageDataUrl: false,
            });

            const imageBuffer = screenshot.pages?.[0]?.data;

            if (!imageBuffer) {
              outputPages.push({
                ...page,
                warning: "Gagal merender halaman PDF.",
              });

              continue;
            }

            const ocrText = await recognizeImage(
              Buffer.from(imageBuffer),
              worker
            );

            outputPages.push({
              ...page,
              text: ocrText || page.text,
              method: ocrText ? "OCR" : "PDF_TEXT",
              warning: ocrText
                ? undefined
                : "OCR tidak menemukan teks yang dapat dibaca.",
            });
          } catch (error) {
            outputPages.push({
              ...page,
              warning: `OCR gagal: ${getErrorMessage(error)}`,
            });
          }
        }
      } else {
        outputPages = [...extractedPages];
      }

      if (pagesNeedingOcr.length > MAX_OCR_PAGES) {
        warnings.push(
          `OCR dibatasi hingga ${MAX_OCR_PAGES} halaman dalam satu proses.`
        );
      }

      const pageWarnings = outputPages
        .filter((page) => page.warning)
        .map(
          (page) =>
            `Halaman ${page.pageNumber}: ${page.warning}`
        );

      warnings.push(...pageWarnings);

      const text = normalizeText(
        outputPages
          .map(
            (page) =>
              `--- HALAMAN ${page.pageNumber} ---\n${page.text}`
          )
          .join("\n\n")
      );

      if (!text) {
        throw new Error(
          "Tidak ditemukan teks dalam dokumen PDF."
        );
      }

      const usedOcr = outputPages.some(
        (page) => page.method === "OCR"
      );

      return {
        text,
        method: usedOcr
          ? "PDF_TEXT_AND_OCR"
          : "PDF_TEXT",
        warnings,
        pages: totalPages,
        pageResults: outputPages,
      };
    }

    // --------------------------------------
    // FALLBACK JIKA DATA PER HALAMAN KOSONG
    // --------------------------------------

    let text = normalizeText(textResult.text || "");
    let method = "PDF_TEXT";

    if (text.length < MIN_TEXT_LENGTH) {
      try {
        worker = await createOcrWorker();

        const screenshot = await parser.getScreenshot({
          first: MAX_OCR_PAGES,
          scale: OCR_SCALE,
          imageBuffer: true,
          imageDataUrl: false,
        });

        const screenshotPages = screenshot.pages || [];
        const ocrResults = [];

        for (
          let index = 0;
          index < screenshotPages.length;
          index++
        ) {
          const pageImage = screenshotPages[index];

          const pageNumber =
            pageImage.pageNumber ||
            pageImage.num ||
            index + 1;

          if (!pageImage.data) {
            ocrResults.push({
              pageNumber,
              text: "",
              method: "OCR",
              warning: "Gagal mendapatkan gambar halaman PDF.",
            });

            continue;
          }

          try {
            const pageText = await recognizeImage(
              Buffer.from(pageImage.data),
              worker
            );

            ocrResults.push({
              pageNumber,
              text: pageText,
              method: "OCR",
              warning: pageText
                ? undefined
                : "OCR tidak menemukan teks yang dapat dibaca.",
            });
          } catch (error) {
            ocrResults.push({
              pageNumber,
              text: "",
              method: "OCR",
              warning: `OCR gagal: ${getErrorMessage(error)}`,
            });
          }
        }

        outputPages = ocrResults;

        const ocrText = normalizeText(
          ocrResults
            .map(
              (page) =>
                `--- HALAMAN ${page.pageNumber} ---\n${page.text}`
            )
            .join("\n\n")
        );

        if (ocrText) {
          text = ocrText;
          method = "PDF_OCR";
        }

        warnings.push(
          ...ocrResults
            .filter((page) => page.warning)
            .map(
              (page) =>
                `Halaman ${page.pageNumber}: ${page.warning}`
            )
        );

        if (
          totalPages &&
          totalPages > MAX_OCR_PAGES
        ) {
          warnings.push(
            `OCR hanya memproses ${MAX_OCR_PAGES} halaman pertama.`
          );
        }
      } catch (error) {
        warnings.push(
          `Proses OCR PDF gagal: ${getErrorMessage(error)}`
        );
      }
    }

    if (!text) {
      throw new Error(
        "PDF tidak menghasilkan teks. Dokumen mungkin rusak, dilindungi kata sandi, atau tidak dapat dibaca."
      );
    }

    return {
      text,
      method,
      warnings,
      pages: totalPages,
      pageResults: outputPages,
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }

    await parser.destroy();
  }
}

// ==========================================
// PUBLIC DOCUMENT EXTRACTOR
// ==========================================

/**
 * Ekstraksi dokumen untuk TKA TryOn Smart Import.
 *
 * @param {Object} options
 * @param {string} options.fileName
 * @param {Buffer} options.buffer
 *
 * @returns {Promise<Object>}
 */

export async function extractDocument({
  fileName,
  buffer,
}) {
  const extension = validateFile({
    fileName,
    buffer,
  });

  let result;

  switch (extension) {
    case ".docx":
      result = await extractWord(buffer);
      break;

    case ".pdf":
      result = await extractPdf(buffer);
      break;

    case ".jpg":
    case ".jpeg":
    case ".png":
      result = await extractImage(buffer);
      break;

    default:
      throw new Error(
        "Format dokumen tidak dikenali."
      );
  }

  return {
    success: true,
    fileName,
    fileType: extension.replace(".", "").toUpperCase(),
    extractionMethod: result.method,
    extractedText: result.text,
    pageCount: result.pages,
    pageResults: result.pageResults || [],
    warnings: result.warnings || [],
    extractedAt: new Date().toISOString(),
  };
}
