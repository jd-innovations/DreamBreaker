// The message that invites a guest to claim their half of a logged match.
//
// Lives here rather than in a screen because two places now send it: the
// session-saved screen immediately after logging, and Match Details, where an
// invite that was never sent (or has expired) can be re-offered. It used to be
// a local function in session-saved.tsx, which is why the second entry point
// had no message at all and shipped a plain-text dead end instead.

export type ClaimInviteGame = {
  gameNumber: number;
  myScore: number;
  opponentScore: number;
  myTeamLabel: string;
  opponentsLabel: string;
};

export function firstName(name: string) {
  const trimmed = name.trim();
  const space = trimmed.indexOf(' ');
  return space > 0 ? trimmed.slice(0, space) : trimmed;
}

export function buildClaimInviteMessage({
  guestName,
  recorderName,
  facilityName,
  games,
  appClaimUrl,
  webClaimUrl,
}: {
  guestName: string;
  recorderName: string;
  facilityName: string | null;
  games: ClaimInviteGame[];
  appClaimUrl: string;
  webClaimUrl: string;
}) {
  // Plain ASCII only, and a hyphen rather than an en dash, on purpose.
  // This is SMS: one character outside GSM-7 -- an emoji, an en dash --
  // switches the whole message to UCS-2 and the per-segment limit drops from
  // 160 to 70. At this length that turns a 3-segment message into 6.
  //
  // The score sits on its own line ahead of the teams because it used to run
  // straight into the last player's name: "Jesus & Cruz Dominguez 11, Demo 6
  // & Demo 5 0" reads as though someone is called "Demo 5 0". `def.` then
  // says which side won, which the old comma never did.
  const scoreLines = games.length > 0
    ? games.map((game) => [
      `Game ${game.gameNumber}  ${game.myScore}-${game.opponentScore}`,
      `${game.myTeamLabel} def. ${game.opponentsLabel}`,
    ].join('\n')).join('\n')
    : 'Score saved in Pickleball App.';

  return [
    `Great game today, ${firstName(guestName)}!`,
    '',
    `${recorderName} recorded your match${facilityName ? ` at ${facilityName}` : ''}.`,
    '',
    scoreLines,
    '',
    'Claim your match:',
    webClaimUrl,
    '',
    // Kept deliberately. /claim/* is in the AASA list so the https link above
    // opens the app when installed -- but that depends on the association
    // file the device cached, and Apple's CDN served a stale copy for an hour
    // on 2026-09-10. This scheme link is the fallback for that case.
    'Open in the app:',
    appClaimUrl,
  ].join('\n');
}
