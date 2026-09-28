import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Forecast proxy for the community-event "Weather on Event Day" widget.
// Keeps GOOGLE_WEATHER_API_KEY server-side; the client only sends lat/lng/date.
// With { mode: "current" } it instead returns right-now conditions, and with
// { mode: "forecast" } the next 5 days (both for the home-screen weather).
// Google's Weather API only forecasts ~10 days out, so dates beyond that (or
// in the past) come back as { available: false, reason: "out_of_range" }.

const GOOGLE_WEATHER_API_KEY = Deno.env.get("GOOGLE_WEATHER_API_KEY") ?? "";
// Google pages daily forecasts 5 at a time by default; pageSize must match
// or days 6-10 silently never arrive.
const FORECAST_DAYS = 10;

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Event start time, local to the venue — "HH:MM" or Postgres "HH:MM:SS".
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// Google's weatherCondition.type → { label, Ionicons name, favorable }.
// Covers the full WeatherConditionType enum (see Google Weather API docs);
// unrecognized future values fall back to a generic non-favorable cloudy icon
// rather than failing the request.
const CONDITION_MAP: Record<string, { label: string; icon: string; favorable: boolean }> = {
  CLEAR:                     { label: "Sunny",              icon: "sunny-outline",       favorable: true },
  MOSTLY_CLEAR:              { label: "Mostly Sunny",       icon: "sunny-outline",       favorable: true },
  PARTLY_CLOUDY:             { label: "Partly Cloudy",      icon: "partly-sunny-outline", favorable: true },
  MOSTLY_CLOUDY:             { label: "Mostly Cloudy",      icon: "cloudy-outline",      favorable: true },
  CLOUDY:                    { label: "Cloudy",             icon: "cloudy-outline",      favorable: false },
  WINDY:                     { label: "Windy",              icon: "cloudy-outline",      favorable: false },
  WIND_AND_RAIN:             { label: "Windy & Rainy",      icon: "rainy-outline",       favorable: false },
  LIGHT_RAIN_SHOWERS:        { label: "Light Showers",      icon: "rainy-outline",       favorable: false },
  CHANCE_OF_SHOWERS:         { label: "Chance of Showers",  icon: "rainy-outline",       favorable: true },
  SCATTERED_SHOWERS:         { label: "Scattered Showers",  icon: "rainy-outline",       favorable: false },
  RAIN_SHOWERS:              { label: "Rain Showers",       icon: "rainy-outline",       favorable: false },
  HEAVY_RAIN_SHOWERS:        { label: "Heavy Showers",      icon: "rainy-outline",       favorable: false },
  LIGHT_TO_MODERATE_RAIN:    { label: "Light-Moderate Rain",icon: "rainy-outline",       favorable: false },
  MODERATE_TO_HEAVY_RAIN:    { label: "Moderate-Heavy Rain",icon: "rainy-outline",       favorable: false },
  RAIN:                      { label: "Rain",               icon: "rainy-outline",       favorable: false },
  LIGHT_RAIN:                { label: "Light Rain",         icon: "rainy-outline",       favorable: false },
  HEAVY_RAIN:                { label: "Heavy Rain",         icon: "rainy-outline",       favorable: false },
  RAIN_PERIODICALLY_HEAVY:   { label: "Periods of Rain",    icon: "rainy-outline",       favorable: false },
  LIGHT_SNOW_SHOWERS:        { label: "Light Snow Showers", icon: "snow-outline",        favorable: false },
  CHANCE_OF_SNOW_SHOWERS:    { label: "Chance of Snow",     icon: "snow-outline",        favorable: false },
  SCATTERED_SNOW_SHOWERS:    { label: "Scattered Snow",     icon: "snow-outline",        favorable: false },
  SNOW_SHOWERS:              { label: "Snow Showers",       icon: "snow-outline",        favorable: false },
  HEAVY_SNOW_SHOWERS:        { label: "Heavy Snow Showers", icon: "snow-outline",        favorable: false },
  LIGHT_TO_MODERATE_SNOW:    { label: "Light-Moderate Snow",icon: "snow-outline",        favorable: false },
  MODERATE_TO_HEAVY_SNOW:    { label: "Moderate-Heavy Snow",icon: "snow-outline",        favorable: false },
  SNOW:                      { label: "Snow",               icon: "snow-outline",        favorable: false },
  LIGHT_SNOW:                { label: "Light Snow",         icon: "snow-outline",        favorable: false },
  HEAVY_SNOW:                { label: "Heavy Snow",         icon: "snow-outline",        favorable: false },
  SNOWSTORM:                 { label: "Snowstorm",          icon: "snow-outline",        favorable: false },
  SNOW_PERIODICALLY_HEAVY:   { label: "Periods of Snow",    icon: "snow-outline",        favorable: false },
  HEAVY_SNOW_STORM:          { label: "Heavy Snowstorm",    icon: "snow-outline",        favorable: false },
  BLOWING_SNOW:              { label: "Blowing Snow",       icon: "snow-outline",        favorable: false },
  RAIN_AND_SNOW:             { label: "Rain & Snow",        icon: "snow-outline",        favorable: false },
  HAIL:                      { label: "Hail",               icon: "rainy-outline",       favorable: false },
  HAIL_SHOWERS:              { label: "Hail Showers",       icon: "rainy-outline",       favorable: false },
  THUNDERSTORM:              { label: "Thunderstorms",      icon: "thunderstorm-outline", favorable: false },
  THUNDERSHOWER:             { label: "Thunderstorms",      icon: "thunderstorm-outline", favorable: false },
  LIGHT_THUNDERSTORM_RAIN:   { label: "Light Thunderstorms",icon: "thunderstorm-outline", favorable: false },
  SCATTERED_THUNDERSTORMS:   { label: "Scattered Storms",   icon: "thunderstorm-outline", favorable: false },
  HEAVY_THUNDERSTORM:        { label: "Heavy Thunderstorms",icon: "thunderstorm-outline", favorable: false },
};

