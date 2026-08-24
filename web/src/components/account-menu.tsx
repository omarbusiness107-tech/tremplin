import Link from "next/link";
import { Bookmark, LogOut, Shield, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";

/**
 * Header account area. A server component, so a signed-out visitor never
 * downloads the signed-in UI and the header renders correctly on first
 * paint rather than flashing.
 */
export async function AccountMenu() {
  const profile = await getProfile();

  if (!profile) {
    return (
      <Button size="sm" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/saved">
          <Bookmark />
          <span className="sr-only sm:not-sr-only">Saved</span>
        </Link>
      </Button>

      <Button variant="ghost" size="sm" asChild>
        <Link href="/profile">
          <UserRound />
          <span className="sr-only sm:not-sr-only">
            {profile.full_name?.split(" ")[0] ?? "Profile"}
          </span>
        </Link>
      </Button>

      {profile.is_admin && (
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin">
            <Shield />
            <span className="sr-only">Admin</span>
          </Link>
        </Button>
      )}

      {/* A form, not a link: signing out must not be triggerable by a GET. */}
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
          <LogOut />
        </Button>
      </form>
    </div>
  );
}
