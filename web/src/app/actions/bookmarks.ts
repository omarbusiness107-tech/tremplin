"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface BookmarkResult {
  bookmarked: boolean;
  error: string | null;
}

/**
 * Adds or removes a bookmark for the signed-in user.
 *
 * `user_id` comes from the verified session, never from the client — the
 * RLS check would reject a forged one anyway, but not sending it at all
 * is the clearer contract.
 */
export async function toggleBookmark(
  opportunityId: string,
  bookmarked: boolean,
): Promise<BookmarkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { bookmarked: !bookmarked, error: "Sign in to save opportunities." };

  if (bookmarked) {
    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("opportunity_id", opportunityId);
    if (error) return { bookmarked: true, error: error.message };
  } else {
    const { error } = await supabase
      .from("bookmarks")
      .insert({ user_id: user.id, opportunity_id: opportunityId });
    // Racing double-clicks land here; the row exists either way.
    if (error && error.code !== "23505") return { bookmarked: false, error: error.message };
  }

  revalidatePath("/saved");
  revalidatePath(`/opportunities/${opportunityId}`);

  return { bookmarked: !bookmarked, error: null };
}
