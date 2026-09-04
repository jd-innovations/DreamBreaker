import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import type { AddToCalendarResult, CalendarEventInput } from './calendarEvents.types';

export { withLink } from './calendarEvents.types';

// Deliberately least-privilege: this file never calls
// Calendar.requestCalendarPermissionsAsync()/getCalendarPermissionsAsync().
// createEventInCalendarAsync() launches the OS's own event editor
// (EKEventEditViewController on iOS, a Calendar app intent on Android) and,
// per expo-calendar's docs, needs no calendar permission at all when used
// this way -- the user reviews/edits/saves inside the OS's own UI, and the
// app never reads or writes calendar data directly. See app.config.js for
// why the expo-calendar config plugin is intentionally NOT registered.
export async function addToCalendar(input: CalendarEventInput): Promise<AddToCalendarResult> {
  try {
    const result = await Calendar.createEventInCalendarAsync({
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      allDay: input.allDay ?? false,
      location: input.location,
      notes: input.notes,
    });

    if (Platform.OS === 'ios') {
      if (result.action === 'saved') return { outcome: 'saved' };
      if (result.action === 'canceled' || result.action === 'deleted') return { outcome: 'canceled' };
      return { outcome: 'unknown' };
    }

    // Android: expo-calendar's DialogEventResult.action is always 'done'
    // here regardless of whether the user saved, edited, or backed out of
    // the intent -- the platform gives no way to distinguish those. Treating
    // this as 'unknown' (rather than 'saved') keeps the caller from firing a
    // false success state.
    return { outcome: 'unknown' };
  } catch (e) {
    return { outcome: 'error', errorMessage: e instanceof Error ? e.message : 'Could not open Calendar.' };
  }
}
