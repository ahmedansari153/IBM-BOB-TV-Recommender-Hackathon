import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface GenreBadgeProps {
  genre: string;
}

export default function GenreBadge({ genre }: GenreBadgeProps) {
  return (
    <View style={styles.pill}>
      <Text style={styles.label}>{genre}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#f0f0f5',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  label: {
    color: '#57606a',
    fontSize: 11,
    fontWeight: '500',
  },
});
