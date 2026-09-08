import { supabase } from '@/lib/supabase';

export type EventWeather = {
  available: true;
  date: string;
  temp: number | null;
  high: number | null;
  low: number | null;
  condition: string;
  icon: string;
  favorable: boolean;
  humidity: number | null;
  wind: number | null;
  precipChance: number | null;
};

export type EventWeatherUnavailable = {
  available: false;
  reason: 'out_of_range' | 'not_configured' | 'upstream_error' | 'bad_request' | 'method_not_allowed';
};

export type EventWeatherResult = EventWeather | EventWeatherUnavailable;

// Forecasts for a venue on a given event date via the event-weather edge
// function (keeps GOOGLE_WEATHER_API_KEY server-side). Google's Weather API
// only covers ~10 days out — dates outside that range resolve to
// { available: false, reason: 'out_of_range' } rather than throwing.
export async function fetchEventWeather(lat: number, lng: number, date: string): Promise<EventWeatherResult> {
  const { data, error } = await supabase.functions.invoke('event-weather', {
    body: { lat, lng, date },
  });

  if (error || !data) {
    return { available: false, reason: 'upstream_error' };
  }
  return data as EventWeatherResult;
}
