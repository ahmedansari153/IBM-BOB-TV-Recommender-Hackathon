import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TVDB_API_URL = 'https://api4.thetvdb.com/v4';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TVDB_API_KEY = Deno.env.get('TVDB_API_KEY')!;

// Genre keyword map → TVDB genre slugs
const GENRE_MAP: Record<string, string> = {
  Drama: 'Drama',
  Comedy: 'Comedy',
  Thriller: 'Thriller',
  'Sci-Fi': 'Science Fiction',
  Fantasy: 'Fantasy',
  Horror: 'Horror',
  Crime: 'Crime',
  Documentary: 'Documentary',
  Animation: 'Animation',
  Romance: 'Romance',
};

// Scoring weights
const WEIGHTS = {
  genreMatch: 3,
  yearMatch: 2,
  networkMatch: 2,
  statusMatch: 1,
  languageMatch: 1,
  alreadySeen: -999,
};

interface TasteProfile {
  genres?: string[];
  yearRange?: string;
  pace?: string;
  status?: string;
  language?: string;
  episodeLength?: string;
  mood?: string;
  networks?: string[];
}

interface TVDBSeries {
  tvdb_id: string;
  name: string;
  overview?: string;
  image_url?: string;
  genres?: string[];
  network?: string;
  status?: string;
  year?: string;
  primary_language?: string;
}

async function getTVDBToken(): Promise<string> {
  const res = await fetch(`${TVDB_API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: TVDB_API_KEY }),
  });
  const data = await res.json();
  return data.data.token;
}

async function searchTVDB(token: string, profile: TasteProfile): Promise<TVDBSeries[]> {
  const genre = profile.genres?.[0] ? GENRE_MAP[profile.genres[0]] ?? profile.genres[0] : 'Drama';
  const params = new URLSearchParams({ query: genre, type: 'series', limit: '20' });
  if (profile.language && profile.language !== 'Any') {
    params.set('language', profile.language.toLowerCase());
  }
  const res = await fetch(`${TVDB_API_URL}/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return (data.data ?? []) as TVDBSeries[];
}

function scoreCandidate(series: TVDBSeries, profile: TasteProfile, seenIds: Set<string>): number {
  if (seenIds.has(series.tvdb_id)) return WEIGHTS.alreadySeen;

  let score = 0;

  const profileGenres = (profile.genres ?? []).map((g) => (GENRE_MAP[g] ?? g).toLowerCase());
  const seriesGenres = (series.genres ?? []).map((g) => g.toLowerCase());
  for (const g of profileGenres) {
    if (seriesGenres.includes(g)) score += WEIGHTS.genreMatch;
  }

  if (profile.yearRange && series.year) {
    const year = parseInt(series.year, 10);
    const ranges: Record<string, [number, number]> = {
      'Classic (pre-1990)': [0, 1989],
      '90s': [1990, 1999],
      '2000s': [2000, 2009],
      '2010s': [2010, 2019],
      'Modern (2020+)': [2020, 9999],
    };
    const range = ranges[profile.yearRange];
    if (range && year >= range[0] && year <= range[1]) score += WEIGHTS.yearMatch;
  }

  if (profile.status && series.status) {
    const want = profile.status.toLowerCase();
    const actual = series.status.toLowerCase();
    if (
      (want === 'ongoing' && actual.includes('continu')) ||
      (want === 'completed' && actual.includes('ended'))
    ) {
      score += WEIGHTS.statusMatch;
    }
  }

  if (
    profile.language &&
    profile.language !== 'Any' &&
    series.primary_language?.toLowerCase() === profile.language.toLowerCase()
  ) {
    score += WEIGHTS.languageMatch;
  }

  if (profile.networks && series.network) {
    for (const net of profile.networks) {
      if (series.network.toLowerCase().includes(net.toLowerCase())) {
        score += WEIGHTS.networkMatch;
        break;
      }
    }
  }

  return score;
}

async function sendPushNotification(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let userIds: string[] = [];
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (body.user_id) userIds = [body.user_id];
  }

  if (userIds.length === 0) {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('onboarding_done', true);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    userIds = (profiles ?? []).map((p: any) => p.id);
  }

  let tvdbToken: string;
  try {
    tvdbToken = await getTVDBToken();
  } catch {
    return new Response(JSON.stringify({ error: 'TVDB auth failed' }), { status: 500 });
  }

  const results: any[] = [];

  for (const userId of userIds) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('taste_profile, expo_push_token, zip_code')
      .eq('id', userId)
      .single();
    if (!profile) continue;

    const { data: seen } = await supabase
      .from('recommendations')
      .select('tvdb_series_id')
      .eq('user_id', userId);
    const seenIds = new Set((seen ?? []).map((r: any) => r.tvdb_series_id));

    const candidates = await searchTVDB(tvdbToken, profile.taste_profile ?? {});
    if (!candidates.length) continue;

    const scored = candidates
      .map((c) => ({ series: c, score: scoreCandidate(c, profile.taste_profile ?? {}, seenIds) }))
      .filter((c) => c.score > WEIGHTS.alreadySeen)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) continue;

    const best = scored[0];

    const { error: insertErr } = await supabase.from('recommendations').insert({
      user_id: userId,
      tvdb_series_id: best.series.tvdb_id,
      show_title: best.series.name,
      overview: best.series.overview ?? null,
      poster_url: best.series.image_url ?? null,
      zip_code: profile.zip_code ?? null,
      score: best.score,
    });
    if (insertErr) { results.push({ userId, error: insertErr.message }); continue; }

    if (profile.expo_push_token) {
      await sendPushNotification(
        profile.expo_push_token,
        "Today's Pick 📺",
        `${best.series.name} — tap to see why we picked it for you`,
      );
    }
    results.push({ userId, show: best.series.name, score: best.score });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
