import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { getServerEnv } from "@/lib/config/env";
import { toErrorResponse } from "@/lib/http/errors";
import { readInvoiceUpload } from "@/lib/http/upload";
import { normalizeInvoice } from "@/lib/invoice/normalize";
import type { ExtractResponse } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reads an uploaded courier invoice with the active provider and returns clean, editable data. */
export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const formData = await request.formData();
    const upload = await readInvoiceUpload(formData.get("file"), env.MAX_UPLOAD_MB);

    const provider = getAIProvider();
    const raw = await provider.extractInvoice(upload);
    const body: ExtractResponse = { provider: provider.info, invoice: normalizeInvoice(raw) };
    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
