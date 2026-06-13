export type DemandTrend = "rising" | "steady" | "slowing" | "unknown";
export type UrgencyTier = "critical" | "high" | "moderate" | "low";

export interface InsightInput {
  drawSize: number;
  spotsFilled: number;
  eventDate: string;
  registrationClosesAt: string | null;
  registrationOpensAt: string | null;
  createdAt: string;
  status: string;
  city: string;
  state: string;
  directorEventsHosted: number;
  directorRating: number | null;
  recentRegistrationDates: string[];
}

export interface InsightResult {
  fillChancePct: number;
  daysToFill: number | null;
  registrationVelocity: number;
  avgVelocity: number;
  velocityRatio: number;
  demandTrend: DemandTrend;
  urgencyTier: UrgencyTier;
  daysUntilRegCloses: number | null;
  daysUntilEvent: number;
  fillPct: number;
  spotsRemaining: number;
  headline: string;
  subtext: string;
}

const AVG_VELOCITY = 2.5;
const VELOCITY_WINDOW_DAYS = 7;
const MAX_DAYS_OPEN = 60;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computeInsight(input: InsightInput): InsightResult {
  const now = Date.now();
  const {
    drawSize, spotsFilled, eventDate, registrationClosesAt,
    registrationOpensAt, createdAt, status,
    directorEventsHosted, directorRating, recentRegistrationDates,
  } = input;

  const spotsRemaining = Math.max(0, drawSize - spotsFilled);
  const fillPct = drawSize > 0 ? (spotsFilled / drawSize) * 100 : 0;

  const regOpenMs = new Date(registrationOpensAt ?? createdAt).getTime();
  const rawDaysOpen = (now - regOpenMs) / 86400000;
  const daysOpen = clamp(rawDaysOpen, 0.1, MAX_DAYS_OPEN);

  const eventMs = new Date(eventDate).getTime();
  const daysUntilEvent = Math.max(0, (eventMs - now) / 86400000);

  const daysUntilRegCloses = registrationClosesAt
    ? Math.max(0, (new Date(registrationClosesAt).getTime() - now) / 86400000)
    : null;

  // Velocity: registrations per day over last VELOCITY_WINDOW_DAYS
  const windowStart = now - VELOCITY_WINDOW_DAYS * 86400000;
  const recentCount = recentRegistrationDates.filter(
    (d) => new Date(d).getTime() >= windowStart,
  ).length;
  const windowDays = Math.min(daysOpen, VELOCITY_WINDOW_DAYS);
  let velocity = windowDays > 0 ? recentCount / windowDays : 0;

  // Fallback: if no recent data but there are historical registrations, use overall rate
  if (velocity === 0 && spotsFilled > 0) {
    velocity = spotsFilled / daysOpen;
  }

  // Demand trend: compare last 7 days to prior 7 days
  const priorWindowStart = windowStart - VELOCITY_WINDOW_DAYS * 86400000;
  const priorCount = recentRegistrationDates.filter((d) => {
    const t = new Date(d).getTime();
    return t >= priorWindowStart && t < windowStart;
  }).length;
  const priorVelocity = priorCount / VELOCITY_WINDOW_DAYS;

  let demandTrend: DemandTrend = "unknown";
  if (priorVelocity > 0) {
    const ratio = velocity / priorVelocity;
    if (ratio >= 1.15) demandTrend = "rising";
    else if (ratio <= 0.85) demandTrend = "slowing";
    else demandTrend = "steady";
  } else if (recentCount > 0) {
    demandTrend = "steady";
  }

  // Days to fill projection
  const daysToFill: number | null =
    spotsRemaining <= 0
      ? null
      : velocity > 0
      ? Math.ceil(spotsRemaining / velocity)
      : null;

  // Fill chance scoring (base 50, modifiers up to +50)
  let score = 50;

  // Fill percentage contribution (+30 max)
  score += (fillPct / 100) * 30;

  // Velocity vs average (+20 max)
  const velocityRatio = velocity / AVG_VELOCITY;
  score += clamp(velocityRatio, 0, 2) * 10;

  // Deadline pressure (+10 max, peaks inside 14-day window)
  if (daysUntilRegCloses !== null) {
    const deadlinePressure = clamp(1 - daysUntilRegCloses / 14, 0, 1);
    score += deadlinePressure * 10;
  }

  // Status signal (+8)
  if (status === "filling_fast") score += 8;

  // Director reputation (+5 max)
  score +=
    (directorEventsHosted > 5 ? 2 : 0) +
    (directorRating !== null && directorRating >= 4.5 ? 3 : 0);

  const fillChancePct = clamp(Math.round(score), 5, 99);

  // Urgency tier
  const closingSoon = daysUntilRegCloses !== null && daysUntilRegCloses <= 3;
  const closingThisWeek = daysUntilRegCloses !== null && daysUntilRegCloses <= 7;
  let urgencyTier: UrgencyTier = "low";
  if (fillChancePct >= 85 || closingSoon) urgencyTier = "critical";
  else if (fillChancePct >= 70 || closingThisWeek) urgencyTier = "high";
  else if (fillChancePct >= 50) urgencyTier = "moderate";

  // Headline
  let headline: string;
  if (spotsRemaining <= 0) {
    headline = "This tournament is FULL";
  } else if (daysToFill !== null && daysToFill <= 30) {
    headline = `${fillChancePct}% likely to fill in ${daysToFill} day${daysToFill === 1 ? "" : "s"}`;
  } else {
    headline = `${fillChancePct}% fill probability`;
  }

  // Subtext
  const velocityPctDiff = Math.round(Math.abs(velocityRatio - 1) * 100);
  const velocityPart =
    velocityRatio >= 1.05
      ? `Registering ${velocityPctDiff}% faster than average`
      : velocityRatio <= 0.95
      ? `Registering ${velocityPctDiff}% slower than average`
      : "Registering at an average pace";

  const trendPart =
    demandTrend === "rising"
      ? "demand is accelerating"
      : demandTrend === "slowing"
      ? "demand is tapering"
      : demandTrend === "steady"
      ? "demand trend is steady"
      : "early registration data";

  const ctaPart =
    urgencyTier === "critical" || urgencyTier === "high"
      ? "Lock your bracket position now."
      : "Secure your spot before it fills.";

  const subtext = `${velocityPart} – ${trendPart}. ${ctaPart}`;

  return {
    fillChancePct,
    daysToFill,
    registrationVelocity: Math.round(velocity * 10) / 10,
    avgVelocity: AVG_VELOCITY,
    velocityRatio: Math.round(velocityRatio * 100) / 100,
    demandTrend,
    urgencyTier,
    daysUntilRegCloses: daysUntilRegCloses !== null ? Math.round(daysUntilRegCloses) : null,
    daysUntilEvent: Math.round(daysUntilEvent),
    fillPct: Math.round(fillPct),
    spotsRemaining,
    headline,
    subtext,
  };
}

/** Build InsightInput from mock tournament data with synthetic registration dates for dev. */
export function buildMockInsightInput(t: {
  spots: number;
  filled: number;
  dateISO: string;
  status: string;
  location: string;
}): InsightInput {
  const now = Date.now();
  const daysOpen = 14;
  // Distribute filled registrations across last daysOpen days with slight recency weighting
  const syntheticDates = Array.from({ length: t.filled }, (_, i) => {
    const daysAgo = Math.pow(Math.random(), 0.6) * daysOpen;
    return new Date(now - daysAgo * 86400000).toISOString();
  }).sort().reverse();

  const [city, state] = t.location.split(", ");
  return {
    drawSize: t.spots,
    spotsFilled: t.filled,
    eventDate: t.dateISO,
    registrationClosesAt: new Date(now + 3 * 86400000).toISOString(),
    registrationOpensAt: new Date(now - daysOpen * 86400000).toISOString(),
    createdAt: new Date(now - daysOpen * 86400000).toISOString(),
    status: t.status.toLowerCase().replace(/ /g, "_"),
    city: city ?? "",
    state: state ?? "",
    directorEventsHosted: 8,
    directorRating: 4.6,
    recentRegistrationDates: syntheticDates,
  };
}
