import { supabase } from '@/lib/supabase';
import type { Tables } from '@shared/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
//
// Court / ball-machine equivalent of facility_photos.ts's photo helpers.
// Deliberately excludes 'facility' as an owner type — facility_photos already
// exists and is untouched by this phase (see BOOKING_ENGINE_AUDIT.md §3, §14).
// Upload the file itself via the existing ImagePipeline (lib/media/) first;
// these functions only manage the resulting DB row, mirroring how
// facilities.ts's addFacilityPhoto() is called after an upload completes.

export type AssetPhoto = Tables<'asset_photos'>;
export type AssetPhotoOwnerType = 'court' | 'ball_machine';

// ─────────────────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAssetPhotos(
  ownerType: AssetPhotoOwnerType,
  ownerId: string,
): Promise<AssetPhoto[]> {
  const { data, error } = await supabase
    .from('asset_photos')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .order('is_primary', { ascending: false }) // primary first
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD / DELETE
// ─────────────────────────────────────────────────────────────────────────────
// RLS requires facility manager+ on the resolved facility, and
// uploaded_by = the calling user — enforced server-side.

export async function addAssetPhoto(
  ownerType: AssetPhotoOwnerType,
  ownerId: string,
  url: string,
  isPrimary = false,
): Promise<AssetPhoto> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('asset_photos')
    .insert({
      owner_type:  ownerType,
      owner_id:    ownerId,
      url,
      is_primary:  isPrimary,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAssetPhoto(id: string): Promise<void> {
  const { error } = await supabase.from('asset_photos').delete().eq('id', id);
  if (error) throw error;
}

// Two sequential updates (unset the previous primary, set the new one) —
// not atomic. Acceptable for V1 low-contention admin usage; a single owner
// or manager edits their own facility's photos, not concurrent writers.
// Revisit with an RPC if that assumption stops holding.
export async function setPrimaryAssetPhoto(
  ownerType: AssetPhotoOwnerType,
  ownerId: string,
  photoId: string,
): Promise<void> {
  const { error: clearError } = await supabase
    .from('asset_photos')
    .update({ is_primary: false })
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .eq('is_primary', true);
  if (clearError) throw clearError;

  const { error: setError } = await supabase
    .from('asset_photos')
    .update({ is_primary: true })
    .eq('id', photoId);
  if (setError) throw setError;
}
