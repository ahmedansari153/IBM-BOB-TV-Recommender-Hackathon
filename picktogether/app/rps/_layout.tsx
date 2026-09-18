import { Stack } from 'expo-router';

export default function RpsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="initiate" />
      <Stack.Screen name="waiting/[matchId]" />
      <Stack.Screen name="choose/[matchId]" />
      <Stack.Screen name="result/[matchId]" />
    </Stack>
  );
}