function conditionFor(type: string | undefined): { label: string; icon: string; favorable: boolean } {
  if (type && CONDITION_MAP[type]) return CONDITION_MAP[type];
  return { label: "Unsettled", icon: "cloudy-outline", favorable: false };
}

// Google's wind.direction.cardinal enum (e.g. SOUTH_SOUTHWEST) → "SSW".
const CARDINAL_WORDS: Record<string, string> = {
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
};

function cardinalAbbrev(cardinal: string | undefined): string | null {
  if (!cardinal) return null;
  const parts = cardinal.split("_").map(w => CARDINAL_WORDS[w]);
  return parts.every(Boolean) ? parts.join("") : null;
}

function round1(value: number | undefined): number | null {
  return value != null && Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

// mode: "current" — right-now conditions for the home-screen weather strip.
// Same key, same lat/lng validation; no date involved.
async function currentConditions(lat: number, lng: number): Promise<Response> {
  const googleUrl =
    `https://weather.googleapis.com/v1/currentConditions:lookup` +
    `?key=${GOOGLE_WEATHER_API_KEY}` +
    `&location.latitude=${lat}&location.longitude=${lng}` +
    `&unitsSystem=IMPERIAL`;

  let upstream: Response;
  try {
    upstream = await fetch(googleUrl);
  } catch {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }

  const json = await upstream.json().catch(() => null) as {
    temperature?: { degrees?: number };
    feelsLikeTemperature?: { degrees?: number };
    relativeHumidity?: number;
    uvIndex?: number;
    weatherCondition?: { type?: string };
    precipitation?: { probability?: { percent?: number } };
    wind?: { direction?: { cardinal?: string }; speed?: { value?: number } };
    isDaytime?: boolean;
  } | null;

  if (!json) {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }

  const { label, icon } = conditionFor(json.weatherCondition?.type);
  const result = {
    available: true,
    temp: round1(json.temperature?.degrees),
    feelsLike: round1(json.feelsLikeTemperature?.degrees),
    humidity: json.relativeHumidity ?? null,
    uvIndex: json.uvIndex ?? null,
    condition: label,
    icon: nightIcon(icon, json.isDaytime),
    precipChance: json.precipitation?.probability?.percent ?? null,
    windSpeed: round1(json.wind?.speed?.value),
    windDirection: cardinalAbbrev(json.wind?.direction?.cardinal),
  };
  return new Response(JSON.stringify(result), { status: 200, headers: CORS });
}

// mode: "forecast" — the next FORECAST_SHEET_DAYS days for the home-screen
// weather sheet. Same upstream call as the event lookup, but returns the list.
const FORECAST_SHEET_DAYS = 5;

async function dailyForecast(lat: number, lng: number): Promise<Response> {
  const googleUrl =
    `https://weather.googleapis.com/v1/forecast/days:lookup` +
    `?key=${GOOGLE_WEATHER_API_KEY}` +
    `&location.latitude=${lat}&location.longitude=${lng}` +
    `&days=${FORECAST_SHEET_DAYS}&unitsSystem=IMPERIAL`;

  let upstream: Response;
  try {
    upstream = await fetch(googleUrl);
  } catch {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }

  const json = await upstream.json().catch(() => null) as {
    forecastDays?: Array<{
      displayDate?: { year: number; month: number; day: number };
      maxTemperature?: { degrees?: number };
      minTemperature?: { degrees?: number };
      daytimeForecast?: {
        weatherCondition?: { type?: string };
        precipitation?: { probability?: { percent?: number } };
        wind?: { direction?: { cardinal?: string }; speed?: { value?: number } };
      };
    }>;
  } | null;

  const days = (json?.forecastDays ?? []).slice(0, FORECAST_SHEET_DAYS).flatMap(d => {
    const date = displayDateToIso(d.displayDate);
    if (!date) return [];
    const { label, icon } = conditionFor(d.daytimeForecast?.weatherCondition?.type);
    const high = d.maxTemperature?.degrees;
    const low = d.minTemperature?.degrees;
    return [{
      date,
      high: high != null ? Math.round(high) : null,
      low: low != null ? Math.round(low) : null,
      condition: label,
      icon,
      precipChance: d.daytimeForecast?.precipitation?.probability?.percent ?? null,
      windSpeed: round1(d.daytimeForecast?.wind?.speed?.value),
      windDirection: cardinalAbbrev(d.daytimeForecast?.wind?.direction?.cardinal),
    }];
  });

  if (days.length === 0) {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }
  return new Response(JSON.stringify({ available: true, days }), { status: 200, headers: CORS });
}

// The sun icons are daytime-only; at night show the moon equivalents.
function nightIcon(icon: string, isDaytime: boolean | undefined): string {
  if (isDaytime !== false) return icon;
  if (icon === "sunny-outline") return "moon-outline";
  if (icon === "partly-sunny-outline") return "cloudy-night-outline";
  return icon;
}

type ForecastHour = {
  displayDateTime?: { year: number; month: number; day: number; hours?: number };
  isDaytime?: boolean;
  weatherCondition?: { type?: string };
  temperature?: { degrees?: number };
  feelsLikeTemperature?: { degrees?: number };
  relativeHumidity?: number;
  precipitation?: { probability?: { percent?: number } };
  wind?: { direction?: { cardinal?: string }; speed?: { value?: number } };
};

// Google's hourly forecast starts at the current hour and pages 24 hours at a
// time (240 max). Walk pages until the wanted hour turns up or the date is
// passed. hour == null means "the first hour on this date", which is only
// meaningful for today (= now); any other date without a time returns null.
async function findForecastHour(lat: number, lng: number, date: string, hour: number | null): Promise<ForecastHour | null> {
  let pageToken = "";
  for (let page = 0; page < FORECAST_DAYS; page++) {
    const url =
      `https://weather.googleapis.com/v1/forecast/hours:lookup` +
      `?key=${GOOGLE_WEATHER_API_KEY}` +
      `&location.latitude=${lat}&location.longitude=${lng}` +
      `&hours=240&pageSize=24&unitsSystem=IMPERIAL` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const json = await res.json().catch(() => null) as { forecastHours?: ForecastHour[]; nextPageToken?: string } | null;
    const hours = json?.forecastHours ?? [];

    if (hour == null) {
      const first = hours[0];
      return first && displayDateToIso(first.displayDateTime) === date ? first : null;
    }

    for (const h of hours) {
      const hDate = displayDateToIso(h.displayDateTime);
      if (hDate === date && h.displayDateTime?.hours === hour) return h;
      if (hDate != null && hDate > date) return null;
    }
    if (!json?.nextPageToken) return null;
    pageToken = json.nextPageToken;
  }
  return null;
}

function displayDateToIso(d: { year: number; month: number; day: number } | undefined): string | null {
  if (!d) return null;
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ available: false, reason: "method_not_allowed" }), { status: 405, headers: CORS });
  }
  if (!GOOGLE_WEATHER_API_KEY) {
    return new Response(JSON.stringify({ available: false, reason: "not_configured" }), { status: 500, headers: CORS });
  }

  let body: { lat?: unknown; lng?: unknown; date?: unknown; time?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" && TIME_RE.test(body.time) ? body.time : null;

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }
  if (body.mode === "current") {
    return await currentConditions(lat, lng);
  }
  if (body.mode === "forecast") {
    return await dailyForecast(lat, lng);
  }
  if (!DATE_RE.test(date)) {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }

  const googleUrl =
    `https://weather.googleapis.com/v1/forecast/days:lookup` +
    `?key=${GOOGLE_WEATHER_API_KEY}` +
    `&location.latitude=${lat}&location.longitude=${lng}` +
    `&days=${FORECAST_DAYS}&pageSize=${FORECAST_DAYS}&unitsSystem=IMPERIAL`;

  // The day gives high/low; the hour (event start, or now for a time-less
  // today) gives the headline. Both calls run together.
  const [upstream, hourData] = await Promise.all([
    fetch(googleUrl).catch(() => null),
    findForecastHour(lat, lng, date, time ? Number(time.slice(0, 2)) : null),
  ]);

  if (!upstream || !upstream.ok) {
    return new Response(JSON.stringify({ available: false, reason: "upstream_error" }), { status: 502, headers: CORS });
  }

  const json = await upstream.json().catch(() => null) as {
    forecastDays?: Array<{
      displayDate?: { year: number; month: number; day: number };
      maxTemperature?: { degrees?: number };
      minTemperature?: { degrees?: number };
      daytimeForecast?: {
        weatherCondition?: { type?: string };
        relativeHumidity?: number;
        wind?: { direction?: { cardinal?: string }; speed?: { value?: number } };
        precipitation?: { probability?: { percent?: number } };
      };
    }>;
  } | null;

  const day = json?.forecastDays?.find(d => displayDateToIso(d.displayDate) === date);

  if (!day) {
    return new Response(JSON.stringify({ available: false, reason: "out_of_range" }), { status: 200, headers: CORS });
  }

  const high = day.maxTemperature?.degrees;
  const low = day.minTemperature?.degrees;
  const daytime = day.daytimeForecast;

  // temp/feelsLike exist only when an actual forecast hour was found. There is
  // deliberately no fallback: averaging the day's high and low produced a
  // number (76 on an 87/65 day) that matched no hour of that day.
  const conditionSource = hourData ? hourData.weatherCondition?.type : daytime?.weatherCondition?.type;
  const { label, icon, favorable } = conditionFor(conditionSource);
  const windSpeed = hourData ? hourData.wind?.speed?.value : daytime?.wind?.speed?.value;

  const result = {
    available: true,
    date,
    // "HH:00" of the forecast hour the headline describes; null = day-level only.
    forecastHour: hourData?.displayDateTime?.hours != null
      ? `${String(hourData.displayDateTime.hours).padStart(2, "0")}:00`
      : null,
    temp: hourData ? round1(hourData.temperature?.degrees) : null,
    feelsLike: hourData ? round1(hourData.feelsLikeTemperature?.degrees) : null,
    high: high != null ? Math.round(high) : null,
    low: low != null ? Math.round(low) : null,
    condition: label,
    icon: hourData ? nightIcon(icon, hourData.isDaytime) : icon,
    favorable,
    humidity: (hourData ? hourData.relativeHumidity : daytime?.relativeHumidity) ?? null,
    wind: windSpeed != null ? Math.round(windSpeed) : null,
    windDirection: cardinalAbbrev(hourData ? hourData.wind?.direction?.cardinal : daytime?.wind?.direction?.cardinal),
    precipChance: (hourData ? hourData.precipitation?.probability?.percent : daytime?.precipitation?.probability?.percent) ?? null,
  };

  return new Response(JSON.stringify(result), { status: 200, headers: CORS });
});
