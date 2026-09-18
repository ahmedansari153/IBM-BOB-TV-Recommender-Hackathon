/**
 * RPSPickerCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Full backend-wired Rock-Paper-Scissors picker for PickTogether.
 *
 * BACKEND CONTRACT
 * ────────────────
 * Table: rps_matches
 *   id              uuid PK
 *   challenger_id   uuid  FK → profiles.id
 *   opponent_id     uuid  FK → profiles.id
 *   challenger_show text  (show title)
 *   opponent_show   text
 *   challenger_move "Rock"|"Paper"|"Scissors"|null
 *   opponent_move   "Rock"|"Paper"|"Scissors"|null
 *   status          "pending"|"accepted"|"resolved"|"expired"
 *   winner_id       uuid|null   (null = draw)
 *   created_at      timestamptz
 *   expires_at      timestamptz
 *
 * REALTIME FLOW
 * ─────────────
 *  1. Both players land on this screen after match is "accepted".
 *  2. User taps a bubble → PATCH challenger_move (or opponent_move) via RPC.
 *  3. Backend Edge Function resolves winner once both moves are set.
 *  4. Supabase Realtime fires UPDATE on rps_matches → this component
 *     reads winner_id and auto-navigates to RPSResult.
 *
 * USAGE
 * ─────
 * // app/rps/choose/[matchId].tsx
 * import RPSPickerCard from '@/components/RPSPickerCard';
 *
 * export default function ChooseScreen() {
 *   const { matchId } = useLocalSearchParams<{ matchId: string }>();
 *   const router = useRouter();
 *   return (
 *     <RPSPickerCard
 *       matchId={matchId}
 *       onResult={(result) => router.push(`/rps/result/${matchId}`)}
 *     />
 *   );
 * }
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase'; // your supabase client singleton

// ─── Types ────────────────────────────────────────────────────────────────────

export type RPSMove = 'Rock' | 'Paper' | 'Scissors';

/** Shape of a row from rps_matches, restricted to the fields we need */
interface RPSMatch {
  id: string;
  challenger_id: string;
  opponent_id: string;
  challenger_show: string;
  opponent_show: string;
  challenger_move: RPSMove | null;
  opponent_move: RPSMove | null;
  status: 'pending' | 'accepted' | 'resolved' | 'expired';
  winner_id: string | null;
}

export type RPSResult =
  | { outcome: 'win';  myMove: RPSMove; oppMove: RPSMove }
  | { outcome: 'lose'; myMove: RPSMove; oppMove: RPSMove }
  | { outcome: 'draw'; myMove: RPSMove; oppMove: RPSMove };

interface Props {
  matchId: string;
  /** Called when the match resolves. Navigate to result screen here. */
  onResult: (result: RPSResult) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OPTIONS: { move: RPSMove; emoji: string; subLabel: string }[] = [
  { move: 'Rock',     emoji: '✊', subLabel: 'Beat Scissors' },
  { move: 'Paper',    emoji: '✋', subLabel: 'Beat Rock'     },
  { move: 'Scissors', emoji: '✌️', subLabel: 'Beat Paper'   },
];

/** What each move beats */
const BEATS: Record<RPSMove, RPSMove> = {
  Rock: 'Scissors',
  Paper: 'Rock',
  Scissors: 'Paper',
};

const BUBBLE_SIZE = 76;

// ─── Component ────────────────────────────────────────────────────────────────

export default function RPSPickerCard({ matchId, onResult }: Props) {
  const router = useRouter();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [match, setMatch]     = useState<RPSMatch | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [chosen, setChosen]   = useState<RPSMove | null>(null);
  const [locked, setLocked]   = useState(false);
  const [oppReady, setOppReady] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Animation values ────────────────────────────────────────────────────────
  // scale + used as opacity interpolation source
  const anims = useRef<Record<RPSMove, Animated.Value>>({
    Rock:     new Animated.Value(1),
    Paper:    new Animated.Value(1),
    Scissors: new Animated.Value(1),
  }).current;

  // Y-offset for the bounce
  const bounceY = useRef<Record<RPSMove, Animated.Value>>({
    Rock:     new Animated.Value(0),
    Paper:    new Animated.Value(0),
    Scissors: new Animated.Value(0),
  }).current;

  // ── Step 1: fetch current user + initial match row ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // Get the logged-in user
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) { setError('Not authenticated'); return; }
      if (!cancelled) setMyUserId(user.id);

