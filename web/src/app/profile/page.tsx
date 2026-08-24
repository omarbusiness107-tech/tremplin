import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/profile-form";
import { getPreferences, getProfile } from "@/lib/auth";
import { listDomains } from "@/lib/opportunities";

export const metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const [profile, preferences, domains] = await Promise.all([
    getProfile(),
    getPreferences(),
    listDomains(),
  ]);

  if (!profile || !preferences) redirect("/login?next=/profile");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground">
          The more of this you fill in, the better the recommendations get.
        </p>
      </header>

      <ProfileForm profile={profile} preferences={preferences} domains={domains} />
    </div>
  );
}
