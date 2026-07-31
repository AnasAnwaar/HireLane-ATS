import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Hirelane — ATS Portal",
    template: "%s · Hirelane",
  },
  description:
    "AI-assisted applicant tracking: multi-channel job posting, automated screening, proctored assessments and interviews.",
};

/** Light theme only — the product ships a single, considered light palette. */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
