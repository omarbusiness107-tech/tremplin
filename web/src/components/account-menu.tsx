import Link from "next/link";
import { Bookmark, LogOut, Shield, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";

/**
 * Header account area. A server component, so a signed-out visitor never
 * downloads the signed-in UI and the header renders correctly on first
 * paint rather than flashing.
 */
export async function AccountMenu({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const profile = await getProfile();

  if (!profile) {
    return (
      <Button size="sm" asChild>
        <Link href={`/${locale}/login`}>{dict.nav.signIn}</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/${locale}/saved`}>
          <Bookmark />
          <span className="sr-only md:not-sr-only">{dict.nav.saved}</span>
        </Link>
      </Button>

      <Button variant="ghost" size="sm" asChild>
        <Link href={`/${locale}/profile`}>
          <UserRound />
          <span className="sr-only md:not-sr-only">
            {profile.full_name?.split(" ")[0] ?? dict.nav.profile}
          </span>
        </Link>
      </Button>

      {profile.is_admin && (
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/${locale}/admin`} aria-label={dict.nav.admin}>
            <Shield />
          </Link>
        </Button>
      )}

      {/* A form, not a link: signing out must not be triggerable by a GET. */}
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost" size="icon" aria-label={dict.nav.signOut}>
          <LogOut />
        </Button>
      </form>
    </div>
  );
}
