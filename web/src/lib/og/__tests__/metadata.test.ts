import { describe, it, expect } from 'vitest';
import { buildEntityMetadata } from '../metadata';
import { APP_ORIGIN } from '../types';
import type { OgPayload } from '../types';

describe('buildEntityMetadata — found entity', () => {
  const payload: OgPayload = {
    entityType: 'tournament',
    id: 'abc-123',
    title: 'Sarasota Slam',
    description: 'A great tournament.',
    imageUrl: 'https://cdn.example/cover.jpg',
    detailLine: 'Sat, Oct 4 · Sarasota, FL',
    ogType: 'website',
  };

  it('uses the entity title/description/image', () => {
    const meta = buildEntityMetadata('tournament', 'abc-123', payload);
    expect(meta.openGraph?.title).toBe('Sarasota Slam');
    expect(meta.openGraph?.description).toBe('A great tournament.');
    // @ts-expect-error -- images typing is broad in next's Metadata type
    expect(meta.openGraph?.images?.[0]?.url).toBe('https://cdn.example/cover.jpg');
  });

  it('sets twitter summary_large_image', () => {
    const meta = buildEntityMetadata('tournament', 'abc-123', payload);
    expect((meta.twitter as { card?: string } | undefined)?.card).toBe('summary_large_image');
  });

  it('canonical URL uses the singular /tournament/{id} path', () => {
    const meta = buildEntityMetadata('tournament', 'abc-123', payload);
    expect(meta.alternates?.canonical).toBe(`${APP_ORIGIN}/tournament/abc-123`);
    expect(meta.openGraph?.url).toBe(`${APP_ORIGIN}/tournament/abc-123`);
  });

  it('community uses /community/{id}, group uses /groups/{id} (plural)', () => {
    const community = buildEntityMetadata('community', 'evt-1', { ...payload, entityType: 'community' });
    expect(community.alternates?.canonical).toBe(`${APP_ORIGIN}/community/evt-1`);

    const group = buildEntityMetadata('group', 'grp-1', { ...payload, entityType: 'group' });
    expect(group.alternates?.canonical).toBe(`${APP_ORIGIN}/groups/grp-1`);
  });

  it('falls back to the dynamic OG image route when the entity has no cover photo', () => {
    const meta = buildEntityMetadata('facility', 'fac-1', { ...payload, entityType: 'facility', imageUrl: null });
    // @ts-expect-error -- images typing is broad in next's Metadata type
    expect(meta.openGraph?.images?.[0]?.url).toBe(`${APP_ORIGIN}/api/og/facility/fac-1`);
  });
});

describe('buildEntityMetadata — missing/private/cancelled (payload is null)', () => {
  it('never reveals whether the id exists — same generic metadata for every entity type', () => {
    const tournament = buildEntityMetadata('tournament', 'x', null);
    const coach = buildEntityMetadata('coach', 'y', null);

    expect(tournament.openGraph?.title).toBe(coach.openGraph?.title);
    expect(tournament.openGraph?.description).toBe(coach.openGraph?.description);
  });

  it('still points og:image at the branded fallback image route', () => {
    const meta = buildEntityMetadata('coach', 'some-id', null);
    // @ts-expect-error -- images typing is broad in next's Metadata type
    expect(meta.openGraph?.images?.[0]?.url).toBe(`${APP_ORIGIN}/api/og/coach/some-id`);
  });

  it('canonical URL is still the requested path (redirect target unaffected)', () => {
    const meta = buildEntityMetadata('facility', 'missing-id', null);
    expect(meta.alternates?.canonical).toBe(`${APP_ORIGIN}/facility/missing-id`);
  });
});
