import { notFound, redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionary";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed = locale as Locale;

  const [dict, { error, next }] = await Promise.all([getDictionary(typed), searchParams]);

  if (await getCurrentUser()) redirect(next ?? `/${typed}`);

  return (
    <div className="mx-auto grid min-h-[calc(100vh-12rem)] w-full max-w-6xl gap-0 px-4 py-10 sm:px-6 sm:py-14 md:grid-cols-[0.9fr_1.1fr]">
      <div className="hidden border border-e-0 border-border-strong bg-primary-soft p-10 md:flex md:flex-col md:justify-between">
        <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">04 / {dict.brand.name}</p>
        <p className="max-w-sm font-display text-3xl leading-tight font-bold text-primary-soft-foreground">
          {dict.auth.signInSubtitle}
        </p>
      </div>

      <div className="flex flex-col justify-center border border-border-strong bg-surface p-6 sm:p-10">
        <div className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-bold sm:text-4xl">{dict.auth.signInTitle}</h1>
          <p className="text-sm text-muted-foreground md:hidden">{dict.auth.signInSubtitle}</p>
        </div>

        <LoginForm
          error={error}
          next={next}
          labels={{
            google: dict.auth.continueWithGoogle,
            or: dict.auth.or,
            emailPlaceholder: dict.auth.emailPlaceholder,
            send: dict.auth.sendLink,
            checkInbox: dict.auth.checkInbox,
            linkSent: dict.auth.linkSent,
          }}
        />

        <p className="mt-6 text-xs text-subtle-foreground">{dict.auth.browsingNote}</p>
      </div>
    </div>
  );
}
