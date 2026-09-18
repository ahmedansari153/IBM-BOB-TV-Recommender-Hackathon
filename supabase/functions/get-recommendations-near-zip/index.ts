import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get('lat') ?? '');
  const lng = parseFloat(url.searchParams.get('lng') ?? '');

  if (isNaN(lat) || isNaN(lng)) {
    return new Response(JSON.stringify({ error: 'lat and lng are required' }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('recommendations')
    .select('zip_code, show_title, poster_url, recommended_at')
    .gte('recommended_at', since)
    .not('zip_code', 'is', null)
    .order('recommended_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Aggregate: most recent show per zip + count
  const zipMap: Record<string, { show_title: string; poster_url: string | null; count: number }> = {};
  for (const row of data ?? []) {
    const z = row.zip_code as string;
    if (!zipMap[z]) {
      zipMap[z] = { show_title: row.show_title, poster_url: row.poster_url, count: 1 };
    } else {
      zipMap[z].count++;
    }
  }

  const pins = Object.entries(zipMap).map(([zip, info]) => ({
    zip_code: zip,
    show_title: info.show_title,
    poster_url: info.poster_url,
    count: info.count,
  }));

  return new Response(JSON.stringify({ pins }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
