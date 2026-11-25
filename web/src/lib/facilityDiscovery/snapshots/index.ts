import type { OsmSnapshot } from "../engine";
import FL from "./FL.json";
import NC from "./NC.json";
import AZ from "./AZ.json";
import CA from "./CA.json";
import NJ from "./NJ.json";
import TX from "./TX.json";
import GA from "./GA.json";
import SC from "./SC.json";
import TN from "./TN.json";

/**
 * Committed OpenStreetMap court snapshots, one per state, read by the Discover
 * tab instead of the (often overloaded) public Overpass servers. Data
 * © OpenStreetMap contributors, ODbL. Refresh a state with:
 *   node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2 --refresh-osm --write-snapshot
 * or, without Overpass, from a Geofabrik download (NC was built this way;
 * see scripts/facilities-osm/README.md "No Overpass").
 */
export const SNAPSHOTS: OsmSnapshot[] = [FL as unknown as OsmSnapshot, NC as unknown as OsmSnapshot, AZ as unknown as OsmSnapshot, CA as unknown as OsmSnapshot, NJ as unknown as OsmSnapshot, TX as unknown as OsmSnapshot, GA as unknown as OsmSnapshot, SC as unknown as OsmSnapshot, TN as unknown as OsmSnapshot];
