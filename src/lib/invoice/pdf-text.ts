import { extractText } from "unpdf";

/** Extracts the text of each page of a PDF (no OCR – works only for PDFs that contain real text). */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  // unpdf may take ownership of the buffer, so pass a copy.
  const { text } = await extractText(new Uint8Array(bytes), { mergePages: false });
  return text;
}
