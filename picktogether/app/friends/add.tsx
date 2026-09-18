import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

type Tab = 'search' | 'qr' | 'scan';

interface ProfileResult {
  id: string;
  display_name: string;
  qr_code: string | null;
}

function InitialsAvatar({ name, size = 40 }: { name: string; size?: number }) {
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

function SearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, qr_code')
      .ilike('display_name', `%${query.trim()}%`)
      .limit(20);
    setResults((data as ProfileResult[]) ?? []);
    setSearching(false);
  };

  const sendRequest = async (addresseeId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? '';
    const res = await fetch(
      'https://hncdqdkyhfgummhkjiet.supabase.co/functions/v1/friends/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addressee_id: addresseeId }),
      }
    );
    if (res.ok) {
      setSent((prev) => ({ ...prev, [addresseeId]: true }));
    } else {
      Alert.alert('Error', 'Could not send friend request.');
    }
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name…"
          placeholderTextColor={Colors.textSubtle}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          {searching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.resultRow}>
            <InitialsAvatar name={item.display_name} size={40} />
            <View style={styles.resultBody}>
              <Text style={styles.resultName}>{item.display_name}</Text>
              {item.qr_code ? (
                <Text style={styles.resultHandle}>@{item.qr_code}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.addFriendBtn, sent[item.id] && styles.addFriendBtnSent]}
              onPress={() => sendRequest(item.id)}
              disabled={!!sent[item.id]}
            >
              <Text style={styles.addFriendBtnText}>
                {sent[item.id] ? 'Sent ✓' : 'Add Friend'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          results.length === 0 && !searching ? (
            <Text style={styles.emptyHint}>Search for friends by display name</Text>
          ) : null
        }
      />
    </View>
  );
}

function QRTab() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const myId = sessionData.session?.user.id;
      if (!myId) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('qr_code')
        .eq('id', myId)
        .single();
      setQrCode(data?.qr_code ?? null);
      setLoading(false);
    })();
  }, []);

  const handleShare = async () => {
    if (!qrCode) return;
    const link = `picktogether://add/@${qrCode}`;
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Share.share({ message: `Add me on PickTogether! ${link}`, url: link });
    } else {
      await Share.share({ message: `Add me on PickTogether! ${link}` });
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />;

  return (
    <View style={[styles.tabContent, styles.qrCenter]}>
      {qrCode ? (
        <>
          <Text style={styles.qrLabel}>Your PickTogether QR Code</Text>
          <View style={styles.qrBox}>
            <QRCode value={`picktogether://add/@${qrCode}`} size={200} />
          </View>
          <Text style={styles.qrHandle}>@{qrCode}</Text>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>Share Link</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.emptyHint}>No QR code available for your profile.</Text>
      )}
    </View>
  );
}

function ScanTab() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [pendingProfile, setPendingProfile] = useState<ProfileResult | null>(null);
  const [sending, setSending] = useState(false);

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    // Parse picktogether://add/@{username}
    const match = data.match(/picktogether:\/\/add\/@(.+)/);
    const handle = match ? match[1] : data;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, qr_code')
      .eq('qr_code', handle)
      .limit(1);

    const profile = profiles?.[0] as ProfileResult | undefined;
    if (!profile) {
      Alert.alert('Not found', 'No user found for that QR code.', [
        { text: 'Scan again', onPress: () => setScanned(false) },
      ]);
      return;
    }
    setPendingProfile(profile);
  };

  const confirmSendRequest = async () => {
    if (!pendingProfile) return;
    setSending(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? '';
    const res = await fetch(
      'https://hncdqdkyhfgummhkjiet.supabase.co/functions/v1/friends/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addressee_id: pendingProfile.id }),
      }
    );
    setSending(false);
    if (res.ok) {
      Alert.alert('Request sent!', `Friend request sent to ${pendingProfile.display_name}.`, [
        { text: 'OK', onPress: () => { setPendingProfile(null); setScanned(false); } },
      ]);
    } else {
      Alert.alert('Error', 'Could not send friend request.');
    }
  };

  if (!permission) return <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />;

  if (!permission.granted) {
    return (
      <View style={[styles.tabContent, styles.qrCenter]}>
        <Text style={styles.emptyHint}>Camera access is required to scan QR codes.</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={requestPermission}>
          <Text style={styles.shareBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (pendingProfile) {
    return (
      <View style={[styles.tabContent, styles.qrCenter]}>
        <InitialsAvatar name={pendingProfile.display_name} size={64} />
        <Text style={[styles.qrLabel, { marginTop: Spacing.md }]}>
          {pendingProfile.display_name}
        </Text>
        {pendingProfile.qr_code ? (
          <Text style={styles.resultHandle}>@{pendingProfile.qr_code}</Text>
        ) : null}
        <View style={styles.confirmRow}>
          <TouchableOpacity
            style={styles.addFriendBtn}
            onPress={confirmSendRequest}
            disabled={sending}
          >
            <Text style={styles.addFriendBtnText}>
              {sending ? 'Sending…' : 'Send Friend Request'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => { setPendingProfile(null); setScanned(false); }}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.scanContainer}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />
      <View style={styles.scanOverlay}>
        <View style={styles.scanFrame} />
        <Text style={styles.scanHint}>Aim at a PickTogether QR code</Text>
      </View>
    </View>
  );
}

export default function AddFriendScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('search');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'search', label: 'Search' },
    { key: 'qr', label: 'QR Code' },
    { key: 'scan', label: 'Scan' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Back header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Friend</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Segmented control */}
      <View style={styles.segmented}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.segment, activeTab === tab.key && styles.segmentActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.segmentText,
                activeTab === tab.key && styles.segmentTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'search' && <SearchTab />}
      {activeTab === 'qr' && <QRTab />}
      {activeTab === 'scan' && <ScanTab />}
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

  segmented: {
    flexDirection: 'row',
    margin: Spacing.lg,
    backgroundColor: Colors.border,
    borderRadius: Radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  segmentActive: { backgroundColor: Colors.surface },
  segmentText: { fontSize: 13, fontWeight: '500', color: Colors.textMuted },
  segmentTextActive: { color: Colors.primary, fontWeight: '600' },

  tabContent: { flex: 1, paddingHorizontal: Spacing.lg },
  qrCenter: { alignItems: 'center', justifyContent: 'center' },

  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  resultBody: { flex: 1, marginLeft: Spacing.md },
  resultName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  resultHandle: { fontSize: 12, color: Colors.textMuted },
  addFriendBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  addFriendBtnSent: { backgroundColor: Colors.textSubtle },
  addFriendBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  emptyHint: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
    fontSize: 14,
  },

  qrLabel: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: Spacing.lg },
  qrBox: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrHandle: { fontSize: 14, color: Colors.textMuted, marginTop: Spacing.md },
  shareBtn: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
  },
  shareBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  scanContainer: { flex: 1, overflow: 'hidden' },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderWidth: 3,
    borderColor: Colors.primary,
    borderRadius: Radius.lg,
    backgroundColor: 'transparent',
  },
  scanHint: {
    marginTop: Spacing.lg,
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  confirmRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  cancelBtn: {
    backgroundColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  cancelBtnText: { color: Colors.text, fontWeight: '600', fontSize: 13 },

  avatar: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
});
