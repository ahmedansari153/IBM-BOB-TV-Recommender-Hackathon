import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

type IconName = 'home' | 'map' | 'friends' | 'challenges';

const EMOJI_MAP: Record<IconName, string> = {
  home: '📺',
  map: '🗺️',
  friends: '👥',
  challenges: '⚡',
};

interface TabBarIconProps {
  name: IconName;
  focused: boolean;
}

export default function TabBarIcon({ name, focused }: TabBarIconProps) {
  return (
    <Text style={[styles.icon, { color: focused ? Colors.primary : Colors.textSubtle }]}>
      {EMOJI_MAP[name]}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 22,
  },
});
