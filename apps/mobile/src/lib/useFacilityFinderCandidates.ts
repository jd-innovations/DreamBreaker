import { useEffect, useState } from 'react';
import { useFinderCandidates } from '@/lib/useFinderCandidates';
import { fetchFacilityById } from '@/lib/supabase/facilities';
import type { Coordinates } from '@/lib/location';

// "Find Players" near a facility, not near the organizer. Resolves the
// facility's coordinates once, then delegates to useFinderCandidates()'s
// origin override -- all of its candidate-discovery/filtering logic
// (actively_looking, skill-range, radius) is reused as-is, not duplicated.
export function useFacilityFinderCandidates(facilityId: string | null | undefined) {
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [loadingFacility, setLoadingFacility] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!facilityId) {
      setOrigin(null);
      setLoadingFacility(false);
      return;
    }

    setLoadingFacility(true);
    fetchFacilityById(facilityId)
      .then(facility => {
        if (cancelled) return;
        setOrigin(facility ? { lat: facility.latitude, lng: facility.longitude } : null);
      })
      .finally(() => {
        if (!cancelled) setLoadingFacility(false);
      });

    return () => { cancelled = true; };
  }, [facilityId]);

  const finder = useFinderCandidates(origin ? { origin } : undefined);

  return { ...finder, loading: finder.loading || loadingFacility };
}
