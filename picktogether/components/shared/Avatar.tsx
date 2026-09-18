import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

interface AvatarProps {
  photoUrl?: string | null;
  displayName: string;
  size?: number;
}

export default function Avatar({ photoUrl, displayName, size = 44 }: AvatarProps) {
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const circleStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  const fontSize = Math.round(size * 0.38);

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.image, circleStyle]}
      />
    );
  }

  return (
    <View style={[styles.fallback, circleStyle]}>
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
