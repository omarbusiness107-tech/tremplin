import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  if (await getCurrentUser()) redirect(next ?? "/");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-8">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-balance text-muted-foreground">
          To save opportunities, get recommendations that fit your profile, and be
          emailed when something new matches.
        </p>
      </div>

      <LoginForm error={error} next={next} />

      <p className="text-center text-xs text-muted-foreground">
        Browsing works without an account — signing in only adds the personal parts.
      </p>
    </div>
  );
}
