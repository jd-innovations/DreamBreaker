import type { AddToCalendarResult, CalendarEventInput } from './calendarEvents.types';

export { withLink } from './calendarEvents.types';

// expo-calendar has no web implementation -- never import it here so the web
// bundle stays build-safe, mirroring the QRScanner.web.tsx / ExploreMap.web.tsx
// pattern already used in this app for other native-only modules.
export async function addToCalendar(_input: CalendarEventInput): Promise<AddToCalendarResult> {
  return { outcome: 'unsupported' };
}
