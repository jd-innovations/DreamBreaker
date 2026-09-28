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

export type CurrentWeather = {
  available: true;
  temp: number | null;
  feelsLike: number | null;
  humidity: number | null;
  uvIndex: number | null;
  condition: string;
  icon: string;
  precipChance: number | null;
  windSpeed: number | null;
  windDirection: string | null;
};

export type CurrentWeatherResult = CurrentWeather | EventWeatherUnavailable;

// Right-now conditions for the home-screen weather strip — same edge
// function, mode: 'current'.
export async function fetchCurrentWeather(lat: number, lng: number): Promise<CurrentWeatherResult> {
  const { data, error } = await supabase.functions.invoke('event-weather', {
    body: { lat, lng, mode: 'current' },
  });

  if (error || !data) {
    return { available: false, reason: 'upstream_error' };
  }
  return data as CurrentWeatherResult;
}

export type ForecastDay = {
  date: string;
  high: number | null;
  low: number | null;
  condition: string;
  icon: string;
  precipChance: number | null;
  windSpeed: number | null;
  windDirection: string | null;
};

export type WeatherForecastResult = { available: true; days: ForecastDay[] } | EventWeatherUnavailable;

// The next 5 days for the home-screen weather sheet — mode: 'forecast'.
export async function fetchWeatherForecast(lat: number, lng: number): Promise<WeatherForecastResult> {
  const { data, error } = await supabase.functions.invoke('event-weather', {
    body: { lat, lng, mode: 'forecast' },
  });

  if (error || !data) {
    return { available: false, reason: 'upstream_error' };
  }
  return data as WeatherForecastResult;
}
