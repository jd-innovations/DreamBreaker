// Seller listing management — Edit / Mark Pending / Mark Sold / Delete, plus
// where the free-tier active-listing count is visible to the seller.
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import {
  fetchListings, setListingStatus, deleteListing, fetchListingLimit,
  type MarketplaceListingCard,
} from '@/lib/marketplace/listingService';
import { conditionLabel, formatPriceCents } from '@/lib/marketplace/constants';

// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

const L = {
  navy: '#0A1228', text: '#0A1228', textMuted: '#9AAABF', border: '#E0E8F5',
  green: '#16A34A', gold: '#C9A84C', danger: '#EF4444', bg: '#FFFFFF',
};

const STATUS_LABEL: Record<string, string> = { active: 'Active', pending: 'Pending', sold: 'Sold', deleted: 'Deleted' };
const STATUS_COLOR: Record<string, string> = { active: L.green, pending: L.gold, sold: L.textMuted, deleted: L.danger };

export default function MyListingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [listings, setListings] = useState<MarketplaceListingCard[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [rows, listingLimit] = await Promise.all([
        fetchListings({ sellerId: user.id }),
        fetchListingLimit(user.id),
      ]);
      setListings(rows.filter((l) => l.status !== 'deleted'));
      setLimit(listingLimit);
    } catch (err) {
      console.error('[MyListings] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const activeCount = listings.filter((l) => l.status === 'active' || l.status === 'pending').length;

  async function handleStatusChange(id: string, status: 'active' | 'pending' | 'sold') {
    try {
      await setListingStatus(id, status);
      void load();
    } catch (err) {
      Alert.alert('Could not update listing', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function handleDelete(id: string) {
    Alert.alert('Delete this listing?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteListing(id); void load(); }
          catch (err) { Alert.alert('Could not delete listing', err instanceof Error ? err.message : 'Please try again.'); }
        },
      },
    ]);
  }

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={L.navy} /></TouchableOpacity>
        <Text style={s.headerTitle}>My Listings</Text>
        <View style={{ width: 22 }} />
      </View>

      {limit != null && (
        <Text style={s.limitLine}>{activeCount} of {limit} active listings used</Text>
      )}

      {loading ? (
        <View style={s.centerFill}><ActivityIndicator color={L.navy} /></View>
      ) : listings.length === 0 ? (
        <View style={s.centerFill}>
          <Ionicons name="pricetag-outline" size={32} color={L.textMuted} />
          <Text style={s.emptyText}>You haven't listed anything yet.</Text>
          <TouchableOpacity style={s.sellBtn} onPress={() => router.push('/marketplace/create' as never)}>
            <Text style={s.sellBtnText}>Sell a Paddle</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={s.row}>
              {item.primaryPhotoUrl ? (
                <Image source={{ uri: item.primaryPhotoUrl }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, s.thumbPlaceholder]}><Ionicons name="image-outline" size={20} color={L.textMuted} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                <Text style={s.meta}>{formatPriceCents(item.asking_price_cents)} · {conditionLabel(item.condition)}</Text>
                <Text style={[s.status, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
                <View style={s.actionRow}>
                  {item.status !== 'sold' && (
                    <TouchableOpacity onPress={() => router.push(`/marketplace/edit/${item.id}` as never)}>
                      <Text style={s.actionText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {item.status !== 'sold' && (
                    <TouchableOpacity onPress={() => handleStatusChange(item.id, item.status === 'pending' ? 'active' : 'pending')}>
                      <Text style={s.actionText}>{item.status === 'pending' ? 'Mark Active' : 'Mark Pending'}</Text>
                    </TouchableOpacity>
                  )}
                  {item.status !== 'sold' && (
                    <TouchableOpacity onPress={() => handleStatusChange(item.id, 'sold')}>
                      <Text style={s.actionText}>Mark Sold</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => handleDelete(item.id)}>
                    <Text style={[s.actionText, { color: L.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  limitLine: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginBottom: 8 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  sellBtn: { marginTop: 8, backgroundColor: L.navy, borderRadius: shape.pill, paddingHorizontal: 20, paddingVertical: 10 },
  sellBtnText: { color: '#FFFFFF', fontSize: text.action.size, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: L.border },
  thumb: { width: 68, height: 68, borderRadius: shape.panel },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FB' },
  title: { color: L.text, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 2 },
  meta: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500', marginBottom: 2 },
  status: { fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, marginBottom: 6 },
  actionRow: { flexDirection: 'row', gap: 16 },
  actionText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },
});
