import { DemoFlow } from "@/components/demo/DemoFlow";

/** A saved proposal reopened in the five-step journey (it resumes at Savings). */
export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DemoFlow key={id} proposalId={id} />;
}
