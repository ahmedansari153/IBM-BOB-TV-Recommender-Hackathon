import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type StatusValue = 'pending' | 'accepted' | 'choosing' | 'resolved' | 'expired';

interface StatusBadgeProps {
  status: StatusValue;
}

type StatusStyle = {
  backgroundColor: string;
  color: string;
  label: string;
};

const STATUS_MAP: Record<StatusValue, StatusStyle> = {
  pending: { backgroundColor: '#fef3c7', color: '#92400e', label: 'Pending' },
  accepted: { backgroundColor: '#eff6ff', color: '#1d4ed8', label: 'Accepted' },
  choosing: { backgroundColor: '#eff6ff', color: '#1d4ed8', label: 'Choosing' },
  resolved: { backgroundColor: '#f0fdf4', color: '#15803d', label: 'Resolved' },
  expired: { backgroundColor: '#f5f5f5', color: '#adb5bd', label: 'Expired' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { backgroundColor, color, label } = STATUS_MAP[status];
  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
