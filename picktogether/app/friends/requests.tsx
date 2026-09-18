import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface RequestRow {
  friendshipId: string;
  requesterId: string;
  displayName: string;
  handle: string | null;
}

function InitialsAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

export default function FriendRequestsScreen() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const myId = sessionData.session?.user.id;
    if (!myId) { setLoading(false); return; }

    const { data: friendships } = await supabase
      .from('friends')
      .select('id, requester_id')
      .eq('addressee_id', myId)
      .eq('status', 'pending');

    if (!friendships || friendships.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const requesterIds = friendships.map((f) => f.requester_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, qr_code')
      .in('id', requesterIds);

    const rows: RequestRow[] = friendships.map((f) => {
      const profile = (profiles ?? []).find((p) => p.id === f.requester_id);
      return {
        friendshipId: f.id,
        requesterId: f.requester_id,
        displayName: profile?.display_name ?? 'Unknown',
        handle: profile?.qr_code ?? null,
      };
    });

    setRequests(rows);
    setLoading(false);
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const respond = async (friendshipId: string, status: 'accepted' | 'declined') => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? '';
    const res = await fetch(
      'https://hncdqdkyhfgummhkjiet.supabase.co/functions/v1/friends/respond',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ friendship_id: friendshipId, status }),
      }
    );
    if (res.ok) {
      setRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    } else {
      Alert.alert('Error', 'Could not process request. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friend Requests</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : requests.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No pending friend requests</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.friendshipId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <InitialsAvatar name={item.displayName} size={44} />
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{item.displayName}</Text>
                {item.handle ? (
                  <Text style={styles.rowHandle}>@{item.handle}</Text>
                ) : null}
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => respond(item.friendshipId, 'accepted')}
                >
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={() => respond(item.friendshipId, 'declined')}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 16, color: Colors.primary, fontWeight: '500' },
  list: { padding: Spacing.md },
  row: {
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
  rowBody: { flex: 1, marginLeft: Spacing.md },
  rowName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  rowHandle: { fontSize: 12, color: Colors.textMuted },
  rowActions: { flexDirection: 'row', gap: Spacing.sm },
  acceptBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  acceptBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  declineBtn: {
    backgroundColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  declineBtnText: { color: Colors.text, fontWeight: '600', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  emptyText: { fontSize: 15, color: Colors.textMuted, textAlign: 'center' },
});
