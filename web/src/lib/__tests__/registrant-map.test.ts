import { describe, expect, it } from "vitest";
import { milesBetween, summarize, toMapData } from "@/lib/director/registrant-map";

// Sarasota venue; Bradenton ~12 mi away; Tampa ~50 mi away.
const VENUE = { lat: 27.3364, lng: -82.5307 };
const rows = [
  { kind: "venue", key: "v", label: "Payne Park", sublabel: "Sarasota, FL", lat: VENUE.lat, lng: VENUE.lng, player_count: 0 },
  { kind: "court", key: "c1", label: "Bradenton Courts", sublabel: "Bradenton, FL", lat: 27.4989, lng: -82.5748, player_count: 3 },
  { kind: "city", key: "tampa|fl", label: "Tampa, FL", sublabel: "City", lat: 27.9506, lng: -82.4572, player_count: 2 },
  { kind: "court", key: "c2", label: "Other Bradenton Court", sublabel: "Bradenton, FL", lat: 27.47, lng: -82.56, player_count: 1 },
  { kind: "unplaced", key: "unplaced", label: "", sublabel: "", lat: null, lng: null, player_count: 4 },
  { kind: "guest", key: "guest", label: "", sublabel: "", lat: null, lng: null, player_count: 5 },
];

describe("toMapData", () => {
  it("splits venue, pins, unplaced and guests", () => {
    const d = toMapData(rows);
    expect(d.venue).toEqual({ name: "Payne Park", lat: VENUE.lat, lng: VENUE.lng });
    expect(d.pins.map((p) => p.key)).toEqual(["c1", "tampa|fl", "c2"]);
    expect(d.unplaced).toBe(4);
    expect(d.guests).toBe(5);
  });
  it("drops empty pins and has no venue without coordinates", () => {
    const d = toMapData([{ kind: "court", key: "x", label: "X", sublabel: "", lat: 1, lng: 1, player_count: 0 }]);
    expect(d.pins).toEqual([]);
    expect(d.venue).toBeNull();
  });
});

describe("summarize", () => {
  it("counts everyone, the local share and top cities by city", () => {
    const s = summarize(toMapData(rows));
    expect(s.total).toBe(3 + 2 + 1 + 4 + 5);
    expect(s.placed).toBe(6);
    expect(s.local).toBe(4); // both Bradenton pins, not Tampa
    expect(s.topCities).toEqual([{ city: "Bradenton, FL", count: 4 }, { city: "Tampa, FL", count: 2 }]);
  });
  it("has no local share without a venue", () => {
    expect(summarize(toMapData(rows.filter((r) => r.kind !== "venue"))).local).toBeNull();
  });
});

describe("milesBetween", () => {
  it("is roughly right", () => {
    expect(milesBetween(VENUE, { lat: 27.9506, lng: -82.4572 })).toBeGreaterThan(40);
    expect(milesBetween(VENUE, { lat: 27.9506, lng: -82.4572 })).toBeLessThan(45);
  });
});
