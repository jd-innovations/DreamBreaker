// Listing Detail — the immersive, image-first screen the spec centers the
// whole product on. Full-bleed ProgressiveImageViewer behind a 3-snap
// DraggableSheet (collapsed → half → full) carrying progressively more detail.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, TextInput, Image,
  KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ProgressiveImageViewer } from '@/components/media/ProgressiveImageViewer';
import { DraggableSheet, type SheetSnap } from '@/components/sheets/DraggableSheet';
import { useSession } from '@/hooks/useSession';
import {
  fetchListingDetail, reportListing, type MarketplaceListingWithPhotos, type ListingReportReason,
} from '@/lib/marketplace/listingService';
import { makeOffer, messageSellerAboutListing } from '@/lib/marketplace/offers';
import { blockUser } from '@/lib/services/blocking';
import { fetchProfile, type UserProfile } from '@/lib/services/profile';
import { conditionLabel, formatPriceCents, listingAgeLabel, type MarketplaceBrand } from '@/lib/marketplace/constants';
import { renewListing } from '@/lib/marketplace/listingService';
import { isListingSaved, saveListing, unsaveListing } from '@/lib/marketplace/savedListings';
import { BRAND_LOGOS } from '@/lib/marketplace/brandLogos';
import LocationCard from '@/components/LocationCard';
import { haptics } from '@/lib/haptics';
import { shareEntity } from '@/lib/share';

// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

const L = {
  navy: '#0A1228', gold: '#C9A84C', text: '#0A1228', textMuted: '#9AAABF',
  border: '#E0E8F5', green: '#16A34A', danger: '#EF4444', dangerBg: '#FEE2E2',
};

