/**
 * Ask the server to refresh a facility's cached public pages after an admin
 * change (see /api/admin/revalidate-court). Best effort: the edit is already
 * saved, so a failure only means the page catches up within the hour.
 */
export async function refreshCourtPages(facilityId: string, previous?: { state: string; city: string }): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/revalidate-court", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facilityId, previous }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
