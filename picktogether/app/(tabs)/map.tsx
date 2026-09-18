import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Callout, Marker, Region } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { getZipCoords } from '@/lib/zipCentroids';
import { Colors, Radius, Spacing } from '@/constants/theme';

interface PinData {
  zip_code: string;
  show_title: string;
  count: number;
  lat: number;
  lng: number;
}

const INITIAL_REGION: Region = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 30,
  longitudeDelta: 45,
};

export default function MapScreen() {
  const [pins, setPins] = useState<PinData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      try {
        const res = await fetch(
          'https://hncdqdkyhfgummhkjiet.supabase.co/functions/v1/get-recommendations-near-zip?lat=39.5&lng=-98.35',
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          setLoading(false);
          return;
        }

        const raw: Array<{ zip_code: string; show_title: string; count?: number }> = await res.json();

        const resolved: PinData[] = [];
        for (const item of raw) {
          if (!item.zip_code) continue;
          const coords = getZipCoords(item.zip_code);
          if (!coords) continue;
          resolved.push({
            zip_code: item.zip_code,
            show_title: item.show_title,
            count: item.count ?? 1,
            lat: coords.lat,
            lng: coords.lng,
          });
        }

        setPins(resolved);
      } catch (_) {
        // network error — show empty map
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      ) : (
        <View style={styles.mapContainer}>
          <MapView
            style={StyleSheet.absoluteFillObject}
            initialRegion={INITIAL_REGION}
            provider={undefined}
          >
            {pins.map((pin, idx) => (
              <Marker
                key={`${pin.zip_code}-${idx}`}
                coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                pinColor={Colors.primary}
              >
                <Callout tooltip>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle} numberOfLines={2}>
                      {pin.show_title}
                    </Text>
                    <Text style={styles.calloutCount}>
                      {pin.count} {pin.count === 1 ? 'person' : 'people'} watching
                    </Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>

          {/* Legend card */}
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>📍 Today's top shows by zip code</Text>
            <Text style={styles.legendSub}>Tap any pin to see what neighbors are watching</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: Spacing.md, color: Colors.textMuted, fontSize: 14 },
  mapContainer: { flex: 1 },
  callout: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minWidth: 160,
    maxWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  calloutCount: { fontSize: 12, color: Colors.textMuted },
  legend: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legendTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  legendSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
