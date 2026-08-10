import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  StatusChip,
  PickleballIcon,
} from '@/components';
import { colors, displayText, iconCircle, radius, spacing, typography } from '@/theme';

const COLOR_SWATCHES = [
  ['navy', colors.navy, 'Brand primary'],
  ['gold', colors.gold, 'Brand accent'],
  ['bg', colors.bg, 'Surface'],
  ['page', colors.page, 'Page background'],
  ['border', colors.border, 'Dividers'],
  ['text', colors.text, 'Primary text'],
  ['textSub', colors.textSub, 'Metadata'],
  ['success', colors.success, 'Positive'],
  ['danger', colors.danger, 'Negative'],
  ['goldLight', colors.goldLight, 'Gold tint'],
  ['goldBg', colors.goldBg, 'Gold wash'],
  ['successBg', colors.successBg, 'Success wash'],
  ['dangerBg', colors.dangerBg, 'Danger wash'],
] as const;

const SPACING_TOKENS = [
  ['xs', spacing.xs],
  ['sm', spacing.sm],
  ['md', spacing.md],
  ['lg', spacing.lg],
  ['xl', spacing.xl],
  ['xxl', spacing.xxl],
  ['xxxl', spacing.xxxl],
] as const;

const RADIUS_TOKENS = [
  ['sm', radius.sm],
  ['md', radius.md],
  ['button', radius.button],
  ['card', radius.card],
  ['chip', radius.chip],
] as const;

export default function DesignLabScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.navy} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Design Lab</Text>
          <Text style={styles.headerSub}>DreamBreakerPB Design System v1</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <IntroPanel />
        <ColorBoard />
        <TypographyBoard />
        <SpacingBoard />
        <RadiusBoard />
        <ButtonBoard />
        <ChipBoard />
        <CardBoard />
        <FormBoard />
        <StateBoard />
        <ScreenArchetypeBoard />
      </ScrollView>
    </View>
  );
}

function IntroPanel() {
  return (
    <View style={styles.hero}>
      <View style={styles.heroIcon}>
        <PickleballIcon size={28} color={colors.gold} />
      </View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroTitle}>Premium player-first UI</Text>
        <Text style={styles.heroText}>
          Navy structure, restrained gold accents, soft sport surfaces, and compact mobile controls.
        </Text>
      </View>
    </View>
  );
}

function ColorBoard() {
  return (
    <LabSection title="Color Tokens" caption="Approved color roles from apps/mobile/src/theme.">
      <View style={styles.swatchGrid}>
        {COLOR_SWATCHES.map(([name, value, usage]) => (
          <View key={name} style={styles.swatchCard}>
            <View style={[styles.swatch, { backgroundColor: value }]} />
            <Text style={styles.swatchName}>{name}</Text>
            <Text style={styles.swatchValue}>{value}</Text>
            <Text style={styles.swatchUsage}>{usage}</Text>
          </View>
        ))}
      </View>
    </LabSection>
  );
}

function TypographyBoard() {
  return (
    <LabSection title="Typography" caption="Use named roles before inventing new size/weight pairs.">
      <View style={styles.typeStack}>
        <Text style={styles.displaySample}>DREAMBREAKER</Text>
        <Text style={[typography.pageTitle, styles.typeText]}>Page title - 17 / 900</Text>
        <Text style={[typography.sectionTitle, styles.typeText]}>Section title - 17 / 900</Text>
        <Text style={[typography.cardTitle, styles.typeText]}>Card title - 16 / 700</Text>
        <Text style={[typography.body, styles.typeText]}>Body copy should stay readable and calm.</Text>
        <Text style={[typography.metadata, styles.metadataText]}>Metadata - 12 / 400</Text>
      </View>
    </LabSection>
  );
}

function SpacingBoard() {
  return (
    <LabSection title="Spacing" caption="4pt scale. Screen padding is intentionally compact.">
      <View style={styles.scaleStack}>
        {SPACING_TOKENS.map(([name, value]) => (
          <View key={name} style={styles.scaleRow}>
            <Text style={styles.scaleName}>{name}</Text>
            <View style={[styles.spacingBar, { width: value * 5 }]} />
            <Text style={styles.scaleValue}>{value}px</Text>
          </View>
        ))}
      </View>
    </LabSection>
  );
}

function RadiusBoard() {
  return (
    <LabSection title="Radius" caption="Shape roles should communicate component type.">
      <View style={styles.radiusRow}>
        {RADIUS_TOKENS.map(([name, value]) => (
          <View key={name} style={styles.radiusItem}>
            <View style={[styles.radiusBox, { borderRadius: value }]} />
            <Text style={styles.scaleName}>{name}</Text>
            <Text style={styles.scaleValue}>{value}px</Text>
          </View>
        ))}
      </View>
    </LabSection>
  );
}

