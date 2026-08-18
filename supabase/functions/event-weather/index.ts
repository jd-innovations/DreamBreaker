import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Forecast proxy for the community-event "Weather on Event Day" widget.
// Keeps GOOGLE_WEATHER_API_KEY server-side; the client only sends lat/lng/date.
// Google's Weather API only forecasts ~10 days out, so dates beyond that (or
// in the past) come back as { available: false, reason: "out_of_range" }.

const GOOGLE_WEATHER_API_KEY = Deno.env.get("GOOGLE_WEATHER_API_KEY") ?? "";
const FORECAST_DAYS = 10;

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  let body: { lat?: unknown; lng?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const date = typeof body.date === "string" ? body.date : "";

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }
  if (!DATE_RE.test(date)) {
    return new Response(JSON.stringify({ available: false, reason: "bad_request" }), { status: 400, headers: CORS });
  }

  const googleUrl =
    `https://weather.googleapis.com/v1/forecast/days:lookup` +
    `?key=${GOOGLE_WEATHER_API_KEY}` +
    `&location.latitude=${lat}&location.longitude=${lng}` +
    `&days=${FORECAST_DAYS}&unitsSystem=IMPERIAL`;

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
        relativeHumidity?: number;
        wind?: { speed?: { value?: number } };
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
  const { label, icon, favorable } = conditionFor(day.daytimeForecast?.weatherCondition?.type);

  const result = {
    available: true,
    date,
    temp: high != null && low != null ? Math.round((high + low) / 2) : (high ?? low ?? null),
    high: high != null ? Math.round(high) : null,
    low: low != null ? Math.round(low) : null,
    condition: label,
    icon,
    favorable,
    humidity: day.daytimeForecast?.relativeHumidity ?? null,
    wind: day.daytimeForecast?.wind?.speed?.value != null ? Math.round(day.daytimeForecast.wind.speed.value) : null,
    precipChance: day.daytimeForecast?.precipitation?.probability?.percent ?? null,
  };

  return new Response(JSON.stringify(result), { status: 200, headers: CORS });
});
