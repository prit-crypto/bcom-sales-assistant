import { AppError, toErrorResponse } from "@/lib/http/errors";
import { proposalRequestSchema } from "@/lib/http/request-schemas";
import { renderProposalPdf } from "@/lib/proposal/render";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Builds the customer proposal PDF. Numbers are recalculated here, never taken from the browser. */
export async function POST(request: Request) {
  try {
    const { invoice, partner } = proposalRequestSchema.parse(await request.json());
    const result = await renderProposalPdf(invoice, partner);
    if (!result) {
      throw new AppError("No shipments could be compared, so there is nothing to propose yet.", 422, "nothing_to_propose");
    }
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.reference}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
