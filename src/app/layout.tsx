import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CRM — Enterprise Sales Hub",
    template: "%s · CRM",
  },
  description:
    "Full-stack enterprise CRM: leads, contacts, accounts, deal pipeline, activities and audit trail.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP nonce emitted per-request by src/proxy.ts. Passing it to ThemeProvider
  // makes next-themes stamp its pre-paint theme script with the nonce —
  // without it the strict production CSP (script-src 'nonce-…' 'strict-dynamic')
  // blocks that script and dark-mode users get a white flash before paint.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
