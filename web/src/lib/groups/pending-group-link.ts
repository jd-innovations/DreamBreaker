// Web port of apps/mobile/src/lib/pendingGroupLink.ts — a one-shot,
// non-persistent, in-memory hand-off so "Create Event for This Group" can
// attach the new play_event's group_id without threading it through the
// URL/query string. Same semantics as mobile: set right before navigating
// to the event-creation flow, consumed (read-and-cleared) once the create
// form submits. A full page reload between those two steps drops it, same
// as mobile losing it if the app backgrounds and cold-starts in between.

let pendingGroupId: string | null = null;

export function setPendingGroupId(id: string | null): void {
  pendingGroupId = id;
}

export function consumePendingGroupId(): string | null {
  const id = pendingGroupId;
  pendingGroupId = null;
  return id;
}
