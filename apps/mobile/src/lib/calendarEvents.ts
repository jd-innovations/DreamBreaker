// Type-resolution fallback only. Metro always prefers the platform-specific
// file at bundle time (.native.ts on iOS/Android, .web.ts on web) -- this
// plain .ts exists purely so TypeScript's module resolver can find the
// import (mirrors QRScanner.tsx / ExploreMap.tsx in components/).
export { addToCalendar } from './calendarEvents.native';
export { withLink } from './calendarEvents.types';
export type { CalendarEventInput, AddToCalendarResult, AddToCalendarOutcome } from './calendarEvents.types';
