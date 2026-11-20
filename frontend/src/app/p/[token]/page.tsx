import type { Metadata } from "next";
import { CustomerProposal } from "@/components/public/CustomerProposal";

export const metadata: Metadata = {
  title: "Your shipping savings proposal · BCOM Global",
  // A private link for one customer: keep it out of search engines.
  robots: { index: false, follow: false },
};

/** What the customer opens from their link. No partner screens are reachable from here. */
export default async function CustomerProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CustomerProposal token={token} />;
}
