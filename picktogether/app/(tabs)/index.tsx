import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, Database } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Colors, Radius, Spacing } from '@/constants/theme';
import Avatar from '@/components/shared/Avatar';
import ShowPosterThumbnail from '@/components/shared/ShowPosterThumbnail';
import GenreBadge from '@/components/shared/GenreBadge';

type Recommendation = Database['public']['Tables']['recommendations']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

function useCountdown(recommendedAt: string | null): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!recommendedAt) return;
    function compute() {
      const nextPick = new Date(recommendedAt!);
      nextPick.setDate(nextPick.getDate() + 1);
      const diff = nextPick.getTime() - Date.now();
      if (diff <= 0) {
        setLabel('0h 0m');
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setLabel(`${h}h ${m}m`);
    }
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [recommendedAt]);

  return label;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyRecommendation() {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyEmoji}>📺</Text>
      <Text style={styles.emptyTitle}>Your first pick is on its way</Text>
      <Text style={styles.emptySubtitle}>
        We're analysing your taste profile to find the perfect show for you.
      </Text>
    </View>
  );
}

interface RecommendationCardProps {
  rec: Recommendation;
  onMarkSeen: () => void;
  onChallenge: () => void;
}

function RecommendationCard({ rec, onMarkSeen, onChallenge }: RecommendationCardProps) {
  // Derive genres/network/year from taste_profile not available on rec row,
  // so we parse what we have: show_title, overview, poster_url.
  return (
    <View style={styles.recCard}>
      {/* Poster */}
      <View style={styles.posterContainer}>
        <ShowPosterThumbnail posterUrl={rec.poster_url} size="lg" />
        <View style={styles.recBadge}>
          <Text style={styles.recBadgeText}>✨ Today's Rec</Text>
        </View>
      </View>

      {/* Body */}
      <View style={styles.recBody}>
        <Text style={styles.recTitle}>{rec.show_title}</Text>

        {rec.overview ? (
          <Text style={styles.recOverview} numberOfLines={4}>
            {rec.overview}
          </Text>
        ) : null}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={onMarkSeen}
          >
            <Text style={styles.actionBtnPrimaryText}>✓ Mark Seen</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={onChallenge}
          >
            <Text style={styles.actionBtnSecondaryText}>⚡ Challenge</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

interface WatchTogetherCardProps {
  friends: Profile[];
}

function WatchTogetherCard({ friends }: WatchTogetherCardProps) {
  const router = useRouter();
  const visible = friends.slice(0, 3);

  return (
    <View style={styles.watchCard}>
      <View style={styles.watchRow}>
        <View style={styles.avatarStack}>
          {visible.map((f, i) => (
            <View key={f.id} style={[styles.avatarStackItem, { left: i * 28 }]}>
              <Avatar photoUrl={f.photo_url} displayName={f.display_name} size={36} />
            </View>
          ))}
        </View>
        <Pressable
          style={styles.watchBtn}
          onPress={() => router.push('/(tabs)/challenges')}
        >
          <Text style={styles.watchBtnText}>Start Group Session →</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useCurrentUser();

  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(true);
  const [friendProfiles, setFriendProfiles] = useState<Profile[]>([]);
  const [seen, setSeen] = useState(false);

  const countdown = useCountdown(rec?.recommended_at ?? null);

  const fetchRecommendation = useCallback(async (userId: string) => {
    setRecLoading(true);
    const { data } = await supabase
      .from('recommendations')
      .select('*')
      .eq('user_id', userId)
      .order('recommended_at', { ascending: false })
      .limit(1)
      .single();
    setRec(data ?? null);
    setSeen(data?.seen ?? false);
    setRecLoading(false);
  }, []);

  const fetchFriends = useCallback(async (userId: string) => {
    const { data: friendRows } = await supabase
      .from('friends')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted')
      .limit(3);

    if (!friendRows || friendRows.length === 0) return;

    const friendIds = friendRows.map((r) =>
      r.requester_id === userId ? r.addressee_id : r.requester_id,
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', friendIds);

    setFriendProfiles(profiles ?? []);
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchRecommendation(user.id);
    fetchFriends(user.id);
  }, [authLoading, user, fetchRecommendation, fetchFriends]);

  const handleMarkSeen = async () => {
    if (!rec) return;
    setSeen(true);
    await supabase
      .from('recommendations')
      .update({ seen: true })
      .eq('id', rec.id);
  };

  const handleChallenge = () => {
    if (!rec) return;
    router.push({
      pathname: '/rps/initiate',
      params: {
        tvdb_series_id: rec.tvdb_series_id,
        show_title: rec.show_title,
        poster_url: rec.poster_url ?? '',
        overview: rec.overview ?? '',
      },
    });
  };

  const isLoading = authLoading || recLoading;

  const displayName = profile?.display_name ?? user?.email?.split('@')[0] ?? 'there';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>
            Good {getGreeting()}, {displayName} 👋
          </Text>
          <Text style={styles.headerTitle}>Today's Pick</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/settings')}
            accessibilityLabel="Settings"
          >
            <Text style={styles.settingsBtnText}>⚙️</Text>
          </TouchableOpacity>
          {profile && (
            <Avatar
              photoUrl={profile.photo_url}
              displayName={profile.display_name}
              size={44}
            />
          )}
        </View>
      </View>

      {/* Main content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : rec && !seen ? (
        <>
          <RecommendationCard
            rec={rec}
            onMarkSeen={handleMarkSeen}
            onChallenge={handleChallenge}
          />

          {/* Countdown */}
          {countdown ? (
            <View style={styles.countdownRow}>
              <Text style={styles.countdownLabel}>
                Next pick in · <Text style={styles.countdownValue}>{countdown}</Text>
              </Text>
            </View>
          ) : null}
        </>
      ) : rec && seen ? (
        <View style={styles.seenCard}>
          <Text style={styles.seenEmoji}>✅</Text>
          <Text style={styles.seenTitle}>Marked as seen!</Text>
          <Text style={styles.seenSubtitle}>Your next pick arrives in {countdown}.</Text>
        </View>
      ) : (
        <EmptyRecommendation />
      )}

      {/* Watch Together */}
      {!isLoading && (
        <WatchTogetherCard friends={friendProfiles} />
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    paddingBottom: 32,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xl,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnText: {
    fontSize: 22,
  },
  greeting: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.text,
  },

  // Loading
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },

  // Recommendation card
  recCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  posterContainer: {
    position: 'relative',
  },
  recBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  recBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  recBody: {
    padding: Spacing.lg,
  },
  recTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  recOverview: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: Colors.primary,
  },
  actionBtnPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnSecondaryText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: 14,
  },

  // Countdown
  countdownRow: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  countdownLabel: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  countdownValue: {
    fontWeight: '600',
    color: Colors.text,
  },

  // Seen state
  seenCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xxl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  seenEmoji: {
    fontSize: 40,
    marginBottom: Spacing.md,
  },
  seenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  seenSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xxl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Watch Together
  watchCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  watchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarStack: {
    position: 'relative',
    height: 36,
    width: 108,
  },
  avatarStackItem: {
    position: 'absolute',
    top: 0,
  },
  watchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  watchBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
});
