import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { toErrorResponse } from "@/lib/http/errors";
import { proposalRequestSchema } from "@/lib/http/request-schemas";
import { compareInvoice } from "@/lib/pricing/comparison";
import { buildSalesMessageFacts, renderTemplateMessage } from "@/lib/whatsapp/message";
import type { MessageResponse } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Writes the WhatsApp message. Numbers are recalculated here, never taken from the browser. */
export async function POST(request: Request) {
  try {
    const { invoice, partner } = proposalRequestSchema.parse(await request.json());
    const { summary } = compareInvoice(invoice);
    const facts = buildSalesMessageFacts(summary, partner);
    const provider = getAIProvider();

    if (provider.info.id === "mock") {
      const body: MessageResponse = { message: renderTemplateMessage(facts), source: "template", notice: null };
      return NextResponse.json(body);
    }

    try {
      const body: MessageResponse = { message: await provider.writeSalesMessage(facts), source: "ai", notice: null };
      return NextResponse.json(body);
    } catch (error) {
      // The message is not critical: fall back to the template so the demo can continue.
      console.error("[message] AI message failed, using template", error);
      const body: MessageResponse = {
        message: renderTemplateMessage(facts),
        source: "template",
        notice: `${provider.info.label} could not write the message, so the standard template was used.`,
      };
      return NextResponse.json(body);
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
