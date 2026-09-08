import { supabase } from './supabase';

export type StorySlide = {
  headline: string;
  subheadline?: string | null;
  body?: string | null;
  metadata?: string | null;
  image_url?: string | null;
};

export type DynamicStory = {
  id: string;
  storyType: 'tournament' | 'game' | 'partner';
  title: string;
  subtitle: string | null;
  slides: StorySlide[];
  ctaLabel: string | null;
  ctaRoute: string | null;
  priorityScore: number;
  viewed: boolean;
};

export type StoryCategoryKey = 'your-area' | 'games' | 'tournaments' | 'partners' | 'marketplace' | 'courts';

export type StoryCategory = {
  key: StoryCategoryKey;
  label: string;
  kind: 'real' | 'placeholder';
  stories: DynamicStory[];
  hasUnviewed: boolean;
};

const EMPTY_STATE_SLIDE: StorySlide = {
  headline: 'Nothing major is happening nearby yet',
  body: "We'll surface games, paddles, courts, and tournaments as activity picks up.",
};

function emptyStateStory(category: StoryCategoryKey): DynamicStory {
  return {
    id: `empty-${category}`,
    storyType: 'tournament',
    title: 'Your Area',
    subtitle: null,
    slides: [EMPTY_STATE_SLIDE],
    ctaLabel: 'Explore Nearby',
    ctaRoute: '/nearby',
    priorityScore: 0,
    viewed: true,
  };
}

// Fetches all live (non-expired) system-generated story rows, marks which
// ones this user has already viewed, and groups them into the fixed set of
// Messenger story-row categories. "Marketplace"/"Courts" are always returned
// as empty placeholder categories — those subsystems don't exist yet, so
// there is deliberately no query behind them (see Dynamic Stories v0.1 plan).
export async function fetchStoryCategories(userId: string): Promise<StoryCategory[]> {
  const [{ data: rows, error }, { data: viewRows }] = await Promise.all([
    supabase
      .from('dynamic_stories')
      .select('id, story_type, title, subtitle, slides, cta_label, cta_route, priority_score, expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('priority_score', { ascending: false }),
    supabase.from('story_views').select('story_id').eq('user_id', userId),
  ]);

  if (error) throw new Error(error.message);

  const viewedIds = new Set((viewRows ?? []).map((r) => r.story_id));

  const stories: DynamicStory[] = (rows ?? []).map((r) => ({
    id: r.id,
    storyType: r.story_type as DynamicStory['storyType'],
    title: r.title,
    subtitle: r.subtitle,
    slides: (r.slides as unknown as StorySlide[]) ?? [],
    ctaLabel: r.cta_label,
    ctaRoute: r.cta_route,
    priorityScore: Number(r.priority_score),
    viewed: viewedIds.has(r.id),
  }));

  function buildCategory(key: StoryCategoryKey, label: string, filtered: DynamicStory[]): StoryCategory {
    const list = filtered.length > 0 ? filtered : [emptyStateStory(key)];
    return {
      key,
      label,
      kind: 'real',
      stories: list,
      hasUnviewed: list.some((s) => !s.viewed),
    };
  }

  const gameStories = stories.filter((s) => s.storyType === 'game');
  const tournamentStories = stories.filter((s) => s.storyType === 'tournament');
  const partnerStories = stories.filter((s) => s.storyType === 'partner');

  return [
    buildCategory('your-area', 'Your Area', stories),
    buildCategory('games', 'Games', gameStories),
    buildCategory('tournaments', 'Tournaments', tournamentStories),
    buildCategory('partners', 'Partners', partnerStories),
    { key: 'marketplace', label: 'Marketplace', kind: 'placeholder', stories: [], hasUnviewed: false },
    { key: 'courts', label: 'Courts', kind: 'placeholder', stories: [], hasUnviewed: false },
  ];
}

export async function markStoryViewed(storyId: string, userId: string): Promise<void> {
  if (storyId.startsWith('empty-')) return;
  // ignoreDuplicates -> ON CONFLICT DO NOTHING: repeat views are a no-op, and
  // this table only has INSERT/SELECT RLS policies (no UPDATE), so the default
  // upsert (ON CONFLICT DO UPDATE) would otherwise fail RLS on a second view.
  await supabase
    .from('story_views')
    .upsert(
      { story_id: storyId, user_id: userId },
      { onConflict: 'story_id,user_id', ignoreDuplicates: true },
    );
}
