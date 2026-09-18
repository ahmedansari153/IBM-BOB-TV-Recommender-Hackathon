import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Question definitions
// ---------------------------------------------------------------------------
type Question = {
  key: keyof Answers;
  question: string;
  hint: string;
  multi: boolean;
  options: string[];
};

const QUESTIONS: Question[] = [
  {
    key: 'genres',
    question: 'What genres do you love?',
    hint: 'Select all that apply.',
    multi: true,
    options: [
      'Drama', 'Comedy', 'Thriller', 'Sci-Fi', 'Fantasy',
      'Horror', 'Crime', 'Documentary', 'Animation', 'Romance',
    ],
  },
  {
    key: 'yearRange',
    question: 'Which era do you prefer?',
    hint: 'Pick one.',
    multi: false,
    options: ['Classic (pre-1990)', '90s', '2000s', '2010s', 'Modern (2020+)', 'No preference'],
  },
  {
    key: 'pace',
    question: 'What pace do you prefer?',
    hint: 'Pick one.',
    multi: false,
    options: ['Slow-burn', 'Fast-paced', 'No preference'],
  },
  {
    key: 'status',
    question: 'Ongoing or completed shows?',
    hint: 'Pick one.',
    multi: false,
    options: ['Ongoing', 'Completed', 'No preference'],
  },
  {
    key: 'language',
    question: 'Preferred language?',
    hint: 'Pick one.',
    multi: false,
    options: ['English', 'Spanish', 'Korean', 'Japanese', 'French', 'Any'],
  },
  {
    key: 'episodeLength',
    question: 'Episode length preference?',
    hint: 'Pick one.',
    multi: false,
    options: ['Short (~30 min)', 'Long (~60 min+)', 'No preference'],
  },
  {
    key: 'mood',
    question: "What's your mood preference?",
    hint: 'Pick one.',
    multi: false,
    options: ['Lighthearted', 'Dark & Gritty', 'Mixed', 'No preference'],
  },
  {
    key: 'networks',
    question: 'Platforms you have access to?',
    hint: 'Select all that apply.',
    multi: true,
    options: [
      'Netflix', 'HBO Max', 'Hulu', 'Apple TV+',
      'Amazon Prime', 'Disney+', 'Peacock', 'Paramount+', 'Other',
    ],
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Answers = {
  genres: string[];
  yearRange: string;
  pace: string;
  status: string;
  language: string;
  episodeLength: string;
  mood: string;
  networks: string[];
};

const EMPTY_ANSWERS: Answers = {
  genres: [],
  yearRange: '',
  pace: '',
  status: '',
  language: '',
  episodeLength: '',
  mood: '',
  networks: [],
};

const SUPABASE_URL = 'https://hncdqdkyhfgummhkjiet.supabase.co';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isStepAnswered(step: number, answers: Answers): boolean {
  const q = QUESTIONS[step];
  if (q.multi) {
    const val = answers[q.key] as string[];
    return val.length > 0;
  }
  return (answers[q.key] as string).length > 0;
}

function toggleMulti(current: string[], option: string): string[] {
  return current.includes(option)
    ? current.filter((x) => x !== option)
    : [...current, option];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ ...EMPTY_ANSWERS });
  const [saving, setSaving] = useState(false);

  const current = QUESTIONS[step];
  const total = QUESTIONS.length;
  const progress = (step + 1) / total;
  const answered = isStepAnswered(step, answers);

  function selectOption(option: string) {
    const key = current.key;
    if (current.multi) {
      const prev = answers[key] as string[];
      setAnswers((a) => ({ ...a, [key]: toggleMulti(prev, option) }));
    } else {
      setAnswers((a) => ({ ...a, [key]: option }));
    }
  }

  function isSelected(option: string): boolean {
    const val = answers[current.key];
    if (Array.isArray(val)) return val.includes(option);
    return val === option;
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function handleNext() {
    if (!answered) return;
    if (step < total - 1) {
      setStep((s) => s + 1);
      return;
    }
    // Last step — finish
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Not authenticated');

      // Build taste profile from answers
      const taste_profile = {
        genres: answers.genres,
        yearRange: answers.yearRange,
        pace: answers.pace,
        status: answers.status,
        language: answers.language,
        episodeLength: answers.episodeLength,
        mood: answers.mood,
        networks: answers.networks,
      };

      // Call edge function
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? '';

      await fetch(`${SUPABASE_URL}/functions/v1/update-taste-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ taste_profile }),
      });

      // Update profile row
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_done: true, taste_profile })
        .eq('id', user.id);

      if (error) throw error;

      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        {/* ── Progress bar ── */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.stepLabel}>
            {step + 1} of {total}
          </Text>
        </View>

        {/* ── Question ── */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>{current.question}</Text>
          <Text style={styles.hintText}>{current.hint}</Text>
        </View>

        {/* ── Options ── */}
        <ScrollView
          contentContainerStyle={styles.optionsContainer}
          showsVerticalScrollIndicator={false}
        >
          {current.options.map((opt) => {
            const selected = isSelected(opt);
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => selectOption(opt)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Navigation ── */}
        <View style={styles.navRow}>
          {step > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.75}>
              <Text style={styles.backArrow}>←</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}

          <TouchableOpacity
            style={[styles.nextBtn, !answered && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!answered || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.nextText}>
                {step === total - 1 ? 'Finish' : 'Next →'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  stepLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
    minWidth: 42,
    textAlign: 'right',
  },

  // Question block
  questionBlock: {
    marginBottom: Spacing.xl,
  },
  questionText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 30,
    marginBottom: Spacing.xs,
  },
  hintText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '400',
  },

  // Options
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  chipTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },

  // Navigation
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  backArrow: {
    fontSize: 20,
    color: Colors.text,
  },
  backPlaceholder: {
    width: 48,
  },
  nextBtn: {
    flex: 1,
    marginLeft: Spacing.md,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