const REPORT_REASONS: { id: ListingReportReason; label: string; icon: string }[] = [
  { id: 'mislabeled', label: 'Mislabeled or inaccurate', icon: 'alert-circle-outline' },
  { id: 'counterfeit', label: 'Counterfeit / fake product', icon: 'shield-outline' },
  { id: 'price_gouging', label: 'Price gouging', icon: 'trending-up-outline' },
  { id: 'spam_or_inappropriate', label: 'Spam or inappropriate', icon: 'hand-left-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

function memberSinceLabel(createdAt: string | null): string {
  if (!createdAt) return '';
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [listing, setListing] = useState<MarketplaceListingWithPhotos | null>(null);
  const [seller, setSeller] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  // Persisted per viewer in marketplace_saved_listings. This was useState only
  // until 2026-09-09 -- the heart filled in and forgot on the next navigation.
  const [favorited, setFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [snap, setSnap] = useState<SheetSnap>('collapsed');
  // Collapsed content's height varies (owner vs buyer CTAs, location present or
  // not), so it's measured from the actual rendered content on layout rather
  // than guessed — the guess here is only a first-paint fallback before that
  // measurement lands.
  const [collapsedContentHeight, setCollapsedContentHeight] = useState(150);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const detail = await fetchListingDetail(id);
      setListing(detail);
      if (detail) {
        const sellerProfile = await fetchProfile(detail.seller_id);
        setSeller(sellerProfile);
      }
    } catch (err) {
      console.error('[ListingDetail] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Seed the heart from the server. Separate from load() because it depends on
  // the viewer, not the listing -- and a failure here must not blank the screen,
  // so an unreadable save state just reads as "not saved".
  useEffect(() => {
    const viewer = user?.id;
    if (!viewer || !id) return;
    let active = true;
    isListingSaved(viewer, id)
      .then((saved) => { if (active) setFavorited(saved); })
      .catch(() => {});
    return () => { active = false; };
  }, [user?.id, id]);

  if (loading) {
    return <View style={s.centerFill}><ActivityIndicator color="#FFFFFF" /></View>;
  }
  if (!listing) {
    return (
      <View style={[s.centerFill, { backgroundColor: '#FFFFFF' }]}>
        <Text style={{ color: L.textMuted }}>This listing is no longer available.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: L.navy, fontWeight: '700' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photos = listing.photos.map((p) => p.url);
  const isOwner = user?.id === listing.seller_id;

  // listing is non-null past the guard above, but TS narrowing does not survive
  // into a closure, so capture the id rather than re-asserting.
  const listingId = listing.id;
  const viewerId = user?.id ?? null;

  async function toggleFavorite() {
    if (!viewerId) return;
    // Optimistic: the heart is a one-bit toggle and a round trip makes it feel
    // broken. Reverted on failure rather than left lying.
    const next = !favorited;
    setFavorited(next);
    setFavoritePending(true);
    try {
      if (next) await saveListing(viewerId, listingId);
      else await unsaveListing(viewerId, listingId);
    } catch {
      setFavorited(!next);
    } finally {
      setFavoritePending(false);
    }
  }
  async function handleRenew() {
    try {
      await renewListing(listingId);
      await load();
    } catch (err) {
      Alert.alert('Could not renew', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  const handleMessageSeller = async () => {
    if (!user) return;
    try {
      const conversationId = await messageSellerAboutListing({
        buyerId: user.id, sellerId: listing.seller_id,
        listingTitle: listing.title, askingPriceCents: listing.asking_price_cents,
      });
      router.push(`/conversation/${conversationId}` as never);
    } catch (err) {
      Alert.alert('Something went wrong', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleReport = async (reason: ListingReportReason) => {
    if (!user) return;
    try {
      await reportListing({ reporterId: user.id, sellerId: listing.seller_id, listingId: listing.id, reason });
      haptics.success();
      Alert.alert('Report submitted', 'Our team will review this listing within 24 hours.');
      setReportOpen(false);
    } catch (err) {
      haptics.error();
      Alert.alert('Could not submit report', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleShare = async () => {
    try {
      await shareEntity({ type: 'marketplace', id: listing.id, title: listing.title, priceCents: listing.asking_price_cents });
    } catch {
      // user cancelled or share unavailable — nothing to do
    }
    setMoreOpen(false);
  };

  const handleBlock = () => {
    if (!user) return;
    Alert.alert('Block this seller?', 'You will no longer be able to message each other.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive', onPress: async () => {
          try {
            await blockUser(user.id, listing.seller_id);
            setMoreOpen(false);
          } catch (err) {
            Alert.alert('Could not block user', err instanceof Error ? err.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <ProgressiveImageViewer photos={photos.length ? photos : ['']} index={photoIndex} onIndexChange={setPhotoIndex} topInset={insets.top}>
        <View style={[s.topControls, { top: insets.top + 12 }]}>
          <TouchableOpacity style={s.topBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={s.topRight}>
            <TouchableOpacity
              style={s.topBtn}
              onPress={toggleFavorite}
              disabled={favoritePending}
              accessibilityRole="button"
              accessibilityLabel={favorited ? 'Remove from saved' : 'Save listing'}
            >
              <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={18} color={favorited ? L.gold : '#FFFFFF'} />
            </TouchableOpacity>
            <TouchableOpacity style={s.topBtn} onPress={() => setMoreOpen(true)}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </ProgressiveImageViewer>

      <DraggableSheet
        snap={snap}
        onSnapChange={setSnap}
        collapsedHeight={collapsedContentHeight + 20 + insets.bottom}
        halfHeight={420}
        bottomInset={insets.bottom}
        collapsedBackgroundColor="rgba(255,255,255,0.5)"
        renderCollapsed={() => (
          <CollapsedContent listing={listing} isOwner={isOwner} onRenew={handleRenew}
            onExpand={() => setSnap('half')}
            onMakeOffer={() => setOfferOpen(true)}
            onMessageSeller={handleMessageSeller}
            onMeasure={setCollapsedContentHeight}
          />
        )}
        renderHalf={() => (
          <HalfContent listing={listing} seller={seller} isOwner={isOwner} onRenew={handleRenew}
            onExpand={() => setSnap('full')}
            onMakeOffer={() => setOfferOpen(true)}
            onMessageSeller={handleMessageSeller}
          />
        )}
        renderFull={() => (
          <FullContent listing={listing} seller={seller}
            onReport={() => setReportOpen(true)}
          />
        )}
      />

      {/* More menu */}
      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <TouchableOpacity style={s.modalScrim} activeOpacity={1} onPress={() => setMoreOpen(false)}>
          <View style={s.moreSheet}>
            <TouchableOpacity style={s.moreRow} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color={L.text} />
              <Text style={s.moreRowText}>Share Listing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.moreRow} onPress={() => { setMoreOpen(false); setReportOpen(true); }}>
              <Ionicons name="flag-outline" size={18} color={L.text} />
              <Text style={s.moreRowText}>Report Listing</Text>
            </TouchableOpacity>
            {!isOwner && (
              <TouchableOpacity style={s.moreRow} onPress={handleBlock}>
                <Ionicons name="hand-left-outline" size={18} color={L.danger} />
                <Text style={[s.moreRowText, { color: L.danger }]}>Block User</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report sheet */}
      <Modal visible={reportOpen} transparent animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <View style={s.modalScrim}>
          <View style={s.reportSheet}>
            <View style={s.reportHeader}>
              <Text style={s.reportTitle}>Report Listing</Text>
              <TouchableOpacity onPress={() => setReportOpen(false)}>
                <Ionicons name="close" size={22} color={L.navy} />
              </TouchableOpacity>
            </View>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity key={r.id} style={s.reasonRow} onPress={() => handleReport(r.id)}>
                <Ionicons name={r.icon as never} size={20} color={L.textMuted} />
                <Text style={s.reasonText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Make Offer */}
      <MakeOfferModal
        visible={offerOpen}
        onClose={() => setOfferOpen(false)}
        listing={listing}
        onSubmit={async (offerCents) => {
          if (!user) return;
          try {
            const conversationId = await makeOffer({
              buyerId: user.id, sellerId: listing.seller_id,
              listingTitle: listing.title, offerCents,
            });
            setOfferOpen(false);
            router.push(`/conversation/${conversationId}` as never);
          } catch (err) {
            Alert.alert('Could not send offer', err instanceof Error ? err.message : 'Please try again.');
          }
        }}
      />
    </View>
  );
}

// ── Sheet tiers ──────────────────────────────────────────────────────────────

function CollapsedContent({ listing, isOwner, onExpand, onMakeOffer, onMessageSeller, onRenew, onMeasure }: {
  listing: MarketplaceListingWithPhotos; isOwner: boolean; onRenew: () => void;
  onExpand: () => void; onMakeOffer: () => void; onMessageSeller: () => void;
  onMeasure?: (height: number) => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onExpand}
      onLayout={onMeasure ? (e) => onMeasure(e.nativeEvent.layout.height) : undefined}
    >
      <View style={s.brandRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.brandLine} numberOfLines={1}>{listing.brand}</Text>
          <Text style={s.modelLine} numberOfLines={1}>{listing.model}</Text>
        </View>
        {BRAND_LOGOS[listing.brand as MarketplaceBrand] && (
          <Image
            source={BRAND_LOGOS[listing.brand as MarketplaceBrand]}
            style={s.brandLogo}
            resizeMode="contain"
          />
        )}
      </View>
      <View style={s.priceRow}>
        <Text style={s.price}>{formatPriceCents(listing.asking_price_cents)}</Text>
        <View style={s.conditionBadge}><Text style={s.conditionText}>{conditionLabel(listing.condition)}</Text></View>
      </View>
      {listing.pickupFacility ? (
        <Text style={s.locationText}>
          Pickup at {listing.pickupFacility.name}
          {listing.location_city ? ` · ${listing.location_city}, ${listing.location_state ?? ''}`.trimEnd() : ''}
        </Text>
      ) : (listing.location_city || listing.location_state) ? (
        <Text style={s.locationText}>{[listing.location_city, listing.location_state].filter(Boolean).join(', ')}</Text>
      ) : null}
      {!isOwner && (
        <View style={s.ctaRow}>
          <TouchableOpacity style={s.offerBtn} onPress={onMakeOffer}>
            <Text style={s.offerBtnText}>Make Offer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.msgBtn} onPress={onMessageSeller}>
            <Ionicons name="chatbubble-outline" size={16} color={L.navy} />
            <Text style={s.msgBtnText}>Message Seller</Text>
          </TouchableOpacity>
        </View>
      )}
      {isOwner && (
        <>
          {/* Owner-only. Without this an expired or sold listing looks entirely
              normal to the person who owns it -- no sign that buyers cannot
              see it, and no way back. Buyers never reach this screen for a
              non-active listing: RLS returns nothing and the screen shows
              "no longer available". */}
          {listing.status !== 'active' && (
            <View style={s.ownerBanner}>
              <Ionicons
                name={listing.status === 'expired' ? 'time-outline'
                  : listing.status === 'sold' ? 'checkmark-circle-outline' : 'pause-circle-outline'}
                size={16}
                color={L.navy}
              />
              <Text style={s.ownerBannerText}>
                {listing.status === 'expired'
                  ? 'Expired — buyers can no longer see this. Renew to relist it.'
                  : listing.status === 'sold'
                    ? 'Marked sold. Only you can see this.'
                    : 'Paused — hidden from the Marketplace.'}
              </Text>
            </View>
          )}
          <View style={s.ctaRow}>
            {listing.status === 'expired' && (
              <TouchableOpacity style={s.offerBtn} onPress={onRenew}>
                <Text style={s.offerBtnText}>Renew</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={listing.status === 'expired' ? s.msgBtn : s.offerBtn}
              onPress={() => router.push(`/marketplace/edit/${listing.id}` as never)}
            >
              <Text style={listing.status === 'expired' ? s.msgBtnText : s.offerBtnText}>Edit Listing</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

function HalfContent(props: {
  listing: MarketplaceListingWithPhotos; seller: UserProfile | null; isOwner: boolean;
  onExpand: () => void; onMakeOffer: () => void; onMessageSeller: () => void;
  onRenew: () => void;
}) {
  const { listing, seller } = props;
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <CollapsedContent {...props} />
      {listing.description && (
        <Text style={s.description} numberOfLines={3}>{listing.description}</Text>
      )}
      {seller && (
        <View style={s.sellerRow}>
          <Text style={s.sellerName}>{seller.full_name}</Text>
          <Text style={s.meta}>Member since {memberSinceLabel(seller.created_at)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function FullContent({ listing, seller, onReport }: {
  listing: MarketplaceListingWithPhotos; seller: UserProfile | null; onReport: () => void;
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.title}>{listing.title}</Text>
      <View style={s.priceRow}>
        <Text style={s.price}>{formatPriceCents(listing.asking_price_cents)}</Text>
        <View style={s.conditionBadge}><Text style={s.conditionText}>{conditionLabel(listing.condition)}</Text></View>
      </View>

      <Text style={s.sectionLabel}>DESCRIPTION</Text>
      <Text style={s.description}>{listing.description || 'No description provided.'}</Text>

      <Text style={s.sectionLabel}>SELLER</Text>
      <Text style={s.sellerName}>{seller?.full_name ?? 'Pickleball App user'}</Text>
      <Text style={s.meta}>Member since {memberSinceLabel(seller?.created_at ?? null)}</Text>

      {listing.pickupFacility && (
        <>
          <Text style={s.sectionLabel}>PICKUP</Text>
          <Text style={s.pickupHint}>
            A public court the seller chose for the handoff — not their address. Agree the exact
            spot and time in chat.
          </Text>
          <LocationCard
            name={listing.pickupFacility.name}
            addressLines={[
              listing.pickupFacility.address,
              [listing.pickupFacility.city, listing.pickupFacility.state].filter(Boolean).join(', '),
            ]}
            latitude={listing.pickupFacility.latitude}
            longitude={listing.pickupFacility.longitude}
            directionsQuery={`${listing.pickupFacility.latitude},${listing.pickupFacility.longitude}`}
            onViewFacility={() => router.push(`/facility/${listing.pickupFacility!.id}` as never)}
          />
        </>
      )}

      <Text style={s.sectionLabel}>LISTING DETAILS</Text>
      <DetailRow label="Condition" value={conditionLabel(listing.condition)} />
      <DetailRow label="Listed" value={listingAgeLabel(listing.created_at)} />
      {(listing.location_city || listing.location_state) && (
        <DetailRow label="Location" value={[listing.location_city, listing.location_state].filter(Boolean).join(', ')} />
      )}
      <DetailRow
        label="Handoff"
        value={
          listing.fulfillment === 'shipping' ? 'Ships to buyer'
          : listing.fulfillment === 'both' ? 'Local pickup or shipping'
          : 'Local pickup'
        }
      />

      <TouchableOpacity style={s.reportLink} onPress={onReport}>
        <Ionicons name="flag-outline" size={14} color={L.textMuted} />
        <Text style={s.reportLinkText}>Report Listing</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

function MakeOfferModal({ visible, onClose, listing, onSubmit }: {
  visible: boolean; onClose: () => void; listing: MarketplaceListingWithPhotos;
  onSubmit: (offerCents: number) => void;
}) {
  const [amount, setAmount] = useState(String(Math.round(listing.asking_price_cents / 100)));
  const insets = useSafeAreaInsets();

  // min_offer_cents was collected at listing creation, stored, and constrained
  // (<= asking price) but never read by anything -- any offer above $0 was
  // accepted. A field the seller fills in that does nothing is worse than one
  // that is missing, so it is now the actual floor.
  const cents = Math.round(parseFloat(amount || '0') * 100);
  const minCents = listing.min_offer_cents;
  const tooLow = cents > 0 && cents < minCents;
  const canSend = cents > 0 && !tooLow;

  // The sheet is bottom-anchored, which is exactly where the keypad opens, so
  // without this the amount field, the too-low warning and Send Offer are all
  // behind the keyboard. Worse than a normal overlap: decimal-pad has no Done
  // key on iOS and the scrim used to be a plain View, so there was no way to
  // dismiss either the keyboard or the sheet — the only escape was backgrounding
  // the app. Same structure as community/[id].tsx's "Join as Guest" sheet:
  // backdrop Pressable closes, inner Pressable swallows taps so touching the
  // sheet doesn't dismiss it, KeyboardAvoidingView lifts it clear.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalScrim} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%' }}
        >
          {/* insets.bottom matters only when the keyboard is down (the sheet
              then sits on the home indicator); while it's up the keypad already
              covers that area, so keep the extra padding small or it reads as
              dead space under the CTA. */}
          <Pressable style={[s.offerSheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={s.reportHeader}>
            <Text style={s.reportTitle}>Make Offer</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={L.navy} /></TouchableOpacity>
          </View>
          <Text style={s.meta}>Asking price: {formatPriceCents(listing.asking_price_cents)}</Text>
          <Text style={s.meta}>Seller accepts offers from {formatPriceCents(minCents)}</Text>
          <View style={s.amountRow}>
            <Text style={s.amountPrefix}>$</Text>
            <TextInputAmount value={amount} onChangeText={setAmount} />
          </View>
          {tooLow && (
            <Text style={s.offerError}>
              This seller does not accept offers below {formatPriceCents(minCents)}.
            </Text>
          )}
          {/* offerBtn's flex:1 is for ctaRow, where it shares a ROW with the
              Message button. Here the parent is a column, so flex:1 would mean
              flexBasis:0 on the vertical axis -- the button contributes no
              height and clips its own label away, rendering as an empty navy
              bar. Reset it and stretch to the sheet's width instead. */}
          <TouchableOpacity
            style={[s.offerBtn, s.offerBtnBlock, !canSend && s.offerBtnDisabled]}
            disabled={!canSend}
            onPress={() => { if (canSend) onSubmit(cents); }}
          >
            <Text style={s.offerBtnText}>Send Offer</Text>
          </TouchableOpacity>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function TextInputAmount({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  return (
    <TextInput
      style={s.amountInput}
      value={value}
      onChangeText={(v) => onChangeText(v.replace(/[^0-9.]/g, ''))}
      keyboardType="decimal-pad"
      placeholder="0"
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },

  topControls: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
  topRight: { flexDirection: 'row', gap: 8 },
  topBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },

  title: { color: L.text, fontSize: text.cardTitle.size, fontWeight: '800', marginBottom: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  brandLine: { color: L.text, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, marginBottom: 2, textTransform: 'uppercase' },
  modelLine: { color: L.text, fontSize: text.cardTitle.size, fontWeight: '800', marginBottom: 6 },
  brandLogo: { width: 80, height: 80 / (320 / 84), marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  price: { color: L.green, fontSize: text.cardTitle.size, fontWeight: '800' },
  conditionBadge: { backgroundColor: '#F0F4FF', borderRadius: shape.pill, paddingHorizontal: 10, paddingVertical: 3 },
  conditionText: { color: L.navy, fontSize: text.chipValue.size, fontWeight: '800' },
  meta: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginBottom: 4 },
  offerError: { color: L.danger, fontSize: text.caption.size, fontWeight: '600', marginBottom: 8 },
  offerBtnDisabled: { opacity: 0.4 },
  ownerBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderRadius: shape.card, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 10,
  },
  ownerBannerText: { flex: 1, color: L.text, fontSize: text.caption.size, fontWeight: '600' },
  locationText: { color: L.text, fontSize: text.caption.size, fontWeight: '500', marginBottom: 4 },
  pickupHint: { color: L.textMuted, fontSize: text.caption.size, lineHeight: 17, marginBottom: 10 },
  description: { color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 20, marginTop: 12 },
  sectionLabel: { color: L.textMuted, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, marginTop: 20, marginBottom: 8 },
  sellerRow: { marginTop: 14 },
  sellerName: { color: L.text, fontSize: text.rowTitle.size, fontWeight: '700' },

  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  offerBtn: { flex: 1, backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 14, alignItems: 'center' },
  // Undoes offerBtn's row-oriented flex:1 when the button is a column child
  // (the Make Offer sheet) — see the comment at its usage.
  offerBtnBlock: { flex: 0, alignSelf: 'stretch' },
  offerBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
  msgBtn: { flex: 1, flexDirection: 'row', gap: 6, borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  msgBtnText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: L.border },
  detailLabel: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  detailValue: { color: L.text, fontSize: text.caption.size, fontWeight: '500' },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, alignSelf: 'center' },
  reportLinkText: { color: L.textMuted, fontSize: text.link.size, fontWeight: '700' },

  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  moreSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 12, paddingHorizontal: 8 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  moreRowText: { color: L.text, fontSize: text.body.size, fontWeight: '500' },

  reportSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  reportTitle: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  reasonText: { color: L.text, fontSize: text.body.size, fontWeight: '500' },

  offerSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta, paddingHorizontal: 16, marginVertical: 16 },
  amountPrefix: { color: L.text, fontSize: text.cardTitle.size, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, fontSize: text.cardTitle.size, fontWeight: '800', color: L.text, paddingVertical: 12 },
});
