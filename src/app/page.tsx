import Image from "next/image";
import { DemoFlow } from "@/components/demo/DemoFlow";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 rounded-lg border border-line bg-white px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
        <Image
          src="/brand/bcom-global-logo.png"
          alt="BCOM Global"
          width={464}
          height={213}
          priority
          className="h-14 w-auto shrink-0"
        />
        <div className="flex flex-col gap-1 sm:border-l sm:border-line sm:pl-6">
          <h1 className="text-2xl font-bold sm:text-3xl">Sales Assistant</h1>
          <p className="max-w-2xl text-muted">
          Upload a prospect&apos;s courier invoice, check the shipments, and turn them into a savings proposal and a
          WhatsApp message.
          </p>
        </div>
      </header>
      <DemoFlow />
    </main>
  );
}
