import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDate, formatMoney, formatMoneyExact, formatPercent } from "@/lib/format";
import type { ComparisonResult, GroupTotal } from "@/lib/pricing/comparison";
import { RATES, SERVICE_LABELS, ZONE_IDS } from "@/lib/pricing/rate-card";
import type { InvoiceData, ServiceLevel } from "@/types/invoice";
import { SERVICE_DESCRIPTIONS, commercialConditions } from "./terms";

export interface ProposalDocumentProps {
  /** BCOM Global logo (PNG bytes) */
  logo: Buffer;
  invoice: InvoiceData;
  comparison: ComparisonResult;
  partner: {
    partnerName: string;
    partnerCompany: string;
    partnerPhone: string;
    partnerEmail: string;
    prospectName: string;
  };
  issuedOn: string;
  validUntil: string;
  reference: string;
}

// Wrap whole words only (no "internation-al" splits in narrow table cells).
Font.registerHyphenationCallback((word) => [word]);

const COLORS = {
  ink: "#02386b", // BCOM logo navy
  muted: "#5d6b7c",
  line: "#d8dee6",
  band: "#f2f5f8",
  accent: "#1478c8", // BCOM blue
  good: "#1f7a4d",
  bad: "#b23a2e",
};

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 48, paddingHorizontal: 38, fontSize: 9, color: COLORS.ink, fontFamily: "Helvetica", lineHeight: 1.35 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: COLORS.ink, paddingBottom: 8, marginBottom: 14 },
  logo: { width: 104, height: 48 },
  brandSub: { fontSize: 9, color: COLORS.accent, marginTop: 4 },
  headerRight: { textAlign: "right", fontSize: 8, color: COLORS.muted },
  parties: { flexDirection: "row", gap: 12, marginBottom: 14 },
  party: { flex: 1, backgroundColor: COLORS.band, padding: 8, borderRadius: 3 },
  label: { fontSize: 7, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  strong: { fontFamily: "Helvetica-Bold" },
  headline: { fontSize: 20, lineHeight: 1.25, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  headlineAccent: { color: COLORS.accent },
  sub: { color: COLORS.muted, marginBottom: 12 },
  kpis: { flexDirection: "row", borderWidth: 1, borderColor: COLORS.line, borderRadius: 3, marginBottom: 16 },
  kpi: { flex: 1, padding: 8, borderRightWidth: 1, borderRightColor: COLORS.line },
  kpiLast: { flex: 1, padding: 8 },
  kpiValue: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 4 },
  section: { marginBottom: 14 },
  table: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 3 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.line },
  rowLast: { flexDirection: "row" },
  headRow: { flexDirection: "row", backgroundColor: COLORS.band, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  th: { padding: 5, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: COLORS.muted },
  td: { padding: 5 },
  num: { textAlign: "right" },
  good: { color: COLORS.good },
  bad: { color: COLORS.bad },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  small: { fontSize: 7.5, color: COLORS.muted },
  footer: { position: "absolute", bottom: 22, left: 38, right: 38, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: COLORS.muted, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 5 },
});

interface Column {
  title: string;
  flex: number;
  align?: "right";
}

