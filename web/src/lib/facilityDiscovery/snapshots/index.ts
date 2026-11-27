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
import VA from "./VA.json";
import CO from "./CO.json";
import OH from "./OH.json";
import WA from "./WA.json";
import UT from "./UT.json";
import PA from "./PA.json";
import MI from "./MI.json";
import NV from "./NV.json";
import IL from "./IL.json";

/**
 * Committed OpenStreetMap court snapshots, one per state, read by the Discover
 * tab instead of the (often overloaded) public Overpass servers. Data
 * © OpenStreetMap contributors, ODbL. Refresh a state with:
 *   node scripts/facilities-osm/discover.mjs --state FL --tile-deg 2 --refresh-osm --write-snapshot
 * or, without Overpass, from a Geofabrik download (NC was built this way;
 * see scripts/facilities-osm/README.md "No Overpass").
 */
export const SNAPSHOTS: OsmSnapshot[] = [FL as unknown as OsmSnapshot, NC as unknown as OsmSnapshot, AZ as unknown as OsmSnapshot, CA as unknown as OsmSnapshot, NJ as unknown as OsmSnapshot, TX as unknown as OsmSnapshot, GA as unknown as OsmSnapshot, SC as unknown as OsmSnapshot, TN as unknown as OsmSnapshot, VA as unknown as OsmSnapshot, CO as unknown as OsmSnapshot, OH as unknown as OsmSnapshot, WA as unknown as OsmSnapshot, UT as unknown as OsmSnapshot, PA as unknown as OsmSnapshot, MI as unknown as OsmSnapshot, NV as unknown as OsmSnapshot, IL as unknown as OsmSnapshot];
