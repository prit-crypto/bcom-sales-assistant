import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PartnerInput } from "@/lib/http/request-schemas";
import { compareInvoice } from "@/lib/pricing/comparison";
import type { InvoiceData } from "@/types/invoice";
import { ProposalDocument } from "./ProposalDocument";

const LOGO_PATH = path.join(process.cwd(), "public", "brand", "bcom-global-logo.png");
let logoCache: Buffer | undefined;

async function loadLogo(): Promise<Buffer> {
  logoCache ??= await readFile(LOGO_PATH);
  return logoCache;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Recalculates the comparison and renders the proposal PDF. */
export async function renderProposalPdf(invoice: InvoiceData, partner: PartnerInput, now = new Date()) {
  const comparison = compareInvoice(invoice);
  if (comparison.summary.comparedShipments === 0) {
    return null;
  }
  const validUntil = new Date(now.getTime() + partner.validityDays * 24 * 60 * 60 * 1000);
  const reference = `BCOM-P-${isoDay(now).replace(/-/g, "")}-${(invoice.invoiceNumber ?? "INV").replace(/[^A-Za-z0-9]/g, "").slice(-6)}`;

  const buffer = await renderToBuffer(
    <ProposalDocument
      logo={await loadLogo()}
      invoice={invoice}
      comparison={comparison}
      partner={partner}
      issuedOn={isoDay(now)}
      validUntil={isoDay(validUntil)}
      reference={reference}
    />,
  );
  return { buffer, reference };
}
