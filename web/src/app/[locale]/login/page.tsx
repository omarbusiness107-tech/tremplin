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
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">{dict.auth.signInTitle}</h1>
        <p className="text-sm text-balance text-muted-foreground">{dict.auth.signInSubtitle}</p>
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

      <p className="text-center text-xs text-subtle-foreground">{dict.auth.browsingNote}</p>
    </div>
  );
}
