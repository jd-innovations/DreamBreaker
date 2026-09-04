## Goal

Build Player Messaging as a reusable platform service for DreamBreakerPB.

Messaging is not just a Partner Finder feature.

It must eventually support:

- Partner Finder matches
- Community Play invitations
- Community Play organizer/player messages
- Tournament player communication
- Director ↔ Player communication
- Tournament announcements
- Future group/team chats

The goal is one unified messaging foundation that can be reused everywhere in the app.

## Response Rules

Claude must keep responses concise.

Default behavior:

- Return only changed files.
- Do not restate requirements.
- Do not explain implementation unless asked.
- Do not output unchanged code.
- Prefer unified diffs when appropriate.
- Maximum response: 300 lines.
- No long audit reports unless explicitly requested.

Required response format:

## Changed Files
- ...

## Verification
- TypeScript: PASS/FAIL
- Feature: PASS/FAIL

## Remaining Issues
- ...

STATUS: PASS/FAIL

## Scope

Mobile-first.

Web/admin messaging is deferred unless explicitly requested.

Do not touch:

- Community Play scoring
- Community Play brackets
- Tournament registration
- Tournament publishing
- Facilities
- Payments
- Analytics
- Design system

Messaging must integrate with existing features later, but first build the reusable foundation.

## Current Project State

Community Play is functionally complete and Supabase-backed.

Facilities Directory is functionally complete and Supabase-backed.

Partner Finder core feature is complete.

Messaging is the next major subsystem.

## Product Direction

Messaging should become the central communication layer for DreamBreakerPB.

Every conversation should eventually appear in one unified Inbox, regardless of where it started:

- Partner Finder
- Community Play
- Tournament
- Director message
- Team chat
- Announcement

Avoid building separate messaging systems for each feature.

## Supported Conversation Types

MVP:

- direct

Near future:

- community_event
- tournament
- director_player

Later:

- group
- team
- announcement

## Recommended Schema

Only add schema after auditing what already exists.

Expected tables:

### conversations

- id uuid primary key default gen_random_uuid()
- conversation_type text not null default 'direct'
- title text null
- created_by uuid references profiles(id) on delete set null
- related_play_event_id uuid references play_events(id) on delete set null
- related_tournament_id uuid references tournaments(id) on delete set null
- created_at timestamptz default now()
- updated_at timestamptz default now()

### conversation_participants

- conversation_id uuid references conversations(id) on delete cascade
- user_id uuid references profiles(id) on delete cascade
- role text not null default 'member'
- joined_at timestamptz default now()
- last_read_at timestamptz null

Primary key:

- conversation_id, user_id

### messages

- id uuid primary key default gen_random_uuid()
- conversation_id uuid references conversations(id) on delete cascade
- sender_id uuid references profiles(id) on delete set null
- body text not null
- message_type text not null default 'text'
- created_at timestamptz default now()
- edited_at timestamptz null
- deleted_at timestamptz null

### message_reads

Optional for MVP if last_read_at is enough.

- message_id uuid references messages(id) on delete cascade
- user_id uuid references profiles(id) on delete cascade
- read_at timestamptz default now()

Primary key:

- message_id, user_id

### message_attachments

Future.

- id uuid primary key default gen_random_uuid()
- message_id uuid references messages(id) on delete cascade
- url text not null
- file_type text
- created_at timestamptz default now()

## RLS Expectations

Users should be able to:

- read conversations they participate in
- read messages in conversations they participate in
- send messages to conversations they participate in
- update their own last_read_at
- soft delete or edit their own messages if supported

Users should not be able to:

- read conversations they are not part of
- send messages to conversations they are not part of
- impersonate other senders
- add other participants unless allowed by conversation type

Admins may have moderation access later, but not required for MVP.

## Realtime Strategy

Messaging should be Supabase Realtime-ready.

MVP can use:

- useFocusEffect refresh
- manual polling if needed

Realtime can be added after the service and screens are stable.

When realtime is added, subscribe to:

- messages by conversation_id
- conversation_participants for read state
- conversations for updated_at ordering

## Implementation Slices

### Slice 1 — Messaging Readiness Audit

Audit existing app for:

- chat screens
- mock message data
- conversations table
- messages table
- notification placeholders
- Partner Finder messaging entry
- Community Play message placeholders

No building during this slice.

### Slice 2 — Schema + RLS

Create messaging tables and policies:

- conversations
- conversation_participants
- messages
- optionally message_reads

No UI yet.

### Slice 3 — Messaging Service

Create:

- fetchConversations()
- fetchConversation(id)
- fetchMessages(conversationId)
- sendMessage(conversationId, body)
- markConversationRead(conversationId)
- createDirectConversation(userId)
- getOrCreateDirectConversation(userId)

### Slice 4 — Inbox

Create unified Inbox screen.

Shows:

- conversation title
- participant avatar
- last message
- unread indicator
- timestamp
- conversation type badge

### Slice 5 — Chat Screen

Create conversation detail screen.

Supports:

- message list
- text input
- send button
- loading state
- empty state
- mark read on open

### Slice 6 — Partner Finder Integration

From Partner Finder match:

- Message button opens or creates direct conversation
- Conversation appears in Inbox

### Slice 7 — Community Play Integration

Later:

- Event organizer can message participants
- Event participants can message organizer
- Optional event group chat

### Slice 8 — Tournament Integration

Later:

- Director ↔ Player messaging
- Tournament announcements
- Division/team messages

### Slice 9 — Realtime

Add live message updates.

### Slice 10 — Notifications

Add push notification hooks for new messages.

### Slice 11 — Attachments

Future.

### Slice 12 — Group Chat

Future.

## MVP Success Criteria

Messaging MVP is complete when:

- users can open Inbox
- users can start a direct conversation
- users can send and read text messages
- messages persist in Supabase
- conversation list updates with last message
- Partner Finder can open a direct chat
- unread state is tracked at conversation level
- RLS prevents users from seeing conversations they do not belong to

## Out of Scope For MVP

- voice messages
- video messages
- GIFs
- reactions
- message threads
- message forwarding
- file uploads
- moderation dashboard
- AI summaries
- typing indicators
- read receipts per message
