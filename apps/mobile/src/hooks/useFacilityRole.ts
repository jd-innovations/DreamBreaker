import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import {
  fetchMyRoleAtFacility,
  facilityRoleAtLeast,
  type FacilityMemberRole,
} from '@/lib/supabase/facilityMembers';

// Current user's facility_members role for a given facility, if any. Gates
// Facility Admin UI (Court/Ball Machine management) client-side; RLS is the
// real enforcement, this hook only drives what the UI shows/hides.
export function useFacilityRole(facilityId: string | null | undefined) {
  const { user } = useSession();
  const [role, setRole] = useState<FacilityMemberRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id || !facilityId) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRole(await fetchMyRoleAtFacility(facilityId, user.id));
    } finally {
      setLoading(false);
    }
  }, [user?.id, facilityId]);

  useEffect(() => { refresh(); }, [refresh]);

  return {
    role,
    loading,
    isMember: role != null,
    isStaffOrAbove: facilityRoleAtLeast(role, 'staff'),
    isManagerOrAbove: facilityRoleAtLeast(role, 'manager'),
    isOwner: role === 'owner',
    refresh,
  };
}
