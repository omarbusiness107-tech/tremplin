"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { EducationLevel, OpportunityType } from "@/lib/database.types";
import { OPPORTUNITY_TYPES } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";

const EDUCATION_LEVELS: EducationLevel[] = [
  "bac",
  "bac_plus_2",
  "licence",
  "master",
  "doctorat",
  "other",
];

export interface PreferencesState {
  ok: boolean;
  message: string | null;
}

/**
 * Saves the profile form.
 *
 * Everything is re-validated here rather than trusted from the form: a
 * server action is a public endpoint, and RLS only proves *who* is
 * writing, not that the values make sense.
 */
export async function savePreferences(
  _previous: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/profile");

  const educationRaw = String(formData.get("education_level") ?? "");
  const education = EDUCATION_LEVELS.includes(educationRaw as EducationLevel)
    ? (educationRaw as EducationLevel)
    : null;

  const targetTypes = formData
    .getAll("target_types")
    .map(String)
    .filter((t): t is OpportunityType => (OPPORTUNITY_TYPES as string[]).includes(t));

  const reminderDays = Number.parseInt(String(formData.get("deadline_reminder_days")), 10);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: cleanText(formData.get("full_name")) })
    .eq("id", user.id);

  if (profileError) return { ok: false, message: profileError.message };

  const { error } = await supabase
    .from("user_preferences")
    .update({
      education_level: education,
      fields_of_interest: formData.getAll("fields_of_interest").map(String),
      target_types: targetTypes,
      preferred_cities: splitList(formData.get("preferred_cities")),
      languages: splitList(formData.get("languages")),
      open_to_remote: formData.get("open_to_remote") === "on",
      email_alerts_enabled: formData.get("email_alerts_enabled") === "on",
      deadline_reminder_days:
        Number.isFinite(reminderDays) && reminderDays >= 0 && reminderDays <= 30
          ? reminderDays
          : 3,
    })
    .eq("user_id", user.id);

  if (error) return { ok: false, message: error.message };

  // The home page's recommendations are derived from these.
  revalidatePath("/profile");
  revalidatePath("/");

  return { ok: true, message: "Saved" };
}

function cleanText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

/** "Rabat, Casablanca" -> ["Rabat", "Casablanca"] */
function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}
