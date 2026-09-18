import React from 'react';
import { View, Image, StyleSheet, DimensionValue } from 'react-native';
import { Radius } from '@/constants/theme';

type PosterSize = 'sm' | 'md' | 'lg';

interface ShowPosterThumbnailProps {
  posterUrl?: string | null;
  size?: PosterSize;
}

const SIZE_MAP: Record<PosterSize, { width: DimensionValue; height: number }> = {
  sm: { width: 42, height: 56 },
  md: { width: 80, height: 110 },
  lg: { width: '100%', height: 220 },
};

export default function ShowPosterThumbnail({ posterUrl, size = 'md' }: ShowPosterThumbnailProps) {
  const dimensions = SIZE_MAP[size];

  const containerStyle = {
    width: dimensions.width,
    height: dimensions.height,
    borderRadius: Radius.md,
    overflow: 'hidden' as const,
    backgroundColor: '#1e1b4b',
  };

  if (posterUrl) {
    return (
      <View style={containerStyle}>
        <Image source={{ uri: posterUrl }} style={styles.image} />
      </View>
    );
  }

  return <View style={containerStyle} />;
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
});
