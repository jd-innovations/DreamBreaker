// Your real Supabase user ID
const DEV_USER_ID = "8eb9b4cf-e059-4666-8c8f-1717cd0c0014";

/** Returns the current user ID. Skips the auth network call to avoid hangs on local network. */
export async function getUserId(): Promise<string> {
  return DEV_USER_ID;
}
