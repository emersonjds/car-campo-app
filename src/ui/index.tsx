import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'inverted' | 'outlined';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const variantStyle = {
    primary:  ui.btnPrimary,
    secondary: ui.btnSecondary,
    inverted:  ui.btnInverted,
    outlined:  ui.btnOutlined,
  }[variant];
  const textStyle = {
    primary:  ui.btnPrimaryText,
    secondary: ui.btnSecondaryText,
    inverted:  ui.btnInvertedText,
    outlined:  ui.btnOutlinedText,
  }[variant];
  return (
    <TouchableOpacity
      style={[ui.btn, variantStyle, (disabled || loading) && ui.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.branco : colors.primary} />
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

// Aliases de compatibilidade — mesmas assinaturas originais, não remover.
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
  return <Button label={label} onPress={onPress} variant="primary" disabled={disabled} loading={loading} />;
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
  return <Button label={label} onPress={onPress} variant="secondary" disabled={disabled} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Buscar...',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={ui.searchWrap}>
      <Ionicons name="search" size={18} color={colors.mutedText} style={ui.searchIcon} />
      <TextInput
        style={ui.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

type ChipStatus = 'regularizado' | 'critico' | 'aviso' | 'info';

const CHIP_COLORS: Record<ChipStatus, { bg: string; text: string }> = {
  regularizado: { bg: '#eaf3e6', text: colors.primary },
  critico:      { bg: '#fbeae9', text: colors.critico },
  aviso:        { bg: '#f8edda', text: colors.aviso },
  info:         { bg: '#e0f6ff', text: '#0077a8' },
};

export function StatusChip({ status, label }: { status: ChipStatus; label?: string }) {
  const { bg, text } = CHIP_COLORS[status];
  const defaultLabel: Record<ChipStatus, string> = {
    regularizado: 'Regularizado',
    critico:      'Crítico',
    aviso:        'Aviso',
    info:         'Info',
  };
  return (
    <View style={[ui.chip, { backgroundColor: bg }]}>
      <Text style={[ui.chipText, { color: text }]}>{label ?? defaultLabel[status]}</Text>
    </View>
  );
}

export function MetricBlock({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <View style={ui.metricBlock}>
      <Text style={ui.metricLabel}>{label}</Text>
      <Text style={ui.metricValue}>{value}</Text>
      {sublabel ? <Text style={ui.metricSublabel}>{sublabel}</Text> : null}
    </View>
  );
}

type CircleTone = 'primary' | 'secondary' | 'tertiary' | 'danger';

const CIRCLE_BG: Record<CircleTone, string> = {
  primary:   colors.primary,
  secondary: colors.secondary,
  tertiary:  colors.tertiary,
  danger:    colors.critico,
};

export function CircleAction({
  icon,
  onPress,
  tone = 'primary',
  size = 48,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: CircleTone;
  size?: number;
}) {
  return (
    <TouchableOpacity
      style={[ui.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: CIRCLE_BG[tone] }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name={icon} size={size * 0.45} color={colors.branco} />
    </TouchableOpacity>
  );
}

// ─── Componentes legados (mantidos sem alteração de assinatura) ───────────────

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
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'words' | 'characters';
  secureTextEntry?: boolean;
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
        secureTextEntry={secureTextEntry}
        autoComplete={secureTextEntry ? 'password' : 'off'}
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
  btn:            { minHeight: 52, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flex: 1 },
  btnPrimary:     { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.branco, fontWeight: '800', fontSize: 16 },
  btnSecondary:   { backgroundColor: colors.verdeBg, borderWidth: 1, borderColor: colors.line },
  btnSecondaryText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  btnInverted:    { backgroundColor: colors.inkText },
  btnInvertedText: { color: colors.branco, fontWeight: '800', fontSize: 16 },
  btnOutlined:    { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.primary },
  btnOutlinedText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  btnDisabled:    { opacity: 0.45 },

  card: { backgroundColor: colors.branco, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },

  searchWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, minHeight: 46 },
  searchIcon:  { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink },

  chip:     { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '700' },

  metricBlock:    { backgroundColor: colors.verdeBg, borderRadius: 12, padding: 14, alignItems: 'center' },
  metricLabel:    { fontSize: 11, fontWeight: '700', color: colors.mutedText, textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue:    { fontSize: 26, fontWeight: '800', color: colors.inkText, marginTop: 2 },
  metricSublabel: { fontSize: 11, color: colors.mutedText, marginTop: 2 },

  circle: { alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  label:        { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6 },
  fieldWrap:    { marginBottom: 14 },
  input:        { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: colors.ink, backgroundColor: colors.branco },
  badge:        { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText:    { fontSize: 12, fontWeight: '800' },
  badgeOk:      { backgroundColor: '#e2f3e8' },
  badgeOkText:  { color: colors.verde },
  badgeAviso:   { backgroundColor: '#fbf0d9' },
  badgeAvisoText: { color: colors.aviso },
  badgeNeutro:  { backgroundColor: colors.verdeBg },
  badgeNeutroText: { color: colors.muted },
  stat:         { flex: 1, backgroundColor: colors.verdeBg, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statValue:    { fontSize: 18, fontWeight: '800', color: colors.verde },
  statLabel:    { fontSize: 11, color: colors.muted, marginTop: 2 },
  empty:        { padding: 28, alignItems: 'center' },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  emptyHint:    { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
