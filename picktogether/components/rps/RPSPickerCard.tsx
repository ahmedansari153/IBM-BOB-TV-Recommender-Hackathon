import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

type RpsChoice = 'rock' | 'paper' | 'scissors';

type MatchRow = {
  id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_show_title: string;
  challenged_show_title: string | null;
  challenger_choice: RpsChoice | null;
  challenged_choice: RpsChoice | null;
  winner_id: string | null;
  status: 'pending' | 'accepted' | 'choosing' | 'resolved' | 'expired';
};

type ResultPayload = {
  outcome: 'win' | 'lose' | 'draw';
  myMove: RpsChoice;
  oppMove: RpsChoice;
};

type Props = {
  matchId: string;
  myId: string;
  onResult: (result: ResultPayload) => void;
};

const MOVES: { choice: RpsChoice; emoji: string; label: string; beats: RpsChoice }[] = [
  { choice: 'rock', emoji: '✊', label: 'Rock', beats: 'scissors' },
  { choice: 'paper', emoji: '✋', label: 'Paper', beats: 'rock' },
  { choice: 'scissors', emoji: '✌️', label: 'Scissors', beats: 'paper' },
];

function beatLabel(choice: RpsChoice): string {
  const map: Record<RpsChoice, string> = {
    rock: 'Beats Scissors',
    paper: 'Beats Rock',
    scissors: 'Beats Paper',
  };
  return map[choice];
}

function determineOutcome(myChoice: RpsChoice, oppChoice: RpsChoice): 'win' | 'lose' | 'draw' {
  if (myChoice === oppChoice) return 'draw';
  const move = MOVES.find((m) => m.choice === myChoice);
  if (move && move.beats === oppChoice) return 'win';
  return 'lose';
}

export default function RPSPickerCard({ matchId, myId, onResult }: Props) {
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [myChoice, setMyChoice] = useState<RpsChoice | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [isChallenger, setIsChallenger] = useState(false);

  // Spring animation state per button
  const bounceAnims = useRef<Record<RpsChoice, Animated.Value>>({
    rock: new Animated.Value(0),
    paper: new Animated.Value(0),
    scissors: new Animated.Value(0),
  }).current;
  const scaleAnims = useRef<Record<RpsChoice, Animated.Value>>({
    rock: new Animated.Value(1),
    paper: new Animated.Value(1),
    scissors: new Animated.Value(1),
  }).current;

  useEffect(() => {
    supabase
      .from('rps_matches')
      .select('*')
      .eq('id', matchId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const row = data as MatchRow;
        setMatch(row);
        const challenger = row.challenger_id === myId;
        setIsChallenger(challenger);
        setMyChoice(challenger ? row.challenger_choice : row.challenged_choice);
      });
  }, [matchId, myId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`rps_picker_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rps_matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as MatchRow;
          setMatch(updated);
          const challenger = updated.challenger_id === myId;
          const latestMy = challenger ? updated.challenger_choice : updated.challenged_choice;
          const latestOpp = challenger ? updated.challenged_choice : updated.challenger_choice;
          setMyChoice(latestMy);
          if (updated.status === 'resolved' && latestMy && latestOpp) {
            const outcome = determineOutcome(latestMy, latestOpp);
            onResult({ outcome, myMove: latestMy, oppMove: latestOpp });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, myId, onResult]);

  const handlePick = useCallback(
    async (choice: RpsChoice) => {
      if (waiting || myChoice) return;
      // Spring bounce
      Animated.sequence([
        Animated.spring(bounceAnims[choice], {
          toValue: -18,
          useNativeDriver: true,
          speed: 20,
          bounciness: 14,
        }),
        Animated.spring(bounceAnims[choice], {
          toValue: 0,
          useNativeDriver: true,
          speed: 12,
          bounciness: 8,
        }),
      ]).start();
      Animated.sequence([
        Animated.spring(scaleAnims[choice], {
          toValue: 1.18,
          useNativeDriver: true,
          speed: 20,
          bounciness: 10,
        }),
        Animated.spring(scaleAnims[choice], {
          toValue: 1,
          useNativeDriver: true,
          speed: 14,
          bounciness: 6,
        }),
      ]).start();

      setWaiting(true);
      const column = isChallenger ? 'challenger_choice' : 'challenged_choice';
      await supabase.from('rps_matches').update({ [column]: choice }).eq('id', matchId);
      setMyChoice(choice);
      setWaiting(false);
    },
    [waiting, myChoice, isChallenger, matchId, bounceAnims, scaleAnims]
  );

  const handleRetry = useCallback(async () => {
    const column = isChallenger ? 'challenger_choice' : 'challenged_choice';
    await supabase.from('rps_matches').update({ [column]: null }).eq('id', matchId);
    setMyChoice(null);
  }, [isChallenger, matchId]);

  const myShow = match
    ? isChallenger
      ? match.challenger_show_title
      : (match.challenged_show_title ?? '—')
    : '—';
  const oppShow = match
    ? isChallenger
      ? (match.challenged_show_title ?? '—')
      : match.challenger_show_title
    : '—';

  return (
    <View style={styles.container}>
      {/* VS Header */}
      <View style={styles.vsHeader}>
        <View style={styles.showChip}>
          <Text style={styles.showChipLabel}>You</Text>
          <Text style={styles.showChipTitle} numberOfLines={2}>{myShow}</Text>
        </View>
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <View style={styles.showChip}>
          <Text style={styles.showChipLabel}>Them</Text>
          <Text style={styles.showChipTitle} numberOfLines={2}>{oppShow}</Text>
        </View>
      </View>

      {/* Instruction */}
      <Text style={styles.instruction}>
        {myChoice ? '⏳ Waiting for opponent…' : 'Choose your move!'}
      </Text>

      {/* Move buttons */}
      <View style={styles.moveRow}>
        {MOVES.map((m) => {
          const isSelected = myChoice === m.choice;
          const isDimmed = myChoice !== null && myChoice !== m.choice;
          return (
            <Animated.View
              key={m.choice}
              style={[
                { transform: [{ translateY: bounceAnims[m.choice] }, { scale: scaleAnims[m.choice] }] },
                isDimmed && styles.moveDimmed,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.moveBtn,
                  isSelected && styles.moveBtnSelected,
                ]}
                onPress={() => handlePick(m.choice)}
                disabled={!!myChoice || waiting}
                activeOpacity={0.75}
              >
                <Text style={styles.moveEmoji}>{m.emoji}</Text>
                <Text style={[styles.moveLabel, isSelected && styles.moveLabelSelected]}>
                  {m.label}
                </Text>
                <Text style={styles.moveBeat}>{beatLabel(m.choice)}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      {/* Retry */}
      {myChoice && (
        <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
          <Text style={styles.retryBtnText}>↩ Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.rpsBg,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.rpsBorder,
  },
  vsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  showChip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  showChipLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  showChipTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 2 },
  vsDivider: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vsText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  instruction: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    fontWeight: '500',
  },
  moveRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  moveBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.rpsBorder,
    minWidth: 88,
  },
  moveBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  moveDimmed: { opacity: 0.4 },
  moveEmoji: { fontSize: 32, marginBottom: Spacing.xs },
  moveLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  moveLabelSelected: { color: Colors.primary },
  moveBeat: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  retryBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: Colors.rpsBorder,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  retryBtnText: { color: Colors.textMuted, fontWeight: '600', fontSize: 13 },
});
