import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LOCALES, dirFor, isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionary";
import "../globals.css";

/**
 * Both faces cover Latin and Arabic, which the mixed-script content here
 * needs — an Arabic concours title sits next to a French institution
 * name on the same card, and a Latin-only display face would fall back
 * mid-line to whatever the system happened to have.
 */
const readex = Readex_Pro({
  variable: "--font-readex",
  subsets: ["latin", "arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["latin", "arabic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/** Every locale is known ahead of time, so all three prerender. */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const dict = await getDictionary(locale);
  return {
    title: { default: dict.brand.name, template: `%s · ${dict.brand.name}` },
    description: dict.home.subtitle,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typed = locale as Locale;
  const dict = await getDictionary(typed);

  return (
    <html
      lang={typed}
      dir={dirFor(typed)}
      suppressHydrationWarning
      className={`${readex.variable} ${plexArabic.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-background">
        <SiteHeader locale={typed} dict={dict} />
        <main className="flex-1">{children}</main>
        <SiteFooter dict={dict} />
      </body>
    </html>
  );
}
