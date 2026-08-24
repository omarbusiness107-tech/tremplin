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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{dict.profile.title}</h1>
        <p className="text-sm text-muted-foreground">{dict.profile.subtitle}</p>
      </header>

      <ProfileForm
        profile={profile}
        preferences={preferences}
        domains={domains}
        dict={dict}
        domainLabels={Object.fromEntries(domainLabelMap(domains, typed))}
      />
    </div>
  );
}
