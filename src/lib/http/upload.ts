import { AppError } from "./errors";

export const ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/** Checks the file's first bytes so a renamed file cannot pretend to be a PDF or image. */
function detectMimeType(bytes: Uint8Array): AcceptedMimeType | null {
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp"; // RIFF....WEBP
  }
  return null;
}

export interface ValidatedUpload {
  bytes: Uint8Array;
  mimeType: AcceptedMimeType;
  fileName: string;
}

export async function readInvoiceUpload(entry: FormDataEntryValue | null, maxMb: number): Promise<ValidatedUpload> {
  if (!(entry instanceof File)) {
    throw new AppError("Choose an invoice file to upload.", 400, "file_missing");
  }
  if (entry.size === 0) {
    throw new AppError("The file is empty.", 400, "file_empty");
  }
  if (entry.size > maxMb * 1024 * 1024) {
    throw new AppError(`The file is larger than ${maxMb} MB.`, 413, "file_too_large");
  }
  const bytes = new Uint8Array(await entry.arrayBuffer());
  const mimeType = detectMimeType(bytes);
  if (!mimeType) {
    throw new AppError("Upload a PDF, JPG, PNG or WEBP file.", 415, "file_unsupported");
  }
  return { bytes, mimeType, fileName: entry.name.slice(0, 120) || "invoice" };
}
