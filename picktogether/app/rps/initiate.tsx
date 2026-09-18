import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

const TVDB_BASE = 'https://api4.thetvdb.com/v4';

type TvdbShow = {
  tvdb_id: string | number;
  name: string;
  image_url?: string;
  year?: string;
};

type Friend = {
  id: string;
  display_name: string;
};

type Recommendation = {
  id: string;
  tvdb_series_id: string;
  show_title: string;
  poster_url: string | null;
};

function getInitials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

export default function InitiateScreen() {
  const router = useRouter();
  const [myId, setMyId] = useState<string | null>(null);
  const [tvdbToken, setTvdbToken] = useState<string | null>(null);

  // Panel A — today's recommendation
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loadingRec, setLoadingRec] = useState(true);

  // Panel B — TVDB search
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TvdbShow[]>([]);

  // Selected show
  const [selectedShow, setSelectedShow] = useState<{ id: string; title: string } | null>(null);

  // Friend picker
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setMyId(data.user.id);
        fetchRec(data.user.id);
        fetchFriends(data.user.id);
      }
    });
    loginTvdb();
  }, []);

  async function loginTvdb() {
    try {
      const res = await fetch(`${TVDB_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: process.env.EXPO_PUBLIC_TVDB_API_KEY ?? '' }),
      });
      const json = await res.json();
      if (json.data?.token) setTvdbToken(json.data.token);
    } catch {
      // token will be null; search will be disabled
    }
  }

  async function fetchRec(userId: string) {
    setLoadingRec(true);
    const { data } = await supabase
      .from('recommendations')
      .select('id, tvdb_series_id, show_title, poster_url')
      .eq('user_id', userId)
      .order('recommended_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setRec(data as Recommendation);
    setLoadingRec(false);
  }

  async function fetchFriends(userId: string) {
    setLoadingFriends(true);
    const { data } = await supabase
      .from('friends')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted');
    if (!data) { setLoadingFriends(false); return; }
    const friendIds = data.map((f) =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    );
    if (friendIds.length === 0) { setLoadingFriends(false); return; }
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', friendIds);
    if (profiles) setFriends(profiles as Friend[]);
    setLoadingFriends(false);
  }

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !tvdbToken) return;
    setSearching(true);
    try {
      const res = await fetch(
        `${TVDB_BASE}/search?query=${encodeURIComponent(query)}&type=series&limit=10`,
        { headers: { Authorization: `Bearer ${tvdbToken}` } }
      );
      const json = await res.json();
      const results: TvdbShow[] = (json.data ?? []).map((item: any) => ({
        tvdb_id: item.tvdb_id ?? item.id,
        name: item.name,
        image_url: item.image_url,
        year: item.year,
      }));
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, tvdbToken]);

  const handleConfirm = useCallback(async () => {
    if (!selectedShow || !selectedFriend || !myId) return;
    setSubmitting(true);
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const url = `${(supabase as any).supabaseUrl}/functions/v1/rps/initiate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        challenged_id: selectedFriend.id,
        challenger_show_id: selectedShow.id,
        challenger_show_title: selectedShow.title,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (json.match_id || json.id) {
      router.push(`/rps/waiting/${json.match_id ?? json.id}`);
    }
  }, [selectedShow, selectedFriend, myId, router]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}>
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>New Challenge</Text>
            <View style={{ width: 60 }} />
          </View>

          <Text style={styles.sectionLabel}>Choose Your Show</Text>

          {/* Panel A — Today's Recommendation */}
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Today's Recommendation</Text>
            {loadingRec ? (
              <ActivityIndicator color={Colors.primary} />
            ) : rec ? (
              <TouchableOpacity
                style={[
                  styles.recCard,
                  selectedShow?.id === rec.tvdb_series_id && styles.recCardSelected,
                ]}
                onPress={() =>
                  setSelectedShow({ id: rec.tvdb_series_id, title: rec.show_title })
                }
              >
                <View style={styles.recCardInner}>
                  <View style={styles.recPoster}>
                    <Text style={styles.recPosterEmoji}>📺</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recTitle}>{rec.show_title}</Text>
                    <Text style={styles.recSubtitle}>Recommended for you</Text>
                  </View>
                  {selectedShow?.id === rec.tvdb_series_id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={styles.noRec}>No recommendation available today.</Text>
            )}
          </View>

          {/* Panel B — TVDB Search */}
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Search Any Show</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search TV series..."
                placeholderTextColor={Colors.textSubtle}
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity
                style={styles.searchBtn}
                onPress={handleSearch}
                disabled={searching || !tvdbToken}
              >
                {searching ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.searchBtnText}>Go</Text>
                )}
              </TouchableOpacity>
            </View>
            {!tvdbToken && (
              <Text style={styles.tokenWarning}>TVDB token unavailable — search disabled.</Text>
            )}
            {searchResults.map((item) => (
              <TouchableOpacity
                key={String(item.tvdb_id)}
                style={[
                  styles.resultItem,
                  selectedShow?.id === String(item.tvdb_id) && styles.resultItemSelected,
                ]}
                onPress={() =>
                  setSelectedShow({ id: String(item.tvdb_id), title: item.name })
                }
              >
                <Text style={styles.resultName}>{item.name}</Text>
                {item.year && <Text style={styles.resultYear}>{item.year}</Text>}
                {selectedShow?.id === String(item.tvdb_id) && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Selected Show Summary */}
          {selectedShow && (
            <View style={styles.selectedBanner}>
              <Text style={styles.selectedLabel}>Selected: </Text>
              <Text style={styles.selectedTitle}>{selectedShow.title}</Text>
              <TouchableOpacity onPress={() => setSelectedShow(null)}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Friend Picker */}
          <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>Challenge a Friend</Text>
          <View style={styles.panel}>
            {loadingFriends ? (
              <ActivityIndicator color={Colors.primary} />
            ) : friends.length === 0 ? (
              <Text style={styles.noRec}>No accepted friends yet.</Text>
            ) : (
              friends.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[
                    styles.friendItem,
                    selectedFriend?.id === f.id && styles.friendItemSelected,
                  ]}
                  onPress={() => setSelectedFriend(f)}
                >
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>{getInitials(f.display_name)}</Text>
                  </View>
                  <Text style={styles.friendName}>{f.display_name}</Text>
                  {selectedFriend?.id === f.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Confirm */}
          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (!selectedShow || !selectedFriend || submitting) && styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!selectedShow || !selectedFriend || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>Send Challenge ✊</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  backBtn: { width: 60 },
  backBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '500' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  panelTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  recCard: {
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: Spacing.sm,
  },
  recCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0d' },
  recCardInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recPoster: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.rpsBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recPosterEmoji: { fontSize: 22 },
  recTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  recSubtitle: { fontSize: 12, color: Colors.textMuted },
  checkmark: { color: Colors.primary, fontWeight: '700', fontSize: 18, marginLeft: Spacing.sm },
  noRec: { color: Colors.textMuted, fontSize: 13 },
  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 48,
  },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tokenWarning: { fontSize: 12, color: Colors.error, marginBottom: Spacing.xs },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.background,
  },
  resultItemSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0d' },
  resultName: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '500' },
  resultYear: { fontSize: 12, color: Colors.textMuted, marginLeft: Spacing.sm },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '15',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  selectedLabel: { fontSize: 13, color: Colors.textMuted },
  selectedTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.primary },
  clearBtn: { color: Colors.textMuted, fontSize: 16, fontWeight: '700', paddingLeft: Spacing.sm },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  friendItemSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '0d' },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  friendAvatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  friendName: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.text },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