function ButtonBoard() {
  return (
    <LabSection title="Buttons" caption="Current canonical CTAs and the button states they imply.">
      <View style={styles.buttonStack}>
        <PrimaryButton label="Primary action" icon="add-circle-outline" />
        <SecondaryButton label="Secondary action" icon="calendar-outline" />
        <PrimaryButton label="Disabled primary" disabled />
        <SecondaryButton label="Disabled secondary" disabled />
        <View style={styles.iconButtonRow}>
          <IconButton icon="add" label="Add" />
          <IconButton icon="notifications-outline" label="Notifications" />
          <IconButton icon="chatbubble-outline" label="Chat" badge="3" />
          <IconButton icon="trash-outline" label="Delete" danger />
        </View>
      </View>
    </LabSection>
  );
}

function ChipBoard() {
  return (
    <LabSection title="Status & Badges" caption="Semantic labels should map to predictable visual states.">
      <View style={styles.chipWrap}>
        <StatusChip label="Open" variant="green" icon="checkmark-circle-outline" />
        <StatusChip label="Pending Review" variant="gold" icon="time-outline" />
        <StatusChip label="Draft" variant="gray" />
        <StatusChip label="Host" variant="navy" icon="shield-checkmark-outline" />
        <StatusChip label="Unavailable" variant="red" icon="alert-circle-outline" />
      </View>
    </LabSection>
  );
}

function CardBoard() {
  return (
    <LabSection title="Cards & Rows" caption="Cards frame content; rows should keep scanning predictable.">
      <SectionCard title="Section card" padded>
        <Text style={styles.cardTitle}>Community play card</Text>
        <Text style={styles.cardBody}>Use a consistent title, metadata, status, and trailing action pattern.</Text>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>DB</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileTitle}>DreamBreaker Player</Text>
            <Text style={styles.profileMeta}>Sarasota, FL · 3.5-4.0</Text>
          </View>
          <StatusChip label="Joined" variant="green" />
        </View>
      </SectionCard>
      <View style={styles.mediaCard}>
        <View style={styles.mediaOverlay}>
          <StatusChip label="Featured" variant="gold" />
          <Text style={styles.mediaTitle}>Sunset Mixed Doubles</Text>
          <Text style={styles.mediaMeta}>Tonight · 6:30 PM · 4 spots left</Text>
        </View>
      </View>
    </LabSection>
  );
}

function FormBoard() {
  return (
    <LabSection title="Forms" caption="Inputs need one height, border, focus, helper, and error language.">
      <View style={styles.formStack}>
        <Text style={styles.label}>Search field</Text>
        <View style={styles.searchField}>
          <Ionicons name="search-outline" size={18} color={colors.textSub} />
          <TextInput
            editable={false}
            pointerEvents="none"
            value="Public courts near me"
            style={styles.searchInput}
          />
        </View>
        <Text style={styles.label}>Form field</Text>
        <View style={styles.inputField}>
          <Text style={styles.inputText}>DreamBreaker Open</Text>
        </View>
        <Text style={styles.helperText}>Helper text explains what happens next.</Text>
        <View style={[styles.inputField, styles.inputError]}>
          <Text style={styles.inputText}>Missing venue</Text>
        </View>
        <Text style={styles.errorText}>Choose a facility before continuing.</Text>
      </View>
    </LabSection>
  );
}

function StateBoard() {
  return (
    <LabSection title="States" caption="Loading, empty, retry, and destructive states should feel related.">
      <View style={styles.stateGrid}>
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.navy} />
          <Text style={styles.stateTitle}>Loading</Text>
          <Text style={styles.stateText}>Fetching nearby games</Text>
        </View>
        <View style={styles.stateCard}>
          <Ionicons name="calendar-outline" size={24} color={colors.gold} />
          <Text style={styles.stateTitle}>Empty</Text>
          <Text style={styles.stateText}>No games match these filters yet.</Text>
        </View>
        <View style={styles.stateCard}>
          <Ionicons name="refresh-outline" size={24} color={colors.navy} />
          <Text style={styles.stateTitle}>Retry</Text>
          <Text style={styles.stateText}>Connection dropped. Try again.</Text>
        </View>
        <View style={styles.stateCard}>
          <Ionicons name="warning-outline" size={24} color={colors.danger} />
          <Text style={styles.stateTitle}>Confirm</Text>
          <Text style={styles.stateText}>Destructive actions need a shared pattern.</Text>
        </View>
      </View>
    </LabSection>
  );
}

