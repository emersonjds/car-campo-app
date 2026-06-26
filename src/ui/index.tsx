// Componentes de UI compartilhados. Pensados para uso ao ar livre (alvos grandes,
// contraste alto, legível sob sol) e públicos de baixa familiaridade digital.
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ui.btn, ui.btnPrimary, (disabled || loading) && ui.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={colors.branco} />
      ) : (
        <Text style={ui.btnPrimaryText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[ui.btn, ui.btnSecondary, disabled && ui.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text style={ui.btnSecondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={ui.sectionTitle}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={ui.label}>{children}</Text>;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'words' | 'characters';
}) {
  return (
    <View style={ui.fieldWrap}>
      <Label>{label}</Label>
      <TextInput
        style={ui.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

export function Badge({ tone = 'neutro', children }: { tone?: 'ok' | 'aviso' | 'neutro'; children: ReactNode }) {
  const toneStyle =
    tone === 'ok' ? ui.badgeOk : tone === 'aviso' ? ui.badgeAviso : ui.badgeNeutro;
  const textTone =
    tone === 'ok' ? ui.badgeOkText : tone === 'aviso' ? ui.badgeAvisoText : ui.badgeNeutroText;
  return (
    <View style={[ui.badge, toneStyle]}>
      <Text style={[ui.badgeText, textTone]}>{children}</Text>
    </View>
  );
}

export function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={ui.stat}>
      <Text style={ui.statValue}>{value}</Text>
      <Text style={ui.statLabel}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={ui.empty}>
      <Text style={ui.emptyTitle}>{title}</Text>
      {hint ? <Text style={ui.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  btn: { minHeight: 52, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.verde, flex: 1 },
  btnPrimaryText: { color: colors.branco, fontWeight: '800', fontSize: 16 },
  btnSecondary: { backgroundColor: colors.verdeBg, borderWidth: 1, borderColor: colors.line, flex: 1 },
  btnSecondaryText: { color: colors.verde, fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.45 },
  card: { backgroundColor: colors.branco, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6 },
  fieldWrap: { marginBottom: 14 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.branco },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  badgeOk: { backgroundColor: '#e2f3e8' },
  badgeOkText: { color: colors.verde },
  badgeAviso: { backgroundColor: '#fbf0d9' },
  badgeAvisoText: { color: colors.aviso },
  badgeNeutro: { backgroundColor: colors.verdeBg },
  badgeNeutroText: { color: colors.muted },
  stat: { flex: 1, backgroundColor: colors.verdeBg, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.verde },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  empty: { padding: 28, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
