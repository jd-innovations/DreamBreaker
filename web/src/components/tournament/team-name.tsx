"use client";

// A tournament team's names on the web, in the shared formats (packages/shared/
// src/teamNames.ts, owner 2026-10-01): one full name per row where there is
// room, "A. Waters / A. Bright" where there is one line.

import { makeTeamShortener, teamFull, teamLines, type TeamPerson } from "@shared/teamNames";

/**
 * One full name per row. Falls back to the combined name when the caller has no
 * player list (an older data path), so nothing renders blank.
 */
export function TeamNameLines({
  people, fallback, className = "",
}: {
  people: TeamPerson[] | undefined;
  fallback: React.ReactNode;
  className?: string;
}) {
  if (!people || people.length === 0) return <span className={`block truncate ${className}`}>{fallback}</span>;
  return (
    <span className={`block min-w-0 ${className}`} title={teamFull(people)}>
      {teamLines(people).map((n, i) => <span key={i} className="block truncate">{n}</span>)}
    </span>
  );
}

/** The most players on any one side, for sizing fixed-height rows. */
export function maxTeamSize(teams: (TeamPerson[] | undefined)[]): number {
  return Math.max(1, ...teams.map((t) => t?.length ?? 0));
}

type Sides = {
  team1Name: string | null;
  team2Name: string | null;
  team1People?: TeamPerson[];
  team2People?: TeamPerson[];
};

/**
 * "A. Waters / A. Bright vs B. Johns / C. Johnson" for one-line places. Pass
 * `short` when the line sits among others (a queue), so a name clash across the
 * whole list keeps full names; otherwise only the two teams are compared.
 */
export function vsShort(m: Sides, short?: (people: TeamPerson[]) => string): string {
  const s = short ?? makeTeamShortener([m.team1People ?? [], m.team2People ?? []]);
  const one = (people: TeamPerson[] | undefined, name: string | null) => (people?.length ? s(people) : name ?? "TBD");
  return `${one(m.team1People, m.team1Name)} vs ${one(m.team2People, m.team2Name)}`;
}
