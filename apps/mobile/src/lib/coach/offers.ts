import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/lib/database.types';

// Coach Marketplace V1 Phase 2 — Coach Offers service layer. Mirrors
// apps/mobile/src/lib/marketplace/listingService.ts's conventions (thin
// wrappers over generated Tables<> types, pre-generated client id for
// photo-before-row upload). No purchase/payment logic here — Phase 3.

export type CoachOffer = Tables<'coach_offers'>;
export type CoachOfferImage = Tables<'coach_offer_images'>;
export type CoachOfferType = CoachOffer['offer_type'];
export type CoachOfferStatus = CoachOffer['status'];

export type CoachOfferWithImages = CoachOffer & { images: CoachOfferImage[] };

const OFFER_WITH_IMAGES_SELECT = '*, images:coach_offer_images(*)';

function sortImages(row: CoachOfferWithImages): CoachOfferWithImages {
  return { ...row, images: [...row.images].sort((a, b) => a.sort_order - b.sort_order) };
}

// ── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchCoachOffers(coachId: string): Promise<CoachOfferWithImages[]> {
  const { data, error } = await supabase
    .from('coach_offers')
    .select(OFFER_WITH_IMAGES_SELECT)
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as CoachOfferWithImages[]).map(sortImages);
}

export async function fetchCoachOfferDetail(id: string): Promise<CoachOfferWithImages | null> {
  const { data, error } = await supabase
    .from('coach_offers')
    .select(OFFER_WITH_IMAGES_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return sortImages(data as unknown as CoachOfferWithImages);
}

// Browse — active offers only (public marketplace surface, no purchase yet).
export async function fetchActiveCoachOffers(params: { facilityId?: string; limit?: number } = {}): Promise<CoachOfferWithImages[]> {
  let q = supabase.from('coach_offers').select(OFFER_WITH_IMAGES_SELECT).eq('status', 'active');
  if (params.facilityId) q = q.eq('facility_id', params.facilityId);
  q = q.order('created_at', { ascending: false });
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as CoachOfferWithImages[]).map(sortImages);
}

// Player-facing browse — active offers with the coach name/avatar and
// facility name joined in for card display. Minimal Phase 2 addition (no
// purchase/checkout — that's Phase 3+); a real discovery/search surface is
// Phase 10 UI, not this.
export type CoachOfferBrowseCard = CoachOfferWithImages & {
  coach: { full_name: string; avatar_url: string | null } | null;
  facility: { name: string; city: string; state: string } | null;
};

const OFFER_BROWSE_SELECT = `
  *,
  images:coach_offer_images(*),
  coach:profiles!coach_offers_coach_id_fkey(full_name, avatar_url),
  facility:facilities!coach_offers_facility_id_fkey(name, city, state)
`.trim();

