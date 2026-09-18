import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function sendPush(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });
  const { data: { user }, error: authErr } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return new Response('Unauthorized', { status: 401 });

  const { to_user_id, tvdb_series_id, show_title } = await req.json();
  if (!to_user_id || !tvdb_series_id || !show_title) {
    return new Response(
      JSON.stringify({ error: 'to_user_id, tvdb_series_id, show_title are required' }),
      { status: 400 }
    );
  }

  // Verify friendship
  const { data: friendship } = await supabase
    .from('friends')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${to_user_id}),` +
      `and(requester_id.eq.${to_user_id},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (!friendship) {
    return new Response(JSON.stringify({ error: 'Users are not friends' }), { status: 403 });
  }

  const { data: promotion, error } = await supabase
    .from('promotions')
    .insert({ from_user_id: user.id, to_user_id, tvdb_series_id, show_title })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const { data: fromProfile } = await supabase
    .from('profiles').select('display_name').eq('id', user.id).single();
  const { data: toProfile } = await supabase
    .from('profiles').select('expo_push_token').eq('id', to_user_id).single();

  if (toProfile?.expo_push_token) {
    await sendPush(
      toProfile.expo_push_token,
      'Show Recommendation 📺',
      `${fromProfile?.display_name ?? 'A friend'} thinks you should watch ${show_title}`,
    );
  }

  return new Response(JSON.stringify({ promotion }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
