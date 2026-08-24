import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Compass } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Morocco Opportunities Tracker",
    template: "%s · Morocco Opportunities",
  },
  description:
    "Jobs, internships, degree programmes, scholarships and concours across Morocco — collected daily, sorted by deadline.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Compass className="size-5 text-primary" aria-hidden />
              <span className="hidden sm:inline">Morocco Opportunities</span>
              <span className="sm:hidden">Opportunities</span>
            </Link>
            <div className="ml-auto">
              <AccountMenu />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>

        <footer className="border-t border-border py-6">
          <p className="mx-auto w-full max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">
            Listings are collected from public sources and link back to the original
            announcement. Always confirm details on the issuing site before applying.
          </p>
        </footer>
      </body>
    </html>
  );
}