function Table({ columns, rows }: { columns: Column[]; rows: (string | { text: string; tone?: "good" | "bad" })[][] }) {
  return (
    <View style={styles.table}>
      <View style={styles.headRow}>
        {columns.map((column) => (
          <Text key={column.title} style={[styles.th, { flex: column.flex }, column.align === "right" ? styles.num : {}]}>
            {column.title}
          </Text>
        ))}
      </View>
      {rows.map((cells, rowIndex) => (
        <View key={rowIndex} style={rowIndex === rows.length - 1 ? styles.rowLast : styles.row} wrap={false}>
          {cells.map((cell, cellIndex) => {
            const column = columns[cellIndex]!;
            const text = typeof cell === "string" ? cell : cell.text;
            const tone = typeof cell === "string" ? undefined : cell.tone;
            return (
              <Text
                key={cellIndex}
                style={[
                  styles.td,
                  { flex: column.flex },
                  column.align === "right" ? styles.num : {},
                  tone === "good" ? styles.good : tone === "bad" ? styles.bad : {},
                ]}
              >
                {text}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function savingCell(value: number) {
  return { text: formatMoneyExact(value), tone: value >= 0 ? ("good" as const) : ("bad" as const) };
}

function groupRows(groups: GroupTotal[]) {
  return groups.map((group) => [
    group.label,
    String(group.shipments),
    formatMoneyExact(group.current),
    formatMoneyExact(group.proposed),
    savingCell(group.saving),
  ]);
}

/** "Next day in the UAE, 1–4 days international" – built from the rate card's transit times. */
function transitRange(service: ServiceLevel): string {
  const domestic = RATES.Z1[service].transitTime;
  const days = ZONE_IDS.filter((zone) => zone !== "Z1").flatMap((zone) =>
    (RATES[zone][service].transitTime.match(/\d+/g) ?? []).map(Number),
  );
  return `${domestic} in the UAE, ${Math.min(...days)}–${Math.max(...days)} days international`;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item) => (
        <View key={item} style={styles.bullet}>
          <Text style={styles.bulletDot}>-</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Branded savings proposal for one prospect. Uses only numbers from the deterministic calculator. */
export function ProposalDocument({ logo, invoice, comparison, partner, issuedOn, validUntil, reference }: ProposalDocumentProps) {
  const { summary, rows } = comparison;
  const monthlyCurrent = summary.currentSpend * summary.monthlyFactor;
  const monthlyProposed = summary.proposedSpend * summary.monthlyFactor;

  const notCompared = rows.filter((row) => row.status !== "compared");
  const reasons = new Map<string, number>();
  notCompared.forEach((row) => reasons.set(row.reason ?? "Not compared", (reasons.get(row.reason ?? "Not compared") ?? 0) + 1));

  const periodText =
    invoice.periodStart && invoice.periodEnd
      ? `${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}`
      : "the period on the invoice";

  return (
    <Document title={`Shipping savings proposal – ${partner.prospectName}`} author={partner.partnerCompany} creator="BCOM Global Sales Assistant">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt attribute */}
            <Image style={styles.logo} src={{ data: logo, format: "png" }} />
            <Text style={styles.brandSub}>Shipping savings proposal</Text>
          </View>
          <View style={styles.headerRight}>
            <Text>Ref: {reference}</Text>
            <Text>Issued: {formatDate(issuedOn)}</Text>
            <Text>Valid until: {formatDate(validUntil)}</Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.label}>Prepared for</Text>
            <Text style={styles.strong}>{partner.prospectName}</Text>
            <Text style={styles.small}>Based on invoice {invoice.invoiceNumber ?? "provided"} from {invoice.carrierName ?? "your current courier"}</Text>
          </View>
          <View style={styles.party}>
            <Text style={styles.label}>Prepared by</Text>
            <Text style={styles.strong}>{partner.partnerName}</Text>
            <Text>{partner.partnerCompany}, BCOM Global partner</Text>
            {partner.partnerPhone ? <Text style={styles.small}>{partner.partnerPhone}</Text> : null}
            {partner.partnerEmail ? <Text style={styles.small}>{partner.partnerEmail}</Text> : null}
          </View>
        </View>

        <Text style={styles.headline}>
          Save about <Text style={styles.headlineAccent}>{formatMoney(summary.monthlySaving)}</Text> every month
        </Text>
        <Text style={styles.sub}>
          About {formatMoney(summary.yearlySaving)} a year, {formatPercent(summary.savingPct)} less than you pay today. Based on{" "}
          {summary.comparedShipments} of the {summary.totalShipments} shipments on your invoice for {periodText}.
        </Text>

        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.label}>You pay today / month</Text>
            <Text style={styles.kpiValue}>{formatMoney(monthlyCurrent)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>With BCOM / month</Text>
            <Text style={styles.kpiValue}>{formatMoney(monthlyProposed)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.label}>Monthly saving</Text>
            <Text style={[styles.kpiValue, styles.good]}>{formatMoney(summary.monthlySaving)}</Text>
          </View>
          <View style={styles.kpiLast}>
            <Text style={styles.label}>Shipments compared</Text>
            <Text style={styles.kpiValue}>
              {summary.comparedShipments} / {summary.totalShipments}
            </Text>
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Recommended services</Text>
          <Table
            columns={[
              { title: "Service", flex: 2.2 },
              { title: "Shipments", flex: 0.9, align: "right" },
              { title: "Today", flex: 1.2, align: "right" },
              { title: "With BCOM", flex: 1.2, align: "right" },
              { title: "Saving", flex: 1.2, align: "right" },
            ]}
            rows={summary.byService.map((group) => {
              const service = group.key as ServiceLevel;
              return [
                `${SERVICE_LABELS[service]}\n${SERVICE_DESCRIPTIONS[service]} ${transitRange(service)}.`,
                String(group.shipments),
                formatMoneyExact(group.current),
                formatMoneyExact(group.proposed),
                savingCell(group.saving),
              ];
            })}
          />
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Cost comparison by region</Text>
          <Table
            columns={[
              { title: "Region", flex: 2.2 },
              { title: "Shipments", flex: 0.9, align: "right" },
              { title: "Today", flex: 1.2, align: "right" },
              { title: "With BCOM", flex: 1.2, align: "right" },
              { title: "Saving", flex: 1.2, align: "right" },
            ]}
            rows={groupRows(summary.byZone)}
          />
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Your busiest routes</Text>
          <Table
            columns={[
              { title: "Route", flex: 2.2 },
              { title: "Shipments", flex: 0.9, align: "right" },
              { title: "Today", flex: 1.2, align: "right" },
              { title: "With BCOM", flex: 1.2, align: "right" },
              { title: "Saving", flex: 1.2, align: "right" },
            ]}
            rows={groupRows(summary.topLanes)}
          />
        </View>

        {notCompared.length > 0 ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Shipments not included in the saving</Text>
            <Bullets items={[...reasons.entries()].map(([reason, count]) => `${count} x ${reason}`)} />
            <Text style={styles.small}>We are happy to quote these separately.</Text>
          </View>
        ) : null}

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Commercial conditions</Text>
          <Bullets items={commercialConditions(formatDate(validUntil))} />
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>How we calculated this</Text>
          <View style={styles.small}>
            <Bullets items={summary.assumptions} />
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            BCOM Global · Prepared by {partner.partnerName}, {partner.partnerCompany}
          </Text>
          {/* No auto page numbers: in this react-pdf version a `render` Text hides the whole footer. */}
          <Text>Ref {reference}</Text>
        </View>
      </Page>
    </Document>
  );
}
