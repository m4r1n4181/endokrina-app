const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = Buffer.from("%PDF");

export type DetectedMime = "application/pdf" | "image/jpeg" | "image/png";

export function detectUploadMime(fileBytes: Buffer): DetectedMime | null {
  if (fileBytes.length >= 4 && fileBytes.subarray(0, 4).equals(PDF_MAGIC)) return "application/pdf";
  if (fileBytes.length >= 8 && fileBytes.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  if (fileBytes.length >= 3 && fileBytes.subarray(0, 3).equals(JPEG_MAGIC)) return "image/jpeg";
  return null;
}

export function pngDimensions(fileBytes: Buffer): { width: number; height: number } | null {
  if (fileBytes.length < 24 || detectUploadMime(fileBytes) !== "image/png") return null;
  return {
    width: fileBytes.readUInt32BE(16),
    height: fileBytes.readUInt32BE(20),
  };
}

export function jpegDimensions(fileBytes: Buffer): { width: number; height: number } | null {
  if (detectUploadMime(fileBytes) !== "image/jpeg") return null;
  let offset = 2;
  while (offset + 9 < fileBytes.length) {
    if (fileBytes[offset] !== 0xff) return null;
    const marker = fileBytes[offset + 1];
    const length = fileBytes.readUInt16BE(offset + 2);
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        height: fileBytes.readUInt16BE(offset + 5),
        width: fileBytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

export function isLikelyUnreadableImage(fileBytes: Buffer, mime: DetectedMime): boolean {
  if (fileBytes.length < 512) return true;
  if (mime === "application/pdf") return false;
  const size = mime === "image/png" ? pngDimensions(fileBytes) : jpegDimensions(fileBytes);
  if (!size) return true;
  return size.width < 200 || size.height < 200;
}

const FILENAME_DATE = /(\d{4})[-_.](\d{2})[-_.](\d{2})/;
const PDF_CREATION = /D:(\d{4})(\d{2})(\d{2})/;
const ISO_DATE = /(\d{4}-\d{2}-\d{2})/;

function isPlausibleDate(year: number, month: number, day: number): boolean {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function extractAdvisoryLabDate(fileBytes: Buffer, originalFileName: string): string | null {
  const fromName = originalFileName.match(FILENAME_DATE);
  if (fromName) {
    const year = Number(fromName[1]);
    const month = Number(fromName[2]);
    const day = Number(fromName[3]);
    if (isPlausibleDate(year, month, day)) {
      return `${fromName[1]}-${fromName[2]}-${fromName[3]}`;
    }
  }

  const sample = fileBytes.subarray(0, Math.min(fileBytes.length, 256 * 1024)).toString("latin1");
  const pdfDate = sample.match(PDF_CREATION);
  if (pdfDate) {
    const year = Number(pdfDate[1]);
    const month = Number(pdfDate[2]);
    const day = Number(pdfDate[3]);
    if (isPlausibleDate(year, month, day)) {
      return `${pdfDate[1]}-${pdfDate[2]}-${pdfDate[3]}`;
    }
  }

  const iso = sample.match(ISO_DATE);
  if (iso && FILENAME_DATE.test(iso[1].replace(/-/g, "-"))) {
    const [year, month, day] = iso[1].split("-").map(Number);
    if (isPlausibleDate(year, month, day)) return iso[1];
  }

  return null;
}

export function isLabDateStale(isoDate: string, thresholdDays: number, now: Date = new Date()): boolean {
  const extracted = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(extracted.getTime())) return false;
  const ageMs = now.getTime() - extracted.getTime();
  return ageMs > thresholdDays * 24 * 60 * 60 * 1000;
}
