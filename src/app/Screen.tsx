// Casca de tela: SafeArea + barra de marca fina (app-bar, conforme os mockups)
// + título de página opcional como heading escuro sobre o corpo claro.
import { ReactNode } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { text, fonts } from '../theme/typography';
import { useNav } from './navigation';

export function Screen({
  title,
  subtitle,
  showBack = true,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { goBack, canGoBack } = useNav();
  return (
    <View style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.branco} />
      <SafeAreaView edges={['top']} style={s.safeTop}>
        {/* Barra de marca fina: [voltar?] logo + CAR Campo ........ [ação/sino] */}
        <View style={s.appBar}>
          <View style={s.brand}>
            {showBack && canGoBack && (
              <TouchableOpacity onPress={goBack} hitSlop={12} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Voltar">
                <Ionicons name="chevron-back" size={24} color={colors.primary} />
              </TouchableOpacity>
            )}
            <View style={s.logoMark}>
              <Ionicons name="leaf" size={15} color={colors.branco} />
            </View>
            <Text style={s.brandName}>CAR Campo</Text>
          </View>
          <View style={s.appBarRight}>
            {right ?? (
              <TouchableOpacity hitSlop={10} accessibilityRole="button" accessibilityLabel="Notificações">
                <Ionicons name="notifications-outline" size={22} color={colors.inkText} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Título da página (heading escuro) — opcional */}
      {(title || subtitle) && (
        <View style={s.pageHead}>
          {title ? <Text style={s.title}>{title}</Text> : null}
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
      )}

      <View style={s.body}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.neutral },
  safeTop: { backgroundColor: colors.branco },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.branco,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  backBtn: { marginRight: 2, marginLeft: -4 },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.primary },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  pageHead: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4, backgroundColor: colors.neutral },
  title: { ...text.headline, color: colors.inkText },
  subtitle: { ...text.body, color: colors.mutedText, marginTop: 2 },

  body: { flex: 1 },
});
