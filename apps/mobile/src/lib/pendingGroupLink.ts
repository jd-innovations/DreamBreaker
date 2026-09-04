// Ephemeral cross-screen navigation hint — set right before pushing to a
// create-event screen from a group's Events tab, consumed once that screen
// mounts so the newly created event can be linked back via play_events.group_id.
// Not user data, so plain module state (not Supabase) is fine here.

let _pendingGroupId: string | null = null;

export function setPendingGroupId(id: string | null): void {
  _pendingGroupId = id;
}

export function consumePendingGroupId(): string | null {
  const id = _pendingGroupId;
  _pendingGroupId = null;
  return id;
}
