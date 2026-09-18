import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  status: string;
  challenger_profile?: { display_name: string };
  challenged_profile?: { display_name: string };
};

const EMOJI: Record<RpsChoice, string> = {
  rock: '✊',
  paper: '✋',
  scissors: '✌️',
};

function outcomeLabel(outcome: 'win' | 'lose' | 'draw') {
  if (outcome === 'win') return '🏆 You Win!';
  if (outcome === 'lose') return '😔 You Lose';
  return '🤝 Draw!';
}

export default function ResultScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMyId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (!matchId) return;
    supabase
      .from('rps_matches')
      .select(
        `*, challenger_profile:profiles!rps_matches_challenger_id_fkey(display_name), challenged_profile:profiles!rps_matches_challenged_id_fkey(display_name)`
      )
      .eq('id', matchId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMatch(data as MatchRow);
        setLoading(false);
      });
  }, [matchId]);

  if (loading || !myId) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!match) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Match not found.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isChallenger = match.challenger_id === myId;
  const myMove = (isChallenger ? match.challenger_choice : match.challenged_choice) as RpsChoice;
  const oppMove = (isChallenger ? match.challenged_choice : match.challenger_choice) as RpsChoice;

  let outcome: 'win' | 'lose' | 'draw' = 'draw';
  if (myMove && oppMove) {
    if (myMove === oppMove) {
      outcome = 'draw';
    } else {
      const beats: Record<RpsChoice, RpsChoice> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      outcome = beats[myMove] === oppMove ? 'win' : 'lose';
    }
  }

  const myShow = isChallenger ? match.challenger_show_title : (match.challenged_show_title ?? '—');
  const oppShow = isChallenger ? (match.challenged_show_title ?? '—') : match.challenger_show_title;
  const myName = isChallenger
    ? match.challenger_profile?.display_name ?? 'You'
    : match.challenged_profile?.display_name ?? 'You';
  const oppName = isChallenger
    ? match.challenged_profile?.display_name ?? 'Opponent'
    : match.challenger_profile?.display_name ?? 'Opponent';

  const winnerId = match.winner_id;
  const iWon = winnerId === myId;
  const theyWon = winnerId !== null && winnerId !== myId;

  const winningShow = iWon ? myShow : theyWon ? oppShow : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Outcome headline */}
        <Text style={styles.outcomeLabel}>{outcomeLabel(outcome)}</Text>

        {/* Tonight's Show */}
        <View style={styles.showBanner}>
          <Text style={styles.showBannerHeader}>🎬 Tonight's Show</Text>
          <Text style={styles.showBannerTitle}>
            {winningShow ?? (outcome === 'draw' ? "It's a draw \u2014 flip a coin!" : myShow)}
          </Text>
          {outcome !== 'draw' && (
            <Text style={styles.showBannerWinner}>
              Winner: {iWon ? myName : oppName}
            </Text>
          )}
        </View>

        {/* Moves side by side */}
        <View style={styles.movesRow}>
          <View
            style={[
              styles.moveBubble,
              iWon && styles.moveBubbleWin,
              theyWon && styles.moveBubbleLose,
              outcome === 'draw' && styles.moveBubbleDraw,
            ]}
          >
            <Text style={styles.moveBubbleEmoji}>{myMove ? EMOJI[myMove] : '?'}</Text>
            <Text style={styles.moveBubbleName}>{myName}</Text>
            {myMove && <Text style={styles.moveBubbleChoice}>{myMove.charAt(0).toUpperCase() + myMove.slice(1)}</Text>}
          </View>

          <View style={styles.vsCircle}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          <View
            style={[
              styles.moveBubble,
              theyWon && styles.moveBubbleWin,
              iWon && styles.moveBubbleLose,
              outcome === 'draw' && styles.moveBubbleDraw,
            ]}
          >
            <Text style={styles.moveBubbleEmoji}>{oppMove ? EMOJI[oppMove] : '?'}</Text>
            <Text style={styles.moveBubbleName}>{oppName}</Text>
            {oppMove && <Text style={styles.moveBubbleChoice}>{oppMove.charAt(0).toUpperCase() + oppMove.slice(1)}</Text>}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.watchlistBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.watchlistBtnText}>Add to Watchlist 🍿</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tryAgainBtn} onPress={() => router.replace('/rps/initiate')}>
            <Text style={styles.tryAgainBtnText}>← Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c29' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  inner: { flex: 1, padding: Spacing.xl, justifyContent: 'center', alignItems: 'center' },
  outcomeLabel: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  showBanner: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  showBannerHeader: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600', marginBottom: Spacing.xs, textTransform: 'uppercase' },
  showBannerTitle: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: Spacing.xs },
  showBannerWinner: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  movesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  moveBubble: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  moveBubbleWin: {
    backgroundColor: 'rgba(99,102,241,0.3)',
    borderColor: Colors.primary,
  },
  moveBubbleLose: {
    opacity: 0.45,
  },
  moveBubbleDraw: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  moveBubbleEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  moveBubbleName: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 2 },
  moveBubbleChoice: { fontSize: 13, color: '#fff', fontWeight: '700' },
  vsCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vsText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  actions: { width: '100%', gap: Spacing.md },
  watchlistBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
  },
  watchlistBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  tryAgainBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  tryAgainBtnText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 15 },
  errorText: { color: '#fff', fontSize: 16, marginBottom: Spacing.xl },
  backBtn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
