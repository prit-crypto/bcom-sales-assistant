import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { getServerEnv } from "@/lib/config/env";
import { AppError } from "@/lib/http/errors";
import type { ConfigResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the UI which AI provider is active (never exposes keys). */
export async function GET(): Promise<NextResponse<ConfigResponse>> {
  const env = getServerEnv();
  try {
    return NextResponse.json({ provider: getAIProvider().info, problem: null, maxUploadMb: env.MAX_UPLOAD_MB });
  } catch (error) {
    const problem = error instanceof AppError ? error.message : "The AI provider is not configured correctly.";
    return NextResponse.json({ provider: null, problem, maxUploadMb: env.MAX_UPLOAD_MB });
  }
}
