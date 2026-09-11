import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

/**
 * Invites one guest to claim their half of a logged match.
 *
 * QR is the primary path, deliberately. Claiming used to require the guest's
 * phone number, which means asking a stranger you just played against for it --
 * the highest-friction moment in the whole loop, and the reason invites went
 * unsent. A QR needs nothing from them: they scan with their own camera, and
 * because /claim/* is in the universal-link path list the app opens if they
 * have it and the web claim page if they do not. Nothing is exchanged.
 *
 * SMS stays as the second option, for someone who has already left. The wallet
 * screen's lesson applies here too -- cameras fail, in bad light or on a
 * cracked screen -- but the claim token is 32 characters, so the fallback
 * cannot be a readable code. It has to be the text message.
 *
 * Lives in one component because two screens send this invite: session-saved,
 * right after logging, and Match Details, where an unsent invite can be
 * re-offered before it expires.
 */

type Mode = 'qr' | 'sms';

export type ClaimInviteSheetProps = {
  visible: boolean;
  guestName: string;
  /** The https claim URL. Null while the caller is still minting the link. */
  claimUrl: string | null;
  /** A send is in flight -- the SMS composer is opening. */
  sending?: boolean;
  initialPhone?: string | null;
  onSendSms: (phone: string) => void;
  onClose: () => void;
};

/** Digits only, formatted as a US number once there are enough of them. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function ClaimInviteSheet({
  visible, guestName, claimUrl, sending, initialPhone, onSendSms, onClose,
}: ClaimInviteSheetProps) {
  const [mode, setMode] = useState<Mode>('qr');
  const [phone, setPhone] = useState('');

  // Reopening for a different guest must not inherit the last one's mode or
  // number -- sending Demo 5's invite to Demo 6's phone is a silent mistake.
  useEffect(() => {
    if (visible) {
      setMode('qr');
      setPhone(initialPhone ? formatPhone(initialPhone) : '');
    }
  }, [visible, initialPhone, guestName]);

  const digits = phone.replace(/[^0-9]/g, '');
  const canSend = digits.length >= 10 && !sending;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      {/* The sheet is anchored to the bottom inside this, so the keyboard
          pushes it up instead of covering the field. The old inline input sat
          in a bare ScrollView row and the fourth player's field was under the
          keyboard with no way to see what had been typed. */}
      <KeyboardAvoidingView
        style={s.anchor}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={s.sheet}>
          <View style={s.grabber} />

          <Text style={s.title}>Invite {guestName}</Text>
          <Text style={s.subtitle}>
            {mode === 'qr'
              ? 'They scan this to claim the match and keep the result on their own record.'
              : 'We will open your messages with the invite ready to send.'}
          </Text>

          {mode === 'qr' ? (
            <View style={s.qrBlock}>
              <View style={s.qrFrame}>
                {claimUrl
                  ? <QRCode value={claimUrl} size={190} backgroundColor="#FFFFFF" />
                  : <ActivityIndicator color={colors.gold} size="large" />}
              </View>
              <TouchableOpacity style={s.secondary} onPress={() => setMode('sms')} activeOpacity={0.7}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.navy} />
                <Text style={s.secondaryText}>Send by text instead</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.smsBlock}>
              <Text style={s.label}>Phone number</Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={(next) => setPhone(formatPhone(next))}
                placeholder="(941) 555-0142"
                placeholderTextColor={colors.textSub}
                keyboardType="phone-pad"
                // Surfaces the number from Contacts in the QuickType bar, with
                // no contacts permission and no native dependency.
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={() => { if (canSend) onSendSms(digits); }}
                autoFocus
              />
              <TouchableOpacity
                style={[s.primary, !canSend && s.primaryDisabled]}
                disabled={!canSend}
                activeOpacity={0.85}
                onPress={() => onSendSms(digits)}
              >
                <Text style={s.primaryText}>{sending ? 'Opening…' : 'Send invite'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondary} onPress={() => setMode('qr')} activeOpacity={0.7}>
                <Ionicons name="qr-code-outline" size={16} color={colors.navy} />
                <Text style={s.secondaryText}>Show the QR code instead</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={s.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,40,0.45)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.border, marginBottom: spacing.lg,
  },
  title: {
    color: colors.navy, fontSize: text.sectionTitle.size, fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSub, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', lineHeight: 19, marginTop: 6, marginBottom: spacing.lg,
  },

  qrBlock: { alignItems: 'center', width: '100%' },
  qrFrame: {
    width: 226, height: 226, borderRadius: shape.panel,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  smsBlock: { width: '100%' },
  label: {
    color: colors.text, fontSize: text.fieldLabel.size, fontWeight: '800', marginBottom: 6,
  },
  input: {
    backgroundColor: colors.page, borderWidth: 1, borderColor: colors.border,
    borderRadius: shape.panel, paddingHorizontal: 14, paddingVertical: 13,
    color: colors.text, fontSize: text.body.size, fontWeight: '600',
  },

  primary: {
    backgroundColor: colors.gold, borderRadius: shape.cta,
    paddingVertical: 15, alignItems: 'center', marginTop: spacing.md, width: '100%',
  },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: colors.navy, fontSize: text.action.size, fontWeight: '800' },

  secondary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  secondaryText: { color: colors.navy, fontSize: text.body.size, fontWeight: '700' },

  cancel: { paddingVertical: spacing.sm, marginTop: 2 },
  cancelText: { color: colors.textSub, fontSize: text.body.size, fontWeight: '600' },
});
