// Design tokens matching the mockup's visual system
export const Colors = {
  primary: '#6366f1',
  primaryEnd: '#a855f7',
  background: '#f8f7fc',
  surface: '#ffffff',
  surfaceAlt: '#f0f0f5',
  border: '#e5e7eb',
  text: '#1f2328',
  textMuted: '#57606a',
  textSubtle: '#adb5bd',
  splashBg: '#0f0c29',
  rpsBg: '#f0ece6',
  rpsBorder: '#c8c0b8',
  success: '#15803d',
  error: '#dc2626',
  warning: '#92400e',
};

export const Gradients = {
  primary: ['#6366f1', '#a855f7'] as const,
  splash: ['#0f0c29', '#302b63', '#24243e'] as const,
  avatarA: ['#6366f1', '#a855f7'] as const,
  avatarB: ['#ec4899', '#f97316'] as const,
  avatarC: ['#14b8a6', '#0ea5e9'] as const,
  avatarD: ['#f59e0b', '#ef4444'] as const,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};
