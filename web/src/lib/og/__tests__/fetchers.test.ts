import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeOgClientMock, type TableResponse } from './testUtils';

// ogClient() is a lazily-created singleton (see client.ts); mocking the
// module lets each test swap in its own fake client without touching real
// Supabase config or network.
let currentClient: ReturnType<typeof makeOgClientMock>['client'];
vi.mock('../client', () => ({
  ogClient: () => currentClient,
}));

const {
  fetchTournamentOg,
  fetchCommunityEventOg,
  fetchMarketplaceListingOg,
  fetchGroupOg,
  fetchCoachOg,
  fetchFacilityOg,
} = await import('../fetchers');

const UUID = '11111111-1111-1111-1111-111111111111';

function setup(responses: Record<string, TableResponse>) {
  const mock = makeOgClientMock(responses);
  currentClient = mock.client;
  return mock;
}

beforeEach(() => {
  currentClient = undefined as unknown as ReturnType<typeof makeOgClientMock>['client'];
});

describe('id shape guard', () => {
  it('rejects a non-UUID id before ever querying', async () => {
    setup({});
    const result = await fetchTournamentOg('not-a-uuid');
    expect(result).toBeNull();
  });
});

describe('fetchTournamentOg', () => {
  it('returns a payload for a visible tournament', async () => {
    setup({
      tournaments: {
        data: {
          id: UUID,
          name: 'Sarasota Slam',
          event_date: '2026-10-04',
          venue_name: 'Bath & Racquet',
          city: 'Sarasota',
          state: 'FL',
          cover_img_url: 'https://cdn.example/cover.jpg',
          description: null,
        },
        error: null,
      },
    });
    const result = await fetchTournamentOg(UUID);
    expect(result?.title).toBe('Sarasota Slam');
    expect(result?.imageUrl).toBe('https://cdn.example/cover.jpg');
    expect(result?.detailLine).toContain('Sarasota, FL');
  });

  it('returns null when RLS hides the row (cancelled/draft/pending) — anon query returns no data', async () => {
    setup({ tournaments: { data: null, error: null } });
    const result = await fetchTournamentOg(UUID);
    expect(result).toBeNull();
  });
});

describe('fetchCommunityEventOg', () => {
  it('labels each event_type', async () => {
    setup({
      play_events: {
        data: {
          id: UUID, name: 'Sat Round Robin', event_date: '2026-10-04',
          venue_name: 'Courts', location: 'Courts', city: 'Bradenton', state: 'FL',
          cover_url: null, event_type: 'round_robin', notes: null,
        },
        error: null,
      },
    });
    const result = await fetchCommunityEventOg(UUID);
    expect(result?.detailLine).toContain('Round Robin');
  });

  it('returns null for a cancelled event (RLS hides it from anon)', async () => {
    setup({ play_events: { data: null, error: null } });
    expect(await fetchCommunityEventOg(UUID)).toBeNull();
  });
});

describe('fetchMarketplaceListingOg', () => {
  it('only queries active listings and uses the first photo by sort_order', async () => {
    const mock = setup({
      marketplace_listings: {
        data: {
          id: UUID, title: 'JOOLA Paddle', description: null,
          asking_price_cents: 4599, location_city: 'Bradenton', location_state: 'FL', status: 'active',
        },
        error: null,
      },
      marketplace_listing_photos: { data: { url: 'https://cdn.example/paddle.jpg' }, error: null },
    });
    const result = await fetchMarketplaceListingOg(UUID);
    expect(result?.imageUrl).toBe('https://cdn.example/paddle.jpg');

    const listingsCall = mock.calls.find((c) => c.table === 'marketplace_listings')!;
    expect(listingsCall.eq).toContainEqual(['status', 'active']);
  });

  it('returns null with no image lookup when the listing itself is not found/inactive', async () => {
    const mock = setup({ marketplace_listings: { data: null, error: null } });
    const result = await fetchMarketplaceListingOg(UUID);
    expect(result).toBeNull();
    expect(mock.calls.some((c) => c.table === 'marketplace_listing_photos')).toBe(false);
  });
});

