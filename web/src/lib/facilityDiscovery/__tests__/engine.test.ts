import { describe, expect, it } from "vitest";
import {
  buildSnapshot, clean, cleanUrl, clusterSites, fromSnapshot, nameSites, snapshotFor, isGeneric, isValidBBox, mergeByPlace, pickPlace, rowFromGeocode,
  rowFromPlace, splitExisting, tiles, toCsv, type GooglePlace, type OsmElement, type Site,
} from "../engine";

const court = (id: number, lat: number, lon: number, tags: Record<string, string> = {}): OsmElement => ({ type: "way", id, center: { lat, lon }, tags });
const site = (lat: number, lon: number, extra: Partial<Site> = {}): Site => ({
  center: [lat, lon], pts: [[lat, lon]], ids: ["w1"], lit: false, surfaces: [], access: [], osmName: "", ...extra,
});
const place = (p: Partial<GooglePlace>): GooglePlace => ({ id: "ChIJtest", location: { latitude: 27.4, longitude: -82.5 }, ...p });

describe("clean", () => {
  it("strips control characters, formula prefixes and caps length", () => {
    expect(clean("=HYPERLINK(\"x\")")).toBe("HYPERLINK(\"x\")");
    expect(clean("+1 555")).toBe("1 555");
    expect(clean("-cmd")).toBe("cmd");
    expect(clean("a\u0000b\nc")).toBe("a b c");
    expect(clean("x".repeat(500), 10)).toHaveLength(10);
    expect(clean(null)).toBe("");
  });
  it("accepts only http(s) websites", () => {
    expect(cleanUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(cleanUrl("javascript:alert(1)")).toBe("");
    expect(cleanUrl("not a url")).toBe("");
  });
});

describe("clusterSites", () => {
  it("groups courts within 120 m and keeps distant ones apart", () => {
    const sites = clusterSites([
      court(1, 27.4, -82.5, { lit: "yes", surface: "hard" }),
      court(2, 27.4005, -82.5),
      court(3, 27.41, -82.5, { access: "private" }),
    ]);
    expect(sites).toHaveLength(2);
    const big = sites.find((s) => s.pts.length === 2)!;
    expect(big.lit).toBe(true);
    expect(big.ids.sort()).toEqual(["w1", "w2"]);
  });
  it("ignores duplicate elements (tile seams)", () => {
    expect(clusterSites([court(1, 27.4, -82.5), court(1, 27.4, -82.5)])[0].pts).toHaveLength(1);
  });
});

describe("splitExisting", () => {
  it("treats a site within 300 m of a listed facility as already listed", () => {
    const { fresh, backfill } = splitExisting(
      [site(27.4, -82.5), site(27.5, -82.5)],
      [{ id: "f1", google_place_id: null, name: "Park", latitude: 27.401, longitude: -82.5, court_count: 0 }],
    );
    expect(fresh).toHaveLength(1);
    expect(backfill[0]).toMatchObject({ facility_id: "f1", osm_court_count: 1 });
  });
});

describe("pickPlace", () => {
  const s = site(27.4, -82.5);
  it("rejects hotels, rentals and dorms", () => {
    expect(pickPlace([place({ displayName: { text: "Staybridge Suites" }, types: ["lodging"] })], s)).toBeNull();
    expect(pickPlace([place({ displayName: { text: "Searing Residence Hall" }, types: ["university"] })], s)).toBeNull();
  });
  it("prefers a name with pickleball over a nearer park", () => {
    const near = place({ id: "a", displayName: { text: "City Park" }, types: ["park"] });
    const pk = place({ id: "b", displayName: { text: "Pickleball Center" }, types: ["sports_club"], location: { latitude: 27.4008, longitude: -82.5 } });
    expect(pickPlace([near, pk], s)?.id).toBe("b");
  });
});

describe("rows", () => {
  it("renames generic listings and drops the house number", () => {
    const r = rowFromPlace(
      place({
        displayName: { text: "Tennis court" },
        addressComponents: [
          { types: ["street_number"], longText: "9417" },
          { types: ["route"], longText: "Andover Circle" },
          { types: ["locality"], longText: "Bradenton" },
        ],
      }),
      site(27.4, -82.5),
    );
    expect(r.facility_name).toBe("Pickleball Courts – Andover Circle, Bradenton");
    expect(r.address_line_1).toBe("Andover Circle");
  });
  it("keeps the full address for a named venue and only valid photo names", () => {
    const r = rowFromPlace(
      place({
        displayName: { text: "Payne Park" },
        addressComponents: [{ types: ["street_number"], longText: "2050" }, { types: ["route"], longText: "Adams Ln" }],
        photos: [{ name: "places/ChIJtest/photos/abc_1" }, { name: "../../etc" }],
      }),
      site(27.4, -82.5),
    );
    expect(r.address_line_1).toBe("2050 Adams Ln");
    expect(JSON.parse(String(r.photos))).toHaveLength(1);
  });
  it("never puts a house number on unmatched sites", () => {
    const r = rowFromGeocode(
      { status: "OK", results: [{ address_components: [{ types: ["street_number"], long_name: "6128" }, { types: ["route"], long_name: "Grandview Hill Ct" }] }] },
      site(27.4, -82.5),
    );
    expect(r.address_line_1).toBe("Grandview Hill Ct");
    expect(r.google_place_id).toBe("");
  });
  it("merges rows for the same Google place", () => {
    const merged = mergeByPlace([
      { google_place_id: "x", total_courts: 2, osm_court_count: 2, osm_ids: "w1" },
      { google_place_id: "x", total_courts: 4, osm_court_count: 4, osm_ids: "w2" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].total_courts).toBe(6);
  });
  it("quotes CSV cells", () => {
    expect(toCsv([{ facility_name: 'A, "B"' }], ["facility_name"])).toBe('facility_name\n"A, ""B"""\n');
  });
});

describe("helpers", () => {
  it("validates bounding boxes and tiles them", () => {
    expect(isValidBBox([27, -83, 28, -82])).toBe(true);
    expect(isValidBBox([28, -83, 27, -82])).toBe(false);
    expect(tiles([27, -83, 28, -82], 0.5)).toHaveLength(4);
    expect(isGeneric("Pickleball ct")).toBe(true);
    expect(isGeneric("Southwinds Tennis Courts")).toBe(false);
  });
});

describe("snapshots", () => {
  it("round-trips courts and the park around them", () => {
    const snap = buildSnapshot("FL", [27, -83, 28, -82], [court(5, 27.4, -82.5, { lit: "yes", access: "private" })], [
      { type: "way", id: 9, bounds: { minlat: 27.39, minlon: -82.51, maxlat: 27.41, maxlon: -82.49 }, tags: { name: "Lamb Park", leisure: "park" } },
      { type: "way", id: 10, bounds: { minlat: 27.7, minlon: -82.2, maxlat: 27.71, maxlon: -82.19 }, tags: { name: "Far Away Park", leisure: "park" } },
    ], "2026-11-24");
    expect(snap.areas).toHaveLength(1);
    const { courts, areas } = fromSnapshot(snap, [27.3, -82.6, 27.5, -82.4]);
    const sites = clusterSites(courts);
    nameSites(sites, areas);
    expect(sites[0]).toMatchObject({ lit: true, ids: ["w5"], osmName: "Lamb Park", access: ["private"] });
    expect(snapshotFor([snap], [27.3, -82.6, 27.5, -82.4])).toBe(snap);
    expect(snapshotFor([snap], [29, -82.6, 29.5, -82.4])).toBeNull();
  });
});
