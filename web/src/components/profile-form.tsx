"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { savePreferences, type PreferencesState } from "@/app/actions/preferences";
import type { Domain, EducationLevel, UserPreferences } from "@/lib/database.types";
import type { ProfileSummary } from "@/lib/auth";
import type { Dictionary } from "@/i18n/dictionary";
import { OPPORTUNITY_TYPES } from "@/lib/filters";
import { cn } from "@/lib/utils";

const EDUCATION_VALUES: EducationLevel[] = [
  "bac",
  "bac_plus_2",
  "licence",
  "master",
  "doctorat",
  "other",
];

const INITIAL: PreferencesState = { ok: false, message: null };

interface Props {
  profile: ProfileSummary;
  preferences: UserPreferences;
  domains: Domain[];
  dict: Dictionary;
  /** Slug -> label in the active locale, resolved on the server. */
  domainLabels: Record<string, string>;
}

/**
 * Chips are rendered as real checkboxes/radios behind the label so the
 * form posts natively — the whole thing works as a plain FormData submit
 * rather than needing client state to mirror what is selected.
 */
export function ProfileForm({ profile, preferences, domains, dict, domainLabels }: Props) {
  const [state, formAction] = useActionState(savePreferences, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{dict.profile.about}</CardTitle>
          <CardDescription>{profile.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label={dict.profile.name} htmlFor="full_name">
            <input
              id="full_name"
              name="full_name"
              defaultValue={profile.full_name ?? ""}
              placeholder={dict.profile.namePlaceholder}
              className={inputClass}
            />
          </Field>

          <Field label={dict.profile.educationLevel} htmlFor="education_level">
            <select
              id="education_level"
              name="education_level"
              defaultValue={preferences.education_level ?? ""}
              className={inputClass}
            >
              <option value="">{dict.profile.preferNotToSay}</option>
              {EDUCATION_VALUES.map((value) => (
                <option key={value} value={value}>
                  {dict.education[value]}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict.profile.lookingFor}</CardTitle>
<CardDescription>{dict.profile.lookingForHelp}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <CheckboxChips
            legend={dict.profile.opportunityTypes}
            name="target_types"
            options={OPPORTUNITY_TYPES.map((t) => ({ value: t, label: dict.types[t] }))}
            selected={preferences.target_types}
          />

          <CheckboxChips
            legend={dict.profile.fieldsOfInterest}
            name="fields_of_interest"
            options={domains.map((d) => ({
              value: d.slug,
              label: domainLabels[d.slug] ?? d.slug,
            }))}
            selected={preferences.fields_of_interest}
          />

          <Field label={dict.profile.preferredCities} htmlFor="preferred_cities" hint={dict.profile.commaSeparated}>
            <input
              id="preferred_cities"
              name="preferred_cities"
              defaultValue={preferences.preferred_cities.join(", ")}
              placeholder="Rabat, Casablanca"
              className={inputClass}
            />
          </Field>

          <Field label={dict.profile.languagesSpoken} htmlFor="languages" hint={dict.profile.commaSeparated}>
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
            label={dict.profile.openToRemote}
            defaultChecked={preferences.open_to_remote}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict.profile.emailAlerts}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Toggle
            name="email_alerts_enabled"
            label={dict.profile.emailAlertsToggle}
            defaultChecked={preferences.email_alerts_enabled}
          />

          <Field
            label={dict.profile.reminderDays}
            htmlFor="deadline_reminder_days"
            hint={dict.profile.daysAhead}
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
        <SubmitButton label={dict.profile.save} />
        {state.message && (
          <p
            role="status"
            className={cn(
              "flex items-center gap-1.5 text-sm",
              state.ok ? "text-calm" : "text-destructive",
            )}
          >
            {state.ok && <CheckCircle2 className="size-4" aria-hidden />}
            {/* The action returns a database error verbatim, which is
                already in whatever language Postgres speaks; only the
                success case has a string worth translating. */}
            {state.ok ? dict.profile.saved : state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}

const inputClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
                "inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground transition-[background-color,color,border-color,transform] duration-200 ease-out active:scale-[0.98]",
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
