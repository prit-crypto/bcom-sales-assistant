import "server-only";
import { AppError } from "@/lib/http/errors";
import { parseSampleInvoiceText } from "@/lib/invoice/mock-parser";
import { extractPdfPages } from "@/lib/invoice/pdf-text";
import { renderTemplateMessage } from "@/lib/whatsapp/message";
import type { AIProvider } from "../types";

/** No-AI provider: reads only our sample invoice format and uses a fixed message template. Costs nothing. */
export function createMockProvider(): AIProvider {
  return {
    info: { id: "mock", label: "Mock (no AI)", model: null, readsImages: false },

    async extractInvoice(file) {
      if (file.mimeType !== "application/pdf") {
        throw new AppError(
          "Mock mode reads only the sample PDF invoices. To read photos, set AI_PROVIDER to gemini or openai.",
          422,
          "mock_unsupported_file",
        );
      }
      const pages = await extractPdfPages(file.bytes);
      const raw = parseSampleInvoiceText(pages);
      if (raw.shipments.length === 0) {
        throw new AppError(
          "Mock mode could not find shipment lines. It only reads the bundled sample invoices. To read other invoices, set AI_PROVIDER to gemini or openai.",
          422,
          "mock_unknown_format",
        );
      }
      return raw;
    },

    async writeSalesMessage(facts) {
      return renderTemplateMessage(facts);
    },
  };
}
