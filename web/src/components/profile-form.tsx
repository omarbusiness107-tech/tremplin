"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { savePreferences, type PreferencesState } from "@/app/actions/preferences";
import type { Domain, EducationLevel, UserPreferences } from "@/lib/database.types";
import type { ProfileSummary } from "@/lib/auth";
import { TYPE_LABELS } from "@/lib/deadline";
import { OPPORTUNITY_TYPES } from "@/lib/filters";
import { cn } from "@/lib/utils";

const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: "bac", label: "Baccalauréat" },
  { value: "bac_plus_2", label: "Bac +2" },
  { value: "licence", label: "Licence (Bac +3)" },
  { value: "master", label: "Master (Bac +5)" },
  { value: "doctorat", label: "Doctorate" },
  { value: "other", label: "Other" },
];

const INITIAL: PreferencesState = { ok: false, message: null };

interface Props {
  profile: ProfileSummary;
  preferences: UserPreferences;
  domains: Domain[];
}

/**
 * Chips are rendered as real checkboxes/radios behind the label so the
 * form posts natively — the whole thing works as a plain FormData submit
 * rather than needing client state to mirror what is selected.
 */
export function ProfileForm({ profile, preferences, domains }: Props) {
  const [state, formAction] = useActionState(savePreferences, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>{profile.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Name" htmlFor="full_name">
            <input
              id="full_name"
              name="full_name"
              defaultValue={profile.full_name ?? ""}
              placeholder="Your name"
              className={inputClass}
            />
          </Field>

          <Field label="Current education level" htmlFor="education_level">
            <select
              id="education_level"
              name="education_level"
              defaultValue={preferences.education_level ?? ""}
              className={inputClass}
            >
              <option value="">Prefer not to say</option>
              {EDUCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What you are looking for</CardTitle>
          <CardDescription>
            Used to rank the &ldquo;Recommended for you&rdquo; list and to decide which new
            listings are worth emailing you about.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <CheckboxChips
            legend="Opportunity types"
            name="target_types"
            options={OPPORTUNITY_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
            selected={preferences.target_types}
          />

          <CheckboxChips
            legend="Fields of interest"
            name="fields_of_interest"
            options={domains.map((d) => ({ value: d.slug, label: d.label_en }))}
            selected={preferences.fields_of_interest}
          />

          <Field label="Preferred cities" htmlFor="preferred_cities" hint="Comma separated">
            <input
              id="preferred_cities"
              name="preferred_cities"
              defaultValue={preferences.preferred_cities.join(", ")}
              placeholder="Rabat, Casablanca"
              className={inputClass}
            />
          </Field>

          <Field label="Languages you speak" htmlFor="languages" hint="Comma separated">
            <input
              id="languages"
              name="languages"
              defaultValue={preferences.languages.join(", ")}
              placeholder="Arabic, French, English"
              className={inputClass}
            />
          </Field>

          <Toggle
            name="open_to_remote"
            label="Open to remote opportunities"
            defaultChecked={preferences.open_to_remote}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email alerts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Toggle
            name="email_alerts_enabled"
            label="Email me when a new opportunity matches my profile"
            defaultChecked={preferences.email_alerts_enabled}
          />

          <Field
            label="Remind me before a saved deadline"
            htmlFor="deadline_reminder_days"
            hint="Days ahead (0–30)"
          >
            <input
              id="deadline_reminder_days"
              name="deadline_reminder_days"
              type="number"
              min={0}
              max={30}
              defaultValue={preferences.deadline_reminder_days}
              className={cn(inputClass, "w-24")}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton />
        {state.message && (
          <p
            role="status"
            className={cn(
              "flex items-center gap-1.5 text-sm",
              state.ok ? "text-calm" : "text-destructive",
            )}
          >
            {state.ok && <CheckCircle2 className="size-4" aria-hidden />}
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      Save profile
    </Button>
  );
}

const inputClass =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {hint && <span className="ml-2 font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  );
}

function CheckboxChips({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  selected: string[];
}) {
  const chosen = new Set(selected);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer [&:focus-within>span]:ring-2 [&:focus-within>span]:ring-ring"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={chosen.has(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors",
                "hover:border-foreground/25 hover:text-foreground",
                "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
