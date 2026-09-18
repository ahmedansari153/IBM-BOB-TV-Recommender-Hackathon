import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function sendPush(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: expiredMatches, error } = await supabase
    .from('rps_matches')
    .select('id, challenger_id, challenged_id, challenger_show_title')
    .in('status', ['pending', 'accepted', 'choosing'])
    .lt('expires_at', new Date().toISOString());

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!expiredMatches?.length) {
    return new Response(JSON.stringify({ expired: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  const ids = expiredMatches.map((m: any) => m.id);
  await supabase.from('rps_matches').update({ status: 'expired' }).in('id', ids);

  for (const match of expiredMatches) {
    const { data: challengerProfile } = await supabase
      .from('profiles').select('expo_push_token').eq('id', match.challenger_id).single();
    const { data: challengedProfile } = await supabase
      .from('profiles').select('display_name').eq('id', match.challenged_id).single();

    if (challengerProfile?.expo_push_token) {
      await sendPush(
        challengerProfile.expo_push_token,
        'RPS Challenge Expired',
        `Your challenge to ${challengedProfile?.display_name ?? 'your friend'} over "${match.challenger_show_title}" expired`,
      );
    }
  }

  return new Response(JSON.stringify({ expired: ids.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