function ScreenArchetypeBoard() {
  return (
    <LabSection title="Screen Archetypes" caption="Future screens should start from one of these patterns.">
      <View style={styles.archetypeStack}>
        <Archetype title="Dashboard" text="Header, key action, compact cards, feed or list preview." />
        <Archetype title="Detail" text="Hero/identity, status, primary action, section cards." />
        <Archetype title="Form" text="Header, progressive fields, sticky primary action, validation." />
        <Archetype title="Settings" text="Grouped rows, icon circles, destructive actions separated." />
      </View>
    </LabSection>
  );
}

function LabSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCaption}>{caption}</Text>
      {children}
    </View>
  );
}

function IconButton({
  icon,
  label,
  badge,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.iconButtonItem}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.iconButton, danger && styles.iconButtonDanger]}
      >
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.navy} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </Pressable>
      <Text style={styles.iconButtonLabel}>{label}</Text>
    </View>
  );
}

function Archetype({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.archetypeCard}>
      <View style={styles.archetypeIcon}>
        <Ionicons name="layers-outline" size={18} color={colors.gold} />
      </View>
      <View style={styles.archetypeCopy}>
        <Text style={styles.archetypeTitle}>{title}</Text>
        <Text style={styles.archetypeText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerCopy: { flex: 1 },
  headerTitle: { ...typography.pageTitle, color: colors.navy },
  headerSub: { ...typography.metadata, color: colors.textSub, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: spacing.screenH, gap: spacing.xl },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.navy,
    borderRadius: radius.card,
    padding: spacing.xl,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  heroCopy: { flex: 1 },
  heroTitle: { color: colors.white, fontSize: 21, fontWeight: '900' },
  heroText: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20, marginTop: spacing.xs },

  section: { gap: spacing.md },
  sectionTitle: { ...typography.sectionTitle, color: colors.navy },
  sectionCaption: { ...typography.body, color: colors.textSub, lineHeight: 21 },

  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatchCard: {
    width: '47.8%',
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  swatch: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  swatchName: { fontSize: 13, fontWeight: '800', color: colors.navy },
  swatchValue: { fontSize: 11, color: colors.textSub, marginTop: 2 },
  swatchUsage: { fontSize: 11, color: colors.textSub, marginTop: spacing.xs },

  typeStack: {
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  displaySample: { ...displayText(34), color: colors.navy },
  typeText: { color: colors.navy },
  metadataText: { ...typography.metadata, color: colors.textSub },

  scaleStack: {
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scaleName: { width: 54, fontSize: 12, fontWeight: '800', color: colors.navy },
  scaleValue: { fontSize: 12, color: colors.textSub },
  spacingBar: { height: 10, borderRadius: 5, backgroundColor: colors.gold },

  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  radiusItem: {
    width: '30.8%',
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  radiusBox: { width: 52, height: 52, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },

  buttonStack: {
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconButtonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  iconButtonItem: { alignItems: 'center', flex: 1, gap: spacing.xs },
  iconButton: {
    width: iconCircle.standard,
    height: iconCircle.standard,
    borderRadius: iconCircle.standard / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  iconButtonDanger: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  iconButtonLabel: { fontSize: 10, color: colors.textSub, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },

  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: { ...typography.cardTitle, color: colors.navy },
  cardBody: { ...typography.body, color: colors.textSub, lineHeight: 21, marginTop: spacing.xs },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  avatarText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  profileCopy: { flex: 1 },
  profileTitle: { fontSize: 14, fontWeight: '800', color: colors.navy },
  profileMeta: { fontSize: 12, color: colors.textSub, marginTop: 2 },
  mediaCard: {
    height: 170,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mediaOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    backgroundColor: 'rgba(10,18,40,0.18)',
    gap: spacing.xs,
  },
  mediaTitle: { color: colors.white, fontSize: 22, fontWeight: '900' },
  mediaMeta: { color: 'rgba(255,255,255,0.76)', fontSize: 13, fontWeight: '600' },

  formStack: {
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: { fontSize: 12, fontWeight: '800', color: colors.navy },
  searchField: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, padding: 0 },
  inputField: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
  },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  inputText: { fontSize: 14, color: colors.text },
  helperText: { fontSize: 12, color: colors.textSub },
  errorText: { fontSize: 12, color: colors.danger, fontWeight: '700' },

  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stateCard: {
    width: '47.8%',
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  stateTitle: { fontSize: 14, fontWeight: '800', color: colors.navy, textAlign: 'center' },
  stateText: { fontSize: 12, lineHeight: 17, color: colors.textSub, textAlign: 'center' },

  archetypeStack: { gap: spacing.md },
  archetypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  archetypeIcon: {
    width: iconCircle.standard,
    height: iconCircle.standard,
    borderRadius: iconCircle.standard / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  archetypeCopy: { flex: 1 },
  archetypeTitle: { fontSize: 15, fontWeight: '900', color: colors.navy },
  archetypeText: { fontSize: 13, lineHeight: 18, color: colors.textSub, marginTop: 2 },
});
