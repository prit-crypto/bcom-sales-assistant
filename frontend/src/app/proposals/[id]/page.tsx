import { ProposalPage } from "@/components/pipeline/ProposalPage";

export default async function SavedProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalPage key={id} id={id} />;
}