      // Load the match
      const { data, error: matchErr } = await supabase
        .from('rps_matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (matchErr || !data) { setError('Match not found'); return; }
      if (!cancelled) {
        setMatch(data as RPSMatch);
        // If I already picked in a previous session, restore state
        const isChallenger = data.challenger_id === user.id;
        const myExistingMove = isChallenger ? data.challenger_move : data.opponent_move;
        const oppExistingMove = isChallenger ? data.opponent_move : data.challenger_move;
        if (myExistingMove) {
          setChosen(myExistingMove);
          setLocked(true);
          animatePick(myExistingMove, false); // no bounce, just dim others
        }
        if (oppExistingMove) setOppReady(true);
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, [matchId]);

  // ── Step 2: subscribe to Realtime updates on this match ──────────────────────
  useEffect(() => {
    if (!myUserId || !match) return;

    const channel = supabase
      .channel(`rps_match_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rps_matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as RPSMatch;
          setMatch(updated);

          const isChallenger = updated.challenger_id === myUserId;
          const oppMove = isChallenger
            ? updated.opponent_move
            : updated.challenger_move;

          // Opponent just submitted their move
          if (oppMove && !oppReady) setOppReady(true);

          // Match resolved — navigate to result
          if (updated.status === 'resolved') {
            const myMove  = isChallenger ? updated.challenger_move! : updated.opponent_move!;
            const theirMove = isChallenger ? updated.opponent_move! : updated.challenger_move!;

            let outcome: RPSResult['outcome'];
            if (updated.winner_id === null) {
              outcome = 'draw';
            } else if (updated.winner_id === myUserId) {
              outcome = 'win';
            } else {
              outcome = 'lose';
            }

            onResult({ outcome, myMove, oppMove: theirMove });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, myUserId, match, oppReady, onResult]);

  // ── Animation helpers ────────────────────────────────────────────────────────
  const animatePick = useCallback(
    (move: RPSMove, withBounce = true) => {
      const animations: Animated.CompositeAnimation[] = [];

      OPTIONS.forEach(({ move: m }) => {
        if (m === move) {
          if (withBounce) {
            animations.push(
              Animated.sequence([
                Animated.spring(bounceY[m], {
                  toValue: -14,
                  useNativeDriver: true,
                  speed: 28,
                  bounciness: 16,
                }),
                Animated.spring(bounceY[m], {
                  toValue: -7,
                  useNativeDriver: true,
                  speed: 20,
                  bounciness: 6,
                }),
              ])
            );
          }
          animations.push(
            Animated.spring(anims[m], {
              toValue: 1.08,
              useNativeDriver: true,
              speed: 30,
              bounciness: 10,
            })
          );
        } else {
          // Dim unchosen
          animations.push(
            Animated.spring(anims[m], {
              toValue: 0.76,
              useNativeDriver: true,
              speed: 22,
              bounciness: 0,
            })
          );
        }
      });

      Animated.parallel(animations).start();
    },
    [anims, bounceY]
  );

  const animateReset = useCallback(() => {
    OPTIONS.forEach(({ move: m }) => {
      Animated.spring(anims[m], {
        toValue: 1,
        useNativeDriver: true,
        speed: 24,
        bounciness: 10,
      }).start();
      Animated.spring(bounceY[m], {
        toValue: 0,
        useNativeDriver: true,
        speed: 24,
        bounciness: 6,
      }).start();
    });
  }, [anims, bounceY]);

  // ── Step 3: submit move to Supabase ─────────────────────────────────────────
  const handlePick = useCallback(
    async (move: RPSMove) => {
      if (locked || !match || !myUserId) return;

      setChosen(move);
      setLocked(true);
      setError(null);
      setSubmitting(true);
      animatePick(move, true);

      const isChallenger = match.challenger_id === myUserId;
      const column = isChallenger ? 'challenger_move' : 'opponent_move';

      const { error: updateErr } = await supabase
        .from('rps_matches')
        .update({ [column]: move })
        .eq('id', matchId);

      setSubmitting(false);

      if (updateErr) {
        // Roll back local state so user can retry
        setChosen(null);
        setLocked(false);
        animateReset();
        setError('Failed to submit. Tap again.');
      }
      // ✅ On success: Realtime UPDATE fires → resolves & calls onResult when both picked
    },
    [locked, match, myUserId, matchId, animatePick, animateReset]
  );

  // ── Step 4: RETRY — clear my move from DB + local state ─────────────────────
  const handleRetry = useCallback(async () => {
    if (!match || !myUserId) return;

    const isChallenger = match.challenger_id === myUserId;
    const column = isChallenger ? 'challenger_move' : 'opponent_move';

    setChosen(null);
    setLocked(false);
    setError(null);
    animateReset();

    await supabase
      .from('rps_matches')
      .update({ [column]: null })
      .eq('id', matchId);
    // Ignore error — worst case user just re-submits the same move
  }, [match, myUserId, matchId, animateReset]);

  // ── Derive opponent display name ─────────────────────────────────────────────
  const isChallenger  = match ? match.challenger_id === myUserId : false;
  const myShow        = match ? (isChallenger ? match.challenger_show : match.opponent_show) : '…';
  const oppShow       = match ? (isChallenger ? match.opponent_show  : match.challenger_show) : '…';

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!match) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* ── Show VS Header ─────────────────────────────────── */}
      <View style={styles.versusRow}>
        <View style={[styles.versusShow, { backgroundColor: '#1e1b4b' }]}>
          <View style={styles.versusOverlay} />
          <View style={styles.versusInfo}>
            <Text style={styles.versusYouLabel}>Your pick</Text>
            <Text style={styles.versusShowTitle} numberOfLines={2}>{myShow}</Text>
          </View>
        </View>
        <View style={styles.versusDivider}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <View style={[styles.versusShow, { backgroundColor: '#0f766e' }]}>
          <View style={styles.versusOverlay} />
          <View style={styles.versusInfo}>
            <Text style={styles.versusYouLabel}>Opponent</Text>
            <Text style={styles.versusShowTitle} numberOfLines={2}>{oppShow}</Text>
          </View>
        </View>
      </View>

      {/* ── 3D Bubble Picker Card ──────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Choose your move</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.picker}>
          {OPTIONS.map(({ move, emoji, subLabel }) => {
            const isChosen = chosen === move;

            const dimOpacity = anims[move].interpolate({
              inputRange: [0.76, 1, 1.08],
              outputRange: [0.28, 1, 1],
            });

            return (
              <Pressable
                key={move}
                onPress={() => handlePick(move)}
                disabled={locked && !isChosen}
                style={styles.optionCol}
                android_ripple={null}
              >
                {/* ── 3D Clay Sphere Bubble ───────────────── */}
                <Animated.View
                  style={[
                    styles.bubble,
                    isChosen && styles.bubbleChosen,
                    {
                      transform: [
                        { scale: anims[move] },
                        { translateY: bounceY[move] },
                      ],
                      opacity: dimOpacity,
                    },
                  ]}
                >
                  {/* Gloss catch-light overlay */}
                  <View style={styles.bubbleGloss} />
                  <Text style={styles.bubbleEmoji}>{emoji}</Text>
                </Animated.View>

                {/* Move name */}
                <Text style={[styles.moveLabel, isChosen && styles.moveLabelChosen]}>
                  {move}
                </Text>
                {/* Sub-label: Beat X */}
                <Text style={styles.moveSubLabel}>{subLabel}</Text>

                {/* RETRY button — only active on the chosen column */}
                <Pressable
                  onPress={handleRetry}
                  disabled={!isChosen}
                  style={({ pressed }) => [
                    styles.retryBtn,
                    isChosen && styles.retryBtnChosen,
                    pressed && styles.retryBtnPressed,
                  ]}
                >
                  <Text style={[styles.retryLabel, isChosen && styles.retryLabelChosen]}>
                    RETRY
                  </Text>
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Status row ────────────────────────────────────── */}
      <View style={styles.statusRow}>
        {submitting ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <Text style={styles.statusText}>
            {chosen
              ? oppReady
                ? '⚡ Resolving…'
                : `You picked ${chosen}! Waiting for opponent…`
              : 'Waiting for Sam…'}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0ece6',
    padding: 16,
    gap: 12,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0ece6',
  },

  // ── VS header ────────────────────────────────────────────────
  versusRow: {
    flexDirection: 'row',
    gap: 10,
    height: 150,
  },
  versusShow: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  versusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  versusInfo: {
    padding: 10,
  },
  versusYouLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  versusShowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 17,
  },
  versusDivider: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#6366f1',
  },

  // ── Card ─────────────────────────────────────────────────────
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#c8c0b8',
    // RN doesn't support borderStyle:'dashed' on non-text views reliably on Android,
    // so we use a dotted SVG border workaround for Android or just use solid there.
    ...Platform.select({
      ios:     { borderStyle: 'dashed' },
      android: { borderStyle: 'solid', borderColor: '#d0c8c0' },
    }),
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },

  cardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2328',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.2,
  },

  errorText: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '600',
  },

  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },

  optionCol: {
    flex: 1,
    alignItems: 'center',
  },

  // ── 3D Clay Sphere ───────────────────────────────────────────
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    /**
     * RN doesn't support radial-gradient on Views.
     * We approximate the clay sphere with:
     *   - A warm mid-tone background (#f0d8c0)
     *   - Heavy bottom shadow (simulates gravity/depth)
     *   - Inset-like shadow is achieved by the bubbleGloss overlay
     *
     * For a more faithful radial-gradient sphere, swap this View
     * with a tiny Svg using a <RadialGradient> + <Circle> from
     * react-native-svg, which handles radial gradients natively.
     */
    backgroundColor: '#f0d8c0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#b47850',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
      },
      android: { elevation: 8 },
    }),
  },

  bubbleChosen: {
    ...Platform.select({
      ios: {
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.48,
        shadowRadius: 22,
      },
      android: { elevation: 14 },
    }),
  },

  // Top-left specular gloss (simulates sphere catch-light)
  bubbleGloss: {
    position: 'absolute',
    top: 10,
    left: 14,
    width: 26,
    height: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
    transform: [{ rotate: '-25deg' }],
    ...Platform.select({
      ios: {
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 4,
      },
    }),
  },

  bubbleEmoji: {
    fontSize: 38,
    marginTop: 2,
    // Prevent Android emoji clipping
    includeFontPadding: false,
  },

  // ── Labels ───────────────────────────────────────────────────
  moveLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5a5048',
    textAlign: 'center',
  },
  moveLabelChosen: {
    color: '#6366f1',
  },
  moveSubLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8a7f75',
    textAlign: 'center',
    marginTop: 1,
    marginBottom: 6,
  },

  // ── RETRY button ─────────────────────────────────────────────
  retryBtn: {
    width: '100%',
    height: 34,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#1f2328',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  retryBtnChosen: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  retryBtnPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  retryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#1f2328',
  },
  retryLabelChosen: {
    color: '#fff',
  },

  // ── Status row ───────────────────────────────────────────────
  statusRow: {
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 28,
  },
  statusText: {
    fontSize: 13,
    color: '#8a7f75',
    fontWeight: '600',
    textAlign: 'center',
  },
});
