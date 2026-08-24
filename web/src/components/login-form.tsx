"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function LoginForm({ error, next }: { error?: string; next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [message, setMessage] = useState<string | null>(error ?? null);

  const redirectTo =
    typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);

    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setMessage(error.message);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  async function signInWithGoogle() {
    setMessage(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setMessage(error.message);
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="size-6 text-calm" aria-hidden />
        <p className="text-sm font-medium">Check your inbox</p>
        <p className="text-sm text-balance text-muted-foreground">
          We sent a sign-in link to <span className="font-medium">{email}</span>. It is
          valid for one hour.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="outline" onClick={signInWithGoogle} className="w-full">
        Continue with Google
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={cn(
            "h-9 w-full rounded-md border border-input bg-card px-3 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        <Button type="submit" disabled={status === "sending"} className="w-full">
          {status === "sending" ? <Loader2 className="animate-spin" /> : <Mail />}
          Email me a sign-in link
        </Button>
      </form>

      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
