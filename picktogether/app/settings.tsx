import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

type NotifInterval = 'daily' | 'every2days' | 'weekly' | 'custom';

interface ProfileData {
  id: string;
  display_name: string;
  qr_code: string | null;
  zip_code: string | null;
  photo_url: string | null;
  notif_interval: NotifInterval;
  expo_push_token: string | null;
}

const INTERVAL_LABELS: Record<NotifInterval, string> = {
  daily: 'Daily',
  every2days: 'Every 2 days',
  weekly: 'Weekly',
  custom: 'Custom',
};

const INTERVAL_OPTIONS: NotifInterval[] = ['daily', 'every2days', 'weekly', 'custom'];

function InitialsAvatar({ name, size = 64 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [zipModalVisible, setZipModalVisible] = useState(false);
  const [zipInput, setZipInput] = useState('');
  const [savingZip, setSavingZip] = useState(false);

  const loadProfile = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const myId = sessionData.session?.user.id;
    if (!myId) { setLoading(false); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, qr_code, zip_code, photo_url, notif_interval, expo_push_token')
      .eq('id', myId)
      .single();
    setProfile(data as ProfileData);
    setLoading(false);
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const updateProfile = async (updates: Partial<ProfileData>) => {
    if (!profile) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id);
    if (!error) setProfile((prev) => prev ? { ...prev, ...updates } : prev);
  };

  const handleFrequency = () => {
    const labels = INTERVAL_OPTIONS.map((k) => INTERVAL_LABELS[k]);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length, title: 'Recommendation Frequency' },
        (idx) => {
          if (idx < INTERVAL_OPTIONS.length) {
            updateProfile({ notif_interval: INTERVAL_OPTIONS[idx] });
          }
        }
      );
    } else {
      // Android: simple Alert with options
      Alert.alert(
        'Recommendation Frequency',
        undefined,
        [
          ...INTERVAL_OPTIONS.map((k) => ({
            text: INTERVAL_LABELS[k],
            onPress: () => updateProfile({ notif_interval: k }),
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleSaveZip = async () => {
    if (!zipInput.trim()) return;
    setSavingZip(true);
    await updateProfile({ zip_code: zipInput.trim() });
    setSavingZip(false);
    setZipModalVisible(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <InitialsAvatar name={profile?.display_name ?? 'U'} size={64} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.display_name ?? '—'}</Text>
            {profile?.qr_code ? (
              <Text style={styles.profileHandle}>@{profile.qr_code}</Text>
            ) : null}
            {profile?.zip_code ? (
              <Text style={styles.profileZip}>📍 {profile.zip_code}</Text>
            ) : null}
          </View>
        </View>

        {/* Preferences section */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.row} onPress={handleFrequency}>
            <Text style={styles.rowLabel}>Recommendation Frequency</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {profile ? INTERVAL_LABELS[profile.notif_interval] : '—'}
              </Text>
              <Text style={styles.rowChevron}>›</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/onboarding')}
          >
            <Text style={styles.rowLabel}>Edit Taste Profile</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Notifications</Text>
            <Switch
              value={!!profile?.expo_push_token}
              disabled
              trackColor={{ true: Colors.primary, false: Colors.border }}
              thumbColor={Colors.surface}
            />
          </View>
        </View>

        {/* Account section */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/friends/add')}
          >
            <Text style={styles.rowLabel}>My QR Code</Text>
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              setZipInput(profile?.zip_code ?? '');
              setZipModalVisible(true);
            }}
          >
            <Text style={styles.rowLabel}>ZIP Code</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{profile?.zip_code ?? 'Not set'}</Text>
              <Text style={styles.rowChevron}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ZIP modal */}
      <Modal
        visible={zipModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setZipModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Update ZIP Code</Text>
            <TextInput
              style={styles.zipInput}
              value={zipInput}
              onChangeText={setZipInput}
              placeholder="e.g. 90210"
              placeholderTextColor={Colors.textSubtle}
              keyboardType="number-pad"
              maxLength={5}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setZipModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveZip}>
                {savingZip ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  scroll: { padding: Spacing.lg, paddingBottom: 40 },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  profileInfo: { marginLeft: Spacing.lg, flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: Colors.text },
  profileHandle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  profileZip: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  rowDivider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.lg },
  rowLabel: { fontSize: 15, color: Colors.text, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 14, color: Colors.textMuted },
  rowChevron: { fontSize: 18, color: Colors.textSubtle, marginLeft: 2 },

  signOutBtn: {
    marginTop: Spacing.md,
    backgroundColor: '#fee2e2',
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  signOutText: { color: Colors.error, fontWeight: '700', fontSize: 15 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  zipInput: {
    height: 48,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 18,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    letterSpacing: 2,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.border,
    borderRadius: Radius.md,
  },
  modalCancelText: { fontWeight: '600', color: Colors.text, fontSize: 15 },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
  },
  modalSaveText: { fontWeight: '700', color: '#fff', fontSize: 15 },
});
