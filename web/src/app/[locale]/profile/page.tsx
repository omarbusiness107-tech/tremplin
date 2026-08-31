import { notFound, redirect } from "next/navigation";

import { ProfileForm } from "@/components/profile-form";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionary";
import { getPreferences, getProfile } from "@/lib/auth";
import { domainLabelMap } from "@/lib/labels";
import { listDomains } from "@/lib/opportunities";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed = locale as Locale;

  const [dict, profile, preferences, domains] = await Promise.all([
    getDictionary(typed),
    getProfile(),
    getPreferences(),
    listDomains(),
  ]);

  if (!profile || !preferences) redirect(`/${typed}/login?next=/${typed}/profile`);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
      <header className="h-fit border-b border-border pb-6 lg:sticky lg:top-28">
        <p className="mb-3 text-xs font-bold tracking-[0.16em] text-primary uppercase">03 / {dict.nav.profile}</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{dict.profile.title}</h1>
        <p className="text-sm text-muted-foreground">{dict.profile.subtitle}</p>
      </header>

      <div className="min-w-0">
        <ProfileForm
          profile={profile}
          preferences={preferences}
          domains={domains}
          dict={dict}
          domainLabels={Object.fromEntries(domainLabelMap(domains, typed))}
        />
      </div>
    </div>
  );
}
