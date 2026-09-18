import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

type MatchRow = {
  id: string;
  challenger_id: string;
  challenged_id: string;
  status: 'pending' | 'accepted' | 'choosing' | 'resolved' | 'expired';
  expires_at: string;
  challenger_profile?: { display_name: string };
  challenged_profile?: { display_name: string };
};

function formatCountdown(msLeft: number) {
  if (msLeft <= 0) return '00:00';
  const totalSec = Math.floor(msLeft / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function WaitingScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [msLeft, setMsLeft] = useState<number>(0);
  const [expired, setExpired] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

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
      });
  }, [matchId]);

  // Countdown timer
  useEffect(() => {
    if (!match) return;
    const expiresAt = new Date(match.expires_at).getTime();
    const tick = () => {
      const left = expiresAt - Date.now();
      if (left <= 0) {
        setMsLeft(0);
        setExpired(true);
      } else {
        setMsLeft(left);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [match]);

  // Realtime subscription
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`rps_waiting_${matchId}`)
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
          setMatch((prev) => (prev ? { ...prev, ...updated } : updated));
          if (updated.status === 'accepted' || updated.status === 'choosing') {
            router.replace(`/rps/choose/${matchId}`);
          } else if (updated.status === 'expired') {
            setExpired(true);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, router]);

  const handleCancel = async () => {
    if (!matchId) return;
    await supabase.from('rps_matches').delete().eq('id', matchId);
    router.back();
  };

  const opponentName = (() => {
    if (!match || !myId) return '...';
    if (match.challenger_id === myId) return match.challenged_profile?.display_name ?? 'Friend';
    return match.challenger_profile?.display_name ?? 'Friend';
  })();

  const isUnder5Min = msLeft > 0 && msLeft < 5 * 60 * 1000;

  if (expired) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.expiredEmoji}>⏰</Text>
          <Text style={styles.expiredTitle}>Challenge Expired</Text>
          <Text style={styles.expiredSub}>
            {opponentName} didn't respond in time.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.pulseEmoji}>✊</Text>
        </Animated.View>
        <Text style={styles.waitingTitle}>Waiting for {opponentName}…</Text>
        <Text style={[styles.countdown, isUnder5Min && styles.countdownRed]}>
          {formatCountdown(msLeft)}
        </Text>
        {isUnder5Min && (
          <Text style={styles.urgencyNote}>Expires soon!</Text>
        )}
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelBtnText}>Cancel Challenge</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  pulseCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary + '22',
    borderWidth: 2,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  pulseEmoji: { fontSize: 44 },
  waitingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  countdown: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  countdownRed: { color: Colors.error },
  urgencyNote: { fontSize: 14, color: Colors.error, fontWeight: '600' },
  footer: { padding: Spacing.xl, paddingBottom: 32 },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelBtnText: { color: Colors.textMuted, fontWeight: '600', fontSize: 15 },
  expiredEmoji: { fontSize: 52, marginBottom: Spacing.md },
  expiredTitle: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  expiredSub: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.xl },
  backBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