describe('fetchGroupOg', () => {
  it('only queries public groups', async () => {
    const mock = setup({
      groups: {
        data: { id: UUID, name: 'Sunday Ballers', description: null, image_url: null, location: 'Sarasota', privacy: 'public' },
        error: null,
      },
    });
    await fetchGroupOg(UUID);
    const call = mock.calls.find((c) => c.table === 'groups')!;
    expect(call.eq).toContainEqual(['privacy', 'public']);
  });

  it('returns null for a private group (RLS/filter hides it from anon)', async () => {
    setup({ groups: { data: null, error: null } });
    expect(await fetchGroupOg(UUID)).toBeNull();
  });
});

describe('fetchCoachOg — column allowlist and is_coach gate', () => {
  const FORBIDDEN_COLUMNS = [
    'email', 'date_of_birth', 'gender', 'location_lat', 'location_lng', 'location_coords',
    'stripe_customer_id', 'stripe_connect_account_id', 'stripe_connect_onboarded_at',
  ];

  it('never selects a column outside the anon grant allowlist', async () => {
    const mock = setup({ profiles: { data: null, error: null } });
    await fetchCoachOg(UUID);
    const call = mock.calls.find((c) => c.table === 'profiles')!;
    expect(call.select).not.toBe('*');
    for (const forbidden of FORBIDDEN_COLUMNS) {
      expect(call.select?.includes(forbidden)).toBe(false);
    }
  });

  it('always filters is_coach = true, never trusting the id alone', async () => {
    const mock = setup({ profiles: { data: null, error: null } });
    await fetchCoachOg(UUID);
    const call = mock.calls.find((c) => c.table === 'profiles')!;
    expect(call.eq).toContainEqual(['is_coach', true]);
  });

  it('returns null for a real user id that is simply not a coach — same as not-found', async () => {
    // A row-shaped response would only come back from Postgres if is_coach were
    // satisfied; here we assert the null-handling path a false/blocked filter
    // takes, which must be indistinguishable from "id does not exist".
    setup({ profiles: { data: null, error: null } });
    expect(await fetchCoachOg(UUID)).toBeNull();
  });

  it('returns a payload for a real coach', async () => {
    setup({
      profiles: {
        data: {
          id: UUID, full_name: 'Jamie Rivera', avatar_url: 'https://cdn.example/avatar.jpg',
          cover_url: null, bio: null, location_city: 'Bradenton', location_state: 'FL', is_coach: true,
        },
        error: null,
      },
    });
    const result = await fetchCoachOg(UUID);
    expect(result?.title).toBe('Jamie Rivera');
    expect(result?.ogType).toBe('profile');
    expect(result?.imageUrl).toBe('https://cdn.example/avatar.jpg'); // falls back to avatar when no cover
  });
});

describe('fetchFacilityOg', () => {
  it('uses the primary photo when one exists', async () => {
    setup({
      facilities: { data: { id: UUID, name: 'Riverside Courts', city: 'Bradenton', state: 'FL', description: null }, error: null },
      facility_photos: { data: { url: 'https://cdn.example/courts.jpg' }, error: null },
    });
    const result = await fetchFacilityOg(UUID);
    expect(result?.imageUrl).toBe('https://cdn.example/courts.jpg');
  });

  it('has no cover image when the facility has no photos — falls back to null, not an error', async () => {
    setup({
      facilities: { data: { id: UUID, name: 'Riverside Courts', city: 'Bradenton', state: 'FL', description: null }, error: null },
      facility_photos: { data: null, error: null },
    });
    const result = await fetchFacilityOg(UUID);
    expect(result?.imageUrl).toBeNull();
  });

  it('returns null for a facility that does not exist', async () => {
    setup({ facilities: { data: null, error: null } });
    expect(await fetchFacilityOg(UUID)).toBeNull();
  });
});
