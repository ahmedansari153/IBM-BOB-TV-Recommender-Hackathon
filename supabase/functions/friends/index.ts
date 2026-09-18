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
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });
  const { data: { user }, error: authErr } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const action = url.pathname.split('/').pop(); // 'send' or 'respond'

  // ── SEND FRIEND REQUEST ────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'send') {
    const { addressee_id } = await req.json();
    if (!addressee_id) {
      return new Response(JSON.stringify({ error: 'addressee_id required' }), { status: 400 });
    }

    const { data: existing } = await supabase
      .from('friends')
      .select('id, status')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${addressee_id}),` +
        `and(requester_id.eq.${addressee_id},addressee_id.eq.${user.id})`
      )
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Friendship already exists', status: existing.status }),
        { status: 409 }
      );
    }

    const { data: friendship, error } = await supabase
      .from('friends')
      .insert({ requester_id: user.id, addressee_id })
      .select()
      .single();

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    const { data: requesterProfile } = await supabase
      .from('profiles').select('display_name').eq('id', user.id).single();
    const { data: addresseeProfile } = await supabase
      .from('profiles').select('expo_push_token').eq('id', addressee_id).single();

    if (addresseeProfile?.expo_push_token) {
      await sendPush(
        addresseeProfile.expo_push_token,
        'New Friend Request',
        `${requesterProfile?.display_name ?? 'Someone'} wants to be your friend`,
      );
    }

    return new Response(JSON.stringify({ friendship }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── RESPOND TO FRIEND REQUEST ──────────────────────────────────────────────
  if (req.method === 'POST' && action === 'respond') {
    const { friendship_id, status } = await req.json();
    if (!friendship_id || !['accepted', 'declined'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'friendship_id and status (accepted|declined) required' }),
        { status: 400 }
      );
    }

    const { data: updated, error } = await supabase
      .from('friends')
      .update({ status })
      .eq('id', friendship_id)
      .eq('addressee_id', user.id)
      .select()
      .single();

    if (error || !updated) {
      return new Response(JSON.stringify({ error: error?.message ?? 'Not found' }), { status: 404 });
    }

    if (status === 'accepted') {
      const { data: addresseeProfile } = await supabase
        .from('profiles').select('display_name').eq('id', user.id).single();
      const { data: requesterProfile } = await supabase
        .from('profiles').select('expo_push_token').eq('id', updated.requester_id).single();
      if (requesterProfile?.expo_push_token) {
        await sendPush(
          requesterProfile.expo_push_token,
          'Friend Request Accepted',
          `${addresseeProfile?.display_name ?? 'Someone'} accepted your friend request`,
        );
      }
    }

    return new Response(JSON.stringify({ updated }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Not found', { status: 404 });
});
