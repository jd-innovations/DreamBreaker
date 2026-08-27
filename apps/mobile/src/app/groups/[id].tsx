import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Dimensions, Alert,
  TextInput, ActivityIndicator, Share, Modal, Pressable, type AlertButton,
} from 'react-native';
import { ContextMenu, useContextMenu, type MenuItem } from '@/components/ContextMenu';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/theme';
import { useSession } from '@/hooks/useSession';
import {
  fetchGroup, getMembership, joinGroup, leaveGroup, deleteGroup,
  fetchGroupEvents, fetchGroupFeed, createPost, createPhotoPost, createPoll, toggleLike, votePoll,
  fetchComments, addComment, updatePost, deletePost, updateComment, deleteComment,
  fetchMembers, approveJoinRequest, declineJoinRequest,
  setMemberRole, removeMember, fetchGroupPhotos, uploadGroupPhoto, deleteGroupPhoto,
  reportContent, REPORT_REASONS,
  type Group, type GroupMember, type GroupFeedItem, type GroupComment,
  type GroupPostWithMeta, type GroupPhoto, type GroupRole, type ReportReason,
} from '@/lib/groupService';
import { setPendingGroupId } from '@/lib/pendingGroupLink';
import { sendPartnerLike, hasSentPartnerLike, isPartnerMatch } from '@/lib/partnerLikes';
import { getOrCreateConversation } from '@/lib/conversationService';
import { useSupportContext } from '@/lib/support/supportContext';
import { appLinks } from '@/lib/appLinks';
import {
  acceptGroupInvite,
  fetchGroupInviteCandidates,
  fetchPendingGroupInviteForUser,
  sendGroupInvite,
  type GroupInviteCandidate,
  type ReceivedGroupInvite,
} from '@/lib/supabase/groupInvites';
import type { Tables } from '@/lib/database.types';

const { width: SW } = Dimensions.get('window');
// Generous enough that the bottom-anchored name/meta/description/buttons
// stack never overflows above the banner's own height on narrow devices
// (0.42 was too tight — content alone could reach ~158pt, taller than the
// banner on a 360pt-wide phone even before adding safe-area headroom).
const BANNER_H   = SW * 0.62;
const PHOTO_SIZE = (SW - 32 - 8) / 3;

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldLight: colors.goldLight, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, successBg: colors.successBg,
  danger: colors.danger, dangerBg: colors.dangerBg,
};

type Tab = 'Feed' | 'Events' | 'Members' | 'Photos';
const TABS: Tab[] = ['Feed', 'Events', 'Members', 'Photos'];

const FALLBACK_BANNER = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=400&fit=crop&q=80';
const FALLBACK_EVENT_IMAGE = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=200&fit=crop&q=80';

// ─── Context menu data ────────────────────────────────────────────────────────

const GROUP_MENU_MEMBER: MenuItem[] = [
  { icon: 'share-outline',         label: 'Share Group'          },
  { icon: 'person-add-outline',    label: 'Invite Members'       },
  { icon: 'add-circle-outline',    label: 'Create Event'          },
  { icon: 'notifications-outline', label: 'Manage Notifications'  },
  { icon: 'exit-outline',          label: 'Leave Group', danger: true },
];

const GROUP_MENU_ADMIN: MenuItem[] = [
  { icon: 'share-outline',      label: 'Share Group'    },
  { icon: 'person-add-outline', label: 'Invite Members' },
  { icon: 'add-circle-outline', label: 'Create Event'   },
  { icon: 'people-outline',     label: 'Manage Members' },
  { icon: 'settings-outline',   label: 'Group Settings' },
  { icon: 'trash-outline',      label: 'Delete Group', danger: true },
];

// ─── Root layout styles ───────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center', justifyContent: 'center',
  },
  topRight: { flexDirection: 'row', gap: 8 },

  banner: { width: '100%', overflow: 'hidden' },
  bannerContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, gap: 6,
  },
  groupName: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  metaDot: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  desc: { color: 'rgba(255,255,255,0.80)', fontSize: 13, lineHeight: 18 },

  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },

  joinBtn: {
    backgroundColor: L.gold, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 9, minWidth: 90, alignItems: 'center',
  },
  joinedBtn: { backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  joinBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  joinedBtnText: { color: '#FFFFFF' },
  chatBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.20)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },

  tabBar: { flexDirection: 'row', backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 13, position: 'relative' },
  tabText: { color: L.textSub, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: L.gold, fontWeight: '800' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 8, right: 8,
    height: 2.5, borderRadius: 2, backgroundColor: L.gold,
  },

  content: { flex: 1 },
  tabContentPad: { flex: 1, paddingHorizontal: 16 },
});
