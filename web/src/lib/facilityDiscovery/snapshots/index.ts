import type { OsmSnapshot } from "../engine";
import FL from "./FL.json";

/**
 * Committed OpenStreetMap court snapshots, one per state, read by the Discover
 * tab instead of the (often overloaded) public Overpass servers. Data
 * © OpenStreetMap contributors, ODbL. Refresh a state with:
 *   node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2 --refresh-osm --write-snapshot
 */
export const SNAPSHOTS: OsmSnapshot[] = [FL as unknown as OsmSnapshot];
