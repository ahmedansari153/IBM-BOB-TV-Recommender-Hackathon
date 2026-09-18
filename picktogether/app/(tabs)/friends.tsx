import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface FriendRow {
  friendshipId: string;
  userId: string;
  displayName: string;
  handle: string;
  photoUrl: string | null;
  showTitle: string | null;
  posterUrl: string | null;
  tvdbSeriesId: string | null;
}

function InitialsAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

function FriendCard({ item }: { item: FriendRow }) {
  const [nudgeSent, setNudgeSent] = useState(false);
  const [nudging, setNudging] = useState(false);

  const handleNudge = async () => {
    if (!item.tvdbSeriesId || !item.showTitle) return;
    setNudging(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';
      await fetch(
        'https://hncdqdkyhfgummhkjiet.supabase.co/functions/v1/promote-show',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            to_user_id: item.userId,
            tvdb_series_id: item.tvdbSeriesId,
            show_title: item.showTitle,
          }),
        }
      );
      setNudgeSent(true);
    } finally {
      setNudging(false);
    }
  };

  return (
    <View style={styles.card}>
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.cardAvatar} />
      ) : (
        <InitialsAvatar name={item.displayName} size={44} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{item.displayName}</Text>
        <Text style={styles.cardHandle}>@{item.handle}</Text>
        {item.showTitle ? (
          <Text style={styles.cardShow} numberOfLines={1}>
            📺 {item.showTitle}
          </Text>
        ) : (
          <Text style={styles.cardShowEmpty}>No recommendation yet</Text>
        )}
      </View>
      <View style={styles.cardRight}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} style={styles.poster} />
        ) : null}
        <TouchableOpacity
          style={[styles.nudgeBtn, nudgeSent && styles.nudgeBtnSent]}
          onPress={handleNudge}
          disabled={nudgeSent || nudging || !item.tvdbSeriesId}
        >
          <Text style={styles.nudgeBtnText}>
            {nudgeSent ? 'Sent ✓' : nudging ? '…' : '📣 Nudge'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const myId = sessionData.session?.user.id;
    if (!myId) { setLoading(false); return; }

    // Pending requests count
    const { count } = await supabase
      .from('friends')
      .select('id', { count: 'exact', head: true })
      .eq('addressee_id', myId)
      .eq('status', 'pending');
    setPendingCount(count ?? 0);

    // Accepted friends
    const { data: friendships } = await supabase
      .from('friends')
      .select('id, requester_id, addressee_id')
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
      .eq('status', 'accepted');

    if (!friendships || friendships.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const friendIds = friendships.map((f) =>
      f.requester_id === myId ? f.addressee_id : f.requester_id
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, photo_url, qr_code')
      .in('id', friendIds);

    const { data: recs } = await supabase
      .from('recommendations')
      .select('user_id, show_title, poster_url, tvdb_series_id, recommended_at')
      .in('user_id', friendIds)
      .order('recommended_at', { ascending: false });

    const latestRecByUser: Record<string, typeof recs extends (infer T)[] | null ? T : never> = {};
    (recs ?? []).forEach((r) => {
      if (!latestRecByUser[r.user_id]) latestRecByUser[r.user_id] = r;
    });

    const rows: FriendRow[] = (profiles ?? []).map((p) => {
      const rec = latestRecByUser[p.id];
      const fs = friendships.find(
        (f) => f.requester_id === p.id || f.addressee_id === p.id
      );
      return {
        friendshipId: fs?.id ?? '',
        userId: p.id,
        displayName: p.display_name,
        handle: p.qr_code ?? p.display_name,
        photoUrl: p.photo_url,
        showTitle: rec?.show_title ?? null,
        posterUrl: rec?.poster_url ?? null,
        tvdbSeriesId: rec?.tvdb_series_id ?? null,
      };
    });

    setFriends(rows);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👥 Friends</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/friends/add')}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Pending banner */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => router.push('/friends/requests')}
        >
          <Text style={styles.pendingBannerText}>
            🔔 {pendingCount} friend request{pendingCount > 1 ? 's' : ''} — tap to review
          </Text>
        </TouchableOpacity>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : friends.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Add your first friend to see what they're watching</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => <FriendCard item={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  addBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  pendingBanner: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
  },
  pendingBannerText: { color: '#1d4ed8', fontWeight: '600', fontSize: 14 },
  list: { padding: Spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  cardAvatar: { width: 44, height: 44, borderRadius: 22 },
  cardBody: { flex: 1, marginLeft: Spacing.md },
  cardName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  cardHandle: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  cardShow: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  cardShowEmpty: { fontSize: 12, color: Colors.textSubtle, marginTop: 4, fontStyle: 'italic' },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  poster: { width: 36, height: 50, borderRadius: Radius.sm, backgroundColor: Colors.border },
  nudgeBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  nudgeBtnSent: { backgroundColor: Colors.textSubtle },
  nudgeBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
