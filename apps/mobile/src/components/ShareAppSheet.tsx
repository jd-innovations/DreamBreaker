import React, { useState } from 'react';
import {
  Alert, Linking, Modal, Platform, Pressable, Share,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { APP_DOWNLOAD_URL, APP_LINK_DOMAIN } from '@/lib/appLinks';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

/**
 * Hands the app to someone standing next to you.
 *
 * Structure deliberately mirrors ClaimInviteSheet — same Modal/slide/transparent
 * idiom, same grabber, same QR-first-with-a-fallback shape — so the app has one
 * bottom-sheet language rather than two.
 *
 * QR is primary for the same reason it is there: the person you are sharing
 * with is in front of you, and scanning needs nothing from them. No phone
 * number, no typing, no asking a stranger for their details.
 *
 * The copy addresses the HOLDER, not the scanner. Whoever opens this sheet
 * already has the app; they are showing it to someone else. "Scan the code"
 * reads as an instruction to the wrong person.
 *
 * No clipboard: expo-clipboard is a native module and React Native removed
 * Clipboard from core, so a Copy Link button would force a new build. The OS
 * share sheet already offers Copy as a destination, so nothing is lost and
 * this ships over the air.
 */

type Props = {
  visible: boolean;
  onClose: () => void;
};

const SHARE_MESSAGE =
  `Get Pickleball App — find games, book courts and track your matches. ${APP_DOWNLOAD_URL}`;

export function ShareAppSheet({ visible, onClose }: Props) {
  const [busy, setBusy] = useState(false);

  async function shareBySms() {
    setBusy(true);
    try {
      // No recipient: this opens Messages with the body ready and the To field
      // empty, so the sender picks from their own contacts. Same separator rule
      // as the claim invite — iOS wants `&`, Android `?`.
      const separator = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(`sms:${separator}body=${encodeURIComponent(SHARE_MESSAGE)}`);
      onClose();
    } catch {
      Alert.alert('Could not open Messages', 'Try sharing the link instead.');
    } finally {
      setBusy(false);
    }
  }

  async function shareLink() {
    setBusy(true);
    try {
      // The OS sheet is where Copy lives, alongside every other destination the
      // person already uses.
      await Share.share({ message: SHARE_MESSAGE, url: APP_DOWNLOAD_URL });
      onClose();
    } catch {
      Alert.alert('Could not share', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.anchor} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.grabber} />

          <Text style={s.title}>Bring your crew to the court</Text>
          <Text style={s.subtitle}>
            Have them point a camera at this, or send them the link.
          </Text>

          <View style={s.qrFrame}>
            {/* Error level H, the highest, so the code survives a phone screen
                held at an angle in bad light. No logo in the middle: it eats
                the correction margin the H level just bought, and the ball mark
                already appears elsewhere on this screen. */}
            <QRCode
              value={APP_DOWNLOAD_URL}
              size={190}
              backgroundColor="#FFFFFF"
              color={colors.navy}
              ecl="H"
            />
          </View>
          {/* Says "open", not "download", because this points at the web app
              until an App Store listing exists. See APP_DOWNLOAD_URL. */}
          <Text style={s.qrCaption}>SCAN TO OPEN PICKLEBALL APP</Text>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>OR SHARE A LINK</Text>
            <View style={s.dividerLine} />
          </View>

          <TouchableOpacity
            style={[s.primary, busy && s.disabled]}
            onPress={shareBySms}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.navy} />
            <Text style={s.primaryText}>Share via SMS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.secondary, busy && s.disabled]}
            onPress={shareLink}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Ionicons name="link-outline" size={18} color={colors.navy} />
            <Text style={s.secondaryText}>Share Link</Text>
          </TouchableOpacity>

          <Text style={s.footer}>{APP_LINK_DOMAIN}</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,40,0.45)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    // Same derivation as ClaimInviteSheet and ManageEventSheet: the radius
    // scale tops out at pill (20) with no sheet radius of its own.
    borderTopLeftRadius: shape.card + 8,
    borderTopRightRadius: shape.card + 8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.border, marginBottom: spacing.lg,
  },

  // modalTitle is the documented role for a bottom-sheet heading. The
  // reference mockup used a compressed display face the type system does not
  // carry, so the headline is set on the scale instead.
  title: {
    color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900',
    textAlign: 'center', paddingHorizontal: spacing.md,
  },
  subtitle: {
    color: colors.textSub, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 19, marginTop: 6, marginBottom: spacing.lg,
  },

  qrFrame: {
    width: 226, height: 226, borderRadius: shape.panel,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  // sectionLabel is the tracked uppercase role, and it carries its own
  // letterSpacing — no reason to invent one here.
  qrCaption: {
    color: colors.textSub, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing, marginTop: spacing.md,
  },

  dividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    width: '100%', marginTop: spacing.xl, marginBottom: spacing.lg,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: {
    color: colors.textSub, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing,
  },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    width: '100%', backgroundColor: colors.gold, borderRadius: shape.cta,
    paddingVertical: spacing.lg,
  },
  primaryText: { color: colors.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    width: '100%', backgroundColor: colors.bg, borderRadius: shape.cta,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.lg, marginTop: spacing.md,
  },
  secondaryText: { color: colors.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  disabled: { opacity: 0.6 },

  footer: {
    color: colors.textSub, fontSize: text.caption.size, fontWeight: '500',
    marginTop: spacing.lg,
  },
});