export async function fetchActiveCoachOffersBrowse(): Promise<CoachOfferBrowseCard[]> {
  const { data, error } = await supabase
    .from('coach_offers')
    .select(OFFER_BROWSE_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as CoachOfferBrowseCard[]).map((row) => ({
    ...row,
    images: [...row.images].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export async function fetchCoachOfferBrowseDetail(id: string): Promise<CoachOfferBrowseCard | null> {
  const { data, error } = await supabase
    .from('coach_offers')
    .select(OFFER_BROWSE_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as CoachOfferBrowseCard;
  return { ...row, images: [...row.images].sort((a, b) => a.sort_order - b.sort_order) };
}

// ── Create / edit ────────────────────────────────────────────────────────────

export type CreateCoachOfferInput = {
  id: string; // pre-generated client-side (see draftCoachOfferId()) — photos upload against this id before the row exists
  coachId: string;
  offerType: CoachOfferType;
  title: string;
  description?: string | null;
  skillLevelLabel?: string | null;
  durationMinutes?: number | null;
  maxParticipants?: number | null;
  lessonsIncluded?: number | null; // package only
  regularPriceCents: number;
  discountedPriceCents: number;
  quantityAvailable?: number | null; // null = unlimited
  purchaseLimitPerCustomer?: number | null;
  facilityId?: string | null; // location metadata only — see coach_offers table comment
  premiumOnly?: boolean;
  premiumPriceCents?: number | null;
  terms?: string | null;
  photoUrls: string[]; // already-uploaded URLs, in display order
  /** 'draft' (default) or 'active' — publishing here runs the server-side minimum-discount + readiness check (trg_enforce_coach_offer_publish_rules). */
  status?: CoachOfferStatus;
};

export async function createCoachOffer(input: CreateCoachOfferInput): Promise<CoachOffer> {
  const { data: offer, error } = await supabase
    .from('coach_offers')
    .insert({
      id: input.id,
      coach_id: input.coachId,
      offer_type: input.offerType,
      title: input.title,
      description: input.description ?? null,
      skill_level_label: input.skillLevelLabel ?? null,
      duration_minutes: input.durationMinutes ?? null,
      max_participants: input.maxParticipants ?? null,
      lessons_included: input.lessonsIncluded ?? null,
      regular_price_cents: input.regularPriceCents,
      discounted_price_cents: input.discountedPriceCents,
      quantity_available: input.quantityAvailable ?? null,
      quantity_remaining: input.quantityAvailable ?? null,
      purchase_limit_per_customer: input.purchaseLimitPerCustomer ?? null,
      facility_id: input.facilityId ?? null,
      premium_only: input.premiumOnly ?? false,
      premium_price_cents: input.premiumPriceCents ?? null,
      terms: input.terms ?? null,
      status: input.status ?? 'draft',
    })
    .select()
    .single();
  if (error) throw error;

  if (input.photoUrls.length > 0) {
    const { error: imagesError } = await supabase
      .from('coach_offer_images')
      .insert(input.photoUrls.map((url, i) => ({ coach_offer_id: input.id, url, sort_order: i })));
    if (imagesError) throw imagesError;
  }

  return offer;
}

// Editing an existing offer's price/terms only ever touches this live
// coach_offers row — it never reaches back into any purchase record.
// Phase 3's purchase ledger snapshots the fields it needs at purchase time,
// so a later edit here structurally cannot mutate an already-purchased
// voucher's terms (there is no code path from this function to any
// purchase/wallet table).
export type UpdateCoachOfferInput = Partial<{
  title: string;
  description: string | null;
  skillLevelLabel: string | null;
  durationMinutes: number | null;
  maxParticipants: number | null;
  lessonsIncluded: number | null;
  regularPriceCents: number;
  discountedPriceCents: number;
  quantityAvailable: number | null;
  purchaseLimitPerCustomer: number | null;
  facilityId: string | null;
  premiumOnly: boolean;
  premiumPriceCents: number | null;
  terms: string | null;
}>;

export async function updateCoachOffer(id: string, updates: UpdateCoachOfferInput): Promise<void> {
  const patch: TablesUpdate<'coach_offers'> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.skillLevelLabel !== undefined) patch.skill_level_label = updates.skillLevelLabel;
  if (updates.durationMinutes !== undefined) patch.duration_minutes = updates.durationMinutes;
  if (updates.maxParticipants !== undefined) patch.max_participants = updates.maxParticipants;
  if (updates.lessonsIncluded !== undefined) patch.lessons_included = updates.lessonsIncluded;
  if (updates.regularPriceCents !== undefined) patch.regular_price_cents = updates.regularPriceCents;
  if (updates.discountedPriceCents !== undefined) patch.discounted_price_cents = updates.discountedPriceCents;
  if (updates.quantityAvailable !== undefined) patch.quantity_available = updates.quantityAvailable;
  if (updates.purchaseLimitPerCustomer !== undefined) patch.purchase_limit_per_customer = updates.purchaseLimitPerCustomer;
  if (updates.facilityId !== undefined) patch.facility_id = updates.facilityId;
  if (updates.premiumOnly !== undefined) patch.premium_only = updates.premiumOnly;
  if (updates.premiumPriceCents !== undefined) patch.premium_price_cents = updates.premiumPriceCents;
  if (updates.terms !== undefined) patch.terms = updates.terms;

  const { error } = await supabase.from('coach_offers').update(patch).eq('id', id);
  if (error) throw error;
}

// ── Status transitions ───────────────────────────────────────────────────────
// publish()/resume() both set status='active', which re-runs
// trg_enforce_coach_offer_publish_rules server-side (minimum discount +
// is_coach_publish_ready) every time — the client cannot bypass this by
// only calling it once at creation.

export async function publishCoachOffer(id: string): Promise<void> {
  const { error } = await supabase.from('coach_offers').update({ status: 'active' }).eq('id', id);
  if (error) throw error;
}

export async function pauseCoachOffer(id: string): Promise<void> {
  const { error } = await supabase.from('coach_offers').update({ status: 'paused' }).eq('id', id);
  if (error) throw error;
}

export async function resumeCoachOffer(id: string): Promise<void> {
  const { error } = await supabase.from('coach_offers').update({ status: 'active' }).eq('id', id);
  if (error) throw error;
}

export async function archiveCoachOffer(id: string): Promise<void> {
  const { error } = await supabase.from('coach_offers').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

// Duplicate always lands in 'draft', regardless of the source offer's
// status — never silently re-publishes a paused/archived offer.
export async function duplicateCoachOffer(id: string, newId: string): Promise<CoachOffer> {
  const source = await fetchCoachOfferDetail(id);
  if (!source) throw new Error('Offer not found');

  const { data: copy, error } = await supabase
    .from('coach_offers')
    .insert({
      id: newId,
      coach_id: source.coach_id,
      offer_type: source.offer_type,
      title: `${source.title} (Copy)`,
      description: source.description,
      skill_level_label: source.skill_level_label,
      duration_minutes: source.duration_minutes,
      max_participants: source.max_participants,
      lessons_included: source.lessons_included,
      regular_price_cents: source.regular_price_cents,
      discounted_price_cents: source.discounted_price_cents,
      quantity_available: source.quantity_available,
      quantity_remaining: source.quantity_available,
      purchase_limit_per_customer: source.purchase_limit_per_customer,
      facility_id: source.facility_id,
      premium_only: source.premium_only,
      premium_price_cents: source.premium_price_cents,
      terms: source.terms,
      applicable_audience: source.applicable_audience,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw error;

  if (source.images.length > 0) {
    const { error: imagesError } = await supabase
      .from('coach_offer_images')
      .insert(source.images.map((img) => ({ coach_offer_id: newId, url: img.url, sort_order: img.sort_order })));
    if (imagesError) throw imagesError;
  }

  return copy;
}
