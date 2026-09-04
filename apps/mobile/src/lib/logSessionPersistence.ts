import {
  addGuestParticipant,
  addRegisteredParticipant,
  assignGameParticipants,
  completePersonalSessionWithDistribution,
  createPersonalGame,
  createPersonalSession,
  fetchPersonalSessionWithGames,
  savePersonalGameScore,
  type PersonalSessionDetails,
} from '@/lib/supabase/personalSessions';
import {
  addSavedGame,
  getLogSessionState,
  getRoster,
  getSessionFormat,
  getSessionLocation,
  getSessionNotes,
  setParticipantDeliveries,
  setPersistedSession,
  setRosterSlotParticipantId,
  type RosterPlayer,
  type RosterSlot,
} from '@/lib/logSessionStore';

const REQUIRED_SLOTS: Record<'singles' | 'doubles', RosterSlot[]> = {
  singles: ['opponent1'],
  doubles: ['partner', 'opponent1', 'opponent2'],
};

function estimatedSkillFor(player: RosterPlayer): string | null {
  if (!player.temporary) return null;
  if (!player.comparison) return null;
  return [player.amount, player.comparison].filter(Boolean).join(' ') || player.comparison;
}

function requiredRosterEntries() {
  const format = getSessionFormat();
  const roster = getRoster();
  return REQUIRED_SLOTS[format].map((slot) => ({ slot, player: roster[slot] }));
}

export function missingRequiredRosterSlots(): RosterSlot[] {
  return requiredRosterEntries()
    .filter((entry): entry is { slot: RosterSlot; player: null } => entry.player == null)
    .map((entry) => entry.slot);
}

export function buildTeamLabels(myName: string) {
  const format = getSessionFormat();
  const roster = getRoster();
  if (format === 'singles') {
    return {
      myTeamLabel: myName,
      opponentsLabel: roster.opponent1?.name ?? 'Opponent',
    };
  }

  return {
    myTeamLabel: `${myName} & ${roster.partner?.name ?? 'Partner'}`,
    opponentsLabel: [roster.opponent1?.name, roster.opponent2?.name].filter(Boolean).join(' & ') || 'Opponents',
  };
}

async function ensureSession(userId: string) {
  const current = getLogSessionState();
  if (current.sessionId && current.selfSessionParticipantId) {
    return { sessionId: current.sessionId, selfParticipantId: current.selfSessionParticipantId };
  }

  const session = await createPersonalSession({
    format: current.format,
  });
  const self = await addRegisteredParticipant(session.id, userId);
  setPersistedSession(session.id, self.id);
  return { sessionId: session.id, selfParticipantId: self.id };
}

async function addRegisteredRosterParticipant(sessionId: string, player: RosterPlayer) {
  if (!player.profileId) {
    throw new Error(player.name + ' is missing a profile id. Search and select the player again, or add them as a guest.');
  }
  return addRegisteredParticipant(sessionId, player.profileId);
}

async function ensureRosterParticipants(sessionId: string) {
  const entries = requiredRosterEntries();
  const missing = entries.filter((entry) => !entry.player);
  if (missing.length > 0) {
    throw new Error('Add all required players before saving a game.');
  }

  const ids: Partial<Record<RosterSlot, string>> = {};
  for (const { slot, player } of entries) {
    if (!player) continue;
    if (player.sessionParticipantId) {
      ids[slot] = player.sessionParticipantId;
      continue;
    }


    const participant = player.temporary
      ? await addGuestParticipant({
          sessionId,
          displayName: player.name,
          estimatedSkill: estimatedSkillFor(player),
          phone: player.phone ?? null,
        })
      : await addRegisteredRosterParticipant(sessionId, player);

    setRosterSlotParticipantId(slot, participant.id);
    ids[slot] = participant.id;
  }

  return ids;
}

export async function saveCurrentLogSessionGame(input: {
  userId: string;
  myName: string;
  gameNumber: number;
  myScore: number;
  opponentScore: number;
}) {
  const format = getSessionFormat();
  const { sessionId, selfParticipantId } = await ensureSession(input.userId);
  const rosterParticipantIds = await ensureRosterParticipants(sessionId);
  const game = await createPersonalGame(sessionId, input.gameNumber);

  if (format === 'singles') {
    await assignGameParticipants(game.id, [
      { sessionParticipantId: selfParticipantId, teamNumber: 1, position: 1 },
      { sessionParticipantId: rosterParticipantIds.opponent1!, teamNumber: 2, position: 1 },
    ]);
  } else {
    await assignGameParticipants(game.id, [
      { sessionParticipantId: selfParticipantId, teamNumber: 1, position: 1 },
      { sessionParticipantId: rosterParticipantIds.partner!, teamNumber: 1, position: 2 },
      { sessionParticipantId: rosterParticipantIds.opponent1!, teamNumber: 2, position: 1 },
      { sessionParticipantId: rosterParticipantIds.opponent2!, teamNumber: 2, position: 2 },
    ]);
  }

  const saved = await savePersonalGameScore(game.id, input.myScore, input.opponentScore);
  const labels = buildTeamLabels(input.myName);
  addSavedGame({
    id: saved.id,
    gameNumber: input.gameNumber,
    myScore: input.myScore,
    opponentScore: input.opponentScore,
    myTeamLabel: labels.myTeamLabel,
    opponentsLabel: labels.opponentsLabel,
  });

  return saved;
}

export async function completeCurrentLogSession(input: {
  notes?: string | null;
}): Promise<PersonalSessionDetails | null> {
  const current = getLogSessionState();
  if (!current.sessionId) return null;
  const location = getSessionLocation();
  const deliveries = await completePersonalSessionWithDistribution({
    sessionId: current.sessionId,
    facilityId: location.facilityId,
    notes: input.notes ?? getSessionNotes(),
  });
  setParticipantDeliveries(deliveries.map((delivery) => ({
    sessionParticipantId: delivery.session_participant_id,
    profileId: delivery.profile_id,
    guestPlayerId: delivery.guest_player_id,
    displayName: delivery.display_name,
    phone: delivery.phone,
    participantKind: delivery.participant_kind,
    deliveryStatus: delivery.delivery_status,
    guestShareId: delivery.guest_share_id,
    claimStatus: delivery.claim_status ?? null,
  })));
  return fetchPersonalSessionWithGames(current.sessionId);
}
