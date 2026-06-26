// Casca de tela: SafeArea + cabeçalho verde com botão voltar opcional.
import { ReactNode } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.verde} />
      <View style={s.header}>
        <View style={s.headerRow}>
          {showBack && canGoBack ? (
            <TouchableOpacity onPress={goBack} hitSlop={12} style={s.back}>
              <Text style={s.backText}>‹ Voltar</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.back} />
          )}
          {right ?? <View style={s.back} />}
        </View>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={s.body}>{children}</View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.verdeBg },
  header: { backgroundColor: colors.verde, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  back: { minWidth: 70 },
  backText: { color: '#d8efe0', fontSize: 15, fontWeight: '700' },
  title: { color: colors.branco, fontSize: 22, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#d8efe0', fontSize: 13, marginTop: 2 },
  body: { flex: 1 },
});
