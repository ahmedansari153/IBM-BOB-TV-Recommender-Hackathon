import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const RPS_WINS: Record<string, string> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
};

async function sendPush(token: string, title: string, body: string) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  });
}

async function getUser(authHeader: string) {
  const { data: { user }, error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .auth.getUser(authHeader.replace('Bearer ', ''));
  return error ? null : user;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });
  const user = await getUser(authHeader);
  if (!user) return new Response('Unauthorized', { status: 401 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();

  // ── INITIATE ───────────────────────────────────────────────────────────────
  if (action === 'initiate') {
    const { challenged_id, challenger_show_id, challenger_show_title } = await req.json();
    if (!challenged_id || !challenger_show_id || !challenger_show_title) {
      return new Response(
        JSON.stringify({ error: 'challenged_id, challenger_show_id, challenger_show_title required' }),
        { status: 400 }
      );
    }

    const { data: friendship } = await supabase
      .from('friends').select('id').eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${challenged_id}),` +
        `and(requester_id.eq.${challenged_id},addressee_id.eq.${user.id})`
      )
      .maybeSingle();
    if (!friendship) return new Response(JSON.stringify({ error: 'Users are not friends' }), { status: 403 });

    const { data: match, error: matchErr } = await supabase
      .from('rps_matches')
      .insert({ challenger_id: user.id, challenged_id, challenger_show_id, challenger_show_title, status: 'pending' })
      .select().single();
    if (matchErr) return new Response(JSON.stringify({ error: matchErr.message }), { status: 500 });

    const { data: challengerProfile } = await supabase
      .from('profiles').select('display_name').eq('id', user.id).single();
    const { data: challengedProfile } = await supabase
      .from('profiles').select('expo_push_token').eq('id', challenged_id).single();

    if (challengedProfile?.expo_push_token) {
      await sendPush(
        challengedProfile.expo_push_token,
        'RPS Challenge! ✂️',
        `${challengerProfile?.display_name ?? 'Someone'} challenges you over "${challenger_show_title}" — 30 min to accept!`,
      );
    }

    return new Response(JSON.stringify({ match }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── ACCEPT ─────────────────────────────────────────────────────────────────
  if (action === 'accept') {
    const { match_id, challenged_show_id, challenged_show_title } = await req.json();
    if (!match_id || !challenged_show_id || !challenged_show_title) {
      return new Response(
        JSON.stringify({ error: 'match_id, challenged_show_id, challenged_show_title required' }),
        { status: 400 }
      );
    }

    const { data: match } = await supabase
      .from('rps_matches').select('*')
      .eq('id', match_id).eq('challenged_id', user.id).eq('status', 'pending')
      .single();
    if (!match) return new Response(JSON.stringify({ error: 'Match not found or not actionable' }), { status: 404 });

    if (new Date(match.expires_at) < new Date()) {
      await supabase.from('rps_matches').update({ status: 'expired' }).eq('id', match_id);
      return new Response(JSON.stringify({ error: 'Match has expired' }), { status: 410 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('rps_matches')
      .update({ challenged_show_id, challenged_show_title, status: 'choosing' })
      .eq('id', match_id).select().single();
    if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });

    const [{ data: challengerProfile }, { data: challengedProfile }] = await Promise.all([
      supabase.from('profiles').select('expo_push_token').eq('id', match.challenger_id).single(),
      supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    ]);
    if (challengerProfile?.expo_push_token) {
      await sendPush(
        challengerProfile.expo_push_token,
        'Challenge Accepted! ✊',
        `${challengedProfile?.display_name ?? 'Your opponent'} accepted — pick Rock, Paper, or Scissors!`,
      );
    }

    return new Response(JSON.stringify({ match: updated }), { headers: { 'Content-Type': 'application/json' } });
  }

  // ── CHOOSE ─────────────────────────────────────────────────────────────────
  if (action === 'choose') {
    const { match_id, choice } = await req.json();
    if (!match_id || !['rock', 'paper', 'scissors'].includes(choice)) {
      return new Response(
        JSON.stringify({ error: 'match_id and choice (rock|paper|scissors) required' }),
        { status: 400 }
      );
    }

    const { data: match } = await supabase
      .from('rps_matches').select('*')
      .eq('id', match_id).eq('status', 'choosing').single();
    if (!match) return new Response(JSON.stringify({ error: 'Match not found or not in choosing state' }), { status: 404 });

    const isChallenger = match.challenger_id === user.id;
    const isChallenged = match.challenged_id === user.id;
    if (!isChallenger && !isChallenged) return new Response('Forbidden', { status: 403 });

    const patch: Record<string, any> = isChallenger
      ? { challenger_choice: choice }
      : { challenged_choice: choice };

    const updatedChoices = {
      challenger_choice: isChallenger ? choice : match.challenger_choice,
      challenged_choice: isChallenged ? choice : match.challenged_choice,
    };

    let winnerId: string | null = null;
    let finalStatus = 'choosing';

    if (updatedChoices.challenger_choice && updatedChoices.challenged_choice) {
      const cChoice = updatedChoices.challenger_choice;
      const dChoice = updatedChoices.challenged_choice;

      if (cChoice === dChoice) {
        // Tie — reset choices for a rematch
        patch.challenger_choice = null;
        patch.challenged_choice = null;
      } else {
        winnerId = RPS_WINS[cChoice] === dChoice ? match.challenger_id : match.challenged_id;
        finalStatus = 'resolved';
        patch.winner_id = winnerId;
        patch.resolved_at = new Date().toISOString();
        patch.status = 'resolved';
        if (!isChallenger) patch.challenged_choice = choice;
        else patch.challenger_choice = choice;
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from('rps_matches').update(patch).eq('id', match_id).select().single();
    if (updateErr) return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });

    if (finalStatus === 'resolved' && winnerId) {
      const winningShow = winnerId === match.challenger_id
        ? match.challenger_show_title
        : match.challenged_show_title;
      const [{ data: p1 }, { data: p2 }] = await Promise.all([
        supabase.from('profiles').select('expo_push_token, display_name').eq('id', match.challenger_id).single(),
        supabase.from('profiles').select('expo_push_token, display_name').eq('id', match.challenged_id).single(),
      ]);
      const winnerName = winnerId === match.challenger_id ? p1?.display_name : p2?.display_name;
      const pushes = [];
      if (p1?.expo_push_token) {
        const msg = winnerId === match.challenger_id
          ? `You win! 🎉 You're watching "${winningShow}"`
          : `${winnerName} wins! You're watching "${winningShow}"`;
        pushes.push(sendPush(p1.expo_push_token, 'RPS Result ✊✂️✋', msg));
      }
      if (p2?.expo_push_token) {
        const msg = winnerId === match.challenged_id
          ? `You win! 🎉 You're watching "${winningShow}"`
          : `${winnerName} wins! You're watching "${winningShow}"`;
        pushes.push(sendPush(p2.expo_push_token, 'RPS Result ✊✂️✋', msg));
      }
      await Promise.all(pushes);
    }

    // Tie — notify both to re-pick
    if (patch.challenger_choice === null) {
      const [{ data: p1 }, { data: p2 }] = await Promise.all([
        supabase.from('profiles').select('expo_push_token').eq('id', match.challenger_id).single(),
        supabase.from('profiles').select('expo_push_token').eq('id', match.challenged_id).single(),
      ]);
      const ties = [];
      if (p1?.expo_push_token) ties.push(sendPush(p1.expo_push_token, "It's a tie! 🤝", 'Pick again — Rock, Paper, or Scissors!'));
      if (p2?.expo_push_token) ties.push(sendPush(p2.expo_push_token, "It's a tie! 🤝", 'Pick again — Rock, Paper, or Scissors!'));
      await Promise.all(ties);
    }

    return new Response(JSON.stringify({ match: updated }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Not found', { status: 404 });
});
