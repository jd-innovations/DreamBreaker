// Listing Detail — the immersive, image-first screen the spec centers the
// whole product on. Full-bleed ProgressiveImageViewer behind a 3-snap
// DraggableSheet (collapsed → half → full) carrying progressively more detail.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, TextInput, Share, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
import { BRAND_LOGOS } from '@/lib/marketplace/brandLogos';

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
  const [favorited, setFavorited] = useState(false);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Report submitted', 'Our team will review this listing within 24 hours.');
      setReportOpen(false);
    } catch (err) {
      Alert.alert('Could not submit report', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this ${listing.title} for ${formatPriceCents(listing.asking_price_cents)} on DreamBreaker!`,
      });
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
            <TouchableOpacity style={s.topBtn} onPress={() => setFavorited((f) => !f)}>
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
          <CollapsedContent listing={listing} isOwner={isOwner}
            onExpand={() => setSnap('half')}
            onMakeOffer={() => setOfferOpen(true)}
            onMessageSeller={handleMessageSeller}
            onMeasure={setCollapsedContentHeight}
          />
        )}
        renderHalf={() => (
          <HalfContent listing={listing} seller={seller} isOwner={isOwner}
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

function CollapsedContent({ listing, isOwner, onExpand, onMakeOffer, onMessageSeller, onMeasure }: {
  listing: MarketplaceListingWithPhotos; isOwner: boolean;
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
      {(listing.location_city || listing.location_state) && (
        <Text style={s.locationText}>{[listing.location_city, listing.location_state].filter(Boolean).join(', ')}</Text>
      )}
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
        <View style={s.ctaRow}>
          <TouchableOpacity style={s.offerBtn} onPress={() => router.push(`/marketplace/edit/${listing.id}` as never)}>
            <Text style={s.offerBtnText}>Edit Listing</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function HalfContent(props: {
  listing: MarketplaceListingWithPhotos; seller: UserProfile | null; isOwner: boolean;
  onExpand: () => void; onMakeOffer: () => void; onMessageSeller: () => void;
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
      <Text style={s.sellerName}>{seller?.full_name ?? 'DreamBreaker user'}</Text>
      <Text style={s.meta}>Member since {memberSinceLabel(seller?.created_at ?? null)}</Text>

      <Text style={s.sectionLabel}>LISTING DETAILS</Text>
      <DetailRow label="Condition" value={conditionLabel(listing.condition)} />
      <DetailRow label="Listed" value={listingAgeLabel(listing.created_at)} />
      {(listing.location_city || listing.location_state) && (
        <DetailRow label="Location" value={[listing.location_city, listing.location_state].filter(Boolean).join(', ')} />
      )}

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalScrim}>
        <View style={s.offerSheet}>
          <View style={s.reportHeader}>
            <Text style={s.reportTitle}>Make Offer</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={L.navy} /></TouchableOpacity>
          </View>
          <Text style={s.meta}>Asking price: {formatPriceCents(listing.asking_price_cents)}</Text>
          <View style={s.amountRow}>
            <Text style={s.amountPrefix}>$</Text>
            <TextInputAmount value={amount} onChangeText={setAmount} />
          </View>
          <TouchableOpacity
            style={s.offerBtn}
            onPress={() => {
              const cents = Math.round(parseFloat(amount || '0') * 100);
              if (cents > 0) onSubmit(cents);
            }}
          >
            <Text style={s.offerBtnText}>Send Offer</Text>
          </TouchableOpacity>
        </View>
      </View>
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

  title: { color: L.text, fontSize: 20, fontWeight: '900', marginBottom: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  brandLine: { color: L.text, fontSize: 13, fontWeight: '700', marginBottom: 2, textTransform: 'uppercase' },
  modelLine: { color: L.text, fontSize: 20, fontWeight: '900', marginBottom: 6 },
  brandLogo: { width: 80, height: 80 / (320 / 84), marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  price: { color: L.green, fontSize: 20, fontWeight: '900' },
  conditionBadge: { backgroundColor: '#F0F4FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  conditionText: { color: L.navy, fontSize: 12, fontWeight: '700' },
  meta: { color: L.textMuted, fontSize: 13, marginBottom: 4 },
  locationText: { color: L.text, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  description: { color: L.text, fontSize: 14, lineHeight: 20, marginTop: 12 },
  sectionLabel: { color: L.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 20, marginBottom: 8 },
  sellerRow: { marginTop: 14 },
  sellerName: { color: L.text, fontSize: 15, fontWeight: '700' },

  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  offerBtn: { flex: 1, backgroundColor: L.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  offerBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  msgBtn: { flex: 1, flexDirection: 'row', gap: 6, borderWidth: 1.5, borderColor: L.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  msgBtnText: { color: L.navy, fontSize: 15, fontWeight: '800' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: L.border },
  detailLabel: { color: L.textMuted, fontSize: 13 },
  detailValue: { color: L.text, fontSize: 13, fontWeight: '600' },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24, alignSelf: 'center' },
  reportLinkText: { color: L.textMuted, fontSize: 13 },

  modalScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  moreSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 12, paddingHorizontal: 8 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  moreRowText: { color: L.text, fontSize: 15, fontWeight: '600' },

  reportSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  reportTitle: { color: L.navy, fontSize: 18, fontWeight: '800' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  reasonText: { color: L.text, fontSize: 14, fontWeight: '500' },

  offerSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: 14, paddingHorizontal: 16, marginVertical: 16 },
  amountPrefix: { color: L.text, fontSize: 22, fontWeight: '800', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '800', color: L.text, paddingVertical: 12 },
});
