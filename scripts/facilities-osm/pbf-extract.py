# Pickleball courts + naming areas from a Geofabrik state download (.osm.pbf),
# shaped like the Overpass output of engine.ts courtsQuery() (out center) and
# areasQuery() (out bb), for `discover.mjs --elements`. No Overpass needed.
#
# Verified 2026-11-25 against the Overpass-built FL snapshot: identical court ids
# and coordinates (the snapshot's only extras were Alabama courts inside FL's bbox).
#
# Needs pyosmium (official OSM binding) in a venv outside the repo:
#   python -m venv %TEMP%\osmenv && %TEMP%\osmenv\Scripts\python -m pip install osmium
# Usage:
#   <venv python> -I scripts/facilities-osm/pbf-extract.py <in.osm.pbf> <out.json>
import json, re, sys, time
import osmium

src, dst = sys.argv[1], sys.argv[2]
LEISURE = re.compile(r'^(park|sports_centre|recreation_ground|golf_course|resort|fitness_centre)$')
AMENITY = re.compile(r'^(community_centre|school|college|university)$')
TOURISM = re.compile(r'^(camp_site|caravan_site)$')

def is_court(t):
    return 'pickleball' in t.get('sport', '')

def is_area(t):
    if 'name' not in t:
        return False
    return bool(LEISURE.match(t.get('leisure', '')) or t.get('landuse') == 'residential'
                or AMENITY.match(t.get('amenity', '')) or 'club' in t or TOURISM.match(t.get('tourism', '')))

def bounds_of(locs):
    lats = [l[0] for l in locs]; lons = [l[1] for l in locs]
    return {'minlat': min(lats), 'minlon': min(lons), 'maxlat': max(lats), 'maxlon': max(lons)}

def center(b):
    return {'lat': (b['minlat'] + b['maxlat']) / 2, 'lon': (b['minlon'] + b['maxlon']) / 2}

courts, areas = [], []
seen = set()
t0 = time.time()
fp = (osmium.FileProcessor(src)
      .with_locations(osmium.index.create_map('flex_mem'))
      .with_areas()
      .with_filter(osmium.filter.KeyFilter('sport', 'leisure', 'landuse', 'amenity', 'club', 'tourism')))
for o in fp:
    tags = {t.k: t.v for t in o.tags}
    court, area = is_court(tags), is_area(tags)
    if not (court or area):
        continue
    if o.is_node():
        if court:
            courts.append({'type': 'node', 'id': o.id, 'lat': o.location.lat, 'lon': o.location.lon, 'tags': tags})
        continue  # Overpass gives nodes no bounds, so nameSites() ignores them
    if o.is_way():
        locs = [(n.lat, n.lon) for n in o.nodes if n.location.valid()]
        key = f'w{o.id}'
        if not locs or key in seen:
            continue
        seen.add(key)
        b = bounds_of(locs)
        if court:
            courts.append({'type': 'way', 'id': o.id, 'center': center(b), 'tags': tags})
        if area:
            areas.append({'type': 'way', 'id': o.id, 'bounds': b, 'tags': tags})
        continue
    if o.is_area() and not o.from_way():  # multipolygon relations (closed ways handled above)
        locs = [(n.lat, n.lon) for ring in o.outer_rings() for n in ring if n.location.valid()]
        if not locs:
            continue
        b = bounds_of(locs)
        if court:
            courts.append({'type': 'relation', 'id': o.orig_id(), 'center': center(b), 'tags': tags})
        if area:
            areas.append({'type': 'relation', 'id': o.orig_id(), 'bounds': b, 'tags': tags})

with open(dst, 'w', encoding='utf-8') as f:
    json.dump({'courts': courts, 'areas': areas}, f)
print(json.dumps({'courts': len(courts), 'areas': len(areas), 'seconds': round(time.time() - t0)}))
