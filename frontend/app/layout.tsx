import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Prova — Trustless Freelance Escrow on Celo",
  description:
    "Post jobs with cUSD bounties. Work gets evaluated. Escrow releases automatically. No central authority.",
  openGraph: {
    title: "Prova",
    description: "Trustless freelance escrow on Celo.",
    type: "website",
  },
  other: {
    "talentapp:project_verification":
      "e3873b0c419afcdc5e5d46abda278b379781d12af41b5d2e40bc32ffaee3cc544d5170e7cd0b585dc4d9807f3056e5bb836d9af8ace7a6ccc18d7d3dabfbdbb9",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
