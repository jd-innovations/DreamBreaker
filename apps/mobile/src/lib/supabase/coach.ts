import { supabase } from '@/lib/supabase';

// Coach Marketplace V1, Phase 1 — coach activation. Self-service: a player
// flips is_coach on and moves coach_status inactive -> onboarding. Anything
// beyond that (active / restricted / test_ready) is server-only — enforced
// by trg_protect_coach_status_transitions (20260809150000 migration), not
// just convention here.
export async function activateCoachMode(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_coach: true, coach_status: 'onboarding' })
    .eq('id', userId);

  return !error;
}
