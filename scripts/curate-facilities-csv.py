import csv,sys,re,math,difflib,collections,json
src,prodf,outdir=sys.argv[1],sys.argv[2],sys.argv[3]
rows=list(csv.DictReader(open(src,encoding='utf-8-sig')))
cols=list(rows[0].keys())
prod=json.load(open(prodf,encoding='utf-8'))
prod_ids={p['google_place_id'] for p in prod if p['google_place_id']}
NONVENUE_TYPES={'lodging','condominium_complex','mobile_home_park','apartment_complex','store','sporting_goods_store','service','local_government_office','health','amusement_park','playground','school','shooting_range','gymnastics_center'}
COURT_TYPES={'park','city_park','athletic_field','tennis_court','sports_activity_location','sports_complex','sports_club','community_center','fitness_center','golf_course','country_club','recreation_center'}
ORG_TYPES={'association_or_organization','non_profit_organization'}
def sign(r): return 'pickle' in (r['facility_name']+' '+r['website_url']+' '+r['google_types']+' '+r['primary_type_label']).lower()
def dist(a,b): return math.hypot((float(a['latitude'])-float(b['latitude']))*111000,(float(a['longitude'])-float(b['longitude']))*111000*math.cos(math.radians(27.4)))
def norm(n): return re.sub(r'[^a-z0-9 ]','',n.lower()).strip()
keep,removed,review=[],[],[]
def drop(r,why,bucket=None): (bucket if bucket is not None else removed).append(dict(r,removal_reason=why))
for r in rows:
  types=set(t.strip() for t in r['google_types'].split(',') if t.strip()); pt=r['primary_type']
  n=r['facility_name']
  if r['google_place_id'] in prod_ids: drop(r,'already in DreamBreaker (same Google place)'); continue
  near=[p for p in prod if not p['google_place_id'] and p['latitude'] and ((dist(r,p)<200 and difflib.SequenceMatcher(None,norm(n),norm(p['name'])).ratio()>0.6) or (dist(r,p)<2000 and difflib.SequenceMatcher(None,norm(n),norm(p['name'])).ratio()>0.9))]
  if near: drop(r,f'already in DreamBreaker (matches "{near[0]["name"]}")'); continue
  if pt in NONVENUE_TYPES or (types & {'lodging'}) or re.search(r'entire (place|home)|vacation|retreat|airbnb|condo|villa\b|bedroom|\bBR\b',n,re.I):
    drop(r,f'not a venue (rental/lodging/store/etc: {pt or "?"})'); continue
  if (pt in ORG_TYPES) and not (types & COURT_TYPES): drop(r,'organization/league, no courts listed'); continue
  if re.search(r'coach|lessons|instruction|academy llc|pickleballingpete',n,re.I) and not (types & {'park','city_park','tennis_court','community_center'}): drop(r,'coach/instructor, not a venue'); continue
  if not sign(r):
    PUBLIC={'park','city_park','community_center','tennis_court','athletic_field','sports_activity_location','sports_complex','recreation_center'}
    EXCL=r'golf|gymnastic|jiu.?jitsu|aquatic|science|media|arts|learning|shooting|boys & girls|yacht|fitness|gym|fitball|wellness|empowerment|dream center|associates|parks & recreation$'
    if (pt in PUBLIC or (not pt and types & PUBLIC)) and not re.search(EXCL,n,re.I):
      r['curation_note']='public park/rec/tennis venue: confirm pickleball during enrichment'; keep.append(r)
    else: drop(r,f'no pickleball signal ({pt or "no type"})')
    continue
  r['curation_note']='pickleball named in name/website'; keep.append(r)
# intra-file dedupe among keep
final=[]
for r in keep:
  dup=next((k for k in final if dist(r,k)<150 and difflib.SequenceMatcher(None,norm(r['facility_name']),norm(k['facility_name'])).ratio()>0.6),None)
  if dup:
    score=lambda x: sum(1 for c in ('address_line_1','phone','website_url','photos','hours_summary') if x[c].strip())
    if score(r)>score(dup): final.remove(dup); final.append(r); drop(dup,f'duplicate of "{r["facility_name"]}"')
    else: drop(r,f'duplicate of "{dup["facility_name"]}"')
  else: final.append(r)
ZIPCITY={**{z:'Bradenton' for z in ('34201','34202','34203','34205','34207','34208','34209','34210','34211','34212')},'34221':'Palmetto',**{str(z):'Sarasota' for z in range(34230,34244)}}
REAL={'Sarasota','Bradenton','Palmetto','Holmes Beach','Bradenton Beach','Anna Maria','Longboat Key','Lakewood Ranch','Osprey','Nokomis','Venice','Ellenton','Parrish','Cortez','Siesta Key'}
for r in final:
  if r['city'] not in REAL and r['zip'][:5] in ZIPCITY: r['city']=ZIPCITY[r['zip'][:5]]
  r['facility_name']=re.sub(r'[.\s]+$','',r['facility_name']).strip()
  if r['facility_name'].isupper() and len(r['facility_name'])>4: r['facility_name']=r['facility_name'].title()
def w(name,data,extra):
  with open(f'{outdir}/{name}','w',newline='',encoding='utf-8') as f:
    wr=csv.DictWriter(f,fieldnames=cols+extra); wr.writeheader(); wr.writerows(data)
w('curated.csv',final,['curation_note']); w('removed.csv',removed+review,['removal_reason']); w('review.csv',review,['removal_reason'])
print('in',len(rows),'keep',len(final),'removed',len(removed),'no-signal sports/park',len(review))
print(collections.Counter(re.sub(r' \(.*|".*','',x['removal_reason']) for x in removed).most_common())
print('KEEP:'); [print('  ',r['facility_name'],'|',r['primary_type'],'|',r['city'],'| photos' if r['photos'] else '| NO PHOTO') for r in final]
print('NO-SIGNAL SPORTS/PARK:'); [print('  ',r['facility_name'],'|',r['primary_type']) for r in review]
