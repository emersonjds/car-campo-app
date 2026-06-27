// Casca de tela: SafeArea + cabeçalho verde com botão voltar opcional.
import { ReactNode } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useNav } from './navigation';

export function Screen({
  title,
  subtitle,
  showBack = true,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { goBack, canGoBack } = useNav();
  return (
    <View style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.verde} />
      {/* SafeArea só no header: o inset do topo (notch/status bar) fica verde,
          casando com o cabeçalho — sem faixa branca. O corpo claro vem por baixo. */}
      <SafeAreaView style={s.safeTop}>
        <View style={s.header}>
          {/* Linha de topo: só aparece quando há "voltar" ou ação à direita —
              evita o espaço morto acima do título nas abas raiz. */}
          {((showBack && canGoBack) || right) && (
            <View style={s.headerRow}>
              {showBack && canGoBack ? (
                <TouchableOpacity onPress={goBack} hitSlop={12} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Voltar">
                  <Ionicons name="chevron-back" size={22} color="#d8efe0" />
                  <Text style={s.backText}>Voltar</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              {right ?? null}
            </View>
          )}
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
      </SafeAreaView>
      <View style={s.body}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.verdeBg },
  safeTop: { backgroundColor: colors.verde },
  header: { backgroundColor: colors.verde, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: -4 },
  backText: { color: '#d8efe0', fontSize: 15, fontWeight: '700', marginLeft: -2 },
  title: { color: colors.branco, fontSize: 22, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#d8efe0', fontSize: 13, marginTop: 2 },
  body: { flex: 1 },
});
