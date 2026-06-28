// Requer que useFonts carregue essas famílias no App.tsx antes de renderizar.
// Fallback automático para system font se o load falhar.

export const fonts = {
  regular:   'Inter_400Regular',
  semibold:  'Inter_600SemiBold',
  bold:      'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

export const text = {
  headline: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 34,
  },
  headlineSm: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodySemibold: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
} as const;
