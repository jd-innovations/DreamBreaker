import type { Database } from "@shared/database.types";

export type Group = Database["public"]["Tables"]["groups"]["Row"] & { memberCount: number };
export type GroupInsert = Database["public"]["Tables"]["groups"]["Insert"];
export type GroupPrivacy = "public" | "private" | "secret";
export type GroupRole = "owner" | "admin" | "member";
export type MemberStatus = "active" | "pending";

export type GroupMember = {
  userId: string;
  fullName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  dupr: number | null;
  selfRating: string | null;
  locationCity: string | null;
  role: GroupRole;
  status: MemberStatus;
  joinedAt: string;
};

export type GroupPost = Database["public"]["Tables"]["group_posts"]["Row"];
export type GroupPollOption = Database["public"]["Tables"]["group_poll_options"]["Row"];
export type GroupComment = Database["public"]["Tables"]["group_post_comments"]["Row"] & {
  author: { fullName: string | null; avatarUrl: string | null } | null;
};
export type PlayEventRow = Database["public"]["Tables"]["play_events"]["Row"];

export type GroupPostWithMeta = GroupPost & {
  author: { fullName: string | null; avatarUrl: string | null } | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  pollOptions: (GroupPollOption & { voteCount: number; votedByMe: boolean })[];
};

export type GroupFeedItem =
  | { kind: "post"; createdAt: string; post: GroupPostWithMeta }
  | { kind: "event"; createdAt: string; event: PlayEventRow };

export const REPORT_REASONS: { value: Database["public"]["Enums"]["report_reason"]; label: string }[] = [
  { value: "spam_or_inappropriate", label: "Spam or inappropriate" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Other" },
];

export type GroupReport = Database["public"]["Tables"]["group_post_reports"]["Row"];
