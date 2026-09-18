import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

export default function AuthScreen() {
  const router = useRouter();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingApple, setLoadingApple] = useState(false);

  async function handlePostLogin() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_done')
      .eq('id', user.id)
      .single();

    if (profile?.onboarding_done) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  }

  async function handleGoogle() {
    setLoadingGoogle(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) throw error;
      await handlePostLogin();
    } catch (err: any) {
      Alert.alert('Sign in failed', err.message ?? 'Something went wrong.');
    } finally {
      setLoadingGoogle(false);
    }
  }

  async function handleApple() {
    setLoadingApple(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
      });
      if (error) throw error;
      await handlePostLogin();
    } catch (err: any) {
      Alert.alert('Sign in failed', err.message ?? 'Something went wrong.');
    } finally {
      setLoadingApple(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Simulated 3-stop dark gradient via layered views */}
      <View style={styles.gradientTop} />
      <View style={styles.gradientMid} />
      <View style={styles.gradientBot} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.iconBox}>
              <Text style={styles.iconEmoji}>📺</Text>
            </View>
            <Text style={styles.appName}>PickTogether</Text>
            <Text style={styles.tagline}>Stop arguing. Start watching.</Text>
          </View>

          {/* Auth buttons */}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogle}
              disabled={loadingGoogle || loadingApple}
              activeOpacity={0.85}
            >
              {loadingGoogle ? (
                <ActivityIndicator color={Colors.text} />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.appleBtn}
                onPress={handleApple}
                disabled={loadingGoogle || loadingApple}
                activeOpacity={0.85}
              >
                {loadingApple ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.appleIcon}></Text>
                    <Text style={styles.appleText}>Continue with Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <Text style={styles.terms}>
              By continuing, you agree to our Terms &amp; Privacy Policy.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.splashBg,
  },
  gradientTop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f0c29',
  },
  gradientMid: {
    ...StyleSheet.absoluteFillObject,
    top: '33%',
    backgroundColor: '#302b63',
    opacity: 0.85,
  },
  gradientBot: {
    ...StyleSheet.absoluteFillObject,
    top: '66%',
    backgroundColor: '#24243e',
    opacity: 0.9,
  },
  safe: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.lg,
  },
  iconBox: {
    width: 88,
    height: 88,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  iconEmoji: {
    fontSize: 44,
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    textAlign: 'center',
  },
  buttons: {
    gap: Spacing.md,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: Radius.full,
    height: 54,
    gap: Spacing.sm,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4285F4',
  },
  googleText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: Radius.full,
    height: 54,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    gap: Spacing.sm,
  },
  appleIcon: {
    fontSize: 20,
    color: '#ffffff',
  },
  appleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  terms: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
});
