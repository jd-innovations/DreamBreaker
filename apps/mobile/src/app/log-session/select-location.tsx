import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useCurrentLocation } from '@/lib/location';
import { fetchFacilities, type FacilityWithPrimaryPhoto } from '@/lib/supabase/facilities';
import { setSessionLocation } from '@/lib/logSessionStore';
import { colors, radius, spacing, typography } from '@/theme';

const SEARCH_RADIUS_MILES = 25;

export default function SelectLocationScreen() {
  const insets = useSafeAreaInsets();
  const { lat, lng, loading: locLoading } = useCurrentLocation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FacilityWithPrimaryPhoto[]>([]);
  const [selected, setSelected] = useState<FacilityWithPrimaryPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (locLoading) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchFacilities({
          lat,
          lng,
          radiusMiles: SEARCH_RADIUS_MILES,
          query: query.trim() || undefined,
          limit: 10,
          publicOnly: true,
        });
        if (cancelled) return;
        setResults(rows);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load courts.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [lat, lng, locLoading, query]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Session Location</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.subtitle}>Where did you play today?</Text>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textSub} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search courts by name or area"
            placeholderTextColor={colors.textSub}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            returnKeyType="search"
          />
        </View>

        {loading || locLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.gold} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No courts found nearby.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {results.map((facility) => {
              const active = selected?.id === facility.id;
              const location = [facility.city, facility.state].filter(Boolean).join(', ');
              return (
                <TouchableOpacity
                  key={facility.id}
                  style={[styles.card, active && styles.cardActive]}
                  activeOpacity={0.85}
                  onPress={() => setSelected(facility)}
                >
                  <Ionicons name="location" size={20} color={colors.gold} />
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{facility.name}</Text>
                    {location ? <Text style={styles.cardSub} numberOfLines={1}>{location}</Text> : null}
                  </View>
                  {active ? (
                    <View style={styles.checkCircle}>
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton
          label="Continue"
          style={styles.continueButton}
          textStyle={styles.continueButtonText}
          disabled={!selected}
          onPress={() => {
            if (!selected) return;
            const facilityLocation = [selected.city, selected.state].filter(Boolean).join(', ');
            setSessionLocation({
              facilityId: selected.id,
              facilityName: selected.name,
              facilityLocation,
              facilityPhotoUrl: selected.primaryPhotoUrl ?? '',
            });
            router.push({
              pathname: '/log-session/session-summary',
              params: {
                facilityName: selected.name,
                facilityLocation,
                facilityPhotoUrl: selected.primaryPhotoUrl ?? '',
              },
            });
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH,
    paddingVertical: 12,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, color: colors.navy, fontSize: 17 },
  body: { flex: 1, paddingHorizontal: spacing.screenH, paddingTop: spacing.md },
  subtitle: {
    ...typography.body,
    color: colors.textSub,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.navy,
    fontSize: 15,
    paddingVertical: 12,
  },
  centered: { paddingVertical: spacing.xxl, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.textSub, fontSize: 13 },
  list: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  cardActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldLight,
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: {
    ...typography.cardTitle,
    color: colors.navy,
    fontSize: 15,
  },
  cardSub: {
    ...typography.metadata,
    color: colors.textSub,
    marginTop: 2,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  continueButton: {
    backgroundColor: colors.gold,
  },
  continueButtonText: {
    color: colors.navy,
  },
});
