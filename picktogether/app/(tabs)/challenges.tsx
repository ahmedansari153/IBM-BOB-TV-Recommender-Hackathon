import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

type RpsMatch = {
  id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_show_id: string;
  challenger_show_title: string;
  challenged_show_id: string | null;
  challenged_show_title: string | null;
  challenger_choice: string | null;
  challenged_choice: string | null;
  winner_id: string | null;
  status: 'pending' | 'accepted' | 'choosing' | 'resolved' | 'expired';
  created_at: string;
  expires_at: string;
  challenger_profile?: { display_name: string };
  challenged_profile?: { display_name: string };
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function AvatarBubble({ name }: { name: string }) {
  return (
    <View style={styles.avatarBubble}>
      <Text style={styles.avatarText}>{getInitials(name)}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: RpsMatch['status'] }) {
  const labelMap: Record<string, string> = {
    pending: 'Pending',
    accepted: 'Active',
    choosing: 'Choosing',
    resolved: 'Resolved',
    expired: 'Expired',
  };
  const colorMap: Record<string, string> = {
    pending: Colors.warning,
    accepted: Colors.primary,
    choosing: Colors.primary,
    resolved: Colors.success,
    expired: Colors.textMuted,
  };
  return (
    <View style={[styles.badge, { backgroundColor: colorMap[status] + '22' }]}>
      <Text style={[styles.badgeText, { color: colorMap[status] }]}>{labelMap[status]}</Text>
    </View>
  );
}

function ShowVS({ matchRow, myId }: { matchRow: RpsMatch; myId: string }) {
  const isChallenger = matchRow.challenger_id === myId;
  const myTitle = isChallenger ? matchRow.challenger_show_title : (matchRow.challenged_show_title ?? '—');
  const oppTitle = isChallenger ? (matchRow.challenged_show_title ?? '—') : matchRow.challenger_show_title;
  return (
    <View style={styles.showVsRow}>
      <View style={styles.showPill}>
        <Text style={styles.showPillText} numberOfLines={1}>{myTitle}</Text>
      </View>
      <Text style={styles.vsLabel}>VS</Text>
      <View style={styles.showPill}>
        <Text style={styles.showPillText} numberOfLines={1}>{oppTitle}</Text>
      </View>
    </View>
  );
}

function MatchCard({
  item,
  myId,
  onAccept,
  onDecline,
}: {
  item: RpsMatch;
  myId: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const router = useRouter();
  const isChallenger = item.challenger_id === myId;
  const opponentProfile = isChallenger ? item.challenged_profile : item.challenger_profile;
  const opponentName = opponentProfile?.display_name ?? 'Unknown';
  const isIncoming = item.status === 'pending' && item.challenged_id === myId;
  const isActive = item.status === 'accepted' || item.status === 'choosing';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <AvatarBubble name={opponentName} />
        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
          <Text style={styles.opponentName}>{opponentName}</Text>
          <StatusBadge status={item.status} />
        </View>
      </View>
      <ShowVS matchRow={item} myId={myId} />
      {isIncoming && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => onAccept(item.id)}
          >
            <Text style={styles.acceptBtnText}>Accept ✊</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.declineBtn]}
            onPress={() => onDecline(item.id)}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
      {isActive && (
        <TouchableOpacity
          style={[styles.actionBtn, styles.playBtn]}
          onPress={() => router.push(`/rps/choose/${item.id}`)}
        >
          <Text style={styles.playBtnText}>Play Now ✊</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function ChallengesScreen() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [matches, setMatches] = useState<RpsMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMatches = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('rps_matches')
      .select(
        `*, challenger_profile:profiles!rps_matches_challenger_id_fkey(display_name), challenged_profile:profiles!rps_matches_challenged_id_fkey(display_name)`
      )
      .or(`challenger_id.eq.${userId},challenged_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (data) setMatches(data as RpsMatch[]);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setMyId(data.user.id);
        fetchMatches(data.user.id).finally(() => setLoading(false));
      }
    });
  }, [fetchMatches]);

  const onRefresh = useCallback(async () => {
    if (!myId) return;
    setRefreshing(true);
    await fetchMatches(myId);
    setRefreshing(false);
  }, [myId, fetchMatches]);

  const handleAccept = useCallback(
    async (matchId: string) => {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const url = `${(supabase as any).supabaseUrl}/functions/v1/rps/accept`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ match_id: matchId }),
      });
      router.push(`/rps/choose/${matchId}`);
    },
    [router]
  );

  const handleDecline = useCallback(async (matchId: string) => {
    await supabase.from('rps_matches').update({ status: 'expired' }).eq('id', matchId);
    if (myId) fetchMatches(myId);
  }, [myId, fetchMatches]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const incoming = matches.filter(
    (m) => m.status === 'pending' && myId && m.challenged_id === myId
  );
  const active = matches.filter(
    (m) => m.status === 'accepted' || m.status === 'choosing'
  );
  const past = matches.filter(
    (m) => m.status === 'resolved' || m.status === 'expired'
  );

  const sections: { title: string; data: RpsMatch[] }[] = [
    { title: 'Incoming Challenges', data: incoming },
    { title: 'Active', data: active },
    { title: 'Past', data: past },
  ];

  const allEmpty = incoming.length === 0 && active.length === 0 && past.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚡ Challenges</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/rps/initiate')}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.title}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 32 }}
        ListEmptyComponent={null}
        renderItem={({ item: section }) => {
          if (section.data.length === 0) return null;
          return (
            <View style={{ marginBottom: Spacing.xl }}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map((match) => (
                <MatchCard
                  key={match.id}
                  item={match}
                  myId={myId ?? ''}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              ))}
            </View>
          );
        }}
        ListFooterComponent={
          allEmpty ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No challenges yet</Text>
              <Text style={styles.emptySubtitle}>Challenge a friend to a Rock Paper Scissors showdown!</Text>
              <TouchableOpacity
                style={styles.newChallengeBtn}
                onPress={() => router.push('/rps/initiate')}
              >
                <Text style={styles.newChallengeBtnText}>+ New Challenge</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  newBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatarBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  opponentName: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  showVsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  showPill: {
    flex: 1,
    backgroundColor: Colors.rpsBg,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.rpsBorder,
  },
  showPillText: { fontSize: 12, color: Colors.text, fontWeight: '500', textAlign: 'center' },
  vsLabel: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  acceptBtn: { backgroundColor: Colors.primary },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  declineBtn: { backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  declineBtnText: { color: Colors.textMuted, fontWeight: '600', fontSize: 14 },
  playBtn: { backgroundColor: Colors.primary, marginTop: Spacing.xs },
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.xl },
  newChallengeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  newChallengeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
