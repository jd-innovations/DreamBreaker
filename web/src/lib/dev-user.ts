import { createClient } from "@/lib/supabase/client";

const DEV_USER_ID = "8eb9b4cf-e059-4666-8c8f-1717cd0c0014";

/** Returns the authenticated user's ID, falling back to the dev user in development. */
export async function getUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user.id;
  if (process.env.NODE_ENV === "development") return DEV_USER_ID;
  return null;
}
