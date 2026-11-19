import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BCOM Global · Sales Assistant",
  description: "Turn a prospect's courier invoice into a savings proposal and a WhatsApp message.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
