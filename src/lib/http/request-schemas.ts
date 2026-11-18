import { z } from "zod";
import { SERVICE_LEVELS } from "@/types/invoice";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
/** Half-typed codes from the editor are treated as missing (same rule as getMissingFields). */
const countryCode = z
  .string()
  .max(3)
  .nullable()
  .transform((value) => (value !== null && /^[A-Z]{2}$/.test(value) ? value : null));
const shortText = (max: number) => z.string().trim().max(max).nullable();

export const shipmentSchema = z.object({
  id: z.string().min(1).max(40),
  date: isoDate,
  reference: shortText(80),
  originCity: shortText(80),
  originCountry: countryCode,
  destinationCity: shortText(80),
  destinationCountry: countryCode,
  weightKg: z.number().positive().max(100_000).nullable(),
  pieces: z.number().int().positive().max(100_000).nullable(),
  service: z.enum(SERVICE_LEVELS).nullable(),
  charge: z.number().positive().max(10_000_000).nullable(),
  included: z.boolean(),
});

export const invoiceSchema = z.object({
  carrierName: shortText(120),
  customerName: shortText(120),
  invoiceNumber: shortText(80),
  invoiceDate: isoDate,
  periodStart: isoDate,
  periodEnd: isoDate,
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  shipments: z.array(shipmentSchema).max(2000),
  warnings: z.array(z.string().max(500)).max(100),
});

export const partnerSchema = z.object({
  partnerName: z.string().trim().min(1).max(80),
  partnerCompany: z.string().trim().min(1).max(120),
  partnerPhone: z.string().trim().max(30).default(""),
  partnerEmail: z.string().trim().max(120).default(""),
  prospectName: z.string().trim().min(1).max(120),
  validityDays: z.number().int().min(7).max(90),
});

export const proposalRequestSchema = z.object({
  invoice: invoiceSchema,
  partner: partnerSchema,
});

export type PartnerInput = z.infer<typeof partnerSchema>;
export type ProposalRequest = z.infer<typeof proposalRequestSchema>;
